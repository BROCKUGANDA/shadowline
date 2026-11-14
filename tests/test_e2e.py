"""End-to-end integration tests: synthetic mini competition package through
the FULL pipeline (audit -> quality -> features -> coverage -> research ->
artifacts). Validates mechanics and artifact integrity only; the mini
package's numbers are never interpreted as analytical findings."""
import json
from pathlib import Path

import pytest


@pytest.fixture()
def run_pipeline(mini_dataset_dir, tmp_path, monkeypatch):
    artifacts = tmp_path / "artifacts"
    monkeypatch.setenv("SHADOWLINE_DATA_DIR", str(mini_dataset_dir))
    monkeypatch.setenv("SHADOWLINE_ARTIFACTS_DIR", str(artifacts))
    from shadowline import artifacts as art_mod
    import shadowline.config as cfg
    cfg.ARTIFACTS_DIR = artifacts
    art_mod.ARTIFACTS_DIR = artifacts
    from shadowline import cli
    rc = cli.main(["all"])
    return rc, artifacts


class TestEndToEnd:
    def test_pipeline_completes(self, run_pipeline):
        rc, artifacts = run_pipeline
        assert rc == 0

    def test_all_artifacts_written(self, run_pipeline):
        _, artifacts = run_pipeline
        for rel in ("pipeline_run.json", "dataset_audit.json",
                    "data_quality_report.json", "combine_features.json",
                    "coverage_features.json", "research_results.json",
                    "experiment_register.json", "metric_catalog.json",
                    "demo/synthetic_drill.json"):
            assert (artifacts / "v1" / rel).exists(), rel

    def test_audit_reports_full_presence(self, run_pipeline):
        _, artifacts = run_pipeline
        audit = json.loads((artifacts / "v1" / "dataset_audit.json").read_text())
        assert audit["all_present"] is True
        assert audit["n_present"] == 9
        assert all(f["sha256"] for f in audit["files"])

    def test_manifest_records_all_stages(self, run_pipeline):
        _, artifacts = run_pipeline
        manifest = json.loads((artifacts / "v1" / "pipeline_run.json").read_text())
        names = {s["name"] for s in manifest["stages"]}
        assert {"audit", "quality", "features", "coverage", "research", "demo"} <= names
        statuses = {s["status"] for s in manifest["stages"]}
        # insufficient_n = data present but below the pre-registered minimum
        # sample (honest refusal to infer, not an error)
        assert statuses <= {"ok", "gated_on_data", "partial", "skipped",
                            "failed", "insufficient_n"}
        assert manifest["provenance"]["python"]

    def test_features_real_mechanics(self, run_pipeline):
        _, artifacts = run_pipeline
        feats = json.loads((artifacts / "v1" / "combine_features.json").read_text())
        # the mini package has 4 DBs with shuttle attempts
        assert len(feats["players"]) == 4
        p = feats["players"][0]
        assert p["drill"] if "drill" in p else True
        assert p.get("reorientation_latency_mean") is not None

    def test_coverage_association_reported(self, run_pipeline):
        _, artifacts = run_pipeline
        cov = json.loads((artifacts / "v1" / "coverage_features.json").read_text())
        assert cov["status"] == "ok"
        assert cov["n_db_plays"] >= 1
        # association methods must be reported (never silently nearest)
        assert "association_methods" in cov

    def test_research_status_honest_for_tiny_n(self, run_pipeline):
        _, artifacts = run_pipeline
        res = json.loads((artifacts / "v1" / "research_results.json").read_text())
        # 4 synthetic players < 10 -> the framework must REFUSE inference
        assert res["status"] in ("insufficient_n", "insufficient_mri", "gated_on_data")
        assert "primary_hypothesis_result" not in res

    def test_demo_artifact_is_labelled_synthetic(self, run_pipeline):
        _, artifacts = run_pipeline
        demo = json.loads((artifacts / "v1" / "demo" / "synthetic_drill.json").read_text())
        assert demo["synthetic"] is True
        assert "SYNTHETIC" in demo["label"]

    def test_gated_mode_when_data_absent(self, tmp_path, monkeypatch):
        empty = tmp_path / "empty"
        empty.mkdir()
        monkeypatch.setenv("SHADOWLINE_DATA_DIR", str(empty))
        import shadowline.config as cfg
        from shadowline import artifacts as art_mod
        art_dir = tmp_path / "art2"
        monkeypatch.setenv("SHADOWLINE_ARTIFACTS_DIR", str(art_dir))
        cfg.ARTIFACTS_DIR = art_dir
        art_mod.ARTIFACTS_DIR = art_dir
        from shadowline import cli
        rc = cli.main(["all"])
        assert rc == 0  # gated is not failure
        research = json.loads((art_dir / "v1" / "research_results.json").read_text())
        assert research["status"] == "gated_on_data"
        assert research["synthetic_data_used"] is False
