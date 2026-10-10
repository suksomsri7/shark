# WO T<x>.<y> — <ชื่อใบ>

> RUN "AI TEAM" (SHARK HUB v2) · tree ผู้คุมงาน `/root/projects/shark-ai` · branch `session/ai-team` · เลน `<tree>` branch `wip/pos-ai-t<x>.<y>` · <วันที่ UTC จาก date -u> · ผู้คุมงาน: Fable 5.1 · builder: <ตัวแทน/โมเดล>
> สัญญา: `ledger/AI-TEAM-RUN.md` §2 T<x>.<y> + `ledger/AI-TEAM-MASTER-PLAN.md` §6 · ใบสั่ง `ledger/ai-team-briefs/ai-brief-T<x>.<y>.md` (+ COMMON + RESOLUTIONS)
> แบบ `ledger/DESIGN-AI-TEAM.md` §… · ภาพ `ledger/design-ai-team/airy-<ชุด>.jpg` หน้า <id> (+ มืด)
> ข้อสอบ: `scripts/qc-ai-t<x>.<y>.mts` (N ข้อ · commit test: <hash> · **แก้หลัง commit หรือไม่: ไม่/ใช่ (ดู §7)**) · แดงครั้งแรก `ai-t<x>.<y>-red.txt` · เขียว `ai-t<x>.<y>-green.txt`

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ (ใหม่/แก้) | ทำอะไร | ไฟล์ร่วม (COMMON §D)? overlap กับ POS/HR |
|---|---|---|---|

## 2. migration / seed / backfill (ถ้ามี)
- migration: ชื่อ (`_ai_team_a|b` เท่านั้น · ใบ T1.1/T3.1) · additive ล้วน (ยืนยันว่าไม่มี DROP/ALTER ทำลาย/NOT NULL ไม่มี default/index บนตารางใหญ่เดิม) · รันบน QC4 แล้ว · โฟลเดอร์ของ POS/HR ที่ QC4 มีแต่ branch นี้ไม่มี: …
- seed: `seed-ai-team-qc` เปลี่ยนอะไร · รัน 2 รอบ = แถวเท่าเดิม · ร้าน POS/HR/CRM ไม่เปลี่ยน (นับ)
- backfill: สคริปต์ · dry-run ผล · รันจริงผล · idempotent ยืนยันอย่างไร

## 3. ด่าน 12 ข้อ (MASTER-PLAN §3 — ทุกข้อต้องมีหลักฐาน · ข้อที่ผ่านไม่ได้ ⇒ ลงตาราง §8 หนี้ พร้อมใบที่จะปิด)
| # | ด่าน | ผ่าน? | หลักฐาน (วางของจริง ไม่ใช่คำบรรยาย) |
|---|---|---|---|
| D1 | ข้อสอบเขียนก่อนโค้ด โดยตัวแทนแยก · unforced SKIP exit 0 · forced แดงด้วยเหตุผลที่ถูก | ☐ | commit `test(ai-team): T<x>.<y>` <hash> + บรรทัดสรุปจาก red.txt |
| D2 | เขียวครบเมื่อ **ผู้คุมงานรันซ้ำเอง** forced ×2 + unforced หลัง reseed · residue 0 | ☐ | `JSON_SUMMARY {...}` ×3 + residue |
| D3 | กลุ่ม X1–X11 ครบทุกหัวข้อที่เกี่ยว (ไม่เกี่ยว = เหตุผล 1 บรรทัด) | ☐ | ตาราง §4 |
| D4 | regression = baseline (`ai-baseline-<hash>.txt`) + ข้อสอบ AI-team ใบก่อน + ชุดของโมดูลที่แตะ | ☐ | บรรทัดสรุปต่อชุด (§5) |
| D5 | `pnpm typecheck` 0 · `pnpm fitness` ผ่านทั้งมี env และ `env -u DATABASE_URL` · `apps/mobile` typecheck (ใบ UI) | ☐ | บรรทัด `FINDINGS:`/`JSON_SUMMARY` |
| D6 | build เว็บผ่าน (ใบที่มี route/page · iso ISO_MEM=7000M) · web export ของสำเนา QC ผ่าน (ใบ UI) | ☐ | exit 0 |
| D7 | ภาพคู่ MOCKUP\|RENDER 390×844 สว่าง (+มืด) ทุกหน้าของใบ · ผู้คุมงานเปิดดูเอง · ตารางจุดต่าง · ไม่มี overflow | ☐ | path + ตาราง §6 + `PARITY:` |
| D8 | ทุก element ที่กดได้มี `testID` + แถวใน `scripts/ai-team-ui-inventory.json` · สตริงผ่าน i18n | ☐ | diff ทะเบียน + F16.4/F16.5 |
| D9 | ผู้ตรวจไม่มี BLOCKER · (🎯) นักล่าไม่มี HIGH/MEDIUM ค้าง | ☐ | สรุปรายงาน |
| D10 | เอกสาร: API ใหม่ใน docs · สิทธิ์ใหม่มีป้ายไทย · event ใหม่ 3 ทะเบียน · แม่แบบ/ตำแหน่งในทะเบียน | ☐ | ผล F13.x / F16.x |
| D11 | wo-notes ครบ + ตารางหนี้ + QC4 คืนสภาพ | ☐ | ไฟล์นี้ + นับแถว |
| D12 | merge เข้า `session/ai-team` (อ่านทุก hunk) → push สาขานั้น → Telegram % | ☐ | hash · ข้อความ tg |

## 4. กลุ่มข้อสอบ X (MASTER-PLAN §4 — ครบ 11 แถว)
| กลุ่ม | เกี่ยวกับใบนี้? | check ids / เหตุผลที่ N-A (1 บรรทัด) |
|---|---|---|
| X1 ขอบเขต (ข้ามร้าน · ข้ามพนักงาน · ข้ามห้อง · คนที่สั่งได้ ⇒ 404) | ☐ ใช้ / ☐ N-A | |
| X2 ตัวตนและการมอบอำนาจ (ระดับบังคับฝั่ง execute · AUTO ต้องมีผู้มอบ · DESTRUCTIVE ไม่ AUTO · ผลโมเดลไม่ใช่สิทธิ์) | ☐ ใช้ / ☐ N-A | |
| X3 ยิงพร้อมกัน (ตัวนับ/เวอร์ชัน/สถิติ คำสั่งเดียว ≥10 ทาง) | ☐ ใช้ / ☐ N-A | |
| X4 ส่งซ้ำ (consumer 2 รอบ + 2 รอบพร้อมกัน ⇒ 1) | ☐ ใช้ / ☐ N-A | |
| X5 งานตามเวลา (ซ้อน · lease · รีเซ็ต idempotent · undo หมดเวลา · นาฬิกาฉีด) | ☐ ใช้ / ☐ N-A | |
| X6 ข้อมูลเข้าอันตราย + prompt injection | ☐ ใช้ / ☐ N-A | |
| X7 endpoint มือถือ (Bearer · rate limit · เพดาน payload) | ☐ ใช้ / ☐ N-A | |
| X8 PDPA/ข้อมูลรั่วผ่าน AI (prompt/audit/daily/outbox · KB grant · ข้อมูลอ่อนไหวสมาชิก) | ☐ ใช้ / ☐ N-A | |
| X9 การกระทำอันตราย (confirm+เหตุผล · audit ทุก mutation · ป้ายความเสี่ยง) | ☐ ใช้ / ☐ N-A | |
| X10 ความลับ (คีย์/prompt/ไมโครดอลลาร์ไม่ถึงแอป · ไฟล์ผ่าน route) | ☐ ใช้ / ☐ N-A | |
| X11 ต้นทุนและโควตา (ทุกการเรียกคิดเงิน · เพดานรายคน · หมด=พัก · ฟรีผูกเจ้าของ · ไม่มี token/บาท) | ☐ ใช้ / ☐ N-A | |

## 5. ผลข้อสอบ (วาง JSON_SUMMARY จริง — ห้ามสรุปเป็นคำพูด)
- `qc-ai-t<x>.<y>` forced #1 / #2 / unforced: `JSON_SUMMARY {...}` · residue: …
- regressions: baseline set + AI-team ใบก่อน + ชุดโมดูล — JSON_SUMMARY แต่ละชุด เทียบ baseline
- typecheck · fitness ×2 · mobile typecheck · build/export

## 6. ภาพ (ใบ UI · D7)
คำสั่ง: `QC_PREPARE=1 FIXTURE=apps/mobile/qc/fixtures/ai-team/t<x>.<y>.json node apps/mobile/qc/shoot-ai-team.mjs <routes>` → `bash scripts/parity-ai-team.sh ledger/design-ai-team/airy-<ชุด>.jpg <ดัชนีหน้า> <shot.png> <out.png>` (+ `--dark`)
| หน้า | mockup (ชุด/ดัชนี) | ภาพคู่ (path) | โหมด | overflow | จุดต่างที่เห็นเอง (องค์ประกอบ · mockup · ของจริง · แก้/ยอมรับ+เหตุผล) |
|---|---|---|---|---|---|
- จอ placeholder: "ยังไม่ใช่จอตามแบบ · ทำที่ T<x.y>" (ถ้ามี)
- ภาพ before/after ของจอแอป 1.0 (uiVersion 1) — ต้องเหมือนเดิม
- `PARITY: ผ่าน / ตีกลับ — <เหตุผล>`

## 7. ข้อแย้ง / มติทางเทคนิค (พร้อมหลักฐาน)
- OQ-n ของผู้เขียนข้อสอบ → มติผู้คุมงาน CR-n (คัดลอกลง brief §7 ด้วย)
- ข้อสอบ id … : เชื่อว่าผิดเพราะ … (อ้างแบบ §… / โค้ด file:line) · ปล่อยแดง / `ORACLE-EDIT <ชุด>-<ข้อ>` (ผู้คุมงานแก้ + บันทึกใน AI-TEAM-RUN §4)
- สเปกขาด: … → ตัดสินใจ … (ย้อนกลับได้อย่างไร)
- ทางที่เรียกโมเดลเพิ่มในใบนี้ (ทุกทางต้องคิดเงิน): …
- ใครได้/เสียสิทธิ์อะไรหลังใบนี้: …

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|

## 9. คืนสภาพ QC4
- ข้อสอบ `finally` ลบอะไร · seed ยังตรงเฉลยหลังรัน (seed ซ้ำ = 0 แถวใหม่) · ไม่มีแถว `qc-ai-<wo>-*` ค้าง · ร้านของ POS/HR/CRM นับเท่าเดิม
