// คิวเลขา AI ฝั่งทีมงาน SHARK (SEC S2.23 · จอ G5 `/backoffice/secretary`) — อ่าน/แก้ข้ามร้านโดยเจตนา (prisma ตรง เหมือน platform/support.ts)
// สัญญา: ledger/secretary-briefs/sec-brief-S2.16.md (S2.23) · oracle scripts/qc-sec-s2.16.mts กลุ่ม Q
//
// 🔴 ทุกฟังก์ชันตรวจ role ก่อนแตะฐาน: SUPER_ADMIN / SUPPORT เท่านั้น (FINANCE/อื่น ⇒ throw) — หน้าเพจกั้นด้วย requireBackoffice อีกชั้น
// 🔴 ตัวเลขเงินเห็นได้เฉพาะ backoffice (ทีมงาน) — ห้ามส่ง DTO พวกนี้ไปแอป/ร้าน (COMMON §C.6 ใช้กับฝั่งผู้ใช้)
// ต้นทุน = Σ|amountMicro| ของ AiCreditTxn kind USAGE (ไมโครดอลลาร์) · วัน = วันไทย (bkkDayStart)
// การแก้คิว (ลองใหม่/ยกเลิก) = updateMany แบบมีเงื่อนไขสถานะคำสั่งเดียว (COMMON §C.5) + PlatformAuditLog

import type { PlatformRole, PlatformUser } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { bkkDayStart } from "@/lib/core/quiet-hours";
import { FREE_PACK } from "@/lib/ai/secretary/pack";
import { ROOM_JOB_GEN, ROOM_JOB_MAX_GENS, attemptsInGen } from "@/lib/ai/secretary/job-gen"; // SEC S3a.1-S2 R-Z33 ◂
import { requirePlatformRole } from "./auth";

const OPS_ROLES: PlatformRole[] = ["SUPER_ADMIN", "SUPPORT"];
const DAY_MS = 86_400_000;
/** งาน QUEUED ที่รอเกินนี้ = "ค้าง" (แสดงในรายการให้ทีมงานดู) */
export const STALE_QUEUED_MS = 5 * 60_000;
/** ข้อความ error ของงานที่ทีมงานยกเลิก (oracle Q-2 ตรวจคำว่า cancelled) */
export const CANCELLED_BY_SUPPORT = "cancelled by support — ทีมงาน SHARK ยกเลิกงานนี้";

function guard(actor: PlatformUser | null | undefined): PlatformUser {
  return requirePlatformRole(actor ?? null, OPS_ROLES);
}

const okDate = (d: Date | undefined): Date => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());

async function tenantNames(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const rows = await prisma.tenant.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
  return new Map(rows.map((t) => [t.id, t.name]));
}

// ───────────── คิว ─────────────

export type QueueItem = {
  id: string;
  status: string; // QUEUED | RUNNING | FAILED
  stale: "queued" | "lease" | "failed";
  tenantId: string;
  tenantName: string;
  roomId: string;
  roomTitle: string;
  attempts: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  ageMin: number;
};

export type QueueView = {
  running: number;
  queued: number;
  failed: number; // ล้มเหลวใน 24 ชม.
  costTodayMicro: number;
  items: QueueItem[];
};

/**
 * ภาพรวมคิว: นับ RUNNING · QUEUED · FAILED (24 ชม.) · ต้นทุนวันนี้ (ทุกร้าน)
 *   items = งานที่ต้องให้คนดู: QUEUED ที่รอเกิน 5 นาที · RUNNING ที่ lease หมดแล้ว · FAILED ใน 24 ชม. (ใหม่ก่อน ≤ 100)
 */
export async function listQueue(actor: PlatformUser, now?: Date): Promise<QueueView> {
  guard(actor);
  const at = okDate(now);
  const since24 = new Date(at.getTime() - DAY_MS);
  const staleBefore = new Date(at.getTime() - STALE_QUEUED_MS);
  const [running, queued, failed, cost, rows] = await Promise.all([
    prisma.aiRoomJob.count({ where: { status: "RUNNING" } }),
    prisma.aiRoomJob.count({ where: { status: "QUEUED" } }),
    prisma.aiRoomJob.count({ where: { status: "FAILED", updatedAt: { gte: since24 } } }),
    prisma.aiCreditTxn.aggregate({ where: { kind: "USAGE", createdAt: { gte: bkkDayStart(at) } }, _sum: { amountMicro: true } }),
    prisma.aiRoomJob.findMany({
      where: {
        OR: [
          { status: "QUEUED", createdAt: { lt: staleBefore } },
          { status: "RUNNING", leaseUntil: { lt: at } },
          { status: "FAILED", updatedAt: { gte: since24 } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100,
      include: { room: { select: { title: true } } },
    }),
  ]);
  const names = await tenantNames(rows.map((r) => r.tenantId));
  const items: QueueItem[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    stale: r.status === "FAILED" ? "failed" : r.status === "RUNNING" ? "lease" : "queued",
    tenantId: r.tenantId,
    tenantName: names.get(r.tenantId) ?? "—",
    roomId: r.roomId,
    roomTitle: r.room?.title ?? "—",
    attempts: attemptsInGen(r.attempts), // R-Z33: ครั้งที่ในรุ่นปัจจุบัน ◂
    error: r.error,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ageMin: Math.max(0, Math.floor((at.getTime() - r.createdAt.getTime()) / 60_000)),
  }));
  return { running, queued, failed, costTodayMicro: Math.abs(Number(cost._sum.amountMicro ?? 0) || 0), items };
}

export type OpsResult = { ok: true; note: string } | { ok: false; note: string };

/**
 * ลองใหม่: FAILED → QUEUED (error/lease/เวลาเริ่ม-จบ ล้าง) · สถานะอื่น = ไม่แตะ · ตัวรันรายนาทีหยิบเอง
 *   SEC S3a.1-S2 ▸ R-Z33: ไม่รีเซ็ต attempts เป็น 0 — ขึ้น "รุ่น" ถัดไป (`attempts` = รุ่น×100 · fence ไม่ย้อน) · ครบ 10 รุ่น = ลองใหม่ไม่ได้ ◂
 */
export async function retryJob(actor: PlatformUser, jobId: string): Promise<OpsResult> {
  const pu = guard(actor);
  const id = typeof jobId === "string" ? jobId.trim() : "";
  if (!id) return { ok: false, note: "ไม่พบงานนี้" };
  const cur = await prisma.aiRoomJob.findFirst({ where: { id, status: "FAILED" }, select: { attempts: true } });
  if (!cur) return { ok: false, note: "งานนี้ไม่ได้อยู่ในสถานะล้มเหลวแล้ว" };
  const nextGen = Math.floor(cur.attempts / ROOM_JOB_GEN) + 1;
  if (nextGen >= ROOM_JOB_MAX_GENS) return { ok: false, note: `งานนี้ถูกสั่งลองใหม่ครบ ${ROOM_JOB_MAX_GENS - 1} รอบแล้ว — ให้ร้านสั่งงานใหม่แทน` };
  const got = await prisma.aiRoomJob.updateMany({
    where: { id, status: "FAILED", attempts: cur.attempts },
    data: { status: "QUEUED", attempts: nextGen * ROOM_JOB_GEN, error: null, leaseUntil: null, startedAt: null, finishedAt: null },
  });
  if (got.count !== 1) return { ok: false, note: "งานนี้ไม่ได้อยู่ในสถานะล้มเหลวแล้ว" };
  await prisma.platformAuditLog.create({
    data: { platformUserId: pu.id, action: "secretary.job.retry", targetType: "AiRoomJob", targetId: id },
  });
  return { ok: true, note: "ส่งงานกลับเข้าคิวแล้ว — ตัวรันจะหยิบภายใน 1 นาที" };
}

/**
 * ยกเลิก: QUEUED → FAILED (error "cancelled by support") · DONE/FAILED ไม่แตะ
 *   SEC S3a.1-S1 R-Z2: RUNNING ที่ lease หมดแล้ว (ตัวรันตาย/ค้าง) ยกเลิกได้ด้วย · RUNNING ที่ lease ยังไม่หมด = กำลังรันจริง ไม่แตะ
 */
export async function cancelJob(actor: PlatformUser, jobId: string, now?: Date): Promise<OpsResult> {
  const pu = guard(actor);
  const id = typeof jobId === "string" ? jobId.trim() : "";
  if (!id) return { ok: false, note: "ไม่พบงานนี้" };
  const at = okDate(now);
  const got = await prisma.aiRoomJob.updateMany({
    where: { id, OR: [{ status: "QUEUED" }, { status: "RUNNING", leaseUntil: { lt: at } }] },
    data: { status: "FAILED", error: CANCELLED_BY_SUPPORT, leaseUntil: null, finishedAt: at },
  });
  if (got.count !== 1) return { ok: false, note: "ยกเลิกได้เฉพาะงานที่ยังรอคิว หรือที่ค้างจนหมดเวลาแล้ว" };
  await prisma.platformAuditLog.create({
    data: { platformUserId: pu.id, action: "secretary.job.cancel", targetType: "AiRoomJob", targetId: id },
  });
  return { ok: true, note: "ยกเลิกงานแล้ว" };
}

// ───────────── ต้นทุน ─────────────

export type TenantCost = { tenantId: string; tenantName: string; costMicro: number; txns: number; jobs: number };

/**
 * ต้นทุนต่อร้านของ `days` วันไทยล่าสุด (รวมวันนี้ · days=1 = วันนี้) — Σ|amountMicro| ของ USAGE · มากไปน้อย
 *   jobs = จำนวนงานห้องเลขา (AiRoomJob) ที่สร้างในช่วงเดียวกัน
 */
export async function costByTenant(actor: PlatformUser, days: number, now?: Date): Promise<TenantCost[]> {
  guard(actor);
  const at = okDate(now);
  const n = Math.min(Math.max(Math.floor(Number(days) || 1), 1), 90);
  const since = new Date(bkkDayStart(at).getTime() - (n - 1) * DAY_MS);
  const [cost, jobs] = await Promise.all([
    prisma.aiCreditTxn.groupBy({
      by: ["tenantId"],
      where: { kind: "USAGE", createdAt: { gte: since } },
      _sum: { amountMicro: true },
      _count: { _all: true },
    }),
    prisma.aiRoomJob.groupBy({ by: ["tenantId"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const jobsOf = new Map(jobs.map((j) => [j.tenantId, j._count._all]));
  const names = await tenantNames(cost.map((c) => c.tenantId));
  return cost
    .map((c) => ({
      tenantId: c.tenantId,
      tenantName: names.get(c.tenantId) ?? (c.tenantId.startsWith("__") ? "แพลตฟอร์ม" : "—"),
      costMicro: Math.abs(Number(c._sum.amountMicro ?? 0) || 0),
      txns: c._count._all,
      jobs: jobsOf.get(c.tenantId) ?? 0,
    }))
    .sort((a, b) => b.costMicro - a.costMicro || a.tenantId.localeCompare(b.tenantId));
}

export type AssistCapRow = { tenantId: string; tenantName: string; usedMicro: number; capMicro: number };

/**
 * ร้านที่ถึงเพดานต้นทุน assist ของวันนี้ (R-S1.13b/f: ไม่นับต้นทุนของห้องเลขา) — วิธีนับเดียวกับ `assistUsedMicroOfDay`
 *   แต่รวดเดียวทุกร้าน (groupBy tenantId+conversationId → ตัดห้องเลขา)
 */
export async function tenantsAtAssistCap(actor: PlatformUser, now?: Date): Promise<AssistCapRow[]> {
  guard(actor);
  const at = okDate(now);
  const start = bkkDayStart(at);
  const rows = await prisma.aiCreditTxn.groupBy({
    by: ["tenantId", "conversationId"],
    where: { kind: "USAGE", createdAt: { gte: start, lt: new Date(start.getTime() + DAY_MS) } },
    _sum: { amountMicro: true },
  });
  const convIds = [...new Set(rows.map((r) => r.conversationId).filter((c): c is string => typeof c === "string" && c.length > 0))];
  const roomConv = convIds.length
    ? new Set((await prisma.aiRoom.findMany({ where: { conversationId: { in: convIds } }, select: { conversationId: true } })).map((r) => r.conversationId))
    : new Set<string>();
  const used = new Map<string, number>();
  for (const r of rows) {
    if (r.conversationId && roomConv.has(r.conversationId)) continue;
    used.set(r.tenantId, (used.get(r.tenantId) ?? 0) + Math.abs(Number(r._sum.amountMicro ?? 0) || 0));
  }
  const cap = FREE_PACK.assistDailyMicro;
  const hit = [...used.entries()].filter(([tid, u]) => u >= cap && !tid.startsWith("__"));
  const names = await tenantNames(hit.map(([t]) => t));
  return hit
    .map(([tenantId, usedMicro]) => ({ tenantId, tenantName: names.get(tenantId) ?? "—", usedMicro, capMicro: cap }))
    .sort((a, b) => b.usedMicro - a.usedMicro);
}

// ───────────── ห้องงาน (อ่านอย่างเดียว) ─────────────

export type RoomReadOnly = {
  room: { id: string; tenantId: string; tenantName: string; title: string; startedById: string; closedAt: Date | null; createdAt: Date; conversationId: string };
  messages: { id: string; role: string; content: string; authorUserId: string | null; createdAt: Date }[];
  proposals: { id: string; kind: string; summary: string; status: string; resultNote: string | null; createdAt: Date }[];
  log: { id: string; kind: string; module: string; summary: string; userId: string; approverId: string | null; undoableUntil: Date | null; undoneAt: Date | null; createdAt: Date }[];
  jobs: { id: string; status: string; attempts: number; error: string | null; createdAt: Date }[];
};

/**
 * ห้องงานเลขา 1 ห้อง สำหรับทีมงาน (จอ H4 ของที่แนบ · G5 เปิดห้อง) — อ่านอย่างเดียว ไม่มีทางเขียน
 *   ข้อความ ≤ 200 ล่าสุด · ข้อเสนอ ≤ 50 · บันทึกการกระทำ ≤ 50 · งาน ≤ 20 · ไม่มีห้อง = null
 */
export async function roomForSupport(actor: PlatformUser, roomId: string): Promise<RoomReadOnly | null> {
  guard(actor);
  const id = typeof roomId === "string" ? roomId.trim() : "";
  if (!id) return null;
  const room = await prisma.aiRoom.findUnique({ where: { id } });
  if (!room) return null;
  const [tenant, msgs, proposals, log, jobs] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: room.tenantId }, select: { name: true } }),
    prisma.aiMessage.findMany({
      where: { tenantId: room.tenantId, conversationId: room.conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: { id: true, role: true, content: true, authorUserId: true, createdAt: true },
    }),
    prisma.aiProposal.findMany({
      where: { tenantId: room.tenantId, conversationId: room.conversationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, kind: true, summary: true, status: true, resultNote: true, createdAt: true },
    }),
    prisma.aiActionLog.findMany({
      where: { tenantId: room.tenantId, roomId: room.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { id: true, kind: true, module: true, summary: true, userId: true, approverId: true, undoableUntil: true, undoneAt: true, createdAt: true },
    }),
    prisma.aiRoomJob.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, status: true, attempts: true, error: true, createdAt: true },
    }),
  ]);
  return {
    room: {
      id: room.id,
      tenantId: room.tenantId,
      tenantName: tenant?.name ?? "—",
      title: room.title,
      startedById: room.startedById,
      closedAt: room.closedAt,
      createdAt: room.createdAt,
      conversationId: room.conversationId,
    },
    messages: msgs.reverse().map((m) => ({ ...m, role: String(m.role) })),
    proposals: proposals.map((p) => ({ ...p, status: String(p.status) })),
    log,
    jobs,
  };
}

/** ไมโครดอลลาร์ → ข้อความ "$0.12 · ฿4.32" (backoffice เท่านั้น) */
export function moneyOfMicro(micro: number, thbPerUsd: number): string {
  const usd = (Number(micro) || 0) / 1_000_000;
  const thb = usd * thbPerUsd;
  return `$${usd.toFixed(2)} · ฿${thb.toLocaleString("th-TH", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}
