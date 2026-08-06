# Member Role Report — Day 10: Data Pipeline & Data Observability

## 1. Thông tin cá nhân

| Thông tin         | Nội dung                  |
| ------------------ | -------------------------- |
| Họ và tên       | Hoàng Công Thành |
| MSSV               | 2A202601662 |
| Khóa/Lớp         | K4 |
| Tên nhóm         | SPIDERMAN |
| Vai trò chính    | Role 3 — Cleaning & corruption (clean schema, corruption, repair) |
| Repository         | https://github.com/stephhoang30/K4_Day10_Spiderman_Data-Pipeline-Data-Observability |
| Ngày hoàn thành | 2026-08-06 |

## 2. Vai trò và phạm vi công việc

### Phần việc sở hữu

| Module/deliverable | File/hàm phụ trách | Input nhận vào | Output bàn giao  | Trạng thái |
| ------------------ | --------------------- | ---------------- | ----------------- | ------------ |
| Clean contract và cleaning pipeline | `src/ingestion/cleaning.py` — `build_clean_dataframe`, `refresh_derived_columns`, `build_text_for_embedding` | `list[PaperRecord]` từ Role 2 | `data/clean/papers_clean.csv` + `.json`, 24 row × 16 cột | Hoàn thành |
| Ghi artifact và log truy vết | `cleaning.py` — `write_clean_artifacts`, `write_cleaning_log`, `summarize_clean_dataframe` | Cleaned dataframe | `data/quality/cleaning_log.json` (+ bản `_corrupted`, `_repaired`) | Hoàn thành |
| Contract gate trước khi index | `cleaning.py` — `assert_clean_contract`, `CleanContractError` | Cleaned dataframe + tên state | Raise nếu vi phạm; nối vào `phase1._validate_clean_dataframe` | Hoàn thành |
| Corruption có chủ đích | `src/ingestion/corruption.py` — `corrupt_clean_dataframe` | Cleaned baseline dataframe | `data/clean/papers_clean_corrupted.*`, `data/results/corruption_log.json` | Hoàn thành |
| Repair từ nguồn tin cậy | Dùng lại `build_clean_dataframe` trên raw records | `data/raw/crossref_records.json` | `data/clean/papers_clean_repaired.*` | Hoàn thành |
| Bộ script kiểm chứng | `script/validate_clean_contract.py`, `script/audit_quality_gate.py`, `script/demo_three_states.py`, `script/export_pipeline_spec.py`, `script/team_progress.py` | — | Output stdout + `data/pipeline_spec.json` | Hoàn thành |

Repair **không có hàm riêng**. Tôi cố ý không viết hàm đảo ngược từng phép corruption, vì như vậy chỉ là che lỗi. Repair gọi lại đúng `build_clean_dataframe()` trên raw records — nguồn mà corruption không bao giờ chạm tới.

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động | Thành viên/module được hỗ trợ | Kết quả |
| --- | --- | --- |
| Phát hiện snapshot raw không dùng được | Dương (Role 2) — `data/raw/raw.json` | Ghép ingestion với cleaning cho ra **20 item → 0 record**. Nguyên nhân: 0/20 item có `abstract` vì snapshot lấy về không kèm filter `has-abstract:true`. Code không sai, chỉ tham số fetch sai. Chạy lại `fetch_source_records` cho 24/24 item có abstract |
| Cảnh báo `categories` rỗng toàn bộ | Tâm (Role 5) — `build_test_set` | Crossref không còn populate `subject`: 0/24 record có categories. Loại câu hỏi `categories` sẽ có ground truth rỗng. Smoke test agent xác nhận câu này trả lời RỖNG |
| Review corpus trước khi vào test set | Tâm (Role 5) | Chỉ ra 1 row title tiếng Nga và 1 row `first_sentence()` chỉ là `"Background."` — hai row không nên dùng làm ground truth |
| Sửa seam mất cleaning log | Minh (Role 1) — `phase1._save_clean_artifacts` | Chạy `run_phase1.py` ghi đè clean artifacts mà không sinh log, mất tiêu chí truy vết. Thêm tham số `log_path` optional, không bỏ hàm nào của Minh |
| Audit baseline degenerate | Tâm (Role 5) — `build_test_set` | Mọi metric bằng 1.000 vì test set nhúng nguyên title, agent đi đường tắt exact lookup. Đo được recall@1 tụt 0.931 → 0.042 khi bỏ title khỏi câu hỏi |
| Audit quality gate | Tâm (Role 5) — `run_data_quality_checks` | Cho gate ăn corrupted data: overall lật PASS → FAIL, tức không hard-code. Nhưng 3/6 loại corruption không check nào bắt được |

## 3. Kết quả theo vai trò

| Nhiệm vụ đã thực hiện | File/hàm/artifact liên quan | Kết quả bàn giao | Cách xác minh |
| --- | --- | --- | --- |
| Chốt clean contract 16 cột đọc ngược từ consumer | `cleaning.py:CLEAN_COLUMNS` | Schema mà Chroma metadata và agent dùng trực tiếp được | `list(df.columns) == CLEAN_COLUMNS` trong `validate_clean_contract.py` |
| 6 rule loại row + 2 rule dedupe, có log lý do | `build_clean_dataframe`, `df.attrs["cleaning_rejects"]` | 24 raw → 24 clean, loại 0 | `data/quality/cleaning_log.json` → khối `rejects` |
| Bỏ nhãn `Abstract` dẫn đầu summary | `_strip_abstract_label` | 8/24 row được làm sạch | `df["summary"].str.match(r"^Abstract\b").sum() == 0` |
| 6 loại corruption, tập row disjoint, seed cố định | `corrupt_clean_dataframe` | 24 → 22 row, unique `paper_id` 24 → 20 | `data/results/corruption_log.json` |
| Contract gate hai mức | `assert_clean_contract` | Chặn baseline/repaired vi phạm, miễn cho corrupted | Test cả hai chiều trong `validate_clean_contract.py` |
| Repair từ raw | `corruption_flow` gọi `build_clean_dataframe` | 24 row, metrics về đúng baseline | Fingerprint SHA-256 trùng bản rebuild từ raw |

Một output cụ thể mà phần việc của tôi tạo ra và giúp xác minh:

`data/quality/cleaning_log.json`. Nó tồn tại vì `df.attrs` không sống sót qua vòng ghi file — nếu không ghi ra artifact riêng thì sau khi lưu CSV/JSON là mất sạch dấu vết record nào bị loại và vì sao. Log ghi `rows_in` / `rows_out` / `rows_dropped`, breakdown 6 lý do loại record, các rule đang áp dụng, và khối `signals` (row count, unique `paper_id`, số ô rỗng, khoảng `summary_chars` và `age_days`, ngày mới/cũ nhất) để Role 5 dùng thẳng cho quality report thay vì đếm lại.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

Phần của tôi đứng giữa hai đầu đều không kiểm soát được: đầu vào là dữ liệu Crossref thật với đủ kiểu rác (abstract bọc XML JATS, ngày thiếu, tác giả trùng lặp viết hoa khác nhau, nhiều ngôn ngữ), đầu ra phải là bảng mà embedding model, ChromaDB và agent dùng được ngay không phải đoán. Thêm nữa tôi phải chủ động phá chính dữ liệu mình vừa làm sạch, theo cách đủ hiện thực để đo được tác động nhưng không được phá schema — vì nếu schema hỏng thì index không build được và bảng so sánh mất nghĩa.

### Cách triển khai

**Contract không tự chọn mà đọc ngược từ code của người khác.** Tôi không ngồi thiết kế schema theo ý mình. Tôi đọc `index._build_documents` thấy nó đẩy 8 field vào Chroma metadata, mà Chroma metadata chỉ nhận scalar — nên list `authors` không đi thẳng vào được, phải có `authors_joined`. Rồi đọc `qa._extract_answer` thấy agent trả lời câu hỏi authors/date/categories bằng cách đọc **thẳng** metadata. Từ hai chỗ đó suy ra 16 cột bắt buộc, chia 11 cột gốc và 5 cột derived.

**`text_for_embedding` nhét cả metadata chứ không chỉ abstract.** Format là block 5 dòng `Title / Authors / Categories / Published / Summary`. Lý do: test set có các loại câu hỏi về tác giả và ngày xuất bản; nếu chỉ embed abstract thì semantic search không có tín hiệu nào để khớp những câu đó.

**Một hàm duy nhất tính cột derived.** `refresh_derived_columns()` được gọi ở cuối cleaning và gọi lại sau khi corruption sửa cột gốc. Nhờ vậy corrupted dataset không bao giờ lệch schema — corruption chỉ sửa `title`, `summary`, `published`, còn `summary_chars`, `age_days`, `text_for_embedding` tự đồng bộ.

**Corruption thiết kế theo pillar, tập row disjoint, seed cố định.** Sáu loại nhắm sáu pillar khác nhau (volume, completeness, distribution, schema/lookup, freshness, uniqueness). Các tập row bị tác động là disjoint — nhờ đó lúc phân tích tôi quy được trách nhiệm cho từng loại thay vì chỉ nói "corruption làm giảm metrics". Seed `20251110` cố định vì nếu corruption ngẫu nhiên thì bảng so sánh baseline/corrupted/repaired không tái hiện được, mà không tái hiện được thì không phải bằng chứng.

### Input, output và contract

| Thành phần | Mô tả |
| --- | --- |
| Input | `list[PaperRecord]` (11 field) từ `ingestion.crossref`, hoặc cleaned dataframe cho corruption |
| Output | DataFrame 16 cột `CLEAN_COLUMNS`; artifact `data/clean/papers_clean.{csv,json}`, `data/quality/cleaning_log.json`, `data/results/corruption_log.json` |
| Module phụ thuộc | `ingestion.crossref` (schema `PaperRecord`), `core.config` (paths), `core.utils` |
| Module sử dụng output | `retrieval.index` (đọc `text_for_embedding` + 8 field metadata), `retrieval.qa` (đọc metadata trả lời), `evaluation.testset` (chọn paper và ground truth), `observability.quality` (đọc `summary_chars`, `age_days`, `paper_id`), `pipelines.phase1` và `pipelines.corruption_flow` |
| Điều kiện lỗi cần xử lý | Abstract bọc tag JATS và HTML entity; `published` rỗng hoặc không parse được; title/summary quá ngắn; `paper_id` trùng; cùng paper khác DOI (trùng title); authors/categories có phần tử rỗng hoặc trùng khác hoa thường; CSV stringify cột kiểu list |

### Cách xác minh

```bash
uv run python script/validate_clean_contract.py
```

- **Kết quả mong đợi:** Toàn bộ check PASS, gồm cả các sample record cố tình vi phạm từng rule một.
- **Kết quả thực tế:** 29/29 PASS. 19 raw record → 13 clean, loại đúng 6 record vì 6 lý do khác nhau; corrupted giữ nguyên 16 cột; corruption chạy hai lần cho kết quả giống hệt.
- **Artifact/log:** Output stdout, không cần artifact ngoài — script dùng sample record tổng hợp nên chạy được cả khi Crossref chưa có dữ liệu.

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** Tôi viết `assert_clean_contract()` làm gate chặn trước khi build index. Nhưng đọc `corruption_flow.py:20` thì thấy `_validate_clean_dataframe` được gọi cho **cả corrupted dataset**. Mà corrupted thì cố ý có `paper_id` trùng và summary rỗng — đó chính là mục đích của nó.
- **Các phương án đã cân nhắc:**
  1. Gate nghiêm cho mọi state. Đơn giản nhất, nhưng sẽ chặn oan corruption flow ngay khi nó làm đúng việc của mình.
  2. Không gate corrupted, chỉ gate baseline. Corruption flow chạy được, nhưng nếu corruption lỡ phá schema thì không ai bắt được, index build hỏng và bảng so sánh vô nghĩa mà không rõ vì sao.
  3. Gate hai mức: schema áp cho mọi state, chất lượng chỉ áp cho state không nằm trong `LENIENT_STATES`.
- **Phương án đã chọn:** Phương án 3.
- **Lý do:** Ranh giới thật ở đây không phải "chặt hay lỏng" mà là **corruption được phép phá cái gì**. Nó được phép phá nội dung — đó là thí nghiệm. Nó không được phép phá schema — đó là hạ tầng để đo thí nghiệm. Tách hai mức làm ranh giới đó thành code chứ không nằm trong đầu người viết.
- **Bằng chứng quyết định phù hợp:** Test cả hai chiều. Ép corrupted qua mức strict thì gate chặn đúng: `State 'baseline' vi pham contract: 2 row trung paper_id; 3 row co summary rong`. Còn khi tôi cố tình làm rỗng `text_for_embedding` rồi chạy ở mức lenient thì gate vẫn bắt: `1 row co text_for_embedding rong`. Corruption flow chạy trọn vẹn không bị chặn oan lần nào.

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng/lỗi nguyên văn:** Không phải exception. Tôi phát hiện khi so diff commit của Tâm:

  ```diff
  -    "csv": "/Users/stephhoang/Documents/VinUNI/K4_Day10_.../data/clean/papers_clean.csv",
  +    "csv": "F:\\AIIA\\K4_Day10_Spiderman_Data-Pipeline-Data-Observability\\data\\clean\\papers_clean.csv",
  ```

- **Lệnh hoặc bước tái hiện:** `uv run python script/run_phase1.py` rồi mở `data/quality/cleaning_log.json`, xem khối `outputs`.
- **Nguyên nhân gốc:** `phase1._save_clean_artifacts` gọi `write_cleaning_log` mà **không truyền `project_dir`**, nên hàm `_relative_to` rơi vào nhánh fallback trả nguyên đường tuyệt đối. Điều làm tôi suýt bỏ sót: đường gọi qua `write_clean_artifacts` thì có truyền nên luôn đúng — chỉ đường đi qua pipeline mới hỏng, mà đó lại là đường cả nhóm thực sự dùng. Tôi test hàm ở đường đúng nên không thấy gì.
- **Cách xử lý:** Thêm hằng `PROJECT_ROOT` suy từ vị trí module làm mốc mặc định, và trả `as_posix()` để Windows lẫn macOS cho ra cùng một chuỗi.
- **Cách xác minh sau khi sửa:** Gọi cả hai đường, đều cho `{"csv": "data/clean/papers_clean.csv", "json": "data/clean/papers_clean.json", "canonical": "json"}`. `validate_clean_contract.py` vẫn 29/29 PASS.
- **Điều học được:** Tham số optional có giá trị mặc định "an toàn" là cái bẫy. `project_dir=None` trông vô hại nhưng nó tạo ra hai hành vi khác nhau cho cùng một hàm, và caller nào quên truyền thì im lặng nhận hành vi tệ hơn. Nếu một hàm chỉ có một hành vi đúng, đừng để caller chọn. Bài học thứ hai: lỗi này chỉ lộ ra khi có người chạy trên hệ điều hành khác — tôi test một mình trên macOS thì vĩnh viễn không thấy.

## 7. Hiểu biết về luồng end-to-end

**Câu trả lời:**

**1. Dữ liệu đi từ Crossref đến vector index như thế nào?** `fetch_source_records` gọi `https://api.crossref.org/works` với query và filter `from-pub-date:<hôm nay − 180 ngày>,has-abstract:true`, lưu raw response **trước khi parse** rồi mới parse thành `PaperRecord`. Lưu trước khi parse là điểm mấu chốt của lineage: nếu parse sai thì vẫn còn bản gốc để dò lại. Cleaning nhận list đó, chuẩn hóa text, parse date, loại row không đạt, dedupe, sinh 5 cột derived trong đó có `text_for_embedding`. `LocalEmbeddingIndex.build` embed đúng cột đó bằng MiniLM và nạp vào ChromaDB với space cosine, kèm 8 field metadata.

**2. Evaluation set và ground-truth document IDs dùng để đo retrieval/answer quality ra sao?** Mỗi sample có `ground_truth_doc_ids` là `paper_id` của paper mà câu hỏi hỏi về. Đo retrieval bằng cách xem `paper_id` nào nằm trong top-k trả về — nếu có ID đúng thì `retrieval_hit = True`. Đo answer bằng token F1 giữa câu trả lời và ground truth, cộng điểm judge. Hai thứ này tách nhau và tách nhau là có lý do: agent có thể retrieve đúng document mà vẫn trả lời sai, điều này xảy ra thật trong bài (xem mục 8).

**3. Quality checks khác freshness monitoring ở điểm nào?** Quality checks hỏi "dữ liệu này có đúng không" — đủ field, không null, không trùng, độ dài hợp lệ. Freshness hỏi "dữ liệu này có còn mới không" — một dataset hoàn toàn hợp lệ vẫn có thể toàn paper từ 2018. Trong bài, `duplicate_rows` và `blank_summary` bị quality bắt, còn `stale_published` thì quality hoàn toàn không thấy, chỉ freshness bắt được qua `age_days`.

**4. Vì sao phải dùng cùng test set cho baseline, corrupted và repaired?** Nếu sinh lại test set từ corrupted dataset thì ground truth cũng hỏng theo, và metrics sẽ đo "agent trả lời đúng dữ liệu sai" thay vì đo mức suy giảm. Giữ một test set duy nhất sinh từ dữ liệu sạch biến nó thành biến đối chứng: mọi thay đổi trong metrics chỉ có thể đến từ corpus. Đây cũng là lý do repair phải chạy lại từ raw chứ không sửa tay answers hay metrics.

**5. Repair được xem là thành công dựa trên artifact và metric nào?** Ba lớp bằng chứng. Dataset: `papers_clean_repaired.json` có fingerprint SHA-256 trùng bản rebuild từ raw. Observability: `repaired_quality.json` và `repaired_freshness_report.json` đều PASS, 0 row stale, `paper_id` unique trở lại. Agent: cả bốn metric về **đúng bằng** baseline. Riêng cái "đúng bằng, không hơn không kém" mới là dấu hiệu repair đúng — nếu cao hơn baseline thì tức là có gì đó bị sửa tay.

## 8. Phân tích kết quả

### Metrics chính

| Metric/signal | Baseline | Corrupted | Repaired | Nhận xét của cá nhân |
| --- | ---: | ---: | ---: | --- |
| `retrieval_hit_rate` | 1.000 | 0.833 | 1.000 | Giảm ít nhất trong nhóm metrics, vì chỉ nhóm paper bị xoá hẳn mới mất hit |
| `mean_token_f1` | 1.000 | 0.739 | 1.000 | Giảm mạnh nhất — nhiều loại corruption phá answer mà không phá retrieval |
| `judge_accuracy` | 1.000 | 0.722 | 1.000 | 20/72 câu bị chấm sai |
| `mean_judge_score` | 5.000 | 3.917 | 5.000 | |
| Quality checks | PASS | **FAIL** | PASS | Lật trạng thái nhờ `paper_id_unique` và `summary_length` |
| Freshness status | PASS (0 stale) | **FAIL** (5 stale) | PASS (0 stale) | |

### Kết luận từ số liệu

1. **`drop_latest_records` xoá 4 paper khỏi corpus → không quality check nào phát hiện → 12 câu hỏi liên quan rơi xuống `retrieval_hit_rate` 0.000 và token F1 0.023.** Đây là chuỗi nguy hiểm nhất trong cả bài, vì mắt xích giữa bị đứt: dữ liệu hỏng nhưng observability im lặng.
2. **Repair chạy lại `build_clean_dataframe` từ `data/raw/crossref_records.json` → `paper_id` unique và 0 row stale trở lại, quality và freshness đều về PASS → cả bốn metric về đúng bằng baseline.**

### Corruption nào ảnh hưởng rõ nhất và vì sao?

`drop_latest_records`, cách biệt rất xa. Tách theo từng loại (các tập row disjoint nên quy được trách nhiệm):

| Loại | Số câu | hit | token F1 | judge |
| --- | ---: | ---: | ---: | ---: |
| `drop_latest_records` | 12 | **0.000** | **0.023** | **0.000** |
| `stale_published` | 12 | 1.000 | 0.667 | 0.667 |
| `blank_summary` | 9 | 1.000 | 0.667 | 0.667 |
| `duplicate_rows` | 6 | 1.000 | 0.833 | 0.833 |
| `inject_noise` | 9 | 1.000 | 0.991 | 0.889 |
| `truncate_title` | 9 | 1.000 | **1.000** | 1.000 |
| Không bị đụng | 18 | 1.000 | 1.000 | 1.000 |

Lý do nó khác hẳn các loại còn lại: năm loại kia làm dữ liệu **sai**, còn nó làm dữ liệu **biến mất**. Không có cách nào retrieve một document không tồn tại. Các loại khác thì retrieval vẫn tìm đúng paper (hit 1.000), chỉ answer bị hỏng.

Nhóm 18 câu không bị đụng giữ nguyên 1.000 trên mọi metric — đây là nhóm đối chứng, xác nhận mức giảm đến từ corruption chứ không từ nhiễu đo đạc.

Điều đáng nói nhất: loại gây hại nặng nhất lại chính là loại **observability không nhìn thấy**. `row_count` chỉ kiểm tra `> 0` nên 24 → 22 row vẫn PASS. Nếu đây là hệ thống thật, người dùng sẽ nhận câu trả lời sai trong khi mọi dashboard đều xanh.

### Kết quả nào khác với kỳ vọng ban đầu?

**`truncate_title` không gây thiệt hại nào.** Tôi thiết kế nó để phá exact-title lookup, và trước khi có số liệu tôi đã viết vào báo cáo nhóm rằng nó sẽ làm metrics rơi mạnh. Số liệu bác bỏ: token F1 giữ nguyên 1.000.

Giả thuyết của tôi sau khi nhìn số: test set giữ title gốc còn corpus đã bị cắt title, nên `index.lookup()` trượt và rơi về semantic search — mà semantic search vẫn tìm đúng document. Tôi kiểm tra bằng cách đo riêng retrieval thuần ngữ nghĩa, bỏ hẳn nhánh exact lookup: recall@1 = 0.931 khi câu hỏi còn chứa title. Đúng như giả thuyết — đường tắt bị phá thì đường chính vẫn gánh được.

Tôi đã đính chính dự đoán sai này trong báo cáo nhóm thay vì để nguyên. Nó cũng làm nhẹ bớt một lo ngại khác mà tôi nêu trước đó: baseline tuy degenerate vì mọi câu hỏi đều đi đường tắt, nhưng retrieval ngữ nghĩa phía dưới không rỗng — nó thực sự hoạt động khi được gọi tới.

## 9. Điều học được và hướng cải thiện

### Ba điều quan trọng nhất

1. **Về data pipeline: contract nên đọc ngược từ nơi tiêu thụ, không thiết kế từ nơi sản xuất.** Tôi không tự nghĩ ra 16 cột. Tôi đọc `index._build_documents` và `qa._extract_answer` để xem hạ nguồn thực sự cần gì, rồi mới chốt schema. Nhờ vậy khi ghép module không phải sửa lại lần nào. Ngược lại, chỗ tôi làm sai — cleaning log ghi đường dẫn tuyệt đối — chính là chỗ tôi không nghĩ tới người tiêu thụ là ai (ở đây là git và máy của người khác).

2. **Về data quality/observability: một quality gate chỉ có giá trị nếu nó fail được.** Đọc code rồi gật đầu là chưa đủ. Tôi viết `audit_quality_gate.py` cho chính bộ check ăn corrupted data. Kết quả tốt (overall PASS → FAIL) nhưng đối chiếu **ngược** từ 6 loại corruption sang check thì lộ ra 3 loại không ai bắt được. Chiều xuôi "check này có chạy không" và chiều ngược "lỗi này có ai bắt không" cho hai câu trả lời rất khác nhau, và chiều ngược mới là chiều quan trọng.

3. **Về ảnh hưởng của data đến RAG agent: hỏng dữ liệu không làm agent im lặng, nó làm agent nói sai một cách tự tin.** Ví dụ rõ nhất trong `demo_three_states.py`: câu hỏi về ngày xuất bản, baseline trả `2026-08-01` đúng, corrupted trả `2026-04-06` — lấy ngày của một paper khác. Nó không nói "tôi không biết". Người dùng không có cách nào biết. Một ví dụ khác: paper bị blank summary vẫn có `retrieval_hit = True` nhưng answer rỗng — retrieve đúng không đảm bảo trả lời đúng.

### Nếu có thêm thời gian

Thêm ba check để bịt đúng ba khoảng trống đã đo được, theo thứ tự ưu tiên đúng bằng mức thiệt hại:

1. **Volume check so với lần chạy trước** — so `rows_out` trong `cleaning_log.json` với lần chạy gần nhất, fail nếu giảm quá một ngưỡng. Bịt `drop_latest_records`, loại gây hại nặng nhất.
2. **Check độ dài title tối thiểu** — bịt `truncate_title`.
3. **Check phân bố ký tự của summary** — tỉ lệ ký tự không phải chữ cái vượt ngưỡng thì fail. Bịt `inject_noise`.

Cách đo cải thiện đã có sẵn: chạy lại `uv run python script/audit_quality_gate.py`. Hiện tại nó báo 3/6 loại corruption không bắt được; sau khi thêm ba check phải ra 6/6. Đây là con số kiểm chứng được chứ không phải cảm nhận.

## 10. Cam kết của thành viên

- [x] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [x] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [x] Mọi kết luận về kết quả đều có artifact hoặc metric để đối chiếu.
- [x] Tôi không ghi "đã chạy thành công" cho phần chưa được kiểm chứng — dự đoán sai về `truncate_title` được giữ lại và đính chính bằng số liệu thay vì xoá đi.
- [x] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [x] Báo cáo này không phải bản sao nguyên văn của báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Hoàng Công Thành
**Ngày xác nhận:** 2026-08-06
