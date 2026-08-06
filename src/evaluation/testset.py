from __future__ import annotations

from typing import Any

import pandas as pd

from core.utils import first_sentence, normalize_whitespace, write_json


_REQUIRED_COLUMNS = {"paper_id", "title"}


def _value_is_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, float) and pd.isna(value):
        return False
    return bool(normalize_whitespace(str(value)))


def _sample_id(index: int, question_type: str) -> str:
    return f"qa-{index:03d}-{question_type}"


def _add_sample(
    samples: list[dict[str, Any]],
    row: pd.Series,
    question_type: str,
    question: str,
    ground_truth: str,
    source_field: str,
) -> None:
    samples.append(
        {
            "id": _sample_id(len(samples) + 1, question_type),
            "question_type": question_type,
            "question": question,
            "ground_truth": normalize_whitespace(ground_truth),
            "ground_truth_doc_ids": [str(row["paper_id"])],
            "source_field": source_field,
            "difficulty": "easy",
        }
    )


def build_test_set(df: pd.DataFrame, output_path) -> list[dict[str, Any]]:
    """Build a deterministic, field-aware QA test set from cleaned papers."""
    missing_columns = _REQUIRED_COLUMNS - set(df.columns)
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise ValueError(f"Clean dataframe is missing required columns: {missing}")
    if df.empty:
        raise ValueError("Cannot build an evaluation set from an empty dataframe.")
    if df["paper_id"].duplicated().any():
        raise ValueError("Clean dataframe must contain unique paper_id values.")

    samples: list[dict[str, Any]] = []
    ordered = df.sort_values("paper_id", kind="stable")
    for _, row in ordered.iterrows():
        paper_id = str(row["paper_id"])
        title = normalize_whitespace(str(row["title"]))
        if not title:
            continue

        if _value_is_present(row.get("published")):
            _add_sample(
                samples,
                row,
                "date",
                f"When was '{title}' published?",
                str(row["published"]),
                "published",
            )
        if _value_is_present(row.get("authors_joined")):
            _add_sample(
                samples,
                row,
                "authors",
                f"Who authored '{title}'?",
                str(row["authors_joined"]),
                "authors_joined",
            )
        if _value_is_present(row.get("summary")):
            _add_sample(
                samples,
                row,
                "summary",
                f"What is the summary of '{title}'?",
                first_sentence(str(row["summary"])),
                "summary",
            )
        if _value_is_present(row.get("categories_joined")):
            _add_sample(
                samples,
                row,
                "categories",
                f"What categories does '{title}' belong to?",
                str(row["categories_joined"]),
                "categories_joined",
            )

        # Keep the ID conversion explicit so invalid/null IDs fail before writing.
        if not paper_id:
            raise ValueError("Every evaluation row must contain a non-empty paper_id.")

    if not samples:
        raise ValueError("No evaluation questions could be generated from the dataframe.")
    write_json(output_path, samples)
    return samples
