// src/utils/streamDiagnostics.ts - Stream Testing Tool
import { getProxiedUrl, isValidStreamUrl, getStreamType } from '@/lib/urlEncryption';

interface DiagnosticResult {
  success: boolean;
  message: string;
  details?: any;
}

export class StreamDiagnostics {
  /**
   * Test if API key is configured
   */
  static testApiKey(): DiagnosticResult {
    const apiKey = import.meta.env.VITE_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        message: 'API Key not configured',
        details: 'Add VITE_API_KEY to your .env file'
      };
    }
    
    return {
      success: true,
      message: 'API Key configured',
      details: `Length: ${apiKey.length} characters`
    };
  }

  /**
   * Test URL proxying
   */
  static testProxying(url: string): DiagnosticResult {
    try {
      const proxiedUrl = getProxiedUrl(url);
      const isProxied = proxiedUrl !== url;
      
      return {
        success: isProxied,
        message: isProxied ? 'URL successfully proxied' : 'URL not proxied',
        details: {
          original: url.substring(0, 100),
          proxied: proxiedUrl.substring(0, 100),
          hasToken: proxiedUrl.includes('token=')
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Proxying failed',
        details: error.message
      };
    }
  }

  /**
   * Test stream URL validity
   */
  static testStreamUrl(url: string): DiagnosticResult {
    const isValid = isValidStreamUrl(url);
    const streamType = getStreamType(url);
    
    return {
      success: isValid,
      message: isValid ? 'Valid stream URL' : 'Invalid stream URL',
      details: {
        type: streamType,
        isValid,
        url: url.substring(0, 100)
      }
    };
  }

  /**
   * Test if stream is accessible
   */
  static async testStreamAccess(url: string): Promise<DiagnosticResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      return {
        success: response.ok,
        message: response.ok ? 'Stream accessible' : `HTTP ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type')
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Stream not accessible',
        details: error.message
      };
    }
  }

  /**
   * Run complete diagnostic test
   */
  static async runFullDiagnostic(streamUrl: string): Promise<{
    apiKey: DiagnosticResult;
    urlValidity: DiagnosticResult;
    proxying: DiagnosticResult;
    accessibility: DiagnosticResult;
  }> {
    console.log('🔍 Running stream diagnostics...');
    
    const apiKey = this.testApiKey();
    const urlValidity = this.testStreamUrl(streamUrl);
    const proxying = this.testProxying(streamUrl);
    const proxiedUrl = getProxiedUrl(streamUrl);
    const accessibility = await this.testStreamAccess(proxiedUrl);

    const results = { apiKey, urlValidity, proxying, accessibility };
    
    console.log('📊 Diagnostic Results:', results);
    
    return results;
  }

  /**
   * Format diagnostic results for display
   */
  static formatResults(results: Awaited<ReturnType<typeof StreamDiagnostics.runFullDiagnostic>>): string {
    const lines = [
      '=== Stream Diagnostics Report ===',
      '',
      `API Key: ${results.apiKey.success ? '✅' : '❌'} ${results.apiKey.message}`,
      `URL Validity: ${results.urlValidity.success ? '✅' : '❌'} ${results.urlValidity.message}`,
      `Proxying: ${results.proxying.success ? '✅' : '❌'} ${results.proxying.message}`,
      `Accessibility: ${results.accessibility.success ? '✅' : '❌'} ${results.accessibility.message}`,
      '',
      '=== Details ===',
      JSON.stringify(results, null, 2)
    ];
    
    return lines.join('\n');
  }
}

// Export for console access
if (typeof window !== 'undefined') {
  (window as any).StreamDiagnostics = StreamDiagnostics;
  console.log('💡 Stream diagnostics available: window.StreamDiagnostics');
  console.log('💡 Usage: await StreamDiagnostics.runFullDiagnostic("your_stream_url")');
}
