# S1-9 — S1.11 ข้อเสนอจากเลขา + กล่องรวม (`secretary/suggest.ts` `secretary/inbox.ts`) · S1.16 ข้อมูลกิจการสด (`secretary/digest.ts`) (Opus · `wip/sec-s1.11` · หลัง S1.7 รอบ 2 merge · light-check)

Read `sec-brief-COMMON.md`, `sec-brief-RESOLUTIONS.md` (R-K1 R-K4 R-K6 · §K R-S1.7a · §B.6), plan rows S1.11/S1.16, แบบ A2/A6/B6 + §8 ชั้น 3 (`ledger/DESIGN-SECRETARY.md`), `docs/modules/31-secretary.md` §5, และ oracle `scripts/qc-sec-s1.11.mts`. Verified code: `src/lib/ai/proactive.ts` `gatherProactiveInsights` :31 (keys `lowStock` `pendingApprovalsAged` `pendingLeavesAged` `shopOrdersPending` · ตรวจระบบเปิดด้วย `systemIds`) · `src/lib/ai/analyst.ts` `gatherBusinessSnapshot` :39 (`salesTodaySatang salesTodayCount sales7dSatang sales7dCount salesByDay newCustomers7d lowStockCount pendingLeaves activeSystems` · POS `docType:"SALE" status in [PAID,REFUNDED]`) · `listPendingProposals/listPendingPlans` (ต่อห้อง) · `approvalGate` (S1.7) · `AiRoom(tenantId, startedById, title, closedAt)` · `AccountDocument(status, dueDate, paidTotal)` account.prisma:128 · `Appointment(startAt, status, unitId)` booking.prisma:97 · `Membership(userId, tenantId, role, acceptedAt)`.

## S1.16 — `src/lib/ai/secretary/digest.ts` (คำนวณสด · ไม่มีตาราง/cron · cache หน่วยความจำ 10 นาทีต่อ tenant · `__resetDigestCacheForTests()`)
```ts
export type Digest = {
  at: Date; activeSystems: string[];
  sales: { todaySatang: number; todayCount: number; d7Satang: number; d7Count: number; d30Satang: number; d30Count: number } | null;   // POS ไม่เปิด = null (ตัวเลขจาก gatherBusinessSnapshot + 30 วัน query เดียวกัน)
  quietCustomers: { count: number; sample: { id: string; name: string; days: number }[] } | null; // CRM/Member เปิด: ลูกค้าที่ไม่มีกิจกรรม/ซื้อ ≥ 30 วัน (นิยามให้ชัดใน docs: CRM contact ที่ `lastActivityAt` (crm.prisma:164) < now−30d หรือ null และ createdAt < now−30d · ไม่นับ archived) · sample ≤ 3 · **ชื่อเท่านั้น ไม่มีเบอร์/อีเมล**
  lowStock: { count: number; sample: string[] } | null;            // จาก proactive lowStock (ชื่อสินค้า ≤ 3)
  receivables: { count: number; totalSatang: number; overdueCount: number } | null; // AccountDocument ลูกหนี้ค้าง: status ∈ {AWAITING_PAYMENT, PARTIAL} (enum `AccountDocStatus` account.prisma:34) · ค้าง = grandTotal − paidTotal > 0 · overdue = dueDate < วันนี้
  tomorrow: { appointments: number; firstAt: Date | null } | null;  // booking เปิด: Appointment startAt ใน [พรุ่งนี้ 00:00, +1 วัน) BKK · status ∉ {CANCELLED, NO_SHOW}
  pending: { approvalsAged: number; leavesAged: number; shopOrders: number }; // จาก proactive keys
};
export async function computeDigest(tenantId: string, now?: Date): Promise<Digest>;   // ระบบไม่เปิด = null ของส่วนนั้น · ทุกส่วน try/catch แยก (ส่วนล้ม = null + logOps) · ห้ามโยน
export function digestBlock(d: Digest): string;      // ไทย ≤ 600 token (≈ ≤ 1,200 ตัวอักษร) · bullet "- ยอดขายวันนี้ 5,000 บาท (3 บิล) · 7 วัน …" · ส่วน null ไม่พิมพ์ · ไม่มี PII
export async function digestBlockFor(tenantId: string): Promise<string>;  // cache 10 นาที · "" เมื่อทุกส่วน null
```
- `service.ts`: `PersonaContext.digest?: string` → persona.ts บล็อก "ข้อมูลกิจการตอนนี้ (สด):" **หลัง** memories ก่อน lessons · เฉพาะห้องที่มี `AiRoom` (ห้องเดิมไม่ใส่ ⇒ prompt เดิมทุกไบต์ · `qc-sec-s1.2` snapshot) · อ่านผ่าน `digestBlockFor(tenantId).catch(() => "")`
- ตัวเลขทุกตัวต้องตรง SQL ตรง ๆ (oracle เทียบด้วย prisma aggregate ของมันเอง · วัน BKK ใช้ `dayKeyBangkok`)

## S1.11 — `src/lib/ai/secretary/suggest.ts`
```ts
export type Suggestion = { key: string; system: string; title: string; instruction: string; priority: 1|2|3 };
export async function suggestions(ctx: { tenantId: string; actor: AiMemberActor }, now?: Date): Promise<Suggestion[]>;
   // แหล่ง: computeDigest + gatherProactiveInsights → กติกาคงที่ (deterministic · ไม่เรียกโมเดล · ไม่เริ่มงานเอง — มติ 9):
   //   receivables.overdueCount>0 ⇒ {key:"collect_overdue", system:"account", title:"ตามหนี้ค้าง N ใบ", instruction:"ช่วยร่างข้อความตามหนี้ลูกค้าที่เลยกำหนด N ราย แล้วเสนอให้ผมดูก่อนส่ง"}
   //   quietCustomers.count>0 ⇒ "follow_quiet" (crm) · lowStock ⇒ "reorder" (inventory) · tomorrow.appointments>0 ⇒ "prep_tomorrow" (booking) · pending.* ⇒ "review_pending" (approval/hr/shop) · sales.todayCount===0 && เวลาไทย ≥ 15:00 ⇒ "boost_sales" (pos)
   //   กรองด้วย access ของผู้ใช้: ระบบที่ `membershipCan(m, {module, action:"<module>.*.read"})` ไม่ผ่าน หรือ AiSystemAccess level OFF ⇒ ตัด · เรียง priority แล้ว key · ≤ 5
export async function frequentInstructions(ctx: ConvCtx, take = 5): Promise<{ instruction: string; count: number; lastAt: Date }[]>;
   // AiRoom ของ tenant ที่ startedById = ผู้ใช้ · group โดย title normalize (trim · ตัวเล็ก · ยุบช่องว่าง · ≤ 60) · count ≥ 2 · เรียง count desc, lastAt desc
```
## S1.11 — `src/lib/ai/secretary/inbox.ts` (กล่องรวมทุกกิจการ — A6)
```ts
export type InboxItem = { tenantId: string; tenantName: string; type: "proposal" | "plan"; id: string; roomId: string | null; conversationId: string; summary: string; kind?: string; risk?: string; createdAt: Date; expiresAt: Date | null; canApprove: boolean; why?: string };
export async function inboxForUser(userId: string, opts?: { tenantId?: string; kind?: "proposal" | "plan"; take?: number }): Promise<InboxItem[]>;
   // Membership acceptedAt≠null ของผู้ใช้ (ทุกร้าน หรือ tenantId เดียว) → ต่อร้าน: proposal/plan PENDING ไม่หมดอายุ ที่ผู้ใช้ **มองเห็น** (`canConfirmerSeeConversation(tenantId, m, userId, conversationId)` + `withinSight(visibleSinceForUser…)` — R-K1/R-S1.6a) · canApprove = ห้องเลขา ? approvalGate ผ่าน (OWNER/MANAGER สมาชิก) : actorCanConfirmKind · why = whyApproval (ห้องเลขา) · เรียง createdAt desc · take ≤ 100 · ร้านที่ query ล้ม ⇒ ข้าม (logOps) ไม่ล้มทั้งกล่อง
export async function inboxCount(userId: string): Promise<{ total: number; canApprove: number }>;
```
- ห้ามอ่าน payload เข้า DTO (summary/kind/risk เท่านั้น) · ไม่มีเบอร์/อีเมลใน summary ที่ส่งออก (ผ่าน `maskPiiPatterns`)

## Files you own
`src/lib/ai/secretary/{digest,suggest,inbox}.ts` · `src/lib/ai/persona.ts` (บล็อก digest มีเงื่อนไข) · `src/lib/ai/service.ts` (1 hunk ส่ง digest) · docs §5 (ตารางฟังก์ชัน + นิยามตัวเลขแต่ละส่วน) · `ledger/wo-notes/sec-s1.11.md`
## Acceptance = `scripts/qc-sec-s1.11.mts` PASS + `qc-ai-proactive` `qc-ai-analyst` `qc-ai-growth` `qc-sec-s1.2` `qc-sec-s1.4` `qc-sec-s1.7` เท่าเดิม · typecheck 0 · fitness ×2
