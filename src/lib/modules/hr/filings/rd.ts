// HR H3.6 ▸ ภ.ง.ด.1 / ภ.ง.ด.1ก — RD Format 2.0 [V] (pure) · brief R4 R5 · ตารางช่อง wo-notes/hr-H3.6-oracle.md §3
//   ไฟล์ = UTF-8 BOM + บรรทัดคั่น "|" + CRLF หลังทุกบรรทัด · H 22 ช่อง + D 26 ช่อง · จำนวนเงิน "<บาท>.<สตางค์ 2 หลัก>" จากสตางค์จำนวนเต็ม
//   ลำดับปฏิเสธ (R7): PROFILE → OPTIONS → RUN_DATA → EMPTY · คนที่ใส่ไม่ได้ = notIncluded (ไม่เดา ไม่ทิ้งเงียบ)
//   "/" ในส่วนที่อยู่: slashMode DASH (ค่าตั้งต้น [U]) เขียน "-" + เตือน SLASH_DASH · EXCLUDE = "<ช่อง>:char" · "/" ในชื่อไม่แก้เด็ดขาด
//   HR H3.6 ▸ หนี้ H3.5: ชื่อที่ว่างหลังทำความสะอาด (เช่น มีแต่สระ/วรรณยุกต์) = ช่องขาด ไม่เขียนชื่อว่าง ◂
//   ไม่มี db/เวลา/สุ่ม · ไม่แก้อินพุต ◂
import { utf8, concat, isThaiMark } from "../bank-files/encode";
import { filingText, type FilingTextKey } from "./texts";

// ═════════════ ตัวช่วยร่วม (sso.ts / cert.ts ใช้ด้วย) ═════════════
/** เลขประจำตัว 13 หลัก + หลักตรวจ mod 11 [S] — ไม่รับขีด/ช่องว่าง */
export function thaiIdOk(v: unknown): boolean {
  if (typeof v !== "string" || !/^\d{13}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(v[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(v[12]);
}
/** ตัดช่องว่างหัวท้าย (ไม่ใช่สตริง = "") */
export const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
/** อักขระควบคุม C0/C1 · DEL · ตัวควบคุมทิศทาง/ไม่มีความกว้างที่ซ่อนข้อความได้ */
export const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
/**
 * HR H3.6 ▸ หนี้ H3.5 (ชื่อว่างหลังทำความสะอาด): มีอักขระฐานอย่างน้อย 1 ตัว — ตัดช่องว่าง · อักขระควบคุม · เครื่องหมายกำกับ (สระบน/ล่าง วรรณยุกต์ \p{M}) ออกแล้วยังเหลือ ◂
 */
export function hasBase(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (/\s/.test(ch) || CONTROL_RE.test(ch) || isThaiMark(c) || /\p{M}/u.test(ch)) continue;
    return true;
  }
  return false;
}
/** จำนวนอักขระ (code point) */
export const charLen = (s: string) => Array.from(s).length;
/** วันที่ "YYYY-MM-DD" ที่มีอยู่จริง ปี ค.ศ. 2000–2400 */
export function validDay(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[3])));
  return y >= 2000 && y <= 2400 && d.getUTCFullYear() === y && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
/** สตางค์ → "1234.56" (RD 15,2 · ไม่มีตัวคั่นหลักพัน) */
export const bahtStr = (s: number) => `${Math.floor(s / 100)}.${String(s % 100).padStart(2, "0")}`;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ═════════════ รูปร่างร่วม ═════════════
export type FilingAddress = {
  building: string | null; room: string | null; floor: string | null; village: string | null; houseNo: string | null; moo: string | null; soi: string | null; street: string | null;
  subdistrict: string | null; district: string | null; province: string | null; postcode: string | null; line: string | null;
};
export type FilingPerson = {
  employeeId: string;
  name: string;
  code: string | null;
  nationalId: string | null;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  ssoPrefix: string | null;
  address: FilingAddress;
};
export type FilingEmployer = {
  taxId: string | null;
  branchNo: string | null;
  employerName: string | null;
  employerAddress: string | null;
  deptName: string | null;
  lto: boolean | null;
  branchType: string | null;
  rdUserId: string | null;
  rdFormFlag: number | null;
  rdSlashMode?: string | null;
  ssoAccountNo: string | null;
  ssoBranchNo: string | null;
  ssoEncoding?: string | null;
  ssoWageMode?: string | null;
  signerName: string | null;
  certPrefix: string | null;
};
export type FilingItem = {
  employeeId: string;
  runId: string;
  engineVersion: number;
  runStatus: string;
  payDate: string;
  incomeSatang: number;
  taxSatang: number;
  ssoWageActualSatang: number;
  ssoWageClampedSatang: number;
  ssoEmployeeSatang: number;
  ssoEmployerSatang: number;
};
export type FilingWarning = { employeeId: string | null; code: string; fields: string[] };
export type RefusalCode = "STATUS" | "PROFILE" | "OPTIONS" | "RUN_DATA" | "EMPTY";
export type FilingFail<NI> = { ok: false; code: RefusalCode; text: string; fields: string[]; notIncluded?: NI[] };
const TEXT_KEY: Record<RefusalCode, FilingTextKey> = { STATUS: "status", PROFILE: "profile", OPTIONS: "options", RUN_DATA: "runData", EMPTY: "empty" };
export function refuse<NI>(code: RefusalCode, fields: string[] = [], extra: { runs?: string[]; notIncluded?: NI[] } = {}): FilingFail<NI> {
  return {
    ok: false,
    code,
    text: filingText(TEXT_KEY[code], code === "RUN_DATA" ? { runs: extra.runs ?? [] } : { fields }),
    fields: code === "RUN_DATA" ? [] : fields,
    ...(extra.notIncluded ? { notIncluded: extra.notIncluded } : {}),
  };
}

/** ลำดับคนของไฟล์ (R5): รหัสพนักงาน (ว่าง = ท้าย) → ชื่อ → employeeId · เทียบ code unit ของ JS */
export function personOrder(a: FilingPerson, b: FilingPerson): number {
  const ca = clean(a.code) || null;
  const cb = clean(b.code) || null;
  return (ca === null ? 1 : 0) - (cb === null ? 1 : 0) || cmp(ca ?? "", cb ?? "") || cmp(clean(a.name), clean(b.name)) || cmp(a.employeeId, b.employeeId);
}
/** ทำสำเนา + เรียงคนตามลำดับไฟล์ (ไม่แก้อินพุต) */
export const sortedPersons = (ps: FilingPerson[]) => [...ps].sort(personOrder);

/** ตรวจรายการในอินพุต: ตัวเลขเป็นสตางค์จำนวนเต็มไม่ติดลบ · วันที่จ่ายจริง · ไม่ผ่าน = งวด "YYYY-MM" ของแถวนั้น (RUN_DATA) */
export function badItemPeriods(items: FilingItem[]): string[] {
  const bad = new Set<string>();
  for (const i of items) {
    const nums = [i.incomeSatang, i.taxSatang, i.ssoWageActualSatang, i.ssoWageClampedSatang, i.ssoEmployeeSatang, i.ssoEmployerSatang];
    if (!validDay(i.payDate) || !nums.every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0) || (i.engineVersion !== 1 && i.engineVersion !== 2) || typeof i.employeeId !== "string" || typeof i.runId !== "string")
      bad.add(typeof i.payDate === "string" && /^\d{4}-\d{2}/.test(i.payDate) ? i.payDate.slice(0, 7) : "?");
  }
  return [...bad].sort();
}

// ═════════════ กฎอักขระของ RD (Format 2.0 ข้อ 11 [V]) ═════════════
/** * + / \ ! $ % # & @ , ' " และ | CR LF tab (ตัวคั่น/ขึ้นบรรทัด) + อักขระควบคุม */
const RD_FORBIDDEN = /[*+/\\!$%#&@,'"|\r\n\t]/;
const rdBad = (s: string) => RD_FORBIDDEN.test(s) || CONTROL_RE.test(s);

const ADDRESS_PARTS = ["building", "room", "floor", "village", "houseNo", "moo", "soi", "street", "subdistrict", "district", "province", "postcode"] as const;
type AddressPart = (typeof ADDRESS_PARTS)[number];
const ADDRESS_WIDTH: Record<AddressPart, number> = { building: 40, room: 20, floor: 20, village: 100, houseNo: 40, moo: 20, soi: 100, street: 100, subdistrict: 50, district: 50, province: 50, postcode: 5 };
const ADDRESS_REQUIRED: ReadonlySet<AddressPart> = new Set(["district", "province", "postcode"]);

export type SlashMode = "DASH" | "EXCLUDE";
/** คนหนึ่งคน → ช่องของบรรทัด D (คำนำหน้า · ชื่อ · สกุล · ที่อยู่ 12 ช่อง) หรือรายการช่องที่ผิด (ลำดับคงที่) */
export function rdPersonFields(p: FilingPerson, slash: SlashMode): { ok: true; title: string; first: string; last: string; address: string[]; dashed: string[] } | { ok: false; fields: string[] } {
  const fields: string[] = [];
  if (!thaiIdOk(p.nationalId)) fields.push("nationalId");
  const text = (key: string, raw: unknown, width: number, required: boolean): string => {
    const v = clean(raw);
    if (!v || !hasBase(v)) {
      if (required || v) fields.push(key); // ไม่มีตัวอักษรฐาน (มีแต่เครื่องหมาย/ช่องว่าง) = ขาด · HR H3.6 ▸ หนี้ H3.5 ◂
      return "";
    }
    if (rdBad(v)) fields.push(`${key}:char`);
    else if (charLen(v) > width) fields.push(`${key}:long`);
    return v;
  };
  const title = text("title", p.title, 100, false);
  const first = text("firstName", p.firstName, 100, true);
  const last = text("lastName", p.lastName, 80, true);
  const a = (p.address ?? {}) as Partial<FilingAddress>;
  const address: string[] = [];
  const dashed: string[] = [];
  for (const part of ADDRESS_PARTS) {
    const key = `address.${part}`;
    let v = clean(a[part]);
    if (part === "postcode") {
      if (!/^\d{5}$/.test(v)) fields.push(key);
      address.push(v);
      continue;
    }
    if (v && slash === "DASH" && v.includes("/")) {
      v = v.replace(/\//g, "-");
      dashed.push(key);
    }
    address.push(text(key, v, ADDRESS_WIDTH[part], ADDRESS_REQUIRED.has(part)));
  }
  if (fields.length) return { ok: false, fields };
  return { ok: true, title: title || "-", first, last, address, dashed };
}

// ═════════════ อ่าน/เขียนไฟล์ RD (ไม่ตรวจความหมาย — ไว้ทดสอบกับไฟล์ตัวอย่างของกรม) ═════════════
const BOM = [0xef, 0xbb, 0xbf];
export type RdParsed = { bom: boolean; finalCrlf: boolean; rows: string[][] };
export function parseRdFile(bytes: Uint8Array): RdParsed {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(0);
  const bom = b.length >= 3 && b[0] === BOM[0] && b[1] === BOM[1] && b[2] === BOM[2];
  const t = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bom ? b.subarray(3) : b);
  const finalCrlf = t.endsWith("\r\n");
  const body = finalCrlf ? t.slice(0, -2) : t;
  return { bom, finalCrlf, rows: body.split("\r\n").map((l) => l.split("|")) };
}
export function emitRdFile(f: RdParsed): Uint8Array {
  const body = f.rows.map((r) => r.join("|")).join("\r\n") + (f.finalCrlf ? "\r\n" : "");
  return concat([f.bom ? new Uint8Array(BOM) : new Uint8Array(0), utf8(body)]);
}

// ═════════════ ภ.ง.ด.1 / 1ก ═════════════
export type PndCert = { employeeId: string; docSeq: number; formSeq: number };
export type PndOptions = { formType?: unknown; seqNo?: unknown; formFlag?: unknown; slashMode?: unknown };
export type PndInput = {
  kind: "PND1" | "PND1A";
  taxYear: number;
  taxMonth: number | null;
  employer: FilingEmployer;
  persons: FilingPerson[];
  items: FilingItem[];
  certs?: PndCert[];
  options?: PndOptions | null;
};
export type PndNotIncluded = { employeeId: string; cause: "ZERO_INCOME" | "INCOMPLETE"; fields: string[]; incomeSatang: number; taxSatang: number };
export type PndOk = {
  ok: true;
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  lineCount: number;
  totalSatang: number;
  taxSatang: number;
  included: { seq: number; employeeId: string; payDate: string | null; incomeSatang: number; taxSatang: number }[];
  notIncluded: PndNotIncluded[];
  warnings: FilingWarning[];
  /** ตัวเลือกที่ใช้จริงหลังเติมค่าตั้งต้น (ลงใบกำกับได้ — ไม่มีเลขประจำตัว/ชื่อ) */
  resolved: { formType: string; seqNo: number; formFlag: 1 | 2; slashMode: SlashMode };
};
export type PndResult = PndOk | FilingFail<PndNotIncluded>;

/** ตรวจข้อมูลผู้จ่ายเงินสำหรับ RD (ลำดับคงที่) */
export function rdProfileFields(e: FilingEmployer | null | undefined): string[] {
  const f: string[] = [];
  const x = (e ?? {}) as Partial<FilingEmployer>;
  if (!thaiIdOk(x.taxId)) f.push("taxId");
  if (typeof x.branchNo !== "string" || !/^\d{6}$/.test(x.branchNo) || !["", "V", "S", null, undefined].includes(x.branchType as string)) f.push("branchNo");
  const dept = clean(x.deptName);
  if (!dept || !hasBase(dept) || charLen(dept) > 80 || rdBad(dept)) f.push("deptName");
  if (typeof x.rdUserId !== "string" || !/^[A-Za-z0-9]{1,20}$/.test(x.rdUserId)) f.push("rdUserId");
  return f;
}

export function buildPnd1(input: PndInput): PndResult {
  const inp = (input ?? {}) as Partial<PndInput>;
  const kind = inp.kind;
  const employer = (inp.employer ?? null) as FilingEmployer | null;
  // PROFILE
  const pf = rdProfileFields(employer);
  if (pf.length) return refuse("PROFILE", pf);
  // OPTIONS
  const o = (inp.options ?? {}) as PndOptions;
  const of: string[] = [];
  const taxYear = inp.taxYear;
  if (typeof taxYear !== "number" || !Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2400) of.push("taxYear");
  const annual = kind === "PND1A";
  if (kind !== "PND1" && kind !== "PND1A") of.push("taxMonth");
  else if (annual ? inp.taxMonth !== null && inp.taxMonth !== undefined : !(typeof inp.taxMonth === "number" && Number.isInteger(inp.taxMonth) && inp.taxMonth >= 1 && inp.taxMonth <= 12)) of.push("taxMonth");
  if (typeof o !== "object" || o === null || Array.isArray(o)) return refuse("OPTIONS", ["formType"]);
  const formType = o.formType === undefined || o.formType === null ? "00" : o.formType;
  if (typeof formType !== "string" || !/^\d{2}$/.test(formType)) of.push("formType");
  const seqNo = o.seqNo === undefined || o.seqNo === null ? 0 : o.seqNo;
  if (typeof seqNo !== "number" || !Number.isInteger(seqNo) || seqNo < 0 || seqNo > 99) of.push("seqNo");
  const formFlag = o.formFlag === undefined || o.formFlag === null ? (employer?.rdFormFlag ?? 1) : o.formFlag;
  if (formFlag !== 1 && formFlag !== 2) of.push("formFlag");
  const slashMode = o.slashMode === undefined || o.slashMode === null ? (employer?.rdSlashMode ?? "DASH") : o.slashMode;
  if (slashMode !== "DASH" && slashMode !== "EXCLUDE") of.push("slashMode");
  if (of.length) return refuse("OPTIONS", of);
  // RUN_DATA
  const allItems = Array.isArray(inp.items) ? inp.items : [];
  const badRuns = badItemPeriods(allItems);
  if (badRuns.length) return refuse("RUN_DATA", [], { runs: badRuns });
  const year = taxYear as number;
  const month = annual ? null : (inp.taxMonth as number);
  const be = String(year + 543);
  const mm = month === null ? "00" : String(month).padStart(2, "0");
  const inPeriod = allItems.filter((i) => (i.runStatus === "APPROVED" || i.runStatus === "PAID") && Number(i.payDate.slice(0, 4)) === year && (month === null || Number(i.payDate.slice(5, 7)) === month));
  const fileWarn: FilingWarning[] = [];
  if (inPeriod.some((i) => i.runStatus === "APPROVED")) fileWarn.push({ employeeId: null, code: "NOT_PAID", fields: [] });
  if (inPeriod.some((i) => i.engineVersion === 1)) fileWarn.push({ employeeId: null, code: "V1_RUN", fields: [] });

  // คนที่มีรายการในงวด — ตามลำดับไฟล์ · รายการของคนที่ไม่อยู่ในรายชื่อ = ขาดทุกช่องบังคับ (ไม่ควรเกิด — service ส่งครบ)
  const persons = sortedPersons(Array.isArray(inp.persons) ? inp.persons : []);
  const byId = new Map(persons.map((p) => [p.employeeId, p]));
  const orphanIds = [...new Set(inPeriod.map((i) => i.employeeId).filter((id) => !byId.has(id)))].sort(cmp);
  type Cand = { p: FilingPerson | null; employeeId: string; payDate: string | null; runId: string; income: number; tax: number };
  const cands: Cand[] = [];
  const ordered = [...persons.map((p) => p.employeeId), ...orphanIds];
  for (const id of ordered) {
    const its = inPeriod.filter((i) => i.employeeId === id);
    if (!its.length) continue;
    const p = byId.get(id) ?? null;
    if (annual) cands.push({ p, employeeId: id, payDate: null, runId: "", income: its.reduce((s, i) => s + i.incomeSatang, 0), tax: its.reduce((s, i) => s + i.taxSatang, 0) });
    else for (const i of [...its].sort((a, b) => cmp(a.payDate, b.payDate) || cmp(a.runId, b.runId))) cands.push({ p, employeeId: id, payDate: i.payDate, runId: i.runId, income: i.incomeSatang, tax: i.taxSatang });
  }
  // คัดออก (ข้อแรกจบ) — ลำดับ notIncluded = ลำดับคน
  const notIncluded: PndNotIncluded[] = [];
  type Line = Cand & { f: Extract<ReturnType<typeof rdPersonFields>, { ok: true }> };
  const lines: Line[] = [];
  for (const c of cands) {
    if (c.income === 0 && c.tax === 0) {
      notIncluded.push({ employeeId: c.employeeId, cause: "ZERO_INCOME", fields: [], incomeSatang: 0, taxSatang: 0 });
      continue;
    }
    const f = c.p ? rdPersonFields(c.p, slashMode as SlashMode) : { ok: false as const, fields: ["nationalId", "firstName", "lastName", "address.district", "address.province", "address.postcode"] };
    if (!f.ok) {
      notIncluded.push({ employeeId: c.employeeId, cause: "INCOMPLETE", fields: f.fields, incomeSatang: c.income, taxSatang: c.tax });
      continue;
    }
    lines.push({ ...c, f });
  }
  if (!lines.length) return refuse("EMPTY", [], { notIncluded });
  // ลำดับบรรทัด: รายเดือน = วันที่จ่าย → คน → runId (คนเรียงแล้วใน cands) · 1ก = ผู้ถือหนังสือรับรอง (docSeq) แล้วคนที่เหลือ
  const pos = new Map(ordered.map((id, i) => [id, i]));
  if (annual) {
    const certs = new Map((Array.isArray(inp.certs) ? inp.certs : []).map((c) => [c.employeeId, c]));
    lines.sort((a, b) => {
      const ca = certs.get(a.employeeId);
      const cb = certs.get(b.employeeId);
      if (ca && cb) return ca.docSeq - cb.docSeq;
      if (ca || cb) return ca ? -1 : 1;
      return pos.get(a.employeeId)! - pos.get(b.employeeId)!;
    });
  } else lines.sort((a, b) => cmp(a.payDate!, b.payDate!) || pos.get(a.employeeId)! - pos.get(b.employeeId)! || cmp(a.runId, b.runId));

  const certs = new Map((Array.isArray(inp.certs) ? inp.certs : []).map((c) => [c.employeeId, c]));
  const empWarn: FilingWarning[] = [];
  const warned = new Set<string>();
  const totalSatang = lines.reduce((s, l) => s + l.income, 0);
  const taxSatang = lines.reduce((s, l) => s + l.tax, 0);
  const e = employer!;
  const nid = e.taxId!;
  const br = e.branchNo!;
  const header = ["H", "0000", nid, br, "1", annual ? "PND1A" : "PND1", nid, br, clean(e.deptName), e.lto === true ? "1" : "0", mm, be, e.branchType ?? "", formType as string,
    String(lines.length), bahtStr(totalSatang), bahtStr(taxSatang), "0.00", bahtStr(taxSatang), formFlag === 2 ? bahtStr(taxSatang) : "0.00", e.rdUserId!, String(formFlag)];
  const rows: string[][] = [header];
  lines.forEach((l, i) => {
    const seq = i + 1;
    const date = l.payDate ? `${l.payDate.slice(8, 10)}${l.payDate.slice(5, 7)}${Number(l.payDate.slice(0, 4)) + 543}` : `3112${be}`;
    rows.push(["D", String(seq), br, l.p!.nationalId!, "0000000000", l.f.title, l.f.first, l.f.last, date, "0.00", bahtStr(l.income), bahtStr(l.tax), "1", "1", ...l.f.address]);
    if (!warned.has(l.employeeId)) {
      warned.add(l.employeeId);
      const c = annual ? certs.get(l.employeeId) : undefined;
      if (c && c.formSeq !== seq) empWarn.push({ employeeId: l.employeeId, code: "CERT_SEQ", fields: [] });
      if (l.f.dashed.length) empWarn.push({ employeeId: l.employeeId, code: "SLASH_DASH", fields: [...l.f.dashed] });
    }
  });
  const body = rows.map((r) => r.join("|")).join("\r\n") + "\r\n";
  const bytes = concat([new Uint8Array(BOM), utf8(body)]);
  const fileName = `${annual ? "PND1A" : "PND1"}_${nid}_${br}_${be}_${mm}_${formType}_${String(seqNo).padStart(2, "0")}.txt`;
  return {
    ok: true,
    bytes,
    fileName,
    contentType: "text/plain; charset=utf-8",
    lineCount: lines.length,
    totalSatang,
    taxSatang,
    included: lines.map((l, i) => ({ seq: i + 1, employeeId: l.employeeId, payDate: l.payDate, incomeSatang: l.income, taxSatang: l.tax })),
    notIncluded,
    warnings: [...fileWarn.sort((a, b) => cmp(a.code, b.code)), ...empWarn],
    resolved: { formType: formType as string, seqNo: seqNo as number, formFlag: formFlag as 1 | 2, slashMode: slashMode as SlashMode },
  };
}
