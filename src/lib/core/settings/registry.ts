// ─────────────────────────────────────────────────────────────
// registry.ts — ทะเบียนนิยามค่าตั้ง (pure) · SVC R0.3 · ใบสั่ง §3
//
// defineSettings(domain, defs, opts) ตรวจ "ทั้งชุด" ก่อนลงทะเบียนสักตัว (โยน = ไม่มีอะไรลง):
//   key ซ้ำ · key ไม่ขึ้นต้นด้วย domain · chain ผิด · ค่าเริ่ม (_fallback + ทุกแม่แบบที่ระบุ) ไม่ผ่าน zod ·
//   labelTh ว่าง · snapshot อ้าง key ที่ไม่มี · legal อ้าง ruleId ที่ไม่มี
// เรียกซ้ำต่อ domain ได้ (defs/rooms.ts · defs/booking.ts) — แม่แบบ/snapshot/groupRules ต่อท้าย
//
// 🔴 pure: import ได้เฉพาะ zod · ไฟล์ pure ในโฟลเดอร์นี้ · ./legal/th-rental-2568 · core/permissions · import type
// ─────────────────────────────────────────────────────────────
import { evaluateLegal, TH_RENTAL_2568_RULES, type LegalRuleId, type LegalRuleInputs } from "./legal/th-rental-2568";
import { templateTexts } from "./template";
import {
  SCOPE_KINDS,
  type DefineSettingsOptions,
  type GroupIssue,
  type GroupRule,
  type ScopeKind,
  type SettingDef,
  type TemplateDef,
} from "./types";

const DEFS = new Map<string, SettingDef>();
const GROUP_RULES = new Map<string, GroupRule[]>(); // domain → rules
const SNAPSHOT_DOMAIN = new Map<string, string>(); // kind → domain
/** R0.4 ▸ ป้ายไทยของกลุ่ม: "<domain>|<group>" → ข้อความ ◂ */
const GROUP_LABELS = new Map<string, string>();
/** R0.3 fix 6 ▸ คีย์ที่ legalInput ของ def อ่านผ่าน get (ไม่รวมตัวเอง) — จับตอนลงทะเบียนด้วยค่าเริ่ม ◂ */
const LEGAL_DEPS = new Map<string, ReadonlySet<string>>();

/** แม่แบบต่อ domain (ออบเจกต์สด — อ่านได้หลังลงทะเบียน) */
export const TEMPLATES: Record<string, readonly TemplateDef[]> = {};
/** คีย์ที่เอกสารแต่ละชนิดจด (kind เป็นข้อความ ตรวจกับทะเบียน) */
export const SNAPSHOT_KEYS: Record<string, readonly string[]> = {};

const SCOPE_SET: ReadonlySet<string> = new Set(SCOPE_KINDS);
export const isScopeKind = (s: unknown): s is ScopeKind => typeof s === "string" && SCOPE_SET.has(s);

const nonEmpty = (s: unknown): boolean => typeof s === "string" && s.trim().length > 0;

function chainProblem(chain: unknown): string | null {
  if (!Array.isArray(chain) || chain.length === 0) return "chain ว่าง";
  const seen = new Set<string>();
  for (const s of chain) {
    if (!isScopeKind(s)) return `chain มีชั้นที่ไม่รู้จัก ${String(s)}`;
    if (seen.has(s)) return `chain มีชั้นซ้ำ ${s}`;
    seen.add(s);
  }
  const ti = chain.indexOf("TENANT");
  if (ti > 0) return "TENANT ต้องอยู่ตัวแรกของ chain";
  const ui = chain.indexOf("UNIT");
  if (ui >= 0 && !(ui === 0 || (ui === 1 && ti === 0))) return "UNIT ต้องอยู่ตัวแรกหรือถัดจาก TENANT";
  return null;
}

/** ตัวแปลงค่าตั้ง → อินพุตตัวตรวจกฎหมาย (ปริยาย · ใบสั่ง §2) · undefined = ไม่มีอินพุต (evaluateLegal ⇒ BLOCK INVALID_INPUT · fail closed) */
function defaultLegalInput(ruleId: LegalRuleId, value: unknown): unknown {
  if (ruleId === "DEPOSIT_RETURN_DAYS") return { days: value };
  if (ruleId === "LATE_FEE_CAP") return { feeSatang: value };
  if (ruleId === "TEMPLATE_NO_THREAT") return { text: templateTexts(value).join("\n") };
  return undefined;
}

/**
 * อินพุตของตัวตรวจกฎหมายต่อ rule ของ def (legalInput ก่อน · ไม่มี ⇒ ตัวแปลงปริยาย)
 * rule ที่ legalInput คืน null = "ตรวจตอนบันทึกค่าตั้งไม่ได้" ⇒ ไม่อยู่ในผล (ตรวจซ้ำที่จุดต้นทุน · CC §1.7)
 */
export function legalInputsOf(def: SettingDef, value: unknown, get: (key: string) => unknown): { ruleId: LegalRuleId; input: unknown }[] {
  const out: { ruleId: LegalRuleId; input: unknown }[] = [];
  if (!def.legal?.length) return out;
  const custom = def.legalInput ? def.legalInput(value, get) : null;
  for (const ruleId of def.legal) {
    if (custom && Object.prototype.hasOwnProperty.call(custom, ruleId)) {
      const input = custom[ruleId];
      if (input === null) continue;
      out.push({ ruleId, input });
    } else out.push({ ruleId, input: defaultLegalInput(ruleId, value) });
  }
  return out;
}

/** R0.3 fix 6 ▸ def ที่มีกฎหมายซึ่ง legalInput อ่านคีย์นี้ (แก้คีย์นี้ ⇒ ต้องตรวจ def เหล่านั้นซ้ำ) ◂ */
export function legalDependentsOf(key: string): SettingDef[] {
  const out: SettingDef[] = [];
  for (const [k, deps] of LEGAL_DEPS) {
    if (!deps.has(key)) continue;
    const d = DEFS.get(k);
    if (d) out.push(d);
  }
  return out;
}

function schemaOk(def: SettingDef, value: unknown): boolean {
  const s = def.schema as { safeParse?: (v: unknown) => { success: boolean } } | undefined;
  return typeof s?.safeParse === "function" && s.safeParse(value).success;
}

/**
 * ลงทะเบียนนิยามค่าตั้งของ domain — ตรวจทั้งชุดก่อน (โยน Error = ไม่มีอะไรลง)
 */
export function defineSettings(domain: string, defs: readonly SettingDef[], opts: DefineSettingsOptions = {}): void {
  const problems: string[] = [];
  const batch = new Map<string, SettingDef>();
  if (typeof domain !== "string" || !/^[a-z][a-zA-Z0-9]*$/.test(domain)) problems.push(`domain ไม่ถูกต้อง: ${String(domain)}`);
  for (const d of defs) {
    const key = d?.key;
    if (typeof key !== "string" || !key) {
      problems.push("def ไม่มี key");
      continue;
    }
    if (DEFS.has(key) || batch.has(key)) problems.push(`key ซ้ำ: ${key}`);
    if (!key.startsWith(`${domain}.`)) problems.push(`${key}: ต้องขึ้นต้นด้วย ${domain}.`);
    if (d.domain !== domain) problems.push(`${key}: domain ไม่ตรง (${String(d.domain)})`);
    if (typeof d.group !== "string" || !d.group) problems.push(`${key}: ไม่มี group`);
    if (typeof d.editPermission !== "string" || !d.editPermission.includes(".")) problems.push(`${key}: editPermission ไม่ถูกต้อง`);
    if (!nonEmpty(d.labelTh)) problems.push(`${key}: labelTh ว่าง`);
    const cp = chainProblem(d.chain);
    if (cp) problems.push(`${key}: ${cp}`);
    const defaults = (d.defaults ?? {}) as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(defaults, "_fallback")) problems.push(`${key}: ไม่มี defaults._fallback`);
    for (const [tk, v] of Object.entries(defaults)) {
      if (!schemaOk(d, v)) problems.push(`${key}: ค่าเริ่ม ${tk} ไม่ผ่าน schema`);
    }
    for (const r of d.legal ?? []) {
      if (!Object.prototype.hasOwnProperty.call(TH_RENTAL_2568_RULES, r)) problems.push(`${key}: legal อ้าง ruleId ที่ไม่มี ${String(r)}`);
    }
    batch.set(key, d);
  }
  const known = (k: string) => DEFS.has(k) || batch.has(k);
  for (const [kind, keys] of Object.entries(opts.snapshots ?? {})) {
    for (const k of keys) if (!known(k)) problems.push(`snapshot ${kind} อ้าง key ที่ไม่มี: ${k}`);
    const owner = SNAPSHOT_DOMAIN.get(kind);
    if (owner && owner !== domain) problems.push(`snapshot ${kind} เป็นของ domain ${owner}`);
    for (const k of keys) {
      const dd = DEFS.get(k) ?? batch.get(k);
      if (dd && dd.domain !== domain) problems.push(`snapshot ${kind}: ${k} อยู่ต่าง domain`);
    }
  }
  const tplKeys = new Set((TEMPLATES[domain] ?? []).map((t) => t.key));
  for (const t of opts.templates ?? []) {
    if (!t || typeof t.key !== "string" || !t.key || t.key === "_fallback") problems.push("แม่แบบไม่มี key");
    else if (tplKeys.has(t.key)) problems.push(`แม่แบบซ้ำ: ${t.key}`);
    else tplKeys.add(t.key);
    if (!Number.isInteger(t?.version) || t.version < 1) problems.push(`แม่แบบ ${String(t?.key)}: version ต้องเป็นจำนวนเต็ม ≥ 1`);
    if (!nonEmpty(t?.labelTh)) problems.push(`แม่แบบ ${String(t?.key)}: labelTh ว่าง`);
  }
  for (const r of opts.groupRules ?? []) {
    if (!r || typeof r.group !== "string" || typeof r.check !== "function") problems.push("groupRule ไม่ถูกต้อง");
  }
  for (const [g, label] of Object.entries(opts.groupLabelsTh ?? {})) {
    if (!nonEmpty(label)) problems.push(`groupLabelsTh ${g}: ป้ายว่าง`);
  }
  for (const d of batch.values()) {
    for (const [v, label] of Object.entries(d.enumLabelsTh ?? {})) {
      if (!nonEmpty(label)) problems.push(`${d.key}: enumLabelsTh ${v} ป้ายว่าง`);
    }
  }
  // R0.3 fix 5 ▸ ค่าเริ่ม/แม่แบบของ def ที่มีกฎหมายต้องผ่าน evaluateLegal โหมด STRICT (ค่าที่ร้านได้โดยไม่แตะอะไรต้องถูกกฎหมาย) ◂
  //   + จดคีย์ที่ legalInput อ่าน (fix 6) — get คืนค่าเริ่มของแม่แบบเดียวกัน (ไม่ระบุ ⇒ _fallback)
  const deps = new Map<string, Set<string>>();
  if (!problems.length) {
    for (const [key, d] of batch) {
      if (!d.legal?.length) continue;
      const seen = new Set<string>();
      for (const [tk, v] of Object.entries(d.defaults as Record<string, unknown>)) {
        const get = (k: string): unknown => {
          if (k !== key) seen.add(k);
          const dd = batch.get(k) ?? DEFS.get(k);
          if (!dd) return undefined;
          const dv = dd.defaults as Record<string, unknown>;
          return Object.prototype.hasOwnProperty.call(dv, tk) ? dv[tk] : dv._fallback;
        };
        let inputs: { ruleId: LegalRuleId; input: unknown }[];
        try {
          inputs = legalInputsOf(d, v, get);
        } catch (e) {
          problems.push(`${key}: legalInput โยนกับค่าเริ่ม ${tk} (${e instanceof Error ? e.message : String(e)})`);
          continue;
        }
        for (const { ruleId, input } of inputs) {
          const o = evaluateLegal(ruleId, input as LegalRuleInputs[LegalRuleId], { mode: "STRICT" });
          if (o.level !== "OK") problems.push(`${key}: ค่าเริ่ม ${tk} ไม่ผ่านกฎหมาย ${ruleId} (${o.code})`);
        }
      }
      if (d.legalInput) deps.set(key, seen);
    }
  }
  if (problems.length) throw new Error(`[settings] defineSettings(${String(domain)}) ไม่ผ่าน: ${problems.join(" · ")}`);

  // ── ผ่านทั้งชุด ⇒ ลงทะเบียน ──
  for (const [k, d] of batch) DEFS.set(k, d);
  for (const [k, ks] of deps) LEGAL_DEPS.set(k, ks);
  if (opts.templates?.length) TEMPLATES[domain] = [...(TEMPLATES[domain] ?? []), ...opts.templates];
  else if (!TEMPLATES[domain]) TEMPLATES[domain] = [];
  for (const [kind, keys] of Object.entries(opts.snapshots ?? {})) {
    SNAPSHOT_KEYS[kind] = [...new Set([...(SNAPSHOT_KEYS[kind] ?? []), ...keys])];
    SNAPSHOT_DOMAIN.set(kind, domain);
  }
  if (opts.groupRules?.length) GROUP_RULES.set(domain, [...(GROUP_RULES.get(domain) ?? []), ...opts.groupRules]);
  for (const [g, label] of Object.entries(opts.groupLabelsTh ?? {})) GROUP_LABELS.set(`${domain}|${g}`, label.trim());
}

/** R0.4 ▸ ป้ายไทยของกลุ่ม (ไม่มี ⇒ undefined — ผู้เรียกต้องมีทางสำรอง · กลุ่มไม่มีป้าย = บั๊ก) ◂ */
export function groupLabelTh(domain: string, group: string): string | undefined {
  return GROUP_LABELS.get(`${domain}|${group}`);
}

export function getDef(key: string): SettingDef | undefined {
  return DEFS.get(key);
}

export function listDefs(domain: string, group?: string): SettingDef[] {
  const out: SettingDef[] = [];
  for (const d of DEFS.values()) if (d.domain === domain && (group === undefined || d.group === group)) out.push(d);
  return out;
}

export function getTemplate(domain: string, templateKey: string): TemplateDef | undefined {
  return (TEMPLATES[domain] ?? []).find((t) => t.key === templateKey);
}

/** domain ของ snapshot kind (ไม่รู้จัก ⇒ undefined) */
export function snapshotDomain(kind: string): string | undefined {
  return SNAPSHOT_DOMAIN.get(kind);
}

/** R0.3 fix 7 ▸ กลุ่มที่ต้องล็อกทั้งกลุ่มตอนเขียน: มีกฎข้ามค่า หรือมี def ที่ legalInput อ่านค่าอื่น ◂ */
export function groupNeedsLock(domain: string, group: string): boolean {
  if (groupHasRules(domain, group)) return true;
  for (const d of DEFS.values()) if (d.domain === domain && d.group === group && LEGAL_DEPS.has(d.key)) return true;
  return false;
}

/** กลุ่มนี้มีกฎตรวจข้ามค่าไหม (ไม่มี ⇒ ผู้เรียกข้ามการคำนวณ) */
export function groupHasRules(domain: string, group: string): boolean {
  return (GROUP_RULES.get(domain) ?? []).some((r) => r.group === group);
}

/** ตรวจข้ามค่าของกลุ่ม — รวมทุกกฎของกลุ่ม */
export function validateGroup(domain: string, group: string, values: Record<string, unknown>): GroupIssue[] {
  const out: GroupIssue[] = [];
  for (const r of GROUP_RULES.get(domain) ?? []) if (r.group === group) out.push(...r.check(values));
  return out;
}

/** ค่าเริ่มของ def ตามแม่แบบ (ไม่มีแม่แบบ/แม่แบบไม่ระบุคีย์ ⇒ _fallback) */
export function defaultFor(def: SettingDef, templateKey: string | null): unknown {
  if (templateKey && templateKey !== "_fallback" && Object.prototype.hasOwnProperty.call(def.defaults, templateKey)) return def.defaults[templateKey];
  return def.defaults._fallback;
}

/** เจ้าของเท่านั้น: ownerOnly หรือ sensitivity LEGAL */
export const isOwnerOnly = (def: SettingDef): boolean => def.ownerOnly === true || def.sensitivity === "LEGAL";
