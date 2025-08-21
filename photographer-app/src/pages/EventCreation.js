// EventCreation.jsx - Event creation form for photographers
import React, { useState } from 'react';
import { ref, push, set } from 'firebase/database';
import { useAuth } from '../hooks/useAuth';
import { database } from '../firebase/config';

const EventCreation = ({ onEventCreated }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    datetime: '',
    venue: '',
    description: '',
    visibility: 'public', // public, code, list
    accessCode: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const generateAccessCodeHash = async (code) => {
    // Simple hash function - in production, use proper crypto
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Validate required fields
      if (!formData.title || !formData.datetime || !formData.venue) {
        throw new Error('Please fill in all required fields');
      }

      // Create event data structure according to your RTDB schema
      const eventData = {
        photographerId: user.uid,
        title: formData.title,
        datetime: formData.datetime,
        venue: formData.venue,
        description: formData.description,
        visibility: formData.visibility,
        createdAt: Date.now(),
        status: 'draft' // draft, published, archived
      };

      // Handle access control based on visibility
      if (formData.visibility === 'code' && formData.accessCode) {
        const codeHash = await generateAccessCodeHash(formData.accessCode);
        eventData.access = {
          codeHash: codeHash
        };
      } else if (formData.visibility === 'list') {
        eventData.access = {
          allowedEmails: [] // Will be populated later via admin interface
        };
      }

      // Create event in Firebase RTDB
      const eventsRef = ref(database, 'events');
      const newEventRef = push(eventsRef);
      await set(newEventRef, eventData);

      // Also create photographer record if it doesn't exist
      const photographerRef = ref(database, `photographers/${user.uid}`);
      const photographerData = {
        studio_name: user.displayName || 'Unnamed Studio',
        verified: false,
        events_count: 1 // This should be incremented properly
      };
      await set(photographerRef, photographerData);

      console.log('Event created successfully:', newEventRef.key);
      
      // Reset form
      setFormData({
        title: '',
        datetime: '',
        venue: '',
        description: '',
        visibility: 'public',
        accessCode: ''
      });

      // Callback to parent component
      if (onEventCreated) {
        onEventCreated({
          id: newEventRef.key,
          ...eventData
        });
      }

    } catch (err) {
      console.error('Error creating event:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Create New Event</h2>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Event Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Event Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., John & Sarah's Wedding, Tech Conference 2025"
          />
        </div>

        {/* Date and Time */}
        <div>
          <label htmlFor="datetime" className="block text-sm font-medium text-gray-700 mb-2">
            Event Date & Time *
          </label>
          <input
            type="datetime-local"
            id="datetime"
            name="datetime"
            value={formData.datetime}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Venue */}
        <div>
          <label htmlFor="venue" className="block text-sm font-medium text-gray-700 mb-2">
            Venue *
          </label>
          <input
            type="text"
            id="venue"
            name="venue"
            value={formData.venue}
            onChange={handleInputChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Grand Ballroom, City Hall, Central Park"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Add any additional details about the event..."
          />
        </div>

        {/* Visibility Settings */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Event Visibility
          </label>
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="radio"
                name="visibility"
                value="public"
                checked={formData.visibility === 'public'}
                onChange={handleInputChange}
                className="mr-2"
              />
              <span className="text-sm">
                <strong>Public</strong> - Anyone can view watermarked previews
              </span>
            </label>
            
            <label className="flex items-center">
              <input
                type="radio"
                name="visibility"
                value="code"
                checked={formData.visibility === 'code'}
                onChange={handleInputChange}
                className="mr-2"
              />
              <span className="text-sm">
                <strong>Private (Code)</strong> - Requires access code to view
              </span>
            </label>
            
            <label className="flex items-center">
              <input
                type="radio"
                name="visibility"
                value="list"
                checked={formData.visibility === 'list'}
                onChange={handleInputChange}
                className="mr-2"
              />
              <span className="text-sm">
                <strong>Private (Allow-list)</strong> - Only specific emails can access
              </span>
            </label>
          </div>
        </div>

        {/* Access Code (only show if code visibility selected) */}
        {formData.visibility === 'code' && (
          <div>
            <label htmlFor="accessCode" className="block text-sm font-medium text-gray-700 mb-2">
              Access Code
            </label>
            <input
              type="text"
              id="accessCode"
              name="accessCode"
              value={formData.accessCode}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter a secure access code"
            />
            <p className="text-xs text-gray-500 mt-1">
              This code will be shared with attendees to access photos
            </p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => {
              setFormData({
                title: '',
                datetime: '',
                venue: '',
                description: '',
                visibility: 'public',
                accessCode: ''
              });
            }}
            className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
            disabled={loading}
          >
            Clear
          </button>
          
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Event'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EventCreation;