"use client";

/**
 * AppShell — global chrome for the SHADOWLINE platform.
 *
 * Layout: sticky header (wordmark + competition badge + version/data chips),
 * left sidebar nav (11 modules; collapses into a Sheet under lg), main view
 * area (lazy-switched modules, one error boundary each), sticky footer with
 * the honesty statement + run_id.
 */
import { Suspense, lazy, useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeftRight,
  Database,
  FlaskConical,
  FileText,
  Gauge,
  GitCompareArrows,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAppStore, type ViewId } from "@/lib/view-store";
import { useHealth, useSession, logout } from "@/hooks/use-shadowline";
import { ModuleErrorBoundary } from "@/components/shadowline/error-boundary";
import { ModuleSkeleton } from "@/components/shadowline/skeletons";
import { OfflineBanner } from "@/components/shadowline/offline-banner";

// ---------------------------------------------------------------------------
// Lazy module views (one file per module under views/)
// ---------------------------------------------------------------------------
const VIEWS: Record<ViewId, ComponentType> = {
  command: lazy(() => import("./views/command-center")),
  players: lazy(() => import("./views/player-explorer")),
  lab: lazy(() => import("./views/tracking-lab")),
  drills: lazy(() => import("./views/combine-drill-explorer")),
  mri: lazy(() => import("./views/movement-intelligence")),
  coverage: lazy(() => import("./views/coverage-analysis")),
  translation: lazy(() => import("./views/translation")),
  compare: lazy(() => import("./views/athlete-comparison")),
  reports: lazy(() => import("./views/report-generator")),
  research: lazy(() => import("./views/research-audit")),
  health: lazy(() => import("./views/dataset-health")),
};

const VIEW_LABELS: Record<ViewId, string> = {
  command: "Command Center",
  players: "Player Explorer",
  lab: "Tracking Laboratory",
  drills: "Combine Drill Explorer",
  mri: "Movement Intelligence",
  coverage: "NFL Coverage Analysis",
  translation: "Combine-to-Game Translation",
  compare: "Athlete Comparison",
  reports: "Scouting Report Generator",
  research: "Research Evidence & Model Audit",
  health: "Dataset & Pipeline Health",
};

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
}
interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: "Overview",
    items: [{ id: "command", label: "Command Center", icon: LayoutDashboard }],
  },
  {
    group: "Exploration",
    items: [
      { id: "players", label: "Player Explorer", icon: Users },
      { id: "lab", label: "Tracking Laboratory", icon: Activity },
      { id: "drills", label: "Combine Drill Explorer", icon: ListChecks },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { id: "mri", label: "Movement Intelligence", icon: Gauge },
      { id: "coverage", label: "NFL Coverage Analysis", icon: ShieldCheck },
      { id: "translation", label: "Combine-to-Game Translation", icon: ArrowLeftRight },
      { id: "compare", label: "Athlete Comparison", icon: GitCompareArrows },
    ],
  },
  {
    group: "Operations",
    items: [
      { id: "reports", label: "Scouting Report Generator", icon: FileText },
      { id: "research", label: "Research Evidence & Model Audit", icon: FlaskConical },
      { id: "health", label: "Dataset & Pipeline Health", icon: Database },
    ],
  },
];

// ---------------------------------------------------------------------------
// Navigation list (shared by desktop sidebar and mobile sheet)
// ---------------------------------------------------------------------------
function NavList() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  return (
    <nav aria-label="Module navigation" className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
      {NAV_GROUPS.map((group) => (
        <div key={group.group}>
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.2em] text-zinc-600 uppercase">
            {group.group}
          </p>
          <ul>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setView(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-md border-l-2 pr-3 pl-3 text-left text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70",
                      active
                        ? "border-emerald-500 bg-emerald-500/10 font-medium text-emerald-300"
                        : "border-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-emerald-400" : "text-zinc-500"
                      )}
                      aria-hidden="true"
                    />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Header chips (health-derived)
// ---------------------------------------------------------------------------
function VersionChip() {
  const { data, isPending } = useHealth();
  if (isPending) {
    return <Skeleton className="h-7 w-40 rounded-md bg-zinc-900" aria-label="loading pipeline version" />;
  }
  if (!data) {
    return (
      <span className="inline-flex h-7 items-center rounded-md border border-red-900 bg-red-950/40 px-2.5 font-mono text-[11px] text-red-300">
        API ERROR
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-7 items-center rounded-md border border-zinc-700 bg-[#101613] px-2.5 font-mono text-[11px] text-zinc-400"
      title={`pipeline ${data.pipeline_version} · metric ${data.metric_version}`}
    >
      pipeline&nbsp;<span className="text-zinc-200">v{data.pipeline_version}</span>
      &nbsp;·&nbsp;mri&nbsp;<span className="text-zinc-200">{data.metric_version}</span>
    </span>
  );
}

function DataStatusChip() {
  const { data, isPending } = useHealth();
  if (isPending) {
    return <Skeleton className="h-7 w-36 rounded-md bg-zinc-900" aria-label="loading dataset status" />;
  }
  if (!data) {
    return (
      <span className="inline-flex h-7 items-center gap-2 rounded-md border border-red-900 bg-red-950/40 px-2.5 font-mono text-[11px] font-semibold text-red-300">
        STATUS UNKNOWN
      </span>
    );
  }
  return data.data_present ? (
    <span className="inline-flex h-7 items-center gap-2 rounded-md border border-emerald-800 bg-emerald-950/50 px-2.5 font-mono text-[11px] font-semibold text-emerald-300">
      <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
      DATASET ACTIVE
      <span className="sr-only">competition dataset present</span>
    </span>
  ) : (
    <span className="inline-flex h-7 items-center gap-2 rounded-md border border-amber-800 bg-amber-950/40 px-2.5 font-mono text-[11px] font-semibold text-amber-300">
      <span className="size-2 rounded-full bg-amber-400" aria-hidden="true" />
      DATASET GATED
      <span className="sr-only">competition dataset not ingested</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Session chip + logout (demo auth)
// ---------------------------------------------------------------------------
function UserMenu() {
  const router = useRouter();
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  if (!session?.authenticated || !session.user) return null;
  const u = session.user;
  return (
    <div className="flex items-center gap-2">
      <span
        title={`${u.email} · ${u.tenant} tenant`}
        className="hidden h-7 items-center gap-2 rounded-md border border-zinc-700 bg-[#101613] px-2.5 font-mono text-[11px] text-zinc-300 sm:inline-flex"
      >
        <span
          className="flex size-4 items-center justify-center rounded-full bg-emerald-500/20 text-[9px] font-bold text-emerald-300"
          aria-hidden="true"
        >
          {u.name.slice(0, 1)}
        </span>
        {u.name}
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-emerald-300 uppercase">
          {u.role}
        </span>
      </span>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await logout();
          } finally {
            // Soft navigate + refresh: the router cache is revalidated and
            // the /login server gate re-decides with the cleared cookie.
            router.push("/login");
            router.refresh();
          }
        }}
        className="inline-flex size-9 items-center justify-center rounded-md border border-zinc-700 bg-transparent text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:opacity-50"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
export function AppShell() {
  const view = useAppStore((s) => s.view);
  const mobileNavOpen = useAppStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen);
  const setView = useAppStore((s) => s.setView);
  const { data: health } = useHealth();

  const ActiveView = VIEWS[view];

  // Theme the <body> too so Radix portals (sheet, selects, tooltips, toasts)
  // inherit the carbon scope.
  useEffect(() => {
    document.body.classList.add("dark", "shadowline");
    return () => {
      document.body.classList.remove("dark", "shadowline");
    };
  }, []);

  return (
    <div className="dark shadowline flex min-h-screen flex-col bg-[#0A0E0C] text-zinc-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-emerald-600 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#04160e]"
      >
        Skip to main content
      </a>

      <OfflineBanner />

      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#0A0E0C]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
            className="size-11 shrink-0 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>

          <div className="flex min-w-0 items-center gap-3">
            <span
              className="hidden size-2.5 rounded-[2px] bg-emerald-500 sm:block"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-lg leading-none font-bold tracking-tight text-zinc-50">
                SHADOWLINE
              </p>
              <p className="mt-1 hidden text-[11px] leading-none text-zinc-500 md:block">
                Combine-to-Game Movement Intelligence
              </p>
            </div>
            <span className="ml-1 hidden rounded-md border border-zinc-700 bg-[#101613] px-2 py-1 font-mono text-[10px] tracking-wide text-zinc-400 xl:inline-flex">
              NFL BIG DATA BOWL 2027
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <VersionChip />
            <DataStatusChip />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 items-stretch">
        <aside
          className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-[#0C1210] lg:flex"
          aria-label="Sidebar"
        >
          <NavList />
          <div className="border-t border-zinc-800/80 px-4 py-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <span aria-hidden="true">←</span> Landing page
            </Link>
          </div>
        </aside>

        <main
          id="main-content"
          className="min-w-0 flex-1"
        >
          <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
            <ModuleErrorBoundary viewLabel={VIEW_LABELS[view]}>
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <Suspense fallback={<ModuleSkeleton />}>
                  <ActiveView />
                </Suspense>
              </motion.div>
            </ModuleErrorBoundary>
          </div>
        </main>
      </div>

      <footer className="mt-auto border-t border-zinc-800/80 bg-[#0C1210]">
        <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6">
          <p className="max-w-4xl text-[11px] leading-relaxed text-zinc-500">
            All values computed by the SHADOWLINE pipeline from competition
            data. Synthetic content is always labelled. Gated modules await
            dataset ingestion.
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-zinc-600">
            run_id {health?.run_id ?? "—"} · shadowline v
            {health?.pipeline_version ?? "—"} · mri {health?.metric_version ?? "—"}
          </p>
        </div>
      </footer>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-72 gap-0 border-zinc-800 bg-[#0C1210] p-0 text-zinc-100 sm:max-w-72 [&>button]:text-zinc-400 [&>button]:hover:bg-zinc-800 [&>button]:hover:text-zinc-100"
        >
          <div className="border-b border-zinc-800/80 px-5 py-4">
            <SheetTitle className="text-base font-bold tracking-tight text-zinc-50">
              SHADOWLINE
            </SheetTitle>
            <SheetDescription className="mt-0.5 text-[11px] text-zinc-500">
              Combine-to-Game Movement Intelligence
            </SheetDescription>
          </div>
          <NavList />
        </SheetContent>
      </Sheet>
    </div>
  );
}
