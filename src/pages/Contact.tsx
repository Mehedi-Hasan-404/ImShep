import { Mail, ExternalLink } from 'lucide-react';
import { Button } from "@/components/ui/button";

const SocialCard = ({ 
  name, 
  icon, 
  color, 
  description, 
  link, 
  delay 
}: { 
  name: string; 
  icon: React.ReactNode; 
  color: string; 
  description: string; 
  link: string;
  delay: number;
}) => (
  <a 
    href={link}
    target="_blank"
    rel="noopener noreferrer"
    className="block group"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="bg-card border border-border rounded-xl p-6 h-full hover:border-accent transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden animate-fade-in">
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${color} opacity-5 rounded-bl-full transition-opacity group-hover:opacity-10`} />
      
      <div className="relative z-10">
        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
        
        <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
          {name}
          <ExternalLink size={14} className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
        </h3>
        <p className="text-sm text-text-secondary mb-4 line-clamp-2">
          {description}
        </p>
        
        <Button variant="outline" className="w-full group-hover:bg-accent group-hover:text-white transition-colors">
          Connect
        </Button>
      </div>
    </div>
  </a>
);

const Contact = () => {
  const socials = [
    {
      name: "Telegram",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.628 0zm4.955 16.654c-.23.667-1.152.836-1.944.537-2.46-1.023-3.646-1.77-5.24-2.67-.48-.276-.76-.406-.752-.634.006-.22.326-.347.634-.464.818-.31 1.708-.63 2.186-.846 1.76-.795 3.554-1.625 4.565-2.07.91-.4 1.635-.69 2.075-.65.12.01.27.05.38.13.09.07.18.18.22.32.05.15.08.35.02.57-.45 1.67-1.3 5.29-1.625 6.95-.17.89-.46 1.43-.75 1.74z" />
        </svg>
      ),
      color: "from-blue-400 to-blue-600",
      description: "Join our channel for the latest updates and announcements.",
      link: "#", // Add your link
      delay: 100
    },
    {
      name: "Facebook",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      color: "from-blue-600 to-blue-800",
      description: "Follow our page for news, events, and community highlights.",
      link: "#", // Add your link
      delay: 200
    },
    {
      name: "Instagram",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
      ),
      color: "from-pink-500 via-red-500 to-yellow-500",
      description: "Check out our latest stories and behind-the-scenes content.",
      link: "#", // Add your link
      delay: 300
    },
    {
      name: "Twitter (X)",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      color: "from-gray-700 to-black",
      description: "Follow us for real-time updates and community discussions.",
      link: "#", // Add your link
      delay: 400
    },
    {
      name: "Bluesky",
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
          <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565-.131 2.032-.028 3.095.272 4.487c.26 1.2 2.948 10.21 2.948 10.21.092.35.402.66.75.7.876.1 2.922.373 3.527.426.586.052 1.315-.32 1.315-1.34 0-.66-.496-1.336-.726-1.659-.847-1.19-3.75-4.87-3.75-4.87s3.134 1.599 4.85 2.52c1.994 1.07 3.575 2.17 5.637 2.17 2.062 0 3.643-1.1 5.636-2.17 1.717-.92 4.85-2.52 4.85-2.52s-2.903 3.68-3.749 4.87c-.23.323-.727.998-.727 1.658 0 1.02.728 1.392 1.315 1.34.605-.053 2.651-.326 3.527-.426.348-.04.658-.35.75-.7 0 0 2.688-9.01 2.948-10.21.3-1.392.403-2.455-.63-2.922-.658-.299-1.664-.621-4.3-1.24C16.046 4.748 13.087 8.687 12 10.8z" />
        </svg>
      ),
      color: "from-blue-400 to-indigo-500",
      description: "Connect with us on the decentralized social network.",
      link: "#", // Add your link
      delay: 500
    }
  ];

  return (
    <div className="min-h-screen bg-background pb-24 pt-4 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4 animate-slide-in-top">
          <h1 className="text-4xl font-bold gradient-text">Get in Touch</h1>
          <p className="text-text-secondary max-w-2xl mx-auto text-lg">
            We'd love to hear from you! Connect with us on your favorite social platforms for updates, support, and community.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {socials.map((social) => (
            <SocialCard key={social.name} {...social} />
          ))}
          
          {/* General Contact Card */}
          <div className="sm:col-span-2 lg:col-span-1 animate-fade-in" style={{ animationDelay: '600ms' }}>
            <a href="mailto:support@example.com" className="block h-full group">
              <div className="bg-card border border-border rounded-xl p-6 h-full hover:border-accent transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-gray-500 to-gray-700 opacity-5 rounded-bl-full transition-opacity group-hover:opacity-10" />
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <Mail size={24} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Email Us</h3>
                  <p className="text-sm text-text-secondary mb-4">
                    Have specific questions? Drop us a line directly via email.
                  </p>
                  <Button variant="secondary" className="w-full group-hover:bg-gray-700 group-hover:text-white transition-colors">
                    Send Email
                  </Button>
                </div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
