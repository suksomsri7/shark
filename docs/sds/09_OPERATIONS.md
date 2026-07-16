# 09 — Operations: โหมดรันยาว (Autonomous Long-Run)

> เล่มนี้คือ "คู่มือเดินเครื่อง" — AI session ไหนหยิบไปก็รันต่อได้เหมือนกันเป๊ะ

## บทบาท (คำสั่งถาวรจากเจ้าของ)
| บทบาท | ใคร | หน้าที่ | ห้าม |
|---|---|---|---|
| **หัวหน้างาน** | Fable 5 (main session) | ออกแบบ · เขียน oracle **ก่อน**โค้ด · วางของกลาง (schema/scope/migration) · spawn/คุม Builder · **รันข้อสอบซ้ำเองทุกชุด** · merge · gates · push · ยืนยัน deploy READY · บันทึก ledger · ตอบเจ้าของ (ไทยเสมอ) | โยนงานออกแบบ/ตรวจรับให้ Builder |
| **คนทำงาน** | Builder = sub-agent Opus 4.8 | สร้างตามสัญญาหัว oracle เป๊ะ · รัน oracle ของตัวเองบน Neon branch · commit ใน worktree (--no-verify, ห้าม push) · รายงานดิบ: ผลจริง/จุดตัดสินใจ/สิ่งที่สงสัย | แก้ oracle · แตะไฟล์นอกรายการ · รัน typecheck/build/fitness · ใช้ key จริง · แตะ DB prod |
| ขนาน | **≤2 Builder พร้อมกัน** (บทเรียน OOM 2core/3G) | งานต้อง disjoint ไฟล์กัน | ปล่อย 3+ หรือ build ขนาน |

## วงจรรันยาว (ทำซ้ำต่อ 1 WO)
```
ตื่น → 1. เช็ค Support Desk (platform.listAllCases OPEN) — เคสจริง = แทรกคิวด่วนก่อนเสมอ
     → 2. อ่าน 10_MASTER_QUEUE หยิบ WO ถัดไปที่ dependency ครบ + ไม่ติด needs-owner
     → 3. Fable วางของกลาง: schema+scope+migrate deploy → typecheck → push (oracle ต้อง standalone-typesafe!)
     → 4. pnpm neon:create wo-XXXX → spawn Builder (prompt ตาม template ใน ledger เดิม ๆ)
     → 5. ScheduleWakeup 20-25 นาทีเป็น fallback → รอ notification
     → 6. Builder เสร็จ → Fable รัน oracle ซ้ำเอง + regression ที่เกี่ยว → อ่าน diff จุดเสี่ยง
     → 7. merge → set -o pipefail && typecheck && fitness → แดง = Fable แก้เอง (แผลซ้ำ: tenantId/as-const/upsert)
     → 8. push → poll Vercel API จน READY (ERROR = ดึง build log แก้ทันที ห้ามไปต่อ)
     → 9. ledger: WO done + RESUME CHECKPOINT อัปเดต → ลบ neon branch + worktree
     → 10. ทุก ~5 WO: อัปเดต memory + สรุปสั้นให้เจ้าของ 1 ข้อความ (ไม่ spam)
```

## การบันทึก (กันหลุด 100%)
- **แหล่งจริงเดียว**: repo บน GitHub — `ledger/RESUME.md` (CHECKPOINT หัวไฟล์) + `ledger/wo/*.json` + `docs/sds/**`
- push **ทุกขั้น**: ของกลางก่อน spawn · หลัง merge · หลังแก้ · RESUME ทุกจบ WO — ไม่มีสถานะสำคัญอยู่แค่ใน context เกิน 15 นาที
- memory (`~/.claude/projects/-root/memory`) = pointer ชี้มาที่ ledger เท่านั้น (อัปเดตทุก ~5 WO)

## ชนลิมิต / session ตาย / กู้คืน
| เหตุการณ์ | ผลกระทบ | วิธีกู้ (เขียนไว้ให้ session ใหม่ทำตามได้เลย) |
|---|---|---|
| context ยาว → ถูก summarize | ไม่กระทบ — harness ต่อให้เอง | ทำงานต่อปกติ ยึด ledger ไม่ยึดความจำ |
| ชน usage/rate limit | เครื่องหยุดชั่วคราว | ledger ครบ → เปิด session ใหม่: **"อ่าน ledger/RESUME.md แล้วทำต่อ"** — เดินต่อจากขั้นที่ค้างใน CHECKPOINT |
| session ตายกลาง Builder วิ่ง | งาน Builder อยู่ใน worktree เสมอ | `git worktree list` → เข้าไปดู commit/ไฟล์ → รัน oracle → เขียว=merge ต่อ · ค้าง=spawn ใหม่จากสัญญาเดิม (oracle อยู่ใน repo แล้ว) |
| VPS OOM (บทเรียน 2026-07-16) | เหมือน session ตาย | เหมือนบน + จำกติกา ≤2 Builder |
| Vercel deploy ERROR | prod เสิร์ฟรอบสำเร็จล่าสุด (ไม่ล่ม) | ดึง events log จาก API → แก้ → push → poll READY |
| Neon branch ค้าง | เปลืองเล็กน้อย | `pnpm neon:list` → `neon:delete` (มี `neon:gc` กวาด) |

## จุดที่ต้องหยุดถามเจ้าของ (ห้ามเดา) vs เดินต่อได้
- **หยุดถาม**: ลบข้อมูลจริง · เปลี่ยนราคา/นโยบายที่ประกาศแล้ว · ส่งอะไรถึงลูกค้าจริง · จ่ายเงิน/สมัครบริการภายนอก
- **เดินต่อ + จด "กล่องรอเจ้าของ" ใน RESUME**: ค่า default ทางธุรกิจ (ทำเป็น config เปลี่ยนได้) · key ที่ยังไม่มี (สร้างส่วนที่เหลือแบบปิดสุภาพรอ key) · การตีความสเปคเล็กน้อย (จดเหตุผล)

## งบประมาณต่อ WO (กันบาน)
Builder 1 ตัว/WO · ถ้า Builder ล้มเหลว 2 รอบติดใน WO เดียว → หยุด WO นั้น จดใน RESUME พร้อมสาเหตุ ไปทำตัวถัดไป (ห้ามจมกับตัวเดียว) · WO ใหญ่เกิน = แตกเป็น WO ย่อยใน queue ก่อนเริ่ม
