// integration-creds.ts — ที่เก็บ credentials ของแพลตฟอร์ม/ผู้ให้บริการ (P3-SKEL K2 · มติ §10-8 · CD-S3) — ผู้เขียนเดียวของ PosIntegrationCredential
//
// ชนิด: PLATFORM (LINE MAN · Grab · Shopee · Lazada · TikTok — ต่อช่องทาง) · SLIP_VERIFY (ผู้ให้บริการตรวจสลิป — ต่อระบบ POS) · ETAX (ผู้ให้บริการ e-Tax — ต่อระบบ POS)
// 🔴 บันทึก = เจ้าของร้าน (OWNER) เท่านั้น (แบบ payment-settings) · อ่านแบบปิดบัง = pos.channel.manage (PLATFORM) / pos.settings.payment (SLIP_VERIFY) / pos.settings.manage (ETAX)
// 🔴 ค่าลับปิดกล่องด้วย secret-box (POS_CREDENTIALS_KEY) — ไม่มีกุญแจ = NOT_CONFIGURED "ยังไม่ตั้งกุญแจ" (ไม่มีกุญแจสำรอง) · ไม่มีค่าลับในแถวดิบ/audit/ops/ผลคืน
// 🔴 บันทึก = patch (ฟิลด์ที่ไม่ส่งคงค่าเดิม · ส่ง "" = ล้างฟิลด์) · ครบทุกฟิลด์ที่จำเป็น = COMPLETE · ready:false เสมอ (โครง — สวิตช์รอ W4)
// 🔴 audit pos.integration.credentials เก็บ "ชื่อฟิลด์" เท่านั้น · ทดสอบการเชื่อม = ไม่ยิงเครือข่าย ไม่เขียน
// คำปฏิเสธ "คืน" เป็นข้อมูล {ok:false, code, message} เสมอ — ไม่โยน
import { evaluate } from "@/lib/core/rbac";
import { writeAudit } from "@/lib/core/audit";
import { posMembership } from "./access";
import { prisma } from "./db";
import { openPosSecret, posSecretKey, posSecretKeyConfigured, sealPosSecret, type SecretBoxDeps } from "./secret-box";
import { platformAdapter } from "./platform/registry";
import { looksSecretField, WEBHOOK_SECRET_FIELD } from "./platform/types";
import { slipVerifyProvider } from "./slip-verify";
import { etaxProvider } from "@/lib/platform/etax/provider";

export type PosIntegrationKind = "PLATFORM" | "SLIP_VERIFY" | "ETAX";
export const POS_INTEGRATION_KINDS: readonly PosIntegrationKind[] = ["PLATFORM", "SLIP_VERIFY", "ETAX"];
export type PosIntegrationCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "NOT_CONFIGURED" | "ADAPTER_PENDING" | "UNKNOWN";
export type PosIntegrationRefusal = { ok: false; code: PosIntegrationCode; message: string; messageKey: string };
export type PosIntegrationFieldView = { name: string; label: string; required: boolean; secret: boolean; filled: boolean; masked: string };
export type PosIntegrationView = {
  ok: true;
  kind: PosIntegrationKind;
  provider: string;
  channelId: string | null;
  fields: PosIntegrationFieldView[];
  status: "DRAFT" | "COMPLETE";
  /** โครง: false เสมอ จนกว่า adapter/ผู้ให้บริการจริงจะมา */
  ready: false;
  /** ตั้ง env POS_CREDENTIALS_KEY แล้วหรือยัง (false = การ์ดแสดง "ยังไม่ตั้งกุญแจ" และบันทึกไม่ได้) */
  keyConfigured: boolean;
  /** URL ที่เจ้าของให้แพลตฟอร์มส่ง webhook มา (PLATFORM เท่านั้น) */
  webhookUrl: string | null;
  updatedAt: string | null;
};
export type PosIntegrationResult = PosIntegrationView | PosIntegrationRefusal;
export type PosIntegrationTestResult = PosIntegrationRefusal;
export type PosIntegrationCtx = { tenantId: string; systemId: string; unitId: string };
export type PosIntegrationActor = { userId: string; role: string; unitAccess?: unknown; permissions?: unknown };
export type PosIntegrationDeps = SecretBoxDeps & { now?: Date };

type FieldDef = { name: string; label: string; required: boolean; secret: boolean };

const MSG: Record<PosIntegrationCode, string> = {
  NOT_FOUND: "ไม่พบช่องทาง/ระบบนี้",
  PERMISSION_DENIED: "ไม่มีสิทธิ์จัดการการเชื่อมต่อนี้",
  VALIDATION: "ข้อมูลการเชื่อมต่อไม่ถูกต้อง",
  NOT_CONFIGURED: "ยังไม่ได้เชื่อม — รอ credentials จากเจ้าของ",
  ADAPTER_PENDING: "ข้อมูลครบแล้ว แต่ตัวเชื่อมจริงยังไม่เปิด (รอสวิตช์ W4)",
  UNKNOWN: "เกิดข้อผิดพลาด — ลองอีกครั้ง",
};
const KEY_MISSING = "ยังไม่ตั้งกุญแจเข้ารหัส (POS_CREDENTIALS_KEY อย่างน้อย 32 ตัวอักษร) — ให้ผู้ดูแลระบบตั้ง env นี้ก่อนวาง credentials";
const KEY_MISMATCH = "กุญแจเข้ารหัส (POS_CREDENTIALS_KEY) ไม่ตรงกับที่ใช้ปิดข้อมูลเดิม — วางค่าลับทุกช่องใหม่อีกครั้ง";
const MESSAGE_KEY: Record<PosIntegrationCode, string> = {
  NOT_FOUND: "platform.errors.notFound",
  PERMISSION_DENIED: "platform.errors.permissionDenied",
  VALIDATION: "platform.errors.validation",
  NOT_CONFIGURED: "platform.errors.notConfigured",
  ADAPTER_PENDING: "platform.errors.adapterPending",
  UNKNOWN: "platform.errors.unknown",
};
const refuse = (code: PosIntegrationCode, message?: string, messageKey?: string): PosIntegrationRefusal => ({ ok: false, code, message: message ?? MSG[code], messageKey: messageKey ?? MESSAGE_KEY[code] });

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const READ_PERM: Record<PosIntegrationKind, string> = { PLATFORM: "pos.channel.manage", SLIP_VERIFY: "pos.settings.payment", ETAX: "pos.settings.manage" };
const INPUT_KEYS = new Set(["kind", "provider", "channelId", "fields"]);
const VALUE_MAX = 4000;

/** ชื่อฟิลด์ของผู้ให้บริการ — ไม่รู้จัก = null · ชื่อที่ดูเป็นความลับถือเป็นความลับเสมอ */
export function integrationFields(kind: unknown, provider: unknown): FieldDef[] | null {
  const src =
    kind === "PLATFORM" ? platformAdapter(provider)?.requiredFields : kind === "SLIP_VERIFY" ? slipVerifyProvider(provider)?.requiredFields : kind === "ETAX" ? etaxProvider(provider)?.requiredFields : null;
  if (!src) return null;
  return src.map((f) => ({ name: f.name, label: f.label, required: f.required !== false, secret: f.secret === true || looksSecretField(f.name) }));
}

function membershipOf(actor: unknown) {
  return isRecord(actor) && typeof actor.role === "string" && typeof actor.userId === "string" ? posMembership(actor as Parameters<typeof posMembership>[0]) : null;
}

function ctxOf(ctx: unknown): PosIntegrationCtx | null {
  return isRecord(ctx) && isId(ctx.tenantId) && isId(ctx.systemId) && isId(ctx.unitId) ? { tenantId: ctx.tenantId, systemId: ctx.systemId, unitId: ctx.unitId } : null;
}

function appBaseUrl(): string {
  return (typeof process.env.APP_URL === "string" && process.env.APP_URL.trim() ? process.env.APP_URL.trim() : "https://shark.in.th").replace(/\/+$/, "");
}

/** URL ขาเข้าที่ให้แพลตฟอร์มเรียก (route นอก /api/v1/pos — ทะเบียน REST 49 op ไม่เปลี่ยน) */
export function platformWebhookUrl(provider: string, channelId: string): string {
  return `${appBaseUrl()}/api/pos/platform/${encodeURIComponent(provider)}/${encodeURIComponent(channelId)}`;
}

/** ปิดบังค่าลับ: "••••" + 4 ตัวท้าย (ค่าสั้น ≤ 8 ตัว = "••••" ล้วน) */
function maskSecret(v: string): string {
  return v.length <= 8 ? "••••" : `••••${v.slice(-4)}`;
}

type Scope = { scopeKey: string; channelId: string | null; channelCode: string | null; archived: boolean };
type Parsed = { kind: PosIntegrationKind; provider: string; channelId: string | null; defs: FieldDef[] };

/** ตรวจ kind/provider/channelId (ไม่มี I/O) */
function parseTarget(input: unknown): Parsed | PosIntegrationRefusal {
  if (!isRecord(input)) return refuse("VALIDATION");
  const kind = input.kind;
  if (typeof kind !== "string" || !POS_INTEGRATION_KINDS.includes(kind as PosIntegrationKind)) return refuse("VALIDATION", "ชนิดการเชื่อมต่อไม่ถูกต้อง");
  const defs = integrationFields(kind, input.provider);
  if (!defs) return refuse("VALIDATION", "ไม่รู้จักผู้ให้บริการนี้");
  const channelId = input.channelId === undefined || input.channelId === null ? null : input.channelId;
  if (kind === "PLATFORM" && !isId(channelId)) return refuse("VALIDATION", "ต้องระบุช่องทางขาย");
  if (kind !== "PLATFORM" && channelId !== null) return refuse("VALIDATION", "การเชื่อมต่อนี้เป็นระดับระบบ — ไม่ต้องระบุช่องทาง");
  return { kind: kind as PosIntegrationKind, provider: input.provider as string, channelId: (channelId as string | null) ?? null, defs };
}

async function resolveScope(c: PosIntegrationCtx, t: Parsed): Promise<Scope | null> {
  if (t.kind === "PLATFORM") {
    const ch = await prisma.salesChannel.findFirst({ where: { id: t.channelId!, tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId }, select: { id: true, code: true, archivedAt: true } });
    return ch ? { scopeKey: ch.id, channelId: ch.id, channelCode: ch.code, archived: !!ch.archivedAt } : null;
  }
  const sys = await prisma.appSystem.findFirst({ where: { id: c.systemId, tenantId: c.tenantId, type: "POS" }, select: { id: true } });
  return sys ? { scopeKey: "system", channelId: null, channelCode: null, archived: false } : null;
}

type Row = { id: string; publicFields: unknown; secretBox: string | null; secretNames: string[]; status: string; updatedAt: Date };

async function loadRow(c: PosIntegrationCtx, t: Parsed, scopeKey: string): Promise<Row | null> {
  return prisma.posIntegrationCredential.findFirst({
    where: { tenantId: c.tenantId, systemId: c.systemId, kind: t.kind, provider: t.provider, scopeKey },
    select: { id: true, publicFields: true, secretBox: true, secretNames: true, status: true, updatedAt: true },
  });
}

function viewOf(t: Parsed, scope: Scope, row: Row | null, deps?: PosIntegrationDeps): PosIntegrationView {
  const pub = row && isRecord(row.publicFields) ? row.publicFields : {};
  const secretNames = new Set(row?.secretNames ?? []);
  const opened = row?.secretBox ? openPosSecret(row.secretBox, deps) : null;
  const fields: PosIntegrationFieldView[] = t.defs.map((f) => {
    if (f.secret) {
      const v = opened && typeof opened[f.name] === "string" ? (opened[f.name] as string) : "";
      const filled = secretNames.has(f.name);
      return { name: f.name, label: f.label, required: f.required, secret: true, filled, masked: filled ? (v ? maskSecret(v) : "••••") : "" };
    }
    const v = typeof pub[f.name] === "string" ? (pub[f.name] as string) : "";
    return { name: f.name, label: f.label, required: f.required, secret: false, filled: v !== "", masked: v };
  });
  return {
    ok: true,
    kind: t.kind,
    provider: t.provider,
    channelId: scope.channelId,
    fields,
    status: row?.status === "COMPLETE" ? "COMPLETE" : "DRAFT",
    ready: false,
    keyConfigured: posSecretKeyConfigured(deps),
    webhookUrl: t.kind === "PLATFORM" && scope.channelId ? platformWebhookUrl(t.provider, scope.channelId) : null,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  };
}

/** บันทึก credentials (OWNER เท่านั้น · patch) — คืนมุมมองปิดบังหลังบันทึก */
export async function saveIntegrationCredentials(ctx: PosIntegrationCtx, actor: PosIntegrationActor, input: unknown, deps?: PosIntegrationDeps): Promise<PosIntegrationResult> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const m = membershipOf(actor);
    if (!m || m.role !== "OWNER") return refuse("PERMISSION_DENIED", "เฉพาะเจ้าของร้านเท่านั้นที่บันทึก credentials ได้");
    const t = parseTarget(input);
    if ("ok" in t) return t;
    const inp = input as Record<string, unknown>;
    if (Object.keys(inp).some((k) => !INPUT_KEYS.has(k))) return refuse("VALIDATION", "มีช่องข้อมูลที่ไม่รู้จัก");
    if (!isRecord(inp.fields) || Object.keys(inp.fields).length === 0) return refuse("VALIDATION", "ไม่มีค่าที่จะบันทึก");
    const byName = new Map(t.defs.map((f) => [f.name, f]));
    const patch: [FieldDef, string][] = [];
    for (const [name, value] of Object.entries(inp.fields)) {
      const def = byName.get(name);
      if (!def) return refuse("VALIDATION", `ไม่รู้จักช่อง ${name.slice(0, 40)}`);
      if (typeof value !== "string" || value.length > VALUE_MAX || /[\u0000-\u001f\u007f]/.test(value)) return refuse("VALIDATION", `ค่าของช่อง ${def.label} ไม่ถูกต้อง`);
      patch.push([def, value.trim()]);
    }
    const key = posSecretKey(deps);
    if (!key) return refuse("NOT_CONFIGURED", KEY_MISSING, "platform.errors.keyMissing");
    const keyDeps: SecretBoxDeps = { key };
    const scope = await resolveScope(c, t);
    if (!scope || scope.archived) return refuse("NOT_FOUND");
    if (t.kind === "PLATFORM" && scope.channelCode !== t.provider) return refuse("VALIDATION", "แพลตฟอร์มไม่ตรงกับรหัสช่องทางนี้");

    const out = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`pos:creds:${c.tenantId}:${t.kind}:${t.provider}:${scope.scopeKey}`}))::text AS locked`;
      const prev = await tx.posIntegrationCredential.findFirst({
        where: { tenantId: c.tenantId, kind: t.kind, provider: t.provider, scopeKey: scope.scopeKey },
        select: { id: true, systemId: true, publicFields: true, secretBox: true, secretNames: true, status: true },
      });
      if (prev && prev.systemId !== c.systemId) return { refused: refuse("NOT_FOUND") };
      const pub: Record<string, string> = {};
      if (prev && isRecord(prev.publicFields)) for (const [k, v] of Object.entries(prev.publicFields)) if (typeof v === "string" && byName.has(k) && !byName.get(k)!.secret) pub[k] = v;
      let secrets: Record<string, string> = {};
      if (prev?.secretBox) {
        const opened = openPosSecret(prev.secretBox, keyDeps);
        const coversAll = (prev.secretNames ?? []).every((n) => patch.some(([d, v]) => d.name === n && v !== ""));
        if (!opened && !coversAll) return { refused: refuse("NOT_CONFIGURED", KEY_MISMATCH, "platform.errors.keyMismatch") };
        if (opened) for (const [k, v] of Object.entries(opened)) if (typeof v === "string" && byName.get(k)?.secret) secrets[k] = v;
      }
      for (const [def, value] of patch) {
        const bag = def.secret ? secrets : pub;
        if (value === "") delete bag[def.name];
        else bag[def.name] = value;
      }
      secrets = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== ""));
      const secretNames = Object.keys(secrets).sort();
      const filled = (f: FieldDef) => (f.secret ? secretNames.includes(f.name) : typeof pub[f.name] === "string" && pub[f.name] !== "");
      const status = t.defs.filter((f) => f.required).every(filled) ? "COMPLETE" : "DRAFT";
      const data = {
        publicFields: pub,
        secretBox: secretNames.length ? sealPosSecret(secrets, keyDeps) : null,
        secretNames,
        status,
        updatedByUserId: (actor as PosIntegrationActor).userId,
      };
      const row = prev
        ? await tx.posIntegrationCredential.update({ where: { id: prev.id }, data, select: { id: true } })
        : await tx.posIntegrationCredential.create({
            data: { ...data, tenantId: c.tenantId, systemId: c.systemId, unitId: c.unitId, channelId: scope.channelId, scopeKey: scope.scopeKey, kind: t.kind, provider: t.provider },
            select: { id: true },
          });
      const filledBefore = prev ? [...Object.keys(isRecord(prev.publicFields) ? prev.publicFields : {}), ...(prev.secretNames ?? [])].filter((n) => byName.has(n)).sort() : [];
      return { id: row.id, status, before: prev ? { status: prev.status, fields: filledBefore } : null };
    });
    if ("refused" in out) return out.refused!;
    await writeAudit({
      tenantId: c.tenantId,
      actorId: (actor as PosIntegrationActor).userId,
      action: "pos.integration.credentials",
      targetType: "PosIntegrationCredential",
      targetId: out.id,
      before: out.before,
      after: { kind: t.kind, provider: t.provider, channelId: scope.channelId, fields: patch.map(([d]) => d.name), status: out.status },
    });
    return viewOf(t, scope, await loadRow(c, t, scope.scopeKey), keyDeps);
  } catch (e) {
    console.error("[pos/integration-creds] save", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/** อ่านแบบปิดบัง — ไม่มีกุญแจก็อ่านได้ (keyConfigured:false) */
export async function readIntegrationCredentials(ctx: PosIntegrationCtx, actor: PosIntegrationActor, input: unknown, deps?: PosIntegrationDeps): Promise<PosIntegrationResult> {
  try {
    const c = ctxOf(ctx);
    if (!c) return refuse("NOT_FOUND");
    const t = parseTarget(input);
    if ("ok" in t) return t;
    const m = membershipOf(actor);
    if (!m || !evaluate(m, { module: "pos", action: READ_PERM[t.kind], unitId: c.unitId })) return refuse("PERMISSION_DENIED");
    const scope = await resolveScope(c, t);
    if (!scope) return refuse("NOT_FOUND");
    if (t.kind === "PLATFORM" && scope.channelCode !== t.provider) return refuse("VALIDATION", "แพลตฟอร์มไม่ตรงกับรหัสช่องทางนี้");
    return viewOf(t, scope, await loadRow(c, t, scope.scopeKey), deps);
  } catch (e) {
    console.error("[pos/integration-creds] read", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/** ทดสอบการเชื่อม — ไม่ยิงเครือข่าย ไม่เขียน · ยังไม่ครบ = NOT_CONFIGURED · ครบ = NOT_CONFIGURED/ADAPTER_PENDING จาก adapter (ไม่เคย ok) */
export async function testIntegrationConnection(ctx: PosIntegrationCtx, actor: PosIntegrationActor, input: unknown, deps?: PosIntegrationDeps): Promise<PosIntegrationTestResult> {
  try {
    const r = await readIntegrationCredentials(ctx, actor, input, deps);
    if (r.ok !== true) return r;
    if (r.status !== "COMPLETE") return refuse("NOT_CONFIGURED", "ยังกรอกไม่ครบ — รอ credentials จากเจ้าของ");
    // ส่งเฉพาะ "กรอกแล้ว" (ไม่เปิดกล่อง) — adapter โครงตัดสินแค่ความครบ
    const filled = Object.fromEntries(r.fields.map((f) => [f.name, f.filled ? "set" : ""]));
    if (r.kind === "PLATFORM") {
      const res = await platformAdapter(r.provider)!.testConnection(filled);
      return refuse(res.code, res.reason);
    }
    return refuse("ADAPTER_PENDING");
  } catch (e) {
    console.error("[pos/integration-creds] test", e instanceof Error ? e.name : "error");
    return refuse("UNKNOWN");
  }
}

/**
 * ค่าลับสำหรับตรวจลายเซ็นขาเข้า (route /api/pos/platform/… เท่านั้น — ไม่มีผู้ใช้) — ร้านมาจากช่องทาง (ไม่ใช่จากคำขอ)
 * ไม่มีแถว / ไม่มี webhookSecret / ไม่มีกุญแจ / เปิดกล่องไม่ได้ = null (route ตอบ 503 NOT_CONFIGURED)
 */
export async function platformInboundCreds(channel: { id: string; tenantId: string; systemId: string; code: string }, deps?: SecretBoxDeps): Promise<Record<string, string> | null> {
  try {
    const row = await prisma.posIntegrationCredential.findFirst({
      where: { tenantId: channel.tenantId, systemId: channel.systemId, kind: "PLATFORM", provider: channel.code, scopeKey: channel.id },
      select: { secretBox: true, secretNames: true },
    });
    if (!row?.secretBox || !(row.secretNames ?? []).includes(WEBHOOK_SECRET_FIELD)) return null;
    const opened = openPosSecret(row.secretBox, deps);
    if (!opened || typeof opened[WEBHOOK_SECRET_FIELD] !== "string" || !opened[WEBHOOK_SECRET_FIELD]) return null;
    return Object.fromEntries(Object.entries(opened).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return null;
  }
}
