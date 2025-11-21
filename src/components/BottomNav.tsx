import { Home, Star, MessageCircle, Calendar } from 'lucide-react';
import { Link, useLocation } from 'wouter';

const BottomNav = () => {
  const [location] = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/live', icon: Calendar, label: 'Live' },
    { path: '/favorites', icon: Star, label: 'Favs' },
    { path: '/contact', icon: MessageCircle, label: 'Contact' },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map(({ path, icon: Icon, label }) => (
        <Link
          key={path}
          to={path}
          className={`nav-item ${location === path ? 'active' : ''}`}
        >
          <Icon size={20} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
};

export default BottomNav;
