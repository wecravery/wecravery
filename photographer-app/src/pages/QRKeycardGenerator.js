// QRKeycardGenerator.jsx - Generate QR codes for event access
import React, { useState, useEffect } from 'react';
import { ref, push, set, get } from 'firebase/database';
import { database } from '../firebase/config';

const QRKeycardGenerator = ({ eventId, eventTitle }) => {
  const [keycards, setKeycards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Generate a cryptographically secure token
  const generateSecureToken = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  // Load existing keycards for this event
  useEffect(() => {
    const loadKeycards = async () => {
      setLoading(true);
      try {
        const keycardsRef = ref(database, `qrKeycards/${eventId}`);
        const snapshot = await get(keycardsRef);
        if (snapshot.exists()) {
          const keycardsData = snapshot.val();
          const keycardsArray = Object.entries(keycardsData).map(([token, data]) => ({
            token,
            ...data
          }));
          setKeycards(keycardsArray);
        }
      } catch (error) {
        console.error('Error loading keycards:', error);
      } finally {
        setLoading(false);
      }
    };

    if (eventId) {
      loadKeycards();
    }
  }, [eventId]);

  // Generate new QR keycards
  const generateKeycards = async (count = 1) => {
    setGenerating(true);
    try {
      const newKeycards = [];
      const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days from now

      for (let i = 0; i < count; i++) {
        const token = generateSecureToken();
        const keycardData = {
          state: 'issued',
          claimedBy: null,
          expiresAt: expiresAt,
          createdAt: Date.now(),
          eventId: eventId
        };

        // Save to Firebase
        const keycardRef = ref(database, `qrKeycards/${eventId}/${token}`);
        await set(keycardRef, keycardData);

        newKeycards.push({
          token,
          ...keycardData
        });
      }

      setKeycards(prev => [...prev, ...newKeycards]);
    } catch (error) {
      console.error('Error generating keycards:', error);
    } finally {
      setGenerating(false);
    }
  };

  // Generate QR code data URL (you might want to use a QR library like qrcode)
  const generateQRData = (token) => {
    // This would be the URL that users scan
    // Format: {baseUrl}/access/qr/{eventId}/{token}
    return `${window.location.origin}/access/qr/${eventId}/${token}`;
  };

  // Simple QR code placeholder (in production, use qrcode library)
  const QRCodePlaceholder = ({ data, size = 150 }) => (
    <div 
      className="border-2 border-gray-300 flex items-center justify-center bg-gray-100"
      style={{ width: size, height: size }}
    >
      <div className="text-xs text-center p-2 break-all">
        QR Code
        <br />
        <span className="text-xs font-mono">{data.slice(-8)}</span>
      </div>
    </div>
  );

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const getStateColor = (state) => {
    switch (state) {
      case 'issued': return 'bg-green-100 text-green-800';
      case 'claimed': return 'bg-blue-100 text-blue-800';
      case 'expired': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading keycards...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-800">QR Keycards</h3>
          <p className="text-sm text-gray-600">
            Generate QR codes for {eventTitle}
          </p>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => generateKeycards(1)}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate 1'}
          </button>
          
          <button
            onClick={() => generateKeycards(10)}
            disabled={generating}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {generating ? 'Generating...' : 'Generate 10'}
          </button>
        </div>
      </div>

      {keycards.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No QR keycards generated yet.</p>
          <p className="text-sm">Click "Generate" to create access cards for your event.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-gray-600 mb-4">
            Total Keycards: {keycards.length} | 
            Claimed: {keycards.filter(k => k.state === 'claimed').length} | 
            Available: {keycards.filter(k => k.state === 'issued').length}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {keycards.map((keycard) => (
              <div key={keycard.token} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex justify-between items-start mb-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStateColor(keycard.state)}`}>
                    {keycard.state}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(keycard.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex justify-center mb-3">
                  <QRCodePlaceholder data={generateQRData(keycard.token)} />
                </div>

                <div className="space-y-2">
                  <div className="text-xs">
                    <strong>Token:</strong>
                    <div className="font-mono text-xs bg-white p-1 rounded border break-all">
                      {keycard.token.slice(0, 16)}...
                    </div>
                  </div>

                  <div className="text-xs">
                    <strong>QR URL:</strong>
                    <div className="flex">
                      <input
                        type="text"
                        value={generateQRData(keycard.token)}
                        readOnly
                        className="flex-1 text-xs font-mono bg-white p-1 rounded-l border"
                      />
                      <button
                        onClick={() => copyToClipboard(generateQRData(keycard.token))}
                        className="px-2 py-1 bg-gray-200 text-xs rounded-r border border-l-0 hover:bg-gray-300"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  {keycard.claimedBy && (
                    <div className="text-xs">
                      <strong>Claimed by:</strong> {keycard.claimedBy}
                    </div>
                  )}

                  <div className="text-xs">
                    <strong>Expires:</strong> {new Date(keycard.expiresAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">How to use QR Keycards:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>1. Generate QR codes for your event attendees</li>
          <li>2. Print the QR codes or share them digitally</li>
          <li>3. Attendees scan the QR code to access event photos</li>
          <li>4. Each code can only be claimed once and expires in 30 days</li>
        </ul>
      </div>
    </div>
  );
};

export default QRKeycardGenerator;