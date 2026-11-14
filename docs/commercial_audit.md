# SHADOWLINE Commercial & Enterprise Audit

**Date:** 2026-11-14 · **Release audited:** web app v1.2.0 (pipeline 1.0.0, metric mri-1.0) ·
**Auditor:** SHADOWLINE engineering (self-audit, evidence-backed)
**Scope:** the complete platform — research pipeline, web application, API layer,
deployment posture, commercial readiness for the NFL Big Data Bowl 2027
(deadline 2027-01-06 23:59 UTC, prize pool $100,000).

Method: every claim in this document is backed by an executable verification
performed in this session (commands and outcomes in Appendix A) or by an
existing test (89-case pytest suite + 21-case bun suite). Where something is
NOT done, it is listed as open with an owner and a remediation path — nothing
is marked complete without evidence.

v1.2.0 hardening pass (this release) covers two workstreams: (1) a complete
error/loading/boundary architecture with a custom SSR + CSR rendering split,
and (2) every severity in this audit advanced as far as honestly possible —
including the elimination of all known dependency vulnerabilities found by a
new OSV-powered scanner.

---

## 1. Executive summary

**Verdict: engineering-complete and commercially presentable; one blocking
commercial dependency (the competition dataset) that only the user can
remove.**

The platform enters this audit already strong on research integrity (honest
gating, checksums, leakage guards, pre-registered statistics — all
test-verified). v1.1.0 closed the first-reviewer gaps (auth, rate limiting,
security headers, logging, landing). **v1.2.0 closes the next tier**: a full
error/loading/boundary hierarchy with SSR + CSR streaming architecture, a
dependency-vulnerability scanner that found — and led to the elimination
of — 3 CRITICAL and 20 HIGH advisories in the dependency tree (next-auth
RCE-class, Next.js image-optimization RCE, sharp/libvips, zod DoS), a
Prometheus metrics endpoint, pluggable rate-limit storage, database backups,
a dataset preflight command for the one CRITICAL open item, and CI/Docker
deployment artifacts. What remains open is either a user action (data
acquisition, C-01) or a production-scale roadmap item (OIDC identity
provider, distributed rate limiting, OpenTelemetry) that a demo/research
deployment does not require and that we refuse to fake.

### Scorecard (before → after the v1.2.0 hardening pass)

| # | Domain | v1.1.0 | v1.2.0 | Key evidence |
|---|---|---|---|---|
| 1 | Data governance & provenance | 4.5/5 | 4.5/5 | Unchanged strength: checksums, reconciliation, gating (T89) |
| 2 | Research integrity & statistics | 5/5 | 5/5 | Pre-registered rules, leakage guards, FDR, LDOCO (T89) |
| 3 | Authentication & access control | 3.5/5 | 3.5/5 | Demo tier unchanged, now enforced server-side on every route incl. /login (A.5) |
| 4 | API security (rate limiting, headers, validation) | 4/5 | 4.5/5 | 429 + Retry-After verified; **all known dependency vulns eliminated** (A.13–A.15) |
| 5 | Observability (logging, health, metrics) | 4/5 | 4.5/5 | Structured JSON logs + Prometheus `/api/metrics` counters (A.16) |
| 6 | Web UI/UX (marketing + app, SSR/CSR architecture) | 4.5/5 | 5/5 | SSR landing with live data in initial HTML; full boundary hierarchy (A.8–A.10, A.17) |
| 7 | Testing & QA | 5/5 | 5/5 | 89 pytest + 21 bun, lint/tsc clean, prod build clean (A.1) |
| 8 | Accessibility | 4/5 | 4.5/5 | Skip links everywhere, landmarks, aria-live offline banner, no-JS content visible (A.18) |
| 9 | Deployment & operations readiness | 3.5/5 | 4/5 | CI workflow + Dockerfile/compose artifacts; container runtime unverified here (A.19 note) |
| 10 | Commercial readiness (competition submission) | 3.5/5 | 3.5/5 | Still blocked on dataset (C-01); preflight tooling added (A.20) |

---

## 2. Commercial findings

### C-01 — CRITICAL, OPEN — Competition dataset not acquired

- **Current state:** `data/raw/` contains 0 of 9 required CSVs (~2.31 GiB).
  All analytical stages report `gated_on_data`; no statistical claim exists.
- **Why it is blocked here:** Kaggle competition data requires an
  authenticated account that has accepted the competition rules. This
  environment has no Kaggle credentials (`~/.kaggle` absent;
  `kagglehub.competition_download("nfl-big-data-bowl-2027")` →
  `UnauthenticatedError`). A full-disk search found no copies of the nine
  files (Appendix A.11).
- **Impact:** the single remaining blocker to any finding, figure, and the
  submission itself.
- **Owner / action (user):** join the competition on Kaggle, download the 9
  CSVs, place them in `data/raw/` (or attach them to this workspace), then
  run `python -m shadowline preflight` for an instant readiness check
  (presence + required columns, zero side effects — new in v1.2.0), and
  `python -m shadowline all`. Everything downstream activates automatically;
  the platform refuses to guess in the meantime. There is no software-side
  remediation we are willing to fake. A drop-zone README
  (`data/raw/PUT_COMPETITION_CSVs_HERE.md`) documents the exact steps.

### C-02 — Strength — Competition-format deliverables ready to fill

Writeup draft (≤2,000 words), public notebook (executes clean and with data),
evidence matrix and submission-readiness report exist and are wired to fill
from real artifacts — including an honest null-result path. No competitor
facing feature is missing except the data (C-01).

### C-03 — Medium, MITIGATED (strengthened in v1.2.0) — Public presentation surface

- **v1.1.0:** public landing with an NFL-themed 3D hero, scroll animations,
  the research hypothesis, the eleven modules, the honesty policy, and live
  pipeline status chips.
- **v1.2.0 upgrade:** the landing is now a SERVER COMPONENT — the entire
  marketing shell, copy and footer render on the server; the live status
  chips ship with REAL pipeline data in the initial HTML (server-prefetched
  TanStack Query state streamed inside Suspense), and keep themselves fresh
  client-side with 30 s polling. The hero entrance animation is pure CSS, so
  it runs even without JavaScript. Verified: the streamed HTML contains both
  the Suspense fallback and the resolved chips with the real run_id
  (A.17); browser checks show the canvas, chips, skip link and landmarks
  with zero page errors (A.8–A.10).
- Presentation only — the scene contains no dataset content, is labelled as
  such, and respects `prefers-reduced-motion` with a static SVG fallback
  when WebGL is unavailable.

### C-04 — Low, MITIGATED — Legal clarity

Landing page carries an explicit "independent research project; not
affiliated with the NFL or Kaggle" disclaimer; the 3D scene is marked as
containing no dataset content; raw data stays out of version control and out
of the distributed archive.

---

## 3. Enterprise findings

Severity scale: Critical / High / Medium / Low. Status: **Implemented
(verified this session)** or **Roadmap** (with why-not-now).

### Security

| ID | Severity | Finding | Status & evidence |
|---|---|---|---|
| F-01 | High | No authentication or access control; all APIs and the app fully public | **Implemented (demo tier).** HMAC-SHA256-signed HttpOnly SameSite=Lax session cookie (8 h TTL, constant-time compare, tamper/expiry rejection); `/api/auth/{login,logout,session}`; server-side guards on `/app` AND `/login` (both 307-verified, A.5); every analytical API returns 401 without a session (incl. the new `/api/metrics`); demo account clearly labelled as demo. Unit-tested (21 bun tests). **Roadmap:** OIDC/OAuth2 identity provider, per-user RBAC, MFA — a research demo must not pretend to have these. |
| F-02 | High | No rate limiting (brute-force / DoS exposure) | **Implemented.** Per-IP fixed-window buckets per route class — auth 10/min, reads 120/min, writes 30/min, health 240/min — with `429`, `Retry-After`, and `X-RateLimit-*` headers (re-verified on the production build, A.6). Unit-tested incl. window reset and key isolation. **v1.2.0:** the counter state moved behind a `RateLimitStore` interface (in-memory default; atomic INCR/PEXPIRE Redis contract documented in code) so a shared store can be dropped in without touching call sites. **Roadmap:** the Redis store itself, for multi-instance deployments. |
| F-03 | Medium | No security headers or CSP | **Implemented.** CSP (self-only sources; `unsafe-eval` only in dev — the production response no longer carries it), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `X-DNS-Prefetch-Control` — verified on live production responses (A.2). |
| F-04 | Medium | Login input handling | **Implemented.** Zod-validated payloads (zod upgraded to 4.6.7, see F-06), generic 401 messages (no user enumeration), credentials never logged, login/logout events logged structurally. |
| F-05 | Low | Secrets management | **Mitigated.** `SESSION_SECRET` required (≥16 chars) and **fails closed in production** if absent; `.env` gitignored; `.env.example` documents the contract; the distributed archive contains no secrets. **Roadmap:** secret manager (AWS Secrets Manager / Vault). |
| F-06 | Medium | Dependency vulnerability scanning | **Implemented (v1.2.0).** `bun run audit:deps` queries the OSV.dev API per dependency at the EXACT versions resolved from `bun.lock`, writes `artifacts/v1/dependency_audit.json`, and exits non-zero on HIGH/CRITICAL (CI-gateable). First run found 5 CRITICAL + 20 HIGH + 22 MEDIUM + 4 LOW advisories across 6 packages — including unauthenticated-RCE-class advisories in `next@16.1.3` (image optimization) and `next-auth@4.24.13` (homoglyph bypass), and HIGH advisories in `sharp` (libvips/libheif/librsvg) and `zod` (CVE-2023-54404). Remediation, all verified by re-scan: removed 17 unused dependencies (next-auth, next-intl, uuid, sharp, dnd-kit, mdxeditor, react-markdown, react-syntax-highlighter, embla, … — none imported anywhere in `src/`), upgraded `next` 16.1.3 → 16.4.6 and `zod` 4.3.5 → 4.6.7. **Re-scan result: 0 known vulnerabilities across all 54 runtime dependencies** (A.13–A.15). Full test + build + browser suites re-verified after the upgrade (A.1, A.8–A.10). |

### Reliability & operations

| ID | Severity | Finding | Status & evidence |
|---|---|---|---|
| F-07 | Medium | No request-level observability | **Implemented.** Every API request emits one JSON log line (`ts, level, event, method, route, status, dur_ms, ip`) plus security events (`auth_login_success/failed`, `auth_rejected`, `rate_limited`, `api_error`); client errors are structured too. **v1.2.0:** new in-process metrics registry + `GET /api/metrics` in Prometheus text format — `http_requests_total{route,method,status}`, `rate_limited_total{route}`, `auth_rejected_total{route}`, `api_errors_total{route}`, uptime gauge — session-gated like every analytical route, verified counting live traffic (A.16), unit-tested (6 bun cases). **Roadmap:** OpenTelemetry traces + metrics export. |
| F-08 | Low | Generic error surfaces | **Implemented and completed into a full hierarchy (v1.2.0).** Route level: `global-error.tsx` (root-layout failures, renders its own html/body), `error.tsx` per segment (/, /app, /login) with digest surfacing and structured console reporting, custom 404. App level: one error boundary per module view (a render failure never takes down the platform). API level: uniform 500 envelope via `withApi` (no stack traces to clients). Query level: retry panels for failed reads. Network level: an aria-live offline banner with automatic reconnect behavior (browser-verified, A.18). Loading states: streamed Suspense fallbacks (landing status chips), module skeletons, submit/verify spinners. **Deliberate decision, documented in code:** guarded segments (`/app`, `/login`) carry NO `loading.tsx`, because a loading boundary flushes a 200 shell that converts the 307 auth redirect into a client-side redirect — wrong for crawlers and non-JS clients. Loading states live inside the app where they cannot break guard semantics. |
| F-09 | Low | Single-instance state | **Known limitation (documented, not hidden) — extension point added.** The rate limiter and artifact cache assume one instance; the app builds as a Next.js standalone server (production build + boot verified this session). **v1.2.0:** `RateLimitStore` interface with the exact atomic Redis contract documented in `src/lib/rate-limit.ts`; `Dockerfile` (multi-stage, non-root, standalone runtime, SESSION_SECRET fails-closed) and `docker-compose.yml` (single-instance default + `scale` profile with Redis + healthcheck + db volume) provided. **Honest status:** no container runtime exists in the audit environment, so the container's runtime is UNVERIFIED here (A.19 note); the packaged artifact itself (standalone server) is verified. **Roadmap:** Redis store implementation + orchestrator. |
| F-10 | Low | Backups | **Implemented (v1.2.0).** `bun run backup:db` — timestamped backup of `db/custom.db` via the SQLite backup API when the CLI is present (plain-copy fallback, method recorded honestly in the manifest), SHA-256 per backup, `backups/manifest.json`, retention (newest 10, `--keep N` override). Verified live: backup taken, `PRAGMA integrity_check` = ok, ScoutingReport table + rows present in the copy (A.21). Production runbook: cron it. |

### UI / UX / accessibility

| ID | Severity | Finding | Status & evidence |
|---|---|---|---|
| F-11 | Medium | No polished public surface / motion design | **Implemented (SSR-rebuilt in v1.2.0).** Landing with 3D hero (lazy-loaded, `dpr` capped, WebGL fallback), CSS-only hero entrance (runs without JS), scroll reveals via a `Reveal` client wrapper that keeps its children SERVER-RENDERED (RSC composition), animated module transitions inside the app (0.18 s, reduced-motion aware). See C-03 for the SSR data path. |
| F-12 | Low | Accessibility gaps | **Partially closed, widened in v1.2.0.** Skip-to-content links on BOTH the landing and the app; `<main>` landmark with id target on the landing; `aria-busy`/`aria-live` on every loading state; `role="alert"` error surfaces; `role="status"` offline banner announced politely; `prefers-reduced-motion` honored everywhere incl. the CSS hero animation; **below-fold landing content is now visible without JavaScript** (v1.1.0 shipped it at opacity:0 without JS); hydration-safe hooks (`useSyncExternalStore`, no setState-in-effect — enforced by the upgraded eslint config). **Roadmap:** full WCAG 2.1 AA pass with a screen-reader audit. |
| F-13 | Low | Branding/metadata | **Implemented.** SVG favicon (football mark), OG metadata, per-route metadata (login carries its own title + `robots: noindex`), versioned footer. |

### Data & compliance (existing strengths re-verified)

- Honest gating (`gated_on_data`) with `synthetic_data_used: false` — tested.
- SHA-256 checksums + provenance per run; runtime schema reconciliation — tested.
- The only synthetic fixture is banner-labelled in UI and metadata — tested.
- No PII is collected: the single demo session stores no personal data; the
  only persisted user content is scouting-report titles authored in-app.

---

## 4. v1.2.0 rendering architecture (error/loading states, SSR + CSR)

The custom SSR/CSR split, in one table (all browser-verified, A.8–A.10, A.17–A.18):

| Surface | Rendering | Error handling | Loading state |
|---|---|---|---|
| Landing `/` | **SSR** server component; static shell + copy server-rendered; hero entrance via pure CSS (works without JS) | Root `error.tsx` + `global-error.tsx` | Streamed Suspense fallback for the live-status island |
| Landing live chips | **SSR→CSR hydration**: server prefetches the `["health"]` query (direct artifact read, no HTTP self-call) → dehydrated state → `HydrationBoundary`; **CSR** 30 s polling keeps it live; degraded marker on API loss | Error state inside the island (never fabricated data) | Pulse skeleton (streams first, real data replaces it) |
| Landing 3D hero | **CSR only** (`ssr: false`, lazy) | WebGL-detect → static SVG fallback | — |
| Login `/login` | **SSR** session gate (authed → 307 to destination, server-decided); card shell server-rendered; interactive form is a client island | Segment `error.tsx` + inline form errors | None needed (fast HMAC check) — and deliberately NO `loading.tsx` (see F-08) |
| App `/app` | **SSR** session gate (307) + **CSR** single-page app (TanStack Query) | Segment `error.tsx` + per-module boundaries + query retry panels | Module skeletons + Suspense; offline banner (aria-live) |
| Every API | — | Uniform JSON envelope via `withApi`; 401/429 paths | Rate-limit headers on every response |

---

## 5. Priority roadmap (post-audit)

| Priority | Item | Unblocks | Status in v1.2.0 |
|---|---|---|---|
| P0 | User attaches the 9 competition CSVs; `python -m shadowline preflight && python -m shadowline all` (C-01) | All findings, figures, submission | **Awaiting user** — preflight command ready (A.20) |
| P1 | OIDC identity provider + RBAC replacing demo auth (F-01) | Real multi-user deployments | Roadmap (unchanged, honestly) |
| P1 | CI pipeline: pytest + bun test + tsc + lint + OSV scan on every push (F-06) | Regression safety at scale | **Artifact written** (`.github/workflows/ci.yml`, 3 jobs incl. dependency-audit gate); first run pending a git host |
| P2 | Docker + orchestrator + Redis rate limiting (F-02, F-09) | Horizontal scale | **Artifacts written** (Dockerfile, docker-compose with `scale` profile; Redis store contract in code); container runtime unverified here |
| P2 | OpenTelemetry export (F-07) | Production SRE | Partial: Prometheus `/api/metrics` shipped; traces still roadmap |
| P3 | Full WCAG 2.1 AA audit (F-12) | Enterprise procurement | Roadmap (structural a11y widened in v1.2.0) |

---

## Appendix A — Verification evidence (executed 2026-11-14, this session)

| # | Check | Command / action | Result |
|---|---|---|---|
| A.1 | Test suites | `python -m pytest tests/ -q` · `bun test tests/js` · `bunx tsc --noEmit` · `bun run lint` · `bun run build` | 89 passed · 21 passed · 0 src errors · 0 lint errors · clean production build (after the next/zod upgrades) |
| A.2 | Security headers (production) | `curl -sI localhost:3000/` | CSP (no `unsafe-eval` in prod), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS all present |
| A.3 | Login (valid demo creds) | `curl POST /api/auth/login` | 200 + `Set-Cookie` (HttpOnly, SameSite=Lax, Max-Age=28800) |
| A.4 | API auth gate | `curl /api/audit` without/with cookie; `curl /api/metrics` without cookie | 401 `authentication required` / 200; 401 |
| A.5 | Page guards (SSR, production) | curl all four combinations | `/app` unauth → **307** `/login?next=/app`; `/login` authed → **307** `/app` (new, server-decided); authed `/app` 200; unauth `/login` 200 |
| A.6 | Rate limiter (production) | 12 rapid login POSTs | 401 ×9 then `429`, `Retry-After: 42`, `X-RateLimit-Limit: 10`, `Remaining: 0`; count visible in `/api/metrics` |
| A.7 | Structured logs | `tail server.log` | JSON lines: `{"event":"http_request","route":"auth-login","status":429,...}` |
| A.8 | Landing (production, desktop) | agent-browser 1440×900 | canvas renders; zero page errors; live status chips from server-prefetched health |
| A.9 | Landing DOM assertions | `agent-browser eval` | hero-rise CSS present; ANALYTICS GATED + RUN id in text; skip link + `main#main-content` present |
| A.10 | Full user journey (production) | agent-browser: landing → sign in → 11-module app → module switch → logout | All modules load authed (11 nav buttons); Tracking Lab synthetic banner intact; logout lands on `/login`; zero console errors |
| A.11 | Data search | full-disk search for the 9 CSV filenames; `kagglehub` download attempt; web check of competition page | No files on disk; `UnauthenticatedError`; competition confirmed live (9 CSVs, ~2.2 GiB, CC BY-NC 4.0) |
| A.12 | Preflight (no data) | `python -m shadowline preflight` | Honest per-file MISSING table + exact kaggle commands; exit code 1 |
| A.13 | Dependency audit (before) | `bun run audit:deps` | 69 packages scanned via OSV.dev at exact lockfile versions; **5 CRITICAL + 20 HIGH + 22 MEDIUM + 4 LOW** across next, next-auth, next-intl, sharp, uuid, zod; exit 1 |
| A.14 | Remediation | `bun remove` 17 unused deps (incl. next-auth, next-intl, uuid, sharp — verified unimported in `src/`); `bun add next@^16.4.6 zod@^4.6.6` | Lockfile updated; tsc/lint/tests/build all clean afterwards |
| A.15 | Dependency audit (after) | `bun run audit:deps` | **0 known vulnerabilities across all 54 runtime dependencies**; exit 0; artifact `artifacts/v1/dependency_audit.json` |
| A.16 | Metrics endpoint | `curl /api/metrics` with session | Prometheus text: `http_requests_total{route="auth-login",status="200"}`, `rate_limited_total{route="auth-login"} 4`, `auth_rejected_total{route="metrics"}`, uptime gauge — counters increment live |
| A.17 | SSR landing data | `curl /` HTML inspection | Initial HTML contains the streamed Suspense fallback AND the resolved chips with the real run_id (`RUN 20261113T200017Z`) — live data ships in the server response |
| A.18 | Offline banner | agent-browser `set offline on/off` | aria-live banner appears when offline ("You are offline — data cannot refresh…"), clears on reconnect |
| A.19 | Production runtime | `bun .next/standalone/server.js` | Boots with SESSION_SECRET from env; all routes serve; 164 ms landing response. Note: Dockerfile runtime NOT verified here (no container runtime in the audit sandbox) |
| A.20 | Preflight (mini package) | `pytest tests/test_preflight.py` | 5 cases: empty dir → exit 1; synthetic 9-file package → exit 0; corrupted schema detected (missing required column); row counting; JSON-serialisable report |
| A.21 | Database backup | `bun run backup:db` + sqlite integrity check | Backup written (24,576 B, sha256, method recorded); `PRAGMA integrity_check` = ok; ScoutingReport table with rows present in the copy; retention manifest updated |

## Appendix B — New/changed files in v1.2.0

**Error/loading/boundary + SSR/CSR architecture**
- `src/app/global-error.tsx`, `src/app/app/error.tsx`, `src/app/login/error.tsx` — boundary hierarchy
- `src/app/page.tsx` — SSR server component (prefetch + streaming + composition)
- `src/app/login/page.tsx` — SSR session gate + `src/components/auth/login-form.tsx` island
- `src/components/landing/{reveal,live-status-chips,query-provider}.tsx`, `src/lib/health.ts`
- `src/hooks/use-online-status.ts`, `src/components/shadowline/offline-banner.tsx`
- `src/hooks/use-mobile.ts` (useSyncExternalStore rewrite), `src/app/globals.css` (CSS hero animation)

**Audit-severity work**
- `scripts/audit-deps.ts` (OSV scanner) + `scripts/backup-db.ts` + `src/lib/metrics.ts` + `src/app/api/metrics/route.ts`
- `src/lib/rate-limit.ts` (RateLimitStore interface), `src/lib/with-api.ts` (metrics wiring)
- `shadowline/preflight.py` + CLI `preflight` command; `tests/test_preflight.py`, `tests/js/metrics.test.ts`
- `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`
- `data/raw/PUT_COMPETITION_CSVs_HERE.md`; package.json v1.2.0 (+`audit:deps`, `backup:db`)
- Removed: 17 unused dependencies + unused `carousel.tsx` + legacy `tailwind.config.ts`
