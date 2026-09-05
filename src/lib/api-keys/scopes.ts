// ขอบเขตสิทธิ์ของ API key ฝั่งบัญชี (WO A1) — ทะเบียนกลางที่ service / หน้าตั้งค่า / REST อ่านร่วมกัน
//
// หลัก: scope ของคีย์ = permission key ตัวเดียวกับที่ RBAC ใช้ (`<module>.<entity>.<verb>`)
// ไม่มีคำศัพท์สิทธิ์ชุดที่สอง — คีย์ทำได้ไม่เกินสิ่งที่คนในร้านทำได้
// "bundle" = ชุดสำเร็จรูปให้เจ้าของร้านเลือกโดยไม่ต้องอ่าน scope ทีละตัว (ยังติ๊กเพิ่ม/ลดรายตัวได้)

import { PERMISSIONS, isPermissionKey, isPermissionParamKey } from "@/lib/core/permissions";

/**
 * permission key ที่ทะเบียนรู้จักแต่ **ใช้เป็น scope ของคีย์ไม่ได้**
 * `account.approve.limit` = "เพดานยอดอนุมัติ" — เป็นค่าตั้งของสิทธิ์ (ตัวเลข) ไม่ใช่การกระทำที่ REST เรียกได้
 * (ทะเบียนเก็บมันไว้ในกลุ่ม action จึงหลุด `isPermissionParamKey` — กันที่นี่ให้ชัด)
 */
export const NON_API_SCOPE_KEYS: readonly string[] = ["account.approve.limit"];

/** คีย์นี้ใช้เป็น scope ของ API key ได้ไหม (ต้องเป็น permission key จริง · ไม่ใช่ค่าตัวเลข) */
export function isApiScope(key: string): boolean {
  return isPermissionKey(key) && !isPermissionParamKey(key) && !NON_API_SCOPE_KEYS.includes(key);
}

/** permission key ของโมดูลบัญชีที่ใช้เป็น scope ได้ (ตัดค่าตั้ง/ค่าตัวเลขออก) — ที่มาเดียวคือทะเบียน PERMISSIONS */
export const ACCOUNT_SCOPE_KEYS: readonly string[] = PERMISSIONS.filter(
  (p) => p.module === "account" && isApiScope(p.key),
).map((p) => p.key);

export type ApiScopeBundleId = "read-only" | "issue-and-collect" | "accountant" | "danger" | "settings";

export type ApiScopeBundle = {
  id: ApiScopeBundleId;
  /** ชื่อที่เจ้าของร้านเห็นบนหน้าจอ */
  label: string;
  /** คำอธิบายภาษาอังกฤษสำหรับคู่มือ/OpenAPI (คู่มือหลักเป็นอังกฤษ) */
  summary: string;
  scopes: readonly string[];
};

const READ_ONLY_SCOPES = [
  "account.doc.view",
  "account.report.view",
  "account.journal.view",
  "account.tax.view",
] as const;

const ISSUE_AND_COLLECT_SCOPES = [
  ...READ_ONLY_SCOPES,
  "account.doc.create",
  "account.doc.issue",
  "account.doc.public_link",
  "account.payment.record",
  "account.contact.manage",
  "account.product.manage",
  "account.document.manage",
] as const;

const ACCOUNTANT_SCOPES = [
  ...ISSUE_AND_COLLECT_SCOPES,
  "account.journal.adjust",
  "account.period.close",
  "account.chart.manage",
  "account.mapping.manage",
  "account.wht.manage",
  "account.asset.manage",
  "account.asset.register",
  "account.asset.dispose",
  "account.cheque.manage",
  "account.cheque.deposit",
  "account.cheque.clear",
  "account.cheque.bounce",
  "account.finance.manage",
  "account.reconcile",
] as const;

/**
 * ชุดสำเร็จรูป 5 ชุด — ซ้อนกันเป็นชั้น: read-only ⊂ issue-and-collect ⊂ accountant
 * `danger` แยกออกจาก accountant เสมอ (ยกเลิก/เปิดงวด/รวมผู้ติดต่อ = กู้คืนยาก ต้องตั้งใจติ๊กเอง)
 */
export const API_SCOPE_BUNDLES: readonly ApiScopeBundle[] = [
  {
    id: "read-only",
    label: "อ่านอย่างเดียว",
    summary: "Read documents, journals, tax and financial reports. No writes at all.",
    scopes: READ_ONLY_SCOPES,
  },
  {
    id: "issue-and-collect",
    label: "ออกเอกสารและรับเงิน",
    summary: "Everything in read-only plus creating/issuing documents, recording payments, managing contacts and products.",
    scopes: ISSUE_AND_COLLECT_SCOPES,
  },
  {
    id: "accountant",
    label: "งานบัญชีเต็มรูปแบบ",
    summary: "Everything in issue-and-collect plus journal adjustments, period close, chart of accounts, assets, cheques, bank accounts and reconciliation.",
    scopes: ACCOUNTANT_SCOPES,
  },
  {
    id: "danger",
    label: "การกระทำที่ย้อนกลับยาก",
    summary: "Irreversible operations: voiding documents and payments, reopening periods, un-marking WHT, merging contacts, writing assets off, approving documents.",
    scopes: [
      "account.doc.void",
      "account.doc.approve",
      "account.payment.void",
      "account.period.reopen",
      "account.wht.unmark",
      "account.contact.merge",
      "account.cheque.void",
      "account.asset.writeoff",
    ],
  },
  {
    id: "settings",
    label: "ตั้งค่าและนำเข้าข้อมูล",
    summary: "Change accounting settings, approval ceilings and import data into the books.",
    // `account.approve.limit` (เพดานยอดอนุมัติ) เป็นค่าตั้ง ไม่ใช่การกระทำ — ไม่อยู่ในชุดใด (ดู NON_API_SCOPE_KEYS)
    scopes: ["account.settings.manage", "account.import"],
  },
];

/** ชุดปริยายเมื่อสร้างคีย์จากหน้าบัญชี (เจ้าของเคาะ: ออกเอกสาร+รับเงิน · 365 วัน) */
export const DEFAULT_BUNDLE_ID: ApiScopeBundleId = "issue-and-collect";

/** อายุคีย์ปริยาย (วัน) — ใช้ทั้งตอนสร้างจากหน้าจอและตอนหมุนคีย์ที่ไม่มีวันหมดอายุ */
export const DEFAULT_KEY_TTL_DAYS = 365;

const BUNDLE_BY_ID = new Map<string, ApiScopeBundle>(API_SCOPE_BUNDLES.map((b) => [b.id, b]));

/** scope ของชุดหนึ่ง (ทุกตัวในทะเบียนต้องเป็น scope ที่ใช้ได้ — ข้อสอบ AK-7 ตรวจ) */
function usableScopes(bundle: ApiScopeBundle): string[] {
  return [...bundle.scopes];
}

/** แปลงรายชื่อชุด → scope รวม (ไม่ซ้ำ · เรียงตามลำดับที่พบ) · ชุดที่ไม่รู้จัก → โยน */
export function expandBundles(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const bundle = BUNDLE_BY_ID.get(id);
    if (!bundle) throw new Error(`ไม่รู้จักชุดสิทธิ์ "${id}"`);
    for (const s of usableScopes(bundle)) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** ชุดไหนบ้างที่ scope ทั้งชุดอยู่ในรายการที่ให้มา (ใช้ทำป้ายบอกชุดในตารางคีย์) */
export function bundlesCovering(scopes: string[]): string[] {
  const have = new Set(scopes);
  return API_SCOPE_BUNDLES.filter((b) => {
    const need = usableScopes(b);
    return need.length > 0 && need.every((s) => have.has(s));
  }).map((b) => b.id);
}

/**
 * ป้ายไทยของ scope ชุดหนึ่ง — ใช้ในตารางคีย์ทั้งของหน้าบัญชีและหน้าแพลตฟอร์ม (ที่เดียว ห้ามพิมพ์ซ้ำ)
 * `[]` (คีย์รุ่นเดิมก่อน A1) → "อ่าน API กลาง (คีย์รุ่นเดิม)"
 * ชุด scope ตรงกับ bundle ใดพอดี (ไม่ขาดไม่เกิน) → ป้ายไทยของ bundle นั้น (เลือกตัวใหญ่สุดถ้าเท่ากันหลายตัว)
 * ไม่ตรงชุดไหนเป๊ะ → "กำหนดเอง (n สิทธิ์)"
 */
export function bundleLabelForScopes(scopes: readonly string[]): string {
  if (scopes.length === 0) return "อ่าน API กลาง (คีย์รุ่นเดิม)";
  const exact = bundlesCovering([...scopes])
    .map((id) => BUNDLE_BY_ID.get(id)!)
    .filter((b) => b.scopes.length === scopes.length)
    .sort((a, b) => b.scopes.length - a.scopes.length)[0];
  return exact ? exact.label : `กำหนดเอง (${scopes.length} สิทธิ์)`;
}
