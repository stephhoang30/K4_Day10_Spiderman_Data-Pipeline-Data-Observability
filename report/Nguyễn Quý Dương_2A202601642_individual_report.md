# Báo cáo cá nhân — Day 10: Data Pipeline & Data Observability

## 1. Thông tin cá nhân

| Thông tin | Nội dung |
| --- | --- |
| Họ và tên | Nguyễn Quý Dương |
| MSSV | 2A202601642 |
| Khóa/Lớp | K4 |
| Tên nhóm | SPIDERMAN |
| Vai trò chính | Role 2 — Ingestion (Crossref + raw lineage) |
| Repository | [K4_Day10_Spiderman_Data-Pipeline-Data-Observability](https://github.com/stephhoang30/K4_Day10_Spiderman_Data-Pipeline-Data-Observability) |
| Ngày hoàn thành | 2026-08-06 |

## 2. Vai trò và phạm vi công việc

### Phần việc sở hữu

| Module/deliverable | File/hàm phụ trách | Input nhận vào | Output bàn giao | Trạng thái |
| --- | --- | --- | --- | --- |
| Crossref ingestion | `src/ingestion/crossref.py` — `fetch_source_records` | Query, filter, giới hạn kết quả trong `Settings` | Raw API response và danh sách `PaperRecord` | Hoàn thành |
| Raw lineage và snapshot loading | `parse_crossref_payload`, `load_raw_records` | Crossref JSON hoặc snapshot raw records | `data/raw/crossref_response.json`, `data/raw/crossref_records.json` | Hoàn thành |

Tôi chịu trách nhiệm cho ranh giới đầu vào của pipeline: dữ liệu từ Crossref phải được lưu nguyên bản trước khi biến đổi, sau đó mới được parse sang schema chung. Role 3 nhận `list[PaperRecord]` để cleaning; các role sau phụ thuộc vào raw artifacts khi cần repair hoặc truy vết kết quả.

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động | Thành viên/module được hỗ trợ | Kết quả |
| --- | --- | --- |
| Kiểm tra tích hợp ingestion–cleaning | Role 3 — `src/ingestion/cleaning.py` | Phát hiện snapshot `data/raw/raw.json` không có abstract; chạy lại ingestion đúng filter tạo 24 raw records hợp lệ để cleaning giữ 24 row. |
| Cung cấp lineage cho repair | Role 1 và Role 3 — corruption flow | Repair có thể xây dựng lại clean dataset từ `data/raw/crossref_records.json`, không sửa tay dataset hoặc metrics. |

## 3. Kết quả theo vai trò

| Nhiệm vụ đã thực hiện | File/hàm/artifact liên quan | Kết quả bàn giao | Cách xác minh |
| --- | --- | --- | --- |
| Gọi Crossref với query/filter cấu hình | `src/ingestion/crossref.py`, `data/raw/crossref_response.json` | 24/24 item trả về có abstract | Kiểm tra raw response và `data/raw/crossref_records.json` |
| Chuẩn hóa Crossref JSON thành schema raw | `PaperRecord`, `parse_crossref_payload` | 24 `PaperRecord`: DOI, title, summary, authors, dates, URL và publisher | Đọc snapshot raw; clean log ghi 24 row đầu vào, 0 row bị loại |
| Bảo vệ request nguồn | `fetch_source_records` | Timeout 30 giây; tối đa 3 lần thử, backoff cho 429/503 | Cấu hình/hằng số trong module và kết quả baseline pipeline |

Output cụ thể của phần ingestion là `data/raw/crossref_records.json`. Đây là snapshot chuẩn gồm 24 record và là nguồn tin cậy để tạo `papers_clean.json` ban đầu cũng như tái tạo dữ liệu repaired sau corruption.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

Pipeline RAG chỉ đáng tin cậy khi có thể truy vết từ document trong ChromaDB về dữ liệu nguồn. Crossref trả JSON không đồng nhất: `title` là list, abstract có tag JATS/HTML, ngày ở `date-parts`, author/link có thể thiếu. Vì vậy ingestion phải vừa chịu được trường thiếu, vừa không làm mất raw evidence cần cho audit và repair.

### Cách triển khai

`fetch_source_records` gửi `query`, `filter` và `rows` từ `Settings` tới `https://api.crossref.org/works`. Request dùng timeout 30 giây và retry tối đa ba lần với backoff luỹ thừa cho 429/503 hoặc lỗi request tạm thời. Khi nhận response hợp lệ, hàm ghi JSON nguyên bản vào `crossref_response.json` trước khi parse.

`parse_crossref_payload` duyệt `message.items`, lấy DOI làm `paper_id`, title, abstract, author, subject, date và link. Text được bỏ tag HTML/JATS, decode entity và chuẩn hóa whitespace. Ngày publication ưu tiên `published-print`, sau đó `published-online`, `published`, rồi `issued`; ngày updated lấy từ `indexed` hoặc `created`. Record thiếu DOI, title hoặc abstract bị loại vì không thể trở thành document embedding hữu ích. Cuối cùng, danh sách dataclass được serialize thành `crossref_records.json`; `load_raw_records` đọc lại snapshot này để phục vụ chạy lại pipeline không cần gọi API.

### Input, output và contract

| Thành phần | Mô tả |
| --- | --- |
| Input | Crossref works payload; `source_query`, dynamic `from-pub-date:<today − 180 days>,has-abstract:true`, và `max_results=24` |
| Output | `list[PaperRecord]`, raw response JSON và raw-record snapshot JSON |
| Module phụ thuộc | `src/core/config.py` cung cấp `Settings` và paths; `src/core/utils.py` cung cấp JSON/text utilities |
| Module sử dụng output | `src/ingestion/cleaning.py`, `src/pipelines/phase1.py`, `src/pipelines/corruption_flow.py` |
| Điều kiện lỗi cần xử lý | 429/503, timeout/network error, payload không phải object, cấu trúc `message.items` sai, hoặc record thiếu DOI/title/abstract |

### Cách xác minh

```bash
uv run python script/run_phase1.py
```

- **Kết quả mong đợi:** Có raw response và raw-record snapshot; cleaning nhận được records đủ abstract.
- **Kết quả thực tế:** Lần chạy được ghi nhận ngày 2026-08-06 tạo 24 raw records; cleaning giữ 24/24 row và loại 0 row.
- **Artifact/log:** `data/raw/crossref_response.json`, `data/raw/crossref_records.json`, `data/quality/cleaning_log.json`.

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** Cần chọn giữa chỉ lưu dữ liệu đã parse hoặc lưu cả response gốc của Crossref.
- **Các phương án đã cân nhắc:** (1) chỉ lưu `PaperRecord` để giảm artifact; (2) lưu raw response sau khi parse; (3) lưu raw response trước khi parse và thêm snapshot `PaperRecord`.
- **Phương án đã chọn:** Phương án 3.
- **Lý do:** Response gốc giúp phân biệt lỗi nguồn, lỗi parse và lỗi cleaning. Snapshot parsed giúp tái chạy downstream ổn định hơn, không phụ thuộc dữ liệu sống của API. Chi phí lưu cho 24 record nhỏ hơn nhiều so với lợi ích reproducibility và repair.
- **Bằng chứng quyết định phù hợp:** Sau corruption, repaired dataset trở về 24 row và các metric về đúng baseline khi build lại từ raw snapshot; không cần sửa tay dữ liệu corrupt.

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng/lỗi:** `parse_crossref_payload` nhận 20 item từ `data/raw/raw.json` nhưng trả về 0 `PaperRecord`; do đó cleaning không có row để xử lý.
- **Lệnh hoặc bước tái hiện:** Đọc snapshot `data/raw/raw.json` và parse theo rule bắt buộc DOI, title, abstract.
- **Nguyên nhân gốc:** Snapshot cũ được lấy không kèm `has-abstract:true`; 0/20 item có field `abstract`. File này cũng không phải raw path chuẩn mà pipeline cấu hình.
- **Cách xử lý:** Dùng `fetch_source_records(settings)` với `source_filter` chuẩn để tạo lại `data/raw/crossref_response.json` và `data/raw/crossref_records.json`.
- **Cách xác minh sau khi sửa:** Snapshot chuẩn có 24/24 item có abstract; cleaning log xác nhận đầu vào 24, giữ 24, loại 0.
- **Điều học được:** Raw artifact chỉ có giá trị khi gắn với query/filter và path contract của pipeline; một file JSON cùng định dạng chưa chắc là dữ liệu nguồn hợp lệ.

## 7. Hiểu biết về luồng end-to-end

1. **Từ Crossref đến vector index:** Ingestion gọi Crossref, lưu response gốc và parse thành `PaperRecord`. Cleaning chuẩn hóa text, dedupe, tính `age_days` và tạo `text_for_embedding`. `LocalEmbeddingIndex.build` embed cột này bằng MiniLM rồi nạp documents/metadata vào ChromaDB.
2. **Evaluation:** Test set chứa question, ground truth và `ground_truth_doc_ids`. Với mỗi question, evaluator kiểm tra document đúng có nằm trong kết quả retrieval, sau đó so answer với ground truth bằng token F1 và judge. Vì vậy có thể tách lỗi retrieval khỏi lỗi trả lời.
3. **Quality và freshness:** Quality checks kiểm tra tính đầy đủ/duy nhất/độ dài/schema của dataframe; freshness monitoring chỉ tập trung vào published date, số row stale và ngưỡng 180 ngày. Hai nhóm signal bổ sung nhau.
4. **Cùng một test set:** Baseline, corrupted và repaired phải dùng chung 72 câu hỏi để metric thay đổi chỉ phản ánh trạng thái dữ liệu/index, không phải thay đổi sample đánh giá.
5. **Tiêu chí repair thành công:** Repaired artifacts phải được xây từ raw source, quality/freshness quay về PASS, và metrics của repaired khôi phục về baseline trên cùng test set.

## 8. Phân tích kết quả

### Metrics chính

| Metric/signal | Baseline | Corrupted | Repaired | Nhận xét của cá nhân |
| --- | ---: | ---: | ---: | --- |
| `retrieval_hit_rate` | 1.000 | 0.833 | 1.000 | Mất hoặc biến dạng một phần corpus làm 12/72 câu không retrieve đúng; repair khôi phục hoàn toàn. |
| `mean_token_f1` | 1.000 | 0.739 | 1.000 | Summary rỗng/noise và document bị mất làm answer lệch ground truth. |
| `judge_accuracy` | 1.000 | 0.722 | 1.000 | Corruption làm giảm 20/72 câu được chấm đúng; repaired quay lại 1.000. |
| `mean_judge_score` | 5.000 | 3.917 | 5.000 | Chất lượng answer giảm rõ rệt khi index dựa trên dữ liệu lỗi. |
| Quality checks | PASS (8/8) | FAIL (3 lỗi) | PASS (8/8) | Corrupted có 2 DOI trùng, 3 summary ngắn và 5 stale row. |
| Freshness status | PASS, 0 stale | FAIL, 5 stale | PASS, 0 stale | Thao tác lùi published date bị freshness monitor phát hiện. |

### Kết luận từ số liệu

1. `drop_latest_records`, blank summary, stale date và duplicate rows → quality/freshness chuyển từ PASS sang FAIL (3 failed checks, 5 stale rows) → retrieval hit rate giảm từ 1.000 xuống 0.833, token F1 giảm xuống 0.739.
2. Rebuild clean data từ `data/raw/crossref_records.json` → 24 row, 0 duplicate, 0 short summary, 0 stale row → quality/freshness PASS và bốn metric chính trở về mức baseline.

Corruption tác động rõ nhất là **drop latest records**: log ghi đã bỏ 4 paper mới nhất. Các câu hỏi có `ground_truth_doc_ids` thuộc nhóm này không còn nguồn để retrieve; đây là ví dụ ingestion/raw lineage quan trọng vì repair chỉ tin cậy khi có snapshot nguồn đầy đủ.

Một kết quả khác dự đoán ban đầu là truncate title không làm metric tổng giảm mạnh như mong đợi. Exact-title lookup bị ảnh hưởng, nhưng semantic search vẫn tìm được document trong nhiều trường hợp. Điều này cho thấy phải xem cả cách question được tạo và đường retrieval, không chỉ nhìn một loại corruption.

## 9. Điều học được và hướng cải thiện

### Ba điều quan trọng nhất

1. Raw response phải được lưu trước parse để debug, audit và repair có bằng chứng nguồn rõ ràng.
2. Filter nguồn là một phần của data contract: `has-abstract:true` quyết định trực tiếp việc record có thể đi qua cleaning và embedding hay không.
3. Chất lượng RAG không chỉ do embedding model; completeness, uniqueness và freshness của ingestion data có thể làm metric answer thay đổi đáng kể.

### Nếu có thêm thời gian

Tôi sẽ bổ sung kiểm tra volume/freshness so với snapshot ingestion trước đó và cảnh báo khi số record mới giảm bất thường. Cải thiện sẽ được đo bằng việc cố ý bỏ latest records rồi xác minh quality gate fail ngay ở ingestion, thay vì chỉ phát hiện ở evaluation sau khi agent đã suy giảm.

## 10. Cam kết của thành viên

- [x] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [x] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [x] Mọi kết luận về kết quả đều có artifact hoặc metric để đối chiếu.
- [x] Tôi không ghi “đã chạy thành công” cho phần chưa được kiểm chứng; kết quả chạy được dẫn chiếu từ artifact của nhóm ngày 2026-08-06.
- [x] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [x] Báo cáo này không sao chép nguyên văn báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Nguyễn Quý Dương  
**Ngày xác nhận:** 2026-08-06
