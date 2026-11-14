"""Preflight: instant dataset activation check (supports audit finding C-01).

``python -m shadowline preflight`` answers ONE question before the user
commits to a full pipeline run: *is the competition package in place and
structurally usable right now?*

It is deliberately cheap (no ingestion, no artifacts, no checksums unless
asked): presence, size, header parse, required-column reconciliation per
file — the same schema registry the ingest stage reconciles against — plus
the exact command sequence to fix whatever is missing.

Exit code 0 only when every required file is present AND every required
column reconciles; 1 otherwise. The full audit stage remains the deep
check (checksums, row counts, referential integrity).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .config import COMPETITION_FILES, resolve_data_dir
from .schemas import FILE_SPECS, reconcile_columns

# Host-verified aggregate size of the 9-file package (~2.31 GiB) — used only
# to warn when the on-disk package is implausibly small, never to gate.
EXPECTED_PACKAGE_BYTES = 2_480_202_752  # ~2.31 GiB, informational only


@dataclass
class PreflightFile:
    filename: str
    present: bool
    size_bytes: int | None = None
    header_ok: bool = False
    error: str | None = None
    reconciliation: dict | None = None

    @property
    def schema_ok(self) -> bool:
        rec = self.reconciliation
        return self.present and self.header_ok and bool(rec and rec.get("ok"))

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "present": self.present,
            "size_bytes": self.size_bytes,
            "header_ok": self.header_ok,
            "error": self.error,
            "reconciliation": self.reconciliation,
            "schema_ok": self.schema_ok,
        }


@dataclass
class PreflightReport:
    data_dir: str
    files: list[PreflightFile] = field(default_factory=list)

    @property
    def n_present(self) -> int:
        return sum(1 for f in self.files if f.present)

    @property
    def n_schema_ok(self) -> int:
        return sum(1 for f in self.files if f.schema_ok)

    @property
    def total_bytes(self) -> int:
        return sum(f.size_bytes or 0 for f in self.files)

    @property
    def ready(self) -> bool:
        """True only when every required file passes presence + schema."""
        return len(self.files) > 0 and all(f.schema_ok for f in self.files)

    def to_dict(self) -> dict:
        return {
            "data_dir": self.data_dir,
            "n_expected": len(self.files),
            "n_present": self.n_present,
            "n_schema_ok": self.n_schema_ok,
            "total_bytes": self.total_bytes,
            "ready": self.ready,
            "files": [f.to_dict() for f in self.files],
        }


def _read_header(path: Path) -> list[str] | None:
    """Read the header row, CSV-quote-aware and BOM-safe."""
    import csv as _csv
    try:
        with open(path, "r", encoding="utf-8-sig", errors="replace", newline="") as fh:
            return next(_csv.reader(fh), [])
    except (OSError, UnicodeDecodeError) as exc:
        raise ValueError(f"header unreadable: {exc}") from exc


def run_preflight(data_dir: Path | None = None,
                  count_rows: bool = False) -> PreflightReport:
    """Check every competition file for presence + required columns.

    ``count_rows`` optionally counts data rows (byte-chunk newline scan);
    it is off by default because the full package is ~2.3 GiB and presence
    + schema is what gates activation.
    """
    directory = Path(data_dir) if data_dir else resolve_data_dir()
    report = PreflightReport(data_dir=str(directory))

    for filename in COMPETITION_FILES:
        entry = PreflightFile(filename=filename, present=False)
        path = directory / filename
        if not path.exists():
            report.files.append(entry)
            continue

        entry.present = True
        try:
            entry.size_bytes = path.stat().st_size
        except OSError as exc:
            entry.error = f"stat failed: {exc}"
            report.files.append(entry)
            continue

        spec = FILE_SPECS.get(filename)
        try:
            header = _read_header(path)
            entry.header_ok = header is not None and len(header) > 0
        except ValueError as exc:
            entry.error = str(exc)
            report.files.append(entry)
            continue

        if spec is not None and header is not None:
            entry.reconciliation = reconcile_columns(header, spec).to_dict()
        report.files.append(entry)

    if count_rows:
        for entry in report.files:
            if not entry.present:
                continue
            path = directory / entry.filename
            try:
                entry.reconciliation = entry.reconciliation or {}
                entry.reconciliation["data_rows"] = _count_data_rows(path)
            except OSError as exc:
                entry.error = f"row count failed: {exc}"
    return report


def _count_data_rows(path: Path) -> int:
    """Count newline-separated data rows (header excluded), 1 MiB chunks."""
    rows = 0
    leftover = b""
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(1 << 20)
            if not chunk:
                break
            rows += chunk.count(b"\n")
            leftover = chunk[-1:]  # trailing partial line handling
    if leftover and not leftover.endswith(b"\n"):
        rows += 1  # final line without newline
    return max(0, rows - 1)  # exclude header


def print_preflight(report: PreflightReport) -> None:
    """Human-readable preflight table with exact next actions."""
    print(f"Data directory: {report.data_dir}")
    print(f"Files: {report.n_schema_ok}/{len(report.files)} present AND schema-ok "
          f"({report.n_present} present, "
          f"{sum(1 for f in report.files if f.present and not f.schema_ok)} failing schema)")
    if report.total_bytes:
        mib = report.total_bytes / (1 << 20)
        print(f"Package size on disk: {mib:,.1f} MiB "
              f"(expected ~2,365 MiB for the full competition package)")
    print()
    for f in report.files:
        if not f.present:
            mark, note = "MISSING ", "place the competition file here"
        elif f.schema_ok:
            mark, note = "OK      ", f"{(f.size_bytes or 0) / (1 << 20):,.1f} MiB"
        elif not f.header_ok:
            mark, note = "UNREADAB", f"header unreadable: {f.error}"
        else:
            missing = (f.reconciliation or {}).get("missing_required") or ["required columns"]
            mark = "SCHEMA  "
            note = f"missing required columns: {', '.join(missing)}"
        print(f"  {mark}  {f.filename:<32} {note}")

    print()
    if report.ready:
        print("READY: every required file is present with all required columns.")
        print("Activate the pipeline:   python -m shadowline all")
        print("Deep audit first (checksums, rows, integrity):  python -m shadowline audit")
    else:
        missing = [f.filename for f in report.files if not f.present]
        if missing:
            print(f"Missing {len(missing)} of 9 competition files. Download them "
                  "from Kaggle (account + rules acceptance required):")
            print("  kaggle competitions download -f <file> -c nfl-big-data-bowl-2027")
            print("then unzip the 9 CSVs into the data directory above.")
        bad_schema = [f.filename for f in report.files if f.present and not f.schema_ok]
        if bad_schema:
            print(f"Schema failures in: {', '.join(bad_schema)} — the file does not "
                  "match the declared schema (wrong file or corrupted download).")
        print("Re-run:  python -m shadowline preflight")


def main(data_dir: Path | None = None, count_rows: bool = False) -> int:
    report = run_preflight(data_dir=data_dir, count_rows=count_rows)
    print_preflight(report)
    return 0 if report.ready else 1


# Allow `python -m shadowline preflight` to call this module directly.
if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
