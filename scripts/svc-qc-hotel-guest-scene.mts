// svc-qc-hotel-guest-scene.mts — SVC H.4 · ฉากเช็กอิน V2 / ทะเบียนผู้พัก (ร.ร.3) / ตม.30 บนร้าน svcqc หน่วยโรงแรม (ใบสั่ง h.4 §6)
//
// ใช้ (ต่อยอดฉาก h.3 — seed ร้าน svcqc + ฉาก h.1 + ฉาก h.3 ก่อน):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-booking-scene.mts
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-guest-scene.mts            # สร้างฉาก (idempotent)
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-hotel-guest-scene.mts --clear    # ลบเฉพาะแขกของฉาก
//
// ฉาก = SQC_HOTEL_GUEST_SCENE เท่านั้น (ไม่มีชื่อ/เลขในสคริปต์) · เขียนผ่าน API ของ H.4 (+ takeSecurityDeposit ของ H.5) เท่านั้น:
//   • ค่าตั้งฉาก (GS.settings) ตั้งที่ชั้น UNIT ด้วยเครื่องยนต์ค่าตั้ง (ผู้กระทำ = เจ้าของ svcqc)
//   • inhouse-web / inhouse-ota (CHECKED_IN จากฉาก h.3) ⇒ upsertGuestRecord ทีละคน (นาฬิกาฉาก at = วันเข้า 07:00Z ⇒ ตม.30 ครบกำหนดตามวันเข้าจริง)
//     → ผู้พักหลักที่ signed ⇒ signRr3 (PNG เล็กที่ฉากสร้างเอง) ก่อนเพิ่มผู้พักร่วม (ผู้พักร่วมของฟิกซ์เจอร์ signed:false)
//     → inhouse-web ⇒ markTm30Filed ทุกคนต่างด้าว ด้วยเลขรับแจ้งของฟิกซ์เจอร์ · inhouse-ota ⇒ ยังไม่แจ้ง (PENDING · เลยกำหนด ⇒ LATE หลัง tm30Sweep)
//   • today-walkin (CONFIRMED) ⇒ checkInV2 (ห้องที่ระบบถือ ถ้าพร้อม · ไม่งั้นห้องพร้อมห้องแรก · ไม่ force) + ผู้พักหลัก → signRr3 → takeSecurityDeposit (H.5)
// idempotent: ผู้พักที่มีแถวแล้ว (ชื่อเดียวกันในการจองเดียวกัน) = ข้าม · ลงชื่อ/แจ้งแล้ว = ข้าม ⇒ รันซ้ำ SCENE_SUMMARY {"created":0,"updated":0,"removed":0}
// --clear: แขกของฉาก (ชื่อตามฟิกซ์เจอร์บนการจองของฉาก h.3) ⇒ ลบไฟล์ (deleteFileAsset) + แถว · today-walkin กลับ CONFIRMED (undoCheckIn) · ค่าตั้งฉากคืน
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv) · ไม่มีเลขดิบใน log
// บรรทัดท้าย: SCENE_SUMMARY {"created","updated","removed"(,"reservations","guests" เมื่อมีการเปลี่ยน)}
import { deflateSync } from "node:zlib";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_HOTEL_BOOKING_SCENE as BS, SQC_HOTEL_GUEST_SCENE as GS } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-hotel-guest-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากทะเบียนผู้พัก/ตม.30 บนร้าน svcqc · --clear ลบเฉพาะแขกของฉาก`);
  process.exit(0);
}
const unknownArgs = argv.filter((a) => a !== "--clear");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);
process.env.SVC_QC_CLOCK = "1"; // นาฬิกาฉาก — upsertGuestRecord รับ `at` เฉพาะเมื่อมีค่านี้

const { prisma } = await import("@/lib/core/db");
const hotel = await import("@/lib/modules/hotel");
const settings = await import("@/lib/core/settings");
const storage = await import("@/lib/storage/service");

const tenantId = SQC.tenant.id;
const unitId = SQC.units[GS.unit].id;
const ownerU = SQC.users.find((u) => u.key === "owner")!;
const OWNER = { role: ownerU.role, unitAccess: ownerU.unitAccess, permissions: ownerU.permissions, userId: ownerU.userId };
const ctx = { tenantId };
const sum = { created: 0, updated: 0, removed: 0 };
type R = { ok: boolean; code?: string; reason?: string };
const must = <T extends R>(r: T, what: string): T => {
  if (!r.ok) throw new Error(`${what}: ${r.code ?? ""} ${r.reason ?? ""}`.trim());
  return r;
};
const noteOf = (key: string) => `${BS.mark} #${key}#`;
const sceneBooking = (key: string) => BS.bookings.find((b) => b.key === key);
const ymdOfDb = (d: Date) => d.toISOString().slice(0, 10);

/** PNG 1×1 ที่รูปแบบถูก (ลายเซ็นของฉาก) */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const makePng = (seed: number): Uint8Array => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from([0, seed & 255, (seed * 7) & 255, (seed * 13) & 255]))), chunk("IEND", Buffer.alloc(0))]));
};

const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "HOTEL" }, select: { id: true } });
if (!unit) {
  console.error(`🔴 ${LABEL}: ไม่พบหน่วยโรงแรม svcqc (${unitId}) — รัน scripts/seed-svc-qc.mts ก่อน`);
  process.exit(3);
}
const rvOf = (key: string) => prisma.hotelReservation.findFirst({ where: { tenantId, unitId, note: noteOf(key) }, orderBy: { createdAt: "asc" } });
const NAMES = GS.guests.map((g) => g.fullName);

try {
  if (clear) {
    const keys = [...new Set(GS.guests.map((g) => g.reservationKey))];
    for (const key of keys) {
      const rv = await rvOf(key);
      if (!rv) continue;
      const rows = await prisma.hotelGuestRecord.findMany({ where: { tenantId, unitId, reservationId: rv.id, fullName: { in: NAMES } }, select: { id: true, idImageFileId: true, signatureFileId: true } });
      for (const r of rows) for (const f of [r.idImageFileId, r.signatureFileId]) if (f) await storage.deleteFileAsset({ tenantId }, f);
      // หลักฐานแจ้ง ตม. ของฉาก (อ้างใน AuditLog)
      const del = await prisma.hotelGuestRecord.deleteMany({ where: { tenantId, unitId, id: { in: rows.map((r) => r.id) } } });
      sum.removed += del.count;
      if (key === GS.checkInV2.reservationKey && rv.status === "CHECKED_IN") {
        const u = await hotel.undoCheckIn(OWNER, ctx, { reservationId: rv.id, reason: "SvcQcScene:clear" });
        if (!u.ok) {
          // คนละวันกับที่เช็กอิน ⇒ คืนสถานะตรง (ล้างฉากเท่านั้น)
          await prisma.hotelReservation.updateMany({ where: { id: rv.id, tenantId, unitId, status: "CHECKED_IN" }, data: { status: "CONFIRMED", checkedInAt: null } });
          if (rv.roomId) await prisma.hotelRoom.updateMany({ where: { id: rv.roomId, tenantId, unitId, status: "OCCUPIED" }, data: { status: "AVAILABLE" } });
        }
        sum.updated++;
      }
    }
    for (const key of Object.keys(GS.settings)) {
      try {
        await settings.resetSetting(OWNER, ctx, { key, scope: "UNIT", scopeId: unitId });
      } catch {
        /* ไม่มีค่าที่ชั้นนี้ */
      }
    }
  } else {
    // ค่าตั้งฉาก (ชั้น UNIT)
    const want = Object.entries(GS.settings);
    const cur = await settings.resolveSettings(ctx, want.map(([k]) => k), { unitId });
    const changes = want.filter(([k, v]) => JSON.stringify(cur[k]?.value) !== JSON.stringify(v)).map(([key, value]) => ({ key, scope: "UNIT", scopeId: unitId, value }));
    if (changes.length) {
      must(await settings.setSettings(OWNER, ctx, changes), "ตั้งค่าฉาก");
      sum.updated += changes.length;
    }
    const png = { data: makePng(4), contentType: "image/png" };
    const guestInput = (g: (typeof GS.guests)[number]) => ({
      fullName: g.fullName,
      nationality: g.nationality,
      idType: g.idType,
      idNumber: g.idNumber,
      dob: g.dob,
      ...(g.sex ? { sex: g.sex } : {}),
      ...(g.occupation ? { occupation: g.occupation } : {}),
      ...(g.arrivedFrom ? { arrivedFrom: g.arrivedFrom } : {}),
      ...(g.nextDestination ? { nextDestination: g.nextDestination } : {}),
    });
    const rowOf = (reservationId: string, fullName: string) => prisma.hotelGuestRecord.findFirst({ where: { tenantId, unitId, reservationId, fullName }, select: { id: true, rr3SignedAt: true, tm30Status: true } });

    // today-walkin: เช็กอิน V2 พร้อมผู้พักหลัก
    const wk = GS.checkInV2.reservationKey;
    const wkRv = await rvOf(wk);
    if (!wkRv) throw new Error(`ไม่มีการจอง ${wk} ของฉาก h.3 — รันฉาก h.3 ก่อน`);
    const wkGuests = GS.guests.filter((g) => g.reservationKey === wk);
    if (wkRv.status === "CONFIRMED") {
      const rooms = await hotel.assignableRooms(ctx, { reservationId: wkRv.id });
      if (!Array.isArray(rooms)) throw new Error(`ห้องของ ${wk}: ${rooms.reason}`);
      const held = rooms.find((r) => r.roomId === wkRv.roomId && r.sellable);
      const room = held ?? rooms.find((r) => r.sellable);
      if (!room) throw new Error(`ไม่มีห้องพร้อมสำหรับ ${wk}`);
      const primary = wkGuests.find((g) => g.primary)!;
      const ci = await hotel.checkInV2(OWNER, ctx, { reservationId: wkRv.id, roomId: room.roomId, guests: [guestInput(primary)] });
      if (!ci.ok) throw new Error(`เช็กอิน ${wk}: ${ci.code} ${ci.reason}`);
      sum.updated++;
      sum.created += ci.guestIds.length;
    }

    // ผู้พักของการจองที่พักอยู่: ผู้พักหลักก่อน → ลงชื่อ → ผู้พักร่วม
    for (const key of [...new Set(GS.guests.map((g) => g.reservationKey))]) {
      const rv = await rvOf(key);
      if (!rv) throw new Error(`ไม่มีการจอง ${key} ของฉาก h.3 — รันฉาก h.3 ก่อน`);
      const b = sceneBooking(key);
      const at = `${b ? ymdOfDb(rv.checkInDate) : ymdOfDb(new Date())}T07:00:00.000Z`;
      const list = GS.guests.filter((g) => g.reservationKey === key).sort((a, c) => Number(c.primary) - Number(a.primary));
      for (const g of list) {
        let row = await rowOf(rv.id, g.fullName);
        if (!row) {
          must(await hotel.upsertGuestRecord(OWNER, ctx, { reservationId: rv.id, guest: guestInput(g), at }), `ลงทะเบียน ${key}`);
          sum.created++;
          row = await rowOf(rv.id, g.fullName);
        }
        if (row && g.signed && !row.rr3SignedAt) {
          must(await hotel.signRr3(OWNER, ctx, { guestId: row.id, signaturePng: png }), `ลงชื่อ ${key}`);
          sum.updated++;
        }
      }
    }

    // ตม.30 ของ inhouse-web แจ้งแล้ว (1 เลขรับแจ้งทุกคนต่างด้าว)
    const fRv = await rvOf(GS.tm30.filed.reservationKey);
    if (fRv) {
      const open = await prisma.hotelGuestRecord.findMany({ where: { tenantId, unitId, reservationId: fRv.id, fullName: { in: NAMES }, isForeigner: true, tm30Status: { in: ["PENDING", "LATE"] } }, select: { id: true } });
      if (open.length) {
        must(await hotel.markTm30Filed(OWNER, ctx, { guestIds: open.map((x) => x.id), tm30Ref: GS.tm30.filed.ref }), "แจ้ง ตม.30");
        sum.updated += open.length;
      }
    }

    // เงินประกันห้องของ today-walkin (H.5 · ขั้นแยกหลังเช็กอิน)
    const wkNow = await rvOf(wk);
    const take = (hotel as unknown as Record<string, unknown>).takeSecurityDeposit;
    if (wkNow && wkNow.status === "CHECKED_IN" && !wkNow.securityDepositSaleId) {
      if (typeof take !== "function") throw new Error("ยังไม่มี takeSecurityDeposit (H.5) — ฉาก h.4 ต้องรันหลัง H.5 merge");
      const fn = take as (a: unknown, c: unknown, i: unknown) => Promise<R>;
      must(await fn(OWNER, ctx, { reservationId: wkNow.id, amountSatang: GS.checkInV2.securityDeposit.amountSatang, payType: GS.checkInV2.securityDeposit.payType }), "เงินประกันห้อง");
      sum.updated++;
    }
  }
  const changed = sum.created + sum.updated + sum.removed > 0;
  const reservations: Record<string, string> = {};
  const guests: Record<string, string> = {};
  for (const key of [...new Set(GS.guests.map((g) => g.reservationKey))]) {
    const rv = await rvOf(key);
    if (!rv) continue;
    reservations[key] = rv.id;
    for (const r of await prisma.hotelGuestRecord.findMany({ where: { tenantId, unitId, reservationId: rv.id, fullName: { in: NAMES } }, select: { id: true, fullName: true } })) guests[r.fullName] = r.id;
  }
  console.log(`SCENE_IDS ${JSON.stringify({ reservations, guests })}`);
  console.log(`SCENE_SUMMARY ${JSON.stringify(changed ? { ...sum, reservations, guests } : sum)}`);
} catch (e) {
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
