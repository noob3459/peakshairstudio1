import type { Metadata } from "next";

// Defense in depth alongside public/robots.txt: even if a search engine
// ignores robots.txt, this tells it directly not to index anything under
// /staff. The real access control is still the server-side session check in
// proxy.ts — this is just about keeping staff URLs out of search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
