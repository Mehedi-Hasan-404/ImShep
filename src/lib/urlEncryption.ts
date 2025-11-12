// src/lib/urlEncryption.ts - TOKEN-BASED VERSION
const API_KEY = import.meta.env.VITE_API_KEY;
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';

// Simple XOR cipher for token generation (matches server-side)
function generateToken(url: string): string {
  if (!API_KEY) return '';
  
  const key = API_KEY.substring(0, 16);
  const timestamp = Math.floor(Date.now() / 60000); // 1-minute buckets
  const data = `${url}:${timestamp}`;
  
  let encoded = '';
  for (let i = 0; i < data.length; i++) {
    encoded += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  
  // <-- FIX: Reverted to simple btoa() to match server's 'latin1' decode
  return btoa(encoded)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl || !API_KEY) {
    return originalUrl;
  }
  
  // Clean URL if already proxied
  let cleanUrl = originalUrl;
  if (originalUrl.includes('/api/m3u8-proxy?')) {
    try {
      const urlObj = new URL(originalUrl, window.location.origin);
      const encodedUrl = urlObj.searchParams.get('url');
      if (encodedUrl) {
        cleanUrl = decodeURIComponent(encodedUrl);
      }
    } catch (e) {
      // Silent fail
    }
  }
  
  // Check if URL needs proxying
  const urlLower = cleanUrl.toLowerCase();
  // <-- FIX: Only proxy HLS streams per user request
  const isM3U8 = urlLower.includes('.m3u8') || 
                 urlLower.includes('/hls/') ||
                 urlLower.includes('hls');
  
  if (isM3U8) {
    const token = generateToken(cleanUrl);
    return `${PROXY_URL}?url=${encodeURIComponent(cleanUrl)}&token=${token}`;
  }
  
  return cleanUrl;
}

export function getProxyHeaders(): HeadersInit {
  return {
    // No longer needed with token-based auth
  };
}
