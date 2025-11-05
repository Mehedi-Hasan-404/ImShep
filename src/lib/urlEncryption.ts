// src/lib/urlEncryption.ts
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

export function getProxiedUrl(originalUrl: string): string {
  const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';
  
  if (originalUrl && originalUrl.includes('.m3u8')) {
    const encryptedToken = encryptUrl(originalUrl);
    return `${PROXY_URL}?token=${encryptedToken}`;
  }
  
  return originalUrl;
}

// ✅ NEW: Function to get API key header
export function getProxyHeaders(): HeadersInit {
  return {
    'X-API-Key': API_KEY || '',
  };
}
