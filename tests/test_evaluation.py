from types import SimpleNamespace

import pandas as pd

from evaluation import metrics, testset
from evaluation.testset import build_test_set


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
