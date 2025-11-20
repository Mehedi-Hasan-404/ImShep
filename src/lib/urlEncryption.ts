// src/lib/urlEncryption.ts - PRODUCTION SAFE VERSION
const PROXY_URL = '/api/m3u8-proxy';

function needsProxying(url: string): boolean {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  if (urlLower.includes('/api/m3u8-proxy')) return false;
  return (
    urlLower.includes('.m3u8') ||
    urlLower.includes('.m3u') ||
    urlLower.includes('/hls/') ||
    urlLower.includes('m3u8') ||
    urlLower.includes('.ts') ||
    urlLower.includes('manifest')
  );
}

export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;
  
  if (originalUrl.includes('/api/m3u8-proxy?url=')) {
    return originalUrl;
  }
  
  if (needsProxying(originalUrl)) {
    // PRODUCTION: Don't log anything
    return `${PROXY_URL}?url=${encodeURIComponent(originalUrl)}`;
  }
  
  return originalUrl;
}

export function getOriginalUrl(proxiedUrl: string): string | null {
  if (!proxiedUrl || !proxiedUrl.includes('/api/m3u8-proxy?url=')) {
    return null;
  }
  
  try {
    const urlObj = new URL(proxiedUrl, window.location.origin);
    const originalUrl = urlObj.searchParams.get('url');
    return originalUrl ? decodeURIComponent(originalUrl) : null;
  } catch (e) {
    return null;
  }
}
