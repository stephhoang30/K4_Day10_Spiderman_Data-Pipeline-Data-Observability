# Kịch bản thuyết trình — Hoàng Công Thành (Role 3)

> Phần Cleaning & Corruption, khoảng **7 phút** nói + **3 phút** demo. Mọi con số trong script đều lấy từ artifact thật trong `data/`, đã verify lúc 2026-08-06. Nếu chạy lại pipeline trước buổi trình bày thì kiểm tra lại bằng `uv run python script/demo_three_states.py`.

---

## 0. Chuẩn bị (làm trước khi lên, 2 phút)

```bash
uv run python script/demo_three_states.py    # xác nhận artifact còn đủ
cd web && npm run dev                        # mở dashboard, để sẵn tab
```

- Mở sẵn 2 cửa sổ: **dashboard** (`localhost:3000`) và **terminal** đã chạy sẵn demo, cuộn lên đầu.
- Phóng to terminal cho chữ đủ lớn nhìn từ cuối phòng.
- Mở sẵn `data/results/corruption_log.json` ở tab thứ ba, phòng khi có người hỏi bằng chứng.

**Một câu để tự nhắc trước khi mở miệng:** phần mình không phải "em đã viết hàm gì", mà là **"dữ liệu xấu làm agent nói sai, và đây là bằng chứng"**.

---

## 1. Mở đầu — đặt vấn đề (45 giây)

> *Chiếu: trang chủ dashboard, sơ đồ pipeline*

"Phần của em là hai khâu giữa của pipeline: **làm sạch dữ liệu**, và **chủ động phá dữ liệu** để đo xem chất lượng dữ liệu ảnh hưởng thế nào tới câu trả lời của agent.

Câu hỏi em muốn trả lời hôm nay rất đơn giản: *nếu dữ liệu trong hệ thống RAG bị hỏng, người dùng có biết không?*

Câu trả lời ngắn là **không**. Và đó mới là vấn đề."

---

## 2. Clean contract — 90 giây

> *Chiếu: trang `/clean`*

"Đầu vào của em là 24 bài báo lấy từ Crossref. Đầu ra phải là bảng mà ChromaDB và agent dùng được ngay, không phải đoán.

Em **không tự thiết kế schema theo ý mình**. Em đọc ngược từ code của các bạn khác: `index._build_documents` đẩy 8 field vào Chroma metadata, mà Chroma chỉ nhận kiểu vô hướng — nên list tác giả không đi thẳng vào được, phải có cột `authors_joined`. Rồi `qa._extract_answer` cho thấy agent trả lời câu hỏi về tác giả và ngày bằng cách đọc **thẳng** metadata đó.

Từ hai chỗ ấy suy ra 16 cột bắt buộc. Nhờ đọc ngược từ nơi tiêu thụ nên lúc ghép module không phải sửa lại lần nào."

> *Nếu còn thời gian, thêm chi tiết này — nó cụ thể và dễ nhớ:*

"Một ví dụ nhỏ về chuyện làm sạch quan trọng thế nào. Crossref trả abstract bọc trong tag XML. Sau khi bóc tag thì còn sót lại chữ `Abstract` ở đầu — 8 trên 24 bài bị vậy. Nghe thì vặt vãnh, nhưng câu trả lời cho câu hỏi *tóm tắt* chính là câu đầu tiên của abstract. Để nguyên thì mọi ground truth đều bắt đầu bằng rác."

---

## 3. Corruption — 90 giây

> *Chiếu: trang `/corrupt`, bảng 6 loại*

"Em tạo 6 loại lỗi, mỗi loại nhắm một pillar observability khác nhau: xoá bài mới nhất, làm rỗng tóm tắt, chèn nhiễu, cắt cụt tiêu đề, đẩy ngày về quá khứ, và nhân bản dòng.

Hai quyết định thiết kế đáng nói.

**Thứ nhất, các tập dòng bị hại không chồng lên nhau.** Nhờ vậy lát nữa em quy được trách nhiệm cho *từng loại*, thay vì chỉ nói chung chung 'corruption làm giảm chất lượng'.

**Thứ hai, seed cố định.** Nếu corruption ngẫu nhiên thì lần chạy sau ra số khác, mà số khác thì bảng so sánh không còn là bằng chứng nữa.

Và corruption chỉ được phá **nội dung**, không được phá **schema** — vì schema là hạ tầng để đo thí nghiệm. Em cài một gate hai mức để ép đúng ranh giới đó."

---

## 4. Kết quả — 2 phút

> *Chiếu: trang `/compare`*

"Cùng một bộ 72 câu hỏi cho cả ba trạng thái. Đây là điểm quan trọng: test set sinh từ dữ liệu sạch và **giữ nguyên**. Nếu sinh lại test set từ dữ liệu hỏng thì ground truth cũng hỏng theo, và ta sẽ đo nhầm 'agent trả lời đúng dữ liệu sai'.

Kết quả: dữ liệu hỏng kéo hit rate từ 1.0 xuống 0.833, token F1 xuống 0.739, judge accuracy xuống 0.722. Repair đưa cả bốn chỉ số về **đúng bằng** baseline.

Riêng chữ *đúng bằng* mới là dấu hiệu repair làm thật. Nếu cao hơn baseline thì tức là có gì đó bị sửa tay."

> *Chuyển sang biểu đồ tách theo loại corruption*

"Giờ đến phần thú vị. Vì các tập dòng không chồng nhau nên tách được:

`drop_latest_records` — xoá 4 bài — kéo 12 câu hỏi liên quan xuống hit rate **0.000**, token F1 **0.023**. Thảm khốc.

Còn `truncate_title` — cắt cụt tiêu đề — token F1 vẫn **1.000**. Không thiệt hại gì.

Nhóm 18 câu không bị đụng giữ nguyên 1.000 mọi chỉ số. Đó là nhóm đối chứng, xác nhận mức giảm đến từ corruption chứ không từ nhiễu."

---

## 5. Ba điều đáng nhớ — 2 phút

> Đây là phần khán giả sẽ nhớ. Nói chậm lại.

### 5.1 Loại gây hại nhất lại là loại observability không nhìn thấy

> *Chiếu: bảng quality check, cột corrupted*

"Bộ data quality có 8 check. Khi cho nó ăn dữ liệu hỏng, tổng thể lật từ PASS sang FAIL — tốt, tức là nó không phải bù nhìn.

Nhưng em soi **ngược lại**: từ 6 loại corruption sang xem loại nào có check bắt được. Kết quả là **3 trên 6 loại không ai bắt được** — trong đó có `drop_latest_records`, đúng cái gây hại nặng nhất.

Lý do rất tầm thường: check `row_count` chỉ kiểm tra *lớn hơn 0*. Mất 2 dòng trên 24 thì vẫn PASS.

Nếu đây là hệ thống thật, người dùng nhận câu trả lời sai trong khi mọi dashboard đều xanh."

### 5.2 Dữ liệu hỏng không làm agent im lặng — nó làm agent nói sai một cách tự tin

> *Chiếu: terminal, mục 3 của `demo_three_states.py`*

"Đây là ví dụ em thấy đáng sợ nhất trong cả bài.

Câu hỏi: bài báo này xuất bản ngày nào?

Baseline trả lời `2026-08-01` — đúng.
Sau khi bài đó bị xoá khỏi corpus, agent trả lời `2026-04-06`.

Nó **không** nói 'tôi không biết'. Nó lấy ngày của một bài khác và trả lời như thật. Người dùng không có cách nào biết là sai."

### 5.3 Retrieve đúng không đảm bảo trả lời đúng

> *Chiếu: mục 4 của demo*

"Ví dụ thứ hai. Bài này bị làm rỗng phần tóm tắt. Agent vẫn tìm **đúng** tài liệu — `retrieval_hit` bằng True. Nhưng câu trả lời rỗng.

Nghĩa là hai thứ này phải đo tách nhau. Retrieval tốt là điều kiện cần, không phải điều kiện đủ."

---

## 6. Chốt — 30 giây

"Tóm lại ba ý.

Một, dữ liệu xấu làm giảm chất lượng agent, và đo được bằng con số.

Hai, repair chạy lại từ nguồn raw phục hồi được đúng bằng ban đầu — chứng minh pipeline hồi phục từ lineage chứ không phải sửa tay kết quả.

Ba, và đây là điều em học được nhiều nhất: **loại lỗi nguy hiểm nhất là loại mà observability không nhìn thấy**. Bộ check của nhóm bắt được lỗi trùng lặp và lỗi thiếu nội dung, nhưng không bắt được mất dữ liệu. Nếu có thêm thời gian, việc đầu tiên em làm là thêm check so số dòng với lần chạy trước."

---

## 7. Câu hỏi có thể bị hỏi

**"Sao baseline lại đúng 1.000 hết? Có phải test set quá dễ không?"**

Đây là câu hỏi hay và đúng — nhóm em có ghi trong báo cáo, mục 11.2. Đúng là baseline degenerate. Nguyên nhân: mỗi câu hỏi nhúng nguyên tiêu đề bài báo trong dấu nháy, mà agent có nhánh tra cứu chính xác theo tiêu đề, nên nó đi đường tắt thay vì dùng semantic search.

Em đo riêng bằng cách bỏ nhánh đó: recall@1 là 0.931 khi câu hỏi còn tiêu đề, nhưng tụt xuống **0.042** khi thay tiêu đề bằng chữ "this paper". Hướng sửa là thêm một nhóm câu hỏi không nhúng tiêu đề và báo cáo hai nhóm riêng.

**"Vì sao `truncate_title` không gây thiệt hại? Chẳng phải nó phá tra cứu theo tiêu đề sao?"**

Em cũng dự đoán vậy và **dự đoán sai** — em giữ nguyên dự đoán đó trong báo cáo rồi đính chính bằng số liệu.

Lý do: test set giữ tiêu đề gốc, còn corpus đã bị cắt. Nên tra cứu chính xác trượt và rơi về semantic search — mà semantic search vẫn tìm đúng bài. Đường tắt bị phá thì đường chính vẫn gánh được. Điều này thực ra là tin tốt: nó cho thấy retrieval ngữ nghĩa phía dưới không rỗng.

**"Judge accuracy 1.000 là điểm của LLM à?"**

Không. Mặc định pipeline dùng deterministic judge; muốn gọi LLM thật phải set `RUN_LLM_JUDGE=1`. Nhóm em ghi rõ giới hạn này trong mục 12 và chưa chạy lượt đó.

**"Sao biết repaired không phải là copy của baseline?"**

Em kiểm bằng fingerprint SHA-256 trên 15 cột, bỏ `age_days` vì cột đó phụ thuộc thời điểm chạy. Bản repaired trùng bit-for-bit với bản rebuild trực tiếp từ raw. Việc nó cũng trùng baseline là hệ quả đúng — cả hai sinh từ cùng raw qua cùng một hàm nên bắt buộc phải giống. Cái phân biệt là corrupted có fingerprint khác hẳn.

Ngoài ra code cũng không hề đọc file baseline: `repaired_df = build_clean_dataframe(raw_records, ...)`.

**"Corpus chỉ 24 bài, kết luận có đáng tin không?"**

Đây là giới hạn thật, nhóm em ghi ở mục 12. Với 24 bài thì mỗi bài bị hỏng chiếm tỉ trọng lớn nên metrics dao động mạnh. Cách kiểm chứng là tăng `max_results` rồi chạy lại và so biên độ dao động. Nhưng nhóm đối chứng 18 câu giữ nguyên 1.000 cho thấy mức giảm không phải nhiễu ngẫu nhiên.

**"Categories rỗng hết thì sao?"**

Crossref đã bỏ populate field `subject` — 0 trên 24 bài có categories. Em phát hiện lúc smoke test và báo cho bạn phụ trách evaluation, nên nhóm bỏ loại câu hỏi về categories. Sau đó nhóm thêm check `categories_coverage` ở mức WARNING chứ không FAIL, vì đây là đặc tính của nguồn dữ liệu chứ không phải lỗi pipeline.

---

## 8. Dự phòng nếu demo hỏng

| Tình huống | Xử lý |
| --- | --- |
| Dashboard không lên | Chuyển sang terminal, chạy `uv run python script/demo_three_states.py` — output đủ để kể trọn câu chuyện |
| Terminal cũng lỗi | Mở thẳng `data/reports/corruption_report.md` và `data/results/corruption_log.json` |
| Bị hỏi số mà không nhớ | Mở `data/results/corrupted_metrics.json`, đọc trực tiếp. Thà tra tại chỗ còn hơn đoán |
| Hết giờ giữa chừng | Bỏ mục 2 và 3, nhảy thẳng vào mục 5. Ba điều đáng nhớ mới là phần có giá trị |

**Nguyên tắc:** không nói "chạy thành công" cho phần chưa kiểm chứng. Nếu ai hỏi điều gì chưa đo, trả lời thẳng là chưa đo và nói cách đo.
