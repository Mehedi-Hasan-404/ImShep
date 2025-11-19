// src/lib/urlEncryption.ts - SIMPLIFIED VERSION
const PROXY_URL = '/api/m3u8-proxy';

export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) {
    return originalUrl;
  }
  
  // Clean URL if it's already proxied
  if (originalUrl.includes('/api/m3u8-proxy?url=')) {
    try {
      const urlObj = new URL(originalUrl, window.location.origin);
      const encodedUrl = urlObj.searchParams.get('url');
      if (encodedUrl) {
        return originalUrl; // Already proxied
      }
    } catch (e) {
      // Continue to proxy
    }
  }
  
  // Check if URL needs proxying (M3U8/HLS streams)
  const urlLower = originalUrl.toLowerCase();
  const needsProxy = urlLower.includes('.m3u8') || 
                     urlLower.includes('.m3u') ||
                     urlLower.includes('/hls/') ||
                     urlLower.includes('m3u8');
  
  if (needsProxy) {
    return `${PROXY_URL}?url=${encodeURIComponent(originalUrl)}`;
  }
  
  // Return original URL for direct streams (MP4, etc.)
  return originalUrl;
}
