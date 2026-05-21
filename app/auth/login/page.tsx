"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="flex items-baseline justify-center gap-2 mb-2">
            <span className="font-display text-3xl font-semibold text-signal-green">
              edge
            </span>
            <span className="font-display text-3xl font-semibold text-ink-100">
              log
            </span>
          </div>
          <div className="text-ink-500 text-xs uppercase tracking-[0.25em]">
            Thesis-driven trading
          </div>
        </div>

        <form onSubmit={signIn} className="space-y-4">
          <div>
            <label className="block text-[0.65rem] uppercase tracking-[0.2em] text-ink-500 mb-2">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[0.65rem] uppercase tracking-[0.2em] text-ink-500 mb-2">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {err && (
            <div className="text-signal-red text-sm border border-signal-red/30 bg-signal-red/10 p-2 rounded-sm">
              {err}
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          <div className="text-center text-sm text-ink-500">
            No account?{" "}
            <Link href="/auth/signup" className="text-signal-green hover:underline">
              Sign up
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
