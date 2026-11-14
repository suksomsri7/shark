// QC — CAL1.3 ตัวรวม agenda (สัญญา docs/modules/32-secretary-calendar.md §4 · §8.2 · R-CAL-5…9/15/19/21/24/36 · มติ Q1/Q2/Q4)
//   P  taxDeadlines บริสุทธิ์ (ช่วงขยายออนไลน์ · หลัง 31 ม.ค. 2570 · ข้ามปี)
//   S  ข้อมูล seed (รัน seed-calendar-qc ก่อน — idempotent · วันไทยวันนี้):
//      S1 เจ้าของเห็นทุกแหล่ง · S2 ครูนิว (STAFF ไม่มีคีย์บัญชี) ไม่เห็นใบแจ้งหนี้/ภาษี · เห็นนัดของตัวเองเท่านั้น · ใบลาของตัวเองเท่านั้น
//      S3 ครูบอส (MANAGER) เห็นนัดทั้งสาขา · mine เฉพาะของตัวเอง · CalPref.sources hr=false ตัด HR
//      S4 ร้าน B (หอพัก) — ระบบที่ร้านไม่เปิด = ไม่มีแถว · แถวสรุปหอพัก · ปิดระบบชั่วคราว = แถวหาย
//      S5 ระดับเลขา OFF ตัดแหล่งของร้าน + note SECTION_OFF · ไม่ตัดเตือนส่วนตัว (Q2) · แถว AiSystemAccess จริง
//      S6 ล้ม 1 แหล่ง ส่วนอื่นยังมา (SECTION_FAILED) · S7 Google (ทุกกิจการ · ไม่แสดงสำเนาของเรา/ปฏิทินที่ไม่ดึง)
//      S8 นัดชน conflictWith · S9 monthDots · S10 todayOpenCount · S11 completeSourceItem (kanban/CRM) · S12 M3/ข้อมูลส่วนตัว (grep + ไม่มีเบอร์)
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-1.3.mts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chk, errMsg, finish, guard, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.3";
guard(LABEL);

console.log("── seed (idempotent · วันไทยวันนี้) ──");
{
  const out = execFileSync("pnpm", ["exec", "tsx", "scripts/seed-calendar-qc.mts"], { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  console.log("  " + out.trim().split("\n").slice(-2).join("\n  "));
}

const { prisma } = (await import("@/lib/core/db")) as AnyMod;
const agenda = (await import("@/lib/modules/calendar/agenda")) as AnyMod;
const tax = (await import("@/lib/modules/calendar/tax-deadlines")) as AnyMod;
const nf = (await import("@/lib/modules/calendar/next-fire")) as AnyMod;

// ─────────────── P: taxDeadlines ───────────────
console.log("── P: taxDeadlines (บริสุทธิ์) ──");
{
  const nov = tax.taxDeadlines("2026-11-01", "2026-11-30");
  const f = (form: string) => nov.find((x: AnyMod) => x.form === form);
  chk("P1", "พ.ย. 2569 (ช่วงขยาย): ภ.พ.30 = 23 · ภ.ง.ด.3/53 = 15 · ภ.ง.ด.1 = 15 · ปกส. = 15 · งวด ต.ค.", f("PP30")?.day === "2026-11-23" && f("PND3_53")?.day === "2026-11-15" && f("PND1")?.day === "2026-11-15" && f("SSO")?.day === "2026-11-15" && nov.every((x: AnyMod) => x.period === "2026-10"), JSON.stringify(nov));
  chk("P2", "ชื่อ/บรรทัดรอง Q4: \"ยื่น ภ.พ.30 เดือน ต.ค.\" · \"ยื่นกระดาษภายในวันที่ 15\" · ปกส. ไม่มีบรรทัดกระดาษ", f("PP30")?.title === "ยื่น ภ.พ.30 เดือน ต.ค." && f("PP30")?.sub === "กำหนดยื่น (ตรวจสอบกับสรรพากร) · ยื่นกระดาษภายในวันที่ 15" && f("PND3_53")?.paperDay === 7 && f("SSO")?.paperDay === null && f("SSO")?.sub === "กำหนดยื่น (ตรวจสอบกับประกันสังคม)");
  const jan = tax.taxDeadlines("2027-01-01", "2027-01-31");
  chk("P3", "ม.ค. 2570 (กระดาษ 15 ม.ค. ≤ 31 ม.ค. = ยังขยาย): ภ.พ.30 = 23 · งวด ธ.ค. 2569 (ข้ามปี)", jan.find((x: AnyMod) => x.form === "PP30")?.day === "2027-01-23" && jan.every((x: AnyMod) => x.period === "2026-12" && x.title.endsWith("ธ.ค.")), JSON.stringify(jan));
  const feb = tax.taxDeadlines("2027-02-01", "2027-02-28");
  chk("P4", "ก.พ. 2570 (หลังช่วงขยาย): ภ.พ.30 = 15 · ภ.ง.ด.3/53 = 7 · \"ตรวจประกาศขยายเวลา\"", feb.find((x: AnyMod) => x.form === "PP30")?.day === "2027-02-15" && feb.find((x: AnyMod) => x.form === "PND3_53")?.day === "2027-02-07" && feb.filter((x: AnyMod) => x.form !== "SSO").every((x: AnyMod) => !x.extended && x.sub.includes("ตรวจประกาศขยายเวลา")), JSON.stringify(feb));
  chk("P5", "ช่วงผิด/ไม่มีวันในช่วง = [] · เรียงตามวัน", tax.taxDeadlines("2026-11-30", "2026-11-01").length === 0 && tax.taxDeadlines("2026-11-16", "2026-11-22").length === 0 && nov.map((x: AnyMod) => x.day).join() === [...nov.map((x: AnyMod) => x.day)].sort().join());
}

// ─────────────── ผู้ใช้ seed ───────────────
const A = "calqc-tenant", B = "calqc-tenant-b";
const U = { owner: "calqc-owner", new: "calqc-staff-new", boss: "calqc-staff-boss" };
async function actorOf(userId: string, tenantId: string) {
  const m = await prisma.membership.findFirst({ where: { userId, tenantId }, select: { role: true, unitAccess: true, permissions: true } });
  return { userId, tenantId, membership: { role: m.role, unitAccess: m.unitAccess as string[], permissions: (m.permissions ?? {}) as Record<string, unknown> } };
}
const now = new Date();
const todayNo = nf.bkkDayNo(now);
const ymd = (off: number) => nf.dayNoToYmd(todayNo + off);
const DEFAULT_ACCESS = {}; // ไม่มีแถว = ค่าเริ่มต้น (ไม่ OFF) — คงที่ไม่ขึ้นกับแถวจริงของร้าน
const ag = (a: AnyMod, from: string, to: string, opts: AnyMod = {}) => agenda.agendaFor(a, { from, to }, { now, access: DEFAULT_ACCESS, ...opts });
const ids = (r: AnyMod, src?: string) => r.items.filter((i: AnyMod) => !src || i.source === src).map((i: AnyMod) => i.id);
const srcs = (r: AnyMod) => [...new Set(r.items.map((i: AnyMod) => i.source))].sort();

const owner = await actorOf(U.owner, A), staffNew = await actorOf(U.new, A), boss = await actorOf(U.boss, A);
const ownerB = await actorOf(U.owner, B), bossB = await actorOf(U.boss, B);
const cleanups: (() => Promise<unknown>)[] = [];

try {
  // ─────────────── S1 เจ้าของ ───────────────
  console.log("── S1: เจ้าของร้าน A ──");
  const o = await ag(owner, ymd(0), ymd(1));
  chk("S1-1", "บัตรคิว: นัดวันนี้ 09:30 · 11:00 · 16:00 + พรุ่งนี้ 2 นัด (ไม่มีนัดที่ยกเลิก)", ["booking:calqc-appt-1", "booking:calqc-appt-2", "booking:calqc-appt-4", "booking:calqc-appt-5", "booking:calqc-appt-6"].every((x) => ids(o).includes(x)) && !ids(o).includes("booking:calqc-appt-3"), JSON.stringify(ids(o, "booking")));
  const a1 = o.items.find((i: AnyMod) => i.id === "booking:calqc-appt-1");
  chk("S1-2", "แถวนัด: \"Discover Scuba · คุณแพร\" · sub ครูนิว · ป้ายบัตรคิว · deepLink ผู้จัดการ /booking/day?date= · mine=false (เจ้าของไม่ใช่ช่าง)", a1?.title === "Discover Scuba · คุณแพร" && a1?.sub === "ครูนิว" && a1?.label === "บัตรคิว" && a1?.deepLink?.path === `/app/u/calqc-dive/booking/day?date=${ymd(0)}` && a1?.mine === false && a1?.timeHint === "DURATION" && a1?.endAt, JSON.stringify(a1));
  const due = o.items.find((i: AnyMod) => i.id === `account:due:calqc-sys-account:${ymd(0)}`);
  chk("S1-3", "บัญชีแถวสรุป: \"ใบแจ้งหนี้ครบกำหนด 2 ใบ\" ฿18,400 · sub ชื่อ+ยอด · all-day · ไม่นับใบจ่ายแล้ว", due?.title === "ใบแจ้งหนี้ครบกำหนด 2 ใบ" && due?.summary?.count === 2 && due?.summary?.amountSatang === 1_840_000 && /Ocean Tour ฿12,000/.test(due?.sub ?? "") && /คุณมาลี ฿6,400/.test(due?.sub ?? "") && due?.allDay === true && due?.deepLink?.path === "/app/sys/calqc-sys-account/account/documents", JSON.stringify(due));
  const od = o.items.find((i: AnyMod) => i.id === `account:overdue:calqc-sys-account:${ymd(0)}`);
  chk("S1-4", "บนวันนี้: \"ใบแจ้งหนี้เกินกำหนด 1 ใบ\" ค้าง ฿6,000", od?.summary?.count === 1 && od?.summary?.amountSatang === 600_000 && od?.title === "ใบแจ้งหนี้เกินกำหนด 1 ใบ", JSON.stringify(od));
  chk("S1-5", "CRM: เฉพาะกิจกรรมที่เจ้าของเป็น owner (ประชุมคุณเอก) — ไม่เห็นงานของครูนิว · MEETING ติ๊กไม่ได้", ids(o, "crm").join() === "crm:calqc-crm-act-meet" && o.items.find((i: AnyMod) => i.id === "crm:calqc-crm-act-meet")?.checkable === false && o.items.find((i: AnyMod) => i.id === "crm:calqc-crm-act-meet")?.deepLink?.path === "/crm/tasks?systemId=calqc-sys-crm&taskId=calqc-crm-act-meet", JSON.stringify(ids(o, "crm")));
  chk("S1-6", "เตือนฉัน (CHAT ผูกคุณเอก): sub \"คุณสั่ง…\" · deepLink = ผู้ติดต่อ CRM (§4.5) · checkable · ไม่เห็นของครูนิว", (() => {
    const r = o.items.find((i: AnyMod) => i.id === "reminder:calqc-cal-ek");
    return r && /^คุณสั่ง/.test(r.sub ?? "") && r.deepLink?.kind === "web" && r.deepLink?.path === "/app/sys/calqc-sys-crm/crm/contacts/calqc-crm-contact-ek" && r.checkable === true && r.label === "เตือนฉัน" && !ids(o).some((x: string) => x.includes("calqc-cal-new"));
  })(), JSON.stringify(o.items.filter((i: AnyMod) => i.source === "reminder")));
  chk("S1-7", "นัดส่วนตัวพรุ่งนี้ + ตั๋ว PUBLISHED พรุ่งนี้ · ไม่มี DRAFT", ids(o).includes("event:calqc-cal-bank") && ids(o).includes("ticket:calqc-tevent") && !ids(o).some((x: string) => x.includes("calqc-cal-draft")));
  chk("S1-8", "เรียง: วัน → ทั้งวันก่อน → เวลา", o.items.every((it: AnyMod, i: number) => {
    if (!i) return true;
    const p = o.items[i - 1], dp = nf.bkkDayNo(new Date(p.startAt)), dc = nf.bkkDayNo(new Date(it.startAt));
    return dp < dc || (dp === dc && (p.allDay && !it.allDay || p.allDay === it.allDay && p.startAt <= it.startAt));
  }));
  // ภาษี: ช่วง 42 วันจากวันนี้ — คาดตามข้อมูล seed
  const wide = await ag(owner, ymd(0), ymd(41));
  const periods = await prisma.hrPayrollRun.findMany({ where: { systemId: "calqc-sys-hr", status: { notIn: ["DRAFT", "REVERSED"] } }, select: { periodKey: true, totalSsoEmployeeSatang: true } });
  const wht = await prisma.accountDocument.findMany({ where: { systemId: "calqc-sys-account", docType: "WHT_CERT", direction: "IN", voidedAt: null }, select: { issueDate: true } });
  const whtPeriods = new Set(wht.map((w: AnyMod) => { const t = new Date(+w.issueDate + 7 * 3_600_000); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`; }));
  const exp: string[] = [];
  for (const t of tax.taxDeadlines(ymd(0), ymd(41))) {
    if (t.form === "PP30") exp.push(`tax:PP30:${t.period}:calqc-sys-account`);
    if (t.form === "PND3_53" && whtPeriods.has(t.period)) exp.push(`tax:PND3_53:${t.period}:calqc-sys-account`);
    const run = periods.find((p: AnyMod) => p.periodKey === t.period);
    if (t.form === "PND1" && run) exp.push(`tax:PND1:${t.period}:calqc-sys-hr`);
    if (t.form === "SSO" && run && run.totalSsoEmployeeSatang > 0) exp.push(`tax:SSO:${t.period}:calqc-sys-hr`);
  }
  chk("S1-9", `กำหนดยื่น (42 วัน) ตรงเงื่อนไขแสดง §4.4 (${exp.length} แถว) · ร้าน B ไม่ vatRegistered`, ids(wide, "tax").sort().join() === exp.sort().join() && exp.length > 0, `got ${ids(wide, "tax").join()} exp ${exp.join()}`);
  const t1 = wide.items.find((i: AnyMod) => i.source === "tax");
  chk("S1-10", "แถวภาษี all-day · ติ๊กไม่ได้ · ป้ายบัญชี/HR · deepLink pp30/wht/payroll", !!t1 && wide.items.filter((i: AnyMod) => i.source === "tax").every((i: AnyMod) => i.allDay && !i.checkable && ["บัญชี", "HR"].includes(i.label) && /\/(account\/reports\/pp30|account\/wht|hr\/payroll)$/.test(i.deepLink.path)));
  chk("S1-11", "HR: วันจ่ายเงินเดือนงวดนี้ (APPROVED) อยู่ในเดือน · ไม่เห็นใบลาคนอื่น (ไม่ผูก HR เจ้าของ)", (await ag(owner, nf.dayNoToYmd(nf.ymdToDayNo(ymd(0).slice(0, 8) + "01")), nf.dayNoToYmd(nf.ymdToDayNo(ymd(0).slice(0, 8) + "01") + 30))).items.some((i: AnyMod) => i.id === "hr:pay:calqc-payrun-now" && i.allDay) && !ids(wide).some((x: string) => x.startsWith("hr:leave:")));

  // ─────────────── S2 ครูนิว ───────────────
  console.log("── S2: ครูนิว (STAFF · ไม่มีคีย์บัญชี) ──");
  const n = await ag(staffNew, ymd(0), ymd(6));
  chk("S2-1", "ไม่มีสิทธิ์บัญชี = ไม่เห็นใบแจ้งหนี้ และไม่เห็นกำหนดยื่น", !n.items.some((i: AnyMod) => i.source === "account" || i.source === "tax"), JSON.stringify(srcs(n)));
  chk("S2-2", "บัตรคิว: เห็นแค่นัดของตัวเอง (appt-1 · 5 · 6) · mine=true · deepLink /booking/mine", ids(n, "booking").sort().join() === ["booking:calqc-appt-1", "booking:calqc-appt-5", "booking:calqc-appt-6"].join() && n.items.filter((i: AnyMod) => i.source === "booking").every((i: AnyMod) => i.mine && i.deepLink.path === "/app/u/calqc-dive/booking/mine"), JSON.stringify(ids(n, "booking")));
  chk("S2-3", "CRM ของตัวเอง: CALL วันนี้ (ไม่มีคีย์ปิดกิจกรรม = ติ๊กไม่ได้) + TASK พรุ่งนี้ + งานที่เสร็จแล้ว done=true", ["crm:calqc-crm-act-call", "crm:calqc-crm-act-task", "crm:calqc-crm-act-done"].every((x) => ids(n, "crm").includes(x)) && !ids(n, "crm").includes("crm:calqc-crm-act-meet") && n.items.find((i: AnyMod) => i.id === "crm:calqc-crm-act-done")?.done === true && n.items.find((i: AnyMod) => i.id === "crm:calqc-crm-act-call")?.checkable === false, JSON.stringify(ids(n, "crm")));
  chk("S2-4", "บอร์ดงาน: การ์ดของฉัน (ถัง · น้ำดื่ม · เสร็จแล้ว done) · ไม่เห็นการ์ดเรือของคนอื่น · บอร์ด TENANT = VIEWER ⇒ ติ๊กไม่ได้", ["kanban:calqc-card-tank", "kanban:calqc-card-nodone", "kanban:calqc-card-done"].every((x) => ids(n, "kanban").includes(x)) && !ids(n, "kanban").includes("kanban:calqc-card-boat") && n.items.find((i: AnyMod) => i.id === "kanban:calqc-card-done")?.done === true && n.items.filter((i: AnyMod) => i.source === "kanban").every((i: AnyMod) => i.checkable === false && /^การ์ดในบอร์ด "/.test(i.sub)), JSON.stringify(ids(n, "kanban")));
  chk("S2-5", "HR: ใบลาของฉันเท่านั้น (ลาพักร้อน 2 วัน · อนุมัติแล้ว) · ไม่เห็นใบลาครูบอส · ไม่เห็นวันจ่ายเงินเดือน", ids(n, "hr").sort().join() === [`hr:leave:calqc-leave-new:${ymd(3)}`, `hr:leave:calqc-leave-new:${ymd(4)}`].join() && n.items.find((i: AnyMod) => i.source === "hr")?.title === "ลาพักร้อน" && n.items.find((i: AnyMod) => i.source === "hr")?.sub === "อนุมัติแล้ว", JSON.stringify(ids(n, "hr")));
  chk("S2-6", "ของส่วนตัวครูนิวเท่านั้น (ไม่เห็นของเจ้าของ) · STAFF ไม่มีคีย์ตั๋ว = ไม่เห็นตั๋ว", ids(n).includes("reminder:calqc-cal-new") && ids(n).includes("event:calqc-cal-new-event") && !ids(n).some((x: string) => /calqc-cal-(ek|bank|weekly)/.test(x)) && !n.items.some((i: AnyMod) => i.source === "ticket"));

  // ─────────────── S3 ครูบอส ───────────────
  console.log("── S3: ครูบอส (MANAGER สาขาดำน้ำ) ──");
  const b = await ag(boss, ymd(0), ymd(6));
  chk("S3-1", "MANAGER = นัดทั้งสาขา (1 · 2 · 4 · 5 · 6) · mine เฉพาะ appt-2 (ของครูบอส)", ["booking:calqc-appt-1", "booking:calqc-appt-2", "booking:calqc-appt-4"].every((x) => ids(b, "booking").includes(x)) && b.items.filter((i: AnyMod) => i.source === "booking" && i.mine).map((i: AnyMod) => i.id).join() === "booking:calqc-appt-2", JSON.stringify(b.items.filter((i: AnyMod) => i.source === "booking").map((i: AnyMod) => [i.id, i.mine])));
  chk("S3-2", "CalPref.sources hr=false → ไม่มีแถว HR (ใบลาครูบอสหาย) · ไม่มี note OFF (ผู้ใช้ปิดเอง)", !b.items.some((i: AnyMod) => i.source === "hr") && !b.notes.some((x: AnyMod) => x.code === "SECTION_OFF"), JSON.stringify(b.notes));

  // ─────────────── S4 ร้าน B ───────────────
  console.log("── S4: ระบบที่ร้านไม่เปิด = ไม่มีแถว ──");
  const ob = await ag(ownerB, ymd(0), ymd(6));
  chk("S4-1", "ร้าน B (หอพัก + บัญชี): ไม่มีบัตรคิว/บอร์ด/CRM/HR/ตั๋ว · ไม่มี ภ.พ.30 (vatRegistered=false)", !ob.items.some((i: AnyMod) => ["booking", "kanban", "crm", "hr", "ticket"].includes(i.source)) && !ob.items.some((i: AnyMod) => String(i.id).startsWith("tax:PP30")), JSON.stringify(srcs(ob)));
  const dr = ob.items.find((i: AnyMod) => i.id === "dorm:run:calqc-billrun");
  chk("S4-2", "หอพัก: แถวสรุปรอบบิล \"ค่าห้องงวด … ครบกำหนด\" · ค้าง 1 ห้อง · ครบอีก 4 วัน", dr?.allDay && dr?.sub?.startsWith("ค้าง 1 ห้อง") && nf.bkkDayNo(new Date(dr.startAt)) === todayNo + 4 && dr?.summary?.count === 1 && /^ค่าห้องงวด .+ ครบกำหนด$/.test(dr?.title) && dr?.deepLink?.path === "/app/u/calqc-dorm/dorm/billing", JSON.stringify(dr));
  const bb = await ag(bossB, ymd(0), ymd(6));
  chk("S4-3", "ครูบอสร้าน B (STAFF dorm.view): เห็นหอพัก · ไม่เห็นบัญชี", bb.items.some((i: AnyMod) => i.source === "dorm") && !bb.items.some((i: AnyMod) => i.source === "account" || i.source === "tax"), JSON.stringify(srcs(bb)));
  chk("S4-4", "ร้าน A ไม่มีหอพัก = ไม่มีแถวหอพัก · ร้าน B เห็นเตือนของร้าน B เท่านั้น", !o.items.some((i: AnyMod) => i.source === "dorm") && ids(await ag(ownerB, ymd(1), ymd(1))).includes("reminder:calqc-cal-owner-b") && !ids(ob).includes("reminder:calqc-cal-ek"));
  // ปิดระบบบอร์ดงานชั่วคราว (active=false) → แถวหาย
  await prisma.appSystem.update({ where: { id: "calqc-sys-kanban" }, data: { active: false } });
  cleanups.push(() => prisma.appSystem.update({ where: { id: "calqc-sys-kanban" }, data: { active: true } }));
  const nk = await ag(staffNew, ymd(0), ymd(1));
  chk("S4-5", "ระบบบอร์ดงานปิด (active=false) = ไม่มีแถวบอร์ดงาน · แหล่งอื่นยังมา", !nk.items.some((i: AnyMod) => i.source === "kanban") && nk.items.some((i: AnyMod) => i.source === "booking"));
  await cleanups.pop()!();

  // ─────────────── S5 ระดับเลขา OFF ───────────────
  console.log("── S5: ระดับเลขา OFF (R-CAL-21 · Q2) ──");
  const off = await ag(owner, ymd(0), ymd(1), { access: { booking: "OFF", account: "OFF", calendar: "OFF" } });
  chk("S5-1", "booking/account OFF = ไม่มีแถว + note SECTION_OFF · ภาษีฝั่งบัญชีหาย", !off.items.some((i: AnyMod) => i.source === "booking" || i.source === "account") && off.notes.some((x: AnyMod) => x.code === "SECTION_OFF" && x.source === "booking") && off.notes.some((x: AnyMod) => x.code === "SECTION_OFF" && x.source === "account") && !off.items.some((i: AnyMod) => /^tax:(PP30|PND3_53)/.test(i.id)), JSON.stringify(off.notes));
  chk("S5-2", "Q2: calendar OFF ไม่ตัดเตือน/นัดส่วนตัว · CRM/บอร์ดยังมา", ids(off).includes("reminder:calqc-cal-ek") && ids(off).includes("event:calqc-cal-bank") && off.items.some((i: AnyMod) => i.source === "crm"));
  await prisma.aiSystemAccess.upsert({ where: { tenantId_module: { tenantId: A, module: "crm" } }, create: { tenantId: A, module: "crm", level: "OFF", setById: U.owner }, update: { level: "OFF" } });
  cleanups.push(() => prisma.aiSystemAccess.deleteMany({ where: { tenantId: A, module: "crm" } }));
  const realOff = await agenda.agendaFor(owner, { from: ymd(0), to: ymd(1) }, { now });
  chk("S5-3", "แถว AiSystemAccess จริง (crm OFF · ไม่ส่ง access) = ไม่มีแถว CRM", !realOff.items.some((i: AnyMod) => i.source === "crm") && realOff.items.some((i: AnyMod) => i.source === "booking"));
  await cleanups.pop()!();

  // ─────────────── S6 ล้ม 1 แหล่ง ───────────────
  console.log("── S6: ล้ม 1 แหล่ง ส่วนอื่นยังมา ──");
  const fl = await ag(staffNew, ymd(0), ymd(1), { deps: { failSources: ["kanban"] } });
  chk("S6-1", "kanban ล้ม = ไม่มีแถว kanban + note SECTION_FAILED · booking/crm/เตือนยังมา", !fl.items.some((i: AnyMod) => i.source === "kanban") && fl.notes.some((x: AnyMod) => x.code === "SECTION_FAILED" && x.source === "kanban") && ["booking", "crm", "reminder"].every((s) => fl.items.some((i: AnyMod) => i.source === s)), JSON.stringify(fl.notes));
  const fl2 = await ag(owner, ymd(0), ymd(1), { deps: { failSources: ["reminder", "booking", "account"] } });
  chk("S6-2", "ล้มหลายแหล่งพร้อมกัน (รวมของส่วนตัว) — ไม่โยน · ที่เหลือมา", fl2.items.some((i: AnyMod) => i.source === "crm") && fl2.notes.filter((x: AnyMod) => x.code === "SECTION_FAILED").length === 3);
  const ops = await prisma.opsEvent?.findFirst?.({ where: { source: "calendar", message: { contains: "agenda: ส่วน kanban" } }, orderBy: { createdAt: "desc" } }).catch(() => null);
  chk("S6-3", "logOps WARN ไม่มีชื่อเรื่อง/ชื่อลูกค้า", !!ops && !/คุณแพร|เช็กถัง|โทรหาคุณเอก/.test(JSON.stringify(ops)), JSON.stringify(ops)?.slice(0, 200));

  // ─────────────── S7 Google ───────────────
  console.log("── S7: Google (CalExternalEvent) ──");
  await prisma.calLink.deleteMany({ where: { userId: U.owner } });
  const link = await prisma.calLink.create({ data: { userId: U.owner, provider: "GOOGLE", email: "calqc@example.com", tokenBox: "qc.none.x", calendars: [{ id: "primary-cal", name: "ส่วนตัว", import: true }, { id: "hol", name: "วันหยุดไทย", import: false }] } });
  cleanups.push(() => prisma.calLink.deleteMany({ where: { id: link.id } }));
  const T = (off: number, h: number, mi = 0) => new Date(nf.dayNoToYmd(todayNo + off) + `T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00+07:00`);
  await prisma.calExternalEvent.createMany({
    data: [
      { linkId: link.id, userId: U.owner, calendarId: "primary-cal", externalId: "g1", title: "ส่งลูกไปโรงเรียน", startAt: T(1, 7, 0), endAt: T(1, 8, 0), etag: "e1" },
      { linkId: link.id, userId: U.owner, calendarId: "primary-cal", externalId: "g2", title: "เที่ยวเชียงใหม่", startAt: T(1, 0), endAt: T(3, 0), allDay: true, etag: "e2" },
      { linkId: link.id, userId: U.owner, calendarId: "primary-cal", externalId: "g3", title: "สำเนาของเรา", startAt: T(1, 9), endAt: T(1, 10), etag: "e3", sharkRef: "appt:x:y" },
      { linkId: link.id, userId: U.owner, calendarId: "hol", externalId: "g4", title: "วันหยุด", startAt: T(1, 0), endAt: T(2, 0), allDay: true, etag: "e4" },
      { linkId: link.id, userId: U.owner, calendarId: "primary-cal", externalId: "g5", title: "ลบแล้ว", startAt: T(1, 11), endAt: T(1, 12), etag: "e5", deletedAt: new Date() },
      { linkId: link.id, userId: U.owner, calendarId: "primary-cal", externalId: "g6", title: "ชนประชุมธนาคาร", startAt: T(1, 13, 30), endAt: T(1, 14, 30), etag: "e6" },
    ],
  });
  const g = await ag(owner, ymd(1), ymd(2));
  const gs = g.items.filter((i: AnyMod) => i.source === "google");
  chk("S7-1", "แสดง: นัดเวลา + ทั้งวัน 2 วัน (แถวต่อวัน) · ไม่แสดงสำเนาของเรา/ปฏิทินที่ไม่ดึง/ที่ลบ", gs.length === 4 && gs.some((i: AnyMod) => i.title === "ส่งลูกไปโรงเรียน" && i.sub === "จากปฏิทิน Google · ส่วนตัว" && i.deepLink === null && i.mine) && gs.filter((i: AnyMod) => i.title === "เที่ยวเชียงใหม่" && i.allDay).length === 2 && !gs.some((i: AnyMod) => /สำเนา|วันหยุด|ลบแล้ว/.test(i.title)), JSON.stringify(gs.map((i: AnyMod) => [i.id, i.title])));
  const gB = await ag(ownerB, ymd(1), ymd(1));
  chk("S7-2", "Google แสดงทุกกิจการ (ร้าน B ด้วย · §2.4) · ครูนิวไม่เห็นของเจ้าของ", gB.items.some((i: AnyMod) => i.source === "google") && !(await ag(staffNew, ymd(1), ymd(1))).items.some((i: AnyMod) => i.source === "google"));
  const ev = g.items.find((i: AnyMod) => i.id === "event:calqc-cal-bank");
  chk("S7-3", "นัดชน (§11): ประชุมธนาคาร 13:00–14:00 × Google 13:30–14:30 → conflictWith ทั้งสองฝั่ง + ConflictNote OVERLAP", ev?.conflictWith?.some((x: string) => x.startsWith("google:")) && g.conflicts.some((c: AnyMod) => c.kind === "OVERLAP" && c.earlierId === "event:calqc-cal-bank"), JSON.stringify({ cw: ev?.conflictWith, c: g.conflicts }));
  await cleanups.pop()!();

  // ─────────────── S8 นัดชน (seed) ───────────────
  console.log("── S8: นัดชนของครูนิว (seed) ──");
  const nt = await ag(staffNew, ymd(1), ymd(1));
  const a6 = nt.items.find((i: AnyMod) => i.id === "booking:calqc-appt-6");
  chk("S8-1", "นัด 12:00–14:00 ทับนัดส่วนตัว 12:30 → conflictWith + note OVERLAP", a6?.conflictWith?.includes("event:calqc-cal-new-event") && nt.conflicts.some((c: AnyMod) => c.kind === "OVERLAP" && c.laterId === "event:calqc-cal-new-event"), JSON.stringify(nt.conflicts));
  chk("S8-2", "นัดของผู้จัดการที่ไม่ใช่ของตัวเอง (mine=false) ไม่นับนัดชน", (await ag(owner, ymd(1), ymd(1))).items.filter((i: AnyMod) => i.source === "booking").every((i: AnyMod) => !i.conflictWith));

  // ─────────────── S9 monthDots ───────────────
  console.log("── S9: monthDots ──");
  const ym = ymd(0).slice(0, 7);
  const md = await agenda.monthDots(owner, ym, { now, access: DEFAULT_ACCESS });
  const td = md[ymd(0)] ?? [];
  const PRI = ["remind", "personal", "booking", "crm", "kanban", "account", "hr", "dorm", "ticket", "trips", "google"];
  chk("S9-1", "วันนี้มีจุด ≤ 3 สี เรียงตาม priority (เตือน → บัตรคิว → CRM)", td.length > 0 && td.length <= 3 && td[0] === "remind" && td.every((k: string, i: number) => !i || PRI.indexOf(td[i - 1]) <= PRI.indexOf(k)), JSON.stringify(td));
  chk("S9-2", "ทุกวัน ≤ 3 สี · คีย์เป็นวันในเดือนนั้น · เดือนผิด = 400", Object.entries(md).every(([d, v]) => d.startsWith(ym) && (v as string[]).length <= 3) && (await agenda.monthDots(owner, "2026-13").then(() => false, (e: AnyMod) => e?.status === 400)));

  // ─────────────── S10 todayOpenCount ───────────────
  console.log("── S10: todayOpenCount (badge · count ตรง) ──");
  const expNew = await prisma.calItem.count({ where: { userId: U.new, tenantId: A, status: "OPEN", kind: "REMINDER", occursAt: { gte: new Date(nf.dayNoToYmd(todayNo) + "T00:00:00+07:00"), lt: new Date(nf.dayNoToYmd(todayNo + 1) + "T00:00:00+07:00") } } });
  const cNew = await agenda.todayOpenCount(staffNew, now, { noCache: true, access: DEFAULT_ACCESS });
  chk("S10-1", `ครูนิว = เตือนวันนี้ (${expNew}) + การ์ดค้างวันนี้ 2 + CALL วันนี้ 1 (ไม่นับที่เสร็จ)`, cNew === expNew + 3, `${cNew}`);
  const cOff = await agenda.todayOpenCount(staffNew, now, { noCache: true, access: { kanban: "OFF", crm: "OFF" } });
  chk("S10-2", "kanban/crm OFF = นับเฉพาะเตือนส่วนตัว · แคช 60 วิ (เรียกซ้ำไม่ noCache = ค่าเดิม)", cOff === expNew && (await agenda.todayOpenCount(staffNew, now)) === cOff);
  const cBoss = await agenda.todayOpenCount(boss, now, { noCache: true, access: DEFAULT_ACCESS });
  chk("S10-3", "ครูบอส: การ์ดเรือ (ผ่าน KanbanCardAssignee) ไม่ใช่วันนี้ = 0 การ์ด", cBoss === (await prisma.calItem.count({ where: { userId: U.boss, tenantId: A, status: "OPEN", kind: "REMINDER", occursAt: { gte: new Date(nf.dayNoToYmd(todayNo) + "T00:00:00+07:00"), lt: new Date(nf.dayNoToYmd(todayNo + 1) + "T00:00:00+07:00") } } })), `${cBoss}`);
  const bossBoat = (await ag(boss, ymd(0), ymd(6))).items.find((i: AnyMod) => i.id === "kanban:calqc-card-boat");
  chk("S10-4", "การ์ดที่รับผิดชอบผ่าน KanbanCardAssignee แสดงใน agenda (MANAGER บอร์ดกลาง = VIEWER ติ๊กไม่ได้)", !!bossBoat && bossBoat.checkable === false);

  // ─────────────── S11 completeSourceItem ───────────────
  console.log("── S11: completeSourceItem ──");
  chk("S11-1", "การ์ดบอร์ดไม่มีคอลัมน์เสร็จ — ครูนิวเป็นผู้ดู (VIEWER) = FORBIDDEN (ไม่ย้าย)", (await agenda.completeSourceItem(staffNew, { source: "kanban", id: "calqc-card-nodone" })).code === "FORBIDDEN");
  chk("S11-2", "การ์ดของคนอื่น = NOT_FOUND · id ไม่มี = NOT_FOUND", (await agenda.completeSourceItem(owner, { source: "kanban", id: "calqc-card-tank" })).code === "NOT_FOUND" && (await agenda.completeSourceItem(owner, { source: "kanban", id: "nope" })).code === "NOT_FOUND");
  const STAMP = Date.now().toString(36);
  const c1 = await prisma.kanbanCard.create({ data: { id: `calqc13-card-${STAMP}`, tenantId: A, systemId: "calqc-sys-kanban", boardId: "calqc-kb-trip", columnId: "calqc-kc-trip-todo", cardNo: 9000 + Math.floor(Math.random() * 900), title: "การ์ดทดสอบ 1.3", assigneeUserId: U.owner, dueAt: T(0, 18), status: "ACTIVE" } });
  const c2 = await prisma.kanbanCard.create({ data: { id: `calqc13-card2-${STAMP}`, tenantId: A, systemId: "calqc-sys-kanban", boardId: "calqc-kb-nodone", columnId: "calqc-kc-nodone-todo", cardNo: 9900 + Math.floor(Math.random() * 90), title: "การ์ดทดสอบ 1.3 b", assigneeUserId: U.owner, dueAt: T(0, 18), status: "ACTIVE" } });
  cleanups.push(async () => {
    for (const id of [c1.id, c2.id]) {
      await prisma.kanbanUndoToken.deleteMany({ where: { tenantId: A, payload: { path: ["cardId"], equals: id } } }).catch(() => undefined);
      await prisma.kanbanCard.deleteMany({ where: { id } }).catch(() => undefined);
    }
  });
  const r1 = await agenda.completeSourceItem(owner, { source: "kanban", id: c1.id });
  const after1 = await prisma.kanbanCard.findUnique({ where: { id: c1.id }, select: { columnId: true, completedAt: true } });
  chk("S11-3", "การ์ดของเจ้าของ (ADMIN) → completeCard ย้ายเข้าคอลัมน์ \"เสร็จ\" · completedAt ตั้ง · ซ้ำได้", r1.ok === true && after1.columnId === "calqc-kc-trip-done" && after1.completedAt !== null && (await agenda.completeSourceItem(owner, { source: "kanban", id: c1.id })).ok === true, JSON.stringify({ r1, after1 }));
  chk("S11-4", "บอร์ดไม่มีคอลัมน์เสร็จ = NO_DONE_COLUMN (ไม่ย้าย)", (await agenda.completeSourceItem(owner, { source: "kanban", id: c2.id })).code === "NO_DONE_COLUMN" && (await prisma.kanbanCard.findUnique({ where: { id: c2.id } })).completedAt === null);
  chk("S11-5", "CRM: CALL ของครูนิว แต่ไม่มีคีย์ crm.activity.complete = FORBIDDEN · MEETING = NOT_FOUND · ของคนอื่น = NOT_FOUND", (await agenda.completeSourceItem(staffNew, { source: "crm", id: "calqc-crm-act-call" })).code === "FORBIDDEN" && (await agenda.completeSourceItem(owner, { source: "crm", id: "calqc-crm-act-meet" })).code === "NOT_FOUND" && (await agenda.completeSourceItem(owner, { source: "crm", id: "calqc-crm-act-call" })).code === "NOT_FOUND");
  const act = await prisma.crmActivity.create({ data: { id: `calqc13-act-${STAMP}`, tenantId: A, systemId: "calqc-sys-crm", contactId: "calqc-crm-contact-ek", type: "TASK", title: "งานทดสอบ 1.3", dueAt: T(0, 19), ownerUserId: U.owner } });
  cleanups.push(() => prisma.crmActivity.deleteMany({ where: { id: act.id } }));
  const r2 = await agenda.completeSourceItem(owner, { source: "crm", id: act.id });
  const actAfter = await prisma.crmActivity.findUnique({ where: { id: act.id }, select: { doneAt: true, completedById: true } });
  chk("S11-6", "TASK ของเจ้าของ → completeActivity · doneAt + completedById ตั้ง", r2.ok === true && actAfter.doneAt !== null && actAfter.completedById === U.owner, JSON.stringify({ r2, actAfter }));
  chk("S11-7", "kanban OFF = NOT_FOUND (ไม่แสดงในปฏิทินอยู่แล้ว)", await (async () => {
    await prisma.aiSystemAccess.upsert({ where: { tenantId_module: { tenantId: A, module: "kanban" } }, create: { tenantId: A, module: "kanban", level: "OFF", setById: U.owner }, update: { level: "OFF" } });
    try { return (await agenda.completeSourceItem(owner, { source: "kanban", id: c2.id })).code === "NOT_FOUND"; } finally { await prisma.aiSystemAccess.deleteMany({ where: { tenantId: A, module: "kanban" } }); }
  })());

  // ─────────────── S12 M3 / ข้อมูลส่วนตัว ───────────────
  console.log("── S12: M3 + ข้อมูลส่วนตัว ──");
  const src = readFileSync("src/lib/modules/calendar/agenda.ts", "utf8");
  const calQueries = [...src.matchAll(/\.cal(Item|Pref|Link|ExternalEvent)\.\w+\(\{\s*where:\s*\{([^}]*)/g)];
  chk("S12-1", `ทุก query ตาราง Cal* มี userId: actor.userId ตรงตัวใน where (${calQueries.length} จุด) · ไม่มี prisma ดิบ · ไม่มีพารามิเตอร์ userId ใน export`, calQueries.length >= 5 && calQueries.every((m) => /userId: (c\.)?actor\.userId/.test(m[2]!)) && !/from "@\/lib\/core\/db";[\s\S]*\bprisma\b\./.test(src.replace(/tenantDb/g, "")) && !/export async function \w+\([^)]*\buserId\b/.test(src), calQueries.map((m) => m[2]).join(" | "));
  const all = [...o.items, ...n.items, ...b.items, ...ob.items];
  chk("S12-2", "ไม่มีเบอร์โทร/อีเมลลูกค้าใน title/sub ของทุกแถว", !all.some((i: AnyMod) => /0800000000|\d{3}-?\d{3}-?\d{4}|@/.test(`${i.title} ${i.sub ?? ""}`)));
  chk("S12-3", "deepLink web ผ่าน OPEN_PATH_RE ของแอปทุกแถว", all.filter((i: AnyMod) => i.deepLink?.kind === "web").every((i: AnyMod) => /^\/app(\/[A-Za-z0-9_\-%/]*)?(\?[A-Za-z0-9_=&\-%]*)?$/.test(i.deepLink.path)), JSON.stringify(all.filter((i: AnyMod) => i.deepLink?.kind === "web" && !/^\/app(\/[A-Za-z0-9_\-%/]*)?(\?[A-Za-z0-9_=&\-%]*)?$/.test(i.deepLink.path)).map((i: AnyMod) => i.deepLink.path)));
  chk("S12-4", "ช่วง > 42 วัน / รูปผิด = CalError 400 ไทย · TRIPS ปิด", (await agenda.agendaFor(owner, { from: ymd(0), to: ymd(42) }).then(() => false, (e: AnyMod) => e?.status === 400 && /42 วัน/.test(e.message))) && agenda.TRIPS_ADAPTER_ENABLED === false);
  chk("S12-5", "id ไม่ซ้ำในผลลัพธ์", new Set(wide.items.map((i: AnyMod) => i.id)).size === wide.items.length);
} catch (e) {
  chk("X", "ไม่โยนระหว่างข้อสอบ", false, errMsg(e) + " " + (e instanceof Error ? e.stack?.split("\n").slice(1, 4).join(" ") : ""));
} finally {
  for (const f of cleanups.reverse()) await f().catch(() => undefined);
  await prisma.appSystem.updateMany({ where: { id: "calqc-sys-kanban" }, data: { active: true } }).catch(() => undefined);
}
finish(LABEL);
