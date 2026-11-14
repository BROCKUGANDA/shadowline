"""Preflight tests (audit C-01 support): presence, schema reconciliation,
row counting, exit-code honesty. Fixtures are the synthetic mini package —
mechanics only, never analytical evidence."""
from pathlib import Path

from shadowline.preflight import run_preflight
from shadowline.preflight import main as preflight_main


class TestPreflight:
    def test_empty_dir_reports_all_missing_and_not_ready(self, tmp_path):
        report = run_preflight(data_dir=tmp_path)
        assert report.n_present == 0
        assert not report.ready
        assert preflight_main(data_dir=tmp_path) == 1

    def test_mini_package_passes_presence_and_schema(self, mini_dataset_dir):
        report = run_preflight(data_dir=mini_dataset_dir)
        assert report.n_present == 9
        assert report.n_schema_ok == 9
        assert report.ready
        assert preflight_main(data_dir=mini_dataset_dir) == 0

    def test_missing_required_column_is_a_schema_failure(self, mini_dataset_dir):
        # Corrupt players.csv: drop the required nfl_id column.
        path = Path(mini_dataset_dir) / "players.csv"
        lines = path.read_text().splitlines()
        header = lines[0].split(",")
        header.remove("nfl_id")
        path.write_text(",".join(header) + "\n" + "\n".join(lines[1:]))

        report = run_preflight(data_dir=Path(mini_dataset_dir))
        players = next(f for f in report.files if f.filename == "players.csv")
        assert players.present
        assert not players.schema_ok
        assert "nfl_id" in players.reconciliation["missing_required"]
        assert not report.ready

    def test_row_counting_counts_data_rows_excluding_header(self, tmp_path):
        (tmp_path / "players.csv").write_text("nfl_id\n1\n2\n3\n")
        report = run_preflight(data_dir=tmp_path, count_rows=True)
        players = report.files[0]
        assert players.reconciliation["data_rows"] == 3

    def test_report_dict_is_json_serialisable(self, tmp_path):
        import json
        report = run_preflight(data_dir=tmp_path)
        assert json.loads(json.dumps(report.to_dict()))["n_expected"] == 9
