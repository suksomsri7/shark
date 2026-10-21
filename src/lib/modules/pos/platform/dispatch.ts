// platform/dispatch.ts — ตัวกระจายของช่องทาง adapter "API" (P3-SKEL R1 R2 · สัญญา C-7 · CD-S10) + ตัวตัดสินคำขอขาเข้าของแพลตฟอร์ม
//
// ขาออก (platformDispatch = OrderAdapter code "API" — order-adapters.ts บรรทัดเดียว): อ่านช่องทาง (ออเดอร์ → PosOrder.channelId/channelCode ·
//   หรือ channelId ตรง) → PLATFORM_ADAPTERS[รหัสช่องทาง] → โครงตอบ NOT_CONFIGURED → OpsEvent INFO "pos.platform.not_configured"
//   **1 แถวต่อ (ช่องทาง, เมธอด) ต่อชั่วโมง** (กันล้น · มี tenantId) · ไม่โยนใส่ผู้เรียกทุกกรณี (order.ts/kds.ts เรียกหลัง commit)
// ขาเข้า (handlePlatformInbound — route /api/pos/platform/[provider]/[channelId]): ช่องทางต้องมีจริง ไม่เก็บ adapter API รหัส = provider (ไม่งั้น 404) ·
//   ไม่มี webhookSecret ที่เก็บไว้ = 503 NOT_CONFIGURED · ลายเซ็นผิด = 401 + OpsEvent WARN (ขนาด + sha256 เท่านั้น — ไม่เคย log เนื้อคำขอ) ·
//   ลายเซ็นถูก = parseInbound ของโครง ⇒ 503 ADAPTER_PENDING (ไม่เขียนอะไร) · adapter จริงภายหลังเรียก orders.ingestInTx (X1 กันซ้ำอยู่แล้ว)
import { createHash } from "node:crypto";
import { logOps } from "@/lib/core/ops";
import { prisma } from "../db";
import { platformInboundCreds } from "../integration-creds";
import type { OrderAdapter } from "../order-adapters";
import { platformAdapter } from "./registry";
import type { C7Method } from "./types";

const SOURCE = "pos.platform";
/** ข้อความของ OpsEvent INFO (ค้นหาได้ใน backoffice) */
export const PLATFORM_NOT_CONFIGURED_OPS = "pos.platform.not_configured";
const HOUR = 3_600_000;
const MEMO_MAX = 5000;
const memo = new Map<string, number>();
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idOf = (v: unknown, k: string): string | null => (isRecord(v) && typeof v[k] === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v[k] as string) ? (v[k] as string) : null);

type Target = { tenantId: string; channelId: string; provider: string };

async function targetOfOrder(input: unknown): Promise<Target | null> {
  const orderId = idOf(input, "orderId");
  if (!orderId) return null;
  const o = await prisma.posOrder.findUnique({ where: { id: orderId }, select: { tenantId: true, channelId: true, channelCode: true, adapter: true } });
  return o && o.adapter === "API" ? { tenantId: o.tenantId, channelId: o.channelId, provider: o.channelCode } : null;
}

async function targetOfChannel(input: unknown): Promise<Target | null> {
  const channelId = idOf(input, "channelId");
  if (!channelId) return null;
  const ch = await prisma.salesChannel.findUnique({ where: { id: channelId }, select: { id: true, tenantId: true, code: true, adapter: true, archivedAt: true } });
  return ch && ch.adapter === "API" && !ch.archivedAt ? { tenantId: ch.tenantId, channelId: ch.id, provider: ch.code } : null;
}

/** INFO 1 แถวต่อ (ช่องทาง, เมธอด) ต่อชั่วโมง — กันซ้อนในโปรเซสด้วย memo (ตั้งก่อน await) + กันข้ามโปรเซสด้วยแถวในชั่วโมงล่าสุด */
async function noteNotConfigured(t: Target, method: C7Method, reason: string): Promise<void> {
  const key = `${t.tenantId}:${t.channelId}:${method}`;
  const now = Date.now();
  const last = memo.get(key);
  if (last !== undefined && now - last < HOUR) return;
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(key, now);
  const dup = await prisma.opsEvent.findFirst({
    where: { tenantId: t.tenantId, source: SOURCE, createdAt: { gte: new Date(now - HOUR) }, message: { endsWith: ` · ${method}` }, detail: { contains: `channel ${t.channelId} ` } },
    select: { id: true },
  });
  if (dup) return;
  await logOps("INFO", SOURCE, `${PLATFORM_NOT_CONFIGURED_OPS} · ${t.provider} · ${method}`, {
    tenantId: t.tenantId,
    detail: `channel ${t.channelId} · method ${method} · ${reason} · คำสั่งนี้ยังไม่ถูกส่งถึงแพลตฟอร์ม (โครง P3-SKEL)`,
  });
}

function relay(method: C7Method, resolve: (input: unknown) => Promise<Target | null>) {
  return async (input: unknown): Promise<void> => {
    try {
      const t = await resolve(input);
      if (!t) return;
      const ad = platformAdapter(t.provider);
      const res = ad ? await ad[method](input) : { ok: false as const, code: "NOT_CONFIGURED" as const, reason: `ไม่มีตัวเชื่อมของ ${t.provider}` };
      if (res.ok === false) await noteNotConfigured(t, method, res.reason);
    } catch (e) {
      console.error(`[pos/platform] ${method} ล้ม`, e instanceof Error ? e.name : "error");
    }
  };
}

/** adapter ของ SalesChannel.adapter = "API" (บรรทัดเดียวใน order-adapters.ts) — เมธอดไม่โยน · คืน void ตามสัญญา C-7 */
export const platformDispatch: OrderAdapter = {
  code: "API",
  accept: relay("accept", targetOfOrder),
  reject: relay("reject", targetOfOrder),
  setReady: relay("setReady", targetOfOrder),
  syncMenu: relay("syncMenu", targetOfChannel),
  setAvailability: relay("setAvailability", targetOfChannel),
  setStoreStatus: relay("setStoreStatus", targetOfChannel),
};

// ═══════════ ขาเข้า ═══════════
/** เพดานเนื้อคำขอขาเข้า (413) */
export const PLATFORM_INBOUND_MAX_BYTES = 256 * 1024;
export type PlatformInboundResult = { status: 401 | 404 | 503; body: Record<string, string> };
const NOT_FOUND: PlatformInboundResult = { status: 404, body: { error: "not_found" } };

/** ตัดสินคำขอขาเข้าที่อ่านเนื้อแล้ว (≤ 256 KB) — ไม่เขียนแถวใดเลยในโครง · ไม่ log เนื้อคำขอ */
export async function handlePlatformInbound(input: { provider: string; channelId: string; raw: Uint8Array; headers: Headers }): Promise<PlatformInboundResult> {
  try {
    const ad = platformAdapter(input.provider);
    if (!ad || !/^[A-Za-z0-9_-]{8,64}$/.test(input.channelId)) return NOT_FOUND;
    const ch = await prisma.salesChannel.findUnique({ where: { id: input.channelId }, select: { id: true, tenantId: true, systemId: true, code: true, adapter: true, archivedAt: true } });
    if (!ch || ch.archivedAt || ch.adapter !== "API" || ch.code !== input.provider) return NOT_FOUND;
    const creds = await platformInboundCreds(ch);
    if (!creds) return { status: 503, body: { code: "NOT_CONFIGURED" } };
    if (!ad.verifyInbound(input.raw, input.headers, creds)) {
      const fp = createHash("sha256").update(input.raw).digest("hex").slice(0, 16);
      await logOps("WARN", SOURCE, "platform webhook ลายเซ็นไม่ผ่าน", {
        tenantId: ch.tenantId,
        detail: `${ch.code} · channel ${ch.id} · body ${input.raw.length} ไบต์ · sha256:${fp} · sig ${input.headers.get("x-shark-signature") ? "มี" : "ไม่มี"}`,
      });
      return { status: 401, body: { error: "unauthorized" } };
    }
    // โครง: parseInbound = NOT_CONFIGURED เสมอ ⇒ ลายเซ็นถูกแต่ยังรับออเดอร์ไม่ได้ (ไม่เขียนอะไร) — adapter จริงแทนบรรทัดนี้ด้วย ingestInTx
    await ad.parseInbound(input.raw, creds);
    return { status: 503, body: { code: "ADAPTER_PENDING" } };
  } catch (e) {
    console.error("[pos/platform] inbound ล้ม", e instanceof Error ? e.name : "error");
    return { status: 503, body: { code: "NOT_CONFIGURED" } };
  }
}
