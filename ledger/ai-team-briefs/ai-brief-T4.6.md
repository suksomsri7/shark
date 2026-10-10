# T4.6 — Shop knowledge + per-employee grants C5 (Opus · server + app)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-B (knowledge sources), R-E C14 first. Contract: AI-TEAM-RUN §2 T4.6. Mockup `airy-c.jpg` page 5 (+ dark). HTML: "ความรู้ของร้าน · 18 รายการ · พนักงาน AI ใช้ตอบและทำงาน" · search · "ดึงจาก SHARK อัตโนมัติ": 📦 สินค้า & ราคา (214 รายการ · ซิงก์ทุกชั่วโมง · ทุกคน) · 🕘 เวลาเปิด-ปิด & สาขา (2 สาขา · ทุกคน) · "ที่คุณเพิ่มเอง": 💸 นโยบายส่วนลด (เอกสาร · 1 หน้า · เซลส์ · แชท) · 📘 คู่มือเครื่องชงกาแฟ (PDF · 24 หน้า · เซลส์ · แชท) · ❓ คำถามที่พบบ่อย (42 ข้อ · แชท) · 🔒 ต้นทุน & กำไร (ตาราง · บัญชีเท่านั้น).

## Verified facts (REVIEW §1.5, §2.0)
- `KbArticle(tenantId, title, body, category?, active)`; `kbSearch` tool `tools.ts:395` (`HAND_TOOL_ACCESS` OPEN), `kb_auto_save` `:2352`; the KB module's search function (hybrid) is called from the tool — find it (`@/lib/modules/kb` facade) and whether it accepts a category filter; if not, filter results by category post-hoc (document).
- Inventory items + prices, opening hours/branches: read through facades (`@/lib/modules/inventory` `listItems`/`getItem` — REVIEW mentions `inventory.getItem().priceSatang`; units/branches from core `Unit` via the module that exposes opening hours — find or fall back to `Unit.name` list).
- Private files + text extraction: T1.5's approach (reuse).
- `AiKnowledgeGrant(aiEmployeeId, key)` where `key` = `cat:<category>` | `src:products` | `src:hours` | `art:<articleId>` (article-level optional).

## Deliverables
Server `src/lib/ai/team/knowledge.ts`: `listKnowledge(ctx) → { auto: [{ key, labelTh, count, syncedTh, visibleTo: "ALL"|aiEmployeeId[] }], own: [{ articleId, title, kind: "DOC"|"PDF"|"FAQ"|"TABLE", meta, category, visibleTo }] }` (visibleTo derived: no grants on that key ⇒ ALL) · `setVisibility(ctx, key, aiEmployeeIds[] | "ALL")` · `addKnowledgeItem(ctx, { title, category, body? | fileRef })` (extraction as T1.5) · `knowledgeContextFor(aiEmployeeId, query)`: `kbSearch` filtered by grants + auto sources rendered compactly (top N items matching the query by name) — wired into `tools.ts#kbSearch` when `ctx.aiEmployeeId` (hunk) and into the prompt builder as a `<<<SHOP_FACTS>>>` sub-block only when the model asks (tool), not every turn (cost) · routes `GET /api/mobile/team/knowledge`, `PUT knowledge/visibility`, `POST knowledge/items`.
App `app/(app)/settings/knowledge.tsx`: search · two sections · row tap → visibility sheet (ALL / pick employees) · "+" add item (title, category, text or file) · testIDs `kb-search`, `kb-auto-<key>`, `kb-own-<id>`, `kb-vis-<k>`, `kb-add`.

## Acceptance (oracle `qc-ai-t4.6`)
S1 X8 category "บัญชีเท่านั้น" invisible to the chat employee, visible to the account employee · S2 no grants ⇒ baseline kb behaviour · S3 auto adapters read live data, no copies (count rows before/after) · S4 file rules · S5 X1 · S6 pairs C5 + visibility sheet · S7 in-app search · testIDs/i18n. Regressions KB suites, T1.5.
