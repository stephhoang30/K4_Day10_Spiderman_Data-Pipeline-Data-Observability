from __future__ import annotations

import json

import pandas as pd

from core.config import load_settings
from core.utils import now_utc, read_json, write_csv, write_json
from evaluation.metrics import evaluate_pipeline
from evaluation.testset import build_test_set
from ingestion.cleaning import build_clean_dataframe
from ingestion.crossref import fetch_source_records, load_raw_records
from observability.quality import build_freshness_report, run_data_quality_checks
from observability.reporting import generate_phase1_report
from retrieval.index import LocalEmbeddingIndex


REQUIRED_CLEAN_COLUMNS = {
    "paper_id",
    "title",
    "summary",
    "published",
    "age_days",
    "authors_joined",
    "categories_joined",
    "text_for_embedding",
    "abs_url",
    "pdf_url",
}


def _validate_clean_dataframe(df: pd.DataFrame, *, state: str) -> None:
    if df.empty:
        raise ValueError(f"The {state} cleaned dataset is empty.")
    missing = sorted(REQUIRED_CLEAN_COLUMNS.difference(df.columns))
    if missing:
        raise ValueError(
            f"The {state} cleaned dataset is missing required columns: {', '.join(missing)}."
        )


def _save_clean_artifacts(df: pd.DataFrame, csv_path, json_path) -> None:
    write_csv(df, csv_path)
    records = json.loads(df.to_json(orient="records", date_format="iso"))
    write_json(json_path, records)


def main() -> None:
    settings = load_settings()
    print("[phase1] Loading raw records", flush=True)
    if settings.paths.raw_records_json.exists() and not settings.refresh_source:
        records = load_raw_records(settings.paths.raw_records_json)
    else:
        records = fetch_source_records(settings)
    if not records:
        raise RuntimeError("No raw records available.")

    run_time = now_utc()
    print(f"[phase1] Cleaning {len(records)} records", flush=True)
    clean_df = build_clean_dataframe(records, run_date=run_time)
    _validate_clean_dataframe(clean_df, state="baseline")
    _save_clean_artifacts(clean_df, settings.paths.clean_csv, settings.paths.clean_json)

    print("[phase1] Building baseline index", flush=True)
    index = LocalEmbeddingIndex.build(
        clean_df,
        settings=settings,
        embeddings_output_path=settings.paths.embeddings_json,
    )

    if settings.refresh_test_set or not settings.paths.eval_testset.exists():
        build_test_set(clean_df, settings.paths.eval_testset)
    test_set = read_json(settings.paths.eval_testset)
    if not test_set:
        raise ValueError("Evaluation test set is empty.")

    print(f"[phase1] Evaluating {len(test_set)} questions", flush=True)
    evaluation = evaluate_pipeline(
        settings=settings,
        index=index,
        test_set_path=settings.paths.eval_testset,
        metrics_output_path=settings.paths.baseline_metrics,
        answers_output_path=settings.paths.baseline_answers,
    )

    print("[phase1] Running quality and freshness checks", flush=True)
    quality = run_data_quality_checks(clean_df, settings=settings, report_name="baseline")
    freshness = build_freshness_report(
        clean_df,
        settings=settings,
        report_path=settings.paths.freshness_report,
    )
    source_summary = {
        "source": settings.source_api,
        "query": settings.source_query,
        "filter": settings.source_filter,
        "raw_records": len(records),
        "clean_records": len(clean_df),
        "run_at": run_time.isoformat(),
    }
    generate_phase1_report(
        settings.paths.baseline_report,
        source_summary=source_summary,
        metrics=evaluation.summary,
        quality=quality,
        freshness=freshness,
    )
    print(f"[phase1] Done: {settings.paths.baseline_report}", flush=True)
