# Data Corruption Comparison Report

## Evaluation comparison

| Metric | Baseline | Corrupted | Repaired | Repaired - baseline |
| --- | --- | --- | --- | --- |
| retrieval_hit_rate | 1.0 | 0.8333333333333334 | 1.0 | 0.0 |
| mean_token_f1 | 1.0 | 0.7387817093746641 | 1.0 | 0.0 |
| judge_accuracy | 1.0 | 0.7222222222222222 | 1.0 | 0.0 |
| mean_judge_score | 5 | 3.9166666666666665 | 5 | 0 |

## Data quality comparison

| Signal | Corrupted | Repaired |
| --- | --- | --- |
| status | FAIL | PASS |
| passed_checks | 4 | 7 |
| failed_checks | 3 | 0 |

## Freshness comparison

| Signal | Corrupted | Repaired |
| --- | --- | --- |
| status | FAIL | PASS |
| is_fresh | FAIL | PASS |
| stale_rows | 5 | 0 |
| total_rows | 22 | 24 |
| latest_published | 2026-07-03 | 2026-08-01 |

## Interpretation

Use the metric deltas together with quality and freshness status to verify whether corruption degraded retrieval/answers and whether repair recovered them.
