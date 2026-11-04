# S1-11 — S1.13 โควตา 100 งาน/เดือน · `canRunAi` ด่านเดียวใน credit.ts · `quotaStatus` (Opus · `wip/sec-s1.13` · หลัง S1.4 · ชุดตรวจเข้ม 2 ผู้ตรวจ)

Read `sec-brief-COMMON.md`, `sec-brief-RESOLUTIONS.md` (**R-K6 R-K7** · §B.6 · §E ข้อ 4), plan row S1.13, มติ 7.1–7.4 + Q3/Q4 ใน `ledger/DESIGN-SECRETARY.md` §6, `docs/modules/31-secretary.md` §8, และ oracle `scripts/qc-sec-s1.13.mts`. Verified code: `src/lib/ai/credit.ts` (`welcomeGrantMicro` :22 · `ensureWallet` :34 เขียน GRANT lazy · `balanceOf` :69 · `canSpend` :74 · `canSpendPeek` :85 · `chargeUsage`/`chargeUsageSafe` ยอดติดลบได้) · `src/lib/ai/service.ts` (`canSpend` :131 → over_budget/credit · `LOW_BALANCE_MICRO` degrade :150 ใช้ `balanceOf`) · `src/lib/ai/usage.ts` (`quotaMessage(scope, resetAt)` :177 · scope "credit"/"day"/"week"/"session") · `src/lib/mobile/chat.ts` :34 · `src/app/api/mobile/usage/route.ts` (**GET เขียน** ผ่าน ensureWallet · รูป response ต้องคงเดิมสำหรับ build #19) · `src/lib/ai/secretary/rooms.ts` `startRoom` (ตัวนับ `AiJobCounter` + `QuotaExceeded` · S1.4) · `src/lib/ai/secretary/pack.ts` (`FREE_PACK` · `SECRETARY_LAUNCH_AT` · `quotaMessage` ของแพ็ก · `nextResetBangkok` · `monthKeyBangkok`).

## 1. `src/lib/ai/credit.ts` (แก้/เพิ่ม)
```ts
export type RunScope = "job" | "assist";
export type CanRun = { ok: true } | { ok: false; reason: "jobs" | "credit"; resetAt?: Date; message: string };
export async function canRunAi(tenantId: string, opts: { scope: RunScope; now?: Date }): Promise<CanRun>;
   // assist: FREE_PACK.enabled ⇒ ok เสมอ (รุ่นแรก assist ฟรี) · ไม่งั้น balance>0
   // job: jobsLeft(month) > 0 ⇒ ok · ไม่งั้น balancePeek > 0 ⇒ ok (ใช้กระเป๋าต่อ · Q4) · ไม่งั้น {reason:"jobs", resetAt: nextResetBangkok(now), message: pack.quotaMessage(...).text}
export async function balancePeek(tenantId: string): Promise<number | null>;  // อ่านอย่างเดียว · ไม่มีกระเป๋า = null (ไม่สร้าง)
export async function canSpend(tenantId: string): Promise<boolean>;            // = (await canRunAi(tenantId, {scope:"assist"})).ok — ผู้เรียก 20 จุดคงเดิม
export async function ensureWallet(tenantId: string): Promise<Wallet>;         // ร้านที่ `tenant.createdAt >= new Date(SECRETARY_LAUNCH_AT)` ⇒ สร้างกระเป๋า balance 0 · grantedAt null · ไม่มีแถว GRANT · ร้านเดิม = เดิมทุกไบต์ (GRANT $10)
export async function canSpendPeek(tenantId: string): Promise<boolean>;        // ไม่มีกระเป๋า: ร้านเดิม (createdAt < LAUNCH) ⇒ grant>0 · ร้านใหม่ ⇒ FREE_PACK.enabled (assist ฟรี) · มีกระเป๋า ⇒ balance>0 || FREE_PACK.enabled
```
## 2. `src/lib/ai/secretary/quota.ts` (ใหม่)
```ts
export type QuotaStatus = { month: string; jobsUsed: number; jobsLimit: number; jobsLeft: number; pct: number; level: QuotaLevel; text: string | null; resetAt: Date; balanceMicro: number | null; blocked: "jobs" | null };
export async function quotaStatus(tenantId: string, now?: Date): Promise<QuotaStatus>;  // อ่านอย่างเดียว (AiJobCounter findUnique · balancePeek) · ห้ามเขียน · blocked = jobsLeft===0 && !(balance>0)
export async function jobsLeft(tenantId: string, now?: Date): Promise<number>;
```
## 3. ต่อเข้า
- `service.ts sendMessage`: แทน `canSpend` ด้วย `canRunAi(ctx.tenantId, { scope: "assist" })` (ห้องเลขานับที่ startRoom แล้ว) · ไม่ผ่าน ⇒ `{ ok:false, error:"over_budget", scope: r.reason, resetAt }` · `SendResult.scope` เพิ่ม `"jobs"` · **degrade**: ใช้ `balancePeek` — ไม่มีกระเป๋า/grantedAt null (ร้านใหม่ในแพ็กฟรี) ⇒ ไม่ลดชั้น · ร้านเดิมยอด < $0.50 ⇒ ลดชั้นเหมือนเดิม
- `usage.ts quotaMessage`: scope "jobs" ⇒ "โควตางานของเลขาเดือนนี้ครบ 100 งานแล้ว — เริ่มนับใหม่ <วันที่ไทย>" (ใช้ resetAt)
- `rooms.ts startRoom`: เมื่อ `jobs >= limit` แต่ `balancePeek > 0` ⇒ นับต่อได้ (updateMany ไม่มี `lt` · jobs เกิน limit ได้) — ยังเป็น conditional update ตัวเดียวใน tx (X3) · ไม่งั้น quota เหมือนเดิม
- `GET /api/mobile/usage`: **ไม่เขียน** (ใช้ findUnique/balancePeek แทน ensureWallet) · ฟิลด์เดิมครบทุกตัว (scope/used/limit/pct/warn/degraded/blocked/resetAt/balanceMicro) · เพิ่ม `jobs: QuotaStatus` (ฟิลด์ใหม่ build เก่าเมิน) · ร้านใหม่ไม่มีกระเป๋า: used 0 · limit 1 · pct 0 · blocked null · balanceMicro 0
- `docs/modules/31-secretary.md` §8 ให้ตรงของจริง
## Files you own
`src/lib/ai/credit.ts` · `src/lib/ai/secretary/quota.ts` · `src/lib/ai/service.ts` (2 hunks) · `src/lib/ai/usage.ts` (quotaMessage) · `src/lib/ai/secretary/rooms.ts` (overflow hunk) · `src/app/api/mobile/usage/route.ts` · `docs/modules/31-secretary.md` §8 · `ledger/wo-notes/sec-s1.13.md`
## Acceptance = `scripts/qc-sec-s1.13.mts` ทั้งหมด PASS + regression `qc-ai-usage` `qc-ai-credit` `qc-ai-brain` `qc-mobile-chat` `qc-chat-ai-suggest` `qc-chat-translate` `qc-support-ai` `qc-svc-d.14` (ถ้ามี) + `qc-sec-s1.4` ยัง 28/28 เท่า baseline · typecheck 0 · fitness ×2 · 2 ผู้ตรวจ
