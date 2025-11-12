// src/lib/urlEncryption.ts - NO CONSOLE LOGGING
const API_KEY = import.meta.env.VITE_API_KEY;
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';

export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl || !API_KEY) {
    return originalUrl;
  }
  
  // Clean URL if already proxied
  let cleanUrl = originalUrl;
  if (originalUrl.includes('/api/m3u8-proxy?url=')) {
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
  const isM3U8 = urlLower.includes('.m3u8') || 
                 urlLower.includes('/hls/') ||
                 urlLower.includes('hls');
  
  if (isM3U8) {
    return `${PROXY_URL}?url=${encodeURIComponent(cleanUrl)}&apiKey=${API_KEY}`;
  }
  
  return cleanUrl;
}

export function getProxyHeaders(): HeadersInit {
  return {
    'X-API-Key': API_KEY || '',
  };
}
