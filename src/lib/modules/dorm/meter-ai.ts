// SVC D.14 ▸ AI อ่านเลขมิเตอร์จากรูป — ระบบ "เสนอ" คนยืนยัน (สัญญา ledger/svc-briefs/svc-brief-d.14.md §2 §3)
//   • เสนอ ≠ บันทึก: ที่นี่ไม่เขียน DormMeterReading/outbox — ค่าเข้าแถวได้ทางเดียวคือคนกด "บันทึก" ⇒ submitReadings (+aiProposalId)
//   • ข้อเสนอเก็บใน AuditLog action `dorm.meter.ai.proposed` (ไม่มี migration) · ไม่มีรูป/base64/ชื่อ/เบอร์ในแถว
//   • หน่วยของ "ครั้ง" = K (หน่วย, มิเตอร์, งวด, sha256 รูป) — ล็อก advisory ต่อ K ใน tx ของ tenantDb · ref เครดิตกันซ้ำระดับฐาน (credit.ts R1)
//   • ไม่เปิด connection ที่สองระหว่างถือ tx: อัปรูป/ค่าตั้ง/canSpend/ตัวอย่างล่วงหน้า/หักเงิน อยู่นอก tx ทั้งหมด (ใน tx มีแค่ตัวอ่าน AI = ไม่ใช่ฐาน)
//   • 40P01 ⇒ ลองใหม่ 1 ครั้ง แล้วคืน BUSY · ด่านสิทธิ์อยู่ในชั้นนี้ (มติ R6) · ไม่พบทุกกรณี = คำตอบเดียวกัน (X1)
//   • PDPA (X8): ตัวอ่านได้แค่ { image, kind, digits } · provider ของระบบเท่านั้น (resolveProvider) · ไม่ fetch เอง · ไม่ log รูป
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { getDef, resolveSetting } from "@/lib/core/settings";
import { canSpend, canSpendPeek, chargeUsage } from "@/lib/ai/credit";
import { resolveProvider } from "@/lib/ai/provider";
import { deleteFileAsset, uploadFile } from "@/lib/storage/service";
import { METER_AI_ACTION, meterAiRecOf, meterPreviewMany, type MeterAiProposalRec, type MeterCtx, type MeterFlag, type MeterPreview } from "./meter";
import { dormStaffGate } from "./portal";
import { dormLiveMember, dormScopeFor } from "./scope";

// ───────────────────────── ชนิด (สัญญา §3) ─────────────────────────
type Fail = { ok: false; code: string; reason: string };
export type MeterAiManualReason = "AI_OFF" | "NO_PROVIDER" | "NO_CREDIT" | "AI_FAILED" | "UNREADABLE";
export type MeterPhotoReader = {
  read(
    input: { image: { data: Uint8Array; contentType: string }; kind: "ELEC" | "WATER"; digits: number | null },
    opts?: { signal?: AbortSignal },
  ): Promise<{ value: number | null; confidence: number; model: string; tokensIn: number; tokensOut: number }>;
};
export type MeterProposal = {
  proposalId: string;
  meterId: string;
  periodKey: string;
  source: "AI" | "MANUAL";
  manualReason: MeterAiManualReason | null;
  value: number | null;
  confidence: number | null;
  prevValue: number | null;
  units: number | null;
  flag: MeterFlag | null;
  lowConfidence: boolean;
  needsConfirm: boolean;
  createdAt: string;
};
type ProposeDeps = {
  reader?: MeterPhotoReader | null;
  put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>;
  now?: Date;
  timeoutMs?: number;
};

// ───────────────────────── ค่าคงที่ · ตัวช่วย ─────────────────────────
const KEY_ON = "rooms.meter.aiRead";
const KEY_MIN = "rooms.meter.aiMinConfidence";
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PHOTO_MAX = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const NOTE = "dorm.meter.readPhoto";
const NF: Fail = { ok: false, code: "NOT_FOUND", reason: "ไม่พบมิเตอร์นี้" };
const notFound = (): Fail => ({ ...NF });
const fail = (code: string, reason: string): Fail => ({ ok: false, code, reason });
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const MANUAL_REASONS = new Set<string>(["AI_OFF", "NO_PROVIDER", "NO_CREDIT", "AI_FAILED", "UNREADABLE"]);
/** ผล AI ของ K ที่ "จ่ายแล้ว" — ได้คำตอบจากตัวอ่าน (อ่านได้ หรืออ่านไม่ออก) ⇒ ครั้งต่อไปของ K = cached */
const hasAiResult = (r: MeterAiProposalRec) => r.source === "AI" || r.manualReason === "UNREADABLE";

/** ค่าเริ่มของทะเบียน (ไม่ฝังเลข) */
function registryDefault(key: string): unknown {
  const d = getDef(key);
  return d?.defaults?._fallback;
}
async function settingOf(tenantId: string, unitId: string | null, key: string): Promise<unknown> {
  if (!unitId) return registryDefault(key); // ไม่ผ่านด่านหน่วย ⇒ ค่าเริ่มของทะเบียน (ไม่อ่านค่าของหน่วยที่ไม่มีสิทธิ์)
  try {
    return (await resolveSetting({ tenantId }, key, { unitId })).value;
  } catch {
    return registryDefault(key);
  }
}
async function minConfidenceOf(tenantId: string, unitId: string | null): Promise<number> {
  const v = await settingOf(tenantId, unitId, KEY_MIN);
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(registryDefault(KEY_MIN));
  return Number.isFinite(n) ? n : 100;
}
async function aiReadOn(tenantId: string, unitId: string): Promise<boolean> {
  return (await settingOf(tenantId, unitId, KEY_ON)) === true;
}

/** ชนิดรูปที่รับ: JPEG/PNG/WebP ที่ magic ตรงชนิด · 1 ไบต์–5 MB */
function photoOk(p: unknown): p is { data: Uint8Array; contentType: string } {
  if (!isRec(p) || !(p.data instanceof Uint8Array) || typeof p.contentType !== "string") return false;
  const d = p.data;
  if (d.length < 1 || d.length > PHOTO_MAX) return false;
  const at = (i: number, bytes: number[]) => bytes.every((b, k) => d[i + k] === b);
  switch (p.contentType.toLowerCase()) {
    case "image/jpeg":
      return d.length >= 3 && at(0, [0xff, 0xd8, 0xff]);
    case "image/png":
      return d.length >= 8 && at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return d.length >= 12 && at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]);
    default:
      return false;
  }
}

function isDeadlock(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; originalCode?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "40P01" || o.originalCode === "40P01" || o.code === "P2034") return true;
    if (typeof o.message === "string" && /deadlock|40P01/i.test(o.message)) return true;
    cur = o.cause ?? (isRec(o.meta) ? o.meta.driverAdapterError : undefined);
  }
  return false;
}

// ───────────────────────── §3.0 ด่าน ─────────────────────────
type Meter = { id: string; roomId: string | null; buildingId: string | null; kind: "ELEC" | "WATER"; digits: number | null; removedAt: Date | null };
type Gate = { tenantId: string; unitId: string; actorUserId: string; meter: Meter | null };

/** ผ่านด่านหน่วย + สิทธิ์ + (ถ้าส่ง meterId) มิเตอร์ของหน่วย + ขอบเขตอาคาร · ไม่ผ่าน ⇒ null */
async function gate(ctx: unknown, unitId: unknown, meterId?: unknown): Promise<(Gate & { visible: (m: { roomId: string | null; buildingId: string | null }) => boolean; roomBld: Map<string, string | null> }) | null> {
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.actorUserId) || !isStr(unitId)) return null;
  const g = await dormStaffGate(ctx, unitId, "dorm.meter.read");
  if (!g) return null;
  const tenantId = g.tenantId;
  const db = tenantDb({ tenantId, unitId: g.unitId });
  let meter: Meter | null = null;
  if (meterId !== undefined) {
    if (!isStr(meterId)) return null;
    const m = await db.dormMeter.findFirst({ where: { id: meterId, unitId: g.unitId }, select: { id: true, roomId: true, buildingId: true, kind: true, digits: true, removedAt: true } });
    if (!m) return null;
    meter = { ...m, kind: m.kind === "WATER" ? "WATER" : "ELEC" };
  }
  const mem = await dormLiveMember(tenantId, ctx.actorUserId);
  if (!mem) return null;
  const scope = await dormScopeFor(tenantId, g.unitId, mem);
  const roomBld = new Map<string, string | null>();
  if (!scope.all) {
    const rooms = await db.hotelRoom.findMany({ where: { unitId: g.unitId }, select: { id: true, buildingId: true } });
    for (const r of rooms) roomBld.set(r.id, r.buildingId);
  }
  const allowed = scope.all ? null : new Set(scope.buildingIds);
  const visible = (m: { roomId: string | null; buildingId: string | null }) => {
    if (!allowed) return true;
    const b = m.roomId ? (roomBld.get(m.roomId) ?? null) : m.buildingId;
    return !!b && allowed.has(b);
  };
  if (meter && !visible(meter)) return null;
  return { tenantId, unitId: g.unitId, actorUserId: ctx.actorUserId, meter, visible, roomBld };
}

// ───────────────────────── ข้อเสนอ → รูปสัญญา ─────────────────────────
function toProposal(r: MeterAiProposalRec, pv: MeterPreview | undefined): MeterProposal {
  const ai = r.source === "AI";
  const flag = ai ? (pv?.flag ?? null) : null;
  const reason = ai ? null : MANUAL_REASONS.has(r.manualReason ?? "") ? (r.manualReason as MeterAiManualReason) : "AI_FAILED";
  return {
    proposalId: r.id,
    meterId: r.meterId,
    periodKey: r.periodKey,
    source: r.source,
    manualReason: reason,
    value: ai ? r.value : null,
    confidence: ai ? r.confidence : null,
    prevValue: pv?.prevValue ?? null,
    units: ai ? (pv?.units ?? null) : null,
    flag,
    lowConfidence: ai && r.lowConfidence,
    needsConfirm: ai && (r.lowConfidence || flag !== null),
    createdAt: r.createdAt.toISOString(),
  };
}
async function previewsOf(tenantId: string, unitId: string, P: string, recs: MeterAiProposalRec[], at: Date): Promise<Map<string, MeterPreview>> {
  return meterPreviewMany(tenantId, unitId, P, recs.map((r) => ({ meterId: r.meterId, value: r.source === "AI" ? r.value : null })), at);
}

const REC_SELECT = { id: true, targetId: true, after: true, createdAt: true } as const;
type Tx = Prisma.TransactionClient;
async function findRec(db: Tx, tenantId: string, unitId: string, meterId: string, ref: string): Promise<MeterAiProposalRec | null> {
  const row = await db.auditLog.findFirst({
    where: { tenantId, unitId, action: METER_AI_ACTION, targetType: "DormMeter", targetId: meterId, after: { path: ["ref"], equals: ref } },
    orderBy: { createdAt: "asc" },
    select: REC_SELECT,
  });
  return row ? meterAiRecOf(row) : null;
}

/** ค่า JSON ของข้อเสนอ — ไม่มีรูป/base64/ชื่อ/เบอร์ */
function afterOf(x: {
  periodKey: string; photoSha: string; fileId: string | null; source: "AI" | "MANUAL"; manualReason: MeterAiManualReason | null;
  value: number | null; confidence: number | null; lowConfidence: boolean; model: string | null; tokensIn: number; tokensOut: number; ref: string; charged: boolean;
}) {
  return { ...x };
}

// ───────────────────────── §3.4 ตัวต่อจริง ─────────────────────────
const SYSTEM = [
  "You read the number shown on a utility meter in a photo.",
  "Reply with JSON only: {\"value\": <integer reading without decimals, or null if unreadable>, \"confidence\": <0..1>}.",
  "Ignore red/decimal drums. If the number is unclear, use null.",
].join(" ");

function parseReading(text: string): { value: number | null; confidence: number } {
  const a = text.indexOf("{");
  const z = text.lastIndexOf("}");
  if (a < 0 || z < a) return { value: null, confidence: 0 };
  try {
    const o: unknown = JSON.parse(text.slice(a, z + 1));
    if (!isRec(o)) return { value: null, confidence: 0 };
    const value = typeof o.value === "number" && Number.isFinite(o.value) ? o.value : null;
    const confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : 0;
    return { value, confidence };
  } catch {
    return { value: null, confidence: 0 };
  }
}

/** ตัวต่อจริงของระบบ (provider เดิม · ส่งรูปเดียว) — ไม่มี provider ⇒ null · ไม่หักเงินเอง (ผู้เรียกหักด้วย ref) */
export function defaultMeterReader(ctx: { tenantId: string }): MeterPhotoReader | null {
  void ctx;
  const provider = resolveProvider("smart");
  if (!provider) return null;
  return {
    async read(input) {
      const kind = input.kind === "WATER" ? "water" : "electricity";
      const digits = typeof input.digits === "number" ? `The dial has ${input.digits} digits.` : "The number of digits is unknown.";
      const url = `data:${input.image.contentType};base64,${Buffer.from(input.image.data).toString("base64")}`;
      const r = await provider.chat(
        [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Meter type: ${kind}. ${digits}`, imageUrls: [url] },
        ],
        { maxTokens: 200 },
      );
      const p = parseReading(r.text);
      return { value: p.value, confidence: p.confidence, model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
    },
  };
}

type ReadOut = { ok: true; value: number | null; confidence: number; model: string; tokensIn: number; tokensOut: number } | { ok: false };
/** เรียกตัวอ่านครั้งเดียว · หมดเวลา ⇒ ยกเลิกด้วย signal · ผลที่มาช้าไม่ใช้ */
async function readOnce(reader: MeterPhotoReader, input: Parameters<MeterPhotoReader["read"]>[0], timeoutMs: number): Promise<ReadOut> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const late = new Promise<ReadOut>((resolve) => {
    timer = setTimeout(() => {
      ac.abort();
      resolve({ ok: false });
    }, timeoutMs);
  });
  const call = (async (): Promise<ReadOut> => {
    try {
      const r = await reader.read(input, { signal: ac.signal });
      if (!isRec(r)) return { ok: false };
      return {
        ok: true,
        value: typeof r.value === "number" ? r.value : null,
        confidence: typeof r.confidence === "number" ? r.confidence : Number.NaN,
        model: typeof r.model === "string" && r.model ? r.model.slice(0, 120) : "unknown",
        tokensIn: typeof r.tokensIn === "number" && Number.isFinite(r.tokensIn) ? Math.max(0, Math.round(r.tokensIn)) : 0,
        tokensOut: typeof r.tokensOut === "number" && Number.isFinite(r.tokensOut) ? Math.max(0, Math.round(r.tokensOut)) : 0,
      };
    } catch {
      return { ok: false };
    }
  })();
  try {
    return await Promise.race([call, late]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** หัก 1 ครั้งด้วย ref (ref ซ้ำ ⇒ 0 · ล้ม ⇒ logOps แล้วไปต่อ) · true = หักสำเร็จในครั้งนี้ */
async function chargeOnce(tenantId: string, actorUserId: string, rec: { model: string | null; tokensIn: number; tokensOut: number; ref: string }): Promise<boolean> {
  if (!rec.model) return false;
  try {
    const amount = await chargeUsage({ tenantId }, { source: "CHAT", model: rec.model, tokensIn: rec.tokensIn, tokensOut: rec.tokensOut, userId: actorUserId, note: NOTE, ref: rec.ref });
    return amount > 0;
  } catch (e) {
    await logOps("ERROR", "dorm.meter.ai", "หักเครดิตอ่านเลขมิเตอร์ไม่สำเร็จ (ลองใหม่ครั้งถัดไปด้วย ref เดิม)", { tenantId, detail: e instanceof Error ? e.name : "error" });
    return false;
  }
}
async function markCharged(tenantId: string, unitId: string, rec: MeterAiProposalRec): Promise<void> {
  try {
    await tenantDb({ tenantId }).auditLog.updateMany({
      where: { id: rec.id, tenantId, unitId, action: METER_AI_ACTION },
      data: { after: afterOf({ ...recFields(rec), charged: true }) },
    });
  } catch {
    /* ref กันหักซ้ำอยู่แล้ว — แค่ครั้งหน้าจะลองหักแล้วได้ 0 */
  }
}
function recFields(r: MeterAiProposalRec) {
  return {
    periodKey: r.periodKey, photoSha: r.photoSha, fileId: r.fileId, source: r.source, manualReason: (r.source === "AI" ? null : (r.manualReason as MeterAiManualReason | null)),
    value: r.value, confidence: r.confidence, lowConfidence: r.lowConfidence, model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, ref: r.ref, charged: r.charged,
  };
}
async function dropFile(tenantId: string, fileId: string, injected: boolean): Promise<void> {
  try {
    // ที่เก็บถูกฉีด (deps.put) ⇒ วัตถุไม่ได้อยู่บนที่เก็บจริง ลบแค่ทะเบียน · ปกติ ⇒ ลบทั้งสองซีก
    if (injected) await tenantDb({ tenantId }).fileAsset.deleteMany({ where: { id: fileId } });
    else await deleteFileAsset({ tenantId }, fileId);
  } catch {
    /* best-effort — ไฟล์ส่วนตัวเกิน 1 ใบ ไม่กระทบผล */
  }
}

// ───────────────────────── §3.1 proposeMeterReading ─────────────────────────
export async function proposeMeterReading(
  ctx: MeterCtx,
  input: { unitId: string; meterId: string; periodKey: string; photo: { data: Uint8Array; contentType: string } },
  deps?: ProposeDeps,
): Promise<({ ok: true; cached: boolean; charged: boolean } & MeterProposal) | Fail> {
  if (!isRec(input)) return notFound();
  const g = await gate(ctx, input.unitId, input.meterId);
  if (!g || !g.meter) return notFound();
  const { tenantId, unitId, actorUserId } = g;
  const m = g.meter;
  const P = input.periodKey;
  if (typeof P !== "string" || !PERIOD_RE.test(P)) return fail("INVALID_INPUT", "งวดต้องอยู่ในรูป ปปปป-ดด เช่น 2026-10");
  if (m.removedAt) return fail("METER_REMOVED", "มิเตอร์ตัวนี้ถูกเปลี่ยนไปแล้ว — ถ่ายรูปที่มิเตอร์ตัวใหม่");
  const tdb = tenantDb({ tenantId, unitId });
  const db = tdb as unknown as Tx;
  const confirmed = await db.dormMeterReading.findFirst({ where: { unitId, meterId: m.id, periodKey: P, kind: "PERIOD", confirmedAt: { not: null } }, select: { id: true } });
  if (confirmed) return fail("LOCKED", "เลขงวดนี้ยืนยันแล้ว แก้ไม่ได้");
  if (!photoOk(input.photo)) return fail("INVALID_FILE", "รับเฉพาะรูป JPEG/PNG/WebP ขนาดไม่เกิน 5 MB — ถ่ายใหม่ หรือพิมพ์เลขเอง");
  const photo = { data: input.photo.data, contentType: input.photo.contentType.toLowerCase() };
  const now = deps?.now instanceof Date ? deps.now : new Date();
  const timeoutMs = typeof deps?.timeoutMs === "number" && deps.timeoutMs > 0 ? Math.min(deps.timeoutMs, 60_000) : DEFAULT_TIMEOUT_MS;
  const photoSha = createHash("sha256").update(photo.data).digest("hex");
  const ref = `dorm.meter.ai:${m.id}:${P}:${photoSha}`;
  const injected = !!deps?.put;

  // อัปรูปก่อนเปิดล็อก (งานช้า/connection อื่นอยู่นอก tx) — K มีไฟล์แล้ว ⇒ ไม่อัปซ้ำ
  const before = await findRec(db, tenantId, unitId, m.id, ref);
  let ownFile: string | null = null;
  if (!before?.fileId) {
    const up = await uploadFile({ tenantId }, { kind: "ATTACHMENT", filename: "meter.jpg", contentType: photo.contentType, data: photo.data, visibility: "private" }, deps?.put ? { put: deps.put } : undefined);
    if (!up.ok) return fail("UPLOAD_FAILED", "เก็บรูปไม่สำเร็จ — ลองอีกครั้ง หรือพิมพ์เลขเอง");
    ownFile = up.assetId;
  }

  // ค่าตั้ง/ตัวอ่าน/เครดิต อ่านนอก tx (ห้ามเปิด connection ที่สองระหว่างถือ tx) — ใช้ตามลำดับสัญญาใต้ล็อก
  const on = await aiReadOn(tenantId, unitId);
  const reader = !on ? null : deps && "reader" in deps ? (deps.reader ?? null) : defaultMeterReader({ tenantId });
  let credit = false;
  if (on && reader) {
    try {
      credit = await canSpend(tenantId);
    } catch {
      credit = false;
    }
  }
  const minConf = on && reader && credit ? await minConfidenceOf(tenantId, unitId) : 100;

  type Out = { rec: MeterAiProposalRec; cached: boolean; fresh: boolean; dropOwn: boolean };
  const run = () =>
    tdb.$transaction(
      async (ttx): Promise<Out> => {
        const tx = ttx as unknown as Tx;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dorm.meter.ai:${unitId}:${ref}`}, 0))`;
        const cur = await findRec(tx, tenantId, unitId, m.id, ref);
        if (cur && hasAiResult(cur)) return { rec: cur, cached: true, fresh: false, dropOwn: !!ownFile && cur.fileId !== ownFile };
        const fileId = cur?.fileId ?? ownFile;
        let x: Omit<MeterAiProposalRec, "id" | "meterId" | "createdAt">;
        const base = { periodKey: P, photoSha, fileId, ref, charged: false };
        const manual = (reason: MeterAiManualReason) => ({ ...base, source: "MANUAL" as const, manualReason: reason, value: null, confidence: null, lowConfidence: false, model: null, tokensIn: 0, tokensOut: 0 });
        if (!on) x = manual("AI_OFF");
        else if (!reader) x = manual("NO_PROVIDER");
        else if (!credit) x = manual("NO_CREDIT");
        else {
          const r = await readOnce(reader, { image: { data: photo.data, contentType: photo.contentType }, kind: m.kind, digits: m.digits }, timeoutMs);
          if (!r.ok) x = manual("AI_FAILED");
          else {
            const max = typeof m.digits === "number" && m.digits >= 1 ? 10 ** m.digits - 1 : 999_999_999_999;
            const conf = Number.isFinite(r.confidence) && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : 0;
            const paid = { model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
            if (r.value === null || !Number.isInteger(r.value) || r.value < 0 || r.value > max) x = { ...manual("UNREADABLE"), ...paid };
            else x = { ...base, source: "AI", manualReason: null, value: r.value, confidence: conf, lowConfidence: Math.round(conf * 10_000) / 100 < minConf, ...paid };
          }
        }
        const after = afterOf({ ...x, manualReason: x.manualReason as MeterAiManualReason | null });
        if (cur) {
          await tx.auditLog.updateMany({ where: { id: cur.id, tenantId, unitId, action: METER_AI_ACTION }, data: { after, actorId: actorUserId } });
          return { rec: { ...x, id: cur.id, meterId: m.id, createdAt: cur.createdAt }, cached: false, fresh: true, dropOwn: !!ownFile && fileId !== ownFile };
        }
        const row = await tx.auditLog.create({
          data: { tenantId, unitId, actorType: "USER", actorId: actorUserId, action: METER_AI_ACTION, targetType: "DormMeter", targetId: m.id, after },
          select: { id: true, createdAt: true },
        });
        return { rec: { ...x, id: row.id, meterId: m.id, createdAt: row.createdAt }, cached: false, fresh: true, dropOwn: false };
      },
      { maxWait: 10_000, timeout: timeoutMs + 15_000 },
    );

  let out: Out | null = null;
  for (let attempt = 0; attempt < 2 && !out; attempt++) {
    try {
      out = await run();
    } catch (e) {
      if (!isDeadlock(e)) {
        if (ownFile) await dropFile(tenantId, ownFile, injected);
        await logOps("ERROR", "dorm.meter.ai", "เสนอเลขมิเตอร์จากรูปไม่สำเร็จ", { tenantId, detail: e instanceof Error ? e.name : "error" });
        return fail("UNAVAILABLE", "ระบบอ่านเลขขัดข้อง — พิมพ์เลขเองได้ตามปกติ");
      }
    }
  }
  if (!out) {
    if (ownFile) await dropFile(tenantId, ownFile, injected);
    return fail("BUSY", "ระบบกำลังทำรายการนี้อยู่ — ลองอีกครั้งในอีกสักครู่");
  }
  if (out.dropOwn && ownFile) await dropFile(tenantId, ownFile, injected);

  // หักเงินนอก tx · ตัวอ่านตอบสำเร็จ (AI หรืออ่านไม่ออก) เท่านั้น · cached ที่ยังไม่เคยหักสำเร็จ ⇒ ลองด้วย ref เดิม (ref กันซ้ำ)
  let charged = false;
  if (hasAiResult(out.rec) && !out.rec.charged) {
    charged = await chargeOnce(tenantId, actorUserId, out.rec);
    if (charged) await markCharged(tenantId, unitId, out.rec);
  }
  const pv = (await previewsOf(tenantId, unitId, P, [out.rec], now)).get(m.id);
  return { ok: true, cached: out.cached, charged, ...toProposal(out.rec, pv) };
}

// ───────────────────────── §3.2 meterProposals ─────────────────────────
export async function meterProposals(ctx: MeterCtx, input: { unitId: string; periodKey: string }): Promise<MeterProposal[]> {
  if (!isRec(input) || typeof input.periodKey !== "string" || !PERIOD_RE.test(input.periodKey)) return [];
  const g = await gate(ctx, input.unitId);
  if (!g) return [];
  const { tenantId, unitId } = g;
  const P = input.periodKey;
  const db = tenantDb({ tenantId, unitId });
  const rows = await db.auditLog.findMany({
    where: { tenantId, unitId, action: METER_AI_ACTION, targetType: "DormMeter", after: { path: ["periodKey"], equals: P } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: REC_SELECT,
    take: 2000,
  });
  const latest = new Map<string, MeterAiProposalRec>();
  for (const row of rows) {
    const r = meterAiRecOf(row);
    if (r && r.periodKey === P && !latest.has(r.meterId)) latest.set(r.meterId, r);
  }
  if (!latest.size) return [];
  const ids = [...latest.keys()];
  const meters = await db.dormMeter.findMany({ where: { unitId, id: { in: ids }, removedAt: null }, select: { id: true, roomId: true, buildingId: true } });
  const done = new Set((await db.dormMeterReading.findMany({ where: { unitId, meterId: { in: ids }, periodKey: P, kind: "PERIOD" }, select: { meterId: true } })).map((x) => x.meterId));
  const keep = meters.filter((mm) => !done.has(mm.id) && g.visible(mm)).map((mm) => latest.get(mm.id) as MeterAiProposalRec);
  if (!keep.length) return [];
  const pv = await previewsOf(tenantId, unitId, P, keep, new Date());
  return keep.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => toProposal(r, pv.get(r.meterId)));
}

// ───────────────────────── §3.3 meterAiStatus (อ่านอย่างเดียว) ─────────────────────────
export async function meterAiStatus(ctx: MeterCtx, input: { unitId: string }): Promise<{ enabled: boolean; available: boolean; minConfidence: number }> {
  const g = isRec(input) ? await gate(ctx, input.unitId) : null;
  if (!g) {
    const tenantId = isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : null;
    const v = tenantId ? await minConfidenceOf(tenantId, null) : Number(registryDefault(KEY_MIN));
    return { enabled: false, available: false, minConfidence: v };
  }
  const enabled = await aiReadOn(g.tenantId, g.unitId);
  const minConfidence = await minConfidenceOf(g.tenantId, g.unitId);
  let available = false;
  if (enabled && resolveProvider("smart") !== null) {
    try {
      available = await canSpendPeek(g.tenantId);
    } catch {
      available = false;
    }
  }
  return { enabled, available, minConfidence };
}
