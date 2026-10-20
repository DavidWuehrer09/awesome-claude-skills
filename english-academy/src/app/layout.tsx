import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "English Academy", template: "%s · English Academy" },
  description: "Vocabulary mastery, C1/C2 writing and Abitur preparation in one calm study environment.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Academy", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#14171c" },
  ],
};

// Applies the saved theme before first paint (no flash). Static string, no user input.
const themeScript = `try{var t=localStorage.getItem("academy-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;if(localStorage.getItem("academy-reduced-motion")==="true")document.documentElement.dataset.reducedMotion="true"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
