# Báo cáo cá nhân — Day 10: Data Pipeline & Data Observability

## 1. Thông tin cá nhân

| Thông tin | Nội dung |
| --- | --- |
| Họ và tên | Hồ Văn Tâm |
| MSSV | 2A202601542 |
| Khóa/Lớp | K4 |
| Tên nhóm | Day 10 — Data Pipeline & Data Observability |
| Vai trò chính | Evaluation & observability owner |
| Repository | [K4_Day10_Spiderman_Data-Pipeline-Data-Observability](https://github.com/stephhoang30/K4_Day10_Spiderman_Data-Pipeline-Data-Observability) |
| Ngày hoàn thành | 2026-08-06 |

## 2. Vai trò và phạm vi công việc

### Phần việc sở hữu

| Module/deliverable | File/hàm phụ trách | Input | Output bàn giao | Trạng thái |
| --- | --- | --- | --- | --- |
| Evaluation set | `src/evaluation/testset.py::build_test_set` | Cleaned dataframe | `data/eval/test_set.json`, 72 sample baseline | Hoàn thành |
| Evaluation metrics | `src/evaluation/metrics.py::evaluate_pipeline` và `src/retrieval/qa.py` | Test set + local index | Retrieval/answer metrics, answer traces | Hoàn thành |
| Data quality và freshness | `src/observability/quality.py` | Cleaned dataframe + freshness threshold | `baseline_quality.json`, `freshness_report.json` | Hoàn thành |
| Markdown reporting | `src/observability/reporting.py` | Source summary, metrics, quality, freshness | Baseline/comparison report functions | Hoàn thành code; chưa chạy lại flow sau khi hoàn thiện |

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động | Thành viên/module được hỗ trợ | Kết quả |
| --- | --- | --- |
| Kiểm tra contract tích hợp | `phase1.py`, `corruption_flow.py`, `cleaning.py` | Đảm bảo tên artifact, metric và quality/freshness payload khớp với pipeline gọi chúng |
| Kiểm thử offline | `tests/test_evaluation.py` | 9 test pass, không cần gọi LLM hoặc ghi artifact thật |

## 3. Kết quả theo vai trò

| Nhiệm vụ | File/artifact liên quan | Kết quả bàn giao | Cách xác minh |
| --- | --- | --- | --- |
| Sinh evaluation set deterministic | `src/evaluation/testset.py`, `data/eval/test_set.json` | 72 câu hỏi từ 24 paper: 24 date, 24 authors, 24 summary | Đọc `data/eval/test_set.json`, kiểm tra field và `ground_truth_doc_ids` |
| Tách retrieval khỏi answer quality | `src/evaluation/metrics.py`, `src/retrieval/qa.py` | Có `retrieval_rank`, Recall@1/Recall@k, MRR, answer metric và `error_type` | `data/results/baseline_metrics.json` |
| Chạy quality/freshness checks | `src/observability/quality.py` | 7/7 checks PASS; 24/24 published rows hợp lệ; 0 stale row | `data/quality/baseline_quality.json`, `data/quality/freshness_report.json` |
| Sinh Markdown report | `src/observability/reporting.py` | Có hàm tạo baseline report và corruption comparison report | 9 test pass; sẵn sàng được gọi từ `phase1.py` |

Output cụ thể nhất là `data/results/baseline_metrics.json`: evaluation chạy trên 72 sample, với `retrieval_hit_rate = 1.0`, `mean_token_f1 = 1.0`, `judge_accuracy = 1.0`, `mean_judge_score = 5`. Các số này phải được đọc cùng cảnh báo baseline degenerate ở phần 8.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

Pipeline cần đo được ba lớp độc lập:

1. Retrieval có lấy đúng document hay không.
2. QA có trả lời đúng field trong document hay không.
3. Dữ liệu đầu vào có đạt quality và freshness contract trước khi index hay không.

Nếu chỉ ghi một điểm tổng hợp, khó phân biệt lỗi do dữ liệu, vector retrieval hay answer extraction. Vì vậy tôi thiết kế artifact để truy vết từng sample và từng question type.

### Cách triển khai

- `build_test_set()` sort theo `paper_id` để output deterministic, bỏ qua field null/rỗng và không tự bịa `summary`/`categories`.
- Câu hỏi được sinh từ các field mà `qa.py` thực sự đọc: `published`, `authors_joined`, `summary`, `categories_joined`.
- `metrics.py` dùng exact matching cho date, set-F1 cho authors/categories và token-F1 cho summary.
- Retrieval ghi rank của ground-truth document, từ đó tính Recall@1, Recall@k và MRR.
- Quality checks kiểm tra volume, completeness, uniqueness, title, summary length, `age_days` và freshness.
- LLM judge mặc định không bắt buộc; deterministic judge chạy trước để kết quả tái lập. LLM judge chỉ chạy khi đặt `RUN_LLM_JUDGE=1`.
- Reporting tạo Markdown từ payload đã có, không tính lại metric và không làm thay đổi artifact nguồn.

### Input, output và contract

| Thành phần | Mô tả |
| --- | --- |
| Input | Cleaned dataframe có `paper_id`, `title`, `summary`, `published`, `authors_joined`, `categories_joined`, `summary_chars`, `age_days`; index; evaluation set |
| Output | Test set JSON, metrics JSON, answer traces, quality JSON, freshness JSON và Markdown report |
| Module phụ thuộc | `src/retrieval/qa.py`, `src/retrieval/index.py`, `src/ingestion/cleaning.py`, `src/core/utils.py` |
| Module sử dụng output | `phase1.py`, `corruption_flow.py`, `reporting.py` và người review artifact |
| Điều kiện lỗi | Dataframe rỗng, thiếu cột bắt buộc, `paper_id` null/trùng, summary ngắn, `age_days` invalid hoặc record stale |

### Cách xác minh

```powershell
$env:PYTHONPATH="src;.venv\Lib\site-packages"
pytest tests/test_evaluation.py -q -p no:cacheprovider
python -m compileall -q src tests
```

- **Kết quả mong đợi:** Test pass, module compile được, artifact có schema đúng.
- **Kết quả thực tế:** `9 passed`; compile pass; baseline artifacts tồn tại.
- **Artifact/log:** `data/eval/test_set.json`, `data/results/baseline_metrics.json`, `data/quality/baseline_quality.json`, `data/quality/freshness_report.json`.

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** Baseline, corrupted và repaired phải được so sánh trên cùng một evaluation set.
- **Các phương án đã cân nhắc:** Tạo lại test set theo từng dataset variant; hoặc tạo một test set cố định từ dữ liệu sạch rồi tái sử dụng.
- **Phương án đã chọn:** Dùng một test set cố định từ cleaned baseline, giữ nguyên `ground_truth_doc_ids` cho mọi variant.
- **Lý do:** Nếu tạo lại test set sau corruption, ground truth cũng bị thay đổi và metric có thể đo “agent trả lời đúng dữ liệu sai”, không đo được mức suy giảm do corruption. Test set cố định giúp tách biến dữ liệu khỏi biến câu hỏi.
- **Bằng chứng:** `data/eval/test_set.json` có 72 sample và được `evaluate_pipeline()` đọc lại cho baseline/corruption/repaired.

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng:** `run_data_quality_checks()`, `build_freshness_report()` và hai hàm reporting còn `NotImplementedError`.
- **Bước tái hiện:** Chạy baseline đến bước quality/report hoặc import các hàm observability rồi gọi chúng.
- **Nguyên nhân gốc:** Starter chỉ cung cấp pseudo-code, chưa có implementation ghi artifact và Markdown.
- **Cách xử lý:** Implement quality contract, freshness payload, baseline report và comparison report; thêm lazy import để deterministic evaluation không kéo dependency ML/LLM không cần thiết.
- **Cách xác minh sau khi sửa:** `pytest tests/test_evaluation.py -q -p no:cacheprovider` cho kết quả `9 passed`; `baseline_quality.json` có 7/7 PASS và freshness report có `is_fresh: true`.
- **Điều học được:** Một quality gate chỉ có giá trị khi có thể chuyển sang FAIL trên dữ liệu lỗi; metric/report phải giữ trace đủ chi tiết để audit.

Giới hạn còn lại: workspace hiện chưa có artifact `corrupted_metrics.json`, `repaired_metrics.json` và `corruption_report.md` sau khi hoàn thiện reporting. Vì vậy báo cáo này không tự điền số corrupted/repaired.

## 7. Hiểu biết về luồng end-to-end

1. Crossref trả raw response; ingestion parse thành `PaperRecord`, cleaning chuẩn hóa thành dataframe có `text_for_embedding`, `published`, `age_days` và các metadata. Retrieval embed text bằng MiniLM, lưu vào Chroma, sau đó `qa.py` search hoặc exact lookup để trả context và answer.
2. Evaluation set chứa câu hỏi, ground truth và `ground_truth_doc_ids`. Document ID dùng để tính retrieval hit/rank; answer được so với ground truth bằng metric phù hợp với từng loại field.
3. Quality checks kiểm tra contract của dataset tại thời điểm chạy; freshness monitoring đo tuổi dữ liệu và số record vượt ngưỡng 180 ngày. Quality có thể FAIL vì schema dù dữ liệu còn mới; freshness có thể FAIL vì dữ liệu cũ dù schema hợp lệ.
4. Dùng cùng test set giúp mọi thay đổi giữa baseline/corrupted/repaired được quy về corpus/index/data quality, không bị lẫn với thay đổi câu hỏi hoặc ground truth.
5. Repair thành công khi quality/freshness phục hồi và các metric retrieval/answer cải thiện so với corrupted; cần đối chiếu bằng JSON artifacts và comparison report, không chỉ nhìn pipeline exit code.

## 8. Phân tích kết quả

### Metrics chính

| Metric/signal | Baseline | Corrupted | Repaired | Nhận xét cá nhân |
| --- | ---: | ---: | ---: | --- |
| `retrieval_hit_rate` | 1.000 | Chưa chạy | Chưa chạy | Baseline bị ảnh hưởng bởi exact-title lookup trong toàn bộ câu hỏi. |
| `mean_token_f1` | 1.000 | Chưa chạy | Chưa chạy | Ground truth dùng cùng field mà QA extraction đọc, nên điểm bị optimistic. |
| `judge_accuracy` | 1.000 | Chưa chạy | Chưa chạy | Đây là deterministic field-aware judge; LLM judge không chạy mặc định. |
| `mean_judge_score` | 5.000 | Chưa chạy | Chưa chạy | Không nên diễn giải là điểm LLM khi chưa bật `RUN_LLM_JUDGE=1`. |
| Quality checks | 7/7 PASS | Chưa chạy | Chưa chạy | Baseline có đầy đủ row, ID, title, summary, age và freshness hợp lệ. |
| Freshness status | PASS; 0 stale | Chưa chạy | Chưa chạy | Latest `2026-08-01`, oldest `2026-02-12`, threshold 180 ngày. |

### Kết luận từ số liệu

Với artifact hiện tại mới có baseline, kết luận được kiểm chứng là:

1. Cleaned dataset gồm 24 record đạt 7/7 quality checks và freshness PASS.
2. Evaluation chạy được 72 sample và tạo đầy đủ baseline metrics/answers.
3. Baseline đạt toàn bộ metric 1.0/5.0 nhưng chưa phải bằng chứng semantic retrieval mạnh, vì 72 câu hỏi đều chứa title trong dấu nháy đơn và kích hoạt exact lookup.

Chuỗi corruption → quality/freshness → agent metric và repair → phục hồi metric chưa thể kết luận trong report cá nhân này vì chưa có đủ artifact corrupted/repaired trong workspace hiện tại.

## 9. Điều học được và hướng cải thiện

### Ba điều quan trọng nhất

1. Evaluation set phải deterministic và giữ nguyên ground truth khi so sánh nhiều trạng thái dataset.
2. Data quality và freshness cần là artifact có status, count và ngưỡng rõ ràng; không nên chỉ in log chung chung.
3. Metric 1.0 không luôn có nghĩa RAG tốt: thiết kế câu hỏi có exact-title lookup có thể làm baseline degenerate.

### Nếu có thêm thời gian

Thêm một nhóm semantic questions không chứa title chính xác, negative/unanswerable cases và chạy đầy đủ corruption flow. Khi đó có thể đo được embedding retrieval thực tế và điền bảng baseline/corrupted/repaired bằng số liệu so sánh có ý nghĩa hơn.

## 10. Cam kết của thành viên

- [x] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [x] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [x] Mọi kết luận về kết quả đều có artifact hoặc metric để đối chiếu.
- [x] Tôi không ghi “đã chạy thành công” cho phần chưa được kiểm chứng.
- [x] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [x] Báo cáo này không phải bản sao nguyên văn của báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Hồ Văn Tâm<br>
**MSSV:** 2A202601542<br>
**Ngày xác nhận:** 2026-08-06
