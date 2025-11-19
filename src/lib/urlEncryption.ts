// src/lib/urlEncryption.ts - FIXED VERSION
const PROXY_URL = '/api/m3u8-proxy';

/**
 * Check if a URL needs proxying based on its format
 */
function needsProxying(url: string): boolean {
  if (!url) return false;
  
  const urlLower = url.toLowerCase();
  
  // Check if URL is already proxied
  if (urlLower.includes('/api/m3u8-proxy')) {
    return false;
  }
  
  // Check if it's a stream that needs proxying
  return (
    urlLower.includes('.m3u8') ||
    urlLower.includes('.m3u') ||
    urlLower.includes('/hls/') ||
    urlLower.includes('m3u8') ||
    urlLower.includes('.ts') || // Transport stream segments
    urlLower.includes('manifest')
  );
}

/**
 * Get proxied URL for streams that need CORS bypass
 */
export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) {
    console.warn('getProxiedUrl: Empty URL provided');
    return originalUrl;
  }
  
  // Clean URL if it's already proxied
  if (originalUrl.includes('/api/m3u8-proxy?url=')) {
    try {
      const urlObj = new URL(originalUrl, window.location.origin);
      const encodedUrl = urlObj.searchParams.get('url');
      if (encodedUrl) {
        console.log('URL already proxied, returning as-is');
        return originalUrl;
      }
    } catch (e) {
      console.warn('Error parsing already-proxied URL:', e);
    }
  }
  
  // Check if URL needs proxying
  if (needsProxying(originalUrl)) {
    const proxiedUrl = `${PROXY_URL}?url=${encodeURIComponent(originalUrl)}`;
    console.log('Proxying stream URL:', {
      original: originalUrl.substring(0, 50) + '...',
      proxied: proxiedUrl.substring(0, 50) + '...'
    });
    return proxiedUrl;
  }
  
  // Return original URL for direct streams (MP4, etc.)
  console.log('Stream does not need proxying, using direct URL');
  return originalUrl;
}

/**
 * Extract original URL from proxied URL
 */
export function getOriginalUrl(proxiedUrl: string): string | null {
  if (!proxiedUrl || !proxiedUrl.includes('/api/m3u8-proxy?url=')) {
    return null;
  }
  
  try {
    const urlObj = new URL(proxiedUrl, window.location.origin);
    const originalUrl = urlObj.searchParams.get('url');
    return originalUrl ? decodeURIComponent(originalUrl) : null;
  } catch (e) {
    console.error('Error extracting original URL:', e);
    return null;
  }
}
