# Baseline Data Pipeline Report

## Source summary

| Field | Value |
| --- | --- |
| source | Crossref REST API |
| query | agentic retrieval augmented generation large language model |
| filter | from-pub-date:2026-02-07,has-abstract:true |
| raw_records | 24 |
| clean_records | 24 |
| run_at | 2026-08-06T08:44:05.589235+00:00 |

## Evaluation metrics

| Metric | Value |
| --- | --- |
| retrieval_hit_rate | 1.0 |
| retrieval_recall_at_1 | 1.0 |
| retrieval_recall_at_k | 1.0 |
| retrieval_mrr | 1.0 |
| mean_token_f1 | 1.0 |
| answer_accuracy | 1.0 |
| judge_accuracy | 1.0 |
| mean_judge_score | 5 |

### Metrics by question type

| Question type | Samples | Recall@k | Answer accuracy | Mean judge score |
| --- | --- | --- | --- | --- |
| authors | 24 | 1.0 | 1.0 | 5 |
| date | 24 | 1.0 | 1.0 | 5 |
| summary | 24 | 1.0 | 1.0 | 5 |

## Data quality

Overall status: **PASS**

| Check | Status | Actual | Expected | Message |
| --- | --- | --- | --- | --- |
| row_count | PASS | 24 | > 0 | Dataframe phải có ít nhất một record. |
| paper_id_not_null | PASS | 24 | 24 | Tất cả paper_id phải khác null và khác rỗng. |
| paper_id_unique | PASS | 0 | 0 | paper_id không được trùng. |
| title_not_null | PASS | 24 | 24 | Tất cả title phải khác null và khác rỗng. |
| summary_length | PASS | {"minimum_chars": 40, "short_rows": 0} | {"minimum_chars": 40, "short_rows": 0} | summary phải dài ít nhất 40 ký tự. |
| age_days_valid | PASS | 0 | 0 | age_days phải parse được và không âm. |
| freshness | PASS | {"invalid_rows": 0, "stale_rows": 0} | {"invalid_rows": 0, "stale_rows": 0} | Không có record vượt ngưỡng freshness hoặc thiếu tuổi dữ liệu. |

## Freshness

| Field | Value |
| --- | --- |
| status | PASS |
| is_fresh | PASS |
| latest_published | 2026-08-01 |
| oldest_published | 2026-02-12 |
| stale_rows | 0 |
| invalid_published_or_age_rows | 0 |
| total_rows | 24 |
| freshness_threshold_days | 180 |
