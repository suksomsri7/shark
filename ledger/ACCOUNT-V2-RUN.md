# ACCOUNT-V2-RUN — สถานะสดของ run ยาว (session ใหม่อ่านไฟล์นี้ก่อน · Fable อัปเดตทุกครั้งที่ WO เปลี่ยนสถานะ)

> พิมพ์เขียว: `docs/design/account-v2/BLUEPRINT-ACCOUNT-V2.md` · สเปคหน้าจอ: `DESIGN-SPEC-V2.md` · โน้ตระหว่างทำของแต่ละ WO: `ledger/wo-notes/<WO>.md`
> **วิธีกลับมาต่อ**: `cd /root/projects/shark-accounting && git pull --rebase` → อ่านตาราง "WO ปัจจุบัน" → อ่าน `wo-notes/<WO>.md` → `git status` (ไฟล์ dirty = งานค้างของ WO นั้น) → ทำต่อจาก "ขั้นที่ถึง" ห้ามเริ่มใหม่ · ถ้า sub-agent ตายกลางทาง ให้ดู wo-notes ว่าทำถึงไหน แล้วสั่งตัวใหม่ทำต่อ (ไม่ใช่ทำซ้ำ)


> 🔴 **เหตุการณ์ 3 ก.ย. 09:10–10:07 BKK (02:10–03:07 UTC)**: session คุมงานสั่ง `typecheck` + `acc-v2-serve.sh` (next build) ขณะ sub-agent WO 1.3 ยังรัน `tsc` อยู่ + session อื่นอีก 3 → กลุ่ม claude-remote แรมทะลุ MemoryHigh 5G → kernel throttle ทั้งกลุ่ม (load 14–16 แต่ CPU ว่าง 90%) 45 นาที → แอปขึ้น Disconnected · เจ้าของต้อง hard reboot. **งานยังไม่หาย**: ไฟล์ dirty ของ 1.1 (รอบ 2) + 1.3 อยู่บนดิสก์ครบ (สำรองไว้ `/root/backups/shark-accounting-wip-20260903-0310/`). ที่ค้าง: build+ถ่ายภาพ 1.1 ยังไม่ได้ทำ (`.next` ค้างครึ่งทาง ต้อง build ใหม่) · agent 1.3 ตายกลางทาง ดู `wo-notes/1.3.md` แล้วสั่งตัวใหม่ทำต่อ. **กติกาใหม่**: งานหนัก (typecheck / next build / qc:all / agent ที่รัน tsc) ทำ**ทีละ 1 อย่าง**ทั้งเครื่อง ไม่ใช่แค่ผ่าน gate lock · แก้ระบบแล้ว: MemoryHigh ปิด + MemoryMax 5G (เกิน = ฆ่าตัวใหญ่สุด ไม่ค้างทั้งเครื่อง) + watchdog ตรวจอาการค้างทุก 5 นาที

## WO ปัจจุบัน
| ช่อง | ค่า |
|---|---|
| WO | 1.6 wizard CN/DN (1.5 DONE ยังไม่ merge — จะ merge พร้อม 1.6) |
| สถานะ | IN_PROGRESS |
| ผู้ทำ | Opus (sub-agent) |
| ขั้นที่ถึง | 3 ก.ย. ~10:30 UTC: 1.5 DONE (ภาพผ่าน) · 1.6 กำลังทำ (agent) · merge main ครั้งถัดไปหลัง 1.6 ผ่าน (qc:all → push main) |
| commit ล่าสุดของงานนี้ | — |
| บล็อกเกอร์ | — |

## ตาราง WO ทั้งหมด (สถานะ: TODO · IN_PROGRESS · REVIEW (Fable QC) · DONE · BLOCKED · SKIPPED)
| WO | ชื่อ | ผู้ทำ (สำรอง) | สถานะ | commit | หมายเหตุ |
|---|---|---|---|---|---|
| 0.1 | QC env (Neon branch · seed · เฉลย · serve · visual) | Opus | DONE | f7dc9c3 | Fable รัน seed-check เอง 55/55 + ดูภาพ invoice-list จริง · Neon branch `wo-acc-v2-qc` (**ห้าม `pnpm neon:gc`** ระหว่าง run) · ทำซ้ำ: seed → seed-check → `bash scripts/acc-v2-serve.sh` → `visual-acc-v2.mts <WO>` → serve stop |
| 0.2 | ปิดรูรั่วเดิม (guard ทุก page · dedupe ผู้ติดต่อ · list server-side) | Opus | DONE | 1e8d73b | Fable รัน qc-acc-v2-guard เอง 100/0 บน .env.qc · อ่าน diff แล้ว · ค้างตาม: หน้าแรกบัญชี `AccountContent` (นอก account/**) ยังไม่มีด่าน → ใส่ใน WO 0.4 · action `account.*.view` แยกจาก create → WO 0.3 |
| 0.3 | Schema เฟส 0 | Opus | DONE | 269c354 | Fable ตรวจ SQL (additive ล้วน) + รัน qc-acc-v2-schema 61/61 + drift QC/prod = 0 · ⚠️ **migration หลุดลง prod แล้ว** (agent source `.env.qc` ผิดเพราะ URL มี `&` → fallback .env) — ไม่ rollback (additive) · ผล: CI ของ main จะเห็น drift จนกว่าเฟส 0 จะ merge → เร่ง merge · VOID ไม่เพิ่ม (มี CANCELLED/VOIDED แล้ว) · prod ยัง**ไม่ backfill phoneNorm** |
| 0.4 | Shell V2 (เมนู 9 หมวด + flyout + sheet) | Sonnet | DONE | 0770505 | Fable ตีกลับ 2 รอบ (emoji→ไอคอนเส้น · dropdown ถูก overflow ตัด · ตัวนับ 18→12 · offsetParent กับ fixed) → รอบ 3 ตรง f2/f12/g18 · visual 53/53 |
| 0.5 | ส่วนประกอบกลาง V2 | Sonnet | DONE | 0770505 | ตีกลับ 1 (โฟลเดอร์ `_dev` = private → `dev-components`) · gallery ถ่ายจริง 1440/390 เทียบ f3/g1/g5/g17 ผ่าน · components 78/78 |
| 0.6 | 🐞 hotfix `gl.postDocument` PURCHASE/EXPENSE โหมดราคารวม VAT Dr เกิน Cr (เจอใน 0.1 · ออกเอกสารไม่ได้) + ข้อสอบ | Opus | DONE | 91c38f2 | Fable อ่าน diff + รันเอง inclvat 71/71 · CPA 107/107 บน QC branch · เจอบั๊กที่ 2 ด้วย: VAT รอใบกำกับลง 1150 แทน 1155 (แก้แล้ว) · ค้าง: `qc-tax-print-audit.mts` เน่าอยู่ก่อน (taxId 5 หลัก) → เก็บใน 9.2 |
| 1.1 | หน้ารายการทุกชนิด | Sonnet | DONE | 8a3aa52 | ตีกลับ 1 รอบ (11 จุด) → รอบ 2 Fable ดูภาพจริงตรง f3/f13 · ตัวเลขแท็บ=เฉลย · list 144/144 · nav-functions 9/9 · ค้าง: แท็บ derived ออกบางส่วน/ออกครบ · รอออกใบกำกับ · เอกสารอัตโนมัติ (ต้อง relation/field) → 1.5/1.3 |
| 1.2 | route ราคาถูก DP/CNR/DNR/ASSET_PO/PTX + payableStats | Opus | DONE | 623e8df | Fable รันเอง cheap-routes 105/105 · CPA 107/107 · อ่าน diff GL (Cr 1130 + ลด VAT มัดจำ) · 🐞 แก้ DP โพสต์ซ้ำ · ค้าง: void การจ่าย DP ยังไม่กลับ JV (เหมือน DR ฝั่งขาย) → WO 1.4 · หน้า PTX ยังมีฟอร์มสร้าง → 1.1/1.3 |
| 1.3 | DocEditorV2 A–C,E,G,H,I | Opus | DONE | fb3c91b | Fable ตีกลับ 2 รอบ (ตารางล้น · default โหมดง่าย · วันที่ native · back link · sticky บังแท็ก · ruler · ช่องจำนวน · cookie โหมด) → รอบ 3 ตรง g1/g17 ทั้ง 2 โหมด · visual 126 ✅ · editor 199 (Fable รันเอง) · ค้าง: CN/DN/CNR/DNR/ใบเบิก ยังใช้ฟอร์มเก่าจนกว่า 1.6 · ร่างเก่าส่วนลดไม่ลงตัวปัดเศษ ≤(qty−1) สตางค์ (จดไว้) |
| 1.4 | มัดจำ + WHT ต่อบรรทัด + รับชำระหลายครั้ง | Opus | DONE | fc3109c | Fable รันเอง payments 157/157 · CPA 107 · ภาพรอบ 2 ตรง g2 (visual 82 ✅) · 🐞 ปิดบั๊ก 5 รวม RE จาก IV ลงรายได้ซ้ำ 2 เท่า · ค้าง: เช็ค+ค่าธรรมเนียมพร้อมกันยังไม่รองรับ · prefix ฝั่งซื้อคง WHT- |
| 1.5 | หน้าเอกสาร V2 | Sonnet | DONE | (HEAD) | ตีกลับ 1 รอบ (5 จุด) → รอบ 2 ตรง g4/f14 · detail 85 · visual 35 ✅ · ค้าง: ตารางรายการบนมือถือเลื่อนในการ์ด (f14 เป็นลิสต์ย่อ) → 9.1 · ผู้บันทึกการชำระต้องมี user relation |
| 1.6 | wizard CN/DN/CNR/DNR/RPR | Sonnet | IN_PROGRESS | | มอบหมาย 3 ก.ย. ~10:30 UTC · เทียบ g3 · โน้ต `wo-notes/1.6.md` |
| 1.7 | ใบวางบิลรวม + ใบรวมจ่าย | Opus | TODO | | |
| 1.8 | นำเข้า CSV | Sonnet | TODO | | |
| 1.9 | เอกสารประจำ + เตือน | Opus (Sonnet) | TODO | | |
| 2.1 | query dashboard | Opus | TODO | | |
| 2.2 | หน้าหลัก V2 | Sonnet | TODO | | |
| 2.3 | ภาพรวมรายรับ/รายจ่าย | Sonnet | TODO | | |
| 3.1 | Party | Opus | TODO | | |
| 3.2 | หน้าผู้ติดต่อ V2 | Sonnet | TODO | | |
| 3.3 | modal ผู้ติดต่อ + DBD + dedupe | Opus (Sonnet) | TODO | | |
| 3.4 | โปรไฟล์ 360° + รวมซ้ำ | Opus | TODO | | |
| 4.1 | InvItem canonical + sync + consume | Opus | TODO | | |
| 4.2 | POS ส่งบรรทัด | Opus | TODO | | |
| 4.3 | หน้าสินค้า V2 + หน่วย + จัดชุด + เบิก/คืน/ปรับต้นทุน | Sonnet+Opus | TODO | | |
| 5.1 | ช่องทางการเงิน V2 | Sonnet | TODO | | |
| 5.2 | ภาพรวมการเงิน + ปฏิทิน + สำรองรับ/จ่าย | Sonnet | TODO | | |
| 5.3 | กระทบยอดธนาคาร | Opus | TODO | | |
| 5.4 | WHT V2 + เช็ค V2 | Sonnet | TODO | | |
| 5.5 | PromptPay → กระทบยอดอัตโนมัติ | Opus | TODO | | |
| 6.1 | ผังบัญชี V2 | Sonnet+Opus | TODO | | |
| 6.2 | สมุดรายวัน V2 + รายงาน drill-down + ปิดงวด + ค่าเสื่อม UI | Sonnet | TODO | | |
| 7.1 | คลังเอกสาร V2 | Sonnet | TODO | | |
| 7.2 | กล่องขาเข้า + AI | Opus | TODO | | |
| 8.1 | ตั้งค่าเอกสาร | Opus | TODO | | |
| 8.2 | นโยบายบัญชี | Opus | TODO | | |
| 8.3 | สิทธิ์ matrix + เชื่อมระบบ + API | Sonnet+Opus | TODO | | |
| 9.1 | มือถือทำงานได้จริง | Sonnet | TODO | | |
| 9.2 | audit ความปลอดภัย | Opus | TODO | | |
| 9.3 | ประสิทธิภาพ | Opus | TODO | | |
| 9.4 | ความง่าย | Sonnet | TODO | | |
| 10.1 | QC รอบสุดท้ายทุกเฟรม | Fable | TODO | | |
| 10.2 | เอกสาร/handover | Sonnet | TODO | | |
| 10.3 | prod verify + แจ้งเจ้าของ | Fable | TODO | | |

## บันทึกเหตุการณ์ (ล่าสุดบนสุด)
- 3 ก.ย. 2026 ~04:15 UTC — 🏁 **เฟส 0 ปิด + 1.1/1.2 ขึ้น main** (qc:all 190/190 · commit 0d19670) · ระหว่างทาง: reboot 1 ครั้ง (แรม) → กติกางานหนักทีละอย่าง
- 4 ก.ย. 2026 ~01:50 UTC — เจ้าของย้ำ: **UI ต้องออกมาตรงภาพที่ออกแบบ** → เพิ่มด่าน parity ใน BLUEPRINT §1 (Fable ดูภาพจริงคู่ mockup ทุกหน้า) · memory `feedback_ui_must_match_approved_mockups`
- 4 ก.ย. 2026 ~01:00 UTC — 🔴 เหตุการณ์: migration เฟส 0 หลุดลง prod ระหว่าง WO 0.3 (สาเหตุ: `set -a; . ./.env.qc` พังเพราะ URL มี `&` ไม่มี quote → prisma.config fallback ไป .env) · บทเรียน: ทุกคำสั่ง prisma ในงานนี้ต้องผ่าน `scripts/acc-v2-env.mts`/`grep|cut` + ด่านกัน host prod · จดใน memory
- 3 ก.ย. 2026 (เช้ามืด) — เริ่ม run ยาว · เจ้าของสั่ง: Fable คุมแทน · QC ต้องเห็นภาพจริง+ตัวเลขจริง · หาบั๊ก/ช่องโหว่ · กลับมาต่อได้เมื่อ session ล้ม · Opus ติด rate limit ตั้งแต่ 2 ก.ย. ~20:00 UTC (ต้องทดสอบก่อนมอบหมายทุกครั้ง)

## ของที่ต้องส่งต่อ session อื่น / รอเจ้าของ
- ✅ session แชท: เฟส 0 + 1.1/1.2 merge เข้า main แล้ว (`0d19670` 3 ก.ย.) — migration `20260902160000_account_v2_phase0` และ `20260903090000_account_v2_doc_editor` อยู่บน main แล้ว drift หาย · เมนูบัญชีเป็นแบบใหม่ 9 หมวด (UI_STANDARD §2.9/§4 อัปเดตแล้ว)
- prod backfill phoneNorm: dry-run แล้ว (4 ก.ย.) — prod มีผู้ติดต่อ 16 แถว ไม่มีแถวที่ต้องเติม ✅ ไม่ต้องทำ
