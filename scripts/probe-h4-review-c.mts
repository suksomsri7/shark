// probe-h4-review-c.mts — ผู้ตรวจรอบ 2 (กฎหมาย ร.ร.3/ร.ร.4 · ตม.30 · retention · เช็กอิน race/ความสอดคล้อง H.3/H.5) ใบ H.4 · ร้านชั่วคราว h4rv-* (ลบใน finally) · ไม่แก้ src
// รัน: cd <ทรี> && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h4-review-c.mts
// ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-review-probe · ใบ h.4 §11/§12 ข้อ 3): ย้าย probe ผู้ตรวจเข้าทรีเป็น regression ถาวร (path ตามทรี) ·
//   L3.1 SKIP (เลขบัตรถาวร = หนี้ H.9) · L5.1 retainUntil ไม่ขยับแต่ purge ไม่ลบก่อนวันออกจริง+retainYears (§11.4) · L6.2 dueAt = checkedInAt + 24 ชม. ·
//   R3.2 CAS ผูกวัน (วันเปลี่ยนระหว่างทาง ⇒ NOT_CONFIRMED) · R5.1 SKIP (§12.2 ยกเลิก · หนี้ H.9 ป้ายเตือน) · R7.2 คิวตัดแขกของการจองที่ย้อนเช็กอิน
// ตรวจเฉพาะที่ข้อสอบ qc-svc-h.4 และ probe-h4-b (รอบ 1) ยังไม่ครอบ:
//   L1 คอลัมน์ ร.ร.4 ตามแบบ · L2 แขกของการจองที่ยกเลิก/ไม่มา ยังโผล่ใน ร.ร.4 + คิว ตม.30 · L3 เลขบัตรเลื่อนเมื่อลบแถว · L4 วันเข้าพักในไฟล์ ตม.30 (UTC vs ไทย) ·
//   L5 retainUntil ไม่ขยับตามต่อคืน · L6 ผู้พักที่เพิ่มหลังเช็กเอาต์ = PENDING ไม่มีกำหนด · L7 ส่งออก ตม.30 ของคนที่ยังไม่เข้าพัก · L8 ลงชื่อแทนห้องครอบเฉพาะคนที่มีอยู่ ·
//   R1 เช็กอินใบเดียวกันพร้อมกัน 2 ทาง · R2 เช็กอิน ↔ assignRoom พร้อมกัน · R3 เช็กอิน ↔ ย่นคืน พร้อมกัน (วันเข้า/ออกค้างก่อน tx) · R4 เช็กอิน ↔ เพิ่มผู้พักร่วม พร้อมกัน ·
//   R5 เพิ่มผู้พักระหว่างพักเกิน maxOccupancy · R6 ทางเดิม service.checkIn + ผู้พักลงทะเบียนล่วงหน้า ⇒ ตม.30 ได้กำหนด · R7 undo → hotelToday → เช็กอินใหม่ ตั้งกำหนดใหม่ · R8 undo พร้อมกัน 2 ทาง
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const LABEL = "probe-h4-c";
const SLUG = "h4rv-";
loadSvcQcEnv(LABEL);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
const KEY_FROM_ENV = (process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").trim().length >= 32;
if (!KEY_FROM_ENV) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
process.env.SHARK_AI_KEY = "h4rv-fake-key";
delete process.env.SHARK_AI_MOCK;
// ครอบ fetch: Neon/Bunny/localhost ผ่าน · อื่นบล็อก (ไม่มี AI ในรอบนี้)
const REAL_FETCH = globalThis.fetch;
const BLOCKED: string[] = [];
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech") || /bunnycdn\.com$|b-cdn\.net$/.test(host)) return REAL_FETCH(input, init);
  BLOCKED.push(host);
  return new Response(JSON.stringify({ message: "blocked by probe" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/+$/, "");
const R = new URL("../src/lib", import.meta.url).pathname;
const { prisma } = (await import(`${R}/core/db`)) as Any;
const SB = (await import(`${R}/core/integrations/secret-box`)) as Any;
const STO = (await import(`${R}/storage/service`)) as Any;
const SET = (await import(`${R}/core/settings`)) as Any;
const rooms = (await import(`${R}/modules/rooms`)) as Any;
const CK = (await import(`${R}/modules/hotel/checkin.ts`)) as Any;
const GU = (await import(`${R}/modules/hotel/guest.ts`)) as Any;
const TM = (await import(`${R}/modules/hotel/tm30.ts`)) as Any;
const BK = (await import(`${R}/modules/hotel/booking.ts`)) as Any;
const TP = (await import(`${R}/modules/hotel/tape.ts`)) as Any;
const SVC = (await import(`${R}/modules/hotel/service.ts`)) as Any;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (v: unknown) => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new Date((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // วันนี้ไทย
const W = (n: number) => addDays(T0, n);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const thDate = (ymd: string) => { const [y, m, d] = ymd.split("-"); return `${d}/${m}/${y}`; };
const addYears = (ymd: string, n: number) => `${Number(ymd.slice(0, 4)) + n}${ymd.slice(4)}`;
const checks: { id: string; ok: boolean; note: string }[] = [];
const chk = (id: string, name: string, ok: boolean, note = "") => { checks.push({ id, ok, note }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${note ? ` — ${note}` : ""}`); };
const okRes = (r: Any, what: string) => { if (!r || r.ok !== true) throw new Error(`${what}: ${J(r).slice(0, 300)}`); return r; };
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const skipped: { id: string; reason: string }[] = [];
const skip = (id: string, name: string, reason: string) => { skipped.push({ id, reason }); console.log(`  ⏭️  [${id}] SKIP ${name} — ${reason}`); };
const sec = async (id: string, name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, name, false, `throw: ${errMsg(e)}`); } };
const mkThaiId = (p: string) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(p[i]) * (13 - i); return `${p}${(11 - (s % 11)) % 10}`; };
const read = (p: string) => readFileSync(`${ROOT}/${p}`, "utf8");

const G = {
  thai: { fullName: "H4RVC สมหญิง ทดสอบ", nationality: "THA", idType: "THAI_ID", idNumber: mkThaiId("770770770771"), dob: "1985-02-14", sex: "F", occupation: "H4RVC-OCC", address: "H4RVC-ADDR" },
  thai2: { fullName: "H4RVC สมปอง ทดสอบ", nationality: "THA", idType: "THAI_ID", idNumber: mkThaiId("770770770772"), dob: "1990-10-01", sex: "M" },
  thai3: { fullName: "H4RVC สมศรี ทดสอบ", nationality: "THA", idType: "THAI_ID", idNumber: mkThaiId("770770770773"), dob: "1991-10-01", sex: "F" },
  deu: { fullName: "H4RVC MUELLERX HANSQ", nationality: "DEU", idType: "PASSPORT", idNumber: "H4RC9Q2M1", dob: "1979-06-21", sex: "M", occupation: "Engineer", address: "H4RVC-BERLIN", visaType: "TR", visaNo: "H4RCVISA1", arrivalDate: W(-1), portOfEntry: "BKK", tm6No: "H4RCTM6-1" },
  jpn: { fullName: "H4RVC SATOX HARUKIQ", nationality: "JPN", idType: "PASSPORT", idNumber: "H4RCTR771", dob: "1995-04-04", sex: "M" },
  fra: { fullName: "H4RVC DUBOISX MARIEQ", nationality: "FRA", idType: "PASSPORT", idNumber: "H4RCFR55X", dob: "1992-09-09", sex: "F" },
  gbr: { fullName: "H4RVC SMITHX JOHNQ", nationality: "GBR", idType: "PASSPORT", idNumber: "H4RCGB001", dob: "1980-01-01", sex: "M" },
} as const;

// ───── cleanup ─────
const tenantIds: string[] = [];
let tables: string[] = [];
async function cleanup() {
  if (!tenantIds.length) return;
  try {
    const fa: Any[] = await prisma.fileAsset.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true, tenantId: true } });
    for (const f of fa) { try { await STO.deleteFileAsset({ tenantId: f.tenantId }, f.id); } catch { /* */ } }
  } catch { /* */ }
  await prisma.roomOccupancy.deleteMany({ where: { tenantId: { in: tenantIds } } }); // กฎ r0.8 S-6: ลบ occupancy ก่อนห้องเสมอ
  if (!tables.length) {
    const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
    tables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  }
  let pending = [...tables];
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tenantIds); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด: ${pending.join(",")}`);
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } });
}

type Actor = { role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown>; userId: string };
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { tenantIds.push(...stale.map((t: Any) => t.id)); await cleanup(); tenantIds.length = 0; }
  console.log(`(ฐาน ${process.env.SVC_QC_HOST} · key ${KEY_FROM_ENV ? "จาก .env.qc-svc" : "ตั้งเอง"} · วันนี้ไทย ${T0})`);

  // ───── ร้านชั่วคราว ─────
  const mkTenant = async (name: string) => { const r = await prisma.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("H4 review-c A");
  const ctxA = { tenantId: tA };
  const UH = (await prisma.businessUnit.create({ data: { tenantId: tA, type: "HOTEL", name: "โรงแรม h4rv-c", slug: `u-${uid()}` } })).id as string;
  const RT = (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: UH, name: "ดีลักซ์", rentMode: "NIGHTLY", baseRateSatang: 100_000, capacity: 3, baseOccupancy: 2, maxOccupancy: 3 } })).id as string;
  const ROOM: Record<string, string> = {};
  for (let i = 1; i <= 48; i++) ROOM[`D${i}`] = (await prisma.hotelRoom.create({ data: { tenantId: tA, unitId: UH, number: `D${String(i).padStart(2, "0")}`, roomTypeId: RT, hkStatus: "CLEAN" } })).id as string;
  const sys = await prisma.appSystem.create({ data: { tenantId: tA, type: "POS", name: "POS h4rv-c" } });
  await prisma.appSystemUnit.create({ data: { tenantId: tA, systemId: sys.id, unitId: UH, type: "POS" } });
  const mkMember = async (tag: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `${SLUG}${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@shark.local`, name: `h4rv-c ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId: tA, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const FD = { "hotel.reservation.checkIn": true, "hotel.booking.manage": true, "hotel.guest.register": true, "hotel.reservation.checkOut": true };
  const OWNER = await mkMember("owner", "OWNER", ["*"]);
  const FRONT = await mkMember("front", "STAFF", [UH], FD);
  const FRONT2 = await mkMember("front2", "STAFF", [UH], FD);
  let seq = 0;
  let nextRoom = 1;
  const freeRoom = () => ROOM[`D${nextRoom++}`]!;
  const mkRes = async (o: { ci?: string; co?: string; roomId?: string | null; claim?: boolean; status?: string } = {}) => {
    const ci = o.ci ?? W(0), co = o.co ?? W(2);
    const status = o.status ?? "CONFIRMED";
    const roomId = o.claim === false ? null : (o.roomId ?? freeRoom());
    const rv = await prisma.hotelReservation.create({ data: { tenantId: tA, unitId: UH, code: `H4RC-${RUN}-${++seq}`, status, guestName: "ผู้จอง h4rv-c", guestPhone: "0899990000", roomTypeId: RT, checkInDate: dbDate(ci), checkOutDate: dbDate(co), nights: dayNo(co) - dayNo(ci), adults: 2, source: "WALK_IN", depositSatang: 0, taxSnapshot: { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 }, policySnapshot: {}, ...(roomId ? { roomId } : {}) } });
    for (let d = ci; d < co; d = addDays(d, 1)) await prisma.hotelBookingNight.create({ data: { tenantId: tA, unitId: UH, reservationId: rv.id, roomTypeId: RT, date: dbDate(d), priceSatang: 100_000, counted: true, ...(roomId ? { roomId } : {}) } });
    if (roomId) {
      const c = await prisma.$transaction((tx: Any) => rooms.claimRoom(tx, { tenantId: tA, unitId: UH, roomId, start: ci, end: co, kind: "STAY", refType: "HotelReservation", refId: rv.id, requireRentMode: "NIGHTLY" }));
      if (!c?.ok) throw new Error(`claimRoom ล้ม ${J(c)}`);
    }
    await prisma.hotelFolio.create({ data: { tenantId: tA, unitId: UH, reservationId: rv.id, status: "OPEN", balanceSatang: 0 } });
    return { id: rv.id as string, roomId };
  };
  const rv = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const row = (gid: string) => prisma.hotelGuestRecord.findUnique({ where: { id: gid } }) as Promise<Any>;
  const guestsOf = (id: string) => prisma.hotelGuestRecord.findMany({ where: { reservationId: id }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const occOf = (id: string) => prisma.roomOccupancy.findMany({ where: { refType: "HotelReservation", refId: id, active: true } }) as Promise<Any[]>;
  const checkIn = (actor: Actor, over: Record<string, unknown>) => call(() => CK.checkInV2(actor, ctxA, over));
  const upsert = (actor: Actor, over: Record<string, unknown>) => call(() => GU.upsertGuestRecord(actor, ctxA, over));
  const rr3 = (guestId: string) => call(() => GU.rr3Card({ ...ctxA, userId: FRONT.userId }, { guestId }));
  const rr4 = (from: string, to: string) => call(() => GU.rr4Register(ctxA, { unitId: UH, from, to }));
  const queue = () => call(() => TM.tm30Queue(ctxA, { unitId: UH }));
  const tmExport = (actor: Actor, guestIds: string[]) => call(() => TM.tm30Export(actor, ctxA, { unitId: UH, guestIds, format: "csv" }));
  const csvOf = (r: Any): string[][] => Buffer.from(r.file.bytes).subarray(3).toString("utf8").split(/\r?\n/).filter((l: string) => l.trim()).map((l: string) => l.split(",").map((s: string) => s.replace(/^"|"$/g, "")));
  const inhouse = async (guests: readonly Any[], o: { ci?: string; co?: string; actor?: Actor; extra?: Record<string, unknown> } = {}) => {
    const r = await mkRes({ ci: o.ci, co: o.co });
    const res = okRes(await checkIn(o.actor ?? FRONT, { reservationId: r.id, roomId: r.roomId, guests, ...(o.extra ?? {}) }), "checkInV2");
    return { id: r.id, roomId: r.roomId as string, guestIds: res.guestIds as string[], res };
  };
  const setUnit = async (key: string, value: unknown) => okRes(await SET.setSettings(OWNER, ctxA, [{ key, scope: "UNIT", scopeId: UH, value }]), `ตั้ง ${key}`);
  const resetUnit = async (key: string) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: UH }); } catch { /* */ } };
  const withClock = async <T,>(fn: () => Promise<T>): Promise<T> => { process.env.SVC_QC_CLOCK = "1"; try { return await fn(); } finally { delete process.env.SVC_QC_CLOCK; } };
  const TM30_COLS: string[] = (await SET.resolveSetting(ctxA, "rooms.hotel.tm30.exportColumns", { unitId: UH }))?.value?.map((c: Any) => c.key) ?? [];
  const colIdx = (k: string) => TM30_COLS.indexOf(k);
  await setUnit("rooms.hotel.license.no", "กท.999/2569");
  await setUnit("rooms.hotel.license.name", "โรงแรมทดสอบ h4rv-c");

  // ═════ L1 คอลัมน์ ร.ร.4 ตามแบบท้ายกฎกระทรวง ═════
  console.log("\n── L1 ร.ร.4 คอลัมน์ ──");
  await sec("L1", "ร.ร.4", async () => {
    const a = await inhouse([G.deu]);
    const r4 = okRes(await rr4(W(0), W(0)), "rr4");
    const mine = r4.rows.find((x: Any) => x.guestId === a.guestIds[0]);
    const keys = Object.keys(mine ?? {});
    const want = [["dob/อายุ", /dob|age|birth/i], ["อาชีพ", /occupation/i], ["ที่อยู่", /address/i]] as [string, RegExp][];
    const miss = want.filter(([, re]) => !keys.some((k) => re.test(k))).map(([n]) => n);
    chk("L1.1", "Rr4Row มีคอลัมน์ วันเกิด/อายุ · อาชีพ · ที่อยู่ (ช่องของแบบ ร.ร.4 ท้ายกฎกระทรวง)", miss.length === 0, miss.length ? `ขาด ${miss.join(" · ")} (คีย์ที่มี: ${keys.join(",")})` : "");
    const page = read("src/app/app/u/[unitSlug]/hotel/guests/rr4/print/page.tsx");
    chk("L1.2", "หน้าพิมพ์ ร.ร.4 มีหัวตาราง อาชีพ/ที่อยู่/อายุ", /อาชีพ/.test(page) && /ที่อยู่/.test(page), "หน้าพิมพ์มีเฉพาะ เลขที่บัตร · ชื่อ · สัญชาติ · เอกสาร(4 ตัวท้าย) · ห้อง · เข้า · ออก · มาจาก→ไป · ลงชื่อ");
    const card = okRes(await rr3(a.guestIds[0]!), "rr3");
    chk("L1.3", "ร.ร.3/ร.ร.4 ไม่มีทางพิมพ์เลขเอกสารเต็มแม้ผู้มี viewId (ข้อสังเกตกฎหมาย — สำเนา ร.ร.4 ที่ส่งนายทะเบียนมีแต่ 4 ตัวท้าย)", !J(card).includes(G.deu.idNumber) && !J(r4).includes(G.deu.idNumber), `idMasked=${mine?.idMasked} · ไม่มีตัวเลือก/สิทธิ์พิมพ์เลขเต็มใน rr3Card/rr4Register`);
  });

  // ═════ L2+L7 แขกของการจองที่ยกเลิก/ไม่มา · ส่งออกคนที่ยังไม่เข้าพัก ═════
  console.log("\n── L2/L7 การจองยกเลิก/ไม่มา · ส่งออกก่อนเข้าพัก ──");
  await sec("L2", "ยกเลิก/ไม่มา", async () => {
    const a = await mkRes({ ci: W(1), co: W(3) });
    const u = okRes(await upsert(FRONT, { reservationId: a.id, guest: G.fra }), "ลงทะเบียนล่วงหน้า");
    const g0 = await row(u.guestId);
    chk("L2.0", "ลงทะเบียนล่วงหน้า (CONFIRMED) ⇒ PENDING · ไม่มีกำหนด (ตามมติ builder §7.6)", g0.tm30Status === "PENDING" && g0.tm30DueAt === null, `${g0.tm30Status}/${g0.tm30DueAt}`);
    const ex = await tmExport(FRONT, [u.guestId]);
    const rowsX = ex?.ok ? csvOf(ex) : [];
    chk("L7.1", "tm30Export ของผู้พักที่ยังไม่เข้าพัก (CONFIRMED · พรุ่งนี้) ⇒ ควรปฏิเสธ/เตือน — ได้ไฟล์ที่มีวันเข้าพัก = วันที่วางแผน", ex?.ok !== true, ex?.ok ? `ok:true · วันเข้าพักในไฟล์ = ${rowsX[1]?.[colIdx("checkInDate")]} (ยังไม่เข้าพัก) · AuditLog exported ถูกเขียน` : `${ex?.code}`);
    await prisma.hotelReservation.update({ where: { id: a.id }, data: { status: "CANCELLED" } });
    const r4 = okRes(await rr4(W(1), W(1)), "rr4");
    const inRr4 = r4.rows.some((x: Any) => x.guestId === u.guestId);
    chk("L2.1", "การจองยกเลิกหลังลงทะเบียนล่วงหน้า ⇒ แถวต้องไม่โผล่ใน ร.ร.4 (ทะเบียนผู้พัก = คนที่เข้าพักจริง) หรืออย่างน้อยมีธงบอก", !inRr4 || Object.keys(r4.rows[0] ?? {}).some((k) => /status|cancel/i.test(k)), inRr4 ? `โผล่ใน ร.ร.4 (cardNo=${r4.rows.find((x: Any) => x.guestId === u.guestId)?.cardNo}) · Rr4Row ไม่มี reservationStatus` : "ไม่โผล่");
    const q = okRes(await queue(), "queue");
    const inQ = q.items.find((x: Any) => x.guestId === u.guestId);
    chk("L2.2", "คิว ตม.30 ต้องไม่นับผู้พักของการจองที่ยกเลิก (PENDING ค้างตลอดกาล · ไม่มีกำหนด · ไม่ LATE)", !inQ, inQ ? `อยู่ในคิว status=${inQ.status} dueAt=${inQ.dueAt} checkedIn=${inQ.checkedIn} · pending=${q.pending}` : "");
    // NO_SHOW แบบเดียวกัน
    const b = await mkRes({ ci: W(0), co: W(2) });
    const ub = okRes(await upsert(FRONT, { reservationId: b.id, guest: G.gbr }), "ลงทะเบียนล่วงหน้า 2");
    await prisma.hotelReservation.update({ where: { id: b.id }, data: { status: "NO_SHOW", noShowAt: new Date() } });
    const r4b = okRes(await rr4(W(0), W(0)), "rr4 b");
    const q2 = okRes(await queue(), "queue 2");
    chk("L2.3", "NO_SHOW: แถวไม่โผล่ใน ร.ร.4 และไม่อยู่ในคิว ตม.30", !r4b.rows.some((x: Any) => x.guestId === ub.guestId) && !q2.items.some((x: Any) => x.guestId === ub.guestId), `rr4=${r4b.rows.some((x: Any) => x.guestId === ub.guestId)} queue=${q2.items.some((x: Any) => x.guestId === ub.guestId)}`);
    // แถวของการจองยกเลิก กินเลขลำดับ ร.ร.3
    const c = await inhouse([G.thai2]);
    const card = okRes(await rr3(c.guestIds[0]!), "rr3");
    const seqNo = Number(/-(\d{6})$/.exec(card.cardNo)?.[1]);
    const realGuests = await prisma.hotelGuestRecord.count({ where: { tenantId: tA, unitId: UH, reservation: { status: { in: ["CHECKED_IN", "CHECKED_OUT", "CONFIRMED", "HOLD", "BOOKED"] } } } });
    chk("L2.4", "เลขบัตร ร.ร.3 ของแขกจริงไม่ถูกเลื่อนด้วยแถวของการจองที่ยกเลิก/ไม่มา", seqNo === realGuests, `cardNo=${card.cardNo} · แขกของการจองที่ไม่ถูกยกเลิก=${realGuests} (รวมแถว CANCELLED/NO_SHOW 2 แถวในลำดับ)`);
    // ลบไม่ได้หลัง 10 นาที/คนอื่น ⇒ ไม่มีทางเอาออก
    const d = await call(() => GU.deleteGuestRecord(OWNER, ctxA, { guestId: u.guestId }));
    chk("L2.5", "(ข้อสังเกต) แถวของการจองที่ยกเลิก ลบโดยเจ้าของไม่ได้ (คนละคน/เกิน 10 นาที) ⇒ ค้างใน ร.ร.4/คิวถาวรจนกว่าจะ purge", d?.ok !== true, `${d?.code}`);
  });

  // ═════ L3 เลขบัตร ร.ร.3 เลื่อนเมื่อลบแถวภายใน 10 นาที ═════
  console.log("\n── L3 เลขบัตรเลื่อน ──");
  await sec("L3", "เลขบัตร", async () => {
    const a = await inhouse([G.thai]);
    const b = okRes(await upsert(FRONT2, { reservationId: a.id, guest: G.jpn }), "ผู้พักร่วม b");
    const c = await inhouse([G.thai3], { actor: FRONT });
    const before = okRes(await rr3(c.guestIds[0]!), "rr3 c").cardNo as string;
    // c ลงชื่อแล้ว (บัตรพิมพ์/ลงชื่อไปแล้ว)
    okRes(await call(() => GU.signRr3(FRONT, ctxA, { guestId: c.guestIds[0], method: "PAPER", note: "ลงชื่อแล้ว" })), "sign c");
    okRes(await call(() => GU.deleteGuestRecord(FRONT2, ctxA, { guestId: b.guestId })), "ลบ b");
    const after = okRes(await rr3(c.guestIds[0]!), "rr3 c หลังลบ").cardNo as string;
    skip("L3.1", "ลบแถว b (ภายใน 10 นาที) ⇒ เลขบัตร ร.ร.3 ของ c ที่ลงชื่อ/พิมพ์ไปแล้วไม่เปลี่ยน", `หนี้ H.9 คอลัมน์ cardNo ถาวร (มติ §11.5/§12.3) · ระหว่างนี้เลขตอนลงทะเบียนอยู่ใน AuditLog (L3.2) · รอบนี้ ${before} → ${after}`);
    const au = await prisma.auditLog.findMany({ where: { tenantId: tA, targetId: c.guestIds[0], action: { startsWith: "hotel.guest" } } });
    chk("L3.2", "AuditLog ของแถว c ไม่เก็บ cardNo ไว้ (มติ §2 ข้อ 3 บอก 'เก็บเลขบัตรใน AuditLog' แต่โค้ดไม่เก็บ ⇒ ไม่มีหลักฐานเลขเดิม)", J(au).includes(before), J(au).includes(before) ? "มี cardNo ใน AuditLog" : "ไม่มี cardNo ใน AuditLog ใด ๆ");
  });

  // ═════ L4 วันเข้าพักในไฟล์ ตม.30 — UTC vs ไทย ═════
  console.log("\n── L4 ตม.30 วันเข้าพัก (ไทย) ──");
  await sec("L4", "ตม.30 วันที่", async () => {
    const r = await mkRes({ ci: W(0), co: W(2) });
    const at = `${W(0)}T20:30:00.000Z`; // = W(1) 03:30 เวลาไทย
    const res = await withClock(() => checkIn(FRONT, { reservationId: r.id, roomId: r.roomId, guests: [G.deu], at }));
    okRes(res, "เช็กอินใต้นาฬิกาฉาก");
    const g = await row(res.guestIds[0]);
    chk("L4.0", "checkedInAt = at · tm30DueAt = at + 24 ชม.", Math.abs(Date.parse(res.checkedInAt) - Date.parse(at)) < 5_000 && Math.abs(g.tm30DueAt.getTime() - Date.parse(at) - DAY) < 5_000);
    const ex = okRes(await tmExport(FRONT, [res.guestIds[0]]), "export");
    const rows = csvOf(ex);
    const got = rows[1]?.[colIdx("checkInDate")];
    chk("L4.1", "ไฟล์ ตม.30 คอลัมน์ 'วันเข้าพัก' = วันที่ไทยของ checkedInAt (เช็กอิน 03:30 น. ไทย ⇒ วันนี้ไทย ไม่ใช่วัน UTC เมื่อวาน)", got === thDate(W(1)), `ได้ ${got} · ต้องเป็น ${thDate(W(1))} (tm30.ts ใช้ ymdOfDb(checkedInAt) = วัน UTC)`);
    const card = okRes(await rr3(res.guestIds[0]!), "rr3");
    chk("L4.2", "rr3Card.checkedInAt เป็น ISO (จอแปลง +7 ชม. เอง) · checkIn/checkOut เป็นวัน @db.Date", card.checkedInAt === new Date(at).toISOString() && card.checkIn === W(0) && card.checkOut === W(2), J([card.checkedInAt, card.checkIn, card.checkOut]));
    const exOut = rows[1]?.[colIdx("expectedCheckOut")];
    chk("L4.3", "คอลัมน์ 'วันออก (คาด)' = checkOutDate (@db.Date) ถูกต้อง", exOut === thDate(W(2)), `${exOut}`);
  });

  // ═════ L5 retention vs ต่อคืน ═════
  console.log("\n── L5 retainUntil ↔ ต่อคืน ──");
  await sec("L5", "retention", async () => {
    await setUnit("rooms.hotel.guest.retainYears", 1);
    try {
      const a = await inhouse([G.deu]);
      const g0 = await row(a.guestIds[0]);
      chk("L5.0", "retainYears=1 ⇒ retainUntil = วันออก + 1 ปี", ymdOf(g0.retainUntil) === addYears(W(2), 1), `${ymdOf(g0.retainUntil)}`);
      // จำลองต่อคืน 38 วัน (H.3 extendBooking ไม่แตะ HotelGuestRecord — ตรวจสถิตด้านล่าง)
      await prisma.hotelReservation.update({ where: { id: a.id }, data: { checkOutDate: dbDate(W(40)), nights: 40 } });
      const g1 = await row(a.guestIds[0]);
      // ORACLE-EDIT (ผู้คุม 7 พ.ย. · §11.4/§12.3): retainUntil ไม่ขยับเมื่อต่อคืน = ถูกต้อง — purge ตรวจ "วันออกจริง + retainYears" ตอน purge
      //   ⇒ จำลอง retainUntil พ้นแล้ว (เมื่อวาน) ขณะวันออกจริงยังอีก 40 วัน ⇒ purge ต้องไม่ลบ · คุมผลบวก: ย้ายการจองไปอดีต > 2 ปี ⇒ purge ลบ
      const purgeAll = async (stop: () => Promise<boolean>) => { let n = 0; for (let i = 0; i < 6; i++) { const p = await GU.purgeExpiredGuestRecords({}); n += p.purged; if (p.purged === 0 || (await stop())) break; } return n; };
      await prisma.hotelGuestRecord.update({ where: { id: a.guestIds[0] }, data: { retainUntil: dbDate(W(-1)) } });
      const nNeg = await purgeAll(async () => false);
      const g2 = await row(a.guestIds[0]);
      chk("L5.1", "ต่อคืนแล้ว retainUntil ไม่ขยับ (= วันออกเดิม + 1 ปี) · retainUntil พ้นแล้วแต่วันออกจริง + 1 ปี ยังไม่ถึง ⇒ purge ไม่ลบ (กล่องลับคง)", ymdOf(g1.retainUntil) === addYears(W(2), 1) && !!g2.idNumberEnc, `retainUntil=${ymdOf(g1.retainUntil)} · วันออกจริง=${W(40)} · purge รวม ${nNeg} · enc ${g2.idNumberEnc ? "คง" : "ถูกลบ"}`);
      await prisma.hotelReservation.update({ where: { id: a.id }, data: { checkInDate: dbDate(W(-800)), checkOutDate: dbDate(W(-798)), nights: 2 } });
      const nPos = await purgeAll(async () => !(await row(a.guestIds[0])).idNumberEnc);
      const g3 = await row(a.guestIds[0]);
      chk("L5.1p", "คุมผลบวก: วันออกจริงอยู่อดีต > 2 ปี + retainUntil พ้น ⇒ purge ลบกล่องลับ", g3.idNumberEnc === null, `purge รวม ${nPos}`);
      const bk = read("src/lib/modules/hotel/booking.ts"), co = read("src/lib/modules/hotel/checkout.ts");
      chk("L5.2", "(สถิต) booking.ts/checkout.ts ไม่แตะ HotelGuestRecord/retainUntil ⇒ ต่อคืน/ย่นคืน/เช็กเอาต์ไม่ปรับ retainUntil (ยืนยันหนี้)", !/hotelGuestRecord|retainUntil/.test(bk) && !/hotelGuestRecord|retainUntil/.test(co), "ไม่มีการอ้างถึง — purge ตัดสินจาก retainUntil อย่างเดียว");
    } finally { await resetUnit("rooms.hotel.guest.retainYears"); }
    const b = await inhouse([G.jpn]);
    const gb = await row(b.guestIds[0]);
    chk("L5.3", "ค่าเริ่ม 2 ปี ⇒ retainUntil = วันออก + 2 ปี (ยังเหลือเผื่อ ≥ 1 ปีแม้ต่อคืน < 1 ปี)", ymdOf(gb.retainUntil) === addYears(W(2), 2), `${ymdOf(gb.retainUntil)}`);
  });

  // ═════ L6 ผู้พักที่เพิ่มหลังเช็กเอาต์ ═════
  console.log("\n── L6 เพิ่มผู้พักหลังเช็กเอาต์ ──");
  await sec("L6", "หลังเช็กเอาต์", async () => {
    const a = await inhouse([G.thai], { co: W(1) });
    await prisma.hotelReservation.update({ where: { id: a.id }, data: { status: "CHECKED_OUT", checkedOutAt: new Date() } });
    const u = okRes(await upsert(OWNER, { reservationId: a.id, guest: G.fra }), "เพิ่มหลังออก (OWNER)");
    const g = await row(u.guestId);
    const sw = await call(() => TM.tm30Sweep({}));
    const g2 = await row(u.guestId);
    chk("L6.1", "ต่างด้าวที่เพิ่มหลังเช็กเอาต์ (พักจริงแล้วออกแล้ว) ⇒ ควรมีกำหนด/LATE ทันที — ได้ PENDING ไม่มีกำหนด · sweep ไม่ทำให้ LATE", g.tm30DueAt !== null || g2.tm30Status === "LATE", `status=${g2.tm30Status} dueAt=${g.tm30DueAt} sweep=${J(sw).slice(0, 60)}`);
    const q = okRes(await queue(), "queue");
    const it = q.items.find((x: Any) => x.guestId === u.guestId);
    const rva = await rv(a.id);
    // ORACLE-EDIT (ผู้คุม 7 พ.ย. · §11.5/§12.3): ต่างด้าวเพิ่มหลังเช็กเอาต์ ⇒ เวลาเข้าพัก = checkedInAt ของการจอง ⇒ dueAt = checkedInAt + 24 ชม.
    chk("L6.2", "คิวแสดงแถวนี้เป็น 'เช็กอินแล้ว' (checkedIn true) · dueAt = checkedInAt ของการจอง + 24 ชม.", !!it && it.checkedIn === true && it.dueAt !== null && !!rva?.checkedInAt && Math.abs(Date.parse(it.dueAt) - rva.checkedInAt.getTime() - DAY) < 5_000, `${J(it?.dueAt ?? null)} vs checkedInAt ${rva?.checkedInAt?.toISOString() ?? null}`);
  });

  // ═════ L8 ลงชื่อแทนห้อง ครอบเฉพาะคนที่มีอยู่ ═════
  console.log("\n── L8 ลงชื่อแทนห้อง ──");
  await sec("L8", "ลงชื่อแทนห้อง", async () => {
    const a = await inhouse([G.thai, G.thai2]);
    okRes(await call(() => GU.signRr3(FRONT, ctxA, { guestId: a.guestIds[0], method: "PAPER", note: "ลงชื่อแล้ว" })), "หลักลงชื่อ");
    const u = okRes(await upsert(FRONT, { reservationId: a.id, guest: G.jpn }), "เพิ่มผู้พักร่วมทีหลัง");
    const [g1, g2, g3] = [await row(a.guestIds[0]), await row(a.guestIds[1]), await row(u.guestId)];
    chk("L8.1", "หลัก + ผู้พักร่วมที่มีอยู่ตอนลงชื่อ ⇒ rr3SignedAt ตั้ง · ผู้พักร่วมที่เพิ่มทีหลัง ⇒ ยังไม่ลงชื่อ (มติ §10.4)", !!g1.rr3SignedAt && !!g2.rr3SignedAt && g3.rr3SignedAt === null);
    const c3 = okRes(await rr3(u.guestId), "rr3 คนใหม่");
    const r4 = okRes(await rr4(W(0), W(0)), "rr4");
    const r4row = r4.rows.find((x: Any) => x.guestId === u.guestId);
    chk("L8.2", "rr3Card/ร.ร.4 ของคนใหม่: signed=false · ไม่อ้างลายเซ็นคนอื่น", c3.signed === false && c3.signedByGuestId === null && c3.signatureUrl === null && r4row?.signed === false, J([c3.signed, c3.signedByGuestId, r4row?.signed]));
    okRes(await call(() => GU.signRr3(FRONT, ctxA, { guestId: u.guestId, method: "PAPER", note: "ลงชื่อแล้ว" })), "คนใหม่ลงชื่อ");
    chk("L8.3", "คนใหม่ลงชื่อเอง ⇒ ตั้งเฉพาะตัวเอง (คนอื่นไม่เปลี่ยน)", !!(await row(u.guestId)).rr3SignedAt && (await row(a.guestIds[0])).rr3SignedAt.getTime() === g1.rr3SignedAt.getTime());
  });

  // ═════ R1 เช็กอินใบเดียวกันพร้อมกัน 2 ทาง (คนละห้อง) ═════
  console.log("\n── R1 ใบเดียวกัน 2 ทาง ──");
  await sec("R1", "ใบเดียวกัน", async () => {
    const r = await mkRes({ claim: false });
    const [ra, rb] = [freeRoom(), freeRoom()];
    const e0 = await prisma.outboxEvent.count({ where: { tenantId: tA, type: "hotel.checked_in" } });
    const out = await Promise.all([checkIn(FRONT, { reservationId: r.id, roomId: ra, guests: [G.thai] }), checkIn(FRONT2, { reservationId: r.id, roomId: rb, guests: [G.thai2] })]);
    const oks = out.filter((x) => x?.ok === true).length;
    const other = out.find((x) => x?.ok !== true);
    const gs = await guestsOf(r.id);
    const occ = await occOf(r.id);
    const e1 = await prisma.outboxEvent.count({ where: { tenantId: tA, type: "hotel.checked_in" } });
    const occupied = await prisma.hotelRoom.count({ where: { id: { in: [ra, rb] }, status: "OCCUPIED" } });
    chk("R1.1", "2 คนเช็กอินใบเดียวกันพร้อมกัน (คนละห้อง) ⇒ สำเร็จ 1 · อีกทาง NOT_CONFIRMED/BUSY · ทะเบียน 1 คน (ไม่ซ้ำ) · occupancy 1 · event checked_in 1 · ห้อง OCCUPIED 1 ห้อง", oks === 1 && ["NOT_CONFIRMED", "BUSY", "ROOM_TAKEN"].includes(other?.code) && gs.length === 1 && occ.length === 1 && e1 - e0 === 1 && occupied === 1, `${out.map((x) => (x?.ok ? "ok" : x?.code)).join("/")} · แขก=${gs.length} occ=${occ.length} ev=${e1 - e0} occupied=${occupied}`);
    const rvv = await rv(r.id);
    chk("R1.2", "roomId ของการจอง = ห้องของ occupancy = nights.roomId", rvv.roomId === occ[0]?.roomId && (await prisma.hotelBookingNight.findMany({ where: { reservationId: r.id, counted: true } })).every((n: Any) => n.roomId === occ[0]?.roomId), `${rvv.roomId === occ[0]?.roomId}`);
  });

  // ═════ R2 เช็กอิน ↔ assignRoom (H.3) พร้อมกัน ═════
  console.log("\n── R2 เช็กอิน ↔ assignRoom ──");
  await sec("R2", "assignRoom", async () => {
    const outcomes: string[] = [];
    let bad = "";
    for (let i = 0; i < 3 && !bad; i++) {
      const r = await mkRes({});
      const target = freeRoom();
      const [ci, as] = await Promise.all([checkIn(FRONT, { reservationId: r.id, roomId: r.roomId, guests: [G.thai] }), call(() => BK.assignRoom(OWNER, ctxA, { unitId: UH, reservationId: r.id, roomId: target }))]);
      const rvv = await rv(r.id);
      const occ = await occOf(r.id);
      const nights = await prisma.hotelBookingNight.findMany({ where: { reservationId: r.id, counted: true } });
      const dup = await prisma.roomOccupancy.count({ where: { roomId: { in: [r.roomId!, target] }, active: true, startDate: { lt: dbDate(W(2)) }, endDate: { gt: dbDate(W(0)) } } });
      outcomes.push(`${ci?.ok ? "ci-ok" : ci?.code}+${as?.ok ? "assign-ok" : as?.code}`);
      const consistent = occ.length === 1 && rvv.roomId === occ[0].roomId && nights.every((n: Any) => n.roomId === occ[0].roomId) && dup === 1 && (ci?.ok ? rvv.status === "CHECKED_IN" && occ[0].kind === "STAY" : rvv.status === "CONFIRMED");
      if (!consistent) bad = `รอบ ${i + 1}: status=${rvv.status} rv.roomId=${rvv.roomId} occ=${J(occ.map((o: Any) => [o.kind, o.roomId]))} nights=${J([...new Set(nights.map((n: Any) => n.roomId))])} dupOnRooms=${dup}`;
    }
    chk("R2.1", "เช็กอิน ↔ assignRoom พร้อมกัน ×3 ⇒ ทุกครั้ง occupancy 1 แถว · rv.roomId = occ.roomId = nights.roomId · ไม่มี occupancy ซ้อนบน 2 ห้อง · ไม่มี throw ดิบ", !bad && outcomes.every((o) => !/THROW/.test(o)), `${outcomes.join(" · ")}${bad ? ` · ${bad}` : ""}`);
  });

  // ═════ R3 เช็กอิน ↔ ย่นคืน พร้อมกัน (วันเข้า/ออกอ่านก่อน tx) ═════
  console.log("\n── R3 เช็กอิน ↔ shortenBooking ──");
  await sec("R3", "shorten", async () => {
    let shown: string | null = null;
    const outcomes: string[] = [];
    for (let i = 0; i < 6 && shown === null; i++) {
      const r = await mkRes({ claim: false, ci: W(0), co: W(3) });
      const room = freeRoom();
      const [ci, sh] = await Promise.all([checkIn(FRONT, { reservationId: r.id, roomId: room, guests: [G.thai] }), call(() => BK.shortenBooking(OWNER, ctxA, { unitId: UH, reservationId: r.id, newCheckOut: W(2) }))]);
      const rvv = await rv(r.id);
      const occ = await occOf(r.id);
      outcomes.push(`${ci?.ok ? "ci-ok" : ci?.code}+${sh?.ok ? "sh-ok" : sh?.code}`);
      if (ci?.ok && sh?.ok) {
        const occEnd = ymdOf(occ[0]?.endDate);
        const rvEnd = ymdOf(rvv.checkOutDate);
        const nightsBeyond = await prisma.hotelBookingNight.count({ where: { reservationId: r.id, roomId: room, date: { gte: rvv.checkOutDate } } });
        if (occEnd !== rvEnd) shown = `ย่นคืนชนะก่อน ⇒ เช็กอินถือห้อง ${occEnd} (ช่วงเก่า) แต่การจองออก ${rvEnd} · คืนที่เลิกนับแต่มี roomId=${nightsBeyond}`;
        else shown = "";
      }
    }
    chk("R3.1", "เช็กอิน ↔ ย่นคืน พร้อมกัน: เมื่อทั้งคู่สำเร็จ occupancy.endDate ต้องเท่ากับ checkOutDate ใหม่ (checkInCore ใช้ ci/co ที่อ่านก่อน tx · CAS ไม่ตรวจวันที่)", shown === "" || shown === null, shown ? shown : shown === "" ? `ทั้งคู่สำเร็จ · occupancy.endDate = checkOutDate ใหม่: ${outcomes.join(" · ")}` : `ไม่เกิดกรณีทั้งคู่สำเร็จใน 6 รอบ: ${outcomes.join(" · ")}`);
    // ORACLE-EDIT (ผู้คุม 7 พ.ย. · §11.5/§12.3): คาด CAS ผูกวัน — สถิต (อ่านแถวซ้ำหลังล็อก + CAS มีเงื่อนไขวัน) + จริง (อีก tx ย่นคืนถือแถวค้างไว้ ⇒ เช็กอินรอแล้ว CAS ไม่ตรง ⇒ NOT_CONFIRMED)
    const ckSrc = read("src/lib/modules/hotel/checkin.ts");
    const lockAt = ckSrc.indexOf("pg_advisory_xact_lock"), reReadAt = ckSrc.indexOf("const cur = await tx.hotelReservation.findFirst"), casAt = ckSrc.search(/status: \{ in: \["CONFIRMED", "BOOKED"\] \}, checkInDate: cur\.checkInDate, checkOutDate: cur\.checkOutDate \}/);
    const staticOk = lockAt > 0 && reReadAt > lockAt && casAt > reReadAt;
    const r = await mkRes({ claim: false, ci: W(0), co: W(3) });
    const room = freeRoom();
    let held!: () => void;
    const heldP = new Promise<void>((res) => { held = res; });
    let release!: () => void;
    const releaseP = new Promise<void>((res) => { release = res; });
    let holdErr = "";
    const holder = prisma.$transaction(async (tx: Any) => { await tx.hotelReservation.update({ where: { id: r.id }, data: { checkOutDate: dbDate(W(2)), nights: 2 } }); held(); await releaseP; }, { maxWait: 10_000, timeout: 30_000 }).catch((e: unknown) => { holdErr = errMsg(e); held(); });
    await heldP;
    const ciP = checkIn(FRONT, { reservationId: r.id, roomId: room, guests: [G.thai] });
    await new Promise((res) => setTimeout(res, 5_000));
    release();
    await holder;
    const ci = await ciP;
    const after = await rv(r.id);
    const occ = await occOf(r.id);
    const gs = await guestsOf(r.id);
    chk("R3.2", "CAS ผูกวัน: checkInCore อ่านการจองซ้ำหลังล็อก + CAS มีเงื่อนไข checkInDate/checkOutDate · วันเปลี่ยนระหว่างทาง (อีก tx ย่นคืนถือแถวไว้) ⇒ NOT_CONFIRMED · การจองยัง CONFIRMED วันออกใหม่ · ไม่มี occupancy/แขก", staticOk && !holdErr && ci?.code === "NOT_CONFIRMED" && after?.status === "CONFIRMED" && ymdOf(after?.checkOutDate) === W(2) && occ.length === 0 && gs.length === 0, `static=${staticOk} hold=${holdErr || "ok"} ci=${ci?.ok ? "ok" : ci?.code} status=${after?.status} co=${ymdOf(after?.checkOutDate)} occ=${occ.length} แขก=${gs.length} · R3.1 ${outcomes.join(" · ")}`);
  });

  // ═════ R4 เช็กอิน ↔ เพิ่มผู้พักร่วม พร้อมกัน ═════
  console.log("\n── R4 เช็กอิน ↔ upsert ──");
  await sec("R4", "upsert race", async () => {
    let found: string | null = null;
    const outcomes: string[] = [];
    for (let i = 0; i < 6 && found === null; i++) {
      const r = await mkRes({});
      const [ci, up] = await Promise.all([checkIn(FRONT, { reservationId: r.id, roomId: r.roomId, guests: [G.thai] }), upsert(FRONT2, { reservationId: r.id, guest: G.deu })]);
      outcomes.push(`${ci?.ok ? "ci-ok" : ci?.code}+${up?.ok ? "up-ok" : up?.code}`);
      if (ci?.ok && up?.ok) {
        const g = await row(up.guestId);
        const rvv = await rv(r.id);
        if (rvv.status === "CHECKED_IN" && g.tm30Status === "PENDING" && g.tm30DueAt === null) found = `ผู้พักร่วม DEU ของการจอง CHECKED_IN มี tm30DueAt ว่าง (upsert อ่าน status ก่อน tx ⇒ ถือว่ายังไม่เข้าพัก) · คิวจะไม่เตือน/ไม่ LATE จนกว่า undo+เช็กอินใหม่`;
        else found = "";
      }
    }
    chk("R4.1", "เช็กอิน ↔ เพิ่มผู้พักร่วมต่างด้าวพร้อมกัน ⇒ ผู้พักร่วมต้องได้กำหนด ตม.30 (ไม่ค้าง PENDING ไม่มีกำหนด)", found === "" || found === null, found ? found : found === "" ? `ทั้งคู่สำเร็จ · ผู้พักร่วมได้กำหนด ตม.30: ${outcomes.join(" · ")}` : `ไม่เกิดกรณีทั้งคู่สำเร็จใน 6 รอบ: ${outcomes.join(" · ")}`);
  });

  // ═════ R5 เพิ่มผู้พักระหว่างพักเกิน maxOccupancy ═════
  console.log("\n── R5 maxOccupancy ตอน upsert ──");
  skip("R5.1", "เพิ่มผู้พักระหว่างพักเกิน maxOccupancy ⇒ OVER_OCCUPANCY", "มติ §12.2 ยกเลิกสำหรับ v1 (ด่านเกินอยู่ที่ checkInV2 CI-12) — หนี้ H.9 ป้ายเตือน \"เกินจำนวนผู้เข้าพักที่กำหนด\" บนแผงแขก (ไม่บล็อก)");

  // ═════ R6 ทางเดิม service.checkIn + ผู้พักลงทะเบียนล่วงหน้า ═════
  console.log("\n── R6 ทางเดิม + ลงทะเบียนล่วงหน้า ──");
  await sec("R6", "legacy", async () => {
    const r = await mkRes({});
    const u = okRes(await upsert(FRONT, { reservationId: r.id, guest: G.deu }), "ลงทะเบียนล่วงหน้า");
    const t0 = Date.now();
    const x = await call(() => SVC.checkIn(tA, UH, r.id, r.roomId));
    const g = await row(u.guestId);
    const rvv = await rv(r.id);
    chk("R6.1", "service.checkIn เดิม (requireRegistration เปิด) มีผู้พักลงทะเบียนล่วงหน้า ⇒ ok · CHECKED_IN · ตม.30 ของต่างด้าว PENDING ได้กำหนด = checkedInAt + 24 ชม.", x?.ok === true && rvv.status === "CHECKED_IN" && g.tm30Status === "PENDING" && !!g.tm30DueAt && Math.abs(g.tm30DueAt.getTime() - rvv.checkedInAt.getTime() - DAY) < 5_000 && Math.abs(rvv.checkedInAt.getTime() - t0) < 60_000, `${J(x)} due=${g.tm30DueAt?.toISOString()}`);
    const au = await prisma.auditLog.findFirst({ where: { tenantId: tA, action: "hotel.reservation.checked_in", targetId: r.id } });
    chk("R6.2", "AuditLog ทางเดิมระบุ via LEGACY_CHECKIN · actorType SYSTEM (ไม่มีผู้กระทำ — ร.ร.3 ไม่รู้ว่าใครเช็กอิน)", au?.after?.via === "LEGACY_CHECKIN" && au?.actorType === "SYSTEM", J([au?.after?.via, au?.actorType]));
  });

  // ═════ R7 undo → hotelToday → เช็กอินใหม่ ═════
  console.log("\n── R7 undo → hotelToday → เช็กอินใหม่ ──");
  await sec("R7", "undo", async () => {
    const a = await inhouse([G.jpn]);
    const g0 = await row(a.guestIds[0]);
    const h0 = okRes(await call(() => TP.hotelToday(ctxA, { unitId: UH })), "hotelToday");
    okRes(await call(() => CK.undoCheckIn(OWNER, ctxA, { reservationId: a.id, reason: "เช็กอินผิดใบ h4rv-c" })), "undo");
    const h1 = okRes(await call(() => TP.hotelToday(ctxA, { unitId: UH })), "hotelToday 2");
    const occ = await occOf(a.id);
    chk("R7.1", "หลัง undo: hotelToday arrivals +1 (กลับเป็น 'เข้าวันนี้') · occupancy ยังถือห้อง 1 แถว · ห้องไม่ OCCUPIED", h1.arrivals === h0.arrivals + 1 && occ.length === 1 && (await prisma.hotelRoom.findUnique({ where: { id: a.roomId } })).status !== "OCCUPIED", `arrivals ${h0.arrivals}→${h1.arrivals} occ=${J(occ.map((o: Any) => o.kind))}`);
    // ORACLE-EDIT (ผู้คุม 7 พ.ย. · §11.2/§12.3): คิว ตม.30 นับเฉพาะผู้พักจริง (CHECKED_IN/CHECKED_OUT/REFUNDED) ⇒ แขกของการจองที่ย้อนเช็กอิน (CONFIRMED) ไม่อยู่ในคิว
    const q7 = okRes(await queue(), "q");
    chk("R7.2", "หลัง undo: ตม.30 PENDING ไม่มีกำหนด · คิว ตม.30 ไม่แสดงแขกของการจองที่ย้อนเช็กอิน", (await row(a.guestIds[0])).tm30DueAt === null && !q7.items.some((x: Any) => x.guestId === a.guestIds[0]), `ในคิว=${q7.items.some((x: Any) => x.guestId === a.guestIds[0])}`);
    const t0 = Date.now();
    const again = await checkIn(FRONT, { reservationId: a.id, roomId: a.roomId, guests: [] });
    const g1 = await row(a.guestIds[0]);
    chk("R7.3", "เช็กอินใหม่โดยไม่ส่งแขก (ทะเบียนเดิมมีอยู่) ⇒ ok · ตม.30 ได้กำหนดใหม่ = checkedInAt ใหม่ + 24 ชม. (ไม่ใช่ของเดิม)", again?.ok === true && !!g1.tm30DueAt && Math.abs(g1.tm30DueAt.getTime() - t0 - DAY) < 60_000 && g1.tm30DueAt.getTime() !== g0.tm30DueAt?.getTime(), `${again?.ok ? "ok" : again?.code} due=${g1.tm30DueAt?.toISOString()}`);
    const occ2 = await occOf(a.id);
    chk("R7.4", "เช็กอินใหม่: occupancy ยัง 1 แถว STAY ห้องเดิม · event checked_in ของใบนี้ 2 แถว (คนละ idempotencyKey)", occ2.length === 1 && occ2[0].kind === "STAY" && occ2[0].roomId === a.roomId && (await prisma.outboxEvent.count({ where: { tenantId: tA, type: "hotel.checked_in", payload: { path: ["reservationId"], equals: a.id } } })) === 2);
  });

  // ═════ R8 undo พร้อมกัน 2 ทาง ═════
  console.log("\n── R8 undo 2 ทาง ──");
  await sec("R8", "undo race", async () => {
    const a = await inhouse([G.thai]);
    const out = await Promise.all([0, 1].map(() => call(() => CK.undoCheckIn(OWNER, ctxA, { reservationId: a.id, reason: "ทดสอบ undo พร้อมกัน" }))));
    const oks = out.filter((x) => x?.ok === true).length;
    const au = await prisma.auditLog.count({ where: { tenantId: tA, action: "hotel.reservation.check_in_undone", targetId: a.id } });
    chk("R8.1", "undo พร้อมกัน 2 ทาง ⇒ สำเร็จ 1 · อีกทาง INVALID_STATUS/BUSY · AuditLog undo 1 แถว", oks === 1 && au === 1 && out.some((x) => ["INVALID_STATUS", "BUSY"].includes(x?.code)), `${out.map((x) => (x?.ok ? "ok" : x?.code)).join("/")} au=${au}`);
  });

  chk("Z.1", "ไม่มี fetch ออกนอก", BLOCKED.length === 0, J(BLOCKED));
} catch (e) {
  console.log(`\n🔴 probe ล้มกลางคัน: ${errMsg(e)}`);
  checks.push({ id: "X", ok: false, note: errMsg(e) });
} finally {
  try { await cleanup(); console.log(`\n(cleanup h4rv-* เสร็จ · tenant ${tenantIds.length})`); } catch (e) { console.log(`⚠️ cleanup: ${errMsg(e)}`); }
  const fails = checks.filter((c) => !c.ok);
  console.log(`\nJSON_SUMMARY ${JSON.stringify({ label: LABEL, pass: checks.length - fails.length, total: checks.length, failed: fails.map((f) => f.id), skipped: skipped.map((s) => s.id) })}`);
  try { await prisma.$disconnect(); } catch { /* */ }
  process.exit(fails.length ? 1 : 0);
}
