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
        {/* Inline critical CSS to set backgrounds before external CSS loads */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Light mode defaults */
              html { background-color: #ffffff; color: #262626; }
              
              /* Dark mode overrides - must match globals.css .dark values */
              html.dark { background-color: #0f0f0f; color: #ededed; }
              html.dark [class*="bg-card"] { background-color: rgba(28, 28, 28, 0.8) !important; }
              html.dark [class*="bg-background"] { background-color: #0f0f0f !important; }
              html.dark [class*="bg-muted"] { background-color: #292929 !important; }
              html.dark [class*="bg-accent"] { background-color: #2e2e2e !important; }
              
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
