from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
import os
import re
import sys
import types
from typing import Any

from datasets import Dataset
from pydantic import BaseModel, Field

from core.config import Settings
from core.utils import normalize_whitespace, read_json, write_json
from retrieval.embeddings import MiniLMEmbeddings
from retrieval.index import LocalEmbeddingIndex
from retrieval.llm import build_llm
from retrieval.qa import answer_question


class JudgeVerdict(BaseModel):
    score: int = Field(ge=1, le=5)
    correct: bool
    reasoning: str


@dataclass(frozen=True)
class EvaluationBundle:
    summary: dict[str, Any]
    answers: list[dict[str, Any]]


def _token_f1(reference: str, prediction: str) -> float:
    ref_tokens = normalize_whitespace(reference).lower().split()
    pred_tokens = normalize_whitespace(prediction).lower().split()
    if not ref_tokens or not pred_tokens:
        return 0.0
    ref_set = set(ref_tokens)
    pred_set = set(pred_tokens)
    overlap = len(ref_set & pred_set)
    if overlap == 0:
        return 0.0
    precision = overlap / len(pred_set)
    recall = overlap / len(ref_set)
    return 2 * precision * recall / (precision + recall)


def _safe_mean(values: list[float]) -> float:
    return mean(values) if values else 0.0


def _canonical_items(value: str) -> set[str]:
    items = re.split(r"[,;|]", normalize_whitespace(value).lower())
    return {
        re.sub(r"[^a-z0-9]+", " ", item).strip()
        for item in items
        if item.strip()
    }


def _set_f1(reference: str, prediction: str) -> float:
    reference_items = _canonical_items(reference)
    prediction_items = _canonical_items(prediction)
    if not reference_items or not prediction_items:
        return 0.0
    overlap = len(reference_items & prediction_items)
    if overlap == 0:
        return 0.0
    precision = overlap / len(prediction_items)
    recall = overlap / len(reference_items)
    return 2 * precision * recall / (precision + recall)


def _answer_metric(question_type: str, reference: str, prediction: str) -> float:
    if question_type in {"authors", "categories"}:
        return _set_f1(reference, prediction)
    if question_type == "date":
        return float(
            normalize_whitespace(reference).lower()
            == normalize_whitespace(prediction).lower()
        )
    return _token_f1(reference, prediction)


def _answer_correct(question_type: str, metric: float) -> bool:
    if question_type in {"authors", "categories", "date"}:
        return metric == 1.0
    return metric >= 0.95


def _retrieval_rank(retrieved_doc_ids: list[str], ground_truth_doc_ids: list[str]) -> int | None:
    ground_truth = set(ground_truth_doc_ids)
    for rank, doc_id in enumerate(retrieved_doc_ids, start=1):
        if doc_id in ground_truth:
            return rank
    return None


def _judge_answer(
    settings: Settings,
    question: str,
    reference: str,
    prediction: str,
    question_type: str,
) -> JudgeVerdict:
    deterministic_metric = _answer_metric(question_type, reference, prediction)
    if os.getenv("RUN_LLM_JUDGE", "").lower() not in {"1", "true", "yes"}:
        return JudgeVerdict(
            score=5 if deterministic_metric >= 0.95 else 3 if deterministic_metric >= 0.5 else 1,
            correct=_answer_correct(question_type, deterministic_metric),
            reasoning="Deterministic field-aware judge used; set RUN_LLM_JUDGE=1 for an LLM pass.",
        )

    prompt = f"""
Evaluate the model answer against the reference answer.

Question: {question}
Question type: {question_type}
Reference answer: {reference}
Model answer: {prediction}

Return:
- score from 1 to 5
- correct = true only when the answer is materially correct
- short reasoning
""".strip()
    try:
        llm = build_llm(settings=settings, temperature=0.0).with_structured_output(JudgeVerdict)
        return llm.invoke(prompt)
    except Exception:
        score = 5 if deterministic_metric >= 0.95 else 3 if deterministic_metric >= 0.5 else 1
        return JudgeVerdict(
            score=score,
            correct=_answer_correct(question_type, deterministic_metric),
            reasoning="Fallback deterministic judge used because the LLM evaluator was unavailable.",
        )


def _run_ragas(settings: Settings, answers: list[dict[str, Any]]) -> dict[str, Any]:
    if os.getenv("RUN_RAGAS", "").lower() not in {"1", "true", "yes"}:
        return {"skipped": "Set RUN_RAGAS=1 to enable the slower Ragas pass."}
    try:
        if "langchain_community.chat_models.vertexai" not in sys.modules:
            shim = types.ModuleType("langchain_community.chat_models.vertexai")
            shim.ChatVertexAI = type("ChatVertexAI", (), {})
            sys.modules["langchain_community.chat_models.vertexai"] = shim
        from ragas import evaluate
        from ragas.metrics import answer_relevancy, context_precision, context_recall, faithfulness

        dataset = Dataset.from_dict(
            {
                "question": [item["question"] for item in answers],
                "answer": [item["answer"] for item in answers],
                "ground_truth": [item["ground_truth"] for item in answers],
                "contexts": [item["retrieved_contexts"] for item in answers],
            }
        )
        result = evaluate(
            dataset,
            metrics=[answer_relevancy, context_precision, context_recall, faithfulness],
            llm=build_llm(settings=settings, temperature=0.0),
            embeddings=MiniLMEmbeddings(settings.embedding_model),
        )
        return dict(result)
    except Exception as exc:  # pragma: no cover
        return {"error": f"Ragas evaluation failed: {exc}"}


def evaluate_pipeline(
    settings: Settings,
    index: LocalEmbeddingIndex,
    test_set_path,
    metrics_output_path,
    answers_output_path,
    dataset_variant: str = "baseline",
) -> EvaluationBundle:
    test_set = read_json(test_set_path)
    answers: list[dict[str, Any]] = []

    for item in test_set:
        result = answer_question(item["question"], settings=settings, index=index)
        question_type = item["question_type"]
        answer_metric = _answer_metric(question_type, item["ground_truth"], result.answer)
        answer_correct = _answer_correct(question_type, answer_metric)
        retrieval_rank = _retrieval_rank(result.retrieved_doc_ids, item["ground_truth_doc_ids"])
        retrieval_hit = retrieval_rank is not None
        judge = _judge_answer(
            settings,
            item["question"],
            item["ground_truth"],
            result.answer,
            question_type,
        )
        answers.append(
            {
                "id": item["id"],
                "dataset_variant": dataset_variant,
                "question_type": question_type,
                "question": item["question"],
                "ground_truth": item["ground_truth"],
                "ground_truth_doc_ids": item["ground_truth_doc_ids"],
                "answer": result.answer,
                "retrieved_doc_ids": result.retrieved_doc_ids,
                "retrieved_contexts": result.retrieved_contexts,
                "retrieval_hit": retrieval_hit,
                "retrieval_rank": retrieval_rank,
                "top_score": result.retrieved_scores[0] if result.retrieved_scores else None,
                "token_f1": _token_f1(item["ground_truth"], result.answer),
                "answer_metric": answer_metric,
                "answer_correct": answer_correct,
                "error_type": "none"
                if retrieval_hit and answer_correct
                else "retrieval_miss"
                if not retrieval_hit
                else "answer_mismatch",
                "judge": judge.model_dump(),
            }
        )

    summary = _summarize_answers(answers, dataset_variant, settings.top_k)
    summary["ragas"] = _run_ragas(settings, answers)

    bundle = EvaluationBundle(summary=summary, answers=answers)
    write_json(metrics_output_path, summary)
    write_json(answers_output_path, answers)
    return bundle


def _summarize_answers(
    answers: list[dict[str, Any]], dataset_variant: str, top_k: int
) -> dict[str, Any]:
    def summarize(items: list[dict[str, Any]]) -> dict[str, Any]:
        ranks = [item["retrieval_rank"] for item in items if item["retrieval_rank"] is not None]
        return {
            "samples": len(items),
            "retrieval_recall_at_1": _safe_mean(
                [float(item["retrieval_rank"] == 1) for item in items]
            ),
            "retrieval_recall_at_k": _safe_mean(
                [float(item["retrieval_rank"] is not None and item["retrieval_rank"] <= top_k) for item in items]
            ),
            "retrieval_mrr": _safe_mean([1.0 / rank for rank in ranks]),
            "mean_top_score": _safe_mean(
                [item["top_score"] for item in items if item["top_score"] is not None]
            ),
            "answer_accuracy": _safe_mean([float(item["answer_correct"]) for item in items]),
            "mean_answer_metric": _safe_mean([item["answer_metric"] for item in items]),
            "judge_accuracy": _safe_mean([float(item["judge"]["correct"]) for item in items]),
            "mean_judge_score": _safe_mean([item["judge"]["score"] for item in items]),
        }

    by_question_type: dict[str, dict[str, Any]] = {}
    for question_type in sorted({item["question_type"] for item in answers}):
        by_question_type[question_type] = summarize(
            [item for item in answers if item["question_type"] == question_type]
        )

    overall = summarize(answers)
    return {
        "dataset_variant": dataset_variant,
        "samples": overall["samples"],
        "retrieval_hit_rate": overall["retrieval_recall_at_k"],
        "retrieval_recall_at_1": overall["retrieval_recall_at_1"],
        "retrieval_recall_at_k": overall["retrieval_recall_at_k"],
        "retrieval_mrr": overall["retrieval_mrr"],
        "mean_top_score": overall["mean_top_score"],
        "mean_token_f1": _safe_mean([item["token_f1"] for item in answers]),
        "answer_accuracy": overall["answer_accuracy"],
        "mean_answer_metric": overall["mean_answer_metric"],
        "judge_accuracy": overall["judge_accuracy"],
        "mean_judge_score": overall["mean_judge_score"],
        "by_question_type": by_question_type,
    }
