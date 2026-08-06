from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import date, datetime
import html
import re
from typing import Any

import pandas as pd

from core.utils import compact_join, normalize_whitespace, now_utc
from ingestion.crossref import PaperRecord

# --- Clean contract ---------------------------------------------------------
# Cac cot duoi day la giao keo giua cleaning va phan con lai cua pipeline:
#   - index._build_documents doc: paper_id, title, text_for_embedding, published,
#     authors_joined, categories_joined, summary, abs_url, pdf_url
#   - qa._extract_answer doc metadata: authors_joined, categories_joined, published, summary
#   - quality/freshness doc: paper_id, title, summary_chars, age_days, published
CLEAN_COLUMNS: list[str] = [
    "paper_id",
    "title",
    "summary",
    "authors",
    "categories",
    "primary_category",
    "published",
    "updated",
    "abs_url",
    "pdf_url",
    "comment",
    "authors_joined",
    "categories_joined",
    "summary_chars",
    "age_days",
    "text_for_embedding",
]

# Cac cot duoc tinh lai tu cot goc. Corruption sua cot goc roi goi
# refresh_derived_columns() de dong bo lai, khong sua tay.
DERIVED_COLUMNS: list[str] = [
    "authors_joined",
    "categories_joined",
    "summary_chars",
    "age_days",
    "text_for_embedding",
]

# Rule loai row xau.
MIN_TITLE_CHARS = 10
MIN_SUMMARY_CHARS = 40

_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
_LIST_SPLIT_RE = re.compile(r"[;|]")


def _record_to_dict(record: PaperRecord | dict[str, Any]) -> dict[str, Any]:
    if is_dataclass(record) and not isinstance(record, type):
        return asdict(record)
    if isinstance(record, dict):
        return dict(record)
    raise TypeError(f"Unsupported record type: {type(record)!r}")


def _clean_text(value: Any) -> str:
    """Bo tag JATS/HTML cua Crossref abstract, unescape entity, gom whitespace."""
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    text = html.unescape(str(value))
    text = _TAG_RE.sub(" ", text)
    return normalize_whitespace(text)


def _clean_list(value: Any) -> list[str]:
    """Chuan hoa authors/categories: list[str], bo rong, dedupe giu thu tu."""
    if value is None:
        return []
    if isinstance(value, str):
        items = _LIST_SPLIT_RE.split(value) if _LIST_SPLIT_RE.search(value) else value.split(",")
    elif isinstance(value, (list, tuple, set)):
        items = list(value)
    else:
        items = [value]

    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = _clean_text(item)
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
    return cleaned


def _parse_date(value: Any) -> date | None:
    text = _clean_text(value)
    if not text:
        return None
    parsed = pd.to_datetime(text, errors="coerce", utc=True)
    if parsed is None or pd.isna(parsed):
        return None
    return parsed.date()


def as_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return _parse_date(value)


def build_text_for_embedding(row: dict[str, Any]) -> str:
    """Text duy nhat duoc embed. Giu ca metadata de semantic search bat duoc
    cau hoi ve authors/date/categories chu khong chi ve noi dung summary."""
    return "\n".join(
        [
            f"Title: {row.get('title', '')}",
            f"Authors: {row.get('authors_joined', '')}",
            f"Categories: {row.get('categories_joined', '')}",
            f"Published: {row.get('published', '')}",
            f"Summary: {row.get('summary', '')}",
        ]
    )


def refresh_derived_columns(df: pd.DataFrame, run_date: datetime | date | None = None) -> pd.DataFrame:
    """Tinh lai DERIVED_COLUMNS tu cot goc.

    Dung o ca hai phia: cuoi buoc cleaning, va sau khi corruption sua title/
    summary/published. Nho vay corrupted dataset luon giu dung schema.
    """
    if df.empty:
        return df

    run_day = as_date(run_date) or now_utc().date()
    working = df.copy()

    working["authors_joined"] = working["authors"].map(lambda value: compact_join(_clean_list(value)))
    working["categories_joined"] = working["categories"].map(lambda value: compact_join(_clean_list(value)))
    working["summary"] = working["summary"].map(lambda value: "" if value is None else str(value))
    working["summary_chars"] = working["summary"].map(len)

    def _age(value: Any) -> int:
        published = as_date(value)
        if published is None:
            return -1
        return max((run_day - published).days, 0)

    working["age_days"] = working["published"].map(_age)
    working["text_for_embedding"] = [build_text_for_embedding(row) for row in working.to_dict(orient="records")]
    return working


def build_clean_dataframe(records: list[PaperRecord], run_date: datetime) -> pd.DataFrame:
    """Clean raw records thanh dataframe san sang de embed.

    Rule loai row (ghi lai trong df.attrs["cleaning_rejects"]):
      - thieu paper_id
      - title ngan hon MIN_TITLE_CHARS
      - summary ngan hon MIN_SUMMARY_CHARS
      - published khong parse duoc
      - trung paper_id, hoac trung title (case-insensitive)
    """
    rows: list[dict[str, Any]] = []
    rejects: dict[str, int] = {
        "missing_paper_id": 0,
        "short_title": 0,
        "short_summary": 0,
        "unparsable_published": 0,
        "duplicate_paper_id": 0,
        "duplicate_title": 0,
    }

    for record in records:
        payload = _record_to_dict(record)

        paper_id = _clean_text(payload.get("paper_id"))
        if not paper_id:
            rejects["missing_paper_id"] += 1
            continue

        title = _clean_text(payload.get("title"))
        if len(title) < MIN_TITLE_CHARS:
            rejects["short_title"] += 1
            continue

        summary = _clean_text(payload.get("summary"))
        if len(summary) < MIN_SUMMARY_CHARS:
            rejects["short_summary"] += 1
            continue

        published = _parse_date(payload.get("published"))
        if published is None:
            rejects["unparsable_published"] += 1
            continue

        updated = _parse_date(payload.get("updated")) or published
        authors = _clean_list(payload.get("authors"))
        categories = _clean_list(payload.get("categories"))
        primary_category = _clean_text(payload.get("primary_category")) or (categories[0] if categories else "")

        rows.append(
            {
                "paper_id": paper_id,
                "title": title,
                "summary": summary,
                "authors": authors,
                "categories": categories,
                "primary_category": primary_category,
                "published": published.isoformat(),
                "updated": updated.isoformat(),
                "abs_url": _clean_text(payload.get("abs_url")),
                "pdf_url": _clean_text(payload.get("pdf_url")),
                "comment": _clean_text(payload.get("comment")),
            }
        )

    df = pd.DataFrame(rows, columns=[column for column in CLEAN_COLUMNS if column not in DERIVED_COLUMNS])
    if df.empty:
        empty = pd.DataFrame(columns=CLEAN_COLUMNS)
        empty.attrs["cleaning_rejects"] = rejects
        empty.attrs["rows_in"] = len(records)
        empty.attrs["rows_out"] = 0
        return empty

    before = len(df)
    df = df.drop_duplicates(subset="paper_id", keep="first")
    rejects["duplicate_paper_id"] = before - len(df)

    before = len(df)
    title_key = df["title"].str.lower()
    df = df[~title_key.duplicated(keep="first")]
    rejects["duplicate_title"] = before - len(df)

    df = refresh_derived_columns(df, run_date)
    df = df.sort_values(["published", "paper_id"], ascending=[False, True]).reset_index(drop=True)
    df = df[CLEAN_COLUMNS]

    df.attrs["cleaning_rejects"] = rejects
    df.attrs["rows_in"] = len(records)
    df.attrs["rows_out"] = len(df)
    return df
