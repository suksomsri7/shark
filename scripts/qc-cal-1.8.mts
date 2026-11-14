// QC — CAL1.8 ซิงก์ Google Calendar (สัญญา docs/modules/32-secretary-calendar.md §10 · §8 google/* · R-CAL-16/17/26/27/37)
//   transport ปลอมทั้งหมด (`GoogleDeps.fetch` ฉีดได้แบบ push.ts) — ไม่มีคำขอออกนอกเครื่อง (fetch จริงถูกครอบให้โยน)
//   G1 ยังไม่พร้อม = 503 · G2 แลก code (scope ไม่ครบ/ไม่มี refresh/โค้ดเสีย) · G3 เชื่อม (กล่องลับผูก AAD · email · ปฏิทิน · DTO ไม่มี token)
//   G4 ดึงเข้า (full → syncToken → incremental · ลบ · 410) · G5 ส่งออก CalItem (+RRULE · ไม่แสดงสำเนาของเรา) · G6 แก้สองทาง
//   G7 นัดบัตรคิวของฉัน (sharkRef · ไม่มีเบอร์ · ปิดตัวเลือก = ลบ) · G8 ตั้งค่า (ปลายทาง reader = 400 · ปิดดึง = ลบแคช)
//   G9 token หมด → refresh · invalid_grant → NEEDS_RECONNECT · G10 job calendar.google · G11 ยกเลิกเชื่อม · G12 route (401 · strict · 404 · 429)
//   G13 M3 grep (userId ตรงตัวใน where)
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-1.8.mts
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { chk, errMsg, finish, guard, makeFixture, thai, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.8";
guard(LABEL);
// เตรียม seed (นัดบัตรคิวของครูนิว — G7) ก่อนกันเครือข่าย
execFileSync("pnpm", ["exec", "tsx", "scripts/seed-calendar-qc.mts"], { env: process.env, stdio: ["ignore", "ignore", "pipe"] });

// 🔴 กันออกนอกเครื่อง: googleapis จริง = โยน (ฐาน QC ใช้ pg ไม่ใช่ fetch)
const realFetch = globalThis.fetch;
let leaked = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = String(input instanceof Request ? input.url : input);
  if (/google/.test(u)) {
    leaked++;
    throw new Error("qc: real google call blocked");
  }
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;

const KEY_SAVED = process.env.INTEGRATIONS_CREDENTIALS_KEY;
delete process.env.INTEGRATIONS_CREDENTIALS_KEY;
process.env.GOOGLE_WEB_CLIENT_ID ||= "qc-client.apps.googleusercontent.com";
process.env.GOOGLE_WEB_CLIENT_SECRET ||= "qc-secret";

const { prisma } = (await import("@/lib/core/db")) as AnyMod;
const google = (await import("@/lib/modules/calendar/google")) as AnyMod;
const items = (await import("@/lib/modules/calendar/items")) as AnyMod;
const agenda = (await import("@/lib/modules/calendar/agenda")) as AnyMod;
const box = (await import("@/lib/core/integrations/secret-box")) as AnyMod;
const auth = (await import("@/lib/mobile/auth")) as AnyMod;

// ─────────────── Google ปลอม ───────────────
type Ev = AnyMod & { id: string; etag: string; updated: string; status: string; _v: number };
function fakeGoogle() {
  const st = {
    calls: [] as { method: string; path: string; body?: AnyMod }[],
    revoked: [] as string[],
    access: new Set<string>(),
    deadRefresh: new Set<string>(),
    v: 0,
    n: 0,
    cals: [
      { id: "me@example.com", summary: "ส่วนตัว", primary: true, accessRole: "owner", backgroundColor: "#4285f4" },
      { id: "family@group.calendar.google.com", summary: "งานบ้าน", summaryOverride: "งานบ้าน (แชร์จากแฟน)", accessRole: "writer" },
      { id: "th.th#holiday@group.v.calendar.google.com", summary: "วันหยุดไทย", accessRole: "reader" },
    ] as AnyMod[],
    events: new Map<string, Map<string, Ev>>(),
    gone: new Set<string>(),
    scope: `${google.SCOPE_EVENTS} ${google.SCOPE_LIST} openid email`,
    now: Date.now(),
  };
  const evs = (cal: string) => st.events.get(cal) ?? st.events.set(cal, new Map()).get(cal)!;
  const put = (cal: string, e: AnyMod): Ev => {
    st.v++;
    const prev = evs(cal).get(e.id);
    const ev = { status: "confirmed", ...prev, ...e, id: String(e.id), etag: `"e${st.v}"`, updated: new Date(st.now + st.v * 1000).toISOString(), _v: st.v } as Ev;
    evs(cal).set(ev.id, ev);
    return ev;
  };
  const json = (status: number, o: unknown) => new Response(status === 204 ? null : JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const idTok = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : undefined;
    st.calls.push({ method, path: url.pathname + url.search, ...(body ? { body } : {}) });
    if (url.hostname === "oauth2.googleapis.com") {
      if (url.pathname === "/revoke") {
        st.revoked.push(url.searchParams.get("token") ?? "");
        return json(200, {});
      }
      const p = new URLSearchParams(String(init?.body ?? ""));
      if (p.get("grant_type") === "authorization_code") {
        const code = p.get("code");
        if (p.get("client_secret") !== process.env.GOOGLE_WEB_CLIENT_SECRET) return json(401, { error: "invalid_client" });
        if (code === "bad") return json(400, { error: "invalid_grant" });
        const at = `at-${++st.n}`;
        st.access.add(at);
        if (code === "noscope") return json(200, { access_token: at, expires_in: 3600, refresh_token: "rt-noscope", scope: google.SCOPE_EVENTS });
        if (code === "norefresh") return json(200, { access_token: at, expires_in: 3600, scope: st.scope });
        return json(200, { access_token: at, expires_in: 3600, refresh_token: `rt-${code}`, scope: st.scope, id_token: idTok("me@example.com") });
      }
      if (p.get("grant_type") === "refresh_token") {
        if (st.deadRefresh.has(p.get("refresh_token") ?? "")) return json(400, { error: "invalid_grant" });
        const at = `at-${++st.n}`;
        st.access.add(at);
        return json(200, { access_token: at, expires_in: 3600 });
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    if (url.hostname !== "www.googleapis.com") return json(404, {});
    const tok = (new Headers(init?.headers).get("authorization") ?? "").replace("Bearer ", "");
    if (!st.access.has(tok)) return json(401, { error: { code: 401 } });
    const path = decodeURIComponent(url.pathname.replace("/calendar/v3", ""));
    if (path === "/users/me/calendarList") return json(200, { items: st.cals });
    const m = /^\/calendars\/([^/]+)\/events(?:\/(.+))?$/.exec(path);
    if (!m) return json(404, {});
    const cal = m[1] === "primary" ? "me@example.com" : m[1]!;
    const id = m[2];
    if (method === "GET") {
      const sync = url.searchParams.get("syncToken");
      if (sync && st.gone.has(cal)) {
        st.gone.delete(cal);
        return json(410, { error: { code: 410 } });
      }
      const since = sync ? Number(sync.split(":")[1]) : 0;
      const list = [...evs(cal).values()].filter((e) => (sync ? e._v > since : e.status !== "cancelled")).map(({ _v, ...e }) => e);
      return json(200, { items: list, nextSyncToken: `${cal}:${st.v}` });
    }
    if (method === "POST") {
      const ev = put(cal, { ...body, id: `g${++st.n}` });
      const { _v, ...out } = ev;
      return json(200, out);
    }
    if (!id || !evs(cal).has(id) || evs(cal).get(id)!.status === "cancelled") return json(404, { error: { code: 404 } });
    if (method === "PATCH") {
      const { _v, ...out } = put(cal, { ...body, id });
      return json(200, out);
    }
    if (method === "DELETE") {
      put(cal, { id, status: "cancelled" });
      return json(204, null);
    }
    return json(405, {});
  }) as typeof fetch;
  return { st, put, fetch: f, deps: () => ({ fetch: f }) };
}

const fx = await makeFixture(prisma, "qccal18", { a: { role: "OWNER" }, b: { role: "OWNER" } });
const [tid] = fx.tids;
const OWNER_M = { role: "OWNER", unitAccess: ["*"], permissions: {} };
const A = { userId: fx.U.a, tenantId: tid, membership: OWNER_M };
const g = fakeGoogle();
const D = g.deps();
const T = (dayOff: number, h: number, mi = 0) => {
  const t = new Date(Date.now() + 7 * 3_600_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + dayOff, h - 7, mi));
};
const day = (off: number) => new Date(Date.now() + 7 * 3_600_000 + off * 86_400_000).toISOString().slice(0, 10);
const linkRow = () => prisma.calLink.findFirst({ where: { userId: fx.U.a } });
const throwsCode = async (p: Promise<unknown>) => p.then(() => "OK", (e: AnyMod) => `${e?.status ?? ""}:${e?.code ?? errMsg(e)}`);
const NEW = "calqc-staff-new";
let residue = -1;
try {
  // ─────────────── G1 ───────────────
  console.log("── G1: ยังไม่พร้อม ──");
  chk("G1-1", "ไม่มี INTEGRATIONS_CREDENTIALS_KEY = 503 not_configured (ไม่โยน 500 · ไม่ยิง Google)", (await throwsCode(google.connectGoogle(fx.U.a, "good", D))) === "503:not_configured" && g.st.calls.length === 0);
  process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex"); // ในโพรเซสนี้เท่านั้น (ไม่แตะไฟล์ env)

  // ─────────────── G2 ───────────────
  console.log("── G2: แลก code ──");
  chk("G2-1", "scope ไม่ครบ = 400 scope_missing + ถอน token ที่ได้มา · ไม่สร้าง CalLink", (await throwsCode(google.connectGoogle(fx.U.a, "noscope", D))) === "400:scope_missing" && g.st.revoked.includes("rt-noscope") && !(await linkRow()));
  chk("G2-2", "ไม่มี refresh_token = 400 bad_code · โค้ดเสีย = 400 bad_code · ยาวเกิน 512 = bad_code", (await throwsCode(google.connectGoogle(fx.U.a, "norefresh", D))) === "400:bad_code" && (await throwsCode(google.connectGoogle(fx.U.a, "bad", D))) === "400:bad_code" && (await throwsCode(google.connectGoogle(fx.U.a, "x".repeat(600), D))) === "400:bad_code");
  const tokCall = g.st.calls.find((c) => c.path === "/token");
  chk("G2-3", "แลกที่ oauth2.googleapis.com/token (form · client ของเว็บ · redirect_uri ว่าง)", !!tokCall);

  // ─────────────── G3 ───────────────
  console.log("── G3: เชื่อม ──");
  // อีเวนต์ในปฏิทินก่อนเชื่อม
  g.put("me@example.com", { id: "e1", summary: "ส่งลูกไปโรงเรียน", start: { dateTime: T(1, 7).toISOString() }, end: { dateTime: T(1, 8).toISOString() } });
  g.put("me@example.com", { id: "e2", summary: "เที่ยวเชียงใหม่", start: { date: day(2) }, end: { date: day(4) } });
  g.put("family@group.calendar.google.com", { id: "f1", summary: "งานบ้าน", start: { dateTime: T(1, 9).toISOString() }, end: { dateTime: T(1, 10).toISOString() } });
  const dto = await google.connectGoogle(fx.U.a, "good", D);
  const l1 = await linkRow();
  chk("G3-1", "CalLink ACTIVE · email จาก id_token · scopes 2 ตัว · exportKinds ค่าเริ่ม [EVENT]", l1?.status === "ACTIVE" && l1.email === "me@example.com" && l1.scopes.length === 2 && JSON.stringify(l1.exportKinds) === '["EVENT"]');
  chk("G3-2", "tokenBox ไม่มี token ดิบ · เปิดด้วย AAD cal:<user>:<link> ได้ · AAD อื่น = null (ย้ายแถว/ผู้ใช้ = เปิดไม่ได้)", !l1.tokenBox.includes("rt-good") && box.openIntegrationSecret(l1.tokenBox, `cal:${fx.U.a}:${l1.id}`)?.refreshToken === "rt-good" && box.openIntegrationSecret(l1.tokenBox, `cal:${fx.U.b}:${l1.id}`) === null);
  chk("G3-3", "ปฏิทิน: primary import=true · แชร์/วันหยุด = false · ชื่อ summaryOverride", dto.calendars.length === 3 && dto.calendars.find((c: AnyMod) => c.primary)?.import === true && dto.calendars.filter((c: AnyMod) => !c.primary).every((c: AnyMod) => c.import === false) && dto.calendars.some((c: AnyMod) => c.name === "งานบ้าน (แชร์จากแฟน)"), JSON.stringify(dto.calendars));
  chk("G3-4", "DTO ไม่มี token/tokenBox/syncToken", !/rt-|at-|tokenBox|syncToken/.test(JSON.stringify(dto)) && dto.exportCalendarName === "ส่วนตัว");
  const statusB = await google.googleStatus(fx.U.b);
  chk("G3-5", "ผู้ใช้อื่น = ไม่เชื่อม (null)", statusB === null);

  // ─────────────── G4 ดึงเข้า ───────────────
  console.log("── G4: ดึงเข้า ──");
  const s1 = await google.syncGoogle(fx.U.a, { reason: "manual", deps: D });
  const ext = await prisma.calExternalEvent.findMany({ where: { userId: fx.U.a } });
  const l2 = await linkRow();
  const primarySync = (l2.calendars as AnyMod[]).find((c) => c.primary)?.syncToken;
  const firstGet = g.st.calls.find((c) => c.method === "GET" && c.path.includes("/events"));
  chk("G4-1", "full sync: timeMin (−30 วัน) + singleEvents · เฉพาะปฏิทินที่ import · บันทึก syncToken ต่อปฏิทิน (R-CAL-26)", s1.ok && ext.length === 2 && ext.every((e: AnyMod) => e.calendarId === "me@example.com") && /timeMin=/.test(firstGet?.path ?? "") && /singleEvents=true/.test(firstGet?.path ?? "") && typeof primarySync === "string", JSON.stringify({ s1, n: ext.length, primarySync }));
  const allDay = ext.find((e: AnyMod) => e.externalId === "e2");
  chk("G4-2", "all-day = เที่ยงคืนไทย · endAt exclusive", allDay?.allDay === true && +allDay.startAt === Date.parse(`${day(2)}T00:00:00+07:00`) && +allDay.endAt === Date.parse(`${day(4)}T00:00:00+07:00`));
  const ag1 = await agenda.agendaFor(A, { from: day(1), to: day(3) }, { access: {} });
  chk("G4-3", "agenda แสดง Google (แถวต่อวันของทั้งวัน)", ag1.items.some((i: AnyMod) => i.source === "google" && i.title === "ส่งลูกไปโรงเรียน") && ag1.items.filter((i: AnyMod) => i.title === "เที่ยวเชียงใหม่").length === 2);
  g.put("me@example.com", { id: "e1", summary: "ส่งลูกไปโรงเรียน (เลื่อน)", start: { dateTime: T(1, 7, 30).toISOString() }, end: { dateTime: T(1, 8, 30).toISOString() } });
  g.put("me@example.com", { id: "e2", status: "cancelled" });
  g.st.calls.length = 0;
  await prisma.calLink.updateMany({ where: { userId: fx.U.a }, data: { leaseUntil: null } });
  await google.syncGoogle(fx.U.a, { deps: D });
  const incr = g.st.calls.find((c) => c.method === "GET" && c.path.includes("/events"));
  const e1 = await prisma.calExternalEvent.findFirst({ where: { userId: fx.U.a, externalId: "e1" } });
  const e2 = await prisma.calExternalEvent.findFirst({ where: { userId: fx.U.a, externalId: "e2" } });
  chk("G4-4", "incremental ด้วย syncToken (ไม่มี timeMin) · แก้ = อัปเดต · ลบ = deletedAt", /syncToken=/.test(incr?.path ?? "") && !/timeMin/.test(incr?.path ?? "") && e1?.title === "ส่งลูกไปโรงเรียน (เลื่อน)" && +e1.startAt === +T(1, 7, 30) && !!e2?.deletedAt, JSON.stringify(incr));
  g.st.gone.add("me@example.com");
  await google.syncGoogle(fx.U.a, { deps: D });
  const after410 = await prisma.calExternalEvent.findMany({ where: { userId: fx.U.a, calendarId: "me@example.com", sharkRef: null } });
  chk("G4-5", "410 Gone = ล้างแคชปฏิทินนั้นแล้ว full sync ใหม่ (อีเวนต์ที่ลบไม่กลับมา)", after410.length === 1 && after410[0].externalId === "e1", JSON.stringify(after410.map((e: AnyMod) => e.externalId)));

  // ─────────────── G5 ส่งออก ───────────────
  console.log("── G5: ส่งออก CalItem ──");
  const ev = await items.createItem(A, { kind: "EVENT", title: "ประชุมธนาคาร", startAt: T(2, 13), endAt: T(2, 14) });
  const rem = await items.createItem(A, { kind: "REMINDER", title: "เตือนส่วนตัว", startAt: T(2, 9) });
  chk("G5-1", "สร้าง EVENT ตอนเชื่อม (exportKinds EVENT) = syncDirty · REMINDER ไม่ dirty", (await prisma.calItem.findUnique({ where: { id: ev.id } })).syncDirty === true && (await prisma.calItem.findUnique({ where: { id: rem.id } })).syncDirty === false);
  await google.syncGoogle(fx.U.a, { deps: D });
  const evRow = await prisma.calItem.findUnique({ where: { id: ev.id } });
  const remote = [...(g.st.events.get("me@example.com")?.values() ?? [])].find((e) => e.extendedProperties?.private?.sharkItemId === ev.id);
  chk("G5-2", "ส่งไป primary: externalId/etag เก็บ · syncDirty false · private.sharkItemId · เวลา +07:00 Asia/Bangkok · ไม่ตั้งแจ้งเตือนของ Google", !!remote && evRow.externalId === remote.id && evRow.syncDirty === false && !!evRow.externalEtag && remote.start?.timeZone === "Asia/Bangkok" && /\+07:00$/.test(remote.start?.dateTime) && remote.reminders?.useDefault === false, JSON.stringify(remote));
  chk("G5-3", "สำเนาของเราไม่กลายเป็นแถว CalExternalEvent (ไม่แสดงซ้ำใน agenda) · agenda event = \"→ ส่งไป Google แล้ว\"", !(await prisma.calExternalEvent.findFirst({ where: { userId: fx.U.a, externalId: remote?.id ?? "-" } })) && (await agenda.agendaFor(A, { from: day(2), to: day(2) }, { access: {} })).items.some((i: AnyMod) => i.id === `event:${ev.id}` && /ส่งไป Google แล้ว/.test(i.sub)));
  chk("G5-4", "RRULE บริสุทธิ์: WEEKLY จ.+พ. · MONTHLY 5 · MONTHLY 31 = BYSETPOS=-1 (วันสุดท้ายของเดือนสั้น)", google.rruleOf({ repeat: "WEEKLY", repeatDays: [3, 1], startAt: T(1, 9) })[0] === "RRULE:FREQ=WEEKLY;BYDAY=MO,WE" && google.rruleOf({ repeat: "MONTHLY", repeatDays: [], startAt: new Date("2026-12-05T02:00:00Z") })[0] === "RRULE:FREQ=MONTHLY;BYMONTHDAY=5" && google.rruleOf({ repeat: "MONTHLY", repeatDays: [], startAt: new Date("2026-12-31T02:00:00Z") })[0] === "RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1");
  await google.updateGoogle(fx.U.a, { exportKinds: ["EVENT", "REMINDER"] }, D);
  await google.syncGoogle(fx.U.a, { deps: D });
  const remRow = await prisma.calItem.findUnique({ where: { id: rem.id } });
  const remRemote = remRow.externalId ? g.st.events.get("me@example.com")?.get(remRow.externalId) : null;
  chk("G5-5", "เปิด REMINDER = ส่งของเดิมรอบถัดไป · เป็นอีเวนต์ 15 นาที", !!remRemote && Date.parse(remRemote.end.dateTime) - Date.parse(remRemote.start.dateTime) === 15 * 60_000);
  await items.updateItem(A, ev.id, { title: "ประชุมธนาคาร (สินเชื่อเรือ)" });
  await google.syncGoogle(fx.U.a, { deps: D });
  chk("G5-6", "แก้ในแอป = PATCH Google", g.st.events.get("me@example.com")?.get(evRow.externalId)?.summary === "ประชุมธนาคาร (สินเชื่อเรือ)");
  await items.cancelItem(A, rem.id);
  await google.syncGoogle(fx.U.a, { deps: D });
  chk("G5-7", "ยกเลิกในแอป = DELETE Google + ล้าง externalId", g.st.events.get("me@example.com")?.get(remRow.externalId)?.status === "cancelled" && (await prisma.calItem.findUnique({ where: { id: rem.id } })).externalId === null);

  // ─────────────── G6 แก้สองทาง ───────────────
  console.log("── G6: แก้ใน Google → กลับเข้าแอป ──");
  const before = await prisma.calItem.findUnique({ where: { id: ev.id } });
  g.st.now = Date.now() + 60_000; // updated ใหม่กว่า CalItem.updatedAt
  g.put("me@example.com", { id: before.externalId, summary: "ประชุมธนาคาร (เลื่อน)", start: { dateTime: T(2, 15).toISOString(), timeZone: "Asia/Bangkok" }, end: { dateTime: T(2, 16).toISOString() } });
  await google.syncGoogle(fx.U.a, { deps: D });
  const afterEdit = await prisma.calItem.findUnique({ where: { id: ev.id } });
  chk("G6-1", "Google ใหม่กว่า ⇒ เขียน title/startAt/endAt กลับ · version +1 · คำนวณ nextFireAt ใหม่ (lead 15) · ไม่ dirty", afterEdit.title === "ประชุมธนาคาร (เลื่อน)" && +afterEdit.startAt === +T(2, 15) && +afterEdit.endAt === +T(2, 16) && afterEdit.version === before.version + 1 && +afterEdit.nextFireAt === +T(2, 15) - 15 * 60_000 && afterEdit.syncDirty === false, JSON.stringify({ t: afterEdit.title, v: afterEdit.version }));
  g.put("me@example.com", { id: before.externalId, status: "cancelled" });
  await google.syncGoogle(fx.U.a, { deps: D });
  chk("G6-2", "ลบใน Google ⇒ CalItem CANCELLED (สองทาง)", (await prisma.calItem.findUnique({ where: { id: ev.id } })).status === "CANCELLED");

  // ─────────────── G7 นัดบัตรคิว ───────────────
  console.log("── G7: นัดบัตรคิวของฉัน (R-CAL-37) ──");
  const gN = fakeGoogle();
  const DN = gN.deps();
  await google.connectGoogle(NEW, "new", DN);
  await google.updateGoogle(NEW, { exportKinds: ["BOOKING"] }, DN);
  await google.syncGoogle(NEW, { deps: DN });
  const copies = await prisma.calExternalEvent.findMany({ where: { userId: NEW, sharkRef: { not: null } } });
  const remoteN = [...(gN.st.events.get("me@example.com")?.values() ?? [])].filter((e) => e.status !== "cancelled");
  chk("G7-1", "นัดของครูนิวที่ยังไม่ผ่าน (60 วัน) ส่งไป · sharkRef appt:<tenant>:<id> · ชื่อ <บริการ> · <ลูกค้า> ไม่มีเบอร์ · ไม่มีนัดคนอื่น", copies.length > 0 && copies.every((c: AnyMod) => /^appt:calqc-tenant:calqc-appt-[156]$/.test(c.sharkRef)) && remoteN.every((e) => !/0800000000/.test(JSON.stringify(e)) && / · /.test(e.summary)) && remoteN.length === copies.length, JSON.stringify(copies.map((c: AnyMod) => c.sharkRef)));
  const agN = await agenda.agendaFor({ userId: NEW, tenantId: "calqc-tenant", membership: { role: "STAFF", unitAccess: ["calqc-unit-dive"], permissions: {} } }, { from: day(0), to: day(1) }, { access: {} });
  chk("G7-2", "สำเนา sharkRef ไม่แสดงใน agenda (นัดยังแสดงจากบัตรคิวครั้งเดียว)", !agN.items.some((i: AnyMod) => i.source === "google"));
  await google.updateGoogle(NEW, { exportKinds: [] }, DN);
  chk("G7-3", "ปิดตัวเลือก BOOKING = ลบสำเนาทั้งหมด (Google + ตารางจับคู่)", (await prisma.calExternalEvent.count({ where: { userId: NEW, sharkRef: { not: null } } })) === 0 && [...(gN.st.events.get("me@example.com")?.values() ?? [])].every((e) => e.status === "cancelled"));
  await google.disconnectGoogle(NEW, DN);

  // ─────────────── G8 ตั้งค่า ───────────────
  console.log("── G8: ตั้งค่า (จอ 9) ──");
  chk("G8-1", "ปฏิทินปลายทาง reader = 400 \"ปฏิทินนี้แก้ไขไม่ได้ เลือกปฏิทินอื่น\"", (await throwsCode(google.updateGoogle(fx.U.a, { exportCalendarId: "th.th#holiday@group.v.calendar.google.com" }, D))) === "400:invalid");
  await google.updateGoogle(fx.U.a, { calendars: [{ id: "family@group.calendar.google.com", import: true }] }, D);
  await google.syncGoogle(fx.U.a, { deps: D });
  const fam = await prisma.calExternalEvent.count({ where: { userId: fx.U.a, calendarId: "family@group.calendar.google.com" } });
  await google.updateGoogle(fx.U.a, { calendars: [{ id: "family@group.calendar.google.com", import: false }] }, D);
  const famAfter = await prisma.calExternalEvent.count({ where: { userId: fx.U.a, calendarId: "family@group.calendar.google.com" } });
  const famCal = ((await linkRow()).calendars as AnyMod[]).find((c) => c.id.startsWith("family"));
  chk("G8-2", "เปิดดึงปฏิทินแชร์ = มีแถว · ปิด = ลบแคช + ล้าง syncToken", fam === 1 && famAfter === 0 && !famCal?.syncToken && famCal?.import === false);
  const notLinked = await throwsCode(google.updateGoogle(fx.U.b, { exportKinds: ["EVENT"] }, D));
  chk("G8-3", "ไม่เชื่อม = 404", notLinked === "404:not_found");

  // ─────────────── G9 token ───────────────
  console.log("── G9: token หมด/ตาย ──");
  g.st.access.clear(); // access token เดิมใช้ไม่ได้ (401) ⇒ refresh แล้วลองใหม่
  const before9 = g.st.calls.filter((c) => c.path === "/token").length;
  const r9 = await google.syncGoogle(fx.U.a, { deps: D });
  chk("G9-1", "401 = refresh ด้วย refresh_token แล้วลองใหม่ · token ใหม่ถูกเก็บกลับในกล่อง", r9.ok === true && g.st.calls.filter((c) => c.path === "/token").length > before9 && box.openIntegrationSecret((await linkRow()).tokenBox, `cal:${fx.U.a}:${(await linkRow()).id}`)?.accessToken !== undefined);
  g.st.access.clear();
  g.st.deadRefresh.add("rt-good");
  const r9b = await throwsCode(google.syncGoogle(fx.U.a, { deps: D }));
  const l9 = await linkRow();
  chk("G9-2", "invalid_grant = NEEDS_RECONNECT + lastError \"ต้องเชื่อม Google ใหม่\" · syncGoogle ต่อ = 409", r9b === "409:needs_reconnect" && l9.status === "NEEDS_RECONNECT" && l9.lastError === "ต้องเชื่อม Google ใหม่" && (await throwsCode(google.syncGoogle(fx.U.a, { deps: D }))) === "409:needs_reconnect");
  chk("G9-3", "แคชเดิมยังแสดงระหว่างรอเชื่อมใหม่ · prefs.google.status = NEEDS_RECONNECT", (await agenda.agendaFor(A, { from: day(1), to: day(1) }, { access: {} })).items.some((i: AnyMod) => i.source === "google"));
  g.st.deadRefresh.clear();
  const re = await google.connectGoogle(fx.U.a, "good2", D);
  chk("G9-4", "เชื่อมใหม่ = ACTIVE · id เดิม · ถอน token เดิม · คงค่า import เดิม", re.status === "ACTIVE" && (await linkRow()).id === l9.id && g.st.revoked.includes("rt-good") && re.calendars.find((c: AnyMod) => c.primary)?.import === true);
  await prisma.calLink.updateMany({ where: { userId: fx.U.a }, data: { tokenBox: box.sealIntegrationSecret({ refreshToken: "x" }, "cal:someone-else:x") } });
  chk("G9-5", "กล่องลับเปิดไม่ได้ (AAD ไม่ตรง) = NEEDS_RECONNECT", (await throwsCode(google.syncGoogle(fx.U.a, { deps: D }))) === "409:needs_reconnect" && (await linkRow()).status === "NEEDS_RECONNECT");
  await google.connectGoogle(fx.U.a, "good3", D);

  // ─────────────── G10 job ───────────────
  console.log("── G10: job calendar.google ──");
  await import("@/lib/modules/calendar/jobs");
  const mj = (await import("@/lib/platform/minute-jobs")) as AnyMod;
  const reg = mj.getMinuteJobStatus ? await mj.getMinuteJobStatus().catch(() => null) : null;
  const regSrc = readFileSync("src/lib/modules/calendar/jobs.ts", "utf8");
  chk("G10-1", "ลงทะเบียน calendar.google everyMinutes 15 · งบ 8 วิ", /name: "calendar\.google",\s*everyMinutes: 15,\s*ownBudgetMs: 8_000/.test(regSrc) && (!reg || JSON.stringify(reg).includes("calendar.google")));
  await prisma.calLink.updateMany({ where: { userId: fx.U.a }, data: { lastSyncAt: new Date(Date.now() - 20 * 60_000), leaseUntil: null } });
  const j1 = await google.runGoogleSync(new Date(), { deadline: Date.now() + 60_000, deps: { ...D, scope: { userIds: [fx.U.a, fx.U.b] } } });
  const j2 = await google.runGoogleSync(new Date(), { deadline: Date.now() + 60_000, deps: { ...D, scope: { userIds: [fx.U.a, fx.U.b] } } });
  chk("G10-2", "รอบแรกซิงก์ลิงก์ที่ถึงรอบ · รอบถัดไปภายใน 14 นาที = ไม่ซิงก์ซ้ำ", j1.picked === 1 && j1.ok === 1 && j2.picked === 0, JSON.stringify({ j1, j2 }));
  await prisma.calLink.updateMany({ where: { userId: fx.U.a }, data: { lastSyncAt: null, leaseUntil: new Date(Date.now() + 60_000) } });
  const j3 = await google.runGoogleSync(new Date(), { deadline: Date.now() + 60_000, deps: { ...D, scope: { userIds: [fx.U.a] } } });
  chk("G10-3", "lease ถืออยู่ (ปุ่มรีเฟรช) = job ไม่แตะ", j3.picked === 0);
  await prisma.calLink.updateMany({ where: { userId: fx.U.a }, data: { leaseUntil: null, status: "NEEDS_RECONNECT", lastSyncAt: null } });
  const j4 = await google.runGoogleSync(new Date(), { deadline: Date.now() + 60_000, deps: { ...D, scope: { userIds: [fx.U.a] } } });
  chk("G10-4", "NEEDS_RECONNECT = job ข้าม", j4.picked === 0);
  await prisma.calLink.updateMany({ where: { userId: fx.U.a }, data: { status: "ACTIVE" } });

  // ─────────────── G12 route ───────────────
  console.log("── G12: route calendar/google/* ──");
  const call = async (p: string, method: string, o: { body?: unknown; h?: Record<string, string> } = {}) => {
    const m = (await import(`@/app/api/mobile/secretary/calendar/${p}/route`)) as AnyMod;
    const init: RequestInit = { method, headers: { "content-type": "application/json", ...(o.h ?? {}) } };
    if (method !== "GET" && method !== "DELETE") init.body = JSON.stringify(o.body ?? {});
    const res: Response = await m[method](new Request(`http://qc.local/api/mobile/secretary/calendar/${p}`, init));
    const t = await res.text();
    let body: AnyMod = {};
    try { body = JSON.parse(t); } catch { body = { t }; }
    return { status: res.status, body };
  };
  const paths: [string, string][] = [["google", "GET"], ["google", "PUT"], ["google", "DELETE"], ["google/connect", "POST"], ["google/sync", "POST"]];
  const un: string[] = [];
  for (const [p, m] of paths) {
    const r = await call(p, m);
    if (r.status !== 401 || !thai(r.body.message)) un.push(`${m} ${p}=${r.status}`);
  }
  chk("G12-1", "ไม่ล็อกอิน = 401 ไทย ทุกเส้น (5)", un.length === 0, un.join(","));
  const HB = { authorization: `Bearer ${(await auth.issueMobileToken(fx.U.b)).token}` };
  const HA = { authorization: `Bearer ${(await auth.issueMobileToken(fx.U.a)).token}` };
  const gb = await call("google", "GET", { h: HB });
  const gaDto = await call("google", "GET", { h: HA });
  chk("G12-2", "GET ไม่เชื่อม = {status:NONE} · ไม่ต้องมี x-tenant-id · ของ A ไม่มี token", gb.status === 200 && gb.body.status === "NONE" && gaDto.status === 200 && gaDto.body.status === "ACTIVE" && !/tokenBox|rt-|at-/.test(JSON.stringify(gaDto.body)));
  const strict1 = await call("google", "PUT", { h: HA, body: { exportKinds: ["EVENT"], userId: fx.U.b } });
  const strict2 = await call("google/connect", "POST", { h: HA, body: { serverAuthCode: "x", userId: fx.U.b } });
  chk("G12-3", "body strict: userId = 400 invalid (M3)", strict1.status === 400 && strict2.status === 400);
  const put404 = await call("google", "PUT", { h: HB, body: { exportKinds: ["EVENT"] } });
  chk("G12-4", "PUT ไม่เชื่อม = 404 ไทย · DELETE ไม่เชื่อม = 200", put404.status === 404 && thai(put404.body.message) && (await call("google", "DELETE", { h: HB })).status === 200);
  const sy1 = await call("google/sync", "POST", { h: HB });
  const sy2 = await call("google/sync", "POST", { h: HB });
  chk("G12-5", "sync ไม่เชื่อม = 404 · ครั้งที่ 2 ใน 2 นาที = 429 \"เพิ่งซิงก์ไป รออีกสักครู่\"", sy1.status === 404 && sy2.status === 429 && sy2.body.message === "เพิ่งซิงก์ไป รออีกสักครู่", JSON.stringify([sy1, sy2]));
  const cn = await call("google/connect", "POST", { h: HB, body: { serverAuthCode: "x".repeat(600) } });
  chk("G12-6", "connect code ยาวเกิน = 400 (zod)", cn.status === 400);

  // ─────────────── G11 ยกเลิกเชื่อม ───────────────
  console.log("── G11: ยกเลิกเชื่อม (§10.4) ──");
  const ev2 = await items.createItem(A, { kind: "EVENT", title: "นัดหลังเชื่อมใหม่", startAt: T(3, 10), endAt: T(3, 11) });
  await prisma.calLink.updateMany({ where: { userId: fx.U.a }, data: { leaseUntil: null } });
  await google.syncGoogle(fx.U.a, { deps: D });
  const ex2 = (await prisma.calItem.findUnique({ where: { id: ev2.id } })).externalId;
  const lk = await linkRow();
  await google.disconnectGoogle(fx.U.a, D);
  chk("G11-1", "ลบสำเนาใน Google · revoke refresh token · ลบ CalLink + แคช (cascade) · CalItem externalId ล้าง", !!ex2 && g.st.events.get("me@example.com")?.get(ex2)?.status === "cancelled" && g.st.revoked.includes("rt-good3") && !(await linkRow()) && (await prisma.calExternalEvent.count({ where: { linkId: lk.id } })) === 0 && (await prisma.calItem.findUnique({ where: { id: ev2.id } })).externalId === null);
  chk("G11-2", "ไม่เชื่อมแล้วเรียกซ้ำ = ok", (await google.disconnectGoogle(fx.U.a, D)).ok === true);

  // ─────────────── G13 M3 + ไม่ออกนอกเครื่อง ───────────────
  console.log("── G13: M3 / PDPA ──");
  const src = readFileSync("src/lib/modules/calendar/google.ts", "utf8");
  const qs = [...src.matchAll(/\.cal(Link|ExternalEvent|Item)\.(findMany|findFirst|updateMany|deleteMany|count)\(\{\s*where:\s*\{([^}]*)/g)];
  const bad = qs.filter((m) => !/userId/.test(m[3]!) && !/status: "ACTIVE"/.test(m[3]!)); // runGoogleSync เลือกลิงก์ข้ามผู้ใช้ (§3.3 job)
  chk("G13-1", `ทุก query Cal* ใน google.ts มี userId ใน where (${qs.length} จุด · ยกเว้น job §3.3)`, qs.length >= 15 && bad.length === 0, bad.map((m) => m[0].slice(0, 80)).join(" | "));
  chk("G13-2", "ไม่มีคำขอออกนอกเครื่องถึง Google จริง · token ไม่ปรากฏใน OpsEvent", leaked === 0 && (await prisma.opsEvent.count({ where: { OR: [{ detail: { contains: "rt-good" } }, { message: { contains: "rt-good" } }], createdAt: { gt: new Date(Date.now() - 3_600_000) } } })) === 0);
} catch (e) {
  chk("X", "ไม่โยนระหว่างข้อสอบ", false, errMsg(e) + " " + (e instanceof Error ? e.stack?.split("\n").slice(1, 4).join(" ") : ""));
} finally {
  await prisma.calLink.deleteMany({ where: { userId: { in: [fx.U.a, fx.U.b, NEW] } } }).catch(() => undefined);
  await prisma.calItem.updateMany({ where: { userId: NEW }, data: { externalId: null, externalEtag: null, syncDirty: false } }).catch(() => undefined);
  await prisma.chatRateBucket?.deleteMany?.({ where: { key: { contains: fx.U.b } } }).catch(() => undefined);
  residue = await fx.cleanup();
  if (KEY_SAVED !== undefined) process.env.INTEGRATIONS_CREDENTIALS_KEY = KEY_SAVED;
}
chk("Z", "ลบข้อมูลทดสอบหมด", residue === 0, String(residue));
finish(LABEL, { residue });
