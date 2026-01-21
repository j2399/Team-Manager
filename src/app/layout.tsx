import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeClient } from "@/components/ThemeClient";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CuPI Platform",
  description: "Cornell Physical Intelligence Team Management",
  icons: {
    icon: "/CUPI logos.png",
    shortcut: "/CUPI logos.png",
    apple: "/CUPI logos.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script to prevent theme flash - runs before any CSS */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('cupi_theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var isDark = theme === 'dark' || (theme !== 'light' && prefersDark);
                  
                  var root = document.documentElement;
                  if (isDark) {
                    root.classList.add('dark');
                    root.style.colorScheme = 'dark';
                  } else {
                    root.classList.remove('dark');
                    root.style.colorScheme = 'light';
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        {/* Inline critical CSS - inject CSS variables for immediate use */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Prevent flash by setting CSS variables before Tailwind loads */
              html {
                --background: oklch(1 0 0);
                --foreground: oklch(0.145 0 0);
                --card: oklch(1 0 0);
                --card-foreground: oklch(0.145 0 0);
                --muted: oklch(0.97 0 0);
                --muted-foreground: oklch(0.556 0 0);
                --accent: oklch(0.97 0 0);
                --border: oklch(0.922 0 0);
                background-color: #ffffff;
                color: #262626;
              }
              html.dark {
                --background: oklch(0.06 0 0);
                --foreground: oklch(0.93 0 0);
                --card: oklch(0.11 0 0);
                --card-foreground: oklch(0.93 0 0);
                --muted: oklch(0.16 0 0);
                --muted-foreground: oklch(0.55 0 0);
                --accent: oklch(0.18 0 0);
                --border: oklch(0.22 0 0);
                background-color: #0f0f0f;
                color: #ededed;
              }
              body { background-color: inherit; color: inherit; }
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background`}>
        <ThemeClient />
        {children}
      </body>
    </html>
  );
}
