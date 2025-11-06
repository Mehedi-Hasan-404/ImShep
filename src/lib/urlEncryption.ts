// src/lib/urlEncryption.ts - FIXED VERSION WITH PROPER PROXY HANDLING
const SECRET_KEY = 'turNjS/qrjIbiCMAQah952gc4WQU3OwdjfOZFF0NkSY=';
const API_KEY = import.meta.env.VITE_API_KEY;
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';

export function encryptUrl(url: string): string {
  const key = SECRET_KEY;
  let encrypted = '';
  for (let i = 0; i < url.length; i++) {
    encrypted += String.fromCharCode(url.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(encrypted).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Returns full proxied URL with API key as query parameter
 * This ensures all requests (including HLS.js segment requests) have the API key
 */
export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;
  
  // Clean the URL - remove any existing proxy wrapping
  let cleanUrl = originalUrl;
  if (originalUrl.includes('/api/m3u8-proxy?token=')) {
    // Already proxied, extract original URL
    try {
      const urlObj = new URL(originalUrl, window.location.origin);
      const token = urlObj.searchParams.get('token');
      if (token) {
        cleanUrl = decryptUrl(token);
      }
    } catch (e) {
      console.error('Error cleaning proxied URL:', e);
    }
  }
  
  // Only proxy M3U8 URLs
  const isM3U8 = cleanUrl.toLowerCase().includes('.m3u8') || 
                 cleanUrl.toLowerCase().includes('/hls/');
  
  if (isM3U8) {
    const encryptedToken = encryptUrl(cleanUrl);
    // CRITICAL: Include API key in URL so HLS.js automatically sends it with every request
    return `${PROXY_URL}?token=${encryptedToken}&apiKey=${API_KEY || ''}`;
  }
  
  return cleanUrl;
}

/**
 * Decrypt an encrypted URL token
 */
function decryptUrl(encrypted: string): string {
  try {
    const restored = encrypted.replace(/-/g, '+').replace(/_/g, '/');
    const padded = restored + '=='.substring(0, (4 - restored.length % 4) % 4);
    const decoded = atob(padded);
    
    const key = SECRET_KEY;
    let decrypted = '';
    for (let i = 0; i < decoded.length; i++) {
      decrypted += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decrypted;
  } catch (e) {
    console.error('Error decrypting URL:', e);
    throw new Error('Invalid encrypted URL');
  }
}

/**
 * Get headers for manual fetch requests (not needed for HLS.js with query param API key)
 */
export function getProxyHeaders(): HeadersInit {
  return {
    'X-API-Key': API_KEY || '',
  };
}
