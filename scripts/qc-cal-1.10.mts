// QC — Q8 เผื่อเวลาเดินทาง (สัญญา §16 · มติเจ้าของ Q8: ถาม → จำต่อประเภท → เสนอ + ยืนยันทุกครั้ง)
//   P  travel.ts บริสุทธิ์ (ask/propose/0 นาที/ปัดทิ้ง/ช่องว่าง/ข้ามวัน/เวลาผ่านแล้ว/ประเภท+ป้าย/typeKey)
//   R  route: 401 · ของคนอื่นไม่เห็น/ยืนยันไม่ได้ · confirm สร้างเตือน SUGGEST จากเวลาเซิร์ฟเวอร์ + จำกฎ · ครั้งต่อไป propose · dismiss · rules GET/PUT/DELETE · strict · agenda.travel
//   A  เครื่องมือ AI: calendar_add EVENT / calendar_agenda → การ์ด TRAVEL (วันอย่างเดียว · ไม่มีชื่อ/เวลา) · ไม่มีทางยืนยันแทน · persona
//   D  ข้อมูลส่วนตัว: PERSONAL_MODELS · purgeMemberCalendar · deleteUserTraces
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-1.10.mts  (PURE_ONLY=1 = ส่วน P)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chk, errMsg, finish, guard, makeFixture, thai, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.10";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PURE_ONLY = process.env.PURE_ONLY === "1";
if (!PURE_ONLY) guard(LABEL);
const tv = (await import("@/lib/modules/calendar/travel")) as AnyMod;

const T = (hm: string, day = "2026-11-17") => new Date(`${day}T${hm}:00+07:00`).toISOString();
const it = (id: string, source: string, s: string, e: string | null, o: AnyMod = {}) => ({ id, source, title: o.title ?? id, sub: null, label: "", startAt: T(s, o.day), ...(e ? { endAt: T(e, o.day) } : {}), allDay: !!o.allDay, timeHint: null, deepLink: null, checkable: false, done: !!o.done, mine: o.mine ?? true, colorKey: "personal" });
const NOW = new Date(T("08:00"));
const pk = (a: string, b: string) => createHash("sha1").update(`travel|${a}|${b}`).digest("hex");

console.log("── P: travelSuggestions ──");
{
  const a = it("booking:1", "booking", "11:00", "12:00", { title: "Open Water ที่สระ" });
  const b = it("event:2", "event", "13:00", "14:00", { title: "ประชุมธนาคาร" });
  const r = tv.travelSuggestions([b, a], [], [], NOW);
  const s = r[0];
  chk("P1", "ไม่มีกฎ + ห่าง 60 น. = ask (ข้อความจอ q8-1 · ชิป 0/15/30/45 · pairKey sha1)", r.length === 1 && s.mode === "ask" && s.typeKey === "event" && s.typeLabel === "นัดส่วนตัวนอกร้าน" && s.title === "ต้องเผื่อเวลาเดินทางไหมครับ?" && s.sub === "นัดก่อนหน้า: Open Water ที่สระ เลิก 12:00 → นัดนี้ 13:00" && s.minutes === null && s.leaveAt === null && s.badge === null && JSON.stringify(s.options) === "[0,15,30,45]" && s.gapMinutes === 60 && s.pairKey === pk("booking:1", "event:2") && s.prevEndAt === T("12:00") && s.nextStartAt === T("13:00"), JSON.stringify(s));
  const p = tv.travelSuggestions([a, b], [{ typeKey: "event", minutes: 45 }], [], NOW)[0];
  chk("P2", "จำ 45 นาที = propose · leaveAt 12:15 · ข้อความจอ q8-2 · ป้าย จำจากครั้งก่อน", p?.mode === "propose" && p.minutes === 45 && p.leaveAt === T("12:15") && p.title === "⏱ นัดส่วนตัวนอกร้าน — คุณเคยเผื่อ 45 นาที" && p.sub === "ประชุมธนาคาร 13:00 · นัดก่อนหน้าเลิก 12:00\nให้เตือนออกเดินทาง 12:15 เหมือนเดิมไหมครับ?" && p.badge === "จำจากครั้งก่อน", JSON.stringify(p));
  chk("P3", "จำ 0 นาที (ไม่ต้องเผื่อ) = ไม่มีข้อเสนอ · ปัดทิ้งคู่นี้ = ไม่มี", tv.travelSuggestions([a, b], [{ typeKey: "event", minutes: 0 }], [], NOW).length === 0 && tv.travelSuggestions([a, b], [], [pk("booking:1", "event:2")], NOW).length === 0);
  const far = it("event:3", "event", "14:01", "15:00");
  const at120 = it("event:4", "event", "14:00", "15:00");
  chk("P4", "ห่าง 121 น. = ไม่ใกล้ · 120 พอดี = ใกล้ · ทับกัน = ไม่ใช่ Q8 (นัดชน) · ข้ามวัน = ไม่คู่", tv.travelSuggestions([it("p", "event", "11:00", "12:00"), far], [], [], NOW).length === 0 && tv.travelSuggestions([it("p", "event", "11:00", "12:00"), at120], [], [], NOW).length === 1 && tv.travelSuggestions([it("p", "event", "11:00", "13:30"), b], [], [], NOW).length === 0 && tv.travelSuggestions([it("p", "event", "23:00", "23:59", { day: "2026-11-16" }), it("q", "event", "00:30", "01:00")], [], [], NOW).length === 0);
  chk("P5", "ask: นัดเริ่มแล้ว = ไม่ถาม · propose: เวลาออกผ่านแล้ว = ไม่เสนอ", tv.travelSuggestions([a, b], [], [], new Date(T("13:00"))).length === 0 && tv.travelSuggestions([a, b], [{ typeKey: "event", minutes: 45 }], [], new Date(T("12:15"))).length === 0 && tv.travelSuggestions([a, b], [{ typeKey: "event", minutes: 45 }], [], new Date(T("12:14"))).length === 1);
  const noise = [it("r", "reminder", "12:30", null), it("k", "kanban", "12:30", "12:40"), it("ad", "event", "12:30", "12:40", { allDay: true }), it("dn", "event", "12:30", "12:40", { done: true }), it("nm", "booking", "12:30", "12:40", { mine: false }), { ...it("bad", "event", "12:30", "12:40"), startAt: "x" }];
  const rn = tv.travelSuggestions([a, ...noise, b], [], [], NOW);
  chk("P6", "เตือน/การ์ด/ทั้งวัน/เสร็จ/ไม่ใช่ของฉัน/วันเสีย ไม่เป็นทั้งต้นและปลาย (คู่ a→b ยังติดกัน)", rn.length === 1 && rn[0].prevId === "booking:1" && rn[0].nextId === "event:2");
  const noEnd = tv.travelSuggestions([it("c", "crm", "12:00", null), b], [], [], NOW);
  chk("P7", "ไม่มี endAt = เลิก = เริ่ม · CRM ป้าย", noEnd[0]?.gapMinutes === 60 && tv.travelSuggestions([a, it("c", "crm", "13:00", null)], [], [], NOW)[0]?.typeLabel === "นัดลูกค้า · CRM" && tv.travelSuggestions([it("e", "event", "11:00", "12:00"), it("bk", "booking", "13:00", "14:00")], [], [], NOW)[0]?.typeLabel === "นัดลูกค้า · บัตรคิว");
  const g = it("google:x1", "google", "13:00", "14:00");
  const d = it("device:y1", "device", "13:00", "14:00");
  chk("P8", "google/device ต้องรู้ปฏิทิน (ไม่รู้ = ข้าม) · typeKey google:<id> · ป้าย Google/iPhone · <ชื่อ>", tv.travelSuggestions([a, g], [], [], NOW).length === 0 && tv.travelSuggestions([a, g], [], [], NOW, { calendarOf: { "google:x1": { calendarId: "home@x", name: "งานบ้าน" } } })[0]?.typeKey === "google:home@x" && tv.travelSuggestions([a, g], [], [], NOW, { calendarOf: { "google:x1": { calendarId: "home@x", name: "งานบ้าน" } } })[0]?.typeLabel === "นัดจาก Google · งานบ้าน" && tv.travelSuggestions([a, d], [{ typeKey: "device:c9", minutes: 20 }], [], NOW, { calendarOf: { "device:y1": { calendarId: "c9", name: "" } } })[0]?.typeLabel === "นัดจาก iPhone · ปฏิทิน");
  const multi = tv.travelSuggestions([it("m1", "event", "09:00", "10:00"), it("m2", "event", "10:30", "11:00"), it("m3", "event", "11:00", "12:00"), it("m3b", "event", "11:00", "12:00")], [], [], NOW);
  chk("P9", "หลายคู่: เรียงตามเวลาปลาย · เริ่มพร้อมกันเรียง id (m3 ก่อน m3b — ทับกันไม่เสนอ)", multi.length === 2 && multi[0].nextId === "m2" && multi[1].nextId === "m3");
  const zr = [it("z0", "event", "09:00", "09:30"), it("zb", "event", "10:00", null), it("za", "event", "10:00", null), it("za", "event", "10:00", null)];
  const z1 = tv.travelSuggestions(zr, [], [], NOW);
  const z2 = tv.travelSuggestions([...zr].reverse(), [], [], NOW);
  chk("P9-2", "นัดไม่มีเวลาเลิกเริ่มพร้อมกัน/id ซ้ำ: ลำดับคงที่ไม่ขึ้นกับลำดับเข้า · เวลาปลายเท่ากันเรียง pairKey", JSON.stringify(z1.map((x: AnyMod) => x.pairKey)) === JSON.stringify(z2.map((x: AnyMod) => x.pairKey)) && z1.length >= 2 && z1.every((x: AnyMod, i: number, a: AnyMod[]) => i === 0 || a[i - 1].nextStartAt < x.nextStartAt || (a[i - 1].nextStartAt === x.nextStartAt && a[i - 1].pairKey <= x.pairKey)), JSON.stringify(z1.map((x: AnyMod) => [x.prevId, x.nextId])));
  chk("P10", "travelTypeLabel ทุกชนิด · isTravelTypeKey", tv.travelTypeLabel("event").label === "นัดส่วนตัวนอกร้าน" && tv.travelTypeLabel("booking").sub === "นัดในร้าน" && tv.travelTypeLabel("crm").label === "นัดลูกค้า · CRM" && tv.travelTypeLabel("google:a", "นัดจาก Google · งานบ้าน").label === "นัดจาก Google · งานบ้าน" && tv.travelTypeLabel("google:a").label === "นัดจาก Google" && tv.travelTypeLabel("device:a").label === "นัดจาก iPhone" && tv.travelTypeLabel("zzz").label === "zzz" && tv.isTravelTypeKey("event") && tv.isTravelTypeKey("google:abc@group.calendar.google.com") && !tv.isTravelTypeKey("foo") && !tv.isTravelTypeKey("google:") && !tv.isTravelTypeKey("google:a b"));
  chk("P11", "travelTypeOf: reminder = null", tv.travelTypeOf(it("r", "reminder", "10:00", null)) === null);
}
if (PURE_ONLY) finish(LABEL, { pureOnly: true });

// ═══════════ R/A/D: ฐาน QC ═══════════
const { prisma } = (await import("@/lib/core/db")) as AnyMod;
const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const tc = (await import("@/lib/ai/tools-calendar")) as AnyMod;
const fx = await makeFixture(prisma, "qccal110", { a: { role: "OWNER" }, b: { role: "STAFF", permissions: { "ai.chat.send": true } } });
const [tid] = fx.tids;
const mods: Record<string, AnyMod> = {};
const route = async (p: string) => (mods[p] ??= (await import(`@/app/api/mobile/secretary/${p}/route`)) as AnyMod);
async function call(p: string, method: string, o: { body?: unknown; h?: Record<string, string>; q?: string; params?: Record<string, string> } = {}) {
  const m = await route(p);
  const init: RequestInit = { method, headers: { "content-type": "application/json", ...(o.h ?? {}) } };
  if (method !== "GET" && method !== "DELETE" && o.body !== undefined) init.body = JSON.stringify(o.body);
  const res: Response = await m[method](new Request(`http://qc.local/api/mobile/secretary/${p}${o.q ? `?${o.q}` : ""}`, init), { params: Promise.resolve(o.params ?? {}) });
  const text = await res.text();
  let body: AnyMod = {};
  try { body = JSON.parse(text); } catch { body = { text }; }
  return { status: res.status, body };
}
let residue = -1;
try {
  const tok = async (u: string) => (await auth.issueMobileToken(u)).token;
  const HA = { authorization: `Bearer ${await tok(fx.U.a)}`, "x-tenant-id": tid };
  const HB = { authorization: `Bearer ${await tok(fx.U.b)}`, "x-tenant-id": tid };
  // วันพรุ่งนี้ (ไทย) — นัดทั้งหมดอยู่ในอนาคตเสมอ
  const BKK = 7 * 3_600_000;
  const day = new Date(Date.now() + BKK + 86_400_000).toISOString().slice(0, 10);
  const at = (hm: string) => new Date(`${day}T${hm}:00+07:00`).toISOString();
  const mk = async (h: Record<string, string>, title: string, s: string, e: string) => (await call("calendar/items", "POST", { h, body: { kind: "EVENT", title, startAt: at(s), endAt: at(e) } })).body.item;
  const e1 = await mk(HA, "สอน Open Water", "11:00", "12:00");
  const e2 = await mk(HA, "ประชุมธนาคาร", "13:00", "14:00");

  console.log("── R1: 401 + ของคนอื่น ──");
  const un: string[] = [];
  for (const [p, m, params] of [["calendar/travel", "GET"], ["calendar/travel/confirm", "POST"], ["calendar/travel/dismiss", "POST"], ["calendar/travel/rules", "GET"], ["calendar/travel/rules/[typeKey]", "PUT", { typeKey: "event" }], ["calendar/travel/rules/[typeKey]", "DELETE", { typeKey: "event" }]] as [string, string, Record<string, string>?][]) {
    const r = await call(p, m, { h: { "x-tenant-id": tid }, body: {}, q: `day=${day}`, params });
    if (r.status !== 401 || !thai(r.body.message)) un.push(`${m} ${p}=${r.status}`);
  }
  chk("R1-1", "ไม่ล็อกอิน = 401 ไทย ทุกเส้น", un.length === 0, un.join(","));
  const ga = await call("calendar/travel", "GET", { h: HA, q: `day=${day}` });
  const s1 = ga.body.suggestions?.[0];
  chk("R1-2", "GET travel (A) = ask ของคู่ e1→e2", ga.status === 200 && ga.body.day === day && ga.body.suggestions.length === 1 && s1.mode === "ask" && s1.nextId === `event:${e2.id}` && s1.prevId === `event:${e1.id}`, JSON.stringify(ga.body).slice(0, 300));
  const gb = await call("calendar/travel", "GET", { h: HB, q: `day=${day}` });
  const cb = await call("calendar/travel/confirm", "POST", { h: HB, body: { pairKey: s1.pairKey, day, minutes: 45, remember: true } });
  chk("R1-3", "B ไม่เห็นข้อเสนอของ A · ยืนยันคู่ของ A = 404 ไทย", gb.status === 200 && gb.body.suggestions.length === 0 && cb.status === 404 && cb.body.message === "ไม่พบนัดคู่นี้แล้ว — ลองดึงปฏิทินใหม่");
  const bd = await call("calendar/travel", "GET", { h: HA, q: "day=2026-02-30" });
  chk("R1-4", "วันผิด = 400 'วันไม่ถูกต้อง'", bd.status === 400 && bd.body.message === "วันไม่ถูกต้อง");

  console.log("── R2: confirm ──");
  const st = await call("calendar/travel/confirm", "POST", { h: HA, body: { pairKey: s1.pairKey, day, minutes: 45, remember: true, leaveAt: at("09:00") } });
  const big = await call("calendar/travel/confirm", "POST", { h: HA, body: { pairKey: s1.pairKey, day, minutes: 300, remember: true } });
  const nf = await call("calendar/travel/confirm", "POST", { h: HA, body: { pairKey: "0".repeat(40), day, minutes: 45, remember: true } });
  chk("R2-1", "body strict (ส่ง leaveAt = 400) · นาที > 240 = 400 ไทย · pairKey ไม่มี = 404", st.status === 400 && big.status === 400 && thai(big.body.message) && nf.status === 404);
  const c1 = await call("calendar/travel/confirm", "POST", { h: HA, body: { pairKey: s1.pairKey, day, minutes: 45, remember: true } });
  const itm = c1.body.item;
  chk("R2-2", "ยืนยัน 45 + จำ: เตือน REMINDER source SUGGEST \"ออกเดินทางไป ประชุมธนาคาร\" เวลา 12:15 (เซิร์ฟเวอร์คำนวณ) · กฎ event 45", c1.status === 200 && itm?.kind === "REMINDER" && itm.source === "SUGGEST" && itm.title === "ออกเดินทางไป ประชุมธนาคาร" && itm.startAt === at("12:15") && c1.body.rule?.typeKey === "event" && c1.body.rule.minutes === 45 && c1.body.rule.label === "นัดส่วนตัวนอกร้าน", JSON.stringify(c1.body));
  const after = await call("calendar/travel", "GET", { h: HA, q: `day=${day}` });
  chk("R2-3", "ยืนยันแล้วไม่ถามคู่นี้ซ้ำ", after.body.suggestions.length === 0);

  console.log("── R3: ครั้งต่อไป = propose + ยืนยันทุกครั้ง ──");
  const e3 = await mk(HA, "ประชุมลูกค้า", "15:00", "16:00");
  const g3 = await call("calendar/travel", "GET", { h: HA, q: `day=${day}` });
  const p3 = g3.body.suggestions?.[0];
  const reminders = await prisma.calItem.count({ where: { userId: fx.U.a, tenantId: tid, kind: "REMINDER" } });
  chk("R3-1", "นัดใหม่ประเภทเดิม = propose 45 · leaveAt 14:15 · ยังไม่สร้างเตือนเอง (ต้องยืนยัน)", p3?.mode === "propose" && p3.minutes === 45 && p3.leaveAt === at("14:15") && p3.nextId === `event:${e3.id}` && reminders === 1, JSON.stringify(g3.body).slice(0, 300));
  const c3 = await call("calendar/travel/confirm", "POST", { h: HA, body: { pairKey: p3.pairKey, day, minutes: 30, remember: false } });
  const rules1 = await call("calendar/travel/rules", "GET", { h: HA });
  chk("R3-2", "\"เปลี่ยน…\" 30 นาทีไม่จำ = เตือน 14:30 · กฎยังเป็น 45", c3.body.item?.startAt === at("14:30") && c3.body.rule === null && rules1.body.rules?.[0]?.minutes === 45);

  console.log("── R4: dismiss ──");
  const e4 = await mk(HA, "รับของ", "17:00", "17:30");
  const g4 = (await call("calendar/travel", "GET", { h: HA, q: `day=${day}` })).body.suggestions[0];
  const d1 = await call("calendar/travel/dismiss", "POST", { h: HA, body: { pairKey: g4.pairKey, day } });
  const d2 = await call("calendar/travel/dismiss", "POST", { h: HA, body: { pairKey: g4.pairKey, day } });
  const g4b = await call("calendar/travel", "GET", { h: HA, q: `day=${day}` });
  const dB = await call("calendar/travel/dismiss", "POST", { h: HB, body: { pairKey: g4.pairKey, day } });
  chk("R4-1", "ข้าม = ไม่เสนอคู่นี้อีก · ซ้ำได้ · B ปัดคู่ของ A = 404", d1.status === 200 && d2.status === 200 && g4b.body.suggestions.length === 0 && dB.status === 404 && !!e4);

  console.log("── R5: rules ──");
  const enc = encodeURIComponent("device:cal-1");
  const pu = await call("calendar/travel/rules/[typeKey]", "PUT", { h: HA, params: { typeKey: enc }, body: { minutes: 20, label: "นัดจาก iPhone · งานบ้าน" } });
  const pbad = await call("calendar/travel/rules/[typeKey]", "PUT", { h: HA, params: { typeKey: "foo" }, body: { minutes: 20 } });
  const pmin = await call("calendar/travel/rules/[typeKey]", "PUT", { h: HA, params: { typeKey: "event" }, body: { minutes: -1 } });
  const pstr = await call("calendar/travel/rules/[typeKey]", "PUT", { h: HA, params: { typeKey: "event" }, body: { minutes: 10, userId: fx.U.b } });
  chk("R5-1", "PUT device:* = upsert ป้าย · typeKey ผิด/นาทีผิด/ส่ง userId = 400", pu.status === 200 && pu.body.rule?.typeKey === "device:cal-1" && pu.body.rule.label === "นัดจาก iPhone · งานบ้าน" && pu.body.rule.minutes === 20 && pbad.status === 400 && pmin.status === 400 && pstr.status === 400);
  const del = await call("calendar/travel/rules/[typeKey]", "DELETE", { h: HA, params: { typeKey: "event" } });
  const rl = await call("calendar/travel/rules", "GET", { h: HA });
  const rlB = await call("calendar/travel/rules", "GET", { h: HB });
  chk("R5-2", "DELETE event → เหลือ device · B ไม่เห็นกฎของ A", del.status === 200 && rl.body.rules.length === 1 && rl.body.rules[0].typeKey === "device:cal-1" && rlB.body.rules.length === 0);
  const e5 = await mk(HA, "นัดหลังลบกฎ", "18:30", "19:00");
  const g5 = (await call("calendar/travel", "GET", { h: HA, q: `day=${day}` })).body.suggestions.find((x: AnyMod) => x.nextId === `event:${e5.id}`);
  chk("R5-3", "ลบกฎแล้ว เลขาถามใหม่ (ask)", g5?.mode === "ask");

  console.log("── R6: agenda.travel ──");
  const ag = await call("calendar/agenda", "GET", { h: HA, q: `from=${day}` });
  chk("R6-1", "GET agenda มี travel[] · conflicts มีแต่ OVERLAP", ag.status === 200 && Array.isArray(ag.body.travel) && ag.body.travel.some((x: AnyMod) => x.nextId === `event:${e5.id}`) && ag.body.conflicts.every((c: AnyMod) => c.kind === "OVERLAP"));

  console.log("── A: เครื่องมือ AI ──");
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "ห้องทดสอบ Q8" } });
  const room = await prisma.aiRoom.create({ data: { conversationId: conv.id, tenantId: tid, startedById: fx.U.a, title: "ห้องทดสอบ Q8" } });
  const mA = await prisma.membership.findFirst({ where: { userId: fx.U.a, tenantId: tid } });
  const ctxA = { tenantId: tid, actor: { kind: "member", tenantId: tid, userId: fx.U.a, membership: { role: mA.role, unitAccess: mA.unitAccess, permissions: mA.permissions ?? {} } }, conversationId: conv.id };
  const add = tc.calendarTools().find((t: AnyMod) => t.def.name === "calendar_add");
  const agTool = tc.calendarTools().find((t: AnyMod) => t.def.name === "calendar_agenda");
  const raw = await add.execute(ctxA, { kind: "EVENT", title: "นัดคุณเอกที่ธนาคารสินเชื่อเรือ", whenISO: `${day}T20:00:00+07:00`, endISO: `${day}T21:00:00+07:00` });
  const r = JSON.parse(raw);
  const cards = await prisma.calRoomCard.findMany({ where: { roomId: room.id, userId: fx.U.a } });
  chk("A1", "calendar_add EVENT ใกล้นัดอื่น → travel {day,count,card} · การ์ด TRAVEL วันนั้น · next บอก \"นัดนี้ใกล้นัดอื่น ดูการ์ดด้านล่าง\" + ห้ามยืนยันแทน", r.ok === true && r.travel?.day === day && r.travel.count >= 1 && r.travel.card === "travel" && cards.some((c: AnyMod) => c.kind === "TRAVEL" && c.fromDay === day) && r.next.includes("นัดนี้ใกล้นัดอื่น ดูการ์ดด้านล่าง") && r.next.includes("ห้ามตั้งเตือนออกเดินทางเอง"), raw.slice(0, 400));
  chk("A2", "ผลถึงโมเดลไม่มีชื่อ/เวลา (review b B1)", !raw.includes("ธนาคาร") && !raw.includes("ประชุม") && !raw.includes("20:00") && !raw.includes("19:00"));
  const remindersBefore = await prisma.calItem.count({ where: { userId: fx.U.a, tenantId: tid, source: "SUGGEST" } });
  chk("A3", "เครื่องมือไม่สร้างเตือนออกเดินทางเอง (SUGGEST ไม่เพิ่ม)", remindersBefore === 2);
  const rawAg = await agTool.execute(ctxA, { fromDate: day });
  const ra = JSON.parse(rawAg);
  chk("A4", "calendar_agenda → travel {days,count,card} + next · ไม่มีชื่อ", ra.ok === true && ra.travel?.count >= 1 && ra.travel.card === "travel" && ra.next.includes("นัดนี้ใกล้นัดอื่น") && !rawAg.includes("ธนาคาร"), rawAg.slice(0, 300));
  const names = tc.calendarTools().map((t: AnyMod) => t.def.name);
  const persona = readFileSync(join(ROOT, "src/lib/ai/persona.ts"), "utf8");
  chk("A5", "ไม่มีเครื่องมือยืนยันเผื่อเวลาเดินทาง · persona ห้ามตั้งเอง/ยืนยันแทน", !names.some((n: string) => /travel/.test(n)) && persona.includes("นัดนี้ใกล้นัดอื่น ดูการ์ดด้านล่าง") && persona.includes("ห้ามสร้างเตือนออกเดินทางเองด้วย calendar_add"));
  const rr = await call("rooms/[id]", "GET", { h: HA, params: { id: room.id } });
  chk("A6", "GET rooms/[id] ส่งการ์ด TRAVEL ให้เจ้าของ", rr.status === 200 && JSON.stringify(rr.body).includes("\"TRAVEL\""), JSON.stringify(rr.body).slice(0, 200));

  console.log("── D: ข้อมูลส่วนตัว ──");
  const pdpa = (await import("@/lib/platform/pdpa")) as AnyMod;
  chk("D1", "PERSONAL_MODELS มี CalTravelRule/CalTravelDismissal", pdpa.PERSONAL_MODELS.includes("CalTravelRule") && pdpa.PERSONAL_MODELS.includes("CalTravelDismissal"));
  const ad = readFileSync(join(ROOT, "src/lib/platform/account-deletion.ts"), "utf8");
  chk("D2", "deleteUserTraces ลบ 2 ตาราง", /calTravelRule\.deleteMany\(\{ where: \{ userId \} \}\)/.test(ad) && /calTravelDismissal\.deleteMany\(\{ where: \{ userId \} \}\)/.test(ad));
  const items = (await import("@/lib/modules/calendar/items")) as AnyMod;
  await items.purgeMemberCalendar({ userId: fx.U.a, tenantId: tid });
  chk("D3", "purgeMemberCalendar (removeStaff/เว็บถอนสิทธิ์) ลบกฎ+การปัดทิ้ง", (await prisma.calTravelRule.count({ where: { userId: fx.U.a } })) === 0 && (await prisma.calTravelDismissal.count({ where: { userId: fx.U.a } })) === 0);
} catch (e) {
  console.log(e);
  chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally {
  for (const m of ["calTravelRule", "calTravelDismissal", "calRoomCard"]) { try { await prisma[m].deleteMany({ where: { userId: { in: Object.values(fx.U) } } }); } catch { /* */ } }
  residue = await fx.cleanup();
}
chk("Z-1", "residue 0", residue === 0, String(residue));
await prisma.$disconnect().catch(() => undefined);
finish(LABEL, { residue });
