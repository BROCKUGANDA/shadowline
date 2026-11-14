/**
 * Scouting-report database backup (audit finding F-10).
 *
 *   bun run backup:db            timestamped copy + SHA-256 manifest
 *   bun run backup:db -- --keep 3   retention override (default 10)
 *
 * What it does (online-safe for SQLite):
 *   1. Uses SQLite's backup API via the bundled `sqlite3` CLI if present
 *      (`sqlite3 db/custom.db ".backup '<dest>'"`) — safe while the app is
 *      running, unlike a raw file copy.
 *   2. Falls back to a plain copy when the CLI is unavailable, and says so
 *      honestly in the manifest (method field).
 *   3. Writes backups/<timestamp>/custom.db plus backups/manifest.json
 *      (size, sha256, method, created_at per entry).
 *   4. Prunes old backups beyond the retention count, newest-first kept.
 *
 * Exit codes: 0 ok · 1 backup failed. Production deployments should put
 * this on a cron (documented in the commercial audit runbook).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DB_PATH = join(ROOT, "db", "custom.db");
const BACKUP_ROOT = join(ROOT, "backups");
const DEFAULT_KEEP = 10;

interface ManifestEntry {
  id: string;
  file: string;
  size_bytes: number;
  sha256: string;
  method: "sqlite3-backup-api" | "plain-copy";
  created_at: string;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readManifest(): ManifestEntry[] {
  const p = join(BACKUP_ROOT, "manifest.json");
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")) as ManifestEntry[];
  } catch {
    return [];
  }
}

function hasSqlite3(): boolean {
  try {
    execFileSync("sqlite3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main(): number {
  const keepArg = process.argv.indexOf("--keep");
  const keep = keepArg !== -1 ? Number(process.argv[keepArg + 1]) || DEFAULT_KEEP : DEFAULT_KEEP;

  if (!existsSync(DB_PATH)) {
    console.error(`backup-db: database not found at ${DB_PATH}`);
    console.error("  (run `bun run db:push` first, or confirm DATABASE_URL points at db/custom.db)");
    return 1;
  }

  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const destDir = join(BACKUP_ROOT, id);
  mkdirSync(destDir, { recursive: true });
  const dest = join(destDir, "custom.db");

  let method: ManifestEntry["method"] = "plain-copy";
  try {
    if (hasSqlite3()) {
      execFileSync("sqlite3", [DB_PATH, `.backup '${dest}'`], { stdio: "ignore" });
      method = "sqlite3-backup-api";
    } else {
      copyFileSync(DB_PATH, dest);
    }
  } catch (err) {
    console.error(`backup-db: backup failed: ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  const entry: ManifestEntry = {
    id,
    file: `backups/${id}/custom.db`,
    size_bytes: statSync(dest).size,
    sha256: sha256(dest),
    method,
    created_at: new Date().toISOString(),
  };

  const manifest = readManifest().filter((e) => e.id !== id);
  manifest.push(entry);
  manifest.sort((a, b) => a.id.localeCompare(b.id));

  // Retention: keep the newest `keep` backups.
  const removed = manifest.length > keep ? manifest.splice(0, manifest.length - keep) : [];
  for (const r of removed) {
    const dir = join(ROOT, "backups", r.id);
    try {
      rmSync(dir, { recursive: true, force: true });
      console.log(`  pruned old backup ${r.id}`);
    } catch {
      /* report but do not fail the run for a prune error */
      console.warn(`  warning: could not prune ${r.id}`);
    }
  }

  writeFileSync(
    join(BACKUP_ROOT, "manifest.json"),
    JSON.stringify({ retention_keep: keep, backups: manifest }, null, 2)
  );

  console.log(`backup-db: ${entry.file}`);
  console.log(`  method ${entry.method} · ${entry.size_bytes.toLocaleString()} bytes`);
  console.log(`  sha256 ${entry.sha256}`);
  console.log(`  retention: ${manifest.length}/${keep} backups kept`);
  return 0;
}

process.exit(main());
