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

/** permission key ของโมดูลบอร์ดงานที่ใช้เป็น scope ได้ (K1.15) — ที่มาเดียวคือทะเบียน PERMISSIONS เช่นกัน */
export const KANBAN_SCOPE_KEYS: readonly string[] = PERMISSIONS.filter(
  (p) => p.module === "kanban" && isApiScope(p.key),
).map((p) => p.key);

/** permission key ของระบบสมาชิกที่ใช้เป็น scope ได้ (M1.11) — ที่มาเดียวคือทะเบียน PERMISSIONS */
export const MEMBER_SCOPE_KEYS: readonly string[] = PERMISSIONS.filter(
  (p) => p.module === "member" && isApiScope(p.key),
).map((p) => p.key);

export type ApiScopeBundleId =
  // บัญชี (WO A1)
  | "read-only"
  | "issue-and-collect"
  | "accountant"
  | "danger"
  | "settings"
  // บอร์ดงาน (K1.15 · D18 — บทบาทบนบอร์ดของคีย์มาจากชุดเหล่านี้)
  | "kanban-read"
  | "kanban-edit"
  | "kanban-admin"
  // ระบบสมาชิก (M1.11 · §6.3 — read/operate ไม่เห็นข้อมูลอ่อนไหวเสมอ)
  | "member-read"
  | "member-operate"
  | "member-admin";

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

// ── บอร์ดงาน (K1.15 · D18) ────────────────────────────────────────────────
// 3 ชุดซ้อนกันเป็นชั้น: read ⊂ edit ⊂ admin — ตรงกับ "บทบาทบนบอร์ด" ที่คีย์จะได้พอดี
//   read  → VIEWER ทุกบอร์ดของระบบที่ผูก
//   edit  → EDITOR (สร้าง/แก้/ย้าย/เก็บการ์ด · คอลัมน์ · ป้าย · ความเห็น · ไฟล์แนบ · สร้างบอร์ด)
//   admin → ADMIN (เพิ่มด้วยการจัดการสมาชิกบอร์ด/เทมเพลต/กฎอัตโนมัติ/รายงาน)
// 🔴 `kanban.board.member.manage` **มีเฉพาะในชุด admin** — นี่คือตัวชี้ขาดบทบาท ADMIN ตาม D18
const KANBAN_READ_SCOPES = ["kanban.board.read"] as const;

const KANBAN_EDIT_SCOPES = [
  ...KANBAN_READ_SCOPES,
  "kanban.board.create",
  "kanban.board.rename",
  "kanban.column.create",
  "kanban.card.create",
  "kanban.card.update",
  "kanban.card.move",
  "kanban.card.delete",
  "kanban.card.comment",
  "kanban.card.attach",
  "kanban.label.manage",
] as const;

const KANBAN_ADMIN_SCOPES = [
  ...KANBAN_EDIT_SCOPES,
  "kanban.board.delete",
  "kanban.board.member.manage",
  "kanban.column.delete",
  "kanban.template.manage",
  "kanban.automation.manage",
  "kanban.report.view",
] as const;

// ── ระบบสมาชิก (M1.11 · พิมพ์เขียว §6.3) ───────────────────────────────────
// 3 ชุดซ้อนกันเป็นชั้น: read ⊂ operate ⊂ admin
//   read    → อ่านอย่างเดียวทุกหมวดของโมดูล (สมาชิก · ระดับ · แต้ม · สแตมป์/รางวัล · โปรโมชัน · รีวิว · รายงาน)
//   operate → งานที่พนักงานหน้าร้านทำ: สมัคร/แก้สมาชิก · นำเข้า · ประทับสแตมป์ · ออกโปรโมชัน · ปรับแต้ม · ตอบรีวิว
//   admin   → ทุกคีย์ของโมดูล (ตั้งค่า · ความเป็นส่วนตัว · ระดับ · ลบข้อมูล · คีย์ API · บัตรกำนัล)
//
// 🔴 `member.sensitive.read` **ไม่อยู่ในชุด read และ operate** และแม้จะติ๊กเองก็ไม่มีผล:
//    §6.3 กำหนดว่าคีย์ชุด readonly/operate ไม่เห็นข้อมูลอ่อนไหว **เสมอ** — ตัวบังคับจริงอยู่ที่
//    `member/api/actor.ts` (แปลงชุดสิทธิ์เป็น `apiRole`) + `member/privacy.ts` ไม่ใช่ที่รายการนี้
// 🔴 คีย์ `member.settings.manage` / `member.privacy.manage` / `member.api.manage` มีเฉพาะชุด admin —
//    3 ตัวนี้คือตัวชี้ขาดว่าคีย์เป็น "ผู้ดูแล" (ดู `memberApiRoleForScopes`)
const MEMBER_READ_SCOPES = [
  "member.customer.read",
  "member.tier.read",
  "member.point.read",
  "member.loyalty.read",
  "member.promo.read",
  "member.review.read",
  "member.report.view",
] as const;

const MEMBER_OPERATE_SCOPES = [
  ...MEMBER_READ_SCOPES,
  "member.customer.create",
  "member.customer.update",
  "member.customer.import",
  "member.loyalty.stamp",
  "member.loyalty.fulfil",
  "member.promo.issue",
  "member.point.adjust",
  "member.review.reply",
] as const;

/** ทุกคีย์ `member.*` ที่ใช้เป็น scope ได้ — เรียงให้ชุด operate มาก่อน แล้วต่อด้วยที่เหลือ */
const MEMBER_ADMIN_SCOPES: readonly string[] = [
  ...MEMBER_OPERATE_SCOPES,
  ...MEMBER_SCOPE_KEYS.filter((k) => !MEMBER_OPERATE_SCOPES.includes(k as (typeof MEMBER_OPERATE_SCOPES)[number])),
];

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
  {
    id: "kanban-read",
    label: "บอร์ดงาน — อ่านอย่างเดียว",
    summary: "Read every board of the bound task board system: boards, columns, cards, comments and attachments. No writes at all.",
    scopes: KANBAN_READ_SCOPES,
  },
  {
    id: "kanban-edit",
    label: "บอร์ดงาน — ทำงานกับการ์ด",
    summary: "Everything in kanban-read plus creating and editing boards, columns, cards, labels, comments and attachments. Acts as EDITOR on every board.",
    scopes: KANBAN_EDIT_SCOPES,
  },
  {
    id: "kanban-admin",
    label: "บอร์ดงาน — ผู้ดูแล",
    summary: "Everything in kanban-edit plus board members, archiving boards and columns, templates and automation. Acts as ADMIN on every board.",
    scopes: KANBAN_ADMIN_SCOPES,
  },
  {
    id: "member-read",
    label: "สมาชิก — อ่านอย่างเดียว",
    summary:
      "Read the member system: members and their custom fields, tiers, points, loyalty cards, promotions, reviews and the acquisition report. Never sees sensitive member data, and writes nothing.",
    scopes: MEMBER_READ_SCOPES,
  },
  {
    id: "member-operate",
    label: "สมาชิก — งานหน้าร้าน",
    summary:
      "Everything in member-read plus the counter work: register and edit members, import them, stamp loyalty cards, hand out rewards, issue promotions, adjust points and reply to reviews. Still never sees sensitive member data.",
    scopes: MEMBER_OPERATE_SCOPES,
  },
  {
    id: "member-admin",
    label: "สมาชิก — ผู้ดูแล",
    summary:
      "Every member permission: settings and custom fields, privacy and PDPA, tiers and their rules, gift cards, erasing a member, and managing the member API keys. This is the only bundle that can see sensitive member data, and only as far as the shop's own policy allows.",
    scopes: MEMBER_ADMIN_SCOPES,
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
