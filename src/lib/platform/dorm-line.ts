// ─────────────────────────────────────────────────────────────
// platform/dorm-line.ts — ผู้เช่าหอผ่าน LINE · SVC D.9 · ใบสั่ง ledger/svc-briefs/svc-brief-d.9.md §3.2–§3.6
//   รหัสผูกห้อง (QR ในห้อง/ในสัญญา) · route postback `dorm.*` · rich menu 6 ช่อง · ส่งบิล (consumer dorm.billrun.sent) + งานส่งซ้ำ
//   · แนบสลิปจากรูปในแชท · Flex บิล
//
// 🔴 ตัวตน: ผูก Party ได้จาก "รหัสผูกห้องที่พนักงานออก" เท่านั้น (resolveDormParty = Party ของสัญญา live ที่พนักงานสร้าง)
//    ห้ามผูก/เดาตัวตนจากเบอร์ ชื่อ รูป หรือชื่อผู้โอน (บทเรียน B.9 BLOCKER)
// 🔴 สัญญาของผู้กด/ผู้ส่ง = สัญญา live ของร้าน ctx ที่ partyId = Party ของแถวผู้ติดต่อ (ctx จาก webhook) และ OA ของหน่วย = ctx.connectionId
//    ไม่ใช่เจ้าของทุกกรณี ⇒ ข้อความกลางเดียวทุกไบต์ (X7) และไม่เขียนอะไร
// 🔴 ส่งบิลอ่านสถานะสดทุกครั้ง (บทเรียน D.8 F1 / D.11 L1 — ไม่เชื่อ payload ของ event) · ยอดในข้อความ = ค้างสด
//    ส่งผ่าน notifyCustomer เท่านั้น (OA ของหน่วย · เวลาเงียบ · ยินยอม · dedupe `rooms:bill:<billId>`)
// 🔴 สลิปจากแชท: แนบเฉพาะเมื่อชัดเจน (บิลเปิดใบเดียวของผู้ส่ง) · กำกวม ⇒ ไม่แนบ ตอบลิงก์ให้เลือกเอง (มติผู้คุม Q2)
// 🔴 ไม่ส่ง LINE ตรง · ไม่ import prisma ดิบ · ค่านโยบายจากทะเบียนค่าตั้ง · ไม่มีคำต้องห้าม สคบ. · ไม่ log เนื้อ/เบอร์/ชื่อ
// ─────────────────────────────────────────────────────────────
import QRCode from "qrcode";
import { tenantDb } from "@/lib/core/db";
import { bkkYmd, inQuietWindow } from "@/lib/core/quiet-hours";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings, resolveSettingsMany } from "@/lib/core/settings";
import { fetchLineMessageContent, issueLinkCode, syncRichMenu, type RichMenuSpec } from "@/lib/modules/chat";
import {
  dormStaffGate,
  portalActiveUnitIds,
  portalBaht,
  portalBillForSend,
  portalBillLiveState,
  portalCanonicalParty,
  portalLeaseBills,
  portalLeaseOfUnit,
  portalLiveLease,
  portalLiveLeasesOfParty,
  portalPartyName,
  type PortalBillRow,
  type PortalLeaseRow,
} from "@/lib/modules/dorm";
import { callIntegration, getIntegration } from "@/lib/core/integrations";
import { receiverFor } from "@/lib/payment/receiver";
import { canonTransRef, submitSlip } from "@/lib/payment/slip-verify";
import { notifyCustomer } from "@/lib/platform/notify-customer";
import { portalUrl } from "@/lib/platform/dorm-portal";
import { LINK_FAILED_TEXT, LINK_OK_TEXT } from "@/lib/platform/postback-routes";
import type { LinkedInfo, PostbackCtx, PostbackEvent, PostbackReply } from "@/lib/platform/postback-routes";
import { DORM_RICHMENU_PNG_BASE64 } from "@/lib/platform/dorm-richmenu-image";

/** ข้อความกลาง (X7) — ไม่บอกว่ามีห้อง/สัญญาอยู่ไหม */
export const DORM_POSTBACK_NOT_FOUND = "ไม่พบข้อมูลห้องของคุณ — ติดต่อหอทางแชทนี้ได้เลย";
export const DORM_MENU: readonly { action: "bills" | "repair" | "announce" | "lease" | "parcel" | "contact"; labelTh: string }[] = [
  { action: "bills", labelTh: "บิลของฉัน" },
  { action: "repair", labelTh: "แจ้งซ่อม" },
  { action: "announce", labelTh: "ประกาศ" },
  { action: "lease", labelTh: "สัญญา/เอกสาร" },
  { action: "parcel", labelTh: "พัสดุ" },
  { action: "contact", labelTh: "ติดต่อหอ" },
] as const;

const T = {
  NOT_FOUND: "ไม่พบหอ สัญญา หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการ",
  BAD_STATE: "สัญญานี้ไม่อยู่ในสถานะที่ผูก LINE ได้ (สิ้นสุด · ยกเลิก หรือเลยวันจบสัญญาแล้ว)",
  NOT_CONFIGURED: "หอนี้ยังไม่ได้ตั้ง LINE OA สำหรับแจ้งผู้เช่า — ตั้งที่หน้าตั้งค่าข้อความของสาขา",
  ISSUE_FAILED: "ออกรหัสผูก LINE ไม่สำเร็จ — ลองใหม่อีกครั้ง",
  DISABLED: "ปิดการตั้งเมนูล่าง LINE ของหอไว้ในหน้าตั้งค่า",
  SHARED_OA: "LINE OA นี้ใช้ร่วมกับสาขาอื่นของร้าน — ไม่ตั้งเมนูหอเพื่อไม่ทับเมนูของสาขาอื่น",
  SEND_FAILED: "ตั้งเมนู LINE ไม่สำเร็จ — ลองใหม่อีกครั้ง",
  STAFF_REPLY: "พิมพ์รายละเอียดเรื่องที่ต้องการแจ้งในแชทนี้ได้เลย พนักงานของหอจะเห็นข้อความในแชทนี้",
  REPAIR: "แจ้งซ่อม: พิมพ์คำว่า \"แจ้งซ่อม\" ตามด้วยห้องและอาการในแชทนี้ พนักงานของหอจะเห็นข้อความในแชทนี้",
} as const;

const MAX_LEASE_LINKS = 5;
const DAY_MIN = 1440;
const RESEND_WINDOW_MS = 3 * 86_400_000;
const BILL_KEY_PREFIX = "rooms:bill:";
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MESSAGE_ID_RE = /^\d{1,32}$/;
const SENTISH = new Set(["SENT", "PARTIALLY_PAID", "PAID"]);

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const nowOf = (d: Date | undefined): Date => (d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date());
const NF = (): PostbackReply => ({ text: DORM_POSTBACK_NOT_FOUND });
const errName = (e: unknown) => (e instanceof Error ? e.name : "error");

async function unitLine(tenantId: string, unitId: string): Promise<string | null> {
  const s = await resolveSettings({ tenantId }, ["messaging.lineConnectionId"], { unitId });
  const v = s["messaging.lineConnectionId"]?.value;
  return typeof v === "string" && v ? v : null;
}

/** OA ของหลายหน่วย (คิวรีชุดเดียว) */
async function linesOfUnits(tenantId: string, unitIds: string[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(unitIds)];
  const out = new Map<string, string | null>();
  if (!ids.length) return out;
  const rs = await resolveSettingsMany({ tenantId }, ["messaging.lineConnectionId"], ids.map((unitId) => ({ unitId })));
  ids.forEach((id, i) => {
    const v = rs[i]?.["messaging.lineConnectionId"]?.value;
    out.set(id, typeof v === "string" && v ? v : null);
  });
  return out;
}

/** สัญญา live ของผู้ติดต่อ (Party จากแถวผู้ติดต่อ · OA ของหน่วย = OA ที่ผู้ติดต่ออยู่) */
async function myLeases(ctx: PostbackCtx, now: Date): Promise<PortalLeaseRow[]> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.connectionId) || !isStr(ctx.partyId)) return [];
  const leases = await portalLiveLeasesOfParty(ctx.tenantId, ctx.partyId, bkkYmd(now));
  if (!leases.length) return [];
  const oa = await linesOfUnits(ctx.tenantId, leases.map((l) => l.unitId));
  return leases.filter((l) => l.tenantId === ctx.tenantId && oa.get(l.unitId) === ctx.connectionId); // Party เทียบแบบ canonical ในคิวรีแล้ว (W13)
}

const svgDataUrl = async (text: string): Promise<string> => {
  const svg = await QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
};

// ───────────────────────── §3.2 รหัสผูกห้อง ─────────────────────────

export async function issueDormLinkCode(
  ctx: { tenantId: string; actorUserId: string },
  i: { unitId: string; leaseId: string },
  opts?: { now?: Date },
): Promise<
  | { ok: true; code: string; deepLink: string | null; expiresAt: Date; qrSvgDataUrl: string }
  | { ok: false; code: "NOT_FOUND" | "BAD_STATE" | "NOT_CONFIGURED"; reason: string }
> {
  try {
    const now = nowOf(opts?.now);
    const g = await dormStaffGate(ctx, isRec(i) ? i.unitId : null, "dorm.lease.manage");
    if (!g) return { ok: false, code: "NOT_FOUND", reason: T.NOT_FOUND };
    const l = await portalLeaseOfUnit(g.tenantId, g.unitId, isRec(i) && isStr(i.leaseId) ? i.leaseId : "", bkkYmd(now));
    if (!l) return { ok: false, code: "NOT_FOUND", reason: T.NOT_FOUND };
    if (!l.live) return { ok: false, code: "BAD_STATE", reason: T.BAD_STATE };
    const connectionId = await unitLine(g.tenantId, g.unitId);
    if (!connectionId) return { ok: false, code: "NOT_CONFIGURED", reason: T.NOT_CONFIGURED };
    const s = await resolveSettings({ tenantId: g.tenantId }, ["rooms.notify.linkCodeDays"], { unitId: g.unitId });
    const dv = s["rooms.notify.linkCodeDays"]?.value;
    const days = typeof dv === "number" && Number.isInteger(dv) && dv >= 1 ? dv : 1;
    const r = await issueLinkCode({ tenantId: g.tenantId }, { purpose: "DORM_LEASE", refId: l.id, ttlMin: days * DAY_MIN, connectionId });
    if (!r.ok) return { ok: false, code: "NOT_CONFIGURED", reason: r.error === "NOT_FOUND" ? T.NOT_CONFIGURED : T.ISSUE_FAILED };
    // รหัสคืนครั้งเดียว — ไม่ log/audit
    return { ok: true, code: r.code, deepLink: r.deepLink, expiresAt: r.expiresAt, qrSvgDataUrl: await svgDataUrl(r.deepLink ?? r.code) };
  } catch (e) {
    console.error("[dorm.line] issue", errName(e));
    return { ok: false, code: "NOT_CONFIGURED", reason: T.ISSUE_FAILED };
  }
}

/** ref ของรหัส DORM_LEASE → Party ของสัญญา live ของร้านนี้ (Party ที่พนักงานสร้างตอนทำสัญญา) · อื่น ⇒ null */
export async function resolveDormParty(ctx: { tenantId: string }, a: { purpose: string; refId: string }): Promise<string | null> {
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !isRec(a) || a.purpose !== "DORM_LEASE" || !isStr(a.refId)) return null;
    const l = await portalLiveLease(ctx.tenantId, a.refId, bkkYmd(new Date()));
    return l && l.tenantId === ctx.tenantId ? await portalCanonicalParty(ctx.tenantId, l.partyId) : null;
  } catch {
    return null;
  }
}

export async function onDormLinked(ctx: PostbackCtx, a: LinkedInfo, opts?: { now?: Date }): Promise<PostbackReply> {
  if (!isRec(a) || !isStr(a.resolvedPartyId)) return { text: LINK_FAILED_TEXT }; // สัญญาจบ/ไม่ใช่ของร้าน = เหมือนรหัสผิด
  if (a.partyMismatch) return { text: LINK_OK_TEXT };
  try {
    const now = nowOf(opts?.now);
    if (!isRec(ctx) || !isStr(ctx.tenantId) || a.purpose !== "DORM_LEASE") return { text: LINK_OK_TEXT };
    const l = await portalLiveLease(ctx.tenantId, a.refId, bkkYmd(now));
    if (!l || (await portalCanonicalParty(ctx.tenantId, l.partyId)) !== (await portalCanonicalParty(ctx.tenantId, a.resolvedPartyId))) return { text: LINK_OK_TEXT };
    const url = await portalUrl({ tenantId: ctx.tenantId }, { leaseId: l.id }, { now });
    return { text: `ผูก LINE กับห้อง ${l.roomNumber} ${l.unitName} เรียบร้อยแล้ว${url ? ` · ดูบิลและจ่ายค่าเช่าได้ที่ ${url}` : ""} · กดเมนูด้านล่างเพื่อดูบิล สัญญา หรือส่งเรื่องถึงหอ` };
  } catch {
    return { text: LINK_OK_TEXT };
  }
}

// ───────────────────────── §3.3 postback ─────────────────────────

async function leaseLinksText(ctx: PostbackCtx, leases: PortalLeaseRow[], now: Date, suffix: "" | "/lease"): Promise<string> {
  const rows: string[] = [];
  for (const l of leases.slice(0, MAX_LEASE_LINKS)) {
    const url = await portalUrl({ tenantId: ctx.tenantId }, { leaseId: l.id }, { now });
    if (url) rows.push(`ห้อง ${l.roomNumber} · ${l.unitName}\n${url}${suffix}`);
  }
  return rows.join("\n\n");
}

export async function onDormPostback(ctx: PostbackCtx, evt: PostbackEvent, opts?: { now?: Date }): Promise<PostbackReply> {
  const now = nowOf(opts?.now);
  const action = isRec(evt) && typeof evt.action === "string" ? evt.action : "";
  if (!DORM_MENU.some((m) => m.action === action)) return NF();
  const leases = await myLeases(ctx, now);
  if (!leases.length) return NF();
  switch (action) {
    case "bills": {
      const t = await leaseLinksText(ctx, leases, now, "");
      return t ? { text: `บิลของฉัน — เปิดลิงก์เพื่อดูยอดและจ่ายด้วยพร้อมเพย์\n\n${t}` } : NF();
    }
    case "lease": {
      const t = await leaseLinksText(ctx, leases, now, "/lease");
      return t ? { text: `สัญญาและเอกสารของห้อง\n\n${t}` } : NF();
    }
    case "contact": {
      const names = [...new Set(leases.map((l) => l.unitName))].join(" · ");
      return { text: `ติดต่อ ${names} ได้ทางแชทนี้เลย พิมพ์เรื่องที่ต้องการ พนักงานของหอจะเห็นข้อความในแชทนี้` };
    }
    case "repair": // W3: บอกให้พิมพ์ "แจ้งซ่อม" ก่อน (ไม่ชวนส่งรูปลอย ๆ มาในแชทที่แนบสลิปอัตโนมัติ) — จนถึง D.16
      return { text: T.REPAIR };
    // SVC D.18 ▸ พัสดุที่รอรับของผู้กด (สัญญา live ของผู้กดเท่านั้น · ≤ 5 รายการ · ลิงก์ QR รับพัสดุ) — อ่านล้วน ไม่เขียน log/audit ·
    //   ไม่มีชื่อ/เบอร์ · หน่วยของผู้กดปิดระบบพัสดุทั้งหมด ⇒ ข้อความคงที่เดิม ◂
    case "parcel": {
      const r = await (await import("@/lib/modules/dorm")).parcelsForLeases({ tenantId: ctx.tenantId }, leases, { now });
      if (!r.enabled) return { text: T.STAFF_REPLY };
      if (!r.items.length) return { text: "ยังไม่มีพัสดุรอรับที่หอ — เมื่อหอรับพัสดุของคุณไว้ จะแจ้งทางแชทนี้พร้อมลิงก์ QR สำหรับรับของ" };
      const t = r.items.map((x) => `ห้อง ${x.roomNumber}\n${x.url}`).join("\n\n");
      return { text: `พัสดุรอรับ — เปิดลิงก์แล้วแสดง QR ให้พนักงานตอนรับของ\n\n${t}` };
    }
    // ◂ SVC D.18
    case "announce": // SVC D.17 ▸ ประกาศที่สัญญาของผู้กดเห็น ≤ 3 ฉบับ (ลิงก์หน้าประกาศของสัญญาตัวเอง) · ไม่เขียนอะไร ◂
      return (await import("./dorm-announce")).dormAnnounceMenuReply({ tenantId: ctx.tenantId }, leases, { now });
    default: // ไม่รู้จัก ⇒ ข้อความกลาง (SVC D.17 + D.18 ลงครบแล้ว)
      return { text: T.STAFF_REPLY };
  }
}

// ───────────────────────── §3.4 rich menu + Flex ─────────────────────────

const MENU_W = 2500;
const MENU_H = 1686;
export function dormRichMenuSpec(): RichMenuSpec {
  const cols = [0, 833, 1666, MENU_W];
  const rows = [0, 843, MENU_H];
  const areas = DORM_MENU.map((m, idx) => {
    const c = idx % 3;
    const r = Math.floor(idx / 3);
    return {
      bounds: { x: cols[c]!, y: rows[r]!, width: cols[c + 1]! - cols[c]!, height: rows[r + 1]! - rows[r]! },
      action: { type: "postback" as const, data: `dorm.${m.action}`, displayText: m.labelTh },
    };
  });
  return {
    name: "shark-dorm-menu-v1",
    chatBarText: "เมนูหอ",
    size: { width: MENU_W, height: MENU_H },
    areas,
    image: { contentType: "image/png", data: Uint8Array.from(Buffer.from(DORM_RICHMENU_PNG_BASE64, "base64")) },
    selected: true,
  };
}

export async function syncDormRichMenu(
  ctx: { tenantId: string; actorUserId: string },
  i: { unitId: string },
): Promise<{ ok: true; richMenuId: string; created: boolean } | { ok: false; code: "NOT_FOUND" | "DISABLED" | "NOT_CONFIGURED" | "SHARED_OA" | "SEND_FAILED"; reason: string }> {
  try {
    const g = await dormStaffGate(ctx, isRec(i) ? i.unitId : null, "dorm.settings.edit");
    if (!g) return { ok: false, code: "NOT_FOUND", reason: T.NOT_FOUND };
    const s = await resolveSettings({ tenantId: g.tenantId }, ["rooms.notify.richMenu", "messaging.lineConnectionId"], { unitId: g.unitId });
    if (s["rooms.notify.richMenu"]?.value !== true) return { ok: false, code: "DISABLED", reason: T.DISABLED };
    const cv = s["messaging.lineConnectionId"]?.value;
    const connectionId = typeof cv === "string" && cv ? cv : null;
    if (!connectionId) return { ok: false, code: "NOT_CONFIGURED", reason: T.NOT_CONFIGURED };
    // Q3: OA นี้ถูกหน่วยอื่นของร้านใช้อยู่ ⇒ ไม่ตั้ง (ไม่ทับเมนูของหน่วยอื่น)
    const others = (await portalActiveUnitIds(g.tenantId)).filter((u) => u !== g.unitId);
    const oa = await linesOfUnits(g.tenantId, others);
    if ([...oa.values()].some((v) => v === connectionId)) return { ok: false, code: "SHARED_OA", reason: T.SHARED_OA };
    const r = await syncRichMenu({ tenantId: g.tenantId }, connectionId, dormRichMenuSpec());
    if (r.ok) return { ok: true, richMenuId: r.richMenuId, created: r.created };
    if (r.code === "NO_CONNECTION") return { ok: false, code: "NOT_CONFIGURED", reason: T.NOT_CONFIGURED };
    return { ok: false, code: "SEND_FAILED", reason: T.SEND_FAILED };
  } catch (e) {
    console.error("[dorm.line] richmenu", errName(e));
    return { ok: false, code: "SEND_FAILED", reason: T.SEND_FAILED };
  }
}

/** เงินแบบไม่มีสัญลักษณ์ "4,800.00" / "-200.00" */
function money(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${satang < 0 ? "-" : ""}${Math.trunc(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
}
const httpsOnly = (u: unknown): string | null => (typeof u === "string" && u.startsWith("https://") && u.length <= 1000 ? u : null);
const cut = (s: string, n: number) => Array.from(s).slice(0, n).join("");

/** Flex บิลตามภาพ 05ก — ปุ่ม uri https เท่านั้น (ไม่มี postback) · ยอด = ที่ผู้เรียกให้ (ค้างสด) */
export function dormBillFlex(v: {
  unitName: string;
  roomNumber: string;
  periodLabel: string;
  dueLabel: string;
  lines: { labelTh: string; detail: string | null; amountSatang: number }[];
  amountSatang: number;
  payUrl: string;
  detailUrl: string;
}): Record<string, unknown> {
  const lines = (Array.isArray(v?.lines) ? v.lines : []).slice(0, 12).map((l) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: cut(l.detail ? `${l.labelTh} ${l.detail}` : l.labelTh, 60) || "-", size: "sm", color: "#525252", flex: 3, wrap: true },
      { type: "text", text: money(l.amountSatang), size: "sm", color: "#0a0a0a", align: "end", flex: 2 },
    ],
  }));
  const buttons: Record<string, unknown>[] = [];
  const pay = httpsOnly(v?.payUrl);
  const detail = httpsOnly(v?.detailUrl);
  if (pay) buttons.push({ type: "button", style: "primary", color: "#0a0a0a", height: "sm", action: { type: "uri", label: "จ่ายด้วยพร้อมเพย์", uri: pay } });
  if (detail) buttons.push({ type: "button", style: "secondary", height: "sm", action: { type: "uri", label: "ดูรายละเอียด", uri: detail } });
  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: cut(`บิลค่าเช่า · ห้อง ${v?.roomNumber ?? ""}`, 60), size: "xs", color: "#737373" },
        { type: "text", text: cut(`รอบ ${v?.periodLabel ?? ""}`, 60), size: "lg", weight: "bold", color: "#0a0a0a" },
        { type: "separator" },
        ...(lines.length ? [{ type: "box", layout: "vertical", spacing: "sm", contents: lines }, { type: "separator" }] : []),
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: "ยอดชำระ", weight: "bold", size: "md", color: "#0a0a0a" },
            { type: "text", text: portalBaht(Number.isFinite(v?.amountSatang) ? v.amountSatang : 0), weight: "bold", size: "md", align: "end", color: "#0a0a0a" },
          ],
        },
        { type: "text", text: cut(`ครบกำหนด ${v?.dueLabel ?? ""}`, 60), size: "xs", color: "#737373" },
        { type: "text", text: cut(v?.unitName ?? "", 60) || "-", size: "xxs", color: "#a3a3a3" },
      ],
    },
  };
  if (buttons.length) bubble.footer = { type: "box", layout: "vertical", spacing: "sm", contents: buttons };
  return bubble;
}

// ───────────────────────── §3.5 ส่งบิล + ส่งซ้ำ ─────────────────────────

export type DormBillSendStatus =
  | "SENT"
  | "SKIPPED_CONSENT"
  | "SKIPPED_QUIET"
  | "NO_CHANNEL"
  | "FAILED"
  | "SENDING"
  | "NOT_FOUND"
  | "DISABLED"
  | "PAID"
  | "LEASE_ENDED"
  | "BILL_VOID";
type SendResult = { status: DormBillSendStatus; dedupeKey: string | null; duplicate: boolean; amountSatang: number | null };
const early = (status: DormBillSendStatus, amountSatang: number | null = null): SendResult => ({ status, dedupeKey: null, duplicate: false, amountSatang });

/** บรรทัด Flex = บรรทัดบิล + ใบลด(ติดลบ)/เพิ่มหนี้ + ที่ชำระแล้ว(ติดลบ) ⇒ รวม = ค้างสด */
function flexLines(b: PortalBillRow): { labelTh: string; detail: string | null; amountSatang: number }[] {
  const out = b.lines.map((l) => ({ labelTh: l.labelTh, detail: l.detail, amountSatang: l.amountSatang }));
  for (const a of b.adjustments) out.push({ labelTh: a.kind === "CREDIT" ? "ใบลดหนี้" : "ใบเพิ่มหนี้", detail: a.docNo, amountSatang: a.kind === "CREDIT" ? -a.amountSatang : a.amountSatang });
  if (b.paidSatang > 0) out.push({ labelTh: "ชำระแล้ว", detail: null, amountSatang: -b.paidSatang });
  return out;
}

/** ส่งบิลหนึ่งใบถึงผู้เช่า — อ่านสดทุกครั้ง · คืนข้อแรกที่เข้า · ไม่ throw */
export async function sendDormBill(ctx: { tenantId: string }, i: { billId: string }, opts?: { now?: Date }): Promise<SendResult> {
  const now = nowOf(opts?.now);
  try {
    const tenantId = isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : "";
    const billId = isRec(i) && isStr(i.billId) ? i.billId : "";
    if (!tenantId || !ID_RE.test(billId)) return early("NOT_FOUND");
    const b = await portalBillForSend(tenantId, billId);
    if (!b) return early("NOT_FOUND");
    if (b.status === "VOID") return early("BILL_VOID");
    if (!SENTISH.has(b.status)) return early("NOT_FOUND"); // DRAFT/HELD
    if (!b.hasDoc) return early("BILL_VOID");
    const lease = await portalLiveLease(tenantId, b.leaseId, bkkYmd(now));
    if (!lease || lease.unitId !== b.unitId) return early("LEASE_ENDED");
    const s = await resolveSettings({ tenantId }, ["rooms.billing.sendChannels"], { unitId: lease.unitId, leaseId: lease.id });
    const ch = s["rooms.billing.sendChannels"]?.value;
    if (!Array.isArray(ch) || !ch.some((x) => x === "LINE" || x === "SMS")) return early("DISABLED");
    const [bill] = await portalLeaseBills(tenantId, lease, { only: [b.id] });
    if (!bill) {
      // สถานะเปลี่ยนระหว่างทาง (เช่น VOID หลังอ่านครั้งแรก) ⇒ ตอบตามสถานะสด
      const again = await portalBillForSend(tenantId, b.id);
      return early(again?.status === "VOID" ? "BILL_VOID" : "NOT_FOUND");
    }
    const outstanding = bill.outstandingSatang;
    if (outstanding <= 0) return early("PAID", 0); // จ่ายก่อนข้อความออก = ไม่ทวงคนที่จ่ายแล้ว
    const url = await portalUrl({ tenantId }, { leaseId: lease.id, billId: bill.id }, { now });
    const tenantName = (await portalPartyName(tenantId, lease.partyId)) ?? "";
    const dedupeKey = `${BILL_KEY_PREFIX}${bill.id}`;
    const r = await notifyCustomer(
      { tenantId },
      {
        unitId: lease.unitId,
        domain: "rooms",
        messageKey: "bill",
        partyId: lease.partyId,
        vars: { tenantName, roomNo: lease.roomNumber, unitName: lease.unitName, period: bill.periodLabel, amount: portalBaht(outstanding), dueDate: bill.dueLabel, payLink: url },
        flex: dormBillFlex({
          unitName: lease.unitName,
          roomNumber: lease.roomNumber,
          periodLabel: bill.periodLabel,
          dueLabel: bill.dueLabel,
          lines: flexLines(bill),
          amountSatang: outstanding,
          payUrl: url,
          detailUrl: url,
        }),
        dedupeKey,
        at: now,
        // W2: อ่านสดอีกรอบหลังอ้างสิทธิ์ก่อนส่ง (VOID · ปิดสัญญา · ปิดช่องทาง · จ่ายครบ ระหว่างทาง ⇒ ไม่ส่ง)
        precheck: () => billStillSendable(tenantId, bill.id, now),
      },
    );
    if (r.precheckFailed) {
      const st = PRECHECK_STATUS.has(r.precheckFailed) ? (r.precheckFailed as DormBillSendStatus) : "FAILED";
      return { status: st, dedupeKey, duplicate: r.duplicate === true, amountSatang: st === "PAID" ? 0 : outstanding };
    }
    return { status: r.status, dedupeKey, duplicate: r.duplicate === true, amountSatang: outstanding };
  } catch (e) {
    console.error("[dorm.line] send", errName(e));
    return early("FAILED");
  }
}

const PRECHECK_STATUS = new Set<string>(["NOT_FOUND", "BILL_VOID", "LEASE_ENDED", "DISABLED", "PAID"]);
/** W2 ▸ precheck ของ notifyCustomer: สถานะบิล + สัญญา live + ยอดค้างสด (คิวรีเดียว) + ช่องทางส่งบิล (ค่าตั้ง ณ ตอนนี้) */
async function billStillSendable(tenantId: string, billId: string, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  const st = await portalBillLiveState(tenantId, billId, bkkYmd(now));
  if (!st) return { ok: false, reason: "NOT_FOUND" };
  if (st.status === "VOID" || (SENTISH.has(st.status) && !st.hasDoc)) return { ok: false, reason: "BILL_VOID" };
  if (!SENTISH.has(st.status)) return { ok: false, reason: "NOT_FOUND" };
  if (!st.leaseLive) return { ok: false, reason: "LEASE_ENDED" };
  const s = await resolveSettings({ tenantId }, ["rooms.billing.sendChannels"], { unitId: st.unitId, leaseId: st.leaseId });
  const ch = s["rooms.billing.sendChannels"]?.value;
  if (!Array.isArray(ch) || !ch.some((x) => x === "LINE" || x === "SMS")) return { ok: false, reason: "DISABLED" };
  if (st.outstandingSatang <= 0) return { ok: false, reason: "PAID" };
  return { ok: true };
}

/** consumer ของ dorm.billrun.sent (D.8) — ไม่ throw (ข้อความล้มไม่ทำให้ event ล้ม · ส่งซ้ำผ่าน runDormLineJobs) */
export async function onDormBillSent(evt: { id: string; tenantId: string; type: string; payload: unknown; unitId: string | null }): Promise<void> {
  try {
    if (!isRec(evt) || evt.type !== "dorm.billrun.sent" || !isStr(evt.tenantId)) return;
    const p = isRec(evt.payload) ? evt.payload : {};
    if (!isStr(p.billId)) return;
    await sendDormBill({ tenantId: evt.tenantId }, { billId: p.billId });
  } catch (e) {
    console.error("[dorm.line] billrun.sent", errName(e));
  }
}

/** W5 ▸ ส่งซ้ำ FAILED ได้ไม่เกินเท่านี้ต่อบิล (ค่าคงที่ความปลอดภัย · หนี้: ย้ายเป็นค่าตั้งเมื่อมีคอลัมน์นับครั้งใน ServiceMessageLog) */
const FAILED_RETRY_MAX = 3;

/**
 * งานส่งซ้ำ (minute-job dorm.line ทุก 5 นาที) — W5 มีขอบเขต:
 *   • เฉพาะบิลที่ส่งจริงภายใน 3 วันที่ผ่านมา — เวลาส่ง = max(DormBill.sentAt, เวลาที่รอบส่งยิง event dorm.billrun.sent จริง)
 *     (ไม่ใช่ `at` ของ log ซึ่งเลื่อนทุกครั้งที่ลองใหม่) · sentAt ของ D.8 = วันทำการที่ผู้เรียกให้ · event = นาฬิกาจริงของรอบส่ง · บิล VOID/PAID ถูกกรองในคิวรีเดียวก่อน
 *   • SKIPPED_QUIET ⇒ ข้ามจนพ้นเวลาเงียบของหน่วย · FAILED ⇒ ลองซ้ำได้ ≤ FAILED_RETRY_MAX ครั้งต่อบิล (นับบนถังนับร่วม)
 *   • ส่งผ่าน sendDormBill (อ่านสดอีกรอบ + precheck) · ซ้อนกันกี่ทาง = ข้อความเดียว (dedupe ของ notifyCustomer)
 */
export async function runDormLineJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<{ resent: number }> {
  const t0 = Date.now();
  const out = { resent: 0 };
  const budget = typeof opts?.budgetMs === "number" && opts.budgetMs > 0 ? opts.budgetMs : 120_000;
  const left = () => (opts?.signal?.aborted ? 0 : budget - (Date.now() - t0));
  const at = nowOf(now);
  const tid = isStr(opts?.tenantId) ? opts.tenantId : null;
  try {
    const since = new Date(at.getTime() - RESEND_WINDOW_MS);
    const raw = tenantDb({ tenantId: tid ?? "platform-global-read" });
    type Row = { tenantId: string; unitId: string; billId: string; status: string };
    const rows = tid
      ? await raw.$queryRaw<Row[]>`
          SELECT s."tenantId", b."unitId", b."id" AS "billId", s."status" FROM "ServiceMessageLog" s
          JOIN "DormBill" b ON b."tenantId" = s."tenantId" AND s."dedupeKey" = ('rooms:bill:' || b."id")
          LEFT JOIN "OutboxEvent" e ON e."tenantId" = b."tenantId" AND e."idempotencyKey" = ('dorm.billrun.sent:' || b."id")
          WHERE s."tenantId" = ${tid} AND s."domain" = 'rooms' AND s."messageKey" = 'bill' AND s."status" IN ('SKIPPED_QUIET', 'FAILED')
            AND b."status" IN ('SENT', 'PARTIALLY_PAID') AND b."sentAt" IS NOT NULL AND GREATEST(b."sentAt", e."createdAt") >= ${since}
          ORDER BY GREATEST(b."sentAt", e."createdAt") ASC, b."id" ASC LIMIT 200`
      : await raw.$queryRaw<Row[]>`
          SELECT s."tenantId", b."unitId", b."id" AS "billId", s."status" FROM "ServiceMessageLog" s
          JOIN "DormBill" b ON b."tenantId" = s."tenantId" AND s."dedupeKey" = ('rooms:bill:' || b."id")
          LEFT JOIN "OutboxEvent" e ON e."tenantId" = b."tenantId" AND e."idempotencyKey" = ('dorm.billrun.sent:' || b."id")
          WHERE s."domain" = 'rooms' AND s."messageKey" = 'bill' AND s."status" IN ('SKIPPED_QUIET', 'FAILED')
            AND b."status" IN ('SENT', 'PARTIALLY_PAID') AND b."sentAt" IS NOT NULL AND GREATEST(b."sentAt", e."createdAt") >= ${since}
          ORDER BY GREATEST(b."sentAt", e."createdAt") ASC, b."id" ASC LIMIT 200`;
    const quiet = new Map<string, boolean>();
    const quietNow = async (tenantId: string, unitId: string): Promise<boolean> => {
      const k = `${tenantId}:${unitId}`;
      if (!quiet.has(k)) {
        const q = (await resolveSettings({ tenantId }, ["messaging.quietHours"], { unitId }))["messaging.quietHours"]?.value;
        quiet.set(k, isRec(q) && typeof q.start === "string" && typeof q.end === "string" ? inQuietWindow(at, q.start, q.end) : false);
      }
      return quiet.get(k) === true;
    };
    for (const r of rows) {
      if (left() < 2_000) break;
      if (!ID_RE.test(r.billId)) continue;
      if (r.status === "SKIPPED_QUIET" && (await quietNow(r.tenantId, r.unitId))) continue;
      if (r.status === "FAILED") {
        const v = await checkRateLimitDb(`dorm:line:resend:${r.tenantId}:${r.billId}`, { limit: FAILED_RETRY_MAX, windowMs: RESEND_WINDOW_MS }, at.getTime());
        if (!v.ok) continue;
      }
      const s = await sendDormBill({ tenantId: r.tenantId }, { billId: r.billId }, { now: at });
      if (s.status === "SENT" && !s.duplicate) out.resent++;
    }
  } catch (e) {
    console.error("[dorm.line] jobs", errName(e));
  }
  return out;
}

// ───────────────────────── §3.6 รูปสลิปในแชท ─────────────────────────

type ImageResult = { handled: boolean; attached: { slipId: string; billId: string; status: string } | null; reply?: PostbackReply };
const IGNORE: ImageResult = { handled: false, attached: null };

export async function onLineImage(
  ctx: PostbackCtx,
  i: { messageId: string },
  opts?: { now?: Date; deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> } },
): Promise<ImageResult> {
  try {
    const now = nowOf(opts?.now);
    const messageId = isRec(i) && typeof i.messageId === "string" ? i.messageId : "";
    if (!MESSAGE_ID_RE.test(messageId)) return IGNORE;
    // 1. สัญญาของผู้ส่ง (ไม่มี = รูปแชทธรรมดา ไม่ตอบ)
    const leases = await myLeases(ctx, now);
    if (!leases.length) return IGNORE;
    // 2. เฉพาะหน่วยที่เปิดแนบอัตโนมัติ
    const units = [...new Set(leases.map((l) => l.unitId))];
    const sets = await resolveSettingsMany({ tenantId: ctx.tenantId }, ["rooms.payment.slipAutoAttach"], units.map((unitId) => ({ unitId })));
    const on = new Set(units.filter((_, k) => sets[k]?.["rooms.payment.slipAutoAttach"]?.value === true));
    const mine = leases.filter((l) => on.has(l.unitId));
    if (!mine.length) return IGNORE;
    // 3. บิลเปิดของสัญญาเหล่านั้น
    const open: { lease: PortalLeaseRow; bill: PortalBillRow }[] = [];
    for (const l of mine) for (const b of await portalLeaseBills(ctx.tenantId, l)) if (b.outstandingSatang > 0) open.push({ lease: l, bill: b });
    if (!open.length) return IGNORE;
    if (open.length > 1) {
      // W4: กำกวม (หลายงวด/หลายห้อง) ⇒ ไม่แนบ · ตอบเป็นกลาง + ลิงก์พอร์ทัลของทุกสัญญา live ของผู้ส่ง (บน OA นี้)
      const t = await leaseLinksText(ctx, leases, now, "");
      return { handled: true, attached: null, reply: { text: `กรุณาแนบสลิปในลิงก์บิลของห้อง${t ? `\n\n${t}` : ""}` } };
    }
    const { lease, bill } = open[0]!;
    // W7: บิลมีสลิปรอตรวจอยู่แล้ว ⇒ ไม่สร้างใบที่สอง (ไหลเป็นแชทปกติ)
    if (bill.slip && bill.slip.status !== "REJECTED") return IGNORE;
    // W3: แนบอัตโนมัติเฉพาะเมื่อยืนยันได้ว่าเป็นสลิปจริง — หน่วยมีตัวตรวจ SLIP_VERIFY และได้ VALID/เลขอ้างอิง
    //   (ถอด QR จากรูปฝั่งเซิร์ฟเวอร์ยังทำไม่ได้: ไม่มีตัวถอดรูป/QR ในโปรเจกต์ — หนี้) · อื่น ⇒ handled:false รูปไหลเป็นแชทปกติ
    const h = await getIntegration({ tenantId: ctx.tenantId, unitId: lease.unitId }, "SLIP_VERIFY");
    if (!h) return IGNORE;
    // 4. ดึงรูปจาก OA ของผู้ส่ง → อ่านค้างสดอีกรอบ → ตรวจกับตัวตรวจ → submitSlip (ยอดคาดหวัง = ค้างสด ณ ตอนแนบ)
    const content = await fetchLineMessageContent({ tenantId: ctx.tenantId }, { connectionId: ctx.connectionId, messageId });
    if (!content.ok) return IGNORE;
    const [fresh] = await portalLeaseBills(ctx.tenantId, lease, { only: [bill.id] });
    if (!fresh || fresh.outstandingSatang <= 0 || (fresh.slip && fresh.slip.status !== "REJECTED")) return IGNORE;
    const rc = await receiverFor({ tenantId: ctx.tenantId }, lease.unitId);
    const expectReceiver: { promptpayId?: string; bankAccount?: string } = {};
    if (rc) {
      expectReceiver.promptpayId = rc.promptpayId;
      if (rc.bankAccount) expectReceiver.bankAccount = rc.bankAccount;
    }
    const image = Buffer.from(content.data);
    const pre = await callIntegration(h, "slip.verify", (a, { signal }) => a.verify({ image }, { amountSatang: fresh.outstandingSatang, receiver: expectReceiver }, { signal }));
    const v = pre.ok && isRec(pre.value) ? pre.value : null;
    if (!v || !(v.status === "VALID" || canonTransRef(v.transRef))) return IGNORE;
    const name = await portalPartyName(ctx.tenantId, lease.partyId);
    const deps = opts?.deps;
    const r = await submitSlip(
      { tenantId: ctx.tenantId },
      {
        unitId: lease.unitId,
        domain: "DORM",
        refType: "DORM_BILL",
        refId: fresh.id,
        partyId: lease.partyId,
        file: { data: content.data, contentType: content.contentType },
        expectedSatang: fresh.outstandingSatang,
        idempotencyKey: `dorm-chat:${messageId}`,
        expectedPayerNames: name ? [name] : [],
      },
      { ...(deps?.put ? { put: deps.put } : {}), ...(deps?.del ? { del: deps.del } : {}), now },
    );
    if (!r.ok) return IGNORE;
    return {
      handled: true,
      attached: { slipId: r.slipId, billId: fresh.id, status: r.status },
      // W12: ไม่สัญญาว่าจะแจ้งภายหลัง
      reply: { text: `ได้รับสลิปห้อง ${lease.roomNumber} งวด ${fresh.periodLabel} แล้ว (ยอดค้าง ${portalBaht(fresh.outstandingSatang)}) — อยู่ระหว่างตรวจยอด ดูสถานะได้ที่ลิงก์บิลของห้อง` },
    };
  } catch (e) {
    console.error("[dorm.line] image", errName(e));
    return IGNORE;
  }
}
