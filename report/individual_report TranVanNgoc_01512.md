# Member Role Report — Day 10: Data Pipeline & Data Observability

## 1. Thông tin cá nhân

| Thông tin | Nội dung |
| --- | --- |
| Họ và tên | Trần Văn Ngọc |
| MSSV | 2A202601512 |
| Khóa/Lớp | K4 |
| Tên nhóm | SPIDERMAN |
| Vai trò chính | RAG & Agent owner (Role 4) |
| Repository | https://github.com/stephhoang30/K4_Day10_Spiderman_Data-Pipeline-Data-Observability |
| Ngày hoàn thành | 2026-08-06 |

## 2. Vai trò và phạm vi công việc

### Phần việc sở hữu

| Module/deliverable | File/hàm phụ trách | Input nhận vào | Output bàn giao | Trạng thái |
| --- | --- | --- | --- | --- |
| Vector index | `src/retrieval/index.py` — `LocalEmbeddingIndex.build/load/search/lookup` | Clean DataFrame có `paper_id`, `title`, `text_for_embedding` và metadata | Chroma collections và embedding manifests cho baseline/corrupted/repaired | Hoàn thành |
| Agent và QA | `src/retrieval/agent.py`, `src/retrieval/qa.py` | Câu hỏi, `Settings`, local index | Semantic search, exact lookup, `AnswerResult` và agent response | Hoàn thành |
| Embedding backend | `src/retrieval/embeddings.py` — `MiniLMEmbeddings` | `text_for_embedding` hoặc search query | Vector chuẩn hóa từ `sentence-transformers/all-MiniLM-L6-v2` | Hoàn thành / dùng trong index |
| Artifact RAG | `data/embeddings/papers_embeddings*.json`, `data/chroma/` | Clean dataset của từng state | Manifest và collection `papers-baseline`, `papers-corrupted`, `papers-repaired` | Hoàn thành |

Phần việc này nhận clean data từ Role 3 và được Role 5/pipeline dùng để tạo answers, metrics và báo cáo. Tôi không nhận ownership cho cleaning, test set, metrics, quality/freshness hay report generator.

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động | Thành viên/module được hỗ trợ | Kết quả |
| --- | --- | --- |
| Tích hợp sau Git pull | Toàn bộ pipeline | Sửa manifest index để không phụ thuộc đường dẫn tuyệt đối của máy khác; index load lại được trên Windows. |
| Smoke test end-to-end RAG | Pipeline evaluation | Xác minh baseline index có 24 documents, semantic search và exact lookup trả về đúng paper; agent OpenAI trả đúng tác giả của paper Hi-RAG. |

## 3. Kết quả theo vai trò

| Nhiệm vụ đã thực hiện | File/hàm/artifact liên quan | Kết quả bàn giao | Cách xác minh |
| --- | --- | --- | --- |
| Build baseline index | `LocalEmbeddingIndex.build()`; `data/embeddings/papers_embeddings.json` | Collection `papers-baseline` gồm 24 documents | `LocalEmbeddingIndex.load(...).collection.count()` trả `24` |
| Semantic search và exact lookup | `LocalEmbeddingIndex.search()` / `.lookup()` | Query về hierarchical tool selection trả paper `10.1111/exsy.70341`; lookup DOI trả đúng title | Smoke test local trên Chroma |
| Agent factual QA | `build_agent()` / `run_agent_question()` | Agent trả lời tác giả Hi-RAG là Wei Tian và Yuhao Zhou | Một câu hỏi OpenAI có dùng tool retrieval |
| Tách ba state index | `papers_embeddings.json`, `papers_embeddings_corrupted.json`, `papers_embeddings_repaired.json` | Có manifest riêng cho baseline, corrupted và repaired | Kiểm tra các file trong `data/embeddings/` |

Output cụ thể: `data/embeddings/papers_embeddings_corrupted.json` và `data/embeddings/papers_embeddings_repaired.json` cho phép evaluation dùng collection tách biệt, không ghi đè baseline.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

RAG chỉ trả lời đúng khi corpus đã được vector hóa, truy vấn được và giữ đúng metadata của paper. Ngoài ra, ba trạng thái baseline/corrupted/repaired phải dùng collection riêng để so sánh công bằng; nếu ghi đè baseline thì metrics không còn ý nghĩa.

### Cách triển khai

`LocalEmbeddingIndex.build()` chuyển từng row clean thành document gồm `record_id`, `paper_id`, title, content và metadata. `MiniLMEmbeddings` tạo vector normalized; ChromaDB lưu vector theo collection. Search embed query rồi truy vấn top-k theo cosine distance. Exact lookup dùng map theo `paper_id` và title để hỗ trợ câu hỏi có title đầy đủ.

`qa.answer_question()` ưu tiên exact-title match nếu title nằm trong dấu nháy, sau đó dedupe kết quả và trả lời từ metadata phù hợp với question type: authors, published date, categories hoặc câu đầu summary. Agent có hai tools: `semantic_search_papers` và `lookup_paper`; prompt yêu cầu dùng tool trước khi trả lời factual.

Tôi bổ sung guard cho DataFrame rỗng, schema thiếu, query rỗng, `top_k` không hợp lệ và manifest chưa tồn tại. Manifest chỉ lưu path tương đối `data/chroma`; lúc load, code dùng `settings.paths.chroma_dir` thay vì tin vào path tuyệt đối trong manifest.

### Input, output và contract

| Thành phần | Mô tả |
| --- | --- |
| Input | Clean DataFrame có `paper_id`, `title`, `text_for_embedding`, `published`, `authors_joined`, `categories_joined`, `summary`, `abs_url`, `pdf_url` |
| Output | ChromaDB local, manifest JSON, `SearchResult` hoặc `AnswerResult` |
| Module phụ thuộc | `core.config`, `core.utils`, `sentence-transformers`, `chromadb`, `langchain` |
| Module sử dụng output | `evaluation.testset`, `evaluation.metrics`, `pipelines.phase1`, `pipelines.corruption_flow` |
| Điều kiện lỗi cần xử lý | DataFrame rỗng, thiếu schema, index/manifest không tồn tại, query rỗng, collection không có document, provider/key LLM không hợp lệ |

### Cách xác minh

```powershell
uv run python script/run_phase1.py
uv run python script/run_corruption_flow.py
```

- **Kết quả mong đợi:** Mỗi state có manifest/collection riêng; retrieval và QA đọc được index của state đó.
- **Kết quả thực tế:** Có đủ ba manifests trong `data/embeddings/`; baseline và repaired metrics đạt 1.0 cho các metric headline, corrupted giảm đúng theo data corruption.
- **Artifact/log:** `data/embeddings/papers_embeddings*.json`, `data/results/*_answers.json`, `data/results/*_metrics.json`.

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** Manifest index được tạo trên máy khác có `persist_path` tuyệt đối kiểu macOS, không dùng được trực tiếp trên Windows.
- **Các phương án đã cân nhắc:** (1) giữ nguyên path tuyệt đối trong manifest; (2) sửa thủ công manifest ở từng máy; (3) lưu path tương đối và luôn lấy thư mục Chroma từ `Settings`.
- **Phương án đã chọn:** Phương án 3.
- **Lý do:** Portable giữa máy, không cần sửa artifact thủ công, và `config.py` trở thành nguồn path duy nhất.
- **Bằng chứng quyết định phù hợp:** Sau khi pull và rebuild, `LocalEmbeddingIndex.load()` mở được `papers-baseline`, collection count là 24 và semantic search trả đúng Hi-RAG.

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng/lỗi nguyên văn:** `git pull` bị chặn do local RAG artifacts chưa commit, đồng thời remote có `data/embeddings/papers_embeddings.json`; manifest remote chứa path `/Users/.../data/chroma`.
- **Lệnh hoặc bước tái hiện:** Pull repository trên Windows rồi load manifest đã tạo ở máy macOS.
- **Nguyên nhân gốc:** Manifest lưu đường dẫn tuyệt đối phụ thuộc máy; local worktree cũng có artifact index chưa được stash trước khi pull.
- **Cách xử lý:** Stash local work, pull/rebase, restore code; sửa `index.py` để persist path tương đối và load từ `settings.paths.chroma_dir`; rebuild baseline index từ clean data hiện tại.
- **Cách xác minh sau khi sửa:** `LocalEmbeddingIndex.load(settings)` thành công và `collection.count()` trả 24; smoke search trả paper dự kiến.
- **Điều học được:** Artifact metadata cần portable; path runtime phải do config của workspace quyết định, không nên hard-code từ máy tạo artifact.

## 7. Hiểu biết về luồng end-to-end

1. Crossref được fetch và parse thành `PaperRecord`, sau đó raw response/raw records được lưu. Cleaning chuẩn hóa, lọc và tạo `text_for_embedding`; index dùng text này để tạo MiniLM vectors rồi lưu ChromaDB.
2. Test set sinh câu hỏi từ clean data, mỗi câu có `ground_truth_doc_ids`. Evaluation so ID retrieved với ID ground truth để tính hit/rank, rồi so answer với ground truth để tính metric answer.
3. Quality checks kiểm tra contract như row count, null, duplicate và độ dài summary. Freshness monitoring tập trung vào `published`, `age_days` và số record stale theo ngưỡng 180 ngày.
4. Phải dùng cùng test set để metric khác biệt phản ánh chất lượng data/index, không phải vì tập câu hỏi thay đổi.
5. Repair thành công khi repaired clean/index/answers/metrics tồn tại, quality và freshness PASS, đồng thời metrics phục hồi gần baseline bằng chính test set đã khóa.

## 8. Phân tích kết quả

### Metrics chính

| Metric/signal | Baseline | Corrupted | Repaired | Nhận xét của cá nhân |
| --- | ---: | ---: | ---: | --- |
| `retrieval_hit_rate` | 1.0000 | 0.8333 | 1.0000 | Mất 12 điểm phần trăm khi data bị corrupt; repair phục hồi hoàn toàn. |
| `mean_token_f1` | 1.0000 | 0.7388 | 1.0000 | Summary rỗng/noise và title bị cắt làm answer giảm. |
| `judge_accuracy` | 1.0000 | 0.7222 | 1.0000 | Corruption làm nhiều answer không còn đúng; repaired quay về baseline. |
| `mean_judge_score` | 5.0000 | 3.9167 | 5.0000 | Chất lượng judged answer giảm rồi phục hồi. |
| Quality checks | PASS, 7/7 | FAIL, 3/7 fail | PASS, 7/7 | Corrupted fail uniqueness, summary length và freshness. |
| Freshness status | PASS, 0 stale | FAIL, 5 stale | PASS, 0 stale | Stale-date corruption được phát hiện và repair loại bỏ. |

1. Drop latest records, blank summary, noise, truncate title, stale date và duplicate row → quality/freshness FAIL (2 DOI duplicate, 3 short summaries, 5 stale rows) → retrieval hit rate giảm từ 1.0 xuống 0.8333 và mean token F1 giảm xuống 0.7388.
2. Re-run cleaning từ raw snapshot → repaired dataset có lại 24 rows, unique DOI và 0 stale rows → metrics headline quay về 1.0/5.0.

Corruption ảnh hưởng rõ nhất là tổng hợp drop record, summary rỗng/noise và title truncate vì nó đồng thời làm mất document, giảm chất lượng content embedding và phá exact-title lookup.

Kết quả cần diễn giải thận trọng: baseline đạt 1.0 do test set được sinh từ chính clean dataset và QA ưu tiên exact-title lookup. Đây là evidence tốt cho regression trong lab, chưa đủ để khẳng định RAG tổng quát tốt trên câu hỏi mới.

## 9. Điều học được và hướng cải thiện

### Ba điều quan trọng nhất

1. Index không chỉ lưu vector; metadata và contract clean quyết định khả năng trả lời authors/date/summary đúng.
2. Data quality issue có thể không làm chương trình crash nhưng vẫn làm retrieval/answer metric giảm, nên cần quality và freshness artifact riêng.
3. So sánh RAG chỉ công bằng khi tách collection/path theo state và giữ nguyên test set, top-k, evaluator.

### Nếu có thêm thời gian

Thêm test tự động cho `LocalEmbeddingIndex` bằng Chroma temporary directory và thêm một test cross-platform cho manifest. Có thể đo bằng việc load cùng manifest trên Windows/macOS/Linux mà không sửa tay path. Tôi cũng sẽ bổ sung một test set độc lập, không sinh trực tiếp từ field dùng để trả lời, để giảm nguy cơ metric baseline quá lạc quan.

## 10. Cam kết của thành viên

- [x] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [x] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [x] Mọi kết luận về kết quả đều có artifact hoặc metric để đối chiếu.
- [x] Tôi không ghi “đã chạy thành công” cho phần chưa được kiểm chứng.
- [x] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [x] Báo cáo này không phải bản sao nguyên văn của báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Trần Văn Ngọc  
**Ngày xác nhận:** 2026-08-06
