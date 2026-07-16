# 10 — Master WO Queue (เต็มวิสัยทัศน์ · เครื่องรันยาวหยิบจากที่นี่)

> กติกา: หยิบตัวแรกที่ (1) dependency ครบ (2) ไม่ติด 🔑 needs-owner (3) เคส Support Desk แทรกก่อนเสมอ
> ทุก WO: Fable เขียน oracle ก่อน → Builder สร้าง → ตรวจรับตาม 09_OPERATIONS · WO ใหญ่แตกย่อยได้ตอนเริ่ม
> สถานะอัปเดตใน ledger/wo/ (ไฟล์ต่อใบ) เมื่อเปิดงานจริง (ไฟล์นี้คือแผน — ledger คือความจริง)

## Phase D — ความลึกไทย-first (ทำก่อน: คือจุดขายที่ global player แพ้)
| WO | งาน | สรุปสเปค | ขึ้นกับ | หมายเหตุ |
|---|---|---|---|---|
| 0035 | **ภาษีขาย/ซื้อยื่นจริง** | รายงาน ภ.พ.30 export (xlsx/ไฟล์ยื่น) + ภ.ง.ด.3/53 + หัก ณ ที่จ่าย + ใบ WHT — ต่อจาก reports ที่มี | — | oracle เทียบตัวเลขกับ qc:account |
| 0036 | **Payroll ไทย** | งวดเงินเดือน · ปสส. 5% (เพดาน) · ภงด.1 · payslip PDF-lite · ลงบัญชีผ่านเส้นเงินเดิม | 0035 | โมดูล HR ต่อยอด |
| 0037 | **Multi-warehouse** | Location ต่อ system · onHand ต่อ location · transfer (movement คู่ TRANSFER) · PO รับเข้าเลือกคลัง | — | แตะ inventory schema — ระวัง regression 12 ข้อ |
| 0038 | **Lot/Expiry/Barcode** | lot+วันหมดอายุต่อ movement · แจ้งใกล้หมดอายุ (Automation event ใหม่ `inventory.lot.expiring`) · ค้นด้วย barcode | 0037 | |
| 0039 | **บัญชีลึก** | aging ลูกหนี้/เจ้าหนี้ · งบกระแสเงินสดทางอ้อม · ปิดงวดอัตโนมัติ (cron) | 0035 | |
| 0040 | **หนี้เส้นเงิน (รอบสมาธิเต็ม)** | ลด query ต่อ flow (เลิกพึ่ง tx 30s) · DEPOSIT/ROOM_CHARGE map ถูกบัญชี · oracle harness booking→POS | — | ห้ามทำขนานกับ WO อื่นที่แตะบัญชี |

## Phase E — Reliability & Security (ก่อนรับร้านจำนวนมาก)
| WO | งาน | สรุปสเปค | ขึ้นกับ | หมายเหตุ |
|---|---|---|---|---|
| 0041 | **Observability** | error capture กลาง + request log + health endpoint + **alert → email/LINE เจ้าของ** (ผ่าน AppNotification+webhook เดิม) + หน้า backoffice/system-health | — | สำคัญสุดใน phase นี้ |
| 0042 | **PDPA + Backup/DR** | export ข้อมูลร้าน (json) · ลบร้าน (PENDING_DELETE 30 วัน → purge cron) · เอกสาร DR + ซ้อม restore Neon branch | — | |
| 0043 | **Hardening** | rate limit (login/OTP/AI/cron) · security headers · CSRF ตรวจ · รวม CRON_SECRET เก่า/ใหม่ · self-audit checklist | — | pentest ภายนอก = 🔑 needs-owner |
| 0044 | **Query budget ratchet** | fitness ข้อใหม่: นับ query ต่อ flow สำคัญ ห้ามเพิ่มเกิน baseline | 0040 | |

## Phase F — AI Moat (ขยายจุดที่ชนะโลกให้ห่าง)
| WO | งาน | สรุปสเปค | ขึ้นกับ |
|---|---|---|---|
| 0045 | **AI actions ×10** | ทำแทนเพิ่ม: จองคิวให้ลูกค้า · เปิดบิล POS · เพิ่มสินค้า · ปรับสต็อก(ADJUST) · สร้างพนักงาน · นัดประชุม · ออกคูปอง · ตอบเคส support ร้าน · สร้างงาน kanban · บันทึกค่าใช้จ่าย — ทุกตัวเดินเส้น proposal เดิม | — |
| 0046 | **AI นักวิเคราะห์** | รายงานสัปดาห์อัตโนมัติ (cron+LLM): ยอด/แนวโน้ม/สต็อก/คำแนะนำ → AppNotification + หน้ารายงาน · ถาม-ตอบเชิงวิเคราะห์บนข้อมูลรวม | — |
| 0047 | **AI triage support** | ฝั่ง backoffice: AI สรุปเคส+ร่างคำตอบ (คน platform กดส่ง — ไม่ auto-send) | — |
| 0048 | **DNA ต่อเนื่อง (M4.5)** | AI ทบทวน DNA เมื่อธุรกิจเปลี่ยน (ข้อมูลจริงขัดกับ facts → ชวนอัปเดต) + onboarding checklist หลังประกอบ | — |

## Phase G — โมดูลใหม่จากวิสัยทัศน์ (ทีละตัว มี oracle ทุกตัว)
| WO | โมดูล | สรุปสเปค | ขึ้นกับ |
|---|---|---|---|
| 0049 | **Approval engine** | สายอนุมัติ config ได้ (PO/ใบลา/เอกสาร ≥X บาท → MANAGER→OWNER) — core service ให้โมดูลอื่นเกาะ | — |
| 0050 | **Rental** | สินทรัพย์ให้เช่า · ปฏิทินว่าง · มัดจำ→เส้นเงินเดิม · คืน+ค่าปรับ | — |
| 0051 | **School/คอร์ส** | คอร์ส·รอบเรียน·นักเรียน(=Customer)·เช็คชื่อ·จ่ายค่าเรียน→เส้นเงิน | — |
| 0052 | **Clinic/Healthcare** | นัด(ต่อยอด Booking)·ประวัติผู้ป่วยแบบเบา(PDPA!)·ยา(ต่อ Inventory) | 0042 |
| 0053 | **E-commerce** | catalog หน้าร้าน storefront · ตะกร้า · checkout PromptPay · order→เส้นเงิน+ตัดสต็อก | — |
| 0054 | **Form builder** | ฟอร์ม config (field types) · public link · submissions → Customer/CRM lead | — |
| 0055 | **Report builder v1** | เลือก dataset+filter+group → ตาราง/export — บน metric ที่มี | — |
| 0056 | **Dashboard builder v1** | เลือก widget/KPI จัดหน้า dashboard เอง (ต่อยอด WO-0030) | 0055 |
| 0057 | **Calendar รวม** | ปฏิทินกลางรวม Booking/Meeting/HR ลา/Rental — read-only v1 | — |
| 0058 | **Customer Portal** | ลูกค้า login (OTP) เห็น order/booking/แต้ม/ใบเสร็จ/แชท — reuse (store)/ | — |
| 0059 | **Vendor Portal** | supplier login เห็น PO/สถานะจ่าย | 0049 |
| 0060 | **Delivery โครง** | โครง integration ขนส่ง (adapter pattern · ยังไม่ผูกเจ้าไหน) | 0053 |

## Phase H — Platform & Ecosystem
| WO | งาน | สรุปสเปค | ขึ้นกับ | 🔑 |
|---|---|---|---|---|
| 0061 | **Public API v1** | REST + API key ต่อ tenant (hash) + rate limit + docs หน้า /developers | 0043 | |
| 0062 | **Webhooks ขาออก** | สมัคร URL ต่อ event (ต่อยอด Automation) + ลายเซ็น HMAC + retry | — | |
| 0063 | **Marketplace โครง** | ทะเบียน plugin/template · install ต่อ tenant · เริ่มจาก template อุตสาหกรรม (DNA presets) | 0061 | |
| 0064 | **White label** | โลโก้/สี/ชื่อ ต่อ tenant บน storefront+อีเมล (ต่อ custom domain ที่มี) | — | |
| 0065 | **Host-routing โดเมนลูกค้า** | resolve ที่ชั้น app หรือย้าย adapter-neon แล้วทำใน proxy (ดู ADR A6) | 0064 | |
| 0066 | **i18n v2** | เมนูร้านอาหาร+จอคิว TV+error actions + EN หลังบ้าน (เลือกภาษาต่อ user) | — | |
| 0067 | **LINE OA ลึก** | แจ้งเตือนลูกค้า (จอง/คิว/แต้ม) ผ่าน LINE ต่อร้าน (BYO channel token) | — | 🔑 ร้านต้องมี LINE OA |
| 0068 | **Mobile/PWA polish** | manifest+icon+offline shell+webview เช็คลิสต์ | — | |

## Phase I — Business
| WO | งาน | สรุปสเปค | 🔑 |
|---|---|---|---|
| 0069 | **Billing plans + quota** | FREE/PRO(โครงราคา config) · quota (ระบบ/พนักงาน/AI ต่อวัน) enforce + หน้า upgrade | ราคาจริง = เจ้าของ |
| 0070 | **Beam gateway** | รับบัตร/ผ่อน ต่อ checkout — โค้ดโครง+ปิดสุภาพรอ creds | 🔑 Beam creds ชื่อ shark |
| 0071 | **Landing + funnel** | หน้าการตลาด shark.in.th (คุณค่า/ราคา/สมัคร) + SEO + วิดีโอเดโม่จุดที่ AI ทำแทน | ถ้อยคำสุดท้าย = เจ้าของ |
| 0072 | **Onboarding drip** | หลังสมัคร: checklist+อีเมล/แจ้งเตือนแนะขั้นถัดไป (ต่อ Automation) | — |
| 0073 | **คลังความรู้ (KB)** | FAQ/ความรู้เฉพาะร้าน (สร้าง/แก้/หมวด) → AI ใช้ตอบ (tool `kb_search`) + ทีมค้นได้ — ปิดป้าย "เร็ว ๆ นี้" ตัวสุดท้ายในเมนู | — |

## 🔑 กล่องรอเจ้าของ (สะสม — เครื่องไม่หยุดรอ แต่ฟีเจอร์เปิดจริงเมื่อได้)
SHARK_BUNNY_* (storage) · Beam creds (0070) · FAL key ชื่อ shark (gen ภาพ) · สแกน QR PromptPay ทดสอบ · pentest ภายนอก (0043) · ราคา plan จริง (0069) · ร้านจริง 5-10 ร้าน (ตัวคูณทุกอย่าง)

## ลำดับเดินเครื่องแนะนำ (interleave กัน phase ละตัวเพื่อกระจายความเสี่ยง)
`0041 → 0035 → 0045 → 0036 → 0042 → 0046 → 0037 → 0043 → 0049 → 0053 → 0038 → 0054 → 0058 → 0061 → 0039 → 0055 → 0056 → 0062 → 0066 → 0069 → ...` — Support Desk แทรกได้เสมอ · 0040 ทำเดี่ยว ๆ ตอนไม่มีอะไรแตะบัญชี
