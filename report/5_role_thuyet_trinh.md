# Bao cao hoc bai cho 5 role thuyet trinh

Muc tieu cua file nay: moi role nam duoc phan minh phu trach, noi duoc pipeline chay qua file nao, sinh artifact nao, va so lieu nao chung minh pipeline dung.

## Luong tong quat

```text
Crossref API
  -> raw response + raw records
  -> cleaned schema
  -> MiniLM embeddings + Chroma index
  -> QA test set + evaluation metrics
  -> quality/freshness reports
  -> corrupted data
  -> repaired data from raw
  -> comparison report
```

Mot cau de mo bai: repo nay mo phong data pipeline cho RAG tren paper tu Crossref; diem chinh khong phai chi la crawl du lieu, ma la chung minh du lieu sach, du lieu loi, va du lieu repair anh huong truc tiep den ket qua tra loi.

## So lieu chung can nho

| State | Quality | Freshness | retrieval_hit_rate | mean_token_f1 | judge_accuracy | mean_judge_score |
|---|---|---|---:|---:|---:|---:|
| baseline | PASS, 8/8 checks | PASS, 0 stale rows | 1.0 | 1.0 | 1.0 | 5 |
| corrupted | FAIL, 5/8 checks | FAIL, 5 stale rows | 0.8333 | 0.7388 | 0.7222 | 3.9167 |
| repaired | PASS, 8/8 checks | PASS, 0 stale rows | 1.0 | 1.0 | 1.0 | 5 |

Giai thich ngan: baseline tot vi du lieu sach va lookup theo exact title tim dung paper. Corrupted lam hong duplicate, summary, freshness va title nen metric giam. Repaired build lai tu raw records nen quay ve muc baseline.

## Role 1 - Cau hinh, orchestration, release

Trach nhiem: noi duoc pipeline lay setting tu dau, chay theo thu tu nao, va khi nao duoc xem la release duoc.

File can nam:

| File | Noi dung can noi |
|---|---|
| `src/core/config.py` | Dinh nghia `Settings`, `Paths`, env LLM, model embedding, Crossref query, top_k, threshold freshness 180 ngay. |
| `src/pipelines/phase1.py` | Orchestration baseline: raw -> clean -> index -> test set -> metrics -> quality/freshness -> report. |
| `src/pipelines/corruption_flow.py` | Orchestration corruption/repaired: can baseline truoc, tao corrupted, evaluate, repair tu raw, compare. |
| `script/run_phase1.py` | Entrypoint chay baseline. |
| `script/run_corruption_flow.py` | Entrypoint chay corruption flow sau baseline. |

Thu tu phase 1:

1. `load_settings()` load path, env, query va threshold.
2. Lay raw records tu file co san hoac goi Crossref neu bat refresh.
3. Clean dataframe va validate clean contract.
4. Build Chroma index, tao test set neu chua co, evaluate.
5. Ghi quality, freshness va `data/reports/phase1_report.md`.

Thu tu corruption flow:

1. Kiem tra baseline artifacts da co.
2. Load clean baseline roi tao corrupted dataset.
3. Evaluate corrupted voi collection rieng.
4. Repair bang cach clean lai tu `data/raw/crossref_records.json`.
5. Ghi `data/reports/corruption_report.md`.

Release checklist de noi khi thuyet trinh:

1. Chay `uv run python script/run_phase1.py`.
2. Chay `uv run python script/run_corruption_flow.py`.
3. Chay `uv run pytest`.
4. Kiem tra `data/results`, `data/quality`, `data/reports` co artifact moi.
5. Khong commit `.env` hay API key.

Cau noi mau: "Role 1 dam bao pipeline co mot duong chay ro rang. Config gom tat ca duong dan va tham so; pipeline chi dieu phoi, moi module con lam mot viec rieng."

## Role 2 - Crossref va raw lineage

Trach nhiem: noi duoc raw data den tu dau, duoc parse the nao, va vi sao co lineage de repair.

File can nam:

| File | Noi dung can noi |
|---|---|
| `src/ingestion/crossref.py` | Goi Crossref REST API, parse payload thanh `PaperRecord`, ghi raw artifacts. |
| `data/raw/crossref_response.json` | Ban response goc tu API, dung de audit source. |
| `data/raw/crossref_records.json` | Ban raw da chuan hoa thanh list records, dung lai cho clean va repair. |
| `src/core/config.py` | Chua query, filter, rows va flag refresh source. |

Logic chinh trong `crossref.py`:

1. `fetch_source_records()` goi `https://api.crossref.org/works`.
2. Params lay tu config: query, filter theo publication date, rows = 24.
3. Retry toi da 3 lan neu gap `429` hoac `503`.
4. `parse_crossref_payload()` bo record thieu DOI, title, abstract.
5. Ghi ca response goc va records da parse.

Raw lineage la gi: pipeline khong chi giu clean output, ma giu ca raw source. Khi corrupted dataset bi loi, repair khong doan lai bang tay ma build lai clean dataframe tu `data/raw/crossref_records.json`.

Cau noi mau: "Raw lineage la duong lui cua pipeline. Khi clean data bi corrupt, chung ta co the quay lai snapshot raw da luu va clean lai."

## Role 3 - Clean schema, corruption, repair

Trach nhiem: noi duoc clean data phai co schema nao, corruption pha gi, va repair khoi phuc bang cach nao.

File can nam:

| File | Noi dung can noi |
|---|---|
| `src/ingestion/cleaning.py` | Clean raw records, tao derived columns, validate clean contract. |
| `src/ingestion/corruption.py` | Tao 6 loai loi du lieu co seed co dinh. |
| `src/pipelines/corruption_flow.py` | Repair bang cach rebuild clean dataframe tu raw records. |
| `data/clean/papers_clean*.json` | 3 state du lieu: baseline, corrupted, repaired. |
| `data/results/corruption_log.json` | Log cac loi da inject vao corrupted data. |

Clean schema can nho:

| Nhom cot | Cot tieu bieu | Ly do |
|---|---|---|
| Identity | `paper_id`, `title` | De lookup va dedupe. |
| Noi dung | `summary`, `text_for_embedding` | De embed va tra loi cau hoi summary. |
| Metadata | `authors_joined`, `categories_joined`, `published` | De tra loi authors/date/categories. |
| Observability | `summary_chars`, `age_days` | De check quality va freshness. |
| Link | `abs_url`, `pdf_url` | De truy vet ve paper. |

Rule clean chinh:

1. Drop record thieu `paper_id`.
2. Drop title ngan hon 10 ky tu.
3. Drop summary ngan hon 40 ky tu.
4. Drop published date khong parse duoc.
5. Dedupe theo `paper_id` va title lowercase.

6 loai corruption:

| Loi | Anh huong |
|---|---|
| `drop_latest_records` | Mat paper moi, anh huong volume va freshness. |
| `blank_summary` | Summary rong, answer summary sai. |
| `inject_noise` | Noi dung nhieu, embedding kem on dinh. |
| `truncate_title` | Pha exact-title lookup. |
| `stale_published` | Lam date cu, freshness fail. |
| `duplicate_rows` | `paper_id` khong unique. |

Repair: khong sua corrupted dataframe tung dong. Pipeline load raw records, chay lai `build_clean_dataframe()`, ghi repaired clean data, build index repaired, evaluate lai.

Cau noi mau: "Corruption duoc tao co chu dich de do anh huong. Repair dung raw lineage nen ket qua repaired quay ve PASS va metric quay ve 1.0."

## Role 4 - MiniLM, Chroma, search, lookup

Trach nhiem: noi duoc corpus duoc embed the nao, Chroma luu gi, va QA lay answer bang search/lookup ra sao.

File can nam:

| File | Noi dung can noi |
|---|---|
| `src/retrieval/embeddings.py` | Wrapper `MiniLMEmbeddings` dung SentenceTransformer. |
| `src/retrieval/index.py` | Build/load Chroma index, search semantic, lookup exact. |
| `src/retrieval/qa.py` | Tra loi cau hoi bang retrieved top result va metadata. |
| `src/retrieval/agent.py` | LangChain agent co 2 tool: semantic search va lookup paper. |
| `src/retrieval/llm.py` | Build LLM provider khi can agent/LLM judge. |

MiniLM:

1. Model trong config la `sentence-transformers/all-MiniLM-L6-v2`.
2. `embed_documents()` embed toan bo `text_for_embedding`.
3. `embed_query()` embed cau hoi.
4. Embedding duoc normalize de dung cosine space.

Chroma:

1. `LocalEmbeddingIndex.build()` tao documents tu clean dataframe.
2. Moi document co `record_id`, `paper_id`, `title`, `content`, `metadata`.
3. Collection nam trong `data/chroma`, ten collection tach theo baseline/corrupted/repaired.
4. Manifest ghi vao `data/embeddings/papers_embeddings*.json`.
5. Search lay top_k, score = `1 - distance`.

Search va lookup khac nhau:

| Cach tim | Dung khi nao | Diem manh |
|---|---|---|
| `search(query)` | Cau hoi mo, can semantic similarity | Tim gan dung theo noi dung. |
| `lookup(value)` | Co exact `paper_id` hoac exact title | Tra ve dung paper neu title/ID khop. |

Trong `qa.py`, cau hoi co title trong dau nhay se lookup exact truoc, roi chen ket qua exact len dau danh sach retrieved. Do test set sinh cau hoi theo exact title, baseline dat 1.0. Khi corruption truncate title, lookup bi pha nen retrieval va answer giam.

Cau noi mau: "MiniLM bien text thanh vector, Chroma tim vector gan nhat, con lookup exact giup cau hoi theo title lay dung paper. Corruption cat title se pha chinh co che nay."

## Role 5 - Test set, metrics, quality, freshness, reports

Trach nhiem: noi duoc pipeline duoc cham bang cau hoi nao, metric nao, quality check nao, va report tong hop o dau.

File can nam:

| File | Noi dung can noi |
|---|---|
| `src/evaluation/testset.py` | Tao test set deterministic tu clean dataframe. |
| `src/evaluation/metrics.py` | Evaluate retrieval, answer, judge, optional Ragas. |
| `src/observability/quality.py` | Data quality checks va freshness report. |
| `src/observability/reporting.py` | Sinh Markdown baseline va corruption comparison. |
| `tests/test_evaluation.py` | Test cho test set, metrics, quality, freshness, reports. |

Test set:

1. Sort theo `paper_id` de deterministic.
2. Moi paper tao cau hoi date neu co `published`.
3. Tao cau hoi authors neu co `authors_joined`.
4. Tao cau hoi summary neu co `summary`.
5. Tao cau hoi categories neu co `categories_joined`.

Artifact hien tai: `data/eval/test_set.json` co 72 samples. Moi 24 paper tao 3 cau hoi: authors, date, summary. Categories khong co vi corpus hien tai thieu category.

Metrics can giai thich:

| Metric | Y nghia de noi |
|---|---|
| `retrieval_hit_rate` | Ti le cau hoi retrieve duoc dung ground-truth paper trong top_k. |
| `mean_token_f1` | Do overlap token giua answer va ground truth, chu yeu huu ich cho summary. |
| `judge_accuracy` | Ti le answer duoc judge xem la dung. Mac dinh la deterministic judge. |
| `mean_judge_score` | Diem trung binh 1-5 cua judge. |

Quality checks hien co:

| Check | Muc dich |
|---|---|
| `row_count` | Data khong rong. |
| `paper_id_not_null` | ID khong null/rong. |
| `paper_id_unique` | Khong trung paper_id. |
| `title_not_null` | Title khong rong. |
| `summary_length` | Summary toi thieu 40 ky tu. |
| `categories_coverage` | Category optional nen warning, khong fail. |
| `age_days_valid` | Age parse duoc va khong am. |
| `freshness` | Khong co stale/invalid rows. |

Freshness:

1. Threshold la 180 ngay trong config.
2. Baseline: latest `2026-08-01`, oldest `2026-02-12`, stale rows = 0, PASS.
3. Corrupted: oldest bi lui ve `2018-03-17`, stale rows = 5, FAIL.
4. Repaired: quay lai latest `2026-08-01`, oldest `2026-02-12`, stale rows = 0, PASS.

Reports:

| Report | Noi dung |
|---|---|
| `data/reports/phase1_report.md` | Source summary, evaluation metrics, quality, freshness cua baseline. |
| `data/reports/corruption_report.md` | So sanh baseline/corrupted/repaired va recovery. |

Cau noi mau: "Role 5 la nguoi bien pipeline thanh bang chung. Neu chi co code chay xong thi chua du; metrics, quality, freshness va report moi cho thay du lieu loi lam RAG giam chat luong va repair co tac dung."

## Artifact map de ca nhom nho

| Thu muc/file | Role chinh | Dung de chung minh |
|---|---|---|
| `data/raw/crossref_response.json` | Role 2 | Source goc tu Crossref. |
| `data/raw/crossref_records.json` | Role 2, Role 3 | Raw snapshot dung cho clean va repair. |
| `data/clean/papers_clean*.json` | Role 3 | 3 state baseline/corrupted/repaired. |
| `data/embeddings/papers_embeddings*.json` | Role 4 | Index manifest va document metadata. |
| `data/results/*_metrics.json` | Role 5 | Metric so sanh chat luong QA/RAG. |
| `data/quality/*_quality.json` | Role 5 | Data quality va freshness status. |
| `data/reports/*.md` | Role 1, Role 5 | Bao cao cuoi de release/thuyet trinh. |

## Cach chia bai noi 5 phut

| Phut | Nguoi noi | Noi dung |
|---:|---|---|
| 0-1 | Role 1 | Mo pipeline, config, orchestration, command chay. |
| 1-2 | Role 2 | Crossref, raw artifacts, lineage. |
| 2-3 | Role 3 | Clean schema, corruption, repair. |
| 3-4 | Role 4 | MiniLM, Chroma, search, lookup, vi sao corrupted lam metric giam. |
| 4-5 | Role 5 | Test set, metrics, quality/freshness, ket qua 3 state. |

Ket bai: baseline va repaired PASS voi metric 1.0; corrupted FAIL quality/freshness va metric giam. Do la bang chung rang data observability phat hien duoc loi du lieu truoc khi RAG tra loi sai.
