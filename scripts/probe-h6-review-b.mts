// probe-h6-review-b.mts — ผู้ตรวจรอบ 1 (เบา) ใบ H.6 แม่บ้านมือถือ · ร้านชั่วคราว h6rv-* (ลบใน finally) · อ่าน/เขียนเฉพาะร้านของตัวเอง · ไม่แก้ src · ไม่แตะฉาก svcqc
// รัน: cd <ทรี> && bash scripts/iso.sh bash scripts/qc-svc.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/probe-h6-review-b.mts
// ORACLE-EDIT (ผู้คุม 7 พ.ย. · h6-review-probe): ย้าย probe ผู้ตรวจเข้าทรีเป็น regression ถาวร ปรับตามมติใบ h.6 §10 —
//   D-0 BLK2 ใช้ BLOCK เดียว (H.2 ปฏิเสธ BLOCK ซ้อน ROOM_TAKEN = ถูก) · E 12 ห้องพร้อมกันต้องครบ ok/log/event < 10 วิ (§10.1) ·
//   B-4/B-5 ชุดที่มีรายการไม่ผ่าน ⇒ INVALID_INPUT ไม่มี FolioItem เพิ่ม · B-6 ไม่มี FolioItem เพิ่ม · B-7 ของฟรีไม่ลง folio แต่อยู่ใน items (§10.2) · C-1 INSPECTED บนห้องมีแขก = รับได้ (§10.4)
// จุดเน้น (นอกเหนือข้อสอบ qc-svc-h.6): หอไม่เปลี่ยนหลังเปิดด่าน DORM|HOTEL · สะพาน dorm.repair.created บนหน่วย HOTEL · syncBlockedRooms (หนี้ H.2) ·
//   มินิบาร์ snapshot/ของฟรี/เพดาน · pool starvation เมื่อหลายห้องพร้อมกัน (ST-6 ทดสอบห้องเดียว) · INSPECTED บนห้องมีแขก
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
type Any = any;
const LABEL = "probe-h6-review-b";
const SLUG = "h6rv-";
loadSvcQcEnv(LABEL);
if (process.env.CI || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: env ต้องห้าม`); process.exit(4); }
delete process.env.SVC_QC_CLOCK;
delete process.env.ABLY_API_KEY;
const R = new URL("../src/lib", import.meta.url).pathname;
const { prisma } = (await import(`${R}/core/db`)) as Any;
const hk = (await import(`${R}/modules/hotel/housekeeping.ts`)) as Any;
const blk = (await import(`${R}/modules/hotel/block.ts`)) as Any;
const rooms = (await import(`${R}/modules/rooms`)) as Any;
const SET = (await import(`${R}/core/settings/service`)) as Any;
const portal = (await import(`${R}/modules/dorm/portal.ts`)) as Any;
const repair = (await import(`${R}/modules/dorm/repair.ts`)) as Any;
const bridges = (await import(`${R}/platform/kanban-bridges.ts`)) as Any;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
const J = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
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
const call = async (f: () => Promise<Any>): Promise<Any> => { try { return await f(); } catch (e) { return { ok: false, code: "THROW", reason: errMsg(e) }; } };
const code = (r: Any) => (r?.ok === true ? "ok" : `${r?.code ?? "?"}${r?.reason ? ` (${String(r.reason).slice(0, 80)})` : ""}`);
const key = (p: string) => `${p}-${uid()}-${randomBytes(4).toString("hex")}`;
// PNG 1×1 ถูกต้อง
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const pngChunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
const makePng = (seed = 1): Uint8Array => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2; const raw = Buffer.from([0, seed & 255, (seed * 7) & 255, (seed * 13) & 255]); return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))])); };
const PNG = (seed = 1) => ({ data: makePng(seed), contentType: "image/png" });

const tenantIds: string[] = [];
let tables: string[] = [];
async function cleanup() {
  if (!tenantIds.length) return;
  if (!tables.length) {
    const rows: { t: string }[] = await prisma.$queryRawUnsafe(`SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`);
    tables = rows.map((r) => r.t).filter((t) => t !== "Tenant");
  }
  // r0.8 S-6: ลบ roomOccupancy ก่อน hotelRoom เสมอ
  await prisma.roomOccupancy.deleteMany({ where: { tenantId: { in: tenantIds } } });
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
  // กวาดค้าง
  const stale = await prisma.tenant.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (stale.length) { tenantIds.push(...stale.map((t: Any) => t.id)); await cleanup(); tenantIds.length = 0; console.log(`(กวาดร้านค้าง ${stale.length})`); }

  // ═══ ร้านชั่วคราว ═══
  const tA = (await prisma.tenant.create({ data: { name: "RV H6 ร้าน A", slug: `${SLUG}${RUN}` } })).id as string;
  tenantIds.push(tA);
  const ctxA = { tenantId: tA };
  const mkUnit = async (type: string, name: string) => (await prisma.businessUnit.create({ data: { tenantId: tA, type, name, slug: `u-${uid()}` } })).id as string;
  const UH = await mkUnit("HOTEL", "โรงแรม RV");
  const UD = await mkUnit("DORM", "หอ RV");
  const RT = (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: UH, name: "ดีลักซ์", rentMode: "NIGHTLY", baseRateSatang: 100_000, capacity: 2, baseOccupancy: 2, maxOccupancy: 2 } })).id as string;
  const RTD = (await prisma.hotelRoomType.create({ data: { tenantId: tA, unitId: UD, name: "ห้องหอ", rentMode: "MONTHLY", baseRateSatang: 0, monthlyRateSatang: 450_000 } })).id as string;
  const mkRoom = async (unitId: string, number: string, roomTypeId: string, hkS: string) => (await prisma.hotelRoom.create({ data: { tenantId: tA, unitId, number, roomTypeId, hkStatus: hkS, floorNo: 1, status: hkS === "OUT_OF_ORDER" ? "OOO" : hkS === "DIRTY" ? "CLEANING" : "AVAILABLE" } })).id as string;
  const ROOM: Record<string, string> = {};
  for (const [n, s] of [["STAY", "DIRTY"], ["REP", "DIRTY"], ["BLK1", "CLEAN"], ["BLK2", "CLEAN"], ["OOOM", "OUT_OF_ORDER"], ["MB", "DIRTY"]] as const) ROOM[n] = await mkRoom(UH, n, RT, s);
  const CC: string[] = [];
  for (let i = 1; i <= 12; i++) CC.push(await mkRoom(UH, `C${String(i).padStart(2, "0")}`, RT, "DIRTY"));
  const ROOM_D = await mkRoom(UD, "D101", RTD, "DIRTY");
  const mkMember = async (tag: string, role: Actor["role"], unitAccess: string[], permissions: Record<string, unknown> = {}): Promise<Actor> => {
    const id = `${SLUG}${tag}-${RUN}`;
    await prisma.user.create({ data: { id, email: `${SLUG}${tag}-${RUN}@shark.local`, name: `RV h6 ${tag}` } });
    await prisma.membership.create({ data: { userId: id, tenantId: tA, role, unitAccess, permissions, acceptedAt: new Date() } });
    return { role, unitAccess, permissions, userId: id };
  };
  const OWNER = await mkMember("owner", "OWNER", ["*"]);
  const MAID = await mkMember("maid", "STAFF", [UH], { "hotel.housekeeping": true });
  const LEAD = await mkMember("lead", "STAFF", [UH], { "hotel.housekeeping": true, "hotel.housekeeping.inspect": true });
  const DSTAFF = await mkMember("dstaff", "STAFF", [UD], { "dorm.repair.manage": true });
  const setUnit = async (k: string, value: unknown, unitId = UH) => { const r = await SET.setSettings(OWNER, ctxA, [{ key: k, scope: "UNIT", scopeId: unitId, value }]); if (r?.ok !== true) throw new Error(`setSettings ${k}: ${J(r)}`); };
  let seq = 0;
  const mkRes = async (roomId: string, status: string, ci: string, co: string, folio: "OPEN" | "SETTLED" | null) => {
    const rv = await prisma.hotelReservation.create({ data: { tenantId: tA, unitId: UH, code: `RV6-${RUN}-${++seq}`, status, guestName: `แขกทดสอบ ${seq}`, guestPhone: "0811110000", roomTypeId: RT, roomId, checkInDate: dbDate(ci), checkOutDate: dbDate(co), nights: dayNo(co) - dayNo(ci), adults: 2, source: "WALK_IN", taxSnapshot: { mode: "INCLUSIVE", vatBp: 700, serviceChargeBp: 0 }, ...(status === "CHECKED_IN" ? { checkedInAt: new Date(Date.parse(`${ci}T07:00:00Z`)) } : {}) } });
    for (let d = ci; d < co; d = addDays(d, 1)) await prisma.hotelBookingNight.create({ data: { tenantId: tA, unitId: UH, reservationId: rv.id, roomTypeId: RT, roomId, date: dbDate(d), priceSatang: 100_000, counted: true } });
    const c = await prisma.$transaction((tx: Any) => rooms.claimRoom(tx, { tenantId: tA, unitId: UH, roomId, start: ci, end: co, kind: "STAY", refType: "HotelReservation", refId: rv.id, requireRentMode: "NIGHTLY" }));
    if (c?.ok !== true) throw new Error(`claimRoom: ${J(c)}`);
    if (folio) await prisma.hotelFolio.create({ data: { tenantId: tA, unitId: UH, reservationId: rv.id, status: folio, balanceSatang: 0, ...(folio === "SETTLED" ? { settledAt: new Date() } : {}) } });
    return rv.id as string;
  };
  const RV_STAY = await mkRes(ROOM.STAY, "CHECKED_IN", W(-1), W(2), "OPEN");
  await setUnit("rooms.hotel.minibar", [{ key: "water", name: "น้ำเปล่า (ฟรี)", priceSatang: 0 }, { key: "soda", name: "โซดา", priceSatang: 4000 }, { key: "wine", name: "ไวน์", priceSatang: 600_000 }]);
  await setUnit("rooms.hotel.inspectionRequired", true);
  const hkOf = async (id: string) => (await prisma.hotelRoom.findUnique({ where: { id }, select: { hkStatus: true } }))?.hkStatus as string;
  const logsOf = (roomId: string) => prisma.hotelHousekeepingLog.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const itemsOf = (rvId: string) => prisma.hotelFolioItem.findMany({ where: { tenantId: tA, folio: { reservationId: rvId }, voidedAt: null }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  const events = (type: string) => prisma.outboxEvent.findMany({ where: { tenantId: tA, type }, orderBy: { createdAt: "asc" } }) as Promise<Any[]>;
  console.log(`(ร้าน ${tA} · โรงแรม ${UH} · หอ ${UD} · วันนี้ ${T0})`);

  // ═══ A ด่าน DORM|HOTEL — หอไม่เปลี่ยน ═══
  console.log("\n── A ด่าน DORM|HOTEL · หอไม่เปลี่ยน ──");
  const dctx = { tenantId: tA, actorUserId: DSTAFF.userId };
  const mctx = { tenantId: tA, actorUserId: MAID.userId };
  const octx = { tenantId: tA, actorUserId: OWNER.userId };
  {
    const g0 = await call(() => portal.dormStaffGate(dctx, UD, "dorm.repair.manage"));
    const g1 = await call(() => portal.dormStaffGate(dctx, UD, "dorm.repair.manage", { allowTypes: ["HOTEL"] }));
    const g2 = await call(() => portal.dormStaffGate(dctx, UD, "dorm.repair.manage", { allowTypes: ["X"] }));
    const g3 = await call(() => portal.dormStaffGate(dctx, UD, "dorm.repair.manage", { allowTypes: "HOTEL" }));
    const g4 = await call(() => portal.dormStaffGate(dctx, UD, "dorm.repair.manage", { allowTypes: ["DORM", "HOTEL"] }));
    const g5 = await call(() => portal.dormStaffGate(dctx, UH, "dorm.repair.manage", { allowTypes: ["DORM", "HOTEL"] }));
    const g6 = await call(() => portal.dormStaffGate(mctx, UH, "dorm.repair.manage", { allowTypes: ["DORM", "HOTEL"] }));
    const g7 = await call(() => portal.dormStaffGate(octx, UH, "dorm.repair.manage", { allowTypes: ["DORM", "HOTEL"] }));
    const g8 = await call(() => portal.dormStaffGate(octx, UH, "dorm.repair.manage"));
    chk("A-1", "dormStaffGate หอ: ค่าเริ่ม ⇒ ผ่าน (ไม่มี unitType) · allowTypes [HOTEL] บนหอ ⇒ null · ค่าขยะ ([X] / สตริง) ⇒ ทางเดิม ⇒ ผ่าน · [DORM,HOTEL] บนหอ ⇒ unitType DORM",
      !!g0 && g0.unitId === UD && g0.unitType === undefined && g1 === null && !!g2 && g2.unitId === UD && !!g3 && g3.unitId === UD && !!g4 && g4.unitType === "DORM",
      J({ g0, g1, g2, g3, g4 }).slice(0, 300));
    chk("A-2", "dormStaffGate โรงแรม: dstaff (unitAccess หอ) ⇒ null · maid (ไม่มี dorm.repair.manage) ⇒ null · owner [DORM,HOTEL] ⇒ unitType HOTEL · owner ค่าเริ่ม ⇒ null",
      g5 === null && g6 === null && !!g7 && g7.unitType === "HOTEL" && g8 === null, J({ g5, g6, g7, g8 }).slice(0, 200));
  }
  // ใบซ่อมจากแม่บ้านโรงแรม
  const K_REP = key("defect");
  const d1 = await call(() => hk.reportDefect(MAID, ctxA, { roomId: ROOM.REP, text: "แอร์ไม่เย็น", photos: [PNG(1)], action: "REPAIR", category: "ELECTRIC", idempotencyKey: K_REP }));
  const d1b = await call(() => hk.reportDefect(MAID, ctxA, { roomId: ROOM.REP, text: "แอร์ไม่เย็น", photos: [PNG(1)], action: "REPAIR", category: "ELECTRIC", idempotencyKey: K_REP }));
  const d2 = await call(() => hk.reportDefect(MAID, ctxA, { roomId: ROOM.REP, text: "หมวดแปลก", action: "REPAIR", category: "NOPE" }));
  const repRows = await prisma.dormRepair.findMany({ where: { tenantId: tA }, orderBy: { createdAt: "asc" } }) as Any[];
  const r1 = repRows.find((r) => r.id === d1?.repairId);
  const r2 = repRows.find((r) => r.id === d2?.repairId);
  chk("A-3", "REPAIR โดย maid ⇒ DormRepair บนหน่วย HOTEL · category ELECTRIC · leaseId/partyId null · allowEntry · files 1 (role TENANT) · หมวดแปลก ⇒ fallback OTHER/แรก · คีย์ซ้ำ ⇒ ใบเดิม (แถวเดียว)",
    d1?.ok === true && d1b?.ok === true && d1b.repairId === d1.repairId && !!r1 && r1.unitId === UH && r1.roomId === ROOM.REP && r1.category === "ELECTRIC" && r1.leaseId === null && r1.partyId === null && r1.allowEntry === true && Array.isArray(r1.files) && r1.files.length === 1 && d2?.ok === true && !!r2 && r2.category !== "NOPE" && repRows.length === 2,
    `${code(d1)} · ${code(d1b)} · ${code(d2)} · rows=${repRows.length} · cat2=${r2?.category} · files=${J(r1?.files).slice(0, 80)}`);
  const defEv = await events("hotel.hk.defect");
  const defLogs = (await logsOf(ROOM.REP)).filter((l) => /"defect"/.test(l.note ?? ""));
  chk("A-4", "คีย์ซ้ำไม่ซ้ำ event/log: hotel.hk.defect 2 (ใบละ 1) · log defect 2 · payload ไม่มีข้อความแจ้ง/ชื่อ", defEv.length === 2 && defLogs.length === 2 && defEv.every((e) => !/แอร์|หมวดแปลก/.test(J(e.payload))), `ev=${defEv.length} logs=${defLogs.length} ${J(defEv[0]?.payload)}`);
  // หอมองไม่เห็นใบโรงแรม · โรงแรมมองไม่เห็นใบหอ
  const ld = await call(() => repair.listDormRepairs(dctx, { unitId: UD, status: "ALL" }));
  const ldH = await call(() => repair.listDormRepairs(dctx, { unitId: UH, status: "ALL" }));
  const jobD = await call(() => repair.dormRepairJob(dctx, { unitId: UD, repairId: d1?.repairId }));
  const lm = await call(() => repair.listDormRepairs(mctx, { unitId: UH, status: "ALL" }));
  const lo = await call(() => repair.listDormRepairs(octx, { unitId: UH, status: "ALL" }));
  const ldRows = Array.isArray(ld?.rows) ? ld.rows : (ld?.items ?? []);
  chk("A-5", "ช่างหอ listDormRepairs(หอ) ยังใช้ได้ (ok · ไม่มีใบโรงแรม) · ช่างหอดูหน่วยโรงแรม ⇒ NOT_FOUND · dormRepairJob(หอ, ใบโรงแรม) ⇒ NOT_FOUND · maid list(โรงแรม) ⇒ NOT_FOUND (ไม่มี dorm.repair.manage) · owner list(โรงแรม) เห็นใบ 2",
    ld?.ok === true && !ldRows.some((r: Any) => r.repairId === d1?.repairId) && ldH?.ok === false && ldH.code === "NOT_FOUND" && jobD?.ok === false && jobD.code === "NOT_FOUND" && lm?.ok === false && lm.code === "NOT_FOUND" && lo?.ok === true && (lo.rows ?? lo.items ?? []).length === 2,
    `ld=${code(ld)} rows=${ldRows.length} · ldH=${code(ldH)} · jobD=${code(jobD)} · lm=${code(lm)} · lo=${code(lo)} n=${(lo?.rows ?? lo?.items ?? []).length}`);
  const cs1 = await call(() => repair.createStaffRepair(DSTAFF, ctxA, { unitId: UH, roomId: ROOM.REP, text: "ข้ามหน่วย", allowEntry: true }));
  const cs2 = await call(() => repair.createStaffRepair(MAID, ctxA, { unitId: UD, roomId: ROOM_D, text: "แม่บ้านแจ้งห้องหอ", allowEntry: true }));
  const cs3 = await call(() => repair.createStaffRepair(DSTAFF, ctxA, { unitId: UD, roomId: ROOM.REP, text: "ห้องโรงแรมผ่านหน่วยหอ", allowEntry: true }));
  const dd = await call(() => hk.reportDefect(MAID, ctxA, { roomId: ROOM_D, text: "ห้องหอ", action: "REPAIR" }));
  const cs4 = await call(() => repair.createStaffRepair(DSTAFF, ctxA, { unitId: UD, roomId: ROOM_D, text: "ช่างหอแจ้งเอง", allowEntry: true }));
  chk("A-6", "ข้ามหน่วย NOT_FOUND: ช่างหอ→ห้องโรงแรม · maid→หน่วยหอ · ช่างหอ หน่วยหอ+ห้องโรงแรม · maid reportDefect ห้องหอ ⇒ NOT_FOUND · ช่างหอแจ้งห้องหอเองผ่านเส้นใหม่ ⇒ ok (dorm.repair.manage)",
    cs1?.ok === false && cs1.code === "NOT_FOUND" && cs2?.ok === false && cs2.code === "NOT_FOUND" && cs3?.ok === false && cs3.code === "NOT_FOUND" && dd?.ok === false && dd.code === "NOT_FOUND" && cs4?.ok === true,
    `${code(cs1)} · ${code(cs2)} · ${code(cs3)} · ${code(dd)} · ${code(cs4)}`);
  // สะพานบอร์ดงาน
  const evC = await events("dorm.repair.created");
  const bridgeRes = await call(async () => { for (const e of evC) await bridges.onDormRepairCreated({ id: e.id, tenantId: tA, type: e.type, payload: e.payload, systemId: e.systemId ?? null, unitId: e.unitId ?? null }); return { ok: true, n: evC.length }; });
  chk("A-7", "สะพาน onDormRepairCreated รับ event ของใบโรงแรมโดยไม่ throw (ไม่มีบอร์ด ⇒ เงียบ)", bridgeRes?.ok === true && evC.length >= 2, `${code(bridgeRes)} n=${evC.length}`);

  // ═══ B มินิบาร์ ═══
  console.log("\n── B มินิบาร์ (snapshot · ของฟรี · เพดาน) ──");
  const m1 = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "soda", qty: 2 }], idempotencyKey: key("mb") }));
  let items = await itemsOf(RV_STAY);
  const it1 = items.find((i) => i.type === "MINIBAR");
  chk("B-1", "postMinibar soda×2 ⇒ ok posted 1 amount 8000 · FolioItem MINIBAR qty 2 unit 4000 amount 8000 · description มีชื่อจากค่าตั้ง · refType HotelHousekeeping",
    m1?.ok === true && m1.posted === 1 && m1.amountSatang === 8000 && !!it1 && it1.qty === 2 && it1.unitAmountSatang === 4000 && it1.amountSatang === 8000 && /โซดา/.test(it1.description) && it1.refType === "HotelHousekeeping",
    `${code(m1)} ${J({ posted: m1?.posted, amt: m1?.amountSatang })} item=${J({ q: it1?.qty, u: it1?.unitAmountSatang, a: it1?.amountSatang, d: it1?.description, rt: it1?.refType })}`);
  await setUnit("rooms.hotel.minibar", [{ key: "water", name: "น้ำเปล่า (ฟรี)", priceSatang: 0 }, { key: "soda", name: "โซดา", priceSatang: 5000 }, { key: "wine", name: "ไวน์", priceSatang: 600_000 }]);
  const m2 = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "soda", qty: 1 }], idempotencyKey: key("mb") }));
  items = await itemsOf(RV_STAY);
  const it1b = items.find((i) => i.id === it1?.id);
  const it2 = items.filter((i) => i.type === "MINIBAR" && i.id !== it1?.id)[0];
  chk("B-2", "snapshot: แก้ราคา soda 4000→5000 แล้ว รายการเดิมคง 4000 · รายการใหม่ 5000", it1b?.unitAmountSatang === 4000 && m2?.ok === true && it2?.unitAmountSatang === 5000, `${code(m2)} old=${it1b?.unitAmountSatang} new=${it2?.unitAmountSatang}`);
  const m3 = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "soda", qty: 1, priceSatang: 1 }], idempotencyKey: key("mb") }));
  chk("B-3", "ราคาจาก client ไม่รับ (strict) ⇒ INVALID_INPUT", m3?.ok === false && m3.code === "INVALID_INPUT", code(m3));
  const before = (await itemsOf(RV_STAY)).length;
  const K_BAD = key("mb");
  const m4 = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "soda", qty: 1 }, { key: "nope", qty: 1 }], idempotencyKey: K_BAD }));
  const after4 = await itemsOf(RV_STAY);
  const m4b = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "soda", qty: 1 }, { key: "nope", qty: 1 }], idempotencyKey: K_BAD }));
  const after4b = await itemsOf(RV_STAY);
  chk("B-4", "ชุดมีคีย์นอกค่าตั้ง: soda+nope ⇒ INVALID_INPUT ทั้งชุด · FolioItem ไม่เพิ่มเลย · ส่งซ้ำคีย์เดิมผลเดิม (มติ §10.2)",
    m4?.ok === false && m4.code === "INVALID_INPUT" && after4.length === before && m4b?.ok === false && m4b.code === "INVALID_INPUT" && after4b.length === before,
    `${code(m4)} · items ก่อน ${before} หลัง ${after4.length} · ส่งซ้ำคีย์เดิม ${code(m4b)} items ${after4b.length}`);
  await setUnit("rooms.hotel.folio.manualItemMaxSatang", 10_000);
  const before5 = (await itemsOf(RV_STAY)).length;
  const K_CAP = key("mb");
  const m5 = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "soda", qty: 1 }, { key: "wine", qty: 1 }], idempotencyKey: K_CAP }));
  const after5 = await itemsOf(RV_STAY);
  const m5b = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "soda", qty: 1 }, { key: "wine", qty: 1 }], idempotencyKey: K_CAP }));
  const after5b = await itemsOf(RV_STAY);
  const m5c = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "water", qty: 1 }, { key: "soda", qty: 3 }], idempotencyKey: key("mb") }));
  const after5c = await itemsOf(RV_STAY);
  chk("B-5", "เพดาน folio.manualItemMaxSatang ฿100: soda(฿50)+wine(฿6,000) ⇒ INVALID_INPUT ทั้งชุด · ส่งซ้ำผลเดิม · water+soda×3 (qty×ราคา ฿150 > เพดาน) ⇒ INVALID_INPUT · FolioItem ไม่เพิ่มเลย (มติ §10.2)",
    m5?.ok === false && m5.code === "INVALID_INPUT" && m5b?.ok === false && m5b.code === "INVALID_INPUT" && m5c?.ok === false && m5c.code === "INVALID_INPUT" && after5.length === before5 && after5b.length === before5 && after5c.length === before5,
    `${code(m5)} · ส่งซ้ำ ${code(m5b)} · qty×ราคา ${code(m5c)} · items ก่อน ${before5} หลัง ${after5.length}/${after5b.length}/${after5c.length}`);
  await setUnit("rooms.hotel.folio.manualItemMaxSatang", 5_000_000);
  // hkFinish ที่มีมินิบาร์ล้ม ⇒ ห้องยัง DIRTY? (ห้อง MB ไม่มีแขก ⇒ unbilled เท่านั้น — ใช้ STAY)
  await setUnit("rooms.hotel.folio.manualItemMaxSatang", 10_000);
  const K_FIN = key("finish");
  const stayBefore = await hkOf(ROOM.STAY);
  const before6 = (await itemsOf(RV_STAY)).length;
  const f1 = await call(() => hk.hkFinish(MAID, ctxA, { roomId: ROOM.STAY, checklist: [{ key: "เตียง", done: true }], minibar: [{ key: "soda", qty: 1 }, { key: "wine", qty: 1 }], idempotencyKey: K_FIN }));
  const stayAfter = await hkOf(ROOM.STAY);
  const after6 = (await itemsOf(RV_STAY)).length;
  await setUnit("rooms.hotel.folio.manualItemMaxSatang", 5_000_000);
  chk("B-6", "hkFinish ที่มินิบาร์ล้ม (soda+wine เกินเพดาน) ⇒ INVALID_INPUT · ห้องยัง DIRTY (ไม่ CLEAN ลอย) · FolioItem ไม่เพิ่มเลย",
    f1?.ok === false && f1.code === "INVALID_INPUT" && stayBefore === "DIRTY" && stayAfter === "DIRTY" && after6 === before6,
    `${code(f1)} · ${stayBefore}→${stayAfter} · items ก่อน ${before6} หลัง ${after6}`);
  // ของฟรี (ราคา 0 ตามค่าตั้ง) ⇒ ok · ไม่ลง folio · อยู่ใน items ของสรุป (มติ §10.2)
  const before7 = await itemsOf(RV_STAY);
  const m7 = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "soda", qty: 1 }, { key: "water", qty: 2 }], idempotencyKey: key("mb") }));
  const after7 = await itemsOf(RV_STAY);
  const new7 = after7.filter((i) => !before7.some((b) => b.id === i.id));
  const m7w = await call(() => hk.postMinibar(MAID, ctxA, { roomId: ROOM.STAY, items: [{ key: "water", qty: 1 }], idempotencyKey: key("mb") }));
  const after7w = await itemsOf(RV_STAY);
  const water7 = (m7?.items ?? []).find((i: Any) => i.key === "water");
  const water7w = (m7w?.items ?? []).find((i: Any) => i.key === "water");
  chk("B-7", "ของฟรี: soda+water×2 ⇒ ok posted 1 (soda) · amount 5000 · items มี water priceSatang 0 qty 2 · FolioItem เพิ่ม 1 (ไม่มีน้ำเปล่า) · water ล้วน ⇒ ok posted 0 · items [water] · FolioItem ไม่เพิ่ม",
    m7?.ok === true && m7.posted === 1 && m7.amountSatang === 5000 && water7?.priceSatang === 0 && water7?.qty === 2 && new7.length === 1 && /โซดา/.test(new7[0]?.description ?? "") && !after7.some((i) => /น้ำเปล่า/.test(i.description ?? "")) &&
      m7w?.ok === true && m7w.posted === 0 && (m7w.items ?? []).length === 1 && water7w?.priceSatang === 0 && after7w.length === after7.length,
    `${code(m7)} ${J({ posted: m7?.posted, amt: m7?.amountSatang, items: m7?.items })} new=${new7.length} · water ล้วน ${code(m7w)} ${J({ posted: m7w?.posted, items: m7w?.items })} items ${after7.length}→${after7w.length}`);

  // ═══ C INSPECTED บนห้องมีแขก · state ═══
  console.log("\n── C state machine บนห้องมีแขก ──");
  const s1 = await call(() => hk.hkSetStatus(MAID, ctxA, { roomId: ROOM.STAY, to: "CLEAN", idempotencyKey: key("set") }));
  const s2 = await call(() => hk.hkSetStatus(LEAD, ctxA, { roomId: ROOM.STAY, to: "INSPECTED", idempotencyKey: key("set") }));
  chk("C-1", "ห้องมีแขก CHECKED_IN: maid CLEAN ⇒ ok · lead INSPECTED ⇒ ok (มติ §10.4 รับได้ — ตรวจหลังทำห้องระหว่างพัก)", s1?.ok === true && s2?.ok === true && (await hkOf(ROOM.STAY)) === "INSPECTED", `${code(s1)} · ${code(s2)}`);
  const s3 = await call(() => hk.hkSetStatus(LEAD, ctxA, { roomId: ROOM.STAY, to: "CLEAN", idempotencyKey: key("set") }));
  chk("C-2", "INSPECTED→CLEAN ไม่ได้ (INVALID_TRANSITION)", s3?.ok === false && s3.code === "INVALID_TRANSITION", code(s3));

  // ═══ D syncBlockedRooms (หนี้ H.2) ═══
  console.log("\n── D syncBlockedRooms · night audit ──");
  const b1 = await call(() => blk.blockRoom(OWNER, ctxA, { unitId: UH, roomId: ROOM.BLK1, from: W(1), to: W(3), reason: "ทาสี" }));
  // ORACLE-EDIT: เดิม BLK2 ตั้ง BLOCK ซ้อน 2 ช่วง — H.2 ปฏิเสธ ROOM_TAKEN (ถูกต้อง) ⇒ BLOCK เดียว [+1,+4) ต่อห้อง
  const b2 = await call(() => blk.blockRoom(OWNER, ctxA, { unitId: UH, roomId: ROOM.BLK2, from: W(1), to: W(4), reason: "ซ่อม" }));
  const b2x = await call(() => blk.blockRoom(OWNER, ctxA, { unitId: UH, roomId: ROOM.BLK2, from: W(1), to: W(2), reason: "ซ้อน" }));
  chk("D-0", "ตั้ง BLOCK อนาคต: BLK1 [+1,+3) · BLK2 [+1,+4) ⇒ ok · BLOCK ซ้อนบน BLK2 ⇒ ROOM_TAKEN · ยัง CLEAN วันนี้", b1?.ok === true && b2?.ok === true && b2x?.ok === false && b2x.code === "ROOM_TAKEN" && (await hkOf(ROOM.BLK1)) === "CLEAN" && (await hkOf(ROOM.BLK2)) === "CLEAN", `${code(b1)} ${code(b2)} ซ้อน=${code(b2x)}`);
  const y0 = await call(() => hk.syncBlockedRooms(ctxA, { unitId: UH, businessDate: W(0) }));
  const y1 = await call(() => hk.syncBlockedRooms(ctxA, { unitId: UH, businessDate: W(1) }));
  const st1 = [await hkOf(ROOM.BLK1), await hkOf(ROOM.BLK2), await hkOf(ROOM.OOOM)];
  const y1b = await call(() => hk.syncBlockedRooms(ctxA, { unitId: UH, businessDate: W(1) }));
  chk("D-1", "sync วันนี้ ⇒ 0 · sync +1 ⇒ toOoo 2 (BLK1,BLK2 ⇒ OUT_OF_ORDER) · OOOM (ปิดมือ ไม่มี BLOCK) ไม่แตะ · ซ้ำ ⇒ 0",
    y0?.ok === true && y0.toOoo === 0 && y0.toDirty === 0 && y1?.ok === true && y1.toOoo === 2 && st1[0] === "OUT_OF_ORDER" && st1[1] === "OUT_OF_ORDER" && st1[2] === "OUT_OF_ORDER" && y1b?.ok === true && y1b.toOoo === 0 && y1b.toDirty === 0,
    `${J(y0)} ${J(y1)} ${J(st1)} ${J(y1b)}`);
  const lg1 = (await logsOf(ROOM.BLK1)).filter((l) => l.toStatus === "OUT_OF_ORDER");
  chk("D-2", "log night audit: BLK1 CLEAN→OUT_OF_ORDER byUserId null · note night audit", lg1.length === 1 && lg1[0].byUserId === null && /night audit/.test(lg1[0].note ?? "") && lg1[0].fromStatus === "CLEAN", J(lg1.map((l) => ({ f: l.fromStatus, t: l.toStatus, by: l.byUserId, n: (l.note ?? "").slice(0, 60) }))));
  const y2 = await call(() => hk.syncBlockedRooms(ctxA, { unitId: UH, businessDate: W(2) }));
  const st2 = [await hkOf(ROOM.BLK1), await hkOf(ROOM.BLK2)];
  const y3 = await call(() => hk.syncBlockedRooms(ctxA, { unitId: UH, businessDate: W(3) }));
  const st3 = [await hkOf(ROOM.BLK1), await hkOf(ROOM.BLK2), await hkOf(ROOM.OOOM)];
  const y4 = await call(() => hk.syncBlockedRooms(ctxA, { unitId: UH, businessDate: W(4) }));
  const st4 = [await hkOf(ROOM.BLK1), await hkOf(ROOM.BLK2)];
  chk("D-3", "sync +2 ⇒ BLK1/BLK2 ยัง OOO · sync +3 ⇒ BLK1 DIRTY (หมดช่วง) BLK2 ยัง OOO · OOOM ไม่แตะ · sync +4 ⇒ BLK2 DIRTY",
    y2?.ok === true && y2.toDirty === 0 && st2[0] === "OUT_OF_ORDER" && st2[1] === "OUT_OF_ORDER" && y3?.ok === true && y3.toDirty === 1 && st3[0] === "DIRTY" && st3[1] === "OUT_OF_ORDER" && st3[2] === "OUT_OF_ORDER" && y4?.ok === true && y4.toDirty === 1 && st4[1] === "DIRTY",
    `${J(y2)} ${J(st2)} · ${J(y3)} ${J(st3)} · ${J(y4)} ${J(st4)}`);
  const ms = await call(() => hk.markStayoversDirty(ctxA, { unitId: UH, businessDate: W(0) }));
  const stayNow = await hkOf(ROOM.STAY);
  chk("D-4", "markStayoversDirty วันนี้: STAY (CHECKED_IN −1..+2 · CLEAN/INSPECTED) ⇒ DIRTY changed 1 · reservationId ใน log", ms?.ok === true && ms.changed === 1 && stayNow === "DIRTY" && (await logsOf(ROOM.STAY)).some((l) => l.toStatus === "DIRTY" && l.byUserId === null && l.reservationId === RV_STAY), `${J(ms)} ${stayNow}`);

  // ═══ E ความพร้อมกันคนละห้อง (pool starvation) — ทำท้ายสุด ═══
  console.log("\n── E 12 ห้องพร้อมกัน (คนละห้อง · pool pg 10) ──");
  {
    const t0 = Date.now();
    const timer = new Promise<"TIMEOUT">((res) => setTimeout(() => res("TIMEOUT"), 150_000));
    const all = Promise.all(CC.map((id) => call(() => hk.hkSetStatus(MAID, ctxA, { roomId: id, to: "CLEAN", idempotencyKey: key("cc") }))));
    const out = await Promise.race([all, timer]);
    const ms2 = Date.now() - t0;
    if (out === "TIMEOUT") {
      chk("E-1", "12 ห้องพร้อมกัน: จบใน 150 วิ", false, `ค้างเกิน 150 วิ (pool starvation?)`);
    } else {
      const res = out as Any[];
      const okN = res.filter((r) => r?.ok === true).length;
      const codes = res.filter((r) => r?.ok !== true).map(code);
      const rows = await prisma.hotelRoom.findMany({ where: { id: { in: CC } }, select: { id: true, hkStatus: true } }) as Any[];
      const cleanN = rows.filter((r) => r.hkStatus === "CLEAN").length;
      const logN = await prisma.hotelHousekeepingLog.count({ where: { roomId: { in: CC }, toStatus: "CLEAN" } });
      const ccSet = new Set(CC);
      const evN = (await events("hotel.hk.changed")).filter((e) => ccSet.has(e.payload?.roomId) && e.payload?.to === "CLEAN").length;
      chk("E-1", `12 ห้องพร้อมกัน: ทุกห้อง ok · CLEAN 12 · log 12 · event hotel.hk.changed 12 · ไม่ throw · < 10 วิ (มติ §10.1) · เวลา ${ms2} ms`, okN === 12 && cleanN === 12 && logN === 12 && evN === 12 && ms2 < 10_000, `ok=${okN} clean=${cleanN} log=${logN} ev=${evN} ${ms2}ms ${codes.slice(0, 3).join(" | ")}`);
      // สถานะเปลี่ยนโดยไม่มี log = อันตราย
      chk("E-2", "ไม่มีห้องที่ CLEAN โดยไม่มี log/event (commit ล้มหลัง setHkStatus)", cleanN === logN && cleanN === evN, `clean=${cleanN} log=${logN} ev=${evN}`);
    }
  }
} catch (e) {
  console.log(`\n🔴 probe throw: ${errMsg(e)}`);
  checks.push({ id: "PROBE", ok: false, note: errMsg(e) });
} finally {
  try { await cleanup(); console.log("\n(ล้างร้าน h6rv-* แล้ว)"); } catch (e) { console.log(`\n⚠️ cleanup: ${errMsg(e)}`); }
  const fails = checks.filter((c) => !c.ok);
  console.log(`\nJSON_SUMMARY ${J({ suite: LABEL, total: checks.length, passed: checks.length - fails.length, failed: fails.map((f) => f.id), skipped: [] })}`);
  await prisma.$disconnect().catch(() => {});
  process.exit(fails.length ? 1 : 0);
}
