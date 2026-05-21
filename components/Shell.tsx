"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const NAV = [
  { href: "/dashboard", label: "Today", short: "Today" },
  { href: "/scanner", label: "Scanner", short: "Scan" },
  { href: "/thesis/new", label: "+ Thesis", short: "New" },
  { href: "/positions", label: "Open", short: "Open" },
  { href: "/journal", label: "Journal", short: "Log" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — desktop nav lives here */}
      <header className="border-b border-ink-800 px-4 py-3 flex items-center justify-between sticky top-0 bg-ink-950/90 backdrop-blur z-20">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold tracking-tight text-signal-green">
            edge
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink-100">
            log
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 text-sm rounded-sm transition-colors ${
                pathname?.startsWith(n.href)
                  ? "bg-ink-800 text-ink-50"
                  : "text-ink-400 hover:text-ink-100"
              }`}
            >
              {n.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="ml-2 px-3 py-1.5 text-sm text-ink-500 hover:text-ink-200"
          >
            Sign out
          </button>
        </nav>
      </header>

      {/* Main */}
      <main className="flex-1 pb-20 md:pb-8 fade-up">{children}</main>

      {/* Bottom nav — mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 border-t border-ink-800 bg-ink-950/95 backdrop-blur z-20">
        <div className="grid grid-cols-5">
          {NAV.map((n) => {
            const active = pathname?.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`py-3 text-center text-xs ${
                  active ? "text-signal-green" : "text-ink-500"
                }`}
              >
                {n.short}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
