// suggest.ts — ข้อเสนอจากเลขา + งานที่สั่งบ่อย (S1.11 · แบบ A2 · มติเจ้าของ 9 · สัญญา docs/modules/31-secretary.md §5.12)
//
// deterministic ล้วน: กติกาคงที่บน `computeDigest` (ตัวนับชุดเดียวกับ proactive.gatherProactiveInsights) — ไม่เรียกโมเดล
// ไม่เริ่มงานเอง (มติ 9): ข้อเสนอเป็นแค่ "ปุ่มคำสั่งสำเร็จรูป" — ผู้ใช้แตะแล้วแอปค่อย `startRoom` ด้วย `instruction`
// กรองตามผู้ใช้: ระบบที่ผู้ใช้อ่านไม่ได้ (คีย์ของโมดูล — `canReadSystem` ใน digest.ts) หรือร้านตั้งระดับเลขาเป็น OFF = ตัดทิ้ง
// ข้อความไม่มี PII (จำนวนเท่านั้น ไม่มีชื่อลูกค้า)

import { tenantDb } from "@/lib/core/db";
import { bkkParts } from "@/lib/core/quiet-hours";
import { actorProblem, type AiMemberActor } from "../actor";
import type { ConvCtx } from "../conversation-owner";
import { getAccess } from "./access";
import { cachedDigest, computeDigest, viewerScope, viewerSees, type Digest, type DigestSystem } from "./digest";

export type Suggestion = { key: string; system: string; title: string; instruction: string; priority: 1 | 2 | 3 };

const SUGGESTIONS_MAX = 5;
const BOOST_SALES_HOUR = 15; // บ่ายสามโมงเวลาไทย — ยังไม่มีบิลเลย ⇒ ชวนกระตุ้นยอด
const FREQ_TAKE_MAX = 20;
const FREQ_SCAN = 500; // ห้องล่าสุดที่นำมานับ
const INSTRUCTION_MAX = 60;

/** กติกาคงที่ digest → ข้อเสนอ (ยังไม่กรองสิทธิ์) — pure */
export function suggestionsFromDigest(d: Digest, now: Date, sees: (s: DigestSystem) => boolean): Suggestion[] {
  const out: Suggestion[] = [];
  const r = d.receivables;
  if (r && r.overdueCount > 0 && sees("account")) {
    out.push({
      key: "collect_overdue",
      system: "account",
      title: `ตามหนี้ค้าง ${r.overdueCount} ใบ`,
      instruction: `ช่วยร่างข้อความตามหนี้ลูกค้าที่เลยกำหนด ${r.overdueCount} ราย แล้วเสนอให้ผมดูก่อนส่ง`,
      priority: 1,
    });
  }
  const t = d.tomorrow;
  if (t && t.appointments > 0 && sees("booking")) {
    out.push({
      key: "prep_tomorrow",
      system: "booking",
      title: `เตรียมนัดพรุ่งนี้ ${t.appointments} นัด`,
      instruction: `ช่วยสรุปนัดหมายพรุ่งนี้ ${t.appointments} นัด และบอกว่าต้องเตรียมอะไรบ้าง`,
      priority: 1,
    });
  }
  const l = d.lowStock;
  if (l && l.count > 0 && sees("inventory")) {
    out.push({
      key: "reorder",
      system: "inventory",
      title: `สั่งของเข้า ${l.count} รายการ`,
      instruction: `ช่วยดูสินค้าที่ต่ำกว่าจุดสั่งซื้อ ${l.count} รายการ แล้วร่างใบสั่งซื้อให้ผมตรวจก่อน`,
      priority: 2,
    });
  }
  // งานค้าง: นับเฉพาะส่วนที่ผู้ใช้เห็น · system = ส่วนแรกที่มี (อนุมัติ → ใบลา → ออเดอร์)
  const parts: { system: DigestSystem; n: number; label: string }[] = [
    { system: "approval" as DigestSystem, n: d.pending.approvalsAged, label: "คำขออนุมัติ" },
    { system: "hr" as DigestSystem, n: d.pending.leavesAged, label: "ใบลา" },
    { system: "shop" as DigestSystem, n: d.pending.shopOrders, label: "ออเดอร์รอชำระ" },
  ].filter((p) => p.n > 0 && sees(p.system));
  if (parts.length > 0) {
    const total = parts.reduce((a, p) => a + p.n, 0);
    out.push({
      key: "review_pending",
      system: parts[0]!.system,
      title: `เคลียร์งานค้าง ${total} รายการ`,
      instruction: `ช่วยสรุปงานที่ค้างอยู่ (${parts.map((p) => `${p.label} ${p.n}`).join(" · ")}) ให้ผมตัดสินใจทีละเรื่อง`,
      priority: 2,
    });
  }
  const q = d.quietCustomers;
  if (q && q.count > 0 && sees("crm")) {
    out.push({
      key: "follow_quiet",
      system: "crm",
      title: `ทักลูกค้าที่เงียบไป ${q.count} ราย`,
      instruction: `ช่วยร่างข้อความทักลูกค้าที่ไม่มีความเคลื่อนไหวเกิน 30 วัน ${q.count} ราย แล้วเสนอให้ผมดูก่อนส่ง`,
      priority: 3,
    });
  }
  const s = d.sales;
  if (s && s.todayCount === 0 && bkkParts(now).h >= BOOST_SALES_HOUR && sees("pos")) {
    out.push({
      key: "boost_sales",
      system: "pos",
      title: "วันนี้ยังไม่มียอดขาย",
      instruction: "วันนี้ยังไม่มีบิลขายเลย ช่วยคิดโปรหรือข้อความชวนลูกค้าเข้าร้านช่วงเย็นนี้ให้หน่อย",
      priority: 3,
    });
  }
  return out
    .sort((a, b) => a.priority - b.priority || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, SUGGESTIONS_MAX);
}

/**
 * ข้อเสนอจากเลขาสำหรับผู้ใช้นี้ (≤ 5 · เรียง priority แล้ว key) — ไม่เรียกโมเดล ไม่เปิดห้องเอง
 *   `now` ส่งมา = คำนวณสด ณ เวลานั้น (ข้อสอบ) · ไม่ส่ง = digest จาก cache 10 นาที
 *   ผู้กระทำไม่ใช่คนในร้าน / actor เสีย = [] · อ่านระดับเลขาไม่ได้ = [] (ปิดไว้ก่อน)
 */
export async function suggestions(ctx: { tenantId: string; actor: AiMemberActor }, now?: Date): Promise<Suggestion[]> {
  if (actorProblem(ctx) || ctx.actor?.kind !== "member") return [];
  const at = now ?? new Date();
  const m = ctx.actor.membership;
  const scope = await viewerScope(ctx.tenantId, m, ctx.actor.userId); // SEC S3a.1-S2 ▸ R-Z14: ตัวเลขต่อผู้ดู ◂
  const [d, access] = await Promise.all([now ? computeDigest(ctx.tenantId, now, scope) : cachedDigest(ctx.tenantId, scope), getAccess(ctx.tenantId).catch(() => null)]);
  if (!access) return [];
  return suggestionsFromDigest(d, at, (s) => viewerSees(m, ctx.actor.userId, access, s));
}

/** ชื่อห้อง → กุญแจจัดกลุ่ม: NFC · ตัดจุดไข่ปลาท้าย · ตัวเล็ก · ไม่นับช่องว่าง (ภาษาไทยไม่เว้นวรรคระหว่างคำ) · ≤ 60 ตัว (pure) */
export function instructionKey(title: string): string {
  const s = String(title ?? "").normalize("NFC").trim().replace(/…$/, "").toLowerCase().replace(/\s+/g, "");
  return Array.from(s).slice(0, INSTRUCTION_MAX).join("");
}

/** ข้อความที่แสดง: trim · ยุบช่องว่าง · ≤ 60 ตัว (pure) */
function displayOf(title: string): string {
  return Array.from(String(title ?? "").normalize("NFC").trim().replace(/\s+/g, " ")).slice(0, INSTRUCTION_MAX).join("");
}

/**
 * งานที่ผู้ใช้สั่งบ่อย — ห้องเลขา (`AiRoom`) ของร้านนี้ที่ผู้ใช้เปิดเอง (`startedById`) · จัดกลุ่มด้วย `instructionKey(title)` ·
 *   เฉพาะกลุ่มที่ count ≥ 2 · เรียง count desc แล้ว lastAt desc · instruction = ชื่อห้องล่าสุดของกลุ่ม · นับจากห้องล่าสุด 500 ห้อง
 */
export async function frequentInstructions(ctx: ConvCtx, take = 5): Promise<{ instruction: string; count: number; lastAt: Date }[]> {
  if (actorProblem(ctx) || ctx.actor?.kind !== "member") return [];
  const n = Math.max(1, Math.min(FREQ_TAKE_MAX, Math.floor(Number(take) || 5)));
  const rows = await tenantDb({ tenantId: ctx.tenantId }).aiRoom.findMany({
    where: { startedById: ctx.actor.userId },
    orderBy: { createdAt: "desc" },
    take: FREQ_SCAN,
    select: { title: true, createdAt: true },
  });
  const groups = new Map<string, { instruction: string; count: number; lastAt: Date }>();
  for (const r of rows) {
    const key = instructionKey(r.title);
    if (!key) continue;
    const g = groups.get(key);
    if (!g) groups.set(key, { instruction: displayOf(r.title), count: 1, lastAt: r.createdAt });
    else {
      g.count += 1;
      if (r.createdAt.getTime() > g.lastAt.getTime()) {
        g.lastAt = r.createdAt;
        g.instruction = displayOf(r.title);
      }
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime())
    .slice(0, n);
}
