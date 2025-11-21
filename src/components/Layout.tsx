import { useState } from 'react';
import { useLocation } from 'wouter';
import Header from './Header';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [location] = useLocation();
  
  // Logic to show bottom nav
  const showBottomNav = ['/', '/favorites', '/contact', '/live'].includes(location);

  return (
    <div className="min-h-screen bg-background">
      <Header onMenuClick={() => setIsSidebarOpen(true)} />
      
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      <main className="main-content">
        {children}
      </main>

      {showBottomNav && <BottomNav />}
    </div>
  );
};

export default Layout;
