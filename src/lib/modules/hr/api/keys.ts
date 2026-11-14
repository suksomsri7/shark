// keys.ts — ผู้ออก/เพิกถอนคีย์ API ของระบบงานบุคคล (ใบ H4.8 · brief R3 · มติ Q3 · O1)
//
// แยกจาก `../api-key-actions.ts` ("use server" — export ได้เฉพาะ action และข้อสอบเรียก requireTenant() ไม่ได้) — แบบเดียวกับ pos/api/keys.ts
// กติกาการออกคีย์ (ทางเดียวที่ออกคีย์ที่ REST ของ HR ยอมรับได้ — ดู dispatch.ts):
//   - ผู้ออก = เจ้าของร้านเท่านั้น (บทบาทใน session + สมาชิกภาพจริงในฐาน · ยอมรับแล้ว) + สิทธิ์แพลตฟอร์ม api.key.create / api.key.revoke
//   - ผูกระบบ HR นี้เสมอ · ชุดสิทธิ์ต้องเป็น hr-read (ค่าปริยาย) / hr-leave / hr-payroll-read หรือ scope ที่อยู่ในชุดเหล่านี้เท่านั้น
//     (hr.payroll.create/approve/pay ฯลฯ ไม่มีทางออกเป็นคีย์)
//   - มี hr.payroll.read ⇒ ต้องติ๊กยินยอม "ข้อมูลเงินเดือนจะออกจากระบบ" (payConsent) และต้องมีวันหมดอายุ (ไม่มี "ไม่หมดอายุ")
//   - อายุ 30 / 90 / 365 วัน (0 = ไม่หมดอายุ เฉพาะคีย์ที่ไม่มีข้อมูลเงินเดือน)
//   - ประวัติ: hr.apikey.issue {keyId, scopes} · hr.apikey.revoke {keyId} (ไม่มีคีย์ดิบ/ชื่อคน) · คีย์ดิบคืนครั้งเดียว ไม่ลงที่ไหน
import { createApiKey, revokeApiKey } from "@/lib/api-keys/service";
import { API_SCOPE_BUNDLES, expandBundles, isApiScope } from "@/lib/api-keys/scopes";
import { writeAudit } from "@/lib/core/audit";
import { tenantDb } from "@/lib/core/db";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";

/** auth รูปเดียวกับ requireTenant() (ส่วนที่ใช้) */
export type HrKeyAuth = { user: { id: string }; active: { tenantId: string; role: string; unitAccess: unknown; permissions: unknown } };
export type HrKeyRefusal = { ok: false; code: "PERMISSION_DENIED" | "VALIDATION" | "NOT_FOUND"; message: string };

export const HR_BUNDLE_IDS: readonly string[] = ["hr-read", "hr-leave", "hr-payroll-read"];
/** scope ทั้งหมดที่คีย์ของ HR ถือได้ = รวมของ 3 ชุด */
export const HR_ISSUABLE_SCOPES: readonly string[] = [...new Set(API_SCOPE_BUNDLES.filter((b) => HR_BUNDLE_IDS.includes(b.id)).flatMap((b) => [...b.scopes]))];
export const HR_KEY_TTL_DAYS: readonly number[] = [30, 90, 365, 0];
const PAY_SCOPE = "hr.payroll.read";
const NAME_MAX = 60;
const DAY_MS = 86_400_000;

const refuse = (code: HrKeyRefusal["code"], message: string): HrKeyRefusal => ({ ok: false, code, message });
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const memberOf = (a: HrKeyAuth): MembershipCtx =>
  ({ role: a.active.role, unitAccess: (Array.isArray(a.active.unitAccess) ? a.active.unitAccess : []) as string[], permissions: (a.active.permissions ?? {}) as Record<string, unknown> }) as MembershipCtx;

/** ด่านร่วม: เจ้าของร้าน (session + ฐาน) · ระบบ HR ของร้านนี้ · สิทธิ์แพลตฟอร์มตามงาน */
async function gate(auth: HrKeyAuth, systemIdRaw: unknown, platformAction: "api.key.create" | "api.key.revoke"): Promise<{ tenantId: string; userId: string; systemId: string } | HrKeyRefusal> {
  const tenantId = str(auth?.active?.tenantId);
  const userId = str(auth?.user?.id);
  if (!tenantId || !userId || auth.active.role !== "OWNER") return refuse("PERMISSION_DENIED", "เฉพาะเจ้าของร้านออกหรือเพิกถอนคีย์ API ของระบบงานบุคคลได้");
  const owner = await tenantDb({ tenantId }).membership.findFirst({ where: { tenantId, userId, role: "OWNER", acceptedAt: { not: null } }, select: { id: true } });
  if (!owner) return refuse("PERMISSION_DENIED", "เฉพาะเจ้าของร้านออกหรือเพิกถอนคีย์ API ของระบบงานบุคคลได้");
  if (!evaluate(memberOf(auth), { module: "api", action: platformAction })) return refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์จัดการคีย์ API");
  const systemId = str(systemIdRaw);
  const sys = systemId ? await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "HR" }, select: { id: true } }) : null;
  if (!sys) return refuse("NOT_FOUND", "ไม่พบระบบงานบุคคลนี้ในร้านนี้");
  return { tenantId, userId, systemId: sys.id };
}

export type IssueHrApiKeyInput = { systemId: string; name: string; bundle?: string; scopes?: string[]; ttlDays: number; payConsent?: boolean };

/** ออกคีย์ API ของระบบงานบุคคล — คืนคีย์ดิบครั้งเดียว · ปฏิเสธ = ไม่เขียนอะไร */
export async function issueHrApiKey(auth: HrKeyAuth, input: IssueHrApiKeyInput): Promise<{ ok: true; keyId: string; rawKey: string; prefix: string } | HrKeyRefusal> {
  const g = await gate(auth, input?.systemId, "api.key.create");
  if ("ok" in g) return g;
  const name = str(input.name);
  if (!name || name.length > NAME_MAX) return refuse("VALIDATION", `ตั้งชื่อคีย์ให้จำง่าย (ไม่เกิน ${NAME_MAX} ตัวอักษร) เช่น แอปตารางกะของร้าน`);
  let scopes: string[];
  if (Array.isArray(input.scopes) && input.scopes.length > 0) {
    scopes = [...new Set(input.scopes.map(str).filter(Boolean))];
  } else {
    const bundle = str(input.bundle) || "hr-read";
    if (!HR_BUNDLE_IDS.includes(bundle)) return refuse("VALIDATION", "ชุดสิทธิ์ที่เลือกไม่ใช่ชุดของระบบงานบุคคล — สิทธิ์ของระบบอื่นออกที่หน้าตั้งค่า API ของระบบนั้น");
    scopes = expandBundles([bundle]);
  }
  for (const sc of scopes) {
    if (!isApiScope(sc) || !HR_ISSUABLE_SCOPES.includes(sc)) return refuse("VALIDATION", `คีย์ของระบบงานบุคคลถือสิทธิ์ "${sc}" ไม่ได้ — เลือกจากชุดอ่าน / ยื่นใบลา / ข้อมูลเงินเดือน`);
  }
  const pay = scopes.includes(PAY_SCOPE);
  const ttlDays = input.ttlDays;
  if (typeof ttlDays !== "number" || !HR_KEY_TTL_DAYS.includes(ttlDays)) return refuse("VALIDATION", "อายุคีย์ต้องเป็น 30 / 90 / 365 วัน หรือไม่หมดอายุ");
  if (pay && input.payConsent !== true) return refuse("VALIDATION", "คีย์ที่อ่านข้อมูลเงินเดือนได้ ต้องติ๊กยืนยันว่าข้อมูลเงินเดือนจะออกจากระบบก่อน");
  if (pay && ttlDays === 0) return refuse("VALIDATION", "คีย์ที่อ่านข้อมูลเงินเดือนได้ต้องมีวันหมดอายุ — เลือก 30 / 90 / 365 วัน");
  const expiresAt = ttlDays === 0 ? null : new Date(Date.now() + ttlDays * DAY_MS);
  const made = await createApiKey({ tenantId: g.tenantId }, name, { scopes, systemId: g.systemId, expiresAt, createdById: g.userId });
  await writeAudit({ tenantId: g.tenantId, actorId: g.userId, action: "hr.apikey.issue", targetType: "ApiKey", targetId: made.id, after: { keyId: made.id, scopes } });
  return { ok: true, keyId: made.id, rawKey: made.rawKey, prefix: made.prefix };
}

/** เพิกถอนคีย์ที่ผูกระบบ HR นี้ (มีผลทันที — คำขอถัดไปได้ 401) · คีย์กลาง/ของระบบอื่น = ไม่พบ */
export async function revokeHrApiKey(auth: HrKeyAuth, input: { systemId: string; keyId: string }): Promise<{ ok: true } | HrKeyRefusal> {
  const g = await gate(auth, input?.systemId, "api.key.revoke");
  if ("ok" in g) return g;
  const keyId = str(input.keyId);
  const owned = keyId ? await tenantDb({ tenantId: g.tenantId }).apiKey.findFirst({ where: { id: keyId, systemId: g.systemId }, select: { id: true } }) : null;
  if (!owned) return refuse("NOT_FOUND", "ไม่พบคีย์นี้ในระบบงานบุคคลนี้ — รีเฟรชหน้าแล้วลองใหม่");
  if (await revokeApiKey({ tenantId: g.tenantId }, keyId)) {
    await writeAudit({ tenantId: g.tenantId, actorId: g.userId, action: "hr.apikey.revoke", targetType: "ApiKey", targetId: keyId, after: { keyId } });
  }
  return { ok: true };
}

export type HrKeyRow = { id: string; name: string; prefix: string; bundle: string; pay: boolean; createdAt: string; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null };

/** คีย์ที่ผูกระบบ HR นี้ (ไม่คืน hash) — ใหม่ → เก่า */
export async function listHrApiKeys(auth: HrKeyAuth, input: { systemId: string }): Promise<{ ok: true; keys: HrKeyRow[] } | HrKeyRefusal> {
  const g = await gate(auth, input?.systemId, "api.key.create");
  if ("ok" in g) return g;
  const rows = await tenantDb({ tenantId: g.tenantId }).apiKey.findMany({
    where: { systemId: g.systemId },
    select: { id: true, name: true, prefix: true, scopesJson: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  const keys = rows.map((r) => {
    const scopes = Array.isArray(r.scopesJson) ? (r.scopesJson as unknown[]).filter((s): s is string => typeof s === "string") : [];
    const sorted = [...scopes].sort().join(",");
    const hit = API_SCOPE_BUNDLES.find((b) => HR_BUNDLE_IDS.includes(b.id) && [...b.scopes].sort().join(",") === sorted);
    return {
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      bundle: hit ? hit.id : "custom",
      pay: scopes.includes(PAY_SCOPE),
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
    };
  });
  return { ok: true, keys };
}
