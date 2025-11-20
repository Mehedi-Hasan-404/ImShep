// /src/pages/NotFound.tsx
import { Link } from 'wouter';
import { Home, ArrowLeft, Tv, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";

const NotFound = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        
        {/* Animated Live TV Pro Branding */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <Tv size={32} className="text-accent" style={{ 
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }} />
          <h1 className="text-3xl sm:text-4xl font-bold">
            <span className="gradient-text">Live TV Pro</span>
          </h1>
          <Sparkles size={24} className="text-yellow-500" style={{ 
            animation: 'bounce 2s infinite'
          }} />
        </div>

        <div className="space-y-4">
          <h1 className="text-6xl font-bold text-accent">404</h1>
          <h2 className="text-2xl font-semibold">Page Not Found</h2>
          <p className="text-text-secondary">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="default">
            <Link to="/">
              <Home size={16} />
              Go Home
            </Link>
          </Button>
          <Button asChild variant="outline" onClick={() => window.history.back()}>
            <span>
              <ArrowLeft size={16} />
              Go Back
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
