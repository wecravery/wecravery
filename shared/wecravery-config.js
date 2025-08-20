// Save this as: shared/wecravery-config.js

// Wecravery Firebase Configuration
const wecraveryConfig = {
  firebase: {
    apiKey: "AIzaSyC5w5_pGY3Za_lhBpC9ix8o_gOzqCe9mek",
  authDomain: "wecravery-ad256.firebaseapp.com",
  databaseURL: "https://wecravery-ad256-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "wecravery-ad256",
  storageBucket: "wecravery-ad256.firebasestorage.app",
  messagingSenderId: "242433358028",
  appId: "1:242433358028:web:225aa975f0b862b7ea2a69"
  },
  
  // Cloudflare Configuration
  cloudflare: {
    workerUrl: "https://wecravery-api.YOUR-SUBDOMAIN.workers.dev",
    r2BucketName: "wecravery-images"
  },
  
  // App Configuration
  app: {
    name: "Wecravery",
    tagline: "Capture Every Moment, Share Every Memory",
    version: "1.0.0"
  }
};

export default wecraveryConfig;