from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from core.config import Settings
from core.utils import now_utc, write_json
from ingestion.cleaning import MIN_SUMMARY_CHARS


def _non_blank_mask(series: pd.Series) -> pd.Series:
    return series.notna() & series.astype(str).str.strip().ne("")


def _check(status: bool, actual: Any, expected: Any, message: str) -> dict[str, Any]:
    return {
        "status": "PASS" if status else "FAIL",
        "passed": bool(status),
        "actual": actual,
        "expected": expected,
        "message": message,
    }


def _parse_published_dates(df: pd.DataFrame) -> pd.Series:
    if "published" not in df.columns:
        return pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns, UTC]")
    return pd.to_datetime(df["published"], errors="coerce", utc=True)


def _freshness_payload(df: pd.DataFrame, settings: Settings) -> dict[str, Any]:
    dates = _parse_published_dates(df)
    total_rows = int(len(df))
    valid_dates = int(dates.notna().sum())

    if "age_days" in df.columns:
        age_days = pd.to_numeric(df["age_days"], errors="coerce")
    else:
        today = pd.Timestamp(now_utc().date(), tz="UTC")
        age_days = (today - dates).dt.days

    stale_mask = age_days > settings.freshness_threshold_days
    invalid_age_rows = int((dates.isna() | age_days.isna()).sum())
    stale_rows = int(stale_mask.fillna(False).sum())
    is_fresh = total_rows > 0 and invalid_age_rows == 0 and stale_rows == 0

    valid_published = dates.dropna()
    latest = valid_published.max().date().isoformat() if not valid_published.empty else None
    oldest = valid_published.min().date().isoformat() if not valid_published.empty else None

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "latest_published": latest,
        "oldest_published": oldest,
        "stale_rows": stale_rows,
        "invalid_published_or_age_rows": invalid_age_rows,
        "valid_published_rows": valid_dates,
        "total_rows": total_rows,
        "freshness_threshold_days": int(settings.freshness_threshold_days),
        "is_fresh": is_fresh,
        "status": "PASS" if is_fresh else "FAIL",
    }


def run_data_quality_checks(df: pd.DataFrame, settings: Settings, report_name: str) -> dict[str, Any]:
    """Run clean-data contract checks and persist a JSON quality report."""
    row_count = int(len(df))
    checks: dict[str, dict[str, Any]] = {
        "row_count": _check(
            row_count > 0,
            row_count,
            "> 0",
            "Dataframe phải có ít nhất một record.",
        )
    }

    if "paper_id" in df.columns:
        paper_ids = _non_blank_mask(df["paper_id"])
        non_null_ids = int(paper_ids.sum())
        duplicate_ids = int(df.loc[paper_ids, "paper_id"].duplicated().sum())
        checks["paper_id_not_null"] = _check(
            non_null_ids == row_count,
            non_null_ids,
            row_count,
            "Tất cả paper_id phải khác null và khác rỗng.",
        )
        checks["paper_id_unique"] = _check(
            duplicate_ids == 0,
            duplicate_ids,
            0,
            "paper_id không được trùng.",
        )
    else:
        checks["paper_id_not_null"] = _check(False, 0, "column exists", "Thiếu cột paper_id.")
        checks["paper_id_unique"] = _check(False, 0, "column exists", "Thiếu cột paper_id.")

    if "title" in df.columns:
        non_blank_titles = int(_non_blank_mask(df["title"]).sum())
        checks["title_not_null"] = _check(
            non_blank_titles == row_count,
            non_blank_titles,
            row_count,
            "Tất cả title phải khác null và khác rỗng.",
        )
    else:
        checks["title_not_null"] = _check(False, 0, "column exists", "Thiếu cột title.")

    if "summary_chars" in df.columns:
        summary_chars = pd.to_numeric(df["summary_chars"], errors="coerce")
    elif "summary" in df.columns:
        summary_chars = df["summary"].fillna("").astype(str).str.len()
    else:
        summary_chars = pd.Series(float("nan"), index=df.index)
    short_summaries = int((summary_chars < MIN_SUMMARY_CHARS).fillna(True).sum())
    checks["summary_length"] = _check(
        short_summaries == 0,
        {"short_rows": short_summaries, "minimum_chars": MIN_SUMMARY_CHARS},
        {"short_rows": 0, "minimum_chars": MIN_SUMMARY_CHARS},
        f"summary phải dài ít nhất {MIN_SUMMARY_CHARS} ký tự.",
    )

    if "age_days" in df.columns:
        age_days = pd.to_numeric(df["age_days"], errors="coerce")
        invalid_age_rows = int((age_days.isna() | (age_days < 0)).sum())
        checks["age_days_valid"] = _check(
            invalid_age_rows == 0,
            invalid_age_rows,
            0,
            "age_days phải parse được và không âm.",
        )
    else:
        checks["age_days_valid"] = _check(False, 0, "column exists", "Thiếu cột age_days.")

    freshness = _freshness_payload(df, settings)
    checks["freshness"] = _check(
        freshness["is_fresh"],
        {
            "stale_rows": freshness["stale_rows"],
            "invalid_rows": freshness["invalid_published_or_age_rows"],
        },
        {"stale_rows": 0, "invalid_rows": 0},
        "Không có record vượt ngưỡng freshness hoặc thiếu tuổi dữ liệu.",
    )

    passed = all(item["passed"] for item in checks.values())
    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "report_name": report_name,
        "status": "PASS" if passed else "FAIL",
        "passed": passed,
        "total_checks": len(checks),
        "passed_checks": sum(item["passed"] for item in checks.values()),
        "failed_checks": sum(not item["passed"] for item in checks.values()),
        "checks": checks,
        "freshness": freshness,
    }
    report_path = Path(settings.paths.quality_dir) / f"{report_name}_quality.json"
    write_json(report_path, report)
    return report


def build_freshness_report(df: pd.DataFrame, settings: Settings, report_path) -> dict[str, Any]:
    """Build and persist a freshness report for a cleaned dataframe."""
    report = _freshness_payload(df, settings)
    write_json(Path(report_path), report)
    return report
