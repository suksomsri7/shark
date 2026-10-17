// ai-brief.ts — สรุปเช้า POS (Daily Brief): ตัวโหลดข้อมูลต่อผู้รับ + งานส่งรายชั่วโมง (POS P3.9 ▸ R6–R10 · มติ 3 4 5 · CD-2 CD-3 CD-8 ◂)
//
// loadBriefInput(ctx, ผู้รับ, วันธุรกิจ) = เรียกตัวอ่านรายงานที่ export อยู่แล้วด้วย RegisterActor ของ "ผู้รับคนนั้น" (ไม่มี actor สังเคราะห์ · ไม่มี SQL ยอดขายใหม่)
//   ⇒ ขอบเขตสาขา + pos.report.view + pos.report.anomaly ของแต่ละคนถูกเคารพเอง · ส่วนที่ถูกปฏิเสธ = null (composeBrief ไม่แสดงบรรทัด ไม่ใช่ "0")
// sendPosDailyBriefs({now, deadline?, tenantId?, post?}) — เรียกจาก cron รายชั่วโมง (route) · ข้อสอบฉีด now/tenantId/post
//   ผู้รับ = เจ้าของร้าน (ทุกคนที่รับคำเชิญแล้ว) + ผู้จัดการที่เลือกไว้ (settings.pos.ai.brief.managerUserIds · ต้องยังเป็น MANAGER) · พนักงานไม่มีวันได้รับ
//   ส่งเมื่อชั่วโมงไทย ≥ brief.hourBkk ของวันนั้น (06:00 พลาด = ส่งตามหลังในวันเดียวกัน) · วันธุรกิจ = เมื่อวานตามเวลาตัดวันของระบบ
//   กันซ้ำ = pg_advisory_xact_lock('pos:brief:<system>:<date>') → มีแจ้งเตือนหัวเรื่องนี้ของผู้รับแล้ว = ข้าม → เขียน (route + crontab ยิงชนกัน = ใบเดียว)
//   ส่ง = AppNotification รายผู้รับ (recipientUserId ไม่ null เสมอ) + push เครื่องของผู้รับคนนั้น (best-effort · CD-3 ไม่มีช่วงเงียบของ POS) + อีเมลเมื่อเปิด
// 🔴 ไม่มี LLM (มติ 3) · ไม่มีข้อมูลเงินเดือน/ค่าคอมฯ พนักงาน · ไม่ import `@/lib/ai/*` (ห้องข้อเสนอนับจากรหัสห้อง u~<userId>~ ของผู้รับ)

import { logOps } from "@/lib/core/ops";
import { sendPushToUser } from "@/lib/core/push";
import { sendEmail } from "@/lib/core/email";
import { evaluate } from "@/lib/core/rbac";
import { prisma } from "./db";
import { composeBrief, briefTitle, type BriefInput, type BriefProduct } from "./ai-brief-shared";
import { posStockRisks } from "./ai-insights";
import { bkkBusinessDate, reportAnomalies, reportDailySales, reportHourly, reportProducts, reportShifts } from "./reports";
import type { RegisterActor, RegisterRole } from "./register-shared";
import { POS_ANOMALY_RULES, posAiSettings, posDayCutoffMinutes } from "./settings-shared";

const DAY_MS = 86_400_000;
const MAX_SYSTEMS = 200;
const DEFAULT_BUDGET_MS = 20_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const toStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** ตัวนับเสริมที่ผู้เรียกฉีดได้ (route ส่ง "คำขออนุมัติที่รอผู้รับคนนี้" ผ่านบริการอนุมัติกลาง · ไม่ส่ง = ส่วนนั้นไม่แสดง) */
export type BriefDeps = { pendingApprovals?: (tenantId: string, recipient: RegisterActor) => Promise<number | null> };

/**
 * POS P3.9 ▸ fix1 F5 (=N2 · CD-P39c): ชื่อระบบในสรุปเช้า — ร้านมี POS ชื่อซ้ำกัน ⇒ ต่อท้าย "(…<id 4 ตัวท้าย>)" ให้หัวเรื่อง (= คีย์กันซ้ำต่อผู้รับ) ไม่ชนข้ามระบบ ·
 *   ชื่อไม่ซ้ำ = ชื่อเดิม (AppNotification ไม่มีช่อง data — กันซ้ำด้วยหัวเรื่องที่มีชื่อระบบ + วันที่ · ไม่มี migration) ◂
 */
export async function posBriefSystemName(tenantId: string, sys: { id: string; name: string }): Promise<string> {
  const same = await prisma.appSystem.count({ where: { tenantId, type: "POS", name: sys.name, id: { not: sys.id } } });
  return same > 0 ? `${sys.name} (…${sys.id.slice(-4)})` : sys.name;
}

/** R6 R7 — ข้อมูลสรุปเช้าของผู้รับหนึ่งคน ณ วันธุรกิจหนึ่ง (YYYY-MM-DD) */
export async function loadBriefInput(ctx: { tenantId: string; systemId: string }, recipient: RegisterActor, businessDate: string, deps: BriefDeps = {}): Promise<BriefInput> {
  const sys = await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "POS" }, select: { name: true, settings: true } });
  const ai = posAiSettings(sys?.settings);
  const rc = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const day = { from: businessDate, to: businessDate };
  const [d, lw, pr, hr, sh, an] = await Promise.all([
    reportDailySales(rc, recipient, day),
    reportDailySales(rc, recipient, { from: addDays(businessDate, -7), to: addDays(businessDate, -7) }),
    reportProducts(rc, recipient, { ...day, limit: 1000 }),
    reportHourly(rc, recipient, day),
    reportShifts(rc, recipient, { ...day, limit: 1000 }),
    ai.anomalyInBrief ? reportAnomalies(rc, recipient, { ...day, limit: 1000 }) : Promise.resolve(null),
  ]);
  const dailyOf = (r: typeof d) => (r.ok === true ? { netSalesSatang: r.report.totals.netSalesSatang, billCount: r.report.totals.billCount, avgBillSatang: r.report.totals.avgBillSatang } : null);
  let topProducts: BriefProduct[] | null = null;
  let bottomProducts: BriefProduct[] | null = null;
  if (pr.ok === true) {
    const sold = pr.report.rows.filter((x) => x.qty >= 1);
    const top = sold.slice(0, 3);
    topProducts = top.map((x) => ({ name: x.name, qty: x.qty, salesSatang: x.salesSatang }));
    bottomProducts = sold
      .slice(3)
      .slice(-3)
      .reverse()
      .map((x) => ({ name: x.name, qty: x.qty, salesSatang: x.salesSatang }));
  }
  let peakHour: BriefInput["peakHour"] = null;
  if (hr.ok === true) {
    for (const h of hr.report.rows) if (h.netSalesSatang > 0 && (!peakHour || h.netSalesSatang > peakHour.netSalesSatang)) peakHour = { hour: h.hour, netSalesSatang: h.netSalesSatang };
  }
  const openShifts = sh.ok === true ? sh.report.totals.openCount : null;
  const overShort = sh.ok === true ? sh.report.rows.filter((x) => typeof x.overShortSatang === "number").map((x) => ({ label: x.deviceLabel ?? `กะ ${x.shiftNo}`, overShortSatang: x.overShortSatang as number })) : null;
  let anomalies: BriefInput["anomalies"] = null;
  if (an && an.ok === true) anomalies = POS_ANOMALY_RULES.map((rule) => ({ rule, count: an.report.totals.byRule[rule] ?? 0 })).filter((x) => x.count > 0);
  // ของหมด (86) ณ ตอนนี้ — สาขาที่ผู้รับดูรายงานได้เท่านั้น
  const units = await prisma.appSystemUnit.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, type: "POS" }, select: { unitId: true } });
  const viewUnits = units.map((u) => u.unitId).filter((u) => evaluate(recipient, { module: "pos", action: "pos.report.view", unitId: u }));
  let soldOut: BriefInput["soldOut"] = null;
  if (viewUnits.length) {
    const marks = await prisma.posAvailabilityMark.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: { in: viewUnits } }, select: { productId: true } });
    const ids = [...new Set(marks.map((m) => m.productId))];
    const names = ids.length ? await prisma.posProduct.findMany({ where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: ids } }, select: { name: true } }) : [];
    soldOut = [...new Set(names.map((n) => n.name))].sort().map((name) => ({ name }));
  }
  const risks = await posStockRisks(rc, recipient);
  const pendingProposals = recipient.userId
    ? await prisma.aiProposal.count({ where: { tenantId: ctx.tenantId, status: "PENDING", expiresAt: { gt: new Date() }, conversationId: { startsWith: `u~${recipient.userId}~` } } })
    : null;
  const pendingApprovals = deps.pendingApprovals ? await deps.pendingApprovals(ctx.tenantId, recipient).catch(() => null) : null;
  return {
    businessDate,
    systemName: sys ? await posBriefSystemName(ctx.tenantId, { id: ctx.systemId, name: sys.name }) : "", // POS P3.9 ▸ fix1 F5 ◂
    daily: dailyOf(d),
    lastWeek: dailyOf(lw),
    topProducts,
    bottomProducts,
    peakHour,
    openShifts,
    overShort,
    anomalies,
    stockRisks: risks ? risks.map((r) => ({ name: r.name, onHand: r.onHand, reorderPoint: r.reorderPoint })) : null,
    soldOut,
    pendingApprovals,
    pendingProposals,
  };
}

const bkkHour = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).getUTCHours();
const ROLES: readonly RegisterRole[] = ["OWNER", "MANAGER", "STAFF"];

export type SendBriefsResult = { ok: true; systems: number; sent: number; skipped: number; failed: number };
type PushPost = (payloads: unknown[]) => Promise<unknown[]>;

/**
 * R8 R9 — งานรายชั่วโมง: ส่งสรุปเช้าของทุกระบบ POS ที่เปิดผู้ช่วย AI (≤ 200 ระบบ/รอบ · งบเวลา 20 วิ · พังรายระบบ = logOps WARN แล้วไปต่อ)
 * `tenantId` = กรองร้าน (ข้อสอบ · CD-8) · `post` = ตัวส่ง push ที่ฉีดได้ (ส่งต่อให้ sendPushToUser)
 */
export async function sendPosDailyBriefs(opts: { now?: Date; deadline?: Date; tenantId?: string; post?: PushPost } & BriefDeps = {}): Promise<SendBriefsResult> {
  const now = opts.now instanceof Date && Number.isFinite(opts.now.getTime()) ? opts.now : new Date();
  const deadline = opts.deadline instanceof Date ? opts.deadline.getTime() : Date.now() + DEFAULT_BUDGET_MS;
  const res: SendBriefsResult = { ok: true, systems: 0, sent: 0, skipped: 0, failed: 0 };
  const all = await prisma.appSystem.findMany({
    where: { type: "POS", active: true, settings: { path: ["pos", "ai", "enabled"], equals: true }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_SYSTEMS,
    select: { id: true, tenantId: true, name: true, settings: true },
  });
  // เฉพาะระบบที่เปิดผู้ช่วย AI + ร้านที่ยังใช้งาน (ไม่มี relation tenant บน AppSystem ⇒ คิวรีที่สองแบบรายการ id)
  const on = all.filter((s) => posAiSettings(s.settings).enabled);
  const live = new Set(on.length ? (await prisma.tenant.findMany({ where: { id: { in: [...new Set(on.map((s) => s.tenantId))] }, status: "ACTIVE" }, select: { id: true } })).map((t) => t.id) : []);
  const systems = on.filter((s) => live.has(s.tenantId));
  for (const sys of systems) {
    if (Date.now() > deadline) break;
    const ai = posAiSettings(sys.settings);
    if (!ai.enabled || !ai.brief.enabled || bkkHour(now) < ai.brief.hourBkk) continue;
    res.systems += 1;
    try {
      const date = addDays(bkkBusinessDate(now, posDayCutoffMinutes(sys.settings)), -1);
      const title = briefTitle(await posBriefSystemName(sys.tenantId, sys), date, "th"); // POS P3.9 ▸ fix1 F5: ชื่อซ้ำ = มี id ท้าย ◂
      const ms = await prisma.membership.findMany({
        where: { tenantId: sys.tenantId, acceptedAt: { not: null }, OR: [{ role: "OWNER" }, { role: "MANAGER", userId: { in: ai.brief.managerUserIds } }] },
        select: { userId: true, role: true, unitAccess: true, permissions: true },
        orderBy: { userId: "asc" },
      });
      const recips = ms.filter((m) => ROLES.includes(m.role as RegisterRole) && m.role !== "STAFF");
      if (!recips.length) continue;
      // กันซ้ำรอบแรก (ไม่ล็อก): ผู้รับที่ได้แล้ว = ไม่ต้องคำนวณใหม่ · ตัวจริงคือด่านในธุรกรรมข้างล่าง
      const had = new Set(
        (await prisma.appNotification.findMany({ where: { tenantId: sys.tenantId, title, recipientUserId: { in: recips.map((r) => r.userId) } }, select: { recipientUserId: true } })).map((x) => x.recipientUserId),
      );
      const todo = recips.filter((r) => !had.has(r.userId));
      res.skipped += recips.length - todo.length;
      if (!todo.length) continue;
      const briefs: { userId: string; body: string; first: string }[] = [];
      for (const r of todo) {
        const actor: RegisterActor = { userId: r.userId, role: r.role as RegisterRole, unitAccess: toStrings(r.unitAccess), permissions: isRecord(r.permissions) ? r.permissions : {} };
        const input = await loadBriefInput({ tenantId: sys.tenantId, systemId: sys.id }, actor, date, { pendingApprovals: opts.pendingApprovals });
        const b = composeBrief(input, "th");
        // POS P3.9 ▸ fix1 F5: ทุกส่วนถูกปฏิเสธ (ไม่มีบรรทัด) = ไม่ส่งแจ้งเตือนเปล่า ◂
        if (b.lines.length === 0) {
          res.skipped += 1;
          continue;
        }
        briefs.push({ userId: r.userId, body: b.lines.join("\n"), first: b.lines[0] ?? title });
      }
      const created = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos:brief:${sys.id}:${date}`}))::text AS locked`;
        const exist = new Set(
          (await tx.appNotification.findMany({ where: { tenantId: sys.tenantId, title, recipientUserId: { in: briefs.map((b) => b.userId) } }, select: { recipientUserId: true } })).map((x) => x.recipientUserId),
        );
        const fresh = briefs.filter((b) => !exist.has(b.userId));
        for (const b of fresh) await tx.appNotification.create({ data: { tenantId: sys.tenantId, recipientUserId: b.userId, title, body: b.body } });
        return fresh;
      });
      res.skipped += briefs.length - created.length;
      res.sent += created.length;
      // นอกธุรกรรมเสมอ (เครือข่าย) · best-effort ห้ามทำรอบนี้ล้ม
      for (const b of created) {
        await sendPushToUser(b.userId, { title, body: b.first.slice(0, 120), data: { kind: "pos.brief", systemId: sys.id, businessDate: date } }, { tenantId: sys.tenantId, ...(opts.post ? { post: opts.post } : {}) }).catch(() => undefined);
      }
      if (ai.brief.email && created.length) {
        const users = await prisma.user.findMany({ where: { id: { in: created.map((b) => b.userId) } }, select: { id: true, email: true } });
        for (const b of created) {
          const to = users.find((u) => u.id === b.userId)?.email;
          if (to) await sendEmail(to, title, b.body).catch(() => undefined);
        }
      }
    } catch (e) {
      res.failed += 1;
      await logOps("WARN", "pos", `สรุปเช้า POS ส่งไม่สำเร็จ (ระบบ ${sys.id})`, { detail: e instanceof Error ? (e.stack ?? e.message) : String(e) }).catch(() => undefined);
    }
  }
  return res;
}
