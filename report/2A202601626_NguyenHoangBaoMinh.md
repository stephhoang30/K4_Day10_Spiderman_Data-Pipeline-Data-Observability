# Báo cáo cá nhân — Day 10: Data Pipeline & Data Observability

## 1. Thông tin cá nhân

| Thông tin | Nội dung |
| --- | --- |
| Họ và tên | Nguyễn Hoàng Bảo Minh |
| MSSV | 2A202601626 |
| Khóa/Lớp | K4 |
| Tên nhóm | Spiderman |
| Vai trò chính | Điều phối pipeline |
| Repository | `K4_Day10_Spiderman_Data-Pipeline-Data-Observability` |
| Ngày hoàn thành | 2026-08-06 |

## 2. Vai trò và phạm vi công việc

### Phần việc sở hữu

| Module/deliverable | File/hàm phụ trách | Input nhận vào | Output bàn giao | Trạng thái |
| --- | --- | --- | --- | --- |
| Baseline orchestration | `src/pipelines/phase1.py` / `main()` | Raw snapshot, settings và contract clean dataframe | Clean artifacts, baseline index, metrics, quality/freshness và baseline report | Hoàn thành |
| Corruption, repair và comparison orchestration | `src/pipelines/corruption_flow.py` / `main()`, `_evaluate_state()` | Baseline artifacts, test set cố định, raw snapshot | Corrupted/repaired artifacts, metrics, quality/freshness và comparison report | Hoàn thành |
| Lineage của evaluation state | Lời gọi `evaluate_pipeline(..., dataset_variant=state)` trong corruption flow | State `corrupted` hoặc `repaired` | Metadata đúng trong metrics và answers artifacts | Hoàn thành |

Phần việc của tôi là nối các module của nhóm thành hai flow chạy được theo thứ tự phụ thuộc. Tôi không nhận ownership logic fetch Crossref, cleaning rule, corruption rule, evaluation-set generation hay report rendering; pipeline của tôi gọi các module đó theo contract đã thống nhất.

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động | Thành viên/module được hỗ trợ | Kết quả |
| --- | --- | --- |
| Kiểm tra contract integration | `evaluation/metrics.py` | Phát hiện `dataset_variant` của corrupted/repaired bị ghi thành `baseline`; flow đã truyền state đúng vào evaluator. |
| Kiểm tra tính đúng metric | `evaluation/metrics.py` | Phát hiện MRR bỏ retrieval miss khỏi mẫu số; đã sửa để miss đóng góp `0.0`. |
| Rà chất lượng output | `observability/quality.py` | Thêm signal `categories_coverage` ở mức WARNING vì corpus Crossref hiện không có category, tránh coi đó là PASS im lặng. |

## 3. Kết quả theo vai trò

| Nhiệm vụ đã thực hiện | File/hàm/artifact liên quan | Kết quả bàn giao | Cách xác minh |
| --- | --- | --- | --- |
| Điều phối baseline | `src/pipelines/phase1.py` | 24 raw/clean records, 72 evaluation samples, baseline metrics và report | `uv run python script/run_phase1.py` |
| Điều phối corruption và repair | `src/pipelines/corruption_flow.py` | Corrupted 22 rows, repaired 24 rows; report so sánh ba trạng thái | `uv run python script/run_corruption_flow.py` |
| Giữ lineage state | `data/results/{corrupted,repaired}_metrics.json` | `dataset_variant` lần lượt là `corrupted` và `repaired` | Đọc hai JSON metrics sau khi chạy flow |
| Giữ metric retrieval nhất quán | `src/evaluation/metrics.py` | Corrupted MRR = 0.8333, khớp việc 12/72 câu retrieval miss | Smoke test MRR và `data/results/corrupted_metrics.json` |

Artifact thể hiện rõ nhất phần điều phối là [`data/reports/corruption_report.md`](../data/reports/corruption_report.md): baseline, corrupted và repaired được tạo từ cùng một test set, collection/manifest riêng, sau đó được đặt cạnh nhau để so sánh.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

Một pipeline RAG không thể chạy các bước theo thứ tự tùy ý. Evaluation cần index; index cần clean dataframe; repair phải dùng raw snapshot cũ thay vì fetch data mới; corruption không được ghi đè baseline. Vai trò điều phối giải quyết dependency này và biến các module độc lập thành một flow tái lập được.

### Cách triển khai

Baseline đi theo luồng sau:

```text
raw records
→ clean dataframe
→ clean CSV/JSON + cleaning log
→ baseline Chroma index
→ create/load fixed test set
→ evaluate
→ quality + freshness
→ phase1 report
```

Corruption flow đọc clean baseline, gọi corruption function trên bản sao dataframe, rồi build collection/embedding manifest riêng cho state `corrupted`. Repair không copy baseline; flow đọc lại `data/raw/crossref_records.json`, chạy cleaning lại và build state `repaired`. Cả hai state dùng cùng `data/eval/test_set.json`, nên chênh lệch metric có thể quy cho thay đổi dữ liệu thay vì thay đổi câu hỏi.

### Input, output và contract

| Thành phần | Mô tả |
| --- | --- |
| Input baseline | `data/raw/crossref_records.json` hoặc response mới từ Crossref; `Settings`; clean dataframe theo schema chung |
| Input corruption/repair | Clean baseline JSON, baseline metrics, fixed test set, raw snapshot |
| Output | CSV/JSON clean cho từng state, embedding manifest, answer/metrics JSON, quality/freshness JSON, Markdown report |
| Module phụ thuộc | `ingestion`, `retrieval/index.py`, `evaluation`, `observability` |
| Module sử dụng output | Script entrypoint, report nhóm/cá nhân và người review artifact |
| Điều kiện lỗi xử lý | Thiếu baseline artifact thì corruption flow dừng với hướng dẫn chạy Phase 1 trước; dataframe rỗng/thiếu cột contract không được index |

### Cách xác minh

```bash
uv run python script/run_phase1.py
uv run python script/run_corruption_flow.py
```

- **Kết quả mong đợi:** sinh đủ artifact baseline, corrupted và repaired; baseline/repaired PASS, corrupted FAIL quality.
- **Kết quả thực tế:** hai lệnh hoàn tất; baseline và repaired có 24 rows, corrupted có 22 rows; metrics repaired quay về baseline.
- **Artifact/log:** `data/results/*_metrics.json`, `data/results/corruption_log.json`, `data/quality/*_quality.json`, `data/reports/*.md`.

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** cần so sánh công bằng chất lượng RAG trước/sau corruption.
- **Các phương án đã cân nhắc:** (1) tạo test set mới ở mỗi state; (2) dùng một test set cố định cho cả ba state.
- **Phương án đã chọn:** dùng `data/eval/test_set.json` cố định.
- **Lý do:** nếu câu hỏi/ground truth thay đổi cùng lúc với data, không thể biết metric giảm do corruption hay do bộ câu hỏi. Test set cố định giữ measurement surface không đổi.
- **Bằng chứng quyết định phù hợp:** 72 câu hỏi được dùng lại cho cả ba state; corruption làm hit rate giảm từ 1.000 xuống 0.833, còn repair phục hồi về 1.000.

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng/lỗi:** `corrupted_metrics.json` và `repaired_metrics.json` ghi `"dataset_variant": "baseline"`.
- **Lệnh hoặc bước tái hiện:** chạy `uv run python script/run_corruption_flow.py`, sau đó đọc `data/results/corrupted_metrics.json`.
- **Nguyên nhân gốc:** `evaluate_pipeline()` có parameter `dataset_variant`, nhưng `_evaluate_state()` trong corruption flow không truyền `state`; evaluator dùng default `baseline`.
- **Cách xử lý:** truyền `dataset_variant=state` khi gọi evaluator.
- **Cách xác minh sau khi sửa:** chạy lại hai flow; metrics mới ghi đúng `baseline`, `corrupted`, `repaired` theo từng artifact.
- **Điều học được:** metric value đúng vẫn chưa đủ. Metadata lineage sai làm report/audit có thể kết luận nhầm state tạo ra kết quả.

## 7. Hiểu biết về luồng end-to-end

1. Crossref trả API payload, ingestion lưu raw response và parse thành raw records. Cleaning chuẩn hóa record, tính `age_days` và tạo `text_for_embedding`. Index dùng text đó để tạo embedding và lưu vào ChromaDB.
2. Test set chứa question, ground truth và `ground_truth_doc_ids`. Khi evaluator chạy, nó so document IDs retrieved với ground truth để đo retrieval; sau đó so answer với ground truth để đo answer quality.
3. Quality checks kiểm tra tính đầy đủ/duy nhất/hợp lệ của dataframe, ví dụ duplicate `paper_id` hoặc summary quá ngắn. Freshness monitoring chỉ tập trung vào thời gian: ngày publish, `age_days` và số record stale.
4. Cùng test set loại bỏ biến nhiễu từ câu hỏi. Vì vậy, metric thay đổi giữa baseline, corrupted và repaired phản ánh corpus/index của từng state.
5. Repair thành công khi artifact repaired được tạo lại từ raw snapshot, quality/freshness trở lại PASS và các metric chính phục hồi về baseline.

## 8. Phân tích kết quả

### Metrics chính

| Metric/signal | Baseline | Corrupted | Repaired | Nhận xét của cá nhân |
| --- | ---: | ---: | ---: | --- |
| `retrieval_hit_rate` | 1.000 | 0.833 | 1.000 | 12/72 câu mất document ground truth sau corruption; repair khôi phục đủ corpus. |
| `mean_token_f1` | 1.000 | 0.739 | 1.000 | Answer giảm rõ dù không phải mọi retrieval đều miss. |
| `judge_accuracy` | 1.000 | 0.722 | 1.000 | Corruption làm 20/72 câu không còn đạt tiêu chí đúng. |
| `mean_judge_score` | 5.000 | 3.917 | 5.000 | Chất lượng answer giảm 1.083 điểm, sau repair trở lại 5.000. |
| Quality checks | PASS | FAIL (3 failed) | PASS | Duplicate ID, summary rỗng/ngắn và stale data bị phát hiện. |
| Freshness status | PASS (0 stale) | FAIL (5 stale) | PASS (0 stale) | Repair phục hồi mốc publish và `age_days` từ raw records. |

### Kết luận từ số liệu

1. `drop_latest_records`/blank summary/stale date/duplicate → quality FAIL và freshness FAIL → retrieval hit rate giảm 0.167, Token F1 giảm 0.261, judge accuracy giảm 0.278.
2. Re-clean từ raw snapshot → 24 rows, 0 stale, quality PASS → toàn bộ metric chính trở lại 1.000 hoặc 5.000 như baseline.

Corruption ảnh hưởng rõ nhất là xóa 4 paper mới nhất. Mỗi paper có ba câu hỏi trong test set (authors, date, summary), nên 4 paper bị drop làm 12/72 câu không còn document ground truth. Đây là lý do trực tiếp của hit rate 0.833.

Kết quả khác với dự đoán ban đầu là `truncate_title` không làm metric tổng giảm đáng kể. Exact-title lookup có thể bị ảnh hưởng, nhưng semantic retrieval vẫn tìm được document trong nhiều trường hợp. Điều này cho thấy không nên chỉ nhìn một đường lookup; cần đối chiếu answer artifact và retrieval result.

## 9. Điều học được và hướng cải thiện

### Ba điều quan trọng nhất

1. Pipeline đúng không chỉ là script exit code 0; artifact, metadata state và report phải khớp nhau.
2. Data quality và freshness là signal khác nhau: dataset có thể unique/đủ cột nhưng vẫn stale, hoặc retrieval đúng nhưng answer sai do summary/date bị corrupt.
3. Repair đáng tin cậy cần lineage về raw snapshot và cùng test set; copy lại baseline sẽ không chứng minh được khả năng recovery.

### Nếu có thêm thời gian

Tôi sẽ thêm integration test tự động cho ba state. Test sẽ kiểm tra `dataset_variant`, row count, quality status, MRR có tính retrieval miss và repaired metrics bằng baseline. Thành công được đo bằng việc pipeline thay đổi contract sẽ fail test trước khi sinh report sai.

Ragas chưa được dùng làm evidence chính. Khi bật `RUN_RAGAS=1`, 72 câu × 4 metric tạo 288 jobs và gặp incompatibility với embedding wrapper; cần làm adapter tương thích trước khi dùng cho kết luận.

## 10. Cam kết của thành viên

- [x] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [x] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [x] Mọi kết luận về kết quả đều có artifact hoặc metric để đối chiếu.
- [x] Tôi không ghi “đã chạy thành công” cho phần chưa được kiểm chứng.
- [x] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [x] Báo cáo này không phải bản sao nguyên văn của báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Nguyễn Hoàng Bảo Minh  
**Ngày xác nhận:** 2026-08-06
