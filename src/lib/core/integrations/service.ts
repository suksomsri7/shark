// service.ts — ศูนย์เชื่อมต่อ (SVC R0.5 · CC §2 · ใบสั่ง §3) — ผู้เขียนเดียวของ TenantIntegration / IntegrationCallLog
//
// 🔴 คำปฏิเสธคืนเป็นข้อมูล {ok:false, code, message(ไทย)} เสมอ — ไม่โยน · getIntegration/callIntegration ไม่โยน
// 🔴 ค่าลับอยู่ใน secretBox ก้อนเดียว (secret-box.ts) — ไม่มีค่าลับใน DTO/audit/event/call log/console · lastError = ข้อความไทยของระบบ
//    (ไม่ใช่ error.message ของผู้ให้บริการ — ข้อความดิบอาจสะท้อนคีย์ · carry R0.8)
// 🔴 สิทธิ์: save/test/disable = OWNER หรือ permissions["settings.integrations.manage"] === true ตรงตัว (ไม่นับ settings.* · MANAGER ไม่ได้โดยปริยาย)
//    ผู้ไม่ใช่ OWNER ที่จำกัดหน่วย แตะได้เฉพาะแถวที่ unitIds ไม่ว่างและอยู่ในหน่วยตนทั้งหมด · list = OWNER · ผู้มีคีย์ · MANAGER (อ่านอย่างเดียว)
// 🔴 actor มาจากผู้เรียก (action อ่าน session/membership) — service ไม่อ่าน Membership ซ้ำ (แบบ POS integration-creds)
import { createHash, randomUUID } from "node:crypto";
import type { Prisma, TenantIntegration } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { integrationSecretKeyConfigured, openIntegrationSecret, sealIntegrationSecret } from "./secret-box";
import { integrationCatalog, isStoredKind, providerDef } from "./registry";
import type {
  CallCode,
  CallResult,
  FieldView,
  IntegrationActor,
  IntegrationCtx,
  IntegrationHandle,
  IntegrationOnFailure,
  IntegrationStatus,
  IntegrationView,
  ListIntegrationsResult,
  ProviderDef,
  ProviderField,
  Refusal,
  RefusalCode,
  SaveIntegrationResult,
  StoredIntegrationKind,
  TestIntegrationResult,
  VirtualView,
  AdapterOf,
} from "./types";

export const INTEGRATIONS_MANAGE_KEY = "settings.integrations.manage";
export const INTEGRATION_CALL_LOG_RETENTION_DAYS = 30;
/** ล้มติดกันกี่ครั้งจึงตกเป็น ERROR (CC §2.3) */
export const INTEGRATION_FAILURE_THRESHOLD = 5;
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 120_000;
const DAY_MS = 86_400_000;
const VALUE_MAX = 4000;
const LABEL_MAX = 80;
const UNITS_MAX = 100;
const PURGE_BATCH = 1000;

// ข้อความถึงผู้ใช้ — ไม่มีชื่อ env (มติผู้ตรวจ R0.5 ข้อ 12)
const KEY_MISSING = "ยังไม่ตั้งกุญแจ — ระบบยังไม่พร้อมเก็บคีย์ ติดต่อทีม SHARK";
const KEY_MISMATCH = "กุญแจเข้ารหัสของศูนย์เชื่อมต่อไม่ตรงกับที่ใช้บันทึกคีย์เดิม — วางคีย์ของผู้ให้บริการใหม่อีกครั้ง";
const MSG: Record<RefusalCode, string> = {
  NOT_FOUND: "ไม่พบการเชื่อมต่อนี้ในร้าน",
  PERMISSION_DENIED: "การเชื่อมต่อนี้แก้ได้เฉพาะเจ้าของร้าน หรือผู้ที่เจ้าของร้านให้สิทธิ์จัดการศูนย์เชื่อมต่อ (เฉพาะหน่วยที่ดูแล)",
  VALIDATION: "ข้อมูลการเชื่อมต่อไม่ถูกต้อง",
  NOT_CONFIGURED: KEY_MISSING,
  UNKNOWN: "ระบบขัดข้องชั่วคราว — ลองอีกครั้ง",
};
/** ข้อความล้มของระบบ (ไทย · ≤ 200) — ไม่เคยมาจากผู้ให้บริการ */
const CALL_ERROR_TEXT: Record<CallCode, string> = {
  PROVIDER_ERROR: "ผู้ให้บริการปฏิเสธหรือขัดข้อง — ตรวจคีย์/บัญชีที่ผู้ให้บริการแล้วทดสอบอีกครั้ง",
  TIMEOUT: "ผู้ให้บริการไม่ตอบภายในเวลาที่กำหนด — ลองทดสอบอีกครั้งภายหลัง",
  QUOTA: "โควตาของผู้ให้บริการหมด — เติมแพ็กเกจที่ผู้ให้บริการแล้วทดสอบอีกครั้ง",
  NOT_READY: "ตัวเชื่อมยังไม่พร้อมใช้งาน",
};

const refuse = (code: RefusalCode, message?: string): Refusal => ({ ok: false, code, message: message ?? MSG[code] });
const DUPLICATE_LABEL_MSG = "มีการเชื่อมต่อชื่อนี้อยู่แล้ว — ตั้งชื่ออื่น";
const duplicateLabel = (): Refusal => ({ ok: false, code: "VALIDATION", message: DUPLICATE_LABEL_MSG, detail: "DUPLICATE_LABEL" });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const CONTROL = /[\u0000-\u001f\u007f]/;
/** ค่าลับขึ้นบรรทัดใหม่ได้ (เช่น private key แบบ PEM) — ยังกันอักขระควบคุมอื่น (มติผู้ตรวจ R0.5 ข้อ 9) */
const SECRET_CONTROL = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/;
/** AAD ของกล่อง = ผูกกับร้าน + แถว (ย้ายกล่องข้ามแถว/ร้าน = เปิดไม่ได้ · มติผู้ตรวจ R0.5 ข้อ 8) */
const aadOf = (row: { tenantId: string; id: string }) => `${row.tenantId}:${row.id}`;
/** เวอร์ชันคีย์ของแถว — เทียบใต้ล็อกตอนบันทึกผลการเรียก (คีย์เปลี่ยนระหว่างเรียก ⇒ ไม่ตั้ง CONNECTED · ข้อ 10) */
const boxVersion = (box: string | null | undefined) => createHash("sha256").update(box ?? "").digest("hex");
const errName = (e: unknown) => (e instanceof Error ? e.name : "error");

// ─────────────────── ผู้กระทำ / สิทธิ์ ───────────────────
function ctxOf(ctx: unknown): IntegrationCtx | null {
  return isRecord(ctx) && isId(ctx.tenantId) ? { tenantId: ctx.tenantId } : null;
}

function actorOf(actor: unknown): IntegrationActor | null {
  if (!isRecord(actor) || typeof actor.userId !== "string" || !actor.userId) return null;
  if (actor.role !== "OWNER" && actor.role !== "MANAGER" && actor.role !== "STAFF") return null;
  const unitAccess = Array.isArray(actor.unitAccess) ? actor.unitAccess.filter((u): u is string => typeof u === "string") : [];
  const permissions = isRecord(actor.permissions) ? actor.permissions : {};
  return { userId: actor.userId, role: actor.role, unitAccess, permissions };
}

/** จัดการศูนย์ฯ ได้ไหม — OWNER หรือคีย์ตรงตัวเท่านั้น (wildcard `settings.*` ไม่นับ) */
export function canManageIntegrations(a: IntegrationActor): boolean {
  return a.role === "OWNER" || a.permissions[INTEGRATIONS_MANAGE_KEY] === true;
}

const unitLimited = (a: IntegrationActor) => a.role !== "OWNER" && !a.unitAccess.includes("*");

/** แถวที่มี unitIds นี้อยู่ในขอบเขตของผู้กระทำไหม ([] = ทุกหน่วย ⇒ เฉพาะผู้ไม่จำกัดหน่วย) */
function withinUnits(a: IntegrationActor, unitIds: readonly string[]): boolean {
  if (!unitLimited(a)) return true;
  return unitIds.length > 0 && unitIds.every((u) => a.unitAccess.includes(u));
}

// ─────────────────── มุมมอง (ไม่มีค่าลับ) ───────────────────
function maskSecret(v: string): string {
  return v.length <= 8 ? "••••" : `••••${v.slice(-4)}`;
}

function stringRecord(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isRecord(v)) for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  return out;
}

/** นิยามฟิลด์ของแถว — ผู้ให้บริการปิดอยู่ (เช่น FAKE นอก QC) ⇒ อนุมานจาก secretNames/publicFields */
function fieldDefsOf(row: TenantIntegration): readonly ProviderField[] {
  const def = providerDef(row.kind, row.provider);
  if (def) return def.fields;
  const pub = stringRecord(row.publicFields);
  return [
    ...row.secretNames.map((name) => ({ name, label: name, secret: true, required: true })),
    ...Object.keys(pub).map((name) => ({ name, label: name, secret: false, required: false })),
  ];
}

const asStatus = (s: string): IntegrationStatus => (s === "CONNECTED" || s === "ERROR" || s === "DISABLED" ? s : "DRAFT");
const asOnFailure = (s: string): IntegrationOnFailure => (s === "REJECT" ? "REJECT" : "MANUAL");

function viewOf(row: TenantIntegration): IntegrationView {
  const pub = stringRecord(row.publicFields);
  const names = new Set(row.secretNames);
  const opened = names.size && row.secretBox ? openIntegrationSecret(row.secretBox, aadOf(row)) : null;
  const fields: FieldView[] = fieldDefsOf(row).map((f) => {
    if (f.secret) {
      const filled = names.has(f.name);
      const v = opened && typeof opened[f.name] === "string" ? (opened[f.name] as string) : "";
      return { name: f.name, label: f.label, secret: true, required: f.required, filled, masked: filled ? (v ? maskSecret(v) : "••••") : "" };
    }
    const v = pub[f.name] ?? "";
    return { name: f.name, label: f.label, secret: false, required: f.required, filled: v !== "", masked: v };
  });
  return {
    id: row.id,
    kind: row.kind as StoredIntegrationKind,
    provider: row.provider,
    label: row.label,
    unitIds: [...row.unitIds],
    status: asStatus(row.status),
    onFailure: asOnFailure(row.onFailure),
    fields,
    lastTestAt: row.lastTestAt ? row.lastTestAt.toISOString() : null,
    lastTestOk: row.lastTestOk,
    lastError: row.lastError,
    consecutiveFailures: row.consecutiveFailures,
    virtual: false,
  };
}

// ─────────────────── ประตู handle ───────────────────
/** ข้อมูลภายในของ handle (ไม่อยู่ใน JSON ของ handle) */
const HANDLE_META = new WeakMap<object, { tenantId: string; version: string }>();

function makeHandle(row: TenantIntegration, adapter: AdapterOf<StoredIntegrationKind>): IntegrationHandle {
  const h: IntegrationHandle = {
    integrationId: row.id,
    kind: row.kind as StoredIntegrationKind,
    provider: row.provider,
    onFailure: asOnFailure(row.onFailure),
    adapter,
  };
  HANDLE_META.set(h, { tenantId: row.tenantId, version: boxVersion(row.secretBox) });
  return h;
}

type Built = { ok: true; adapter: AdapterOf<StoredIntegrationKind> } | { ok: false; why: "BOX" | "INCOMPLETE" };

/** เปิดกล่อง + สร้าง adapter (ค่าลับอยู่ใน closure) */
function buildAdapter(row: TenantIntegration, def: ProviderDef): Built {
  const secrets: Record<string, string> = {};
  if (row.secretNames.length) {
    const opened = openIntegrationSecret(row.secretBox, aadOf(row));
    if (!opened) return { ok: false, why: "BOX" };
    for (const n of row.secretNames) if (typeof opened[n] === "string") secrets[n] = opened[n] as string;
  }
  const publicFields = stringRecord(row.publicFields);
  for (const f of def.fields) {
    if (!f.required) continue;
    const v = f.secret ? secrets[f.name] : publicFields[f.name];
    if (!v) return { ok: false, why: "INCOMPLETE" };
  }
  return { ok: true, adapter: def.create(row.kind as StoredIntegrationKind, { secrets, publicFields }) };
}

/**
 * ประตูของผู้ใช้ตัวเชื่อม (CC §2.3) — null = ไม่เชื่อม/ปิด/ไม่ครอบคลุมหน่วย ⇒ ผู้เรียกใช้ทางมือ · ไม่โยน
 * นับแถว CONNECTED/ERROR (ERROR ยังเรียกได้ เพื่อฟื้น) · ไม่ส่ง unitId = นับเฉพาะแถวทุกหน่วย · แถวระบุหน่วยชนะ → updatedAt ล่าสุด
 */
export async function getIntegration<K extends StoredIntegrationKind>(
  ctx: { tenantId: string; unitId?: string },
  kind: K,
): Promise<IntegrationHandle<K> | null> {
  try {
    if (!isRecord(ctx) || !isId(ctx.tenantId) || !isStoredKind(kind)) return null;
    const unitId = ctx.unitId === undefined || ctx.unitId === null ? null : ctx.unitId;
    if (unitId !== null && !isId(unitId)) return null;
    if (!integrationSecretKeyConfigured()) return null;
    const rows = await prisma.tenantIntegration.findMany({
      where: {
        tenantId: ctx.tenantId,
        kind,
        status: { in: ["CONNECTED", "ERROR"] },
        OR: unitId ? [{ unitIds: { isEmpty: true } }, { unitIds: { has: unitId } }] : [{ unitIds: { isEmpty: true } }],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    // หน่วยเฉพาะ > CONNECTED ก่อน ERROR > updatedAt ล่าสุด (มติผู้ตรวจ R0.5 ข้อ 3)
    const rank = (r: TenantIntegration) => (r.unitIds.length > 0 ? 0 : 2) + (r.status === "CONNECTED" ? 0 : 1);
    const pick = [...rows].sort((x, y) => rank(x) - rank(y) || y.updatedAt.getTime() - x.updatedAt.getTime() || x.id.localeCompare(y.id))[0];
    if (!pick) return null;
    const def = providerDef(pick.kind, pick.provider);
    if (!def) return null;
    const built = buildAdapter(pick, def);
    if (!built.ok) return null;
    return makeHandle(pick, built.adapter) as unknown as IntegrationHandle<K>;
  } catch (e) {
    console.error("[integrations] get", errName(e));
    return null;
  }
}

const TIMEOUT = Symbol("integration-timeout");

/** แข่งกับเวลา — หมดเวลา = abort signal ที่ส่งให้ adapter แล้วโยน TIMEOUT */
function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(TIMEOUT);
    }, ms);
  });
  const work = Promise.resolve().then(() => run(ac.signal));
  work.catch(() => undefined); // งานที่ถูก abort หลังหมดเวลา — ไม่ให้เป็น unhandled rejection
  return Promise.race([work, t]).finally(() => clearTimeout(timer));
}

function isHandle(h: unknown): h is IntegrationHandle {
  return isRecord(h) && typeof h.integrationId === "string" && isStoredKind(h.kind) && typeof h.provider === "string" && isRecord(h.adapter);
}

type HandleMeta = { tenantId: string; version: string };

/**
 * call log + ตัวนับล้ม/สถานะ/event (ใต้ล็อกแถว · atomic) — ไม่โยน
 * 🔴 คีย์ของแถวเปลี่ยนระหว่างเรียก (เวอร์ชันกล่องไม่ตรง) ⇒ ไม่แตะสถานะ/ตัวนับ (ผลนั้นเป็นของคีย์เก่า) — call log ยังเขียน
 * 🔴 ล้มครบ 5 ⇒ ERROR · integration.failed เฉพาะแถวที่ CONNECTED อยู่ (DRAFT ล้มครบ 5 ⇒ ERROR เงียบ — ไม่เคยใช้งานจริง)
 */
async function recordCall(meta: HandleMeta, h: IntegrationHandle, op: string, ok: boolean, ms: number, code: CallCode | null): Promise<boolean> {
  const tenantId = meta.tenantId;
  try {
    await prisma.integrationCallLog.create({ data: { tenantId, integrationId: h.integrationId, op, ok, ms, code } });
  } catch (e) {
    console.error("[integrations] call log", errName(e));
  }
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: string; consecutiveFailures: number; kind: string; provider: string; secretBox: string | null }[]>`
        SELECT "status", "consecutiveFailures", "kind", "provider", "secretBox" FROM "TenantIntegration"
        WHERE "id" = ${h.integrationId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const cur = rows[0];
      if (!cur || cur.status === "DISABLED") return false;
      if (boxVersion(cur.secretBox) !== meta.version) return false;
      const payload = { integrationId: h.integrationId, kind: cur.kind, provider: cur.provider };
      if (ok) {
        if (cur.status === "CONNECTED" && cur.consecutiveFailures === 0) return true;
        await tx.tenantIntegration.update({ where: { id: h.integrationId }, data: { consecutiveFailures: 0, status: "CONNECTED" } });
        if (cur.status !== "CONNECTED") {
          await emitOutbox(tx, { tenantId, type: "integration.connected", idempotencyKey: `integration.connected#${h.integrationId}#${randomUUID()}`, payload, unitId: null });
        }
        return true;
      }
      const n = cur.consecutiveFailures + 1;
      // ครบ 5 ⇒ ERROR ทุกแถวที่ยังไม่ ERROR · event integration.failed เฉพาะแถวที่เคยใช้งานได้ (CONNECTED) — DRAFT ไม่มี event (ข้อ 6)
      const toError = n >= INTEGRATION_FAILURE_THRESHOLD && cur.status !== "ERROR";
      await tx.tenantIntegration.update({ where: { id: h.integrationId }, data: { consecutiveFailures: n, ...(toError ? { status: "ERROR" } : {}) } });
      if (toError && cur.status === "CONNECTED") {
        await emitOutbox(tx, { tenantId, type: "integration.failed", idempotencyKey: `integration.failed#${h.integrationId}#${randomUUID()}`, payload, unitId: null });
      }
      return true;
    });
  } catch (e) {
    console.error("[integrations] call state", errName(e));
    return false;
  }
}

/** เรียกจริง (ใช้ร่วม callIntegration/testIntegration) — คืนผล + ว่าสถานะแถวถูกบันทึกตามผลนี้ไหม */
async function invoke<K extends StoredIntegrationKind, T>(
  handle: IntegrationHandle<K>,
  op: string,
  fn: (adapter: AdapterOf<K>, ctl: { signal: AbortSignal }) => Promise<T>,
  opts?: { timeoutMs?: number },
): Promise<{ result: CallResult<T>; applied: boolean }> {
  const fallback: IntegrationOnFailure = isRecord(handle) && handle.onFailure === "REJECT" ? "REJECT" : "MANUAL";
  // handle ที่ไม่ได้มาจาก getIntegration (ไม่มี meta) = ไม่พร้อม — ไม่ค้นฐาน ไม่เขียน log (ข้อ 7)
  const meta = isHandle(handle) ? HANDLE_META.get(handle) : undefined;
  if (!meta || typeof fn !== "function") return { result: { ok: false, code: "NOT_READY", fallback }, applied: false };
  const opName = typeof op === "string" && op.trim() ? op.trim().slice(0, 64) : "call";
  const t = opts?.timeoutMs;
  const timeoutMs = typeof t === "number" && Number.isFinite(t) && t > 0 ? Math.min(t, MAX_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  const t0 = performance.now();
  let result: CallResult<T>;
  try {
    const value = await withTimeout((signal) => fn(handle.adapter, { signal }), timeoutMs);
    result = { ok: true, value };
  } catch (e) {
    const code: CallCode = e === TIMEOUT ? "TIMEOUT" : isRecord(e) && e.code === "QUOTA" ? "QUOTA" : "PROVIDER_ERROR";
    result = { ok: false, code, fallback };
  }
  const ms = Math.max(0, Math.round(performance.now() - t0));
  const applied = await recordCall(meta, handle, opName, result.ok, ms, result.ok ? null : result.code);
  return { result, applied };
}

/**
 * เรียกผู้ให้บริการผ่าน handle (CC §2.3) — ไม่โยน · fn โยน ⇒ PROVIDER_ERROR (code "QUOTA" ⇒ QUOTA) · เกินเวลา ⇒ TIMEOUT
 * fn ได้ `{ signal }` — ถูก abort เมื่อหมดเวลา (adapter ที่มีผลข้างเคียงต้องเคารพ + ส่ง idempotency ref)
 * เขียน IntegrationCallLog ทุกครั้ง (code เท่านั้น — ไม่มีข้อความดิบ) · แถว CONNECTED ล้มครบ 5 ⇒ ERROR + integration.failed ครั้งเดียว ·
 * ผ่าน ⇒ ตัวนับ 0 และ (ถ้าเดิมไม่ใช่ CONNECTED) CONNECTED + integration.connected
 */
export async function callIntegration<K extends StoredIntegrationKind, T>(
  handle: IntegrationHandle<K>,
  op: string,
  fn: (adapter: AdapterOf<K>, ctl: { signal: AbortSignal }) => Promise<T>,
  opts?: { timeoutMs?: number },
): Promise<CallResult<T>> {
  try {
    return (await invoke(handle, op, fn, opts)).result;
  } catch (e) {
    console.error("[integrations] call", errName(e));
    return { ok: false, code: "PROVIDER_ERROR", fallback: isRecord(handle) && handle.onFailure === "REJECT" ? "REJECT" : "MANUAL" };
  }
}

// ─────────────────── บันทึก ───────────────────
type Patch = { def: ProviderField; value: string }[];
type ParsedSave = {
  id: string | null;
  kind: StoredIntegrationKind;
  provider: ProviderDef;
  create: boolean;
  label: string | undefined;
  unitIds: string[] | undefined;
  onFailure: IntegrationOnFailure | undefined;
  patch: Patch;
};
const SAVE_KEYS = new Set(["id", "create", "kind", "provider", "label", "unitIds", "onFailure", "fields"]);

function parseSave(input: unknown): ParsedSave | Refusal {
  if (!isRecord(input)) return refuse("VALIDATION");
  if (Object.keys(input).some((k) => !SAVE_KEYS.has(k))) return refuse("VALIDATION", "มีช่องข้อมูลที่ระบบไม่รู้จัก");
  const id = input.id === undefined || input.id === null ? null : input.id;
  if (id !== null && !isId(id)) return refuse("NOT_FOUND");
  if (input.create !== undefined && typeof input.create !== "boolean") return refuse("VALIDATION");
  const create = input.create === true;
  if (create && id !== null) return refuse("VALIDATION", "โหมดสร้างใหม่ส่งรหัสการเชื่อมต่อเดิมมาด้วยไม่ได้");
  if (!isStoredKind(input.kind)) return refuse("VALIDATION", "ชนิดนี้ตั้งค่าในศูนย์เชื่อมต่อไม่ได้ (LINE/พร้อมเพย์ จัดการที่หน้าของระบบนั้น)");
  const provider = providerDef(input.kind, input.provider);
  if (!provider) return refuse("VALIDATION", "ไม่รู้จักผู้ให้บริการนี้ หรือยังไม่เปิดให้ใช้");
  let onFailure: IntegrationOnFailure | undefined;
  if (input.onFailure !== undefined) {
    if (input.onFailure !== "MANUAL" && input.onFailure !== "REJECT") return refuse("VALIDATION", "เลือกได้แค่ ส่งเข้าคิวตรวจมือ หรือ ปฏิเสธ");
    onFailure = input.onFailure;
  }
  let label: string | undefined;
  if (input.label !== undefined) {
    if (typeof input.label !== "string") return refuse("VALIDATION", "ชื่อการเชื่อมต่อไม่ถูกต้อง");
    label = input.label.trim();
    if (!label || label.length > LABEL_MAX || CONTROL.test(label)) return refuse("VALIDATION", `ตั้งชื่อการเชื่อมต่อ 1–${LABEL_MAX} ตัวอักษร`);
  }
  let unitIds: string[] | undefined;
  if (input.unitIds !== undefined) {
    if (!Array.isArray(input.unitIds) || input.unitIds.length > UNITS_MAX || !input.unitIds.every(isId)) return refuse("VALIDATION", "หน่วยธุรกิจที่เลือกไม่ถูกต้อง");
    unitIds = [...new Set(input.unitIds as string[])].sort();
  }
  const patch: Patch = [];
  if (input.fields !== undefined) {
    if (!isRecord(input.fields)) return refuse("VALIDATION");
    const byName = new Map(provider.fields.map((f) => [f.name, f]));
    for (const [name, value] of Object.entries(input.fields)) {
      const def = byName.get(name);
      if (!def) return refuse("VALIDATION", `ผู้ให้บริการนี้ไม่มีช่อง ${name.slice(0, 40)}`);
      if (typeof value !== "string" || value.length > VALUE_MAX || (def.secret ? SECRET_CONTROL : CONTROL).test(value)) return refuse("VALIDATION", `ค่าของช่อง ${def.label} ไม่ถูกต้อง`);
      patch.push({ def, value: value.trim() });
    }
  }
  return { id, create, kind: input.kind, provider, label, unitIds, onFailure, patch };
}

/** บันทึก (patch) — ฟิลด์ไม่ส่ง = คงเดิม · "" = ล้าง · ไม่เปลี่ยน status (แถวใหม่ = DRAFT) */
export async function saveIntegration(ctx: IntegrationCtx, actor: IntegrationActor, input: unknown): Promise<SaveIntegrationResult> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const a = actorOf(actor);
    if (!a || !canManageIntegrations(a)) return refuse("PERMISSION_DENIED");
    const p = parseSave(input);
    if ("ok" in p) return p;
    const touchesSecret = p.patch.some((x) => x.def.secret);
    // 🔴 ไม่มีกุญแจ = แตะค่าลับไม่ได้เลย (ไม่เก็บ plaintext · ไม่มีกุญแจสำรอง)
    if (touchesSecret && !integrationSecretKeyConfigured()) return refuse("NOT_CONFIGURED", KEY_MISSING);
    if (p.unitIds?.length) {
      const n = await prisma.businessUnit.count({ where: { tenantId: c.tenantId, id: { in: p.unitIds } } });
      if (n !== p.unitIds.length) return refuse("VALIDATION", "หน่วยธุรกิจที่เลือกไม่ใช่ของร้านนี้");
    }

    const out = await prisma.$transaction(async (tx) => {
      let prev: TenantIntegration | null;
      if (p.id) {
        await tx.$queryRaw`SELECT "id" FROM "TenantIntegration" WHERE "id" = ${p.id} AND "tenantId" = ${c.tenantId} FOR UPDATE`;
        prev = await tx.tenantIntegration.findFirst({ where: { id: p.id, tenantId: c.tenantId } });
        if (!prev) return { refused: refuse("NOT_FOUND") };
        if (prev.kind !== p.kind || prev.provider !== p.provider.code) return { refused: refuse("VALIDATION", "เปลี่ยนชนิด/ผู้ให้บริการของการเชื่อมต่อเดิมไม่ได้ — สร้างการเชื่อมต่อใหม่แทน") };
      } else {
        if (!p.label) return { refused: refuse("VALIDATION", "ตั้งชื่อการเชื่อมต่อก่อนบันทึก") };
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`integrations:${c.tenantId}:${p.kind}:${p.provider.code}:${p.label}`}))::text AS locked`;
        prev = await tx.tenantIntegration.findFirst({ where: { tenantId: c.tenantId, kind: p.kind, provider: p.provider.code, label: p.label } });
        // โหมดสร้างใหม่: ชื่อชนแถวเดิม ⇒ ปฏิเสธ (ไม่ทับแถวเดิมเงียบ ๆ · มติผู้ตรวจ R0.5 ข้อ 1)
        if (prev && p.create) return { refused: duplicateLabel() };
      }
      if (prev && !withinUnits(a, prev.unitIds)) return { refused: refuse("PERMISSION_DENIED") };
      const nextUnitIds = p.unitIds ?? prev?.unitIds ?? [];
      if (!withinUnits(a, nextUnitIds)) return { refused: refuse("PERMISSION_DENIED") };
      const nextLabel = p.label ?? prev?.label ?? "";
      if (prev && nextLabel !== prev.label) {
        const clash = await tx.tenantIntegration.count({ where: { tenantId: c.tenantId, kind: p.kind, provider: p.provider.code, label: nextLabel, id: { not: prev.id } } });
        if (clash) return { refused: duplicateLabel() };
      }

      const pub = stringRecord(prev?.publicFields);
      const changed: string[] = [];
      for (const { def, value } of p.patch) {
        if (def.secret) continue;
        if ((pub[def.name] ?? "") !== value) changed.push(def.name);
        if (value === "") delete pub[def.name];
        else pub[def.name] = value;
      }
      let secretBox = prev?.secretBox ?? null;
      let secretNames = prev?.secretNames ?? [];
      let gotNewSecret = false;
      let toSeal: Record<string, string> | null = null; // แถวใหม่: ปิดกล่องหลังได้ id (AAD = ร้าน:แถว)
      if (touchesSecret) {
        const secrets: Record<string, string> = {};
        // กุญแจเปลี่ยน (กล่องเดิมเปิดไม่ได้) ⇒ เริ่มกล่องใหม่จากค่าที่ส่งมา (ค่าลับเดิมหาย — ไม่โยน)
        const opened = prev?.secretBox ? openIntegrationSecret(prev.secretBox, aadOf(prev)) : null;
        const secretDefs = new Set(p.provider.fields.filter((f) => f.secret).map((f) => f.name));
        if (opened) for (const [k, v] of Object.entries(opened)) if (typeof v === "string" && v && secretDefs.has(k)) secrets[k] = v;
        for (const { def, value } of p.patch) {
          if (!def.secret) continue;
          changed.push(def.name);
          if (value === "") delete secrets[def.name];
          else {
            secrets[def.name] = value;
            gotNewSecret = true;
          }
        }
        secretNames = Object.keys(secrets).sort();
        if (prev) secretBox = secretNames.length ? sealIntegrationSecret(secrets, aadOf(prev)) : null;
        else {
          secretBox = null;
          toSeal = secretNames.length ? secrets : null;
        }
      }
      const onFailure = p.onFailure ?? asOnFailure(prev?.onFailure ?? "MANUAL");
      // แถวใหม่ = DRAFT · บันทึกไม่เปลี่ยน status — ยกเว้นแถวที่ถอดแล้ว (DISABLED) ได้คีย์ลับใหม่ ⇒ DRAFT (ทางเดียวที่จะต่อใหม่ได้)
      const revive = !!prev && prev.status === "DISABLED" && gotNewSecret;
      const status = !prev || revive ? "DRAFT" : prev.status;
      const data = {
        // ต่อใหม่จาก DISABLED = เริ่มนับใหม่ทั้งหมด (มติผู้ตรวจ R0.5 ข้อ 4)
        ...(revive ? { consecutiveFailures: 0, lastTestOk: null, lastTestAt: null, lastError: null } : {}),
        label: nextLabel,
        unitIds: nextUnitIds,
        onFailure,
        status,
        publicFields: pub as Prisma.InputJsonObject,
        secretBox,
        secretNames,
        updatedById: a.userId,
      };
      let row = prev
        ? await tx.tenantIntegration.update({ where: { id: prev.id }, data })
        : await tx.tenantIntegration.create({ data: { ...data, tenantId: c.tenantId, kind: p.kind, provider: p.provider.code, createdById: a.userId } });
      if (!prev && toSeal) row = await tx.tenantIntegration.update({ where: { id: row.id }, data: { secretBox: sealIntegrationSecret(toSeal, aadOf(row)) } });
      const before = prev ? { label: prev.label, unitIds: prev.unitIds, onFailure: prev.onFailure, status: prev.status } : null;
      const after = { label: row.label, unitIds: row.unitIds, onFailure: row.onFailure, status: row.status, kind: row.kind, provider: row.provider, fields: [...new Set(changed)].sort() };
      return { row, before, after };
    });
    if ("refused" in out) return out.refused!;
    await writeAudit({
      tenantId: c.tenantId,
      actorId: a.userId,
      action: "settings.integration.save",
      targetType: "TenantIntegration",
      targetId: out.row.id,
      before: out.before,
      after: out.after,
    });
    return { ok: true, integration: viewOf(out.row) };
  } catch (e) {
    if (isRecord(e) && e.code === "P2002") return duplicateLabel();
    console.error("[integrations] save", errName(e));
    return refuse("UNKNOWN");
  }
}

/** โหลดแถวที่ผู้กระทำแก้ได้ (สิทธิ์ · ร้าน · หน่วย) */
async function loadManaged(ctx: unknown, actor: unknown, input: unknown): Promise<{ c: IntegrationCtx; a: IntegrationActor; row: TenantIntegration } | Refusal> {
  const c = ctxOf(ctx);
  if (!c) return refuse("NOT_FOUND");
  const a = actorOf(actor);
  if (!a || !canManageIntegrations(a)) return refuse("PERMISSION_DENIED");
  const id = isRecord(input) ? input.id : undefined;
  if (!isId(id)) return refuse("NOT_FOUND");
  const row = await prisma.tenantIntegration.findFirst({ where: { id, tenantId: c.tenantId } });
  if (!row) return refuse("NOT_FOUND");
  if (!withinUnits(a, row.unitIds)) return refuse("PERMISSION_DENIED");
  return { c, a, row };
}

/** ทดสอบการเชื่อม — callIntegration(handle, "test", a => a.test()) บนแถวนี้ (DRAFT/ERROR/CONNECTED · DISABLED = VALIDATION) */
export async function testIntegration(ctx: IntegrationCtx, actor: IntegrationActor, input: { id: string }): Promise<TestIntegrationResult> {
  try {
    const m = await loadManaged(ctx, actor, input);
    if ("ok" in m) return m;
    const { c, a, row } = m;
    if (row.status === "DISABLED") return refuse("VALIDATION", "การเชื่อมต่อนี้ถูกถอดแล้ว — วางคีย์ใหม่แล้วบันทึกก่อนทดสอบ");
    if (!integrationSecretKeyConfigured()) return refuse("NOT_CONFIGURED", KEY_MISSING);
    const def = providerDef(row.kind, row.provider);
    if (!def) return refuse("VALIDATION", "ผู้ให้บริการนี้ยังไม่เปิดให้ใช้");
    const built = buildAdapter(row, def);
    if (!built.ok) return built.why === "BOX" ? refuse("NOT_CONFIGURED", KEY_MISMATCH) : refuse("VALIDATION", "กรอกช่องที่จำเป็นให้ครบก่อนทดสอบ");
    const { result: r, applied } = await invoke(makeHandle(row, built.adapter), "test", (ad, ctl) => ad.test(ctl));
    const code: CallCode | null = r.ok ? null : r.code;
    // ผลทดสอบลงแถวเฉพาะเมื่อคีย์ยังเป็นชุดเดิม (มีคนเปลี่ยนคีย์ระหว่างทดสอบ ⇒ ผลนี้เป็นของคีย์เก่า ไม่บันทึก · ข้อ 10)
    if (applied) {
      await prisma.tenantIntegration.updateMany({
        where: { id: row.id, tenantId: c.tenantId, secretBox: row.secretBox },
        data: { lastTestAt: new Date(), lastTestOk: r.ok, lastError: code ? CALL_ERROR_TEXT[code] : null },
      });
    }
    const updated = (await prisma.tenantIntegration.findFirst({ where: { id: row.id, tenantId: c.tenantId } })) ?? row;
    await writeAudit({
      tenantId: c.tenantId,
      actorId: a.userId,
      action: "settings.integration.test",
      targetType: "TenantIntegration",
      targetId: row.id,
      before: { status: row.status },
      after: { status: updated.status, passed: r.ok, code },
    });
    return { ok: true, passed: r.ok, code, integration: viewOf(updated) };
  } catch (e) {
    console.error("[integrations] test", errName(e));
    return refuse("UNKNOWN");
  }
}

/** ถอดการเชื่อมต่อ — DISABLED + ลบค่าลับทิ้ง (แถวคงไว้) */
export async function disableIntegration(ctx: IntegrationCtx, actor: IntegrationActor, input: { id: string }): Promise<SaveIntegrationResult> {
  try {
    const m = await loadManaged(ctx, actor, input);
    if ("ok" in m) return m;
    const { c, a, row } = m;
    const updated = await prisma.tenantIntegration.update({
      where: { id: row.id },
      // ถอด = ลบค่าลับ + รีเซ็ตผลทดสอบ/ตัวนับ (มติผู้ตรวจ R0.5 ข้อ 4)
      data: { status: "DISABLED", secretBox: null, secretNames: [], consecutiveFailures: 0, lastTestOk: null, lastTestAt: null, lastError: null, updatedById: a.userId },
    });
    await writeAudit({
      tenantId: c.tenantId,
      actorId: a.userId,
      action: "settings.integration.disable",
      targetType: "TenantIntegration",
      targetId: row.id,
      before: { status: row.status, fields: [...row.secretNames].sort() },
      after: { status: "DISABLED", fields: [] },
    });
    return { ok: true, integration: viewOf(updated) };
  } catch (e) {
    console.error("[integrations] disable", errName(e));
    return refuse("UNKNOWN");
  }
}

// ─────────────────── รายการ ───────────────────
const LINE_STATUS: Record<string, VirtualView["status"]> = { CONNECTED: "CONNECTED", EXPIRED: "ERROR", ERROR: "ERROR", DISABLED: "DISABLED" };

/** รายการทั้งหมดของร้าน (แถวเก็บ + ชนิดเสมือน) + แค็ตตาล็อก — ไม่มีกุญแจก็อ่านได้ (keyConfigured:false) */
export async function listIntegrations(ctx: IntegrationCtx, actor: IntegrationActor): Promise<ListIntegrationsResult> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const a = actorOf(actor);
    if (!a) return refuse("PERMISSION_DENIED");
    const canManage = canManageIntegrations(a);
    if (!canManage && a.role !== "MANAGER") return refuse("PERMISSION_DENIED", "หน้าศูนย์เชื่อมต่อเปิดได้เฉพาะเจ้าของร้าน ผู้จัดการ หรือผู้ที่ได้รับสิทธิ์");
    const [rows, lines, pay] = await Promise.all([
      prisma.tenantIntegration.findMany({ where: { tenantId: c.tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.chatChannelConnection.findMany({
        where: { tenantId: c.tenantId, type: "LINE" },
        select: { id: true, systemId: true, displayName: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.paymentProfile.findUnique({ where: { tenantId: c.tenantId }, select: { promptpayId: true } }),
    ]);
    // ผู้จำกัดหน่วยเห็นแถวทุกหน่วย + แถวที่แตะหน่วยตน (อ่านอย่างเดียวถ้าแก้ไม่ได้)
    const visible = unitLimited(a) ? rows.filter((r) => r.unitIds.length === 0 || r.unitIds.some((u) => a.unitAccess.includes(u))) : rows;
    const items: (IntegrationView | VirtualView)[] = [];
    for (const l of lines) {
      items.push({
        id: `line:${l.id}`,
        kind: "LINE_OA",
        label: `LINE OA · ${l.displayName}`,
        status: LINE_STATUS[l.status] ?? "ERROR",
        summary: "แชท · แจ้งเตือน — จัดการที่ระบบแชทของร้าน",
        manageHref: `/app/sys/${l.systemId}/chat/channels`,
        virtual: true,
      });
    }
    const pp = pay?.promptpayId?.trim() ?? "";
    items.push({
      id: "promptpay",
      kind: "PROMPTPAY",
      label: "QR พร้อมเพย์",
      status: pp ? "CONNECTED" : "NOT_CONNECTED",
      summary: pp ? `เลข ••••${pp.slice(-4)} · รับเงินด้วย QR ยอดตรง` : "ยังไม่ได้ตั้งเลขพร้อมเพย์ของร้าน",
      manageHref: "/app/settings/payment",
      virtual: true,
    });
    for (const r of visible) items.push(viewOf(r));
    return { ok: true, keyConfigured: integrationSecretKeyConfigured(), canManage, items, catalog: integrationCatalog() };
  } catch (e) {
    console.error("[integrations] list", errName(e));
    return refuse("UNKNOWN");
  }
}

// ─────────────────── งานลบ call log (รายวัน) ───────────────────
/** ลบ call log ที่ at < now − 30 วัน (ทุกร้าน · เป็นก้อน) — รันซ้ำ = 0 */
export async function purgeIntegrationCallLogs(now: Date, opts?: { signal?: AbortSignal; deadline?: number }): Promise<{ deleted: number }> {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const cutoff = new Date(at.getTime() - INTEGRATION_CALL_LOG_RETENTION_DAYS * DAY_MS);
  let deleted = 0;
  // เคารพงบของ minute-job: signal ถูก abort / เลย deadline ⇒ หยุด (รอบหน้าทำต่อ — idempotent)
  const stop = () => opts?.signal?.aborted === true || (typeof opts?.deadline === "number" && Date.now() >= opts.deadline);
  for (let i = 0; i < 1000; i++) {
    if (stop()) break;
    const batch = await prisma.integrationCallLog.findMany({ where: { at: { lt: cutoff } }, select: { id: true }, take: PURGE_BATCH });
    if (!batch.length) break;
    const r = await prisma.integrationCallLog.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
    deleted += r.count;
    if (batch.length < PURGE_BATCH) break;
  }
  return { deleted };
}
