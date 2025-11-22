// src/components/VideoPlayer.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, VolumeX, Volume2, Maximize, Minimize, Loader2, AlertCircle, RotateCcw, Settings, PictureInPicture2, Subtitles, Rewind, FastForward, ChevronRight, Volume1, Music, Check, ArrowLeft, Share2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import shaka from 'shaka-player/dist/shaka-player.compiled.js';

interface VideoPlayerProps {
  streamUrl: string;
  channelName: string;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
  onError?: () => void;
  onBack?: () => void;
  onShare?: () => void;
}

interface QualityLevel {
  height: number;
  bitrate: number;
  id: number;
}

interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
}

interface AudioTrack {
  id: number;
  label: string;
  language: string;
}

const PLAYER_LOAD_TIMEOUT = 15000;
const CONTROLS_HIDE_DELAY = 4000;

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  streamUrl,
  channelName,
  autoPlay = true,
  muted = true,
  className = "",
  onError,
  onBack,
  onShare
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const hlsRef = useRef<any>(null);
  const shakaPlayerRef = useRef<any>(null);
  const playerTypeRef = useRef<'hls' | 'shaka' | 'native' | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const dragStartRef = useRef<{ isDragging: boolean; } | null>(null);
  const touchStartRef = useRef<{ x: number; time: number; } | null>(null);
  const wasPlayingBeforeSeekRef = useRef(false);
  const seekTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const isMobile = useIsMobile();
  const [isLandscape, setIsLandscape] = useState(false);
  const [volume, setVolume] = useState(100);
  const [expandedSettingItem, setExpandedSettingItem] = useState<string | null>(null);

  const [sheetDragY, setSheetDragY] = useState(0);
  const touchStartYRef = useRef<number | null>(null);
  
  const [playerState, setPlayerState] = useState({
    isPlaying: false,
    isMuted: muted,
    isLoading: true,
    error: null as string | null,
    isFullscreen: false,
    showControls: true,
    currentTime: 0,
    duration: 0,
    startTime: 0, // Added to handle absolute timestamp offsets
    buffered: 0,
    showSettings: false,
    currentQuality: -1, 
    currentQualityHeight: 720,
    availableQualities: [] as QualityLevel[],
    availableSubtitles: [] as SubtitleTrack[],
    availableAudioTracks: [] as AudioTrack[],
    currentSubtitle: '',
    currentAudioTrack: -1,
    isSeeking: false,
    isPipActive: false,
    isLive: false,
  });

  // Helper to calculate accurate time stats (Start, Current, Duration, Live Status)
  const getTimeStats = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return { currentTime: 0, duration: 0, startTime: 0, isLive: false };

    let currentTime = video.currentTime;
    let duration = video.duration;
    let startTime = 0;
    
    // Initial Live check based on Infinity duration
    let isLive = !isFinite(duration);

    // Strategy 1: Shaka Player Seek Range
    if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      try {
        const range = shakaPlayerRef.current.seekRange();
        if (range) {
          startTime = range.start;
          // If we have a finite end > 0, use it as duration (absolute end time)
          if (isFinite(range.end) && range.end > 0) {
            duration = range.end;
            // If we have a fixed range, it's likely VOD (or seekable live treated as VOD for UI)
            isLive = false; 
          }
        }
      } catch (e) { /* ignore */ }
    } 
    // Strategy 2: Native Seekable Range
    else if (video.seekable && video.seekable.length > 0) {
      try {
        startTime = video.seekable.start(0);
        const end = video.seekable.end(video.seekable.length - 1);
        if (isFinite(end) && end > 0) {
          duration = end;
          isLive = false;
        }
      } catch (e) { /* ignore */ }
    }

    // Sanity check: prevent negative start times or NaNs
    if (!isFinite(startTime) || startTime < 0) startTime = 0;
    if (!isFinite(duration) || isNaN(duration)) duration = 0;

    return { currentTime, duration, startTime, isLive };
  }, []);

  const detectStreamType = useCallback((url: string): { type: 'hls' | 'dash' | 'native'; cleanUrl: string; drmInfo?: any } => {
    let cleanUrl = url;
    let drmInfo = null;
    if (url.includes('?|')) {
      const [baseUrl, drmParams] = url.split('?|');
      cleanUrl = baseUrl;
      if (drmParams) {
        const params = new URLSearchParams(drmParams);
        const drmScheme = params.get('drmScheme');
        const drmLicense = params.get('drmLicense');
        const token = params.get('token') || params.get('authToken');
        if (drmScheme && drmLicense) {
          drmInfo = { scheme: drmScheme, license: drmLicense, token };
        } else if (token) {
          drmInfo = { token };
        }
      }
    }
    const urlLower = cleanUrl.toLowerCase();
    if (urlLower.includes('.m3u8') || urlLower.includes('/hls/') || urlLower.includes('hls') || urlLower.includes('/api/m3u8-proxy')) return { type: 'hls', cleanUrl, drmInfo };
    if (urlLower.includes('.mpd') || urlLower.includes('/dash/') || urlLower.includes('dash')) return { type: 'dash', cleanUrl, drmInfo };
    if (urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov')) return { type: 'native', cleanUrl, drmInfo };
    if (urlLower.includes('manifest') || drmInfo) return { type: 'dash', cleanUrl, drmInfo };
    return { type: 'hls', cleanUrl, drmInfo };
  }, []);

  const destroyPlayer = useCallback(() => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (shakaPlayerRef.current) { shakaPlayerRef.current.destroy(); shakaPlayerRef.current = null; }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ''; videoRef.current.load(); }
    if (loadingTimeoutRef.current) { clearTimeout(loadingTimeoutRef.current); }
    playerTypeRef.current = null;
  }, []);

  const updateCurrentQualityHeight = useCallback(() => {
    let height = 720;
    if (playerTypeRef.current === 'hls' && hlsRef.current && hlsRef.current.currentLevel >= 0) {
      const level = hlsRef.current.levels[hlsRef.current.currentLevel];
      height = level?.height || 720;
    } else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      const activeTrack = shakaPlayerRef.current.getVariantTracks().find((t: any) => t.active);
      height = activeTrack?.height || 720;
    }
    setPlayerState(prev => ({ ...prev, currentQualityHeight: height }));
  }, []);

  const initializePlayer = useCallback(async () => {
    if (!streamUrl || !videoRef.current) {
      setPlayerState(prev => ({ ...prev, error: 'No stream URL provided', isLoading: false, showControls: false }));
      return;
    }

    const video = videoRef.current;
    destroyPlayer();
    setPlayerState(prev => ({ ...prev, isLoading: true, error: null, isPlaying: false, showSettings: false, showControls: false }));

    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setPlayerState(prev => ({ ...prev, isLoading: false, error: "Stream took too long to load. Please try again.", showControls: false }));
        if (onError) onError(); 
        destroyPlayer();
      }
    }, PLAYER_LOAD_TIMEOUT);

    try {
      const { type, cleanUrl, drmInfo } = detectStreamType(streamUrl);
      if (type === 'dash') {
        playerTypeRef.current = 'shaka';
        await initShakaPlayer(cleanUrl, video, drmInfo);
      } else if (type === 'hls') {
        playerTypeRef.current = 'hls';
        await initHlsPlayer(cleanUrl, video);
      } else {
        playerTypeRef.current = 'native';
        initNativePlayer(cleanUrl, video);
      }
    } catch (error) {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: error instanceof Error ? error.message : 'Failed to initialize player', showControls: false }));
      if (onError) onError(); 
    }
  }, [streamUrl, autoPlay, muted, destroyPlayer, detectStreamType, onError]);

  const initHlsPlayer = async (url: string, video: HTMLVideoElement) => {
    try {
      const Hls = (await import('hls.js')).default;
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, debug: false, capLevelToPlayerSize: true, maxLoadingDelay: 4, maxBufferLength: 30, maxBufferSize: 60 * 1000 * 1000, fragLoadingTimeOut: 20000, manifestLoadingTimeOut: 10000, startLevel: -1, startPosition: -1, xhrSetup: (xhr: XMLHttpRequest) => { xhr.withCredentials = false; } });
        hlsRef.current = hls;
        
        let retryCount = 0; const maxRetries = 3;
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!isMountedRef.current) return;
          if (data.fatal) {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                if (retryCount < maxRetries) { retryCount++; setTimeout(() => { hls.startLoad(); }, 1000 * retryCount); } 
                else { setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Network error: Unable to load stream', showControls: false })); if (onError) onError(); destroyPlayer(); }
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); }
            else { setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Playback error occurred', showControls: false })); if (onError) onError(); destroyPlayer(); }
          }
        });
        
        hls.loadSource(url); hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!isMountedRef.current) return;
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          const levels: QualityLevel[] = hls.levels.map((level: any, index: number) => ({ height: level.height || 0, bitrate: Math.round(level.bitrate / 1000), id: index }));
          let audioTracks: AudioTrack[] = [];
          if (hls.audioTracks && hls.audioTracks.length > 0) { audioTracks = hls.audioTracks.map((track: any, index: number) => ({ id: index, label: track.name || track.lang || `Audio ${index + 1}`, language: track.lang || 'unknown' })); } else { audioTracks = [{ id: 0, label: 'Default', language: 'und' }]; }
          video.muted = muted;
          if (autoPlay) { video.play().catch(() => { setPlayerState(prev => ({ ...prev, isPlaying: false })); }); }

          const { currentTime, duration, startTime, isLive } = getTimeStats(video);
          
          setPlayerState(prev => ({ ...prev, isLoading: false, error: null, availableQualities: levels, availableAudioTracks: audioTracks, currentQuality: hls.currentLevel, currentAudioTrack: hls.audioTrack || 0, isMuted: video.muted, isPlaying: !video.paused, showControls: true, isLive, currentTime, duration, startTime }));
          updateCurrentQualityHeight(); startControlsTimer();
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, () => { updateCurrentQualityHeight(); });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) { initNativePlayer(url, video); } else { throw new Error('HLS is not supported in this browser'); }
    } catch (error) { if (onError) onError(); throw error; }
  };

  const initShakaPlayer = async (url: string, video: HTMLVideoElement, drmInfo?: any) => {
    try {
      if (shaka.polyfill) shaka.polyfill.installAll();
      const Player = shaka.Player;
      if (!Player || !Player.isBrowserSupported()) throw new Error('This browser is not supported by Shaka Player');
      if (shakaPlayerRef.current) await shakaPlayerRef.current.destroy();
      const player = new Player(video);
      shakaPlayerRef.current = player;
      
      player.configure({ 
        streaming: { bufferingGoal: 15, rebufferingGoal: 8, bufferBehind: 30, retryParameters: { timeout: 8000, maxAttempts: 3, baseDelay: 1000, backoffFactor: 2 }, useNativeHlsOnSafari: true, jumpLargeGaps: true, inbandTextTracks: true },
        manifest: { retryParameters: { timeout: 8000, maxAttempts: 3, baseDelay: 1000, backoffFactor: 2 }, dash: { clockSyncUri: '', ignoreDrmInfo: false, sequenceMode: false, timeShiftBufferDepth: 60 } },
        abr: { enabled: true, defaultBandwidthEstimate: 1500000, bandwidthUpgradeSeconds: 5, bandwidthDowngradeSeconds: 10 },
        drm: { retryParameters: { timeout: 5000, maxAttempts: 2 }, servers: {}, advanced: {} },
        networking: { requestFilter: drmInfo && drmInfo.token ? (type: any, request: any) => { request.headers['Authorization'] = `Bearer ${drmInfo.token}`; } : undefined },
      });

      if (drmInfo) {
         if (drmInfo.scheme === 'clearkey') {
            if (drmInfo.license && drmInfo.license.includes(':')) { const [keyId, key] = drmInfo.license.split(':'); player.configure({ drm: { clearKeys: { [keyId]: key } } }); } 
            else if (drmInfo.token) { player.configure({ drm: { servers: { 'com.widevine.alpha': 'https://your-license-server.com/clearkey' }, advanced: { 'com.widevine.alpha': { requestType: 1, serverCertificate: undefined } } } }); player.getNetworkingEngine().registerRequestFilter((type: any, request: any) => { if (type === shaka.net.NetworkingEngine.RequestType.LICENSE) { request.headers['Authorization'] = `Bearer ${drmInfo.token}`; request.body = JSON.stringify({ kids: [], type: 'temporary' }); } }); }
          } else { if (drmInfo.licenseServer) { player.configure({ drm: { servers: { [drmInfo.scheme]: drmInfo.licenseServer } } }); } }
      }

      const onErrorHandler = (event: any) => {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        const errorCode = event.detail.code;
        let errorMessage = `Stream error occurred`;
        if (errorCode >= 6000 && errorCode < 7000) errorMessage = 'Network error - retrying...';
        else if (errorCode >= 4000 && errorCode < 5000) errorMessage = 'Manifest parse failed';
        else if (errorCode >= 1000 && errorCode < 2000) errorMessage = 'DRM error';
        else if (errorCode === 1003) errorMessage = 'No playable streams';
        setPlayerState(prev => ({ ...prev, isLoading: false, error: errorMessage, showControls: false }));
        if (errorCode >= 6000 && errorCode < 7000) { setTimeout(() => handleRetry(), 2000); } else { if (onError) onError(); }
        destroyPlayer();
      };
      
      player.addEventListener('error', onErrorHandler);
      await player.load(url);
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      
      const tracks = player.getVariantTracks();
      const qualities: QualityLevel[] = tracks.map(track => ({ height: track.height || 0, bitrate: Math.round(track.bandwidth / 1000), id: track.id }));
      const textTracks = player.getTextTracks();
      const subtitles: SubtitleTrack[] = textTracks.map(track => ({ id: track.id.toString(), label: track.label || track.language || 'Unknown', language: track.language || 'unknown' }));
      let audioTracks: AudioTrack[] = [];
      const audioInfos = player.getAudioLanguagesAndRoles();
      if (audioInfos && audioInfos.length > 0) { audioTracks = audioInfos.map((audioInfo: any, index: number) => ({ id: index, label: audioInfo.language || `Audio ${index + 1}`, language: audioInfo.language || 'unknown' })); } else { audioTracks = [{ id: 0, label: 'Default', language: 'und' }]; }
      
      video.muted = muted;
      if (autoPlay) video.play().catch(() => {});

      const { currentTime, duration, startTime, isLive } = getTimeStats(video);
      
      setPlayerState(prev => ({ ...prev, isLoading: false, error: null, availableQualities: qualities, availableSubtitles: subtitles, availableAudioTracks: audioTracks, currentQuality: -1, currentAudioTrack: 0, isMuted: video.muted, isPlaying: true, showControls: true, isLive, currentTime, duration, startTime }));
      updateCurrentQualityHeight(); startControlsTimer();
      return () => player.removeEventListener('error', onErrorHandler);
    } catch (error) { if (onError) onError(); throw error; }
  };

  const initNativePlayer = (url: string, video: HTMLVideoElement) => {
    video.src = url;
    const onLoadedMetadata = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      video.muted = muted;
      if (autoPlay) video.play().catch(console.warn);

      const { currentTime, duration, startTime, isLive } = getTimeStats(video);
      
      setPlayerState(prev => ({ ...prev, isLoading: false, error: null, availableAudioTracks: [{ id: 0, label: 'Default', language: 'und' }], isMuted: video.muted, isPlaying: true, showControls: true, isLive, currentTime, duration, startTime }));
      updateCurrentQualityHeight(); startControlsTimer();
    };
    const onErrorHandler = () => {
      if (!isMountedRef.current) return;
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Failed to load stream with native player', showControls: false }));
      if (onError) onError();
    };
    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    video.addEventListener('error', onErrorHandler, { once: true });
    return () => { video.removeEventListener('loadedmetadata', onLoadedMetadata); video.removeEventListener('error', onErrorHandler); };
  };

  // --- Updated Time Formatting to Handle Relative Time ---
  const formatTime = (time: number): string => {
    if (!isFinite(time) || time < 0) return "0:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const changeQuality = useCallback((qualityId: number) => {
    if (playerTypeRef.current === 'hls' && hlsRef.current) { hlsRef.current.currentLevel = qualityId; } 
    else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      if (qualityId === -1) { shakaPlayerRef.current.configure({ abr: { enabled: true } }); } 
      else { shakaPlayerRef.current.configure({ abr: { enabled: false } }); const tracks = shakaPlayerRef.current.getVariantTracks(); const targetTrack = tracks.find((t: any) => t.id === qualityId); if (targetTrack) shakaPlayerRef.current.selectVariantTrack(targetTrack, true); }
    }
    setPlayerState(prev => ({ ...prev, currentQuality: qualityId, showControls: true, showSettings: false })); setExpandedSettingItem(null); lastActivityRef.current = Date.now();
  }, []);

  const changeSubtitle = useCallback((subtitleId: string) => {
    if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) {
      if (subtitleId === '') { shakaPlayerRef.current.setTextTrackVisibility(false); } 
      else { const tracks = shakaPlayerRef.current.getTextTracks(); const targetTrack = tracks.find((t: any) => t.id.toString() === subtitleId); if (targetTrack) { shakaPlayerRef.current.selectTextTrack(targetTrack); shakaPlayerRef.current.setTextTrackVisibility(true); } }
    }
    setPlayerState(prev => ({ ...prev, currentSubtitle: subtitleId, showControls: true, showSettings: false })); setExpandedSettingItem(null); lastActivityRef.current = Date.now();
  }, []);

  const changeAudioTrack = useCallback((trackId: number) => {
    if (playerTypeRef.current === 'hls' && hlsRef.current) { hlsRef.current.audioTrack = trackId; } 
    else if (playerTypeRef.current === 'shaka' && shakaPlayerRef.current) { const audioLanguages = shakaPlayerRef.current.getAudioLanguagesAndRoles(); if (audioLanguages[trackId]) { shakaPlayerRef.current.selectAudioLanguage(audioLanguages[trackId].language); } }
    setPlayerState(prev => ({ ...prev, currentAudioTrack: trackId, showControls: true, showSettings: false })); setExpandedSettingItem(null); lastActivityRef.current = Date.now();
  }, []);

  const changePlaybackSpeed = useCallback((speed: number) => { if (videoRef.current) { videoRef.current.playbackRate = speed; } setPlayerState(prev => ({ ...prev, showControls: true, showSettings: false })); setExpandedSettingItem(null); lastActivityRef.current = Date.now(); }, []);

  const handleRetry = useCallback(() => { setPlayerState(prev => ({ ...prev, showControls: false })); setTimeout(initializePlayer, 500); }, [initializePlayer]);

  const startControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => { if (isMountedRef.current && playerState.isPlaying && !playerState.showSettings) { setPlayerState(prev => ({ ...prev, showControls: false })); } }, CONTROLS_HIDE_DELAY);
  }, [playerState.isPlaying, playerState.showSettings]);

  const resetControlsTimer = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now();
    if (playerState.isPlaying && !playerState.showSettings && !playerState.isSeeking) { controlsTimeoutRef.current = setTimeout(() => { if (isMountedRef.current) setPlayerState(prev => ({ ...prev, showControls: false })); }, CONTROLS_HIDE_DELAY); }
  }, [playerState.isPlaying, playerState.showSettings, playerState.isSeeking]);

  useEffect(() => {
    isMountedRef.current = true; initializePlayer();
    return () => { isMountedRef.current = false; destroyPlayer(); if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [streamUrl, initializePlayer, destroyPlayer]);

  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    const handlePlay = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPlaying: true })); lastActivityRef.current = Date.now(); };
    const handlePause = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPlaying: false })); lastActivityRef.current = Date.now(); };
    const handleWaiting = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isLoading: true })); };
    const handlePlaying = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isLoading: false, isPlaying: true })); lastActivityRef.current = Date.now(); };
    
    const updateStateWithTime = () => {
        if (!isMountedRef.current || !video) return;
        const buffered = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
        const { currentTime, duration, startTime, isLive } = getTimeStats(video);
        setPlayerState(prev => ({ ...prev, currentTime, duration, startTime, buffered, isLive }));
    };

    const handleTimeUpdate = () => { if (playerState.isSeeking) return; updateStateWithTime(); };
    const handleDurationChange = () => { updateStateWithTime(); };

    const handleVolumeChange = () => { if (!isMountedRef.current || !video) return; setPlayerState(prev => ({ ...prev, isMuted: video.muted })); };
    const handleEnterPip = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPipActive: true })); };
    const handleLeavePip = () => { if (!isMountedRef.current) return; setPlayerState(prev => ({ ...prev, isPipActive: false })); };
    const handleFullscreenChange = () => { if (!isMountedRef.current) return; const isFullscreen = !!document.fullscreenElement; setPlayerState(prev => ({ ...prev, isFullscreen })); if (isFullscreen) resetControlsTimer(); };
    
    video.addEventListener('play', handlePlay); video.addEventListener('pause', handlePause); video.addEventListener('waiting', handleWaiting); video.addEventListener('playing', handlePlaying); 
    video.addEventListener('timeupdate', handleTimeUpdate); video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('volumechange', handleVolumeChange); video.addEventListener('enterpictureinpicture', handleEnterPip); video.addEventListener('leavepictureinpicture', handleLeavePip); document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => { video.removeEventListener('play', handlePlay); video.removeEventListener('pause', handlePause); video.removeEventListener('waiting', handleWaiting); video.removeEventListener('playing', handlePlaying); 
    video.removeEventListener('timeupdate', handleTimeUpdate); video.removeEventListener('durationchange', handleDurationChange);
    video.removeEventListener('volumechange', handleVolumeChange); video.removeEventListener('enterpictureinpicture', handleEnterPip); video.removeEventListener('leavepictureinpicture', handleLeavePip); document.removeEventListener('fullscreenchange', handleFullscreenChange); };
  }, [playerState.isSeeking, resetControlsTimer, getTimeStats]);

  useEffect(() => { if (!playerState.showSettings && playerState.isPlaying && !playerState.isSeeking) { startControlsTimer(); } }, [playerState.showSettings, playerState.isPlaying, playerState.isSeeking, startControlsTimer]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const checkOrientation = () => { clearTimeout(timeout); timeout = setTimeout(() => { const isFS = !!document.fullscreenElement || (screen.orientation?.type?.includes('landscape') && document.visibilityState === 'visible'); if (typeof window !== 'undefined') { const type = screen?.orientation?.type || ''; setIsLandscape(type.includes('landscape') || window.innerWidth > window.innerHeight); } setPlayerState(prev => ({ ...prev, isFullscreen: isFS })); }, 250); };
    checkOrientation(); window.addEventListener('orientationchange', checkOrientation); window.addEventListener('resize', checkOrientation); window.addEventListener('fullscreenchange', checkOrientation);
    return () => { window.removeEventListener('orientationchange', checkOrientation); window.removeEventListener('resize', checkOrientation); window.removeEventListener('fullscreenchange', checkOrientation); clearTimeout(timeout); };
  }, []);

  useEffect(() => { const interval = setInterval(updateCurrentQualityHeight, 2000); return () => clearInterval(interval); }, [updateCurrentQualityHeight]);

  const handleSheetTouchStart = (e: React.TouchEvent) => { touchStartYRef.current = e.touches[0].clientY; setSheetDragY(0); };
  const handleSheetTouchMove = (e: React.TouchEvent) => { if (touchStartYRef.current === null) return; const currentY = e.touches[0].clientY; const deltaY = currentY - touchStartYRef.current; if (deltaY > 0) { setSheetDragY(deltaY); } };
  const handleSheetTouchEnd = () => { if (sheetDragY > 100) { setPlayerState(prev => ({ ...prev, showSettings: false })); setExpandedSettingItem(null); } setSheetDragY(0); touchStartYRef.current = null; };

  // --- Updated Seek Calculations to Respect Start Time ---

  const calculateNewTime = useCallback((clientX: number): number | null => {
    const video = videoRef.current; const progressBar = progressRef.current; 
    if (!video || !progressBar || !isFinite(playerState.duration) || playerState.duration <= 0 || playerState.isLive) return null; 
    const rect = progressBar.getBoundingClientRect(); 
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width)); 
    const percentage = clickX / rect.width; 
    // Calculate new time relative to the duration window (End - Start) + Start
    const relativeDuration = playerState.duration - playerState.startTime;
    return (percentage * relativeDuration) + playerState.startTime;
  }, [playerState.isLive, playerState.duration, playerState.startTime]);

  const throttledUpdate = useCallback((updateFn: () => void) => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(updateFn); }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => { e.stopPropagation(); const video = videoRef.current; if (!video || !isFinite(playerState.duration) || playerState.duration <= 0 || playerState.isLive) return; wasPlayingBeforeSeekRef.current = !video.paused; dragStartRef.current = { isDragging: true }; setPlayerState(prev => ({ ...prev, isSeeking: true, showControls: true })); video.pause(); lastActivityRef.current = Date.now(); }, [playerState.isLive, playerState.duration]);

  const handleDragMove = useCallback((e: MouseEvent) => { if (!dragStartRef.current?.isDragging) return; e.preventDefault(); throttledUpdate(() => { const newTime = calculateNewTime(e.clientX); if (newTime !== null) { setPlayerState(prev => ({ ...prev, currentTime: newTime, showControls: true })); seekTimeRef.current = newTime; } lastActivityRef.current = Date.now(); }); }, [calculateNewTime, throttledUpdate]);

  const handleDragEnd = useCallback(() => { if (!dragStartRef.current?.isDragging) return; const video = videoRef.current; if (video) { video.currentTime = seekTimeRef.current; if (wasPlayingBeforeSeekRef.current) video.play().catch(console.error); } dragStartRef.current = null; setPlayerState(prev => ({ ...prev, isSeeking: false, isPlaying: !video?.paused, showControls: true })); lastActivityRef.current = Date.now(); if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => { const newTime = calculateNewTime(e.clientX); if (newTime !== null && videoRef.current) videoRef.current.currentTime = newTime; setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now(); }, [calculateNewTime]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !isFinite(playerState.duration) || playerState.duration <= 0 || playerState.isLive) return;
    wasPlayingBeforeSeekRef.current = !video.paused;
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;
    const touch = e.touches[0];
    // Calculate initial seek time respecting offset
    const relativeDuration = playerState.duration - playerState.startTime;
    const clickX = touch.clientX - rect.left;
    const percentage = clickX / rect.width;
    const time = (percentage * relativeDuration) + playerState.startTime;
    touchStartRef.current = { x: clickX, time: time };
    setPlayerState(prev => ({ ...prev, isSeeking: true, showControls: true }));
    video.pause();
  }, [playerState.isLive, playerState.duration, playerState.startTime]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    throttledUpdate(() => {
      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect) return;
      const touch = e.touches[0];
      const currentX = touch.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, currentX / rect.width));
      const relativeDuration = playerState.duration - playerState.startTime;
      const newTime = (percentage * relativeDuration) + playerState.startTime;
      setPlayerState(prev => ({ ...prev, currentTime: newTime }));
      seekTimeRef.current = newTime;
    });
  }, [throttledUpdate, playerState.duration, playerState.startTime]);

  const handleTouchEnd = useCallback(() => { if (!touchStartRef.current || !videoRef.current) return; videoRef.current.currentTime = seekTimeRef.current; if (wasPlayingBeforeSeekRef.current) videoRef.current.play().catch(console.error); touchStartRef.current = null; setPlayerState(prev => ({ ...prev, isSeeking: false, isPlaying: !videoRef.current?.paused })); if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const togglePlay = useCallback(() => { const video = videoRef.current; if (!video) return; if (video.paused) { video.play().catch(console.error); } else { video.pause(); } setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now(); }, []);
  const toggleMute = useCallback(() => { const video = videoRef.current; if (video) { video.muted = !video.muted; setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now(); } }, []);
  const handleVolumeChange = useCallback((newVolume: number) => { const video = videoRef.current; if (video) { video.volume = newVolume / 100; video.muted = newVolume === 0; setVolume(newVolume); setPlayerState(prev => ({ ...prev, isMuted: newVolume === 0, showControls: true })); lastActivityRef.current = Date.now(); } }, []);

  const seekBackward = useCallback(() => {
    const video = videoRef.current; if (!video) return;
    if (playerState.isLive && shakaPlayerRef.current) {
      const liveEdge = shakaPlayerRef.current.getPlayheadTimeAsDate();
      if (liveEdge) { const newTime = new Date(liveEdge.getTime() - 10000); shakaPlayerRef.current.seek(newTime); }
    } else { 
        // Respect startTime boundary
        video.currentTime = Math.max(playerState.startTime, video.currentTime - 10); 
    }
    setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now();
  }, [playerState.isLive, playerState.startTime]);

  const seekForward = useCallback(() => {
    const video = videoRef.current; if (!video) return;
    if (playerState.isLive && shakaPlayerRef.current) {
      const liveEdge = shakaPlayerRef.current.getPlayheadTimeAsDate(); const currentTime = shakaPlayerRef.current.getPlayheadTimeAsDate();
      if (liveEdge && currentTime) { const newTime = new Date(Math.min(liveEdge.getTime(), currentTime.getTime() + 10000)); shakaPlayerRef.current.seek(newTime); }
    } else { 
        // Respect duration boundary
        video.currentTime = Math.min(playerState.duration, video.currentTime + 10); 
    }
    setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now();
  }, [playerState.isLive, playerState.duration]);

  const toggleFullscreen = useCallback(async () => { const container = containerRef.current; if (!container) return; try { if (document.fullscreenElement) { await document.exitFullscreen(); if (screen.orientation && 'unlock' in screen.orientation) { try { (screen.orientation as any).unlock(); } catch (e) { } } } else { await container.requestFullscreen(); if (screen.orientation && 'lock' in screen.orientation && isMobile) { try { await (screen.orientation as any).lock('landscape').catch(() => {}); } catch (e) { } } } } catch (error) { } setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now(); }, [isMobile]);
  const togglePip = useCallback(async () => { const video = videoRef.current; if (!video || !document.pictureInPictureEnabled) return; try { if (document.pictureInPictureElement) { await document.exitPictureInPicture(); } else { await video.requestPictureInPicture(); } } catch (error) { } setPlayerState(prev => ({ ...prev, showControls: true })); lastActivityRef.current = Date.now(); }, []);
  const handleMouseMove = useCallback(() => { if (!playerState.showSettings) resetControlsTimer(); }, [playerState.showSettings, resetControlsTimer]);
  const handlePlayerClick = useCallback(() => { if (playerState.showSettings) { setPlayerState(prev => ({ ...prev, showSettings: false })); setExpandedSettingItem(null); } else { if (playerState.showControls) { setPlayerState(prev => ({ ...prev, showControls: false })); if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); } else { resetControlsTimer(); } } }, [playerState.showSettings, playerState.showControls, resetControlsTimer]);
  const handleSettingsToggle = (e: React.MouseEvent) => { e.stopPropagation(); setPlayerState(prev => { const newShowSettings = !prev.showSettings; if (!newShowSettings) { setExpandedSettingItem(null); } return { ...prev, showSettings: newShowSettings, showControls: true }; }); lastActivityRef.current = Date.now(); };
  const handleSettingClick = (setting: string) => { setExpandedSettingItem(expandedSettingItem === setting ? null : setting); };

  const getCurrentQualityLabel = () => { const height = playerState.currentQualityHeight; if (playerState.currentQuality === -1) return `Auto (${height}p)`; const quality = playerState.availableQualities.find(q => q.id === playerState.currentQuality); return quality ? `${quality.height}p` : `${height}p`; };
  const getCurrentAudioLabel = () => { const track = playerState.availableAudioTracks.find(a => a.id === playerState.currentAudioTrack); return track ? track.label : 'Default'; };
  const getCurrentSpeedLabel = () => { const speed = videoRef.current?.playbackRate || 1; return speed === 1 ? 'Normal' : `${speed}x`; };

  useEffect(() => { const handleGlobalMouseMove = (e: MouseEvent) => { if (dragStartRef.current?.isDragging) handleDragMove(e); }; const handleGlobalMouseUp = () => { if (dragStartRef.current?.isDragging) handleDragEnd(); }; document.addEventListener('mousemove', handleGlobalMouseMove); document.addEventListener('mouseup', handleGlobalMouseUp); return () => { document.removeEventListener('mousemove', handleGlobalMouseMove); document.removeEventListener('mouseup', handleGlobalMouseUp); }; }, [handleDragMove, handleDragEnd]);
  useEffect(() => { const handleGlobalTouchEnd = () => { if (touchStartRef.current) handleTouchEnd(); }; document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false }); return () => document.removeEventListener('touchend', handleGlobalTouchEnd); }, [handleTouchEnd]);

  // --- Relative Time Calculation for UI ---
  const getRelativeTime = () => {
      return Math.max(0, playerState.currentTime - playerState.startTime);
  };
  
  const getRelativeDuration = () => {
      return Math.max(0, playerState.duration - playerState.startTime);
  };

  // Calculate percentage based on relative values
  const relativeCurrent = getRelativeTime();
  const relativeDur = getRelativeDuration();
  
  const currentTimePercentage = (isFinite(relativeDur) && relativeDur > 0 && !playerState.isLive) 
    ? (relativeCurrent / relativeDur) * 100 
    : (playerState.isLive ? 100 : 0);

  const getControlSizes = () => {
    const isTablet = isMobile && window.innerWidth > 768;
    const isFullscreenLandscape = playerState.isFullscreen && isLandscape;
    const isMobileLandscape = isMobile && !isTablet && isLandscape;
    const isMobilePortrait = isMobile && !isTablet && !isLandscape;
    
    if (isFullscreenLandscape) { return { iconSmall: 28, iconMedium: 32, iconLarge: 36, centerButtonClass: 'w-24 h-24', centerIcon: 40, paddingClass: 'p-4', gapClass: 'gap-4', textClass: 'text-lg', progressBarClass: 'h-2', progressThumbClass: 'w-5 h-5', progressInsetClass: 'left-2.5 right-2.5', containerPaddingClass: 'p-6' }; }
    if (isMobileLandscape) { return { iconSmall: 22, iconMedium: 26, iconLarge: 28, centerButtonClass: 'w-20 h-20', centerIcon: 32, paddingClass: 'p-3', gapClass: 'gap-2', textClass: 'text-base', progressBarClass: 'h-1.5', progressThumbClass: 'w-4 h-4', progressInsetClass: 'left-2 right-2', containerPaddingClass: 'p-4' }; }
    if (isMobilePortrait) { return { iconSmall: 18, iconMedium: 22, iconLarge: 24, centerButtonClass: 'w-16 h-16', centerIcon: 28, paddingClass: 'p-2', gapClass: 'gap-2', textClass: 'text-sm', progressBarClass: 'h-1', progressThumbClass: 'w-3 h-3', progressInsetClass: 'left-1.5 right-1.5', containerPaddingClass: 'p-3' }; }
    if (isTablet) { return { iconSmall: 22, iconMedium: 26, iconLarge: 28, centerButtonClass: 'w-20 h-20', centerIcon: 32, paddingClass: 'p-3', gapClass: 'gap-3', textClass: 'text-base', progressBarClass: 'h-1.5', progressThumbClass: 'w-4 h-4', progressInsetClass: 'left-2 right-2', containerPaddingClass: 'p-4' }; }
    return { iconSmall: 20, iconMedium: 24, iconLarge: 26, centerButtonClass: 'w-16 h-16', centerIcon: 28, paddingClass: 'p-2', gapClass: 'gap-3', textClass: 'text-sm', progressBarClass: 'h-1', progressThumbClass: 'w-3 h-3', progressInsetClass: 'left-1.5 right-1.5', containerPaddingClass: 'p-4' };
  };

  const sizes = getControlSizes();

  return (
    <div ref={containerRef} className={`relative bg-black w-full h-full ${className}`} onMouseMove={handleMouseMove} onClick={handlePlayerClick}>
      <video ref={videoRef} className="w-full h-full object-contain" playsInline controls={false} />
      
      {playerState.isLoading && !playerState.error && ( <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center"> <div className="text-center text-white"> <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" /> <div className={`${sizes.textClass}`}>Loading stream...</div> </div> </div> )}
      {playerState.error && ( <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50"> <div className="text-center text-white max-w-md w-full"> <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" /> <h3 className="text-lg font-semibold mb-2">Playback Error</h3> <p className={`text-gray-300 mb-6 ${sizes.textClass}`}>{playerState.error}</p> <div className="flex items-center justify-center gap-3"> {onBack && ( <button onClick={onBack} className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors"> <ArrowLeft size={16} /> Back </button> )} <button onClick={handleRetry} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors"> <RotateCcw size={16} /> Retry </button> </div> </div> </div> )}
      
      {!playerState.error && (
        <div className={`absolute inset-0 transition-opacity duration-300 ${playerState.showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-20 flex justify-between items-start">
            {onBack && ( <button onClick={(e) => { e.stopPropagation(); onBack(); }} className="text-white hover:text-accent transition-colors p-2 rounded-full bg-black/20 backdrop-blur-sm hover:bg-black/40" title="Go Back"> <ArrowLeft size={sizes.iconMedium} /> </button> )}
            <div className="flex items-center gap-2 ml-auto"> {onShare && ( <button onClick={(e) => { e.stopPropagation(); onShare(); }} className="text-white hover:text-accent transition-colors p-2 rounded-full bg-black/20 backdrop-blur-sm hover:bg-black/40" title="Share"> <Share2 size={sizes.iconMedium} /> </button> )} {isMobile && ( <button onClick={handleSettingsToggle} className="text-white hover:text-accent transition-colors p-2 rounded-full bg-black/20 backdrop-blur-sm hover:bg-black/40" data-testid="button-settings-mobile"> <Settings size={sizes.iconMedium} /> </button> )} </div>
          </div>

          {!playerState.isLoading && ( <div className="absolute inset-0 flex items-center justify-center pointer-events-none"> <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className={`${sizes.centerButtonClass} bg-white bg-opacity-20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-opacity-30 transition-all pointer-events-auto transform hover:scale-105`} data-testid="button-play-pause-center"> {playerState.isPlaying ? ( <Pause size={sizes.centerIcon} fill="white" /> ) : ( <Play size={sizes.centerIcon} fill="white" className="ml-1" /> )} </button> </div> )}
          
          <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent ${sizes.containerPaddingClass} flex flex-col`} style={{ maxHeight: isMobile ? '35%' : '30%' }}>
            <div className="mb-2 md:mb-3 flex-shrink-0">
              <div ref={progressRef} className="relative h-2 py-2 -my-2 bg-transparent cursor-pointer group" onClick={handleProgressClick} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                <div className={`absolute ${sizes.progressInsetClass} top-1/2 -translate-y-1/2 ${sizes.progressBarClass} bg-white/30 rounded-full overflow-hidden`}> <div className="absolute top-0 left-0 h-full bg-white/50 rounded-full transition-all duration-200" style={{ width: isFinite(playerState.duration) && playerState.duration > 0 ? `${(playerState.buffered / playerState.duration) * 100}%` : '0%' }}/> <div className="absolute top-0 left-0 h-full bg-red-600 rounded-full" style={{ width: `${currentTimePercentage}%` }}/> </div>
                <div className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${sizes.progressThumbClass} rounded-full bg-red-600 shadow-md transition-all duration-150 ease-out group-hover:scale-150`} style={{ left: `${currentTimePercentage}%` }} onMouseDown={handleDragStart} onClick={(e) => e.stopPropagation()} onTouchStart={handleTouchStart}/>
              </div>
            </div>
            
            <div className={`flex items-center ${sizes.gapClass} flex-nowrap flex-1 min-h-[40px]`}>
              {!isMobile && (
                <div className={`flex items-center ${sizes.gapClass} flex-1 min-w-0 flex-wrap`}>
                  <div className="flex items-center gap-2 flex-shrink-0"> <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass}`} data-testid="button-volume"> {playerState.isMuted ? <VolumeX size={sizes.iconSmall} /> : volume > 50 ? <Volume2 size={sizes.iconSmall} /> : <Volume1 size={sizes.iconSmall} />} </button> <input type="range" min="0" max="100" value={volume} onChange={(e) => handleVolumeChange(Number(e.target.value))} className="w-20 flex-shrink-0 volume-slider-horizontal accent-red-600" data-testid="slider-volume" onClick={(e) => e.stopPropagation()} /> </div>
                  
                  {/* Display Time using Relative Values */}
                  <div className={`text-white ${sizes.textClass} whitespace-nowrap flex-shrink-0 mx-2 font-medium`} data-testid="text-time"> 
                    {playerState.isLive ? ( 
                        <span className="flex items-center gap-2"> <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"/> LIVE </span> 
                    ) : ( 
                        <>{formatTime(relativeCurrent)} / {formatTime(relativeDur)}</> 
                    )} 
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0"> <button onClick={(e) => { e.stopPropagation(); seekBackward(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} title="Seek backward 10s" data-testid="button-rewind"> <Rewind size={sizes.iconSmall} /> </button> <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} data-testid="button-play-pause"> {playerState.isPlaying ? <Pause size={sizes.iconMedium} /> : <Play size={sizes.iconMedium} />} </button> <button onClick={(e) => { e.stopPropagation(); seekForward(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} title="Seek forward 10s" data-testid="button-forward"> <FastForward size={sizes.iconSmall} /> </button> </div>
                  <div className="flex-1 min-w-4"></div>
                  <div className="flex items-center gap-1 flex-shrink-0"> {document.pictureInPictureEnabled && ( <button onClick={(e) => { e.stopPropagation(); togglePip(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} title="Picture-in-picture" data-testid="button-pip"> <PictureInPicture2 size={sizes.iconSmall} /> </button> )} <button onClick={handleSettingsToggle} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} title="Settings" data-testid="button-settings"> <Settings size={sizes.iconSmall} /> </button> <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} title="Fullscreen" data-testid="button-fullscreen"> {playerState.isFullscreen ? <Minimize size={sizes.iconSmall} /> : <Maximize size={sizes.iconSmall} />} </button> </div>
                </div>
              )}
              
              {isMobile && (
                <div className={`flex items-center ${sizes.gapClass} flex-1 min-w-0 flex-nowrap justify-between`}>
                  <div className={`flex items-center ${sizes.gapClass} flex-shrink-0`}> 
                    <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} data-testid="button-volume-mobile"> {playerState.isMuted ? <VolumeX size={sizes.iconSmall} /> : <Volume2 size={sizes.iconSmall} />} </button> 
                    {/* Mobile Time Display */}
                    <div className={`text-white ${sizes.textClass} whitespace-nowrap flex-shrink-0 mx-1 font-medium`} data-testid="text-time-mobile"> 
                        {playerState.isLive ? ( <span className="flex items-center gap-1.5 text-red-500 font-bold"> <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/> LIVE </span> ) : ( <>{formatTime(relativeCurrent)} / {formatTime(relativeDur)}</> )} 
                    </div> 
                  </div>
                  <div className={`flex items-center ${sizes.gapClass} flex-shrink-0`}> <button onClick={(e) => { e.stopPropagation(); seekBackward(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} data-testid="button-rewind-mobile"> <Rewind size={sizes.iconSmall} /> </button> <button onClick={(e) => { e.stopPropagation(); seekForward(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} data-testid="button-forward-mobile"> <FastForward size={sizes.iconSmall} /> </button> </div>
                  <div className={`flex items-center ${sizes.gapClass} flex-shrink-0`}> {document.pictureInPictureEnabled && ( <button onClick={(e) => { e.stopPropagation(); togglePip(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} title="Picture-in-picture" data-testid="button-pip-mobile"> <PictureInPicture2 size={sizes.iconSmall} /> </button> )} <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }} className={`text-white hover:text-accent transition-colors ${sizes.paddingClass} flex-shrink-0`} data-testid="button-fullscreen-mobile"> {playerState.isFullscreen ? <Minimize size={sizes.iconSmall} /> : <Maximize size={sizes.iconSmall} />} </button> </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Menus (Desktop & Mobile) */}
      {playerState.showSettings && !isMobile && !playerState.error && (
        <>
          <div className="absolute inset-0 bg-black/40 z-40" onClick={handleSettingsToggle} />
          <div className="absolute z-50 bg-black/90 backdrop-blur-md rounded-lg bottom-20 right-4 w-[280px]" onClick={(e) => e.stopPropagation()}>
            <div className="py-2">
              {!expandedSettingItem ? (
                <>
                  {playerState.availableQualities.length > 0 && ( <button onClick={() => handleSettingClick('quality')} className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"> <div className="flex items-center gap-3"> <Settings size={18} /> <span className="text-sm">Quality</span> </div> <div className="flex items-center gap-2"> <span className="text-xs text-white/70">{getCurrentQualityLabel()}</span> <ChevronRight size={16} className="text-white/70" /> </div> </button> )}
                  <button onClick={() => handleSettingClick('speed')} className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"> <div className="flex items-center gap-3"> <Play size={18} /> <span className="text-sm">Playback speed</span> </div> <div className="flex items-center gap-2"> <span className="text-xs text-white/70">{getCurrentSpeedLabel()}</span> <ChevronRight size={16} className="text-white/70" /> </div> </button>
                  <button onClick={() => handleSettingClick('more')} className="w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 transition-colors"> <div className="flex items-center gap-3"> <Settings size={18} /> <span className="text-sm">More</span> </div> <ChevronRight size={16} className="text-white/70" /> </button>
                </>
              ) : expandedSettingItem === 'quality' ? (
                <div> <button onClick={() => setExpandedSettingItem(null)} className="w-full flex items-center gap-3 px-4 py-3 text-white"> <ChevronRight size={18} className="rotate-180" /> <span className="text-sm">Quality</span> </button> <button onClick={() => { changeQuality(-1); }} className={`w-full text-left px-12 py-2 text-sm text-white transition-colors flex items-center justify-between ${playerState.currentQuality === -1 ? 'bg-white/20' : 'hover:bg-white/10'}`}> <span>Auto</span> {playerState.currentQuality === -1 && <Check size={16} className="text-green-500 ml-auto" />} </button> {playerState.availableQualities.map((quality) => ( <button key={quality.id} onClick={() => { changeQuality(quality.id); }} className={`w-full text-left px-12 py-2 text-sm text-white transition-colors flex items-center justify-between ${playerState.currentQuality === quality.id ? 'bg-white/20' : 'hover:bg-white/10'}`}> <span>{quality.height}p</span> {playerState.currentQuality === quality.id && <Check size={16} className="text-green-500 ml-auto" />} </button> ))} </div>
              ) : expandedSettingItem === 'speed' ? (
                <div> <button onClick={() => setExpandedSettingItem(null)} className="w-full flex items-center gap-3 px-4 py-3 text-white"> <ChevronRight size={18} className="rotate-180" /> <span className="text-sm">Playback speed</span> </button> {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => ( <button key={speed} onClick={() => { changePlaybackSpeed(speed); }} className={`w-full text-left px-12 py-2 text-sm text-white transition-colors flex items-center justify-between ${videoRef.current?.playbackRate === speed ? 'bg-white/20' : 'hover:bg-white/10'}`}> <span>{speed === 1 ? 'Normal' : `${speed}x`}</span> {videoRef.current?.playbackRate === speed && <Check size={16} className="text-green-500 ml-auto" />} </button> ))} </div>
              ) : expandedSettingItem === 'more' ? (
                <div> <button onClick={() => setExpandedSettingItem(null)} className="w-full flex items-center gap-3 px-4 py-3 text-white"> <ChevronRight size={18} className="rotate-180" /> <span className="text-sm">More</span> </button> {playerState.availableSubtitles.length > 0 && ( <button onClick={() => handleSettingClick('captions')} className="w-full flex items-center justify-between px-12 py-2 text-sm text-white hover:bg-white/10 transition-colors"> <div className="flex items-center gap-3"> <Subtitles size={16} /> <span>Captions</span> </div> <ChevronRight size={14} className="text-white/70" /> </button> )} <button onClick={() => handleSettingClick('audio')} className="w-full flex items-center justify-between px-12 py-2 text-sm text-white hover:bg-white/10 transition-colors"> <div className="flex items-center gap-3"> <Music size={16} /> <span>Audio</span> </div> <ChevronRight size={14} className="text-white/70" /> </button> </div>
              ) : expandedSettingItem === 'captions' ? (
                <div> <button onClick={() => handleSettingClick('more')} className="w-full flex items-center gap-3 px-4 py-3 text-white"> <ChevronRight size={18} className="rotate-180" /> <span className="text-sm">Captions</span> </button> <button onClick={() => { changeSubtitle(''); }} className={`w-full text-left px-12 py-2 text-sm text-white transition-colors flex items-center justify-between ${playerState.currentSubtitle === '' ? 'bg-white/20' : 'hover:bg-white/10'}`}> <span>Off</span> {playerState.currentSubtitle === '' && <Check size={16} className="text-green-500 ml-auto" />} </button> {playerState.availableSubtitles.map((subtitle) => ( <button key={subtitle.id} onClick={() => { changeSubtitle(subtitle.id); }} className={`w-full text-left px-12 py-2 text-sm text-white transition-colors flex items-center justify-between ${playerState.currentSubtitle === subtitle.id ? 'bg-white/20' : 'hover:bg-white/10'}`}> <span>{subtitle.label}</span> {playerState.currentSubtitle === subtitle.id && <Check size={16} className="text-green-500 ml-auto" />} </button> ))} </div>
              ) : expandedSettingItem === 'audio' ? (
                <div> <button onClick={() => handleSettingClick('more')} className="w-full flex items-center gap-3 px-4 py-3 text-white"> <ChevronRight size={18} className="rotate-180" /> <span className="text-sm">Audio</span> </button> {playerState.availableAudioTracks.length > 0 ? ( playerState.availableAudioTracks.map((audioTrack) => ( <button key={audioTrack.id} onClick={() => { changeAudioTrack(audioTrack.id); }} className={`w-full text-left px-12 py-2 text-sm text-white transition-colors flex items-center justify-between ${playerState.currentAudioTrack === audioTrack.id ? 'bg-white/20' : 'hover:bg-white/10'}`}> <span>{audioTrack.label}</span> {playerState.currentAudioTrack === audioTrack.id && <Check size={16} className="text-green-500 ml-auto" />} </button> )) ) : ( <div className="px-12 py-2 text-xs text-white/50"> No audio tracks available </div> )} </div>
              ) : null}
            </div>
          </div>
        </>
      )}
      
      {/* Mobile Settings Sheet */}
      {playerState.showSettings && isMobile && !playerState.error && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" style={{ backgroundColor: 'rgba(15, 15, 15, 0.92)' }} onClick={handleSettingsToggle} />
          <div className="fixed z-50 bg-[#212121] bottom-0 left-0 right-0 rounded-t-[18px]" onClick={(e) => e.stopPropagation()} onTouchStart={handleSheetTouchStart} onTouchMove={handleSheetTouchMove} onTouchEnd={handleSheetTouchEnd} style={{ transform: `translateY(${sheetDragY}px)`, maxHeight: '70vh' }}>
            <div className="flex justify-center pt-3 pb-2"> <div className="w-10 h-1 bg-white/30 rounded-full" /> </div>
            <div className="overflow-y-auto pb-4" style={{ maxHeight: '60vh' }}>
              {!expandedSettingItem ? (
                <div className="px-4">
                  {playerState.availableQualities.length > 0 && ( <button onClick={() => handleSettingClick('quality')} className="w-full flex items-center justify-between py-4 text-white border-b border-white/10"> <span className="text-base">Quality</span> <div className="flex items-center gap-2"> <span className="text-sm text-white/60">{getCurrentQualityLabel()}</span> <ChevronRight size={16} /> </div> </button> )}
                  <button onClick={() => handleSettingClick('speed')} className="w-full flex items-center justify-between py-4 text-white border-b border-white/10"> <span className="text-base">Playback Speed</span> <div className="flex items-center gap-2"> <span className="text-sm text-white/60">{getCurrentSpeedLabel()}</span> <ChevronRight size={16} /> </div> </button>
                  {playerState.availableSubtitles.length > 0 && ( <button onClick={() => handleSettingClick('captions')} className="w-full flex items-center justify-between py-4 text-white border-b border-white/10"> <span className="text-base">Subtitles</span> <div className="flex items-center gap-2"> <span className="text-sm text-white/60"> {playerState.currentSubtitle === '' ? 'Off' : playerState.availableSubtitles.find(s => s.id === playerState.currentSubtitle)?.label || 'Off'} </span> <ChevronRight size={16} /> </div> </button> )}
                  <button onClick={() => handleSettingClick('audio')} className="w-full flex items-center justify-between py-4 text-white"> <span className="text-base">Audio</span> <div className="flex items-center gap-2"> <span className="text-sm text-white/60">{getCurrentAudioLabel()}</span> <ChevronRight size={16} /> </div> </button>
                </div>
              ) : expandedSettingItem === 'quality' ? (
                <div className="px-4"> <button onClick={() => setExpandedSettingItem(null)} className="w-full flex items-center gap-3 py-3 text-white mb-2"> <ChevronRight size={18} className="rotate-180" /> Back </button> <button onClick={() => { changeQuality(-1); }} className="w-full flex items-center justify-between py-3 text-white"> <span>Auto</span> {playerState.currentQuality === -1 && <Check size={16} className="text-green-500" />} </button> {playerState.availableQualities.map((quality) => ( <button key={quality.id} onClick={() => { changeQuality(quality.id); }} className="w-full flex items-center justify-between py-3 text-white"> <span>{quality.height}p</span> {playerState.currentQuality === quality.id && <Check size={16} className="text-green-500" />} </button> ))} </div>
              ) : expandedSettingItem === 'speed' ? (
                <div className="px-4"> <button onClick={() => setExpandedSettingItem(null)} className="w-full flex items-center gap-3 py-3 text-white mb-2"> <ChevronRight size={18} className="rotate-180" /> Back </button> {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => ( <button key={speed} onClick={() => { changePlaybackSpeed(speed); }} className="w-full flex items-center justify-between py-3 text-white"> <span>{speed}x</span> {videoRef.current?.playbackRate === speed && <Check size={16} className="text-green-500" />} </button> ))} </div>
              ) : expandedSettingItem === 'captions' ? (
                <div className="px-4"> <button onClick={() => setExpandedSettingItem(null)} className="w-full flex items-center gap-3 py-3 text-white mb-2"> <ChevronRight size={18} className="rotate-180" /> Back </button> <button onClick={() => { changeSubtitle(''); }} className="w-full flex items-center justify-between py-3 text-white"> <span>Off</span> {playerState.currentSubtitle === '' && <Check size={16} className="text-green-500" />} </button> {playerState.availableSubtitles.map((subtitle) => ( <button key={subtitle.id} onClick={() => { changeSubtitle(subtitle.id); }} className="w-full flex items-center justify-between py-3 text-white"> <span>{subtitle.label}</span> {playerState.currentSubtitle === subtitle.id && <Check size={16} className="text-green-500" />} </button> ))} </div>
              ) : expandedSettingItem === 'audio' ? (
                <div className="px-4"> <button onClick={() => setExpandedSettingItem(null)} className="w-full flex items-center gap-3 py-3 text-white mb-2"> <ChevronRight size={18} className="rotate-180" /> Back </button> {playerState.availableAudioTracks.length > 0 ? ( playerState.availableAudioTracks.map((audioTrack) => ( <button key={audioTrack.id} onClick={() => { changeAudioTrack(audioTrack.id); }} className="w-full flex items-center justify-between py-3 text-white"> <span>{audioTrack.label}</span> {playerState.currentAudioTrack === audioTrack.id && <Check size={16} className="text-green-500" />} </button> )) ) : ( <div className="py-3 text-white/50 text-sm"> No audio tracks available </div> )} </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VideoPlayer;
