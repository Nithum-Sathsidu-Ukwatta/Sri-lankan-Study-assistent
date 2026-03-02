
import React, { useEffect } from 'react';

export const AdBanner: React.FC = () => {
  useEffect(() => {
    // This looks for the ad script and tries to push the ad.
    // Ensure you have added the main AdSense script tag in your index.html head as well.
    try {
      // @ts-ignore
      if (window.adsbygoogle) {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (e) {
      console.error("AdSense error", e);
    }
  }, []);

  return (
    <div className="w-full bg-white border-t border-slate-200 py-3 px-4 flex justify-center items-center print:hidden">
      <div className="w-full max-w-[728px] min-h-[90px] bg-slate-50 border border-slate-200 border-dashed rounded-lg flex flex-col items-center justify-center text-slate-400 relative overflow-hidden">
        
        {/* --- GOOGLE ADSENSE IMPLEMENTATION --- */}
        {/* 
            1. Create an Ad Unit in Google AdSense.
            2. Paste the <ins> code below.
            3. Uncomment the code below and remove the "Placeholder" div.
        */}

        {/* 
        <ins className="adsbygoogle"
             style={{ display: 'block' }}
             data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" // REPLACE WITH YOUR ID
             data-ad-slot="XXXXXXXXXX" // REPLACE WITH YOUR SLOT ID
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
        */}

        {/* --- PLACEHOLDER (Remove this when you add the real code above) --- */}
        <div className="flex flex-col items-center p-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300 mb-1">Advertisement</span>
            <span className="text-xs text-center">
                To enable ads:<br/>
                1. Create AdSense Account<br/>
                2. Paste code in <code>components/AdBanner.tsx</code>
            </span>
        </div>

      </div>
    </div>
  );
};
