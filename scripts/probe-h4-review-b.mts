// probe-h4-review-b.mts — ผู้ตรวจรอบ 1 (PDPA · ไฟล์ · เข้ารหัส · log) ใบ H.4 · ร้านชั่วคราว h4rv-* (ลบใน finally) · อ่าน/เขียนเฉพาะร้านของตัวเอง · ไม่แก้ src
// รัน: cd <ทรี> && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h4-review-b.mts
// ORACLE-EDIT (ผู้คุม 7 พ.ย. · h4-review-probe · ใบ h.4 §11/§12 ข้อ 3): ย้าย probe ผู้ตรวจเข้าทรีเป็น regression ถาวร (path ตามทรี) ·
//   E3.3 SKIP (CDN เสิร์ฟ path private = Q-H4-3 นอกใบ) · E3.6 ไม่ส่ง ctx.userId ⇒ ไม่มีลิงก์ (m4) · E5 ย้ายการจองไปอดีต > 2 ปี (purge §11.4) · E5.6 purge ล้าง dob/มาจาก/ไปต่อ (m1)
// ตรวจเฉพาะที่ข้อสอบ qc-svc-h.4 ยังไม่ครอบ: AAD/nonce ย้ายกล่องข้ามแถว · กุญแจหาย/ผิดตอนเช็กอิน+ส่งออก ตม.30 · ชื่อ/เลขดิบใน log รันจริง (console) + AiCreditTxn/OpsEvent ·
//   URL สาธารณะของไฟล์ private · ลิงก์หมดอายุ · keepIdImage=false ไม่อัป · ลบแถว/purge ลบไฟล์จริง · undo คงทะเบียน · AI ส่งรูปไปไหน/เขียนอะไร · error ไม่ echo เลข · ค้นด้วยเลขเต็มไม่เจอ · maskIdForStaff=false · race 2 ทาง
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const LABEL = "probe-h4-b";
const SLUG = "h4rv-";
loadSvcQcEnv(LABEL);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
const KEY_FROM_ENV = (process.env.INTEGRATIONS_CREDENTIALS_KEY ?? "").trim().length >= 32;
if (!KEY_FROM_ENV) process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
process.env.SHARK_AI_KEY = "h4rv-fake-key";
delete process.env.SHARK_AI_MOCK;
delete process.env.SHARK_AI_MODEL;

// ───── จับ console ทั้งโพรเซส (ดูว่าโค้ดของใบ log เลข/ชื่อแขกไหม) ─────
const CONSOLE_BUF: string[] = [];
for (const k of ["log", "error", "warn", "info", "debug"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => { CONSOLE_BUF.push(a.map((x) => (typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(" ")); orig(...a); };
}
// ───── ครอบ fetch: openrouter = ตัวจำลอง · Neon/Bunny/CDN ผ่าน · อื่นบล็อก ─────
const OR_REQS: { auth: string; body: Any }[] = [];
const BLOCKED: string[] = [];
const CDN_HOST = (() => { try { return new URL(process.env.SHARK_BUNNY_CDN ?? "").hostname; } catch { return ""; } })();
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech") || /bunnycdn\.com$|b-cdn\.net$/.test(host) || (CDN_HOST && host === CDN_HOST)) return REAL_FETCH(input, init);
  if (host === "openrouter.ai") {
    let body: Any = null; try { body = JSON.parse(String(init?.body ?? "null")); } catch { body = null; }
    const h = init?.headers ?? {};
    OR_REQS.push({ auth: String((h as Any).Authorization ?? (h as Any).authorization ?? ""), body });
    const content = JSON.stringify({ fullName: "WEBER, DANIEL", nationality: "DEU", idNumber: "C01X4KJ77", dob: "1986-03-12", docType: "PASSPORT", expiry: "2031-03-11", sex: "M", confidence: 0.9 });
    return new Response(JSON.stringify({ model: "anthropic/claude-sonnet-5", choices: [{ message: { content } }], usage: { prompt_tokens: 1500, completion_tokens: 50 } }), { status: 200, headers: { "content-type": "application/json" } });
  }
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
const AI = (await import(`${R}/modules/hotel/guest-id-ai.ts`)) as Any;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (v: unknown) => { try { return JSON.stringify(v) ?? String(v); } catch { return String(v); } };
const uid = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const RUN = uid();
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new Date((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(T0, n);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const checks: { id: string; ok: boolean; note: string }[] = [];
const chk = (id: string, name: string, ok: boolean, note = "") => { checks.push({ id, ok, note }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${note ? ` — ${note}` : ""}`); };
const okRes = (r: Any, what: string) => { if (!r || r.ok !== true) throw new Error(`${what}: ${J(r).slice(0, 300)}`); return r; };
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const skipped: { id: string; reason: string }[] = [];
const skip = (id: string, name: string, reason: string) => { skipped.push({ id, reason }); console.log(`  ⏭️  [${id}] SKIP ${name} — ${reason}`); };
const sec = async (id: string, name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { chk(id, name, false, `throw: ${errMsg(e)}`); } };
const mkThaiId = (p: string) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(p[i]) * (13 - i); return `${p}${(11 - (s % 11)) % 10}`; };
// PNG 1×1 ถูกต้อง
const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, "ascii"), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
const makePng = (seed = 1): Uint8Array => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2; return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from([0, seed & 255, (seed * 7) & 255, (seed * 13) & 255]))), chunk("IEND", Buffer.alloc(0))])); };
const PNG = { data: makePng(1), contentType: "image/png" };
const PNG2 = { data: makePng(2), contentType: "image/png" };

// ───── แขกทดสอบ: ชื่อ/เลขไม่ซ้ำใคร (ใช้ค้นหาการรั่ว) ─────
const N_THAI = mkThaiId("770770770770");
const N_DEU = "H4RV9Q2M1"; // พาสปอร์ต 9 ตัว
const N_JPN = "H4RVTR771";
const N_FRA = "H4RVFR55X";
const G = {
  thai: { fullName: "H4RV ALPHAZETA SOMYING", nationality: "THA", idType: "THAI_ID", idNumber: N_THAI, dob: "1985-02-14", sex: "F", occupation: "H4RV-OCC-PRIVATE", address: "H4RV-ADDR-PRIVATE" },
  deu: { fullName: "H4RV MUELLERX HANSQ", nationality: "DEU", idType: "PASSPORT", idNumber: N_DEU, dob: "1979-06-21", sex: "M", occupation: "Engineer", address: "H4RV-BERLIN-ADDR", visaType: "TR", visaNo: "H4RVVISA1", arrivalDate: W(-1), portOfEntry: "BKK", tm6No: "H4RVTM6-1" },
  jpn: { fullName: "H4RV SATOX HARUKIQ", nationality: "JPN", idType: "PASSPORT", idNumber: N_JPN, dob: "1995-04-04", sex: "M" },
  fra: { fullName: "H4RV DUBOISX MARIEQ", nationality: "FRA", idType: "PASSPORT", idNumber: N_FRA, dob: "1992-09-09", sex: "F" },
} as const;
const RAWS = [N_THAI, N_DEU, N_JPN, N_FRA, "C01X4KJ77", "H4RV-ADDR-PRIVATE", "H4RVVISA1", "H4RVTM6-1", "H4RV-BERLIN-ADDR"];
const NAMES = Object.values(G).map((g) => g.fullName);
const leaks = (text: string, xs: readonly string[] = RAWS) => xs.filter((r) => text.includes(r));

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
const IDS: Record<string, Any> = {};
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { tenantIds.push(...stale.map((t: Any) => t.id)); await cleanup(); tenantIds.length = 0; }
  console.log(`(ฐาน ${process.env.SVC_QC_HOST} · key ${KEY_FROM_ENV ? "จาก .env.qc-svc" : "ตั้งเอง"} · storage ${STO.storageEnabled() ? "เปิด" : "ปิด"} · CDN host ${CDN_HOST || "-"})`);

  // ───── ร้านชั่วคราว ─────
  const mkTenant = async (name: string) => { const r = await prisma.tenant.create({ data: { name, slug: `${SLUG}${uid()}` } }); tenantIds.push(r.id); return r.id as string; };
  const tA = await mkTenant("H4 review-b A"); const tB = await mkTenant("H4 review-b B");
  const ctxA = { tenantId: tA }; const ctxB = { tenantId: tB };
  const mkUnit = async (tenantId: string, type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId, type, name, slug: `u-${uid()}` } })).id as string;
  const UH = await mkUnit(tA, "HOTEL", "โรงแรม h4rv"); const UHB = await mkUnit(tB, "HOTEL", "โรงแรม B h4rv");
  const mkType = async (tenantId: string, unitId: string) => (await prisma.hotelRoomType.create({ data: { tenantId, unitId, name: "ดีลักซ์", rentMode: "NIGHTLY", baseRateSatang: 100_000, capacity: 3, baseOccupancy: 2, maxOccupancy: 3 } })).id as string;
  const RT = await mkType(tA, UH); const RT_B = await mkType(tB, UHB);
  const ROOM: Record<string, string> = {};
  for (const n of ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10"]) ROOM[n] = (await prisma.hotelRoom.create({ data: { tenantId: tA, unitId: UH, number: n, roomTypeId: RT, hkStatus: "CLEAN" } })).id as string;
  await prisma.hotelRoom.create({ data: { tenantId: tB, unitId: UHB, number: "B1", roomTypeId: RT_B, hkStatus: "CLEAN" } });
  const mkSys = async (tenantId: string, unitId: string, type: string) => { const s = await prisma.appSystem.create({ data: { tenantId, type, name: `${type} h4rv` } }); await prisma.appSystemUnit.create({ data: { tenantId, systemId: s.id, unitId, type } }); return s.id as string; };
  await mkSys(tA, UH, "POS");
  const mkMember = async (tag: string, tenantId: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `${SLUG}${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@shark.local`, name: `h4rv ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const FD = { "hotel.reservation.checkIn": true, "hotel.booking.manage": true, "hotel.guest.register": true, "hotel.reservation.checkOut": true };
  const OWNER = await mkMember("owner", tA, "OWNER", ["*"]);
  const FRONT = await mkMember("front", tA, "STAFF", [UH], FD);
  const VIEWER = await mkMember("viewer", tA, "STAFF", [UH], { ...FD, "hotel.guest.viewId": true });
  const MAID = await mkMember("maid", tA, "STAFF", [UH], { "hotel.housekeeping": true });
  const OWNER_B = await mkMember("owner-b", tB, "OWNER", ["*"]);
  let seq = 0;
  const mkRes = async (o: { ci?: string; co?: string; roomId?: string | null; claim?: boolean; tenantId?: string; unitId?: string; roomTypeId?: string } = {}) => {
    const tenantId = o.tenantId ?? tA, unitId = o.unitId ?? UH, roomTypeId = o.roomTypeId ?? RT;
    const ci = o.ci ?? W(0), co = o.co ?? W(2);
    const rv = await prisma.hotelReservation.create({ data: { tenantId, unitId, code: `H4RV-${RUN}-${++seq}`, status: "CONFIRMED", guestName: "ผู้จอง h4rv", guestPhone: "0899990000", roomTypeId, checkInDate: dbDate(ci), checkOutDate: dbDate(co), nights: dayNo(co) - dayNo(ci), adults: 2, source: "WALK_IN", depositSatang: 0, taxSnapshot: { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 }, policySnapshot: {}, ...(o.roomId ? { roomId: o.roomId } : {}) } });
    for (let d = ci; d < co; d = addDays(d, 1)) await prisma.hotelBookingNight.create({ data: { tenantId, unitId, reservationId: rv.id, roomTypeId, date: dbDate(d), priceSatang: 100_000, counted: true, ...(o.roomId ? { roomId: o.roomId } : {}) } });
    if (o.claim !== false) {
      const cands = o.roomId ? [o.roomId] : (await prisma.hotelRoom.findMany({ where: { tenantId, unitId, roomTypeId, active: true, hkStatus: "CLEAN" }, orderBy: { number: "asc" }, select: { id: true } })).map((r: Any) => r.id as string);
      for (const rid of cands) {
        const c = await prisma.$transaction((tx: Any) => rooms.claimRoom(tx, { tenantId, unitId, roomId: rid, start: ci, end: co, kind: "STAY", refType: "HotelReservation", refId: rv.id, requireRentMode: "NIGHTLY" }));
        if (c?.ok) { await prisma.hotelBookingNight.updateMany({ where: { reservationId: rv.id }, data: { roomId: rid } }); break; }
      }
    }
    await prisma.hotelFolio.create({ data: { tenantId, unitId, reservationId: rv.id, status: "OPEN", balanceSatang: 0 } });
    return rv.id as string;
  };
  const roomOfRes = async (id: string) => (await prisma.roomOccupancy.findFirst({ where: { refType: "HotelReservation", refId: id, active: true } }))?.roomId as string;
  const checkIn = (actor: Actor, over: Record<string, unknown>, ctx: Any = ctxA) => call(() => CK.checkInV2(actor, ctx, over));
  const upsert = (actor: Actor, over: Record<string, unknown>, ctx: Any = ctxA) => call(() => GU.upsertGuestRecord(actor, ctx, over));
  const reveal = (actor: Actor, guestId: string, ctx: Any = ctxA) => call(() => GU.revealGuestId(actor, ctx, { guestId }));
  const row = (gid: string) => prisma.hotelGuestRecord.findUnique({ where: { id: gid } }) as Promise<Any>;
  const inhouse = async (guests: readonly Any[], actor: Actor = FRONT, extra: Record<string, unknown> = {}) => {
    const id = await mkRes();
    const roomId = await roomOfRes(id);
    const r = okRes(await checkIn(actor, { reservationId: id, roomId, guests, ...extra }), "checkInV2");
    return { id, roomId, guestIds: r.guestIds as string[], res: r };
  };
  const setUnit = async (key: string, value: unknown) => okRes(await SET.setSettings(OWNER, ctxA, [{ key, scope: "UNIT", scopeId: UH, value }]), `ตั้ง ${key}`);
  const resetUnit = async (key: string) => { try { await SET.resetSetting(OWNER, ctxA, { key, scope: "UNIT", scopeId: UH }); } catch { /* */ } };
  const auditsOf = (where: Any) => prisma.auditLog.findMany({ where: { tenantId: tA, ...where }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;

  // ═════ E1 กล่องลับ: AAD = recordId · ย้ายกล่องข้ามแถว · nonce ═════
  console.log("\n── E1 กล่องลับ (AAD · ย้ายกล่อง · nonce) ──");
  await sec("E1", "กล่องลับ", async () => {
    const a = await inhouse([G.deu]);
    const b = await inhouse([{ ...G.jpn, idNumber: N_DEU, fullName: "H4RV SAMENUMBER OTHERGUEST" }]); // เลขเดียวกัน คนละแขก
    const ra = await row(a.guestIds[0]!), rb = await row(b.guestIds[0]!);
    chk("E1.1", "เลขเดียวกันคนละแขก ⇒ ciphertext ต่างกัน (nonce)", ra.idNumberEnc !== rb.idNumberEnc && ra.idNumberLast4 === rb.idNumberLast4);
    chk("E1.2", "เปิดกล่อง A ด้วย id ของ B ⇒ null · เปิดด้วย id ตัวเอง ⇒ ได้เลข", SB.openIntegrationSecret(ra.idNumberEnc, rb.id) === null && SB.openIntegrationSecret(ra.idNumberEnc, ra.id)?.id === N_DEU);
    // ย้ายกล่องของ A ไปแถว B (จำลองย้ายแถว/ปลูกข้อมูล)
    const keepB = rb.idNumberEnc;
    await prisma.hotelGuestRecord.update({ where: { id: rb.id }, data: { idNumberEnc: ra.idNumberEnc } });
    const rv = await reveal(VIEWER, rb.id);
    chk("E1.3", "ย้ายกล่อง A → แถว B แล้ว reveal B ⇒ ไม่ได้เลข (NO_DATA) · ไม่มีเลขในคำตอบ", rv?.ok === false && rv.code === "NO_DATA" && leaks(J(rv)).length === 0, J(rv).slice(0, 160));
    const ex = await call(() => TM.tm30Export(VIEWER, ctxA, { unitId: UH, guestIds: [rb.id], format: "csv" }));
    const csv = ex?.ok ? Buffer.from(ex.file.bytes).toString("utf8") : "";
    chk("E1.4", "ส่งออก ตม.30 ของแถวที่กล่องเปิดไม่ได้ ⇒ ต้องไม่ ok เงียบ ๆ (ช่องพาสปอร์ตว่าง)", !(ex?.ok === true && !csv.includes(N_DEU)), ex?.ok ? `ok:true · ไฟล์มีเลข? ${csv.includes(N_DEU)} · AuditLog exported ถูกเขียนทั้งที่เลขว่าง` : J(ex).slice(0, 120));
    await prisma.hotelGuestRecord.update({ where: { id: rb.id }, data: { idNumberEnc: keepB } });
    chk("E1.5", "คืนกล่องเดิม ⇒ reveal ได้เลขเดิม", (await reveal(VIEWER, rb.id))?.idNumber === N_DEU);
    Object.assign(IDS, { e1a: a, e1b: b });
  });

  // ═════ E2 reveal สิทธิ์ · AuditLog · maskIdForStaff=false ═════
  console.log("\n── E2 reveal ──");
  await sec("E2", "reveal", async () => {
    const g = IDS.e1a.guestIds[0] as string;
    const n0 = (await auditsOf({ action: "hotel.guest.id_revealed", targetId: g })).length;
    const rf = await reveal(FRONT, g), rm = await reveal(MAID, g), rb = await reveal(OWNER_B, g, ctxB);
    chk("E2.1", "frontdesk (register ไม่มี viewId · mask เปิด) ⇒ FORBIDDEN · maid ⇒ FORBIDDEN · ร้าน B ⇒ NOT_FOUND · ไม่มีเลขในคำตอบ", rf.code === "FORBIDDEN" && rm.code === "FORBIDDEN" && rb.code === "NOT_FOUND" && leaks(J([rf, rm, rb])).length === 0, `${rf.code}/${rm.code}/${rb.code}`);
    const rv = await reveal(VIEWER, g);
    const au = await auditsOf({ action: "hotel.guest.id_revealed", targetId: g });
    const last = au[au.length - 1];
    chk("E2.2", "viewer ⇒ ok · AuditLog +1 มี actorId/targetId/unitId/createdAt · after ไม่มีเลขเต็ม", rv?.idNumber === N_DEU && au.length === n0 + 1 && last?.actorId === VIEWER.userId && last?.targetId === g && last?.unitId === UH && !!last?.createdAt && leaks(J(last)).length === 0, J(last?.after));
    chk("E2.3", "AuditLog ของที่ถูกปฏิเสธไม่เพิ่ม", (await auditsOf({ action: "hotel.guest.id_revealed", targetId: g })).length === n0 + 1);
    await setUnit("rooms.hotel.guest.maskIdForStaff", false);
    const rf2 = await reveal(FRONT, g);
    const au2 = await auditsOf({ action: "hotel.guest.id_revealed", targetId: g });
    chk("E2.4", "maskIdForStaff=false ⇒ frontdesk (register) เปิดได้ + AuditLog ทุกครั้ง · maid ยัง FORBIDDEN", rf2?.idNumber === N_DEU && au2.length === n0 + 2 && au2[au2.length - 1]?.actorId === FRONT.userId && (await reveal(MAID, g)).code === "FORBIDDEN", J(rf2).slice(0, 80));
    await resetUnit("rooms.hotel.guest.maskIdForStaff");
    chk("E2.5", "reset ค่าตั้ง ⇒ frontdesk กลับเป็น FORBIDDEN", (await reveal(FRONT, g)).code === "FORBIDDEN");
  });

  // ═════ E3 ไฟล์ (private · URL สาธารณะ · ลิงก์หมดอายุ · keepIdImage=false · X6) ═════
  console.log("\n── E3 ไฟล์ ──");
  await sec("E3", "ไฟล์", async () => {
    const res = IDS.e1a as { id: string; guestIds: string[] };
    const fc0 = await prisma.fileAsset.count({ where: { tenantId: tA } });
    const u1 = await upsert(FRONT, { reservationId: res.id, guest: { ...G.jpn, idImage: PNG, keepIdImage: false } });
    const fc1 = await prisma.fileAsset.count({ where: { tenantId: tA } });
    const r1 = u1.ok ? await row(u1.guestId) : null;
    chk("E3.1", "keepIdImage=false + ส่งรูป ⇒ ไม่อัป (FileAsset ไม่เพิ่ม · idImageFileId null)", u1.ok === true && fc1 === fc0 && r1?.idImageFileId === null, J(u1).slice(0, 100));
    const u2 = await upsert(FRONT, { reservationId: res.id, guest: { ...G.fra, idImage: PNG2, keepIdImage: true } });
    const r2 = u2.ok ? await row(u2.guestId) : null;
    const fa = r2?.idImageFileId ? await prisma.fileAsset.findUnique({ where: { id: r2.idImageFileId } }) : null;
    chk("E3.2", "keepIdImage=true ⇒ FileAsset ของร้าน · path t/<tenant>/private/<40hex>.png · cdnUrl private:// · ชื่อไฟล์ไม่มีชื่อ/เลขแขก", !!fa && fa.tenantId === tA && new RegExp(`^t/${tA}/private/[0-9a-f]{40}\\.png$`).test(fa.path) && String(fa.cdnUrl).startsWith("private://") && leaks(`${fa.path} ${fa.cdnUrl}`, [...RAWS, ...NAMES, "fra", "DUBOIS"]).length === 0, fa ? `${fa.path}` : J(u2).slice(0, 100));
    if (fa) {
      skip("E3.3", "GET <SHARK_BUNNY_CDN>/<path ของไฟล์ private> ไม่ตอบ 200 (ไม่มีลายเซ็น)", "นอกใบ H.4 = Q-H4-3 (pull zone CDN เสิร์ฟทั้ง zone · หนี้ storage C0.4) — มติ §12.3 · กันด้วย path ไม่เคยออกนอกเซิร์ฟเวอร์ (E3.2/E8.5)");
      const url: string = STO.privateFileUrl(fa.id, { kind: "STAFF", id: VIEWER.userId });
      const m = /\/api\/files\/([^?]+)\?exp=(\d+)&sig=([0-9a-f]+)/.exec(url);
      const exp = Number(m?.[2]);
      const okV = STO.privateFileSignatureOk(m?.[1], m?.[2], m?.[3], { kind: "STAFF", id: VIEWER.userId });
      const okOther = STO.privateFileSignatureOk(m?.[1], m?.[2], m?.[3], { kind: "STAFF", id: FRONT.userId });
      const okExpired = STO.privateFileSignatureOk(m?.[1], String(Math.floor(Date.now() / 1000) - 10), m?.[3], { kind: "STAFF", id: VIEWER.userId });
      const stretched = STO.privateFileSignatureOk(m?.[1], String(exp + 3600), m?.[3], { kind: "STAFF", id: VIEWER.userId });
      chk("E3.4", "privateFileUrl: อายุ ≤ 900 วิ · ผู้ดูที่ออกให้ผ่าน · คนอื่นไม่ผ่าน · exp ผ่านไปแล้วไม่ผ่าน · ยืด exp เองไม่ผ่าน · URL ไม่มี path/private://", !!m && exp * 1000 - Date.now() <= 900_000 + 2_000 && okV && !okOther && !okExpired && !stretched && !url.includes("private://") && !url.includes(`t/${tA}`), url.slice(0, 60));
      const card = await call(() => GU.rr3Card({ tenantId: tA, userId: FRONT.userId }, { guestId: r2.id }));
      const m2 = /\/api\/files\/([^?]+)\?exp=(\d+)&sig=([0-9a-f]+)/.exec(String(card?.idImageUrl ?? ""));
      chk("E3.5", "rr3Card(ctx.userId=frontdesk) ⇒ idImageUrl ผูก frontdesk (ไม่ใช่ผู้บันทึก/คนอื่น)", !!m2 && STO.privateFileSignatureOk(m2[1], m2[2], m2[3], { kind: "STAFF", id: FRONT.userId }) && !STO.privateFileSignatureOk(m2[1], m2[2], m2[3], { kind: "STAFF", id: VIEWER.userId }), String(card?.idImageUrl ?? J(card)).slice(0, 60));
      const card0 = await call(() => GU.rr3Card({ tenantId: tA }, { guestId: r2.id }));
      const m3 = /\/api\/files\/([^?]+)\?exp=(\d+)&sig=([0-9a-f]+)/.exec(String(card0?.idImageUrl ?? ""));
      // ORACLE-EDIT (ผู้คุม 7 พ.ย. · §12.3): builder รอบ 4 (ผู้ตรวจ PDPA m4) — ไม่รู้ผู้ดู ⇒ ไม่ออกลิงก์ไฟล์ (เดิม fallback ผูกผู้บันทึก)
      chk("E3.6", "rr3Card ไม่ส่ง ctx.userId ⇒ ไม่มีลิงก์ไฟล์ (idImageUrl/signatureUrl null · ไม่ fallback ผูกผู้บันทึก)", card0?.ok === true && card0.idImageUrl === null && card0.signatureUrl === null && !m3, `idImageUrl=${J(card0?.idImageUrl ?? null).slice(0, 40)} signatureUrl=${J(card0?.signatureUrl ?? null).slice(0, 40)}`);
    }
    // X6
    const big = new Uint8Array(8 * 1024 * 1024 + 1); big.set(makePng(3).subarray(0, 64));
    const fcX = await prisma.fileAsset.count({ where: { tenantId: tA } });
    const xBig = await upsert(FRONT, { reservationId: res.id, guest: { ...G.jpn, fullName: "H4RV BIGIMG", idImage: { data: big, contentType: "image/png" }, keepIdImage: true } });
    const xSvg = await upsert(FRONT, { reservationId: res.id, guest: { ...G.jpn, fullName: "H4RV SVG", idImage: { data: Buffer.from("<svg/>"), contentType: "image/svg+xml" }, keepIdImage: true } });
    const xFake = await upsert(FRONT, { reservationId: res.id, guest: { ...G.jpn, fullName: "H4RV FAKE", idImage: { data: Buffer.from("GIF89a....."), contentType: "image/png" }, keepIdImage: true } });
    const xSig = await call(() => GU.signRr3(FRONT, ctxA, { guestId: res.guestIds[0], signaturePng: { data: Buffer.from("%PDF-1.4"), contentType: "application/pdf" } }));
    chk("E3.7", "X6: รูป > 8 MB / svg / PNG ปลอม ⇒ INVALID_FILE · ลายเซ็น PDF ⇒ INVALID_FILE · ไม่มีไฟล์ค้าง · ไม่มีแถวแขกเพิ่ม", [xBig, xSvg, xFake, xSig].every((x) => x?.code === "INVALID_FILE") && (await prisma.fileAsset.count({ where: { tenantId: tA } })) === fcX && (await prisma.hotelGuestRecord.count({ where: { reservationId: res.id, fullName: { startsWith: "H4RV BIG" } } })) === 0, [xBig, xSvg, xFake, xSig].map((x) => x?.code).join("/"));
    IDS.e3guest = r2?.id; IDS.e3file = fa?.id;
    IDS.e3jpn = u1.ok ? u1.guestId : null;
  });

  // ═════ E4 ลบแถว 10 นาที ⇒ ลบไฟล์ · undo คงทะเบียน ═════
  console.log("\n── E4 ลบแถว · undoCheckIn ──");
  await sec("E4", "ลบ/undo", async () => {
    const res = IDS.e1a as { id: string; guestIds: string[] };
    const d = await call(() => GU.deleteGuestRecord(FRONT, ctxA, { guestId: IDS.e3guest }));
    const faGone = IDS.e3file ? await prisma.fileAsset.findUnique({ where: { id: IDS.e3file } }) : null;
    const au = (await auditsOf({ action: "hotel.guest.deleted", targetId: IDS.e3guest }))[0];
    chk("E4.1", "deleteGuestRecord (คนเดิม · <10 นาที) ⇒ ok · FileAsset รูปถูกลบ · AuditLog deleted ไม่มีชื่อ/เลข/ที่อยู่", d?.ok === true && faGone === null && !!au && leaks(J(au), [...RAWS, ...NAMES]).length === 0, J(d).slice(0, 80));
    const dOther = await call(() => GU.deleteGuestRecord(VIEWER, ctxA, { guestId: IDS.e3jpn }));
    chk("E4.2", "คนอื่นลบ ⇒ FORBIDDEN (ไม่หลุดข้อมูล)", dOther?.code === "FORBIDDEN" && leaks(J(dOther), [...RAWS, ...NAMES]).length === 0, dOther?.code);
    const before = await prisma.hotelGuestRecord.findMany({ where: { reservationId: res.id }, orderBy: { createdAt: "asc" } });
    const u = await call(() => CK.undoCheckIn(OWNER, ctxA, { reservationId: res.id, reason: "ทดสอบย้อนเช็กอิน h4rv" }));
    const after = await prisma.hotelGuestRecord.findMany({ where: { reservationId: res.id }, orderBy: { createdAt: "asc" } });
    chk("E4.3", "undoCheckIn ⇒ ok · แถวแขกคงครบ · idNumberEnc เดิมทุกแถว · reveal ยังได้เลข · tm30DueAt ของ PENDING ล้าง", u?.ok === true && after.length === before.length && after.every((r: Any, i: number) => r.idNumberEnc === before[i].idNumberEnc) && (await reveal(VIEWER, res.guestIds[0]!))?.idNumber === N_DEU && after.filter((r: Any) => r.tm30Status === "PENDING").every((r: Any) => r.tm30DueAt === null), J(u).slice(0, 80));
    const uAu = (await auditsOf({ action: "hotel.reservation.check_in_undone", targetId: res.id }))[0];
    chk("E4.4", "AuditLog undo มีผู้ทำ/เหตุผล · ไม่มี PII", !!uAu && uAu.actorId === OWNER.userId && leaks(J(uAu), [...RAWS, ...NAMES]).length === 0);
  });

  // ═════ E5 purge ═════
  console.log("\n── E5 purge ──");
  await sec("E5", "purge", async () => {
    const r = await inhouse([G.deu, G.jpn]);
    const [g1, g2] = r.guestIds;
    okRes(await upsert(FRONT, { reservationId: r.id, guestId: g1, guest: { ...G.deu, idImage: PNG2, keepIdImage: true } }), "ใส่รูป");
    okRes(await call(() => GU.signRr3(FRONT, ctxA, { guestId: g1, signaturePng: PNG })), "ลงชื่อ");
    const b1 = await row(g1!);
    chk("E5.1", "retainUntil = วันออก + 2 ปี (ค่าเริ่ม)", b1.retainUntil?.toISOString().slice(0, 10) === `${Number(W(2).slice(0, 4)) + 2}${W(2).slice(4)}`, `${b1.retainUntil?.toISOString().slice(0, 10)} vs ${W(2)}`);
    const p0 = await GU.purgeExpiredGuestRecords({});
    const stillThere = await row(g1!);
    chk("E5.2", "ยังไม่พ้น retainUntil ⇒ purge ไม่แตะ", !!stillThere?.idNumberEnc && !!stillThere?.idImageFileId, `purged=${p0.purged}`);
    await prisma.hotelGuestRecord.updateMany({ where: { id: { in: [g1!, g2!] } }, data: { retainUntil: dbDate(W(-1)) } });
    await prisma.hotelReservation.update({ where: { id: r.id }, data: { checkInDate: dbDate(W(-800)), checkOutDate: dbDate(W(-798)) } }); // ORACLE-EDIT (ผู้คุม 7 พ.ย. · §11.4/§12.3): purge ดูวันออกจริง + retainYears ด้วย ⇒ ย้ายการจองไปอดีต > 2 ปี
    const p1 = await GU.purgeExpiredGuestRecords({});
    const a1 = await row(g1!), a2 = await row(g2!);
    const fImg = b1.idImageFileId ? await prisma.fileAsset.findUnique({ where: { id: b1.idImageFileId } }) : "?";
    const fSig = b1.signatureFileId ? await prisma.fileAsset.findUnique({ where: { id: b1.signatureFileId } }) : "?";
    chk("E5.3", "พ้น retainUntil ⇒ purge 2 · enc/รูป/ลายเซ็น null · FileAsset ทั้งสองหาย · ชื่อ+last4+สัญชาติคง", p1.purged >= 2 && [a1, a2].every((x: Any) => x.idNumberEnc === null && x.idImageFileId === null && x.signatureFileId === null && x.fullName && x.idNumberLast4 && x.nationality) && fImg === null && fSig === null, `purged=${p1.purged} img=${fImg === null ? "ลบ" : "ค้าง"} sig=${fSig === null ? "ลบ" : "ค้าง"}`);
    const p2 = await GU.purgeExpiredGuestRecords({});
    chk("E5.4", "purge ซ้ำ ⇒ 0", p2.purged === 0, `purged=${p2.purged}`);
    const au = await auditsOf({ action: "hotel.guest.purged" });
    chk("E5.5", "AuditLog purged (SYSTEM) ไม่มีชื่อ/เลข/ที่อยู่", au.length >= 2 && au.every((a: Any) => a.actorType === "SYSTEM") && leaks(J(au), [...RAWS, ...NAMES]).length === 0, `${au.length} แถว`);
    // ORACLE-EDIT (ผู้คุม 7 พ.ย.): builder แก้ตามผู้ตรวจ PDPA m1 แล้ว — purge ล้าง dob/arrivedFrom/nextDestination (คงเฉพาะ ชื่อ+last4+สัญชาติ+วันเข้าออก ตามใบ §0)
    chk("E5.6", "หลัง purge คอลัมน์ dob/arrivedFrom/nextDestination ถูกล้าง (null) ทั้งสองแถว", [a1, a2].every((x: Any) => x.dob === null && x.arrivedFrom === null && x.nextDestination === null), `dob=${a1.dob?.toISOString().slice(0, 10) ?? null}/${a2.dob?.toISOString().slice(0, 10) ?? null}`);
    const rv = await reveal(VIEWER, g1!);
    chk("E5.7", "reveal แถวที่ purge แล้ว ⇒ NO_DATA ข้อความไทย ไม่มีเลข", rv?.code === "NO_DATA" && /ลบ|เก็บ/.test(rv.reason) && leaks(J(rv)).length === 0, rv?.reason);
  });

  // ═════ E6 AI อ่านบัตร ═════
  console.log("\n── E6 AI ──");
  await sec("E6", "AI", async () => {
    const cnt = async () => [await prisma.hotelGuestRecord.count({ where: { tenantId: tA } }), await prisma.fileAsset.count({ where: { tenantId: tA } }), await prisma.auditLog.count({ where: { tenantId: tA } }), await prisma.outboxEvent.count({ where: { tenantId: tA } })];
    const n0 = OR_REQS.length;
    const r0 = await call(() => AI.readIdDocument(FRONT, ctxA, { unitId: UH, image: PNG }));
    chk("E6.1", "ค่าเริ่มปิด ⇒ AI_DISABLED · ไม่ยิง openrouter · ไม่มี host อื่นถูกเรียก", r0?.code === "AI_DISABLED" && OR_REQS.length === n0, `${r0?.code} blocked=${J(BLOCKED)}`);
    await setUnit("rooms.hotel.guest.aiIdReader", true);
    await prisma.aiCreditWallet.upsert({ where: { tenantId: tA }, create: { tenantId: tA, balanceMicro: 5_000_000, grantedAt: new Date() }, update: { balanceMicro: 5_000_000, grantedAt: new Date() } });
    const c0 = await cnt(); // นับหลัง setSettings (ซึ่งเขียน AuditLog/outbox ของตัวเอง)
    const r1 = await call(() => AI.readIdDocument(FRONT, ctxA, { unitId: UH, image: PNG }));
    const req = OR_REQS[OR_REQS.length - 1];
    const bodyTxt = J(req?.body ?? {});
    const b64 = Buffer.from(PNG.data).toString("base64");
    chk("E6.2", "เปิด ⇒ ok proposal · คำขอ 1 ครั้งไป openrouter เท่านั้น · body มีรูป (base64 ของเรา) · ไม่มีชื่อร้าน/หน่วย/ชื่อแขก/tenantId", r1?.ok === true && OR_REQS.length === n0 + 1 && bodyTxt.includes(b64) && !bodyTxt.includes(tA) && !bodyTxt.includes("h4rv") && !/โรงแรม/.test(bodyTxt) && BLOCKED.length === 0, `${r1?.code ?? "ok"} model=${r1?.model} charged=${r1?.creditCharged}`);
    const c1 = await cnt();
    chk("E6.3", "AI ไม่เขียนทะเบียน/ไฟล์/AuditLog/outbox (นับเท่าเดิม)", J(c0) === J(c1), `${J(c0)} → ${J(c1)}`);
    const txns = await prisma.aiCreditTxn.findMany({ where: { tenantId: tA } });
    chk("E6.4", "AiCreditTxn: note/ref = hotel.guest.idReader · ไม่มีเลข/รูป/ชื่อ", txns.length >= 1 && txns.every((t: Any) => /hotel\.guest\.idReader/.test(`${t.note} ${t.ref}`)) && leaks(J(txns), [...RAWS, ...NAMES, "iVBORw0KGgo"]).length === 0, J(txns.map((t: Any) => [t.note, t.ref]).slice(0, 2)));
    await resetUnit("rooms.hotel.guest.aiIdReader");
    const r2 = await call(() => AI.readIdDocument(FRONT, ctxA, { unitId: UH, image: PNG }));
    chk("E6.5", "reset ⇒ ปิดอีกครั้ง", r2?.code === "AI_DISABLED");
  });

  // ═════ E7 ไม่มีกุญแจ / กุญแจผิด ═════
  console.log("\n── E7 กุญแจเข้ารหัส ──");
  await sec("E7", "กุญแจ", async () => {
    const KEY = process.env.INTEGRATIONS_CREDENTIALS_KEY!;
    const id = await mkRes();
    const roomId = await roomOfRes(id);
    const fc0 = await prisma.fileAsset.count({ where: { tenantId: tA } });
    delete process.env.INTEGRATIONS_CREDENTIALS_KEY;
    let r: Any;
    try { r = await checkIn(FRONT, { reservationId: id, roomId, guests: [{ ...G.fra, idImage: PNG, keepIdImage: true }] }); } finally { process.env.INTEGRATIONS_CREDENTIALS_KEY = KEY; }
    const rv = await prisma.hotelReservation.findUnique({ where: { id } });
    chk("E7.1", "ไม่มีกุญแจ: checkInV2 ⇒ ok:false NOT_CONFIGURED (ไม่ throw) · การจองยัง CONFIRMED · ไม่มีแถวแขก/ไฟล์ค้าง", r?.ok === false && r.code === "NOT_CONFIGURED" && rv?.status === "CONFIRMED", `ได้ ${r?.code}: ${String(r?.reason).slice(0, 90)} · status=${rv?.status} · แขก=${await prisma.hotelGuestRecord.count({ where: { reservationId: id } })} · FileAsset Δ=${(await prisma.fileAsset.count({ where: { tenantId: tA } })) - fc0}`);
    const u = await (async () => { delete process.env.INTEGRATIONS_CREDENTIALS_KEY; try { return await upsert(FRONT, { reservationId: id, guest: G.fra }); } finally { process.env.INTEGRATIONS_CREDENTIALS_KEY = KEY; } })();
    chk("E7.2", "ไม่มีกุญแจ: upsertGuestRecord ⇒ NOT_CONFIGURED ข้อความไทย (เทียบ: checkInV2 ควรเหมือนกัน)", u?.code === "NOT_CONFIGURED" && /[฀-๿]/.test(u.reason), `${u?.code}`);
    // กุญแจผิดตอนส่งออก ตม.30
    const h = await inhouse([G.deu]);
    process.env.INTEGRATIONS_CREDENTIALS_KEY = randomBytes(32).toString("hex");
    let ex: Any;
    try { ex = await call(() => TM.tm30Export(FRONT, ctxA, { unitId: UH, guestIds: h.guestIds, format: "csv" })); } finally { process.env.INTEGRATIONS_CREDENTIALS_KEY = KEY; }
    const csv = ex?.ok ? Buffer.from(ex.file.bytes).toString("utf8") : "";
    const exAu = await auditsOf({ action: "hotel.tm30.exported", targetId: h.guestIds[0] });
    chk("E7.3", "กุญแจผิด: tm30Export ต้องไม่คืน ok พร้อมช่องพาสปอร์ตว่าง (เงียบ)", !(ex?.ok === true && !csv.includes(N_DEU)), ex?.ok ? `ok:true · เลขในไฟล์? ${csv.includes(N_DEU)} · แถว ${ex.count} · AuditLog exported ${exAu.length} แถว ← ไฟล์ขาดเลขแต่ระบบถือว่าส่งออกแล้ว` : `${ex?.code}`);
    IDS.e7 = h;
  });

  // ═════ E8 ส่งออก ตม.30 เฉพาะที่เลือก · error ไม่ echo · ค้นด้วยเลขเต็ม · DTO ═════
  console.log("\n── E8 ส่งออก · error · ค้นหา · DTO ──");
  await sec("E8", "export/error/search/DTO", async () => {
    const h1 = IDS.e7 as { id: string; guestIds: string[] };
    const h2 = await inhouse([G.jpn]);
    const ex = okRes(await call(() => TM.tm30Export(FRONT, ctxA, { unitId: UH, guestIds: [h2.guestIds[0]], format: "xlsx" })), "export");
    const csv = Buffer.from(ex.file.bytes).toString("utf8");
    chk("E8.1", "ส่งออกเลือก 1 คน ⇒ ไฟล์มีเลขคนนั้น · ไม่มีเลขคนที่ไม่เลือก · ชื่อไฟล์ไม่มีชื่อ/เลข · BOM · xlsx ⇒ csv", csv.includes(N_JPN) && !csv.includes(N_DEU) && !csv.includes(N_THAI) && /^tm30-\d+\.csv$/.test(ex.file.name) && ex.file.bytes[0] === 0xef, ex.file.name);
    const exAu = await auditsOf({ action: "hotel.tm30.exported" });
    chk("E8.2", "AuditLog exported ไม่มีเลข/ชื่อ (มี guestIds/byUserId)", exAu.length >= 1 && leaks(J(exAu), [...RAWS, ...NAMES]).length === 0 && exAu.every((a: Any) => Array.isArray(a.after?.guestIds) && a.after?.byUserId));
    // error ไม่ echo
    const BAD1 = "1234567890123", BAD2 = "ZZ", BAD3 = "germany";
    const e1 = await upsert(FRONT, { reservationId: h1.id, guest: { ...G.thai, idNumber: BAD1 } });
    const e2 = await upsert(FRONT, { reservationId: h1.id, guest: { ...G.deu, idNumber: BAD2 } });
    const e3 = await upsert(FRONT, { reservationId: h1.id, guest: { ...G.deu, nationality: BAD3 } });
    const e4 = await upsert(FRONT, { reservationId: h1.id, guest: { ...G.deu, idType: "DRIVER", idNumber: "H4RVDRV01" } });
    const e5 = await checkIn(FRONT, { reservationId: h1.id, roomId: ROOM.D9, guests: [{ ...G.deu, idNumber: BAD1, idType: "THAI_ID" }] });
    const all = J([e1, e2, e3, e4, e5]);
    chk("E8.3", "ข้อความปฏิเสธ (checksum ผิด · พาสปอร์ตสั้น · สัญชาติผิดรูป · idType แปลก · checkInV2 INVALID_ID) ไม่ echo ค่าที่กรอก · เป็นไทย", [e1, e2, e3, e4, e5].every((x) => x?.ok === false && /[฀-๿]/.test(String(x.reason))) && !all.includes(BAD1) && !all.includes(BAD3) && !all.includes("H4RVDRV01") && !/"ZZ"|ZZ /.test(all), [e1, e2, e3, e4, e5].map((x) => x?.code).join("/"));
    // ค้นหา
    const lFull = await call(() => GU.listGuests(OWNER, ctxA, { unitId: UH, q: N_JPN }));
    const lLast4 = await call(() => GU.listGuests(OWNER, ctxA, { unitId: UH, q: N_JPN.slice(-4) }));
    chk("E8.4", "ค้นด้วยเลขเต็ม ⇒ 0 แถว · ค้นด้วย 4 ตัวท้าย ⇒ พบ", lFull?.ok && lFull.rows.length === 0 && lLast4?.ok && lLast4.rows.length >= 1, `${lFull?.rows?.length}/${lLast4?.rows?.length}`);
    // DTO ทุกตัว
    const dto = {
      list: await call(() => GU.listGuests(OWNER, ctxA, { unitId: UH })),
      rr3: await call(() => GU.rr3Card({ tenantId: tA, userId: OWNER.userId }, { guestId: h1.guestIds[0] })),
      rr4: await call(() => GU.rr4Register({ tenantId: tA }, { unitId: UH, from: W(-3), to: W(3) })),
      queue: await call(() => TM.tm30Queue({ tenantId: tA }, { unitId: UH })),
      view: await call(() => CK.checkinView({ tenantId: tA }, { unitId: UH, reservationId: h1.id })),
      rooms: await call(() => CK.assignableRooms({ tenantId: tA }, { reservationId: h2.id })),
    };
    const txt = J(dto);
    chk("E8.5", "DTO (listGuests · rr3Card · rr4Register · tm30Queue · checkinView · assignableRooms) ไม่มีเลขเต็ม/visa/ตม.6 · ไม่มี private:// / path", leaks(txt, [N_THAI, N_DEU, N_JPN, N_FRA, "H4RVVISA1", "H4RVTM6-1"]).length === 0 && !txt.includes("private://") && !txt.includes(`t/${tA}/`), `rr3Card มี address=${J(dto.rr3?.address)} occupation=${J(dto.rr3?.occupation)} (ตามแบบ ร.ร.3)`);
    const lFront = await call(() => GU.listGuests(FRONT, ctxA, { unitId: UH }));
    chk("E8.6", "listGuests ของ frontdesk ไม่มีคีย์ idNumber/idNumberEnc", lFront?.ok && !Object.keys(lFront.rows[0] ?? {}).some((k) => /^idNumber$|Enc$|secret/i.test(k)), Object.keys(lFront?.rows?.[0] ?? {}).join(","));
    IDS.e8 = h2;
  });

  // ═════ E9 สแกนฐาน + console ═════
  console.log("\n── E9 สแกนฐาน/log ──");
  await sec("E9", "scan", async () => {
    const gr = await prisma.hotelGuestRecord.findMany({ where: { tenantId: tA } });
    const grTxt = J(gr.map((g: Any) => ({ ...g, idNumberEnc: "" })));
    const au = await prisma.auditLog.findMany({ where: { tenantId: tA } });
    const ev = await prisma.outboxEvent.findMany({ where: { tenantId: tA } });
    const fa = await prisma.fileAsset.findMany({ where: { tenantId: tA } });
    const hk = await prisma.hotelHousekeepingLog.findMany({ where: { tenantId: tA } });
    const rv = await prisma.hotelReservation.findMany({ where: { tenantId: tA } });
    const tx = await prisma.aiCreditTxn.findMany({ where: { tenantId: tA } });
    let ops: Any[] = [];
    try { ops = await prisma.opsEvent.findMany({ where: { createdAt: { gte: new Date(Date.now() - 3_600_000) } }, take: 500 }); } catch { ops = []; }
    const SENSITIVE = [N_THAI, N_DEU, N_JPN, N_FRA, "H4RV-ADDR-PRIVATE", "H4RVVISA1", "H4RVTM6-1", "H4RV-BERLIN-ADDR", "H4RV-OCC-PRIVATE"];
    chk("E9.1", "HotelGuestRecord (นอก enc) ไม่มีเลข/ที่อยู่/visa/ตม.6/อาชีพ", leaks(grTxt, SENSITIVE).length === 0, J(leaks(grTxt, SENSITIVE)));
    chk("E9.2", "AuditLog before/after ไม่มีเลข/ที่อยู่/visa · ไม่มีชื่อเต็มแขก", leaks(J(au.map((a: Any) => [a.before, a.after])), [...SENSITIVE, ...NAMES]).length === 0, J(leaks(J(au.map((a: Any) => [a.before, a.after])), [...SENSITIVE, ...NAMES])));
    chk("E9.3", "OutboxEvent payload/idempotencyKey ไม่มีเลข/ชื่อ", leaks(J(ev.map((e: Any) => [e.payload, e.idempotencyKey])), [...SENSITIVE, ...NAMES]).length === 0);
    chk("E9.4", "FileAsset path/cdnUrl · HousekeepingLog · HotelReservation (note/guestName) · AiCreditTxn ไม่มีเลข/ชื่อแขก", leaks(J([fa.map((f: Any) => [f.path, f.cdnUrl]), hk, rv.map((r: Any) => [r.note, r.guestName]), tx]), [...SENSITIVE, ...NAMES]).length === 0);
    chk("E9.5", "OpsEvent (logOps) 1 ชม. ล่าสุด ไม่มีเลข/ชื่อแขก", leaks(J(ops), [...SENSITIVE, ...NAMES]).length === 0, `${ops.length} แถว`);
    const consoleTxt = CONSOLE_BUF.filter((l) => !/^\s*(✅|❌|\(|──|⚠️)/.test(l)).join("\n"); // ตัดบรรทัดของ probe เอง (ซึ่งอาจพิมพ์เลขในหมายเหตุ)
    chk("E9.6", "console ระหว่างรันโค้ดของใบ ไม่มีเลข/ชื่อแขก/base64 รูป", leaks(consoleTxt, [...SENSITIVE, ...NAMES, "iVBORw0KGgo"]).length === 0, `${CONSOLE_BUF.length} บรรทัด`);
    chk("E9.7", "ไม่มี fetch ออกนอก (นอกจาก Neon/Bunny/openrouter จำลอง)", BLOCKED.length === 0, J(BLOCKED));
  });

  // ═════ E10 สิทธิ์ maid · race 2 ทาง · static ═════
  console.log("\n── E10 maid · race · static ──");
  await sec("E10", "misc", async () => {
    const h = IDS.e8 as { id: string; guestIds: string[] };
    const m = [
      await upsert(MAID, { reservationId: h.id, guest: G.fra }),
      await call(() => GU.signRr3(MAID, ctxA, { guestId: h.guestIds[0], signaturePng: PNG })),
      await call(() => TM.tm30Export(MAID, ctxA, { unitId: UH, guestIds: h.guestIds })),
      await call(() => TM.markTm30Filed(MAID, ctxA, { guestIds: h.guestIds, tm30Ref: "TM30-X" })),
      await call(() => AI.readIdDocument(MAID, ctxA, { unitId: UH, image: PNG })),
      await call(() => GU.listGuests(MAID, ctxA, { unitId: UH })),
      await call(() => CK.undoCheckIn(MAID, ctxA, { reservationId: h.id, reason: "ทดสอบ" })),
    ];
    chk("E10.1", "maid ⇒ FORBIDDEN ทุกตัว (upsert/sign/export/filed/AI/list/undo) ไม่หลุดข้อมูล", m.every((x) => x?.code === "FORBIDDEN") && leaks(J(m), [...RAWS, ...NAMES]).length === 0, m.map((x) => x?.code).join("/"));
    const xb = await call(() => GU.rr3Card(ctxB, { guestId: h.guestIds[0] }));
    const xb2 = await call(() => TM.markTm30Filed(OWNER_B, ctxB, { guestIds: h.guestIds, tm30Ref: "TM30-X" }));
    chk("E10.2", "ข้ามร้าน: rr3Card/markTm30Filed ของ ctx B ⇒ NOT_FOUND ไม่หลุด id/ชื่อ", xb?.code === "NOT_FOUND" && xb2?.code === "NOT_FOUND" && !J([xb, xb2]).includes(h.guestIds[0]!), `${xb?.code}/${xb2?.code}`);
    // race: 2 การจอง ห้องเดียว
    const r1 = await mkRes({ claim: false, ci: W(5), co: W(6) }), r2 = await mkRes({ claim: false, ci: W(5), co: W(6) });
    process.env.SVC_QC_CLOCK = "1";
    let out: Any[];
    try { out = await Promise.all([r1, r2].map((id) => checkIn(FRONT, { reservationId: id, roomId: ROOM.D10, guests: [G.thai], earlyOverride: { reason: "ทดสอบ race" }, at: new Date().toISOString() }))); } finally { delete process.env.SVC_QC_CLOCK; }
    const occ = await prisma.roomOccupancy.findMany({ where: { roomId: ROOM.D10, active: true, kind: "STAY", refId: { in: [r1, r2] } } });
    const okN = out.filter((x) => x?.ok === true).length;
    chk("E10.3", "X3: เช็กอินพร้อมกัน 2 การจอง ห้องเดียว ⇒ สำเร็จ 1 · อีกใบ ROOM_TAKEN/BUSY · occupancy STAY บนห้อง 1 แถว", okN === 1 && occ.length === 1 && out.some((x) => ["ROOM_TAKEN", "BUSY"].includes(x?.code)), out.map((x) => x?.ok ? "ok" : x?.code).join("/"));
    const ls = spawnSync("git", ["ls-files", ".env.qc-svc", ".env", ".env.example"], { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
    const ex = spawnSync("grep", ["-E", "^INTEGRATIONS_CREDENTIALS_KEY=", `${ROOT}/.env.example`], { encoding: "utf8" }).stdout ?? "";
    chk("E10.4", "git ไม่ track .env/.env.qc-svc · .env.example มีคีย์ว่าง", ls.trim() === ".env.example" && /^INTEGRATIONS_CREDENTIALS_KEY=""?\s*$/.test(ex.trim()), `${ls.trim().replace(/\n/g, ",")} · ${ex.trim()}`);
  });
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
