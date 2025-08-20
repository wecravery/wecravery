import React, { useState, useEffect } from 'react';
import './App.css';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, set, get } from 'firebase/database';

// Firebase configuration - REPLACE WITH YOUR ACTUAL CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyC5w5_pGY3Za_lhBpC9ix8o_gOzqCe9mek",
  authDomain: "wecravery-ad256.firebaseapp.com",
  databaseURL: "https://wecravery-ad256-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "wecravery-ad256",
  storageBucket: "wecravery-ad256.firebasestorage.app",
  messagingSenderId: "242433358028",
  appId: "1:242433358028:web:225aa975f0b862b7ea2a69"
};

// Initialize Firebase
let app;
let auth;
let database;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  database = getDatabase(app);
  console.log("Firebase initialized successfully!");
} catch (error) {
  console.error("Firebase initialization error:", error);
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studioName, setStudioName] = useState('');
  const [error, setError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Check if user is logged in
  useEffect(() => {
    if (!auth) {
      setError("Firebase not initialized. Please check your configuration.");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Check if user is a photographer
          const userRef = ref(database, `users/${user.uid}`);
          const snapshot = await get(userRef);
          if (snapshot.exists() && snapshot.val().role === 'photographer') {
            setUser(user);
          } else {
            // If user exists but no role, set as photographer
            setUser(user);
          }
        } catch (error) {
          console.error("Error checking user role:", error);
          setUser(user); // Set user anyway
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle login/signup
  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setAuthLoading(true);

    try {
      if (isSignUp) {
        // Create new photographer account
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Save photographer data to database
        try {
          await set(ref(database, 'users/' + user.uid), {
            role: 'photographer',
            email: email,
            displayName: studioName,
            verified: false,
            createdAt: new Date().toISOString()
          });

          await set(ref(database, 'photographers/' + user.uid), {
            studio_name: studioName,
            payout_status: 'pending',
            balance: {
              pending: 0,
              available: 0
            },
            createdAt: new Date().toISOString()
          });
        } catch (dbError) {
          console.error("Database write error:", dbError);
          // Continue even if database write fails
        }

        setUser(user);
        alert("Account created successfully! Welcome to Wecravery!");
      } else {
        // Sign in existing photographer
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        setUser(userCredential.user);
        alert("Logged in successfully!");
      }
      
      // Clear form
      setEmail('');
      setPassword('');
      setStudioName('');
    } catch (error) {
      console.error("Auth error:", error);
      
      // Better error messages
      if (error.code === 'auth/email-already-in-use') {
        setError("This email is already registered. Please log in instead.");
      } else if (error.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else if (error.code === 'auth/invalid-email') {
        setError("Please enter a valid email address.");
      } else if (error.code === 'auth/user-not-found') {
        setError("No account found with this email. Please sign up.");
      } else if (error.code === 'auth/wrong-password') {
        setError("Incorrect password. Please try again.");
      } else {
        setError(error.message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      alert("Logged out successfully!");
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Error screen for Firebase configuration issues
  if (!auth || !database) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '40px',
          maxWidth: '500px',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#ef4444' }}>⚠️ Configuration Error</h2>
          <p>Firebase is not properly configured. Please check:</p>
          <ol style={{ textAlign: 'left' }}>
            <li>Update the firebaseConfig in App.js with your actual values</li>
            <li>Make sure Authentication is enabled in Firebase Console</li>
            <li>Make sure Realtime Database is enabled in Firebase Console</li>
          </ol>
          <p style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
            Check the browser console for more details.
          </p>
        </div>
      </div>
    );
  }

  // Loading screen
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>📸</h1>
          <p>Loading Wecravery...</p>
        </div>
      </div>
    );
  }

  // Login/Signup screen
  if (!user) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '40px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <h1 style={{ fontSize: '32px', margin: '0', color: '#333' }}>
              📸 Wecravery Pro
            </h1>
            <p style={{ color: '#666', marginTop: '10px' }}>
              {isSignUp ? 'Create Your Photographer Account' : 'Welcome Back, Photographer'}
            </p>
          </div>

          <form onSubmit={handleAuth}>
            {isSignUp && (
              <input
                type="text"
                placeholder="Studio/Business Name"
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  marginBottom: '15px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '10px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
                required
              />
            )}
            
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '15px',
                border: '2px solid #e0e0e0',
                borderRadius: '10px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              required
            />
            
            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '15px',
                border: '2px solid #e0e0e0',
                borderRadius: '10px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              required
              minLength="6"
            />

            {error && (
              <div style={{
                background: '#ffebee',
                color: '#c62828',
                padding: '10px',
                borderRadius: '5px',
                marginBottom: '15px',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={authLoading}
              style={{
                width: '100%',
                padding: '14px',
                background: authLoading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: authLoading ? 'not-allowed' : 'pointer',
                marginTop: '10px'
              }}
            >
              {authLoading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Log In')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#667eea',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '14px'
              }}
            >
              {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard (logged in)
  return (
    <div className="App">
      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px' }}>📸 Wecravery Pro</h1>
            <p style={{ margin: '5px 0 0 0', opacity: 0.9, fontSize: '14px' }}>
              Photographer Dashboard
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span>{user.email}</span>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 20px',
                background: 'rgba(255,255,255,0.2)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ marginBottom: '30px', color: '#333' }}>
          Welcome to Your Dashboard! 🎉
        </h2>
        
        <div style={{
          background: '#d4f4dd',
          border: '2px solid #10b981',
          borderRadius: '10px',
          padding: '20px',
          marginBottom: '30px'
        }}>
          <h3 style={{ color: '#10b981', margin: '0 0 10px 0' }}>
            ✅ Success! You're logged in to Wecravery
          </h3>
          <p style={{ margin: 0, color: '#065f46' }}>
            Your photographer account is ready. Start by creating your first event!
          </p>
        </div>
        
        {/* Stats Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '40px'
        }}>
          {/* Events Card */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #667eea'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#667eea' }}>📅 Events</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: '10px 0' }}>0</p>
            <p style={{ color: '#666', fontSize: '14px' }}>Total Events Created</p>
          </div>

          {/* Photos Card */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #764ba2'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#764ba2' }}>🖼️ Photos</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: '10px 0' }}>0</p>
            <p style={{ color: '#666', fontSize: '14px' }}>Total Photos Uploaded</p>
          </div>

          {/* Earnings Card */}
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            borderLeft: '4px solid #10B981'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#10B981' }}>💰 Earnings</h3>
            <p style={{ fontSize: '32px', fontWeight: 'bold', margin: '10px 0' }}>$0.00</p>
            <p style={{ color: '#666', fontSize: '14px' }}>Available Balance</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;