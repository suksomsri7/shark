# WO C1.5 — ดีล v2 (service + กระดาน/ตาราง/พยากรณ์ + 360 + pipelines/ขั้น/เหตุผลแพ้) + ประตู uiVersion

> RUN "CRM v2" · branch `session/crm` · 18–19 ก.ย. 2569 · ผู้คุมงาน: Opus 5
> ข้อสอบ: `scripts/qc-crm-c1.5.mts` (103 ข้อ) · ORACLE-EDIT 3 จุด: `qc-member-fix-s2` S2-M12.2 · `qc-crm-c1.1` S8.1 · (C0.2 ผ่านโดยย้าย export เข้าบล็อก) · probe 21/21 + ประตู uiVersion 14/14

## 1. สิ่งที่ส่งมอบ
- `crm/deals.ts` (~1,900 บรรทัด) · `deals-shared.ts` · `pipelines.ts` · `lost-reasons.ts` · action 3 ไฟล์ · v1 `service.ts` createDeal/moveDeal/issueQuotation = wrapper บาง (ลายเซ็นเดิม)
- convert (C1.4) สร้างดีลผ่าน `deals.createDeal(…, tx)` → `crm.deal.created` หนึ่งครั้งใน tx เดียว
- เพดาน ฿20 ล้าน · มูลค่า = Σ บรรทัด (สุทธิก่อน VAT) · ส่วนลดเกินเพดาน → คำขออนุมัติ `crm.discount` (ต่อการยื่น) · ใบเสนอราคา/ใบแจ้งหนี้ idempotent (advisory lock + ใช้ใบที่แปลงแล้วซ้ำ · บรรทัดเปลี่ยน = ต้องออกใบเสนอราคาใหม่)
- won ยิงครั้งเดียวต่อการเปลี่ยนเข้า WON จริง · ทาง v1 คงคีย์ต่อดีล (ครั้งเดียวตลอดชีวิตดีลเหมือนเดิม) · แคชบริษัทคำนวณใน tx เดียวใต้ล็อกบริษัท · พยากรณ์/ผลรวมคอลัมน์ใน SQL (bigint — ทดสอบ > 2³¹)
- hook ลากร่วม `usePointerBoardDrag` (บอร์ดงานเหมือนเดิมทุกพฤติกรรม — ผู้ตรวจเทียบบรรทัดต่อบรรทัด)
- 🔴 **ประตู uiVersion (แก้เหตุการณ์หน้า v2 หลุด)**: `crm/ui-version.ts` · หน้าที่มีใน v1 (ผู้ติดต่อ · ดีล) แสดง v1 ทุกไบต์เมื่อ ≠ 2 · route v2 ทั้ง 11 `notFound()` · ลิ้นชัก/แท็บ v1 = ก่อน C1.3 ทุกตัว · action v2 ปฏิเสธ · seed QC ตั้ง 2

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน (tree หลัก · `.qc-shots/crm/c15-verify2.log`) |
|---|---|---|---|
| D2 | ผู้คุมงานรันเอง | ✅ | **103/103** |
| D3 | กลุ่ม X | ✅ | ข้อสอบ X1/X3 (4 โปรเซส · merge/recompute ∥ move ไม่มี 40P01)/X4/X6/X8/X9 + probe 21/21 (won-once · v1 bounce · reopen ต้องมีเหตุผล · convert ∥ move→WON · archive race · ลบดีลที่มี record · ใบแจ้งหนี้ขนาน 6 = 1 ใบ · ผลรวม > 2³¹) + probe ประตู 14/14 |
| D4 | regression | ✅ | C1.4 110 · C1.3 89 · C1.2b 93 · C1.2a 91 · C1.1 50 · C0.2 27 · C0.3 88 · qc-crm · crm-activity · acc-v2 · nav · form · ai-tools · approval ×3 · automation · webhook · account-api-write-docs · acc-v2-editor · บอร์ดงาน k1.5/k1.9/k2.1–k2.12/k3.3 · สมาชิก m1.2/1.4/fix-s1/fix-s2 เขียว — แดงเฉพาะภาพ/`.claude/skills`/log qc-all เก่า · m3.6 S4.1 = flake พิสูจน์ต้นเหตุแล้ว |
| D5/D6 | typecheck · fitness · build | ✅ | exit 0 · 29/29 ×2 · build exit 0 |
| D7 | ภาพ | ✅ | 1.5 × owner/thana/nok/manager (กระดาน/ตาราง/พยากรณ์/360/สร้าง/pipelines) + 1.4/1.3 owner (หลังประตู) |
| D9 | ผู้ตรวจ | ✅ | ไม่มี BLOCKER · SHOULD-FIX 12 → แก้ครบ |
| D11 | m1.9 | ✅ | 26/26 ×3 |

**PARITY: ผ่าน** — กระดานเทียบภาพ 02: คอลัมน์ตามขั้น (จำนวน · รวม · ถ่วงน้ำหนัก) · การ์ด (ชื่อ · บริษัท · มูลค่า · คะแนน · ปิดคาด · ขั้นถัดไป · ผู้ดูแล) · สลับ บอร์ด/ตาราง/forecast · ต่าง: ตัวกรองเป็นฟอร์มแทนชิป · คอลัมน์ที่ 5 ต้องเลื่อนที่ 1440

## 8. หนี้
| เรื่อง | เจ้าของ |
|---|---|
| หน้า `/crm/settings` รวม (R-A) · การ์ดตั้งค่า | **C1.10** |
| กระดาน/ส่งออกยังไม่ผ่าน contactWhere/companyWhere | **C1.7** |
| ผู้อนุมัติเห็นแค่ยอด ไม่เห็นบรรทัด | **C2.7** |
| `CrmDeal.archivedAt` (soft delete) · enum `CrmActivitySource.KANBAN` | **C2.0** |

## 3.2 D12 — push/deploy
✅ push `a7312fb` (+ `cb7a6de`) → session/crm + main · deploy ใหม่ `dpl_FaUSs…` ขึ้นจริงหลัง 360 วิ (02:31 น. 19 ก.ย.) · health `{ok:true,db:true,outboxPending:0}` · หน้าแรก 200 · ไม่มี migration · **ประตู uiVersion มีผลบน prod ตั้งแต่ deploy นี้**: ร้านทั้งหมด (uiVersion 1) กลับเห็นหน้า/ลิ้นชัก/แท็บ CRM v1 ทุกไบต์ · ช่วงที่หลุด: 18 ก.ย. 21:22 (C1.3) → 19 ก.ย. 02:31 · ⚠️ ผู้คุมงานไม่มี session บน prod จึงยืนยันด้วยตาไม่ได้ — หลักฐาน = probe ประตู 14/14 (v1 component เทียบ `git show` ทุกไบต์ · ลิ้นชัก = ก่อน C1.3 · route v2 404 · action v2 ปฏิเสธ) · ตรวจด้วยตาบน prod ทำใน C6.2
