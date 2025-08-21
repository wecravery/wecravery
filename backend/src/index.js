// Cloudflare Worker - Wecravery Photo Marketplace Backend
// File: backend/src/index.js

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

// Firebase Auth verification using REST API
async function verifyFirebaseToken(idToken, env) {
  try {
    // Use Firebase's token verification endpoint
    const response = await fetch(
      `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get Firebase public keys');
    }

    // For now, we'll use a simplified approach
    // In production, you'd properly verify the JWT signature
    const decoded = JSON.parse(atob(idToken.split('.')[1]));
    
    // Basic validation
    if (!decoded.uid || !decoded.email) {
      throw new Error('Invalid token structure');
    }

    return {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role || 'user' // You'll set this in Firebase custom claims
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Authentication failed');
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

// Authentication middleware
async function authenticate(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No valid authorization token');
  }

  const idToken = authHeader.substring(7);
  return await verifyFirebaseToken(idToken, env);
}

// Firebase RTDB helper
async function firebaseRequest(path, method = 'GET', data = null, env) {
  const url = `https://${env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com${path}.json`;
  
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`Firebase request failed: ${response.statusText}`);
  }
  
  return await response.json();
}

// API Handlers
async function createEvent(request, env) {
  try {
    const user = await authenticate(request, env);
    const eventData = await request.json();

    // Validate photographer role (you'll need to set this in your frontend)
    if (user.role !== 'photographer') {
      return new Response('Unauthorized - photographer role required', { 
        status: 403,
        headers: corsHeaders()
      });
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

    // Save to Firebase RTDB
    await firebaseRequest(`/events/${eventId}`, 'PUT', event, env);

    // Also update photographer record
    const photographerData = {
      studio_name: user.email.split('@')[0] + ' Studio',
      verified: false,
      events_count: 1 // Should be incremented properly
    };
    await firebaseRequest(`/photographers/${user.uid}`, 'PUT', photographerData, env);

    return new Response(JSON.stringify({ eventId, ...event }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });

  } catch (error) {
    console.error('Create event error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

async function initUpload(request, env) {
  try {
    const user = await authenticate(request, env);
    const { eventId, albumId, fileName, fileSize, contentType } = await request.json();

    // Validate file
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (fileSize > maxSize) {
      throw new Error('File too large (max 10MB)');
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(contentType)) {
      throw new Error('Invalid file type. Allowed: JPEG, PNG, WebP');
    }

    // Generate unique keys
    const photoId = generateSecureId();
    const timestamp = Date.now();
    const extension = fileName.split('.').pop();
    const r2Key = `events/${eventId}/originals/${timestamp}-${photoId}.${extension}`;

    // Create presigned URL for R2 upload
    const object = env.R2_BUCKET.put(r2Key, null, {
      httpMetadata: { contentType },
      customMetadata: { 
        eventId, 
        photoId, 
        uploadedBy: user.uid,
        originalFileName: fileName 
      }
    });

    // For now, return a placeholder URL - you'll need to implement R2 presigned URLs
    const uploadUrl = `https://placeholder-upload-url.com/${r2Key}`;

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

    await firebaseRequest(`/eventPhotos/${eventId}/${photoId}`, 'PUT', photoData, env);

    return new Response(JSON.stringify({
      photoId,
      r2Key,
      uploadUrl
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });

  } catch (error) {
    console.error('Upload init error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

async function processPhoto(request, env) {
  try {
    const user = await authenticate(request, env);
    const { eventId, photoId, r2Key } = await request.json();

    // Update status to processing
    await firebaseRequest(`/eventPhotos/${eventId}/${photoId}`, 'PATCH', {
      status: 'processing',
      processingStarted: Date.now()
    }, env);

    // TODO: Implement actual image processing pipeline:
    // 1. Generate thumbnails (thumb/web/hi-res variants)
    // 2. Add watermarks for preview
    // 3. Extract EXIF data
    // 4. Optional AI labeling
    // 5. Update status to 'published'

    // For now, just mark as published after a delay
    setTimeout(async () => {
      await firebaseRequest(`/eventPhotos/${eventId}/${photoId}`, 'PATCH', {
        status: 'published',
        publishedAt: Date.now()
      }, env);
    }, 2000);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Photo processing initiated' 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });

  } catch (error) {
    console.error('Process photo error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

async function verifyAccess(request, env) {
  try {
    const { eventId, accessCode, qrToken } = await request.json();

    let accessGranted = false;
    let accessMethod = '';

    if (qrToken) {
      // Verify QR token
      const keycard = await firebaseRequest(`/qrKeycards/${eventId}/${qrToken}`, 'GET', null, env);

      if (keycard && keycard.state === 'issued' && keycard.expiresAt > Date.now()) {
        accessGranted = true;
        accessMethod = 'qr';

        // Mark as claimed
        await firebaseRequest(`/qrKeycards/${eventId}/${qrToken}`, 'PATCH', {
          state: 'claimed',
          claimedAt: Date.now()
        }, env);
      }
    } else if (accessCode) {
      // Verify access code
      const event = await firebaseRequest(`/events/${eventId}`, 'GET', null, env);

      if (event && event.access && event.access.codeHash) {
        const providedHash = await hashAccessCode(accessCode);
        if (providedHash === event.access.codeHash) {
          accessGranted = true;
          accessMethod = 'code';
        }
      }
    }

    if (accessGranted) {
      // Generate session token
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
    console.error('Access verification error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

async function createQRKeycard(request, env) {
  try {
    const user = await authenticate(request, env);
    const { eventId, count = 1 } = await request.json();

    // Verify user owns the event
    const event = await firebaseRequest(`/events/${eventId}`, 'GET', null, env);
    if (!event || event.photographerId !== user.uid) {
      return new Response('Unauthorized', { status: 403, headers: corsHeaders() });
    }

    const keycards = [];
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days

    for (let i = 0; i < count; i++) {
      const token = generateSecureId();
      const keycardData = {
        state: 'issued',
        claimedBy: null,
        expiresAt: expiresAt,
        createdAt: Date.now(),
        eventId: eventId
      };

      await firebaseRequest(`/qrKeycards/${eventId}/${token}`, 'PUT', keycardData, env);
      keycards.push({ token, ...keycardData });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      keycards 
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });

  } catch (error) {
    console.error('Create QR keycard error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  }
}

// Test endpoint
async function testEndpoint(request, env) {
  return new Response(JSON.stringify({ 
    message: 'Wecravery backend is running!',
    timestamp: new Date().toISOString(),
    environment: env.ENVIRONMENT || 'development',
    version: '1.0.0'
  }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

// Health check endpoint
async function healthCheck(request, env) {
  try {
    // Test Firebase connection
    const testResult = await firebaseRequest('/test', 'GET', null, env);
    
    return new Response(JSON.stringify({ 
      status: 'healthy',
      firebase: 'connected',
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
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

    // Health and test endpoints
    router.register('/api/test', 'GET', testEndpoint);
    router.register('/api/health', 'GET', healthCheck);

    // Event Management
    router.register('/api/events/create', 'POST', createEvent);

    // Upload Management  
    router.register('/api/upload/init', 'POST', initUpload);
    router.register('/api/upload/process', 'POST', processPhoto);

    // Access Control
    router.register('/api/access/verify', 'POST', verifyAccess);

    // QR Keycard Management
    router.register('/api/qr/create', 'POST', createQRKeycard);

    try {
      return await router.route(request, env);
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    }
  }
};