// src/components/VideoPlayerSecure.tsx - SECURITY ENHANCED
import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2, AlertCircle, RotateCcw } from 'lucide-react';

interface VideoPlayerProps {
  streamUrl: string;
  channelName: string;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
}

const VideoPlayerSecure: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = true,
  className = ""
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<any>(null);
  
  const [playerState, setPlayerState] = useState({
    isPlaying: false,
    isMuted: muted,
    isLoading: true,
    error: null as string | null,
    isFullscreen: false,
  });

  useEffect(() => {
    if (!streamUrl || !videoRef.current) {
      setPlayerState(prev => ({ ...prev, error: 'No stream URL provided', isLoading: false }));
      return;
    }

    initializePlayer();

    return () => {
      destroyPlayer();
    };
  }, [streamUrl]);

  const destroyPlayer = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.load();
    }
  };

  const initializePlayer = async () => {
    const video = videoRef.current;
    if (!video) return;

    destroyPlayer();
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const Hls = (await import('hls.js')).default;
      
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          debug: false, // SECURITY: Disable debug to prevent URL logging
          lowLatencyMode: true,
          maxBufferLength: 10,
          maxMaxBufferLength: 30,
          maxBufferSize: 20 * 1000 * 1000,
          fragLoadingTimeOut: 3000,
          manifestLoadingTimeOut: 3000,
        });

        hlsRef.current = hls;
        
        // SECURITY: Don't log URLs
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.muted = muted;
          if (autoPlay) {
            video.play().catch(() => {});
          }
          setPlayerState(prev => ({ 
            ...prev, 
            isLoading: false, 
            error: null,
            isMuted: video.muted, 
            isPlaying: true,
          }));
        });
        
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setPlayerState(prev => ({ 
              ...prev, 
              isLoading: false, 
              error: 'Playback Error',
            }));
            destroyPlayer();
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.muted = muted;
        if (autoPlay) {
          video.play().catch(() => {});
        }
        setPlayerState(prev => ({ 
          ...prev, 
          isLoading: false, 
          isPlaying: true,
        }));
      } else {
        throw new Error('HLS not supported');
      }
    } catch (error) {
      setPlayerState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Failed to initialize player',
      }));
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setPlayerState(prev => ({ ...prev, isMuted: video.muted }));
    }
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;
    
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error');
    }
  };

  const handleRetry = () => {
    setTimeout(initializePlayer, 500);
  };

  return (
    <div ref={containerRef} className={`relative bg-black w-full h-full ${className}`}>
      <video 
        ref={videoRef} 
        className="w-full h-full object-contain" 
        playsInline 
        controls={false}
        onPlay={() => setPlayerState(prev => ({ ...prev, isPlaying: true }))}
        onPause={() => setPlayerState(prev => ({ ...prev, isPlaying: false }))}
      />
      
      {playerState.isLoading && !playerState.error && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center">
          <div className="text-center text-white">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <div>Loading stream...</div>
          </div>
        </div>
      )}
      
      {playerState.error && (
        <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50">
          <div className="text-center text-white max-w-md">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold mb-2">Playback Error</h3>
            <p className="text-gray-300 mb-4">{playerState.error}</p>
            <button 
              onClick={handleRetry} 
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 mx-auto transition-colors"
            >
              <RotateCcw size={16} />
              Retry
            </button>
          </div>
        </div>
      )}
      
      {!playerState.error && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-3">
            <button 
              onClick={togglePlay}
              className="text-white hover:text-blue-300 transition-colors p-2"
            >
              {playerState.isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            
            <button 
              onClick={toggleMute}
              className="text-white hover:text-blue-300 transition-colors p-2"
            >
              {playerState.isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            
            <div className="flex-1" />
            
            <button 
              onClick={toggleFullscreen}
              className="text-white hover:text-blue-300 transition-colors p-2"
            >
              {playerState.isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayerSecure;
