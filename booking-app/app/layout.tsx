import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peaks Hair Studio",
  description: "Book an appointment at Peaks Hair Studio in Apple Valley, CA.",
  icons: { icon: "/images/favicon.png" },
};

// Same Google Fonts (Fraunces + Inter) as the static public/*.html pages, loaded
// the same way, so /book and /staff match the rest of the site's typography
// exactly instead of introducing a second font-loading strategy.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
