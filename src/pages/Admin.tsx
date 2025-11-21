// /src/pages/Admin.tsx - Full Updated Version
import { useState, useEffect } from 'react';
import { Route, Link, useLocation, Switch } from 'wouter';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Category, AdminChannel, LiveEvent, LiveEventLink } from '@/types';
import { Shield, LogOut, Plus, Edit, Trash2, Save, X, Link as LinkIcon, Tv, Users, BarChart3, CheckCircle, XCircle, Loader2, ArrowUp, ArrowDown, Calendar, ExternalLink } from 'lucide-react';
import { toast } from "@/components/ui/sonner";

// Admin Login Component
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

// Categories Manager Component
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
      setValidationStatus('invalid');
      return false;
    }
  };

  const handleSaveCategory = async () => {
    if (!newCategory.name.trim()) {
      toast.error("Category name is required");
      return;
    }
    
    setLoading(true);
    try {
      const finalSlug = newCategory.slug.trim() || generateSlug(newCategory.name);
      
      const existingCategory = categories.find(cat => 
        cat.slug === finalSlug && cat.id !== editingCategory?.id
      );
      
      if (existingCategory) {
        toast.error("Duplicate Category");
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

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    try {
      await deleteDoc(doc(db, 'categories', id));
      await fetchCategories();
      toast.success("Category Deleted");
    } catch (error) {
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
    } catch (error) {
      toast.error("Reorder Failed");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Categories Management</h2>
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">{editingCategory ? 'Edit Category' : 'Add New Category'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              value={newCategory.name}
              onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value, slug: prev.slug === generateSlug(prev.name) ? generateSlug(e.target.value) : prev.slug }))}
              className="form-input"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Slug</label>
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
            <label className="block text-sm font-medium mb-2">M3U URL</label>
            <input
              type="url"
              value={newCategory.m3uUrl}
              onChange={(e) => { setNewCategory({ ...newCategory, m3uUrl: e.target.value }); setValidationStatus('idle'); }}
              onBlur={(e) => validateM3UUrl(e.target.value)}
              className="form-input pr-10"
              disabled={loading}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none mt-7">
              {validationStatus === 'validating' && <Loader2 className="h-4 w-4 animate-spin" />}
              {validationStatus === 'valid' && <CheckCircle className="h-4 w-4 text-green-500" />}
              {validationStatus === 'invalid' && <XCircle className="h-4 w-4 text-red-500" />}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSaveCategory} disabled={loading} className="btn-primary">
            <Save size={16} /> {loading ? 'Saving...' : 'Save'}
          </button>
          {editingCategory && (
            <button onClick={() => { setEditingCategory(null); setNewCategory({ name: '', slug: '', iconUrl: '', m3uUrl: '' }); }} className="btn-secondary">
              <X size={16} /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Categories</h3>
        <div className="space-y-2">
          {categories.map((category, index) => (
            <div key={category.id} className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-white text-xs">
                  {category.iconUrl ? <img src={category.iconUrl} className="w-full h-full rounded-full object-cover" /> : category.name[0]}
                </div>
                <div>
                  <div className="font-medium">{category.name}</div>
                  <div className="text-xs text-text-secondary">{category.m3uUrl ? 'M3U Linked' : 'Manual'}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleReorderCategory(category.id, 'up')} disabled={index === 0} className="p-1 text-gray-400 hover:text-white"><ArrowUp size={16} /></button>
                <button onClick={() => handleReorderCategory(category.id, 'down')} disabled={index === categories.length - 1} className="p-1 text-gray-400 hover:text-white"><ArrowDown size={16} /></button>
                <button onClick={() => { setEditingCategory(category); setNewCategory({ name: category.name, slug: category.slug, iconUrl: category.iconUrl || '', m3uUrl: category.m3uUrl || '' }); }} className="p-1 text-blue-400"><Edit size={16} /></button>
                <button onClick={() => handleDeleteCategory(category.id)} className="p-1 text-destructive"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Channels Manager Component
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

  useEffect(() => {
    fetchChannels();
    fetchCategories();
  }, []);

  const fetchChannels = async () => {
    const snapshot = await getDocs(query(collection(db, 'channels'), orderBy('name')));
    setChannels(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AdminChannel)));
  };

  const fetchCategories = async () => {
    const snapshot = await getDocs(collection(db, 'categories'));
    setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
  };

  const handleSaveChannel = async () => {
    if (!newChannel.name || !newChannel.streamUrl || !newChannel.categoryId) {
      toast.error("Missing fields");
      return;
    }
    setLoading(true);
    try {
      const category = categories.find(c => c.id === newChannel.categoryId);
      const data = {
        ...newChannel,
        logoUrl: newChannel.logoUrl || '/channel-placeholder.svg',
        categoryName: category?.name || 'Unknown',
        authCookie: newChannel.authCookie || null
      };

      if (editingChannel) {
        await updateDoc(doc(db, 'channels', editingChannel.id), data);
        toast.success("Channel Updated");
      } else {
        await addDoc(collection(db, 'channels'), data);
        toast.success("Channel Added");
      }
      setNewChannel({ name: '', logoUrl: '', streamUrl: '', categoryId: '', authCookie: '' });
      setEditingChannel(null);
      await fetchChannels();
    } catch (e) {
      toast.error("Operation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm('Delete channel?')) return;
    await deleteDoc(doc(db, 'channels', id));
    await fetchChannels();
    toast.success("Channel Deleted");
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Manual Channels</h2>
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">{editingChannel ? 'Edit Channel' : 'Add Channel'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input className="form-input" placeholder="Name" value={newChannel.name} onChange={e => setNewChannel({...newChannel, name: e.target.value})} />
          <input className="form-input" placeholder="Logo URL" value={newChannel.logoUrl} onChange={e => setNewChannel({...newChannel, logoUrl: e.target.value})} />
          <input className="form-input" placeholder="Stream URL" value={newChannel.streamUrl} onChange={e => setNewChannel({...newChannel, streamUrl: e.target.value})} />
          <select className="form-input" value={newChannel.categoryId} onChange={e => setNewChannel({...newChannel, categoryId: e.target.value})}>
            <option value="">Select Category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <textarea className="form-input md:col-span-2" placeholder="Auth Cookie (Optional)" value={newChannel.authCookie} onChange={e => setNewChannel({...newChannel, authCookie: e.target.value})} />
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSaveChannel} disabled={loading} className="btn-primary"><Save size={16} /> Save</button>
          {editingChannel && <button onClick={() => { setEditingChannel(null); setNewChannel({ name: '', logoUrl: '', streamUrl: '', categoryId: '', authCookie: '' }) }} className="btn-secondary"><X size={16} /> Cancel</button>}
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="space-y-2 h-96 overflow-y-auto">
          {channels.map(ch => (
            <div key={ch.id} className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg">
              <div className="flex items-center gap-3">
                <img src={ch.logoUrl} className="w-8 h-8 object-contain bg-white rounded" />
                <div><div className="font-medium">{ch.name}</div><div className="text-xs text-text-secondary">{ch.categoryName}</div></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingChannel(ch); setNewChannel({ name: ch.name, logoUrl: ch.logoUrl, streamUrl: ch.streamUrl, categoryId: ch.categoryId, authCookie: ch.authCookie || '' }) }} className="p-1 text-blue-400"><Edit size={16} /></button>
                <button onClick={() => handleDeleteChannel(ch.id)} className="p-1 text-destructive"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Live Events Manager
const LiveEventsManager = () => {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [editingEvent, setEditingEvent] = useState<LiveEvent | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    bannerUrl: '',
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
    if (!newEvent.title || !newEvent.startTime) {
      toast.error("Title and Start Time are required");
      return;
    }
    setLoading(true);
    try {
      const eventData = { ...newEvent };
      if (editingEvent) {
        await updateDoc(doc(db, 'live_events', editingEvent.id), eventData);
        toast.success("Event Updated");
      } else {
        await addDoc(collection(db, 'live_events'), eventData);
        toast.success("Event Added");
      }
      setEditingEvent(null);
      setNewEvent({ title: '', description: '', bannerUrl: '', startTime: '', isLive: false, links: [] });
      await fetchEvents();
    } catch (e) {
      toast.error("Failed to save event");
    } finally {
      setLoading(false);
    }
  };

  const handleEditEvent = (event: LiveEvent) => {
    setEditingEvent(event);
    setNewEvent({
      title: event.title,
      description: event.description,
      bannerUrl: event.bannerUrl,
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
      <h2 className="text-2xl font-bold">Live Events Management</h2>
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">{editingEvent ? 'Edit Event' : 'Add New Event'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">Title</label>
            <input className="form-input" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea className="form-input h-20" value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Banner URL</label>
            <input className="form-input" value={newEvent.bannerUrl} onChange={e => setNewEvent({...newEvent, bannerUrl: e.target.value})} placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Start Time</label>
            <input type="datetime-local" className="form-input" value={newEvent.startTime} onChange={e => setNewEvent({...newEvent, startTime: e.target.value})} />
          </div>
          <div className="md:col-span-2 flex items-center gap-3 p-3 bg-bg-secondary rounded-lg">
            <input 
              type="checkbox" 
              id="isLive" 
              checked={newEvent.isLive} 
              onChange={e => setNewEvent({...newEvent, isLive: e.target.checked})}
              className="w-5 h-5 accent-red-500" 
            />
            <label htmlFor="isLive" className="font-bold text-red-500">Force LIVE Status (Overrides timer)</label>
          </div>
          
          <div className="md:col-span-2 border-t border-border pt-4 mt-2">
            <h4 className="font-semibold mb-3">Stream Links</h4>
            <div className="flex gap-2 mb-3">
              <input className="form-input flex-1" placeholder="Label (e.g. Server 1)" value={currentLink.label} onChange={e => setCurrentLink({...currentLink, label: e.target.value})} />
              <input className="form-input flex-[2]" placeholder="URL" value={currentLink.url} onChange={e => setCurrentLink({...currentLink, url: e.target.value})} />
              <button onClick={handleAddLink} className="btn-secondary"><Plus size={16} /></button>
            </div>
            <div className="space-y-2">
              {newEvent.links.map((link, i) => (
                <div key={i} className="flex justify-between items-center bg-bg-tertiary p-2 rounded text-sm">
                  <div className="flex gap-2">
                    <span className="font-bold">{link.label}:</span>
                    <span className="truncate max-w-[200px]">{link.url}</span>
                  </div>
                  <button onClick={() => handleRemoveLink(i)} className="text-destructive hover:text-red-400"><X size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 mt-6">
          <button onClick={handleSaveEvent} disabled={loading} className="btn-primary"><Save size={16} /> Save Event</button>
          {editingEvent && (
            <button onClick={() => { setEditingEvent(null); setNewEvent({ title: '', description: '', bannerUrl: '', startTime: '', isLive: false, links: [] }) }} className="btn-secondary"><X size={16} /> Cancel</button>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        {events.map(event => (
          <div key={event.id} className="bg-card border border-border rounded-lg p-4 flex flex-col md:flex-row gap-4 items-start">
            <div className="w-full md:w-32 h-20 bg-bg-tertiary rounded overflow-hidden flex-shrink-0">
              {event.bannerUrl && <img src={event.bannerUrl} className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg flex items-center gap-2">
                {event.title}
                {event.isLive && <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded">LIVE</span>}
              </h3>
              <div className="text-text-secondary text-sm mb-1">{new Date(event.startTime).toLocaleString()}</div>
              <div className="text-sm opacity-70">{event.links.length} stream links available</div>
            </div>
            <div className="flex gap-2 mt-2 md:mt-0">
              <button onClick={() => handleEditEvent(event)} className="btn-secondary p-2"><Edit size={16} /></button>
              <button onClick={() => handleDeleteEvent(event.id)} className="btn-secondary p-2 text-destructive"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Main Admin Dashboard
const AdminDashboard = () => {
  const [location] = useLocation();
  const { user } = useAuth();
  const [stats, setStats] = useState({ categories: 0, channels: 0, events: 0 });

  useEffect(() => {
    const loadStats = async () => {
      const cats = await getDocs(collection(db, 'categories'));
      const chans = await getDocs(collection(db, 'channels'));
      const evts = await getDocs(collection(db, 'live_events'));
      setStats({ categories: cats.size, channels: chans.size, events: evts.size });
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
    { path: '/admin/channels', label: 'Manual Channels', icon: Users },
    { path: '/admin/events', label: 'Live Events', icon: Calendar },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={24} className="text-accent" />
            <h1 className="text-xl font-bold hidden sm:block">IPTV Admin</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-text-secondary text-sm hidden md:block">{user?.email}</span>
            <button onClick={handleLogout} className="btn-secondary text-sm py-1.5"><LogOut size={16} /> Logout</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-64 flex-shrink-0">
          <div className="bg-card border border-border rounded-lg p-2 sticky top-24">
            {navItems.map(item => (
              <Link key={item.path} to={item.path} className={`flex items-center gap-3 p-3 rounded-lg mb-1 transition-colors ${
                (item.exact ? location === item.path : location.startsWith(item.path))
                  ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-tertiary'
              }`}>
                <item.icon size={18} />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <main className="flex-1 min-w-0">
          <Switch>
            <Route path="/admin">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-card border border-border p-6 rounded-lg">
                  <div className="text-text-secondary text-sm">Total Categories</div>
                  <div className="text-3xl font-bold text-accent">{stats.categories}</div>
                </div>
                <div className="bg-card border border-border p-6 rounded-lg">
                  <div className="text-text-secondary text-sm">Total Channels</div>
                  <div className="text-3xl font-bold text-accent">{stats.channels}</div>
                </div>
                <div className="bg-card border border-border p-6 rounded-lg">
                  <div className="text-text-secondary text-sm">Live Events</div>
                  <div className="text-3xl font-bold text-green-500">{stats.events}</div>
                </div>
              </div>
              <div className="bg-card border border-border p-6 rounded-lg">
                <h3 className="font-bold mb-2">Welcome Admin</h3>
                <p className="text-text-secondary">Use the sidebar navigation to manage content.</p>
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

// Main Admin Component
const Admin = () => {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!user) return <AdminLogin />;
  return <AdminDashboard />;
};

export default Admin;
