// probe ผู้ตรวจ H.8 รอบ A (ผิวสาธารณะ: ความปลอดภัย · กันสแปม · leak/PII · สิทธิ์ของแขก)
//   แบบ "ข้อละบรรทัด ✅/❌ + JSON_SUMMARY {total,passed,failed,skipped}" (ผู้คุมยกเข้าทรีเป็น regression ได้)
//   ร้าน/ผู้ใช้ชั่วคราว prefix h8rv- ลบใน finally · ไม่แตะฉาก svcqc · ถัง rate ของร้านชั่วคราวลบตาม hash slug
// รัน (cwd ทรี):
//   bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h8-review-a.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes } from "node:crypto";
type Any = any;

import { loadSvcQcEnv } from "./svc-qc-env.mjs";
loadSvcQcEnv("probe-h8-review-a");
if (process.env.CI) { console.error("🔴 ห้าม export CI"); process.exit(4); }
delete process.env.SVC_QC_CLOCK;

// ── harness ──
type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: string; why: string }[] = [];
class AF extends Error {}
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
const ok = (c: unknown, why: string) => { if (!c) throw new AF(why); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const st = async (id: string, sev: string, name: string, fn: () => Promise<unknown>) => {
  try { await fn(); cks.push({ id, res: "PASS", sev, why: "" }); console.log(`  ✅ [${id}] ${name}`); }
  catch (e) { const why = e instanceof AF ? e.message : `throw: ${errMsg(e)}`; cks.push({ id, res: "FAIL", sev, why }); console.log(`  ❌ [${id}] (${sev}) ${name} — ${why}`); }
};
const skip = (id: string, sev: string, name: string, why: string) => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const call = async (f: () => Any): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const okRes = (r: Any, what: string) => { ok(r?.ok === true, `${what}: ${r?.code ?? J(r)} ${r?.reason ?? ""}`); return r; };
const code = (r: Any) => (r?.ok === true ? "ok" : String(r?.code ?? J(r)));
const DAY = 86_400_000;
const dayNo = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY);
const addDays = (ymd: string, n: number) => new Date((dayNo(ymd) + n) * DAY).toISOString().slice(0, 10);
const T0 = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const W = (n: number) => addDays(T0, n);
const RUN = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;
const SLUG = "h8rv-";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const uid = () => randomBytes(6).toString("hex");

const { prisma } = (await import("@/lib/core/db")) as Any;
const HOTEL = (await import("@/lib/modules/hotel")) as Any;
const WEB = (await import("@/lib/platform/hotel-web")) as Any;
const SET = (await import("@/lib/core/settings")) as Any;
const DICTM = (await import("@/lib/i18n/dict")) as Any;

const tenantIds: string[] = [];
const slugPairs: string[] = [];
async function cleanup(tids: string[]) {
  if (!tids.length) return;
  for (const t of ["RoomOccupancy", "HotelBookingNight", "PaymentSlip"]) {
    try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { /* FK */ }
  }
  const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
  let pending = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  for (let pass = 0; pass < 14 && pending.length; pass++) {
    const next: string[] = [];
    for (const t of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, tids); } catch { next.push(t); } }
    pending = next;
  }
  if (pending.length) console.log(`  ⚠️ cleanup ลบไม่หมด ${pending.join(", ")}`);
  try { await prisma.tenant.deleteMany({ where: { id: { in: tids } } }); } catch (e) { console.log(`  ⚠️ cleanup tenant ${errMsg(e)}`); }
}
async function cleanupBuckets() {
  const hs = slugPairs.map((p) => sha(p).slice(0, 12));
  for (const h of hs) { try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `hw:%:${h}:%`); } catch { /* */ } }
  try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'hw:%' AND key LIKE $1`, `%${sha(`${SLUG}junk`).slice(0, 6)}%`); } catch { /* */ }
}
async function cleanupUsers() { try { await prisma.user.deleteMany({ where: { email: { startsWith: SLUG } } }); } catch (e) { console.log(`  ⚠️ ลบ user ${errMsg(e)}`); } }

let exitCode = 0;
try {
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) await cleanup(stale.map((t: Any) => t.id));
  await cleanupUsers();

  // ═══ ตั้งร้าน ═══
  const slugA = `${SLUG}a-${RUN}`, slugB = `${SLUG}b-${RUN}`;
  const tA = (await prisma.tenant.create({ data: { name: "QC H8 review A", slug: slugA } })).id as string;
  const tB = (await prisma.tenant.create({ data: { name: "QC H8 review B", slug: slugB } })).id as string;
  tenantIds.push(tA, tB);
  const ctxA = { tenantId: tA }, ctxB = { tenantId: tB };
  const U1S = `h8rv-u1-${RUN}`, U2S = `h8rv-u2-${RUN}`;
  for (const p of [`${slugA}/${U1S}`, `${slugA}/${U2S}`, `${slugB}/${U1S}`]) slugPairs.push(p);
  const mkUnit = async (tid: string, name: string, slug: string) => (await prisma.businessUnit.create({ data: { tenantId: tid, type: "HOTEL", name, slug } })).id as string;
  const UH = await mkUnit(tA, "โรงแรมรีวิว H8", U1S);
  const UH2 = await mkUnit(tA, "สาขาสอง รีวิว H8", U2S);
  const UHB = await mkUnit(tB, "ร้าน B รีวิว H8", U1S);
  const mkType = async (tid: string, unitId: string, name: string) => (await prisma.hotelRoomType.create({ data: { tenantId: tid, unitId, name, rentMode: "NIGHTLY", baseRateSatang: 100_000, capacity: 3, baseOccupancy: 2, maxOccupancy: 3, extraBedAllowed: false, extraBedPriceSatang: 0 } })).id as string;
  const mkRoom = async (tid: string, unitId: string, number: string, roomTypeId: string) => (await prisma.hotelRoom.create({ data: { tenantId: tid, unitId, number, roomTypeId, hkStatus: "CLEAN" } })).id as string;
  const RT = { dlx: await mkType(tA, UH, "ดีลักซ์"), one: await mkType(tA, UH, "ห้องเดี่ยว"), u2: await mkType(tA, UH2, "สาขาสอง"), b: await mkType(tB, UHB, "ร้าน B") };
  for (let i = 1; i <= 10; i++) await mkRoom(tA, UH, `D${i}`, RT.dlx);
  await mkRoom(tA, UH, "S1", RT.one);
  await mkRoom(tA, UH2, "U2-1", RT.u2); await mkRoom(tA, UH2, "U2-2", RT.u2);
  await mkRoom(tB, UHB, "B-1", RT.b);
  const mkMember = async (tid: string, tag: string) => {
    const id = `h8rv-${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@shark.local`, name: `QC h8rv ${tag}` } });
    const mb = await prisma.membership.create({ data: { userId: id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
    return { role: "OWNER", unitAccess: ["*"], permissions: {}, userId: id, membershipId: mb.id };
  };
  const OWNER = await mkMember(tA, "owner");
  const OWNER_B = await mkMember(tB, "owner-b");
  const plans: Record<string, string> = {};
  for (const [actor, ctx, u, types] of [[OWNER, ctxA, UH, [RT.dlx, RT.one]], [OWNER, ctxA, UH2, [RT.u2]], [OWNER_B, ctxB, UHB, [RT.b]]] as const) {
    okRes(await HOTEL.listRatePlans(actor, ctx, { unitId: u }), "listRatePlans");
    plans[u] = (await prisma.hotelRatePlan.findFirst({ where: { unitId: u, code: "STANDARD" } })).id;
    okRes(await HOTEL.saveRatePlan(actor, ctx, { unitId: u, id: plans[u], code: "STANDARD", name: "ราคามาตรฐาน", visibility: ["WEB", "LINE", "COUNTER", "OTA"] }), "saveRatePlan");
    okRes(await HOTEL.saveRates(actor, ctx, { unitId: u, ratePlanId: plans[u], rows: types.map((roomTypeId: string) => ({ roomTypeId, seasonId: null, priceWeekdaySatang: 100_000, priceWeekendSatang: 120_000, priceHolidaySatang: null })) }), "saveRates");
  }
  const setUnit = async (key: string, value: unknown, unitId = UH) => okRes(await SET.setSettings(OWNER, ctxA, [{ key, scope: "UNIT", scopeId: unitId, value }]), `ตั้ง ${key}`);
  console.log(`(ร้าน A ${tA} · B ${tB} · วันนี้ ${T0})`);

  // ── ตัวช่วย ──
  const baseA = { tenantSlug: slugA, unitSlug: U1S };
  const baseA2 = { tenantSlug: slugA, unitSlug: U2S };
  const ip = () => `h8rv-ip-${uid()}`;
  const tick = (unitId = UH) => WEB.holdFormStart(unitId, new Date(Date.now() - 10_000));
  const EMAIL = `${SLUG}guest-${RUN}@qc.invalid`;
  const GUEST = { name: "แขกรีวิว ภัทรา h8rv", phone: "0897776655", email: EMAIL };
  const hold = (over: Any = {}, opts: Any = {}, base = baseA, unitId = UH, rt = RT.dlx) =>
    call(() => WEB.publicCreateHold({ ...base, checkIn: W(10), checkOut: W(11), adults: 2, children: 0, rooms: [{ roomTypeId: rt, qty: 1, adults: 2, children: 0 }], guest: GUEST, locale: "th", spam: { hp: "", st: tick(unitId) }, idempotencyKey: `h8rv-${uid()}`, ...over }, { clientKey: ip(), ...opts }));
  const counter = (over: Any = {}, unitId = UH, rt = RT.dlx) => call(() => HOTEL.createBooking(OWNER, ctxA, { unitId, rooms: [{ roomTypeId: rt, adults: 2, children: 0 }], ratePlanId: plans[unitId], source: "PHONE", guest: { name: "เคาน์เตอร์ h8rv", phone: "0890000011", email: EMAIL }, checkIn: W(12), checkOut: W(13), note: "INTERNAL-NOTE-H8RV ห้ามโชว์แขก", ...over }));
  const rvOf = (id: string) => prisma.hotelReservation.findUnique({ where: { id } }) as Promise<Any>;
  const rvByToken = (t: string) => prisma.hotelReservation.findUnique({ where: { publicToken: t } }) as Promise<Any>;
  const status = (t: string, base = baseA) => call(() => WEB.publicStatus({ ...base, publicToken: t }, { clientKey: ip() }));
  console.log("\n── ผู้ตรวจรอบ A (สาธารณะ) ──");

  // A-1 ALS: ด่าน actor null เปิดเฉพาะในงานของ cancelBookingAsGuest — คำขออื่นพร้อมกันไม่ได้สิทธิ์ตาม
  await st("A-1", "CRITICAL", "AsyncLocalStorage ไม่รั่ว: cancelBookingAsGuest(r1) ยิงพร้อมกับ cancelBooking(null, r2) ×4 + confirmBooking/takeBookingDeposit/markNoShow(null) ⇒ r1 CANCELLED · r2 ยัง HOLD · null ทุกตัว NOT_FOUND · หลังจบ cancelBooking(null) ยังปิด", async () => {
    const a = okRes(await hold({ checkIn: W(30), checkOut: W(31) }), "hold r1");
    const b = okRes(await hold({ checkIn: W(30), checkOut: W(31) }), "hold r2");
    const r1 = (await rvByToken(a.publicToken)).id, r2 = (await rvByToken(b.publicToken)).id;
    const nulls = [
      ...Array.from({ length: 4 }, () => new Promise((res) => setTimeout(() => res(call(() => HOTEL.cancelBooking(null, ctxA, { unitId: UH, reservationId: r2, reason: "x" }))), Math.floor(Math.random() * 30)))),
      call(() => HOTEL.confirmBooking(null, ctxA, { unitId: UH, reservationId: r2 })),
      call(() => HOTEL.takeBookingDeposit(null, ctxA, { unitId: UH, reservationId: r2, payType: "CASH", amountSatang: 100 })),
      call(() => HOTEL.markNoShow(null, ctxA, { unitId: UH, reservationId: r2 })),
    ];
    const [g, ...others] = await Promise.all([call(() => HOTEL.cancelBookingAsGuest(ctxA, { unitId: UH, reservationId: r1, reason: "GUEST_CANCELLED" })), ...nulls]);
    okRes(g, "guest cancel");
    const after = await call(() => HOTEL.cancelBooking(null, ctxA, { unitId: UH, reservationId: r2, reason: "x" }));
    const codes = [...others, after].map(code);
    ok(codes.every((c) => c === "NOT_FOUND"), `null actor ได้ผล ${J(codes)}`);
    ok((await rvOf(r1)).status === "CANCELLED" && (await rvOf(r2)).status === "HOLD", `r1 ${(await rvOf(r1)).status} r2 ${(await rvOf(r2)).status}`);
    const aud = await prisma.auditLog.findMany({ where: { tenantId: tA, action: "hotel.booking.cancelled", targetId: { in: [r1, r2] } } });
    ok(aud.length === 1 && aud[0].targetId === r1 && J(aud[0].after).includes('"by":"GUEST"'), `audit ${J(aud.map((x: Any) => [x.targetId, x.after]))}`);
  });

  // A-2 cancelBookingAsGuest ตรงด้วย reservation ของหน่วย/ร้านอื่น (ด่านชั้น booking ยังผูก ctx/unit)
  await st("A-2", "CRITICAL", "cancelBookingAsGuest ข้ามหน่วย/ร้าน: ctx A + unitId UH + reservationId ของ UH2 / ของร้าน B ⇒ NOT_FOUND ไม่เปลี่ยนสถานะ", async () => {
    const c2 = okRes(await counter({}, UH2, RT.u2), "counter UH2");
    const b = okRes(await call(() => HOTEL.createBooking(OWNER_B, ctxB, { unitId: UHB, rooms: [{ roomTypeId: RT.b, adults: 2, children: 0 }], ratePlanId: plans[UHB], source: "PHONE", guest: { name: "B", phone: "0890000000" }, checkIn: W(12), checkOut: W(13) })), "counter B");
    const id2 = c2.reservations[0].id, idB = b.reservations[0].id;
    const r = [await call(() => HOTEL.cancelBookingAsGuest(ctxA, { unitId: UH, reservationId: id2, reason: "x" })), await call(() => HOTEL.cancelBookingAsGuest(ctxA, { unitId: UH, reservationId: idB, reason: "x" })), await call(() => HOTEL.cancelBookingAsGuest(ctxA, { unitId: UHB, reservationId: idB, reason: "x" }))].map(code);
    ok(r.every((c) => c === "NOT_FOUND"), J(r));
    ok((await rvOf(id2)).status === "CONFIRMED" && (await rvOf(idB)).status === "CONFIRMED", "สถานะเปลี่ยน");
  });

  // A-3 สถานะที่ยกเลิกไม่ได้
  await st("A-3", "CRITICAL", "publicCancel สถานะ CHECKED_IN / CANCELLED / NO_SHOW ⇒ INVALID_STATUS ไม่เปลี่ยนแถว · ไม่มี AuditLog ใหม่", async () => {
    const out: Record<string, string> = {};
    for (const s of ["CHECKED_IN", "CANCELLED", "NO_SHOW"]) {
      const c = okRes(await counter({ checkIn: W(14), checkOut: W(15) }), "counter");
      const id = c.reservations[0].id;
      await prisma.hotelReservation.update({ where: { id }, data: { status: s } });
      const rv = await rvOf(id);
      const n0 = await prisma.auditLog.count({ where: { tenantId: tA, targetId: id } });
      const r = await call(() => WEB.publicCancel({ ...baseA, publicToken: rv.publicToken, email: EMAIL, confirmRefundSatang: 0 }, { clientKey: ip() }));
      out[s] = `${code(r)}/${(await rvOf(id)).status}/${(await prisma.auditLog.count({ where: { tenantId: tA, targetId: id } })) - n0}`;
    }
    ok(Object.entries(out).every(([s, v]) => v === `INVALID_STATUS/${s}/0`), J(out));
  });

  // A-4 token/lookup ข้ามหน่วยในร้านเดียวกัน
  await st("A-4", "CRITICAL", "X1 ข้ามหน่วย (ร้านเดียวกัน): token/รหัสของ UH2 เปิดผ่าน slug UH ⇒ status/pay/cancel/slip/lookup = คำตอบเดียวกับ token มั่ว (deepEqual) · แถวไม่เปลี่ยน", async () => {
    // อีเมลเฉพาะของใบนี้ (รหัส HR-… นับต่อหน่วย ⇒ UH อาจมีรหัสเดียวกัน — ต้องใช้อีเมลที่มีแค่ใบ UH2)
    const E2 = `${SLUG}u2only-${RUN}@qc.invalid`;
    const c2 = okRes(await counter({ guest: { name: "เคาน์เตอร์ UH2", phone: "0890000033", email: E2 } }, UH2, RT.u2), "counter UH2");
    const rv = await rvOf(c2.reservations[0].id);
    const T = rv.publicToken, junk = `c${randomBytes(12).toString("hex").slice(0, 24)}`;
    const pair = async (fn: (t: string) => Promise<Any>) => [await fn(T), await fn(junk)];
    const res = {
      status: await pair((t) => status(t)),
      pay: await pair((t) => call(() => WEB.publicPayDeposit({ ...baseA, publicToken: t }, { clientKey: ip() }))),
      cancel: await pair((t) => call(() => WEB.publicCancel({ ...baseA, publicToken: t, email: E2, confirmRefundSatang: 0 }, { clientKey: ip() }))),
      slip: await pair((t) => call(() => WEB.publicAttachSlip({ ...baseA, publicToken: t, file: { data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), contentType: "image/png" }, idempotencyKey: `h8rv-${uid()}` }, { clientKey: ip(), deps: { put: async () => {}, del: async () => 200 } }))),
      lookup: [await call(() => WEB.publicLookup({ ...baseA, code: rv.code, email: E2 }, { clientKey: ip() })), await call(() => WEB.publicLookup({ ...baseA, code: "HR-0000-0000", email: E2 }, { clientKey: ip() }))],
    };
    const bad = Object.entries(res).filter(([, [x, y]]) => J(x) !== J(y) || x?.ok !== false);
    ok(!bad.length, `ต่างจาก token มั่ว: ${J(bad)}`);
    ok((await rvOf(rv.id)).status === "CONFIRMED", "สถานะเปลี่ยน");
    // positive control: token นี้เปิดผ่าน slug UH2 ได้
    ok((await status(T, baseA2))?.ok === true, "positive control: token UH2 บน slug UH2 ไม่ได้");
    const pc = await call(() => WEB.publicLookup({ ...baseA2, code: rv.code, email: E2 }, { clientKey: ip() }));
    ok(pc?.ok === true && pc.publicToken === T, `positive control lookup UH2 ${J(pc)}`);
  });

  // A-5 entropy ของ publicToken
  await st("A-5", "MAJOR", "X7 publicToken ≥ 128 บิตสุ่ม (ใบ §0/§7): token 2 ใบที่สร้างติดกันต้องไม่มีส่วนที่เดาได้ (cuid v1 = c + เวลา + ตัวนับ + fingerprint เครื่อง + สุ่ม Math.random 8 ตัว ≈ 41 บิต)", async () => {
    const a = okRes(await hold({ checkIn: W(32), checkOut: W(33) }), "hold a");
    const b = okRes(await hold({ checkIn: W(32), checkOut: W(33) }), "hold b");
    const ta = String(a.publicToken), tb = String(b.publicToken);
    const cuidV1 = (t: string) => /^c[a-z0-9]{24}$/.test(t);
    if (cuidV1(ta) && cuidV1(tb)) {
      const fpA = ta.slice(13, 17), fpB = tb.slice(13, 17);
      const ts = (t: string) => parseInt(t.slice(1, 9), 36);
      const nearNow = Math.abs(ts(ta) - Date.now()) < 3_600_000;
      ok(!(fpA === fpB && nearNow), `token = cuid v1 (${ta.slice(0, 9)}… เวลา ms ${new Date(ts(ta)).toISOString()} · ตัวนับ ${ta.slice(9, 13)}→${tb.slice(9, 13)} · fingerprint ${fpA}=${fpB}) ⇒ ส่วนสุ่มจริงแค่ 8 ตัว base36 จาก Math.random ≈ 41 บิต`);
    }
    ok(ta.length >= 22 && ta !== tb, "token สั้น/ซ้ำ");
  });

  // A-6 IP เดียวยึดห้องทั้งโรงแรม
  await st("A-6", "MAJOR", "X7 กันยึดห้อง (inventory DoS): IP เดียว · ไม่มีอีเมล/เบอร์ · HOLD qty 5 ×2 (ภายในเพดาน 5/10 นาที · maxRooms 5) ⇒ ไม่ควรถือดีลักซ์ได้ครบ 10/10 ห้อง (ไม่มีเพดาน HOLD ค้างต่อหน่วย/ต่อ IP · ไม่บังคับติดต่อได้)", async () => {
    const key = ip();
    const g = { name: "bot", phone: null, email: null };
    const rs = [];
    for (let i = 0; i < 2; i++) rs.push(await hold({ checkIn: W(40), checkOut: W(41), rooms: [{ roomTypeId: RT.dlx, qty: 5, adults: 2, children: 0 }], guest: g }, { clientKey: key }));
    const okN = rs.filter((r) => r?.ok === true).length;
    const s = await call(() => WEB.publicSearch({ ...baseA, checkIn: W(40), checkOut: W(41), adults: 2, children: 0, rooms: 1 }, { clientKey: ip() }));
    const dlx = s?.roomTypes?.find((t: Any) => t.id === RT.dlx);
    ok(!(okN === 2 && dlx && dlx.remaining === 0), `IP เดียว (ไม่มีอีเมล/เบอร์) ถือดีลักซ์ได้ ${okN * 5}/10 ห้อง · ค้นหาเหลือ ${dlx?.remaining} · HOLD ละ 15 นาที ทำซ้ำได้ทุก 10 นาที ⇒ ล็อกห้องทั้งหมดต่อเนื่อง`);
  });

  // A-7 lookup/cancel ไม่บอกข้อมูลเมื่ออีเมลผิด
  await st("A-7", "CRITICAL", "publicCancel อีเมลผิด + ยอดผิด ⇒ NOT_FOUND (ไม่ใช่ REFUND_CHANGED ที่บอกยอด) · ไม่มีอีเมล ⇒ NOT_FOUND · lookup «รหัสถูก/อีเมลผิด» deepEqual «รหัสไม่มี»", async () => {
    const h = okRes(await hold({ checkIn: W(34), checkOut: W(35) }), "hold");
    const r1 = await call(() => WEB.publicCancel({ ...baseA, publicToken: h.publicToken, email: `x${EMAIL}`, confirmRefundSatang: 999 }, { clientKey: ip() }));
    const r2 = await call(() => WEB.publicCancel({ ...baseA, publicToken: h.publicToken, confirmRefundSatang: 999 }, { clientKey: ip() }));
    ok(code(r1) === "NOT_FOUND" && code(r2) === "NOT_FOUND" && r1.refundSatang === undefined, `${J(r1)} ${J(r2)}`);
    const l1 = await call(() => WEB.publicLookup({ ...baseA, code: h.code, email: `x${EMAIL}` }, { clientKey: ip() }));
    const l2 = await call(() => WEB.publicLookup({ ...baseA, code: "HR-9999-9999", email: EMAIL }, { clientKey: ip() }));
    ok(J(l1) === J(l2) && l1?.ok === false, `${J(l1)} vs ${J(l2)}`);
    ok((await rvByToken(h.publicToken)).status === "HOLD", "สถานะเปลี่ยน");
  });

  // A-8 DTO สาธารณะไม่มี PII/ภายใน
  await st("A-8", "CRITICAL", "X8 publicStatus/publicPayDeposit (การจองเคาน์เตอร์มีหมายเหตุภายใน+เบอร์+ชื่อ) ⇒ JSON ไม่มีชื่อ · เบอร์ · อีเมลเต็ม · note · id แถว/ร้าน/หน่วย/ประเภท/แผน · publicToken", async () => {
    const c = okRes(await counter({ checkIn: W(16), checkOut: W(17) }), "counter");
    const rv = await rvOf(c.reservations[0].id);
    const s = await status(rv.publicToken);
    okRes(s, "status");
    const p = await call(() => WEB.publicPayDeposit({ ...baseA, publicToken: rv.publicToken }, { clientKey: ip() }));
    const txt = J(s) + J(p);
    const needles: Record<string, string> = { name: "เคาน์เตอร์ h8rv", phone: "0890000011", email: EMAIL, note: "INTERNAL-NOTE", id: rv.id, tenant: tA, unit: UH, type: RT.dlx, plan: plans[UH], token: rv.publicToken };
    const hit = Object.entries(needles).filter(([, v]) => txt.includes(v)).map(([k]) => k);
    ok(!hit.length, `รั่ว: ${hit.join(",")}`);
  });

  // A-9 double cancel พร้อมกัน
  await st("A-9", "CRITICAL", "X3 publicCancel ยิงพร้อมกัน 4 ทาง (คนละ IP) บน HOLD เดียว ⇒ สำเร็จ 1 · AuditLog cancelled 1 · event hotel.web.cancelled_by_guest 1", async () => {
    const h = okRes(await hold({ checkIn: W(36), checkOut: W(37) }), "hold");
    const rs = await Promise.all(Array.from({ length: 4 }, () => call(() => WEB.publicCancel({ ...baseA, publicToken: h.publicToken, email: EMAIL, confirmRefundSatang: 0 }, { clientKey: ip() }))));
    const id = (await rvByToken(h.publicToken)).id;
    const n = rs.filter((r) => r?.ok === true).length;
    const aud = await prisma.auditLog.count({ where: { tenantId: tA, action: "hotel.booking.cancelled", targetId: id } });
    const ev = (await prisma.outboxEvent.findMany({ where: { tenantId: tA, type: "hotel.web.cancelled_by_guest" } })).filter((e: Any) => e.payload?.reservationId === id).length;
    ok(n === 1 && aud === 1 && ev === 1, `ok ${n} audit ${aud} event ${ev} · ${J(rs.map(code))}`);
  });

  // A-10 ประเภทห้องของหน่วยอื่น / แผนของร้านอื่น
  await st("A-10", "CRITICAL", "X1 publicCreateHold บน UH ด้วย roomTypeId ของ UH2 / ของร้าน B · ratePlanId ของร้าน B ⇒ ok:false ไม่สร้างแถวใน UH/UH2/UHB · reason ไม่มี id", async () => {
    const n0 = await prisma.hotelReservation.count({ where: { tenantId: { in: [tA, tB] } } });
    const r = [
      await hold({ rooms: [{ roomTypeId: RT.u2, qty: 1 }] }),
      await hold({ rooms: [{ roomTypeId: RT.b, qty: 1 }] }),
      await hold({ rooms: [{ roomTypeId: RT.dlx, qty: 1, ratePlanId: plans[UHB] }] }),
    ];
    ok(r.every((x) => x?.ok === false), J(r.map(code)));
    ok(r.every((x) => ![RT.u2, RT.b, plans[UHB], UH, UH2, tA, tB].some((v) => String(x?.reason ?? "").includes(v))), "reason มี id");
    ok((await prisma.hotelReservation.count({ where: { tenantId: { in: [tA, tB] } } })) === n0, "สร้างแถว");
  });

  // A-11 idempotencyKey เดิม ข้อมูลต่าง
  await st("A-11", "MINOR", "X3 idempotencyKey เดิมแต่ข้อมูลต่าง (วัน/ชื่อ) ⇒ ไม่สร้างใบใหม่ · คืนใบเดิม (replayed) — บันทึกพฤติกรรม: ข้อมูลใหม่ถูกเพิกเฉยเงียบ", async () => {
    const key = `h8rv-${uid()}`;
    const a = okRes(await hold({ checkIn: W(42), checkOut: W(43), idempotencyKey: key }), "a");
    const n0 = await prisma.hotelReservation.count({ where: { tenantId: tA } });
    const b = await hold({ checkIn: W(44), checkOut: W(46), guest: { ...GUEST, name: "คนอื่น" }, idempotencyKey: key });
    ok(b?.ok === true && b.publicToken === a.publicToken && b.replayed === true, `ผล ${J(b)}`);
    ok((await prisma.hotelReservation.count({ where: { tenantId: tA } })) === n0, "สร้างแถวใหม่");
    // ร้าน/หน่วยอื่นด้วยกุญแจเดียวกัน = ใบใหม่ (กุญแจผูกหน่วย) ไม่ได้ token ของ UH
    const c = await hold({ checkIn: W(42), checkOut: W(43), idempotencyKey: key, rooms: [{ roomTypeId: RT.u2, qty: 1 }] }, {}, baseA2, UH2, RT.u2);
    ok(c?.ok === true && c.publicToken !== a.publicToken && !c.replayed, `UH2 ${J(c)}`);
  });

  // A-12 ถัง rate ต่อ slug ที่ไม่มีจริง
  await st("A-12", "MINOR", "X7 slug มั่ว (หน่วยไม่มีจริง) ⇒ ไม่ควรสร้างถัง rate ใหม่ต่อ slug (ผู้ไม่ประสงค์ดีหมุน slug = เขียนแถว ChatRateBucket ไม่จำกัด · ไม่มีเพดานรวมต่อ IP)", async () => {
    const before = await prisma.chatRateBucket.count();
    const key = ip();
    for (let i = 0; i < 12; i++) await call(() => WEB.publicSearch({ tenantSlug: slugA, unitSlug: `${SLUG}junk-${uid()}`, checkIn: W(10), checkOut: W(11) }, { clientKey: key }));
    const grew = (await prisma.chatRateBucket.count()) - before;
    try { await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'hw:search:%' AND key LIKE $1`, `%:${sha(key).slice(0, 32)}`); } catch { /* */ }
    ok(grew < 12, `slug มั่ว 12 ครั้ง ⇒ ถังใหม่ ${grew} แถว (คีย์ hash ของ slug ดิบ ไม่ใช่ unitId)`);
  });

  // A-13 สลิปท่วมคิว
  await st("A-13", "MINOR", "X7 แนบสลิปซ้ำ (กุญแจต่างกัน) บน HOLD เดียว 3 ครั้ง ⇒ PaymentSlip รอตรวจของการจองเดียวไม่ควรเกิน 1 (คิวพนักงาน/ที่เก็บไฟล์ไม่ท่วม)", async () => {
    const h = okRes(await hold({ checkIn: W(38), checkOut: W(39) }), "hold");
    const id = (await rvByToken(h.publicToken)).id;
    const png = () => Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(96)]));
    const rs = [];
    for (let i = 0; i < 3; i++) rs.push(await call(() => WEB.publicAttachSlip({ ...baseA, publicToken: h.publicToken, file: { data: png(), contentType: "image/png" }, idempotencyKey: `h8rv-slip-${uid()}` }, { clientKey: ip(), deps: { put: async () => {}, del: async () => 200 } })));
    const n = await prisma.paymentSlip.count({ where: { tenantId: tA, refId: id } });
    ok(n <= 1, `สลิป ${n} ใบ · ผล ${J(rs.map(code))}`);
  });

  // A-14 แขกยกเลิกการจองช่องทาง OTA ผ่านเว็บโรงแรม
  {
    const o = await call(() => HOTEL.createBooking(OWNER, ctxA, { unitId: UH, rooms: [{ roomTypeId: RT.dlx, adults: 2, children: 0 }], ratePlanId: plans[UH], source: "OTA", channelRef: `OTA-${uid()}`, guest: { name: "OTA guest", phone: "0890000022", email: EMAIL }, checkIn: W(18), checkOut: W(19) }));
    if (o?.ok !== true) skip("A-14", "MAJOR", "แขก OTA ยกเลิกผ่านเว็บ", `สร้าง OTA ไม่ได้ ${code(o)}`);
    else await st("A-14", "MAJOR", "แหล่ง OTA: การจองจาก OTA (มีอีเมล) ⇒ หน้าสถานะ canCancel=false และ publicCancel ปฏิเสธ (ยกเลิกต้องทำที่ OTA · กันห้องคืนโรงแรมขณะ OTA ยังขาย/ยังถือ)", async () => {
      const rv = await rvOf(o.reservations[0].id);
      const s = await status(rv.publicToken);
      const r = await call(() => WEB.publicCancel({ ...baseA, publicToken: rv.publicToken, email: EMAIL, confirmRefundSatang: 0 }, { clientKey: ip() }));
      ok(s?.canCancel === false && r?.ok === false, `canCancel ${s?.canCancel} · publicCancel ${code(r)} · แถว ${(await rvOf(rv.id)).status}`);
    });
  }

  // A-15 โดเมนร้าน
  const dom = `${SLUG}${RUN}.example.com`;
  await st("A-15", "MAJOR", "โดเมนร้าน: Tenant A customDomain ACTIVE ⇒ hotelHostAllowed(host A, slug B)=false · (host A, slug A)=true · ตัวพิมพ์ใหญ่ ⇒ false · โฮสต์ SHARK ⇒ true", async () => {
    await prisma.tenant.update({ where: { id: tA }, data: { customDomain: dom, domainStatus: "ACTIVE" } });
    const r = { ab: await WEB.hotelHostAllowed(dom, slugB), aa: await WEB.hotelHostAllowed(dom, slugA), up: await WEB.hotelHostAllowed(dom.toUpperCase(), slugB), shark: await WEB.hotelHostAllowed("shark.in.th", slugB) };
    ok(r.ab === false && r.aa === true && r.up === false && r.shark === true, J(r));
  });
  await st("A-15b", "MINOR", "โดเมนร้าน: Host มีพอร์ต (dom:443 / dom:8443) ⇒ ยังถือเป็นโดเมนร้าน A (false สำหรับ slug B) — กันไว้ชั้นเดียว (เบราว์เซอร์ปกติไม่ส่งพอร์ต 443)", async () => {
    const r = { p443: await WEB.hotelHostAllowed(`${dom}:443`, slugB), p8443: await WEB.hotelHostAllowed(`${dom}:8443`, slugB) };
    ok(r.p443 === false && r.p8443 === false, J(r));
  });

  // A-16 i18n คีย์ครบคู่
  await st("A-16", "MINOR", "i18n hotel.web.* ครบคู่ th/en · ค่าไม่ว่าง · en ไม่มีอักษรไทย", async () => {
    const D = DICTM.DICT;
    const th = Object.keys(D.th).filter((k) => k.startsWith("hotel.web.")), en = Object.keys(D.en).filter((k) => k.startsWith("hotel.web."));
    const miss = [...th.filter((k) => !(k in D.en)), ...en.filter((k) => !(k in D.th))];
    const thaiInEn = en.filter((k) => /[฀-๿]/.test(D.en[k]));
    const empty = [...th, ...en].filter((k) => !String(D.th[k] ?? "").trim() || !String(D.en[k] ?? "").trim());
    ok(th.length > 20 && !miss.length && !thaiInEn.length && !empty.length, `th ${th.length} en ${en.length} ขาด ${J(miss)} ไทยใน en ${J(thaiInEn)} ว่าง ${J(empty)}`);
  });
} catch (e) {
  console.log(`🔴 probe ล้มนอกข้อ: ${errMsg(e)}`);
  exitCode = 3;
} finally {
  await cleanup(tenantIds);
  await cleanupUsers();
  await cleanupBuckets();
  const left = await prisma.tenant.count({ where: { slug: { startsWith: SLUG } } });
  console.log(`(ล้างร้านชั่วคราว · เหลือ ${left})`);
}
const failed = cks.filter((c) => c.res === "FAIL").map((c) => c.id);
const skipped = cks.filter((c) => c.res === "SKIP").map((c) => c.id);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "probe-h8-review-a", total: cks.length, passed: cks.filter((c) => c.res === "PASS").length, failed, skipped, bySev: Object.fromEntries(cks.filter((c) => c.res === "FAIL").map((c) => [c.id, c.sev])) })}`);
await prisma.$disconnect?.();
process.exit(exitCode || (failed.length ? 1 : 0));
