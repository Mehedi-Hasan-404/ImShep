// src/pages/CategoryChannels.tsx - SECURE VERSION
// NO STREAM URLS EXPOSED TO FRONTEND

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

  // SECURE: Server returns only channel metadata, NO STREAM URLS
  const fetchM3UPlaylistMetadata = async (
    categoryId: string, 
    categoryName: string, 
    m3uUrl: string
  ): Promise<PublicChannel[]> => {
    try {
      const response = await fetch('/api/parse-m3u-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categoryId,
          categoryName,
          m3uUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch M3U metadata');
      }

      const data = await response.json();
      // Server returns channels WITHOUT streamUrl field
      return data.channels || [];
    } catch (error) {
      throw error;
    }
  };

  const fetchCategoryAndChannels = async () => {
    try {
      setLoading(true);
      setError(null);

      const categoriesRef = collection(db, 'categories');
      const categoryQuery = query(categoriesRef, where('slug', '==', slug));
      const categorySnapshot = await getDocs(categoryQuery);

      if (categorySnapshot.empty) {
        setLoading(false);
        setLocation('/404');
        return;
      }

      const categoryDoc = categorySnapshot.docs[0];
      const categoryData = { id: categoryDoc.id, ...categoryDoc.data() } as Category;
      setCategory(categoryData);

      let allChannels: PublicChannel[] = [];

      // Fetch M3U channel metadata (NO URLs)
      if (categoryData.m3uUrl) {
        try {
          const m3uChannels = await fetchM3UPlaylistMetadata(
            categoryData.id,
            categoryData.name,
            categoryData.m3uUrl
          );
          allChannels = [...allChannels, ...m3uChannels];
        } catch (m3uError) {
          setError('Failed to load M3U playlist channels. Showing manual channels only.');
        }
      }

      // Fetch manual channels (also without URLs in production)
      try {
        const channelsRef = collection(db, 'channels');
        const channelsQuery = query(channelsRef, where('categoryId', '==', categoryData.id));
        const channelsSnapshot = await getDocs(channelsQuery);
        
        const manualChannels = channelsSnapshot.docs.map(doc => {
          const data = doc.data();
          // SECURITY: Remove streamUrl before sending to state
          return {
            id: doc.id,
            name: data.name,
            logoUrl: data.logoUrl,
            categoryId: data.categoryId,
            categoryName: data.categoryName,
            // streamUrl is NOT included
          } as PublicChannel;
        });

        allChannels = [...allChannels, ...manualChannels];
      } catch (firestoreError) {
        console.error('Error fetching manual channels');
      }

      setChannels(allChannels);
    } catch (generalError) {
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
          <Button variant="ghost" className="mb-4" onClick={() => setLocation('/')}>
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
        <Button variant="ghost" className="mb-4" onClick={() => setLocation('/')}>
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
