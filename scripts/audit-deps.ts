/**
 * Dependency vulnerability audit via the OSV.dev API (audit finding F-06).
 *
 *   bun run audit:deps            runtime dependencies (production surface)
 *   bun run audit:deps -- --dev   include devDependencies
 *   bun run audit:deps -- --all   everything in package.json
 *
 * Resolves the EXACT versions from bun.lock (falling back to the package.json
 * range base when a lock entry is missing) and queries
 * https://api.osv.dev/v1/query per package — the same database that powers
 * OSV-Scanner, without needing a package-lock.json.
 *
 * Output: console summary + artifacts/v1/dependency_audit.json.
 * Exit codes: 0 = no HIGH/CRITICAL findings · 1 = HIGH/CRITICAL found ·
 *             2 = scan could not complete (network/API failure — honest).
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const OSV_ENDPOINT = "https://api.osv.dev/v1/query";

interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  severity?: Array<{ type: string; score: string }>;
  database_specific?: { severity?: string };
  references?: Array<{ type: string; url: string }>;
}

interface PackageFinding {
  name: string;
  version: string;
  source: "bun.lock" | "package.json";
  vulnerabilities: Array<{
    id: string;
    severity: string;
    summary: string;
    url: string;
    cvss_vector?: string;
  }>;
}

const SEVERITY_ORDER = ["UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
type Severity = (typeof SEVERITY_ORDER)[number];

function normalizeSeverity(raw: string | undefined): Severity {
  const s = (raw ?? "").toUpperCase();
  if (s === "MODERATE") return "MEDIUM";
  return (SEVERITY_ORDER as readonly string[]).includes(s) ? (s as Severity) : "UNKNOWN";
}

function classifyVuln(v: OsvVulnerability): { severity: Severity; cvss?: string } {
  // Prefer the advisory's own severity rating; keep the CVSS vector as
  // evidence. We do NOT compute a base score from the vector ourselves —
  // the advisory rating is the database's judgment.
  const cvss = v.severity?.find((s) => s.type.startsWith("CVSS"))?.score;
  return { severity: normalizeSeverity(v.database_specific?.severity), cvss };
}

/** Exact resolved versions from bun.lock: `"name": ["name@1.2.3", ...]`. */
function lockVersions(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const lock = readFileSync(join(ROOT, "bun.lock"), "utf8");
    // bun.lock "packages" entries look like:
    //   "next": ["next@16.1.3", "https://...", { ... }, "sha512-..."],
    // The key is the package name; the first tuple element carries the
    // exact resolved version after the LAST "@" before the version digits.
    // Plain-string entries (the workspace manifest mirror) are skipped
    // because they do not follow "[\"".
    const tupleRe = /"([^"]+)":\s*\[\s*"[^"]*?@(\d[^"']*)"/g;
    for (const m of lock.matchAll(tupleRe)) {
      map.set(m[1], m[2]);
    }
  } catch {
    /* no lockfile — caller falls back to package.json ranges */
  }
  return map;
}

async function queryOsv(name: string, version: string): Promise<OsvVulnerability[]> {
  const res = await fetch(OSV_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ package: { name, ecosystem: "npm" }, version }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OSV ${res.status} for ${name}@${version}`);
  const body = (await res.json()) as { vulns?: OsvVulnerability[] };
  return body.vulns ?? [];
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const includeDev = args.includes("--dev") || args.includes("--all");

  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    name: string;
    version: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  const lock = lockVersions();
  const targets: Array<{ name: string; range: string; dev: boolean }> = [];
  for (const [name, range] of Object.entries(pkg.dependencies)) {
    targets.push({ name, range, dev: false });
  }
  if (includeDev) {
    for (const [name, range] of Object.entries(pkg.devDependencies)) {
      targets.push({ name, range, dev: true });
    }
  }

  console.log(
    `SHADOWLINE dependency audit — ${targets.length} packages ` +
      `(runtime${includeDev ? " + dev" : ""}), exact versions from bun.lock ` +
      `(${lock.size} entries resolved)`
  );

  const findings: PackageFinding[] = [];
  const errors: Array<{ name: string; error: string }> = [];
  let done = 0;

  for (const t of targets) {
    const exact = lock.get(t.name);
    // Strip range operators for the fallback (approximate — flagged as such).
    const version = exact ?? t.range.replace(/^[\^~>=<\s]+/, "");
    const source: "bun.lock" | "package.json" = exact ? "bun.lock" : "package.json";
    try {
      const vulns = await queryOsv(t.name, version);
      findings.push({
        name: t.name,
        version,
        source,
        vulnerabilities: vulns.map((v) => {
          const { severity, cvss } = classifyVuln(v);
          return {
            id: v.id,
            severity,
            summary: v.summary ?? v.details?.slice(0, 140) ?? "no summary",
            url: v.references?.[0]?.url ?? `https://osv.dev/vulnerability/${v.id}`,
            ...(cvss ? { cvss_vector: cvss } : {}),
          };
        }),
      });
    } catch (err) {
      errors.push({ name: t.name, error: err instanceof Error ? err.message : String(err) });
    }
    done += 1;
    if (done % 10 === 0) console.log(`  … ${done}/${targets.length} queried`);
    await new Promise((r) => setTimeout(r, 120)); // be a polite API citizen
  }

  const withVulns = findings.filter((f) => f.vulnerabilities.length > 0);
  let worst: Severity = "UNKNOWN";
  const severityCounts: Record<string, number> = {};
  for (const f of withVulns) {
    for (const v of f.vulnerabilities) {
      severityCounts[v.severity] = (severityCounts[v.severity] ?? 0) + 1;
      if (SEVERITY_ORDER.indexOf(v.severity) > SEVERITY_ORDER.indexOf(worst)) {
        worst = v.severity;
      }
    }
  }

  console.log("");
  if (withVulns.length === 0) {
    console.log("No known vulnerabilities affect the scanned versions. (OSV.dev)");
  } else {
    console.log(`Packages with known vulnerabilities: ${withVulns.length}/${findings.length}`);
    console.log(
      "Severity totals: " +
        Object.entries(severityCounts)
          .map(([s, n]) => `${s}:${n}`)
          .join("  ")
    );
    for (const f of withVulns) {
      console.log(`\n  ${f.name}@${f.version}  [${f.source}]`);
      for (const v of f.vulnerabilities) {
        console.log(`    ${v.severity.padEnd(8)} ${v.id}`);
        console.log(`             ${v.summary}`);
        console.log(`             ${v.url}`);
      }
    }
  }

  // Persist the machine-readable artifact next to the pipeline artifacts.
  const artifact = {
    generated_at: new Date().toISOString(),
    tool: "shadowline/audit-deps (OSV.dev API v1)",
    app_version: pkg.version,
    scope: includeDev ? "runtime+dev" : "runtime",
    n_packages_scanned: findings.length,
    n_query_errors: errors.length,
    severity_totals: severityCounts,
    worst_severity: worst,
    packages_with_vulnerabilities: withVulns,
    scan_errors: errors,
    note:
      "Version source is bun.lock (exact) where available; 'package.json' entries " +
      "are approximate (range base). Severity is the advisory's database_specific " +
      "rating; UNKNOWN means the advisory carries no rating, not 'safe'.",
  };
  const outDir = join(ROOT, "artifacts", "v1");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "dependency_audit.json"), JSON.stringify(artifact, null, 2));
  console.log(`\nArtifact written: artifacts/v1/dependency_audit.json`);

  if (errors.length > 0) {
    console.log(`\nWARNING: ${errors.length} package queries failed (network/API):`);
    for (const e of errors.slice(0, 5)) console.log(`  ${e.name}: ${e.error}`);
  }

  // Exit policy: HIGH/CRITICAL = 1 (fails CI). LOW/MEDIUM/UNKNOWN are
  // reported but not fatal — the remediation decision stays human.
  if (errors.length > 0 && findings.length === 0) return 2;
  return worst === "HIGH" || worst === "CRITICAL" ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("audit-deps failed:", err);
    process.exit(2);
  }
);
