# แผนเติมเต็มทุกโมดูลให้ Full-Function (คำสั่งเด็ดขาดเจ้าของ 2026-07-17)

> ที่มา: เจ้าของตรวจทุกโมดูลแล้วพบ "ฟังก์ชันน้อยมาก ใช้จริงไม่ได้" → สั่งให้ทุกโมดูล Full-Function (UX/UI + API + AI + QC + Security)
> เฟส 1 Audit เสร็จ (workflow wf_148f343e-dc7 · 29 agents · Fable ออกแบบเกณฑ์ + Opus audit 27 โมดูล + Fable สังเคราะห์แผน)
> รายละเอียดเต็ม: `ledger/FULLFUNCTION_AUDIT.json` (rubric B1-B24/F1-F14 + gap ทุกโมดูล)

## ผล Audit: 0 โมดูล "full" · 25 partial · 2 thin (clinic, reward)
เครื่องยนต์หลังบ้านแข็ง (บัญชี CPA 107, POS engine, RBAC/tenant) แต่หน้าบ้านขาดจนใช้จริงไม่ได้:
- **POS ไม่มีหน้าขายสักจอ** (engine เสร็จ 100% แต่ cashier UI ไม่มี)
- เกือบทุกโมดูลลูกค้า **self-service ไม่ได้** (ไม่มี public/QR/PromptPay)
- **คืนเงินหลังชำระไม่ได้ทั้งระบบ** (เงินค้างบัญชี ต้องแก้ DB)
- **แจ้งเตือน/outbox แทบไม่มี** — โมดูลเงียบ (restaurant/hotel/rental/school/member/hr/chat)
- **marketing ส่งแคมเปญ = log-only** ไม่มีข้อความวิ่งออกจริง
- **AI ครอบไม่ถึงครึ่ง** — restaurant/ticket/chat/reports/forms/meeting = 0 tool
- **dead code ไม่ถูก wire**: reward.redeem, queue public, CRM follow-up
- 🔴 **security ด่วน**: HR โชว์เงินเดือน+เลขบัตร ปชช. ทุกคน · calendar leak ข้ามสาขา

## แผน 6 ระลอก (~170 วันงาน) เรียงตาม impact เงิน/ลูกค้า
| Wave | ธีม | วัน | โมดูลหลัก |
|---|---|---|---|
| 1 | เปิดร้านขายได้จริงวันแรก + เก็บ dead code + security ด่วน | 28 | pos(หน้าขาย) · reward/point wire · crm follow-up · queue public · **hr+calendar security hotfix** |
| 2 | เงินถูกและถอยหลังได้ (refund/reversal + กัน race + สต็อก→บัญชี) | 30 | shop/ticket/school/clinic/hotel/rental/restaurant/booking/hr/inventory/point |
| 3 | ลูกค้าจ่ายเอง-จองเอง ชุดแรก (PromptPay rail กลาง) | 32 | payment rail · booking(มัดจำ) · restaurant · hotel · ticket public |
| 4 | self-service ชุดสอง + ข้อความถึงลูกค้าจริง | 26.5 | rental/school/clinic public · member · marketing(LINE จริง) · chat · forms |
| 5 | AI ครบทุกโมดูล (read+write+eval) + KB ฉลาด + realtime | 24 | ai/tools+eval · kb(fuzzy) · meeting(realtime) · kanban |
| 6 | โตต่อ + ธรรมาภิบาล | 29.5 | public API+webhook · CSV import · audit UI · PDPA · ปิดวัน · i18n · bulk |

## Cross-cutting (ทุก wave ต้องมี — ไม่มีไม่ merge)
1. **Design System กลาง**: SubmitButton/ConfirmDialog/EmptyState/StatusChip/inline-error + UX เหล็ก (390px, ≤3 แตะ, ไทยชาวบ้าน, ปุ่ม ≥44px, ห้าม Alert, empty state ชี้ทาง)
2. **AI-first gate**: ฟีเจอร์ใหม่ทุกตัว ship พร้อม AI tool (read+write) + ≥2 eval case/tool
3. **QC oracle 5 แกน/โมดูล**: happy→เงินเข้า Dr=Cr · refund/reversal · race 2-request · ข้ามร้าน 403/404 · idempotency + wire qc ที่หลุด gate (qc-shop/chat/hr/payroll/approval/calendar/report-builder/restaurant) เข้า regression
4. **Security baseline**: rate limit public route · zod ทุก action · idempotency key เงิน/จอง · role gate ข้อมูลอ่อนไหว · PDPA ครอบตารางใหม่
5. **Outbox/Notification กลาง**: mutation สำคัญยิง emitEvent → AppNotification → webhook (pattern เดียวกับ POS/approval)

## สถานะ: รอเจ้าของเคาะโหมดลงมือ (autonomous wave-by-wave vs. review wave 1 ก่อน)
