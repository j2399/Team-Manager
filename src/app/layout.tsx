import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const themePreference = (user as any)?.themePreference ?? "system";
  const initialDarkClass = themePreference === "dark" ? "dark" : "";

  return (
    <html lang="en" suppressHydrationWarning className={initialDarkClass}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  var pref = ${JSON.stringify(themePreference)};
  var root = document.documentElement;
  root.dataset.theme = pref;
  function apply(){
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', !!dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  }
  apply();
  if(pref === 'system' && window.matchMedia){
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
    } catch(e) {}
  }
})();`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
