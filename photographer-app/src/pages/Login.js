// Save this as: photographer-app/src/pages/Login.js

import React, { useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, set } from 'firebase/database';

// Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "YOUR-API-KEY",
  authDomain: "YOUR-AUTH-DOMAIN",
  databaseURL: "YOUR-DATABASE-URL",
  projectId: "wecravery",
  storageBucket: "YOUR-STORAGE-BUCKET",
  messagingSenderId: "YOUR-SENDER-ID",
  appId: "YOUR-APP-ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

const Login = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studioName, setStudioName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        // Sign up new photographer
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Save photographer data to database
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
          createdAt: new Date().toISOString()
        });

        console.log('Photographer account created successfully!');
      } else {
        // Sign in existing photographer
        await signInWithEmailAndPassword(auth, email, password);
        console.log('Logged in successfully!');
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
  };

  const formStyle = {
    background: 'white',
    borderRadius: '20px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    marginBottom: '15px',
    border: '2px solid #e0e0e0',
    borderRadius: '10px',
    fontSize: '16px',
    transition: 'border-color 0.3s',
    boxSizing: 'border-box'
  };

  const buttonStyle = {
    width: '100%',
    padding: '14px',
    background: loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'transform 0.2s',
    marginTop: '10px'
  };

  return (
    <div style={containerStyle}>
      <div style={formStyle}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '32px', margin: '0', color: '#333' }}>
            📸 Wecravery Pro
          </h1>
          <p style={{ color: '#666', marginTop: '10px' }}>
            {isSignUp ? 'Create Your Photographer Account' : 'Welcome Back, Photographer'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <input
              type="text"
              placeholder="Studio Name"
              value={studioName}
              onChange={(e) => setStudioName(e.target.value)}
              style={inputStyle}
              required
            />
          )}
          
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
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

          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Log In')}
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
};

export default Login;