# Group Report — Day 10: Data Pipeline & Data Observability

> Trạng thái: **đang thực hiện**. Các ô đánh dấu `⏳` là phần phụ thuộc kết quả chạy pipeline, sẽ điền sau khi baseline và corruption flow chạy xong. Không điền số liệu ước lượng vào các ô này.

## 1. Thông tin bài nộp

| Thông tin         | Nội dung                  |
| ------------------ | -------------------------- |
| Khóa/Lớp         | K4              |
| Tên nhóm         | SPIDERMAN     |
| Repository         | https://github.com/stephhoang30/K4_Day10_Spiderman_Data-Pipeline-Data-Observability |
| Ngày hoàn thành | 2026-08-06               |

### Thành viên và phân công

| STT | Họ và tên | MSSV | Vai trò chính | Module/deliverable sở hữu |
| --: | --- | --- | --- | --- |
| 1 | Nguyễn Hoàng Bảo Minh | 2A202601626 | Role 1 — Điều phối pipeline (cấu hình, orchestration, release) | `src/core/config.py`, `src/core/utils.py`, `src/pipelines/phase1.py`, `src/pipelines/corruption_flow.py` |
| 2 | Nguyễn Quý Dương | 2A202601642 | Role 2 — Ingestion (Crossref + raw lineage) | `src/ingestion/crossref.py`, artifact `data/raw/` |
| 3 | Hoàng Công Thành | 2A202601662 | Role 3 — Cleaning & corruption (clean schema, corruption, repair) | `src/ingestion/cleaning.py`, `src/ingestion/corruption.py`, artifact `data/clean/`, `data/results/corruption_log.json` |
| 4 | Trần Văn Ngọc | 2A202601512 | Role 4 — RAG & agent (MiniLM, Chroma, search, lookup) | `src/retrieval/`, artifact `data/embeddings/`, `data/chroma/` |
| 5 | Hồ Văn Tâm | 2A202601542 | Role 5 — Evaluation & observability (test set, metrics, quality, freshness, reports) | `src/evaluation/`, `src/observability/`, artifact `data/eval/`, `data/results/`, `data/quality/`, `data/reports/` |

## 2. Tóm tắt kết quả

**Tóm tắt của nhóm:**

⏳ Viết lại sau khi chạy đủ baseline và corruption flow. Trạng thái tại thời điểm hiện tại:

Môi trường đã dựng xong bằng `uv sync` trên Python 3.11.15 với toàn bộ dependency theo `uv.lock`; provider LLM cấu hình là OpenAI `gpt-4o-mini`, embedding chạy local bằng MiniLM nên không phát sinh chi phí ở bước index. Phần cleaning và corruption (Role 3) đã hoàn thành và được kiểm chứng độc lập: contract 16 cột đã chốt, 6 rule loại row và 2 rule dedupe đã cài, 6 loại corruption đã cài với seed cố định `20251110` để kết quả so sánh tái hiện được.

Đã có bằng chứng sơ bộ trên sample dataset 13 record rằng corruption làm giảm chất lượng agent: retrieval hit rate 1.000 → 0.615 và số câu trả lời rỗng 0 → 7. Đây là số đo trên dữ liệu mẫu tổng hợp dùng để validate contract, **không phải** metrics của bài nộp; metrics chính thức phải lấy từ `data/results/` sau khi chạy pipeline thật trên dữ liệu Crossref.

Blocker hiện tại: `src/evaluation/testset.py` và `src/observability/` (Role 5), `src/pipelines/` (Role 1) còn `NotImplementedError`, nên chưa chạy được end-to-end và chưa có artifact thật trong `data/`. `src/ingestion/crossref.py` (Role 2) đã xong nhưng snapshot raw đang commit chưa dùng được — xem mục 11.

## 3. Kiến trúc và luồng dữ liệu

### Luồng end-to-end

```text
Crossref API
    -> raw response/raw records
    -> cleaning và data modeling
    -> embedding + ChromaDB index
    -> evaluation baseline
    -> quality/freshness reports
    -> corruption
    -> re-index và re-evaluate
    -> repair từ dữ liệu nguồn
    -> comparison report
```

### Trách nhiệm của từng khối

| Khối             | Input          | Xử lý chính             | Output/artifact          | Owner          |
| ----------------- | -------------- | -------------------------- | ------------------------ | -------------- |
| Ingestion         | Crossref REST API `https://api.crossref.org/works` | Gọi API có retry/backoff cho 429/503, lưu raw response trước khi parse, parse thành `PaperRecord` | `data/raw/crossref_response.json`, `data/raw/crossref_records.json` | Nguyễn Quý Dương |
| Cleaning          | `list[PaperRecord]` | Strip tag JATS/HTML, parse date, loại row không hợp lệ, dedupe theo `paper_id` và `title`, sinh 5 cột derived | `data/clean/papers_clean.json`, `data/clean/papers_clean.csv` | Hoàng Công Thành |
| Embedding/index   | Cột `text_for_embedding` | Embed bằng `all-MiniLM-L6-v2`, tạo collection Chroma với space cosine, ghi manifest | `data/embeddings/papers_embeddings.json`, `data/chroma/` | Trần Văn Ngọc |
| Evaluation        | Cleaned dataset + index | Sinh test set 4 loại câu hỏi, chấm retrieval hit / token F1 / LLM judge | `data/eval/test_set.json`, `data/results/baseline_metrics.json`, `data/results/baseline_answers.json` | Hồ Văn Tâm |
| Observability     | Cleaned dataset | Data quality checks và freshness monitoring theo ngưỡng 180 ngày | `data/quality/`, `data/quality/freshness_report.json`, `data/reports/phase1_report.md` | Hồ Văn Tâm |
| Corruption/repair | Cleaned baseline dataset, raw records | Sinh 6 loại lỗi có seed cố định; repair bằng cách chạy lại cleaning từ raw | `data/clean/papers_clean_corrupted.json`, `data/clean/papers_clean_repaired.json`, `data/results/corruption_log.json` | Hoàng Công Thành |
| Orchestration     | Settings + toàn bộ module | Ghép thứ tự chạy hai pha, quản lý path và collection riêng cho ba trạng thái | `data/reports/`, `data/results/`, `script/run_phase1.py`, `script/run_corruption_flow.py` | Nguyễn Hoàng Bảo Minh |

## 4. Cách tái hiện kết quả

### Cấu hình không chứa secret

| Biến/cấu hình             | Giá trị sử dụng |
| ---------------------------- | ------------------- |
| `LLM_PROVIDER`             | `openai`         |
| `LLM_MODEL`                | `gpt-4o-mini`    |
| Embedding model              | `sentence-transformers/all-MiniLM-L6-v2` (chạy local) |
| Số lượng Crossref records | `max_results = 24` |
| Retrieval`top_k`           | `4`              |
| Freshness threshold          | `180` ngày       |
| Random seed, nếu có        | `20251110` (seed corruption, đặt trong `src/ingestion/corruption.py`) |

Crossref query: `agentic retrieval augmented generation large language model`
Crossref filter: `from-pub-date:<ngày chạy − 180 ngày>,has-abstract:true` (tính động tại runtime trong `src/core/config.py`)
Collection Chroma: `papers-baseline`, `papers-corrupted`, `papers-repaired` — tách riêng để không ghi đè baseline.

Không dán nội dung API key hoặc file `.env` vào báo cáo.

### Lệnh cài đặt

```bash
uv sync
```

### Lệnh chạy

Baseline:

```bash
uv run python script/run_phase1.py
```

Corruption flow:

```bash
uv run python script/run_corruption_flow.py
```

Kiểm chứng contract cleaning/corruption mà không cần gọi Crossref:

```bash
uv run python script/validate_clean_contract.py
```

Export spec pipeline ra JSON cho frontend đọc:

```bash
uv run python script/export_pipeline_spec.py
```

### Kết quả tái hiện

| Lệnh             | Trạng thái                                    | Thời điểm chạy gần nhất | Bằng chứng                         |
| ----------------- | ----------------------------------------------- | ----------------------------- | ------------------------------------ |
| Baseline pipeline | Chưa chạy được — `src/pipelines/phase1.py` còn `NotImplementedError` | — | — |
| Corruption flow   | Chưa chạy được — phụ thuộc baseline | — | — |
| `validate_clean_contract.py` | Thành công — 29/29 check PASS | 2026-08-06 | Output stdout của script, không cần artifact ngoài |

## 5. Ingestion, cleaning và data contract

### Nguồn dữ liệu

| Thuộc tính                | Giá trị                             |
| --------------------------- | ------------------------------------- |
| Source                      | Crossref REST API — `https://api.crossref.org/works` |
| Query/filter                | `query = agentic retrieval augmented generation large language model`; `filter = from-pub-date:<ngày chạy − 180 ngày>,has-abstract:true` |
| Thời điểm lấy dữ liệu | ⏳ Chờ chạy ingestion |
| Số record nhận được    | ⏳ Chờ chạy ingestion (trần cấu hình: 24) |
| Cơ chế retry/backoff      | ⏳ Chờ Role 2 hoàn thiện `fetch_source_records` cho 429/503 |

### Raw và clean schema

Raw schema — dataclass `PaperRecord` trong `src/ingestion/crossref.py`:

| Trường        | Kiểu dữ liệu | Bắt buộc?  | Ý nghĩa   | Xử lý khi thiếu/sai |
| --------------- | --------------- | ------------ | ----------- | ---------------------- |
| `paper_id` | `str` | Có | DOI, dùng làm document ID xuyên suốt | Thiếu → loại row |
| `title` | `str` | Có | Tiêu đề bài báo | Ngắn hơn 10 ký tự → loại row |
| `summary` | `str` | Có | Abstract, Crossref trả về kèm tag JATS | Ngắn hơn 40 ký tự → loại row; strip tag và unescape entity trước khi đo |
| `authors` | `list[str]` | Không | Danh sách tác giả | Rỗng → giữ row, `authors_joined` thành chuỗi rỗng |
| `categories` | `list[str]` | Không | Subject của Crossref | Rỗng → giữ row |
| `primary_category` | `str` | Không | Subject chính | Rỗng → lấy phần tử đầu của `categories` |
| `published` | `str` | Có | Ngày xuất bản | Không parse được → loại row |
| `updated` | `str` | Không | Ngày cập nhật | Thiếu hoặc sai → fallback về `published` |
| `abs_url` | `str` | Không | Link DOI | Thiếu → chuỗi rỗng |
| `pdf_url` | `str` | Không | Link PDF | Thiếu → chuỗi rỗng |
| `comment` | `str` | Không | Ghi chú tự do | Thiếu → chuỗi rỗng |

Clean schema — 16 cột, hằng số `CLEAN_COLUMNS` trong `src/ingestion/cleaning.py`. 11 cột gốc như trên, cộng 5 cột derived:

| Cột derived | Kiểu | Cách tính |
| --- | --- | --- |
| `authors_joined` | `str` | `", ".join(authors)` — Chroma metadata chỉ nhận scalar nên không đẩy được list |
| `categories_joined` | `str` | `", ".join(categories)` |
| `summary_chars` | `int` | `len(summary)` — tín hiệu completeness cho quality check |
| `age_days` | `int` | `(run_date − published).days`, clip về ≥ 0 — tín hiệu freshness |
| `text_for_embedding` | `str` | Block 5 dòng, xem bên dưới |

Toàn bộ 5 cột derived được tính lại bởi một hàm duy nhất `refresh_derived_columns()`; corruption sửa cột gốc rồi gọi lại hàm này nên corrupted dataset luôn giữ đúng schema.

### Quy tắc cleaning

| Quy tắc                                 | Quality dimension liên quan | Số record bị tác động | Cách xác minh      |
| ---------------------------------------- | ---------------------------- | -------------------------: | -------------------- |
| Loại record thiếu `paper_id` | Completeness | ⏳ | `df.attrs["cleaning_rejects"]["missing_paper_id"]` |
| Loại record có `title` ngắn hơn 10 ký tự | Validity | ⏳ | `cleaning_rejects["short_title"]` |
| Loại record có `summary` ngắn hơn 40 ký tự | Completeness | ⏳ | `cleaning_rejects["short_summary"]` |
| Loại record có `published` không parse được | Validity | ⏳ | `cleaning_rejects["unparsable_published"]` |
| Dedupe theo `paper_id`, giữ bản đầu | Uniqueness | ⏳ | `cleaning_rejects["duplicate_paper_id"]` |
| Dedupe theo `title` lowercase, giữ bản đầu | Uniqueness | ⏳ | `cleaning_rejects["duplicate_title"]` |
| Strip tag JATS/HTML và unescape entity trong `title`/`summary` | Validity/Consistency | Áp dụng toàn bộ row | Check `summary` không còn ký tự `<` và `&amp;` trong `script/validate_clean_contract.py` |
| Chuẩn hóa `authors`/`categories`: bỏ phần tử rỗng, dedupe case-insensitive, giữ thứ tự | Consistency | Áp dụng toàn bộ row | Check trong `script/validate_clean_contract.py` |

Số record bị loại và lý do được ghi vào `df.attrs["cleaning_rejects"]` để Role 5 đưa thẳng vào data quality report thay vì đếm lại.

Giải thích cách nhóm tạo `text_for_embedding`, document ID và `age_days`:

- **`text_for_embedding`** là block 5 dòng: `Title:` / `Authors:` / `Categories:` / `Published:` / `Summary:`. Nhét cả metadata vào chứ không chỉ abstract, vì test set có 4 loại câu hỏi trong đó 3 loại hỏi về authors, ngày xuất bản và categories — nếu chỉ embed abstract thì semantic search không có tín hiệu để khớp những câu đó.
- **Document ID** dùng `paper_id` tức DOI của Crossref, ổn định giữa các lần chạy nên baseline, corrupted và repaired đối chiếu được với cùng `ground_truth_doc_ids`. Trong Chroma, ID của mỗi record là `f"{paper_id}::{index}"` để duplicate row không gây trùng ID.
- **`age_days`** = số ngày giữa `run_date` và `published`, clip về ≥ 0. So với ngưỡng 180 ngày để kết luận freshness. Cột này được tính lại sau corruption nên khi `published` bị đẩy lùi, `age_days` tự phản ánh và quality check bắt được.

## 6. Evaluation setup

| Thành phần                             | Cấu hình thực tế          |
| ---------------------------------------- | ----------------------------- |
| Số câu hỏi                            | ⏳ Chờ Role 5 hoàn thiện `build_test_set` |
| Các`question_type`                    | Dự kiến: `summary`, `authors`, `date`, `categories` |
| Ground-truth document ID                 | Lấy từ `paper_id` của cleaned dataset, không tự sinh ID |
| Embedding model                          | `sentence-transformers/all-MiniLM-L6-v2` |
| Vector store/collection                  | ChromaDB, space cosine; collection `papers-baseline` / `papers-corrupted` / `papers-repaired` |
| Retrieval`top_k`                       | `4` |
| LLM provider/model                       | OpenAI `gpt-4o-mini` |
| Test set dùng chung cho ba trạng thái | `data/eval/test_set.json` |

Giải thích vì sao test set được giữ nguyên khi đánh giá baseline, corrupted và repaired:

Nếu sinh lại test set từ corrupted dataset thì ground truth cũng bị hỏng theo, và metrics sẽ đo "agent trả lời đúng dữ liệu sai" thay vì đo mức suy giảm. Giữ nguyên một test set duy nhất sinh từ dữ liệu sạch biến nó thành biến đối chứng: mọi thay đổi trong metrics chỉ có thể đến từ corpus, không đến từ câu hỏi. Đây cũng là lý do repair phải chạy lại từ raw chứ không sửa tay answers hay metrics.

## 7. Kết quả baseline

### Artifact checklist

| Artifact                 | Đường dẫn thực tế                | Trạng thái | Ghi chú   |
| ------------------------ | -------------------------------------- | ------------ | ---------- |
| Raw response/records     | `data/raw/`                          | Thiếu | Chờ Role 2 |
| Cleaned dataset          | `data/clean/`                        | Thiếu | Code cleaning đã xong, chờ input từ ingestion |
| Embedding manifest/index | `data/embeddings/`                   | Thiếu | Chờ baseline chạy |
| Evaluation set           | `data/eval/`                         | Thiếu | Chờ Role 5 |
| Baseline metrics         | `data/results/baseline_metrics.json` | Thiếu | Chờ baseline chạy |
| Quality/freshness        | `data/quality/`                      | Thiếu | Chờ Role 5 |
| Baseline report          | `data/reports/phase1_report.md`      | Thiếu | Chờ Role 5 |
| Pipeline spec            | `data/pipeline_spec.json`            | Có | Sinh bởi `script/export_pipeline_spec.py`, dump hằng số thật từ module Python |

### Baseline metrics

⏳ Chờ `data/results/baseline_metrics.json`. Không điền giá trị ước lượng vào bảng này.

| Metric                 |       Giá trị | Diễn giải                             |
| ---------------------- | --------------: | --------------------------------------- |
| `retrieval_hit_rate` | ⏳ | |
| `mean_token_f1`      | ⏳ | |
| `judge_accuracy`     | ⏳ | |
| `mean_judge_score`   | ⏳ | |
| Ragas, nếu có        | N/A | Mặc định skip; chỉ chạy khi set `RUN_RAGAS=1`. Ragas 0.4.3 import `langchain_community.chat_models.vertexai` đã bị gỡ ở langchain-community 0.4.2, starter đã shim sẵn trong `src/evaluation/metrics.py` |

## 8. Data quality và freshness

⏳ Chờ Role 5 hoàn thiện `src/observability/quality.py`. Các check dự kiến và ngưỡng đã có sẵn tín hiệu từ clean schema:

| Check        | Quality dimension | Ngưỡng/kỳ vọng | Kết quả baseline      | Bằng chứng |
| ------------ | ----------------- | ------------------ | ----------------------- | ------------ |
| Row count | Volume | > 0 | ⏳ | `data/quality/` |
| `paper_id` not null và unique | Uniqueness/Completeness | 100% | ⏳ | `data/quality/` |
| `title` not null | Completeness | 100% | ⏳ | `data/quality/` |
| `summary_chars` đạt tối thiểu | Completeness | ≥ 40 | ⏳ | `data/quality/` |
| `age_days` trong ngưỡng | Freshness | ≤ 180 ngày | ⏳ | `data/quality/freshness_report.json` |

### Freshness

| Thuộc tính               | Giá trị                           |
| -------------------------- | ----------------------------------- |
| Freshness được đo tại | Cleaned dataset, qua cột `age_days` |
| Timestamp mới nhất       | ⏳ |
| Ngưỡng freshness         | 180 ngày (`freshness_threshold_days` trong `src/core/config.py`) |
| Trạng thái baseline      | ⏳ |
| Lý do                     | ⏳ |

## 9. Corruption scenarios và repair

Sáu loại corruption, mỗi loại nhắm một pillar observability khác nhau. Seed cố định `20251110` nên corruption tái hiện được — điều kiện bắt buộc để bảng so sánh ở mục 10 có nghĩa. Các tập record bị tác động là disjoint (trừ duplicate) để tách được ảnh hưởng của từng loại.

| Corruption         | Cách tạo | Record bị tác động | Quality signal kỳ vọng | Tác động thực tế | Cách repair   |
| ------------------ | ---------- | ---------------------: | ------------------------ | --------------------- | -------------- |
| `drop_latest_records` | Xóa 20% (2–4) paper có `published` mới nhất | ⏳ | Row count giảm; `latest_published` lùi lại → freshness fail | ⏳ | Chạy lại `build_clean_dataframe` từ `data/raw/crossref_records.json` |
| `blank_summary` | Set `summary = ""` trên 15% row | ⏳ | `summary_chars = 0` → completeness fail | ⏳ | Như trên |
| `inject_noise` | Chèn mojibake `Ã¢â‚¬â„¢` và rác OCR `###OCR-ERR###` vào 15% row | ⏳ | Phân bố `summary_chars` lệch; embedding bị kéo lệch | ⏳ | Như trên |
| `truncate_title` | Cắt `title` còn 18 ký tự trên 15% row | ⏳ | Phá exact-title lookup của agent | ⏳ | Như trên |
| `stale_published` | Lùi `published` và `updated` lại 2920 ngày trên 20% row | ⏳ | `age_days` vượt ngưỡng 180 → freshness fail | ⏳ | Như trên |
| `duplicate_rows` | Nhân bản nguyên row trên 10% row | ⏳ | `paper_id` hết unique → uniqueness fail | ⏳ | Như trên |

Corruption log:

- Đường dẫn: `data/results/corruption_log.json`
- Trạng thái: ⏳ Chờ chạy corruption flow
- Nội dung log ghi lại: `seed`, `rows_before`, `rows_after`, `unique_paper_ids_before`, `unique_paper_ids_after`, và với mỗi action là `type`, `target_pillar`, `rows_affected`, danh sách `paper_ids` bị tác động, `detail`.

Giải thích cách repair đảm bảo dữ liệu được phục hồi từ nguồn đáng tin cậy thay vì chỉ che kết quả lỗi:

Repair không có hàm riêng và không đảo ngược từng phép corruption. Nó chạy lại đúng hàm `build_clean_dataframe()` trên `data/raw/crossref_records.json` — tức là quay về nguồn raw mà corruption không bao giờ chạm tới — rồi build index mới vào collection `papers-repaired` và đánh giá lại bằng cùng test set. Vì corruption chỉ ghi lên `data/clean/papers_clean_corrupted.*`, raw vẫn là bản ghi gốc đáng tin. Cách này chứng minh được là pipeline phục hồi từ lineage chứ không phải sửa tay `answers` hay `metrics` cho đẹp số.

Bằng chứng sơ bộ trên sample dataset tổng hợp 13 record (chạy qua `script/validate_clean_contract.py` và index thật của Role 4) — **không phải metrics bài nộp**, chỉ để xác nhận corruption có tác dụng trước khi có dữ liệu Crossref:

| | retrieval hit rate | câu trả lời rỗng | rows | row stale > 180 ngày | `paper_id` trùng |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 1.000 | 0 | 13 | 0 | 0 |
| corrupted | 0.615 | 7 | 12 | 2 | 2 |

Chi tiết đáng chú ý: chỉ blank 2 summary nhưng có 7 câu trả lời rỗng. Nguyên nhân là document rỗng trở thành "attractor" trong embedding space — `text_for_embedding` của chúng gần như không có nội dung nên khoảng cách cosine tới mọi query đều thấp đồng đều, hút cả query của paper khác. Đây là failure mode đáng đo lại trên dữ liệu thật.

## 10. So sánh baseline, corrupted và repaired

⏳ Chờ đủ ba file `data/results/baseline_metrics.json`, `corrupted_metrics.json`, `repaired_metrics.json`.

| Metric/signal            | Baseline | Corrupted | Repaired | Thay đổi do corruption | Mức phục hồi | Nhận xét   |
| ------------------------ | -------: | --------: | -------: | -----------------------: | --------------: | ------------ |
| `retrieval_hit_rate`   | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| `mean_token_f1`        | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| `judge_accuracy`       | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| `mean_judge_score`     | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| Quality checks pass/fail | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |
| Freshness status         | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | |

Nêu ít nhất hai kết luận có quan hệ nhân quả được hỗ trợ bởi artifacts:

1. ⏳ Dự kiến: `blank_summary` + `inject_noise` → `summary_chars` fail trong quality report → `mean_token_f1` và `judge_accuracy` giảm. Cần số liệu thật để xác nhận.
2. ⏳ Dự kiến: repair từ raw → `age_days` và `paper_id` unique trở lại pass → metrics phục hồi về gần baseline. Cần số liệu thật để xác nhận.

Không kết luận corruption "có tác động" nếu số liệu không cho thấy thay đổi. Nếu kết quả khác kỳ vọng, mô tả giả thuyết và cách nhóm đã kiểm tra.

## 11. Vấn đề tích hợp quan trọng

### 11.1 Snapshot raw không có abstract, cleaning trả về 0 row

- **Triệu chứng:** Ghép ingestion (Role 2) với cleaning (Role 3) trên snapshot `data/raw/raw.json` đang commit: `parse_crossref_payload` nhận 20 item nhưng trả về 0 `PaperRecord`, kéo theo cleaned dataset rỗng và toàn bộ pipeline phía sau không có gì để chạy.
- **Nguyên nhân:** 0/20 item trong snapshot có field `abstract`, trong khi `parse_crossref_payload` bắt buộc `paper_id`, `title` và `summary` đều không rỗng. Snapshot này được lấy về mà không kèm filter `has-abstract:true` — bằng chứng là item đầu tiên là *"Soziale Innovation"*, một chương sách tiếng Đức không liên quan tới `source_query` đã cấu hình. Ngoài ra 0/20 item có field `subject` nên `categories` cũng sẽ rỗng toàn bộ.
- **Cách xử lý:** Hàm `fetch_source_records` bản thân đã truyền đúng `settings.source_filter`, nên chỉ cần chạy lại nó để sinh `data/raw/crossref_response.json` và `data/raw/crossref_records.json` theo đúng đường dẫn pipeline, thay vì dùng `data/raw/raw.json`. Lưu ý `data/raw/raw.json` không nằm trong `Paths` nên không có bước nào của pipeline đọc file này.
- **Cách xác minh:** Chạy `uv run python script/run_phase1.py` rồi kiểm tra số record trong `data/raw/crossref_records.json` lớn hơn 0 và `df.attrs["cleaning_rejects"]` không loại toàn bộ row. Trước khi có dữ liệu thật, contract cleaning/corruption vẫn được bảo vệ bởi `script/validate_clean_contract.py`.

### 11.2 ragas import module đã bị gỡ khỏi langchain-community

- **Triệu chứng:** `import ragas` thất bại ngay khi dựng môi trường: `ModuleNotFoundError: No module named 'langchain_community.chat_models.vertexai'`.
- **Nguyên nhân:** ragas 0.4.3 vẫn import `langchain_community.chat_models.vertexai` ở thời điểm load module, nhưng module này đã bị gỡ trong langchain-community 0.4.2 (package đang được sunset). Hai phiên bản này cùng được resolve từ `uv.lock`.
- **Cách xử lý:** Không cần đổi dependency. Starter đã inject một module shim trước khi import ragas trong `src/evaluation/metrics.py`, và ragas mặc định bị skip trừ khi set `RUN_RAGAS=1`, nên pipeline chính không phụ thuộc vào đường import này.
- **Cách xác minh:** Import ragas qua đúng đường shim chạy thành công; `_run_ragas()` trả về `{"skipped": ...}` khi không bật `RUN_RAGAS`.

⏳ Bổ sung thêm vấn đề tích hợp phát sinh khi ghép các module (dự kiến sẽ có ở bước ghép ingestion → cleaning → index).

## 12. Giới hạn và hướng cải thiện

| Giới hạn hiện tại | Ảnh hưởng   | Hướng cải thiện có thể kiểm chứng |
| --------------------- | -------------- | ----------------------------------------- |
| `authors` và `categories` là `list[str]`; ghi ra CSV sẽ bị stringify | Đọc lại từ `papers_clean.csv` sẽ ra chuỗi thay vì list | Luôn đọc lại từ bản JSON; hoặc thêm bước parse khi load CSV và assert kiểu trong quality check |
| Corpus chỉ 24 record (`max_results`) | Mỗi record bị corrupt chiếm tỉ trọng lớn, metrics dao động mạnh | Tăng `max_results` và chạy lại, so sánh biên độ dao động của `retrieval_hit_rate` giữa hai kích thước corpus |
| Corruption dùng seed cố định | Kết luận chỉ đúng cho một cấu hình row bị tác động | Chạy lại với vài seed khác nhau, báo cáo khoảng dao động của metrics thay vì một điểm |
| LLM judge phụ thuộc API ngoài | Khi API lỗi, `_judge_answer` rơi về heuristic token F1 và điểm judge không so sánh được giữa các lần chạy | Ghi lại trong metrics số lần rơi vào fallback; loại các lần chạy có fallback khỏi bảng so sánh |
| ⏳ Bổ sung sau khi chạy end-to-end | | |

## 13. Checklist trước khi nộp

- [x] Thông tin nhóm và repository chính xác.
- [x] Phân công khớp với module, artifact và kết quả thực tế.
- [ ] Lệnh tái hiện đã được chạy lại trên phiên bản dùng để nộp.
- [ ] Baseline, corrupted và repaired dùng cùng evaluation set.
- [ ] Bảng metrics khớp với các file trong `data/results/`.
- [ ] Quality/freshness conclusions khớp với `data/quality/`.
- [ ] Các đường dẫn báo cáo và artifact truy cập được.
- [ ] Mỗi thành viên đã hoàn thành báo cáo vai trò riêng.
- [x] Không có `.env`, API key, token hoặc secret trong source, report, log hay ảnh.
