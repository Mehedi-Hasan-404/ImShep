import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Grid3x3, List, Loader2, AlertCircle } from 'lucide-react';

interface PublicChannel {
  id: string;
  name: string;
  logoUrl: string;
  streamUrl: string;
  categoryId: string;
  categoryName: string;
}

interface Category {
  id: string;
  name: string;
  m3uUrl: string;
  enabled: boolean;
}

const CategoryChannels = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<PublicChannel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState('');

  useEffect(() => {
    loadChannels();
  }, [categoryId]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredChannels(channels);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = channels.filter(channel =>
        channel.name.toLowerCase().includes(query)
      );
      setFilteredChannels(filtered);
    }
  }, [searchQuery, channels]);

  const loadChannels = async () => {
    if (!categoryId) return;

    setIsLoading(true);
    setError(null);

    try {
      const categories: Category[] = JSON.parse(localStorage.getItem('iptv_categories') || '[]');
      const category = categories.find(cat => cat.id === categoryId);

      if (!category) {
        setError('Category not found');
        setIsLoading(false);
        return;
      }

      setCategoryName(category.name);
      const channelsList = await fetchM3UPlaylistServerSide(categoryId, category.name, category.m3uUrl);
      setChannels(channelsList);
      setFilteredChannels(channelsList);
    } catch (err) {
      console.error('Error loading channels:', err);
      setError('Failed to load channels. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleChannelClick = (channel: PublicChannel) => {
    navigate(`/player/${categoryId}/${encodeURIComponent(channel.id)}`);
  };

  const handleBack = () => {
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading channels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={handleBack}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-2xl font-bold">{categoryName}</h1>
            <span className="ml-auto text-sm text-gray-400">
              {filteredChannels.length} channels
            </span>
          </div>

          {/* Search and View Controls */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search channels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <Grid3x3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {filteredChannels.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">
              {searchQuery ? 'No channels found matching your search' : 'No channels available'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => handleChannelClick(channel)}
                className="group bg-gray-900 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
              >
                <div className="aspect-square bg-gray-800 flex items-center justify-center overflow-hidden">
                  <img
                    src={channel.logoUrl}
                    alt={channel.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/channel-placeholder.svg';
                    }}
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-white truncate group-hover:text-blue-400 transition-colors">
                    {channel.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => handleChannelClick(channel)}
                className="w-full flex items-center gap-4 p-4 bg-gray-900 rounded-lg hover:bg-gray-800 hover:ring-2 hover:ring-blue-500 transition-all group"
              >
                <div className="w-16 h-16 bg-gray-800 rounded-lg flex-shrink-0 overflow-hidden">
                  <img
                    src={channel.logoUrl}
                    alt={channel.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = '/channel-placeholder.svg';
                    }}
                  />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-white group-hover:text-blue-400 transition-colors">
                    {channel.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryChannels;
