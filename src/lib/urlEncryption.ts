// src/lib/urlEncryption.ts - NO API KEY IN FRONTEND
const PROXY_URL = '/api/m3u8-proxy';

export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) {
    return originalUrl;
  }
  
  // Clean URL if it's already proxied
  let cleanUrl = originalUrl;
  if (originalUrl.includes('/api/m3u8-proxy?url=')) {
    try {
      const urlObj = new URL(originalUrl, window.location.origin);
      const encodedUrl = urlObj.searchParams.get('url');
      if (encodedUrl) {
        cleanUrl = decodeURIComponent(encodedUrl);
      }
    } catch (e) {
      console.error('Error cleaning proxied URL:', e);
    }
  }
  
  // Check if URL needs proxying (M3U8 streams)
  const urlLower = cleanUrl.toLowerCase();
  const isM3U8 = urlLower.includes('.m3u8') || 
                 urlLower.includes('/hls/') ||
                 urlLower.includes('hls');
  
  if (isM3U8) {
    // No API key in URL - origin validation only
    const proxiedUrl = `${PROXY_URL}?url=${encodeURIComponent(cleanUrl)}`;
    return proxiedUrl;
  }
  
  return cleanUrl;
}
