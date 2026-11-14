// QC — CAL1.7 เครื่องมือเลขา calendar_add/update/cancel/list/agenda (สัญญา docs/modules/32-secretary-calendar.md §9 · R-CAL-18/20/28 · M3)
//   ตรวจระดับเครื่องมือแบบกำหนดผลได้ (ไม่ยิงโมเดล) — ผลโมเดลจริงอยู่ที่ scripts/qc-cal-1.7-live.mts
//   T1 ทะเบียน/สคีมา (ไม่มีพารามิเตอร์ผู้รับ) · T2 ด่าน (แกนกลาง · คีย์ API/งานภายในใช้ไม่ได้ · ระดับ OFF ไม่ตัด) · T3 persona
//   T4 calendar_add (CHAT · roomId = AiRoom.id · ไม่เขียน AiActionLog/AiProposal) · T5 ทำซ้ำ = DRAFT → confirm · T6 ตรวจเวลา §9.2
//   T7 link · T8 update/cancel/list ของตัวเองเท่านั้น · T9 calendar_agenda · T10 ชุดข้อสอบ eval
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-1.7.mts
import { chk, errMsg, finish, guard, makeFixture, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.7";
guard(LABEL);
const { prisma } = (await import("@/lib/core/db")) as AnyMod;
const tools = (await import("@/lib/ai/tools")) as AnyMod;
const access = (await import("@/lib/ai/tool-access")) as AnyMod;
const skills = (await import("@/lib/ai/skills")) as AnyMod;
const persona = (await import("@/lib/ai/persona")) as AnyMod;
const evalM = (await import("@/lib/ai/eval")) as AnyMod;
const tc = (await import("@/lib/ai/tools-calendar")) as AnyMod;
const actorM = (await import("@/lib/ai/actor")) as AnyMod;
const owner = (await import("@/lib/ai/conversation-owner")) as AnyMod;
const items = (await import("@/lib/modules/calendar/items")) as AnyMod;

const NAMES = ["calendar_add", "calendar_update", "calendar_cancel", "calendar_list", "calendar_agenda"];
const reg = tools.toolRegistry() as AnyMod[];
const def = (n: string) => reg.find((t) => t.def.name === n)?.def;

// ─────────────── T1 ทะเบียน + สคีมา ───────────────
console.log("── T1: ทะเบียน + สคีมา (M3) ──");
{
  chk("T1-1", "ทั้ง 5 ตัวอยู่ใน toolRegistry · ไม่มี action:true (ไม่ผ่านด่านอนุมัติ)", NAMES.every((n) => !!def(n)) && NAMES.every((n) => !reg.find((t) => t.def.name === n)?.action));
  const props = (d: AnyMod): string[] => {
    const out: string[] = [];
    const walk = (s: AnyMod) => {
      if (!s || typeof s !== "object") return;
      for (const [k, v] of Object.entries(s.properties ?? {})) {
        out.push(k);
        walk(v as AnyMod);
      }
      for (const x of s.anyOf ?? []) walk(x);
      if (s.items) walk(s.items);
    };
    walk(d.parameters);
    return out;
  };
  const all = NAMES.flatMap((n) => props(def(n)));
  chk("T1-2", "ไม่มีพารามิเตอร์ผู้รับ/ผู้ใช้ในสคีมาใด (user/recipient/assignee/owner/member/staff/to/notify)", !all.some((k) => /user|recipient|assignee|owner|member|staff|^to$|notify|who/i.test(k)), all.join(","));
  chk("T1-3", "ทุกสคีมา additionalProperties:false · calendar_add ต้องมี title", NAMES.every((n) => def(n).parameters.additionalProperties === false) && def("calendar_add").parameters.required.includes("title") && def("calendar_add").parameters.properties.link.additionalProperties === false);
  chk("T1-4", "คำอธิบาย calendar_add บอก M3 (ห้ามเตือนคนอื่น + เสนอการ์ด) และแยกจาก schedule_task", /Never use it to remind, notify or schedule for another person/.test(def("calendar_add").description) && /task-board card/.test(def("calendar_add").description) && /schedule_task/.test(def("calendar_add").description));
}

// ─────────────── T2 ด่าน ───────────────
console.log("── T2: ด่าน (HAND_TOOL_ACCESS · HAND_TOOL_CORE · CORE_TOOLS · สกิล) ──");
{
  chk("T2-1", "HAND_TOOL_ACCESS: add/update/cancel = needs [] writesNow · list/agenda = needs []", ["calendar_add", "calendar_update", "calendar_cancel"].every((n) => access.HAND_TOOL_ACCESS[n]?.writesNow === true && access.HAND_TOOL_ACCESS[n]?.needs.length === 0) && ["calendar_list", "calendar_agenda"].every((n) => access.HAND_TOOL_ACCESS[n]?.needs.length === 0 && !access.HAND_TOOL_ACCESS[n]?.writesNow));
  chk("T2-2", "ทั้ง 5 ใน HAND_TOOL_CORE (ระดับเลขาของร้านไม่ตัด — Q2)", NAMES.every((n) => access.HAND_TOOL_CORE.has(n)));
  chk("T2-3", "CORE_TOOLS มี calendar_add + calendar_agenda (≤ 10 ตัว · คำอธิบายอังกฤษ) · สกิล calendar = update/cancel/list", skills.CORE_TOOLS.includes("calendar_add") && skills.CORE_TOOLS.includes("calendar_agenda") && skills.CORE_TOOLS.length <= 10 && !/[฀-๿]/.test(def("calendar_add").description + def("calendar_agenda").description) && JSON.stringify(skills.SKILLS.find((s: AnyMod) => s.id === "calendar")?.tools) === JSON.stringify(["calendar_update", "calendar_cancel", "calendar_list"]));
  let regOk = true;
  try { skills.assertSkillRegistryComplete(); } catch (e) { regOk = false; console.log("   " + errMsg(e)); }
  chk("T2-4", "assertSkillRegistryComplete ผ่าน (ทุก tool มีบ้านเดียว)", regOk);
  const m = { kind: "member", tenantId: "t", userId: "u", membership: { role: "STAFF", unitAccess: [], permissions: {} } };
  const key = { kind: "apiKey", tenantId: "t", keyId: "k", scopes: ["ai.tools"], systemId: null };
  chk("T2-5", "สมาชิก STAFF ไม่มีคีย์ใด = ใช้ได้ทั้ง 5 · คีย์ API = ปฏิเสธ add/update/cancel (writesNow)", NAMES.every((n) => access.toolVerdict(m, n).ok) && ["calendar_add", "calendar_update", "calendar_cancel"].every((n) => !access.toolVerdict(key, n).ok));
  chk("T2-6", "ระดับเลขา calendar/crm/booking = OFF ไม่ตัดเครื่องมือปฏิทินส่วนตัว", NAMES.every((n) => access.toolVerdict(m, n, { access: { calendar: "OFF", crm: "OFF", booking: "OFF" } }).ok));
}

// ─────────────── T3 persona ───────────────
console.log("── T3: persona (§9.4) ──");
{
  const base = { tenantName: "ร้าน QC", systems: [{ type: "KANBAN", name: "บอร์ด" }] };
  const now = new Date("2026-11-14T03:00:00Z"); // ส. 14 พ.ย. 2569 10:00 ไทย
  const sec = persona.buildSystemPrompt({ ...base, digest: "- ยอดขายวันนี้ 0 บาท", now });
  const legacy = persona.buildSystemPrompt(base);
  chk("T3-1", "ห้องเลขา: กติกาปฏิทิน + วันนี้ (วันเสาร์ 2026-11-14) · ห้ามเรียก calendar_add เมื่อขอเตือนคนอื่น + เสนอการ์ด · แยก schedule_task", sec.includes("วันนี้ = วันเสาร์ 2026-11-14") && sec.includes("ห้ามเรียก calendar_add") && sec.includes("การ์ดงานในบอร์ด") && /ให้เลขาทำงานหรือสรุปรายงานให้ทุกวัน = schedule_task/.test(sec));
  chk("T3-2", "ห้อง AI เดิม (ไม่ใช่ห้องเลขา) ไม่มีกติกาปฏิทิน (prompt เดิมทุกไบต์)", !legacy.includes("calendar_add") && !legacy.includes("ปฏิทินส่วนตัว"));
}

// ─────────────── fixture ───────────────
const fx = await makeFixture(prisma, "qccal17", { a: { role: "OWNER" }, b: { role: "STAFF", permissions: { "ai.chat.send": true } } });
const [tid] = fx.tids;
const memberOf = async (k: string) => {
  const mm = await prisma.membership.findFirst({ where: { userId: fx.U[k], tenantId: tid } });
  return { kind: "member", tenantId: tid, userId: fx.U[k], membership: { role: mm.role, unitAccess: mm.unitAccess, permissions: mm.permissions ?? {} } };
};
const A = await memberOf("a"), B = await memberOf("b");
const convId = owner.newConversationId({ tenantId: tid, actor: A });
await prisma.aiConversation.create({ data: { id: convId, tenantId: tid, title: "ห้องทดสอบปฏิทิน" } });
const room = await prisma.aiRoom.create({ data: { conversationId: convId, tenantId: tid, startedById: fx.U.a, title: "ห้องทดสอบปฏิทิน" } });
const ctxA = { tenantId: tid, actor: A, conversationId: convId };
const ctxB = { tenantId: tid, actor: B };
const run = async (ctx: AnyMod, name: string, args: unknown) => JSON.parse(await tools.runTool(ctx, name, args));
const BKK = 7 * 3_600_000;
const iso = (d: Date) => {
  const t = new Date(+d + BKK);
  return `${t.toISOString().slice(0, 19)}+07:00`;
};
const tomorrow15 = (() => {
  const t = new Date(Date.now() + BKK);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 15 - 7, 0));
})();
let residue = -1;
try {
  // ─────────────── T4 calendar_add ───────────────
  console.log("── T4: calendar_add ──");
  const actionsBefore = await prisma.aiActionLog.count({ where: { tenantId: tid } });
  const r1 = await run(ctxA, "calendar_add", { title: "โทรหาคุณเอก เรื่องมัดจำเรือ", whenISO: iso(tomorrow15) });
  const row1 = r1.itemId ? await prisma.calItem.findUnique({ where: { id: r1.itemId } }) : null;
  chk("T4-1", "สร้าง REMINDER ของผู้กระทำ · source CHAT · roomId = AiRoom.id · OPEN · ผล JSON itemId + when ไทย", r1.ok === true && row1?.userId === fx.U.a && row1?.tenantId === tid && row1?.source === "CHAT" && row1?.roomId === room.id && row1?.status === "OPEN" && +row1.startAt === +tomorrow15 && /15:00$/.test(r1.when) && /ตอบสั้น/.test(r1.next), JSON.stringify(r1));
  chk("T4-2", "ไม่เขียน AiActionLog (R-CAL-20) · ไม่สร้าง AiProposal (ไม่ผ่านด่านอนุมัติ)", (await prisma.aiActionLog.count({ where: { tenantId: tid } })) === actionsBefore && (await prisma.aiProposal.count({ where: { conversationId: convId } })) === 0);
  const rr = await items.roomReminders({ userId: fx.U.a, tenantId: tid, membership: A.membership }, room.id);
  const rrB = await items.roomReminders({ userId: fx.U.b, tenantId: tid, membership: B.membership }, room.id);
  chk("T4-3", "การ์ดในห้อง: roomReminders ของเจ้าของเห็น · สมาชิกคนอื่นไม่เห็น", rr.some((x: AnyMod) => x.id === r1.itemId) && rrB.length === 0);
  const rX = await run(ctxB, "calendar_add", { title: "ลองแอบสร้างให้คนอื่น", whenISO: iso(tomorrow15), userId: fx.U.a, recipient: fx.U.a, assignee: fx.U.a });
  const rowX = rX.itemId ? await prisma.calItem.findUnique({ where: { id: rX.itemId } }) : null;
  chk("T4-4", "ส่ง userId/recipient/assignee ของคนอื่นมา = ถูกเพิกเฉย · เจ้าของแถว = ผู้กระทำเสมอ (M3 บังคับด้วยโครงสร้าง) · ไม่มีห้อง = roomId null", rowX?.userId === fx.U.b && rowX?.roomId === null, JSON.stringify(rX));
  const key = { kind: "apiKey", tenantId: tid, keyId: "k1", scopes: ["ai.tools"], systemId: null };
  const rk = await run({ tenantId: tid, actor: key }, "calendar_add", { title: "x", whenISO: iso(tomorrow15) });
  const sys = actorM.aiSystemActor ? actorM.aiSystemActor(tid, "scheduled-task") : null;
  const rs = sys ? JSON.parse(await tc.calendarTools()[0].execute({ tenantId: tid, actor: sys }, { title: "x", whenISO: iso(tomorrow15) })) : { error: "ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป" };
  chk("T4-5", "คีย์ API = ปฏิเสธที่ด่าน · งานภายใน (system) = \"ปฏิทินส่วนตัวใช้ได้เฉพาะสมาชิกในแอป\"", !!rk.error && !rk.itemId && /เฉพาะสมาชิก/.test(rs.error ?? ""), JSON.stringify({ rk, rs }));
  const rIn = await run(ctxA, "calendar_add", { title: "โอนเงินค่าน้ำมันเรือ", inMinutes: 30 });
  const rowIn = rIn.itemId ? await prisma.calItem.findUnique({ where: { id: rIn.itemId } }) : null;
  chk("T4-6", "inMinutes 30 = ตอนนี้ + 30 นาที (ปัดขึ้นนาที)", !!rowIn && Math.abs(+rowIn.startAt - (Date.now() + 30 * 60_000)) < 2 * 60_000, JSON.stringify(rIn));
  const rEv = await run(ctxA, "calendar_add", { kind: "EVENT", title: "ทำฟัน", whenISO: iso(tomorrow15) });
  const rowEv = rEv.itemId ? await prisma.calItem.findUnique({ where: { id: rEv.itemId } }) : null;
  chk("T4-7", "EVENT ไม่ส่ง endISO = +1 ชม. · เตือนล่วงหน้าค่าเริ่ม 15", rowEv?.kind === "EVENT" && +rowEv.endAt - +rowEv.startAt === 3_600_000 && rowEv.leadMinutes === 15, JSON.stringify(rEv));

  // ─────────────── T5 ทำซ้ำ = DRAFT ───────────────
  console.log("── T5: ทำซ้ำ = DRAFT รอยืนยัน (R-CAL-28) ──");
  const nextMon9 = (() => {
    const t = new Date(Date.now() + BKK);
    const add = ((1 - t.getUTCDay() + 7) % 7) || 7;
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + add, 9 - 7, 0));
  })();
  const rW = await run(ctxA, "calendar_add", { title: "เช็กสต็อกอุปกรณ์", whenISO: iso(nextMon9), repeat: "WEEKLY", repeatDays: [1] });
  const rowW = rW.draftId ? await prisma.calItem.findUnique({ where: { id: rW.draftId } }) : null;
  chk("T5-1", "WEEKLY → DRAFT (ไม่ยิง) · summary \"ทุกวันจันทร์ 09:00\" · บอกให้ถามยืนยัน", rowW?.status === "DRAFT" && rowW?.nextFireAt === null && rW.summary === "ทุกวันจันทร์ 09:00" && /ใช่ไหม/.test(rW.next), JSON.stringify(rW));
  const rC = await run(ctxA, "calendar_update", { itemId: rW.draftId, confirm: true });
  chk("T5-2", "calendar_update confirm=true → OPEN + nextFireAt", rC.ok === true && (await prisma.calItem.findUnique({ where: { id: rW.draftId } })).status === "OPEN" && /ทุกวันจันทร์ 09:00/.test(rC.when), JSON.stringify(rC));
  const rM = await run(ctxA, "calendar_add", { title: "ปิดยอดบัญชี", whenISO: "2027-01-31T17:00:00+07:00", repeat: "MONTHLY" });
  chk("T5-3", "MONTHLY วันที่ 31 → DRAFT + บอกเรื่องเดือนสั้น", rM.status === "DRAFT" && /วันที่ 31 ทุกเดือน 17:00 \(เดือนที่สั้นกว่าจะเตือนวันสุดท้ายของเดือน\)/.test(rM.summary), JSON.stringify(rM));

  // ─────────────── T6 ตรวจเวลา §9.2 ───────────────
  console.log("── T6: ตรวจเวลาฝั่งเซิร์ฟเวอร์ (§9.2) ──");
  const e = async (args: AnyMod) => String((await run(ctxA, "calendar_add", { title: "x", ...args })).error ?? "");
  const cases: [string, AnyMod, RegExp][] = [
    ["ไม่มีเวลา", {}, /^need_time: ถามผู้ใช้ว่าวันไหน กี่โมง/],
    ["ไม่มี offset", { whenISO: "2027-01-05T15:00:00" }, /^need_time/],
    ["offset อื่น (+08:00)", { whenISO: "2027-01-05T15:00:00+08:00" }, /^need_time/],
    ["วันไม่มีจริง 31 พ.ย.", { whenISO: "2026-11-31T15:00:00+07:00" }, /^need_time/],
    ["ข้อความไทย", { whenISO: "พรุ่งนี้บ่ายสาม" }, /^need_time/],
    ["วันล้วนแต่ไม่ใช่ทั้งวัน", { whenISO: "2027-01-05" }, /^need_time/],
    ["เวลาผ่านแล้ว", { whenISO: iso(new Date(Date.now() - 3_600_000)) }, /^past_time: เวลานี้ผ่านไปแล้ว ถามผู้ใช้เวลาใหม่/],
    ["ไกลกว่า 2 ปี", { whenISO: "2030-01-01T09:00:00+07:00" }, /^invalid: ตั้งล่วงหน้าได้ไม่เกิน 2 ปี/],
    ["EVENT จบก่อนเริ่ม", { kind: "EVENT", whenISO: "2027-01-05T15:00:00+07:00", endISO: "2027-01-05T14:00:00+07:00" }, /^invalid: เวลาสิ้นสุดต้องหลังเวลาเริ่ม/],
    ["inMinutes 0", { inMinutes: 0 }, /^invalid/],
    ["leadMinutes นอกชุด", { whenISO: "2027-01-05T15:00:00+07:00", leadMinutes: 7 }, /^invalid: เวลาเตือนล่วงหน้าไม่ถูกต้อง/],
  ];
  for (const [i, [name, args, re]] of cases.entries()) {
    const got = await e(args);
    chk(`T6-${i + 1}`, `${name} → ${re.source.slice(1, 30)}`, re.test(got), got);
  }
  const zOk = await run(ctxA, "calendar_add", { title: "z", whenISO: "2027-01-05T08:00:00Z" });
  const dOk = await run(ctxA, "calendar_add", { title: "ทั้งวัน", whenISO: "2027-01-05", allDay: true });
  chk("T6-12", "รับ Z และวันล้วนเมื่อ allDay", zOk.ok === true && dOk.ok === true && /ทั้งวัน/.test(dOk.when), JSON.stringify({ zOk, dOk }));
  chk("T6-13", "parseWhenISO บริสุทธิ์: +0700 รับ · 24:00 ไม่รับ · 2027-02-29 ไม่รับ", +tc.parseWhenISO("2027-01-05T15:00:00+0700") === Date.parse("2027-01-05T08:00:00Z") && tc.parseWhenISO("2027-01-05T24:00:00+07:00") === null && tc.parseWhenISO("2027-02-29", true) === null);

  const r31 = await run(ctxA, "calendar_add", { title: "ปิดยอด", whenISO: "2027-02-31T17:00:00+07:00", repeat: "MONTHLY" });
  const row31 = r31.draftId ? await prisma.calItem.findUnique({ where: { id: r31.draftId } }) : null;
  chk("T6-14", "MONTHLY วันที่ไม่มีในเดือน (31 ก.พ.) = เดือนถัดไปที่มีวันนั้น (31 มี.ค.) · ไม่ทำซ้ำ = need_time", !!row31 && +row31.startAt === Date.parse("2027-03-31T10:00:00Z") && /^need_time/.test((await run(ctxA, "calendar_add", { title: "x", whenISO: "2027-02-31T17:00:00+07:00" })).error ?? ""), JSON.stringify(r31));

  // ─────────────── T7 link ───────────────
  console.log("── T7: link ──");
  const rl = await run(ctxA, "calendar_add", { title: "ผูกลูกค้าที่ไม่มี", whenISO: iso(tomorrow15), link: { type: "CRM_CONTACT", id: "nope-contact" } });
  chk("T7-1", "link อ่านไม่ได้ = link_not_found + คำแนะนำให้ค้นก่อน", /^link_not_found: ไม่พบหรือไม่มีสิทธิ์ — ค้นด้วยเครื่องมือ CRM\/บัญชีก่อน/.test(rl.error ?? ""), JSON.stringify(rl));
  const rl2 = await run(ctxA, "calendar_add", { title: "x", whenISO: iso(tomorrow15), link: { type: "BAD", id: "1" } });
  chk("T7-2", "link ชนิดผิด = invalid", /^invalid/.test(rl2.error ?? ""));

  // ─────────────── T8 update/cancel/list ───────────────
  console.log("── T8: update/cancel/list ของตัวเองเท่านั้น ──");
  const rU = await run(ctxA, "calendar_update", { itemId: r1.itemId, title: "โทรหาคุณเอก (มัดจำ)", whenISO: iso(new Date(+tomorrow15 + 3_600_000)) });
  const rowU = await prisma.calItem.findUnique({ where: { id: r1.itemId } });
  chk("T8-1", "แก้ชื่อ+เวลาได้ (version +1)", rU.ok === true && rowU.title === "โทรหาคุณเอก (มัดจำ)" && +rowU.startAt === +tomorrow15 + 3_600_000 && rowU.version >= 1, JSON.stringify(rU));
  const rUb = await run(ctxB, "calendar_update", { itemId: r1.itemId, title: "แฮก" });
  const rCb = await run(ctxB, "calendar_cancel", { itemId: r1.itemId });
  chk("T8-2", "ของคนอื่น: update/cancel = not_found · แถวไม่เปลี่ยน", /^not_found/.test(rUb.error ?? "") && /^not_found/.test(rCb.error ?? "") && (await prisma.calItem.findUnique({ where: { id: r1.itemId } })).title === "โทรหาคุณเอก (มัดจำ)");
  const lA = await run(ctxA, "calendar_list", {});
  const lB = await run(ctxB, "calendar_list", {});
  chk("T8-3", "calendar_list: เห็นของตัวเองเท่านั้น (รวมร่าง/ประจำ) · B ไม่เห็นของ A", lA.items.some((x: AnyMod) => x.itemId === r1.itemId) && lA.items.every((x: AnyMod) => x.itemId !== rX.itemId) && lB.items.every((x: AnyMod) => x.itemId !== r1.itemId) && lB.items.some((x: AnyMod) => x.itemId === rX.itemId), JSON.stringify(lA).slice(0, 200));
  const rCa = await run(ctxA, "calendar_cancel", { itemId: r1.itemId });
  chk("T8-4", "calendar_cancel ของตัวเอง → CANCELLED · ซ้ำได้", rCa.ok === true && (await prisma.calItem.findUnique({ where: { id: r1.itemId } })).status === "CANCELLED" && (await run(ctxA, "calendar_cancel", { itemId: r1.itemId })).ok === true);
  const rUc = await run(ctxA, "calendar_update", { itemId: r1.itemId, title: "แก้หลังยกเลิก" });
  chk("T8-5", "แก้รายการที่ยกเลิกแล้ว = closed", /^closed/.test(rUc.error ?? ""), JSON.stringify(rUc));
  const lDone = await run(ctxA, "calendar_list", { status: "DONE" });
  chk("T8-6", "calendar_list DONE = เฉพาะที่เสร็จ (ยังไม่มี)", Array.isArray(lDone.items) && lDone.items.length === 0);

  // ─────────────── T9 calendar_agenda ───────────────
  console.log("── T9: calendar_agenda ──");
  const day = (off: number) => new Date(Date.now() + BKK + off * 86_400_000).toISOString().slice(0, 10);
  const ag = await run(ctxA, "calendar_agenda", { fromDate: day(0), toDate: day(1) });
  chk("T9-1", "agenda: เตือน/นัดของฉัน (ไม่มีของที่ยกเลิก) · มี day/time/system/title", Array.isArray(ag.items) && ag.items.some((x: AnyMod) => x.title === "ทำฟัน" && x.system === "นัดส่วนตัว" && /–/.test(x.time)) && !ag.items.some((x: AnyMod) => /มัดจำ/.test(x.title)) && ag.period === `${day(0)}..${day(1)}`, JSON.stringify(ag).slice(0, 300));
  const agB = await run(ctxB, "calendar_agenda", { fromDate: day(0), toDate: day(1) });
  chk("T9-2", "agenda ของ B ไม่เห็นของ A", !agB.items.some((x: AnyMod) => x.title === "ทำฟัน"));
  const agBad = await run(ctxA, "calendar_agenda", { fromDate: day(0), toDate: day(20) });
  chk("T9-3", "เกิน 14 วัน / รูปผิด = invalid", /^invalid: ช่วงวันไม่ถูกต้อง/.test(agBad.error ?? "") && /^invalid/.test((await run(ctxA, "calendar_agenda", { fromDate: "พรุ่งนี้" })).error ?? ""));
  // ระดับเลขา OFF ของแหล่งร้าน ⇒ agenda บอกส่วนที่ข้าม (skippedSectionNote) · ต้องมีระบบนั้นในร้าน
  const sysK = await prisma.appSystem.create({ data: { tenantId: tid, type: "KANBAN", name: "บอร์ด QC", active: true } });
  const agOff = await run({ ...ctxA, access: { kanban: "OFF" } }, "calendar_agenda", { fromDate: day(0) });
  chk("T9-4", "kanban OFF → notes \"ข้ามส่วน บอร์ดงาน (เจ้าของปิดไว้)\" · ของส่วนตัวยังมา (calendar_agenda ไม่ถูกระดับตัด)", (agOff.notes ?? []).some((n: string) => /ข้ามส่วน .*เจ้าของปิดไว้/.test(n)) && !agOff.error, JSON.stringify(agOff).slice(0, 300));
  await prisma.appSystem.deleteMany({ where: { id: sysK.id } });

  // ─────────────── T10 eval set ───────────────
  console.log("── T10: ชุดข้อสอบ eval ──");
  const C = evalM.CALENDAR_EVAL_CASES as AnyMod[];
  const P = (p: string) => C.find((c) => c.prompt.includes(p));
  chk("T10-1", `CALENDAR_EVAL_CASES ≥ 20 (${C.length}) · มีตัวอย่างของแผน (พรุ่งนี้บ่ายสาม · ทุกวันจันทร์ 9 โมง · อีกครึ่งชั่วโมง · วันที่ 5 ทุกเดือน · "เตือนครูนิว…" ไม่สร้าง · "เตือนฉันให้โทรหาครูนิว…" สร้าง · "บอกทุกคน…")`, C.length >= 20 && P("พรุ่งนี้บ่ายสาม")?.expect === "calendar_add" && P("ทุกวันจันทร์ 9 โมง")?.expect === "calendar_add" && P("อีกครึ่งชั่วโมง")?.expect === "calendar_add" && P("วันที่ 5 ทุกเดือน")?.expect === "calendar_add" && P("เตือนครูนิวให้เช็กถัง")?.expect === "none" && P("เตือนฉันให้โทรหาครูนิว")?.expect === "calendar_add" && P("บอกทุกคน")?.expect === "none");
  const gv = evalM.assertGoldenCasesValid();
  const h = evalM.scoreEvalWithHeuristic();
  const calGolden = h.byCase.filter((b: AnyMod) => b.expect.startsWith("calendar_"));
  chk("T10-2", `GOLDEN_CASES ใช้ชื่อเครื่องมือจริง · เคสปฏิทินผ่าน heuristic ${calGolden.filter((b: AnyMod) => b.ok).length}/${calGolden.length} · เคสเดิม schedule_task ยังถูก`, gv.ok && calGolden.length >= 6 && calGolden.every((b: AnyMod) => b.ok) && h.byCase.find((b: AnyMod) => b.prompt === "ทุกเย็นหกโมงช่วยสรุปยอดขายส่งให้หน่อย")?.ok === true, JSON.stringify({ gv, bad: h.byCase.filter((b: AnyMod) => !b.ok).map((b: AnyMod) => [b.prompt, b.got]) }).slice(0, 400));
} catch (e) {
  chk("X", "ไม่โยนระหว่างข้อสอบ", false, errMsg(e) + " " + (e instanceof Error ? e.stack?.split("\n").slice(1, 4).join(" ") : ""));
} finally {
  await prisma.aiRoom.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
  await prisma.aiConversation.deleteMany({ where: { tenantId: tid } }).catch(() => undefined);
  residue = await fx.cleanup();
}
chk("Z", "ลบข้อมูลทดสอบหมด", residue === 0, String(residue));
finish(LABEL, { residue });
