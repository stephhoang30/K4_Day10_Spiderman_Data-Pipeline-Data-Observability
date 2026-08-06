"""Audit: quality check co that su phan anh du lieu hay chi pass cho co?

Cach duy nhat de biet mot quality gate co gia tri la cho no an du lieu hong.
Check nao pass ca tren baseline lan corrupted thi khong phat hien duoc gi.

Script khong ghi de artifact that trong data/quality/ — moi thu ghi vao thu muc
tam roi xoa.

    uv run python script/audit_quality_gate.py
"""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from core.config import load_settings  # noqa: E402
from core.utils import now_utc  # noqa: E402
from ingestion.cleaning import build_clean_dataframe  # noqa: E402
from ingestion.corruption import corrupt_clean_dataframe  # noqa: E402
from ingestion.crossref import load_raw_records  # noqa: E402
from observability.quality import build_freshness_report, run_data_quality_checks  # noqa: E402

# Corruption nao duoc ky vong bi bat boi check nao.
EXPECTED_DETECTION = {
    "duplicate_rows": "paper_id_unique",
    "blank_summary": "summary_length",
    "stale_published": "freshness",
    "drop_latest_records": None,
    "truncate_title": None,
    "inject_noise": None,
}


def _checks(payload: dict) -> dict:
    if "checks" in payload:
        return payload["checks"]
    return {k: v for k, v in payload.items() if isinstance(v, dict) and "status" in v}


def main() -> int:
    settings = load_settings()
    if not settings.paths.raw_records_json.exists():
        print(f"Thieu {settings.paths.raw_records_json}. Chay run_phase1.py truoc.")
        return 1

    baseline = build_clean_dataframe(load_raw_records(settings.paths.raw_records_json), now_utc())

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        corrupted = corrupt_clean_dataframe(baseline, tmpdir / "corruption_log.json")
        log = corrupted.attrs["corruption_log"]

        # report_name khac nhau de khong ghi de baseline_quality.json that.
        quality_base = run_data_quality_checks(baseline, settings=settings, report_name="__audit_baseline")
        quality_corr = run_data_quality_checks(corrupted, settings=settings, report_name="__audit_corrupted")
        fresh_base = build_freshness_report(baseline, settings=settings, report_path=tmpdir / "fb.json")
        fresh_corr = build_freshness_report(corrupted, settings=settings, report_path=tmpdir / "fc.json")

        # run_data_quality_checks ghi vao data/quality/, don lai cho sach.
        for stray in settings.paths.quality_dir.glob("__audit_*"):
            stray.unlink()

    base_checks, corr_checks = _checks(quality_base), _checks(quality_corr)
    rows = []
    for name in base_checks:
        before = base_checks[name]["status"]
        after = corr_checks.get(name, {}).get("status", "-")
        rows.append((name, before, after, before == "PASS" and after == "FAIL"))
    # run_data_quality_checks co the da co san check freshness; chi them khi thieu.
    if not any(name == "freshness" for name, *_ in rows):
        rows.append(("freshness", fresh_base["status"], fresh_corr["status"],
                     fresh_base["status"] == "PASS" and fresh_corr["status"] == "FAIL"))

    print(f"\nbaseline {len(baseline)} row -> corrupted {len(corrupted)} row\n")
    print(f"{'check':<24}{'baseline':>10}{'corrupted':>11}   bắt được corruption?")
    print("-" * 70)
    for name, before, after, detects in rows:
        print(f"{name:<24}{before:>10}{after:>11}   {'CÓ' if detects else 'không'}")

    detecting = sum(1 for *_, d in rows if d)
    print(f"\n{detecting}/{len(rows)} check phát hiện được corruption")
    print(f"overall: baseline={quality_base.get('status')} corrupted={quality_corr.get('status')}")

    print("\nĐộ phủ theo từng loại corruption:")
    gaps = []
    for action in log["actions"]:
        kind = action["type"]
        expected = EXPECTED_DETECTION.get(kind)
        if expected is None:
            gaps.append(kind)
            print(f"  {kind:<22} {action['rows_affected']:>2} row  -> KHÔNG check nào bắt được")
        else:
            hit = next((d for n, _, _, d in rows if n == expected), False)
            print(f"  {kind:<22} {action['rows_affected']:>2} row  -> {expected} {'bắt được' if hit else 'KHÔNG bắt được'}")

    if gaps:
        print(f"\nKhoảng trống observability: {', '.join(gaps)}")
        print("  - drop_latest_records: row_count chỉ check '> 0' nên mất record không bị phát hiện.")
        print("    Cần check volume so với lần chạy trước hoặc so với số raw record.")
        print("  - truncate_title: title vẫn khác rỗng nên title_not_null vẫn PASS.")
        print("    Cần check độ dài title tối thiểu.")
        print("  - inject_noise: không có check nào nhìn vào phân bố ký tự của summary.")

    overall_ok = quality_base.get("status") == "PASS" and quality_corr.get("status") == "FAIL"
    print(f"\nKết luận: quality gate {'CÓ' if overall_ok else 'KHÔNG'} phản ánh dữ liệu thật.")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
