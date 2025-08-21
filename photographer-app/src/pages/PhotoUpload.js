// PhotoUpload.jsx - Photo upload with processing pipeline
import React, { useState, useCallback } from 'react';
import { ref, push, set } from 'firebase/database';
import { useAuth } from '../hooks/useAuth';
import { database } from '../firebase/config';

const PhotoUpload = ({ eventId, albumId = null, onUploadComplete }) => {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadResults, setUploadResults] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  // Handle file selection
  const handleFileSelect = (selectedFiles) => {
    const validFiles = Array.from(selectedFiles).filter(file => {
      // Validate file types
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      return validTypes.includes(file.type);
    });

    setFiles(prev => [...prev, ...validFiles]);
  };

  // Drag and drop handlers
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, []);

  // Remove file from upload queue
  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Generate unique file key for R2
  const generateFileKey = (eventId, fileName) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const extension = fileName.split('.').pop();
    return `events/${eventId}/originals/${timestamp}-${random}.${extension}`;
  };

  // Upload single file to Cloudflare Worker
  const uploadSingleFile = async (file, index) => {
    try {
      // Step 1: Initialize upload with Worker to get signed URL
      const initResponse = await fetch('/api/upload/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({
          eventId: eventId,
          albumId: albumId,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type
        })
      });

      if (!initResponse.ok) {
        throw new Error(`Upload init failed: ${initResponse.statusText}`);
      }

      const { uploadUrl, photoId, r2Key } = await initResponse.json();

      // Step 2: Upload file directly to R2 via signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!uploadResponse.ok) {
        throw new Error(`File upload failed: ${uploadResponse.statusText}`);
      }

      // Step 3: Create photo record in Firebase RTDB
      const photoRef = ref(database, `eventPhotos/${eventId}/${photoId}`);
      const photoData = {
        r2Key: r2Key,
        albumId: albumId || 'default',
        status: 'uploaded', // uploaded -> processing -> published
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        createdAt: Date.now(),
        photographerId: user.uid
      };

      await set(photoRef, photoData);

      // Step 4: Trigger processing via Worker
      const processResponse = await fetch('/api/upload/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({
          eventId: eventId,
          photoId: photoId,
          r2Key: r2Key
        })
      });

      if (!processResponse.ok) {
        console.warn('Processing trigger failed, but upload succeeded');
      }

      return {
        success: true,
        photoId,
        fileName: file.name,
        r2Key
      };

    } catch (error) {
      console.error('Upload error:', error);
      return {
        success: false,
        fileName: file.name,
        error: error.message
      };
    }
  };

  // Upload all files
  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress({});
    setUploadResults([]);

    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Update progress
      setUploadProgress(prev => ({
        ...prev,
        [i]: { status: 'uploading', progress: 0 }
      }));

      try {
        const result = await uploadSingleFile(file, i);
        results.push(result);

        // Update progress
        setUploadProgress(prev => ({
          ...prev,
          [i]: { 
            status: result.success ? 'completed' : 'error', 
            progress: 100,
            error: result.error 
          }
        }));

      } catch (error) {
        results.push({
          success: false,
          fileName: file.name,
          error: error.message
        });

        setUploadProgress(prev => ({
          ...prev,
          [i]: { status: 'error', progress: 0, error: error.message }
        }));
      }
    }

    setUploadResults(results);
    setUploading(false);

    // Clear files after successful upload
    const successfulUploads = results.filter(r => r.success);
    if (successfulUploads.length > 0) {
      setFiles([]);
      if (onUploadComplete) {
        onUploadComplete(successfulUploads);
      }
    }
  };

  const getProgressColor = (status) => {
    switch (status) {
      case 'uploading': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Upload Photos</h3>

      {/* Drag and Drop Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="space-y-4">
          <div className="text-4xl text-gray-400">📸</div>
          <div>
            <p className="text-lg text-gray-600">
              Drag and drop photos here, or{' '}
              <label className="text-blue-600 hover:text-blue-700 cursor-pointer underline">
                browse files
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />
              </label>
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Supports: JPEG, PNG, WebP • Max 10MB per file
            </p>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium text-gray-800 mb-3">
            Selected Files ({files.length})
          </h4>
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {files.map((file, index) => (
              <div key={index} className="flex items-center p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>

                {/* Progress Bar */}
                {uploadProgress[index] && (
                  <div className="flex-1 mx-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(uploadProgress[index].status)}`}
                        style={{ width: `${uploadProgress[index].progress}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {uploadProgress[index].status === 'uploading' && 'Uploading...'}
                      {uploadProgress[index].status === 'completed' && 'Complete'}
                      {uploadProgress[index].status === 'error' && `Error: ${uploadProgress[index].error}`}
                    </p>
                  </div>
                )}

                {!uploading && (
                  <button
                    onClick={() => removeFile(index)}
                    className="ml-2 text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Upload Button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : `Upload ${files.length} Photo${files.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Upload Results */}
      {uploadResults.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium text-gray-800 mb-3">Upload Results</h4>
          <div className="space-y-2">
            {uploadResults.map((result, index) => (
              <div 
                key={index} 
                className={`p-3 rounded-lg ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}
              >
                <div className="flex items-center">
                  <span className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                    {result.success ? '✓' : '✗'}
                  </span>
                  <span className="ml-2 text-sm font-medium">
                    {result.fileName}
                  </span>
                  {result.success && (
                    <span className="ml-2 text-xs text-green-600">
                      Processing...
                    </span>
                  )}
                </div>
                {result.error && (
                  <p className="text-xs text-red-600 mt-1 ml-6">
                    {result.error}
                  </p>
                )}
              </div>
            ))}
          </div>
          
          <div className="mt-3 text-sm text-gray-600">
            <p>
              ✓ {uploadResults.filter(r => r.success).length} successful • 
              ✗ {uploadResults.filter(r => !r.success).length} failed
            </p>
            {uploadResults.some(r => r.success) && (
              <p className="text-xs text-blue-600 mt-1">
                Photos are being processed and will appear in your gallery shortly.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Processing Info */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h5 className="font-medium text-blue-900 mb-2">Photo Processing Pipeline:</h5>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>1. Upload original to secure cloud storage</li>
          <li>2. Generate thumbnails and web-optimized versions</li>
          <li>3. Add watermarks for preview protection</li>
          <li>4. Extract EXIF data and apply AI labeling</li>
          <li>5. Publish to your event gallery</li>
        </ul>
      </div>
    </div>
  );
};

export default PhotoUpload;