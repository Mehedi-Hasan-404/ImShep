// /src/pages/Admin.tsx
import { useState, useEffect } from 'react';
import { Route, Link, useLocation, Switch } from 'wouter';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Category, AdminChannel, LiveEvent, LiveEventLink } from '@/types';
import { Shield, LogOut, Plus, Edit, Trash2, Save, X, Link as LinkIcon, Tv, Users, BarChart3, CheckCircle, XCircle, Loader2, ArrowUp, ArrowDown, Calendar, Trophy } from 'lucide-react';
import { toast } from "@/components/ui/sonner";

// --- Admin Login Component ---
const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success("Login successful", {
        description: "Welcome to the admin panel!",
      });
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError('Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-6">
        <div className="text-center mb-6">
          <Shield size={48} className="text-accent mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Admin Login</h1>
          <p className="text-text-secondary">Sign in to manage your IPTV system</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="form-input"
              disabled={loading}
            />
          </div>
          {error && (
            <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

// --- Categories Manager Component ---
const CategoriesManager = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategory, setNewCategory] = useState({ 
    name: '', 
    slug: '', 
    iconUrl: '', 
    m3uUrl: '' 
  });
  const [loading, setLoading] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  // Helper function to generate slug from name
  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const categoriesCol = collection(db, 'categories');
      const snapshot = await getDocs(categoriesCol);
      let categoriesData = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      
      // Backfill order field for categories that don't have it
      const needsBackfill = categoriesData.some(cat => cat.order === undefined);
      if (needsBackfill) {
        categoriesData.sort((a, b) => a.name.localeCompare(b.name));
        for (let i = 0; i < categoriesData.length; i++) {
          if (categoriesData[i].order === undefined) {
            await updateDoc(doc(db, 'categories', categoriesData[i].id), { order: i });
            categoriesData[i].order = i;
          }
        }
      }
      
      // Sort by order field
      categoriesData.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error("Failed to fetch categories");
    }
  };

  const validateM3UUrl = async (url: string): Promise<boolean> => {
    if (!url) {
      setValidationStatus('idle');
      return true; 
    }
    
    if (!url.toLowerCase().includes('.m3u8') && !url.toLowerCase().includes('.m3u')) {
      setValidationStatus('invalid');
      toast.warning("URL may not be a valid M3U playlist.");
      return true; 
    }
    
    setValidationStatus('validating');
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      setValidationStatus('valid');
      return true;
    } catch (error) {
      console.error("URL validation error:", error);
      setValidationStatus('invalid');
      return false;
    }
  };

  const handleUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    validateM3UUrl(e.target.value);
  };

  const handleSaveCategory = async () => {
    if (!newCategory.name.trim()) {
      toast.error("Category name is required");
      return;
    }
    
    setLoading(true);
    try {
      if (newCategory.m3uUrl.trim()) {
        await validateM3UUrl(newCategory.m3uUrl.trim());
      }

      const finalSlug = newCategory.slug.trim() || generateSlug(newCategory.name);
      
      const existingCategory = categories.find(cat => 
        cat.slug === finalSlug && cat.id !== editingCategory?.id
      );
      
      if (existingCategory) {
        toast.error("Duplicate Category", { description: "A category with this slug already exists." });
        setLoading(false);
        return;
      }

      const categoryData = {
        name: newCategory.name.trim(),
        slug: finalSlug,
        iconUrl: newCategory.iconUrl.trim() || '',
        m3uUrl: newCategory.m3uUrl.trim() || '',
        order: editingCategory?.order ?? Math.max(...categories.map(c => c.order ?? 0), -1) + 1,
      };

      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), categoryData);
        toast.success("Category Updated");
      } else {
        await addDoc(collection(db, 'categories'), categoryData);
        toast.success("Category Added");
      }
      
      setNewCategory({ name: '', slug: '', iconUrl: '', m3uUrl: '' });
      setEditingCategory(null);
      await fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error("Save Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setNewCategory({
      name: category.name,
      slug: category.slug,
      iconUrl: category.iconUrl || '',
      m3uUrl: category.m3uUrl || '',
    });
    setValidationStatus('idle');
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    
    try {
      await deleteDoc(doc(db, 'categories', id));
      await fetchCategories();
      toast.success("Category Deleted");
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error("Delete Failed");
    }
  };

  const handleReorderCategory = async (categoryId: string, direction: 'up' | 'down') => {
    const currentIndex = categories.findIndex(cat => cat.id === categoryId);
    if (currentIndex === -1) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    
    const currentCategory = categories[currentIndex];
    const targetCategory = categories[targetIndex];
    
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'categories', currentCategory.id), { order: targetCategory.order });
      batch.update(doc(db, 'categories', targetCategory.id), { order: currentCategory.order });
      await batch.commit();
      await fetchCategories();
      toast.success("Order Updated");
    } catch (error) {
      console.error('Error reordering category:', error);
      toast.error("Reorder Failed");
    }
  };

  const resetForm = () => {
    setNewCategory({ name: '', slug: '', iconUrl: '', m3uUrl: '' });
    setEditingCategory(null);
    setValidationStatus('idle');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Categories Management</h2>
      
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">
          {editingCategory ? 'Edit Category' : 'Add New Category'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Category Name *</label>
            <input
              type="text"
              value={newCategory.name}
              onChange={(e) => setNewCategory(prev => ({ 
                ...prev, 
                name: e.target.value,
                slug: prev.slug === generateSlug(prev.name) ? generateSlug(e.target.value) : prev.slug
              }))}
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">URL Slug</label>
            <input
              type="text"
              value={newCategory.slug}
              onChange={(e) => setNewCategory({ ...newCategory, slug: e.target.value })}
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Icon URL</label>
            <input
              type="url"
              value={newCategory.iconUrl}
              onChange={(e) => setNewCategory({ ...newCategory, iconUrl: e.target.value })}
              className="form-input"
              disabled={loading}
            />
          </div>
          <div className="relative">
            <label className="block text-sm font-medium mb-2">
              M3U Playlist URL
              <LinkIcon size={14} className="inline ml-1 text-green-500" />
            </label>
            <input
              type="url"
              value={newCategory.m3uUrl}
              onChange={(e) => {
                setNewCategory({ ...newCategory, m3uUrl: e.target.value });
                setValidationStatus('idle');
              }}
              onBlur={handleUrlBlur}
              className="form-input pr-10"
              disabled={loading}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none mt-7">
              {validationStatus === 'validating' && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
              {validationStatus === 'valid' && <CheckCircle className="h-5 w-5 text-green-500" />}
              {validationStatus === 'invalid' && <XCircle className="h-5 w-5 text-red-500" />}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSaveCategory}
            disabled={loading || !newCategory.name.trim()}
            className="btn-primary"
          >
            <Save size={16} />
            {loading ? 'Saving...' : editingCategory ? 'Update Category' : 'Add Category'}
          </button>
          {editingCategory && (
            <button onClick={resetForm} className="btn-secondary" disabled={loading}>
              <X size={16} /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Existing Categories ({categories.length})</h3>
        <div className="space-y-2">
          {categories.map((category, index) => (
            <div key={category.id} className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white text-xs">
                  {category.iconUrl ? (
                    <img src={category.iconUrl} alt="" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    category.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {category.name}
                    {category.m3uUrl && <span className="text-green-500 text-xs bg-green-500/10 px-2 py-1 rounded">M3U</span>}
                  </div>
                  <div className="text-xs text-text-secondary">/category/{category.slug}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleReorderCategory(category.id, 'up')} disabled={index === 0} className="p-2 text-gray-400 hover:text-white disabled:opacity-30"><ArrowUp size={16} /></button>
                <button onClick={() => handleReorderCategory(category.id, 'down')} disabled={index === categories.length - 1} className="p-2 text-gray-400 hover:text-white disabled:opacity-30"><ArrowDown size={16} /></button>
                <button onClick={() => handleEditCategory(category)} className="p-2 text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                <button onClick={() => handleDeleteCategory(category.id)} className="p-2 text-destructive hover:text-red-400"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Channels Manager Component ---
const ChannelsManager = () => {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingChannel, setEditingChannel] = useState<AdminChannel | null>(null);
  const [newChannel, setNewChannel] = useState({
    name: '',
    logoUrl: '',
    streamUrl: '',
    categoryId: '',
    authCookie: '',
  });
  const [loading, setLoading] = useState(false);
  const [streamValidationStatus, setStreamValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    const fetchData = async () => {
      const chans = await getDocs(query(collection(db, 'channels'), orderBy('name')));
      setChannels(chans.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminChannel)));
      const cats = await getDocs(collection(db, 'categories'));
      setCategories(cats.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    };
    fetchData();
  }, []);

  const validateStreamUrl = async (url: string): Promise<boolean> => {
    if (!url) {
      setStreamValidationStatus('idle');
      return true;
    }
    if (!url.toLowerCase().includes('.m3u8') && !url.toLowerCase().includes('.mp4')) {
      setStreamValidationStatus('invalid');
      toast.warning("URL may not be a valid stream format.");
      return true;
    }
    setStreamValidationStatus('validating');
    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      setStreamValidationStatus('valid');
      return true;
    } catch (error) {
      setStreamValidationStatus('invalid');
      return false;
    }
  };

  const handleSaveChannel = async () => {
    if (!newChannel.name.trim() || !newChannel.streamUrl.trim() || !newChannel.categoryId) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    setLoading(true);
    try {
      const category = categories.find(cat => cat.id === newChannel.categoryId);
      const channelData = {
        name: newChannel.name.trim(),
        logoUrl: newChannel.logoUrl.trim() || '/channel-placeholder.svg',
        streamUrl: newChannel.streamUrl.trim(),
        categoryId: newChannel.categoryId,
        categoryName: category?.name || 'Unknown',
        authCookie: newChannel.authCookie.trim() || null,
      };

      if (editingChannel) {
        await updateDoc(doc(db, 'channels', editingChannel.id), channelData);
        toast.success("Channel Updated");
      } else {
        await addDoc(collection(db, 'channels'), channelData);
        toast.success("Channel Added");
      }
      
      setNewChannel({ name: '', logoUrl: '', streamUrl: '', categoryId: '', authCookie: '' });
      setEditingChannel(null);
      setStreamValidationStatus('idle');
      
      // Refresh list
      const chans = await getDocs(query(collection(db, 'channels'), orderBy('name')));
      setChannels(chans.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminChannel)));
    } catch (error) {
      console.error('Error saving channel:', error);
      toast.error("Save Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Delete channel?')) return;
    try {
      await deleteDoc(doc(db, 'channels', id));
      const chans = await getDocs(query(collection(db, 'channels'), orderBy('name')));
      setChannels(chans.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminChannel)));
      toast.success("Channel Deleted");
    } catch (error) {
      toast.error("Delete Failed");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Manual Channels Management</h2>
      
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">{editingChannel ? 'Edit Channel' : 'Add New Channel'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Channel Name *</label>
            <input
              type="text"
              value={newChannel.name}
              onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Logo URL</label>
            <input
              type="url"
              value={newChannel.logoUrl}
              onChange={(e) => setNewChannel({ ...newChannel, logoUrl: e.target.value })}
              className="form-input"
              disabled={loading}
            />
          </div>
          <div className="relative">
            <label className="block text-sm font-medium mb-2">Stream URL (m3u8/mp4) *</label>
            <input
              type="url"
              value={newChannel.streamUrl}
              onChange={(e) => {
                setNewChannel({ ...newChannel, streamUrl: e.target.value });
                setStreamValidationStatus('idle');
              }}
              onBlur={(e) => validateStreamUrl(e.target.value)}
              className="form-input pr-10"
              disabled={loading}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none mt-7">
              {streamValidationStatus === 'validating' && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
              {streamValidationStatus === 'valid' && <CheckCircle className="h-5 w-5 text-green-500" />}
              {streamValidationStatus === 'invalid' && <XCircle className="h-5 w-5 text-red-500" />}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Category *</label>
            <select
              value={newChannel.categoryId}
              onChange={(e) => setNewChannel({ ...newChannel, categoryId: e.target.value })}
              className="form-input"
              disabled={loading}
            >
              <option value="">Select Category</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">Auth Cookie (Optional)</label>
            <textarea
              value={newChannel.authCookie}
              onChange={(e) => setNewChannel({ ...newChannel, authCookie: e.target.value })}
              className="form-input min-h-[60px] font-mono text-xs"
              disabled={loading}
            />
          </div>
        </div>
        
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSaveChannel}
            disabled={loading}
            className="btn-primary"
          >
            <Save size={16} /> {loading ? 'Saving...' : 'Save'}
          </button>
          {editingChannel && (
            <button onClick={() => { setEditingChannel(null); setNewChannel({ name: '', logoUrl: '', streamUrl: '', categoryId: '', authCookie: '' }); setStreamValidationStatus('idle'); }} className="btn-secondary">
              <X size={16} /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Manual Channels ({channels.length})</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {channels.map(channel => (
            <div key={channel.id} className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
              <div className="flex items-center gap-3">
                <img
                  src={channel.logoUrl}
                  className="w-10 h-10 object-contain bg-white rounded"
                  onError={(e) => { e.currentTarget.src = '/channel-placeholder.svg'; }}
                />
                <div>
                  <div className="font-medium">{channel.name}</div>
                  <div className="text-sm text-text-secondary flex items-center gap-2">
                    <span>{channel.categoryName}</span>
                    <span className="text-blue-500">• Manual</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingChannel(channel); setNewChannel({ name: channel.name, logoUrl: channel.logoUrl, streamUrl: channel.streamUrl, categoryId: channel.categoryId, authCookie: channel.authCookie || '' }); }} className="p-2 text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                <button onClick={() => handleDeleteChannel(channel.id)} className="p-2 text-destructive hover:text-red-400"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Live Events Manager Component ---
const LiveEventsManager = () => {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [editingEvent, setEditingEvent] = useState<LiveEvent | null>(null);
  
  // Updated State for new fields
  const [newEvent, setNewEvent] = useState({
    category: '', // Sport Name (e.g. Cricket)
    league: '',   // League Name (e.g. PSL)
    team1Name: '',
    team1Logo: '',
    team2Name: '',
    team2Logo: '',
    startTime: '',
    isLive: false,
    links: [] as LiveEventLink[],
  });
  
  const [currentLink, setCurrentLink] = useState({ label: '', url: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const q = query(collection(db, 'live_events'), orderBy('startTime', 'desc'));
      const snapshot = await getDocs(q);
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveEvent)));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddLink = () => {
    if (currentLink.label && currentLink.url) {
      setNewEvent(prev => ({ ...prev, links: [...prev.links, currentLink] }));
      setCurrentLink({ label: '', url: '' });
    }
  };

  const handleRemoveLink = (index: number) => {
    setNewEvent(prev => ({ ...prev, links: prev.links.filter((_, i) => i !== index) }));
  };

  const handleSaveEvent = async () => {
    // Validation: Team names and Start Time are crucial
    if (!newEvent.team1Name || !newEvent.team2Name || !newEvent.startTime) {
      toast.error("Team names and Start Time are required");
      return;
    }
    setLoading(true);
    try {
      // Construct event data, ensuring we also save title/description for backward compatibility if needed
      const eventData = { 
        ...newEvent,
        title: `${newEvent.team1Name} vs ${newEvent.team2Name}`, // Fallback/Searchable Title
        description: `${newEvent.league} match between ${newEvent.team1Name} and ${newEvent.team2Name}`,
        bannerUrl: '', // Not used in new specific design
        category: newEvent.category || 'Sports',
        league: newEvent.league || 'Match',
      };

      if (editingEvent) {
        await updateDoc(doc(db, 'live_events', editingEvent.id), eventData);
        toast.success("Event Updated");
      } else {
        await addDoc(collection(db, 'live_events'), eventData);
        toast.success("Event Added");
      }
      
      setEditingEvent(null);
      resetForm();
      await fetchEvents();
    } catch (e) {
      toast.error("Failed to save event");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewEvent({ 
      category: '', league: '', 
      team1Name: '', team1Logo: '', 
      team2Name: '', team2Logo: '', 
      startTime: '', isLive: false, links: [] 
    });
  };

  const handleEditEvent = (event: LiveEvent) => {
    setEditingEvent(event);
    setNewEvent({
      category: event.category || '',
      league: event.league || '',
      team1Name: event.team1Name || '',
      team1Logo: event.team1Logo || '',
      team2Name: event.team2Name || '',
      team2Logo: event.team2Logo || '',
      startTime: event.startTime,
      isLive: event.isLive,
      links: event.links || [],
    });
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Delete event?')) return;
    await deleteDoc(doc(db, 'live_events', id));
    await fetchEvents();
    toast.success("Event deleted");
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Live Events Manager</h2>
      
      {/* Editor */}
      <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Trophy size={20} className="text-accent" />
          {editingEvent ? 'Edit Match' : 'Add New Match'}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Category & League */}
          <div>
            <label className="block text-sm font-medium mb-1 text-text-secondary">Sport Category</label>
            <input className="form-input" value={newEvent.category} onChange={e => setNewEvent({...newEvent, category: e.target.value})} placeholder="e.g. Cricket, Football" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-text-secondary">League / Tournament</label>
            <input className="form-input" value={newEvent.league} onChange={e => setNewEvent({...newEvent, league: e.target.value})} placeholder="e.g. IPL, Premier League" />
          </div>

          <div className="md:col-span-2 my-2 border-b border-border" />

          {/* Team 1 */}
          <div className="space-y-2">
            <label className="font-bold text-accent">Team 1 (Home)</label>
            <input className="form-input" value={newEvent.team1Name} onChange={e => setNewEvent({...newEvent, team1Name: e.target.value})} placeholder="Name (e.g. India)" />
            <input className="form-input" value={newEvent.team1Logo} onChange={e => setNewEvent({...newEvent, team1Logo: e.target.value})} placeholder="Logo URL" />
          </div>

          {/* Team 2 */}
          <div className="space-y-2">
            <label className="font-bold text-red-500">Team 2 (Away)</label>
            <input className="form-input" value={newEvent.team2Name} onChange={e => setNewEvent({...newEvent, team2Name: e.target.value})} placeholder="Name (e.g. Australia)" />
            <input className="form-input" value={newEvent.team2Logo} onChange={e => setNewEvent({...newEvent, team2Logo: e.target.value})} placeholder="Logo URL" />
          </div>

          <div className="md:col-span-2 my-2 border-b border-border" />

          {/* Timing & Status */}
          <div>
            <label className="block text-sm font-medium mb-1 text-text-secondary">Start Time *</label>
            <input type="datetime-local" className="form-input" value={newEvent.startTime} onChange={e => setNewEvent({...newEvent, startTime: e.target.value})} />
            <p className="text-xs text-text-secondary mt-1">Required for sorting and countdowns</p>
          </div>

          <div className="flex items-end pb-1">
            <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border w-full">
              <input 
                type="checkbox" 
                id="isLive" 
                checked={newEvent.isLive} 
                onChange={e => setNewEvent({...newEvent, isLive: e.target.checked})}
                className="w-5 h-5 accent-red-500 cursor-pointer" 
              />
              <label htmlFor="isLive" className="font-bold text-red-500 cursor-pointer select-none">
                Force "LIVE" Status
              </label>
            </div>
          </div>
          
          {/* Links Section */}
          <div className="md:col-span-2 border-t border-border pt-4 mt-2">
            <h4 className="font-semibold mb-3 text-sm text-text-secondary">Stream Links</h4>
            <div className="flex gap-2 mb-3">
              <input className="form-input flex-1" placeholder="Label (e.g. 720p)" value={currentLink.label} onChange={e => setCurrentLink({...currentLink, label: e.target.value})} />
              <input className="form-input flex-[2]" placeholder="Stream URL / Link" value={currentLink.url} onChange={e => setCurrentLink({...currentLink, url: e.target.value})} />
              <button onClick={handleAddLink} className="btn-secondary"><Plus size={16} /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {newEvent.links.map((link, i) => (
                <div key={i} className="flex items-center gap-2 bg-bg-tertiary px-3 py-1.5 rounded-full border border-border text-sm">
                  <span className="font-bold text-accent">{link.label}</span>
                  <button onClick={() => handleRemoveLink(i)} className="text-destructive hover:text-red-400 ml-1"><X size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 mt-6 border-t border-border pt-4">
          <button onClick={handleSaveEvent} disabled={loading} className="btn-primary w-full md:w-auto justify-center"><Save size={16} /> {editingEvent ? 'Update Match' : 'Save Match'}</button>
          {editingEvent && (
            <button onClick={() => { setEditingEvent(null); resetForm(); }} className="btn-secondary w-full md:w-auto justify-center"><X size={16} /> Cancel</button>
          )}
        </div>
      </div>

      {/* Event List */}
      <div className="grid gap-3">
        {events.map(event => (
          <div key={event.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between hover:border-accent/30 transition-colors">
            <div className="flex items-center gap-4 overflow-hidden">
              <div className="flex items-center gap-[-8px]">
                <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border flex items-center justify-center overflow-hidden z-10">
                  <img src={event.team1Logo} alt="T1" className="w-full h-full object-cover" onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/40'} />
                </div>
                <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border flex items-center justify-center overflow-hidden -ml-3">
                  <img src={event.team2Logo} alt="T2" className="w-full h-full object-cover" onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/40'} />
                </div>
              </div>
              <div className="min-w-0">
                <div className="font-bold text-white truncate flex items-center gap-2">
                  {event.team1Name} <span className="text-text-secondary text-xs">vs</span> {event.team2Name}
                  {event.isLive && <span className="bg-red-600 text-[10px] px-1.5 py-0.5 rounded text-white">LIVE</span>}
                </div>
                <div className="text-xs text-text-secondary flex items-center gap-2">
                  <span className="text-emerald-500">{event.category}</span>
                  <span>•</span>
                  <span>{event.league}</span>
                  <span>•</span>
                  <span>{new Date(event.startTime).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEditEvent(event)} className="p-2 text-blue-400 hover:bg-blue-400/10 rounded"><Edit size={18} /></button>
              <button onClick={() => handleDeleteEvent(event.id)} className="p-2 text-destructive hover:bg-destructive/10 rounded"><Trash2 size={18} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main Admin Dashboard ---
const AdminDashboard = () => {
  const [location] = useLocation();
  const { user } = useAuth();
  const [stats, setStats] = useState({ categories: 0, channels: 0, events: 0 });

  useEffect(() => {
    const loadStats = async () => {
      try {
        const cats = await getDocs(collection(db, 'categories'));
        const chans = await getDocs(collection(db, 'channels'));
        const evts = await getDocs(collection(db, 'live_events'));
        setStats({ categories: cats.size, channels: chans.size, events: evts.size });
      } catch (e) { console.error(e); }
    };
    loadStats();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    toast.success("Logged out");
  };

  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: BarChart3, exact: true },
    { path: '/admin/categories', label: 'Categories', icon: Tv },
    { path: '/admin/channels', label: 'Channels', icon: Users },
    { path: '/admin/events', label: 'Live Events', icon: Calendar },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border p-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-accent" />
            <h1 className="text-xl font-bold hidden sm:block">IPTV Admin Panel</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-text-secondary text-sm hidden md:block">{user?.email}</span>
            <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 flex items-center gap-2"><LogOut size={16} /> <span className="hidden sm:inline">Logout</span></button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-64 flex-shrink-0">
          <div className="bg-card border border-border rounded-lg p-2 sticky top-24 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
            {navItems.map(item => {
               const isActive = item.exact ? location === item.path : location.startsWith(item.path);
               return (
                <Link key={item.path} to={item.path} className={`flex items-center gap-3 p-3 rounded-lg transition-colors whitespace-nowrap ${
                  isActive ? 'bg-accent text-white shadow-md' : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                }`}>
                  <item.icon size={18} />
                  {item.label}
                </Link>
               );
            })}
          </div>
        </nav>

        <main className="flex-1 min-w-0 animate-fade-in">
          <Switch>
            <Route path="/admin">
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-card border border-border p-6 rounded-lg shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-text-secondary text-sm font-medium">Total Categories</div>
                        <div className="text-3xl font-bold text-accent mt-2">{stats.categories}</div>
                      </div>
                      <Tv className="text-accent opacity-20" size={32} />
                    </div>
                  </div>
                  <div className="bg-card border border-border p-6 rounded-lg shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-text-secondary text-sm font-medium">Total Channels</div>
                        <div className="text-3xl font-bold text-accent mt-2">{stats.channels}</div>
                      </div>
                      <Users className="text-accent opacity-20" size={32} />
                    </div>
                  </div>
                  <div className="bg-card border border-border p-6 rounded-lg shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-text-secondary text-sm font-medium">Live Events</div>
                        <div className="text-3xl font-bold text-green-500 mt-2">{stats.events}</div>
                      </div>
                      <Calendar className="text-green-500 opacity-20" size={32} />
                    </div>
                  </div>
                </div>
                
                <div className="bg-card border border-border p-8 rounded-lg text-center py-12">
                  <Shield size={48} className="mx-auto text-accent mb-4 opacity-50" />
                  <h3 className="font-bold text-xl mb-2">Admin Dashboard</h3>
                  <p className="text-text-secondary max-w-md mx-auto">Select "Live Events" or other modules from the menu to manage content.</p>
                </div>
              </div>
            </Route>
            <Route path="/admin/categories" component={CategoriesManager} />
            <Route path="/admin/channels" component={ChannelsManager} />
            <Route path="/admin/events" component={LiveEventsManager} />
          </Switch>
        </main>
      </div>
    </div>
  );
};

// --- Root Admin Component ---
const Admin = () => {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin text-accent w-8 h-8" /></div>;
  if (!user) return <AdminLogin />;
  return <AdminDashboard />;
};

export default Admin;
