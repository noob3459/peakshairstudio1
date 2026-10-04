import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Protects every admin page and every admin API route server-side via Supabase
// Auth's session cookie. This is the actual authorization boundary — not
// merely hiding links in the UI. Fails closed: any error reading the session
// (misconfigured env, Supabase unreachable) is treated as "not authenticated"
// rather than letting the request through.
// Named `proxy` per Next.js 16's renamed convention (formerly `middleware`).
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminApi = pathname.startsWith("/api/admin/") && pathname !== "/api/admin/login";
  const isAdminPage = pathname.startsWith("/staff") && pathname !== "/staff/login";

  if (!isAdminApi && !isAdminPage) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: req });
  let authenticated = false;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase env vars not configured");
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) req.cookies.set(name, value);
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticated = Boolean(user);
  } catch (err) {
    console.error("Admin session check failed, denying access:", err);
    authenticated = false;
  }

  if (authenticated) {
    return response;
  }

  if (isAdminApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/staff/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/staff/:path*", "/api/admin/:path*"],
};
