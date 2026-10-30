# ใบสั่ง D.9 — ผู้เช่าผ่าน LINE + หน้าจ่าย/พอร์ทัลผู้เช่า (ลิงก์เซ็น) · ตรวจ: **เข้ม 2 รอบ** (ข้อมูลข้ามร้าน · ลิงก์สาธารณะ · เงิน · สคบ.)

> แถวใบ: `ledger/SVC-MASTER-PLAN.md` D.9 · แบบ: `ledger/DESIGN-DORM-HOTEL.md` §6 A6 (+ A5 ข้อ "กดส่ง = … LINE (Flex)" · A7 "สลิปเข้า") · §8 แถว แชท/LINE + ชำระเงิน · ภาคผนวก ก หอ #29 #38 #39 #53–#58 · ภาพ `ledger/design-dorm/05-line-tenant.png` (ก = บิล Flex + เมนูล่าง 6 ช่อง · ข = หน้าจ่าย QR → แนบสลิป → ใบเสร็จ · ค = แจ้งซ่อม = **D.16 ไม่ใช่ใบนี้**)
> สัญญากลาง: `ledger/SVC-CORE-CONTRACT.md` §3 (`submitSlip` · `promptpayQrFor` · `receiverFor`) §4.1–§4.5 (`ChatLinkCode(DORM_LEASE)` · `syncRichMenu` · `postback-routes` · `notifyCustomer` · `signLink`) §6.2 §8 (`dorm.lease.manage` · `dorm.settings.edit`) + ภาคต่อ 28 ต.ค.
> บทเรียนที่ต้องอ่านก่อนเขียน (โค้ดชนะเอกสาร): `/root/svc-runs/fix/b9.md` (**BLOCKER ยึด LINE จากเบอร์ที่ไม่ยืนยัน** — ห้ามผูก Party จากเบอร์/ชื่อ · owns() ต้องไม่เชื่อ Party จากช่องไม่ยืนยัน) · `/root/svc-runs/fix/b6.md` (**หน้า token สาธารณะค้างข้อมูลคนก่อน** — ลิงก์ผูกกับ "สัญญา" ไม่ใช่ "ห้อง" · ไม่มีสถานะค้างข้ามคน) · `/root/svc-runs/fix/d8.md` + `/root/svc-runs/fix/d11.md` (**ส่งต้องอ่านสถานะสดตอนส่ง** · ค่าปรับที่ยกเว้นแล้วห้ามถูกเรียกเก็บ) · `/root/svc-runs/fix/d3.md` · `ledger/wo-notes/svc-legal-questions.md`
> ข้อสอบ (ห้ามแก้): «scripts/qc-svc-d.9.mts» — รับใบ = **ผ่านทุกข้อ** (นับจาก `JSON_SUMMARY`) · SKIP ที่ยอมได้ระหว่างทำ: `G-*` (`--no-regression`) · `V-*` (ไม่มี `QC_BASE`) · `Q-*` (ร้าน svcqc ยังไม่มีฉาก D.13) · `S-1` (หลัง merge)
> รัน: `cd /root/projects/shark-svc-l2 && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-svc-d.9.mts [--no-regression]` (ห้าม `timeout` ครอบ · ห้าม kill กลางคัน — ล้างข้อมูลใน finally) · ข้อสอบเปิดตัวจำลอง LINE เอง (127.0.0.1 + `LINE_API_BASE`) · ตั้ง `APP_URL=https://qc-d9.invalid` ในโพรเซสตัวเอง · บล็อกคำขอออกนอกเครื่อง — **ไม่ยิง LINE จริง**
> builder: **ห้าม build/next · ห้าม commit/push · ห้าม `pnpm install` · ห้าม migration/แตะ `prisma/**` · ห้ามแก้ข้อสอบ/`scripts/**` ยกเว้นสร้าง «scripts/svc-qc-portal-scene.mts» (ไฟล์ใหม่ไฟล์เดียว)** · temp ขึ้นต้น `svc-d9-` · รายงานต่อข้อ (id → ผล)
> ผู้เขียนข้อสอบแก้ให้แล้ว (builder ห้ามแตะ): `scripts/svc-qc-data.mts` บล็อก `SVC D.9` (ค่าฉาก `SQC_DORM_PORTAL_SCENE` · `sqcPortalToken` · `SQC_VISUAL_SPECS["d.9"]`)

---

## 1. ไฟล์ที่ใบนี้เป็นเจ้าของ (แตะนอกนี้ = ตีกลับ · ข้อสอบ S-1 ไล่ `git status` ของ `src/` `prisma/` `public/`)

| ไฟล์ | ทำอะไร |
|---|---|
| «src/lib/platform/dorm-line.ts» (ใหม่) | §3.2–§3.6 ฝั่ง LINE ทั้งหมด: รหัสผูกห้อง · route postback `dorm.*` · rich menu · ส่งบิล (consumer `dorm.billrun.sent`) · งานส่งซ้ำ · แนบสลิปจากรูปในแชท · Flex บิล |
| «src/lib/platform/dorm-portal.ts» (ใหม่) | §3.1 facade พอร์ทัลสาธารณะ (ลิงก์เซ็น) + `portalUrl` (hook ที่ D.8/D.11/LINE ใช้) |
| «src/lib/platform/dorm-richmenu-image.ts» (ใหม่) | รูปเมนูล่าง PNG เป็น base64 (`DORM_RICHMENU_PNG_BASE64`) — สร้างจาก HTML ด้วยเครื่องมือเรนเดอร์เดิม (`ledger/design-dorm/render.mjs` · ไฟล์ต้นทาง `ledger/design-dorm/richmenu-dorm.html` แตะได้) · 2500×1686 · ≤ 1 MB · 6 ช่องตามภาพ 05ก |
| «src/lib/modules/dorm/portal.ts» (ใหม่) + `src/lib/modules/dorm/index.ts` (เพิ่ม export เท่านั้น) | ตัวอ่านฝั่งผู้เช่าแบบไม่มีผู้กระทำ (ผู้เรียก = platform หลังตรวจลิงก์แล้ว) — ประตูสัญญาสด · บิลของสัญญา · ยอดค้างสด · สัญญา/ไฟล์ · ผ่าน `tenantDb` เท่านั้น (F5.1) · ชื่อฟังก์ชันภายในเลือกเอง |
| «src/lib/modules/chat/line-content.ts» (ใหม่) + `src/lib/modules/chat/index.ts` (เพิ่ม export 1 บรรทัด) | §3.6 `fetchLineMessageContent` — ⚠️ แตะโมดูลแชท (ชิ้นกลาง R0.7) **ต้องผู้คุมรับรอง Q1** |
| `src/app/api/chat/webhook/[connectionId]/route.ts` | §3.6 เพิ่มบล็อกเดียว: รูป LINE ⇒ `onLineImage` (dynamic import) · **ห้ามลบบรรทัดเดิม** — ⚠️ Q1 |
| «src/app/(store)/d/[token]/page.tsx» · «actions.ts» · «receipt/page.tsx» · «lease/page.tsx» · «f/[fileId]/route.ts» · (เลือกได้ «not-found.tsx») (ใหม่) | §5 หน้าพอร์ทัลสาธารณะ (F6.1: action สาธารณะอยู่ใต้ `app/(store)`) · **ห้ามแตะ `src/app/(store)/d/page.tsx` และ `src/app/(store)/d/actions.ts` (จอลูกค้า POS)** |
| «src/components/dorm/portal/*.tsx» (ใหม่ · `DormPortal.tsx` = default export) | §4 คอมโพเนนต์หน้าจ่าย |
| «src/app/app/u/[unitSlug]/dorm/tenants/[leaseId]/line/page.tsx» · «actions.ts» + «src/components/dorm/DormLineCard.tsx» (ใหม่) | §3.2 จอพนักงาน: ออกรหัสผูก (QR พิมพ์ติดห้อง/แนบสัญญา) + ปุ่มตั้งเมนู LINE ของหอ |
| `src/lib/platform/postback-routes.ts` | **เพิ่มบรรทัดลงทะเบียน route `dorm.` เท่านั้น** (lazy import · ไม่ลบบรรทัดใด — S-8) |
| `src/lib/outbox-consumers.ts` | แทนบรรทัดเดียว `"dorm.billrun.sent": withAutomation(async () => {})` ⇒ งานหลัก = `async (evt) => (await import("@/lib/platform/dorm-line")).onDormBillSent(evt)` — **ไม่มี event ใหม่** (ทะเบียนป้าย automation/webhooks ไม่ถูกแตะ) |
| `src/lib/platform/minute-jobs.ts` | ลงทะเบียน `dorm.line` (ทุก 5 นาที · lazy import `runDormLineJobs`) — บล็อกเดียว |
| `src/lib/modules/dorm/dunning.ts` | **จุดเดียว**: ตัวแปร `payLink` ของข้อความเตือน/ทวง = `portalUrl(...)` (dynamic import `@/lib/platform/dorm-portal` แบบเดียวกับที่ไฟล์นี้ import `notify-customer` อยู่แล้ว) · พฤติกรรมอื่นของ D.11 ห้ามเปลี่ยน (G d.11) |
| `src/lib/core/settings/defs/rooms.ts` | §2 ค่าตั้งใหม่ 4 คีย์ (เพิ่มเท่านั้น) |
| «scripts/svc-qc-portal-scene.mts» (ใหม่) | §7 ฉากภาพ |

ห้ามแตะ: `prisma/**` · `src/lib/core/**` นอก `defs/rooms.ts` · `src/lib/platform/notify-customer.ts` · `src/lib/payment/**` · `src/lib/modules/chat/**` นอก 2 จุดข้างบน · `src/lib/modules/dorm/{billing,latefee,calc,lease,meter,utility,law,tax-invoice,home,policy,access,account-bridge}.ts` · `src/lib/modules/account/**` · `src/lib/automation/labels.ts` · `src/lib/webhooks/labels.ts` · `src/components/dorm/dorm-policy-shared.ts` (ไม่มีตัวแปรแม่แบบใหม่ ⇒ ไม่ต้องแตะ) · หน้าตั้งค่าหอ (D.13 — ค่าตั้งใหม่โผล่ในการ์ดเองเพราะอยู่ในกลุ่มเดิม)
> ทำไมชั้น platform: ต้องใช้ หอ + บัญชี + สลิป + แชท + notifyCustomer พร้อมกัน (แบบ `booking-line-link.ts` ของ B.9) · import โมดูลผ่าน facade (`@/lib/modules/dorm` · `@/lib/modules/chat` · `@/lib/modules/account`) + `@/lib/payment/slip-verify` · `@/lib/payment/receiver` · `@/lib/core/signed-link` · **ไฟล์ platform ของใบนี้ห้าม `import { prisma }` ดิบ** (ใช้ facade หรือ `tenantDb`)

## 2. ค่าตั้งใหม่ (ทะเบียน · ป้ายไทย · ชั้น UNIT · **อยู่ในกลุ่มเดิมเท่านั้น** ⇒ การ์ดหน้า 17 ของ D.13 แสดงเอง · d.13 R-7 ไม่แดง)
| คีย์ | ชนิด · schema | ค่าเริ่ม | ป้ายไทย (ตัวอย่าง) |
|---|---|---|---|
| `rooms.notify.portalLinkDays` | days · int 1–90 | **35** | อายุลิงก์หน้าจ่าย/พอร์ทัลผู้เช่า (วัน) |
| `rooms.notify.linkCodeDays` | days · int 1–30 | **30** | อายุรหัสผูกห้องกับ LINE (วัน) |
| `rooms.notify.richMenu` | bool | **true** | ตั้งเมนูล่าง LINE ของหอ (บิลของฉัน · แจ้งซ่อม · ประกาศ · สัญญา · พัสดุ · ติดต่อหอ) |
| `rooms.payment.slipAutoAttach` | bool | **true** | แนบรูปสลิปที่ผู้เช่าส่งในแชทเข้าบิลค้างอัตโนมัติ |

ค่าที่มีอยู่แล้วที่ใบนี้ใช้ (อ่านต่อคำขอ · ไม่แคชข้ามคำขอ): `messaging.lineConnectionId` (**OA ต่อหน่วย** — null = ไม่มี LINE) · `messaging.channelOrder` · `messaging.quietHours` · `rooms.msg.bill` · `rooms.billing.sendChannels` · `payments.receiver` · `payments.slip.*` (ของ submitSlip) · ห้ามฮาร์ดโค้ดตัวเลขนโยบาย (S-11: ไม่มี `35`/`30` เป็นอายุลิงก์ในไฟล์ platform)

## 3. สัญญา (ข้อสอบมีสำเนาชนิด — ชื่อ/ฟิลด์ต้องตรง)

### 3.0 นิยามกลาง
- **สัญญาที่ยังมีผล (live)** = `DormLease` ของร้าน (`tenantId`) · `status ∈ {ACTIVE, NOTICE}` · `endedAt = null` · (`endDate = null` หรือ `endDate ≥ วันนี้ไทย`) · หน่วยเป็น `DORM` ของร้าน · ไม่ live ⇒ ทุกทางของใบนี้ทำเหมือน "ไม่มี" (ผูกไม่ได้ · ลิงก์ 404 · postback ข้อความกลาง · ไม่ส่งบิล · ไม่แนบสลิป)
- **บิลที่ผู้เช่าเห็น** = `DormBill` ของสัญญานั้นเท่านั้น สถานะ `SENT | PARTIALLY_PAID | PAID` (ไม่เห็น DRAFT/HELD/VOID)
- **ยอดค้างสด** (`outstandingSatang`): บิลมี `accountDocumentId` ⇒ คิดจากบัญชี ณ ตอนเรียก (ยอดใบ + ใบเพิ่มหนี้ − ใบลดหนี้ − รับชำระที่ไม่ถูกยกเลิก · ผ่าน facade บัญชี เช่น `docPaymentLedger`/`docLinkInfo`) · ไม่มีใบ (บิลยกมา · มติ D.11 ข้อ 6) ⇒ `totalSatang − paidSatang` · ไม่ติดลบ
- **บิลเปิด** = บิลที่ผู้เช่าเห็น + ยอดค้างสด > 0
- **ลิงก์พอร์ทัล** = `signLink({ tenantId, purpose: "dorm.portal", subjectId: <leaseId>, expMin: rooms.notify.portalLinkDays × 1440 })` — **subject = สัญญา ไม่ใช่ห้อง/บิล** (ผู้เช่าใหม่ห้องเดิมไม่มีวันเห็นของคนเก่า และกลับกัน — บทเรียน B.6) · URL = `<origin>/d/<token>` (+ `?bill=<billId>` ได้) · origin = `APP_URL` → `NEXT_PUBLIC_APP_URL` (ไม่มี = path สัมพัทธ์)
- เวลาไทยผ่าน `bkkYmd`/`bkkParts` · ห้าม `.getDay/.getDate/.getMonth/.getHours/.getFullYear()` ดิบในไฟล์ใหม่ · ป้ายงวด `"พ.ย. 2569"` · ป้ายวัน `"5 พ.ย. 2569"`

### 3.1 «dorm-portal.ts»
```ts
export const DORM_PORTAL_PURPOSE = "dorm.portal";
export const PORTAL_RATE = { view: { limit: 120, windowMs: 600_000 }, slip: { limit: 10, windowMs: 600_000 } } as const; // ค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน)
export type PortalOpts = { clientKey: string; now?: Date };
export type PortalBillState = "UNPAID" | "PARTIAL" | "PENDING_REVIEW" | "PAID";
export type PortalView = {
  unitName: string; roomNumber: string;
  bill: null | {
    billId: string; periodKey: string; periodLabel: string; dueDate: string /* YYYY-MM-DD */; dueLabel: string; docNo: string | null;
    lines: { code: string; labelTh: string; detail: string | null; amountSatang: number }[];        // จาก DormBill.lines (ไม่แก้ทับ)
    adjustments: { kind: "CREDIT" | "DEBIT"; docNo: string | null; amountSatang: number }[];        // ใบลด/เพิ่มหนี้ที่มีผลของใบบิลนี้
    totalSatang: number; paidSatang: number; outstandingSatang: number; state: PortalBillState;
    slip: null | { status: "PENDING" | "AUTO_APPROVED" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED"; at: string };  // สลิปล่าสุดของบิลนี้
  };
  pay: null | { amountSatang: number; payload: string; qrSvgDataUrl: string; receiverName: string; promptpayId: string };
  history: { billId: string; periodKey: string; periodLabel: string; totalSatang: number; outstandingSatang: number; state: PortalBillState; current: boolean }[];
  links: { self: string; receipt: string | null; lease: string };   // path สัมพัทธ์ (มี token)
  can: { uploadSlip: boolean };
};
export async function portalUrl(ctx: { tenantId: string }, i: { leaseId: string; billId?: string | null }, opts?: { now?: Date }): Promise<string>;
export async function loadPortal(token: string, q: { bill?: string | null }, opts: PortalOpts): Promise<PortalView | null>;
export type PortalSlipResult =
  | { ok: true; slipId: string; status: "PENDING" | "AUTO_APPROVED" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED"; replayed: boolean }
  | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" | "BAD_FILE" | "NOT_PAYABLE" | "FAILED"; reason: string };
export async function submitPortalSlip(token: string, i: { billId: string; file: { data: Uint8Array; contentType: string }; idempotencyKey: string; qrPayload?: string | null },
  opts: PortalOpts & { deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> } }): Promise<PortalSlipResult>;
export type PortalReceipt = { unitName: string; roomNumber: string; billId: string; periodLabel: string; docNo: string | null; titleTh: string;
  totalSatang: number; paidSatang: number; payments: { paidAt: string; amountSatang: number; channelTh: string }[] };
export async function loadPortalReceipt(token: string, q: { bill: string }, opts: PortalOpts): Promise<PortalReceipt | null>;
export type PortalLease = { unitName: string; roomNumber: string; startDate: string; endDate: string | null; rentSatang: number; commonFeeSatang: number; depositSatang: number;
  contract: { textTh: string; clauses: { titleTh: string; textTh: string }[] } | null;
  files: { fileId: string; kind: "ROOM_PHOTO" | "DOCUMENT"; contentType: string; at: string; path: string /* /d/<token>/f/<fileId> */ }[] };
export async function loadPortalLease(token: string, opts: PortalOpts): Promise<PortalLease | null>;
export async function portalFileRef(token: string, fileId: string, opts: PortalOpts): Promise<{ fileId: string; contentType: string } | null>;
```
**ลำดับตายตัวของทุกฟังก์ชันที่รับ token** (ห้ามสลับ — X7):
1. **rate limit ก่อนทุกอย่าง** (แตะฐานเท่ากันทุกกรณี — กันใช้เวลาตอบแยก "token ผิด" กับ "token ถูกแต่สัญญาจบ"): `checkRateLimitDb("dorm:portal:view:" + clientKey, PORTAL_RATE.view, now)` (slip ใช้ `"dorm:portal:slip:" + clientKey` + `PORTAL_RATE.slip`) · เกิน ⇒ `null` / `RATE_LIMITED`
2. `verifyLink(token, "dorm.portal")` ล้ม ⇒ `null` / `NOT_FOUND`
3. สัญญา live (§3.0) ใน `tenantId` ของ token เท่านั้น ⇒ ไม่ใช่ ⇒ `null` / `NOT_FOUND`
4. `bill` ที่ระบุต้องเป็นบิลที่ผู้เช่าเห็นของ **สัญญานี้** ⇒ ไม่ใช่ (ห้องอื่น · ร้านอื่น · DRAFT/HELD/VOID · ขยะ) ⇒ `null` / `NOT_FOUND` — **ไม่ตกไปบิลอื่นแทน**
- ทุกกรณีล้มของข้อ 1–4 = **ผลเดียวกันทุกไบต์** (`null` · หรือ `{ ok:false, code:"NOT_FOUND", reason: <ข้อความเดียว> }`) · หน้าเรียก `notFound()` ⇒ HTTP 404 เนื้อเดียวกัน (V-2) · เวลาใกล้กัน (P-4: ค่ากลางต่างกัน ≤ 250 ms)
- `loadPortal` ไม่ระบุ `bill` ⇒ บิลเปิดที่งวดล่าสุด · ไม่มีบิลเปิด ⇒ บิลล่าสุดที่เห็น · ไม่มีเลย ⇒ `bill: null`
- `state`: ค้างสด 0 ⇒ `PAID` · มีสลิปล่าสุดสถานะ PENDING/NEEDS_REVIEW/AUTO_APPROVED/APPROVED และค้าง > 0 ⇒ `PENDING_REVIEW` · จ่ายแล้วบางส่วน ⇒ `PARTIAL` · อื่น ⇒ `UNPAID`
- `pay` = ค้างสด > 0 และ `promptpayQrFor({tenantId}, { unitId, amountSatang: <ค้างสด>, ref: docNo ?? billId })` สำเร็จ ⇒ **QR ล็อกยอดค้างสดตรงทุกสตางค์** (หลังจ่ายบางส่วน = ยอดที่เหลือ · หลังใบลดหนี้ = ยอดหลังลด) · ไม่มีผู้รับ ⇒ `null`
- `history` = บิลที่ผู้เช่าเห็นของสัญญานี้เท่านั้น เรียงงวดใหม่ → เก่า · `links.receipt` มีเมื่อบิลมีการรับชำระ
- **ไม่มีในผลคืน/หน้า**: เบอร์ · เลขบัตร · ชื่อเต็มของใครก็ตาม (ลิงก์ส่งต่อได้) · id ของสัญญา/บิลของคนอื่น
- `submitPortalSlip`: ข้อ 1–3 → ไฟล์ (ชนิด `SLIP_ACCEPT_TYPES` · ≤ `SLIP_MAX_BYTES` · ไม่ผ่าน ⇒ `BAD_FILE` ก่อนอัป) → บิลข้อ 4 (`NOT_FOUND`) → ค้างสด = 0 ⇒ `NOT_PAYABLE` → `submitSlip({tenantId}, { unitId, domain: "DORM", refType: "DORM_BILL", refId: billId, partyId: <lease.partyId>, file, qrPayload, expectedSatang: <ค้างสด อ่านตอนนี้>, idempotencyKey: "dorm-portal:" + billId + ":" + idempotencyKey (ตัดให้ผ่าน KEY_RE), expectedPayerNames: [ชื่อ Party] }, { put, del, now })` — **ยอดคาดหวังคิดฝั่งเซิร์ฟเวอร์เสมอ** · `deps` มาจากผู้เรียกฝั่งเซิร์ฟเวอร์/ข้อสอบเท่านั้น (action ห้ามส่ง) · ผลเงินไม่เกิดที่นี่ (D.10)
- `loadPortalReceipt`: บิลข้อ 4 ที่มีการรับชำระ (ไม่มี ⇒ `null`) · `payments` จาก `listDocPayments` ที่ไม่ถูกยกเลิก (บิลไม่มีใบ ⇒ แถวเดียวจาก `paidSatang/paidAt`) · `titleTh` = "ใบเสร็จรับเงิน" เมื่อค้าง 0 · "หลักฐานการรับชำระ (บางส่วน)" เมื่อยังค้าง · เลข RC = หนี้ D.10
- `loadPortalLease`: `contract` จาก `policySnapshot.contract` (ไม่มี ⇒ `null`) · `files` = ไฟล์ของสัญญานี้เฉพาะชนิด `ROOM_PHOTO` `DOCUMENT` (**ไม่มี `ID_CARD` · ไม่มีลายเซ็น**) · `portalFileRef` = เฉพาะ fileId ในรายการนั้น ⇒ อื่น `null` · route «f/[fileId]» อ่านไฟล์ส่วนตัวแล้วส่งพร้อม `Cache-Control: private, no-store` (X10)
- `portalUrl(ctx, { leaseId, billId? })`: สัญญาไม่ live / ไม่มี `SESSION_SECRET` ⇒ `""` · ไม่ throw

### 3.2 รหัสผูกห้อง (QR ในห้อง/ในสัญญา) — «dorm-line.ts»
```ts
export async function issueDormLinkCode(ctx: { tenantId: string; actorUserId: string }, i: { unitId: string; leaseId: string }, opts?: { now?: Date })
  : Promise<{ ok: true; code: string; deepLink: string | null; expiresAt: Date; qrSvgDataUrl: string } | { ok: false; code: "NOT_FOUND" | "NOT_CONFIGURED" | "BAD_STATE"; reason: string }>;
export async function resolveDormParty(ctx: { tenantId: string }, a: { purpose: string; refId: string }): Promise<string | null>;
export async function onDormLinked(ctx: PostbackCtx, a: LinkedInfo, opts?: { now?: Date }): Promise<PostbackReply>;
```
- `issueDormLinkCode`: สิทธิ์ `dorm.lease.manage` ของหน่วย (Membership สด · ไม่ผ่าน/หน่วยร้านอื่น/สัญญาไม่พบ ⇒ `NOT_FOUND`) · สัญญาไม่ live ⇒ `BAD_STATE` · หน่วยไม่มี `messaging.lineConnectionId` ⇒ `NOT_CONFIGURED` · ⇒ `issueLinkCode({tenantId}, { purpose: "DORM_LEASE", refId: leaseId, ttlMin: rooms.notify.linkCodeDays × 1440, connectionId })` · `qrSvgDataUrl` = QR ของ `deepLink` (ไม่มี basicId ⇒ QR ของรหัส) · รหัสคืนครั้งเดียว ห้าม log/audit
- `resolveDormParty`: `DORM_LEASE` + สัญญา live ของร้านนี้ ⇒ `lease.partyId` (Party ที่พนักงานสร้างตอนทำสัญญา = ยืนยันแล้ว · **ห้ามผูกจากเบอร์/ชื่อที่ผู้ใช้พิมพ์** — บทเรียน B.9) · อื่นทั้งหมด ⇒ `null`
- **ผูกพร้อมกัน**: รหัสเดียวยิง N ทาง/หลายโพรเซส ⇒ ผูกผู้ติดต่อ **1 คนพอดี** (`ChatLinkCode.usedAt` อะตอมิกของ R0.7) — ผู้แพ้ได้ `LINK_FAILED_TEXT`
- `onDormLinked`: `resolvedPartyId = null` (สัญญาจบ/ไม่ใช่ของร้าน) ⇒ `{ text: LINK_FAILED_TEXT }` **ตรงตัว** (แยกไม่ออกจากรหัสผิด) · `partyMismatch` ⇒ `{ text: LINK_OK_TEXT }` ตรงตัว (ไม่เปิดข้อมูล) · สำเร็จ ⇒ ข้อความมี "ห้อง <เลข>" + ลิงก์พอร์ทัล · ไม่มีเบอร์/ยอดของใคร

### 3.3 postback `dorm.*` — «dorm-line.ts»
```ts
export const DORM_POSTBACK_NOT_FOUND: string;    // ข้อความกลาง เช่น "ไม่พบข้อมูลห้องของคุณ — ติดต่อหอทางแชทนี้ได้เลย"
export const DORM_MENU: readonly { action: "bills" | "repair" | "announce" | "lease" | "parcel" | "contact"; labelTh: string }[];
export async function onDormPostback(ctx: PostbackCtx, evt: PostbackEvent, opts?: { now?: Date }): Promise<PostbackReply>;
```
- **สัญญาของผู้กด** = สัญญา live ของ `ctx.tenantId` ที่ `partyId = ctx.partyId` (ctx มาจากแถว ChatContact ของ webhook — ไม่อ่านจาก data) **และ** `messaging.lineConnectionId` ของหน่วยของสัญญา = `ctx.connectionId` · ไม่มีเลย (ไม่มี Party · Party อื่น · OA อื่นของร้านเดียวกัน · สัญญาจบ) ⇒ `{ text: DORM_POSTBACK_NOT_FOUND }` **เหมือนกันทุกไบต์** และไม่เขียนอะไร · action ไม่รู้จัก ⇒ ข้อความกลางเดียวกัน
- `bills` (บิลของฉัน) ⇒ ลิงก์พอร์ทัล (`portalUrl` · อายุตามค่าตั้ง) ของ **ทุกสัญญาของผู้กด** (≤ 5 · แต่ละลิงก์มี "ห้อง <เลข>") — มีบิลเปิดสัญญาเดียว ⇒ ตอบเป็น Flex บิล (§3.4) ได้ · ไม่มีข้อมูลของสัญญาที่ไม่ใช่ของผู้กด
- `lease` ⇒ ลิงก์ `/d/<token>/lease` · `contact` ⇒ ข้อความติดต่อหอ (ชื่อหน่วย · ไม่มีเบอร์ส่วนตัวพนักงาน) · `repair` `announce` `parcel` ⇒ ข้อความคงที่ "ส่งเรื่องทางแชทนี้ได้เลย พนักงานจะตอบกลับ" (จนถึง D.16/D.17/D.18 — ไม่ใช่ข้อความกลาง)
- ไม่มีปุ่ม/ข้อความ ตัดน้ำไฟ · ล็อกห้อง · ยึดของ · เข้าห้อง (สคบ. · S-17/K-7)
- ทะเบียน: `POSTBACK_ROUTES.push({ prefix: "dorm.", resolveParty, onPostback, onLinked })` lazy import «dorm-line.ts» แบบบรรทัด B.9

### 3.4 rich menu + Flex บิล — «dorm-line.ts»
```ts
export function dormRichMenuSpec(): RichMenuSpec;     // 2500×1686 · 6 ช่อง 3×2 ตามภาพ 05ก · postback "dorm.<action>" + displayText = labelTh · chatBarText "เมนูหอ" · รูปจาก DORM_RICHMENU_PNG_BASE64
export async function syncDormRichMenu(ctx: { tenantId: string; actorUserId: string }, i: { unitId: string })
  : Promise<{ ok: true; richMenuId: string; created: boolean } | { ok: false; code: "NOT_FOUND" | "DISABLED" | "NOT_CONFIGURED" | "SHARED_OA" | "SEND_FAILED"; reason: string }>;
export function dormBillFlex(v: { unitName: string; roomNumber: string; periodLabel: string; dueLabel: string;
  lines: { labelTh: string; detail: string | null; amountSatang: number }[]; amountSatang: number; payUrl: string; detailUrl: string }): Record<string, unknown>;
```
- `syncDormRichMenu`: สิทธิ์ `dorm.settings.edit` (ไม่ผ่าน ⇒ `NOT_FOUND`) · `rooms.notify.richMenu = false` ⇒ `DISABLED` · ไม่มี OA ⇒ `NOT_CONFIGURED` · **OA นี้ถูกหน่วยอื่นของร้านใช้อยู่ด้วย** (ค่า `messaging.lineConnectionId` ของหน่วยอื่น = ตัวเดียวกัน) ⇒ `SHARED_OA` ไม่ยิง LINE (ไม่ทับเมนูของหน่วยอื่น — Q3) · ⇒ `syncRichMenu({tenantId}, connectionId, dormRichMenuSpec())` บน OA ของหน่วยเท่านั้น · ไม่มีงานตามเวลาซิงก์เมนู (กดเองจากจอ §3.2)
- `dormBillFlex` = bubble ตามภาพ 05ก: หัว "บิลค่าเช่า · ห้อง <เลข>" · "รอบ <งวด>" · บรรทัด (ป้าย + `detail` เช่น "125 หน่วย") · "ยอดชำระ ฿x,xxx.xx" (= `amountSatang` ที่ผู้เรียกให้ = **ค้างสด**) · "ครบกำหนด <วัน>" · ปุ่ม `uri` 2 ปุ่ม: "จ่ายด้วยพร้อมเพย์" → `payUrl` · "ดูรายละเอียด" → `detailUrl` (https เท่านั้น — ไม่ใช่ https ⇒ ไม่ใส่ปุ่ม) · **ไม่มีปุ่ม postback อื่น · ไม่มีคำต้องห้าม**

### 3.5 ส่งบิลจริงจาก D.8 (hook) + ส่งซ้ำ — «dorm-line.ts»
```ts
export type DormBillSendStatus = "SENT" | "SKIPPED_CONSENT" | "SKIPPED_QUIET" | "NO_CHANNEL" | "FAILED" | "SENDING"   // จาก notifyCustomer
  | "NOT_FOUND" | "DISABLED" | "PAID" | "LEASE_ENDED" | "BILL_VOID";                                              // ตัดสินก่อนถึง notifyCustomer (ไม่เขียน log)
export async function sendDormBill(ctx: { tenantId: string }, i: { billId: string }, opts?: { now?: Date })
  : Promise<{ status: DormBillSendStatus; dedupeKey: string | null; duplicate: boolean; amountSatang: number | null }>;
export async function onDormBillSent(evt: { id: string; tenantId: string; type: string; payload: unknown; unitId: string | null }): Promise<void>;   // ไม่ throw
export async function runDormLineJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<{ resent: number }>;
```
**`sendDormBill` อ่านสดทุกครั้ง (บทเรียน D.8 F1/D.11 L1 — ห้ามเชื่อ payload ของ event)** — คืนข้อแรกที่เข้า (`dedupeKey: null` ก่อนถึง notifyCustomer):
1. บิลไม่พบในร้าน ⇒ `NOT_FOUND` · สถานะ `VOID`/ไม่มีใบ ⇒ `BILL_VOID` (DRAFT/HELD ⇒ `NOT_FOUND`)
2. สัญญาไม่ live ⇒ `LEASE_ENDED`
3. `rooms.billing.sendChannels` (refs หน่วย+สัญญา) ไม่มีทั้ง `LINE` และ `SMS` ⇒ `DISABLED`
4. ค้างสด = 0 ⇒ `PAID` (จ่ายก่อนข้อความออก = ไม่ทวงคนที่จ่ายแล้ว)
5. `notifyCustomer({tenantId}, { unitId, domain: "rooms", messageKey: "bill", partyId: lease.partyId, vars: { tenantName, roomNo, unitName, period, amount: "฿<ค้างสด>", dueDate, payLink: portalUrl(…, {billId}) }, flex: dormBillFlex({…, amountSatang: <ค้างสด>, lines: บรรทัดบิล + บรรทัดปรับยอด (ใบลดหนี้ติดลบ)}), dedupeKey: "rooms:bill:<billId>", at: now })` — **ยอดในข้อความ = ค้างสด** (ค่าปรับที่ยกเว้นด้วยใบลดหนี้แล้วไม่ถูกเรียกเก็บ) · OA = ของหน่วยตามค่าตั้ง (notifyCustomer — ไม่เดา OA อื่น · ผู้ติดต่อ OA อื่นของร้านเดียวกันไม่ได้รับ) · เคารพเวลาเงียบ (ไม่ bypass)
- `onDormBillSent`: `type === "dorm.billrun.sent"` · ctx = `evt.tenantId` · `billId` จาก payload ⇒ `sendDormBill` · ส่งซ้ำ/พร้อมกัน/หลายโพรเซส = ข้อความเดียว (X4 · dedupe ของ notifyCustomer)
- `runDormLineJobs` (minute-job `dorm.line` ทุก 5 นาที): แถว `ServiceMessageLog` domain `rooms` · messageKey `bill` · สถานะ `SKIPPED_QUIET` หรือ `FAILED` · `at ≥ now − 3 วัน` (จำกัดร้านด้วย `opts.tenantId`) ⇒ `sendDormBill(billId จาก dedupeKey, { now })` (อ่านสดอีกรอบ) · งานซ้อน = ส่งครั้งเดียว (X5) · คืนจำนวนที่ได้ `SENT` · เคารพ `budgetMs`/`signal`
- **hook ของ D.11**: `dunning.ts` ตั้ง `payLink` = `portalUrl({tenantId}, { leaseId, billId })` (ที่เดียว — ทั้งงานตามเวลาและ `sendDunningNow`) — ไม่เปลี่ยนผู้รับ/dedupe/เวลาเงียบของ D.11

### 3.6 รูปสลิปในแชท ⇒ แนบบิลเปิดอัตโนมัติ — «dorm-line.ts» + แชท + webhook
```ts
// โมดูลแชท (ใหม่ · ⚠️ Q1): «src/lib/modules/chat/line-content.ts» + export ใน index.ts
export async function fetchLineMessageContent(ctx: { tenantId: string }, i: { connectionId: string; messageId: string })
  : Promise<{ ok: true; contentType: string; data: Uint8Array } | { ok: false; code: "NOT_FOUND" | "TOO_LARGE" | "FAILED" }>;
//   GET <data base>/v2/bot/message/<messageId>/content (Bearer ของ OA นั้น · data base = api-data.line.me / ตัวจำลองเมื่อ LINE_API_BASE) · messageId ตัวเลข ≤ 32 · อ่าน ≤ 5 MB
// «dorm-line.ts»
export async function onLineImage(ctx: PostbackCtx, i: { messageId: string }, opts?: { now?: Date; deps?: { put?: …; del?: … } })
  : Promise<{ handled: boolean; attached: { slipId: string; billId: string; status: string } | null; reply?: PostbackReply }>;
```
ลำดับ:
1. สัญญาของผู้ส่ง (นิยามเดียวกับ §3.3 — Party ของผู้ติดต่อ · OA ของหน่วย = `ctx.connectionId` · live) · ไม่มี ⇒ `{ handled: false, attached: null }` (รูปแชทธรรมดา · ไม่ตอบ)
2. เหลือเฉพาะหน่วยที่ `rooms.payment.slipAutoAttach = true` · ไม่เหลือ ⇒ handled false
3. บิลเปิดของสัญญาเหล่านั้น: **0** ⇒ handled false (ไม่ตอบ) · **มากกว่า 1** (สองสัญญา หรือสัญญาเดียวค้างหลายงวด) ⇒ **กำกวม = ไม่แนบ** `{ handled: true, attached: null, reply }` ตอบลิงก์พอร์ทัลให้แนบในบิลที่ถูก (Q2) · **1 พอดี** ⇒ ข้อ 4
4. `fetchLineMessageContent` (ล้ม ⇒ ไม่แนบ · ไม่ตอบ) → อ่านค้างสดอีกครั้ง (0 ⇒ ไม่แนบ) → `submitSlip({tenantId}, { unitId, domain: "DORM", refType: "DORM_BILL", refId: billId, partyId, file, expectedSatang: <ค้างสด>, idempotencyKey: "dorm-chat:" + messageId, expectedPayerNames }, deps)` ⇒ `{ handled: true, attached: { slipId, billId, status }, reply: { text: "ได้รับสลิปห้อง <เลข> งวด <งวด> แล้ว …" } }`
- **ไม่ผูกตัวตน/Party จากรูป ชื่อผู้โอน หรือเบอร์ใด ๆ** · LINE ส่งซ้ำ/หลายโพรเซสด้วย messageId เดิม = สลิปเดียว (คีย์ + แฮชรูป)
- webhook: หลัง `receiveInbound` ของ inbound LINE ชนิด `IMAGE` ⇒ หา ChatContact ของ (connection, externalUserId) ⇒ `(await import("@/lib/platform/dorm-line")).onLineImage({ tenantId: connection.tenantId, connectionId, chatContactId, partyId: contact.partyId, replyToken }, { messageId: inbound.externalMessageId })` · มี `reply` ⇒ ตอบด้วย replyToken (ตัวช่วยตอบเดิมของไฟล์) · พัง ⇒ log สั้นไม่มีเนื้อ (ไม่ทำให้ webhook ตอบ non-200)

## 4. สัญญา DOM — «src/components/dorm/portal/DormPortal.tsx» (`'use client'` บรรทัดแรก · default export · props `{ view: PortalView; token: string; action: (prev: unknown, fd: FormData) => Promise<unknown> }` · `import type` เท่านั้นจาก lib · ห้าม import `@/lib/modules/**` `@/lib/platform/**` `@/lib/core/db` `@prisma/client` `next/*` · ลิงก์ใช้ `<a>` · `renderToStaticMarkup` ได้)
- ราก `data-dorm-portal` + `data-state="<bill.state | NONE>"` · หัว "บิลห้อง <roomNumber>" + ชื่อหน่วย
- บิล `data-portal-bill="<periodKey>"` · บรรทัด `data-portal-line="<code>"` (ป้าย + เงินรูป `4,800.00`) · ปรับยอด `data-portal-adjust` · `data-portal-total` (รูป `฿5,486.00`) · `data-portal-outstanding` (`฿…`) · `data-portal-due` ("ครบกำหนด 5 พ.ย. 2569")
- กล่องจ่าย (เมื่อ `view.pay`) `data-portal-pay`: "สแกนจ่ายด้วยแอปธนาคารใดก็ได้" · `img[data-portal-qr]` `src` = `pay.qrSvgDataUrl` · ยอด `data-portal-pay-amount` = ค้างสด (`฿…`) · "ยอดล็อกตรงบิล" · `a[data-portal-save-qr]` (download) · `button[data-portal-copy-promptpay]` "คัดลอกเลขพร้อมเพย์"
- ฟอร์มสลิป (เมื่อ `can.uploadSlip`) `form[data-portal-slip-form]`: `input[type=file][name=slip]` `accept="image/jpeg,image/png,image/webp"` · `input[type=hidden][name=billId]` = บิลที่แสดง · `input[type=hidden][name=idempotencyKey]` (สร้างครั้งเดียวต่อการเปิดฟอร์ม) · ปุ่ม "แนบสลิปการโอน" (≥ 44px)
- สถานะ `data-portal-status="<state>"`: PAID ⇒ "ชำระแล้ว ขอบคุณค่ะ" + `a[data-portal-receipt]` (`href` = `links.receipt`) · PENDING_REVIEW ⇒ "ได้รับสลิปแล้ว รอตรวจ"
- ประวัติ `data-portal-history` · แถว `data-portal-history-row="<periodKey>"` ลิงก์ `?bill=<billId>` · ลิงก์สัญญา `a[data-portal-lease]` (`links.lease`)
- **HTML ไม่มี**: เบอร์ · ชื่อผู้เช่า · id สัญญา · คำต้องห้าม สคบ. · มือถือ 390 ไม่ล้น (V-1)

## 5. หน้า (สาธารณะ · ไม่มี session)
- `/d/[token]` page.tsx (server): `loadPortal(token, { bill: searchParams.bill ?? null }, { clientKey })` → `null` ⇒ `notFound()` · `<DormPortal view token action={submitPortalSlipAction.bind(null, token)} />` · `export const dynamic = "force-dynamic"` · `metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" }` (token อยู่ใน URL)
- `/d/[token]/receipt?bill=` (พิมพ์ A5 · "ใบเสร็จรับเงิน"/"หลักฐานการรับชำระ") · `/d/[token]/lease` (สัญญา + เอกสาร) · `/d/[token]/f/[fileId]` route — ด่านเดียวกันทั้งหมด (`null` ⇒ 404 เดียวกัน)
- actions.ts: `"use server"` · export async function เท่านั้น: `submitPortalSlipAction(token, prev, formData)` — `clientKey` = IP แบบ helper ของ B.9 (`x-real-ip` → `x-vercel-forwarded-for` → `x-forwarded-for` ตัวแรก → "unknown") · อ่าน `slip` (File) `billId` `idempotencyKey` · เรียก `submitPortalSlip` **ไม่ส่ง deps** · ไม่รับ tenantId/ยอดจากฟอร์ม
- clientKey เดียวกับ action ในหน้า page (ฟังก์ชันเดียวกัน)

## 6. จุดที่แบบไม่ชัด — ผู้เขียนข้อสอบเลือกแล้ว (ผู้คุมเคาะได้ · เปลี่ยน = ORACLE-EDIT)
1. **ลิงก์ผูกกับสัญญา** (subject = leaseId) ไม่ใช่ห้อง/บิล · หมดสิทธิ์ทันทีเมื่อสัญญาไม่ live (ลิงก์เก่าก่อนย้ายออกใช้ไม่ได้ทั้งหมด) · ไม่มีเพิกถอนรายลิงก์ (ต้อง migration — หนี้)
2. **สัญญาเลยวันจบแต่ยังไม่ปิด = ไม่ live** (เข้มไว้ก่อน · Q4)
3. **ผู้รับข้อความบิล = Party ของสัญญาบน OA ของหน่วย** (ทางเดียวกับ D.11) · ผูกได้จากรหัสผูกห้องที่พนักงานออกเท่านั้นในใบนี้
4. **postback เจ้าของ = Party ของผู้ติดต่อ + OA ตรงหน่วย** · ข้อความกลางเดียวทุกกรณีไม่ใช่เจ้าของ
5. **กำกวม = ไม่แนบ** รวมกรณีสัญญาเดียวค้างหลายงวด (เข้มกว่าแถวแผน "แนบบิลเปิดล่าสุด" · Q2) · 0 บิลเปิด = เงียบ
6. **ยอดทุกที่ = ค้างสด** (QR · Flex · ยอดคาดหวังของสลิป · ข้อความ)
7. **เมนูล่าง 6 ช่องตามภาพ** · แจ้งซ่อม/ประกาศ/พัสดุ ตอบข้อความคงที่จนถึง D.16–D.18 · OA ใช้ร่วมหลายหน่วย ⇒ ไม่ตั้งเมนู (Q3)
8. **ใบเสร็จ** = หน้าพิมพ์หลักฐานรับชำระจากบัญชี (เลข RC/ใบเสร็จอัตโนมัติ = D.10)
9. **ไม่มี event ใหม่** · ข้อความล้มไม่ทำให้ event ล้ม · ส่งซ้ำผ่าน `runDormLineJobs`
10. **ไม่มีชื่อผู้เช่าในพอร์ทัล** (ลิงก์ส่งต่อได้) · เอกสารสัญญาไม่รวมบัตรประชาชน/ลายเซ็น

## 7. ฉากภาพ «scripts/svc-qc-portal-scene.mts» (builder · ค่าจาก `SQC_DORM_PORTAL_SCENE` เท่านั้น)
- ต้องมีฉาก D.13 ก่อน (roomboard → lease → dorm-home) · ร้าน svcqc หน่วยหอ · ไม่สร้างบิล/สัญญา/สลิปเอง (ใช้บิลของฉาก D.13: 204 PAID · 106 ค้าง)
- ตั้ง `payments.receiver` (UNIT) = `SQC_DORM_PORTAL_SCENE.receiver` เมื่อหน่วยยังไม่มีค่า (setById = mark) · มีค่าของคนอื่นแล้ว ⇒ ไม่ทับ
- เขียน `SQC_DORM_PORTAL_SCENE.sceneFile` = JSON `{ tenantId, unitId, leases: { "204": leaseId, "106": leaseId }, bills: { "204": billId(งวดล่าสุด), "106": billId(งวดล่าสุด) }, endedLeaseId: string|null }` (สัญญา ENDED ใดก็ได้ของหน่วย · ไม่มี = null)
- idempotent: `SCENE_SUMMARY {"created":n,"updated":n,"removed":n}` (รันซ้ำ = 0/0/0) · ซ่อมตัวเอง: ไฟล์/ค่าหาย ⇒ รันใหม่สร้างคืน · `--clear` ลบเฉพาะค่าตั้งที่ mark + ไฟล์ฉาก · ไม่แตะแถวของฉากอื่น · ฉาก D.13 ไม่พร้อม ⇒ exit 3 + เหตุผล

## 8. ข้อสอบ (กลุ่ม) — «scripts/qc-svc-d.9.mts»
S โครงสร้าง/ไฟล์/ค่าตั้ง/สัญญาโค้ด · PC ตัวควบคุม (เขียวก่อนมีงาน) · L รหัสผูก (ผูก 1 เมื่อพร้อมกัน · สัญญาจบผูกไม่ได้) · K postback (เจ้าของ · ข้อความกลาง · OA อื่น · ร้านอื่น) · R rich menu · B ส่งบิล (สด · dedupe · OA เดียว · เวลาเงียบ+ส่งซ้ำ · hook D.11) · P พอร์ทัล (404 เดียวกัน X1/X7 · ลิงก์เก่าหลังย้ายออก · เวลา · rate · QR ยอดตรง · ใบเสร็จ · สัญญา/ไฟล์ · สลิป) · A แนบสลิปจากแชท (กำกวม · ของตัวเอง · ส่งซ้ำหลายโพรเซส · แข่งกับการรับเงิน) · U DOM · M ข้อความ/สคบ./PII · Q ฉาก · V ภาพ + HTTP 404 · Z ล้าง · G regression
- regression (G · รันหลังล้างข้อมูล): `qc-svc-d.8 --no-regression` · `qc-svc-d.11 --no-regression` · `qc-svc-d.3 --no-regression` · `qc-svc-d.13 --no-regression` · `qc-svc-r0.7` · `qc-svc-r0.5` · `qc-svc-b.9 --no-regression` (S-1/S-2 ของ b.9 = ข้อ "ไฟล์ของใบ B.9" ไม่นับ) · `qc-svc-smoke` — ไม่มี FAIL
- typecheck + fitness 2 โหมด (ผู้คุม) · ภาพ V-1 (ผู้คุม: QC server + ฉาก D.13 + ฉาก D.9 + `visual-svc d.9`) · ตรวจเข้ม 2 รอบ

### 8.1 สถานการณ์แข่งหลายโพรเซสที่ผู้ตรวจ B ต้องยิง (probe แยก · ข้อสอบมีชุดย่อ L-3 A-2 A-9 B-2)
1. **ผูกรหัสซ้ำพร้อมกัน**: รหัสเดียว 8 ผู้ติดต่อ × 4 โพรเซส + webhook จริง (ลายเซ็นถูก) ⇒ ผูก 1 · ผู้แพ้ได้ `LINK_FAILED_TEXT` · ไม่มีผู้ติดต่อคนที่สองได้ Party · รหัสสองชุดของสัญญาเดียวกันใช้พร้อมกัน ⇒ ผูกได้ 2 คน (ยอม · บันทึกเป็นพฤติกรรม)
2. **ผูกขณะสัญญาถูกปิด**: ปิดสัญญา (ENDED) ระหว่างผู้ติดต่อพิมพ์รหัส ⇒ ไม่มีทางที่ผู้ติดต่อได้ Party แล้วเปิดพอร์ทัล/บิลได้
3. **แนบสลิปจากแชท vs รับเงินสด**: รูปเดียว 4 โพรเซส (LINE ส่งซ้ำ) + พนักงานรับเงินครบพร้อมกัน ⇒ สลิป ≤ 1 · ถ้ามีต้องชี้บิลของผู้ส่งเท่านั้น และยอดคาดหวัง = ค้างที่อ่านได้ตอนแนบ · ถ้าจ่ายครบก่อนอ่านค้าง ⇒ ไม่มีสลิป · ไม่มี throw/P2002 หลุด
4. **แนบสลิปพอร์ทัล vs ใบลดหนี้/รับเงินบางส่วน**: ยอดคาดหวังของสลิป = ค้างสด ณ ตอนยื่น (ไม่ใช่ยอดบิลเดิม)
5. **consumer ส่งบิลซ้อน + งานส่งซ้ำ + จ่ายครบระหว่างทาง**: ข้อความ ≤ 1 · ถ้าจ่ายครบก่อน claim ⇒ ไม่ส่ง · ยอดในข้อความ = ค้างสด ณ ตอนส่ง
6. **ไล่เดา/ส่งต่อลิงก์**: token ห้องอื่น/ร้านอื่น/purpose อื่น/ตัดท้าย/หมดอายุ/สัญญาจบ ⇒ HTTP 404 เนื้อเดียวกัน · เวลาตอบใกล้กัน · rate limit ต่อ IP ทำงานก่อนแตะสัญญา

## 9. ไม่ใช่เรื่องของใบนี้ / หนี้ส่งต่อ
- **D.10**: consumer `payment.slip.approved` (DORM_BILL ⇒ `recordExternalPayment` · จ่ายเกิน ⇒ 2110) · เลขใบเสร็จ RC + ข้อความ `rooms.msg.receipt` · คิวตรวจสลิปหอ
- **D.12**: ปิดสัญญา (ENDED) ⇒ ใบนี้ตัดสิทธิ์อัตโนมัติ · ผู้เช่าเก่าที่ยังค้างบิลสุดท้าย = พนักงานส่งทางอื่น (J3)
- **D.16/D.17/D.18**: เมนู แจ้งซ่อม/ประกาศ/พัสดุ (ใบนี้ตอบข้อความคงที่)
- **C.2**: ทดสอบลิงก์เปิดแชทพร้อมรหัส/เมนูกับ LINE จริง · **S.1**: SMS (ผ่าน notifyCustomer ทันที)
- หนี้: เพิกถอนลิงก์รายใบ/รายผู้ติดต่อ (ต้องคอลัมน์ใหม่) · เมนูรายคนเมื่อ OA ใช้ร่วม · ใบเสร็จของบิลไม่มีใบ (svcqc) ไม่มีเลขเอกสาร

## 10. คำถามผู้คุม (ค่าปลอดภัยใช้ไปก่อน)
- **Q1 แตะชิ้นกลาง R0.7**: `chat/line-content.ts` (ดึงรูปจาก LINE) + export + บล็อกรูปใน webhook route — ไม่มีทางอื่นเพราะ webhook ไม่มีจุดเสียบรูป · ค่าปลอดภัย: อนุญาตแบบเพิ่มอย่างเดียว (S-2/S-14 ตรวจว่าไม่ลบบรรทัด)
- **Q2 กำกวม**: เข้มกว่าแผน (สัญญาเดียวค้าง 2 งวด = ไม่แนบ) · ทางเลือก: แนบงวดล่าสุดเมื่อสัญญาเดียว (เสี่ยงเงินเข้าใบผิดงวดเมื่อยอดเท่ากัน)
- **Q3 OA ใช้ร่วม**: ไม่ตั้งเมนูค่าเริ่ม (กันทับเมนูหน่วยอื่น) · ทางเลือก: ผูกเมนูรายคนให้ผู้เช่าที่ผูกแล้ว (ต้องแก้ `syncRichMenu` ให้ไม่ตั้งค่าเริ่ม = ชิ้นกลาง)
- **Q4 สัญญาเลยวันจบยังไม่ปิด** = ไม่ live (เข้ม) — ถ้าหอปล่อยต่อแบบรายเดือนโดยไม่ต่อสัญญาในระบบ ผู้เช่าเสียสิทธิ์พอร์ทัล
- **Q5 เส้นทาง `/d/[token]`** อยู่ร่วมกับจอลูกค้า POS `/d` (คุกกี้ `pos_display` Path=/d ถูกส่งมาด้วยแต่ไม่ถูกอ่าน) — ถ้าไม่ต้องการปนให้ย้าย prefix (เช่น `/dm/`) ตอนนี้ (ORACLE-EDIT path เดียว)
- **Q6 ระดับตรวจ**: เข้ม 2 รอบตามแผน (ยืนยัน)

## 11. X ที่เกี่ยว
X1 (P-2 K-3 A-6 B-3) · X3 (L-3 A-2 A-9 B-2) · X4 (B-2) · X5 (B-8 งานส่งซ้ำซ้อน) · X6 (P-10 ไฟล์ชนิด/ขนาด) · X7 (P-2 P-4 P-5 V-2 K-3) · X8 (M-2 log/payload/ผลคืนไม่มี PII) · X10 (P-9 ไฟล์ส่วนตัวผ่าน route ตรวจสิทธิ์) · ไม่เกี่ยว: X9 (ไม่มีการกระทำอันตรายของพนักงาน — ออกรหัส/ตั้งเมนูใช้สิทธิ์เดิม)

## 12. คำถามกฎหมาย/PDPA (เพิ่มใน `ledger/wo-notes/svc-legal-questions.md` ตอนรับใบ)
- J3: ผู้เช่าที่ย้ายออกแล้วยังค้างบิลสุดท้าย — ต้องให้ดู/จ่ายผ่านช่องทางเดิมต่อไหม (ใบนี้: ตัดทันที)
- J3: QR รหัสผูกติดในห้อง — คนอื่นที่เข้าห้อง (แขก/ช่าง) สแกนก่อนผู้เช่าได้ ⇒ ใช้ครั้งเดียว + อายุ 30 วัน พอไหม หรือควรให้เฉพาะแนบในสัญญา
- J5: ลิงก์พอร์ทัล (bearer) ส่งต่อได้ ⇒ เห็นบิล/สัญญาของห้อง (ไม่มีชื่อ/เบอร์/บัตร) — พอเป็นมาตรการไหม · อายุ 35 วันเหมาะไหม
- J5: รูปสลิปที่ส่งในแชทถูกเก็บเป็นไฟล์ส่วนตัวของบิล — ระยะเก็บ/ต้องแจ้งไหม
- J5: ข้อความบิล/เตือน = ข้อความบริการ (ไม่มีโปรโมชัน) — ยืนยันตาม CC §4.4

## มติผู้คุม (30 ต.ค.)
- **Q1 อนุมัติ** แตะชิ้นกลาง R0.7 แบบเพิ่มอย่างเดียว: `src/lib/modules/chat/line-content.ts` (`fetchLineMessageContent`) + export ใน index + บล็อกรับรูปใน webhook route · ห้ามลบ/แก้บรรทัดเดิม (S-2/S-14 ตรวจ)
- **Q2 คงเข้ม**: กำกวม (ค้าง ≥2 งวด · หลายสัญญา · ไม่รู้จักผู้ส่ง) ⇒ ไม่แนบอัตโนมัติ · ส่งเข้าคิวตรวจของหอ + ตอบข้อความกลาง — เงินผิดใบแพงกว่าการให้พนักงานกดเอง
- **Q3 รับ** OA ใช้ร่วมหลายหน่วย ⇒ `SHARED_OA` ไม่ตั้ง rich menu (แจ้งในหน้าตั้งค่า) · เมนูรายคน = หนี้
- **Q4 รับ** เลย `endDate` แต่ยังไม่ปิด = ไม่ live · ต่อสัญญา/ขยายวันจบเป็นงานพนักงาน · หนี้: D.13 "ต้องทำวันนี้" ควรแสดงสัญญาที่เลยวันจบแต่ยังมีคนอยู่ (บันทึกส่ง D.12)
- **Q5 คง** `/d/[token]` · builder ต้องยืนยันว่าไม่ชน route จอลูกค้า POS ใต้ `/d` (static segment ชนะ dynamic) และไม่อ่านคุกกี้ `pos_display`
- **Q6** ระดับตรวจ = เข้ม · ผู้ตรวจ 2 คน (A อ่านโค้ด · B probe หลายโพรเซสตาม §8.1)
- ORACLE-EDIT b.9 S-2 (ข้ามหลัง merge แบบ S-1) — ผู้คุมแก้แล้วใน commit นี้
