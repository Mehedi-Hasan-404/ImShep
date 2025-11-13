// src/pages/ChannelPlayer.tsx - ENHANCED DEBUG VERSION
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PublicChannel, Category } from '@/types';
import VideoPlayer from '@/components/VideoPlayer';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Star, Share2, AlertCircle, Search, Play } from 'lucide-react';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useRecents } from '@/contexts/RecentsContext';
import { toast } from "@/components/ui/sonner";
import ErrorBoundary from '@/components/ErrorBoundary';
import { getProxiedUrl } from '@/lib/urlEncryption';

// Enable debug logging
const DEBUG = true;

interface ChannelPlayerProps {
  channelId: string;
}

const ChannelPlayer = ({ channelId }: ChannelPlayerProps) => {
  const [, setLocation] = useLocation();
  const [channel, setChannel] = useState<PublicChannel | null>(null);
  const [allChannels, setAllChannels] = useState<PublicChannel[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<PublicChannel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topRef = useRef<HTMLDivElement>(null);

  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { addRecent } = useRecents();

  // Debug: Log when component mounts
  useEffect(() => {
    if (DEBUG) {
      console.log('🎬 ChannelPlayer mounted with channelId:', channelId);
      console.log('🔧 Environment check:', {
        API_KEY: import.meta.env.VITE_API_KEY ? 'Set' : 'NOT SET',
        PROXY_URL: import.meta.env.VITE_PROXY_URL || 'Not set (using default)'
      });
    }
  }, []);

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
      fetchChannel();
    } else {
      setError('No channel ID provided in URL');
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (channel && channel.categoryId) {
      fetchAllChannels();
    }
  }, [channel?.id, channel?.categoryId]);

  useEffect(() => {
    if (allChannels.length > 0) {
      const baseChannels = channel ? allChannels.filter(ch => ch.id !== channel.id) : allChannels;
      const filtered = baseChannels.filter(ch => 
        ch.name && 
        ch.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredChannels(filtered);
    } else {
      setFilteredChannels([]);
    }
  }, [searchQuery, allChannels, channel]);

  const fetchM3UPlaylist = async (m3uUrl: string, categoryId: string, categoryName: string): Promise<PublicChannel[]> => {
    try {
      const API_KEY = import.meta.env.VITE_API_KEY;
      
      if (!API_KEY) {
        console.error('❌ API Key not configured');
        toast.error("Configuration Error", {
          description: "API key is not configured. Please contact administrator.",
        });
        return [];
      }
      
      if (DEBUG) {
        console.log('📡 Fetching M3U playlist:', {
          m3uUrl: m3uUrl.substring(0, 100),
          categoryName,
          hasApiKey: !!API_KEY
        });
      }
      
      const response = await fetch('/api/parse-m3u', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        body: JSON.stringify({
          categoryId,
          categoryName,
          m3uUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ M3U fetch failed:', errorData);
        throw new Error(errorData.error || 'Failed to fetch M3U playlist');
      }

      const data = await response.json();
      
      if (DEBUG) {
        console.log('✅ M3U channels fetched:', {
          count: data.channels?.length || 0,
          firstChannel: data.channels?.[0]
        });
      }
      
      return data.channels || [];
    } catch (error) {
      console.error('❌ Error fetching M3U playlist:', error);
      return [];
    }
  };

  const fetchAllChannels = async () => {
    try {
      if (!channel || !channel.categoryId) return;

      let categoryChannelsList: PublicChannel[] = [];

      // Fetch manual channels
      try {
        const channelsRef = collection(db, 'channels');
        const channelsQuery = query(channelsRef, where('categoryId', '==', channel.categoryId));
        const channelsSnapshot = await getDocs(channelsQuery);
        const manualChannels = channelsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PublicChannel[];
        categoryChannelsList = [...categoryChannelsList, ...manualChannels];
        
        if (DEBUG) {
          console.log('📚 Manual channels fetched:', manualChannels.length);
        }
      } catch (manualChannelsError) {
        console.error('Error fetching manual channels:', manualChannelsError);
      }

      // Fetch M3U channels
      try {
        const categoriesRef = collection(db, 'categories');
        const categoryDoc = await getDocs(query(categoriesRef, where('__name__', '==', channel.categoryId)));
        
        if (!categoryDoc.empty) {
          const categoryData = { id: categoryDoc.docs[0].id, ...categoryDoc.docs[0].data() } as Category;

          if (categoryData.m3uUrl) {
            const m3uChannels = await fetchM3UPlaylist(
              categoryData.m3uUrl,
              categoryData.id,
              categoryData.name
            );
            if (m3uChannels.length > 0) {
              categoryChannelsList = [...categoryChannelsList, ...m3uChannels];
              if (DEBUG) {
                console.log('📺 M3U channels added:', m3uChannels.length);
              }
            }
          }
        }
      } catch (m3uError) {
        console.error('Error loading M3U playlist:', m3uError);
      }

      const uniqueChannels = categoryChannelsList.filter((ch, index, self) =>
        index === self.findIndex((t) => t.id === ch.id)
      );

      setAllChannels(uniqueChannels);
    } catch (error) {
      console.error('Error in fetchAllChannels:', error);
    }
  };

  const fetchChannel = async () => {
    try {
      setLoading(true);
      setError(null);
      setChannel(null);

      if (!channelId) {
        setError('Channel ID is required');
        return;
      }

      const decodedChannelId = decodeURIComponent(channelId);
      
      if (DEBUG) {
        console.log('🔍 Fetching channel:', decodedChannelId);
      }
      
      let foundChannel: PublicChannel | null = null;

      // Try to find in manual channels
      try {
        const channelsRef = collection(db, 'channels');
        const channelsSnapshot = await getDocs(channelsRef);

        for (const doc of channelsSnapshot.docs) {
          if (doc.id === decodedChannelId) {
            const channelData = doc.data();
            foundChannel = {
              id: doc.id,
              name: channelData.name || 'Unknown Channel',
              logoUrl: channelData.logoUrl || '/channel-placeholder.svg',
              streamUrl: channelData.streamUrl || '',
              categoryId: channelData.categoryId || '',
              categoryName: channelData.categoryName || 'Unknown Category'
            };
            
            if (DEBUG) {
              console.log('✅ Found manual channel:', foundChannel.name);
            }
            break;
          }
        }
      } catch (manualChannelsError) {
        console.error('Error fetching manual channels:', manualChannelsError);
      }

      // If not found, try M3U channels
      if (!foundChannel) {
        const categoriesRef = collection(db, 'categories');
        const categoriesSnapshot = await getDocs(categoriesRef);

        for (const categoryDoc of categoriesSnapshot.docs) {
          const categoryData = { id: categoryDoc.id, ...categoryDoc.data() } as Category;

          if (categoryData.m3uUrl) {
            try {
              const m3uChannels = await fetchM3UPlaylist(
                categoryData.m3uUrl,
                categoryData.id,
                categoryData.name
              );

              const m3uChannel = m3uChannels.find(ch => ch.id === decodedChannelId);

              if (m3uChannel) {
                foundChannel = m3uChannel;
                if (DEBUG) {
                  console.log('✅ Found M3U channel:', foundChannel.name);
                }
                break;
              }
            } catch (m3uError) {
              console.error(`Error loading M3U playlist for category ${categoryData.name}:`, m3uError);
            }
          }
        }
      }

      if (!foundChannel) {
        console.error('❌ Channel not found:', decodedChannelId);
        setLoading(false);
        setLocation('/404');
        return;
      }

      if (!foundChannel.streamUrl) {
        setError('Channel stream URL is missing or invalid.');
        return;
      }

      if (DEBUG) {
        console.log('📺 Channel loaded:', {
          name: foundChannel.name,
          streamUrl: foundChannel.streamUrl.substring(0, 100),
          category: foundChannel.categoryName
        });
      }

      setChannel(foundChannel);

      if (addRecent) {
        addRecent(foundChannel);
      }

    } catch (error) {
      console.error('❌ Failed to load channel:', error);
      setError(`Failed to load channel: ${error}`);
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
      console.error('Error toggling favorite:', error);
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
        console.error('Error sharing:', error);
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

  const handleChannelSelect = (selectedChannel: PublicChannel) => {
    if (selectedChannel && selectedChannel.id) {
      setLocation(`/channel/${encodeURIComponent(selectedChannel.id)}`);
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

  if (error || !channel) {
    const displayError = error || 'Channel not found or stream is missing.';
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
  
  // Process stream URL
  let playerStreamUrl = channel.streamUrl;
  
  // Check if it's an m3u8 stream that needs proxying
  if (channel.streamUrl && channel.streamUrl.toLowerCase().includes('.m3u8')) {
    playerStreamUrl = getProxiedUrl(channel.streamUrl);
    
    if (DEBUG) {
      console.log('🎬 Stream URL processing:', {
        original: channel.streamUrl.substring(0, 100),
        proxied: playerStreamUrl.substring(0, 100),
        isProxied: playerStreamUrl !== channel.streamUrl
      });
      
      // Check if proxying failed
      if (playerStreamUrl === channel.streamUrl) {
        console.warn('⚠️ Stream URL was not proxied. Check if VITE_API_KEY is set in .env');
      }
    }
  } else if (DEBUG) {
    console.log('ℹ️ Non-M3U8 stream, not proxying:', channel.streamUrl?.substring(0, 100));
  }

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
                className={`mr-1 transition-all duration-300 ${isChannelFavorite ? 'animate-pulse' : ''}`} 
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
            </div>
          </div>
        </div>

        {/* Debug Info (only in development) */}
        {DEBUG && import.meta.env.DEV && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Debug Info:</strong><br />
              Stream URL: {playerStreamUrl?.substring(0, 100)}...<br />
              Is Proxied: {playerStreamUrl !== channel.streamUrl ? 'Yes' : 'No'}<br />
              API Key: {import.meta.env.VITE_API_KEY ? 'Configured' : 'NOT SET'}
            </AlertDescription>
          </Alert>
        )}

        {/* Video Player - Full Width */}
        <div className="w-full aspect-video bg-black overflow-hidden shadow-2xl">
          <VideoPlayer
            key={channel.id} 
            streamUrl={playerStreamUrl}
            channelName={channel.name}
            autoPlay={true}
            muted={false}
            className="w-full h-full"
          />
        </div>

        {/* Related Channels Section */}
        <div className="related-channels-section pt-4">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">
            More Channels
            {channel.categoryName && <span className="text-base text-gray-500 font-normal ml-2">in {channel.categoryName}</span>}
          </h2>

          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="search"
              placeholder="Search related channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg bg-card text-card-foreground focus:ring-2 focus:ring-accent focus:border-accent shadow-inner"
            />
          </div>

          {filteredChannels.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {filteredChannels.map(ch => {
                const isRelatedFavorite = isFavorite(ch.id);

                return (
                  <div 
                    key={ch.id} 
                    className="group cursor-pointer border rounded-lg hover:border-accent transition-all duration-300 bg-card shadow-sm hover:shadow-lg transform hover:scale-105 relative overflow-hidden"
                    onClick={() => handleChannelSelect(ch)}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        try {
                          if (isRelatedFavorite) {
                            removeFavorite(ch.id);
                          } else {
                            addFavorite(ch);
                          }
                        } catch (error) {
                          console.error('Error toggling favorite:', error);
                        }
                      }}
                      className={`absolute top-2 right-2 p-1.5 rounded-full z-10 transition-all duration-300 transform hover:scale-110 ${
                        isRelatedFavorite
                          ? 'bg-yellow-500 text-white shadow-lg'
                          : 'bg-black/50 text-white hover:bg-black/70'
                      }`}
                      title={isRelatedFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star 
                        size={14} 
                        fill={isRelatedFavorite ? 'white' : 'none'} 
                      />
                    </button>

                    <div className="aspect-video bg-muted flex items-center justify-center p-3">
                      <img
                        src={ch.logoUrl || '/channel-placeholder.svg'}
                        alt={ch.name}
                        className="w-full h-full object-contain"
                        onError={(e) => { e.currentTarget.src = '/channel-placeholder.svg'; }}
                      />
                    </div>
                    
                    <div className="p-3 space-y-2">
                      <p className="text-sm font-semibold line-clamp-2 min-h-[2.5rem] text-foreground">{ch.name}</p>
                      <Badge className="flex w-full justify-center items-center gap-1.5 text-xs py-1.5" 
                              variant="default">
                        <Play size={12} />
                        Watch Now
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No other channels found matching your search.</p>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default ChannelPlayer;
