import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "SHADOWLINE — Combine-to-Game Movement Intelligence",
  description:
    "SHADOWLINE is the NFL Big Data Bowl 2027 research platform: an honest, artifact-driven analytics front-end for the Mirror Response Index. Every value is computed by the pipeline from competition data; synthetic content is always labelled; gated modules await dataset ingestion.",
  keywords: [
    "NFL",
    "Big Data Bowl 2027",
    "SHADOWLINE",
    "Mirror Response Index",
    "combine tracking",
    "coverage analytics",
    "movement intelligence",
  ],
  authors: [{ name: "SHADOWLINE research team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "SHADOWLINE — Combine-to-Game Movement Intelligence",
    description:
      "NFL Big Data Bowl 2027 research platform. Artifact-driven analytics; no fabricated data.",
    siteName: "SHADOWLINE",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
