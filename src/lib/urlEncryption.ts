// src/lib/urlEncryption.ts - FIXED VERSION
const SECRET_KEY = 'turNjS/qrjIbiCMAQah952gc4WQU3OwdjfOZFF0NkSY=';
const API_KEY = import.meta.env.VITE_API_KEY;

export function encryptUrl(url: string): string {
  const key = SECRET_KEY;
  let encrypted = '';
  for (let i = 0; i < url.length; i++) {
    encrypted += String.fromCharCode(url.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(encrypted).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ✅ NEW: Returns full proxied URL with API key as query parameter
export function getProxiedUrl(originalUrl: string): string {
  const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';
  
  if (originalUrl && originalUrl.includes('.m3u8')) {
    const encryptedToken = encryptUrl(originalUrl);
    // Include API key in URL so it's automatically sent with every request
    return `${PROXY_URL}?token=${encryptedToken}&apiKey=${API_KEY || ''}`;
  }
  
  return originalUrl;
}

// ✅ Keep this for manual fetch requests
export function getProxyHeaders(): HeadersInit {
  return {
    'X-API-Key': API_KEY || '',
  };
}
