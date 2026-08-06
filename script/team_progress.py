"""Bang tien do cua nhom, doc tu trang thai song cua repo.

Khong hardcode tien do. Moi o deu suy ra tai thoi diem chay tu:
  - `NotImplementedError` con lai trong file ma tung role so huu
  - artifact thuc su ton tai tren dia
  - `git log` va `git ls-remote` cho commit va nhanh

    uv run python script/team_progress.py
    uv run python script/team_progress.py --watch 30   # tu chay lai moi 30 giay
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]

MEMBERS = [
    {
        "role": 1,
        "name": "Nguyễn Hoàng Bảo Minh",
        "mssv": "2A202601626",
        "scope": "Điều phối pipeline",
        "git": ["minhmap123", "Nguyen Duc Manh"],
        "owns": ["src/core/config.py", "src/core/utils.py", "src/pipelines/phase1.py", "src/pipelines/corruption_flow.py"],
        "artifacts": ["data/reports/phase1_report.md"],
    },
    {
        "role": 2,
        "name": "Nguyễn Quý Dương",
        "mssv": "2A202601642",
        "scope": "Ingestion (Crossref)",
        "git": ["Duong-1211"],
        "owns": ["src/ingestion/crossref.py"],
        "artifacts": ["data/raw/crossref_response.json", "data/raw/crossref_records.json"],
    },
    {
        "role": 3,
        "name": "Hoàng Công Thành",
        "mssv": "2A202601662",
        "scope": "Cleaning & corruption",
        "git": ["stephHoang30"],
        "owns": ["src/ingestion/cleaning.py", "src/ingestion/corruption.py"],
        "artifacts": ["data/clean/papers_clean.json", "data/quality/cleaning_log.json"],
    },
    {
        "role": 4,
        "name": "Trần Văn Ngọc",
        "mssv": "2A202601512",
        "scope": "RAG & agent",
        "git": ["Van Nia"],
        "owns": ["src/retrieval/index.py", "src/retrieval/agent.py", "src/retrieval/qa.py", "src/retrieval/embeddings.py"],
        "artifacts": ["data/embeddings/papers_embeddings.json"],
    },
    {
        "role": 5,
        "name": "Hồ Văn Tâm",
        "mssv": "2A202601542",
        "scope": "Evaluation & observability",
        "git": ["tomhv4499"],
        "owns": ["src/evaluation/testset.py", "src/evaluation/metrics.py", "src/observability/quality.py", "src/observability/reporting.py"],
        "artifacts": ["data/eval/test_set.json", "data/results/baseline_metrics.json", "data/quality/freshness_report.json"],
    },
]

CHECKPOINTS = [
    ("CP0", "Contract & ingestion raw", ["data/raw/crossref_records.json"]),
    ("CP1", "Cleaning & quality gates", ["data/clean/papers_clean.json", "data/quality/cleaning_log.json"]),
    ("CP2", "Test set, index & agent", ["data/eval/test_set.json", "data/embeddings/papers_embeddings.json"]),
    ("CP3", "Baseline end-to-end", ["data/results/baseline_metrics.json", "data/quality/freshness_report.json", "data/reports/phase1_report.md"]),
    ("CP4", "Corruption", ["data/results/corruption_log.json", "data/clean/papers_clean_corrupted.json"]),
    ("CP5", "Repair & so sánh", ["data/results/repaired_metrics.json", "data/reports/corruption_report.md"]),
]


def _git(*args: str) -> str:
    try:
        return subprocess.run(
            ["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=20
        ).stdout.strip()
    except (subprocess.SubprocessError, OSError):
        return ""


def _has_todo(path: Path) -> bool:
    if not path.exists():
        return True
    text = path.read_text(encoding="utf-8", errors="ignore")
    return "NotImplementedError" in text or "TODO(student)" in text


def _commit_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for line in _git("log", "--format=%an").splitlines():
        counts[line.strip()] = counts.get(line.strip(), 0) + 1
    return counts


def _bar(done: int, total: int, width: int = 10) -> str:
    if total == 0:
        return "-" * width
    filled = round(width * done / total)
    return "█" * filled + "·" * (width - filled)


def render() -> str:
    counts = _commit_counts()
    lines: list[str] = []

    branch = _git("rev-parse", "--abbrev-ref", "HEAD") or "?"
    head = _git("log", "-1", "--format=%h %s")
    lines.append(f"TIẾN ĐỘ NHÓM SPIDERMAN — nhánh {branch} @ {head[:60]}")
    lines.append("")

    header = f"{'':<3}{'Thành viên':<24}{'Phạm vi':<28}{'Code':<14}{'Artifact':<14}{'Commit':>7}"
    lines.append(header)
    lines.append("-" * len(header))

    for m in MEMBERS:
        owns = [ROOT / p for p in m["owns"]]
        code_done = sum(0 if _has_todo(p) else 1 for p in owns)
        arts = [ROOT / p for p in m["artifacts"]]
        art_done = sum(1 for p in arts if p.exists())
        commits = sum(counts.get(name, 0) for name in m["git"])
        lines.append(
            f"R{m['role']} {m['name']:<24}{m['scope']:<28}"
            f"{_bar(code_done, len(owns))} {code_done}/{len(owns)}  "
            f"{_bar(art_done, len(arts))} {art_done}/{len(arts)}  "
            f"{commits:>5}"
        )

    lines.append("")
    lines.append("Module còn NotImplementedError:")
    pending = [p for m in MEMBERS for p in m["owns"] if _has_todo(ROOT / p)]
    lines.extend(f"  - {p}" for p in pending) if pending else lines.append("  (không còn)")

    lines.append("")
    lines.append("Checkpoint (theo artifact thực tế trên đĩa):")
    for code, title, artifacts in CHECKPOINTS:
        have = sum(1 for a in artifacts if (ROOT / a).exists())
        mark = "DONE" if have == len(artifacts) else ("...." if have else "    ")
        missing = [a for a in artifacts if not (ROOT / a).exists()]
        tail = f"  thiếu: {', '.join(missing)}" if missing else ""
        lines.append(f"  [{mark}] {code} {title:<28} {have}/{len(artifacts)}{tail}")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--watch", type=int, metavar="GIÂY", help="tự chạy lại theo chu kỳ")
    args = parser.parse_args()

    if not args.watch:
        print(render())
        return 0

    try:
        while True:
            print("\033[2J\033[H" + render(), flush=True)
            print(f"\n(làm mới mỗi {args.watch}s — Ctrl-C để dừng)", flush=True)
            time.sleep(args.watch)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
