// src/lib/urlEncryption.ts - COMPLETE FIXED VERSION
const API_KEY = import.meta.env.VITE_API_KEY;
const PROXY_URL = import.meta.env.VITE_PROXY_URL || '/api/m3u8-proxy';

// Enable debug logging
const DEBUG = true;

/**
 * Generate authentication token for stream URL
 * Uses XOR encryption with timestamp-based validation
 */
function generateToken(url: string): string {
  if (!API_KEY) {
    console.error('❌ API_KEY is not configured!');
    return '';
  }
  
  const key = API_KEY.substring(0, 16);
  const timestamp = Math.floor(Date.now() / 60000); // 1-minute buckets
  const data = `${url}:${timestamp}`;
  
  // Use TextEncoder for consistent byte conversion
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(key);
  
  // XOR cipher
  const encoded = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encoded[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // Convert to base64 using binary string method (consistent with server)
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
      tokenLength: token.length,
      keyUsed: key.length
    });
  }
  
  return token;
}

/**
 * Get proxied URL for stream
 * Adds authentication token and routes through proxy server
 */
export function getProxiedUrl(originalUrl: string): string {
  if (DEBUG) {
    console.log('📡 getProxiedUrl called:', {
      originalUrl: originalUrl?.substring(0, 100),
      hasApiKey: !!API_KEY,
      apiKeyLength: API_KEY?.length,
      proxyUrl: PROXY_URL
    });
  }

  if (!originalUrl) {
    console.error('❌ No URL provided to proxy');
    return originalUrl;
  }

  if (!API_KEY) {
    console.error('❌ VITE_API_KEY is not configured in .env file!');
    console.error('💡 Add VITE_API_KEY to your .env file to enable stream proxying');
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
        if (DEBUG) {
          console.log('🔄 URL was already proxied, extracted clean URL:', cleanUrl.substring(0, 100));
        }
      }
    } catch (e) {
      console.error('❌ Error parsing proxied URL:', e);
    }
  }
  
  // Check if URL needs proxying
  const urlLower = cleanUrl.toLowerCase();
  
  // Comprehensive M3U8/HLS detection
  const isM3U8 = urlLower.includes('.m3u8') || 
                 urlLower.includes('.m3u') ||
                 urlLower.includes('/hls/') ||
                 urlLower.includes('hls') ||
                 urlLower.includes('playlist') ||
                 urlLower.includes('master') ||
                 urlLower.includes('index') ||
                 cleanUrl.includes('|Referer=') || // M3U format with referer
                 cleanUrl.includes('|referer=');
  
  // Also check for DASH streams that might need proxying
  const isDASH = urlLower.includes('.mpd') ||
                 urlLower.includes('/dash/') ||
                 (urlLower.includes('dash') && !urlLower.includes('/api/m3u8-proxy'));
  
  if (isM3U8 || isDASH) {
    const token = generateToken(cleanUrl);
    
    if (!token) {
      console.error('❌ Failed to generate token, returning original URL');
      return cleanUrl;
    }
    
    // Build proxied URL
    const proxiedUrl = `${PROXY_URL}?url=${encodeURIComponent(cleanUrl)}&token=${token}`;
    
    if (DEBUG) {
      console.log('✅ Proxying stream:', {
        streamType: isM3U8 ? 'M3U8/HLS' : 'DASH',
        original: cleanUrl.substring(0, 100) + '...',
        proxied: proxiedUrl.substring(0, 100) + '...',
        tokenGenerated: !!token
      });
    }
    
    return proxiedUrl;
  }
  
  if (DEBUG) {
    console.log('⚠️ Not proxying (not detected as streamable format):', {
      url: cleanUrl.substring(0, 100),
      urlLower: urlLower.substring(0, 100)
    });
  }
  
  return cleanUrl;
}

/**
 * Get proxy headers (deprecated - now using token-based auth)
 * @deprecated Use token-based authentication instead
 */
export function getProxyHeaders(): HeadersInit {
  // No longer needed with token-based auth
  return {};
}

/**
 * Debug function to test proxy configuration
 */
export function testProxy() {
  console.log('🧪 Testing Proxy Configuration...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Test environment
  console.log('🔧 Environment Check:', {
    API_KEY: API_KEY ? `✅ Set (${API_KEY.length} chars)` : '❌ NOT SET',
    PROXY_URL: PROXY_URL,
    ENV_MODE: import.meta.env.MODE,
    BASE_URL: import.meta.env.BASE_URL,
    DEV: import.meta.env.DEV
  });
  
  // Test with sample URL
  const testUrl = 'https://example.com/stream.m3u8';
  console.log('🧪 Testing with sample URL:', testUrl);
  
  const proxied = getProxiedUrl(testUrl);
  console.log('🧪 Result:', proxied);
  
  // Check if proxying worked
  if (proxied === testUrl) {
    console.error('❌ Proxying FAILED - URL unchanged');
    console.error('💡 Check if VITE_API_KEY is set in .env file');
  } else {
    console.log('✅ Proxying SUCCESSFUL');
  }
  
  // Test token generation
  if (API_KEY) {
    const token = generateToken(testUrl);
    console.log('🔐 Token test:', {
      length: token.length,
      sample: token.substring(0, 20) + '...'
    });
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Validate stream URL format
 */
export function isValidStreamUrl(url: string): boolean {
  if (!url) return false;
  
  try {
    const urlObj = new URL(url);
    const urlLower = url.toLowerCase();
    
    // Check for supported formats
    const isSupported = urlLower.includes('.m3u8') ||
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
 * Extract referer from M3U format URL
 * Format: URL|Referer=http://example.com
 */
export function extractReferer(url: string): { url: string; referer?: string } {
  if (!url.includes('|Referer=') && !url.includes('|referer=')) {
    return { url };
  }
  
  const parts = url.split('|');
  const cleanUrl = parts[0].trim();
  
  const refererPart = parts[1];
  if (refererPart) {
    const refererMatch = refererPart.match(/(?:Referer|referer)=(.+)/i);
    if (refererMatch) {
      return {
        url: cleanUrl,
        referer: refererMatch[1].trim()
      };
    }
  }
  
  return { url: cleanUrl };
}

/**
 * Get stream type from URL
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

// Auto-run test in development mode
if (import.meta.env.DEV) {
  console.log('🔧 URL Encryption module loaded in DEV mode');
  console.log('💡 Run testProxy() in console to test configuration');
  
  // Auto-test if API key is not set
  if (!API_KEY) {
    console.warn('⚠️ VITE_API_KEY is not set in .env file!');
    console.warn('💡 Add the following to your .env file:');
    console.warn('   VITE_API_KEY="MKL8dhX0+Q/2US2oS5LB2X4tQ8e6Tvy1KUH8TQngp2M="');
  }
}

// Export test function to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).testProxy = testProxy;
}
