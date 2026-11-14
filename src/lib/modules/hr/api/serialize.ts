// serialize.ts — คำตอบของ REST /api/v1/hr สร้างจาก "รายชื่อช่องที่อนุญาต" เท่านั้น (ใบ H4.8 · brief R4 · มติ Q2)
//
// 🔴 ทุกฟังก์ชันที่นี่สร้าง object ใหม่ทีละช่องจากรายการด้านล่าง — ห้าม spread แถวของตัวอ่าน (qc-hr-h4.8 S8 ตรวจ)
//    ⇒ ตัวอ่านเพิ่มช่องในอนาคต (เช่น เลขบัตร · บัญชี · พิกัด) ช่องนั้นไม่หลุดออก API จนกว่าจะเพิ่มชื่อที่นี่โดยตั้งใจ
// ไม่มีเลย: เลขประจำตัว · ประกันสังคม · ที่อยู่ · ธนาคาร (รวม bankMasked) · เบอร์/อีเมล · PIN · รูป · พิกัด · อุปกรณ์ · หมายเหตุ ·
//   เหตุผลการลา · ผู้ยื่นแทน · ลิงก์ (href) · คอลัมน์รายงานชั้น I เสมอ · ชั้น $ เว้นแต่คีย์ถือ hr.payroll.read
import { REPORT_CATALOG, type ReportId } from "../reports-rules";

type Row = Record<string, unknown>;
const obj = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : v === null || v === undefined ? null : String(v));
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const boolOf = (v: unknown): boolean => v === true;
/** วัน (@db.Date) → "YYYY-MM-DD" · สตริงคงเดิม · ไม่มี = null */
const dayOrNull = (v: unknown): string | null => (v instanceof Date ? (Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : null) : strOrNull(v));
/** เวลา → ISO-8601 UTC · สตริงคงเดิม */
const isoOrNull = (v: unknown): string | null => (v instanceof Date ? (Number.isFinite(v.getTime()) ? v.toISOString() : null) : strOrNull(v));
/** Decimal ของ Prisma / ตัวเลข → สตริงทศนิยม · ไม่มี = null */
const decOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
/** ค่าแบนเท่านั้น (สตริง/ตัวเลข/ตรรกะ/null) — object ซ้อนไม่ผ่าน */
const flatOf = (v: unknown): string | number | boolean | null => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null);

// ═════════════ พนักงาน ═════════════
export type EmployeeOut = {
  id: string; code: string | null; name: string; nickname: string | null; position: string | null; department: string | null;
  unitId: string | null; unitName: string | null; employmentType: string | null; employmentStatus: string | null;
  startDate: string | null; endDate: string | null; probationEndAt: string | null; contractEndAt: string | null; active: boolean;
};
/** พนักงาน (รายการ + รายคน) — ช่องไม่อ่อนไหวของ R4 เท่านั้น ไม่ว่าคีย์จะถือ scope ใด */
export function serializeEmployee(raw: unknown): EmployeeOut {
  const r = obj(raw);
  return {
    id: String(r.id ?? ""),
    code: strOrNull(r.code),
    name: String(r.name ?? ""),
    nickname: strOrNull(r.nickname),
    position: strOrNull(r.position),
    department: strOrNull(r.department),
    unitId: strOrNull(r.unitId),
    unitName: strOrNull(r.unitName),
    employmentType: strOrNull(r.employmentType),
    employmentStatus: strOrNull(r.employmentStatus),
    startDate: dayOrNull(r.startDate),
    endDate: dayOrNull(r.endDate),
    probationEndAt: dayOrNull(r.probationEndAt),
    contractEndAt: dayOrNull(r.contractEndAt),
    active: boolOf(r.active),
  };
}

/** สาขา */
export function serializeUnit(raw: unknown): { id: string; name: string } {
  const r = obj(raw);
  return { id: String(r.id ?? ""), name: String(r.name ?? "") };
}

// ═════════════ กะ · ประเภทการลา (แถวค่าตั้ง − tenantId systemId active createdAt updatedAt) ═════════════
export function serializeShift(raw: unknown) {
  const r = obj(raw);
  return {
    id: String(r.id ?? ""),
    unitId: strOrNull(r.unitId),
    name: String(r.name ?? ""),
    code: strOrNull(r.code),
    startMin: numOrNull(r.startMin),
    endMin: numOrNull(r.endMin),
    breakMin: numOrNull(r.breakMin),
    graceMin: numOrNull(r.graceMin),
    crossesMidnight: boolOf(r.crossesMidnight),
    colour: strOrNull(r.colour),
    sortOrder: numOrNull(r.sortOrder),
  };
}
export function serializeLeavePolicy(raw: unknown) {
  const r = obj(raw);
  return {
    id: String(r.id ?? ""),
    unitId: strOrNull(r.unitId),
    category: strOrNull(r.category),
    name: String(r.name ?? ""),
    paid: boolOf(r.paid),
    quotaDays: decOrNull(r.quotaDays),
    minServiceDays: numOrNull(r.minServiceDays),
    firstYearProrata: boolOf(r.firstYearProrata),
    carryMaxDays: decOrNull(r.carryMaxDays),
    carryExpiresMonthDay: strOrNull(r.carryExpiresMonthDay),
    allowHalfDay: boolOf(r.allowHalfDay),
    allowHours: boolOf(r.allowHours),
    attachmentAfterDays: decOrNull(r.attachmentAfterDays),
    yearStartMonth: numOrNull(r.yearStartMonth),
    sortOrder: numOrNull(r.sortOrder),
  };
}

// ═════════════ ตารางกะ (เผยแพร่แล้วเท่านั้น — ผู้เรียกกรอง) ═════════════
export function serializeRosterEntry(raw: unknown) {
  const r = obj(raw);
  return {
    id: String(r.id ?? ""),
    employeeId: String(r.employeeId ?? ""),
    date: dayOrNull(r.date),
    shiftId: strOrNull(r.shiftId),
    unitId: strOrNull(r.unitId),
    startMin: numOrNull(r.startMin),
    endMin: numOrNull(r.endMin),
    breakMin: numOrNull(r.breakMin),
    crossesMidnight: boolOf(r.crossesMidnight),
    paidMin: numOrNull(r.paidMin),
  };
}

// ═════════════ การมาทำงาน (ไม่มีพิกัด/รูป/อุปกรณ์/หมายเหตุ/เหตุผลแก้เวลา · ไม่มี slotKey dayId stored stale) ═════════════
export function serializeSlot(raw: unknown) {
  const r = obj(raw);
  const sh = r.shift && typeof r.shift === "object" ? obj(r.shift) : null;
  const lv = r.leave && typeof r.leave === "object" ? obj(r.leave) : null;
  return {
    shift: sh ? { name: String(sh.name ?? ""), startMin: numOrNull(sh.startMin), endMin: numOrNull(sh.endMin), crossesMidnight: boolOf(sh.crossesMidnight) } : null,
    inAt: isoOrNull(r.inAt),
    outAt: isoOrNull(r.outAt),
    method: strOrNull(r.method),
    breaks: arr(r.breaks).map((b) => ({ from: isoOrNull(obj(b).from), to: isoOrNull(obj(b).to) })),
    status: strOrNull(r.status),
    phase: strOrNull(r.phase),
    final: boolOf(r.final),
    lateMin: numOrNull(r.lateMin),
    earlyOutMin: numOrNull(r.earlyOutMin),
    workedMin: numOrNull(r.workedMin),
    otMin: numOrNull(r.otMin),
    missingOut: boolOf(r.missingOut),
    leave: lv ? { label: String(lv.label ?? ""), pending: boolOf(lv.pending) } : null,
  };
}
const countsOf = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(obj(v))) if (typeof n === "number") out[k] = n;
  return out;
};
export function serializeAttendanceDay(raw: unknown, unitId: string | null) {
  const r = obj(raw);
  const t = obj(r.totals);
  return {
    day: String(r.day ?? ""),
    unitId,
    totals: { workedMin: numOrNull(t.workedMin) ?? 0, counts: countsOf(t.counts) },
    rows: arr(r.rows).map((x) => {
      const row = obj(x);
      return { employeeId: String(row.employeeId ?? ""), name: String(row.name ?? ""), position: strOrNull(row.position), borrowed: boolOf(row.borrowed), slots: arr(row.slots).map(serializeSlot) };
    }),
  };
}
const SUMMARY_KEYS = ["workDays", "onTime", "lateCount", "lateMin", "earlyOutCount", "absentDays", "leaveDays", "dayOffDays", "missingOut", "otMin", "workedMin", "pendingDays"] as const;
export function serializeAttendanceMonth(raw: unknown) {
  const r = obj(raw);
  const e = obj(r.employee);
  const s = obj(r.summary);
  const summary: Record<string, number> = {};
  for (const k of SUMMARY_KEYS) summary[k] = numOrNull(s[k]) ?? 0;
  return {
    month: String(r.month ?? ""),
    employee: { id: String(e.id ?? ""), name: String(e.name ?? ""), position: strOrNull(e.position) },
    days: arr(r.days).map((d) => ({ day: String(obj(d).day ?? ""), slots: arr(obj(d).slots).map(serializeSlot) })),
    summary,
  };
}

// ═════════════ ใบลา (ไม่มีเหตุผล · ไม่มีผู้ยื่นแทน · ไม่มีไฟล์แนบ) ═════════════
export function serializeLeave(item: unknown, detail: unknown) {
  const i = obj(item);
  const d = obj(detail);
  return {
    id: String(i.id ?? ""),
    employeeId: String(d.employeeId ?? ""),
    employeeName: String(i.employeeName ?? ""),
    type: strOrNull(i.type),
    policyName: strOrNull(d.policyName),
    fromDate: dayOrNull(i.fromDate),
    toDate: dayOrNull(i.toDate),
    halfDay: strOrNull(d.halfDay),
    hours: strOrNull(d.hours),
    days: strOrNull(d.days),
    status: strOrNull(i.status),
  };
}
const BAL_ITEM_KEYS = ["granted", "carried", "used", "adjusted", "expired", "balance", "pending", "available"] as const;
export function serializeLeaveBalances(raw: unknown) {
  const r = obj(raw);
  return {
    year: numOrNull(r.year),
    rows: arr(r.rows).map((x) => {
      const row = obj(x);
      return {
        employeeId: String(row.employeeId ?? ""),
        name: String(row.name ?? ""),
        unitId: strOrNull(row.unitId),
        items: arr(row.items).map((y) => {
          const it = obj(y);
          const out: Record<string, string | boolean | null> = { policyId: String(it.policyId ?? ""), name: String(it.name ?? ""), category: strOrNull(it.category), unlimited: boolOf(it.unlimited) };
          for (const k of BAL_ITEM_KEYS) out[k] = strOrNull(it[k]);
          return out;
        }),
      };
    }),
  };
}

// ═════════════ เงินเดือน (H3.8 SlipDto − ok − bankMasked · HistoryDto − ok − slips[].href) ═════════════
const lineOf = (v: unknown) => {
  const l = obj(v);
  return { code: String(l.code ?? ""), amountSatang: numOrNull(l.amountSatang), count: numOrNull(l.count), qty: numOrNull(l.qty) };
};
export function serializeSlip(raw: unknown) {
  const r = obj(raw);
  const e = obj(r.employee);
  return {
    runId: String(r.runId ?? ""),
    periodKey: strOrNull(r.periodKey),
    payDate: strOrNull(r.payDate),
    taxYear: numOrNull(r.taxYear),
    status: strOrNull(r.status),
    state: strOrNull(r.state),
    engineVersion: numOrNull(r.engineVersion),
    employee: { name: String(e.name ?? ""), position: strOrNull(e.position), code: strOrNull(e.code) },
    earnings: arr(r.earnings).map(lineOf),
    deductions: arr(r.deductions).map(lineOf),
    earningsSatang: numOrNull(r.earningsSatang),
    deductionsSatang: numOrNull(r.deductionsSatang),
    netSatang: numOrNull(r.netSatang),
    ssoBaseSatang: numOrNull(r.ssoBaseSatang),
    employerSsoSatang: numOrNull(r.employerSsoSatang),
    flags: arr(r.flags).map((f) => String(f)),
  };
}
export function serializeHistory(raw: unknown) {
  const r = obj(raw);
  const y = obj(r.year);
  return {
    employeeId: String(r.employeeId ?? ""),
    name: String(r.name ?? ""),
    year: {
      taxYear: numOrNull(y.taxYear),
      count: numOrNull(y.count),
      grossSatang: numOrNull(y.grossSatang),
      incomeSatang: numOrNull(y.incomeSatang),
      taxSatang: numOrNull(y.taxSatang),
      ssoSatang: numOrNull(y.ssoSatang),
      netSatang: numOrNull(y.netSatang),
      slips: arr(y.slips).map((x) => {
        const s = obj(x);
        return { runId: String(s.runId ?? ""), periodKey: strOrNull(s.periodKey), payDate: strOrNull(s.payDate), netSatang: numOrNull(s.netSatang) };
      }),
    },
  };
}

// ═════════════ รายงาน (JSON · คอลัมน์ชั้น P เสมอ + ชั้น $ เมื่อคีย์ถือ hr.payroll.read · ชั้น I ไม่เคย) ═════════════
/** คอลัมน์ที่คำตอบนี้ส่งได้ (ตามทะเบียนรายงาน — คอลัมน์ที่ทะเบียนไม่รู้จัก = ไม่ส่ง) */
function keptColumns(report: unknown, pay: boolean): { key: string; sum: boolean }[] {
  const def = typeof report === "string" ? REPORT_CATALOG[report as ReportId] : undefined;
  if (!def) return [];
  return def.columns.filter((c) => c.cls === "P" || (pay && c.cls === "$")).map((c) => ({ key: c.key, sum: c.sum }));
}
/** คำตอบรายงานนี้มีคอลัมน์เงิน (ชั้น $) ไหม — ตัดสินจากสิ่งที่ส่งออกจริง (มติรอบแก้ ข้อ 1: มีเงิน = ลงประวัติการอ่านข้อมูลเงินเดือน) */
export function reportCarriesMoney(report: unknown, pay: boolean): boolean {
  const def = typeof report === "string" ? REPORT_CATALOG[report as ReportId] : undefined;
  return pay === true && !!def && def.columns.some((c) => c.cls === "$");
}
export function serializeReport(raw: unknown, opts: { pay: boolean }) {
  const r = obj(raw);
  const kept = keptColumns(r.report, opts.pay === true);
  const keep = new Set(kept.map((c) => c.key));
  const labelOf = new Map(arr(r.columns).map((c) => [String(obj(c).key ?? ""), String(obj(c).label ?? "")] as const));
  const totalsIn = r.totals && typeof r.totals === "object" ? obj(r.totals) : null;
  let totals: Record<string, string | number | boolean | null> | null = null;
  if (totalsIn) {
    totals = {};
    for (const c of kept) if (c.sum) totals[c.key] = flatOf(totalsIn[c.key]) ?? "";
  }
  return {
    report: strOrNull(r.report),
    period: strOrNull(r.period),
    unitId: strOrNull(r.unitId),
    columns: kept.filter((c) => labelOf.has(c.key)).map((c) => ({ key: c.key, label: labelOf.get(c.key) ?? c.key })),
    rows: arr(r.rows).map((x) => {
      const row = obj(x);
      const vin = obj(row.values);
      const values: Record<string, string | number | boolean | null> = {};
      for (const c of kept) values[c.key] = flatOf(vin[c.key]) ?? "";
      return { employeeId: String(row.employeeId ?? ""), values };
    }),
    totals,
    // คำเตือน "ช่องว่าง" เฉพาะช่องที่คำตอบนี้มี (ชื่อช่องของชั้น I/$ ที่ไม่ส่ง = ไม่บอก)
    warnings: arr(r.warnings).filter((w) => keep.has(String(obj(w).field ?? ""))).map((w) => ({ field: String(obj(w).field ?? ""), count: numOrNull(obj(w).count) ?? 0 })),
    notes: arr(r.notes).map((n) => String(n)),
  };
}
