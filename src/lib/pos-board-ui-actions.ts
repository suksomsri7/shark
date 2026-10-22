"use server";
// pos-board-ui-actions.ts — ตัวอ่านชิป "การ์ด #n" ของแถวรายงานจุดผิดปกติ (POS P3.8U ▸ CD-P38U-2 · CD-P38U-7 ◂)
//
// 🔴 ทำไมอยู่ที่ราก src/lib (ไม่ใช่ modules/pos): qc-pos-p3.8 ST1 ห้าม modules/pos/** import pos-board-* (ทิศกลับ) — composition root แบบ pos-board-actions.ts
//    (CD-P38U-2 ฉบับร่าง · ผู้คุมย้ายไป modules/pos/board-ui-actions.ts แล้ว ST1 แดง ⇒ CONTROLLER-DECISION CD-P38U-B1 ใน wo-notes)
// เปลือกบางแบบ ai-panel-actions.ts: session → ระบบ POS ของร้านนี้ → กรองกุญแจ → posCardsForKeys (pos-board-bridges · ตัวอ่านอย่างเดียว)
// 🔴 ไม่มีพฤติกรรมเซิร์ฟเวอร์ใหม่: posCardsForKeys ไม่มีด่านสิทธิ์ข้างใน ⇒ ด่านอยู่ที่นี่ — เฉพาะกุญแจ `pos-anomaly:` ของสาขาที่ผูกระบบนี้
//    และผู้ใช้มี pos.report.view + pos.report.anomaly ที่สาขานั้น (evaluate คืน boolean · ไม่ throw) · ไม่เกิน 200 กุญแจ
// 🔴 "use server" export ได้เฉพาะ async function · ชนิดผลลัพธ์อยู่ในไฟล์นี้ (ไม่ export) — จอใช้ Awaited<ReturnType<…>>
// 🔴 ไม่มี throw · คำปฏิเสธคืนเป็นข้อมูล {ok:false, code} · ผลไม่มีชื่อคน (key · cardNo · href · completed)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "@/lib/modules/pos/access";
import { prisma } from "@/lib/core/db";
import { ANOMALY_PERMISSION, REPORT_PERMISSION } from "@/lib/modules/pos/reports";
import { posCardsForKeys } from "./pos-board-bridges";

type CardChip = { key: string; cardNo: number | null; href: string; completed: boolean };
type CardsResult = { ok: true; cards: CardChip[] } | { ok: false; code: "NOT_FOUND" | "UNKNOWN" };

const ANOMALY_PREFIX = "pos-anomaly:";
const MAX_KEYS = 200;

/** ด่านสิทธิ์ต่อสาขา — boolean ล้วน (กฎ P1.6-R2) */
function can(m: MembershipCtx, action: string, unitId: string): boolean {
  return evaluate(m, { module: "pos", action, unitId });
}

/** CD-P38U-2 — การ์ดที่มีอยู่แล้วของแถวจุดผิดปกติ (กุญแจ posBoardKeys.anomaly) · กุญแจที่ไม่มีการ์ด = ไม่อยู่ในผล */
export async function posBoardCardsAction(args: { systemId: string; keys: string[] }): Promise<CardsResult> {
  try {
    const auth = await requireTenant();
    const tenantId = auth.active.tenantId;
    const m = posMembership(auth.active);
    const systemId = typeof args?.systemId === "string" ? args.systemId : "";
    const sys = systemId ? await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } }) : null;
    if (!sys) return { ok: false, code: "NOT_FOUND" };
    const linked = new Set((await prisma.appSystemUnit.findMany({ where: { tenantId, systemId: sys.id, type: "POS" }, select: { unitId: true } })).map((r) => r.unitId));
    const raw = Array.isArray(args?.keys) ? args.keys : [];
    const keys: string[] = [];
    for (const k of raw) {
      if (keys.length >= MAX_KEYS) break;
      if (typeof k !== "string" || !k.startsWith(ANOMALY_PREFIX) || k.length > 300 || keys.includes(k)) continue;
      // pos-anomaly:<rule>:<unitId>:<date>:<ref>
      const unitId = k.split(":")[2] ?? "";
      if (!linked.has(unitId) || !can(m, REPORT_PERMISSION, unitId) || !can(m, ANOMALY_PERMISSION, unitId)) continue;
      keys.push(k);
    }
    if (keys.length === 0) return { ok: true, cards: [] };
    const cards = await posCardsForKeys(tenantId, keys);
    return { ok: true, cards: cards.map((c) => ({ key: c.key, cardNo: c.cardNo, href: c.href, completed: c.completed })) };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos-board-ui-actions] cards", e);
    return { ok: false, code: "UNKNOWN" };
  }
}
