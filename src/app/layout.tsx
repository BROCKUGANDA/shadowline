import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE = "https://shadowline.aiazimara.com";
const OG_IMAGE = "/og/shadowline-og.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "SHADOWLINE — Combine-to-Game Movement Intelligence",
    template: "%s · SHADOWLINE",
  },
  description:
    "NFL Big Data Bowl 2027 research platform. Do 10 Hz Combine sensor tracking metrics predict regular-season coverage performance beyond the stopwatch? A pre-registered, artifact-driven analysis with an honest null result — fully reproducible from the competition data.",
  applicationName: "SHADOWLINE",
  keywords: [
    "NFL",
    "NFL Big Data Bowl 2027",
    "SHADOWLINE",
    "Mirror Response Index",
    "MRI",
    "combine tracking",
    "10 Hz tracking",
    "Zebra tracking",
    "coverage analytics",
    "movement intelligence",
    "defensive backs",
    "combine-to-game",
    "sports analytics",
    "AI AZIMARA",
  ],
  authors: [{ name: "AI AZIMARA — SHADOWLINE research team", url: "https://aiazimara.com" }],
  creator: "AI AZIMARA",
  publisher: "AI AZIMARA",
  category: "sports",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-icon.png", sizes: "180x180" }],
    shortcut: ["/icons/icon-192.png"],
  },
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
    types: { "text/plain": "/llms.txt" },
  },
  openGraph: {
    title: "SHADOWLINE — Combine-to-Game Movement Intelligence",
    description:
      "NFL Big Data Bowl 2027 research platform. Do 10 Hz Combine tracking metrics predict regular-season coverage performance beyond the stopwatch? A pre-registered, reproducible answer — and an honest null.",
    url: SITE,
    siteName: "SHADOWLINE",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "SHADOWLINE — Combine-to-Game Movement Intelligence. 10 Hz tracking trail breaking at midfield.",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SHADOWLINE — Combine-to-Game Movement Intelligence",
    description:
      "NFL Big Data Bowl 2027 research platform. Pre-registered, reproducible, artifact-driven — and honest about a null result.",
    images: [OG_IMAGE],
    creator: "@aiazimara",
    site: "@aiazimara",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#060b09" },
    { media: "(prefers-color-scheme: light)", color: "#060b09" },
  ],
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://aiazimara.com/#organization",
      name: "AI AZIMARA",
      url: "https://aiazimara.com",
      logo: `${SITE}/icon.svg`,
      sameAs: ["https://shadowline.aiazimara.com"],
      description:
        "AI AZIMARA builds applied-intelligence research platforms and products across Africa, the Middle East and global markets.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "SHADOWLINE",
      description:
        "NFL Big Data Bowl 2027 research platform measuring Combine sensor tracking against regular-season coverage performance.",
      publisher: { "@id": "https://aiazimara.com/#organization" },
      inLanguage: "en",
    },
    {
      "@type": "SoftwareApplication",
      name: "SHADOWLINE",
      applicationCategory: "SportsApplication",
      operatingSystem: "web",
      url: SITE,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "A pre-registered, reproducible analysis platform for Combine-to-game movement intelligence: audit, tracking quality, Mirror Response Index extraction, coverage analytics and full statistical validation from the NFL Big Data Bowl 2027 competition package.",
      creator: { "@id": "https://aiazimara.com/#organization" },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is SHADOWLINE?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "SHADOWLINE is the NFL Big Data Bowl 2027 research platform: an artifact-driven front-end for the Mirror Response Index (MRI), a five-component kinematic measure of change-of-direction quality extracted from 10 Hz Combine sensor tracking.",
          },
        },
        {
          "@type": "Question",
          name: "Does Combine movement quality predict NFL coverage performance beyond the stopwatch?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "In the 2027 competition cohort, no: the pre-registered decision rule was not met. Partial Spearman rho = +0.230 (permutation p = 0.322; bootstrap 95% CI [-0.291, +0.737]); the notebook implementation gives rho = -0.151 (p = 0.490). SHADOWLINE reports the honest null.",
          },
        },
        {
          "@type": "Question",
          name: "Is the SHADOWLINE analysis reproducible?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. The full pipeline runs with one command (python -m shadowline all): 9-file audit with SHA-256, tracking quality gating, MRI feature extraction, coverage analytics on regular-season plays, and pre-registered statistical validation with player-grouped cross-validation, clustered bootstrap and permutation inference.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
