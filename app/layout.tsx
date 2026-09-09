import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { PROFILE } from "@/lib/content";

/* Display face: squared technical sans — reads like instrument silkscreen. */
const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

/* Workhorse: mono for every readout, label and body block. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `${PROFILE.name} — Flight Ops Portfolio`,
  description:
    "Ground control station for the engineering work of " +
    `${PROFILE.name}: autonomy, simulation-in-the-loop, precision landing and full-stack systems.`,
  applicationName: "MISSION CONTROL",
  authors: [{ name: PROFILE.name }],
  keywords: [
    "autonomy",
    "UAV",
    "SITL",
    "precision landing",
    "computer vision",
    "portfolio",
  ],
  openGraph: {
    title: `${PROFILE.name} — Flight Ops Portfolio`,
    description: PROFILE.tagline,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#04070a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${chakra.variable} ${plexMono.variable} h-full antialiased`}
      /* The arrival gate below runs before hydration and sets data-intro plus a
         scroll-lock class on this element. Without this, React treats those as a
         hydration mismatch, re-renders the root and strips them back off. */
      suppressHydrationWarning
    >
      <head>
        {/* Arrival gate. Runs before first paint so the deck is never briefly
            visible behind the intro. Decides once, here, whether the cold-open
            plays at all — reduced motion, deep links and repeat visits skip it.
            The timeout is a failsafe: if the app never hydrates, scrolling is
            handed back rather than locked forever. Keep in step with
            WATCHDOG_MS in lib/intro-profile.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var d=document.documentElement;
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
if(location.hash.length>1)return;
try{if(sessionStorage.getItem('gcs.booted')==='1')return}catch(e){}
d.dataset.intro='armed';d.classList.add('gcs-locked');
setTimeout(function(){if(d.dataset.intro==='armed'){d.removeAttribute('data-intro');d.classList.remove('gcs-locked')}},24000);
}catch(e){}})()`,
          }}
        />
        {/* Without JS the observers never fire, so unhide everything that is
            normally revealed on scroll. Nav, meters and flight logs included. */}
        <noscript>
          <style>{`
            .gcs-reveal { opacity: 1 !important; transform: none !important; }
            .gcs-chrome-gate { opacity: 1 !important; }
            .gcs-meter { transform: scaleX(var(--level, 1)) !important; }
            .gcs-collapse { grid-template-rows: 1fr !important; }
          `}</style>
        </noscript>
      </head>
      <body className="bg-void text-ink min-h-full">
        <a
          href="#deck"
          className="bg-signal text-void focus:ring-data sr-only px-4 py-2 text-label font-semibold tracking-label focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100"
        >
          SKIP TO CONTENT
        </a>
        {children}
      </body>
    </html>
  );
}
