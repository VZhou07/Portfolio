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
    >
      <body className="bg-void text-ink min-h-full">
        <a
          href="#missions"
          className="bg-signal text-void focus:ring-data sr-only px-4 py-2 text-label font-semibold tracking-label focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100"
        >
          SKIP TO MISSION LIST
        </a>
        {children}
      </body>
    </html>
  );
}
