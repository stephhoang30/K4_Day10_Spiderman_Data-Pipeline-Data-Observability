from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import date, datetime
import html
import json
from pathlib import Path
import re
from typing import Any

import pandas as pd

from core.config import Settings
from core.utils import compact_join, normalize_whitespace, now_utc, write_csv, write_json
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

# Crossref boc abstract trong <jats:title>Abstract</jats:title>; sau khi strip tag
# thi con lai chu "Abstract" dan dau. Phai bo vi qa.first_sentence(summary) chinh
# la answer cho cau hoi summary — de nguyen thi ground truth bat dau bang rac.
_ABSTRACT_LABEL_RE = re.compile(
    r"^\s*(abstract|summary|аннотация|摘要|resumen|r[ée]sum[ée])\b[\s:.\-–—]*",
    re.IGNORECASE,
)


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


def _strip_abstract_label(text: str) -> str:
    """Bo nhan 'Abstract' dan dau con lai sau khi strip tag JATS."""
    return _ABSTRACT_LABEL_RE.sub("", text, count=1).strip()


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


#: State ma corruption co y pha uniqueness/completeness — gate khong ep hai muc do.
LENIENT_STATES = {"corrupted"}

_TEXT_BLOCK_LABELS = ("Title:", "Authors:", "Categories:", "Published:", "Summary:")


class CleanContractError(ValueError):
    """Cleaned dataframe vi pham contract, khong duoc di tiep sang index."""


def assert_clean_contract(df: pd.DataFrame, *, state: str = "baseline") -> dict[str, Any]:
    """Gate chan truoc khi build index. Raise CleanContractError neu vi pham.

    Hai muc kiem tra:

    - **Schema** — ap dung cho moi state, ke ca corrupted: du cot, `paper_id` va
      `title` khong rong, `text_for_embedding` khong rong va con du 5 nhan,
      `age_days` khong am. Corruption sua noi dung chu khong duoc pha schema,
      neu pha thi index se hong va bang so sanh mat y nghia.
    - **Chat luong** — chi ap dung cho state khong nam trong LENIENT_STATES:
      `paper_id` unique va khong co summary rong. Corrupted co y vi pham hai
      dieu nay nen bo qua, con baseline/repaired thi vi pham la loi that.
    """
    if df.empty:
        raise CleanContractError(f"Cleaned dataset cua state '{state}' rong.")

    missing = [column for column in CLEAN_COLUMNS if column not in df.columns]
    if missing:
        raise CleanContractError(f"State '{state}' thieu cot: {', '.join(missing)}.")

    problems: list[str] = []

    blank_paper_id = int((df["paper_id"].astype(str).str.strip() == "").sum())
    if blank_paper_id:
        problems.append(f"{blank_paper_id} row co paper_id rong")

    blank_title = int((df["title"].astype(str).str.strip() == "").sum())
    if blank_title:
        problems.append(f"{blank_title} row co title rong")

    text = df["text_for_embedding"].astype(str)
    blank_text = int((text.str.strip() == "").sum())
    if blank_text:
        problems.append(f"{blank_text} row co text_for_embedding rong")

    malformed = int((~text.str.startswith(_TEXT_BLOCK_LABELS[0])).sum())
    if malformed:
        problems.append(f"{malformed} row co text_for_embedding sai dinh dang")

    negative_age = int((pd.to_numeric(df["age_days"], errors="coerce").fillna(-1) < 0).sum())
    if negative_age:
        problems.append(f"{negative_age} row co age_days am hoac khong parse duoc")

    duplicate_paper_ids = int(len(df) - df["paper_id"].nunique())
    empty_summaries = int((pd.to_numeric(df["summary_chars"], errors="coerce").fillna(0) == 0).sum())
    if state not in LENIENT_STATES:
        if duplicate_paper_ids:
            problems.append(f"{duplicate_paper_ids} row trung paper_id")
        if empty_summaries:
            problems.append(f"{empty_summaries} row co summary rong")

    if problems:
        raise CleanContractError(f"State '{state}' vi pham contract: " + "; ".join(problems) + ".")

    return {
        "state": state,
        "strict": state not in LENIENT_STATES,
        "rows": int(len(df)),
        "duplicate_paper_ids": duplicate_paper_ids,
        "empty_summaries": empty_summaries,
        "blank_text_for_embedding": blank_text,
    }


def summarize_clean_dataframe(df: pd.DataFrame) -> dict[str, Any]:
    """Tin hieu chat luong doc thang tu cleaned dataframe.

    Role 5 dung lai cho data quality report thay vi tinh lai tu dau.
    """
    if df.empty:
        return {"rows": 0}

    return {
        "rows": int(len(df)),
        "unique_paper_ids": int(df["paper_id"].nunique()),
        "paper_id_is_unique": bool(df["paper_id"].is_unique),
        "empty_title": int((df["title"].str.len() == 0).sum()),
        "empty_summary": int((df["summary_chars"] == 0).sum()),
        "empty_authors": int((df["authors_joined"].str.len() == 0).sum()),
        "empty_categories": int((df["categories_joined"].str.len() == 0).sum()),
        "summary_chars": {
            "min": int(df["summary_chars"].min()),
            "max": int(df["summary_chars"].max()),
            "mean": round(float(df["summary_chars"].mean()), 1),
        },
        "age_days": {
            "min": int(df["age_days"].min()),
            "max": int(df["age_days"].max()),
            "mean": round(float(df["age_days"].mean()), 1),
        },
        "published": {
            "latest": str(df["published"].max()),
            "oldest": str(df["published"].min()),
        },
    }


def _relative_to(path: Path, root: Path | None) -> str:
    if root is None:
        return str(path)
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def write_cleaning_log(
    df: pd.DataFrame,
    log_path,
    csv_path=None,
    json_path=None,
    project_dir: Path | None = None,
    state: str = "baseline",
) -> dict[str, Any]:
    """Ghi log count/ly do loai record ra artifact rieng.

    `df.attrs` khong song sot qua vong ghi file, nen neu khong ghi log nay thi
    khong con cach nao truy vet duoc record da bi filter hay dedupe.

    Tach rieng khoi `write_clean_artifacts` de pipeline goi duoc ma khong can
    truyen `Settings`.
    """
    log_path = Path(log_path)
    rejects = df.attrs.get("cleaning_rejects", {})
    rows_in = df.attrs.get("rows_in", len(df))
    log = {
        "generated_at": now_utc().isoformat(),
        "state": state,
        "rows_in": int(rows_in),
        "rows_out": int(len(df)),
        "rows_dropped": int(rows_in) - int(len(df)),
        "rejects": rejects,
        "rules": {
            "min_title_chars": MIN_TITLE_CHARS,
            "min_summary_chars": MIN_SUMMARY_CHARS,
            "dedupe_keys": ["paper_id", "title (lowercase)"],
            "dropped_when_published_unparsable": True,
        },
        "columns": CLEAN_COLUMNS,
        "derived_columns": DERIVED_COLUMNS,
        "signals": summarize_clean_dataframe(df),
        "outputs": {
            "csv": _relative_to(Path(csv_path), project_dir) if csv_path else None,
            "json": _relative_to(Path(json_path), project_dir) if json_path else None,
            "canonical": "json",
        },
    }
    write_json(log_path, log)
    return log


def write_clean_artifacts(
    df: pd.DataFrame,
    settings: Settings,
    csv_path: Path | None = None,
    json_path: Path | None = None,
    log_path: Path | None = None,
    state: str = "baseline",
) -> dict[str, Any]:
    """Ghi cleaned dataset ra CSV/JSON va ghi kem cleaning log.

    Tra ve chinh log da ghi de caller dung tiep ma khong phai doc lai file.

    Luu y: CSV se stringify cot `authors` va `categories` (kieu list). Ban JSON
    moi la ban canonical de load lai.
    """
    csv_path = Path(csv_path or settings.paths.clean_csv)
    json_path = Path(json_path or settings.paths.clean_json)
    log_path = Path(log_path or settings.paths.quality_dir / "cleaning_log.json")

    write_csv(df, csv_path)
    write_json(json_path, json.loads(df.to_json(orient="records", date_format="iso")))

    log = write_cleaning_log(
        df,
        log_path,
        csv_path=csv_path,
        json_path=json_path,
        project_dir=settings.paths.project_dir,
        state=state,
    )
    return log


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

        summary = _strip_abstract_label(_clean_text(payload.get("summary")))
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
