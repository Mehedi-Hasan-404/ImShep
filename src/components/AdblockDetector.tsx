// src/components/AdblockDetector.tsx
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

export function AdblockDetector() {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    const checkAdblock = async () => {
      try {
        // Try to fetch a known ad script. 
        // DNS Adblockers (like AdGuard) will cause this request to fail (ERR_NAME_NOT_RESOLVED or similar).
        const response = await fetch(
          "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
          { method: "HEAD", mode: "no-cors" }
        );
        // If we get here, the request wasn't strictly blocked by network/DNS
      } catch (error) {
        console.log("Adblock DNS detected via network error");
        setIsBlocked(true);
      }

      // Secondary check: Create a bait element
      const bait = document.createElement("div");
      bait.className = "pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links";
      bait.style.width = "1px";
      bait.style.height = "1px";
      bait.style.position = "absolute";
      bait.style.left = "-10000px";
      bait.style.top = "-1000px";
      document.body.appendChild(bait);

      if (
        window.getComputedStyle(bait).display === "none" ||
        window.getComputedStyle(bait).visibility === "hidden" ||
        bait.offsetParent === null
      ) {
        setIsBlocked(true);
      }

      document.body.removeChild(bait);
    };

    checkAdblock();
  }, []);

  if (!isBlocked) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="max-w-md text-center space-y-6 p-8 bg-card border rounded-lg shadow-2xl">
        <div className="flex justify-center">
          <AlertTriangle className="h-16 w-16 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Adblock Detected</h2>
        <p className="text-muted-foreground">
          It looks like you are using an Adblocker or a DNS that blocks ads. 
          Please disable it or whitelist our site to continue using the application.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
        >
          I've Disabled It
        </button>
      </div>
    </div>
  );
}
