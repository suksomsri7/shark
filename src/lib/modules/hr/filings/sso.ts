// HR H3.6 ▸ สปส.1-10 — SSO Format135 (pure) · brief R6 · ตารางช่อง wo-notes/hr-H3.6-oracle.md §4
//   บรรทัดละ 135 อักขระ: header "1" + detail "2" · การเข้ารหัส TIS620 (ค่าตั้งต้น · 1 อักขระ = 1 ไบต์) / UTF8 (ไม่มี BOM · นับความกว้างเป็นอักขระ [U]) ·
//   ขึ้นบรรทัด CRLF (ค่าตั้งต้น) / LF · ค่าจ้าง CLAMPED (ssoBaseSatang · ค่าตั้งต้น) / ACTUAL (snapshot ssoWageSatang) — ป้าย wageU ·
//   ยอดเงินสมทบ = ค่าที่เก็บไว้ของลูกจ้าง/นายจ้าง (ไม่คูณ 2 ไม่คำนวณใหม่) · วันนำส่งตั้งต้น = วันที่ 15 ของเดือนถัดไป (ม.47) · อัตรา 500 (หัวไฟล์เท่านั้น)
//   ลำดับปฏิเสธ: STATUS → PROFILE → OPTIONS → RUN_DATA → EMPTY · ชื่อยาว = ตัดที่ขอบกลุ่มอักษร + เตือน NAME_CUT ◂
import { concat, isThaiLeadVowel, isThaiMark, singleByte, utf8, encodable } from "../bank-files/encode";
import { CONTROL_RE, badItemPeriods, charLen, clean, hasBase, personOrder, refuse, thaiIdOk, validDay, type FilingEmployer, type FilingFail, type FilingItem, type FilingPerson, type FilingWarning } from "./rd";

export type SsoOptions = { encoding?: unknown; wageMode?: unknown; paidDate?: unknown; rateBp?: unknown; lineEnd?: unknown };
export type SsoInput = {
  run: { periodKey: string; payDate: string; status: string };
  employer: FilingEmployer;
  persons: FilingPerson[];
  items: FilingItem[];
  options?: SsoOptions | null;
};
export type SsoNotIncluded = { employeeId: string; cause: "NOT_INSURED" | "INCOMPLETE"; fields: string[]; wageSatang: number; contributionSatang: number };
export type SsoOk = {
  ok: true;
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  lineCount: number;
  totalSatang: number;
  taxSatang: number;
  included: { seq: number; employeeId: string; wageSatang: number; employeeSatang: number }[];
  notIncluded: SsoNotIncluded[];
  warnings: FilingWarning[];
  resolved: { encoding: "TIS620" | "UTF8"; wageMode: "CLAMPED" | "ACTUAL"; paidDate: string; rateBp: number; lineEnd: "CRLF" | "LF" };
};
export type SsoResult = SsoOk | FilingFail<SsoNotIncluded>;

/** รหัสคำนำหน้าของประกันสังคม [V]: 003 นาย · 004 นางสาว · 005 นาง (อื่น ๆ = ต้องกรอกรหัสเองที่ข้อมูลยื่นของพนักงาน) */
const SSO_PREFIX: Record<string, string> = { นาย: "003", นางสาว: "004", นาง: "005" };

/** ตัดที่ขอบกลุ่มอักษร (กฎเดียวกับ bank-files/encode.cutAtCluster) แต่นับเป็น code point — ใช้กับ UTF8 ได้ */
function cutCluster(s: string, n: number): string {
  const cs = Array.from(s);
  if (cs.length <= n) return s;
  const cp = (i: number) => cs[i]!.codePointAt(0)!;
  let cut = n;
  if (isThaiMark(cp(cut))) {
    while (cut > 0 && isThaiMark(cp(cut - 1))) cut--;
    if (cut > 0) cut--;
  }
  while (cut > 0 && isThaiLeadVowel(cp(cut - 1))) cut--;
  return cs.slice(0, cut).join("");
}
/** ชิดซ้ายเติมช่องว่าง (ผู้เรียกตัดก่อน) */
const left = (s: string, n: number) => s + " ".repeat(Math.max(0, n - charLen(s)));
const zero = (v: number, n: number) => String(v).padStart(n, "0");
const fits = (v: number, n: number) => String(v).length <= n;

/** ตรวจข้อมูลนายจ้างสำหรับ SSO (ลำดับคงที่) */
export function ssoProfileFields(e: FilingEmployer | null | undefined, enc: "TIS620" | "UTF8"): string[] {
  const f: string[] = [];
  const x = (e ?? {}) as Partial<FilingEmployer>;
  if (typeof x.ssoAccountNo !== "string" || !/^\d{10}$/.test(x.ssoAccountNo)) f.push("ssoAccountNo");
  if (typeof x.ssoBranchNo !== "string" || !/^\d{6}$/.test(x.ssoBranchNo)) f.push("ssoBranchNo");
  const raw = typeof x.employerName === "string" ? x.employerName : "";
  const name = raw.trim();
  if (!name || !hasBase(name) || charLen(name) > 100 || CONTROL_RE.test(raw) || (enc === "TIS620" && !encodable(name, "TIS620"))) f.push("employerName");
  return f;
}
/** วันที่ 15 ของเดือนถัดจากงวด "YYYY-MM" */
export function ssoDefaultPaidDate(periodKey: string): string {
  const y = Number(periodKey.slice(0, 4));
  const m = Number(periodKey.slice(5, 7));
  return m === 12 ? `${y + 1}-01-15` : `${y}-${String(m + 1).padStart(2, "0")}-15`;
}

export function buildSso110(input: SsoInput): SsoResult {
  const inp = (input ?? {}) as Partial<SsoInput>;
  const run = (inp.run ?? {}) as Partial<SsoInput["run"]>;
  if (run.status !== "APPROVED" && run.status !== "PAID") return refuse("STATUS");
  const employer = (inp.employer ?? null) as FilingEmployer | null;
  const o0 = inp.options ?? {};
  const o = (typeof o0 === "object" && !Array.isArray(o0) ? o0 : {}) as SsoOptions;
  const encoding = o.encoding === undefined || o.encoding === null ? (employer?.ssoEncoding ?? "TIS620") : o.encoding;
  const pf = ssoProfileFields(employer, encoding === "UTF8" ? "UTF8" : "TIS620");
  if (pf.length) return refuse("PROFILE", pf);
  const of: string[] = [];
  const periodOk = typeof run.periodKey === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(run.periodKey) && Number(run.periodKey.slice(0, 4)) >= 2000 && Number(run.periodKey.slice(0, 4)) <= 2400;
  if (!periodOk) of.push("taxMonth");
  if (encoding !== "TIS620" && encoding !== "UTF8") of.push("encoding");
  const wageMode = o.wageMode === undefined || o.wageMode === null ? (employer?.ssoWageMode ?? "CLAMPED") : o.wageMode;
  if (wageMode !== "CLAMPED" && wageMode !== "ACTUAL") of.push("wageMode");
  const paidDate = o.paidDate === undefined || o.paidDate === null ? (periodOk ? ssoDefaultPaidDate(run.periodKey!) : "") : o.paidDate;
  if (!validDay(paidDate)) of.push("paidDate");
  const rateBp = o.rateBp === undefined || o.rateBp === null ? 500 : o.rateBp;
  if (typeof rateBp !== "number" || !Number.isInteger(rateBp) || rateBp < 0 || rateBp > 9999) of.push("rateBp");
  const lineEnd = o.lineEnd === undefined || o.lineEnd === null ? "CRLF" : o.lineEnd;
  if (lineEnd !== "CRLF" && lineEnd !== "LF") of.push("lineEnd");
  if (typeof o0 !== "object" || Array.isArray(o0)) of.push("encoding");
  if (of.length) return refuse("OPTIONS", [...new Set(of)]);
  const items = Array.isArray(inp.items) ? inp.items : [];
  const badRuns = badItemPeriods(items);
  if (badRuns.length) return refuse("RUN_DATA", [], { runs: badRuns });
  const enc = encoding as "TIS620" | "UTF8";
  const actual = wageMode === "ACTUAL";
  const wageOf = (i: FilingItem) => (actual ? i.ssoWageActualSatang : i.ssoWageClampedSatang);

  const persons = [...(Array.isArray(inp.persons) ? inp.persons : [])].sort(personOrder);
  const byId = new Map(persons.map((p) => [p.employeeId, p]));
  const pos = new Map(persons.map((p, i) => [p.employeeId, i]));
  const sorted = [...items].sort((a, b) => (pos.get(a.employeeId) ?? Infinity) - (pos.get(b.employeeId) ?? Infinity) || (a.employeeId < b.employeeId ? -1 : a.employeeId > b.employeeId ? 1 : 0) || (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));
  const notIncluded: SsoNotIncluded[] = [];
  const warnings: FilingWarning[] = [];
  type Line = { i: FilingItem; p: FilingPerson; prefix: string; first: string; last: string };
  const lines: Line[] = [];
  for (const i of sorted) {
    const out = (cause: SsoNotIncluded["cause"], fields: string[]) => void notIncluded.push({ employeeId: i.employeeId, cause, fields, wageSatang: wageOf(i), contributionSatang: i.ssoEmployeeSatang + i.ssoEmployerSatang }); // fix r1 F3 (มติผู้คุมงาน): เงินสมทบรวม ลูกจ้าง + นายจ้าง ⇒ ยอดในไฟล์ + ไม่อยู่ในไฟล์ = ยอดเงินสมทบของรอบ
    if (!(i.ssoEmployeeSatang > 0)) {
      out("NOT_INSURED", []);
      continue;
    }
    const p = byId.get(i.employeeId);
    if (!p) {
      out("INCOMPLETE", ["nationalId", "firstName", "lastName", "ssoPrefix"]);
      continue;
    }
    const fields: string[] = [];
    if (!thaiIdOk(p.nationalId)) fields.push("nationalId");
    const name = (key: string, raw: unknown): string => {
      const v = clean(raw);
      if (!v || !hasBase(v)) {
        fields.push(key); // HR H3.6 ▸ หนี้ H3.5: ไม่มีตัวอักษรฐาน = ขาด (ไม่เขียนชื่อว่าง) ◂
        return "";
      }
      if (CONTROL_RE.test(v) || (enc === "TIS620" && !encodable(v, "TIS620"))) fields.push(`${key}:char`);
      return v;
    };
    const first = name("firstName", p.firstName);
    const last = name("lastName", p.lastName);
    const own = clean(p.ssoPrefix);
    const prefix = /^\d{3}$/.test(own) ? own : (SSO_PREFIX[clean(p.title)] ?? "");
    if (!prefix) fields.push("ssoPrefix");
    if (fields.length) {
      out("INCOMPLETE", fields);
      continue;
    }
    lines.push({ i, p, prefix, first, last });
  }
  if (!lines.length) return refuse("EMPTY", [], { notIncluded });
  const wages = lines.reduce((s, l) => s + wageOf(l.i), 0);
  const ee = lines.reduce((s, l) => s + l.i.ssoEmployeeSatang, 0);
  const er = lines.reduce((s, l) => s + l.i.ssoEmployerSatang, 0);
  if (!fits(wages, 15) || !fits(ee + er, 14) || !fits(ee, 12) || !fits(er, 12) || lines.some((l) => !fits(wageOf(l.i), 14) || !fits(l.i.ssoEmployeeSatang, 12)))
    return refuse("RUN_DATA", [], { runs: [run.periodKey!] });
  const company = clean(employer!.employerName);
  const companyCut = cutCluster(company, 45);
  if (companyCut !== company) warnings.push({ employeeId: null, code: "NAME_CUT", fields: ["employerName"] });
  const pk = run.periodKey!;
  const pd = paidDate as string;
  const yy = (y: string) => String((Number(y) + 543) % 100).padStart(2, "0");
  const header =
    "1" + employer!.ssoAccountNo! + employer!.ssoBranchNo! + pd.slice(8, 10) + pd.slice(5, 7) + yy(pd.slice(0, 4)) + pk.slice(5, 7) + yy(pk.slice(0, 4)) +
    left(companyCut, 45) + zero(rateBp as number, 4) + zero(lines.length, 6) + zero(wages, 15) + zero(ee + er, 14) + zero(ee, 12) + zero(er, 12);
  const out: string[] = [header];
  for (const l of lines) {
    const f = cutCluster(l.first, 30);
    const s = cutCluster(l.last, 35);
    const cut = [...(f !== l.first ? ["firstName"] : []), ...(s !== l.last ? ["lastName"] : [])];
    if (cut.length) warnings.push({ employeeId: l.i.employeeId, code: "NAME_CUT", fields: cut });
    out.push("2" + l.p.nationalId! + l.prefix + left(f, 30) + left(s, 35) + zero(wageOf(l.i), 14) + zero(l.i.ssoEmployeeSatang, 12) + " ".repeat(27));
  }
  // ด่านสุดท้าย: ทุกบรรทัด 135 อักขระพอดี (ไม่ผ่าน = ไม่มีไฟล์)
  if (out.some((x) => charLen(x) !== 135)) return refuse("RUN_DATA", [], { runs: [pk] });
  const eol = lineEnd === "LF" ? "\n" : "\r\n";
  const text = out.map((x) => x + eol).join("");
  const bytes = enc === "TIS620" ? singleByte(text) : utf8(text);
  return {
    ok: true,
    bytes: concat([bytes]),
    fileName: `SSO110_${employer!.ssoAccountNo}_${employer!.ssoBranchNo}_${Number(pk.slice(0, 4)) + 543}${pk.slice(5, 7)}.txt`,
    contentType: enc === "TIS620" ? "text/plain; charset=windows-874" : "text/plain; charset=utf-8",
    lineCount: lines.length,
    totalSatang: wages,
    taxSatang: ee + er,
    included: lines.map((l, k) => ({ seq: k + 1, employeeId: l.i.employeeId, wageSatang: wageOf(l.i), employeeSatang: l.i.ssoEmployeeSatang })),
    notIncluded,
    warnings: [...warnings.filter((w) => w.employeeId === null), ...warnings.filter((w) => w.employeeId !== null)],
    resolved: { encoding: enc, wageMode: wageMode as "CLAMPED" | "ACTUAL", paidDate: pd, rateBp: rateBp as number, lineEnd: lineEnd as "CRLF" | "LF" },
  };
}
