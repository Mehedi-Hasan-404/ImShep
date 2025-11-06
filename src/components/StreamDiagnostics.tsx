// Add this diagnostic component to help debug streaming issues
// Place in src/components/StreamDiagnostics.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { getProxiedUrl } from '@/lib/urlEncryption';

interface StreamDiagnosticsProps {
  streamUrl: string;
  channelName: string;
}

interface DiagnosticResult {
  step: string;
  status: 'pending' | 'success' | 'error' | 'warning';
  message: string;
  details?: string;
}

export const StreamDiagnostics: React.FC<StreamDiagnosticsProps> = ({ streamUrl, channelName }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setResults([]);
    
    const addResult = (result: DiagnosticResult) => {
      setResults(prev => [...prev, result]);
    };

    // Step 1: Check URL format
    addResult({
      step: 'URL Format',
      status: 'pending',
      message: 'Checking stream URL format...'
    });

    if (!streamUrl || streamUrl.trim() === '') {
      addResult({
        step: 'URL Format',
        status: 'error',
        message: 'Stream URL is empty',
        details: 'No stream URL provided'
      });
      setIsRunning(false);
      return;
    }

    const isM3U8 = streamUrl.toLowerCase().includes('.m3u8');
    addResult({
      step: 'URL Format',
      status: isM3U8 ? 'success' : 'warning',
      message: isM3U8 ? 'Valid M3U8 URL detected' : 'Not an M3U8 URL',
      details: streamUrl
    });

    // Step 2: Check proxy URL generation
    addResult({
      step: 'Proxy URL',
      status: 'pending',
      message: 'Generating proxied URL...'
    });

    try {
      const proxiedUrl = getProxiedUrl(streamUrl);
      const hasApiKey = proxiedUrl.includes('apiKey=');
      
      addResult({
        step: 'Proxy URL',
        status: hasApiKey ? 'success' : 'error',
        message: hasApiKey ? 'Proxied URL generated with API key' : 'API key missing from proxied URL',
        details: proxiedUrl
      });

      // Step 3: Test proxy endpoint
      if (hasApiKey) {
        addResult({
          step: 'Proxy Connection',
          status: 'pending',
          message: 'Testing proxy endpoint...'
        });

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(proxiedUrl, {
            method: 'GET',
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const contentType = response.headers.get('content-type') || '';
            const isPlaylist = contentType.includes('mpegurl') || contentType.includes('m3u');
            
            addResult({
              step: 'Proxy Connection',
              status: 'success',
              message: `Proxy returned HTTP ${response.status}`,
              details: `Content-Type: ${contentType}`
            });

            // Step 4: Check playlist content
            if (isPlaylist) {
              addResult({
                step: 'Playlist Content',
                status: 'pending',
                message: 'Checking playlist content...'
              });

              const text = await response.text();
              const hasExtM3U = text.includes('#EXTM3U');
              const hasSegments = text.includes('.ts') || text.includes('.m3u8');

              addResult({
                step: 'Playlist Content',
                status: hasExtM3U && hasSegments ? 'success' : 'warning',
                message: hasExtM3U && hasSegments ? 'Valid M3U8 playlist' : 'Playlist may be incomplete',
                details: `Lines: ${text.split('\n').length}, Has #EXTM3U: ${hasExtM3U}, Has segments: ${hasSegments}`
              });
            }
          } else {
            addResult({
              step: 'Proxy Connection',
              status: 'error',
              message: `Proxy returned HTTP ${response.status}`,
              details: await response.text()
            });
          }
        } catch (error: any) {
          addResult({
            step: 'Proxy Connection',
            status: 'error',
            message: 'Failed to connect to proxy',
            details: error.message
          });
        }
      }

      // Step 5: Check HLS.js support
      addResult({
        step: 'HLS.js Support',
        status: 'pending',
        message: 'Checking HLS.js support...'
      });

      try {
        const Hls = (await import('hls.js')).default;
        const isSupported = Hls.isSupported();
        
        addResult({
          step: 'HLS.js Support',
          status: isSupported ? 'success' : 'error',
          message: isSupported ? 'HLS.js is supported' : 'HLS.js is not supported in this browser',
          details: `MediaSource API: ${window.MediaSource ? 'Available' : 'Not available'}`
        });
      } catch (error: any) {
        addResult({
          step: 'HLS.js Support',
          status: 'error',
          message: 'Failed to load HLS.js',
          details: error.message
        });
      }

    } catch (error: any) {
      addResult({
        step: 'Proxy URL',
        status: 'error',
        message: 'Failed to generate proxied URL',
        details: error.message
      });
    }

    setIsRunning(false);
  };

  const getStatusIcon = (status: DiagnosticResult['status']) => {
    switch (status) {
      case 'pending':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border">
      <div>
        <h3 className="text-lg font-semibold mb-2">Stream Diagnostics</h3>
        <p className="text-sm text-muted-foreground">
          Testing stream: {channelName}
        </p>
      </div>

      <Button onClick={runDiagnostics} disabled={isRunning}>
        {isRunning ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Running Diagnostics...
          </>
        ) : (
          'Run Diagnostics'
        )}
      </Button>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((result, index) => (
            <Alert key={index} variant={result.status === 'error' ? 'destructive' : 'default'}>
              <div className="flex items-start gap-2">
                {getStatusIcon(result.status)}
                <div className="flex-1">
                  <div className="font-medium">{result.step}</div>
                  <AlertDescription>
                    {result.message}
                    {result.details && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs">Details</summary>
                        <pre className="mt-1 text-xs bg-black/10 p-2 rounded overflow-x-auto">
                          {result.details}
                        </pre>
                      </details>
                    )}
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
};
