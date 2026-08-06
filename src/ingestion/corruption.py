from __future__ import annotations

from datetime import timedelta
from pathlib import Path
import random
from typing import Any

import pandas as pd

from core.utils import now_utc, write_json
from ingestion.cleaning import as_date, refresh_derived_columns

# Seed co dinh: corruption phai reproducible thi comparison report moi co nghia.
CORRUPTION_SEED = 20251110

# Ty le row bi anh huong cho tung loai loi (min/max de con chay duoc voi corpus nho).
DROP_LATEST_FRACTION = 0.20
BLANK_SUMMARY_FRACTION = 0.15
NOISE_FRACTION = 0.15
TRUNCATE_TITLE_FRACTION = 0.15
STALE_DATE_FRACTION = 0.20
DUPLICATE_FRACTION = 0.10

MIN_SURVIVING_ROWS = 6
TRUNCATED_TITLE_CHARS = 18
STALE_SHIFT_DAYS = 8 * 365

# Nhieu mo phong loi that: mojibake do sai encoding, rac OCR, boilerplate lap.
NOISE_TOKENS = [
    "���",
    "###OCR-ERR###",
    "Ã¢â‚¬â„¢",
    "lorem ipsum dolor sit amet",
    "[[ parse failure ]]",
    "%%%%",
]
NOISE_TAIL = " ".join(NOISE_TOKENS * 2)


def _portion(total: int, fraction: float, minimum: int = 1, maximum: int | None = None) -> int:
    if total <= 0:
        return 0
    count = max(minimum, round(total * fraction))
    if maximum is not None:
        count = min(count, maximum)
    return min(count, total)


def _inject_noise(text: str, rng: random.Random) -> str:
    words = text.split()
    if not words:
        return NOISE_TAIL
    step = max(3, len(words) // 6)
    noisy: list[str] = []
    for position, word in enumerate(words):
        noisy.append(word)
        if position % step == step - 1:
            noisy.append(rng.choice(NOISE_TOKENS))
    return " ".join(noisy) + " " + NOISE_TAIL


def _shift_date_back(value: Any, days: int) -> str:
    published = as_date(value)
    if published is None:
        return str(value)
    return (published - timedelta(days=days)).isoformat()


def corrupt_clean_dataframe(
    df: pd.DataFrame,
    output_log_path,
    seed: int = CORRUPTION_SEED,
) -> pd.DataFrame:
    """Simulate 6 dang data corruption len cleaned dataframe.

    Moi dang loi nham vao mot pillar observability khac nhau:
      1. drop_latest_records  -> volume + freshness (mat paper moi nhat)
      2. blank_summary        -> completeness (agent khong con noi dung de tra loi)
      3. inject_noise         -> distribution (embedding bi keo lech)
      4. truncate_title       -> pha exact-title lookup cua agent
      5. stale_published      -> freshness (age_days vuot threshold)
      6. duplicate_rows       -> uniqueness cua paper_id

    Cac tap row bi anh huong la disjoint (tru duplicate) de report tach duoc
    anh huong cua tung loai. Schema giu nguyen: derived columns duoc tinh lai
    bang refresh_derived_columns() nen index/quality chay duoc nhu binh thuong.
    """
    rng = random.Random(seed)
    working = df.copy(deep=True).reset_index(drop=True)
    rows_before = len(working)
    actions: list[dict[str, Any]] = []

    # 1. Xoa nhung paper moi nhat.
    max_droppable = max(rows_before - MIN_SURVIVING_ROWS, 0)
    drop_count = min(_portion(rows_before, DROP_LATEST_FRACTION, minimum=2, maximum=4), max_droppable)
    if drop_count:
        latest = working.sort_values(["published", "paper_id"], ascending=[False, True]).head(drop_count)
        actions.append(
            {
                "type": "drop_latest_records",
                "target_pillar": "volume+freshness",
                "rows_affected": int(drop_count),
                "paper_ids": latest["paper_id"].tolist(),
                "detail": f"Xoa {drop_count} paper co published moi nhat khoi cleaned dataset.",
            }
        )
        working = working.drop(index=latest.index).reset_index(drop=True)

    remaining = len(working)
    pool = list(range(remaining))
    rng.shuffle(pool)

    def take(count: int) -> list[int]:
        picked = pool[:count]
        del pool[:count]
        return picked

    blank_idx = take(_portion(remaining, BLANK_SUMMARY_FRACTION, minimum=2))
    noise_idx = take(_portion(remaining, NOISE_FRACTION, minimum=2))
    truncate_idx = take(_portion(remaining, TRUNCATE_TITLE_FRACTION, minimum=2))
    stale_idx = take(_portion(remaining, STALE_DATE_FRACTION, minimum=2))

    # 2. Blank summary.
    if blank_idx:
        actions.append(
            {
                "type": "blank_summary",
                "target_pillar": "completeness",
                "rows_affected": len(blank_idx),
                "paper_ids": working.loc[blank_idx, "paper_id"].tolist(),
                "detail": "Set summary = '' (summary_chars ve 0).",
            }
        )
        working.loc[blank_idx, "summary"] = ""

    # 3. Inject noise vao summary.
    if noise_idx:
        actions.append(
            {
                "type": "inject_noise",
                "target_pillar": "distribution",
                "rows_affected": len(noise_idx),
                "paper_ids": working.loc[noise_idx, "paper_id"].tolist(),
                "detail": "Chen mojibake/OCR junk vao giua summary va noi them noise tail.",
            }
        )
        for index in noise_idx:
            working.at[index, "summary"] = _inject_noise(str(working.at[index, "summary"]), rng)

    # 4. Truncate title.
    if truncate_idx:
        before_titles = working.loc[truncate_idx, "title"].tolist()
        actions.append(
            {
                "type": "truncate_title",
                "target_pillar": "schema+lookup",
                "rows_affected": len(truncate_idx),
                "paper_ids": working.loc[truncate_idx, "paper_id"].tolist(),
                "detail": f"Cat title con {TRUNCATED_TITLE_CHARS} ky tu, pha exact-title lookup cua agent.",
                "examples": before_titles[:3],
            }
        )
        for index in truncate_idx:
            title = str(working.at[index, "title"])
            working.at[index, "title"] = title[:TRUNCATED_TITLE_CHARS].rstrip() + "..."

    # 5. Lam published date cu di.
    if stale_idx:
        actions.append(
            {
                "type": "stale_published",
                "target_pillar": "freshness",
                "rows_affected": len(stale_idx),
                "paper_ids": working.loc[stale_idx, "paper_id"].tolist(),
                "detail": f"Lui published lai {STALE_SHIFT_DAYS} ngay, age_days vuot freshness threshold.",
            }
        )
        for index in stale_idx:
            working.at[index, "published"] = _shift_date_back(working.at[index, "published"], STALE_SHIFT_DAYS)
            working.at[index, "updated"] = _shift_date_back(working.at[index, "updated"], STALE_SHIFT_DAYS)

    # 6. Duplicate rows.
    duplicate_count = _portion(len(working), DUPLICATE_FRACTION, minimum=2)
    if duplicate_count:
        duplicate_idx = rng.sample(range(len(working)), k=min(duplicate_count, len(working)))
        duplicates = working.loc[duplicate_idx].copy()
        actions.append(
            {
                "type": "duplicate_rows",
                "target_pillar": "uniqueness",
                "rows_affected": len(duplicate_idx),
                "paper_ids": duplicates["paper_id"].tolist(),
                "detail": "Nhan ban nguyen row, paper_id khong con unique.",
            }
        )
        working = pd.concat([working, duplicates], ignore_index=True)

    # Dong bo lai derived columns theo cot goc da bi sua.
    working = refresh_derived_columns(working)
    working = working.reset_index(drop=True)

    log = {
        "generated_at": now_utc().isoformat(),
        "seed": seed,
        "rows_before": int(rows_before),
        "rows_after": int(len(working)),
        "unique_paper_ids_before": int(df["paper_id"].nunique()) if rows_before else 0,
        "unique_paper_ids_after": int(working["paper_id"].nunique()) if len(working) else 0,
        "actions": actions,
        "totals": {action["type"]: action["rows_affected"] for action in actions},
    }
    write_json(Path(output_log_path), log)

    working.attrs["corruption_log"] = log
    return working
