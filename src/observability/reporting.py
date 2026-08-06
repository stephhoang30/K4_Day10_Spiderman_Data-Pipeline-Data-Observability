from __future__ import annotations

import json
from typing import Any

from core.utils import write_text


def _display(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return "PASS" if value else "FAIL"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def _escape(value: Any) -> str:
    return _display(value).replace("|", "\\|").replace("\n", "<br>")


def _table(headers: list[str], rows: list[list[Any]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    lines.extend("| " + " | ".join(_escape(value) for value in row) + " |" for row in rows)
    return lines


def _metric_rows(metrics: dict[str, Any]) -> list[list[Any]]:
    names = [
        "retrieval_hit_rate",
        "retrieval_recall_at_1",
        "retrieval_recall_at_k",
        "retrieval_mrr",
        "mean_token_f1",
        "answer_accuracy",
        "judge_accuracy",
        "mean_judge_score",
    ]
    return [[name, metrics.get(name, "-")] for name in names if name in metrics]


def _quality_rows(quality: dict[str, Any]) -> list[list[Any]]:
    checks = quality.get("checks", {})
    return [
        [name, check.get("status"), check.get("actual"), check.get("expected"), check.get("message")]
        for name, check in checks.items()
    ]


def _freshness_rows(freshness: dict[str, Any]) -> list[list[Any]]:
    names = [
        "status",
        "is_fresh",
        "latest_published",
        "oldest_published",
        "stale_rows",
        "invalid_published_or_age_rows",
        "total_rows",
        "freshness_threshold_days",
    ]
    return [[name, freshness.get(name, "-")] for name in names if name in freshness]


def _comparison_rows(
    baseline: dict[str, Any], corrupted: dict[str, Any], repaired: dict[str, Any]
) -> list[list[Any]]:
    names = [
        "retrieval_hit_rate",
        "mean_token_f1",
        "judge_accuracy",
        "mean_judge_score",
    ]
    rows = []
    for name in names:
        baseline_value = baseline.get(name)
        corrupted_value = corrupted.get(name)
        repaired_value = repaired.get(name)
        delta = None
        if isinstance(repaired_value, (int, float)) and isinstance(baseline_value, (int, float)):
            delta = round(repaired_value - baseline_value, 4)
        rows.append([name, baseline_value, corrupted_value, repaired_value, delta])
    return rows


def _quality_comparison_rows(
    corrupted_quality: dict[str, Any], repaired_quality: dict[str, Any]
) -> list[list[Any]]:
    return [
        [
            "status",
            corrupted_quality.get("status"),
            repaired_quality.get("status"),
        ],
        [
            "passed_checks",
            corrupted_quality.get("passed_checks"),
            repaired_quality.get("passed_checks"),
        ],
        [
            "failed_checks",
            corrupted_quality.get("failed_checks"),
            repaired_quality.get("failed_checks"),
        ],
    ]


def _freshness_comparison_rows(
    corrupted_freshness: dict[str, Any], repaired_freshness: dict[str, Any]
) -> list[list[Any]]:
    names = ["status", "is_fresh", "stale_rows", "total_rows", "latest_published"]
    return [
        [name, corrupted_freshness.get(name, "-"), repaired_freshness.get(name, "-")]
        for name in names
    ]

def generate_phase1_report(
    report_path,
    source_summary: dict[str, Any],
    metrics: dict[str, Any],
    quality: dict[str, Any],
    freshness: dict[str, Any],
) -> None:
    """Write the baseline source, evaluation, quality, and freshness report."""
    lines = [
        "# Baseline Data Pipeline Report",
        "",
        "## Source summary",
        "",
    ]
    lines.extend(_table(["Field", "Value"], [[key, value] for key, value in source_summary.items()]))
    lines.extend(
        [
            "",
            "## Evaluation metrics",
            "",
        ]
    )
    lines.extend(_table(["Metric", "Value"], _metric_rows(metrics)))
    if metrics.get("by_question_type"):
        lines.extend(["", "### Metrics by question type", ""])
        rows = []
        for question_type, values in metrics["by_question_type"].items():
            rows.append(
                [
                    question_type,
                    values.get("samples"),
                    values.get("retrieval_recall_at_k"),
                    values.get("answer_accuracy"),
                    values.get("mean_judge_score"),
                ]
            )
        lines.extend(
            _table(
                ["Question type", "Samples", "Recall@k", "Answer accuracy", "Mean judge score"],
                rows,
            )
        )
    lines.extend(["", "## Data quality", ""])
    lines.append(f"Overall status: **{_escape(quality.get('status'))}**")
    lines.append("")
    lines.extend(
        _table(
            ["Check", "Status", "Actual", "Expected", "Message"],
            _quality_rows(quality),
        )
    )
    lines.extend(["", "## Freshness", ""])
    lines.extend(_table(["Field", "Value"], _freshness_rows(freshness)))
    lines.append("")
    write_text(report_path, "\n".join(lines))


def generate_corruption_report(
    report_path,
    baseline_metrics: dict[str, Any],
    corrupted_metrics: dict[str, Any],
    repaired_metrics: dict[str, Any],
    corrupted_quality: dict[str, Any],
    repaired_quality: dict[str, Any],
    corrupted_freshness: dict[str, Any],
    repaired_freshness: dict[str, Any],
) -> None:
    """Write the baseline/corrupted/repaired comparison report."""
    lines = [
        "# Data Corruption Comparison Report",
        "",
        "## Evaluation comparison",
        "",
    ]
    lines.extend(
        _table(
            ["Metric", "Baseline", "Corrupted", "Repaired", "Repaired - baseline"],
            _comparison_rows(baseline_metrics, corrupted_metrics, repaired_metrics),
        )
    )
    lines.extend(["", "## Data quality comparison", ""])
    lines.extend(
        _table(
            ["Signal", "Corrupted", "Repaired"],
            _quality_comparison_rows(corrupted_quality, repaired_quality),
        )
    )
    lines.extend(["", "## Freshness comparison", ""])
    lines.extend(
        _table(
            ["Signal", "Corrupted", "Repaired"],
            _freshness_comparison_rows(corrupted_freshness, repaired_freshness),
        )
    )
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "Use the metric deltas together with quality and freshness status to verify "
            "whether corruption degraded retrieval/answers and whether repair recovered them.",
            "",
        ]
    )
    write_text(report_path, "\n".join(lines))
