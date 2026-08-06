from __future__ import annotations

import pandas as pd

from core.config import load_settings
from core.utils import now_utc, read_json
from evaluation.metrics import evaluate_pipeline
from ingestion.cleaning import build_clean_dataframe
from ingestion.corruption import corrupt_clean_dataframe
from ingestion.crossref import load_raw_records
from observability.quality import build_freshness_report, run_data_quality_checks
from observability.reporting import generate_corruption_report
from pipelines.phase1 import _save_clean_artifacts, _validate_clean_dataframe
from retrieval.index import LocalEmbeddingIndex


def _evaluate_state(
    state, df, settings, embeddings_path, metrics_path, answers_path
):
    _validate_clean_dataframe(df, state=state)
    print(f"[corruption] Evaluating {state} data", flush=True)
    index = LocalEmbeddingIndex.build(
        df,
        settings=settings,
        embeddings_output_path=embeddings_path,
    )
    evaluation = evaluate_pipeline(
        settings=settings,
        index=index,
        test_set_path=settings.paths.eval_testset,
        metrics_output_path=metrics_path,
        answers_output_path=answers_path,
    )
    quality = run_data_quality_checks(df, settings=settings, report_name=state)
    freshness = build_freshness_report(
        df,
        settings=settings,
        report_path=settings.paths.quality_dir / f"{state}_freshness_report.json",
    )
    return evaluation, quality, freshness


def main() -> None:
    settings = load_settings()
    required = [
        settings.paths.raw_records_json,
        settings.paths.clean_json,
        settings.paths.eval_testset,
        settings.paths.baseline_metrics,
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "Run script/run_phase1.py first. Missing:\n- " + "\n- ".join(missing)
        )

    baseline_metrics = read_json(settings.paths.baseline_metrics)

    print("[corruption] Corrupting baseline data", flush=True)
    baseline_df = pd.DataFrame(read_json(settings.paths.clean_json))
    _validate_clean_dataframe(baseline_df, state="baseline")
    corrupted_df = corrupt_clean_dataframe(
        baseline_df.copy(deep=True), settings.paths.corruption_log
    )
    _save_clean_artifacts(
        corrupted_df,
        settings.paths.corrupted_clean_csv,
        settings.paths.corrupted_clean_json,
    )

    corrupted_evaluation, corrupted_quality, corrupted_freshness = _evaluate_state(
        "corrupted",
        corrupted_df,
        settings,
        settings.paths.corrupted_embeddings_json,
        settings.paths.corrupted_metrics,
        settings.paths.corrupted_answers,
    )

    print("[corruption] Repairing from raw records", flush=True)
    raw_records = load_raw_records(settings.paths.raw_records_json)
    repaired_df = build_clean_dataframe(raw_records, run_date=now_utc())
    _save_clean_artifacts(
        repaired_df,
        settings.paths.repaired_clean_csv,
        settings.paths.repaired_clean_json,
    )
    repaired_evaluation, repaired_quality, repaired_freshness = _evaluate_state(
        "repaired",
        repaired_df,
        settings,
        settings.paths.repaired_embeddings_json,
        settings.paths.repaired_metrics,
        settings.paths.repaired_answers,
    )

    generate_corruption_report(
        settings.paths.comparison_report,
        baseline_metrics=baseline_metrics,
        corrupted_metrics=corrupted_evaluation.summary,
        repaired_metrics=repaired_evaluation.summary,
        corrupted_quality=corrupted_quality,
        repaired_quality=repaired_quality,
        corrupted_freshness=corrupted_freshness,
        repaired_freshness=repaired_freshness,
    )
    print(f"[corruption] Done: {settings.paths.comparison_report}", flush=True)
