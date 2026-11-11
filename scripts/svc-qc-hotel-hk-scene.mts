// svc-qc-hotel-hk-scene.mts — SVC H.6 · ฉากแม่บ้านมือถือ (ภาพ 13 ก/ข) บนร้าน svcqc หน่วยโรงแรม (ใบสั่ง h.6 §6 · ฟิกซ์เจอร์ SQC_HOTEL_HK_SCENE)
//
// ใช้ (ต่อยอดฉาก h.2 — ห้องชุดเดียวกับภาพ 08 ⇒ ฉาก h.3 ต้อง --clear ก่อน):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-booking-scene.mts --clear
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-tape-scene.mts
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-hk-scene.mts            # สร้างฉาก (idempotent)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-hk-scene.mts --clear    # ล้างเฉพาะของฉาก
//
// ฉาก (เขียนผ่าน API ของ H.6/H.5 เท่านั้น — ไม่เขียนคอลัมน์ห้องตรง):
//   • ค่าตั้งชั้นหน่วย (inspectionRequired · dailyHousekeeping · hk.canBlock) + เช็กลิสต์ดีลักซ์ (ชั้นประเภทห้อง) + มินิบาร์ (ชั้นหน่วย) — setSettings
//   • เช็กเอาต์ B203-out ด้วย H.5 (prepareCheckout → settleAndCheckOut เงินสด) ⇒ B203 "ออกแล้ว"
//   • สถานะห้องตามฟิกซ์เจอร์ผ่าน hkSetStatus/hkInspect (B103 = ปิดห้องของฉาก h.2 · ไม่ถึงวัน OOO ⇒ syncBlockedRooms) ·
//     ห้องอื่นของหน่วยที่ค้าง DIRTY/INSPECTED ⇒ CLEAN (ให้ตัวเลขงานวันนี้ตรงภาพ)
//   • "ของฉัน" = แม่บ้าน maid กดเริ่มทำ (hkStart · B203 ย้อน 18 นาทีด้วย `at` ใต้ SVC_QC_CLOCK=1) · คำขอแขกผ่าน setGuestRequest
//   • มินิบาร์ที่โพสต์แล้วบน B105 (postMinibar ของ H.6 → postFolioItem MINIBAR ของ H.5)
//   • idempotent: ของที่ตรงแล้ว = ข้าม ⇒ รันซ้ำ SCENE_SUMMARY {"created":0,"updated":0,"removed":0}
//   • --clear: เลิกทำ/ล้างคำขอแขกของห้องฉาก · void มินิบาร์ของฉาก · คืนค่าตั้ง · ห้องฉาก (ไม่ใช่ปิดซ่อม) กลับ CLEAN · การเช็กเอาต์ไม่ย้อน (เงินจริงของ POS — ฉาก h.2 --clear ลบแถวการจองเอง)
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created","updated","removed"(,"roomId" ของ B203 + "rooms" {เลขห้อง: id} เมื่อมีการเปลี่ยน)}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_HOTEL_HK_SCENE as FX, SQC_HOTEL_TAPE_SCENE as TS, SQC_HOTEL_TYPES, SQC_TODAY_BKK } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-hotel-hk-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากแม่บ้านบนร้าน svcqc · --clear ล้างเฉพาะของฉาก`);
  process.exit(0);
}
const unknownArgs = argv.filter((a) => a !== "--clear");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);
process.env.SVC_QC_CLOCK = "1"; // นาฬิกาฉาก (มติ h.6 ข้อ 10) — hkStart รับ `at` เฉพาะเมื่อมีค่านี้

const { prisma } = await import("@/lib/core/db");
const hotel = await import("@/lib/modules/hotel");
const settings = await import("@/lib/core/settings");

const tenantId = SQC.tenant.id;
const unitId = SQC.units[FX.unit].id;
const actorOf = (key: string) => {
  const u = SQC.users.find((x) => x.key === key);
  if (!u) throw new Error(`ไม่มีผู้ใช้ ${key} ในฟิกซ์เจอร์`);
  return { role: u.role, unitAccess: u.unitAccess, permissions: u.permissions, userId: u.userId };
};
const OWNER = actorOf("owner");
const MAID = actorOf(FX.maidKey);
const LEAD = actorOf(FX.leadKey);
const ctx = { tenantId };
const sum = { created: 0, updated: 0, removed: 0 };
type R = { ok: boolean; code?: string; reason?: string };
const must = <T extends R>(r: T, what: string): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(`${what}: ${r.code ?? ""} ${r.reason ?? ""}`.trim());
  return r as Extract<T, { ok: true }>;
};
let seq = 0;
const key = (what: string) => `scene-h6-${what}-${Date.now().toString(36)}-${++seq}`;
const SCENE_REF = "HotelHousekeeping";
const MINIBAR_KEYS = ["rooms.hotel.minibar"] as const;

const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "HOTEL" }, select: { id: true } });
if (!unit) {
  console.error(`🔴 ${LABEL}: ไม่พบหน่วยโรงแรม svcqc (${unitId}) — รัน scripts/seed-svc-qc.mts ก่อน`);
  process.exit(3);
}
const roomRows = () => prisma.hotelRoom.findMany({ where: { tenantId, unitId, active: true }, select: { id: true, number: true, hkStatus: true, hkNote: true, rentMode: true, roomTypeId: true } });
const idOf = async (num: string): Promise<string> => {
  const r = (await roomRows()).find((x) => x.number === num);
  if (!r) throw new Error(`ไม่พบห้อง ${num} ในหน่วยโรงแรม svcqc`);
  return r.id;
};
const roomOf = async (id: string) => (await roomRows()).find((x) => x.id === id)!;
const SCENE_ROOMS = FX.rooms.map((r) => r.room);

/** ค่าตั้งของฉาก: [คีย์, ชั้น, scopeId, ค่า] */
const sceneSettings = (): [string, "UNIT" | "ROOM_TYPE", string, unknown][] => [
  ...Object.entries(FX.settings).map(([k, v]) => [k, "UNIT", unitId, v] as [string, "UNIT", string, unknown]),
  ["rooms.hotel.housekeepingChecklist", "ROOM_TYPE", SQC_HOTEL_TYPES.deluxe.id, [...FX.checklistDeluxe]],
  [MINIBAR_KEYS[0], "UNIT", unitId, FX.minibar.items.map((i) => ({ ...i }))],
];
const valueAt = async (k: string, scope: "UNIT" | "ROOM_TYPE", scopeId: string): Promise<unknown> => {
  const row = await prisma.settingValue.findFirst({ where: { tenantId, key: k, scope, scopeId }, orderBy: { effectiveFrom: "desc" }, select: { value: true } });
  return row ? row.value : undefined;
};

/** พาห้องไปสถานะเป้าหมายด้วย API ของ H.6 (คืน true เมื่อมีการเปลี่ยน) */
async function ensureStatus(roomId: string, target: string): Promise<boolean> {
  const cur = (await roomOf(roomId)).hkStatus;
  if (cur === target) return false;
  if (cur === "OUT_OF_ORDER" || target === "OUT_OF_ORDER") throw new Error(`ห้อง ${roomId}: ${cur} → ${target} ต้องผ่านปิด/ปล่อยห้อง (h.2)`);
  const set = async (to: string) => must(await hotel.hkSetStatus(OWNER, ctx, { roomId, to, idempotencyKey: key("set") }), `ห้อง → ${to}`);
  if (cur === "INSPECTED") await set("DIRTY");
  const now = (await roomOf(roomId)).hkStatus;
  if (target === "DIRTY") {
    if (now !== "DIRTY") await set("DIRTY");
    return true;
  }
  if (now === "DIRTY") await set("CLEAN");
  if (target === "INSPECTED") must(await hotel.hkInspect(LEAD, ctx, { roomId, pass: true }), "ตรวจห้อง");
  return true;
}

try {
  const rooms = Object.fromEntries((await roomRows()).map((r) => [r.number, r.id]));
  if (clear) {
    // 1) เลิกทำ + ล้างคำขอแขกของห้องฉาก
    for (const num of SCENE_ROOMS) {
      const id = rooms[num];
      if (!id) continue;
      const note = hotel.parseHkNote((await roomOf(id)).hkNote);
      if (note.assignedTo) {
        must(await hotel.hkRelease(LEAD, ctx, { roomId: id }), `เลิกทำ ${num}`);
        sum.removed++;
      }
      if (note.guestRequest) {
        must(await hotel.setGuestRequest(OWNER, ctx, { roomId: id, text: null }), `ล้างคำขอ ${num}`);
        sum.removed++;
      }
    }
    // 2) void มินิบาร์ของฉาก (แถวที่ H.6 โพสต์ · ยังไม่ void)
    const items = await prisma.hotelFolioItem.findMany({ where: { tenantId, unitId, type: "MINIBAR", refType: SCENE_REF, voidedAt: null }, select: { id: true } });
    for (const it of items) {
      must(await hotel.voidFolioItem(OWNER, ctx, { itemId: it.id, reason: "SvcQcScene:clear h6" }), "void มินิบาร์");
      sum.removed++;
    }
    // 3) คืนค่าตั้ง
    for (const [k, scope, scopeId] of sceneSettings()) {
      if ((await valueAt(k, scope, scopeId)) === undefined) continue;
      await settings.resetSetting(OWNER, ctx, { key: k, scope, scopeId });
      sum.removed++;
    }
    // 4) ห้องฉาก (ไม่ใช่ปิดซ่อม) กลับ CLEAN
    for (const num of SCENE_ROOMS) {
      const id = rooms[num];
      if (!id || (await roomOf(id)).hkStatus === "OUT_OF_ORDER") continue;
      if (await ensureStatus(id, "CLEAN")) sum.removed++;
    }
  } else {
    // 1) ค่าตั้ง
    for (const [k, scope, scopeId, v] of sceneSettings()) {
      const refs = scope === "UNIT" ? { unitId } : { unitId, roomTypeId: scopeId };
      const stored = await valueAt(k, scope, scopeId);
      const eff = (await settings.resolveSetting(ctx, k, refs))?.value;
      // ค่าที่มีผลตรงแล้ว (รวมค่าเริ่มที่ตรงฟิกซ์เจอร์ — setSettings ไม่เก็บแถวซ้ำค่าเริ่ม) ⇒ ข้าม
      if (JSON.stringify(stored === undefined ? eff : stored) === JSON.stringify(v)) continue;
      must(await settings.setSettings(OWNER, ctx, [{ key: k, scope, scopeId, value: v }]), `ตั้ง ${k}`);
      console.log(`  • ค่าตั้ง ${k} (${scope})`);
      sum.updated++;
    }
    // 2) เช็กเอาต์ B203-out (H.5) — ทำครั้งเดียว
    for (const k of FX.checkoutKeys) {
      const rv = await prisma.hotelReservation.findFirst({ where: { tenantId, unitId, note: `${TS.mark} #${k}#` }, select: { id: true, status: true } });
      if (!rv) throw new Error(`ไม่พบการจอง ${k} ของฉาก h.2 — รันฉาก h.2 ก่อน`);
      if (rv.status !== "CHECKED_IN") continue;
      const p = await hotel.prepareCheckout(OWNER, ctx, { reservationId: rv.id });
      if (!p.ok) throw new Error(`เตรียมเช็กเอาต์ ${k}: ${p.code} ${p.reason}`);
      must(
        await hotel.settleAndCheckOut(OWNER, ctx, {
          reservationId: rv.id,
          shiftId: p.openShifts[0]?.id ?? null,
          securityDeposit: "REFUND",
          payMethods: p.payableSatang > 0 ? [{ type: "CASH", amountSatang: p.payableSatang }] : [],
        }),
        `เช็กเอาต์ ${k}`,
      );
      sum.updated++;
    }
    // 3) ปิดห้องที่ถึงวัน ⇒ OUT_OF_ORDER (ปิดห้องของฉาก h.2 สร้างก่อนวันนี้) · สถานะห้องตามฟิกซ์เจอร์
    const sync = must(await hotel.syncBlockedRooms(ctx, { unitId, businessDate: SQC_TODAY_BKK }), "ซิงก์ปิดห้อง");
    if (sync.toOoo) console.log(`  • ปิดห้องที่ถึงวัน ⇒ OUT_OF_ORDER ${sync.toOoo} ห้อง`);
    sum.updated += sync.toOoo;
    for (const r of FX.rooms) {
      const id = rooms[r.room];
      if (!id) throw new Error(`ไม่พบห้อง ${r.room}`);
      if (r.hkStatus === "OUT_OF_ORDER") {
        if ((await roomOf(id)).hkStatus !== "OUT_OF_ORDER") throw new Error(`ห้อง ${r.room} ต้องปิดซ่อม (ปิดห้องของฉาก h.2) — รันฉาก h.2 ก่อน`);
        continue;
      }
      if (await ensureStatus(id, r.hkStatus)) {
        console.log(`  • ${r.room} → ${r.hkStatus}`);
        sum.updated++;
      }
    }
    // 4) ห้องอื่นของหน่วย (ไม่ใช่ฉาก · ไม่ใช่รายเดือน · ไม่ปิดซ่อม) ที่ค้าง DIRTY/INSPECTED/มีคนทำ ⇒ CLEAN ว่าง
    for (const r of await roomRows()) {
      if (SCENE_ROOMS.includes(r.number) || r.rentMode === "MONTHLY" || r.hkStatus === "OUT_OF_ORDER") continue;
      const note = hotel.parseHkNote(r.hkNote);
      if (note.assignedTo) {
        must(await hotel.hkRelease(LEAD, ctx, { roomId: r.id }), `เลิกทำ ${r.number}`);
        console.log(`  • ${r.number} เลิกทำ (ห้องนอกฉาก)`);
        sum.updated++;
      }
      if (await ensureStatus(r.id, "CLEAN")) {
        console.log(`  • ${r.number} → CLEAN (ห้องนอกฉาก)`);
        sum.updated++;
      }
    }
    // 5) คำขอแขก (setGuestRequest) — ห้องฉากที่ไม่มีคำขอในฟิกซ์เจอร์ = ล้าง
    for (const r of FX.rooms) {
      const id = rooms[r.room]!;
      const want = r.guestRequest ?? null;
      const cur = hotel.parseHkNote((await roomOf(id)).hkNote).guestRequest ?? null;
      if (cur === want) continue;
      must(await hotel.setGuestRequest(OWNER, ctx, { roomId: id, text: want }), `คำขอแขก ${r.room}`);
      console.log(`  • ${r.room} คำขอแขก`);
      sum.updated++;
    }
    // 6) ของฉัน = maid กดเริ่มทำ (B203 ย้อน N นาที)
    for (const r of FX.rooms) {
      if (!r.mine) continue;
      const id = rooms[r.room]!;
      const note = hotel.parseHkNote((await roomOf(id)).hkNote);
      if (note.assignedTo === MAID.userId) continue;
      if (note.assignedTo) must(await hotel.hkRelease(LEAD, ctx, { roomId: id }), `โอนงาน ${r.room}`);
      const at = typeof r.startedMinutesAgo === "number" ? { at: new Date(Date.now() - r.startedMinutesAgo * 60_000).toISOString() } : {};
      must(await hotel.hkStart(MAID, ctx, { roomId: id, ...at }), `เริ่มทำ ${r.room}`);
      sum.created++;
    }
    // 7) มินิบาร์ที่โพสต์แล้ว (B105 แขกพักอยู่)
    const mbRoom = rooms[FX.minibar.posted.room]!;
    const have = await prisma.hotelFolioItem.count({ where: { tenantId, unitId, type: "MINIBAR", refType: SCENE_REF, voidedAt: null, refId: { startsWith: `svc-h6-minibar-${mbRoom}-` } } });
    if (have === 0) {
      const r = must(await hotel.postMinibar(MAID, ctx, { roomId: mbRoom, items: FX.minibar.posted.lines.map((l) => ({ key: l.key, qty: l.qty })) }), "มินิบาร์ B105");
      if (r.posted === 0) throw new Error(`มินิบาร์ ${FX.minibar.posted.room}: ไม่มีแขกพักอยู่ (folio ไม่เปิด) — รันฉาก h.2 ก่อน`);
      sum.created += r.posted;
    }
  }
  const after = await roomRows();
  const roomIds = Object.fromEntries(after.filter((r) => SCENE_ROOMS.includes(r.number)).map((r) => [r.number, r.id]));
  // รันซ้ำไม่มีอะไรเปลี่ยน ⇒ 3 ตัวเลขล้วน (ข้อสอบ Q-2) · มีการเปลี่ยน ⇒ + roomId ของห้องที่กำลังทำ (ภาพ 13 ข) และ id ห้องฉาก
  const changed = sum.created + sum.updated + sum.removed > 0;
  console.log(`SCENE_SUMMARY ${JSON.stringify(changed ? { ...sum, roomId: roomIds[FX.expect.startedRoom] ?? null, rooms: roomIds } : sum)}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
