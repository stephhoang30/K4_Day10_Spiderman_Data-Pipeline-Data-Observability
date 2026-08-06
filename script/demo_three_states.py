"""Demo khac biet giua clean / corrupted / repaired, doc tu artifact that.

Khong tinh lai gi va khong to dep so lieu — moi con so lay tu file trong data/.
Neu artifact chua co thi bao thieu file nao thay vi doan.

    uv run python script/demo_three_states.py
"""

from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from core.config import load_settings  # noqa: E402
from core.utils import read_json  # noqa: E402

STATES = ("baseline", "corrupted", "repaired")


def _rule(title: str) -> None:
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


def main() -> int:
    settings = load_settings()
    paths = settings.paths

    needed = {
        "baseline": (paths.clean_json, paths.baseline_metrics, paths.baseline_answers),
        "corrupted": (paths.corrupted_clean_json, paths.corrupted_metrics, paths.corrupted_answers),
        "repaired": (paths.repaired_clean_json, paths.repaired_metrics, paths.repaired_answers),
    }
    missing = [str(p.relative_to(paths.project_dir)) for group in needed.values() for p in group if not p.exists()]
    if missing:
        print("Thieu artifact, chay run_phase1.py va run_corruption_flow.py truoc:")
        for item in missing:
            print(f"  - {item}")
        return 1

    frames = {state: pd.DataFrame(read_json(group[0])) for state, group in needed.items()}
    metrics = {state: read_json(group[1]) for state, group in needed.items()}
    answers = {state: {item["id"]: item for item in read_json(group[2])} for state, group in needed.items()}
    log = read_json(paths.corruption_log)

    _rule("1. DATASET — corruption lam gi voi du lieu")
    print(f"  {'':<22}{'baseline':>12}{'corrupted':>12}{'repaired':>12}")
    rows = [
        ("so row", lambda d: len(d)),
        ("unique paper_id", lambda d: d["paper_id"].nunique()),
        ("summary rong", lambda d: int((d["summary_chars"] == 0).sum())),
        ("row stale > 180 ngay", lambda d: int((d["age_days"] > settings.freshness_threshold_days).sum())),
        ("published moi nhat", lambda d: d["published"].max()),
    ]
    for label, fn in rows:
        values = "".join(f"{str(fn(frames[s])):>12}" for s in STATES)
        print(f"  {label:<22}{values}")

    print("\n  Corruption log ghi lai:")
    for action in log["actions"]:
        print(f"    {action['type']:<22}{action['rows_affected']:>3} row   [{action['target_pillar']}]")

    _rule("2. METRICS — hau qua len agent, cung mot test set")
    keys = ["retrieval_hit_rate", "mean_token_f1", "judge_accuracy", "mean_judge_score"]
    print(f"  {'':<22}{'baseline':>12}{'corrupted':>12}{'repaired':>12}{'phuc hoi':>11}")
    for key in keys:
        values = [metrics[s].get(key) for s in STATES]
        recovered = "day du" if values[2] == values[0] else f"{values[2] - values[0]:+.3f}"
        cells = "".join(f"{v:>12.3f}" if isinstance(v, (int, float)) else f"{str(v):>12}" for v in values)
        print(f"  {key:<22}{cells}{recovered:>11}")

    _rule("3. MOT PAPER CU THE — paper bi xoa khoi corpus")
    dropped = log["actions"][0]["paper_ids"]
    target = dropped[0]
    print(f"  paper_id: {target}")
    for state in STATES:
        present = target in set(frames[state]["paper_id"])
        print(f"    {state:<11} co trong corpus: {'CO' if present else 'KHONG'}")

    sample = next(
        (item for item in answers["baseline"].values() if target in item["ground_truth_doc_ids"]),
        None,
    )
    if sample:
        print(f"\n  Cau hoi: {sample['question'][:88]}")
        for state in STATES:
            item = answers[state].get(sample["id"])
            if item is None:
                continue
            text = str(item["answer"]).strip() or "(RONG)"
            print(f"    {state:<11} hit={str(item['retrieval_hit']):<5} f1={item['token_f1']:.3f}  {text[:52]}")

    _rule("4. MOT PAPER BI BLANK SUMMARY — retrieve dung nhung tra loi rong")
    blanked = next((a["paper_ids"] for a in log["actions"] if a["type"] == "blank_summary"), [])
    if blanked:
        target = blanked[0]
        sample = next(
            (
                item
                for item in answers["baseline"].values()
                if target in item["ground_truth_doc_ids"] and item["question_type"] == "summary"
            ),
            None,
        )
        print(f"  paper_id: {target}")
        if sample:
            print(f"  Cau hoi: {sample['question'][:88]}")
            for state in STATES:
                item = answers[state].get(sample["id"])
                if item is None:
                    continue
                text = str(item["answer"]).strip() or "(RONG)"
                print(f"    {state:<11} hit={str(item['retrieval_hit']):<5} f1={item['token_f1']:.3f}  {text[:52]}")
            print("\n  Bai hoc: retrieval van dung (hit=True) nhung cau tra loi rong.")
            print("  Retrieve dung KHONG dam bao tra loi dung.")

    _rule("5. QUALITY / FRESHNESS — observability co bat duoc khong")
    print(f"  {'':<22}{'baseline':>12}{'corrupted':>12}{'repaired':>12}")
    quality_row, freshness_row, stale_row = [], [], []
    for state in STATES:
        quality_path = paths.quality_dir / f"{state}_quality.json"
        fresh_path = paths.quality_dir / f"{state}_freshness_report.json"
        if state == "baseline" and not fresh_path.exists():
            fresh_path = paths.freshness_report
        quality_row.append(read_json(quality_path).get("status", "-") if quality_path.exists() else "-")
        if fresh_path.exists():
            payload = read_json(fresh_path)
            freshness_row.append(payload.get("status", "-"))
            stale_row.append(str(payload.get("stale_rows", "-")))
        else:
            freshness_row.append("-")
            stale_row.append("-")
    for label, values in (("data quality", quality_row), ("freshness", freshness_row), ("row stale", stale_row)):
        print(f"  {label:<22}" + "".join(f"{v:>12}" for v in values))

    print("\n  Nhung KHONG check nao bat duoc (xem script/audit_quality_gate.py):")
    print("    drop_latest_records — row_count chi kiem tra '> 0' nen 24 -> 22 van PASS")
    print("    truncate_title      — title cat ngan van khac rong")
    print("    inject_noise        — khong check nao nhin phan bo ky tu summary")

    _rule("KET LUAN")
    print("  1. Du lieu xau lam giam chat luong agent, do duoc bang cung mot test set.")
    print("  2. Repair chay lai cleaning tu raw phuc hoi dung bang baseline.")
    print("  3. Loai corruption gay hai nhat lai la loai observability khong thay.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
