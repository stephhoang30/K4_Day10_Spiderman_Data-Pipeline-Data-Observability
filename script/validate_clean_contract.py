"""Sample validation raw -> clean -> corrupted cho Vai tro 3.

Chay doc lap voi Crossref: dung sample raw records dung schema `PaperRecord`,
nen kiem tra duoc rule cleaning va corruption ngay ca khi ingestion chua xong.

    uv run python script/validate_clean_contract.py
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from core.utils import read_json  # noqa: E402
from ingestion.cleaning import CLEAN_COLUMNS, build_clean_dataframe  # noqa: E402
from ingestion.corruption import corrupt_clean_dataframe  # noqa: E402
from ingestion.crossref import PaperRecord  # noqa: E402

RUN_DATE = datetime(2026, 8, 6, tzinfo=UTC)
LONG_SUMMARY = (
    "We study agentic retrieval augmented generation pipelines and show that "
    "data quality regressions propagate directly into answer accuracy."
)


def _record(index: int, **overrides) -> PaperRecord:
    published = (RUN_DATE - timedelta(days=10 * index)).date().isoformat()
    payload = {
        "paper_id": f"10.1000/sample.{index}",
        "title": f"Sample Paper Number {index} On Agentic Retrieval",
        "summary": f"{LONG_SUMMARY} Paper {index} focuses on evaluation harnesses.",
        "authors": [f"Author {index} A", f"Author {index} B"],
        "categories": ["Computer Science", "Information Retrieval"],
        "primary_category": "Computer Science",
        "published": published,
        "updated": published,
        "abs_url": f"https://doi.org/10.1000/sample.{index}",
        "pdf_url": f"https://example.org/pdf/{index}.pdf",
        "comment": "",
    }
    payload.update(overrides)
    return PaperRecord(**payload)


def build_sample_records() -> list[PaperRecord]:
    """12 record hop le + 6 record xau, phu het rule loai row."""
    records = [_record(index) for index in range(1, 13)]
    records += [
        # JATS/HTML tag + entity trong abstract cua Crossref.
        _record(
            13,
            summary=f"<jats:p>{LONG_SUMMARY} Retrieval &amp; evaluation matter.</jats:p>",
            title="  Sample   Paper   Number 13 On   Agentic Retrieval  ",
            authors=["Author 13 A", "author 13 a", "", None],
        ),
        _record(14, paper_id=""),  # missing paper_id
        _record(15, title="Short"),  # short title
        _record(16, summary="Too short."),  # short summary
        _record(17, published="not-a-date"),  # unparsable date
        _record(18, paper_id="10.1000/sample.1"),  # duplicate paper_id
        _record(19, title="Sample Paper Number 2 On Agentic Retrieval"),  # duplicate title
    ]
    return records


def check(condition: bool, label: str, failures: list[str]) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {label}")
    if not condition:
        failures.append(label)


def main() -> int:
    failures: list[str] = []
    records = build_sample_records()

    print(f"\n== raw -> clean ({len(records)} raw records) ==")
    df = build_clean_dataframe(records, RUN_DATE)
    rejects = df.attrs["cleaning_rejects"]

    check(list(df.columns) == CLEAN_COLUMNS, "columns khop CLEAN_COLUMNS", failures)
    check(len(df) == 13, f"giu 13 row hop le (thuc te {len(df)})", failures)
    check(rejects["missing_paper_id"] == 1, "loai 1 row thieu paper_id", failures)
    check(rejects["short_title"] == 1, "loai 1 row title qua ngan", failures)
    check(rejects["short_summary"] == 1, "loai 1 row summary qua ngan", failures)
    check(rejects["unparsable_published"] == 1, "loai 1 row published khong parse duoc", failures)
    check(rejects["duplicate_paper_id"] == 1, "loai 1 row trung paper_id", failures)
    check(rejects["duplicate_title"] == 1, "loai 1 row trung title", failures)
    check(df["paper_id"].is_unique, "paper_id unique", failures)
    check(df["summary"].str.contains("<").sum() == 0, "khong con tag JATS/HTML trong summary", failures)
    check(df["summary"].str.contains("&amp;").sum() == 0, "HTML entity da unescape", failures)
    check("  " not in "".join(df["title"]), "title da gom whitespace", failures)
    check((df["age_days"] >= 0).all(), "age_days khong am", failures)
    check((df["summary_chars"] == df["summary"].str.len()).all(), "summary_chars khop do dai summary", failures)
    check(
        df["text_for_embedding"].str.startswith("Title: ").all()
        and df["text_for_embedding"].str.contains("Summary: ").all(),
        "text_for_embedding co du block Title/Authors/Categories/Published/Summary",
        failures,
    )
    check(
        df["published"].tolist() == sorted(df["published"].tolist(), reverse=True),
        "sort published giam dan",
        failures,
    )
    row13 = df[df["paper_id"] == "10.1000/sample.13"].iloc[0]
    check(row13["authors"] == ["Author 13 A"], "authors dedupe case-insensitive va bo rong", failures)

    print(f"\n== clean -> corrupted ({len(df)} clean rows) ==")
    with tempfile.TemporaryDirectory() as tmp:
        log_path = Path(tmp) / "corruption_log.json"
        corrupted = corrupt_clean_dataframe(df, log_path)
        log = read_json(log_path)

    totals = log["totals"]
    check(list(corrupted.columns) == CLEAN_COLUMNS, "corrupted giu nguyen CLEAN_COLUMNS", failures)
    check(len(log["actions"]) == 6, f"log ghi du 6 loai corruption (thuc te {len(log['actions'])})", failures)
    check(log["rows_before"] == len(df), "log ghi dung rows_before", failures)
    check(log["rows_after"] == len(corrupted), "log ghi dung rows_after", failures)
    check(not corrupted["paper_id"].is_unique, "duplicate lam paper_id het unique", failures)
    check((corrupted["summary_chars"] == 0).sum() >= totals["blank_summary"], "co row summary rong", failures)
    check(corrupted["summary"].str.contains("OCR-ERR", regex=False).any(), "co row summary bi noise", failures)
    check(corrupted["title"].str.endswith("...").any(), "co row title bi truncate", failures)
    check((corrupted["age_days"] > 180).any(), "co row vuot freshness threshold 180 ngay", failures)
    dropped = set(log["actions"][0]["paper_ids"])
    check(dropped.isdisjoint(set(corrupted["paper_id"])), "paper moi nhat da bi xoa khoi corpus", failures)
    check(
        (corrupted["summary_chars"] == corrupted["summary"].str.len()).all()
        and corrupted["text_for_embedding"].str.startswith("Title: ").all(),
        "derived columns da duoc rebuild sau corruption",
        failures,
    )

    rerun = corrupt_clean_dataframe(df, Path(tempfile.gettempdir()) / "corruption_log_rerun.json")
    check(rerun["text_for_embedding"].tolist() == corrupted["text_for_embedding"].tolist(), "corruption deterministic", failures)

    print("\n== corruption log ==")
    for action in log["actions"]:
        print(f"  {action['type']:<22} {action['rows_affected']:>2} rows  [{action['target_pillar']}]")

    if failures:
        print(f"\n{len(failures)} check FAIL:")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(f"\nTat ca check PASS. clean={len(df)} rows -> corrupted={len(corrupted)} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
