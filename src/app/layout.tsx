import type { Metadata, Viewport } from "next";
import { Barlow, Figtree } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PwaRuntime } from "@/components/pwa/PwaRuntime"
import { ThemeColor } from "@/components/shells/ThemeColor";
import { THEME_SCRIPT } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// next/font self-hosts at build time (no runtime requests to Google Fonts).
// Figtree stands in for the reference app's Proxima Nova (text); Barlow for DIN 2014 (numerals). See docs/design/spec.md §3.
const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
});

const barlow = Barlow({
  variable: "--font-numeric",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

// iOS shows no launch screen unless one matches the device exactly (public/splash, made by scripts/gen-pwa-assets.py).
// [device width, height, pixel ratio]: a small mark on the page ground, in both colour schemes.
const LAUNCH_SIZES = [[430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [440, 956, 3], [402, 874, 3], [834, 1194, 2], [1024, 1366, 2], [810, 1080, 2], [768, 1024, 2], [834, 1112, 2]]
const LAUNCH_SCREENS = LAUNCH_SIZES.flatMap(([w, h, r]) =>
  (["dark", "light"] as const).map((scheme) => ({
    url: `/splash/${w}x${h}@${r}-${scheme}.png`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
  })),
)

const DESCRIPTION =
  "Recovery, strain and sleep from your Fitbit Air: Healthspan, Energy Bank, stress and a journal, all on your own server.";

export const metadata: Metadata = {
  title: { default: "Pulse", template: "%s · Pulse" },
  description: DESCRIPTION,
  applicationName: "Pulse",
  appleWebApp: { capable: true, title: "Pulse", statusBarStyle: "black-translucent", startupImage: LAUNCH_SCREENS },
  formatDetection: { telephone: false, email: false, address: false },
  // Private, single-user app behind its own sign-in: keep it out of search indexes.
  robots: { index: false, follow: false, nocache: true },
  openGraph: { title: "Pulse", description: DESCRIPTION, siteName: "Pulse", type: "website" },
};

// width=device-width, initial-scale=1, viewport-fit=cover for the safe-area insets; zoom is never disabled (spec §9).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // First paint only; ThemeColor follows the theme and the page's ground from there. Values mirror --theme-color.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8f9" },
    { media: "(prefers-color-scheme: dark)", color: "#1d2529" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${figtree.variable} ${barlow.variable} h-full scroll-pt-[calc(120px+env(safe-area-inset-top))] scroll-pb-[110px] antialiased md:scroll-pb-24`}
    >
      <head>
        {/* Settings › Appearance (system, light or dark, per device). Inline and first in <head>, so the class is on <html>
            before anything paints: next/script's beforeInteractive is queued and ran after first paint (a dark flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Next's own manifest link omits crossorigin outside Vercel previews; child layouts set manifest: null. */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
        <ThemeColor />
        <PwaRuntime />
      </body>
    </html>
  );
}
