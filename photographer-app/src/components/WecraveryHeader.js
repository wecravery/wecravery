// Save this as: photographer-app/src/components/WecraveryHeader.js

import React from 'react';

const WecraveryHeader = () => {
  const headerStyle = {
    background: 'linear-gradient(135deg, #6366F1 0%, #EC4899 100%)',
    color: 'white',
    padding: '20px',
    textAlign: 'center',
    fontFamily: "'Poppins', sans-serif",
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
  };

  const logoStyle = {
    fontSize: '32px',
    fontWeight: 'bold',
    marginBottom: '5px'
  };

  const taglineStyle = {
    fontSize: '14px',
    opacity: '0.9',
    fontFamily: "'Inter', sans-serif"
  };

  return (
    <header style={headerStyle}>
      <div style={logoStyle}>
        📸 Wecravery Pro
      </div>
      <div style={taglineStyle}>
        Monetize Your Event Photography
      </div>
    </header>
  );
};

export default WecraveryHeader;