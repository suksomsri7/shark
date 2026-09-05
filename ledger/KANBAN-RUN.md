# RUN — บอร์ดงาน (Kanban) เทียบชั้น Trello · ledger สด

> เริ่ม 6 ก.ย. 2026 00:25 น. · เจ้าของสั่ง: "Fable5.1 คุมงานแทนผม บันทึกที่ออกแบบมาทั้งหมด วางแผนงานให้ละเอียดทุกฟังก์ชัน ทุกโมดูล ลงให้ลึก ทำพิมพ์เขียว ควบคุมงานให้ออกมาตามที่ออกแบบ สั่ง sub agent เลือก model ให้เหมาะ · Fable ตรวจ QC ต้องเห็นภาพไม่ใช่ฟังรายงาน ทดสอบเอง หาบัค/ช่องโหว่ แล้วแก้"
> แบบที่เคาะ: `ledger/DESIGN-KANBAN-TRELLO.md` + ภาพ `ledger/design-kanban/*.png` · พิมพ์เขียว: `docs/modules/13-kanban-v2.md` (v1 `13-kanban.md` ถูกแทนที่)
> **วิธีกลับมาต่อ**: `cd /root/projects/shark-kanban && git pull --rebase origin main` → อ่านตาราง "WO ปัจจุบัน" → `wo-notes/kanban-<WO>.md` → `git status` → ทำต่อจาก "ขั้นที่ถึง" ห้ามเริ่มใหม่ · sub-agent ตายกลางทาง → อ่าน wo-notes แล้วสั่งตัวใหม่ทำต่อ

## WO ปัจจุบัน
| ช่อง | ค่า |
|---|---|
| WO | K1.4 |
| สถานะ | IN_PROGRESS |
| ผู้ทำ | Fable (oracle เขียนแล้ว) → Opus (builder) |
| ขั้นที่ถึง | 05:59 น.: K1.3 DONE (Opus 18 นาที · Fable: k1.3 29 · k1.2 25 · k1.1 30 · notify 12 · SQL ดูตาแล้ว · typecheck · fitness) → push main · สั่ง Opus ทำ K1.4 |

## การตัดสินใจ (คำถาม §9 ของแบบ — เจ้าของไม่ได้ตอบ Fable ตัดสินแบบปลอดภัย แก้ทีหลังได้)
| # | เรื่อง | ตัดสิน |
|---|---|---|
| D1 | ขอบเขต workspace | Workspace = `AppSystem type=KANBAN` (ร้านเปิดหลายตัวได้) · หน้ารวมบอร์ด/ค้นหาข้ามบอร์ด = ต่อ system |
| D2 | บอร์ดผูกสาขา | visibility PRIVATE/TENANT · OWNER = ADMIN ทุกบอร์ด · MANAGER ที่ `unitAccess` คลุม `board.unitId` = EDITOR โดยนัย · PRIVATE ของสาขาอื่นไม่เห็น (404) |
| D3 | คนนอกองค์กร | ไม่ทำใน run นี้ (P4) |
| D4 | โควตา | ไฟล์แนบ 10 MB/ไฟล์ (= แชท) · 20 ไฟล์/การ์ด · ป้าย ≤ 30/บอร์ด · ฟิลด์กำหนดเอง ≤ 20/บอร์ด · บอร์ด/การ์ดไม่จำกัด (soft limits v1 §11.5 เป็น config) |
| D5 | แจ้งเตือนพนักงาน | ในแอป (`recipientUserId` ตรงคน) + push รายคน + อีเมลสรุป · ไม่มี LINE/Telegram |
| D6 | AI | เสนอก่อนเสมอ · การ์ดอัตโนมัติจากแชท/ฟอร์ม = "กฎ" ที่ผู้ดูแลเปิดเอง ไม่ใช่ AI ลงมือ |
| D7 | มุมมอง P2 | ตาราง · ปฏิทิน · สรุป · มุมมองบันทึก · ฟิลด์ · เทมเพลตการ์ด/ซ้ำ · กล่องงานเข้า · กฎอัตโนมัติ · รายงาน · อีเมล/watch · **ไทม์ไลน์เป็น WO สุดท้ายของ P2 (เลื่อนได้)** |
| D8 | ลำดับ | P1 parity → P2 → P3 (สร้างงานจากแชท = K3.2) |
| D9 | สีป้าย | enum 6 ค่า SLATE/BLUE/GREEN/AMBER/RED/PURPLE ↔ `--color-tag-*` |
| D10 | ไมเกรชัน | additive เท่านั้น (nullable/default) · Vercel build รัน `migrate deploy` เอง (โค้ด+schema ไปด้วยกันใน push เดียว) · `sortOrder` คงคู่ `position` (อ่าน `position ?? sortOrder` · เขียนทั้งคู่ตลอด P1) |
| D11 | กฎอัตโนมัติ | ต่อยอด `AutomationRule` เดิม (+`boardId systemId conditions actions`) ไม่สร้างตารางใหม่ · log ใน `AutomationRun` |
| D12 | rich text | `description` เป็น HTML ที่ sanitize ฝั่ง server (allowlist v1 §11.6) · P1 ใช้ textarea+markdown-lite ไม่เพิ่ม dependency |
| D13 | realtime | Ably channel ต่อบอร์ดผ่าน `src/lib/realtime` + polling fallback |
| D14 | เลขการ์ด | `cardNo` ต่อบอร์ดจาก `cardNoSeq` (UPDATE…RETURNING ใน tx เดียวกับสร้าง) |
| D16 | สิทธิ์คอลัมน์ | สร้าง/เปลี่ยนชื่อ/ย้ายคอลัมน์ = EDITOR (แบบ Trello) · archive คอลัมน์ · WIP · ธง done · ป้าย/สมาชิก/visibility = ADMIN — พิมพ์เขียว §6.4 ปรับตาม (K1.3 ตัดสิน) |
| D15 | **API + AI ของบอร์ดงาน** (เจ้าของทัก 6 ก.ย. 05:10 "ยังขาดระบบ api") | ทุกฟังก์ชันของบอร์ดงานต้องมี REST + AI tool เหมือนบัญชี: ทะเบียน op เดียว (`src/lib/modules/kanban/api/registry.ts` ใช้ `defineOp` แบบเดียวกับ `account/api/op.ts` — ย้ายแกนกลาง require/dispatch/respond/idempotency/run เป็นของกลาง `src/lib/api/*` ให้ 2 โมดูลใช้ร่วม) → REST `/api/v1/kanban/*` (คีย์ API scope = คีย์สิทธิ์ `kanban.*` · bundle `kanban-read` / `kanban-edit` / `kanban-admin`) · webhook event `kanban.*` · AI tools `kanban_*` generate จากทะเบียน · openapi.json + คู่มือ `/developers/kanban` + สกิล Claude `shark-kanban-api` · ทำเป็น **K1.15** หลัง K1.10 (service ครบ) และทุก WO ของ P2/P3 ต้องเพิ่ม op ของฟีเจอร์ตัวเองในทะเบียน (ข้อสอบ F13 แบบบัญชี) |

## กติกาของ run นี้ (สืบทอดจาก run บัญชี — ใช้ได้ผล 24/24)
1. **Fable เขียนข้อสอบ (oracle) ก่อน** ทุก WO ที่ `scripts/qc-kanban-<wo>.mts` · builder ห้ามแก้ · ตกแล้วรายงาน check id + หลักฐาน · ถ้า oracle ผิด Fable แก้เอง
2. **เลือก model**: Opus = schema/ordering/สิทธิ์/realtime/AI (K1.1–K1.5, K1.8, K1.10, K1.14, K2.9, K3.x) · Sonnet = UI ตามแบบ/เอกสาร/เทมเพลต (K1.6–K1.7, K1.9, K1.11–K1.13, K2.1–K2.8, K2.10–K2.11)
3. **Fable ตรวจรับเอง**: รัน oracle ซ้ำ · probe เสริม (ข้ามร้าน · สิทธิ์ · concurrency) · **ภาพจริง**: `bash scripts/acc-v2-serve.sh` (production build บน `.env.qc` :3215) + `scripts/visual-kanban.mts <WO>` ถ่าย desktop 1440×900 + mobile 390×844 → Fable เปิดดูเทียบ mockup ทีละใบ · คลิก/ลากจริงผ่าน puppeteer บน build (dev ไม่ hydrate) · typecheck · fitness 2 โหมด
4. **เครื่อง 2 คอร์/5G**: งานหนักทีละ 1 (build/typecheck/qc:all) · builder ห้าม `next build`/`qc:all` · ปิด QC server ก่อน typecheck · `NODE_OPTIONS=--max-old-space-size=3584`
5. **env**: `.env` = prod · ทุกคำสั่ง DB ใช้ `.env.qc` (host `ep-plain-art`) ผ่าน `loadQcEnv()` หรือ export ในบรรทัดเดียว (grep|cut ห้าม source) · migration ลง QC ด้วย `prisma migrate deploy` ก่อน oracle · prod ลงตอน Vercel build
6. **โค้ด**: ไฟล์ใหม่ในโมดูล kanban import prisma จาก `./db` เท่านั้น (chokepoint · F5) · oracle: identifier ตัวพิมพ์เล็กใน pg_indexes ไม่มี quote → regex `"?x"?` · ห้าม `prisma format` (Prisma 7 เขียนคอมเมนต์ `/** */` ซ้อนพัง — K1.1) · ไม่มี `any` ใน src · raw prisma ใน `src/lib/modules/**` ไม่เพิ่ม (F5 ratchet) · ไฟล์ `"use server"` export เฉพาะ action (core อยู่ไฟล์อื่น) · ทุก mutation ตรวจ tenant+system+บทบาทบอร์ด · บอร์ดที่มองไม่เห็น = 404 · เพิ่ม event = ลงทะเบียน consumer พร้อมกัน · เพิ่ม tool AI = ลง SKILLS+KIND_ACCESS
7. **UI ต้องตรงภาพ** (`feedback_ui_must_match_approved_mockups`): ใช้โทเคน/ไอคอนชุดเดียวกับบัญชี V2 (`docs/design/account-v2/mockup.html` · `AccountIcon.tsx` pattern) · คำไทยตามแบบ §5.5 · empty state ตาม §5.7 · ปุ่มลัดตาม §5.6 (ปิดได้ · ไม่ทำงานในช่องพิมพ์)
8. **ปิดทุก WO**: `wo-notes/kanban-<WO>.md` → Fable ตรวจรับ → commit/push `session/kanban` + `main` (deploy prod) → รายงาน % · ปิดทุกเฟส: `pnpm qc:all` เต็ม (log รายชุดที่ `/tmp/claude-0/qc-all/`)
9. **ข้อสอบเก่าต้องเขียว**: `qc-kanban-notify.mts` (⚠️ โหลด `.env` ตรง — ต้องย้ายมา qc-env-guard ใน K1.1) · `qc-ai-kanban-board.mts` · fitness 20/20

## ชุดข้อมูล QC (Fable · `scripts/seed-kanban-qc.mts` → `scripts/kanban-expected.json`)
ร้าน "SIAM DIVE KANBAN QC" (slug `siam-dive-kanban-qc`) · OWNER `kb-owner@shark.local` · MANAGER สาขาป่าตอง (`unitAccess:[patong]`) · STAFF 3 คน (ธนา/ปุ๊ก/กิตติ) · STAFF ไม่มีสิทธิ์โมดูล 1 คน · ระบบ KANBAN 1 · BusinessUnit 2 (ป่าตอง/กะตะ) · บอร์ด 3: "งานร้าน — สาขาป่าตอง" (unit ป่าตอง · PRIVATE · 5 คอลัมน์ · 24 การ์ด ตามภาพ 02) · "ซ่อมบำรุงอุปกรณ์" (TENANT · 4 คอลัมน์ · 11 การ์ด) · "บอร์ดลับสาขากะตะ" (unit กะตะ · PRIVATE · 3 การ์ด — ใช้ทดสอบ 404) · ทุกการ์ดผ่าน service จริง · วันที่อ้าง `today` ตรึงเหมือนบัญชี (`2026-09-30`)

## ตาราง WO (34) — สถานะสด
| WO | เรื่อง | model | สถานะ | วันที่ | หมายเหตุ/oracle |
|---|---|---|---|---|---|
| K0 | เตรียม run: worktree · ledger · พิมพ์เขียว v2 · seed · harness ภาพ | Fable+Opus | DONE | 6 ก.ย. | พิมพ์เขียว `docs/modules/13-kanban-v2.md` 1,225 บรรทัด · seed 38 การ์ด · oracle K1.1–K1.4 · `visual-kanban.mts` |
| **P1 — เทียบชั้น Trello แกนหลัก** |||||
| K1.1 | ไมเกรชัน A + backfill (`position` `cardNo` `completedAt` `isDoneColumn` `wipLimit` `unitId` `visibility` `color` `createdById` `startAt` `sourceType`) + `ordering.ts` (fractional-indexing) + ย้าย qc-kanban-notify ไป env-guard | Opus | DONE | 6 ก.ย. | k1.1 30/30 (oracle ผิดเอง 2: regex quote index · อัตราโตคีย์ fractional-indexing ~1 ตัวอักษร/6 แทรก) · migration `20260919000000_kanban_v2_a` additive 9 คำสั่ง · `ordering.ts` · backfill idempotent · notify ตรงคน · `wo-notes/kanban-K1.1.md` |
| K1.2 | ป้ายกำกับจริง (`KanbanLabel`/`KanbanCardLabel` 6 สี) + ผู้รับผิดชอบหลายคน (`KanbanCardAssignee`) + backfill + service | Opus | DONE | 6 ก.ย. | k1.2 25/25 (oracle regex quote ผิดเอง 1) · migration `20260920000000_kanban_v2_b` 11 คำสั่ง additive · backfill B (15 ป้าย · 42 ลิงก์ · 28 ผู้รับ บน QC) · `db.ts` chokepoint (F5 ratchet 45/45) · `wo-notes/kanban-K1.2.md` |
| K1.3 | สมาชิกบอร์ด/ดาว (`KanbanBoardMember`/`KanbanBoardStar`) + สิทธิ์ 2 ชั้น (`boardRole()`) + คีย์สิทธิ์ใหม่ 8 + 404 + AuditLog | Opus | DONE | 6 ก.ย. | k1.3 29/29 (oracle ลำดับ deleteMany ผิดเอง) · migration `20260921000000_kanban_v2_c` 8 คำสั่ง · `access.ts`/`members.ts` · `writeAudit` ย้ายไป `core/audit.ts` · UI เดิมผ่าน For · `wo-notes/kanban-K1.3.md` |
| K1.4 | API ย้ายการ์ด/คอลัมน์ (`moveCard(before/after)` · concurrency · neighbor fallback · rebalance) + done column/`completedAt` + WIP limit + `cardNo` | Opus | IN_PROGRESS | | `qc-kanban-k1.4.mts` (เขียนแล้ว 30 ข้อ · concurrency 20+30) |
| K1.5 | ลากวางเดสก์ท็อป (client component ตัวแรก · optimistic · rollback) + หน้าบอร์ดใหม่ตามภาพ 02 (หัวบอร์ด/รางไอคอน/คอลัมน์ 240px/การ์ดมีตรา) | Opus | TODO | | `qc-kanban-k1.5.mts` (static 17 ข้อ · เขียนแล้ว) + `visual-kanban.mts 1.5` (ลากจริง+ภาพ) |
| K1.6 | หลังการ์ด (โมดัล 872px / แผ่นเต็มจอ) ตามภาพ 03: ชื่อ/รายละเอียด/ผู้รับผิดชอบ/กำหนดส่ง+วันเริ่ม/ป้าย/ย้าย/ทำสำเนา/เก็บ · URL `?card=` | Sonnet | TODO | | `qc-kanban-k1.6.mts` (เขียนแล้ว 20 ข้อ) + `visual-kanban 1.6` |
| K1.7 | เช็คลิสต์ (หลายชุด · มอบหมาย/กำหนดส่งรายรายการ · แถบความคืบหน้า · ซ่อนที่ทำแล้ว) | Sonnet | TODO | | |
| K1.8 | ความเห็น + @mention + แจ้งเตือนยิงตรงคน (`recipientUserId`) + push รายคน + auto-VIEWER | Opus | TODO | | |
| K1.9 | ไฟล์แนบ + ปก (FileAsset ผ่าน `src/lib/storage` · magic bytes · 10 MB · signed/CDN) | Sonnet | TODO | | |
| K1.10 | ประวัติกิจกรรม (`KanbanActivity` append-only 28 ชนิด) + สายรวมความเห็น/กิจกรรม + AuditLog เรื่องสิทธิ์ | Opus | TODO | | |
| K1.11 | ตัวกรอง (สมาชิก/ป้าย/กำหนด/สถานะ · URL) + ค้นหาข้ามบอร์ด `Ctrl K` + ไวยากรณ์ | Sonnet | TODO | | |
| K1.12 | เทมเพลต 6 ชุดธุรกิจไทย + หน้ารวมบอร์ดใหม่ (ภาพ 01: ดาว/จัดกลุ่มสาขา/แถวเทมเพลต) + สร้างบอร์ดจากเทมเพลต atomic | Sonnet | TODO | | |
| K1.13 | มือถือ (ภาพ 07): เลื่อนทีละคอลัมน์ · กดค้างลาก · ปัดขวา=เสร็จ/ซ้าย=เก็บ + undo 5 วิ · หลังการ์ดเต็มจอ · งานของฉันใหม่ (ภาพ 06 ฝั่งขวา) | Sonnet | TODO | | visual mobile |
| K1.14 | ปุ่มลัด (ปิดได้ · ไม่ชน IME) · empty state ทุกหน้า · realtime Ably + polling · หน้าคลังเก็บ/กู้คืน · เมนู 7 หมวด | Opus | TODO | | 2 browser เห็นกันใน 2 วิ |
| **K1.15** | **REST API + AI tools ของบอร์ดงาน** (D15): แกนกลาง `src/lib/api/*` ดึงจากบัญชี · ทะเบียน op บอร์ด/คอลัมน์/การ์ด/ป้าย/สมาชิก/เช็คลิสต์/ความเห็น/ไฟล์/กิจกรรม/ค้นหา (~60 op) · scope bundles · webhook · AI tools ~15 · openapi + `/developers/kanban` + สกิล Claude | Opus | TODO | | `qc-kanban-k1.15.mts` + agent ภายนอกใช้สกิลทำ 5 งาน |
| **P2 — มุมมอง + อัตโนมัติ + รายงาน** |||||
| K2.1 | มุมมองตาราง (แก้ในช่อง · เลือกหลาย · จัดกลุ่ม · CSV) ภาพ 04 | Sonnet | TODO | | |
| K2.2 | มุมมองปฏิทิน (ลากเปลี่ยนวัน · ถาดยังไม่กำหนด · ซ้อนจอง/ลา/ประชุม) ภาพ 05 | Sonnet | TODO | | |
| K2.4 | มุมมองสรุป (4 ไทล์ เจาะลงการ์ดได้) | Sonnet | TODO | | |
| K2.5 | มุมมองที่บันทึกไว้ (`KanbanBoardView` ส่วนตัว/ทั้งทีม) | Sonnet | TODO | | |
| K2.6 | ฟิลด์กำหนดเอง 5 ชนิด (≤20) | Sonnet | TODO | | |
| K2.7 | เทมเพลตการ์ด + กำหนดส่งซ้ำ (cron) | Sonnet | TODO | | |
| K2.8 | กล่องงานเข้าส่วนตัว (`KanbanInboxItem` · จดเร็ว · ส่งเข้าบอร์ด) ภาพ 06 ฝั่งซ้าย | Sonnet | TODO | | |
| K2.9 | ตัวสร้างกฎอัตโนมัติ (5 ชนิด · ทดลองรัน · บันทึกการทำงาน) ภาพ 08 + ลงทะเบียน 8 event | Opus | TODO | | |
| K2.10 | รายงานในแอป (ค้าง/เลยกำหนด/ภาระงาน/throughput/aging) + ส่งออก | Sonnet | TODO | | |
| K2.11 | อีเมลสรุป + watch + ตั้งค่าความถี่แจ้งเตือน + cron เตือนกำหนดส่ง | Opus | TODO | | |
| K2.3 | มุมมองไทม์ไลน์ (เลื่อนได้ตาม D7) | Sonnet | TODO | | |
| **P3 — เชื่อมทุกโมดูล + AI** |||||
| K3.1 | `KanbanCardLink` + UI "เชื่อมข้อมูล SHARK" ในหลังการ์ด + resolver รายโมดูล + เช็คสิทธิ์รายคน | Opus | TODO | | |
| K3.2 | สร้างงานจากแชท (ปุ่มในโมดูลแชท + แผงเตรียมการ์ด ภาพ 09 + สวิตช์รายร้าน) | Opus | TODO | | |
| K3.3 | การ์ดจากฟอร์ม/ใบลา/อนุมัติ/คิว (outbox consumers) | Opus | TODO | | |
| K3.4 | ย้อนกลับ: การ์ดปิดแล้วแปะบันทึกในแชท/อัปเดตเอกสาร | Opus | TODO | | |
| K3.5 | เครื่องมือ AI 8 ตัว + ปุ่ม AI ในหลังการ์ด | Opus | TODO | | |
| K3.6 | คำแนะนำกฎอัตโนมัติจากพฤติกรรมจริง | Opus | TODO | | |
| K3.7 | การ์ดสะท้อน (mirror) | Sonnet | TODO | | |
| K3.8 | มุมมองข้ามบอร์ดระดับองค์กร | Sonnet | TODO | | |
| K3.9 | อีเมลเข้าบอร์ด + push มือถือรายคน | Opus | TODO | | |
| KF | ปิด run: qc:all · verify prod (ภาพจริง) · handover เจ้าของ · Telegram | Fable | TODO | | |

---

## สัญญารายละเอียด P1

### K1.1 — ไมเกรชัน A + ordering core (Opus · oracle `scripts/qc-kanban-k1.1.mts`)
**Schema (additive · ไฟล์ `prisma/schema/kanban.prisma` · migration ใหม่ `prisma/migrations/<ts>_kanban_v2_a/`)**
- enum ใหม่: `KanbanBoardVisibility {PRIVATE TENANT}` · `KanbanLabelColor {SLATE BLUE GREEN AMBER RED PURPLE}` · `KanbanCardSourceType {MANUAL TEMPLATE CHAT FORM EMAIL AUTOMATION AI}`
- `KanbanBoard` + `unitId String?` · `color KanbanLabelColor @default(SLATE)` · `visibility KanbanBoardVisibility @default(PRIVATE)` · `cardNoSeq Int @default(0)` · `createdById String?` · `templateOfId String?` · `@@index([tenantId, systemId, unitId])`
- `KanbanColumn` + `position String?` · `isDoneColumn Boolean @default(false)` · `wipLimit Int?` · `color KanbanLabelColor?`
- `KanbanCard` + `cardNo Int?` · `position String?` · `startAt DateTime?` · `completedAt DateTime?` · `reminderMinutesBefore Int?` · `reminderSentAt DateTime?` · `coverFileId String?` · `sourceType KanbanCardSourceType @default(MANUAL)` · `sourceId String?` · `createdById String?` · `archivedById String?` · `@@index([tenantId, systemId, status, dueAt])` · `@@index([boardId, cardNo])` (unique เพิ่ม **หลัง** backfill ใน K1.4)
- ห้ามลบ/เปลี่ยนชนิดคอลัมน์เดิม · ตรวจ SQL ที่ generate ด้วยตา (partial index ไม่โผล่ใน diff)
**Backfill `scripts/backfill-kanban-v2-a.mts`** (idempotent · รันซ้ำได้ · ต่อบอร์ด): `position` ของคอลัมน์/การ์ดจาก `sortOrder` เรียงเดิม (generateNKeysBetween) · `cardNo` เรียง `createdAt` ต่อบอร์ด + ตั้ง `cardNoSeq` = max · `visibility` = TENANT เฉพาะบอร์ดที่ "คอลัมน์ยังไม่มี position" (= สร้างก่อน K1.1 · ไม่ให้ใครหลุดสิทธิ์กะทันหัน · บอร์ดที่โค้ดใหม่สร้างมี position อยู่แล้วจึงไม่ถูกแตะ · บอร์ดใหม่ default PRIVATE) — ทำก่อนเติม position ใน transaction เดียวกันต่อบอร์ด · รันบน QC ใน WO นี้ · **prod: รันโดย Fable หลัง deploy K1.1** (บันทึกใน wo-notes)
**`src/lib/modules/kanban/ordering.ts`** (ไม่แตะ prisma): ใช้แพ็กเกจ `fractional-indexing` (เพิ่ม dependency — ตรวจ license MIT · ระบุ version ใน wo-notes) · `keyBetween(a,b)` · `keysBetween(a,b,n)` · `needsRebalance(keys)` (ยาว >50) · `rebalanceKeys(n)` · `readPosition(row) = position ?? String(sortOrder).padStart…` (helper เปรียบเทียบผสมช่วงเปลี่ยนผ่าน)
**Service**: `getBoard` เรียงคอลัมน์/การ์ดด้วย `position` (fallback sortOrder) · `createCard`/`createColumn` เขียนทั้ง `position` (ท้ายสุด) และ `sortOrder` · `createBoard` รับ `unitId/visibility/color/createdById` · `notifyAssignment` ใส่ `recipientUserId` (แก้บั๊กแจ้งเตือนทั้งร้าน — ต้องเข้า K1.1 เพราะเป็นบั๊กความเป็นส่วนตัว)
**ข้อสอบเก่า**: `scripts/qc-kanban-notify.mts` ย้ายจาก `process.loadEnvFile(".env")` ไป `qc-env-guard` (ห้ามแตะ prod) และเพิ่ม assert `recipientUserId === assignee`
**Oracle ตรวจ**: information_schema มีคอลัมน์/enum/index ครบ · migration เดียว additive (ไม่มี DROP/ALTER TYPE เปลี่ยนชนิด) · backfill: ทุกคอลัมน์/การ์ด ACTIVE มี `position` เรียงเท่าเดิม · `cardNo` 1..n ไม่ซ้ำต่อบอร์ด · `cardNoSeq` = max · รันซ้ำไม่เปลี่ยนค่า · บอร์ดเก่า visibility TENANT · `ordering.ts` (keyBetween ถูกตามไลบรารี · 60 แทรกจุดเดิม → needsRebalance) · `createCard` ใหม่ได้ position ท้าย + sortOrder เดิม · notify มี recipientUserId · fitness F1/F8 ผ่าน (model ใหม่ลงทะเบียน scope)

### K1.2 — ป้ายกำกับจริง + ผู้รับผิดชอบหลายคน (Opus · `qc-kanban-k1.2.mts`)
- ตาราง `KanbanLabel {id tenantId systemId boardId name color KanbanLabelColor sortOrder createdAt updatedAt @@unique([boardId,name]) @@index([tenantId,systemId,boardId])}` · `KanbanCardLabel {cardId labelId tenantId @@id([cardId,labelId])}` · `KanbanCardAssignee {cardId userId tenantId assignedById assignedAt @@id([cardId,userId]) @@index([tenantId,userId])}`
- **ctx ทุก service ใหม่** = `{ tenantId, systemId, actorUserId?: string | null }` (ไฟล์ `src/lib/modules/kanban/types.ts`) · service `labels.ts`: `listLabels(ctx,boardId) → [{id,name,color,sortOrder,cardCount}]` · `createLabel(ctx,boardId,{name,color}) → row` (≤30/บอร์ด · ชื่อซ้ำ/สีนอก enum → throw Error ไทย) · `updateLabel(ctx,labelId,{name?,color?})` · `deleteLabel(ctx,labelId)` (ปลดจากทุกการ์ด + ลบชื่อออกจาก `labels` Json) · `setCardLabels(ctx,cardId,labelIds[])` (แทนที่ทั้งชุด · label ต้องเป็นของบอร์ดเดียวกับการ์ด ไม่งั้น throw · **เขียน `labels` Json = ชื่อป้ายคู่กันช่วงเปลี่ยนผ่าน**)
- service `cards.ts` (ใหม่ · service.ts re-export ได้): `setCardAssignees(ctx,cardId,userIds[])` (แทนที่ทั้งชุด · ทุก userId ต้องเป็น membership accepted ของร้าน ไม่งั้น throw ไทยและไม่เขียนบางส่วน · แจ้งเตือน `recipientUserId` เฉพาะคนที่เพิ่งเพิ่ม · เขียน `assigneeUserId` = คนแรกของลิสต์ (null เมื่อว่าง) ช่วงเปลี่ยนผ่าน) · `listMyCards(tenantId,systemId,userId)` อ่านจาก `KanbanCardAssignee` ∪ `assigneeUserId`
- backfill `scripts/backfill-kanban-v2-b.mts`: `labels Json` → สร้าง `KanbanLabel` ต่อบอร์ด (สีวนจาก 6 สี) + แถวเชื่อม · `assigneeUserId` → `KanbanCardAssignee` · idempotent
- Oracle: CRUD ป้าย · ≤30 · ชื่อซ้ำ · การ์ดข้ามบอร์ดใส่ป้ายไม่ได้ · assignee หลายคน + แจ้งเตือนเฉพาะคนใหม่ · backfill ตรงกับ Json เดิม · งานของฉันเห็นการ์ดที่เป็นผู้รับคนที่ 2

### K1.3 — สมาชิกบอร์ด + สิทธิ์ 2 ชั้น (Opus · `qc-kanban-k1.3.mts`)
- ตาราง `KanbanBoardMember {id tenantId boardId userId role KanbanBoardRole invitedById createdAt @@unique([boardId,userId])}` · enum `KanbanBoardRole {VIEWER EDITOR ADMIN}` · `KanbanBoardStar {tenantId boardId userId createdAt @@id([boardId,userId])}`
- `src/lib/core/permissions.ts` kanban keys เพิ่ม: `kanban.board.read` `kanban.card.comment` `kanban.card.attach` `kanban.board.member.manage` `kanban.label.manage` `kanban.automation.manage` `kanban.report.view` `kanban.template.manage` (ป้ายไทย) · ทุกที่ที่เคยตรวจแค่ module → ตรวจ `kanban.board.read` เป็นขั้นต่ำ
- `src/lib/modules/kanban/types.ts`: `KanbanActor = { userId, role: Role, unitAccess: string[], permissions: Record<string,unknown> }` (สร้างจาก membership) · `KanbanCtx = { tenantId, systemId, actorUserId?: string|null }`
- `src/lib/modules/kanban/access.ts` (pure ไม่แตะ prisma): `boardRole(actor, board, memberships?: {userId,role}[]): "ADMIN"|"EDITOR"|"VIEWER"|null` ตาม D2 (OWNER→ADMIN · สมาชิก→role · MANAGER ที่ unitAccess คลุม board.unitId→EDITOR · TENANT→VIEWER · ไม่มีคีย์ kanban.* ใด ๆ → null · **คีย์ kanban.* ตัวใดตัวหนึ่ง = ได้ board.read โดยนัย** (ผู้ใช้เดิมไม่หลุด)) · `visibleBoardsWhere(actor): Prisma.KanbanBoardWhereInput` (OWNER=ทั้งหมด · อื่น = OR[TENANT, member, unit ที่คุม (MANAGER)] · ไม่มีคีย์ = `{ id: "__none__" }`) · error class `KanbanNotFoundError` (name ตรงนี้ · status 404) และ `KanbanForbiddenError` (403)
- `src/lib/modules/kanban/members.ts`: `boardRoleOf(ctx, boardId)` (โหลด membership+สมาชิกจาก DB → boardRole) · `assertBoardRole(ctx, boardId, min)` (มองไม่เห็น → KanbanNotFoundError · เห็นแต่ต่ำกว่า → KanbanForbiddenError) · `listMembers(ctx, boardId) → [{userId,name,email,role,tenantRole}]` · `addMember(ctx, boardId, userId, role)` (ผู้ทำต้อง ADMIN · userId ต้องเป็น membership accepted ของร้าน) · `setMemberRole` · `removeMember` (ADMIN ที่ประกาศคนสุดท้ายห้ามถอด/ลดขั้น — OWNER แม้เป็น ADMIN โดยนัยก็ต้องตั้ง ADMIN ใหม่ก่อน) · `leaveBoard` · `starBoard/unstarBoard` (idempotent · บอร์ดที่มองไม่เห็น → NotFound) · `listStarredBoardIds(ctx)` · `setBoardVisibility(ctx, boardId, vis)` (ADMIN) · ทุกตัวเขียน AuditLog กลาง (`writeAudit` ของแพลตฟอร์ม — ย้าย helper ไป `src/lib/core/audit.ts` หรือ import จาก account/access) action `kanban.board.member.add|role|remove` · `kanban.board.visibility` · targetType "KanbanBoard" targetId=boardId
- `service.ts` เพิ่ม `listBoardsFor(ctx, actor)` (กรองด้วย visibleBoardsWhere + ดาว) · `getBoardFor(ctx, actor, boardId) → BoardWithData & { role }` (มองไม่เห็น → KanbanNotFoundError) · `listMyCards(tenantId, systemId, userId, actor?)` ตัดการ์ดจากบอร์ดที่ actor มองไม่เห็น · `actions.ts`/`ui.tsx` เดิมเปลี่ยนมาใช้ตัว For (หน้าเดิมต้องไม่โชว์บอร์ดที่มองไม่เห็นตั้งแต่ WO นี้)
- service `members.ts`: `listMembers` `addMember` (ต้องเป็น membership ของร้าน) `setMemberRole` `removeMember` (ADMIN คนสุดท้ายห้าม · OWNER นับโดยนัย) `leaveBoard` `starBoard/unstarBoard` · `setBoardVisibility` · ทุกตัวเขียน AuditLog กลาง (`writeAudit` เดิมของแพลตฟอร์ม) + activity
- Oracle: STAFF ไม่ใช่สมาชิก → PRIVATE 404 / TENANT VIEWER · VIEWER mutation → ปฏิเสธ · MANAGER สาขา = EDITOR บอร์ดสาขาตัวเอง แต่ 404 บอร์ดสาขาอื่น · ADMIN คนสุดท้าย · ดาว · AuditLog มีแถว · my-tasks ไม่โชว์การ์ดจากบอร์ด PRIVATE ที่ถูกถอด

### K1.4 — ย้ายการ์ด/คอลัมน์ + done + WIP + cardNo (Opus · `qc-kanban-k1.4.mts`)
- ไฟล์ `src/lib/modules/kanban/moves.ts` · `moveCard(ctx,{cardId,toColumnId,beforeCardId?,afterCardId?,force?}) → { ok:true, position, placedAt:"between"|"end", card } | { ok:false, code:"CARD_ARCHIVED"|"WIP_LIMIT"|"NOT_FOUND"|"CROSS_BOARD", message }` ใน tx: อ่าน position เพื่อนบ้านจริง · เพื่อนบ้านหาย → ท้ายคอลัมน์ + `placedAt:"end"` ใน response · การ์ด ARCHIVED → error `CARD_ARCHIVED` · WIP เต็ม → error `WIP_LIMIT` (เว้น `force` โดย ADMIN) · เข้า done column → `completedAt=now` ออก → null · เขียน `sortOrder` ตามลำดับใหม่ด้วย (dual-write) · activity CARD_MOVED · outbox `kanban.card.moved` (+ `kanban.card.completed` เมื่อเข้า done) idempotency `#cardId#updatedAt`
- `moveColumn(ctx,{columnId,beforeColumnId?,afterColumnId?}) → {ok}` (dual-write sortOrder 0..n) · `setColumnDone(ctx,columnId,bool)` (ปลดธง → ล้าง completedAt ของการ์ดในคอลัมน์) · `setColumnWip(ctx,columnId,n|null)` (n ≥ 1 ไม่งั้น throw) · `renameColumn(ctx,columnId,name)` · `archiveColumn(ctx,columnId)` (มีการ์ด ACTIVE → throw ไทย) · `moveAllCards(ctx,{fromColumnId,toColumnId}) → {moved}` (ต่อท้ายตามลำดับเดิม)
- `cardNo`: สร้างการ์ดใน tx `UPDATE "KanbanBoard" SET "cardNoSeq"="cardNoSeq"+1 WHERE id=$1 RETURNING "cardNoSeq"` · เพิ่ม `@@unique([boardId,cardNo])` migration B (หลัง backfill A)
- rebalance: เมื่อ key ยาว >50 → `rebalanceColumn` ใน tx เดียว (rewrite ทุกการ์ดในคอลัมน์) ทันที (ไม่ต้อง job queue ใน P1 — ปริมาณเล็ก)
- Oracle: ย้ายในคอลัมน์เดียว/ข้ามคอลัมน์ ลำดับคงหลังโหลดใหม่ · 20 ย้ายพร้อมกันจุดเดียว → ไม่ล้ม ลำดับ deterministic ไม่มี key ซ้ำ (หรือซ้ำแล้วแตกด้วย createdAt) · เพื่อนบ้านถูก archive ระหว่างลาก → ไปท้าย · WIP · done/completedAt ไป-กลับ · cardNo ไม่ซ้ำเมื่อสร้าง 30 ใบพร้อมกัน · 60 แทรกจุดเดิม → rebalance แล้วลำดับเดิม · outbox event + consumer ลงทะเบียน

### K1.5 — ลากวาง + หน้าบอร์ดใหม่ (Opus · `qc-kanban-k1.5.mts` + `visual-kanban.mts 1.5`)
- client components ใน `src/components/kanban/`: `BoardView.tsx` (state ของบอร์ด · optimistic move · rollback+toast เมื่อ action ปฏิเสธ · pointer events ไม่ใช้ HTML5 DnD เพราะมือถือ) · `Column.tsx` · `Card.tsx` (ตรา: ป้าย/กำหนดส่งสีตามความหมาย Trello/เช็คลิสต์ n/m/ไฟล์/ความเห็น/รูปคน) · `BoardHeader.tsx` (ชื่อแก้ในที่ · ดาว · ป้ายสาขา/visibility · สวิตช์มุมมอง (มีแค่บอร์ดใน P1 ตัวอื่น disabled) · ตัวกรอง (K1.11) · รูปทีม · ⋯)
- server action `moveCardAction({cardId,toColumnId,beforeCardId,afterCardId})` คืน `{ok, placedAt, position}` · `moveColumnAction`
- หน้า `/app/sys/{id}/kanban/b/{boardId}` ใหม่ (เดิม `/kanban/{boardId}` → redirect) · เมนูซ้ายยุบเป็นรางไอคอน 56px ในหน้าบอร์ด · พื้นเวที `#f4f5f7` คอลัมน์ `#eceef1` 240px · เส้นประน้ำเงินตำแหน่งวาง · ไอคอน sprite เพิ่มใน `src/components/kanban/KanbanIcon.tsx` (คัดจาก `ledger/design-kanban/_base.part`)
- Oracle+ภาพ: puppeteer ลากการ์ดจากคอลัมน์ 1 → 3 ตำแหน่งกลาง แล้วโหลดใหม่ลำดับคง · ปฏิเสธ (WIP เต็ม) → การ์ดเด้งกลับ + toast · ภาพ desktop เทียบ mockup 02 (โครง/สี/ตรา) · mobile ยังไม่ต้อง (K1.13)

### K1.6 — หลังการ์ด (Sonnet · `qc-kanban-k1.6.mts` + visual)
- `CardBack.tsx` โมดัล 872px (Esc ปิด · โฟกัสกักในโมดัล · URL `?card=<id>` เปิดตรงได้/ปุ่ม back ปิด) / มือถือ = แผ่นเต็มจอ (K1.13 ปรับ) · หัว: `#cardNo` · คอลัมน์ · บอร์ด · ชื่อแก้ในที่ (Enter บันทึก) · แถว "เพิ่ม:" สมาชิก/ป้าย/กำหนดวัน/เช็คลิสต์/ไฟล์แนบ (ปุ่มที่ WO ยังไม่มาให้ disabled มี tooltip "เร็ว ๆ นี้") · ผู้รับผิดชอบ (picker สมาชิกบอร์ด) · ป้าย (picker 6 สี) · กำหนดส่ง+เวลา+เตือนล่วงหน้า · วันเริ่ม · รายละเอียด textarea autosave debounce 800ms (markdown-lite → sanitize server) · แถบขวา: ย้ายไปคอลัมน์/บอร์ด · ทำสำเนา · เก็บเข้าคลัง (+กู้คืน) · ปุ่ม "สะท้อน/เทมเพลต/ติดตาม/อัตโนมัติ/AI" disabled
- service `cards.ts` (เพิ่ม): `updateCardFields(ctx, cardId, { title?, description?, dueAt?: Date|null, startAt?: Date|null, reminderMinutesBefore?: number|null })` (ต้อง EDITOR+ ผ่าน `assertBoardRole` · มองไม่เห็น → KanbanNotFoundError · VIEWER → KanbanForbiddenError · title trim ว่าง → throw ไทย · startAt > dueAt → throw ไทย · description ผ่าน `sanitizeDescription` · เปลี่ยน dueAt → reset `reminderSentAt`) · `duplicateCard(ctx, cardId) → card` (คอลัมน์เดิม ต่อจากต้นฉบับ · cardNo ใหม่ · ชื่อ + " (สำเนา)" · คัดลอก description/dueAt/startAt/labels/assignees · ไม่คัดลอก completedAt/reminderSentAt) · `archiveCard(ctx, cardId)` (archivedById) · `restoreCard(ctx, cardId)` (คอลัมน์เดิม ARCHIVED → ท้ายคอลัมน์แรก) · `listArchivedCards(ctx, boardId, { q? })`
- `src/lib/modules/kanban/sanitize.ts` (pure): `sanitizeDescription(html|null|undefined) → string` allowlist p/br/h1/h2/ul/ol/li/strong/b/em/i/s/code/a(href http(s) only, rel=noopener) — ตัดแท็ก/attribute อื่นทั้งหมด (script/iframe/img/on*/javascript:) · `renderDescription(text) → html` markdown-lite (บรรทัด `- ` → ul/li · `**x**` → strong · ขึ้นบรรทัด → p) แล้ว sanitize
- actions: `updateCardFieldsAction` · `duplicateCardAction` · `archiveCardAction`/`restoreCardAction` (เรียก cards.ts · ทุกตัวตรวจ EDITOR+) · UI testid: `card-back card-title card-title-input card-description card-due card-labels card-members card-archive card-close` · `role="dialog" aria-modal` · Esc ปิด · URL `?card=` sync (replaceState)
- Oracle: เปิดด้วย `?card=` · แก้ชื่อ/รายละเอียด (sanitize ตัด `<script>`) · ตั้งกำหนดส่ง/วันเริ่ม (Bangkok) · ทำสำเนาได้ cardNo ใหม่ · เก็บ/กู้คืน (คอลัมน์เดิมถูกเก็บ → คอลัมน์แรก) · VIEWER เห็นแต่ไม่มีปุ่มแก้ (DOM ไม่มี) และ action ปฏิเสธ · ภาพเทียบ mockup 03 (โครงหลัก)

### K1.7 — เช็คลิสต์ (Sonnet · `qc-kanban-k1.7.mts` เขียนแล้ว 21 ข้อ)
ตาราง `KanbanChecklist {id tenantId cardId title position createdAt}` · `KanbanChecklistItem {id tenantId checklistId text done position assigneeUserId? dueAt? doneAt? doneById? createdAt}` (cascade) · service `checklists.ts` (ทุกตัว assertBoardRole EDITOR+ ผ่านการ์ด): `createChecklist(ctx,cardId,title) → row` · `renameChecklist(ctx,id,title)` · `deleteChecklist(ctx,id)` · `addItem(ctx,checklistId,text,{assigneeUserId?,dueAt?}) → row` (assignee ต้องเป็น membership ร้าน · รวมต่อการ์ด ≤ `KANBAN_LIMITS.checklistItemsPerCard`) · `toggleItem(ctx,itemId,done)` (done → doneAt/doneById · false → null) · `editItem(ctx,itemId,{text?,assigneeUserId?,dueAt?})` · `deleteItem` · `moveItem(ctx,itemId,{beforeItemId?,afterItemId?})` (ordering.ts) · `getCardChecklists(ctx,cardId) → [{id,title,position,items[],progress{done,total}}]` · `listMyChecklistItems(ctx,userId) → [{id,text,dueAt,done,card{id,title,cardNo,boardId}}]` (เฉพาะ done=false · บอร์ดที่ actor มองเห็น) · ครบทุกข้อ → outbox `kanban.checklist.completed` (idempotency `#<checklistId>#<ts>` — ครบใหม่หลังติ๊กออกได้ใบใหม่) + consumer · UI `Checklist.tsx` testid `checklist checklist-item checklist-progress` + "ซ่อนรายการที่ทำแล้ว" · Card.tsx ตรา n/m · UI ตามภาพ 03 (แถบความคืบหน้า · ซ่อนที่ทำแล้ว · มอบหมาย/กำหนดวันรายรายการ) · งานของฉันมีส่วน "รายการเช็คลิสต์ที่มอบหมายให้ฉัน" · event `kanban.checklist.completed` เมื่อครบ · Oracle: CRUD · reorder · ครบ → event · my-tasks เห็นรายการที่มอบหมาย

### K1.8 — ความเห็น + mention + แจ้งเตือนตรงคน (Opus · `qc-kanban-k1.8.mts` เขียนแล้ว 19 ข้อ)
ตาราง `KanbanComment {id tenantId cardId authorUserId body mentions Json editedAt? deletedAt? createdAt}` · markup mention ใน body = `@[ชื่อ](userId)` · service `comments.ts`: `addComment(ctx,cardId,body) → row` (EDITOR+ หรือคีย์ `kanban.card.comment` · body trim ว่าง → throw ไทย · แยก mentions จาก markup · แจ้งเตือนคนที่ถูก mention ยกเว้นตัวเอง: `AppNotification{recipientUserId, body มีชื่อผู้เขียน+ชื่อการ์ด+ลิงก์ ?card=}` + `sendPushToUser` · คนที่ถูก mention แต่ไม่ใช่สมาชิกบอร์ด PRIVATE → `addMember VIEWER` อัตโนมัติ + ข้อความบอก · outbox `kanban.comment.added` (#commentId · payload ไม่มี tenantId) + consumer) · `editComment(ctx,id,body)` (ผู้เขียนเท่านั้น · editedAt · mentions คำนวณใหม่) · `deleteComment(ctx,id)` (ผู้เขียน หรือ ADMIN · soft `deletedAt`) · `listComments(ctx,cardId) → [{id,body,author{userId,name},mentions,createdAt,editedAt}]` (ไม่รวมที่ลบ · เก่า→ใหม่) · `src/lib/modules/kanban/notify.ts` = ตัวช่วยกลาง (in-app + `sendPushToUser` ใหม่ใน `core/push.ts` + อีเมล mention ถ้ามี RESEND) ที่ K1.1 `notifyAssignment` ย้ายมาใช้ · UI `Comments.tsx` testid `comment-input mention-menu` (autocomplete @ สมาชิกร้าน) · Oracle: notification ถึงคนที่ถูก mention เท่านั้น (คนอื่นไม่เห็น) · push ถูกเรียก (mock) · auto-VIEWER · ลบความเห็นคนอื่นต้อง ADMIN

### K1.9 — ไฟล์แนบ + ปก (Sonnet · `qc-kanban-k1.9.mts` เขียนแล้ว 17 ข้อ)
ตาราง `KanbanAttachment {id tenantId cardId fileId(FileAsset) name contentType bytes uploadedById createdAt deletedAt?}` · service `attachments.ts`: `addAttachment(ctx, cardId, { filename, contentType, data: Uint8Array }, deps?: UploadDeps) → { id, fileId, name, contentType, bytes, url }` (EDITOR+ หรือคีย์ `kanban.card.attach` · ตรวจ magic bytes ตรงกับ contentType ที่ประกาศ (png/jpg/gif/webp/pdf/… ตาม `ALLOWED_UPLOAD_TYPES`) ไม่ตรง/ชนิดไม่อนุญาต → throw ไทย · ≤ `KANBAN_LIMITS.attachmentMaxBytes` · นับที่ยังไม่ลบ ≤ `attachmentsPerCard` · เรียก `uploadFile(ctx, { kind: "ATTACHMENT", maxBytes }, deps)` ของ storage (path ใต้ `t/<tenantId>/`) · activity ATTACHMENT_ADDED (K1.10)) · `setCover(ctx, cardId, attachmentId|null)` (ต้องเป็นรูป ไม่งั้น throw ไทย → `coverFileId`) · `removeAttachment(ctx, id)` (soft `deletedAt` · ถ้าเป็นปก → `coverFileId=null`) · `listAttachments(ctx, cardId) → [{id,name,contentType,bytes,url,isCover,uploadedBy{name},createdAt}]` (VIEWER ดูได้) · UI `Attachments.tsx` testid `attachment-list attachment-upload` + "ตั้งเป็นปก" · actions `uploadAttachmentAction(FormData)` `removeAttachmentAction` `setCoverAction` · Card.tsx โชว์ปก + ตราจำนวนไฟล์ · Oracle: อัปโหลด png/pdf ผ่าน · exe/ปลอมนามสกุล → ปฏิเสธ · >10MB → ปฏิเสธ · ข้ามร้านเข้าถึงไม่ได้ · ปกโผล่บนการ์ด

### K1.10 — ประวัติกิจกรรม (Opus · `qc-kanban-k1.10.mts` เขียนแล้ว 16 ข้อ)
ตาราง `KanbanActivity {id tenantId boardId cardId? actorUserId? type KanbanActivityType data Json createdAt @@index([cardId,createdAt(sort:Desc)]) @@index([boardId,createdAt(sort:Desc)])}` · enum ≥ 24 ชนิด: BOARD_CREATED/UPDATED/ARCHIVED · MEMBER_ADDED/ROLE_CHANGED/REMOVED · COLUMN_CREATED/UPDATED/MOVED/ARCHIVED · CARD_CREATED/UPDATED/MOVED/ASSIGNED/UNASSIGNED/DUE_SET/LABELED/UNLABELED/ARCHIVED/RESTORED/COMPLETED · CHECKLIST_ITEM_DONE · COMMENT_ADDED · ATTACHMENT_ADDED · service `activity.ts` (append-only ไม่มี update/delete): `logActivity(db|tx, { tenantId, boardId, cardId?, actorUserId?, type, data })` ที่ทุก service เรียก **ใน tx เดียวกับงาน** (data: MOVED `{fromColumnId,toColumnId}` · DUE_SET `{dueAt ISO}` · ASSIGNED/UNASSIGNED `{userIds}` · LABELED `{labelIds}` · UPDATED `{fields}`) · `listCardActivity(ctx, cardId, { take=50, cursor? }) → { items:[{id,type,actor{userId,name}|null,data,createdAt}], nextCursor }` (ล่าสุดก่อน) · `listBoardActivity(ctx, boardId, …)` (รวมระดับบอร์ด+การ์ด) · `listCardTimeline(ctx, cardId, { filter: "all"|"comments"|"activity", take?, cursor? }) → { items:[{kind:"comment"|"activity", …}] }` · UI `Timeline.tsx` testid `timeline timeline-filter` (ทั้งหมด/ความเห็น/กิจกรรม ข้อความไทย) · BoardHeader/BoardMenu รายการ "กิจกรรมของบอร์ด" · AuditLog กลางยังคงสำหรับเรื่องสิทธิ์ (K1.3) · Oracle: ทุกการกระทำหลักมี activity ชนิดถูกต้อง · ข้ามการ์ดไม่เห็น · เรียงล่าสุดบน · pagination 50

### K1.11 — ตัวกรอง + ค้นหา (Sonnet)
URL `?assignee=me|<id>&label=<id>&due=overdue|today|week|none&status=done|open&q=` · แถบตัวกรองใต้หัว "แสดง n จาก m การ์ด" + ล้าง · `f`/`x` ปุ่มลัด (K1.14 เปิดใช้) · ค้นหาข้ามบอร์ด `Ctrl K` palette: ไวยากรณ์ `@ฉัน` `ป้าย:ด่วน` `เลยกำหนด` `บอร์ด:ชื่อ` ข้อความ · service `search.ts` (เฉพาะบอร์ดที่ `visibleBoardsWhere`) · Oracle: ตัวกรองแต่ละแกน + ผสม · ลิงก์เปิดซ้ำได้ผลเดียวกัน · ค้นหาไม่เห็นบอร์ด PRIVATE ที่ไม่ใช่สมาชิก · Thai tokens

### K1.12 — เทมเพลต + หน้ารวมบอร์ดใหม่ (Sonnet)
ตาราง `KanbanBoardTemplate {id tenantId? scope PLATFORM|TENANT key name description icon structure Json}` (tenantId null → whitelist ใน tenant extension) · 6 ชุด seed (ร้านดำน้ำ · โรงแรม · ร้านอาหาร · คลินิก · ค้าปลีก · งานประจำสัปดาห์) · `createBoardFromTemplate` atomic (คอลัมน์+ป้าย+การ์ดตัวอย่าง+เช็คลิสต์ · การ์ดจากเทมเพลตไม่มี assignee · sourceType TEMPLATE) · "บันทึกบอร์ดนี้เป็นเทมเพลตของร้าน" · หน้ารวมบอร์ดตามภาพ 01 (ดาวก่อน · จัดกลุ่มสาขา · กลางองค์กร · แถวเทมเพลต · ค้นหา · ตัวกรองสาขา) · empty state "ยังไม่มีบอร์ด" · Oracle: สร้างจากทั้ง 6 ตรง structure · atomic (fail กลางไม่มีเศษ) · หน้ารวมเรียงถูก · ภาพเทียบ 01

### K1.13 — มือถือ + งานของฉันใหม่ (Sonnet)
มือถือ 390: คอลัมน์เลื่อน snap + จุดบอกตำแหน่ง · กดค้าง 300ms ยกการ์ด (pointer events) · ปัดขวา → ย้ายเข้า done column (ถ้ามี) / ซ้าย → เก็บ + toast undo 5 วิ (`z`) · หลังการ์ดเต็มจอ ช่องความเห็นติดขอบล่าง · FAB + · งานของฉัน (ภาพ 06 ขวา · ฝั่งซ้ายกล่องงานเข้าเป็น K2.8): 4 ตัวเลข · จัดกลุ่ม เลยกำหนด/วันนี้/สัปดาห์นี้/ไม่กำหนด · ซ่อนงานเสร็จ · ติ๊กเสร็จได้จากรายการ · pagination · Oracle+ภาพ mobile เทียบ 07 (ก)(ข)(ค) + puppeteer touch swipe

### K1.14 — ปุ่มลัด · empty state · realtime · คลังเก็บ · เมนู (Opus)
ปุ่มลัดตาม §5.6 (`?` แสดงรายการ · ปิดได้ใน `/app/settings` ผู้ใช้ · ไม่ทำงานเมื่อ focus อยู่ใน input/textarea/contenteditable หรือ IME composing) · empty state ทุกหน้าตาม §5.7 · realtime: `publish(kanbanChannel(tenant,board), {type:"card.moved"|...})` จากทุก mutation (หลัง commit) + client subscribe/polling fallback (`realtimeMode()`) · หน้าคลังเก็บ `/kanban/b/{id}/archive` (การ์ด/คอลัมน์ · กู้คืน · ค้นหา) · เมนู 7 หมวด (`childrenFor("KANBAN")` + `kanbanTabs()` ตรงกัน — หน้าที่ยังไม่มาให้ซ่อนหรือ "เร็ว ๆ นี้") · Oracle: 2 หน้า puppeteer เห็นการย้ายกันใน 2 วิ (polling mode ใน QC) · ปุ่มลัดไม่ทำงานในช่องพิมพ์ · empty state ทุกหน้ามีปุ่มขั้นต่อไป · คลังเก็บกู้คืน

## บันทึกเหตุการณ์ (ล่าสุดบนสุด · เวลาไทย)
- 05:59 น. — K1.3 ปิด (Opus 18 นาที) · D16 สิทธิ์คอลัมน์ EDITOR · ความคืบหน้า P1 3/15 · เริ่ม K1.4
- 05:46 น. — prod: READY `b8c7f76` + migration kanban_v2_b ลง prod · backfill B บน prod touched 0 (การ์ดจริงยังไม่มีป้าย/ผู้รับ) · oracle K1.9/K1.10 เขียนแล้ว
- 05:39 น. — K1.2 ปิด (Opus 17 นาที) · ยอมรับ 2 deviation: `db.ts` chokepoint (F5 นับไฟล์ · จะ port tenantDb ที่เดียว) · CardLabel/CardAssignee ลงทะเบียน scope = tenant (ไม่มี systemId จริง) · ความคืบหน้า P1 2/15 · เริ่ม K1.3
- 05:25 น. — prod: Vercel READY `8a35ad3` + migration kanban_v2_a ลง prod แล้ว · Fable รัน backfill A บน prod: 8 บอร์ด · 24 คอลัมน์ · 1 การ์ด ได้ position/cardNo · บอร์ดเดิมทั้ง 8 → TENANT (ไม่มีใครหลุดสิทธิ์) · รันซ้ำ touched 0 · oracle K1.5 (static+action 17 ข้อ) เขียนแล้ว
- 05:19 น. — K1.1 ปิด (Opus 22 นาที) · ความคืบหน้า P1 1/15 · เริ่ม K1.2
- 6 ก.ย. 05:10 น. — เจ้าของทัก "ยังขาดระบบ api" → เพิ่ม D15 + WO K1.15 (REST+AI ของบอร์ดงาน ทะเบียนเดียวแบบบัญชี) · พิมพ์เขียว v2 เสร็จ 1,225 บรรทัด (Opus 26 นาที)
- 6 ก.ย. 00:25–04:50 น. — เตรียม run (worktree · ledger · seed · oracle K1.1 · พิมพ์เขียว v2 โดย Opus) · 04:55 เริ่ม K1.1 (Opus) · worktree + ledger · Opus เขียนพิมพ์เขียว v2 ขนาน
