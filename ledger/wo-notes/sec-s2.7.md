# WO S2.7 + S2.8 + S2.9 (ชุด S2-7) — หน้าตั้งค่าเลขาทั้งโซน B1–B8

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `/root/projects/shark-sec-c` branch `wip/sec-s2.7` · 2026-11-04/05 UTC · builder: ตัวแทน
> ใบสั่ง `ledger/secretary-briefs/sec-brief-S2.7.md` (+ COMMON + RESOLUTIONS §F §C.6 R-K3b §L.2 §K §O) · ภาพ `ledger/design-secretary/sec-b.jpg` หน้า 1–8 + `sec-dark-b.jpg`
> ข้อสอบ: `SPEC=scripts/qc-sec-specs/s2.7.json scripts/qc-sec-screen.mts` (16 ข้อ · **ไม่แก้ spec/oracle**)
> สัญญา API: S1.14 ยังไม่ merge เข้าทิปนี้ ⇒ ชื่อเส้น/รูป DTO อ่านจาก `wip/sec-s1.14` @ deea0555 (`src/app/api/mobile/secretary/**` + `src/lib/ai/secretary/dto.ts` + `docs/api/SECRETARY-API.md` ฉบับนั้น) — ทุกเส้นอยู่ในตาราง `PATH`/`ID_PATH` ของ `src/api/secretary.ts`

## สถานะ: เสร็จ (รอผู้คุมรันซ้ำ + ดูภาพคู่) — ไม่ push

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `apps/mobile/app/(app)/secretary/settings/index.tsx` | เขียนใหม่ (แทน SecSkeleton) | เมนูตั้งค่า (SecTopBar โซนเลขา) 9 แถว → B2 B8 B3 B4 B5 B6 B7 G4 + "สลับกิจการ" = เปิด BusinessSwitcherSheet (B1 ของ S2.1) · ค่าขวา: ชื่อเลขา · % โควตา · "เจ้าของเท่านั้น" เมื่อไม่ใช่ OWNER |
| `…/settings/secretary.tsx` (B2) | เขียนใหม่ | GET/PUT `secretary` · ชื่อ (1–30) · น้ำเสียง Segment · คำลงท้าย Segment (ครับ/ค่ะ/ไม่ระบุ) · ภาษา 4 ชิป (≥1 · ตัวแรก = หลัก) · ตัวอย่างการพูดสด (แม่แบบ i18n) · บันทึก = PUT แล้ว `loadSecretaryMe(force)` · สถิติ 4 ช่องจาก quota/inbox-count/rooms · แถวลิงก์ท้ายหน้าตามแบบ |
| `…/settings/quota.tsx` (B8) | เขียนใหม่ | GET `secretary/quota` · % ใหญ่ + แถบ (ตัด 0..100) · "ใช้ไปแล้ว N/limit งาน · รอบใหม่ <วันไทย> (อีก n วัน) · เหลือ n งาน" · สถานะ ok/warn (ข้อความเซิร์ฟเวอร์) · แพ็กเสียเงิน = การ์ดจาง "เร็ว ๆ นี้" · ผู้ช่วยวันนี้ = % · **ไม่มี $ / balance / USD ในไฟล์ (ไม่มี template literal ด้วย)** |
| `…/settings/access.tsx` (B3) | เขียนใหม่ | GET/PUT `secretary/access` · การ์ดต่อระบบ (SysBadge + ชื่อ + คำอธิบาย) + LevelPicker OFF/READ/DRAFT + "ทำเองได้" ล็อก · OWNER เท่านั้น (บทบาทจาก /me) — อื่น ๆ อ่านอย่างเดียว + ป้าย · เปลี่ยน = แสดงทันที → PUT → ล้มคืนค่า + ข้อความไทยของเซิร์ฟเวอร์ |
| `…/settings/rules.tsx` (B4) | เขียนใหม่ | GET/PUT `secretary/rules` · 5 แถวตามแบบ: เงินออก (ล็อก) · money.limit (สวิตช์ + วงเงินบาท ↔ limitSatang) · chat.send · ลบ/ยกเลิก (ล็อก) · pii.export (ล็อกเมื่อ alwaysApprove มี piiExport) · ผู้อนุมัติ = รายชื่อ OWNER/MANAGER จาก `secretary/staff` (ยิงเฉพาะ OWNER/MANAGER) ไม่งั้นแถวตามบทบาท |
| `…/settings/log.tsx` (B5) | เขียนใหม่ | GET `secretary/log?take&day&module` · ชิป ทั้งหมด/วันนี้/ย้อนได้/ระบบ · ไทม์ไลน์ LogItem · ย้อน = POST `log/[id]/undo` body `{}` (ไม่ส่ง now · §K) → แสดง note ไทยของเซิร์ฟเวอร์ → โหลดใหม่ · ชื่อผู้สั่ง/ผู้อนุมัติจาก staff (OWNER/MANAGER) |
| `…/settings/knowledge.tsx` (B6) | เขียนใหม่ | ความจำรอยืนยัน (`memories/pending` · OWNER เท่านั้น) ยืนยัน/ลบ · บทเรียน (`lessons` ไม่แสดง REJECTED) ยืนยัน (PENDING)/ไม่ใช่ · ลิงก์ไปห้องต้นทาง · ข้อมูลสด `digest` เป็นแถวตัวเลข (ยอดขาย/7 วัน/ลูกค้าเงียบ/ใกล้หมด/ค้างรับ/นัดพรุ่งนี้/ค้าง >2 วัน) |
| `…/settings/customers.tsx` (B7) | เขียนใหม่ | GET/PUT `secretary/after-hours` (OWNER เท่านั้น · บทบาทอื่นไม่ยิง) · สวิตช์ reply + handoff · ช่อง disclosure ตรวจในแอปด้วย `disclosureProblem` (ว่าง/ไม่มี AI-เอไอ-ผู้ช่วย/>200) ก่อน PUT · ตัวอย่างข้อความ = คำนำหน้าคงที่ + คำตอบตัวอย่าง + disclosure · แถว "เวลาทำการ" → `/` `?open=/app/` · การ์ด PDPA 2 ใบ |
| `apps/mobile/src/components/secretary/SettingRow.tsx` | ใหม่ | `SettingsTop` (กลับ + ชื่อ) · `SettingRow` · `Toggle` (role switch · `locked`) · `OwnerOnlyBadge` |
| `…/components/secretary/{LevelPicker,RuleRow,LogItem,QuotaRing}.tsx` | ใหม่ | ตามชื่อ (QuotaRing = % ใหญ่ + แถบไล่สี · ไม่มี svg) |
| `…/components/secretary/bkk.ts` | ใหม่ (นอกรายการ) | เวลาไทย (HH:MM · YYYY-MM-DD · วัน/เดือน · วันถึง) + สตางค์→บาท |
| `apps/mobile/src/api/secretary.ts` | ขยาย | PATH +9 เส้น (`secretary`=`/api/mobile/secretary/secretary` ฯลฯ) · `secPut` · `secPostId/secDeleteId` (ID_PATH) · type ของ DTO ตั้งค่า · `quotaNumbers` (cap 100 · ไม่คืนเงิน) · `logCanUndo` · `disclosureProblem` · `SUFFIXES` · `useActiveRole` · `serverNote` |
| `apps/mobile/src/i18n/{th,en}.ts` | แก้ | +181 คีย์ `sec.set.* sec.me.* sec.quota.* sec.access.* sec.rules.* sec.log.* sec.know.* sec.cust.* sec.month.* sec.money.baht sec.date.dm` (ชุดเดียวกัน · en ไม่มีอักษรไทย) |
| `apps/mobile/qc/fixtures/secretary/s2.7.json` · `s2.7-staff.json` | ใหม่ | OWNER (+ mock PUT/POST/DELETE สำหรับกดจริง) · STAFF (ไม่มี after-hours/memories/staff = ต้องไม่ถูกยิง) |
| `apps/mobile/qc/fixtures/secretary/s2.1.json` | แก้ (นอกรายการ) | +mock GET ของ 9 เส้นตั้งค่า · expect 8 route ตั้งค่า = testID จอจริง (access ว่าง = `sec-access` เท่านั้น เพราะ s2.1 access = `{items:[]}`) — ถ่ายชุด S2.1 ทั้ง 24 route ซ้ำได้สะอาด (48/48 ok ในโฟลเดอร์ชั่วคราว) |
| `scripts/sec-ui-inventory.json` | แก้ | +18 แถวปุ่มของ S2.7–S2.9 |

## 2. ผลข้อสอบ (ทิปหลัง merge session/secretary fb7593f2 = มี S2.12)
- spec oracle forced #1: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}` exit 0
- spec oracle forced #2: `JSON_SUMMARY {"total":16,"passed":16,"failed":[],"skipped":[],"findings":[]}` exit 0 (ทั้งสองรอบรวม M-1 typecheck mobile + D-1/D-2 fitness มี env/ไม่มี env)
- `qc-sec-s2.1` forced: `{"total":14,"passed":14,…}` exit 0 · `qc-sec-s2.12` forced: `{"total":13,"passed":13,…}` exit 0 · spec s2.2 forced: `{"total":11,"passed":11,…}` exit 0
- regression unforced (`qc-sec.sh` + gate lock · SHARK_AI_MOCK=1) = `sec-baseline-bfad2f15.txt`: qc-mobile-app 38/38 exit 0 · qc-mobile-auth 31/31 exit 0 · qc-mobile-chat 29/29 exit 0 · qc-mobile-authz-hotfix 12/12 exit 0
- mobile typecheck 0 · pre-commit fitness ผ่านทุก commit

## 3. ภาพ
คำสั่ง (สำเนา/พอร์ตของเลนนี้ · 4725 ถูกเลน d ใช้ระหว่างทำ ⇒ 4735/4736):
```
R=/secretary/settings,/secretary/settings/secretary,/secretary/settings/quota,/secretary/settings/access,/secretary/settings/rules,/secretary/settings/log,/secretary/settings/knowledge,/secretary/settings/customers
bash scripts/iso.sh env QC_PREPARE=1 QC_COPY=/root/qc-shark-mobile-sec-c QC_PORT=4735 ROUTES=$R FIXTURE=apps/mobile/qc/fixtures/secretary/s2.7.json node apps/mobile/qc/shoot-sec.mjs --both      # 16/16 ok
bash scripts/iso.sh env QC_PREPARE=1 QC_SKIP_EXPORT=1 QC_COPY=/root/qc-shark-mobile-sec-c QC_PORT=4735 ROUTES=<6 route ไม่รวม secretary/quota> FIXTURE=apps/mobile/qc/fixtures/secretary/s2.7-staff.json QC_OUT=$PWD/apps/mobile/qc/shots-sec/s2.7-staff node apps/mobile/qc/shoot-sec.mjs   # 6/6 ok
bash scripts/parity-sec.sh b <หน้า> apps/mobile/qc/shots-sec/secretary-settings-<x>.png apps/mobile/qc/shots-sec/secretary-settings-<x>-b<หน้า>-pair.png [--dark กับ -dark.png → -dark-b<หน้า>-pair.png]
bash scripts/iso.sh node <คัดลอก shots-sec/s2.7-interaction/README-click.mjs.txt เป็น .mjs> /root/qc-shark-mobile-sec-c/dist $PWD/apps/mobile/qc/fixtures/secretary/s2.7.json $PWD/apps/mobile/qc/fixtures/secretary/s2.7-staff.json $PWD/apps/mobile/qc/shots-sec/s2.7-interaction 4736
```
- ภาพคู่ (route ↔ หน้าแบบ · ผู้คุมดู) ใน `apps/mobile/qc/shots-sec/`:
  - `/secretary/settings/secretary` ↔ B2 หน้า 2: `secretary-settings-secretary-b2-pair.png` · `secretary-settings-secretary-dark-b2-pair.png`
  - `/secretary/settings/quota` ↔ B8 หน้า 8: `secretary-settings-quota-b8-pair.png` · `secretary-settings-quota-dark-b8-pair.png`
  - `/secretary/settings/access` ↔ B3 หน้า 3: `secretary-settings-access-b3-pair.png` · `secretary-settings-access-dark-b3-pair.png`
  - `/secretary/settings/rules` ↔ B4 หน้า 4: `secretary-settings-rules-b4-pair.png` · `secretary-settings-rules-dark-b4-pair.png`
  - `/secretary/settings/log` ↔ B5 หน้า 5: `secretary-settings-log-b5-pair.png` · `secretary-settings-log-dark-b5-pair.png`
  - `/secretary/settings/knowledge` ↔ B6 หน้า 6: `secretary-settings-knowledge-b6-pair.png` · `secretary-settings-knowledge-dark-b6-pair.png`
  - `/secretary/settings/customers` ↔ B7 หน้า 7: `secretary-settings-customers-b7-pair.png` · `secretary-settings-customers-dark-b7-pair.png`
  - B1 (หน้า 1) = ชีตสลับกิจการของ S2.1 — ไม่ได้แก้ · `/secretary/settings` ไม่มีภาพคู่ (spec pair:false)
- ภาพเดี่ยว OWNER: `apps/mobile/qc/shots-sec/secretary-settings{,-secretary,-quota,-access,-rules,-log,-knowledge,-customers}{,-dark}.png`
- STAFF อ่านอย่างเดียว (ภาพเดี่ยว · summary แยก `s2.7-staff/summary.json`): `apps/mobile/qc/shots-sec/s2.7-staff/secretary-settings{,-access,-rules,-log,-knowledge,-customers}.png`
- กดจริง `apps/mobile/qc/shots-sec/s2.7-interaction/`: `b2-saved.png` · `b4-toggled.png` · `b3-chat-off.png` · `b5-undone.png` · `b6-acted.png` · `b7-no-ai-rejected.png` · `b7-saved.png` · `results.json` (24/24) · สคริปต์ `README-click.mjs.txt`

### ผลกดจริง (24/24)
B2: บันทึกก่อนแก้ = 0 PUT · ตัวอย่างสดเปลี่ยนตามชื่อ/ค่ะ · บันทึก → `PUT secretary {name:"Nova",suffix:"ค่ะ",tone:"friendly",languages:["th","en"]}` → GET secretary/me ซ้ำ · B4: สวิตช์ล็อก = 0 PUT · chat.send → `{key:"chat.send",enabled:false}` · วงเงิน 30000 → `{key:"money.limit",limitSatang:3000000}` · B3: ช่อง "ทำเองได้" = 0 PUT · chat→ปิด → `{module:"chat",level:"OFF"}` · B5: ปุ่มย้อนมีแค่ l2 · ย้อน → `POST log/l2/undo` body `{}` · note เซิร์ฟเวอร์ขึ้น · l6 ขีดฆ่า · วันนี้ → `?day=2026-11-05` · CRM → `?module=crm` · B6: REJECTED ไม่แสดง · `POST lessons/ls1/confirm` · `DELETE lessons/ls2` · `POST memories/mm1/confirm` · `DELETE memories/mm2` · B7: disclosure ไม่มี AI → ข้อความเตือน + 0 PUT · มี AI → `PUT after-hours {reply:false,handoff:true,disclosure:"…AI…"}` · STAFF: แตะระดับ/สวิตช์ = 0 PUT · ช่องวงเงินแก้ไม่ได้ · หน้า B7 ไม่ยิง after-hours

### จุดต่างจากแบบ (ภาพคู่)
| จอ | ต่าง | เหตุ |
|---|---|---|
| B2–B8 | แถบบน = ปุ่มกลับ + ชื่อ (ไม่มีไอคอน 3 โซน) | แบบ B2–B8 ไม่มีแถบโซน (ใบเขียน "ทุกหน้า SecTopBar") — ใช้ SecTopBar เฉพาะเมนู `/secretary/settings` |
| B2 | สถิติ = งานเดือนนี้ · โควตาที่ใช้ · รออนุมัติ · เสร็จใน 7 วัน (แบบ: ผ่านโดยไม่ต้องแก้ % · เวลาอนุมัติเฉลี่ย) · ไม่มีปุ่ม "…" ขวาบน | S1.14 ไม่มีเส้น stats — ใช้ตัวเลขที่มีจริงตามใบ |
| B8 | ส่วน "ใช้ไปกับงานประเภทไหน" → แถว "ผู้ช่วยแบบเดิม · วันนี้ %" · ปุ่ม "ดูแพ็กทั้งหมด" → การ์ดจาง "แพ็กเพิ่มงาน · เร็ว ๆ นี้" | ไม่มีข้อมูลแยกประเภท · แพ็กเสียเงินยังไม่เปิด (7.1/7.3) · ไม่แสดงเงิน |
| B3 | แสดงทุกระบบที่เซิร์ฟเวอร์ส่ง (fixture 7) | ดูหนี้ข้อ 3 |
| B4 | ไม่มีแถว "เปลี่ยนราคา/โปรโมชัน" · ข้อมูลส่วนบุคคล = ล็อก "ปิดไม่ได้" · มีช่องวงเงินใต้แถวเอกสารเงิน · ผู้อนุมัติไม่มีวงเงินต่อคน | กฎมี 3 ข้อ (R-K3b) + ALWAYS_APPROVE มี piiExport · ผู้อนุมัติ = แสดงอย่างเดียว (R-K4) |
| B6 | ไม่มีส่วน "เอกสาร" และปุ่ม + · ส่วนแรก = ความจำ "รอยืนยัน" เท่านั้น · มีส่วนข้อมูลสด | S1.14 ไม่มีเส้นรายการความจำที่ยืนยันแล้ว/เพิ่มความจำ/เอกสาร |
| B7 | ไม่มีแถว "ตอบเองได้เฉพาะ" และการ์ด "ความยินยอมการติดต่อ" · มีช่องแก้ disclosure + ปุ่มบันทึก + แถวเวลาทำการ · บรรทัดรองไม่มีชื่อช่องทาง | API after-hours มี reply/handoff/disclosure เท่านั้น |
| ทุกจอ | ตัวอักษรใหญ่กว่าแบบ (สัดส่วน) | R-UI1: ตัวอักษร = tokens.type · ระยะแนวตั้ง × 0.73 |

## 4. มติทางเทคนิค / ส่วนต่างจากใบ
- ใบเขียน `secretary-api.ts` — ใช้ `src/api/secretary.ts` ตามที่ S2.2 ตั้ง (จอเรียกด้วยชื่อเส้น `secGet("secretary/access")` ⇒ X-1…X-4 ของ spec จับสตริงได้โดยไม่ต้อง SPEC-EDIT)
- ชื่อเส้นจาก S1.14 จริง: `secretary` (GET/PUT ตัวตน · ไม่ส่ง x-tenant-id) · `memories/pending` · `memories/[id](/confirm)` · `lessons/[id](/confirm)` · `log/[id]/undo` · `after-hours` · `staff`
- OWNER-only = ปุ่มซ่อน/ล็อกในแอป + เซิร์ฟเวอร์ตรวจซ้ำ (403) · บทบาทอื่นไม่ยิงเส้นที่เซิร์ฟเวอร์ตอบ 403 แน่นอน (after-hours GET · memories/pending · staff สำหรับ STAFF)
- ไม่มีเส้นที่เรียกโมเดลเพิ่ม · ไม่มีสิทธิ์ใหม่ (ทุกการเขียนผ่าน lib ของ S1.x ที่ตรวจสิทธิ์อยู่แล้ว) · ไม่มีตัวเงินดอลลาร์/ยอดคงเหลือบนจอใด (§C.6)

## 5. หนี้ / เปิดค้าง
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `PATH["secretary/me"]` ยังชี้ `/api/mobile/secretary/me` ซึ่ง S1.14 เปลี่ยนชื่อเป็น `/api/mobile/secretary/secretary` | แก้แล้ว fixture s2.1/s2.2/s2.12 ต้อง mock ใหม่ — ไม่ใช่ขอบเขตใบนี้ | ผู้คุม (ตอน merge S1.14) |
| S1.14 ยังไม่ merge — จอนี้ตาม `wip/sec-s1.14` @ deea0555 | ลำดับใบ | ผู้คุม |
| GET access คืนทุก AI_MODULES (27) ไม่ใช่เฉพาะระบบที่ร้านเปิด | ใบเขียน "ต่อโมดูลที่ร้านเปิด" — กรองต้องทำฝั่งเซิร์ฟเวอร์ | S1.14/S3 |
| ไม่มีเส้นรายการความจำที่ยืนยันแล้ว/เพิ่มความจำ/stats เลขา | S1.14 ไม่มี | ใบถัดไป |
| แถว "เวลาทำการ" เปิดแค่หน้าแรกเว็บ (`?open=/app/`) | หน้าเวลาทำการอยู่ใต้ `/app/sys/<chatSystemId>` — แอปไม่รู้ systemId | S2.17+ |
| BusinessSwitcherSheet (B1) ยังไม่มีแถบโควตารวมตามแบบ | ไฟล์ของ S2.1 | S2.20 |

## ต่อจากนี้ (ถ้า restart)
แก้จอแล้ว: รันบล็อก §3 (export ใหม่ → ถ่าย → ภาพคู่) → `bash scripts/iso.sh env QC_FORCE=1 SPEC=scripts/qc-sec-specs/s2.7.json pnpm exec tsx scripts/qc-sec-screen.mts`
