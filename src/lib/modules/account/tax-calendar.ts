// tax-calendar.ts — ปฏิทินภาษีของร้าน (ACC T5.1 · เลน 2 · ปิด A4 A6 F10)
//
//   ต่อยอดตัวเตือนของ T3.7 (`upcomingDeadlinesFrom`) — แหล่งเดียว: แบบรายเดือนมาจากตัวเดิม · แบบรายปี (ภ.ง.ด.50/51 · 90/94 · ยื่นงบ)
//   คำนวณจากแถวตารางกำหนดยื่น (T0.2 · `FILING_FORM_META` บอกความหมายของค่า) ตามประเภทผู้ประกอบการ + สถานะ VAT
//   🔴 วันที่ทุกตัวจากตารางค่ากฎหมาย (ร้านทับได้) · หลังช่วงประกาศขยายเวลาหมดอายุ = ไม่มีวันออนไลน์ (ไม่เดา)
//   🔴 ระบบไม่ได้ยื่นแบบแทนร้าน — เป็นตัวเตือนเท่านั้น
// design note: ledger/wo-notes/T5.1.md
import {
  ENTITY_KIND_LABEL_TH,
  FILING_FORM_LABEL_TH,
  FILING_FORM_META,
  deadlineValueLabelTh,
  isJuristicPayer,
  legalWarning,
  type EntityKind,
  type FilingForm,
  type LegalWarning,
} from "@/lib/core/settings/legal/th-tax-2569";
import { accountNow } from "./clock";
import { bkkYmd, bookRuleFrom, legalValueFrom, loadBookLegal, upcomingDeadlinesFrom, type BookCtx, type BookLegal } from "./legal-values";
import { getPolicy } from "./policy";
import { ACCOUNT_SETTING_KEYS } from "@/lib/core/settings/defs/account";
import { resolveBookSettings, setSettings } from "@/lib/core/settings/service";
import type { SettingsActor } from "@/lib/core/settings/types";

// ───────── วันที่ (ข้อความ YYYY-MM-DD ตามปฏิทินไทย · คำนวณแบบ UTC ล้วน) ─────────
const DAY = 86_400_000;
const t = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const ymdAddDays = (ymd: string, n: number) => fmt(t(ymd) + n * DAY);
const lastDay = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate();
/** บวกเดือนแบบสิ้นเดือน: วันสุดท้ายของเดือน + N = วันสุดท้ายของเดือนปลายทาง (30 มิ.ย. + 3 = 30 ก.ย.) */
export function ymdAddMonthsEom(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const nd = d === lastDay(y, m) ? lastDay(ny, nm) : Math.min(d, lastDay(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}
const monthEnd = (y: number, m1: number) => {
  const idx = y * 12 + (m1 - 1);
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(lastDay(ny, nm)).padStart(2, "0")}`;
};
const dateOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const ymdTh = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTH_TH[m - 1]} ${y}`;
};

// ───────── แบบรายปี ─────────

export type DueView = { date: string; daysLeft: number; ruleTh: string; source: string; tag: string };

/** กำหนดยื่นของแบบรายปี จากจุดตั้งต้น (anchor = วันสิ้นรอบ/สิ้นครึ่งรอบ/31 ธ.ค./30 มิ.ย.) — แถวกระดาษ + วันขยายออนไลน์ */
export function annualDeadlineFrom(legal: BookLegal, form: FilingForm, anchorYmd: string, todayYmd: string): { paper: DueView | null; online: DueView | null; warnings: LegalWarning[] } {
  const meta = FILING_FORM_META[form];
  const p = legalValueFrom(legal, "filing.deadline", dateOf(anchorYmd), { form, channel: "PAPER" });
  if (p.value === null || !p.row) return { paper: null, online: null, warnings: p.warnings };
  const due = meta.unit === "DAYS" ? ymdAddDays(anchorYmd, p.value) : ymdAddMonthsEom(anchorYmd, p.value);
  const left = (ymd: string) => Math.round((t(ymd) - t(todayYmd)) / DAY);
  const paper: DueView = { date: due, daysLeft: left(due), ruleTh: deadlineValueLabelTh(form, "PAPER", p.value), source: p.row.source, tag: p.row.tag };
  // ช่วงของแถวออนไลน์ = ช่วงของวันครบกำหนดกระดาษ (ประกาศขยายเวลาใช้กับ "แบบที่ต้องยื่น" ในช่วง) — ไม่มีแถวครอบ = ไม่มีวันออนไลน์
  const o = legalValueFrom(legal, "filing.deadline", dateOf(due), { form, channel: "ONLINE" });
  const online = o.value !== null && o.row ? { date: ymdAddDays(due, o.value), daysLeft: left(ymdAddDays(due, o.value)), ruleTh: deadlineValueLabelTh(form, "ONLINE", o.value), source: o.row.source, tag: o.row.tag } : null;
  return { paper, online, warnings: [...p.warnings, ...o.warnings.filter((w) => w.code !== "NO_ROW")] };
}

// ───────── ปฏิทิน ─────────

export type CalendarItem = {
  form: FilingForm;
  formLabel: string;
  cadence: "MONTHLY" | "ANNUAL";
  /** "2026-10" (เดือนภาษี) · "FY:2026-12-31" (รอบที่สิ้นสุด) · "Y:2026" (ปีภาษี) · "H:2026" (ครึ่งปีแรก) */
  periodKey: string;
  periodLabel: string;
  paper: DueView | null;
  online: DueView | null;
  /** ระบบคำนวณวันไม่ได้ (บริษัท: นับจากวันประชุมใหญ่) — ข้อความกำหนดจากตาราง */
  whenTh: string | null;
  /** เงื่อนไขที่แบบนี้ต้องยื่น (ข้อความช่วยอ่าน) */
  conditionTh: string | null;
  warnings: LegalWarning[];
};

export type TaxCalendar = {
  asOf: string;
  entityKind: EntityKind;
  entityKindLabel: string;
  vatRegistered: boolean;
  fiscalStartMonth: number;
  items: CalendarItem[];
  /** แบบรายปีที่ถึงวันเตือนล่วงหน้า (กฎ ANNUAL_FILING_REMIND_DAYS) */
  remindDays: number;
  warnings: LegalWarning[];
};

const MONTHLY_PND: FilingForm[] = ["PND1", "PND2", "PND3", "PND53", "PND54"];

/** รอบบัญชีที่สิ้นสุดในปีปฏิทิน y (เดือนเริ่ม s) — วันสุดท้าย + วันสุดท้ายของ 6 เดือนแรก */
function fiscalYearEndingIn(y: number, s: number): { start: string; end: string; halfEnd: string } {
  const endMonth = s === 1 ? 12 : s - 1;
  const end = `${y}-${String(endMonth).padStart(2, "0")}-${String(lastDay(y, endMonth)).padStart(2, "0")}`;
  const startY = s === 1 ? y : y - 1;
  const start = `${startY}-${String(s).padStart(2, "0")}-01`;
  return { start, end, halfEnd: monthEnd(startY, s + 5) };
}

/** ACC T5c ▸ วันประชุมใหญ่อนุมัติงบต่อรอบ (ค่าตั้ง account.entity.statementMeetings) */
export type StatementMeeting = { fyEnd: string; meetingDate: string };

export function taxCalendarFrom(legal: BookLegal, o: { today: Date; vatRegistered: boolean; fiscalStartMonth: number; meetings?: readonly StatementMeeting[] }): TaxCalendar {
  const today = bkkYmd(o.today);
  const year = Number(today.slice(0, 4));
  const kind = legal.entityKind;
  const juristic = isJuristicPayer(kind);
  const warnings: LegalWarning[] = [];
  const items: CalendarItem[] = [];

  // ── รายเดือน (ตัวเดิมของ T3.7) — ภ.พ.30 เฉพาะสมุดที่จด VAT ──
  const monthly = upcomingDeadlinesFrom(legal, o.today, o.vatRegistered ? ["PP30", ...MONTHLY_PND] : MONTHLY_PND);
  for (const d of monthly) {
    const view = (x: typeof d.paper, ch: "PAPER" | "ONLINE"): DueView | null => (x ? { date: x.date, daysLeft: x.daysLeft, ruleTh: deadlineValueLabelTh(d.form, ch, x.day), source: x.source, tag: x.tag } : null);
    items.push({
      form: d.form,
      formLabel: d.formLabel,
      cadence: "MONTHLY",
      periodKey: d.taxMonth,
      periodLabel: `เดือนภาษี ${d.taxMonth}`,
      paper: view(d.paper, "PAPER"),
      online: view(d.online, "ONLINE"),
      whenTh: null,
      conditionTh: d.form === "PP30" ? "ยื่นทุกเดือนภาษีแม้ไม่มีการขาย" : "เมื่อมีการหักภาษี ณ ที่จ่ายในเดือนที่จ่าย",
      warnings: d.warnings,
    });
  }

  // ── รายปี: เลือกรอบถัดไปที่วันสุดท้าย (กระดาษ/ออนไลน์) ยังไม่ผ่าน ──
  const nextOf = (form: FilingForm, anchors: { key: string; label: string; anchor: string }[], conditionTh: string | null) => {
    for (const a of anchors) {
      const dl = annualDeadlineFrom(legal, form, a.anchor, today);
      if (!dl.paper) {
        items.push({ form, formLabel: FILING_FORM_LABEL_TH[form], cadence: "ANNUAL", periodKey: a.key, periodLabel: a.label, paper: null, online: null, whenTh: null, conditionTh, warnings: dl.warnings });
        return;
      }
      const lastDue = dl.online && dl.online.date > dl.paper.date ? dl.online.date : dl.paper.date;
      if (lastDue >= today) {
        items.push({ form, formLabel: FILING_FORM_LABEL_TH[form], cadence: "ANNUAL", periodKey: a.key, periodLabel: a.label, paper: dl.paper, online: dl.online, whenTh: null, conditionTh, warnings: dl.warnings });
        return;
      }
    }
  };
  const fys = [year - 1, year, year + 1].map((y) => fiscalYearEndingIn(y, o.fiscalStartMonth));
  if (juristic === true) {
    nextOf("PND50", fys.map((f) => ({ key: `FY:${f.end}`, label: `รอบบัญชี ${ymdTh(f.start)} – ${ymdTh(f.end)}`, anchor: f.end })), "ภาษีเงินได้นิติบุคคลประจำรอบ (ระบบออกงบเป็นร่างให้ผู้ทำบัญชี)");
    const halves = [...fys, fiscalYearEndingIn(year + 2, o.fiscalStartMonth)];
    nextOf("PND51", halves.map((f) => ({ key: `HFY:${f.halfEnd}`, label: `ครึ่งรอบแรก ${ymdTh(f.start)} – ${ymdTh(f.halfEnd)}`, anchor: f.halfEnd })), "ประมาณการกำไรครึ่งรอบ");
    if (kind === "JURISTIC_PARTNERSHIP")
      nextOf("FS_PARTNERSHIP", fys.map((f) => ({ key: `FY:${f.end}`, label: `งบรอบ ${ymdTh(f.start)} – ${ymdTh(f.end)}`, anchor: f.end })), "งบต้องผ่านผู้สอบบัญชี (เว้นห้างที่เข้าเกณฑ์ขนาดเล็กตามกฎกระทรวง)");
    if (kind === "COMPANY") {
      // บริษัท: นับจากวันประชุมใหญ่ — ACC T5c ▸ ร้านใส่วันประชุมของรอบนั้นแล้ว = คำนวณวัน (วันประชุม + N เดือน ตามแถวตาราง ·
      //   นับแบบเดียวกับกำหนดรายปีอื่นในปฏิทิน) · ยังไม่ใส่ = ข้อความกำหนดเหมือนเดิม (ของรอบที่สิ้นสุดล่าสุด) ◂
      const lastEnded = [...fys].reverse().find((f) => f.end < today) ?? fys[0];
      const p = legalValueFrom(legal, "filing.deadline", dateOf(lastEnded.end), { form: "FS_COMPANY", channel: "PAPER" });
      const meeting = (o.meetings ?? []).find((m) => m.fyEnd === lastEnded.end && /^\d{4}-\d{2}-\d{2}$/.test(m.meetingDate));
      const due = meeting && p.value !== null && p.row ? ymdAddMonthsEom(meeting.meetingDate, p.value) : null;
      items.push({
        form: "FS_COMPANY",
        formLabel: FILING_FORM_LABEL_TH.FS_COMPANY,
        cadence: "ANNUAL",
        periodKey: `FY:${lastEnded.end}`,
        periodLabel: `งบรอบ ${ymdTh(lastEnded.start)} – ${ymdTh(lastEnded.end)}`,
        paper:
          due && p.row
            ? { date: due, daysLeft: Math.round((t(due) - t(today)) / DAY), ruleTh: `${deadlineValueLabelTh("FS_COMPANY", "PAPER", p.value!)} (ประชุมใหญ่ ${ymdTh(meeting!.meetingDate)})`, source: p.row.source, tag: p.row.tag }
            : null,
        online: null,
        whenTh: due ? null : p.value !== null ? deadlineValueLabelTh("FS_COMPANY", "PAPER", p.value) : null,
        conditionTh: due ? "งบต้องผ่านผู้สอบบัญชีรับอนุญาต" : "งบต้องผ่านผู้สอบบัญชีรับอนุญาต · ใส่วันประชุมใหญ่ในตั้งค่าเพื่อให้ปฏิทินคำนวณวันยื่น",
        warnings: p.warnings,
      });
    }
  } else if (juristic === false) {
    nextOf("PND94", [year - 1, year, year + 1].map((y) => ({ key: `H:${y}`, label: `เงินได้ ม.ค.–มิ.ย. ${y}`, anchor: `${y}-06-30` })), "เงินได้ ม.40(5)–(8) ครึ่งปีแรก");
    nextOf("PND90", [year - 2, year - 1, year].map((y) => ({ key: `Y:${y}`, label: `ปีภาษี ${y}`, anchor: `${y}-12-31` })), "ภาษีเงินได้บุคคลธรรมดาทั้งปี (เกณฑ์เงินสด ปีปฏิทิน)");
  } else {
    warnings.push(legalWarning("ENTITY_KIND_UNSET", { context: "calendar" }));
  }

  const key = (i: CalendarItem) => i.paper?.date ?? i.online?.date ?? "9999";
  items.sort((a, b) => key(a).localeCompare(key(b)) || a.form.localeCompare(b.form));
  const remind = bookRuleFrom(legal, "ANNUAL_FILING_REMIND_DAYS", o.today);
  return {
    asOf: today,
    entityKind: kind,
    entityKindLabel: ENTITY_KIND_LABEL_TH[kind],
    vatRegistered: o.vatRegistered,
    fiscalStartMonth: o.fiscalStartMonth,
    items,
    remindDays: remind.value ?? 14,
    warnings,
  };
}

export async function taxCalendar(ctx: BookCtx, today: Date = accountNow()): Promise<TaxCalendar> {
  const [legal, policy, meetings] = await Promise.all([loadBookLegal(ctx), getPolicy(ctx), statementMeetingsOf(ctx)]);
  return taxCalendarFrom(legal, { today, vatRegistered: policy.vatRegistered, fiscalStartMonth: policy.fiscalYearStartMonth, meetings });
}

/** ACC T5c ▸ วันประชุมใหญ่ที่ร้านใส่ (ค่าตั้งชั้นสมุด) */
export async function statementMeetingsOf(ctx: BookCtx): Promise<StatementMeeting[]> {
  const k = ACCOUNT_SETTING_KEYS.statementMeetings;
  const r = await resolveBookSettings({ tenantId: ctx.tenantId }, [k], ctx.systemId);
  const v = r[k]?.value;
  return Array.isArray(v) ? (v as StatementMeeting[]).filter((m) => m && typeof m.fyEnd === "string" && typeof m.meetingDate === "string") : [];
}

/** ACC T5c ▸ บันทึกวันประชุมใหญ่ของรอบ (meetingDate null = ลบ) — ผ่านเครื่องยนต์ค่าตั้ง (สิทธิ์ · ประวัติ · zod) */
export async function saveStatementMeeting(actor: SettingsActor, ctx: BookCtx, fyEnd: string, meetingDate: string | null): Promise<{ ok: true; meetings: StatementMeeting[] } | { ok: false; reason: string }> {
  const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!YMD_RE.test(fyEnd) || (meetingDate !== null && !YMD_RE.test(meetingDate))) return { ok: false, reason: "วันที่ต้องเป็นรูปแบบ YYYY-MM-DD" };
  if (meetingDate !== null && meetingDate < fyEnd) return { ok: false, reason: "วันประชุมใหญ่ต้องไม่ก่อนวันสิ้นรอบบัญชี" };
  const cur = await statementMeetingsOf(ctx);
  const next = [...cur.filter((m) => m.fyEnd !== fyEnd), ...(meetingDate ? [{ fyEnd, meetingDate }] : [])].sort((a, b) => a.fyEnd.localeCompare(b.fyEnd));
  const res = await setSettings(actor, { tenantId: ctx.tenantId }, [{ key: ACCOUNT_SETTING_KEYS.statementMeetings, scope: "ACCOUNT_BOOK", scopeId: ctx.systemId, value: next }]);
  if (!res.ok) return { ok: false, reason: res.issues.map((i) => i.messageTh).join(" · ") || "บันทึกไม่สำเร็จ" };
  return { ok: true, meetings: next };
}

/** ข้อความเตือนของแบบรายปี (ตัวเตือนรายวัน + จอ) — ทะเบียนกลาง TAX_CALENDAR_DUE */
export function calendarDueWarning(i: CalendarItem): LegalWarning | null {
  if (!i.paper) return null;
  return legalWarning("TAX_CALENDAR_DUE", {
    form: i.formLabel,
    period: i.periodLabel,
    due: `ยื่นภายใน ${ymdTh(i.paper.date)}`,
    online: i.online ? ymdTh(i.online.date) : "",
  });
}
