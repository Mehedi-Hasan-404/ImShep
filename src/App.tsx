// src/App.tsx
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch } from "wouter";
import { FavoritesProvider } from "@/contexts/FavoritesContext";
import { RecentsProvider } from "@/contexts/RecentsContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import Layout from "@/components/Layout";
import { Analytics } from "@vercel/analytics/react";
import { AdblockDetector } from "@/components/AdblockDetector"; // Import the new component

// Lazy Load Pages
const Home = lazy(() => import("@/pages/Home"));
const Favorites = lazy(() => import("@/pages/Favorites"));
const Live = lazy(() => import("@/pages/Live"));
const EventPlayer = lazy(() => import("@/pages/EventPlayer"));
const CategoryChannels = lazy(() => import("@/pages/CategoryChannels"));
const ChannelPlayer = lazy(() => import("@/pages/ChannelPlayer"));
const Admin = lazy(() => import("@/pages/Admin"));
const Contact = lazy(() => import("@/pages/Contact"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider defaultTheme="dark" storageKey="iptv-ui-theme">
        <Toaster />
        <Sonner />
        {/* The Detector runs globally. If blocked, it covers the entire app. */}
        <AdblockDetector />
        
        <Router>
          <FavoritesProvider>
            <RecentsProvider>
              <Suspense fallback={<LoadingFallback />}>
                <Switch>
                  <Route path="/">
                    <Layout><Home /></Layout>
                  </Route>
                  <Route path="/live">
                    <Layout><Live /></Layout>
                  </Route>
                  <Route path="/live/:eventId">
                    {(params: { eventId: string } | undefined) => 
                      <Layout><EventPlayer /></Layout>
                    }
                  </Route>
                  <Route path="/favorites">
                    <Layout><Favorites /></Layout>
                  </Route>
                  <Route path="/contact">
                    <Layout><Contact /></Layout>
                  </Route>
                  <Route path="/category/:slug">
                    {(params: { slug: string } | undefined) => 
                      <Layout><CategoryChannels slug={params?.slug ?? ""} /></Layout>
                    }
                  </Route>
                  <Route path="/channel/:channelId">
                    {(params: { channelId: string } | undefined) => 
                      <Layout><ChannelPlayer channelId={params?.channelId ?? ""} /></Layout>
                    }
                  </Route>
                  <Route path="/admin">
                    <Admin />
                  </Route>
                  <Route path="/admin/:rest*">
                    <Admin />
                  </Route>
                  <Route>
                    <NotFound />
                  </Route>
                </Switch>
              </Suspense>
            </RecentsProvider>
          </FavoritesProvider>
        </Router>
        <Analytics />
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
