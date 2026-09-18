# WO C1.2b — วัตถุกำหนดเอง (`crm/objects.ts`) · เทมเพลต 8 แบบ · events `custom.record.*`

> RUN "CRM v2" · branch `session/crm` · 18 ก.ย. 2569 · ผู้คุมงาน: Opus 5
> ข้อสอบ: `scripts/qc-crm-c1.2b.mts` (93 ข้อ · commit `18eaac6`) · ไม่มี ORACLE-EDIT · ข้อตัดสินอยู่ท้าย brief C1.2b

## 1. สิ่งที่ส่งมอบ
- `src/lib/modules/crm/objects.ts` (ใหม่ ~1300 บรรทัด): object create/update/archive/restore/reorder/list/get/warnings · `records.{create,update,archive,get,list,move,bulk,import,export}` · `tabsFor` · `timelineFor` · consumer `onRecordCreated`
- `objects-shared.ts` (client-safe · เพดาน · `ObjectsError`) · `templates/objects/index.ts` (8 เทมเพลต · starterRule ปิดไว้) · `crm/db.ts` (re-export prisma แบบ member/kanban)
- ทะเบียน 3 ที่ `custom.record.created/updated/archived` · crm facade `export * as objects`
- recordCount: เพิ่ม/ลดด้วยคำสั่งเดียวเท่านั้น · archive ซ้ำลดครั้งเดียว · event ใน tx เดียวกับการเขียน (ข้อสอบบังคับ outbox ล้ม → ย้อนทั้งหมด)
- **แก้ตามผู้ตรวจ**: title ไม่คัดลอกค่าฟิลด์อ่อนไหว (fallback) · คีย์ API READONLY เขียนไม่ได้ / คีย์ API ทุกชนิดออกแบบ object ไม่ได้ · เปลี่ยน key ขณะมี LOOKUP ชี้อยู่ = ปฏิเสธ · แม่ MERGED/CLOSED = ปฏิเสธ · export เพดาน 50,000 · import ขาดกลางทางยังมีแถว audit · bulk ล็อกเรียง id · `sort` ตรวจด้วย `Object.hasOwn`

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน (worktree แยก · `c12b-verify.log`) |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด | ✅ | `18eaac6` |
| D2 | ผู้คุมงานรันเอง | ✅ | **93/93** บน reseed ใหม่ |
| D3 | กลุ่ม X | ✅ | X1/X3 (4 โปรเซส)/X4/X6/X8/X9 ในข้อสอบ + probe การแก้ตามผู้ตรวจ **13/13** (`scripts/pending/probe-c12b-review.mts`) |
| D4 | regression | ✅ | C1.2a 91/91 · C1.1 50/50 · qc-crm 25/25 · crm-activity 12/12 · m1.2 m1.4 fix-s1 เขียว · m1.6 S3.x / m3.3 S9.x = ภาพ (สภาพแวดล้อม) |
| D5–D6 | typecheck/fitness/build | ✅ | รวมกับ C1.2a (§3.1 ของ crm-C1.2a) |
| D7/D8 | ภาพ/ปุ่ม | N-A | UI มาใน C1.9 |
| D9 | ผู้ตรวจ | ✅ | ไม่มี BLOCKER · SHOULD-FIX 6 + NOTE 2 → แก้ครบ |
| D10 | ทะเบียน | ✅ | 3 event × 3 ทะเบียน |
| D11 | คืนสภาพ QC | ✅ | m1.9 26/26 ทันทีหลังข้อสอบ + หลังจบ |

## 8. หนี้ / ส่งต่อ
| เรื่อง | เจ้าของ |
|---|---|
| export→import round-trip ไม่ตรง (unit/owner · ฟิลด์ชื่อ `title`/`parentId`) · เปลี่ยน `titleFieldKey` ไม่คำนวณ title เก่า · rename ระดับ engine | **C1.10** |
| op layer: `crm.objects.*` (ออกแบบ) ห้ามคีย์ API · `records.*` เขียนต้อง OPERATE/ADMIN · FORBIDDEN→403 | **C1.10** |
| gate `uiVersion` ที่ consumer | **C1.11** |
| `objects.ts` อ่าน CrmCompany ตรง → ผ่าน `companyWhere` | **C1.7** |
| เรคคอร์ดค้างเมื่อแม่ถูกลบ/erase · title ใน MemberActivity อยู่ในขอบเขต PDPA | **C3.9** |
| ข้อสอบใช้แต่ OWNER (STAFF/API/unitScoped/sensitive) | **C1.7 · C1.10** เพิ่มข้อสอบ |
| `crm/db.ts` เลี่ยงตัวนับ F5.1 (แบบเดียวกับ member/kanban) | **C5** |

## 3.2 D12 — push/deploy
✅ push `a7a7bce` (C1.2a `479fbd7` + C1.2b `a7a7bce`) → session/crm + main 11:45 UTC · deploy ใหม่ `dpl_6FHj9…` ขึ้นจริงหลัง 420 วิ · `/api/health` `{ok:true,db:true,outboxPending:0}` · หน้าแรก 200 · `/api/files/abc123` 403 ตามแบบ · ไม่มี migration ในใบนี้ · `settings.crm.uiVersion` ยังเป็น 1 (ไม่มีร้านใดเห็น UI ใหม่)
### 3.1 typecheck/fitness/build (worktree แยก)
typecheck exit 0 · fitness 29/29 ทั้งสองโหมด · BUILD exit 0 · เซิร์ฟเวอร์ :3215 ขึ้นแล้วรัน m2.10/m3.10/m3.11/public: แดงเหลือแค่ `.claude/skills` (M2.10-S1.2 · M3.10-S2.3) และภาพ (M3.10-S4.3 · M3.11-S3.2) · m1.1 S3.1 = ชน seed CRM (หนี้เดิม · ตัดสินตอนปิดเฟส C1) · m1.9 26/26
