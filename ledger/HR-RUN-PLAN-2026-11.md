# HR V2 RUN — แผนปรับปรุง 6 พ.ย. 2569 (ประหยัดโทเค็น · เร็วขึ้น · คุณภาพเท่าเดิม)

> สถานะ: **10/44 (23%)** · เฟส H0+H1 เสร็จ · H2.1 สร้างเสร็จ ตรวจแล้ว อยู่รอบแก้ r2 (พักตามคำสั่งเจ้าของ 6 พ.ย. ≈14:2xZ) · แผนแม่บท = `HR-V2-MASTER-PLAN.md` (origin/session/pos) · ใบสั่ง = `ledger/hr-briefs/` · จุดต่อ = ท้าย `HR-RESUME.md`
> เอกสารนี้ = วิธีทำงานใหม่ที่เจ้าของอนุมัติ ("GO" 6 พ.ย. 13:3xZ) + แผนใบที่เหลือ 34 ใบ · ใช้แทน "ลำดับ oracle→builder→re-run→reviewer→hunter→merge" เดิมใน COMMON §B

## 1. ที่วัดได้จากรอบ 22 ต.ค. (ทำไมต้องปรับ)
| ตัวกิน | ค่าที่วัด | ผล |
|---|---|---|
| regression ชุดเต็มซ้ำ | 4 รอบ/ใบ (builder · control1 · control2 · post-merge) ≈33 นาที/รอบ | ≈2 ชม. เครื่องต่อใบ ซ้ำของเดิม |
| รอบแก้หลังรีวิว | เกือบทุกใบ (H0.5 r5 · H0.6 r4 · H0.7/H1.1/H1.2 รอบ 2) | spawn เพิ่ม 2–3 ตัว/ใบ สาเหตุซ้ำ 7 เรื่อง |
| oracle ต่อใบ | 100–140 KB (≈35k โทเค็น) ทุกเอเจนต์อ่าน | อ่านซ้ำ 4–6 ครั้ง/ใบ |
| บรีฟต่อใบ | 37–45 KB | เขียน+อ่านซ้ำ |
| typecheck | 3 ครั้ง/ใบ รอด่าน RAM ได้ถึง 90 นาที | เวลาตาย |
| heartbeat | ทุก 23 นาที · 196 บรรทัดใน ledger | โทเค็นผู้คุมเปล่า |
| oracle บังคับ ×2 ใน control | ทุก run | ซ้ำกับ builder ที่รัน ×3 แล้ว |

## 2. ขั้นตอนต่อใบ (ใหม่)
| # | ขั้น | ใคร | เครื่องมือ | หมายเหตุ |
|---|---|---|---|---|
| 1 | บรีฟ ≤15 KB: มติ · ไฟล์ที่แตะ · interface · เกณฑ์รับ · ชี้ DESIGN §/REVIEW § แทนเขียนซ้ำ | ผู้คุม (Fable) | — | บรีฟเก่า H2.2/H2.3 ใช้ได้เลย ไม่เขียนใหม่ (เปลืองกว่า) |
| 2 | oracle ≤60 KB ใช้ helper ร่วม `scripts/qc-hr-lib.mts` · RED ถูกเหตุผลบนฐาน | oracle writer (Opus · เลน 2 ล่วงหน้า 1 ใบ) | QC4 | ใบแรกหลังนี้สร้าง lib จาก qc-hr-h2.1 |
| 3 | build: oracle ×3 + ชุดที่ `pick-suites.sh` เลือก + fitness ×2 + typecheck **1 ครั้งท้ายงาน** + เช็กลิสต์ COMMON §F ติ๊กในรายงาน | builder (Opus · เลน 1) | QC4 | ไม่รันชุดเต็ม |
| 4 | control run **ครั้งเดียวต่อ head**: `ledger/hr-ctl/ctl.sh` (lean: oracle unforced+forced ×1 · ชุดจาก diff · fitness · typecheck 1) · FULL เมื่อแตะ prisma/core/package.json หรือใบปิดเฟส | ผู้คุม (เครื่อง) | systemd unit | H2.1 lean = 36 ขั้น 30 นาที (เดิม 38 ขั้น 33 นาที — ใบที่ไม่แตะ `hr/index.ts` จะตัดได้มากกว่า) |
| 5 | reviewer อิสระ: ได้ diff + มติบรีฟ ไม่อ่าน oracle ทั้งไฟล์ · รายงาน ≤120 บรรทัด | Opus | อ่านอย่างเดียว | H2.1: 163k โทเค็น 4 นาที |
| 6 | hunter เฉพาะใบ เงิน/สิทธิ์/PIN/race (H2.3 H2.4 H2.6 H2.9 H3.x ทุกใบ H4.3 H4.8 H5.2) · ≤6 probe | Opus | QC4 (rollback) | H2.1: 197k โทเค็น 9 นาที เจอ MAJOR 2 ที่ reviewer เจอเหมือนกัน → ใบ UI ล้วนไม่ต้อง |
| 7 | รอบแก้ (ถ้ามี) รวมทุก finding เป็น **รอบเดียว** → ctl.sh lean อีกครั้งบน head ใหม่ | builder เดิม | | ห้ามแยกรอบ reviewer/hunter |
| 8 | merge FF เข้า session/hr → `postmerge.sh` (generate · seed · oracle ใบนั้น · fitness-hr) ≈5 นาที · ชุดเต็มเฉพาะเมื่อ conflict → tg `📊 HR V2 · N% (x/44)` → ledger 1 บรรทัด | ผู้คุม | | |

**คง (คุณภาพ):** oracle มาก่อนเสมอ · reviewer อิสระทุกใบที่แตะ src · ผู้คุมรันยืนยันเอง ไม่เชื่อรายงาน builder · ชุดเต็ม FULL ทุกใบที่มี migration และใบปิดเฟส (H2.12 H3.10 H4.9 รัน `qc:all`) · ORACLE-EDIT ต้องมีมติผู้คุม · ห้าม push main
**ตัดทิ้ง:** heartbeat cron · tg รายชั่วโมง · post-merge ชุดเต็มหลัง FF · typecheck รอบที่ 3 · forced ×2 ใน control · hunter ใบ UI · บรรทัด ledger ยาว

## 3. เลนและลำดับใบที่เหลือ (34)
- **เพดาน 2 เลน** (เจ้าของ): เลน 1 = builder ใบ n · เลน 2 = oracle writer ใบ n+1 (แล้วว่างให้ reviewer/hunter ของใบ n) · ผู้คุมเขียนบรีฟใบ n+2 ระหว่างรอ
- **H2 (11 ใบ)** H2.1 ปิด r2 → H2.2 บอร์ด UI (hunter ไม่ต้อง · ต้อง CONTROLLER-RUN ถ่ายภาพ 3 ขนาด) → H2.3 swap (hunter) → H2.4 clock v2 GPS/PIN (hunter · Mig?) → H2.5 judgement → H2.6 corrections → H2.7 leave policies (Mig) → H2.8 holidays → H2.9 OT→adjustment (hunter) → H2.10 ของฉัน → H2.11 inbox ผู้จัดการ → H2.12 ปิดเฟส (FULL + qc:all + HANDOVER-H2)
- **H3 (10 ใบ · เงินทั้งหมด → hunter ทุกใบ · FULL ทุกใบที่มี Mig)** H3.1 work entries → H3.2 late/absent pay → H3.3 law engine (ต้อง law seed ACTIVE) → H3.4 payroll v2 maker-checker → H3.5 bank files 4 ธนาคาร → H3.6 ภ.ง.ด.1/1ก · สปส.1-10 · 50 ทวิ → H3.7 accounting JV → H3.8 payslip PDF → H3.9 reports/ทะเบียนลูกจ้าง → H3.10 ปิดเฟส (ต้อง HQ23 นักบัญชีเซ็นสูตร)
- **H4 (9 ใบ)** H4.1 leave→booking → H4.2 labor % (ต้อง POS P1.17 facade — ตรวจก่อนว่าอยู่บน session/pos) → H4.3 AI tools (hunter privacy) → H4.4 lifecycle → H4.5 LINE notify → H4.6 inventory deduction → H4.7 รับสมัครงาน (**รอ HQ22 เจ้าของ** ถ้าตัด = 43 ใบ) → H4.8 REST `/api/v1/hr` + skill (hunter) → H4.9 ปิดเฟส cross-module
- **H5 (3 ใบ)** H5.1 เดินทุกปุ่ม 3 ขนาด → H5.2 hunter เงิน+privacy → H5.3 production: ลำดับ migration · backfill · verify-prod · HANDOVER (ต้อง GO เจ้าของทุก migration บน prod)

## 4. ประมาณการ + วิธีวัดจริง
| เฟส | ใบ | ชม.วิ่ง (ประมาณ) |
|---|---|---|
| ปิด H2.1 | 1 | 1 |
| H2 | 11 | 15–18 |
| H3 | 10 | 16–20 |
| H4 | 9 | 10–12 |
| H5 | 3 | 6–8 |
| รวม | 34 | **≈50–60 ชม.** ≈ 2.5 วันต่อเนื่อง · ตามจริง 4–7 วันเพราะรอ GO/คำตอบ/เครื่องถูกแย่ง |
วัดจริงทุกใบลง `ledger/HR-METRICS.md` (เวลาเริ่ม–merge · จำนวน spawn · โทเค็นต่อเอเจนต์จากผลลัพธ์ของ Agent tool · นาที control run · จำนวนรอบแก้) → หลัง H2.2 เทียบกับ H1.x แล้วรายงานเจ้าของ 1 บรรทัด

## 5. รอเจ้าของ (ไม่บล็อกใบถัดไป ยกเว้นที่ระบุ)
1. **GO เริ่มต่อ** ตามแผนนี้ (หรือแก้ข้อไหน)
2. HQ22 รับสมัครงาน H4.7 ทำ/ไม่ทำ (ตัดสินได้ถึงก่อน H4.6)
3. law seed `--apply` บน prod + HQ23 นักบัญชีตรวจสูตร (บล็อก H3.10 เท่านั้น)
4. ค่า default ที่ใช้อยู่ HQ8/9/10/12/13/19/20/21/25/27 (ถ้าไม่แย้ง = ใช้ต่อ)
5. prod runbook H0.5→H1.3 ยังไม่ได้รันบน prod (ไม่บล็อก RUN · บล็อก H5.3)

## 6. เริ่มใหม่เมื่อสั่ง
(1) อ่านบล็อก ⏸ ล่าสุดท้าย `HR-RESUME.md` → (2) H2.1 r2: head บน `wip/pos-hr-h2.1-fix` (เลน 1 shark-hr) ตรวจ diff ว่าครบ 4 ข้อ (R-1/F1 · R-2/F2 · R-3/F3 · F4) → ถ้า builder ยังไม่จบ ให้ builder ใหม่ทำต่อจาก notes §r2 → ctl.sh lean บน head ใหม่ → merge → postmerge.sh → 11/44 → (3) เลน 1 = oracle H2.2 (+สร้าง qc-hr-lib.mts) · เลน 2 = oracle H2.3 → builder H2.2 เมื่อ oracle พร้อม
