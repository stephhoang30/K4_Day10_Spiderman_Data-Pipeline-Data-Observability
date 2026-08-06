"""Export spec that dinh nghia pipeline ra JSON cho frontend doc.

Moi gia tri deu doc truc tiep tu module Python, khong hardcode lai, nen FE
hien dung rule dang chay chu khong phai ban copy bi lech.

    uv run python script/export_pipeline_spec.py
"""

from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from core.config import load_settings  # noqa: E402
from core.utils import now_utc, write_json  # noqa: E402
from ingestion import cleaning, corruption  # noqa: E402

STAGE_DESCRIPTIONS = {
    "crawl": "Goi Crossref REST API, luu raw response va parse thanh PaperRecord.",
    "clean": "Chuan hoa text, parse date, loai row xau, dedupe, sinh cot derived.",
    "index": "Embed text_for_embedding bang MiniLM va nap vao ChromaDB.",
    "evaluate": "Chay agent tren test set, cham retrieval hit / token F1 / LLM judge.",
    "observe": "Data quality checks + freshness report.",
    "corrupt": "Chu dong tao 6 dang loi du lieu de do impact len agent.",
    "repair": "Chay lai cleaning tu raw records dang tin, khong sua tay metrics.",
}


def main() -> int:
    settings = load_settings()
    paths = settings.paths
    root = paths.project_dir

    def rel(path: Path) -> str:
        return str(path.relative_to(root))

    spec = {
        "generated_at": now_utc().isoformat(),
        "source": {
            "api": settings.source_api,
            "url": "https://api.crossref.org/works",
            "query": settings.source_query,
            "filter": settings.source_filter,
            "max_results": settings.max_results,
        },
        "retrieval": {
            "embedding_model": settings.embedding_model,
            "top_k": settings.top_k,
            "collections": {
                "baseline": settings.baseline_collection_name,
                "corrupted": settings.corrupted_collection_name,
                "repaired": settings.repaired_collection_name,
            },
        },
        "llm": {"provider": settings.llm_provider, "model": settings.model_name},
        "stages": STAGE_DESCRIPTIONS,
        "clean_contract": {
            "columns": cleaning.CLEAN_COLUMNS,
            "derived_columns": cleaning.DERIVED_COLUMNS,
            "min_title_chars": cleaning.MIN_TITLE_CHARS,
            "min_summary_chars": cleaning.MIN_SUMMARY_CHARS,
            "reject_reasons": [
                {"key": "missing_paper_id", "label": "Thieu paper_id"},
                {"key": "short_title", "label": f"Title ngan hon {cleaning.MIN_TITLE_CHARS} ky tu"},
                {"key": "short_summary", "label": f"Summary ngan hon {cleaning.MIN_SUMMARY_CHARS} ky tu"},
                {"key": "unparsable_published", "label": "Published khong parse duoc"},
                {"key": "duplicate_paper_id", "label": "Trung paper_id"},
                {"key": "duplicate_title", "label": "Trung title (case-insensitive)"},
            ],
            "text_for_embedding_template": ["Title", "Authors", "Categories", "Published", "Summary"],
        },
        "freshness": {"threshold_days": settings.freshness_threshold_days},
        "corruption_spec": {
            "seed": corruption.CORRUPTION_SEED,
            "min_surviving_rows": corruption.MIN_SURVIVING_ROWS,
            "kinds": [
                {
                    "type": "drop_latest_records",
                    "pillar": "volume+freshness",
                    "fraction": corruption.DROP_LATEST_FRACTION,
                    "detail": "Xoa cac paper co published moi nhat.",
                },
                {
                    "type": "blank_summary",
                    "pillar": "completeness",
                    "fraction": corruption.BLANK_SUMMARY_FRACTION,
                    "detail": "Set summary rong, summary_chars ve 0.",
                },
                {
                    "type": "inject_noise",
                    "pillar": "distribution",
                    "fraction": corruption.NOISE_FRACTION,
                    "detail": "Chen mojibake va rac OCR vao summary.",
                },
                {
                    "type": "truncate_title",
                    "pillar": "schema+lookup",
                    "fraction": corruption.TRUNCATE_TITLE_FRACTION,
                    "detail": f"Cat title con {corruption.TRUNCATED_TITLE_CHARS} ky tu.",
                },
                {
                    "type": "stale_published",
                    "pillar": "freshness",
                    "fraction": corruption.STALE_DATE_FRACTION,
                    "detail": f"Lui published lai {corruption.STALE_SHIFT_DAYS} ngay.",
                },
                {
                    "type": "duplicate_rows",
                    "pillar": "uniqueness",
                    "fraction": corruption.DUPLICATE_FRACTION,
                    "detail": "Nhan ban row, pha uniqueness cua paper_id.",
                },
            ],
        },
        "artifacts": {
            "raw_api_response": rel(paths.raw_api_response),
            "raw_records": rel(paths.raw_records_json),
            "clean_json": rel(paths.clean_json),
            "clean_csv": rel(paths.clean_csv),
            "corrupted_json": rel(paths.corrupted_clean_json),
            "repaired_json": rel(paths.repaired_clean_json),
            "embeddings": rel(paths.embeddings_json),
            "corrupted_embeddings": rel(paths.corrupted_embeddings_json),
            "repaired_embeddings": rel(paths.repaired_embeddings_json),
            "test_set": rel(paths.eval_testset),
            "baseline_metrics": rel(paths.baseline_metrics),
            "baseline_answers": rel(paths.baseline_answers),
            "corrupted_metrics": rel(paths.corrupted_metrics),
            "corrupted_answers": rel(paths.corrupted_answers),
            "repaired_metrics": rel(paths.repaired_metrics),
            "repaired_answers": rel(paths.repaired_answers),
            "corruption_log": rel(paths.corruption_log),
            "freshness_report": rel(paths.freshness_report),
            "baseline_report": rel(paths.baseline_report),
            "comparison_report": rel(paths.comparison_report),
        },
    }

    output = root / "data" / "pipeline_spec.json"
    write_json(output, spec)
    print(f"wrote {output.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
