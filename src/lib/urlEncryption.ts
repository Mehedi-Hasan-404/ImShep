// src/lib/urlEncryption.ts

// This should match the SECRET_KEY in your api/m3u8-proxy.ts
const SECRET_KEY = 'your-secret-key-change-this-in-production';

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
  
  // Only proxy m3u8 files
  if (originalUrl && originalUrl.includes('.m3u8')) {
    const encryptedToken = encryptUrl(originalUrl);
    return `${PROXY_URL}?token=${encryptedToken}`;
  }
  
  return originalUrl;
}
