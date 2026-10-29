// SVC D.7 ▸ โหมดกฎหมาย (เจ้าของเท่านั้น) + โมเดลหน้า "ค่าน้ำไฟ · กฎหมาย · VAT" — สัญญา ledger/svc-briefs/svc-brief-d.7.md §3.6–§3.7
//   • setDormLegalMode: เขียนผ่านเครื่องยนต์ค่าตั้ง (setSettings ชั้น UNIT ทั้งชุดใน 1 ครั้ง) · เจ้าของตาม actor + Membership สด
//     นอกขอบเขต: เหตุผล ≥ 10 ตัว · legalScope บอกว่าอยู่ในขอบเขต ⇒ ต้องมีหลักฐานไฟล์ส่วนตัวของร้าน ≥ 1 (X10)
//   • dormLawModel: JSON ล้วน (ส่งเป็น prop ของ client ได้) · สิทธิ์แก้โหมดมาจากฟอร์มของเครื่องยนต์ (editIssueFor ตัวเดียวกัน)
import { tenantDb } from "@/lib/core/db";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { loadSettingsForm, resolveSettings, setSettings } from "@/lib/core/settings";
import type { SettingChangeInput, SettingsActor } from "@/lib/core/settings";
import { isValidOutOfScopeReason, legalScope, normalizeLegalMode, type BusinessType, type LegalMode } from "@/lib/core/settings/legal/th-rental-2568";
import type { SettingsFormModel } from "@/components/settings/settings-shared";
import { isPrivateStoragePath, uploadFile } from "@/lib/storage/service";
import { dormAccess } from "./access";
import { isLiveOwner, utilityBillingGate, type UtilityGateItem, type UtilityKind } from "./utility";

type Fail = { ok: false; code: string; reason: string };
const fail = (code: string, reason: string): Fail => ({ ok: false, code, reason });
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MODES: readonly LegalMode[] = ["STRICT", "WARN", "OUT_OF_SCOPE"];
const BUSINESS_TYPES: readonly BusinessType[] = ["APARTMENT", "STUDENT_DORM", "SMALL_HOTEL", "SERVICED_APT"];
const MAX_EVIDENCE = 20;

export type DormLawBill = {
  kind: UtilityKind;
  buildingId: string | null;
  periodKey: string;
  billSatang: number | null;
  units: number | null;
  costRateSatangPerUnit: number | null;
  hasPhoto: boolean;
};
export type DormLawModel = {
  unitId: string;
  unitName: string;
  periodKey: string;
  form: SettingsFormModel;
  scope: { roomCount: number; businessType: string; inScope: boolean; code: string; autoReasonTh: string | null };
  legal: { mode: LegalMode; editable: boolean; lockedReasonTh: string | null; outOfScopeReason: string | null; evidenceCount: number };
  /** ต่อ kind × อาคาร: แถวล่าสุดที่ periodKey ≤ งวดของหน้า และมีบิล */
  bills: DormLawBill[];
  /** อาคารของหน่วย (ฟอร์มใส่บิลเลือก ทั้งหน่วย/รายอาคาร — H8) */
  buildings: { id: string; name: string }[];
  /** fingerprint ของตัวตรวจต่อกลุ่ม (kind × ขอบเขตบิล) ณ ตอนโหลดหน้า — ปุ่มยอมรับส่งค่านี้กลับ ⇒ ข้อมูลเปลี่ยนระหว่างนั้น = STALE (N1) */
  fingerprints: { kind: UtilityKind; buildingId: string | null; fingerprint: string }[];
  /** utilityBillingGate ของงวดหน้า */
  check: { ok: boolean; blocks: UtilityGateItem[]; needsAcceptance: UtilityGateItem[] };
  canRecordBill: boolean;
  canAccept: boolean;
};

async function dormUnit(tenantId: unknown, unitId: unknown): Promise<{ id: string; name: string } | null> {
  if (!isStr(tenantId) || !isStr(unitId)) return null;
  return tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "DORM" }, select: { id: true, name: true } });
}

/** ขอบเขตประกาศของหน่วย: ห้อง active ทั้งหน่วย + ประเภทกิจการ (ค่าตั้ง) → legalScope (params = ค่าเริ่มแพลตฟอร์ม) */
async function scopeOf(tenantId: string, unitId: string) {
  const [roomCount, r] = await Promise.all([
    tenantDb({ tenantId, unitId }).hotelRoom.count({ where: { active: true } }),
    resolveSettings({ tenantId }, ["rooms.general.businessType", "rooms.legal.mode", "rooms.legal.outOfScopeReason", "rooms.legal.outOfScopeEvidence"], { unitId }),
  ]);
  const bt = r["rooms.general.businessType"]?.value;
  const businessType: BusinessType = BUSINESS_TYPES.find((b) => b === bt) ?? "APARTMENT";
  const ev = r["rooms.legal.outOfScopeEvidence"]?.value;
  const reason = r["rooms.legal.outOfScopeReason"]?.value;
  return {
    roomCount,
    businessType,
    scope: legalScope({ roomCount, businessType }),
    mode: normalizeLegalMode(r["rooms.legal.mode"]?.value),
    reason: typeof reason === "string" ? reason : null,
    evidence: Array.isArray(ev) ? ev.filter(isStr) : [],
  };
}

/** หลักฐาน = FileAsset ของร้านนี้ที่ path เป็นไฟล์ส่วนตัวตามตัวแยก path กลางของ storage (ไม่ใช่ includes) */
async function validEvidence(tenantId: string, ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  const files = await tenantDb({ tenantId }).fileAsset.findMany({ where: { id: { in: ids } }, select: { id: true, path: true } });
  const ok = new Set(files.filter((f) => isPrivateStoragePath(f.path) && f.path.startsWith(`t/${tenantId}/`)).map((f) => f.id));
  return ids.every((id) => ok.has(id));
}

export type LegalModeDeps = {
  /** หลักฐานใหม่ที่จะอัปเป็นไฟล์ส่วนตัว — อัปหลังผ่านตรวจเจ้าของ/โหมด/เหตุผล/หลักฐานเดิมแล้วเท่านั้น (H9) */
  evidenceUploads?: { data: Uint8Array; contentType: string }[];
  put?: (path: string, data: Uint8Array, contentType: string) => Promise<void>;
};

// ───────────────────────── 3.6 โหมดกฎหมาย — เจ้าของเท่านั้น ─────────────────────────
export async function setDormLegalMode(
  actor: SettingsActor,
  ctx: { tenantId: string },
  input: { unitId: string; mode: "STRICT" | "WARN" | "OUT_OF_SCOPE"; reason?: string | null; evidenceFileIds?: string[] },
  deps?: LegalModeDeps,
): Promise<{ ok: true } | Fail> {
  const tenantId = ctx?.tenantId;
  const unit = await dormUnit(tenantId, isRec(input) ? input.unitId : null);
  if (!unit) return fail("NOT_FOUND", "ไม่พบหอพักนี้");
  // เจ้าของ = บทบาทของผู้กระทำ และ Membership สดของร้านนี้ (ไม่เชื่อบทบาทที่ส่งมาอย่างเดียว)
  if (!actor || actor.role !== "OWNER" || !(await isLiveOwner(tenantId, actor.userId))) {
    return fail("OWNER_ONLY", "โหมดตามกฎหมายเปลี่ยนได้เฉพาะเจ้าของกิจการ");
  }
  const mode = MODES.find((m) => m === input.mode);
  if (!mode) return fail("INVALID_INPUT", "โหมดต้องเป็น เข้มงวด / เตือน / นอกขอบเขต");

  const changes: SettingChangeInput[] = [{ key: "rooms.legal.mode", scope: "UNIT", scopeId: unit.id, value: mode }];
  if (mode === "OUT_OF_SCOPE") {
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (!isValidOutOfScopeReason(reason)) return fail("REASON_REQUIRED", "เลือกนอกขอบเขตประกาศต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร");
    const s = await scopeOf(tenantId, unit.id);
    // ไม่ส่ง evidenceFileIds (undefined) ⇒ ใช้หลักฐานเดิมที่ตั้งไว้ (ตรวจซ้ำ) · ส่ง [] ⇒ ไม่มีหลักฐาน
    const raw = input.evidenceFileIds === undefined ? s.evidence : input.evidenceFileIds;
    if (!Array.isArray(raw) || raw.length > MAX_EVIDENCE || !raw.every(isStr)) return fail("EVIDENCE_INVALID", "หลักฐานที่แนบไม่ถูกต้อง");
    const ids = [...new Set(raw)];
    const uploads = (deps?.evidenceUploads ?? []).filter((u) => u && u.data instanceof Uint8Array && u.data.length > 0 && typeof u.contentType === "string");
    if (ids.length + uploads.length > MAX_EVIDENCE) return fail("EVIDENCE_INVALID", "หลักฐานที่แนบไม่ถูกต้อง");
    if (s.scope.inScope && ids.length + uploads.length < 1) {
      return fail("EVIDENCE_REQUIRED", `หอนี้มี ${s.roomCount} ห้อง อยู่ในขอบเขตประกาศ — เลือกนอกขอบเขตต้องแนบหลักฐาน (เช่น ใบอนุญาตหอพักนักศึกษา) อย่างน้อย 1 ไฟล์`);
    }
    if (!(await validEvidence(tenantId, ids))) return fail("EVIDENCE_INVALID", "หลักฐานต้องเป็นไฟล์ส่วนตัวที่อัปโหลดในร้านนี้");
    for (const u of uploads) {
      const up = await uploadFile(
        { tenantId },
        { kind: "ATTACHMENT", filename: u.contentType === "application/pdf" ? "legal-evidence.pdf" : "legal-evidence.jpg", contentType: u.contentType, data: u.data, visibility: "private" },
        deps?.put ? { put: deps.put } : undefined,
      );
      if (!up.ok) return fail("UPLOAD_FAILED", up.error);
      ids.push(up.assetId);
    }
    changes.push({ key: "rooms.legal.outOfScopeReason", scope: "UNIT", scopeId: unit.id, value: reason });
    changes.push({ key: "rooms.legal.outOfScopeEvidence", scope: "UNIT", scopeId: unit.id, value: ids });
  }
  const r = await setSettings(actor, { tenantId }, changes, {});
  if (!r.ok) return fail(r.code, r.issues[0]?.messageTh ?? "บันทึกโหมดตามกฎหมายไม่สำเร็จ");
  return { ok: true };
}

// ───────────────────────── 3.7 โมเดลหน้า ─────────────────────────
function nextMonth(p: string): string {
  const y = Number(p.slice(0, 4));
  const m = Number(p.slice(5, 7));
  return m === 12 ? `${String(y + 1).padStart(4, "0")}-01` : `${p.slice(0, 4)}-${String(m + 1).padStart(2, "0")}`;
}
function prevMonth(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 1 ? `${String(y - 1).padStart(4, "0")}-12` : `${today.slice(0, 4)}-${String(m - 1).padStart(2, "0")}`;
}

export async function dormLawModel(actor: SettingsActor, ctx: { tenantId: string }, input: { unitId: string; periodKey?: string }): Promise<DormLawModel | null> {
  const tenantId = ctx?.tenantId;
  const unit = await dormUnit(tenantId, isRec(input) ? input.unitId : null);
  // ดูเงินได้เฉพาะผู้ที่ดูข้อมูลหอได้ (dorm.view) — คนจดมิเตอร์อย่างเดียวไม่เห็น
  if (!unit || !actor || !canAccessUnit(actor, unit.id) || !dormAccess(actor, unit.id).board) return null;
  const db = tenantDb({ tenantId, unitId: unit.id });

  const maxP = nextMonth(bkkYmd(new Date()).slice(0, 7));
  let periodKey = typeof input.periodKey === "string" && PERIOD_RE.test(input.periodKey) && input.periodKey >= "2020-01" && input.periodKey <= maxP ? input.periodKey : "";
  if (!periodKey) {
    const latest = await db.dormUtilityRate.findFirst({ where: { authorityBillSatang: { not: null } }, orderBy: [{ periodKey: "desc" }], select: { periodKey: true } });
    periodKey = latest?.periodKey ?? prevMonth(bkkYmd(new Date()));
  }

  const [form, s, rateRows, gate, buildingRows] = await Promise.all([
    loadSettingsForm(actor, { tenantId }, { domains: ["rooms"], groups: ["general", "legal", "utility", "vat", "money"], unitId: unit.id }),
    scopeOf(tenantId, unit.id),
    db.dormUtilityRate.findMany({
      where: { periodKey: { lte: periodKey }, authorityBillSatang: { not: null } },
      orderBy: [{ periodKey: "desc" }, { createdAt: "asc" }],
      select: { kind: true, buildingId: true, periodKey: true, authorityBillSatang: true, authorityUnits: true, rateSatangPerUnit: true, billPhotoFileId: true },
    }),
    utilityBillingGate({ tenantId }, { unitId: unit.id, periodKey }),
    db.roomBuilding.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  if (!form) return null;

  const bills: DormLawBill[] = [];
  const seen = new Set<string>();
  // ต่อ kind: งวดล่าสุดที่มีบิล (≤ งวดของหน้า) — ทุกขอบเขต (ทั้งหน่วย/รายอาคาร) ของงวดนั้น
  const latestOf = new Map<string, string>();
  for (const r of rateRows) if (!latestOf.has(r.kind)) latestOf.set(r.kind, r.periodKey);
  for (const r of rateRows) {
    if (r.kind !== "ELEC" && r.kind !== "WATER") continue;
    if (latestOf.get(r.kind) !== r.periodKey) continue;
    const k = `${r.kind}|${r.buildingId ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    bills.push({
      kind: r.kind,
      buildingId: r.buildingId,
      periodKey: r.periodKey,
      billSatang: r.authorityBillSatang,
      units: r.authorityUnits,
      costRateSatangPerUnit: r.rateSatangPerUnit,
      hasPhoto: !!r.billPhotoFileId,
    });
  }
  bills.sort((a, b) => (a.kind === b.kind ? (a.buildingId ?? "").localeCompare(b.buildingId ?? "") : a.kind === "ELEC" ? -1 : 1));

  const modeField = form.groups.flatMap((g) => g.fields).find((f) => f.key === "rooms.legal.mode");
  return {
    unitId: unit.id,
    unitName: unit.name,
    periodKey,
    form,
    scope: { roomCount: s.roomCount, businessType: s.businessType, inScope: s.scope.inScope, code: s.scope.code, autoReasonTh: s.scope.autoReasonTh },
    legal: {
      mode: s.mode,
      editable: modeField?.editable === true,
      lockedReasonTh: modeField ? modeField.lockedReasonTh : "แก้ได้เฉพาะเจ้าของกิจการ",
      outOfScopeReason: s.reason,
      evidenceCount: s.evidence.length,
    },
    bills,
    buildings: buildingRows.map((b) => ({ id: b.id, name: b.name })),
    fingerprints: "groups" in gate ? gate.groups.map((g) => ({ kind: g.kind, buildingId: g.buildingId, fingerprint: g.legal.fingerprint })) : [],
    check: "blocks" in gate ? { ok: gate.ok, blocks: gate.blocks, needsAcceptance: gate.needsAcceptance } : { ok: false, blocks: [], needsAcceptance: [] },
    canRecordBill: evaluate(actor, { module: "dorm", action: "dorm.bill.run", unitId: unit.id }),
    canAccept: actor.role === "OWNER",
  };
}
