import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The 7 marketing pages are plain static HTML served from /public (so their
  // existing markup/behavior is unchanged). Next.js only serves them at their
  // exact filenames (e.g. /services.html), not at "/", so root gets a redirect
  // to the homepage file — matching how the existing site already links to
  // itself internally (href="home.html").
  async redirects() {
    return [
      {
        source: "/",
        destination: "/home.html",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
