// src/pages/CategoryChannels.tsx - COMPLETE FIXED VERSION
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PublicChannel, Category } from '@/types';
import ChannelCard from '@/components/ChannelCard';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Tv, Search, ArrowLeft } from 'lucide-react';

interface CategoryChannelsProps {
  slug: string;
}

const CategoryChannels = ({ slug }: CategoryChannelsProps) => {
  const [, setLocation] = useLocation();
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredChannels, setFilteredChannels] = useState<PublicChannel[]>([]);

  useEffect(() => {
    if (slug) {
      fetchCategoryAndChannels();
    } else {
      setError('Invalid category slug');
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const filtered = channels.filter(channel =>
      channel.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredChannels(filtered);
  }, [searchQuery, channels]);

  // Updated function with API Key and enhanced logging
  const fetchM3UPlaylistServerSide = async (
    categoryId: string, 
    categoryName: string, 
    m3uUrl: string
  ): Promise<PublicChannel[]> => {
    try {
      const API_KEY = import.meta.env.VITE_API_KEY;
      
      if (!API_KEY) {
        console.error('❌ API Key not configured');
        throw new Error('API configuration error');
      }
      
      console.log('📡 Calling parse-m3u API with origin:', window.location.origin);
      
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
        console.error('❌ API Error:', errorData);
        throw new Error(errorData.error || 'Failed to fetch M3U playlist');
      }

      const data = await response.json();
      console.log(`✅ API returned ${data.channels?.length || 0} channels`);
      return data.channels || [];
    } catch (error) {
      console.error('❌ Error fetching M3U playlist:', error);
      throw error;
    }
  };

  const fetchCategoryAndChannels = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Fetching category with slug:', slug);

      const categoriesRef = collection(db, 'categories');
      const categoryQuery = query(categoriesRef, where('slug', '==', slug));
      const categorySnapshot = await getDocs(categoryQuery);

      if (categorySnapshot.empty) {
        console.error('❌ Category not found:', slug);
        setLoading(false);
        setLocation('/404');
        return;
      }

      const categoryDoc = categorySnapshot.docs[0];
      const categoryData = { id: categoryDoc.id, ...categoryDoc.data() } as Category;
      console.log('✅ Category found:', categoryData.name);
      setCategory(categoryData);

      let allChannels: PublicChannel[] = [];

      // Fetch M3U channels via server-side API
      if (categoryData.m3uUrl) {
        console.log('📡 Category has M3U URL, fetching playlist...');
        try {
          const m3uChannels = await fetchM3UPlaylistServerSide(
            categoryData.id,
            categoryData.name,
            categoryData.m3uUrl
          );
          allChannels = [...allChannels, ...m3uChannels];
          console.log(`✅ Loaded ${m3uChannels.length} channels from M3U playlist`);
        } catch (m3uError) {
          console.error('❌ Error loading M3U playlist:', m3uError);
          setError('Failed to load M3U playlist channels. Showing manual channels only.');
        }
      }

      // Fetch manual channels
      try {
        console.log('📺 Fetching manual channels...');
        const channelsRef = collection(db, 'channels');
        const channelsQuery = query(channelsRef, where('categoryId', '==', categoryData.id));
        const channelsSnapshot = await getDocs(channelsQuery);
        
        const manualChannels = channelsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PublicChannel[];

        console.log(`✅ Loaded ${manualChannels.length} manual channels`);
        allChannels = [...allChannels, ...manualChannels];
      } catch (firestoreError) {
        console.error('❌ Error fetching manual channels:', firestoreError);
      }

      console.log(`📊 Total channels loaded: ${allChannels.length}`);
      setChannels(allChannels);
    } catch (generalError) {
      console.error('❌ Error fetching category and channels:', generalError);
      setError('Failed to load channels. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ErrorBoundary>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
          <div className="channels-grid-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-video w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (error || !category) {
    return (
      <ErrorBoundary>
        <div className="space-y-6">
          <Button variant="ghost" className="mb-4" onClick={() => setLocation('/')} data-testid="button-back">
            <ArrowLeft size={16} />
            Back
          </Button>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || 'Category not found.'}</AlertDescription>
          </Alert>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <Button variant="ghost" className="mb-4" onClick={() => setLocation('/')} data-testid="button-back">
          <ArrowLeft size={16} />
          Back
        </Button>

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tv size={24} />
            {category.name}
          </h1>
          <p className="text-text-secondary">
            {channels.length} channel{channels.length !== 1 ? 's' : ''} available
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-secondary w-5 h-5" />
          <input
            type="text"
            placeholder="Search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input pl-10"
          />
        </div>

        {filteredChannels.length === 0 && searchQuery ? (
          <div className="text-center py-12">
            <Search size={48} className="text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No channels found</h3>
            <p className="text-text-secondary">
              No channels match "{searchQuery}". Try a different search term.
            </p>
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-12">
            <Tv size={48} className="text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Channels Available</h3>
            <p className="text-text-secondary">
              No channels have been added to this category yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {filteredChannels.map(channel => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default CategoryChannels;
