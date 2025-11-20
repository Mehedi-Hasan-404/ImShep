// src/pages/ChannelPlayer.tsx - SECURE VERSION WITH TOKENS

import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import VideoPlayer from '@/components/VideoPlayer';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Star, Share2, AlertCircle } from 'lucide-react';
import { useFavorites } from '@/contexts/FavoritesContext';
import { toast } from "@/components/ui/sonner";
import ErrorBoundary from '@/components/ErrorBoundary';
import { streamService } from '@/services/streamService';
import { PublicChannel } from '@/types';

interface ChannelPlayerProps {
  channelId: string;
}

const ChannelPlayer = ({ channelId }: ChannelPlayerProps) => {
  const [, setLocation] = useLocation();
  const [channel, setChannel] = useState<PublicChannel | null>(null);
  const [secureStreamUrl, setSecureStreamUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topRef = useRef<HTMLDivElement>(null);
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();

  // Scroll to top when channel changes
  useEffect(() => {
    if (channel && topRef.current) {
      topRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
      window.scrollTo({ 
        top: 0, 
        behavior: 'smooth' 
      });
    }
  }, [channel?.id]);

  useEffect(() => {
    if (channelId) {
      fetchChannelAndToken();
    } else {
      setError('No channel ID provided in URL');
      setLoading(false);
    }
  }, [channelId]);

  const fetchChannelAndToken = async () => {
    try {
      setLoading(true);
      setError(null);
      setChannel(null);
      setSecureStreamUrl('');

      if (!channelId) {
        setError('Channel ID is required');
        return;
      }

      const decodedChannelId = decodeURIComponent(channelId);

      // Fetch channel metadata from backend API
      // This API should return channel info WITHOUT stream URLs
      const response = await fetch(`/api/get-channel-metadata?channelId=${encodeURIComponent(decodedChannelId)}`);
      
      if (!response.ok) {
        throw new Error('Channel not found');
      }

      const channelData = await response.json();
      
      if (!channelData) {
        setLoading(false);
        setLocation('/404');
        return;
      }

      // Set channel data (no streamUrl included)
      const channelInfo: PublicChannel = {
        id: channelData.id,
        name: channelData.name,
        logoUrl: channelData.logoUrl,
        categoryId: channelData.categoryId,
        categoryName: channelData.categoryName,
      };

      setChannel(channelInfo);

      // Get secure stream URL with token
      try {
        const url = await streamService.getSecureStreamUrl(decodedChannelId);
        setSecureStreamUrl(url);
      } catch (tokenError) {
        setError('Failed to get stream access. Please try again.');
        return;
      }

    } catch (error) {
      setError('Failed to load channel');
    } finally {
      setLoading(false);
    }
  };

  const handleFavoriteToggle = () => {
    if (!channel) return;
    try {
      if (isFavorite(channel.id)) {
        removeFavorite(channel.id);
        toast.info(`${channel.name} removed from favorites`);
      } else {
        addFavorite(channel);
        toast.success(`${channel.name} added to favorites!`);
      }
    } catch (error) {
      console.error('Error toggling favorite');
      toast.error("Failed to update favorites");
    }
  };

  const handleShare = async () => {
    if (!channel) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: channel.name,
          text: `Watch ${channel.name} on Live TV Pro`,
          url: window.location.href,
        });
      } catch (error) {
        // User cancelled or error
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Link copied to clipboard!");
      } catch (error) {
        toast.error("Failed to copy link");
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="aspect-video w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
    );
  }

  if (error || !channel || !secureStreamUrl) {
    const displayError = error || 'Channel not found or stream unavailable.';
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <Button 
          variant="ghost" 
          onClick={() => window.history.back()}
          className="mb-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Go Back
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{displayError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isChannelFavorite = isFavorite(channel.id);

  return (
    <ErrorBoundary>
      <div ref={topRef} className="space-y-6 p-4 sm:p-6">
        {/* Back Button and Actions */}
        <div className="flex items-center justify-between -mt-2">
          <Button 
            variant="ghost" 
            onClick={() => window.history.back()}
            className="flex items-center gap-2 pl-0"
          >
            <ArrowLeft size={18} />
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFavoriteToggle}
              className={`transition-all duration-300 ${isChannelFavorite ? 'text-yellow-500 border-yellow-500/50 bg-yellow-500/10' : ''}`}
            >
              <Star 
                size={16} 
                fill={isChannelFavorite ? 'currentColor' : 'none'} 
                className={`mr-1 ${isChannelFavorite ? 'animate-pulse' : ''}`} 
              />
              {isChannelFavorite ? 'Favorited' : 'Favorite'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 size={16} className="mr-1" />
              Share
            </Button>
          </div>
        </div>

        {/* Channel Info */}
        <div className="flex items-center gap-4">
          <img
            src={channel.logoUrl || '/channel-placeholder.svg'}
            alt={channel.name}
            className="w-16 h-16 object-contain p-1 bg-white dark:bg-gray-800 rounded-lg shadow"
            onError={(e) => { e.currentTarget.src = '/channel-placeholder.svg'; }}
          />
          <div>
            <h1 className="text-2xl font-bold">{channel.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary">{channel.categoryName}</Badge>
              <Badge variant="destructive" className="animate-pulse">LIVE</Badge>
              <Badge variant="outline" className="text-green-500 border-green-500">
                Secure
              </Badge>
            </div>
          </div>
        </div>

        {/* Video Player - Uses secure tokenized URL */}
        <div className="w-full aspect-video bg-black overflow-hidden shadow-2xl">
          <VideoPlayer
            key={channel.id} 
            streamUrl={secureStreamUrl}
            channelName={channel.name}
            autoPlay={true}
            muted={false}
            className="w-full h-full"
          />
        </div>

        {/* Security Notice */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            This stream is protected with encrypted token authentication. 
            Tokens expire automatically for security.
          </AlertDescription>
        </Alert>
      </div>
    </ErrorBoundary>
  );
};

export default ChannelPlayer;
