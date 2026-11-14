// QC — CAL1.6 API แอป /api/mobile/secretary/calendar/* (สัญญา §8 · M3) — เรียก handler ตรง (แบบ qc-sec-s1.14)
//   R1 ไม่ล็อกอิน 401 ทุกเส้น · R2 ของคนอื่น/ร้านอื่น 404 · R3 ค่าผิด 400 + ข้อความไทย · R4 body strict (userId/now/tenantId = 400)
//   R5 วงจร: สร้าง → อ่าน → แก้ → เลื่อน → เสร็จ → เปิดใหม่ → ยกเลิก · DRAFT confirm · origin conflict = SUGGEST
//   R6 agenda/month/today (ต่อ stub/ตัวรวม) · R7 prefs GET/PUT · R8 badges.calendar ไม่รวม total · R9 rooms/[id].reminders เฉพาะของผู้เรียก · R10 429
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-1.6.mts
import { chk, errMsg, finish, guard, makeFixture, thai, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.6";
guard(LABEL);
const { prisma } = (await import("@/lib/core/db")) as AnyMod;
const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const fx = await makeFixture(prisma, "qccal16", { a: { role: "OWNER" }, b: { role: "STAFF", permissions: { "ai.chat.send": true } } }, 2);
const [t1, t2] = fx.tids;
const mods: Record<string, AnyMod> = {};
const route = async (p: string) => (mods[p] ??= (await import(`@/app/api/mobile/secretary/${p}/route`)) as AnyMod);
type R = { status: number; body: AnyMod };
async function call(p: string, method: string, o: { body?: unknown; raw?: string; h?: Record<string, string>; q?: string; id?: string } = {}): Promise<R> {
  const m = await route(p.replace("ID", "[id]"));
  const url = `http://qc.local/api/mobile/secretary/${p.replace("ID", o.id ?? "x")}${o.q ? `?${o.q}` : ""}`;
  const init: RequestInit = { method, headers: { "content-type": "application/json", ...(o.h ?? {}) } };
  if (method !== "GET" && method !== "DELETE") {
    if (o.raw !== undefined) init.body = o.raw;
    else if (o.body !== undefined) init.body = JSON.stringify(o.body);
  }
  const res: Response = await m[method](new Request(url, init), { params: Promise.resolve({ id: o.id ?? "x" }) });
  const text = await res.text();
  let body: AnyMod = {};
  try { body = JSON.parse(text); } catch { body = { text }; }
  return { status: res.status, body };
}
const H: Record<string, Record<string, string>> = {};
let residue = -1;
try {
  const tok = async (u: string) => (await auth.issueMobileToken(u)).token;
  H.a = { authorization: `Bearer ${await tok(fx.U.a)}`, "x-tenant-id": t1 };
  H.a2 = { ...H.a, "x-tenant-id": t2 };
  H.b = { authorization: `Bearer ${await tok(fx.U.b)}`, "x-tenant-id": t1 };
  const soon = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

  console.log("── R1: 401 ──");
  const paths: [string, string][] = [["calendar/agenda", "GET"], ["calendar/month", "GET"], ["calendar/today", "GET"], ["calendar/items", "GET"], ["calendar/items", "POST"], ["calendar/items/ID", "GET"], ["calendar/items/ID", "PATCH"], ["calendar/items/ID", "DELETE"], ["calendar/items/ID/done", "POST"], ["calendar/items/ID/reopen", "POST"], ["calendar/items/ID/snooze", "POST"], ["calendar/items/ID/confirm", "POST"], ["calendar/source-done", "POST"], ["calendar/prefs", "GET"], ["calendar/prefs", "PUT"]];
  const un: string[] = [];
  for (const [p, m] of paths) { const r = await call(p, m, { h: { "x-tenant-id": t1 }, body: {} }); if (r.status !== 401 || !thai(r.body.message)) un.push(`${m} ${p}=${r.status}`); }
  chk("R1-1", `ไม่ล็อกอิน = 401 + ข้อความไทย ทุกเส้น (${paths.length})`, un.length === 0, un.join(","));
  const bad = await call("calendar/items", "GET", { h: { authorization: "Bearer nope", "x-tenant-id": t1 } });
  chk("R1-2", "โทเค็นปลอม = 401", bad.status === 401);

  console.log("── R5: วงจร ──");
  const c1 = await call("calendar/items", "POST", { h: H.a, body: { kind: "REMINDER", title: "โทรหาคุณเอก", startAt: soon(2) } });
  const id = c1.body.item?.id as string;
  chk("R5-1", "POST items = 200 {item} · OPEN · source APP", c1.status === 200 && c1.body.item?.status === "OPEN" && c1.body.item?.source === "APP", JSON.stringify(c1));
  const g1 = await call("calendar/items/ID", "GET", { h: H.a, id });
  chk("R5-2", "GET items/[id] = {item, phone:null}", g1.status === 200 && g1.body.item?.id === id && g1.body.phone === null);
  const p1 = await call("calendar/items/ID", "PATCH", { h: H.a, id, body: { title: "โทรหาคุณเอก (แก้)", leadMinutes: 15 } });
  chk("R5-3", "PATCH = 200 แก้แล้ว", p1.status === 200 && p1.body.item?.title === "โทรหาคุณเอก (แก้)" && p1.body.item?.leadMinutes === 15);
  const s1 = await call("calendar/items/ID/snooze", "POST", { h: H.a, id, body: { preset: "1h" } });
  const s2 = await call("calendar/items/ID/snooze", "POST", { h: H.a, id, body: { until: soon(5) } });
  chk("R5-4", "snooze preset/until = 200", s1.status === 200 && !!s1.body.item?.snoozeUntil && s2.status === 200);
  const d1 = await call("calendar/items/ID/done", "POST", { h: H.a, id, body: {} });
  const r1 = await call("calendar/items/ID/reopen", "POST", { h: H.a, id, body: {} });
  chk("R5-5", "done → DONE · reopen → OPEN", d1.status === 200 && d1.body.item?.status === "DONE" && r1.status === 200 && r1.body.item?.status === "OPEN");
  const x1 = await call("calendar/items/ID", "DELETE", { h: H.a, id });
  const x2 = await call("calendar/items/ID", "DELETE", { h: H.a, id });
  const x3 = await call("calendar/items/ID/done", "POST", { h: H.a, id, body: {} });
  chk("R5-6", "DELETE = {ok:true} ซ้ำได้ · ปิดแล้วติ๊ก = 409 closed ไทย", x1.status === 200 && x1.body.ok === true && x2.status === 200 && x3.status === 409 && x3.body.error === "closed" && x3.body.message === "รายการนี้ปิดไปแล้ว");
  const sg = await call("calendar/items", "POST", { h: H.a, body: { kind: "REMINDER", title: "ออกไปประชุมธนาคาร", startAt: soon(3), origin: "conflict" } });
  chk("R5-7", "origin conflict = source SUGGEST", sg.status === 200 && sg.body.item?.source === "SUGGEST");
  const drRow = await prisma.calItem.create({ data: { userId: fx.U.a, tenantId: t1, title: "ประจำวันที่ 5", startAt: new Date(soon(48)), occursAt: new Date(soon(48)), repeat: "MONTHLY", status: "DRAFT", source: "CHAT" } });
  const cf = await call("calendar/items/ID/confirm", "POST", { h: H.a, id: drRow.id, body: {} });
  chk("R5-8", "confirm DRAFT → OPEN", cf.status === 200 && cf.body.item?.status === "OPEN");
  await prisma.calItem.update({ where: { id: drRow.id }, data: { status: "DRAFT" } });
  await prisma.calItem.update({ where: { id: drRow.id }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
  const cf2 = await call("calendar/items/ID/confirm", "POST", { h: H.a, id: drRow.id, body: {} });
  chk("R5-9", "DRAFT หมดอายุ = 410 expired ไทย", cf2.status === 410 && cf2.body.error === "expired" && thai(cf2.body.message));
  const lt = await call("calendar/items", "GET", { h: H.a, q: "tab=upcoming&take=1" });
  chk("R5-10", "GET items?tab=upcoming&take=1 → items + nextBefore", lt.status === 200 && Array.isArray(lt.body.items) && lt.body.items.length === 1 && typeof lt.body.nextBefore === "string");

  console.log("── R2: ของคนอื่น = 404 ──");
  const mine = await call("calendar/items", "POST", { h: H.a, body: { kind: "EVENT", title: "นัดส่วนตัวของ a", startAt: soon(26), endAt: soon(27) } });
  const aid = mine.body.item.id as string;
  const nf: string[] = [];
  const tries: [string, string, AnyMod?][] = [["calendar/items/ID", "GET"], ["calendar/items/ID", "PATCH", { title: "x" }], ["calendar/items/ID", "DELETE"], ["calendar/items/ID/done", "POST", {}], ["calendar/items/ID/snooze", "POST", { preset: "1h" }], ["calendar/items/ID/reopen", "POST", {}], ["calendar/items/ID/confirm", "POST", {}]];
  for (const h of [H.b, H.a2]) for (const [p, m, body] of tries) { const r = await call(p, m, { h, id: aid, body }); if (r.status !== 404 || r.body.error !== "not_found" || r.body.message !== "ไม่พบรายการนี้ หรือคุณยังไม่มีสิทธิ์เห็น") nf.push(`${m} ${p}=${r.status}`); }
  chk("R2-1", "ผู้ใช้ B (ร้านเดียวกัน) + A ในร้านอื่น: ทุกเส้นของ id ของ A = 404 not_found ไทย", nf.length === 0, nf.join(","));
  chk("R2-2", "ของ A ไม่ถูกแตะ", (await prisma.calItem.findUnique({ where: { id: aid } })).title === "นัดส่วนตัวของ a");
  const lb = await call("calendar/items", "GET", { h: H.b, q: "tab=upcoming" });
  chk("R2-3", "รายการของ B ไม่มีของ A", lb.status === 200 && lb.body.items.every((i: AnyMod) => i.id !== aid));
  const ag = await call("calendar/agenda", "GET", { h: H.b, q: `from=${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 7 * 3_600_000 + 3 * 86_400_000).toISOString().slice(0, 10)}` });
  chk("R2-4", "agenda ของ B ไม่มีของ A", ag.status === 200 && !JSON.stringify(ag.body).includes(aid));

  console.log("── R3/R4: ค่าผิด ──");
  const e1 = await call("calendar/items", "POST", { h: H.a, body: { kind: "REMINDER", title: "x", startAt: new Date(Date.now() - 3_600_000).toISOString() } });
  const e2 = await call("calendar/items", "POST", { h: H.a, body: { kind: "REMINDER", title: "", startAt: soon(1) } });
  const e3 = await call("calendar/items", "POST", { h: H.a, body: { kind: "EVENT", title: "x", startAt: soon(2), endAt: soon(1) } });
  const e4 = await call("calendar/items", "POST", { h: H.a, body: { kind: "REMINDER", title: "x", startAt: soon(1), leadMinutes: 7 } });
  const e5 = await call("calendar/items", "POST", { h: H.a, body: { kind: "REMINDER", title: "x", startAt: soon(1), link: { type: "CRM_DEAL", id: "nope" } } });
  chk("R3-1", "อดีต 400 past_time · ชื่อว่าง/end≤start/lead ผิด 400 ไทย · link ไม่มี 404 ไทย", e1.status === 400 && e1.body.error === "past_time" && e1.body.message === "เวลานี้ผ่านไปแล้ว — เลือกเวลาในอนาคต" && e2.status === 400 && e2.body.message === "ใส่เรื่องที่จะเตือน (ไม่เกิน 200 ตัวอักษร)" && e3.status === 400 && e3.body.message === "เวลาสิ้นสุดต้องหลังเวลาเริ่ม" && e4.status === 400 && thai(e4.body.message) && e5.status === 404 && e5.body.error === "link_not_found", JSON.stringify([e1.body, e2.body, e3.body, e4.body, e5.body]).slice(0, 400));
  const st: R[] = [];
  for (const extra of [{ userId: fx.U.b }, { ownerId: "x" }, { recipientId: "x" }, { assigneeUserId: "x" }, { now: soon(0) }, { tenantId: t2 }]) st.push(await call("calendar/items", "POST", { h: H.a, body: { kind: "REMINDER", title: "x", startAt: soon(1), ...extra } }));
  chk("R4-1", "body ส่ง userId/ownerId/recipient/assignee/now/tenantId = 400 invalid ไทย (M3)", st.every((r) => r.status === 400 && r.body.error === "invalid" && thai(r.body.message)), st.map((r) => r.status).join(","));
  const bj = await call("calendar/items", "POST", { h: H.a, raw: "{bad" });
  const bd = await call("calendar/items", "POST", { h: H.a, body: { kind: "REMINDER", title: "x", startAt: "พรุ่งนี้" } });
  const bs = await call("calendar/items/ID/snooze", "POST", { h: H.a, id: aid, body: { preset: "2h" } });
  const bu = await call("calendar/items/ID/snooze", "POST", { h: H.a, id: aid, body: { until: new Date(Date.now() + 5_000).toISOString() } });
  chk("R3-2", "JSON เสีย 400 bad_json · วันที่ไม่ใช่ ISO 400 · preset ผิด 400 · until ใกล้เกิน 400 ข้อความ §5.4", bj.status === 400 && bj.body.error === "bad_json" && bd.status === 400 && bs.status === 400 && bu.status === 400 && bu.body.message === "เลือกเวลาเลื่อนในอนาคต (ไม่เกิน 1 ปี)");
  const ar = await call("calendar/agenda", "GET", { h: H.a, q: "from=2026-11-01&to=2026-12-31" });
  const ar2 = await call("calendar/agenda", "GET", { h: H.a, q: "from=2026-13-01" });
  const mr = await call("calendar/month", "GET", { h: H.a, q: "ym=2026-13" });
  const tb = await call("calendar/items", "GET", { h: H.a, q: "tab=all" });
  const cb = await call("calendar/items", "GET", { h: H.a, q: "tab=done&before=garbage" });
  chk("R3-3", "agenda > 42 วัน/วันผิด 400 ข้อความสัญญา · month ผิด 400 'เดือนไม่ถูกต้อง' · tab ผิด/cursor ผิด 400 ไทย", ar.status === 400 && ar.body.message === "ช่วงวันไม่ถูกต้อง (ไม่เกิน 42 วัน)" && ar2.status === 400 && mr.status === 400 && mr.body.message === "เดือนไม่ถูกต้อง" && tb.status === 400 && thai(tb.body.message) && cb.status === 400 && thai(cb.body.message));
  const pb = await call("calendar/prefs", "PUT", { h: H.a, body: { morning: { minute: 2000 } } });
  chk("R3-4", "prefs เวลาเกิน 1439 = 400 'เวลาไม่ถูกต้อง'", pb.status === 400 && pb.body.message === "เวลาไม่ถูกต้อง");

  console.log("── R6: agenda/month/today ──");
  const dayB = new Date(Date.parse(soon(26)) + 7 * 3_600_000).toISOString().slice(0, 10);
  const ag2 = await call("calendar/agenda", "GET", { h: H.a, q: `from=${dayB}` });
  chk("R6-1", "agenda (to ไม่ส่ง = from) มีนัดส่วนตัวของ a · รูป AgendaResult", ag2.status === 200 && Array.isArray(ag2.body.items) && Array.isArray(ag2.body.conflicts) && Array.isArray(ag2.body.notes) && ag2.body.items.some((i: AnyMod) => i.ref?.itemId === aid && i.source === "event"), JSON.stringify(ag2.body).slice(0, 300));
  const mo = await call("calendar/month", "GET", { h: H.a, q: `ym=${dayB.slice(0, 7)}` });
  chk("R6-2", "month = {ym, days{day:[colorKey]}}", mo.status === 200 && mo.body.ym === dayB.slice(0, 7) && Array.isArray(mo.body.days?.[dayB]) && mo.body.days[dayB].includes("personal"));
  const td = await call("calendar/today", "GET", { h: H.a });
  chk("R6-3", "today = {day, dateLabel, count, greeting, lines≤4 (ไม่มี pushText), more}", td.status === 200 && /^\d{4}-\d{2}-\d{2}$/.test(td.body.day) && typeof td.body.dateLabel === "string" && typeof td.body.count === "number" && Array.isArray(td.body.lines) && td.body.lines.length <= 4 && td.body.lines.every((l: AnyMod) => !("pushText" in l)) && typeof td.body.more === "boolean", JSON.stringify(td.body));
  const sd = await call("calendar/source-done", "POST", { h: H.a, body: { source: "kanban", id: "nope" } });
  chk("R6-4", "source-done id ไม่มี = 404", sd.status === 404);

  console.log("── R7: prefs ──");
  const pg = await call("calendar/prefs", "GET", { h: H.a });
  chk("R7-1", "GET prefs ค่าเริ่ม M2 · ไม่สร้างแถว · google NONE", pg.status === 200 && pg.body.morning?.on === true && pg.body.morning?.minute === 480 && pg.body.evening?.on === false && pg.body.evening?.minute === 1140 && pg.body.travelMinutes === 0 && pg.body.google?.status === "NONE" && typeof pg.body.tenantName === "string" && Array.isArray(pg.body.sources) && (await prisma.calPref.count({ where: { userId: fx.U.a, tenantId: t1 } })) === 0);
  const pp = await call("calendar/prefs", "PUT", { h: H.a, body: { morning: { minute: 435 }, evening: { on: true }, travelMinutes: 45, sources: { hr: false, bogus: true } } });
  const row = await prisma.calPref.findFirst({ where: { userId: fx.U.a, tenantId: t1 } });
  chk("R7-2", "PUT prefs: บันทึก · คีย์ที่ร้านไม่มี/ไม่มีสิทธิ์ = เพิกเฉย · ร้านอื่นไม่กระทบ", pp.status === 200 && pp.body.morning?.minute === 435 && pp.body.evening?.on === true && row?.travelMinutes === 45 && !("bogus" in (row?.sources ?? {})) && !("hr" in (row?.sources ?? {})) && (await prisma.calPref.count({ where: { userId: fx.U.a, tenantId: t2 } })) === 0, JSON.stringify(row));
  const pst = await call("calendar/prefs", "PUT", { h: H.a, body: { userId: fx.U.b } });
  chk("R7-3", "PUT prefs ส่ง userId = 400", pst.status === 400);

  console.log("── R8: badges ──");
  await call("calendar/items", "POST", { h: H.b, body: { kind: "REMINDER", title: "ของ b วันนี้", startAt: new Date(Date.now() + 120_000).toISOString() } });
  const bdg = await call("badges", "GET", { h: H.b });
  const nowB = new Date(Date.now() + 7 * 3_600_000);
  const sameDay = new Date(Date.now() + 120_000 + 7 * 3_600_000).getUTCDate() === nowB.getUTCDate();
  chk("R8-1", "badges.calendar = เรื่องวันนี้ที่ยังไม่เสร็จ · ไม่รวมใน total", bdg.status === 200 && typeof bdg.body.calendar === "number" && (!sameDay || bdg.body.calendar === 1) && bdg.body.total === bdg.body.approvals + bdg.body.customers + bdg.body.team.invites + bdg.body.team.help + bdg.body.team.support, JSON.stringify(bdg.body));

  console.log("── R9: rooms/[id].reminders ──");
  const actorA = { membership: { role: "OWNER", unitAccess: ["*"], permissions: {} } };
  let roomId = "";
  try {
    const conv = await prisma.aiConversation.create({ data: { tenantId: t1, title: "ห้องทดสอบปฏิทิน" } });
    const room = await prisma.aiRoom.create({ data: { tenantId: t1, conversationId: conv.id, startedById: fx.U.a, title: "ห้องทดสอบปฏิทิน" } });
    roomId = room.id;
  } catch (e) { console.log(`  ⚠️ room: ${errMsg(e)}`); }
  if (!roomId) chk("R9-0", "สร้างห้องเลขาสำหรับทดสอบได้ (createRoom)", false, "ข้าม R9");
  else {
    const items = (await import("@/lib/modules/calendar/items")) as AnyMod;
    await items.createItem({ userId: fx.U.a, tenantId: t1, membership: actorA.membership }, { kind: "REMINDER", title: "การ์ดในห้อง", startAt: new Date(soon(4)) }, { source: "CHAT", roomId });
    const rr = await call("rooms/ID", "GET", { h: H.a, id: roomId });
    chk("R9-1", "GET rooms/[id] มี reminders ของผู้เรียก", rr.status === 200 && Array.isArray(rr.body.reminders) && rr.body.reminders.length === 1 && rr.body.reminders[0].title === "การ์ดในห้อง", JSON.stringify(rr.body).slice(0, 200));
  }

  console.log("── R10: rate limit ──");
  let got429: R | null = null;
  for (let i = 0; i < 65 && !got429; i++) { const r = await call("calendar/month", "GET", { h: H.b, q: "ym=2026-11" }); if (r.status === 429) got429 = r; }
  chk("R10-1", "เกินเพดาน = 429 + retryAfterSec + ข้อความไทย", !!got429 && typeof got429.body.retryAfterSec === "number" && thai(got429.body.message));
} catch (e) {
  console.log(e); chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally {
  try { await prisma.chatRateBucket.deleteMany({ where: { key: { contains: fx.STAMP } } }); } catch { /* */ }
  for (const t of fx.tids) { try { await prisma.chatRateBucket.deleteMany({ where: { key: { contains: t } } }); } catch { /* */ } }
  try { await prisma.mobileToken?.deleteMany?.({ where: { userId: { in: Object.values(fx.U) } } }); } catch { /* */ }
  residue = await fx.cleanup();
}
chk("Z-1", "residue 0", residue === 0, String(residue));
await prisma.$disconnect().catch(() => undefined);
finish(LABEL, { residue });
