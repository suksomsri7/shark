# WO C1.3 — บริษัท (service + รายการ + 360 + สร้างใหม่ + รวม/เก็บ/กู้คืน + นำเข้า/ส่งออก)

> RUN "CRM v2" · branch `session/crm` · 18 ก.ย. 2569 · ผู้คุมงาน: Opus 5
> ข้อสอบ: `scripts/qc-crm-c1.3.mts` (89 ข้อ · commit `caa27f0`) · ORACLE-EDIT 1 จุด (S4 fixture — §7) · probe การแก้ตามผู้ตรวจ 24/24

## 1. สิ่งที่ส่งมอบ
- `crm/companies.ts` (~1800 บรรทัด): §5.3 ครบ + `restoreCompany` · `companies-shared.ts` (client-safe · ตรวจเลขภาษี mod-11 · เว็บ http(s) · เพดานนำเข้า/ส่งออก) · `companies-actions.ts` (`"use server"` · `assertCan` · ข้อความไทยตามจริงเมื่อทำไปบางส่วน) · `where.ts` (`companyWhere` · `contactWhere` · `dealWhere` · `activityWhere` — จุดเดียวที่ C1.7 เปลี่ยน) · `nav.ts`
- หน้า `/crm/companies` · `/crm/companies/new` · `/crm/companies/[companyId]` (360 ตามภาพ 04) · `_components/` (ServerPicker ค้นฝั่งเซิร์ฟเวอร์)
- facade: `party.findOrCreateCompany` (จับคู่เฉพาะ COMPANY) · `party.updateCompanyIdentity` (ปฏิเสธ PERSON) · `account.accountSystemForCrm`
- event `crm.company.created/updated/merged` × 3 ทะเบียน · consumer created → `ensureAccountContact` + แถวไทม์ไลน์ (idempotent · ตามไปบริษัทที่รวมแล้ว)
- ลิ้นชัก/แท็บ v1 มี "บริษัท" · ทะเบียนปุ่ม +87 แถว

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน (ผู้คุมงานรันเองใน tree หลัก · `.qc-shots/crm/c13-verify.log`) |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด | ✅ | `caa27f0` SKIPPED ถูกเหตุผล |
| D2 | ผู้คุมงานรันเอง | ✅ | **89/89** บน reseed ใหม่ |
| D3 | กลุ่ม X | ✅ | X1/X3 (4 โปรเซส)/X4/X6/X8/X9 ในข้อสอบ + probe 24/24 (B1 PERSON Party · Party ใช้ร่วม · รวมคนละเลขภาษี + สิทธิ์บัญชี · เลขภาษีตามไปตอนรวม · วงแม่-ลูก · บริษัทในคลัง · ตรวจซ้ำไม่ผ่าน scope) |
| D4 | regression | ✅ | C0.2 27/27 (หลัง ORACLE-EDIT S1.6) · C0.3 · C1.1 · C1.2a · C1.2b · qc-crm 25 · crm-activity 12 · acc-v2 party 36 / contacts 49 / contact-merge 56 · nav-functions 11 · m1.2 · m1.4 · fix-s1 · form 10 · ai-tools 18 |
| D5 | typecheck + fitness | ✅ | typecheck exit 0 · fitness 29/29 ×2 |
| D11 | คืนสภาพ QC | ✅ | m1.9 26/26 ทันทีหลังข้อสอบ + หลังจบ |
| D6 | build | ✅ | รอบแรก OOM ที่ heap 3.5G (หน้าใหม่ทำ build ใหญ่ขึ้น) → รันซ้ำ heap 4.5G exit 0 · 🔴 เฝ้า deploy Vercel (ไม่ได้ตั้ง heap) |
| D7 | ภาพ | ✅ | `.qc-shots/crm/1.3/` owner · thana · manager × 1440/390 × รายการ/สร้าง/360 = 18 ภาพ HTTP 200 · ไม่มี console error · ไม่ล้นแนวนอน · (nok ล้มเพราะ reseed ของ session อื่นลบผู้ใช้กลางรอบ — สเปคใบนี้ต้องการ owner+thana) |
| D8 | ทะเบียนปุ่ม | ✅ | +87 แถว · F14.1/F14.2 เขียว |
| D9 | ผู้ตรวจ | ✅ | **BLOCKER 1** (บริษัทผูก Party ชนิด PERSON — เลขภาษีเจ้าของคนเดียว = เลขบัตร ⇒ เปลี่ยนชื่อ/รวมบริษัท = แก้ตัวตนของคน) + SHOULD-FIX 12 → แก้ครบ · พิสูจน์ด้วย probe 24/24 |
| D10 | ทะเบียน event | ✅ | 3 event × 3 ทะเบียน |

**PARITY: ผ่าน (มีข้อแตกต่างที่ยอมรับ)** — 360 เทียบภาพ 04: หัว (ชื่อ · ป้ายลูกค้า · คะแนน · เลขภาษี/อุตสาหกรรม/ขนาด/ผู้ดูแล/ทีม) · ตัวเลข 5 ช่อง · แท็บ ภาพรวม/ผู้ติดต่อ/ดีล/เอกสารบัญชี/สัญญา(กำหนดเอง)/ไทม์ไลน์ · ตารางผู้ติดต่อ (บทบาท/หลัก/ช่องทาง) · ดีล + เอกสารบัญชี · ไทม์ไลน์รวม · แถบขวา ผู้ช่วย AI / Portal / บริษัทในเครือ — ตรง · ต่าง: ปุ่ม "+เพิ่มผู้ติดต่อ/เปิดดีลใหม่" อยู่ใต้ชื่อแทนชิดขวา · ตารางสัญญาในแท็บภาพรวมยังไม่มี (UI วัตถุกำหนดเองมาใน C1.9) · AI/Portal เป็นป้าย "เร็ว ๆ นี้" (C3.x) · ภาพ `.qc-shots/crm/1.3/crm-company-360-owner-desktop.png`
- 🔧 **ACCEPTANCE-FIX ของผู้คุมงาน (≤20 บรรทัด)** เจอจากการดูภาพ: 360 โชว์ "มูลค่ารวม (ชนะ) ฿0" ทั้งที่มีดีลชนะ ฿60,000 — ดีล WON ก่อน C1.5 ไม่มี `wonValueSatang` ⇒ ทั้งแคช (`recomputeCachesInTx`) และ 360 นับ `COALESCE(wonValueSatang, valueSatang)` · ข้อสอบ 89/89 + probe 24/24 หลังแก้ · (ลองแก้ "กิจกรรมล่าสุด" ให้คิดสดด้วย → ขัดสัญญาข้อสอบที่ถือแคชเป็นความจริง ⇒ ถอยกลับ · แคช `lastActivityAt` ไม่มีใครดูแล → หนี้ C1.6)
- 🔧 **seed-crm-qc คำนวณแคชบริษัท** (openDealCount · wonValueSatang · lastActivityAt) ด้วยสูตรเดียวกัน ไม่ยิง event — ภาพรายการเคยโชว์ "ดีลเปิด 0" ทุกบริษัท · รันซ้ำ C1.1 50/50 · qc-crm 25/25 · crm-activity 12/12 · m1.9 26/26

## 7. สิ่งที่เจอ/แก้/ตัดสิน
- ORACLE-EDIT `C1.3-S4.x` (fixture ให้บริษัทที่รวมมีเลขภาษีต่างกัน ขัดข้อตัดสิน SF2) · ORACLE-EDIT `C0.2-S1.6` (ข้อสอบเน่า: facade โตตามใบ — ยกเว้นเฉพาะ export ในบล็อกของใบ · positive control ผ่าน)
- 🔴 builder C1.4 รับ cwd ของผู้คุมงาน ⇒ ทำงานใน worktree แยก — รอบตรวจ C1.3 ที่ปนถูกทิ้ง ตรวจใหม่ใน tree หลัก

## 8. หนี้ / ส่งต่อ
| เรื่อง | เจ้าของ |
|---|---|
| แคช `CrmCompany.lastActivityAt` ต้องถูกอัปเดตเมื่อบันทึกกิจกรรม | **C1.6** |
| backfill บน prod ต้องคำนวณแคชบริษัททุกแห่งหลังผูกดีล (ไม่งั้นรายการโชว์ 0) | **C6.1** |
| นับผู้ถือ AccountContact แบบ count ตรงใน tx (ไม่มีตัวนับข้ามสมุดใน facade บัญชี) · เลือกผู้ติดต่อใน picker 30 แถว | **C5** |
| ไม่มี unique "ผู้ติดต่อหลักหนึ่งคนต่อบริษัท" ระดับ DB (partial unique index) | **C2.0** |
| `objects.ts` อ่าน CrmCompany ตรง | **C1.7** |
| ป้ายไทยของสิทธิ์ `crm.company.*` | **C1.7** |
| AccountContact ไม่ถูกเปลี่ยนชื่อ/เลขภาษีตามบริษัท (ไม่มีฟังก์ชันใน facade บัญชี) | **C1.8** (สะพานบัญชี) |
| custom values ของบริษัทที่ถูกรวมไม่ย้ายตาม | **C1.10** |

## 3.2 D12 — push/deploy
✅ push `4f8af9d` (+ ledger `3215db3`) → session/crm + main · deploy ใหม่ `dpl_3DxVs…` ขึ้นจริงหลัง 420 วิ (build บน Vercel ไม่ OOM) · `/api/health` `{ok:true,db:true,outboxPending:0}` · หน้าแรก 200 · ไม่มี migration · uiVersion ยัง 1 ทุกร้าน
