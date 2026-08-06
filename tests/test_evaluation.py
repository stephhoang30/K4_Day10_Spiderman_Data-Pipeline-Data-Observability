from types import SimpleNamespace

import pandas as pd

from evaluation import metrics, testset
from evaluation.testset import build_test_set
from observability import quality, reporting


def test_build_test_set_is_deterministic_and_skips_missing_fields(monkeypatch) -> None:
    dataframe = pd.DataFrame(
        [
            {
                "paper_id": "doi-2",
                "title": "Second Paper",
                "published": "2024",
                "authors_joined": pd.NA,
                "summary": "Second summary.",
                "categories_joined": "biology, data",
            },
            {
                "paper_id": "doi-1",
                "title": "First Paper",
                "published": "2023",
                "authors_joined": "Ada Lovelace, Alan Turing",
                "summary": "First summary.",
                "categories_joined": "computer science",
            },
        ]
    )

    written = {}
    monkeypatch.setattr(testset, "write_json", lambda path, payload: written.update({"payload": payload}))
    output_path = "test_set.json"
    samples = build_test_set(dataframe, output_path)

    assert [sample["id"] for sample in samples] == [
        "qa-001-date",
        "qa-002-authors",
        "qa-003-summary",
        "qa-004-categories",
        "qa-005-date",
        "qa-006-summary",
        "qa-007-categories",
    ]
    assert all(sample["ground_truth_doc_ids"] for sample in samples)
    assert not any(sample["question_type"] == "authors" and "Second" in sample["question"] for sample in samples)
    assert written["payload"] == samples


def test_build_test_set_rejects_duplicate_or_missing_ids() -> None:
    duplicate = pd.DataFrame(
        [{"paper_id": "doi-1", "title": "Paper"}, {"paper_id": "doi-1", "title": "Copy"}]
    )
    missing = pd.DataFrame([{"paper_id": pd.NA, "title": "Paper", "published": "2024"}])

    try:
        build_test_set(duplicate, "unused.json")
    except ValueError as error:
        assert "unique paper_id" in str(error)
    else:
        raise AssertionError("Duplicate paper IDs should be rejected")

    try:
        build_test_set(missing, "unused.json")
    except ValueError as error:
        assert "non-empty paper_id" in str(error)
    else:
        raise AssertionError("Missing paper IDs should be rejected")


def test_structured_answer_metrics_are_field_aware() -> None:
    assert metrics._answer_metric("date", "2024", " 2024 ") == 1.0
    assert metrics._answer_metric("authors", "Ada Lovelace, Alan Turing", "Alan Turing, Ada Lovelace") == 1.0
    assert metrics._answer_metric("categories", "biology, data", "biology") < 1.0


def test_evaluate_pipeline_reports_rank_and_error_type(monkeypatch) -> None:
    answers = iter(
        [
            SimpleNamespace(
                answer="2024",
                retrieved_doc_ids=["doi-1"],
                retrieved_contexts=["context"],
                retrieved_scores=[0.9],
            ),
            SimpleNamespace(
                answer="wrong",
                retrieved_doc_ids=["doi-2", "doi-1"],
                retrieved_contexts=["context"],
                retrieved_scores=[0.8, 0.7],
            ),
        ]
    )
    monkeypatch.setattr(metrics, "answer_question", lambda *args, **kwargs: next(answers))
    monkeypatch.delenv("RUN_LLM_JUDGE", raising=False)
    monkeypatch.delenv("RUN_RAGAS", raising=False)

    test_set = [
        {"id": "qa-1", "question_type": "date", "question": "q1", "ground_truth": "2024", "ground_truth_doc_ids": ["doi-1"]},
        {"id": "qa-2", "question_type": "date", "question": "q2", "ground_truth": "2024", "ground_truth_doc_ids": ["doi-1"]},
    ]
    written = {}
    monkeypatch.setattr(metrics, "read_json", lambda path: test_set)
    monkeypatch.setattr(metrics, "write_json", lambda path, payload: written.update({str(path): payload}))

    class SettingsStub:
        top_k = 2

    bundle = metrics.evaluate_pipeline(
        SettingsStub(),
        index=None,
        test_set_path="test_set.json",
        metrics_output_path="metrics.json",
        answers_output_path="answers.json",
        dataset_variant="corrupted",
    )

    assert bundle.summary["dataset_variant"] == "corrupted"
    assert bundle.summary["retrieval_recall_at_1"] == 0.5
    assert bundle.summary["retrieval_recall_at_k"] == 1.0
    assert bundle.answers[0]["error_type"] == "none"
    assert bundle.answers[1]["error_type"] == "answer_mismatch"
    assert bundle.answers[1]["retrieval_rank"] == 2
    assert "metrics.json" in written
    assert "answers.json" in written


def test_quality_checks_pass_and_write_report(monkeypatch) -> None:
    written = {}
    monkeypatch.setattr(quality, "write_json", lambda path, payload: written.update({str(path): payload}))
    settings = SimpleNamespace(
        freshness_threshold_days=180,
        paths=SimpleNamespace(quality_dir="quality"),
    )
    dataframe = pd.DataFrame(
        [
            {"paper_id": "doi-1", "title": "A valid title", "summary_chars": 50, "age_days": 10, "published": "2026-07-01"},
            {"paper_id": "doi-2", "title": "Another title", "summary_chars": 60, "age_days": 20, "published": "2026-06-01"},
        ]
    )

    report = quality.run_data_quality_checks(dataframe, settings, "baseline")

    assert report["status"] == "PASS"
    assert report["failed_checks"] == 0
    assert report["freshness"]["is_fresh"] is True
    assert "quality\\baseline_quality.json" in written or "quality/baseline_quality.json" in written


def test_quality_checks_fail_on_contract_and_freshness_issues(monkeypatch) -> None:
    monkeypatch.setattr(quality, "write_json", lambda path, payload: None)
    settings = SimpleNamespace(
        freshness_threshold_days=180,
        paths=SimpleNamespace(quality_dir="quality"),
    )
    dataframe = pd.DataFrame(
        [
            {"paper_id": "doi-1", "title": "", "summary_chars": 10, "age_days": 200, "published": "2026-01-01"},
            {"paper_id": "doi-1", "title": "A valid title", "summary_chars": 50, "age_days": -1, "published": "not-a-date"},
        ]
    )

    report = quality.run_data_quality_checks(dataframe, settings, "corrupted")

    assert report["status"] == "FAIL"
    assert report["checks"]["paper_id_unique"]["passed"] is False
    assert report["checks"]["title_not_null"]["passed"] is False
    assert report["checks"]["summary_length"]["passed"] is False
    assert report["checks"]["age_days_valid"]["passed"] is False
    assert report["freshness"]["stale_rows"] == 1
    assert report["freshness"]["invalid_published_or_age_rows"] == 1


def test_freshness_report_contains_date_range_and_stale_count(monkeypatch) -> None:
    written = {}
    monkeypatch.setattr(quality, "write_json", lambda path, payload: written.update({str(path): payload}))
    settings = SimpleNamespace(freshness_threshold_days=180)
    dataframe = pd.DataFrame(
        [
            {"published": "2026-01-01", "age_days": 200},
            {"published": "2026-07-01", "age_days": 30},
        ]
    )

    report = quality.build_freshness_report(dataframe, settings, "freshness.json")

    assert report["latest_published"] == "2026-07-01"
    assert report["oldest_published"] == "2026-01-01"
    assert report["stale_rows"] == 1
    assert report["is_fresh"] is False
    assert "freshness.json" in written


def test_phase1_report_contains_metrics_quality_and_freshness(monkeypatch) -> None:
    written = {}
    monkeypatch.setattr(reporting, "write_text", lambda path, content: written.update({str(path): content}))

    reporting.generate_phase1_report(
        "phase1_report.md",
        source_summary={"source": "Crossref", "raw_records": 20, "clean_records": 18},
        metrics={
            "retrieval_hit_rate": 0.8,
            "mean_token_f1": 0.7,
            "judge_accuracy": 0.9,
            "mean_judge_score": 4.5,
            "by_question_type": {
                "date": {
                    "samples": 4,
                    "retrieval_recall_at_k": 1.0,
                    "answer_accuracy": 1.0,
                    "mean_judge_score": 5.0,
                }
            },
        },
        quality={
            "status": "PASS",
            "checks": {
                "row_count": {
                    "status": "PASS",
                    "actual": 18,
                    "expected": "> 0",
                    "message": "ok",
                }
            },
        },
        freshness={
            "status": "PASS",
            "is_fresh": True,
            "latest_published": "2026-07-01",
            "stale_rows": 0,
            "total_rows": 18,
        },
    )

    content = written["phase1_report.md"]
    assert "# Baseline Data Pipeline Report" in content
    assert "retrieval_hit_rate" in content
    assert "mean_judge_score" in content
    assert "## Data quality" in content
    assert "## Freshness" in content
    assert "Crossref" in content


def test_corruption_report_shows_deltas_and_recovery(monkeypatch) -> None:
    written = {}
    monkeypatch.setattr(reporting, "write_text", lambda path, content: written.update({str(path): content}))

    reporting.generate_corruption_report(
        "corruption_report.md",
        baseline_metrics={"retrieval_hit_rate": 1.0, "mean_token_f1": 0.9, "judge_accuracy": 1.0, "mean_judge_score": 5.0},
        corrupted_metrics={"retrieval_hit_rate": 0.5, "mean_token_f1": 0.4, "judge_accuracy": 0.5, "mean_judge_score": 3.0},
        repaired_metrics={"retrieval_hit_rate": 0.9, "mean_token_f1": 0.8, "judge_accuracy": 0.9, "mean_judge_score": 4.5},
        corrupted_quality={"status": "FAIL", "passed_checks": 2, "failed_checks": 3},
        repaired_quality={"status": "PASS", "passed_checks": 5, "failed_checks": 0},
        corrupted_freshness={"status": "FAIL", "is_fresh": False, "stale_rows": 4, "total_rows": 18},
        repaired_freshness={"status": "PASS", "is_fresh": True, "stale_rows": 0, "total_rows": 18},
    )

    content = written["corruption_report.md"]
    assert "# Data Corruption Comparison Report" in content
    assert "Repaired - baseline" in content
    assert "-0.1" in content
    assert "Data quality comparison" in content
    assert "Freshness comparison" in content
