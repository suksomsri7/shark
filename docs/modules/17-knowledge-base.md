# ระบบที่ 16: Knowledge Base (คลังความรู้)

> ออกแบบโดย Fable 5 (2026-07-11) — คู่หูของ **ระบบที่ 15: AI พนักงาน** (`16-ai-employee.md`)
> ตอบคำถามเจ้าของ: "ต้องมีระบบ knowledge base หรือไม่เพื่อใช้ตอบคำถาม chat" → **ต้องมี** (เหตุผล §1)

---

## 1. ทำไมต้องมี — ความรู้ 2 ชนิดของ AI

| ชนิด | ตัวอย่างคำถาม | AI ตอบจาก |
|---|---|---|
| **Structured** (ข้อมูลในระบบ) | "พรุ่งนี้คิวว่างไหม" "ลูกค้าคนนี้มีแต้มเท่าไหร่" "เดือนนี้ขายเท่าไหร่" | **Tools** (query DB สด) — ❌ ไม่ใช่หน้าที่ KB |
| **Unstructured** (ความรู้ของร้าน) | "ร้านเปิดกี่โมง" "จอดรถตรงไหน" "ย้อมผมใช้เวลา/ราคาเริ่มเท่าไหร่" "นโยบายยกเลิกนัด/มัดจำ" "โปรเดือนนี้มีอะไร" | **Knowledge Base** — ✅ ไม่มี KB = AI เดา/แต่งเอง (อันตราย) หรือตอบไม่ได้ |

KB จำเป็นที่สุดใน **Phase 3 (AI ต้อนรับตอบลูกค้าใน Chat/LINE)** — ลูกค้าถามเรื่องพวกนี้ 80% ของแชท

## 2. เป็น "ระบบ" ตามสถาปัตยกรรม SHARK

- **ระบบที่ 16** — AppSystem type `KB` · สร้างได้หลายชุด ("KB ร้านตัดผม", "KB สปา") · เชื่อมกับระบบ AI / รวม Chat / ระบบธุรกิจ
- ใช้ได้ 3 ทาง: (1) สมองของ AI พนักงาน (2) คู่มือภายในให้พนักงานค้น (3) หน้า FAQ สาธารณะบน storefront 🔜

## 3. Data Model

```prisma
model KbArticle {
  id, tenantId, systemId
  title, content(Markdown), tags Json, categoryId?
  status(DRAFT|PUBLISHED|ARCHIVED)
  source(MANUAL|AI_SUGGESTED|IMPORTED)
  updatedByUserId?, createdAt, updatedAt
  @@index([systemId, status])
}
model KbCategory { id, tenantId, systemId, name, sortOrder }
```

## 4. Retrieval — 3 ระดับ (เริ่มง่าย ไม่ต้องมี vector DB วันแรก!)

| ระดับ | เมื่อไหร่ | วิธี | ต้นทุน |
|---|---|---|---|
| **L1: ทั้งก้อนใน context** | KB ≤ ~50 บทความ (~20-40k tokens) — SME ส่วนใหญ่อยู่ตรงนี้ | รวมบทความ PUBLISHED ทั้งหมดเป็น block เดียวใน context + **cache_control** (byte-stable, rebuild เมื่อบทความแก้) | อ่านจาก cache ~10% ราคา — แม่นสุด ง่ายสุด |
| **L2: search tool** | KB โต (50-500 บทความ) | `search_kb(query)` = Postgres full-text/trigram (pg_trgm มีอยู่แล้ว) คืน top-5 → AI อ่านเฉพาะที่เกี่ยว | จ่ายเฉพาะบทความที่ดึง |
| **L3: Vector RAG** 🔜 | KB ใหญ่/หลายร้อยบทความ | embeddings (Voyage) + pgvector, hybrid search | ทำเมื่อ L2 ไม่พอจริงๆ |

**Decision: เริ่ม L1 → สลับ L2 อัตโนมัติเมื่อเกิน threshold** (โค้ดวัด token ของ KB แล้วเลือกโหมดเอง) — สอดคล้องประสบการณ์ siamdive2 (KB เล็กไม่จำเป็นต้องมี vector)

## 5. การสร้างเนื้อหา (ลดแรงเจ้าของร้าน — จุดขาย)

1. พิมพ์เอง (editor Markdown ง่ายๆ + หมวด + แท็ก)
2. **AI ช่วยร่าง**: ปุ่ม "ให้ AI ร่าง FAQ จากข้อมูลร้าน" — อ่านบริการ/ราคา/เวลาทำการจากระบบที่เชื่อม → ร่างบทความ DRAFT ให้คนตรวจ (ห้าม publish เอง)
3. **เรียนจากแชทจริง** 🔜: คำถามที่ AI ตอบไม่ได้/คน handoff บ่อย → เสนอเป็นบทความใหม่ (AiDraft → KbArticle DRAFT)
4. Import (วางข้อความ/ไฟล์) 🔜

## 6. กติกาการตอบของ AI ที่ใช้ KB (guardrail)

- ตอบ**เฉพาะจากบทความที่เจอ** + แนบว่ามาจากบทความไหน (internal ref สำหรับ audit)
- ไม่เจอ → ตอบ "ไม่แน่ใจ ขอตรวจสอบ" + handoff คน (Phase 3) — **ห้ามแต่ง** (ตาม no-fabrication policy)
- ข้อมูลชนกัน (KB บอกราคาเก่า ระบบบอกใหม่) → **structured data ชนะเสมอ** และ flag บทความให้เจ้าของอัปเดต

## 7. Phasing

- **P1** (คู่กับ AI P2): ตาราง + CRUD ใน `/app/sys/[id]` + L1 retrieval + search_kb tool + AI ช่วยร่างจากข้อมูลร้าน
- **P2** (คู่กับ AI P3): ใช้ตอบลูกค้าใน Chat/LINE + L2 auto-switch + flag ความรู้ล้าสมัย
- 🔜: FAQ สาธารณะบน storefront (SEO), เรียนจากแชท, L3 vector, หลายภาษา
