// src/lib/urlEncryption.ts - COMPLETELY FIXED VERSION
const API_KEY = import.meta.env.VITE_API_KEY;
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';

// Debug logging
const DEBUG = false; // Set to false in production

/**
 * Generate authentication token for stream URL
 * CRITICAL: Must match server-side implementation exactly
 */
function generateToken(url: string): string {
  if (!API_KEY) {
    console.error('❌ API_KEY is not configured!');
    return '';
  }
  
  const key = API_KEY.substring(0, 16);
  const timestamp = Math.floor(Date.now() / 60000); // 1-minute buckets for cache
  const data = `${url}:${timestamp}`;
  
  // CRITICAL: Use TextEncoder for consistent byte conversion (matches server)
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(key);
  
  // XOR cipher
  const encoded = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encoded[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // CRITICAL: Convert to base64 using proper method
  let binaryString = '';
  for (let i = 0; i < encoded.length; i++) {
    binaryString += String.fromCharCode(encoded[i]);
  }
  
  // URL-safe base64 encoding
  const token = btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  if (DEBUG) {
    console.log('🔐 Token generated:', {
      url: url.substring(0, 50) + '...',
      timestamp,
      tokenLength: token.length
    });
  }
  
  return token;
}

/**
 * Get proxied URL for stream
 * CRITICAL: Properly detects stream types and adds authentication
 */
export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) {
    console.error('❌ No URL provided to proxy');
    return originalUrl;
  }

  if (!API_KEY) {
    console.error('❌ VITE_API_KEY is not configured in .env file!');
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
      console.error('Error parsing proxied URL:', e);
    }
  }
  
  const urlLower = cleanUrl.toLowerCase();
  
  // CRITICAL: Comprehensive stream detection
  const needsProxy = 
    urlLower.includes('.m3u8') || 
    urlLower.includes('.m3u') ||
    urlLower.includes('/hls/') ||
    urlLower.includes('hls') ||
    urlLower.includes('.mpd') ||
    urlLower.includes('/dash/') ||
    urlLower.includes('playlist') ||
    urlLower.includes('master') ||
    cleanUrl.includes('|Referer=') ||
    cleanUrl.includes('|referer=');
  
  if (needsProxy) {
    const token = generateToken(cleanUrl);
    
    if (!token) {
      console.error('❌ Failed to generate token');
      return cleanUrl;
    }
    
    // Build proxied URL
    const proxiedUrl = `${PROXY_URL}?url=${encodeURIComponent(cleanUrl)}&token=${token}`;
    
    if (DEBUG) {
      console.log('✅ Proxying stream:', {
        original: cleanUrl.substring(0, 50) + '...',
        proxied: proxiedUrl.substring(0, 50) + '...'
      });
    }
    
    return proxiedUrl;
  }
  
  return cleanUrl;
}

/**
 * Validate stream URL format
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
      urlLower.includes('hls') ||
      urlLower.includes('dash');
    
    return isSupported && (urlObj.protocol === 'http:' || urlObj.protocol === 'https:');
  } catch (e) {
    return false;
  }
}

/**
 * Get stream type from URL
 */
export function getStreamType(url: string): 'hls' | 'dash' | 'mp4' | 'unknown' {
  const urlLower = url.toLowerCase();
  
  // Check for proxy URLs first
  if (urlLower.includes('/api/m3u8-proxy')) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const targetUrl = urlObj.searchParams.get('url');
      if (targetUrl) {
        return getStreamType(decodeURIComponent(targetUrl));
      }
    } catch (e) {
      // Continue with original URL check
    }
  }
  
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

// Auto-warn if API key is not set
if (!API_KEY && typeof window !== 'undefined') {
  console.warn('⚠️ VITE_API_KEY is not set - streaming will not work!');
  console.warn('💡 Add VITE_API_KEY to your .env file');
}
