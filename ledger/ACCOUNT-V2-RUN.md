# ACCOUNT-V2-RUN — สถานะสดของ run ยาว (session ใหม่อ่านไฟล์นี้ก่อน · Fable อัปเดตทุกครั้งที่ WO เปลี่ยนสถานะ)

> พิมพ์เขียว: `docs/design/account-v2/BLUEPRINT-ACCOUNT-V2.md` · สเปคหน้าจอ: `DESIGN-SPEC-V2.md` · โน้ตระหว่างทำของแต่ละ WO: `ledger/wo-notes/<WO>.md`
> **วิธีกลับมาต่อ**: `cd /root/projects/shark-accounting && git pull --rebase` → อ่านตาราง "WO ปัจจุบัน" → อ่าน `wo-notes/<WO>.md` → `git status` (ไฟล์ dirty = งานค้างของ WO นั้น) → ทำต่อจาก "ขั้นที่ถึง" ห้ามเริ่มใหม่ · ถ้า sub-agent ตายกลางทาง ให้ดู wo-notes ว่าทำถึงไหน แล้วสั่งตัวใหม่ทำต่อ (ไม่ใช่ทำซ้ำ)

## WO ปัจจุบัน
| ช่อง | ค่า |
|---|---|
| WO | 0.1 QC env |
| สถานะ | IN_PROGRESS |
| ผู้ทำ | (กำลังมอบหมาย) |
| ขั้นที่ถึง | ยังไม่เริ่ม — ขั้นถัดไป: สร้าง Neon branch `acc-v2-qc` + `.env.qc` |
| commit ล่าสุดของงานนี้ | — |
| บล็อกเกอร์ | — |

## ตาราง WO ทั้งหมด (สถานะ: TODO · IN_PROGRESS · REVIEW (Fable QC) · DONE · BLOCKED · SKIPPED)
| WO | ชื่อ | ผู้ทำ (สำรอง) | สถานะ | commit | หมายเหตุ |
|---|---|---|---|---|---|
| 0.1 | QC env (Neon branch · seed · เฉลย · serve · visual) | Opus (Sonnet) | IN_PROGRESS | | |
| 0.2 | ปิดรูรั่วเดิม (guard ทุก page · dedupe ผู้ติดต่อ · list server-side) | Opus (Sonnet) | TODO | | |
| 0.3 | Schema เฟส 0 | Opus | TODO | | |
| 0.4 | Shell V2 (เมนู 9 หมวด + flyout + sheet) | Sonnet | TODO | | |
| 0.5 | ส่วนประกอบกลาง V2 | Sonnet | TODO | | |
| 1.1 | หน้ารายการทุกชนิด | Sonnet | TODO | | |
| 1.2 | route ราคาถูก DP/CNR/DNR/ASSET_PO/PTX + payableStats | Opus (Sonnet) | TODO | | |
| 1.3 | DocEditorV2 A–C,E,G,H,I | Opus | TODO | | |
| 1.4 | มัดจำ + WHT ต่อบรรทัด + รับชำระหลายครั้ง | Opus | TODO | | |
| 1.5 | หน้าเอกสาร V2 | Sonnet | TODO | | |
| 1.6 | wizard CN/DN/CNR/DNR/RPR | Sonnet | TODO | | |
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
- 3 ก.ย. 2026 (เช้ามืด) — เริ่ม run ยาว · เจ้าของสั่ง: Fable คุมแทน · QC ต้องเห็นภาพจริง+ตัวเลขจริง · หาบั๊ก/ช่องโหว่ · กลับมาต่อได้เมื่อ session ล้ม · Opus ติด rate limit ตั้งแต่ 2 ก.ย. ~20:00 UTC (ต้องทดสอบก่อนมอบหมายทุกครั้ง)

## ของที่ต้องส่งต่อ session อื่น / รอเจ้าของ
- (ว่าง)
