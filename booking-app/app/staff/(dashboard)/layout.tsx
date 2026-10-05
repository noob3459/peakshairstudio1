"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AccessRole = "stylist" | "manager" | "dev";
type Me = { name: string; role: string; accessRole: AccessRole } | null;

const BRAND_LABEL: Record<AccessRole, string> = {
  dev: "Developer",
  manager: "Owner",
  stylist: "Stylist",
};

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me>(null);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/staff/login");
    router.refresh();
  }

  const canActAcrossStylists = me?.accessRole === "manager" || me?.accessRole === "dev";
  const canSeeProposals = me?.accessRole === "manager" || me?.accessRole === "dev";

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <a className="admin-topbar-brand" href="/home.html">
          Peaks Hair Studio <span className="admin-topbar-brand-role">{me ? BRAND_LABEL[me.accessRole] : ""}</span>
        </a>
        <nav className="admin-nav" aria-label="Staff">
          <a href="/staff" aria-current={pathname === "/staff" ? "page" : undefined}>
            Appointments
          </a>
          <a
            href="/staff/availability"
            aria-current={pathname === "/staff/availability" ? "page" : undefined}
          >
            {canActAcrossStylists ? "Availability" : "My Availability"}
          </a>
          {canActAcrossStylists && (
            <a href="/staff/users" aria-current={pathname === "/staff/users" ? "page" : undefined}>
              Users
            </a>
          )}
          {canSeeProposals && (
            <a href="/staff/proposals" aria-current={pathname === "/staff/proposals" ? "page" : undefined}>
              {me?.accessRole === "dev" ? "Proposals" : "Propose a Change"}
            </a>
          )}
          {me?.accessRole === "dev" && (
            <a href="/staff/activity" aria-current={pathname === "/staff/activity" ? "page" : undefined}>
              Activity Log
            </a>
          )}
        </nav>
        <div className="admin-topbar-user">
          {me && <span className="admin-whoami">{me.name}</span>}
          <button type="button" className="admin-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" className="admin-main">
        {children}
      </main>
      <a href="/" className="admin-visit-site">
        ← Return to site
      </a>
    </div>
  );
}
