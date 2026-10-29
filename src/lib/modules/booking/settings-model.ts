// ─────────────────────────────────────────────────────────────
// booking/settings-model.ts — โมเดลจอตั้งค่าจองคิว 4 หน้า + งานเขียนของจอ (server) · SVC B.11 ใบสั่ง §4 §6
//
//   loadBookingSettingsPage — โมเดล JSON ล้วนของหน้า 08 (policy) · 14 (messages) · 11 (services) · 12 (staff)
//   applyBookingTemplate    — ตัวห่อ applyTemplate: ปฏิเสธแม่แบบซ่อน (คลินิก) · ต้องเลือก KEEP_CUSTOM/RESET_ALL ทุกครั้ง
//   setServiceBooking       — คอลัมน์เดิมของบริการ (เก็บห้อง · จองออนไลน์ · มัดจำ) — คอลัมน์ชนะค่าตั้ง (มติ B.0/B.3)
//   setStaffService         — ใครทำได้ + ราคา/เวลาเฉพาะคน (กติกา B.1 §6 ข้อ 3: มีแถว = เฉพาะแถว)
//   applyBookingRolePreset  — ใช้ชุดสิทธิ์ตามแม่แบบกับพนักงาน ผ่าน updateStaffAccess เดิม (ด่านห้ามยกระดับเดิมตัดสิน)
//
// 🔴 ช่องค่าตั้งทุกช่องมาจาก loadSettingsForm (กติกาเหล็ก #16) · ตำแหน่งอยู่ booking-settings-shared.ts
// 🔴 ฐานผ่าน tenantDb เท่านั้น (ร้าน/สาขาถูกฉีดทุกคิวรี · ไม่ใช้ prisma ดิบ)
// 🔴 actor มาจาก auth.active เท่านั้น (หน้า/ action ประกอบ) · ไม่ throw ในทางปกติ · ข้อความไทยไม่โทษผู้ใช้
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { BOOKING_ROLE_PRESETS, BOOKING_ROLE_ROWS, bookingPresetPermissions, isPermissionKey, isPermissionParamKey } from "@/lib/core/permissions";
import {
  applyTemplate,
  defaultFor,
  getDef,
  getTemplate,
  listDefs,
  loadSettingsForm,
  renderTemplate,
  resolveSettings,
  resolveSettingsMany,
  TEMPLATES,
} from "@/lib/core/settings";
import type { RemoveResult, SettingDef, SettingsActor, SettingsCtx } from "@/lib/core/settings";
import type { SettingsFormModel } from "@/components/settings/settings-shared";
import {
  BOOKING_SETTINGS_LAYOUT as LAYOUT,
  BOOKING_TEMPLATE_SUMMARY_TH,
  cardFieldKeys,
  fieldsOf,
  messagesUnitKeys,
  pageOfKey,
  shopFieldKeys,
  type BookingSettingsModel,
  type BookingSettingsPage,
  type DeviceRow,
  type HoursSource,
  type MessagesModel,
  type PolicyModel,
  type RoleColumn,
  type ServicesModel,
  type StaffModel,
} from "@/components/booking/settings/booking-settings-shared";
import { updateStaffAccess } from "@/lib/staff/service";
import { canBookingAction } from "./access";

type Unit = { id: string; name: string; slug: string };
type PageQuery = { unitId: string; page: string; serviceId?: string; staffId?: string; msgKind?: string };

const PAGES: ReadonlySet<string> = new Set(["policy", "messages", "services", "staff"]);
const K_PROVIDER = "booking.general.providerLabel";
const K_SERVICES_MODE = "booking.staff.servicesMode";
const K_HOURS_SOURCE = "booking.staff.hoursSource";
const K_ONLINE = "booking.booking.onlineSharePct";
const K_COMMISSION = "booking.money.commissionRate";
const K_WALKIN = "booking.service.walkIn";
const K_RESOURCE = "booking.service.resourceRule";
const K_DEFAULT_HOURS = "booking.general.defaultHours";
const SETTINGS_MONEY = "booking.settings.money";

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

const udbOf = (ctx: SettingsCtx, unitId: string) => tenantDb({ tenantId: ctx.tenantId, unitId });

/** สาขาจองคิวของร้านนี้ที่ผู้ดูเข้าได้ (ไม่ใช่ ⇒ null) */
async function bookingUnit(actor: SettingsActor, ctx: SettingsCtx, unitId: unknown): Promise<Unit | null> {
  if (typeof unitId !== "string" || !unitId || !ctx?.tenantId) return null;
  const u = await tenantDb({ tenantId: ctx.tenantId }).businessUnit.findFirst({ where: { id: unitId }, select: { id: true, name: true, slug: true, type: true } });
  if (!u || u.type !== "BOOKING" || !canAccessUnit(actor, u.id)) return null;
  return { id: u.id, name: u.name, slug: u.slug };
}

async function profileKey(ctx: SettingsCtx, unitId: string): Promise<string | null> {
  const p = await udbOf(ctx, unitId).settingProfile.findFirst({ where: { domain: "booking" }, select: { templateKey: true } });
  return p?.templateKey ?? null;
}

/** ฟอร์มที่ตัดเหลือเฉพาะคีย์ (ลำดับเดิม) — differsCount/ประวัติ คำนวณใหม่ตามคีย์ที่เหลือ */
function pickForm(form: SettingsFormModel, keys: readonly string[]): SettingsFormModel {
  const want = new Set(keys);
  const groups = form.groups.map((g) => ({ ...g, fields: g.fields.filter((f) => want.has(f.key)) })).filter((g) => g.fields.length > 0);
  return {
    ...form,
    groups,
    differsCount: groups.reduce((n, g) => n + g.fields.filter((f) => f.differsFromTemplate).length, 0),
    history: form.history.filter((h) => want.has(h.key)),
  };
}

const INTEGRATION_TH: Record<string, string> = { SLIP_VERIFY: "บริการตรวจสลิปโอนเงิน", LINE: "LINE Official Account", SMS: "บริการส่ง SMS" };

/**
 * ช่องที่ต้องเชื่อมตัวต่อก่อน "เปิด" (เครื่องยนต์ตอบ REQUIRES_INTEGRATION) แต่สาขานี้ยังไม่มีตัวต่อที่ครอบคลุม ⇒ ล็อกพร้อมเหตุผล
 * (กติกาเดียวกับ setSettings: ค่าว่าง/ปิด ไม่ต้องเชื่อม — ช่องที่เปิดอยู่แล้วยังปิดได้ จึงไม่ล็อก)
 */
async function lockUncoveredIntegrations(ctx: SettingsCtx, unitId: string, form: SettingsFormModel): Promise<SettingsFormModel> {
  const need = fieldsOf(form).filter((f) => f.requiresIntegration && f.editable && !f.value);
  if (!need.length) return form;
  const kinds = [...new Set(need.map((f) => String(f.requiresIntegration)))];
  const integs = await tenantDb({ tenantId: ctx.tenantId }).tenantIntegration.findMany({ where: { kind: { in: kinds }, status: "CONNECTED" }, select: { kind: true, unitIds: true } });
  const covered = (kind: string) => integs.some((r) => r.kind === kind && (r.unitIds.length === 0 || r.unitIds.includes(unitId)));
  const lock = new Set(need.filter((f) => !covered(String(f.requiresIntegration))).map((f) => f.key));
  if (!lock.size) return form;
  return {
    ...form,
    groups: form.groups.map((g) => ({
      ...g,
      fields: g.fields.map((f) =>
        lock.has(f.key)
          ? { ...f, editable: false, lockedReasonTh: `ต้องเชื่อม${INTEGRATION_TH[String(f.requiresIntegration)] ?? "บริการภายนอก"}ที่ครอบคลุมสาขานี้ก่อน — ไปที่ศูนย์เชื่อมต่อ` }
          : f,
      ),
    })),
  };
}

const anyEditable = (...forms: (SettingsFormModel | null)[]): boolean => forms.some((f) => fieldsOf(f).some((x) => x.editable));

// ───────────────────────── ค่าตัวอย่างของข้อความ (ตัวอย่าง LINE หน้า 14) ─────────────────────────

const SAMPLE_VARS = (unitName: string, providerLabel: string): Record<string, string> => ({
  ชื่อ: "สมชาย",
  ร้าน: unitName,
  เวลา: "15:20",
  ช่าง: `${providerLabel}เอก`,
  บริการ: "ตัดผมชาย",
  ลิงก์นัด: "shark.in.th/b/A1B2",
  เลขคิว: "A011",
  อีกกี่คิว: "2",
  ลิงก์บัตร: "shark.in.th/q/A011",
  นาทีที่เลื่อน: "15",
  วันหมดอายุ: "30 พ.ย.",
});

const MSG_HINT_TH: Record<string, string> = {
  confirmation: "หลังจอง/จ่ายมัดจำ",
  reminder: "ก่อนถึงนัดตามเวลาที่ตั้ง",
  checkedIn: "เมื่อเช็กอินที่ร้าน",
  ticketIssued: "เมื่อออกบัตรคิว walk-in",
  nearTurn: "เมื่อเหลือไม่กี่คิว",
  yourTurn: "เมื่อเรียกคิว",
  delayed: "เมื่อคิวช้ากว่าที่แจ้ง",
  noShowRebook: "ชวนนัดใหม่เมื่อไม่มา",
  rebookInvite: "ตามรอบบริการ",
  courseExpiry: "ก่อนคอร์สหมดอายุ",
};

// ───────────────────────── ค่าทีวี/ตู้ (DEVICE — ยังตั้งรายเครื่องไม่ได้) ─────────────────────────

const LOCALE_TH: Record<string, string> = { th: "ไทย", en: "อังกฤษ" };
const DEVICE_LOCK_TH = "ตั้งต่อเครื่อง (จอ/ตู้แต่ละเครื่อง) — ตอนนี้ใช้ค่าตามแม่แบบ จะเปิดให้แก้เมื่อระบบรองรับการตั้งค่ารายเครื่อง";

function deviceValueTh(def: SettingDef, v: unknown, providerLabel: string): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "เปิด" : "ปิด";
  if (typeof v === "string") return def.enumLabelsTh?.[v] ?? LOCALE_TH[v] ?? v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length === 0 ? "ปิด" : v.map((x) => LOCALE_TH[String(x)] ?? String(x)).join(" + ");
  if (isRec(v)) {
    const parts: string[] = [];
    if (v.label === "PROVIDER") parts.push(`แสดงชื่อ${providerLabel}`);
    else if (v.label === "RESOURCE") parts.push("แสดงชื่อทรัพยากร");
    if (typeof v.showCustomerName === "boolean") parts.push(v.showCustomerName ? "แสดงชื่อลูกค้า" : "ไม่แสดงชื่อลูกค้า");
    return parts.join(" · ") || "ตามแม่แบบ";
  }
  return "ตามแม่แบบ";
}

function deviceRows(group: string, tplKey: string | null, providerLabel: string): DeviceRow[] {
  return listDefs("booking")
    .filter((d) => d.group === group && !d.hiddenUntil)
    .map((d) => ({ key: d.key, labelTh: d.labelTh, valueTh: deviceValueTh(d, defaultFor(d, tplKey), providerLabel), editable: false as const, lockedReasonTh: DEVICE_LOCK_TH }));
}

// ───────────────────────── loadBookingSettingsPage ─────────────────────────

export async function loadBookingSettingsPage(actor: SettingsActor, ctx: SettingsCtx, q: PageQuery): Promise<BookingSettingsModel | null> {
  try {
    if (!q || !PAGES.has(q.page)) return null;
    const unit = await bookingUnit(actor, ctx, q.unitId);
    if (!unit) return null;
    const providerRes = await resolveSettings(ctx, [K_PROVIDER], { unitId: unit.id });
    const providerLabel = str(providerRes[K_PROVIDER]?.value) || "ช่าง";
    const base = { unitId: unit.id, unitName: unit.name, basePath: `/app/u/${unit.slug}/booking`, providerLabel };
    if (q.page === "policy") return policyModel(actor, ctx, unit, base);
    if (q.page === "messages") return messagesModel(actor, ctx, unit, base, q.msgKind);
    if (q.page === "services") return servicesModel(actor, ctx, unit, base, q.serviceId);
    return staffModel(actor, ctx, unit, base, q.staffId);
  } catch (e) {
    console.error("[booking.settings] loadBookingSettingsPage", e instanceof Error ? e.message : e);
    return null;
  }
}

type Base = { unitId: string; unitName: string; basePath: string; providerLabel: string };

async function policyModel(actor: SettingsActor, ctx: SettingsCtx, unit: Unit, base: Base): Promise<PolicyModel | null> {
  const raw = await loadSettingsForm(actor, ctx, { domains: ["booking", "payments", "messaging"], unitId: unit.id });
  if (!raw) return null;
  const form = await lockUncoveredIntegrations(ctx, unit.id, raw);
  const fields = fieldsOf(form);
  const tplKey = form.templates.find((t) => t.domain === "booking")?.key ?? null;
  const tpl = tplKey ? getTemplate("booking", tplKey) : undefined;
  const all = [...(TEMPLATES.booking ?? [])];
  const templates = [...all.filter((t) => !t.hiddenUntil), ...all.filter((t) => !!t.hiddenUntil)].map((t) => {
    const sum = BOOKING_TEMPLATE_SUMMARY_TH[t.key];
    return {
      key: t.key,
      labelTh: t.labelTh,
      active: t.key === tplKey,
      hidden: !!t.hiddenUntil,
      tagTh: sum?.tagTh ?? "",
      summaryTh: (sum?.lines ?? [`ค่าเริ่มต้นสำหรับร้าน${t.labelTh}`]).slice(0, 3),
    };
  });
  const diff = tplKey ? fields.filter((f) => f.domain === "booking" && f.differsFromTemplate) : [];
  const diffLinks: Record<string, BookingSettingsPage> = {};
  for (const f of diff) diffLinks[f.key] = pageOfKey(f, fields);
  const cards = LAYOUT.policyCards
    .map((c) => ({ key: c.key, no: c.no, column: c.column, labelTh: c.labelTh, fieldKeys: cardFieldKeys(c, fields) }))
    .filter((c) => c.fieldKeys.length > 0);
  return {
    page: "policy",
    ...base,
    canEdit: anyEditable(form),
    form,
    template: tplKey ? { key: tplKey, labelTh: tpl?.labelTh ?? tplKey } : null,
    templates,
    diffCount: diff.length,
    diffKeys: diff.map((f) => f.key),
    diffLinks,
    cards,
    canApplyTemplate: actor.role === "OWNER",
  };
}

const ROLE_HEAD_TH: Record<Exclude<RoleColumn, "PROVIDER">, string> = { OWNER: "เจ้าของ", LEAD: "หัวหน้าร้าน", CASHIER: "แคชเชียร์", ASSISTANT: "ผู้ช่วย" };

async function messagesModel(actor: SettingsActor, ctx: SettingsCtx, unit: Unit, base: Base, msgKind: string | undefined): Promise<MessagesModel | null> {
  const msgDefs = listDefs("booking").filter((d) => d.key.startsWith(LAYOUT.msgKeyPrefix) && d.type === "template" && !d.hiddenUntil);
  const kinds = msgDefs.map((d) => d.key.slice(LAYOUT.msgKeyPrefix.length));
  const selectedKind = msgKind === undefined || msgKind === "" ? (kinds[0] ?? "") : msgKind;
  if (!kinds.includes(selectedKind)) return null;

  const [full, tenantForm, tplKey] = await Promise.all([
    loadSettingsForm(actor, ctx, { domains: ["booking", "messaging"], unitId: unit.id }),
    loadSettingsForm(actor, ctx, { domains: [LAYOUT.privacyGroup.domain], groups: LAYOUT.privacyGroup.group ? [LAYOUT.privacyGroup.group] : undefined, unitId: unit.id, scope: "TENANT" }),
    profileKey(ctx, unit.id),
  ]);
  if (!full) return null;
  const form = await lockUncoveredIntegrations(ctx, unit.id, pickForm(full, messagesUnitKeys(fieldsOf(full))));
  const fields = fieldsOf(form);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const enabled = byKey.get(LAYOUT.msgEnabledKey)?.value;
  const msgKinds = msgDefs.map((d, i) => ({
    kind: kinds[i],
    labelTh: d.labelTh,
    enabled: isRec(enabled) && enabled[kinds[i]] === true,
    key: d.key,
    hintTh: MSG_HINT_TH[kinds[i]] ?? "",
  }));
  const selDef = msgDefs[kinds.indexOf(selectedKind)];
  const selValue = byKey.get(selDef.key)?.value ?? defaultFor(selDef, tplKey);
  const previewVars = SAMPLE_VARS(unit.name, base.providerLabel);
  const preview = { th: renderTemplate(selDef, selValue, previewVars, "th") };

  const pickStaff = fields.filter((f) => LAYOUT.messagesKeys.kioskEditableKeys.includes(f.key));
  const devices = {
    tv: deviceRows(LAYOUT.deviceGroups.tv, tplKey, base.providerLabel),
    kiosk: [...pickStaff, ...deviceRows(LAYOUT.deviceGroups.kiosk, tplKey, base.providerLabel)] as DeviceRow[],
  };

  const tpl = tplKey === "SPA" || tplKey === "CLINIC" ? tplKey : "BARBER";
  const presets = BOOKING_ROLE_PRESETS[tpl];
  const roleCols: RoleColumn[] = ["OWNER", "LEAD", "PROVIDER", "CASHIER", ...(presets.ASSISTANT ? (["ASSISTANT"] as const) : [])];
  const columns = roleCols.map((role) => ({ role, labelTh: role === "PROVIDER" ? base.providerLabel : ROLE_HEAD_TH[role] }));
  const rows = BOOKING_ROLE_ROWS.map((r) => ({
    id: r.id,
    labelTh: r.labelTh,
    cells: Object.fromEntries(roleCols.map((role) => [role, role === "OWNER" ? true : (presets[role] ?? []).includes(r.id)])) as Partial<Record<RoleColumn, boolean>>,
  }));
  let applyTargets: { membershipId: string; nameTh: string }[] | null = null;
  if (actor.role === "OWNER" || actor.role === "MANAGER") {
    const ms = await tenantDb({ tenantId: ctx.tenantId }).membership.findMany({
      where: { tenantId: ctx.tenantId, role: "STAFF", acceptedAt: { not: null }, NOT: { userId: actor.userId } },
      select: { id: true, unitAccess: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    applyTargets = ms
      .filter((m) => Array.isArray(m.unitAccess) && ((m.unitAccess as unknown[]).includes("*") || (m.unitAccess as unknown[]).includes(unit.id)))
      .map((m) => {
        const n = (m.user?.name ?? "").trim();
        return { membershipId: m.id, nameTh: n && !n.includes("@") ? n : "พนักงาน (ยังไม่ตั้งชื่อ)" };
      });
  }
  return {
    page: "messages",
    ...base,
    canEdit: anyEditable(form, tenantForm),
    form,
    tenantForm,
    msgKinds,
    selectedKind,
    preview,
    previewVars,
    devices,
    roles: { columns, rows, applyTargets },
  };
}

type StaffLite = { id: string; name: string; employeeId: string | null };
type SvcLite = { id: string; name: string; durationMin: number; bufferMin: number; priceSatang: number; depositSatang: number; bookable: boolean };

/** ใครทำบริการไหนได้ (กติกา B.1: มีแถว = เฉพาะแถว · ไม่มีแถว = ตาม servicesMode ชั้น STAFF) */
async function whoCanMap(ctx: SettingsCtx, unitId: string, staff: StaffLite[]) {
  const [rows, modes] = await Promise.all([
    udbOf(ctx, unitId).bookingStaffService.findMany({
      where: { staffId: { in: staff.map((s) => s.id) } },
      select: { staffId: true, serviceId: true, priceSatang: true, durationMin: true },
    }),
    staff.length ? resolveSettingsMany(ctx, [K_SERVICES_MODE], staff.map((s) => ({ unitId, staffId: s.id }))) : Promise.resolve([]),
  ]);
  const byStaff = new Map<string, Map<string, { priceSatang: number | null; durationMin: number | null }>>();
  for (const r of rows) {
    if (!byStaff.has(r.staffId)) byStaff.set(r.staffId, new Map());
    byStaff.get(r.staffId)?.set(r.serviceId, { priceSatang: r.priceSatang, durationMin: r.durationMin });
  }
  const modeOf = new Map(staff.map((s, i) => [s.id, modes[i]?.[K_SERVICES_MODE]?.value === "ASSIGNED" ? "ASSIGNED" : "ALL"]));
  const can = (staffId: string, serviceId: string): boolean => {
    const own = byStaff.get(staffId);
    if (own && own.size > 0) return own.has(serviceId);
    return modeOf.get(staffId) === "ALL";
  };
  return { byStaff, modeOf, can };
}

async function activeStaff(ctx: SettingsCtx, unitId: string): Promise<StaffLite[]> {
  return udbOf(ctx, unitId).bookingStaff.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, employeeId: true },
  });
}

async function activeServices(ctx: SettingsCtx, unitId: string): Promise<SvcLite[]> {
  return udbOf(ctx, unitId).bookingService.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, durationMin: true, bufferMin: true, priceSatang: true, depositSatang: true, bookable: true },
  });
}

/** ?service= / ?staff= = id หรือชื่อตรงตัวในสาขา · ไม่ระบุ ⇒ แถวแรก · ระบุแต่ไม่พบ ⇒ undefined (หน้า notFound) */
function pick<T extends { id: string; name: string }>(rows: T[], want: string | undefined): T | null | undefined {
  if (want === undefined || want === "") return rows[0] ?? null;
  return rows.find((r) => r.id === want) ?? rows.find((r) => r.name === want);
}

async function servicesModel(actor: SettingsActor, ctx: SettingsCtx, unit: Unit, base: Base, serviceId: string | undefined): Promise<ServicesModel | null> {
  const [services, staff] = await Promise.all([activeServices(ctx, unit.id), activeStaff(ctx, unit.id)]);
  const sel = pick(services, serviceId);
  if (sel === undefined) return null;
  const [shopFull, serviceFull, who, svcSets] = await Promise.all([
    loadSettingsForm(actor, ctx, { domains: ["booking"], unitId: unit.id }),
    sel ? loadSettingsForm(actor, ctx, { domains: ["booking"], unitId: unit.id, scope: "SERVICE", scopeId: sel.id }) : Promise.resolve(null),
    whoCanMap(ctx, unit.id, staff),
    services.length ? resolveSettingsMany(ctx, [K_WALKIN, K_RESOURCE], services.map((s) => ({ unitId: unit.id, serviceId: s.id }))) : Promise.resolve([]),
  ]);
  if (!shopFull) return null;
  const shopForm = pickForm(shopFull, shopFieldKeys("services", fieldsOf(shopFull)));
  const ex = new Set(LAYOUT.servicePanelExclude);
  const serviceForm = serviceFull ? pickForm(serviceFull, fieldsOf(serviceFull).map((f) => f.key).filter((k) => !ex.has(k))) : null;
  const resDef = getDef(K_RESOURCE);
  const rows = services.map((s, i) => {
    const w = svcSets[i]?.[K_WALKIN]?.value;
    const walkIn = isRec(w) && w.enabled === true && (w.closeAtOrAboveMin === null || (typeof w.closeAtOrAboveMin === "number" && s.durationMin < w.closeAtOrAboveMin));
    const rr = svcSets[i]?.[K_RESOURCE]?.value;
    return {
      ...s,
      requiresTh: typeof rr === "string" ? (resDef?.enumLabelsTh?.[rr] ?? "—") : "—",
      canCount: staff.filter((x) => who.can(x.id, s.id)).length,
      staffTotal: staff.length,
      walkIn,
    };
  });
  const whoRows = sel
    ? staff.map((x) => {
        const row = who.byStaff.get(x.id)?.get(sel.id);
        return { staffId: x.id, name: x.name, can: who.can(x.id, sel.id), priceSatang: row?.priceSatang ?? null, durationMin: row?.durationMin ?? null };
      })
    : [];
  const m = { role: actor.role, unitAccess: actor.unitAccess, permissions: actor.permissions };
  return {
    page: "services",
    ...base,
    canEdit: anyEditable(shopForm, serviceForm),
    shopForm,
    serviceForm,
    rows,
    selectedId: sel?.id ?? null,
    who: whoRows,
    canEditService: canBookingAction(m, unit.id, "setServiceBookingAction"),
    canEditMoney: evaluate(m, { module: "booking", action: SETTINGS_MONEY, unitId: unit.id }),
    canEditWho: canBookingAction(m, unit.id, "setStaffServiceAction"),
  };
}

async function staffModel(actor: SettingsActor, ctx: SettingsCtx, unit: Unit, base: Base, staffId: string | undefined): Promise<StaffModel | null> {
  const [staff, services] = await Promise.all([activeStaff(ctx, unit.id), activeServices(ctx, unit.id)]);
  const sel = pick(staff, staffId);
  if (sel === undefined) return null;
  const [shopFull, staffForm, who, sets, weeklyRows, unitHours, unitSet] = await Promise.all([
    loadSettingsForm(actor, ctx, { domains: ["booking"], unitId: unit.id }),
    sel ? loadSettingsForm(actor, ctx, { domains: ["booking"], unitId: unit.id, scope: "STAFF", scopeId: sel.id }) : Promise.resolve(null),
    whoCanMap(ctx, unit.id, staff),
    staff.length ? resolveSettingsMany(ctx, [K_HOURS_SOURCE, K_ONLINE, K_COMMISSION], staff.map((s) => ({ unitId: unit.id, staffId: s.id }))) : Promise.resolve([]),
    udbOf(ctx, unit.id).bookingStaffHours.findMany({ where: { staffId: { in: staff.map((s) => s.id) } }, select: { staffId: true, weekday: true, startMin: true, endMin: true } }),
    udbOf(ctx, unit.id).bookingHours.findMany({ select: { weekday: true, openMin: true, closeMin: true, closed: true } }),
    resolveSettings(ctx, [K_DEFAULT_HOURS], { unitId: unit.id }),
  ]);
  if (!shopFull) return null;
  const shopForm = pickForm(shopFull, shopFieldKeys("staff", fieldsOf(shopFull)));
  const hasWeekly = new Set(weeklyRows.map((r) => r.staffId));
  const rows = staff.map((s, i) => {
    const order = sets[i]?.[K_HOURS_SOURCE]?.value;
    const list = Array.isArray(order) ? order.filter((x): x is HoursSource => x === "HR_SHIFT" || x === "STAFF_WEEKLY" || x === "UNIT_HOURS") : [];
    const hoursSource: HoursSource =
      list.find((src) => (src === "HR_SHIFT" ? !!s.employeeId : src === "STAFF_WEEKLY" ? hasWeekly.has(s.id) : true)) ?? "UNIT_HOURS";
    const pct = sets[i]?.[K_ONLINE]?.value;
    const cr = sets[i]?.[K_COMMISSION]?.value;
    const own = who.byStaff.get(s.id);
    const canNames = services.filter((sv) => who.can(s.id, sv.id)).map((sv) => sv.name);
    const servicesTh =
      own && own.size > 0 ? canNames.join(" · ") || "—" : who.modeOf.get(s.id) === "ALL" ? "ทุกบริการ" : "ยังไม่ได้ผูกบริการ";
    return {
      id: s.id,
      name: s.name,
      hoursSource,
      onlinePct: typeof pct === "number" ? pct : 100,
      servicesTh,
      commissionBp: isRec(cr) && typeof cr.serviceBp === "number" ? cr.serviceBp : null,
      linked: !!s.employeeId,
    };
  });
  const dh = unitSet[K_DEFAULT_HOURS]?.value;
  const defOpen = isRec(dh) && typeof dh.openMin === "number" ? dh.openMin : 600;
  const defClose = isRec(dh) && typeof dh.closeMin === "number" ? dh.closeMin : 1200;
  let week: StaffModel["week"] = [];
  if (sel) {
    const selRow = rows.find((r) => r.id === sel.id);
    const own = weeklyRows.filter((r) => r.staffId === sel.id);
    week = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      if (selRow?.hoursSource === "STAFF_WEEKLY") {
        const day = own.filter((r) => r.weekday === weekday);
        if (!day.length) return { weekday, startMin: null, endMin: null };
        return { weekday, startMin: Math.min(...day.map((r) => r.startMin)), endMin: Math.max(...day.map((r) => r.endMin)) };
      }
      const uh = unitHours.find((h) => h.weekday === weekday);
      if (!uh) return { weekday, startMin: defOpen, endMin: defClose };
      return uh.closed ? { weekday, startMin: null, endMin: null } : { weekday, startMin: uh.openMin, endMin: uh.closeMin };
    });
  }
  return {
    page: "staff",
    ...base,
    canEdit: anyEditable(shopForm, staffForm),
    shopForm,
    staffForm,
    rows,
    selectedId: sel?.id ?? null,
    week,
  };
}

// ───────────────────────── applyBookingTemplate ─────────────────────────

export async function applyBookingTemplate(
  actor: SettingsActor,
  ctx: SettingsCtx,
  i: { unitId: string; templateKey: string; overwrite: "KEEP_CUSTOM" | "RESET_ALL" },
): Promise<RemoveResult> {
  const tpl = typeof i?.templateKey === "string" ? getTemplate("booking", i.templateKey) : undefined;
  if (!tpl) return { ok: false, code: "VALIDATION", issues: [{ code: "UNKNOWN_TEMPLATE", messageTh: "ไม่รู้จักแม่แบบนี้ — ลองโหลดหน้าใหม่อีกครั้ง" }] };
  if (tpl.hiddenUntil) return { ok: false, code: "VALIDATION", issues: [{ code: "TEMPLATE_HIDDEN", messageTh: `แม่แบบ «${tpl.labelTh}» ยังไม่เปิดให้ใช้ (เร็ว ๆ นี้)` }] };
  if (i.overwrite !== "KEEP_CUSTOM" && i.overwrite !== "RESET_ALL") {
    return { ok: false, code: "VALIDATION", issues: [{ code: "INVALID_OVERWRITE", messageTh: "เลือกก่อนว่าจะคงค่าที่ปรับไว้ หรือล้างค่าที่ปรับทั้งหมด" }] };
  }
  const t = await tenantDb({ tenantId: ctx.tenantId }).businessUnit.findFirst({ where: { id: str(i.unitId) }, select: { type: true } });
  if (!t || t.type !== "BOOKING") return { ok: false, code: "NOT_FOUND", issues: [{ code: "NOT_FOUND", messageTh: "ไม่พบสาขานี้ — ลองโหลดหน้าใหม่อีกครั้ง" }] };
  return applyTemplate(actor, ctx, { unitId: i.unitId, domain: "booking", templateKey: tpl.key, overwrite: i.overwrite });
}

// ───────────────────────── setServiceBooking ─────────────────────────

type WriteFail<C extends string> = { ok: false; code: C; reason: string };
const NOT_FOUND_TH = "ไม่พบรายการนี้ในสาขา — ลองโหลดหน้าใหม่อีกครั้ง";
const NO_PERM_TH = "คุณยังไม่มีสิทธิ์แก้ส่วนนี้ — ขอสิทธิ์จากเจ้าของร้าน";
const NO_MONEY_TH = "เรื่องเงิน (ราคา/มัดจำ) แก้ได้เฉพาะผู้ที่มีสิทธิ์ค่าตั้งเรื่องเงิน — ขอสิทธิ์จากเจ้าของร้าน";

const membershipOf = (a: SettingsActor) => ({ role: a.role, unitAccess: a.unitAccess, permissions: a.permissions });

async function audit(tenantId: string, unitId: string, actorId: string, action: string, targetType: string, targetId: string, before: object, after: object) {
  try {
    await tenantDb({ tenantId }).auditLog.create({ data: { tenantId, unitId, actorType: "USER", actorId, action, targetType, targetId, before, after } });
  } catch (e) {
    console.error("[booking.settings] audit", e instanceof Error ? e.message : e);
  }
}

export async function setServiceBooking(
  actor: SettingsActor,
  ctx: SettingsCtx,
  i: { unitId: string; serviceId: string; bufferMin?: number; bookable?: boolean; depositSatang?: number },
): Promise<{ ok: true } | WriteFail<"NOT_FOUND" | "PERMISSION" | "BAD_INPUT">> {
  const unit = await bookingUnit(actor, ctx, i?.unitId);
  if (!unit) return { ok: false, code: "NOT_FOUND", reason: NOT_FOUND_TH };
  const m = membershipOf(actor);
  if (!canBookingAction(m, unit.id, "setServiceBookingAction")) return { ok: false, code: "PERMISSION", reason: NO_PERM_TH };
  if (i.depositSatang !== undefined && !evaluate(m, { module: "booking", action: SETTINGS_MONEY, unitId: unit.id })) return { ok: false, code: "PERMISSION", reason: NO_MONEY_TH };
  if (i.bufferMin !== undefined && !isInt(i.bufferMin, 0, 240)) return { ok: false, code: "BAD_INPUT", reason: "เวลาเก็บห้อง/พักหลังบริการ ต้องเป็นจำนวนเต็ม 0–240 นาที" };
  if (i.bookable !== undefined && typeof i.bookable !== "boolean") return { ok: false, code: "BAD_INPUT", reason: "เลือกเปิดหรือปิดการจองออนไลน์" };
  if (i.depositSatang !== undefined && !isInt(i.depositSatang, 0, 100_000_000)) return { ok: false, code: "BAD_INPUT", reason: "มัดจำต้องเป็นจำนวนเงินที่ไม่ติดลบ (ไม่เกิน 1,000,000 บาท)" };
  const udb = udbOf(ctx, unit.id);
  const svc = await udb.bookingService.findFirst({
    where: { id: str(i.serviceId) },
    select: { id: true, bufferMin: true, bookable: true, depositSatang: true },
  });
  if (!svc) return { ok: false, code: "NOT_FOUND", reason: NOT_FOUND_TH };
  const data = {
    ...(i.bufferMin !== undefined ? { bufferMin: i.bufferMin } : {}),
    ...(i.bookable !== undefined ? { bookable: i.bookable } : {}),
    ...(i.depositSatang !== undefined ? { depositSatang: i.depositSatang } : {}),
  };
  if (!Object.keys(data).length) return { ok: true };
  await udb.bookingService.updateMany({ where: { id: svc.id }, data });
  await audit(ctx.tenantId, unit.id, actor.userId, "booking.service.settings", "BookingService", svc.id,
    { bufferMin: svc.bufferMin, bookable: svc.bookable, depositSatang: svc.depositSatang }, data);
  return { ok: true };
}

// ───────────────────────── setStaffService ─────────────────────────

export async function setStaffService(
  actor: SettingsActor,
  ctx: SettingsCtx,
  i: { unitId: string; staffId: string; serviceId: string; can: boolean; priceSatang: number | null; durationMin: number | null },
): Promise<{ ok: true } | WriteFail<"NOT_FOUND" | "PERMISSION" | "BAD_INPUT" | "LAST_SERVICE">> {
  const unit = await bookingUnit(actor, ctx, i?.unitId);
  if (!unit) return { ok: false, code: "NOT_FOUND", reason: NOT_FOUND_TH };
  const m = membershipOf(actor);
  if (!canBookingAction(m, unit.id, "setStaffServiceAction")) return { ok: false, code: "PERMISSION", reason: NO_PERM_TH };
  if (typeof i.can !== "boolean") return { ok: false, code: "BAD_INPUT", reason: "เลือกว่าทำบริการนี้ได้หรือไม่" };
  if (i.priceSatang !== null && !isInt(i.priceSatang, 0, 100_000_000)) return { ok: false, code: "BAD_INPUT", reason: "ราคาเฉพาะคนต้องเป็นจำนวนเงินที่ไม่ติดลบ (เว้นว่าง = ตามราคาบริการ)" };
  if (i.durationMin !== null && !isInt(i.durationMin, 5, 600)) return { ok: false, code: "BAD_INPUT", reason: "เวลาเฉพาะคนต้องเป็น 5–600 นาที (เว้นว่าง = ตามเวลาบริการ)" };
  if (!i.can && (i.priceSatang !== null || i.durationMin !== null)) return { ok: false, code: "BAD_INPUT", reason: "ไม่รับบริการนี้ ไม่ต้องตั้งราคา/เวลาเฉพาะคน" };
  const udb = udbOf(ctx, unit.id);
  const [staff, svc] = await Promise.all([
    udb.bookingStaff.findFirst({ where: { id: str(i.staffId), active: true }, select: { id: true, name: true } }),
    udb.bookingService.findFirst({ where: { id: str(i.serviceId), active: true }, select: { id: true, name: true } }),
  ]);
  if (!staff || !svc) return { ok: false, code: "NOT_FOUND", reason: NOT_FOUND_TH };
  const modeRes = await resolveSettings(ctx, [K_SERVICES_MODE], { unitId: unit.id, staffId: staff.id });
  const modeAll = modeRes[K_SERVICES_MODE]?.value !== "ASSIGNED";
  const canMoney = evaluate(m, { module: "booking", action: SETTINGS_MONEY, unitId: unit.id });

  type Out = { ok: true; changed: boolean } | WriteFail<"PERMISSION" | "LAST_SERVICE">;
  const out = await udb.$transaction(async (tx): Promise<Out> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`booking:staff-service:${ctx.tenantId}:${staff.id}`}, 0))`;
    const rows = await tx.bookingStaffService.findMany({ where: { staffId: staff.id }, select: { serviceId: true, priceSatang: true } });
    const cur = rows.find((r) => r.serviceId === svc.id);
    const priceBefore = cur?.priceSatang ?? null;
    if (i.can && i.priceSatang !== priceBefore && !canMoney) return { ok: false, code: "PERMISSION", reason: NO_MONEY_TH };
    const hasRows = rows.length > 0;
    const needMaterialize = !hasRows && modeAll && (!i.can || i.priceSatang !== null || i.durationMin !== null);
    if (needMaterialize) {
      const others = await tx.bookingService.findMany({ where: { active: true, NOT: { id: svc.id } }, select: { id: true } });
      if (!i.can && others.length === 0) return { ok: false, code: "LAST_SERVICE", reason: `${staff.name} ต้องรับอย่างน้อย 1 บริการ — ถ้าไม่รับงานแล้วให้ปิดรับคิวแทน` };
      if (others.length) {
        await tx.bookingStaffService.createMany({
          data: others.map((o) => ({ tenantId: ctx.tenantId, unitId: unit.id, staffId: staff.id, serviceId: o.id, priceSatang: null, durationMin: null })),
          skipDuplicates: true,
        });
      }
    }
    if (!i.can) {
      if (!cur) return { ok: true, changed: needMaterialize };
      if (rows.length <= 1) return { ok: false, code: "LAST_SERVICE", reason: `${staff.name} ต้องรับอย่างน้อย 1 บริการ — ถ้าไม่รับงานแล้วให้ปิดรับคิวแทน` };
      await tx.bookingStaffService.deleteMany({ where: { staffId: staff.id, serviceId: svc.id } });
      return { ok: true, changed: true };
    }
    if (!hasRows && !needMaterialize && modeAll) return { ok: true, changed: false }; // ทำทุกบริการอยู่แล้ว · ไม่มีค่าเฉพาะ
    const upd = await tx.bookingStaffService.updateMany({ where: { staffId: staff.id, serviceId: svc.id }, data: { priceSatang: i.priceSatang, durationMin: i.durationMin } });
    if (upd.count === 0) {
      await tx.bookingStaffService.create({
        data: { tenantId: ctx.tenantId, unitId: unit.id, staffId: staff.id, serviceId: svc.id, priceSatang: i.priceSatang, durationMin: i.durationMin },
      });
    }
    return { ok: true, changed: true };
  });
  if (!out.ok) return out;
  if (out.changed) {
    await audit(ctx.tenantId, unit.id, actor.userId, "booking.staff.service", "BookingStaff", staff.id, { serviceId: svc.id },
      { serviceId: svc.id, can: i.can, priceSatang: i.priceSatang, durationMin: i.durationMin });
  }
  return { ok: true };
}

// ───────────────────────── applyBookingRolePreset ─────────────────────────

const PRESET_ROLES: ReadonlySet<string> = new Set(["LEAD", "PROVIDER", "CASHIER"]);

export async function applyBookingRolePreset(
  actor: SettingsActor,
  ctx: SettingsCtx,
  i: { unitId: string; membershipId: string; role: "LEAD" | "PROVIDER" | "CASHIER" },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!PRESET_ROLES.has(str(i?.role))) return { ok: false, reason: "เลือกชุดสิทธิ์ หัวหน้าร้าน ผู้ให้บริการ หรือแคชเชียร์" };
  const unit = await bookingUnit(actor, ctx, i.unitId);
  if (!unit) return { ok: false, reason: "ไม่พบสาขานี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  if (!canBookingAction(membershipOf(actor), unit.id, "applyBookingRolePresetAction")) return { ok: false, reason: NO_PERM_TH };
  const target = await tenantDb({ tenantId: ctx.tenantId }).membership.findFirst({ where: { id: str(i.membershipId), tenantId: ctx.tenantId }, select: { id: true, role: true, permissions: true } });
  if (!target) return { ok: false, reason: "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้ — ลองโหลดหน้าใหม่อีกครั้ง" };
  if (target.role !== "STAFF") return { ok: false, reason: "ชุดสิทธิ์ใช้กับผู้ใช้บทบาทพนักงานเท่านั้น (เจ้าของ/ผู้จัดการมีสิทธิ์ครบอยู่แล้ว)" };
  const tplKey = (await profileKey(ctx, unit.id)) ?? "BARBER";
  const preset = bookingPresetPermissions(tplKey, i.role);
  const rowKeys = new Set(BOOKING_ROLE_ROWS.flatMap((r) => r.keys));
  const current = isRec(target.permissions) ? target.permissions : {};
  // คงสิทธิ์ของระบบอื่น (และค่าตัวเลขของสิทธิ์) ไว้ตามเดิม — updateStaffAccess แทนชุดคีย์ที่ทะเบียนรู้จักทั้งชุด
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) {
    if (rowKeys.has(k) || k === "booking.*") continue;
    if ((isPermissionKey(k) && v === true) || (isPermissionParamKey(k) && typeof v === "number")) kept[k] = v;
  }
  const r = await updateStaffAccess({ tenantId: ctx.tenantId, actorUserId: actor.userId, membershipId: target.id, permissions: { ...kept, ...preset } });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}
