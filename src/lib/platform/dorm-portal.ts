// ─────────────────────────────────────────────────────────────
// platform/dorm-portal.ts — พอร์ทัลผู้เช่าหอแบบลิงก์เซ็น (หน้าจ่าย QR · แนบสลิป · ใบเสร็จ · สัญญา/เอกสาร) · SVC D.9 · ใบสั่ง §3.0 §3.1
//
// ลิงก์ = signLink({ purpose "dorm.portal", subject = สัญญา (ไม่ใช่ห้อง/บิล) }) ⇒ ผู้เช่าใหม่ห้องเดิมไม่เห็นของคนเก่า (บทเรียน B.6)
//   สัญญาไม่ live ⇒ ลิงก์เก่าทั้งหมดใช้ไม่ได้ทันที (ไม่มีสถานะค้างข้ามคน)
// 🔴 ลำดับตายตัวของทุกทางเข้าที่รับ token (X7): rate limit → verifyLink → สัญญา live ของร้านใน token → บิลของสัญญานี้
//    ล้มข้อใดก็ได้ ⇒ ผลเดียวกันทุกไบต์ (null / NOT_FOUND + ข้อความเดียว) · ทุกกรณีล้มวิ่งคิวรีชุดเดียวกัน (เวลาตอบใกล้กัน)
// 🔴 ยอดทุกที่ = ค้างสด ณ ตอนเรียก (QR · ยอดคาดหวังของสลิป) — คิดฝั่งเซิร์ฟเวอร์เสมอ · ไม่รับยอด/ร้าน/หน่วยจากผู้ใช้
// 🔴 ผลคืนไม่มีเบอร์ · เลขบัตร · ชื่อผู้เช่า · id ของสัญญา/บิลของคนอื่น (ลิงก์ส่งต่อได้) · ไฟล์ไม่มีบัตร ID_CARD/ลายเซ็น
// 🔴 ไม่ import prisma ดิบ — อ่านผ่าน facade หอ/บัญชี/ชำระเงิน · ค่านโยบายจากทะเบียนค่าตั้ง (อ่านต่อคำขอ)
// ─────────────────────────────────────────────────────────────
import { bkkYmd } from "@/lib/core/quiet-hours";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import { signLink, verifyLink } from "@/lib/core/signed-link";
import { docLinkInfo, listDocPayments } from "@/lib/modules/account";
import {
  portalBillVisible,
  portalFileAssets,
  portalLeaseBills,
  portalLiveLease,
  portalPartyName,
  portalSlipKeyExists,
  type PortalBillRow,
  type PortalLeaseRow,
} from "@/lib/modules/dorm";
import { promptpayQrFor, receiverFor } from "@/lib/payment/receiver";
import { SLIP_ACCEPT_TYPES, SLIP_MAX_BYTES, submitSlip } from "@/lib/payment/slip-verify";
import { openStoredFile } from "@/lib/storage/service";

export const DORM_PORTAL_PURPOSE = "dorm.portal";
/** ค่าคงที่ความปลอดภัย (ไม่ใช่นโยบายร้าน) — นับต่อ IP ก่อนแตะสัญญา */
export const PORTAL_RATE = { view: { limit: 120, windowMs: 600_000 }, slip: { limit: 10, windowMs: 600_000 } } as const;

export type PortalOpts = { clientKey: string; now?: Date };
export type PortalBillState = "UNPAID" | "PARTIAL" | "PENDING_REVIEW" | "PAID";
type SlipStatus = "PENDING" | "AUTO_APPROVED" | "NEEDS_REVIEW" | "APPROVED" | "REJECTED";
export type PortalView = {
  unitName: string;
  roomNumber: string;
  bill: null | {
    billId: string;
    periodKey: string;
    periodLabel: string;
    dueDate: string;
    dueLabel: string;
    docNo: string | null;
    lines: { code: string; labelTh: string; detail: string | null; amountSatang: number }[];
    adjustments: { kind: "CREDIT" | "DEBIT"; docNo: string | null; amountSatang: number }[];
    totalSatang: number;
    paidSatang: number;
    outstandingSatang: number;
    state: PortalBillState;
    slip: null | { status: SlipStatus; at: string };
  };
  pay: null | { amountSatang: number; payload: string; qrSvgDataUrl: string; receiverName: string; promptpayId: string };
  history: { billId: string; periodKey: string; periodLabel: string; totalSatang: number; outstandingSatang: number; state: PortalBillState; current: boolean }[];
  links: { self: string; receipt: string | null; lease: string };
  can: { uploadSlip: boolean };
};
export type PortalSlipResult =
  | { ok: true; slipId: string; status: SlipStatus; replayed: boolean }
  | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" | "BAD_FILE" | "NOT_PAYABLE" | "IN_REVIEW" | "FAILED"; reason: string };
export type PortalReceipt = {
  unitName: string;
  roomNumber: string;
  billId: string;
  periodLabel: string;
  docNo: string | null;
  titleTh: string;
  totalSatang: number;
  paidSatang: number;
  payments: { paidAt: string; amountSatang: number; channelTh: string }[];
};
export type PortalLease = {
  unitName: string;
  roomNumber: string;
  startDate: string;
  endDate: string | null;
  rentSatang: number;
  commonFeeSatang: number;
  depositSatang: number;
  contract: { textTh: string; clauses: { titleTh: string; textTh: string }[] } | null;
  files: { fileId: string; kind: "ROOM_PHOTO" | "DOCUMENT"; contentType: string; at: string; path: string }[];
};
export type PortalFileRef = { fileId: string; contentType: string; open: () => Promise<ReadableStream<Uint8Array> | Uint8Array | null> };

const NOT_FOUND_REASON = "ไม่พบหน้านี้ หรือลิงก์หมดอายุแล้ว — ขอลิงก์ใหม่จากหอทางแชท LINE";
const RATE_REASON = "ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
const BAD_FILE_REASON = "แนบได้เฉพาะรูปสลิป JPG / PNG / WEBP ขนาดไม่เกิน 5 MB";
const NOT_PAYABLE_REASON = "บิลนี้ไม่มียอดค้างชำระแล้ว";
const IN_REVIEW_REASON = "ได้รับสลิปของบิลนี้แล้ว อยู่ระหว่างตรวจยอด";
const FAILED_REASON = "ส่งสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
const DAY_MIN = 1440;
const KEY_PART_RE = /[^A-Za-z0-9_-]/g;
const CHANNEL_TH: Record<string, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอนเงิน",
  PROMPTPAY: "พร้อมเพย์",
  CARD: "บัตร",
  E_WALLET: "วอลเล็ต",
  CHEQUE: "เช็ค",
  DEPOSIT_APPLY: "หักจากเงินประกัน",
  CREDIT_APPLY: "หักจากยอดเครดิต",
};

const nowOf = (d: Date | undefined): Date => (d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date());
const keyOf = (v: unknown): string => (typeof v === "string" ? v.slice(0, 128) : "") || "unknown";
const NF = (): Extract<PortalSlipResult, { ok: false }> => ({ ok: false, code: "NOT_FOUND", reason: NOT_FOUND_REASON });

/** origin ของลิงก์เต็ม (APP_URL → NEXT_PUBLIC_APP_URL) · ไม่มี/ผิดรูป ⇒ "" (path สัมพัทธ์) */
function appOrigin(): string {
  for (const raw of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* ค่าเพี้ยน — ลองตัวถัดไป */
    }
  }
  return "";
}

/**
 * IP ผู้ใช้ (ตัวเดียวกันทั้งหน้าและ action): x-real-ip → x-vercel-forwarded-for → x-forwarded-for ตัวแรก → "unknown"
 *   (ลำดับเดียวกับ helper ของ B.9)
 */
export const PORTAL_IP_HEADERS = ["x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"] as const;
export function portalClientKey(h: Headers, order: readonly string[] = PORTAL_IP_HEADERS): string {
  const pick = (v: string | null | undefined) => (v ?? "").split(",")[0]?.trim().slice(0, 64) ?? "";
  for (const k of order) {
    const v = pick(h.get(k));
    if (v) return v;
  }
  return "unknown";
}

async function portalDays(tenantId: string, unitId: string): Promise<number> {
  const s = await resolveSettings({ tenantId }, ["rooms.notify.portalLinkDays"], { unitId });
  const v = s["rooms.notify.portalLinkDays"]?.value;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : 1;
}

/** ลิงก์พอร์ทัลของสัญญา (hook ของ D.8/D.11/LINE) — สัญญาไม่ live / ไม่มีกุญแจ ⇒ "" · ไม่ throw */
export async function portalUrl(ctx: { tenantId: string }, i: { leaseId: string; billId?: string | null }, opts?: { now?: Date }): Promise<string> {
  try {
    const tenantId = typeof ctx?.tenantId === "string" ? ctx.tenantId : "";
    const leaseId = typeof i?.leaseId === "string" ? i.leaseId : "";
    if (!tenantId || !leaseId) return "";
    const lease = await portalLiveLease(tenantId, leaseId, bkkYmd(nowOf(opts?.now)));
    if (!lease) return "";
    const days = await portalDays(tenantId, lease.unitId);
    const token = signLink({ tenantId, purpose: DORM_PORTAL_PURPOSE, subjectId: lease.id, expMin: days * DAY_MIN });
    const bill = typeof i.billId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(i.billId) ? `?bill=${i.billId}` : "";
    return `${appOrigin()}/d/${token}${bill}`;
  } catch {
    return "";
  }
}

// ───────────────────────── ด่าน (ลำดับตายตัว · X7) ─────────────────────────
type Gate = { ok: true; tenantId: string; lease: PortalLeaseRow } | { ok: false; code: "RATE_LIMITED" | "NOT_FOUND" };

/** ข้อ 1–3: rate → verifyLink → สัญญา live (วิ่งคิวรีสัญญาเสมอ แม้ token ล้ม) */
async function gateLease(token: unknown, kind: "view" | "slip", opts: PortalOpts): Promise<Gate> {
  const now = nowOf(opts?.now);
  const rl = await checkRateLimitDb(`dorm:portal:${kind}:${keyOf(opts?.clientKey)}`, PORTAL_RATE[kind], now.getTime());
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED" };
  const v = verifyLink(token, DORM_PORTAL_PURPOSE);
  const lease = await portalLiveLease(v?.tenantId ?? "", v?.subjectId ?? "", bkkYmd(now));
  if (!v || !lease || lease.tenantId !== v.tenantId || lease.id !== v.subjectId) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, tenantId: v.tenantId, lease };
}

/** ข้อ 4: บิลที่ระบุต้องเป็นบิลที่ผู้เช่าเห็นของสัญญานี้ (วิ่งคิวรีเสมอ) */
async function billOk(g: Gate, billId: unknown): Promise<boolean> {
  const ok = await portalBillVisible(g.ok ? g.tenantId : "", g.ok ? g.lease.id : "", typeof billId === "string" ? billId : "");
  return g.ok && ok;
}

/** W7 ▸ บิลมีสลิปที่ยังไม่ถูกปฏิเสธ (รอตรวจ/อนุมัติแล้วรอผลเงิน D.10) */
const inReview = (b: PortalBillRow) => !!b.slip && b.slip.status !== "REJECTED";

function stateOf(b: PortalBillRow): PortalBillState {
  if (b.outstandingSatang <= 0) return "PAID";
  if (b.slip && b.slip.status !== "REJECTED") return "PENDING_REVIEW";
  if (b.paidSatang > 0) return "PARTIAL";
  return "UNPAID";
}

const pathsOf = (token: string) => ({ self: `/d/${token}`, lease: `/d/${token}/lease`, receipt: (billId: string) => `/d/${token}/receipt?bill=${billId}` });

/** หน้าจ่าย/พอร์ทัล — ล้มทุกกรณี ⇒ null (หน้าเรียก notFound()) */
export async function loadPortal(token: string, q: { bill?: string | null }, opts: PortalOpts): Promise<PortalView | null> {
  try {
    const g = await gateLease(token, "view", opts);
    const want = typeof q?.bill === "string" && q.bill ? q.bill : null;
    if (want !== null && !(await billOk(g, want))) return null;
    if (!g.ok) return null;
    const { tenantId, lease } = g;
    const bills = await portalLeaseBills(tenantId, lease);
    const cur = want ? (bills.find((b) => b.id === want) ?? null) : (bills.find((b) => b.outstandingSatang > 0) ?? bills[0] ?? null);
    if (want && !cur) return null;
    const p = pathsOf(token);
    let pay: PortalView["pay"] = null;
    if (cur && cur.outstandingSatang > 0) {
      const qr = await promptpayQrFor({ tenantId }, { unitId: lease.unitId, amountSatang: cur.outstandingSatang, ref: cur.docNo ?? cur.id });
      const rc = qr.ok ? await receiverFor({ tenantId }, lease.unitId) : null;
      if (qr.ok && rc) pay = { amountSatang: cur.outstandingSatang, payload: qr.payload, qrSvgDataUrl: qr.svgDataUrl, receiverName: qr.displayName, promptpayId: rc.promptpayId };
    }
    return {
      unitName: lease.unitName,
      roomNumber: lease.roomNumber,
      bill: cur
        ? {
            billId: cur.id,
            periodKey: cur.periodKey,
            periodLabel: cur.periodLabel,
            dueDate: cur.dueDate,
            dueLabel: cur.dueLabel,
            docNo: cur.docNo,
            lines: cur.lines,
            adjustments: cur.adjustments,
            totalSatang: cur.totalSatang,
            paidSatang: cur.paidSatang,
            outstandingSatang: cur.outstandingSatang,
            state: stateOf(cur),
            slip: cur.slip,
          }
        : null,
      pay,
      history: bills.map((b) => ({
        billId: b.id,
        periodKey: b.periodKey,
        periodLabel: b.periodLabel,
        totalSatang: b.totalSatang,
        outstandingSatang: b.outstandingSatang,
        state: stateOf(b),
        current: !!cur && b.id === cur.id,
      })),
      links: { self: p.self, receipt: cur && cur.paidSatang > 0 ? p.receipt(cur.id) : null, lease: p.lease },
      can: { uploadSlip: !!cur && cur.outstandingSatang > 0 && !inReview(cur) },
    };
  } catch (e) {
    console.error("[dorm.portal] load", e instanceof Error ? e.name : "error");
    return null;
  }
}

/** แนบสลิปจากพอร์ทัล — ยอดคาดหวัง = ค้างสด ณ ตอนยื่น (คิดฝั่งเซิร์ฟเวอร์) · deps มาจากผู้เรียกฝั่งเซิร์ฟเวอร์/ข้อสอบเท่านั้น */
export async function submitPortalSlip(
  token: string,
  // W11: ผู้เรียกจากคำขอส่ง `read` + `size` (อ่านไบต์หลังผ่าน rate/ลิงก์/ขนาดแล้วเท่านั้น) · ผู้เรียกฝั่งเซิร์ฟเวอร์/ข้อสอบส่ง `data` ตรง
  i: { billId: string; file: { data?: Uint8Array; read?: () => Promise<Uint8Array>; size?: number; contentType: string }; idempotencyKey: string; qrPayload?: string | null },
  opts: PortalOpts & { deps?: { put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>; del?: (path: string) => Promise<number> } },
): Promise<PortalSlipResult> {
  try {
    const g = await gateLease(token, "slip", opts);
    if (!g.ok && g.code === "RATE_LIMITED") return { ok: false, code: "RATE_LIMITED", reason: RATE_REASON };
    if (!g.ok) {
      await billOk(g, i?.billId); // คิวรีบิลชุดเดียวกับทางที่ผ่าน (เวลาตอบใกล้กัน)
      return NF();
    }
    const file = i?.file;
    const ct = typeof file?.contentType === "string" ? file.contentType.split(";")[0]!.trim().toLowerCase() : "";
    const declared = file?.data instanceof Uint8Array ? file.data.length : typeof file?.size === "number" ? file.size : -1;
    if (declared <= 0 || declared > SLIP_MAX_BYTES || !SLIP_ACCEPT_TYPES.includes(ct)) return { ok: false, code: "BAD_FILE", reason: BAD_FILE_REASON };
    const data = file?.data instanceof Uint8Array ? file.data : typeof file?.read === "function" ? await file.read() : null;
    if (!(data instanceof Uint8Array) || data.length === 0 || data.length > SLIP_MAX_BYTES) return { ok: false, code: "BAD_FILE", reason: BAD_FILE_REASON };
    if (!(await billOk(g, i?.billId))) return NF();
    const [bill] = await portalLeaseBills(g.tenantId, g.lease, { only: [i.billId] });
    if (!bill) return NF();
    if (bill.outstandingSatang <= 0) return { ok: false, code: "NOT_PAYABLE", reason: NOT_PAYABLE_REASON };
    const userKey = typeof i.idempotencyKey === "string" ? i.idempotencyKey.replace(KEY_PART_RE, "").slice(0, 60) : "";
    if (!userKey) return { ok: false, code: "FAILED", reason: FAILED_REASON };
    const idem = `dorm-portal:${bill.id}:${userKey}`.slice(0, 128);
    // W7: มีสลิปรอตรวจแล้ว ⇒ ไม่สร้างใบที่สอง (ส่งซ้ำด้วยคีย์เดิม = ให้ submitSlip คืนผลเดิม)
    if (inReview(bill) && !(await portalSlipKeyExists(g.tenantId, idem))) return { ok: false, code: "IN_REVIEW", reason: IN_REVIEW_REASON };
    const name = await portalPartyName(g.tenantId, g.lease.partyId);
    const deps = opts?.deps;
    const r = await submitSlip(
      { tenantId: g.tenantId },
      {
        unitId: g.lease.unitId,
        domain: "DORM",
        refType: "DORM_BILL",
        refId: bill.id,
        partyId: g.lease.partyId,
        file: { data, contentType: ct },
        qrPayload: typeof i.qrPayload === "string" && i.qrPayload ? i.qrPayload : undefined,
        expectedSatang: bill.outstandingSatang,
        idempotencyKey: idem,
        expectedPayerNames: name ? [name] : [],
      },
      { ...(deps?.put ? { put: deps.put } : {}), ...(deps?.del ? { del: deps.del } : {}), now: nowOf(opts?.now) },
    );
    if (r.ok) return { ok: true, slipId: r.slipId, status: r.status, replayed: r.replayed === true };
    if (r.code === "VALIDATION") return { ok: false, code: "BAD_FILE", reason: BAD_FILE_REASON };
    return { ok: false, code: "FAILED", reason: FAILED_REASON };
  } catch (e) {
    console.error("[dorm.portal] slip", e instanceof Error ? e.name : "error");
    return { ok: false, code: "FAILED", reason: FAILED_REASON };
  }
}

/** หน้าพิมพ์หลักฐานรับชำระ (A5) — บิลต้องมีการรับชำระ · ล้มทุกกรณี ⇒ null */
export async function loadPortalReceipt(token: string, q: { bill: string }, opts: PortalOpts): Promise<PortalReceipt | null> {
  try {
    const g = await gateLease(token, "view", opts);
    if (!(await billOk(g, q?.bill)) || !g.ok) return null;
    const [b] = await portalLeaseBills(g.tenantId, g.lease, { only: [q.bill] });
    if (!b || b.paidSatang <= 0) return null;
    let payments: PortalReceipt["payments"] = [];
    if (b.docId) {
      const info = await docLinkInfo(g.tenantId, b.docId);
      const rows = info ? await listDocPayments(g.tenantId, info.systemId, b.docId) : [];
      payments = rows
        .filter((p) => p.voidedAt === null)
        .map((p) => ({ paidAt: bkkYmd(p.paidAt), amountSatang: Math.max(0, p.amount) + Math.max(0, p.whtAmount ?? 0), channelTh: CHANNEL_TH[String(p.channel)] ?? "รับชำระ" }));
    } else {
      payments = [{ paidAt: b.paidAt ?? "", amountSatang: b.paidSatang, channelTh: "รับชำระ" }];
    }
    if (!payments.length) return null;
    return {
      unitName: g.lease.unitName,
      roomNumber: g.lease.roomNumber,
      billId: b.id,
      periodLabel: b.periodLabel,
      docNo: b.docNo,
      titleTh: b.outstandingSatang <= 0 ? "ใบเสร็จรับเงิน" : "หลักฐานการรับชำระ (บางส่วน)",
      totalSatang: b.totalSatang,
      paidSatang: b.paidSatang,
      payments,
    };
  } catch (e) {
    console.error("[dorm.portal] receipt", e instanceof Error ? e.name : "error");
    return null;
  }
}

type FileEntry = { fileId: string; kind: "ROOM_PHOTO" | "DOCUMENT"; at: string };
/** ไฟล์ของสัญญาที่ผู้เช่าเห็นได้ = รูปห้อง + เอกสาร (ไม่มีบัตร ID_CARD · ไม่มีลายเซ็น) */
function leaseFilesOf(lease: PortalLeaseRow): FileEntry[] {
  const v = lease.moveInPhotos;
  if (!Array.isArray(v)) return [];
  const out: FileEntry[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const r = x as Record<string, unknown>;
    if (typeof r.fileId !== "string" || !r.fileId || r.fileId === lease.signatureFileId) continue;
    const kind = r.kind === "DOCUMENT" ? "DOCUMENT" : r.kind === "ROOM_PHOTO" || r.kind === undefined ? "ROOM_PHOTO" : null;
    if (!kind) continue;
    out.push({ fileId: r.fileId, kind, at: typeof r.at === "string" ? r.at : "" });
  }
  return out;
}

/** W1 ▸ ชื่อคนที่ต้องไม่ออกจากพอร์ทัล (ชื่อในสัญญา · Party ปัจจุบัน · ผู้พักร่วม) */
function namesOf(lease: PortalLeaseRow, snapTenantName: unknown, partyName: string | null): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim().length >= 2) out.add(v.trim());
  };
  add(snapTenantName);
  add(partyName);
  const co = lease.coTenants;
  if (co && typeof co === "object" && !Array.isArray(co) && Array.isArray((co as Record<string, unknown>).occupants)) {
    for (const o of (co as { occupants: unknown[] }).occupants) if (o && typeof o === "object") add((o as Record<string, unknown>).name);
  }
  // ชื่อยาวก่อน (ชื่อเต็มก่อนชื่อต้น) — กันแทนครึ่งชื่อ
  return [...out].sort((a, b) => b.length - a.length);
}
const PHONE_RE = /(\+?66|0)[\s-]?[689](?:[\s-]?\d){7,8}/g;
const IDCARD_RE = /\b\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d\b/g;
/** W1 ▸ ข้อความสัญญาแบบเป็นกลาง: ชื่อ ⇒ "ผู้เช่า" (แบบ neutralText ของ lease.ts) · เบอร์/เลขบัตร ⇒ ปิดบัง */
function neutral(text: string, names: string[]): string {
  let t = text;
  for (const n of names) t = t.split(n).join(" ผู้เช่า ");
  return t.replace(IDCARD_RE, "x-xxxx-xxxxx-xx-x").replace(PHONE_RE, "xxx-xxx-xxxx");
}

function contractOf(snap: unknown, names: (snapTenantName: unknown) => string[]): PortalLease["contract"] {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  const c = (snap as Record<string, unknown>).contract;
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const cc = c as Record<string, unknown>;
  const ns = names(cc.tenantName);
  const textTh = typeof cc.textTh === "string" ? neutral(cc.textTh, ns) : "";
  const clauses = Array.isArray(cc.clauses)
    ? cc.clauses
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
        .map((x) => ({ titleTh: typeof x.titleTh === "string" ? neutral(x.titleTh, ns) : "", textTh: typeof x.textTh === "string" ? neutral(x.textTh, ns) : "" }))
        .filter((x) => x.titleTh || x.textTh)
    : [];
  return textTh || clauses.length ? { textTh, clauses } : null;
}

/** สัญญา + เอกสารของตัวเอง — ล้มทุกกรณี ⇒ null */
export async function loadPortalLease(token: string, opts: PortalOpts): Promise<PortalLease | null> {
  try {
    const g = await gateLease(token, "view", opts);
    if (!g.ok) return null;
    const list = leaseFilesOf(g.lease);
    const assets = await portalFileAssets(g.tenantId, list.map((f) => f.fileId));
    const partyName = await portalPartyName(g.tenantId, g.lease.partyId);
    return {
      unitName: g.lease.unitName,
      roomNumber: g.lease.roomNumber,
      startDate: g.lease.startDate,
      endDate: g.lease.endDate,
      rentSatang: g.lease.rentSatang,
      commonFeeSatang: g.lease.commonFeeSatang,
      depositSatang: g.lease.depositSatang,
      contract: contractOf(g.lease.policySnapshot, (snapName) => namesOf(g.lease, snapName, partyName)),
      files: list
        .filter((f) => assets.has(f.fileId))
        .map((f) => ({ fileId: f.fileId, kind: f.kind, contentType: assets.get(f.fileId)?.contentType ?? "", at: f.at, path: `/d/${token}/f/${f.fileId}` })),
    };
  } catch (e) {
    console.error("[dorm.portal] lease", e instanceof Error ? e.name : "error");
    return null;
  }
}

/**
 * ไฟล์ในรายการของสัญญานี้เท่านั้น — อื่น ⇒ null
 *   W9: ตัวอ่านไบต์ (`open`) เกิดได้จากที่นี่ที่เดียว หลังผ่านด่าน (rate → ลายเซ็น → สัญญา live → ไฟล์ของสัญญา) · ไม่มีตัวอ่านไฟล์อิสระ
 */
export async function portalFileRef(token: string, fileId: string, opts: PortalOpts): Promise<PortalFileRef | null> {
  try {
    const g = await gateLease(token, "view", opts);
    if (!g.ok) return null;
    const hit = leaseFilesOf(g.lease).find((f) => f.fileId === fileId);
    if (!hit) return null;
    const tenantId = g.tenantId;
    const a = (await portalFileAssets(tenantId, [hit.fileId])).get(hit.fileId);
    if (!a) return null;
    const open = async (): Promise<ReadableStream<Uint8Array> | Uint8Array | null> => {
      try {
        const opened = await openStoredFile(a.path, tenantId);
        return opened.ok ? (opened.body ?? opened.bytes ?? null) : null;
      } catch {
        return null;
      }
    };
    return { fileId: hit.fileId, contentType: a.contentType, open };
  } catch {
    return null;
  }
}
