import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#060b09] px-4 text-center text-zinc-100 antialiased">
      <p className="font-mono text-xs font-semibold tracking-[0.25em] text-emerald-400 uppercase">
        404 · route not found
      </p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        This play isn&apos;t in the playbook.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
        The page you asked for does not exist. The analyst platform lives at
        /app; the project overview lives at the landing page.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-md border border-white/15 bg-white/5 px-5 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
        >
          Landing page
        </Link>
        <Link
          href="/app"
          className="inline-flex h-11 items-center rounded-md bg-emerald-500 px-5 text-sm font-semibold text-[#04160e] transition-colors hover:bg-emerald-400"
        >
          Analyst platform
        </Link>
      </div>
    </div>
  );
}
