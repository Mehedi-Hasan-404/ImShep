// src/lib/urlEncryption.ts - COMPLETE FIXED VERSION
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

export function decryptUrl(encrypted: string): string {
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

export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) {
    console.warn('getProxiedUrl: Empty URL provided');
    return originalUrl;
  }
  
  let cleanUrl = originalUrl;
  if (originalUrl.includes('/api/m3u8-proxy?token=')) {
    try {
      const urlObj = new URL(originalUrl, window.location.origin);
      const token = urlObj.searchParams.get('token');
      if (token) {
        cleanUrl = decryptUrl(token);
        console.log('Unwrapped existing proxy URL:', cleanUrl);
      }
    } catch (e) {
      console.error('Error cleaning proxied URL:', e);
    }
  }
  
  const urlLower = cleanUrl.toLowerCase();
  const isM3U8 = urlLower.includes('.m3u8') || 
                 urlLower.includes('/hls/') ||
                 urlLower.includes('hls');
  
  if (isM3U8) {
    const encryptedToken = encryptUrl(cleanUrl);
    const proxiedUrl = `${PROXY_URL}?token=${encryptedToken}&apiKey=${API_KEY || ''}`;
    console.log('🔐 Proxied URL generated:', {
      original: cleanUrl,
      proxied: proxiedUrl,
      hasApiKey: !!API_KEY
    });
    return proxiedUrl;
  }
  
  console.log('ℹ️ URL does not need proxying:', cleanUrl);
  return cleanUrl;
}

export function getProxyHeaders(): HeadersInit {
  return {
    'X-API-Key': API_KEY || '',
  };
}
