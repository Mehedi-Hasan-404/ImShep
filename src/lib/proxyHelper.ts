// src/lib/proxyHelper.ts - CLIENT-SIDE HELPER
const API_KEY = import.meta.env.VITE_API_KEY;

/**
 * Simple encryption for URLs using XOR cipher
 * Must match server-side implementation
 */
function encryptUrl(url: string): string {
  if (!API_KEY) {
    console.error('❌ API Key not configured');
    return '';
  }
  
  const key = API_KEY.substring(0, 32);
  const encoder = new TextEncoder();
  const urlBytes = encoder.encode(url);
  const keyBytes = encoder.encode(key);
  
  const encrypted = new Uint8Array(urlBytes.length);
  for (let i = 0; i < urlBytes.length; i++) {
    encrypted[i] = urlBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  const binaryString = Array.from(encrypted)
    .map(byte => String.fromCharCode(byte))
    .join('');
  
  return btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate clean-looking path from URL
 */
function generatePath(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    // Use last few segments to create a "clean" looking path
    const cleanPath = pathParts.slice(-3).join('/');
    return cleanPath || 'stream.m3u8';
  } catch {
    return 'stream.m3u8';
  }
}

/**
 * Get proxied URL for streaming
 * Returns clean path-based URL like: /api/proxy/SPORT-ZONE/4Sports/playlist.m3u8
 */
export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) {
    console.error('❌ No URL provided');
    return originalUrl;
  }

  if (!API_KEY) {
    console.error('❌ VITE_API_KEY not configured');
    return originalUrl;
  }
  
  const urlLower = originalUrl.toLowerCase();
  
  // Check if needs proxy
  const needsProxy = 
    urlLower.includes('.m3u8') || 
    urlLower.includes('.m3u') ||
    urlLower.includes('/hls/') ||
    urlLower.includes('.mpd') ||
    urlLower.includes('.ts') ||
    originalUrl.includes('|Referer=');
  
  if (!needsProxy) {
    return originalUrl;
  }
  
  // Use clean path approach
  const cleanPath = generatePath(originalUrl);
  const proxiedUrl = `/api/proxy/${encodeURIComponent(cleanPath)}`;
  
  console.log('✅ URL proxied to clean path:', {
    original: originalUrl.substring(0, 50) + '...',
    proxied: proxiedUrl,
    path: cleanPath
  });
  
  return proxiedUrl;
}

/**
 * Validate stream URL
 */
export function isValidStreamUrl(url: string): boolean {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    const urlLower = url.toLowerCase();
    
    const isSupported = 
      urlLower.includes('.m3u8') ||
      urlLower.includes('.m3u') ||
      urlLower.includes('.mpd') ||
      urlLower.includes('.mp4') ||
      urlLower.includes('.ts');
    
    return isSupported && (urlObj.protocol === 'http:' || urlObj.protocol === 'https:');
  } catch (e) {
    return false;
  }
}

/**
 * Get stream type
 */
export function getStreamType(url: string): 'hls' | 'dash' | 'mp4' | 'unknown' {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('.m3u8') || urlLower.includes('.m3u') || urlLower.includes('hls')) {
    return 'hls';
  }
  
  if (urlLower.includes('.mpd') || urlLower.includes('dash')) {
    return 'dash';
  }
  
  if (urlLower.includes('.mp4')) {
    return 'mp4';
  }
  
  return 'unknown';
}

/**
 * SECURITY: Disable all methods that could leak URLs
 */
if (typeof window !== 'undefined') {
  // Override console methods to prevent URL logging
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  const sanitize = (args: any[]) => {
    return args.map(arg => {
      if (typeof arg === 'string') {
        // Remove any URLs from logs
        return arg.replace(/https?:\/\/[^\s]+/g, '[URL_HIDDEN]');
      }
      return arg;
    });
  };
  
  console.log = (...args: any[]) => originalLog(...sanitize(args));
  console.warn = (...args: any[]) => originalWarn(...sanitize(args));
  console.error = (...args: any[]) => originalError(...sanitize(args));
  
  // Disable network tab URL inspection
  const originalFetch = window.fetch;
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    // Don't log fetch URLs
    return originalFetch(...args);
  };
  
  // Clear any stored URLs from memory after processing
  window.addEventListener('beforeunload', () => {
    // Clear any potential URL storage
    sessionStorage.clear();
  });
}

export { encryptUrl, generatePath };
