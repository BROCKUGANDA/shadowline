"use client";

/**
 * LoginForm — client island on the SSR /login page.
 *
 * The SERVER page has already decided (from the session cookie) whether the
 * visitor is authenticated; this component only handles the interactive part:
 * the credential form, submit state, error surface and redirect on success.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

const DEMO_EMAIL = "demo@shadowline.io";
const DEMO_PASSWORD = "shadowline-demo";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();

  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Sign-in failed (${res.status})`);
        return;
      }
      router.replace(next.startsWith("/") ? next : "/app");
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="block text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 h-11 w-full rounded-md border border-white/10 bg-[#060b09] px-3 font-mono text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 h-11 w-full rounded-md border border-white/10 bg-[#060b09] px-3 font-mono text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-emerald-500 text-sm font-semibold text-[#04160e] transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Lock className="size-4" aria-hidden="true" />
        )}
        {pending ? "Signing in…" : "Sign in as Demo Scout"}
      </button>

      <p className="rounded-md border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-[12px] leading-relaxed text-amber-200/80">
        Demo credentials are pre-filled: <code className="font-mono">{DEMO_EMAIL}</code> /{" "}
        <code className="font-mono">{DEMO_PASSWORD}</code>. This is a demo
        session layer (HMAC-signed HttpOnly cookie, 8 h); production
        deployments would use an OIDC identity provider — see the
        commercial audit, finding F-01.
      </p>
    </form>
  );
}
