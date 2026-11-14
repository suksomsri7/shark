// qc-hr-h4.8-lib.mts — pure helpers of the H4.8 oracle (REST /api/v1/hr): pinned op table · response allow-lists (ruling Q2) · curl parser (skill replay)
//   Nothing runs at import (no DB). Pinned names/shapes are documented in ledger/wo-notes/hr-H4.8-oracle.md §2.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { canon, diffHunks, fileAt, flat, jsonOf, srt } from "./qc-hr-lib.mjs";
import { v1Item } from "./qc-hr-h3.8-lib.mjs";

// ═════════════ the 14 ops (brief §4 · ids/actions pinned by the oracle) ═════════════
// [id, method, path, action ("*read" = any of the 3 read scopes, handler re-checks per report), rate]
export const OPS: readonly (readonly [string, "GET" | "POST", string, string, "read" | "write" | "report"])[] = [
  ["units.list", "GET", "/units", "hr.employee.read", "read"],
  ["employees.list", "GET", "/employees", "hr.employee.read", "read"],
  ["employees.get", "GET", "/employees/{employeeId}", "hr.employee.read", "read"],
  ["shifts.list", "GET", "/shifts", "hr.roster.read", "read"],
  ["roster.list", "GET", "/roster", "hr.roster.read", "read"],
  ["attendance.day", "GET", "/attendance/day", "hr.roster.read", "read"],
  ["attendance.month", "GET", "/attendance/month", "hr.roster.read", "read"],
  ["leavePolicies.list", "GET", "/leave-policies", "hr.leave.read", "read"],
  ["leaves.list", "GET", "/leaves", "hr.leave.read", "read"],
  ["leaveBalances.list", "GET", "/leave-balances", "hr.leave.read", "read"],
  ["leaves.create", "POST", "/leaves", "hr.leave.request", "write"],
  ["reports.get", "GET", "/reports/{report}", "*read", "report"],
  ["payslips.history", "GET", "/employees/{employeeId}/payslips", "hr.payroll.read", "report"],
  ["payslips.get", "GET", "/payslips/{runId}/{employeeId}", "hr.payroll.read", "report"],
];
export const READ3 = ["hr.employee.read", "hr.roster.read", "hr.leave.read"];
export const HR_READ = [...READ3];
export const HR_LEAVE = [...READ3, "hr.leave.request", "hr.leave.decide"];
export const HR_PAY = [...READ3, "hr.payroll.read"];
/** query names a GET op may take (no PII in URLs — R7) */
export const QUERY_OK = ["unitId", "status", "page", "pageSize", "from", "to", "day", "employeeId", "month", "year", "period", "taxYear"];
export const POST_FIELDS = ["employeeId", "policyId", "type", "fromDate", "toDate", "halfDay", "hours"];
/** words no op id/path may carry (brief §4 "left out on purpose") */
export const LEFT_OUT = /approv|decid|reject|clock|punch|correction|swap|overtime|\/ot\b|payroll|bank|filing|50|cert|pdf|csv|xlsx|register|pin\b|document|webhook|labou?r|opening|ytd|employees\/\{employeeId\}\/(?!payslips$)/i;
export const REPORT_SCOPE = (r: string) => (r === "time" || r === "ot" ? "hr.roster.read" : r === "leave" ? "hr.leave.read" : "hr.payroll.read");
export const REPORTS8 = ["time", "ot", "leave", "payroll-month", "payroll-year", "wages", "tax-month", "tax-year"];
export const periodOf = (kind: string) => (kind === "year" ? "2026" : kind === "day" ? "2026-06-10" : "2026-06");

// ═════════════ allow-lists (ruling Q2 · brief R4) — every object level must have EXACTLY these keys ═════════════
export type Sh = { [k: string]: 1 | "map" | Sh | [Sh] };
export const o = (keys: string, extra: Record<string, 1 | "map" | Sh | [Sh]> = {}): Sh => ({ ...Object.fromEntries(keys.split(" ").filter(Boolean).map((k) => [k, 1 as const])), ...extra });
export const EMP = o("id code name nickname position department unitId unitName employmentType employmentStatus startDate endDate probationEndAt contractEndAt active");
export const UNIT = o("id name");
export const SHIFT = o("id unitId name code startMin endMin breakMin graceMin crossesMidnight colour sortOrder");
export const ROSTER = o("id employeeId date shiftId unitId startMin endMin breakMin crossesMidnight paidMin");
export const SLOT = o("inAt outAt method status phase final lateMin earlyOutMin workedMin otMin missingOut", { shift: o("name startMin endMin crossesMidnight"), breaks: [o("from to")], leave: o("label pending") });
export const DAY = o("day unitId", { totals: o("workedMin", { counts: "map" }), rows: [o("employeeId name position borrowed", { slots: [SLOT] })] });
export const MONTH = o("month", { employee: o("id name position"), days: [o("day", { slots: [SLOT] })], summary: o("workDays onTime lateCount lateMin earlyOutCount absentDays leaveDays dayOffDays missingOut otMin workedMin pendingDays") });
export const POLICY = o("id unitId category name paid quotaDays minServiceDays firstYearProrata carryMaxDays carryExpiresMonthDay allowHalfDay allowHours attachmentAfterDays yearStartMonth sortOrder");
export const LEAVE = o("id employeeId employeeName type policyName fromDate toDate halfDay hours days status");
export const BAL = o("year", { rows: [o("employeeId name unitId", { items: [o("policyId name category unlimited granted carried used adjusted expired balance pending available")] })] });
export const LINE = o("code amountSatang count qty");
export const SLIP = o("runId periodKey payDate taxYear status state engineVersion earningsSatang deductionsSatang netSatang ssoBaseSatang employerSsoSatang flags", { employee: o("name position code"), earnings: [LINE], deductions: [LINE] });
export const HIST = o("employeeId name", { year: o("taxYear count grossSatang incomeSatang taxSatang ssoSatang netSatang", { slips: [o("runId periodKey payDate netSatang")] }) });
export const POSTED = o("id status");
/** report data: value/column keys = class P (+ $ with hr.payroll.read) · class I never · totals ⊆ summed kept columns */
export function reportShape(cols: { key: string; cls: string; sum: boolean }[], pay: boolean, totals: boolean): Sh {
  const keep = cols.filter((c) => c.cls === "P" || (pay && c.cls === "$"));
  return o("report period unitId notes", { columns: [o("key label")], rows: [o("employeeId", { values: o(keep.map((c) => c.key).join(" ")) })], warnings: [o("field count")], totals: totals ? o(keep.filter((c) => c.sum).map((c) => c.key).join(" ")) : 1 });
}
export function shapeBad(v: Any, s: Sh, p: string, out: string[]): string[] {
  if (v === null || v === undefined) return out;
  if (typeof v !== "object" || Array.isArray(v)) return (out.push(`${p}:not-object`), out);
  for (const k of Object.keys(v)) if (!(k in s)) out.push(`${p}.${k}:extra`);
  for (const [k, c] of Object.entries(s)) {
    if (!(k in v)) {
      out.push(`${p}.${k}:missing`);
      continue;
    }
    const x = v[k];
    if (c === 1 || c === "map") {
      const vals = c === "map" && x && typeof x === "object" ? Object.values(x) : Array.isArray(x) ? x : [x];
      if (vals.some((y) => y !== null && typeof y === "object")) out.push(`${p}.${k}:nested`);
    } else if (Array.isArray(c)) {
      if (Array.isArray(x)) x.forEach((e) => shapeBad(e, c[0], `${p}.${k}[]`, out));
      else if (x !== null) out.push(`${p}.${k}:not-array`);
    } else shapeBad(x, c, `${p}.${k}`, out);
  }
  return out;
}
/** data of a 2xx body vs the spec (array op ⇒ every element) */
export const dataBad = (body: Any, s: Sh, list: boolean): string[] => {
  const d = body?.data;
  if (list) return Array.isArray(d) ? d.flatMap((e) => shapeBad(e, s, "data[]", [])).slice(0, 6) : ["data:not-array"];
  return d && typeof d === "object" && !Array.isArray(d) ? shapeBad(d, s, "data", []).slice(0, 6) : ["data:not-object"];
};
// ORACLE-EDIT (H4.8 · merge of session/hr b6f1d0719, controller): H4.5 LINE link / notice surfaces never reach an API response — no key containing "line" or "notice" in any 2xx body (A4) ◂
export const BAD_KEY = (k: string, extra: string[]) => extra.includes(k) || /^(photo|device|lat$|lng$|accuracy|bank|national|citizen|pin|address|birth|houseReg|emergency|href$)/i.test(k) || /line|notice/i.test(k);

// ═════════════ curl parser (lifted from qc-pos-api-skill, condensed) ═════════════
export function shellWords(cmd: string): { words: string[]; err: string } {
  const words: string[] = [];
  let cur = "";
  let has = false;
  const s = cmd.replace(/\\\r?\n/g, " ");
  for (let i = 0; i < s.length; ) {
    const c = s[i]!;
    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) return { words, err: "unclosed '" };
      (cur += s.slice(i + 1, j)), (has = true), (i = j + 1);
    } else if (c === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < s.length && '"\\$`'.includes(s[i + 1]!)) (cur += s[i + 1]), (i += 2);
        else cur += s[i++];
      }
      if (i >= s.length) return { words, err: 'unclosed "' };
      (has = true), i++;
    } else if (c === "\\" && i + 1 < s.length) (cur += s[i + 1]), (has = true), (i += 2);
    else if (/\s/.test(c)) {
      if (has) words.push(cur);
      (cur = ""), (has = false), i++;
    } else (cur += c), (has = true), i++;
  }
  if (has) words.push(cur);
  return { words, err: "" };
}
export const SKILL_VARS = ["SHARK_API_KEY", "SHARK_SYSTEM_ID", "UNIT_ID", "EMPLOYEE_ID", "RUN_ID", "FROM", "TO"];
export function substitute(cmd: string, vals: Record<string, string>, fresh: () => string): { out: string; unknown: string[] } {
  const unknown: string[] = [];
  const out = cmd.replace(/\$\(uuidgen\)/g, () => fresh()).replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g, (m, a?: string, b?: string) => {
    const n = (a ?? b)!;
    if (n in vals) return vals[n]!;
    unknown.push(n);
    return m;
  });
  return { out, unknown };
}
export type Parsed = { method: string; path: string; query: string; headers: Record<string, string>; body: string | null; problems: string[] };
export function parseCurl(cmd: string): Parsed {
  const r: Parsed = { method: "", path: "", query: "", headers: {}, body: null, problems: [] };
  const { words, err } = shellWords(cmd.trim());
  if (err) r.problems.push(err);
  if (words[0] !== "curl") r.problems.push("not curl");
  let url = "";
  let getMode = false;
  const enc: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    const next = () => words[++i] ?? "";
    if (w === "-X" || w === "--request") r.method = next().toUpperCase();
    else if (w === "-H" || w === "--header") {
      const h = next();
      const k = h.indexOf(":");
      if (k > 0) r.headers[h.slice(0, k).trim().toLowerCase()] = h.slice(k + 1).trim();
      else r.problems.push(`bad header ${h}`);
    } else if (["-d", "--data", "--data-raw", "--data-binary"].includes(w)) r.body = next();
    else if (w === "--data-urlencode") enc.push(next());
    else if (w === "-G" || w === "--get") getMode = true;
    else if (/^-[sSiLfk]+$/.test(w) || ["--silent", "--show-error", "--fail", "--location", "--include", "--compressed"].includes(w)) continue;
    else if (/^https?:\/\//.test(w)) url = w;
    else r.problems.push(`unknown word ${w.slice(0, 30)}`);
  }
  if (getMode && r.body !== null) (enc.push(r.body), (r.body = null));
  r.method ||= r.body !== null ? "POST" : "GET";
  const m = /^https:\/\/shark\.in\.th\/api\/v1\/hr(\/[^?#]*)?(\?[^#]*)?$/.exec(url);
  if (!m) r.problems.push(`URL not under https://shark.in.th/api/v1/hr (${url.slice(0, 60)})`);
  r.path = m?.[1] ?? "";
  const q = new URLSearchParams((m?.[2] ?? "").replace(/^\?/, ""));
  for (const u of enc) if (u.indexOf("=") > 0) q.append(u.slice(0, u.indexOf("=")), u.slice(u.indexOf("=") + 1));
  r.query = q.toString();
  if (r.body !== null)
    try {
      JSON.parse(r.body);
    } catch {
      r.problems.push("body not JSON");
    }
  return r;
}
export type Recipe = { title: string; raw: string; error: { status: number; code: string } | null };
export function recipesOf(md: string): Recipe[] {
  const out: Recipe[] = [];
  const re = /```(?:bash|sh|shell)?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const block = m[1]!.trim();
    if (!/^curl\b/m.test(block)) continue;
    const before = md.slice(0, m.index);
    const title = (/#{2,4}\s+([^\n]+)\s*$/.exec(before.slice(Math.max(0, before.lastIndexOf("\n#"))))?.[1] ?? `recipe ${out.length + 1}`).trim();
    const rest = md.slice(m.index + m[0].length);
    const cut = rest.search(/```|\n#{2,4}\s/);
    const e = /Error branch:\s*`?\s*(\d{3})\s+([a-z_]+)\s*`?/i.exec(cut < 0 ? rest : rest.slice(0, cut));
    const cmd = block.split(/\n(?=curl\b)/).find((c) => /^curl\b/.test(c.trim())) ?? block;
    out.push({ title, raw: cmd.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"), error: e ? { status: Number(e[1]), code: e[2]!.toLowerCase() } : null });
  }
  return out;
}
/** status ↔ code pairs a documented Error branch may name */
export const BRANCH_OK: Record<number, string[]> = {
  400: ["system_required", "idempotency_required", "invalid_json"], 401: ["unauthorized", "key_expired"], 403: ["scope_missing", "system_mismatch", "forbidden"],
  404: ["not_found"], 405: ["method_not_allowed"], 409: ["idempotency_conflict", "idempotency_in_progress", "state_conflict", "duplicate"], 422: ["validation", "unprocessable"], 429: ["rate_limited"],
};
/** (method, concrete path) → op id + params (template match) */
export function matchOp(method: string, path: string, ops: readonly { id: string; method: string; path: string }[]): { id: string; params: Record<string, string> } | null {
  const segs = path.split("/").filter(Boolean);
  for (const op of ops) {
    if (op.method !== method) continue;
    const t = op.path.split("/").filter(Boolean);
    if (t.length !== segs.length) continue;
    const params: Record<string, string> = {};
    if (t.every((x, i) => (/^\{\w+\}$/.test(x) ? ((params[x.slice(1, -1)] = segs[i]!), true) : x === segs[i]))) return { id: op.id, params };
  }
  return null;
}
/** keys of a zod object schema (zod 3/4) — [] when not an object */
export function zodKeys(s: Any): string[] {
  const sh = s?.shape ?? s?._def?.shape?.() ?? s?._zod?.def?.shape ?? s?._def?.schema?.shape ?? s?._def?.in?.shape;
  return sh && typeof sh === "object" ? Object.keys(sh) : [];
}

// ═════════════ seed (2 tenants · 5 systems · PII-rich employee · GPS+photo punch · SICK reason · published + draft roster · runs) ═════════════
export async function seedH48(P: Any, fx: Any, sysSvc: Any, tag: string) {
  const TA = await fx.newTenant("", "QC HR H4.8 API");
  const TB = await fx.newTenant("-b", "QC HR H4.8 ร้านอื่น");
  const u1 = await fx.newUnit(TA, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TA, `สาขาใต้ ${tag}`, "u2");
  const uB = await fx.newUnit(TB, `สาขาบี ${tag}`, "ub");
  const sys = async (t: string, type: string, n: string) => (await sysSvc.createSystem(t, type, `${n} ${tag}`)).id as string;
  const [sA, sA2, sPg, sPos, sB] = [await sys(TA, "HR", "HR A"), await sys(TA, "HR", "HR A2"), await sys(TA, "HR", "HR หน้า"), await sys(TA, "POS", "POS A"), await sys(TB, "HR", "HR B")];
  const cA = { tenantId: TA, systemId: sA };
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = TA) => fx.mkUser(tid, t, `QC48 ${t} ${tag}`, r, ua, p);
  const U = { owner: await mk("owner", "OWNER", [], {}), mgr: await mk("mgr", "MANAGER", ["*"], {}), keyStaff: await mk("keystaff", "STAFF", ["*"], { "api.key.create": true, "api.key.revoke": true }), staff: await mk("staff", "STAFF", [], {}), ownerB: await mk("ownerb", "OWNER", [], {}, TB) };
  const SEC = { nid: "1102000123454", phone: `qcPHONE${tag}`, email: `qcmail${tag}@x.invalid`, addr: `qcADDR${tag}`, house: `qcHOUSE${tag}`, bank: `qcBANK${tag}`, note: `qcNOTE${tag}`, reason: `qcREASON${tag}`, photo: `qcPHOTO${tag}`, dev: `qcDEV${tag}`, pin: `qcPIN${tag}`, emg: `qcEMG${tag}`, rnote: `qcRNOTE${tag}`, lat: "13.123457" };
  const emp = (tid: string, s: string, code: string, nm: string, o: Record<string, Any> = {}) => fx.mkEmp(tid, s, `${nm} ${tag}`, { code, startDate: "2025-01-01", position: "บาริสต้า", unitId: u1, ...o });
  const E = {
    e1: await emp(TA, sA, "A01", "เอกชัย"), e2: await emp(TA, sA, "A02", "บุษบา", { unitId: u2 }), eS: await emp(TA, sA, "A03", "สมชาย", { linkedUserId: U.staff.id }),
    eOwn: await emp(TA, sA, "A04", "เจ้าของ", { linkedUserId: U.owner.id }), eEnd: await emp(TA, sA, "A05", "พ้นสภาพ", { status: "ENDED", active: false }),
    eX: await emp(TA, sA2, "X01", "ระบบอื่น"), eB: await emp(TB, sB, "B01", "ร้านบี", { unitId: uB }),
  };
  await P.hrEmployee.update({ where: { id: E.e1 }, data: { nationalId: SEC.nid, phone: SEC.phone, email: SEC.email, addressLine: SEC.addr, houseRegAddress: SEC.house, birthDate: new Date("1990-05-05T00:00:00Z"), bankName: "KBank", bankAccountNo: SEC.bank, bankAccountName: SEC.bank, note: SEC.note, emergencyName: SEC.emg, pinHash: SEC.pin, nickname: "เอ", department: "ครัว" } });
  const shA = (await P.hrShift.create({ data: { tenantId: TA, systemId: sA, unitId: u1, name: `เช้า ${tag}`, startMin: 480, endMin: 1020, breakMin: 60 } })).id as string;
  const ent = async (e: string, day: string, pub: boolean) => (await P.hrRosterEntry.create({ data: { tenantId: TA, systemId: sA, employeeId: e, date: new Date(`${day}T00:00:00Z`), shiftId: shA, unitId: u1, startMin: 480, endMin: 1020, breakMin: 60, crossesMidnight: false, published: pub, publishedAt: pub ? new Date() : null, note: SEC.rnote } })).id as string;
  const R = { p1: await ent(E.e1, "2026-06-10", true), p2: await ent(E.e2, "2026-06-10", true), u: await ent(E.e1, "2026-06-11", false) };
  const punch = (kind: string, at: string) => P.hrAttendance.create({ data: { tenantId: TA, systemId: sA, employeeId: E.e1, kind, at: new Date(at), note: SEC.note, rosterEntryId: R.p1, source: "MOBILE", lat: SEC.lat, lng: "100.654321", accuracyM: 12, photoKey: SEC.photo, deviceId: SEC.dev } });
  await punch("IN", "2026-06-10T08:05:00+07:00");
  await punch("OUT", "2026-06-10T17:00:00+07:00");
  const pol = async (s: string, tid: string, category: string, name: string) => (await P.hrLeavePolicy.create({ data: { tenantId: tid, systemId: s, category, name: `${name} ${tag}`, quotaDays: null, allowHalfDay: false, allowHours: false } })).id as string;
  const polP = await pol(sA, TA, "PERSONAL", "ลากิจ");
  const polS = await pol(sA, TA, "SICK", "ลาป่วย");
  const polPg = await pol(sPg, TA, "PERSONAL", "ลากิจ");
  await pol(sB, TB, "PERSONAL", "ลากิจ");
  const lv = async (s: string, tid: string, e: string, p: string, type: string, day: string, status: string) => (await P.hrLeave.create({ data: { tenantId: tid, systemId: s, employeeId: e, policyId: p, type, fromDate: new Date(`${day}T00:00:00Z`), toDate: new Date(`${day}T00:00:00Z`), status, reason: SEC.reason, days: 1 } })).id as string;
  await lv(sA, TA, E.e2, polS, "SICK", "2026-06-02", "APPROVED");
  await lv(sA, TA, E.e1, polP, "PERSONAL", "2031-02-02", "PENDING");
  const lX = await lv(sA2, TA, E.eX, (await pol(sA2, TA, "PERSONAL", "ลากิจ")), "PERSONAL", "2031-02-03", "PENDING");
  await P.approvalPolicy.create({ data: { tenantId: TA, name: `QC48 ลา ${tag}`, entityType: "HrLeave", active: true, steps: { create: [{ tenantId: TA, order: 1, approverRole: "OWNER" }] } } });
  const it = v1Item(3_000_000, [], { add: 0, deduct: 0, gross: 3_000_000, ssoBase: 1_500_000, ee: 75_000, wht: 50_000 });
  const mkRun = async (tid: string, s: string, e: string, periodKey: string, payDay: string, status: string) => {
    const run = await P.hrPayrollRun.create({ data: { tenantId: tid, systemId: s, periodKey, payDate: new Date(`${payDay}T12:00:00+07:00`), status, engineVersion: 1, totalGrossSatang: it.grossSatang, totalSsoEmployeeSatang: it.ssoEmployeeSatang, totalSsoEmployerSatang: it.ssoEmployerSatang, totalWhtSatang: it.whtSatang, totalNetSatang: it.netSatang, totalAddSatang: 0 } });
    await P.hrPayrollItem.create({ data: { tenantId: tid, systemId: s, runId: run.id, employeeId: e, ...it } });
    return run.id as string;
  };
  const runA = await mkRun(TA, sA, E.e1, "2026-06", "2026-06-30", "APPROVED");
  const runD = await mkRun(TA, sA, E.e1, "2026-07", "2026-07-31", "DRAFT");
  const runB = await mkRun(TB, sB, E.eB, "2026-06", "2026-06-30", "APPROVED");
  const RAND = "c" + Math.random().toString(36).slice(2, 12) + "q4w8x";
  return { TA, TB, u1, u2, uB, sA, sA2, sPg, sPos, sB, cA, U, SEC, E, R, polP, polS, polPg, lX, runA, runD, runB, RAND };
}

/** S10: every hunk of the marked code files carries "HR H4.8" + "◂" and removes no other ticket's line · messages change only hr.apiKeys.* (th = en) · inventory only adds wo H4.8 rows */
export function markedProblems(BASE: string, MARKED: string[], F: Any): string[] {
  const bad: string[] = [];
  for (const f of MARKED) {
    const hs = BASE ? diffHunks(BASE, f) : null;
    const n = f.split("/").slice(-2).join("/");
    if (!hs || hs.length === 0) bad.push(`${n}:none`);
    else if (!hs.every((h) => h.added.some((l) => l.includes("HR H4.8")) && h.added.some((l) => l.includes("◂")))) bad.push(`${n}:unmarked`);
    else if (hs.some((h) => h.removed.some((l) => /HR H(?!4\.8\b)\d+\.\d+|HF-[A-Z]+-\d|POS P\d|CRM C\d/.test(l)))) bad.push(`${n}:removes-other`);
  }
  for (const f of [F.th, F.en]) {
    const was = flat(JSON.parse(fileAt(BASE, f) ?? "{}"));
    const now = flat(jsonOf(f) ?? {});
    const ch = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((k) => canon(was[k]) !== canon(now[k]));
    if (!ch.length || ch.some((k) => !k.startsWith("hr.apiKeys."))) bad.push(`${f.split("/")[2]}:${ch.filter((k) => !k.startsWith("hr.apiKeys.")).slice(0, 2).join(",") || "none"}`);
  }
  const keysOf = (f: string) => Object.keys(flat(jsonOf(f) ?? {})).filter((k) => k.startsWith("hr.apiKeys."));
  if (srt(keysOf(F.th)) !== srt(keysOf(F.en))) bad.push("th≠en");
  const was = new Set(((JSON.parse(fileAt(BASE, F.inv) ?? "{}").rows ?? []) as Any[]).map((r) => canon(r)));
  const rows = (jsonOf(F.inv)?.rows ?? []) as Any[];
  const add = rows.filter((r) => !was.has(canon(r)));
  if (!add.length || add.some((r) => r.wo !== "H4.8") || was.size + add.length !== rows.length) bad.push("inventory");
  return bad;
}
/** S11 (ruling Q1): the gate hunk of each file = one OR-term adding the new read key to the named gate; no other code line changes in the file */
export function orTermProblems(BASE: string, list: readonly (readonly [string, string, string])[]): string[] {
  const bad: string[] = [];
  const code = (ls: string[]) => ls.map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
  for (const [f, key, gate] of list) {
    const hs = (BASE ? diffHunks(BASE, f) : null) ?? [];
    const gateH = hs.filter((h) => code(h.added).some((l) => l.includes(key)));
    const g = gateH[0];
    const one = !!g && gateH.length === 1 && code(g.removed).length <= 1 && code(g.removed).every((l) => l.includes(gate)) && code(g.added).some((l) => l.includes(gate) || l.includes("||"));
    const restOk = hs.filter((h) => h !== g).every((h) => code(h.removed).length === 0 && code(h.added).length === 0);
    if (!one || !restOk) bad.push(`${f.split("/").pop()}:${!g ? "no hunk" : !one ? "not one OR-term" : "other code"}`);
  }
  return bad;
}
/** P4: SKILL.md contract (§7) + every curl of SKILL.md/recipes.md = a registered op with documented fields + Error branch (recipes) */
export function skillProblems(md: string, recMd: string, opById: (id: string) => Any): { p: string[]; n: number; size: number } {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? "";
  const desc = /description:\s*(.+)/.exec(fm)?.[1] ?? "";
  const sec = (h: string) => {
    const i = md.search(new RegExp(`\\n#{2,3}\\s+${h}`, "i"));
    const j = i < 0 ? -1 : md.slice(i + 2).search(/\n## /);
    return i < 0 ? "" : md.slice(i + 1, j < 0 ? md.length : i + 2 + j);
  };
  const priv = sec("Privacy and safety");
  const p: string[] = [];
  if (!md) p.push("SKILL.md absent");
  if (Buffer.byteLength(md) > 14 * 1024) p.push(`${Buffer.byteLength(md)} B`);
  if (!/^name:\s*shark-hr-api\s*$/m.test(fm) || !desc || /[^\x20-\x7e]/.test(desc)) p.push("front-matter");
  for (const h of ["When to use", "Setup", "Conventions", "Privacy and safety"]) if (!sec(h)) p.push(`no §${h}`);
  for (const re of [/national id/i, /bank/i, /address/i, /phone/i, /\bPIN\b/, /photo/i, /approv/i, /\b404\b/, /\b403\b|forbidden/, /payroll|bank file|filing|certificate/i]) if (!re.test(priv)) p.push(`privacy ${re.source}`);
  const recs = recipesOf(recMd);
  const dummy = Object.fromEntries(SKILL_VARS.map((v) => [v, v === "FROM" || v === "TO" ? "2031-05-04" : `x${v.toLowerCase()}`]));
  const table = OPS.map(([id, m, pp]) => ({ id, method: m, path: pp }));
  const idOf = (raw: string) => {
    const c = parseCurl(substitute(raw, dummy, () => "u-1").out);
    return { c, hit: matchOp(c.method, c.path, table) };
  };
  for (const r of [...recipesOf(md).map((x) => ({ ...x, error: { status: 404, code: "not_found" } })), ...recs]) {
    const s = substitute(r.raw, dummy, () => "u-1");
    const { c, hit } = idOf(r.raw);
    const op = hit ? opById(hit.id) : null;
    const t = r.title.slice(0, 24);
    if (s.unknown.length) p.push(`${t}: vars ${s.unknown}`);
    if (c.problems.length) p.push(`${t}: ${c.problems[0]}`);
    if (!hit) p.push(`${t}: ${c.method} ${c.path} not an op`);
    const keys = zodKeys(op?.input);
    if (op && [...new URLSearchParams(c.query).keys()].some((k) => !keys.includes(k))) p.push(`${t}: undocumented query`);
    let bodyKeys: string[] = [];
    try {
      bodyKeys = c.body ? Object.keys(JSON.parse(c.body)) : [];
    } catch {
      /* problem already listed */
    }
    if (op && bodyKeys.some((k) => !keys.includes(k))) p.push(`${t}: undocumented body`);
    if (c.method !== "GET" && !c.headers["idempotency-key"]) p.push(`${t}: no Idempotency-Key`);
    if (!/^Bearer x?shark_api_key$/i.test(c.headers.authorization ?? "")) p.push(`${t}: auth header`);
    if (!r.error || !(BRANCH_OK[r.error.status] ?? []).includes(r.error.code)) p.push(`${t}: Error branch`);
  }
  if (recs.length < 6) p.push(`${recs.length} recipes`);
  for (const task of [["units.list"], ["employees.list", "employees.get"], ["roster.list"], ["leaves.list"], ["leaves.create"], ["payslips.get", "payslips.history"]])
    if (!recs.some((r) => task.includes(idOf(r.raw).hit?.id ?? ""))) p.push(`task ${task[0]} missing`);
  return { p, n: recs.length, size: md.length + recMd.length };
}

/** P1 (ruling Q2): the serializers keep EXACTLY the allow-list of poisoned rows (unknown + sensitive keys dropped) */
export function serializerProblems(SER: Any, CAT: Record<string, Any>): string[] {
  const p: string[] = [];
  const ok = (m: Any) => m !== null && !m?.__err;
  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 80);
  if (!ok(SER)) p.push(`serialize ${SER?.__err ?? "absent"}`);
  else {
    const POISON = { __probe: "x", nationalId: "1", phone: "2", email: "3", addressLine: "4", birthDate: "5", bankAccountNo: "6", hasPin: true, pinHash: "7", note: "8", linkedUserId: "9", tenantId: "t", systemId: "s", ok: true, bankMasked: "•••1" };
    const row = { ...Object.fromEntries(Object.keys(EMP).map((k) => [k, k === "active" ? true : `v-${k}`])), ...POISON };
    const run = (fn: string, ...a: unknown[]) => {
      try {
        return typeof SER[fn] === "function" ? SER[fn](...a) : `missing ${fn}`;
      } catch (e) {
        return `throw ${errText(e)}`;
      }
    };
    const e = run("serializeEmployee", row);
    p.push(...shapeBad(e, EMP, "emp", []).slice(0, 3));
    const slipIn = { ...Object.fromEntries(Object.keys(SLIP).map((k) => [k, 1])), employee: { name: "n", position: null, code: null, nationalId: "1" }, earnings: [{ code: "BASE", amountSatang: 1, count: 1, qty: null, __probe: 1 }], deductions: [], flags: [], ...POISON };
    p.push(...shapeBad(run("serializeSlip", slipIn), SLIP, "slip", []).slice(0, 3));
    const cols = CAT["tax-month"].columns as Any[];
    const rep = { ok: true, report: "tax-month", period: "2026-06", unitId: null, columns: [...cols.map((c) => ({ key: c.key, label: c.th })), { key: "__probe", label: "x" }], rows: [{ employeeId: "e", values: { ...Object.fromEntries(cols.map((c) => [c.key, "1"])), __probe: "x" }, __probe: 1 }], totals: null, warnings: [], notes: [], __probe: 1 };
    for (const pay of [false, true]) p.push(...shapeBad(run("serializeReport", rep, { pay }), reportShape(cols, pay, false), `rep${pay ? "$" : ""}`, []).slice(0, 3));
  }
  return p;
}

// ═════════ ORACLE-EDIT (H4.8 fix round · controller ruling 1–6) ▸ F1–F6 = ports of the hunter's F1–F4 + I1 probes (ledger/wo-notes/hr-H4.8-hunt-probes) ◂ ═════════
// Res/Key shapes as in qc-hr-h4.8.mts · every helper comes from the caller (no DB access at import)
export async function runFixRound(c: Any): Promise<void> {
  const { P, TA, sA, cA, polP, E, U, K, RAND, runA, R, tag, HR_PAY, CAT, PERM, ROS, BRD, PRIV, KEYS, RT, REFUSED, mkKey, api, sc, strip, nOf, fresh, ck, chk, authOf, isThai, errText, ok } = c;
  type Res = { status: number; body: Any; text: string; headers: Headers };
  type Key = Any;
  // ═════════ ORACLE-EDIT (H4.8 fix round · controller ruling 1–6) ▸ ports of the hunter's F1–F4 + I1 probes (scratchpad/h48-hunt → ledger/wo-notes/hr-H4.8-hunt-probes) ◂ ═════════
  {
    const kp = await mkKey("otpay", HR_PAY);
    const rows = async (kid: string) => P.auditLog.count({ where: { tenantId: TA, actorId: kid, action: "hr.api.report.read" } });
    const money = (r: Res) => ((r.body?.data?.columns ?? []) as Any[]).some((c) => (CAT.ot.columns as Any[]).find((x) => x.key === c.key)?.cls === "$");
    const r1 = await api("GET", "/reports/ot?period=2026-06", kp, { label: "fix1 ot pay" });
    const n1 = kp ? await rows(kp.id) : -1;
    const r2 = await api("GET", "/reports/ot?period=2026-06", K.read, { label: "fix1 ot read" });
    const n2 = K.read ? await rows(K.read.id) : -1;
    ck("F1", { pay: r1.status === 200 && money(r1) && n1 === 1, read: r2.status === 200 && !money(r2) && n2 === 0 }, "audit by money returned", `${sc(r1)} money=${money(r1)} rows=${n1} · ${sc(r2)} money=${money(r2)} rows=${n2}`);
  }
  {
    const STF = (await import("@/lib/staff/service")) as Any;
    const hrMod = (PERM.PERMISSION_MODULES as Any[]).find((m) => m.module === "hr");
    const editor = !hrMod?.actions?.some((a: Any) => a.key === "hr.employee.read" || a.key === "hr.roster.read");
    const refuse = ["hr.employee.read", "hr.roster.read"].every((k) => STF.validatePermissionInput({ [k]: true })?.ok === false);
    const cells: string[] = [];
    for (const k of ["hr.employee.read", "hr.roster.read"]) {
      const h = { role: "STAFF", unitAccess: [], permissions: { [k]: true }, userId: U.staff.id };
      const lr = await ROS.listRoster(cA, h, { from: "2026-06-10", to: "2026-06-10" }).catch(() => ({ ok: "x" }));
      const pr = await PRIV.loadEmployeeProfileForViewer(cA, h, E.e1).catch(() => null);
      cells.push(`${k.slice(3)}:${+!!BRD.canReadRoster(h)}${+!!PRIV.hrAccessOf(h).openProfile}${+!!PRIV.hrAccessOf(h).seeSensitive}${+!!PRIV.hrAccessOf(h).readLeave}${lr.ok === true ? 1 : 0}${pr ? 1 : 0}`);
    }
    ck("F2", { editor, refuse, human: cells.join(" ") === "employee.read:000000 roster.read:000000" }, "API-key only", cells.join(" "));
  }
  {
    const bad: string[] = [];
    const q = async (path: string) => {
      const r = await api("GET", path, K.all, { label: `fix3 ${path}` });
      if (sc(r) !== "422:validation") bad.push(`${path}=${sc(r)}`);
    };
    for (const d of ["2026-02-31", "2026-06-31", "0000-00-00"]) await q(`/attendance/day?day=${d}`);
    await q("/roster?from=2026-02-31&to=2026-03-02");
    await q(`/attendance/month?employeeId=${E.e1}&month=2026-13`);
    await q("/reports/time?period=2026-13");
    const rp = await api("POST", "/leaves", K.leave, { body: { employeeId: E.eS, policyId: polP, fromDate: "2031-02-30", toDate: "2031-02-30" }, label: "fix3 post" });
    if (sc(rp) !== "422:validation") bad.push(`post=${sc(rp)}`);
    chk("F3", bad.length === 0, "422 validation", bad.slice(0, 4).join(" ") || "ok");
  }
  {
    const before = await P.apiKey.count({ where: { tenantId: TA } });
    const outs: string[] = [];
    // ORACLE-EDIT (H4.8 fix round 2 · controller ruling 2): + zero-width U+200B–200D · U+2060 · U+FEFF ◂
    for (const nm of ["a\u202eb", "a\u001b[31mc", "a\nb", "a\u2028b", "a\u2066b", "a\u0000b", "a\u200bb", "a\u200cb", "a\u200db", "a\u2060b", "a\ufeffb"]) {
      let r: Any;
      try {
        r = ok(KEYS) ? await KEYS.issueHrApiKey(authOf(U.owner), { systemId: sA, name: `QC48 ${nm} ${tag}`, ttlDays: 30 }) : { ok: false, code: "MISSING" };
      } catch (e) {
        r = { ok: false, code: "THROW", message: errText(e) };
      }
      outs.push(r?.ok === false && r?.code === "VALIDATION" && isThai(String(r?.message ?? "")) ? "ok" : `${r?.ok}:${r?.code}`);
    }
    const after = await P.apiKey.count({ where: { tenantId: TA } });
    ck("F4", { refused: outs.every((x) => x === "ok"), nothing: before === after }, "names refused", outs.join(","));
  }
  {
    const pair = async (a: string, b: string, k: Key) => {
      const ra = await api("GET", a, k);
      const rb = await api("GET", b, k);
      return sc(ra) === "404:not_found" && strip(ra) === strip(rb) ? "" : `${sc(ra)}|${sc(rb)}`;
    };
    const postBody = (id: string) => ({ employeeId: id, type: "PERSONAL", fromDate: "2031-07-01", toDate: "2031-07-01" });
    const pa = await api("POST", "/leaves", K.leave, { body: postBody(E.eEnd) });
    const pb = await api("POST", "/leaves", K.leave, { body: postBody(RAND) });
    const lv = await api("GET", "/leaves?status=HISTORY", K.read);
    await P.hrLeave.create({ data: { tenantId: TA, systemId: sA, employeeId: E.eEnd, policyId: polP, type: "PERSONAL", fromDate: new Date("2025-03-03T00:00:00Z"), toDate: new Date("2025-03-03T00:00:00Z"), status: "APPROVED", days: 1 } });
    const lv2 = await api("GET", "/leaves?status=HISTORY", K.read);
    const p: Record<string, string> = {
      get: await pair(`/employees/${E.eEnd}`, `/employees/${RAND}`, K.read),
      month: await pair(`/attendance/month?employeeId=${E.eEnd}&month=2026-06`, `/attendance/month?employeeId=${RAND}&month=2026-06`, K.read),
      hist: await pair(`/employees/${E.eEnd}/payslips?taxYear=2026`, `/employees/${RAND}/payslips?taxYear=2026`, K.pay),
      post: sc(pa) === "404:not_found" && strip(pa) === strip(pb) ? "" : `${sc(pa)}|${sc(pb)}`,
      list: lv2.status === 200 && !((lv2.body?.data ?? []) as Any[]).some((x) => x.employeeId === E.eEnd) && lv.status === 200 ? "" : "listed",
    };
    // ORACLE-EDIT (H4.8 fix round 2 · controller ruling 1): history keeps leavers — a published past roster row and a report row of the ended employee are present, with only the documented fields ◂
    const src = await P.hrRosterEntry.findFirst({ where: { id: R.p1 } });
    const ent = await P.hrRosterEntry.create({ data: { tenantId: TA, systemId: sA, employeeId: E.eEnd, date: new Date("2026-06-12T00:00:00Z"), shiftId: src.shiftId, unitId: src.unitId, startMin: 480, endMin: 1020, breakMin: 60, crossesMidnight: false, published: true, publishedAt: new Date() } });
    const ros = await api("GET", "/roster?from=2026-06-12&to=2026-06-12", K.read);
    const rrow = ((ros.body?.data ?? []) as Any[]).find((x) => x.id === ent.id);
    const item = await P.hrPayrollItem.findFirst({ where: { runId: runA, employeeId: E.e1 } });
    const { id: _id, employeeId: _e, createdAt: _c, updatedAt: _u, ...rest } = item as Any;
    await P.hrPayrollItem.create({ data: { ...rest, employeeId: E.eEnd } });
    const rep = await api("GET", "/reports/payroll-month?period=2026-06", K.pay);
    const prow = ((rep.body?.data?.rows ?? []) as Any[]).find((x) => x.employeeId === E.eEnd);
    p.roster = rrow && shapeBad(rrow, ROSTER, "r", []).length === 0 ? "" : `roster=${ros.status}:${rrow ? shapeBad(rrow, ROSTER, "r", []).slice(0, 2) : "absent"}`;
    p.report = prow && shapeBad(prow, (reportShape(CAT["payroll-month"].columns, true, false) as Any).rows[0] as Sh, "p", []).length === 0 ? "" : `report=${rep.status}:${prow ? "shape" : "absent"}`;
    const okP = Object.entries(p).filter(([, v]) => v !== "");
    chk("F5", okP.length === 0, "ended ≡ unknown · history keeps leavers", okP.map(([k, v]) => `${k}=${v}`).join(" ") || "ok");
  }
  {
    const send2 = async (ct: string, text: string) => {
      const res: Response = await RT.POST(new Request("http://x/api/v1/hr/leaves", { method: "POST", headers: { authorization: `Bearer ${K.leave?.raw}`, "idempotency-key": fresh(), "content-type": ct }, body: text }), { params: Promise.resolve({ path: ["leaves"] }) });
      const t = await res.text();
      let b: Any = null;
      try {
        b = JSON.parse(t);
      } catch {
        b = null;
      }
      const r = { status: res.status, body: b, text: t, headers: res.headers };
      REFUSED.push({ label: `fix6 ${ct}`, r });
      return r;
    };
    const d = "2031-08-04";
    const n0 = await nOf(`SELECT count(*)::int AS n FROM "HrLeave" WHERE "employeeId" = $1 AND "fromDate" = $2::date`, E.eS, d);
    const good = JSON.stringify({ employeeId: E.eS, policyId: polP, fromDate: d, toDate: d });
    const r1 = await send2("text/plain", good);
    const r2 = await send2("application/json", `{"employeeId":"${E.eS}","policyId":"${polP}","fromDate":"${d}","toDate":"${d}","__proto__":{"status":"APPROVED"}}`);
    const r3 = await send2("application/json", `{"employeeId":"${E.eS}","policyId":"${polP}","fromDate":"${d}","toDate":"${d}","constructor":1}`);
    const n1 = await nOf(`SELECT count(*)::int AS n FROM "HrLeave" WHERE "employeeId" = $1 AND "fromDate" = $2::date`, E.eS, d);
    const r4 = await api("POST", "/leaves", K.leave, { body: { employeeId: E.eS, policyId: polP, fromDate: "2031-08-06", toDate: "2031-08-06" } });
    const row = r4.body?.data?.id ? await P.hrLeave.findFirst({ where: { id: r4.body.data.id } }) : null;
    // ORACLE-EDIT (H4.8 fix round 2 · controller ruling 3): guard order — a key of another system / without the write scope gets the same 403 as on reads, never 415/422 ◂
    const genHr = await mkKey("f7gen", [...HR_PAY, "hr.leave.request", "hr.leave.decide"], { sys: null });
    const poison = `{"employeeId":"${E.eS}","policyId":"${polP}","fromDate":"${d}","toDate":"${d}","__proto__":{"x":1}}`;
    const sendK = async (k: Key, ct: string, text: string, hdr: Record<string, string> = {}) => {
      const res: Response = await RT.POST(new Request("http://x/api/v1/hr/leaves", { method: "POST", headers: { authorization: `Bearer ${k?.raw}`, "idempotency-key": fresh(), "content-type": ct, ...hdr }, body: text }), { params: Promise.resolve({ path: ["leaves"] }) });
      const t = await res.text();
      let b: Any = null;
      try {
        b = JSON.parse(t);
      } catch {
        b = null;
      }
      return { status: res.status, body: b, text: t, headers: res.headers } as Res;
    };
    const order = [
      ["pos/ct", await sendK(K.pos, "text/plain", good), "403:system_mismatch"], ["pos/proto", await sendK(K.pos, "application/json", poison), "403:system_mismatch"],
      ["read/ct", await sendK(K.read, "text/plain", good), "403:scope_missing"], ["read/proto", await sendK(K.read, "application/json", poison), "403:scope_missing"],
      ["gen/ct", await sendK(genHr, "text/plain", good, { "x-shark-system": sA }), "403:scope_missing"], ["gen/proto", await sendK(genHr, "application/json", poison, { "x-shark-system": sA }), "403:scope_missing"],
    ] as [string, Res, string][];
    const offF7 = order.filter(([, r, want]) => sc(r) !== want).map(([l, r]) => `${l}=${sc(r)}`);
    chk("F7", offF7.length === 0 && !!genHr, "403 before 415/422", offF7.join(" ") || "ok");
    ck("F6", { ct: sc(r1) === "415:invalid_json", proto: sc(r2) === "422:validation", ctor: sc(r3) === "422:validation", nothing: n0 === 0 && n1 === 0, stored: r4.status === 200 && !!row && r4.body?.data?.status === row.status }, "json only · stored status", `${sc(r1)} ${sc(r2)} ${sc(r3)} rows=${n0}/${n1} ${sc(r4)} ${r4.body?.data?.status}/${row?.status}`);
  }
}
