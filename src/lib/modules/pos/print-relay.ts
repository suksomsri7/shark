// print-relay.ts — ตัวช่วยพิมพ์ LAN แบบ cloud relay (P3-SKEL R13 · มติ §10-6 · CD-S9) — ผู้เขียนเดียวของ PosPrintAgent / PosPrintJob
//
// ทาง: เบราว์เซอร์ (iPad/เครื่องใดก็ได้) เรนเดอร์ไบต์ ESC/POS เหมือนเดิม → enqueuePrintJob (≤ 256 KB · หมดอายุ 10 นาที · คีย์เดิม = งานเดิม) →
//   agent (tools/pos-print-agent/agent.mjs บน PC/RPi/Android ใน LAN · ต่อออกเท่านั้น) long-poll GET /api/pos/print-agent/jobs (Bearer โทเคน) →
//   เขียนไบต์ไป host:9100 → POST …/jobs/:id/ack {ok, error?} → DONE / FAILED
// 🔴 โทเคน agent ≥ 32 ตัว แสดงครั้งเดียวตอนลงทะเบียน · เก็บแค่ sha256 (tokenHash) · ไม่ลง audit/ops/ผลคืนอื่น · เพิกถอน = 401 ทันที
// 🔴 งานหนึ่งถูกแจกครั้งเดียว (UPDATE … FOR UPDATE SKIP LOCKED) แม้ agent poll ซ้อน 2 ทาง · งานหมดอายุไม่ถูกแจก · agent อื่น ack ไม่ได้
// 🔴 ไบต์ของงานถูกล้างเมื่อจบ (DONE/FAILED/EXPIRED) — ใบเสร็จ/ใบครัวมีข้อมูลลูกค้า ไม่เก็บนานกว่างาน
// สิทธิ์: ลงทะเบียน/เพิกถอน = pos.device.manage · ส่งงาน = pos.sale.create (ที่สาขา) · เครื่องพิมพ์/ลิ้นชักจริง = W5
// คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message} เสมอ — ไม่โยน
import { createHash, randomBytes } from "node:crypto";
import { evaluate } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { posMembership } from "./access";
import { prisma } from "./db";
import { POS_DEVICE_CODE_RE } from "./device-shared";

export const PRINT_JOB_MAX_BYTES = 256 * 1024;
export const PRINT_JOB_TTL_MS = 10 * 60_000;
export const PRINT_POLL_MAX_SEC = 25;
export const PRINT_AGENT_ONLINE_MS = 120_000;
const SEEN_THROTTLE_MS = 30_000;
/** งานต่อการ poll หนึ่งครั้ง = 10 (ตัวเลขอยู่ใน SQL ของ claimPrintJobs) */
const MAX_PRINTERS = 8;
export type PrintTarget = "kitchen" | "receipt";
export const PRINT_TARGETS: readonly PrintTarget[] = ["kitchen", "receipt"];
export type PrintPrinter = { name: string; host: string; port: number };
export type PrintRelayCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "AGENT_REVOKED" | "UNAUTHORIZED" | "CONFLICT" | "UNKNOWN";
export type PrintRelayRefusal = { ok: false; code: PrintRelayCode; message: string };
export type PrintAgentView = { id: string; name: string; printers: PrintPrinter[]; lastSeenAt: string | null; online: boolean; revokedAt: string | null; createdAt: string };
export type PrintJobView = { id: string; agentId: string; deviceCode: string; target: PrintTarget; status: string; byteLength: number; attempts: number; error: string | null; expiresAt: string; createdAt: string };
export type PrintWireJob = { id: string; bytesB64: string; target: PrintTarget; deviceCode: string; printer: PrintPrinter | null; expiresAt: string };
type Ctx = { tenantId: string; systemId: string; unitId: string };
type Actor = { userId: string; role: string; unitAccess?: unknown; permissions?: unknown };

const MSG: Record<PrintRelayCode, string> = {
  NOT_FOUND: "ไม่พบตัวช่วยพิมพ์/งานพิมพ์นี้",
  PERMISSION_DENIED: "ไม่มีสิทธิ์ทำรายการนี้",
  VALIDATION: "ข้อมูลไม่ถูกต้อง",
  AGENT_REVOKED: "ตัวช่วยพิมพ์นี้ถูกเพิกถอนแล้ว",
  UNAUTHORIZED: "โทเคนตัวช่วยพิมพ์ไม่ถูกต้อง",
  CONFLICT: "งานพิมพ์นี้จบไปแล้วหรือหมดอายุ",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const refuse = (code: PrintRelayCode, message?: string): PrintRelayRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ctxOf = (ctx: unknown): Ctx | null => (isRecord(ctx) && isId(ctx.tenantId) && isId(ctx.systemId) && isId(ctx.unitId) ? { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId } : null);
function membershipOf(actor: unknown) {
  return isRecord(actor) && typeof actor.role === "string" && typeof actor.userId === "string" ? posMembership(actor as Parameters<typeof posMembership>[0]) : null;
}
const can = (m: ReturnType<typeof membershipOf>, action: string, unitId: string) => !!m && evaluate(m, { module: "pos", action, unitId });

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HOSTNAME = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const hostOk = (h: string) => {
  const m = IPV4.exec(h);
  return m ? m.slice(1).every((x) => Number(x) <= 255) : HOSTNAME.test(h);
};

/** เครื่องพิมพ์ของ agent — [{name ≤ 40, host (IPv4/ชื่อเครื่อง), port 1–65535}] 1–8 เครื่อง · ผิด = null */
export function parsePrinters(v: unknown): PrintPrinter[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_PRINTERS) return null;
  const out: PrintPrinter[] = [];
  for (const p of v) {
    if (!isRecord(p)) return null;
    const name = typeof p.name === "string" ? p.name.trim() : "";
    const host = typeof p.host === "string" ? p.host.trim() : "";
    const port = p.port;
    if (!name || name.length > 40 || !host || !hostOk(host)) return null;
    if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    out.push({ name, host, port });
  }
  return out;
}
const printersOf = (v: unknown): PrintPrinter[] => parsePrinters(v) ?? [];

type AgentRow = { id: string; name: string; printers: unknown; lastSeenAt: Date | null; revokedAt: Date | null; createdAt: Date };
const agentView = (a: AgentRow, now = Date.now()): PrintAgentView => ({
  id: a.id,
  name: a.name,
  printers: printersOf(a.printers),
  lastSeenAt: a.lastSeenAt ? a.lastSeenAt.toISOString() : null,
  online: !a.revokedAt && !!a.lastSeenAt && now - a.lastSeenAt.getTime() <= PRINT_AGENT_ONLINE_MS,
  revokedAt: a.revokedAt ? a.revokedAt.toISOString() : null,
  createdAt: a.createdAt.toISOString(),
});
const AGENT_SELECT = { id: true, name: true, printers: true, lastSeenAt: true, revokedAt: true, createdAt: true } as const;
type JobRow = { id: string; agentId: string; deviceCode: string; target: string; status: string; byteLength: number; attempts: number; error: string | null; expiresAt: Date; createdAt: Date };
const JOB_SELECT = { id: true, agentId: true, deviceCode: true, target: true, status: true, byteLength: true, attempts: true, error: true, expiresAt: true, createdAt: true } as const;
const jobView = (j: JobRow): PrintJobView => ({ ...j, target: j.target as PrintTarget, expiresAt: j.expiresAt.toISOString(), createdAt: j.createdAt.toISOString() });

/** ลงทะเบียนตัวช่วยพิมพ์ — โทเคนคืนครั้งเดียว (เก็บแค่แฮช) */
export async function registerPrintAgent(ctx: Ctx, actor: Actor, input: unknown): Promise<{ ok: true; agent: PrintAgentView; token: string } | PrintRelayRefusal> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const m = membershipOf(actor);
    if (!can(m, "pos.device.manage", c.unitId)) return refuse("PERMISSION_DENIED", "ลงทะเบียนตัวช่วยพิมพ์ได้เฉพาะผู้จัดการเครื่อง (pos.device.manage)");
    if (!isRecord(input)) return refuse("VALIDATION");
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 60) return refuse("VALIDATION", "ชื่อตัวช่วยพิมพ์ 1–60 ตัวอักษร");
    const printers = parsePrinters(input.printers);
    if (!printers) return refuse("VALIDATION", "เครื่องพิมพ์ต้องมี 1–8 เครื่อง แต่ละเครื่องมีชื่อ ที่อยู่ (IP/ชื่อเครื่อง) และพอร์ต 1–65535");
    const sys = await prisma.appSystem.findFirst({ where: { id: c.systemId, tenantId: c.tenantId, type: "POS" }, select: { id: true } });
    if (!sys) return refuse("NOT_FOUND");
    const token = `spa_${randomBytes(32).toString("base64url")}`;
    const row = await prisma.posPrintAgent.create({
      data: { tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId, name, tokenHash: sha(token), printers, createdByUserId: (actor as Actor).userId },
      select: AGENT_SELECT,
    });
    await writeAudit({ tenantId: c.tenantId, actorId: (actor as Actor).userId, action: "pos.print.agent.registered", targetType: "PosPrintAgent", targetId: row.id, after: { name, printers: printers.length } });
    return { ok: true, agent: agentView(row), token };
  } catch (e) {
    console.error("[pos/print-relay] register", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/** เพิกถอนตัวช่วยพิมพ์ — โทเคนใช้ไม่ได้ทันที (401) · งานที่ค้างของมันหมดอายุตามเวลา */
export async function revokePrintAgent(ctx: Ctx, actor: Actor, input: unknown): Promise<{ ok: true; agent: PrintAgentView } | PrintRelayRefusal> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const m = membershipOf(actor);
    if (!can(m, "pos.device.manage", c.unitId)) return refuse("PERMISSION_DENIED");
    if (!isRecord(input) || !isId(input.agentId)) return refuse("NOT_FOUND");
    const a = await prisma.posPrintAgent.findFirst({ where: { id: input.agentId, tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId }, select: AGENT_SELECT });
    if (!a) return refuse("NOT_FOUND");
    if (a.revokedAt) return { ok: true, agent: agentView(a) };
    const row = await prisma.posPrintAgent.update({ where: { id: a.id }, data: { revokedAt: new Date() }, select: AGENT_SELECT });
    await writeAudit({ tenantId: c.tenantId, actorId: (actor as Actor).userId, action: "pos.print.agent.revoked", targetType: "PosPrintAgent", targetId: row.id, after: { name: row.name } });
    return { ok: true, agent: agentView(row) };
  } catch (e) {
    console.error("[pos/print-relay] revoke", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/** ตัวช่วยพิมพ์ของสาขา (ไม่มีโทเคน/แฮช) — ผู้จัดการเครื่อง หรือคนขาย (เลือกเครื่องพิมพ์ LAN ที่หน้าขาย) */
export async function listPrintAgents(ctx: Ctx, actor: Actor): Promise<{ ok: true; agents: PrintAgentView[] } | PrintRelayRefusal> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const m = membershipOf(actor);
    if (!can(m, "pos.device.manage", c.unitId) && !can(m, "pos.sale.create", c.unitId)) return refuse("PERMISSION_DENIED");
    const rows = await prisma.posPrintAgent.findMany({ where: { tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId }, select: AGENT_SELECT, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const now = Date.now();
    return { ok: true, agents: rows.map((r) => agentView(r, now)) };
  } catch (e) {
    console.error("[pos/print-relay] list", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const B64_MAX_LEN = Math.ceil(PRINT_JOB_MAX_BYTES / 3) * 4;

/** ส่งงานพิมพ์เข้าคิวของ agent (≤ 256 KB · หมดอายุ 10 นาที · คีย์เดิม = งานเดิม) */
export async function enqueuePrintJob(ctx: Ctx, actor: Actor, input: unknown, deps?: { now?: Date }): Promise<{ ok: true; job: PrintJobView; replayed?: boolean } | PrintRelayRefusal> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const m = membershipOf(actor);
    if (!can(m, "pos.sale.create", c.unitId)) return refuse("PERMISSION_DENIED");
    if (!isRecord(input)) return refuse("VALIDATION");
    const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!key || key.length > 120) return refuse("VALIDATION", "รหัสรายการ (idempotencyKey) ไม่ถูกต้อง");
    if (!PRINT_TARGETS.includes(input.target as PrintTarget)) return refuse("VALIDATION", "target ต้องเป็น kitchen หรือ receipt");
    if (typeof input.deviceCode !== "string" || !POS_DEVICE_CODE_RE.test(input.deviceCode)) return refuse("VALIDATION", "รหัสเครื่องไม่ถูกต้อง");
    const b64 = typeof input.bytesB64 === "string" ? input.bytesB64 : "";
    if (!b64 || b64.length % 4 !== 0 || !B64.test(b64)) return refuse("VALIDATION", "ไบต์งานพิมพ์ต้องเป็น base64");
    if (b64.length > B64_MAX_LEN) return refuse("VALIDATION", "งานพิมพ์ใหญ่เกิน 256 KB");
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length === 0 || bytes.length > PRINT_JOB_MAX_BYTES) return refuse("VALIDATION", "งานพิมพ์ใหญ่เกิน 256 KB");
    if (!isId(input.agentId)) return refuse("NOT_FOUND");
    const agent = await prisma.posPrintAgent.findFirst({ where: { id: input.agentId, tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId }, select: { id: true, revokedAt: true } });
    if (!agent) return refuse("NOT_FOUND");
    if (agent.revokedAt) return refuse("AGENT_REVOKED");
    const prev = await prisma.posPrintJob.findFirst({ where: { tenantId: c.tenantId, idempotencyKey: key }, select: JOB_SELECT });
    if (prev) return { ok: true, job: jobView(prev), replayed: true };
    const now = deps?.now instanceof Date && !Number.isNaN(deps.now.getTime()) ? deps.now : new Date();
    try {
      const row = await prisma.posPrintJob.create({
        data: { tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId, agentId: agent.id, deviceCode: input.deviceCode, target: input.target as string, bytes: new Uint8Array(bytes), byteLength: bytes.length, idempotencyKey: key, createdByUserId: (actor as Actor).userId, expiresAt: new Date(now.getTime() + PRINT_JOB_TTL_MS) },
        select: JOB_SELECT,
      });
      return { ok: true, job: jobView(row) };
    } catch (e) {
      if (!(isRecord(e) && e.code === "P2002")) return refuse("UNKNOWN");
      const again = await prisma.posPrintJob.findFirst({ where: { tenantId: c.tenantId, idempotencyKey: key }, select: JOB_SELECT });
      return again ? { ok: true, job: jobView(again), replayed: true } : refuse("UNKNOWN");
    }
  } catch (e) {
    console.error("[pos/print-relay] enqueue", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/** agent จากหัว Authorization: Bearer <token> — ไม่มี/ว่าง/ไม่รู้จัก/เพิกถอน = null */
async function agentOf(authorization: unknown): Promise<{ id: string; tenantId: string; printers: unknown; lastSeenAt: Date | null } | null> {
  if (typeof authorization !== "string") return null;
  const m = /^Bearer\s+(\S{32,512})$/i.exec(authorization.trim());
  if (!m) return null;
  const a = await prisma.posPrintAgent.findUnique({ where: { tokenHash: sha(m[1]!) }, select: { id: true, tenantId: true, printers: true, lastSeenAt: true, revokedAt: true } });
  return a && !a.revokedAt ? a : null;
}

/** แจกงานที่รออยู่ของ agent (ครั้งเดียวต่องาน · ไม่แจกงานหมดอายุ) — route GET ใช้ */
export async function claimPrintJobs(authorization: unknown, opts?: { now?: Date }): Promise<{ ok: true; agentId: string; jobs: PrintWireJob[] } | PrintRelayRefusal> {
  try {
    const agent = await agentOf(authorization);
    if (!agent) return refuse("UNAUTHORIZED");
    const now = opts?.now instanceof Date ? opts.now : new Date();
    if (!agent.lastSeenAt || now.getTime() - agent.lastSeenAt.getTime() > SEEN_THROTTLE_MS) {
      await prisma.posPrintAgent.updateMany({ where: { id: agent.id, revokedAt: null }, data: { lastSeenAt: now } }).catch(() => undefined);
    }
    const claimed = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE "PosPrintJob" SET "status" = 'SENT', "attempts" = "attempts" + 1, "sentAt" = ${now}, "updatedAt" = ${now}
      WHERE "id" IN (
        SELECT "id" FROM "PosPrintJob"
        WHERE "agentId" = ${agent.id} AND "status" = 'QUEUED' AND "expiresAt" > ${now}
        ORDER BY "createdAt" ASC, "id" ASC LIMIT 10 FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"`;
    if (!claimed.length) return { ok: true, agentId: agent.id, jobs: [] };
    const rows = await prisma.posPrintJob.findMany({ where: { id: { in: claimed.map((x) => x.id) }, agentId: agent.id }, select: { id: true, bytes: true, target: true, deviceCode: true, expiresAt: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const printers = printersOf(agent.printers);
    const jobs = rows.map((r) => ({
      id: r.id,
      bytesB64: Buffer.from(r.bytes ?? new Uint8Array(0)).toString("base64"),
      target: r.target as PrintTarget,
      deviceCode: r.deviceCode,
      printer: printers.find((p) => p.name === r.target) ?? printers[0] ?? null,
      expiresAt: r.expiresAt.toISOString(),
    }));
    return { ok: true, agentId: agent.id, jobs };
  } catch (e) {
    console.error("[pos/print-relay] claim", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/** ผลการพิมพ์จาก agent — งานของตัวเองที่ SENT เท่านั้น → DONE / FAILED (+ error) · อื่น = NOT_FOUND / CONFLICT */
export async function ackPrintJob(authorization: unknown, jobId: unknown, body: unknown): Promise<{ ok: true; status: "DONE" | "FAILED" } | PrintRelayRefusal> {
  try {
    const agent = await agentOf(authorization);
    if (!agent) return refuse("UNAUTHORIZED");
    if (!isId(jobId)) return refuse("NOT_FOUND");
    if (!isRecord(body) || typeof body.ok !== "boolean") return refuse("VALIDATION", "ต้องส่ง {ok: true|false, error?}");
    const error = body.ok ? null : typeof body.error === "string" ? body.error.slice(0, 500) : "พิมพ์ไม่สำเร็จ";
    const job = await prisma.posPrintJob.findFirst({ where: { id: jobId, agentId: agent.id }, select: { id: true, status: true } });
    if (!job) return refuse("NOT_FOUND");
    const want = body.ok ? "DONE" : "FAILED";
    if (job.status === want) return { ok: true, status: want };
    if (job.status !== "SENT") return refuse("CONFLICT");
    const u = await prisma.posPrintJob.updateMany({ where: { id: job.id, agentId: agent.id, status: "SENT" }, data: { status: want, error, doneAt: new Date(), bytes: null } });
    return u.count === 1 ? { ok: true, status: want } : refuse("CONFLICT");
  } catch (e) {
    console.error("[pos/print-relay] ack", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/** งานที่ค้าง (QUEUED/SENT) เกินเวลา → EXPIRED + ล้างไบต์ — งานรายชั่วโมง pos.slip.purge เรียกด้วย */
export async function expirePrintJobs(opts?: { tenantId?: string; now?: Date }): Promise<{ ok: true; expired: number }> {
  try {
    const now = opts?.now instanceof Date ? opts.now : new Date();
    const r = await prisma.posPrintJob.updateMany({ where: { ...(opts?.tenantId ? { tenantId: opts.tenantId } : {}), status: { in: ["QUEUED", "SENT"] }, expiresAt: { lte: now } }, data: { status: "EXPIRED", bytes: null } });
    return { ok: true, expired: r.count };
  } catch (e) {
    console.error("[pos/print-relay] expire", e instanceof Error ? e.name : "error");
    return { ok: true, expired: 0 };
  }
}
