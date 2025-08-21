// Cloudflare Worker - Core backend for Photo Marketplace
// File: backend/src/index.js

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Router for handling different endpoints
class Router {
  constructor() {
    this.routes = [];
  }

  register(path, method, handler) {
    this.routes.push({ path, method: method.toLowerCase(), handler });
  }

  async route(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toLowerCase();

    for (const route of this.routes) {
      if (this.matchPath(route.path, path) && route.method === method) {
        const pathParams = this.extractParams(route.path, path);
        return await route.handler(request, env, pathParams);
      }
    }

    return new Response('Not Found', { status: 404 });
  }

  matchPath(routePath, actualPath) {
    const routeParts = routePath.split('/');
    const actualParts = actualPath.split('/');
    
    if (routeParts.length !== actualParts.length) return false;
    
    return routeParts.every((part, i) => 
      part.startsWith(':') || part === actualParts[i]
    );
  }

  extractParams(routePath, actualPath) {
    const routeParts = routePath.split('/');
    const actualParts = actualPath.split('/');
    const params = {};
    
    routeParts.forEach((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = actualParts[i];
      }
    });
    
    return params;
  }
}

// Authentication middleware
async function authenticate(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No valid authorization token');
  }

  const idToken = authHeader.substring(7);
  
  // Initialize Firebase Admin (you'll need to set up service account)
  const firebaseConfig = {
    projectId: env.FIREBASE_PROJECT_ID,
    // Add other Firebase admin config
  };

  try {
    // Verify the ID token
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error('Invalid authentication token');
  }
}

// Utility functions
function generateSecureId() {
  return crypto.randomUUID().replace(/-/g, '');
}

async function hashAccessCode(code) {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// CORS helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Event Management APIs
async function createEvent(request, env) {
  try {
    const user = await authenticate(request, env);
    const eventData = await request.json();

    // Validate photographer role
    if (user.role !== 'photographer') {
      return new Response('Unauthorized', { status: 403 });
    }

    const eventId = generateSecureId();
    const now = Date.now();

    const event = {
      id: eventId,
      photographerId: user.uid,
      title: eventData.title,
      datetime: eventData.datetime,
      venue: eventData.venue,
      description: eventData.description || '',
      visibility: eventData.visibility || 'public',
      status: 'draft',
      createdAt: now,
      updatedAt: now
    };

    // Handle access control
    if (eventData.visibility === 'code' && eventData.accessCode) {
      event.access = {
        codeHash: await hashAccessCode(eventData.accessCode)
      };
    } else if (eventData.visibility === 'list') {
      event.access = {
        allowedEmails: eventData.allowedEmails || []
      };
    }

    // Save to Firebase RTDB via REST API
    const firebaseUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/events/${eventId}.json`;
    const firebaseResponse = await fetch(firebaseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });

    if (!firebaseResponse.ok) {
      throw new Error('Failed to save event to database');
    }

    return new Response(JSON.stringify({ eventId, ...event }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

// Upload Management APIs
async function initUpload(request, env) {
  try {
    const user = await authenticate(request, env);
    const { eventId, albumId, fileName, fileSize, contentType } = await request.json();

    // Validate file
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fileSize > maxSize) {
      throw new Error('File too large');
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(contentType)) {
      throw new Error('Invalid file type');
    }

    // Generate unique keys
    const photoId = generateSecureId();
    const timestamp = Date.now();
    const extension = fileName.split('.').pop();
    const r2Key = `events/${eventId}/originals/${timestamp}-${photoId}.${extension}`;

    // Create signed upload URL for R2
    const uploadUrl = await env.R2_BUCKET.put(r2Key, null, {
      httpMetadata: { contentType },
      customMetadata: { 
        eventId, 
        photoId, 
        uploadedBy: user.uid,
        originalFileName: fileName 
      }
    });

    // Create initial photo record in RTDB
    const photoData = {
      r2Key,
      albumId: albumId || 'default',
      status: 'uploaded',
      fileName,
      fileSize,
      contentType,
      photographerId: user.uid,
      createdAt: timestamp
    };

    const firebaseUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/eventPhotos/${eventId}/${photoId}.json`;
    await fetch(firebaseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(photoData)
    });

    return new Response(JSON.stringify({
      photoId,
      r2Key,
      uploadUrl: uploadUrl // This would be the signed URL from R2
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

// Process uploaded photo (trigger background job)
async function processPhoto(request, env) {
  try {
    const user = await authenticate(request, env);
    const { eventId, photoId, r2Key } = await request.json();

    // Update status to processing
    const firebaseUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/eventPhotos/${eventId}/${photoId}/status.json`;
    await fetch(firebaseUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify('processing')
    });

    // In a real implementation, you'd queue this for background processing
    // For now, we'll just simulate the process
    console.log(`Processing photo ${photoId} with key ${r2Key}`);

    // TODO: Implement actual image processing pipeline:
    // 1. Generate thumbnails (thumb/web/hi-res variants)
    // 2. Add watermarks for preview
    // 3. Extract EXIF data
    // 4. Optional AI labeling
    // 5. Update status to 'published'

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Photo processing initiated' 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

// Access Control APIs
async function verifyAccess(request, env) {
  try {
    const { eventId, accessCode, qrToken } = await request.json();

    let accessGranted = false;
    let accessMethod = '';

    if (qrToken) {
      // Verify QR token
      const firebaseUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/qrKeycards/${eventId}/${qrToken}.json`;
      const response = await fetch(firebaseUrl);
      const keycard = await response.json();

      if (keycard && keycard.state === 'issued' && keycard.expiresAt > Date.now()) {
        accessGranted = true;
        accessMethod = 'qr';

        // Mark as claimed (in real implementation, you'd update this atomically)
        const updateUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/qrKeycards/${eventId}/${qrToken}.json`;
        await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: 'claimed',
            claimedAt: Date.now()
          })
        });
      }
    } else if (accessCode) {
      // Verify access code
      const eventUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/events/${eventId}.json`;
      const eventResponse = await fetch(eventUrl);
      const event = await eventResponse.json();

      if (event && event.access && event.access.codeHash) {
        const providedHash = await hashAccessCode(accessCode);
        if (providedHash === event.access.codeHash) {
          accessGranted = true;
          accessMethod = 'code';
        }
      }
    }

    if (accessGranted) {
      // Generate session token (simplified - use proper JWT in production)
      const sessionToken = generateSecureId();
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      return new Response(JSON.stringify({
        success: true,
        sessionToken,
        expiresAt,
        accessMethod
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid access credentials' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

// Download Authorization
async function authorizeDownload(request, env, pathParams) {
  try {
    const user = await authenticate(request, env);
    const { photoId, size } = pathParams;

    // Verify download grant exists
    const grantUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/downloadGrants/${user.uid}/${photoId}:${size}.json`;
    const grantResponse = await fetch(grantUrl);
    const grant = await grantResponse.json();

    if (!grant || grant.expiresAt < Date.now() || grant.downloadCount >= grant.maxDownloads) {
      return new Response('Download not authorized', { status: 403 });
    }

    // Increment download counter atomically
    const counterUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/downloadGrants/${user.uid}/${photoId}:${size}/downloadCount.json`;
    await fetch(counterUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(grant.downloadCount + 1)
    });

    // Get photo metadata to determine R2 key
    const photoUrl = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com/eventPhotos/${grant.eventId}/${photoId}.json`;
    const photoResponse = await fetch(photoUrl);
    const photo = await photoResponse.json();

    if (!photo) {
      return new Response('Photo not found', { status: 404 });
    }

    // Generate signed download URL from R2
    const r2Key = size === 'original' ? photo.r2Key : photo.variants[`${size}Key`];
    const signedUrl = await env.R2_BUCKET.get(r2Key, {
      range: { offset: 0, length: photo.fileSize }
    });

    return new Response(JSON.stringify({ downloadUrl: signedUrl.url }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

// Main request handler
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const router = new Router();

    // Event Management
    router.register('/api/events/create', 'POST', createEvent);

    // Upload Management  
    router.register('/api/upload/init', 'POST', initUpload);
    router.register('/api/upload/process', 'POST', processPhoto);

    // Access Control
    router.register('/api/access/verify', 'POST', verifyAccess);

    // Downloads
    router.register('/api/download/:photoId/:size', 'GET', authorizeDownload);

    try {
      return await router.route(request, env);
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    }
  }
};