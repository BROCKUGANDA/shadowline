"""Artifact store: deterministic, versioned, atomically-written analysis outputs.

Layout
------
artifacts/
  v1/
    pipeline_run.json          -- run manifest (stages, versions, provenance)
    dataset_audit.json         -- Phase 1 audit (presence, checksums, schemas)
    data_quality_report.json   -- Phase 2 quality checks
    combine_features.json/.parquet  -- Phase 3 MRI features (when data present)
    coverage_features.json/.parquet -- Phase 4 coverage analytics (when data present)
    research_results.json      -- Phase 5 statistical validation (when data present)
    experiment_register.json   -- pre-registered hypotheses & decision rules
    metric_catalog.json        -- MRI component definitions & status
    demo/synthetic_drill.json  -- clearly-labelled synthetic algorithm demo
    figures/                   -- Phase 9 reproducible figures

Rules: JSON dumps are key-sorted, floats rounded to 6 significant decimals,
timestamps are UTC ISO-8601, seeds fixed => byte-identical outputs for
identical inputs (except wall-clock timestamps, which are recorded but kept
out of content hashes).
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import ARTIFACT_SCHEMA_VERSION, METRIC_VERSION, PIPELINE_VERSION
from .config import ARTIFACTS_DIR, REPO_ROOT, VERSIONS, git_commit


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def _clean(obj: Any) -> Any:
    """Recursively make JSON deterministic: sort keys, round floats, nulls stay."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in sorted(obj.items())}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return round(obj, 6)
    if isinstance(obj, Path):
        return str(obj)
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    return obj


def atomic_write_json(path: Path, payload: dict | list) -> None:
    """Write JSON atomically (tmp file + os.replace). Deterministic formatting."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(_clean(payload), f, indent=2, sort_keys=True, ensure_ascii=False)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


class ArtifactStore:
    """Versioned artifact directory with a run manifest."""

    def __init__(self, version: int = ARTIFACT_SCHEMA_VERSION, run_id: str | None = None):
        self.version = version
        self.root = ARTIFACTS_DIR / f"v{version}"
        self.run_id = run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self._stages: list[dict] = []
        self._t0 = time.time()

    # -- manifest ----------------------------------------------------------
    def stage(self, name: str, status: str, detail: str | dict | None = None,
              data: dict | None = None) -> None:
        """Record a pipeline stage. status in {ok, gated_on_data, skipped, failed}."""
        self._stages.append({
            "name": name,
            "status": status,
            "detail": detail if isinstance(detail, dict) else ({"message": detail} if detail else {}),
            "artifact": data,
            "recorded_at": utc_now_iso(),
        })

    def write(self, relpath: str, payload: dict | list) -> Path:
        path = self.root / relpath
        atomic_write_json(path, payload)
        return path

    def write_manifest(self, extra: dict | None = None) -> Path:
        manifest = {
            "run_id": self.run_id,
            "pipeline": "shadowline",
            "pipeline_version": PIPELINE_VERSION,
            "metric_version": METRIC_VERSION,
            "artifact_schema_version": self.version,
            "schema_version_sources": "shadowline/schemas.py",
            "started_at": datetime.fromtimestamp(self._t0, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "finished_at": utc_now_iso(),
            "duration_s": round(time.time() - self._t0, 3),
            "provenance": {
                "python": VERSIONS.python,
                "platform": platform.platform(),
                "git_commit": git_commit(),
                "repo_root": str(REPO_ROOT),
                "package_versions": _package_versions(),
            },
            "stages": self._stages,
            "data_policy": (
                "No synthetic data is used as competition evidence. Stages that "
                "require the competition datasets report status 'gated_on_data' "
                "until data/raw is populated."
            ),
            **(extra or {}),
        }
        return self.write("pipeline_run.json", manifest)

    # -- read helpers (used by the app + notebook export) -------------------
    def read(self, relpath: str) -> dict | list | None:
        path = self.root / relpath
        if not path.exists():
            return None
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def exists(self, relpath: str) -> bool:
        return (self.root / relpath).exists()

    def list_artifacts(self) -> list[str]:
        if not self.root.exists():
            return []
        return sorted(str(p.relative_to(self.root)) for p in self.root.rglob("*") if p.is_file())


def _package_versions() -> dict:
    out = {}
    for mod in ("numpy", "polars", "duckdb", "pyarrow", "scipy", "statsmodels", "pandas"):
        try:
            out[mod] = __import__(mod).__version__
        except Exception:
            out[mod] = None
    return out


# ---------------------------------------------------------------------------
# Standard status payload emitted by every data-gated stage
# ---------------------------------------------------------------------------
def gated_payload(stage: str, reason: str, expected_files: list[str],
                  next_action: str) -> dict:
    return {
        "status": "gated_on_data",
        "stage": stage,
        "reason": reason,
        "expected_files": expected_files,
        "next_action": next_action,
        "synthetic_data_used": False,
        "note": (
            "No statistical claims are produced for this stage until the real "
            "competition datasets are present in the raw data directory."
        ),
    }
