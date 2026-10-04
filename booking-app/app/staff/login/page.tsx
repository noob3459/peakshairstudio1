"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { usernameToSyntheticEmail } from "@/lib/staffAccounts";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/staff";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const email = usernameToSyntheticEmail(username);
      if (!email) {
        // Deliberately the same message as a wrong password — don't confirm
        // or deny which usernames exist.
        setError("Incorrect username or password.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Incorrect username or password.");
        return;
      }
      router.replace(from);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-login-shell">
      <div className="admin-login-card">
        <p className="eyebrow">Peaks Hair Studio</p>
        <h1 className="page-title" style={{ fontSize: "1.6rem" }}>
          Staff Sign In
        </h1>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div aria-live="assertive">{error && <p className="form-error">{error}</p>}</div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="booking-privacy-note" style={{ marginTop: "1.5rem" }}>
          This area is for Peaks Hair Studio staff only — everyone has their own login. Forgot
          your password? The owner or developer account can reset it from the Users page.
        </p>
      </div>
      <a href="/home.html" className="admin-visit-site">
        ← Return to site
      </a>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
