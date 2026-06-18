// gate3-fixture.js — controlled TEST data (synthetic is fine for a test: the gate
// measures hit/miss against pre-decided answers; it never fakes results).
//
// Design: queries deliberately do NOT reuse the memory's keywords — they paraphrase
// the same meaning, so a pass reflects SEMANTIC retrieval, not keyword overlap.
// Memories #2 (meeting) and #4 (health) are intentional distractors (no query targets
// them) to check for false positives.

export const memories = [
  {
    id: 1, topic: "rust", lang: "en",
    text: "Spent the evening finally getting comfortable with how Rust handles memory. The compiler kept rejecting my code until I understood that each value has a single owner and gets cleaned up automatically when that owner goes out of scope. Frustrating at first, but it clicked — no garbage collector, no manual freeing, just the compiler enforcing the rules at build time."
  },
  {
    id: 2, topic: "meeting", lang: "vi",
    text: "Họp dự án sáng nay kéo dài gần hai tiếng. Cuối cùng cả nhóm thống nhất dời ngày bàn giao thêm một tuần vì phần kiểm thử chưa xong. Mình được giao viết lại bản tóm tắt tiến độ gửi khách hàng trước thứ Sáu."
  },
  {
    id: 3, topic: "work-emotion", lang: "vi",
    text: "Dạo này đi làm thấy đuối. Không phải vì khối lượng việc nhiều, mà vì cảm giác mình đang giậm chân tại chỗ, làm hoài mấy thứ lặp đi lặp lại mà không học được gì mới. Tối về vẫn cứ nghĩ về nó, hơi chán nản."
  },
  {
    id: 4, topic: "health", lang: "vi",
    text: "Lưng đau âm ỉ mấy hôm nay, chắc do ngồi sai tư thế cả ngày trước máy tính. Quyết định bắt đầu đi bộ 30 phút mỗi tối và đặt báo thức nhắc đứng dậy mỗi tiếng. Mấy hôm ngủ cũng chập chờn, phải chỉnh lại giờ giấc."
  },
  {
    id: 5, topic: "finance", lang: "en",
    text: "Reviewed my spending for the month and it's clear the eating-out budget got out of hand again. From now I'm moving a fixed amount aside the day my salary arrives, before I can touch it. Also want to start putting a small slice into a low-cost index fund every month."
  },
];

export const queries = [
  // Official set — pass bar is computed on these 3 (hit >= 2/3).
  { q: "What did I learn about Rust's approach to keeping memory safe without garbage collection?", expectedIds: [1], lang: "en" },
  { q: "Tôi từng ghi lại cảm giác bị kẹt, không tiến bộ trong công việc thế nào?",                 expectedIds: [3], lang: "vi" },
  { q: "Which entry is about a plan I made to handle my money better?",                            expectedIds: [5], lang: "en" },

  // (Optional DIAGNOSTIC — NOT in pass bar) cross-lingual: VN query -> EN memory
  // { q: "Tôi có ghi chú nào về kế hoạch tiết kiệm và đầu tư hằng tháng không?", expectedIds: [5], lang: "vi" },
];
