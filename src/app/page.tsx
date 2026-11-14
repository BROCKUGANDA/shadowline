/**
 * SHADOWLINE landing page — SERVER COMPONENT (v1.2.0 SSR architecture).
 *
 * Public marketing surface: NFL-themed 3D hero (pure presentation — no
 * dataset content), the research hypothesis, the eleven analyst modules,
 * and the honesty policy.
 *
 * Rendering strategy (custom SSR + CSR):
 *   SSR  — the whole marketing shell, copy, and footer render on the server
 *          (no client JS needed to read them). The hero entrance animation
 *          is pure CSS, so it runs even without JS.
 *   SSR  — LiveStatusSection prefetches the ["health"] TanStack Query on the
 *          server (direct artifact read, no HTTP self-call) and streams it
 *          inside <Suspense>; the chips ship with REAL pipeline data in the
 *          initial HTML.
 *   CSR  — the 3D hero (WebGL, ssr:false), the scroll-reveal animations and
 *          the 30 s health polling hydrate client-side. Below-fold reveal
 *          wrappers keep their children server-rendered (RSC composition)
 *          and never hide content from no-JS or reduced-motion visitors.
 *
 * The pipeline status chips are LIVE data; every other claim on this page is
 * an engineering fact verified by the test suite.
 */
import { Suspense } from "react";
import Link from "next/link";
import {
  QueryClient,
  dehydrate,
  type DehydratedState,
} from "@tanstack/react-query";
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  Lock,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getHealthSnapshot } from "@/lib/health";
import { Hero } from "@/components/landing/hero";
import { Reveal } from "@/components/landing/reveal";
import { LiveStatusChips } from "@/components/landing/live-status-chips";
import { LandingQueryProvider } from "@/components/landing/query-provider";

export const dynamic = "force-dynamic";

const MODULES: { label: string; desc: string; icon: LucideIcon }[] = [
  { label: "Command Center", desc: "Live pipeline state, stage statuses, activation path", icon: LayoutDashboard },
  { label: "Player Explorer", desc: "Roster, positions, cohort filters (on data)", icon: Users },
  { label: "Tracking Laboratory", desc: "Frame-level playback, speed & separation traces", icon: Activity },
  { label: "Combine Drill Explorer", desc: "Drill taxonomy and attempt-level structure", icon: ListChecks },
  { label: "Movement Intelligence", desc: "MRI components with mathematical definitions", icon: Gauge },
  { label: "NFL Coverage Analysis", desc: "Coverage attempts and motion outcomes", icon: ShieldCheck },
  { label: "Combine-to-Game Translation", desc: "Model A/B/C comparison framework", icon: ArrowLeftRight },
  { label: "Athlete Comparison", desc: "Side-by-side movement profiles", icon: GitCompareArrows },
  { label: "Scouting Report Generator", desc: "Persisted, user-authored reports", icon: FileText },
  { label: "Research Evidence & Model Audit", desc: "Pre-registered hypotheses, diagnostics", icon: FlaskConical },
  { label: "Dataset & Pipeline Health", desc: "Checksums, schemas, provenance, run log", icon: Database },
];

const HYPOTHESIS_STEPS = [
  {
    step: "01",
    title: "Measure at the Combine",
    body: "10 Hz Zebra sensor tracking from the 2023–2025 Combines: reorientation latency, redirection efficiency, exit acceleration and attempt-to-attempt consistency across drill attempts.",
  },
  {
    step: "02",
    title: "Compose the MRI",
    body: "Five independently-validated components combine into the Mirror Response Index — a defender movement quality score computed with circular-angle mathematics and validated against synthetic ground truth.",
  },
  {
    step: "03",
    title: "Test against NFL coverage",
    body: "Player-level train/test separation, clustered inference, FDR control and leave-one-cohort-out validation link Combine movement to regular-season coverage outcomes. The result is whatever the data says.",
  },
];

// ---------------------------------------------------------------------------
// Live status — async SERVER component: prefetch + hydrate (streamed)
// ---------------------------------------------------------------------------
async function LiveStatusSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000 } },
  });
  await queryClient.prefetchQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const snapshot = await getHealthSnapshot();
      if (!snapshot.ok) throw new Error(snapshot.error);
      return snapshot.data;
    },
  });
  const dehydratedState: DehydratedState = dehydrate(queryClient);
  return (
    <LandingQueryProvider dehydratedState={dehydratedState}>
      <LiveStatusChips />
    </LandingQueryProvider>
  );
}

function LiveStatusFallback() {
  return (
    <div className="flex flex-wrap gap-2" aria-label="pipeline status loading">
      <span className="h-7 w-32 animate-pulse rounded-md bg-white/10" />
      <span className="h-7 w-40 animate-pulse rounded-md bg-white/10" />
      <span className="h-7 w-28 animate-pulse rounded-md bg-white/10" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page (server)
// ---------------------------------------------------------------------------
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#060b09] text-zinc-100 antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-emerald-500 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#04160e]"
      >
        Skip to main content
      </a>

      {/* Nav (server-rendered, static) */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#060b09]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="size-2.5 rounded-[2px] bg-emerald-500" aria-hidden="true" />
            <div>
              <p className="text-base leading-none font-bold tracking-tight">SHADOWLINE</p>
              <p className="mt-0.5 text-[10px] tracking-[0.18em] text-zinc-500 uppercase">
                Combine-to-Game Movement Intelligence
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-4 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
            >
              <Lock className="size-3.5" aria-hidden="true" />
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-[#04160e] transition-colors hover:bg-emerald-400"
            >
              Enter demo
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content">
        {/* Hero with 3D scene — text is server-rendered, CSS-animated */}
        <section className="relative flex min-h-[92vh] items-center overflow-hidden">
          <div
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,rgba(16,84,56,0.35),transparent_60%)]"
            aria-hidden="true"
          />
          <Hero />
          <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pt-24 pb-16 sm:px-6">
            <div className="max-w-2xl">
              <p className="hero-rise mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-700/50 bg-emerald-950/40 px-3 py-1 font-mono text-[11px] font-semibold tracking-widest text-emerald-300 uppercase">
                NFL Big Data Bowl 2027 · Research Platform
              </p>
              <h1 className="hero-rise hero-rise-delayed-1 text-4xl leading-[1.05] font-bold tracking-tight text-white sm:text-6xl">
                The shadow a cornerback casts at the Combine,
                <span className="text-emerald-400"> measured</span>.
              </h1>
              <p className="hero-rise hero-rise-delayed-1 mt-6 max-w-xl text-base leading-relaxed text-zinc-300 sm:text-lg">
                SHADOWLINE links 10 Hz pre-draft sensor movement to NFL coverage
                performance through the Mirror Response Index — an honest,
                artifact-driven research platform where every number is computed
                from competition data or not shown at all.
              </p>
              <div className="hero-rise hero-rise-delayed-2 mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center gap-2 rounded-md bg-emerald-500 px-6 text-sm font-semibold text-[#04160e] shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-400"
                >
                  Enter the demo environment
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <a
                  href="#hypothesis"
                  className="inline-flex h-12 items-center rounded-md border border-white/15 bg-white/5 px-6 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
                >
                  How it works
                </a>
              </div>
              <div className="hero-rise hero-rise-delayed-2 mt-8">
                <Suspense fallback={<LiveStatusFallback />}>
                  <LiveStatusSection />
                </Suspense>
              </div>
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#060b09]"
            aria-hidden="true"
          />
        </section>

        {/* Hypothesis (server content, client reveal) */}
        <section id="hypothesis" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <Reveal>
            <p className="font-mono text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              The research hypothesis
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Pre-draft movement features predict regular-season coverage performance.
            </h2>
            <p className="mt-4 max-w-2xl text-zinc-400">
              Focused on defensive backs, tested with pre-registered statistics and
              player-level leakage guards. If the data disagrees, the platform
              reports the null.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {HYPOTHESIS_STEPS.map((s, i) => (
              <Reveal key={s.step} delay={i * 0.12}>
                <div className="h-full rounded-xl border border-white/8 bg-white/[0.03] p-6">
                  <p className="font-mono text-3xl font-bold text-emerald-500/70">{s.step}</p>
                  <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Modules */}
        <section className="border-t border-white/5 bg-[#081109] py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <p className="font-mono text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
                The platform
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Eleven analyst modules, one honesty policy.
              </h2>
              <p className="mt-4 max-w-2xl text-zinc-400">
                Every module reads persisted pipeline artifacts through typed APIs.
                Modules whose data is not yet ingested say so — with the exact
                command that activates them.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m, i) => {
                const Icon = m.icon;
                return (
                  <Reveal key={m.label} delay={(i % 3) * 0.08}>
                    <div className="h-full rounded-xl border border-white/8 bg-white/[0.03] p-5 transition-colors hover:border-emerald-700/50 hover:bg-emerald-950/20">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex size-9 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
                          <Icon className="size-4.5" aria-hidden="true" />
                        </span>
                        <h3 className="text-sm font-semibold text-zinc-100">{m.label}</h3>
                      </div>
                      <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">{m.desc}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Honesty */}
        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <Reveal>
              <div>
                <p className="font-mono text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
                  Honest by design
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  No fabricated numbers. Ever.
                </h2>
                <ul className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-400">
                  <li className="flex gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span>
                      <strong className="text-zinc-200">Honest gating.</strong> Stages that
                      need the competition dataset report <code className="rounded bg-white/10 px-1 font-mono text-xs">gated_on_data</code> with
                      the exact ingestion command — absence is never substituted with synthetic values.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span>
                      <strong className="text-zinc-200">Labelled synthetic content.</strong> The only
                      synthetic fixture — used to validate algorithms and demonstrate the Tracking
                      Laboratory — carries a persistent banner.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span>
                      <strong className="text-zinc-200">Verified engineering.</strong> Automated
                      tests across ingestion, kinematics, MRI math and statistical guards
                      (leakage, clustering, FDR), plus browser-verified UI on desktop and mobile.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span>
                      <strong className="text-zinc-200">Data governance.</strong> SHA-256 checksums pin
                      every audited input; raw data stays out of version control; provenance is
                      recorded per run.
                    </span>
                  </li>
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="rounded-xl border border-white/8 bg-[#0a120d] p-6 font-mono text-[13px] leading-relaxed">
                <p className="text-zinc-500"># activate every analytical module</p>
                <p className="mt-2 text-zinc-300">
                  <span className="text-emerald-400">$</span> kaggle competitions download nfl-big-data-bowl-2027
                </p>
                <p className="text-zinc-300">
                  <span className="text-emerald-400">$</span> cp *.csv data/raw/
                </p>
                <p className="text-zinc-300">
                  <span className="text-emerald-400">$</span> python -m shadowline preflight
                </p>
                <p className="text-zinc-300">
                  <span className="text-emerald-400">$</span> python -m shadowline all
                </p>
                <p className="mt-4 text-zinc-500"># every module flips to live analysis automatically</p>
                <p className="mt-2 text-emerald-400">audit quality features coverage research</p>
                <p className="text-zinc-400">→ ok | gated_on_data | insufficient_n</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-white/5 bg-[#081109] py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <Reveal>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Step onto the field.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-zinc-400">
                The demo environment runs the full platform: eleven modules, live
                pipeline state, interactive tracking playback and the scouting
                report generator.
              </p>
              <div className="mt-8">
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center gap-2 rounded-md bg-emerald-500 px-8 text-sm font-semibold text-[#04160e] shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-400"
                >
                  Sign in to the demo
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer (server-rendered, static) */}
      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <p className="text-xs text-zinc-500">
            SHADOWLINE · NFL Big Data Bowl 2027 research platform · deadline 6 Jan 2027
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-[11px] leading-relaxed text-zinc-600">
            Independent research project. Not affiliated with, endorsed by, or
            sponsored by the NFL, NFL Football Operations, or Kaggle. The 3D
            scene on this page is presentation only and contains no dataset
            content.
          </p>
        </div>
      </footer>
    </div>
  );
}
