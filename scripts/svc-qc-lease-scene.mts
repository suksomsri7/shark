// svc-qc-lease-scene.mts — SVC D.5 · ฉากผู้เช่าและสัญญาบนร้าน svcqc (ภาพ หอ 02 · README หอ "อาคาร 36 ห้อง ณ 3 พ.ย." · ประกันถือ ฿296,400)
//
// ใช้ (ต้องมีฉากผัง R0.9 ก่อน — scripts/svc-qc-roomboard-scene.mts):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-lease-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-lease-scene.mts --clear    # ลบเฉพาะแถวของฉาก
//
// ฉาก:
//   • สมุดบัญชี "บัญชีหอ (SVC QC)" + ลิงก์ BUSINESS ของหน่วยหอ (ถ้ายังไม่มีลิงก์)
//   • DormLease ACTIVE 31 ห้องที่ฉากผังให้เช่า (occupancyId = occupancy ของฉากผังเดิม · เขียนตรง) + 207 DRAFT (เบญจา คำแก้ว · เข้า +12 วัน)
//     createdById = "SvcQcScene" (เครื่องหมายฉาก) · ผู้เช่า = Party (เบอร์ตายตัวต่อห้อง) · ชื่อ 201–211 ตามภาพ 02
//   • ประกันจริงผ่าน facade postSecurityDeposit คีย์ `svcqc-scene:<ห้อง>` (ห้องมาตรฐาน ฿9,000 · ห้องใหญ่ ฿10,400 · 207 จองรับแล้วเต็มประกัน ฿9,000)
//     ⇒ ยอดถือรวม ฿296,400 (25×9,000 + 6×10,400 + 207 ฿9,000)
//   • 204 ณัฐชา ใจดี: 12 เดือน · ฿4,500 · ลงชื่อแล้ว (ไฟล์ลายเซ็น) · รูปห้องวันเข้า 18 รูป (FileAsset private เขียนตรง — ไม่มีวัตถุจริงในที่เก็บ)
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0
// --clear: ลบ DormLease (createdById SvcQcScene) · Party/FileAsset ของฉาก · JV ประกันของฉาก (คีย์ `svcqc-scene:` — สคริปต์ QC ลบตรงได้
//   เพราะ reverseJournalEntry ปฏิเสธ JV หอตาม F7) · ไม่แตะห้อง/occupancy ของฉากผัง/ข้อมูลอื่น (ผู้ติดต่อบัญชีของผู้เช่าคงไว้ — ไม่มีลิงก์ใดชี้)
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_DORM_BOARD_SCENE as OCC_SCENE } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-lease-scene";
loadSvcQcEnv(LABEL);

const argv = process.argv.slice(2);
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");

const { prisma } = await import("@/lib/core/db");
const { postSecurityDeposit, securityDepositHeld } = await import("@/lib/modules/account");
const { createSystem } = await import("@/lib/modules/system/service");
const { saveSettings } = await import("@/lib/modules/account/service");
const { ensureAccounting } = await import("@/lib/modules/account/gl");
const { snapshotPolicy } = await import("@/lib/core/settings");
const { MANDATORY_CLAUSES } = await import("@/lib/core/settings/legal/th-rental-2568");

const MARK = "SvcQcScene";
const BOOK_NAME = "บัญชีหอ (SVC QC)";
const KEY_PREFIX = "svcqc-scene:";
const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const DAY = 86_400_000;
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const ymdOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/** ชื่อ 201–211 ตามภาพ 02 · ห้องอื่นใช้ชื่อสมมติตายตัว */
const NAMES: Record<string, string> = {
  "201": "อรอุมา แสงทอง",
  "202": "จักรพันธ์ ทองดี",
  "203": "นิภา วงศ์ใหญ่",
  "204": "ณัฐชา ใจดี",
  "205": "ภานุ ศรีวงศ์",
  "206": "รัตนา บุญมา",
  "207": "เบญจา คำแก้ว",
  "208": "สมศักดิ์ พรหมมา",
  "209": "ธิดารัตน์ มูลสาร",
  "211": "วรพล สายสุข",
};
const FIRST = ["กมล", "ชนิดา", "ธีรพงษ์", "ปิยะพร", "วิชัย", "สุนิสา", "อนุชา", "พิมพ์ใจ", "ศักดิ์ชัย", "มาลี", "ประเสริฐ", "จิราพร"];
const LAST = ["สุขใจ", "ศรีสวัสดิ์", "แก้วมณี", "บุญเรือง", "ทองคำ", "พรหมมินทร์", "ใจงาม", "สายบุญ"];
const nameOf = (no: string) => NAMES[no] ?? `${FIRST[Number(no) % FIRST.length]} ${LAST[Number(no) % LAST.length]}`;
const phoneOf = (no: string) => `089999${no}1`; // 10 หลัก ตายตัวต่อห้อง (หาซ้ำได้)
const TWO_PEOPLE = new Set(["202", "206", "105", "308"]);
const PHOTOS_204 = 18;

const sum = { created: 0, updated: 0, removed: 0 };
const errors: string[] = [];

type LeaseRow = { id: string; roomId: string; partyId: string; status: string; occupancyId: string | null; signatureFileId: string | null; moveInPhotos: unknown };

function sceneFileIds(l: LeaseRow): string[] {
  const ids: string[] = [];
  if (Array.isArray(l.moveInPhotos)) for (const p of l.moveInPhotos) if (p && typeof p === "object" && typeof (p as { fileId?: unknown }).fileId === "string") ids.push((p as { fileId: string }).fileId);
  if (l.signatureFileId) ids.push(l.signatureFileId);
  return ids;
}

/** ลบสัญญาของฉาก 1 แถว + JV ประกันของฉาก + ไฟล์ของฉาก (ไม่แตะ occupancy) */
async function removeLease(l: LeaseRow) {
  await prisma.accountJournalEntry.deleteMany({ where: { tenantId, refType: "DormSecurityDeposit", refId: `${unitId}:${l.id}`, idempotencyKey: { contains: `#RECEIVE:${KEY_PREFIX}` } } });
  const files = sceneFileIds(l);
  if (files.length) await prisma.fileAsset.deleteMany({ where: { tenantId, id: { in: files }, path: { startsWith: `t/${tenantId}/private/` } } });
  await prisma.dormLease.deleteMany({ where: { id: l.id, tenantId, createdById: MARK } });
  sum.removed++;
}

function privateAsset(contentType: string) {
  const name = randomBytes(20).toString("hex");
  const ext = contentType === "image/png" ? "png" : "jpg";
  const path = `t/${tenantId}/private/${name}.${ext}`;
  return { tenantId, kind: "ATTACHMENT" as const, path, cdnUrl: `private://${path}`, contentType, bytes: 0 };
}

let exitCode = 0;
try {
  const sceneLeases: LeaseRow[] = await prisma.dormLease.findMany({
    where: { tenantId, unitId, createdById: MARK },
    select: { id: true, roomId: true, partyId: true, status: true, occupancyId: true, signatureFileId: true, moveInPhotos: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (clear) {
    const partyIds = [...new Set(sceneLeases.map((l) => l.partyId))];
    for (const l of sceneLeases) await removeLease(l);
    // Party ของฉาก (เบอร์ตายตัวของฉาก) ที่ไม่มีสัญญาอื่นชี้แล้ว
    for (const pid of partyIds) {
      const still = await prisma.dormLease.count({ where: { tenantId, partyId: pid } });
      const p = await prisma.party.findFirst({ where: { id: pid, tenantId }, select: { phoneNorm: true } });
      if (!still && p?.phoneNorm && /^089999\d{3}1$/.test(p.phoneNorm)) {
        await prisma.party.deleteMany({ where: { id: pid, tenantId } });
        sum.removed++;
      }
    }
    console.log(`${LABEL}: --clear ลบฉาก (สัญญา ${sceneLeases.length})`);
  } else {
    // ── ต้องมีฉากผัง R0.9 ──
    const occs = await prisma.roomOccupancy.findMany({
      where: { tenantId, unitId, refType: OCC_SCENE.refType, kind: "LEASE", active: true },
      select: { id: true, roomId: true, refId: true, startDate: true, endDate: true },
    });
    if (occs.length < 31) {
      console.error(`🔴 ${LABEL}: ฉากผังห้องหอยังไม่ครบ (occupancy ${OCC_SCENE.refType} LEASE = ${occs.length} · ต้อง ≥ 31) — รันก่อน: bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-roomboard-scene.mts`);
      await prisma.$disconnect();
      process.exit(3);
    }

    // ── สมุดบัญชี + ลิงก์ BUSINESS ──
    const link = await prisma.accountSystemLink.findFirst({ where: { tenantId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true, archivedAt: null }, select: { systemId: true } });
    if (!link) {
      let book = await prisma.appSystem.findFirst({ where: { tenantId, type: "ACCOUNT", name: BOOK_NAME }, select: { id: true } });
      if (!book) {
        book = await createSystem(tenantId, "ACCOUNT", BOOK_NAME);
        await saveSettings(tenantId, book.id, { orgName: SQC.tenant.name, vatRegistered: false });
        await ensureAccounting({ tenantId, systemId: book.id });
        sum.created++;
      }
      await prisma.accountSystemLink.create({ data: { tenantId, systemId: book.id, linkedKind: "BUSINESS", linkedId: unitId, enabled: true } });
      sum.created++;
    }

    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId, unitId }, select: { id: true, number: true, roomTypeId: true, roomType: { select: { monthlyRateSatang: true } } } });
    const roomById = new Map(rooms.map((r) => [r.id, r]));
    const wantRoomIds = new Set<string>();
    const legalMode = await prisma.settingValue.findFirst({ where: { tenantId, key: "rooms.legal.mode", scope: "UNIT", scopeId: unitId }, select: { value: true } });
    const mandatory = MANDATORY_CLAUSES.map((m) => ({ id: m.id, titleTh: m.titleTh, textTh: m.textTh, mandatory: true }));

    for (const occ of [...occs].sort((a, b) => (roomById.get(a.roomId)?.number ?? "").localeCompare(roomById.get(b.roomId)?.number ?? ""))) {
      const room = roomById.get(occ.roomId);
      if (!room) continue;
      const no = room.number;
      wantRoomIds.add(room.id);
      const draft = no === OCC_SCENE.booked.number;
      const rent = room.roomType.monthlyRateSatang ?? 450000;
      const deposit = 2 * rent;
      const start = ymdOf(occ.startDate);
      const end = addDays(ymdOf(occ.endDate), -1);
      const name = nameOf(no);
      const phone = phoneOf(no);

      // ผู้เช่า = Party (เบอร์ตายตัวต่อห้อง)
      let party = await prisma.party.findFirst({ where: { tenantId, phoneNorm: phone, mergedIntoId: null }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
      if (!party) {
        party = await prisma.party.create({ data: { tenantId, kind: "PERSON", name, phone, phoneNorm: phone }, select: { id: true, name: true } });
        sum.created++;
      } else if (party.name !== name) {
        await prisma.party.update({ where: { id: party.id }, data: { name } });
        sum.updated++;
      }

      const want = {
        status: draft ? "DRAFT" : "ACTIVE",
        startDate: start,
        endDate: end,
        rentSatang: rent,
        commonFeeSatang: SQC.pending.dorm.commonFeeSatang,
        depositSatang: deposit,
        bookingFeeSatang: draft ? deposit : 0,
        occupancyId: occ.id,
        partyId: party.id,
      };
      const existing = await prisma.dormLease.findFirst({
        where: { tenantId, unitId, roomId: room.id, createdById: MARK },
        select: { id: true, status: true, startDate: true, endDate: true, rentSatang: true, commonFeeSatang: true, depositSatang: true, bookingFeeSatang: true, occupancyId: true, partyId: true, signedAt: true, signatureFileId: true, moveInPhotos: true },
      });
      let leaseId: string;
      if (!existing) {
        const snap = await snapshotPolicy({ tenantId }, "lease", { unitId, roomTypeId: room.roomTypeId, roomId: room.id });
        const leaseNoTail = randomBytes(4).toString("hex").toUpperCase();
        const textTh = [
          `สัญญาเช่าห้องพัก (ฉากทดสอบ SVC QC · ${leaseNoTail})`,
          `ทำที่ ${SQC.units.dorm.name}`,
          `ผู้ให้เช่า ${SQC.units.dorm.name} ผู้เช่า ${name} ห้อง ${no}`,
          `ระยะเวลา ${start} ถึง ${end} ค่าเช่าเดือนละ ${(rent / 100).toLocaleString("en-US")} บาท`,
          "",
          mandatory.map((c, i) => `ข้อ ${i + 1} ${c.titleTh}\n${c.textTh}`).join("\n\n"),
        ].join("\n");
        const policySnapshot = { ...snap, contract: { textTh, clauses: mandatory }, legal: { mode: typeof legalMode?.value === "string" ? legalMode.value : "STRICT", level: "OK", code: null, reason: null, approvalId: null } };
        const occupants = TWO_PEOPLE.has(no) ? [{ name: `ผู้พักร่วมห้อง ${no}`, phone: null }] : [];
        const row = await prisma.dormLease.create({
          data: {
            tenantId,
            unitId,
            roomId: room.id,
            partyId: party.id,
            coTenants: { occupants, vehicles: [] },
            status: want.status,
            termType: "FIXED",
            startDate: dbDate(start),
            endDate: dbDate(end),
            rentSatang: want.rentSatang,
            commonFeeSatang: want.commonFeeSatang,
            depositSatang: want.depositSatang,
            advanceRentSatang: 0,
            bookingFeeSatang: want.bookingFeeSatang,
            occupancyId: occ.id,
            templateKey: snap.template.key,
            templateVersion: snap.template.version,
            moveInPhotos: [],
            createdById: MARK,
            policySnapshot: JSON.parse(JSON.stringify(policySnapshot)),
            signedAt: draft ? null : new Date(`${start}T10:00:00+07:00`),
          },
          select: { id: true },
        });
        leaseId = row.id;
        sum.created++;
      } else {
        leaseId = existing.id;
        const diff: Prisma.DormLeaseUncheckedUpdateInput = {};
        if (existing.status !== want.status) diff.status = want.status;
        if (ymdOf(existing.startDate) !== want.startDate) diff.startDate = dbDate(want.startDate);
        if (ymdOf(existing.endDate) !== want.endDate) diff.endDate = dbDate(want.endDate);
        if (existing.rentSatang !== want.rentSatang) diff.rentSatang = want.rentSatang;
        if (existing.commonFeeSatang !== want.commonFeeSatang) diff.commonFeeSatang = want.commonFeeSatang;
        if (existing.depositSatang !== want.depositSatang) diff.depositSatang = want.depositSatang;
        if (existing.bookingFeeSatang !== want.bookingFeeSatang) diff.bookingFeeSatang = want.bookingFeeSatang;
        if (existing.occupancyId !== want.occupancyId) diff.occupancyId = want.occupancyId;
        if (existing.partyId !== want.partyId) diff.partyId = want.partyId;
        if (!draft && !existing.signedAt) diff.signedAt = new Date(`${want.startDate}T10:00:00+07:00`);
        if (Object.keys(diff).length) {
          await prisma.dormLease.update({ where: { id: existing.id }, data: diff });
          sum.updated++;
        }
      }

      // 204: ลายเซ็น + รูปห้องวันเข้า 18 รูป (FileAsset private เขียนตรง)
      if (no === "204") {
        const cur = await prisma.dormLease.findFirst({ where: { id: leaseId, tenantId }, select: { signatureFileId: true, moveInPhotos: true } });
        const photos = Array.isArray(cur?.moveInPhotos) ? (cur!.moveInPhotos as { fileId: string; kind: string; at: string }[]) : [];
        const roomPhotos = photos.filter((p) => p && p.kind === "ROOM_PHOTO").length;
        if (!cur?.signatureFileId || roomPhotos !== PHOTOS_204) {
          const at = new Date(`${start}T10:00:00+07:00`).toISOString();
          const list = [...photos.filter((p) => p && p.kind !== "ROOM_PHOTO")];
          for (let i = 0; i < PHOTOS_204; i++) {
            const a = await prisma.fileAsset.create({ data: privateAsset("image/jpeg"), select: { id: true } });
            list.push({ fileId: a.id, kind: "ROOM_PHOTO", at });
          }
          if (!photos.some((p) => p && p.kind === "ID_CARD")) {
            const a = await prisma.fileAsset.create({ data: privateAsset("image/jpeg"), select: { id: true } });
            list.push({ fileId: a.id, kind: "ID_CARD", at });
          }
          const old = photos.filter((p) => p && p.kind === "ROOM_PHOTO").map((p) => p.fileId);
          let sig = cur?.signatureFileId ?? null;
          if (!sig) sig = (await prisma.fileAsset.create({ data: privateAsset("image/png"), select: { id: true } })).id;
          await prisma.dormLease.update({ where: { id: leaseId }, data: { moveInPhotos: list, signatureFileId: sig, signedAt: new Date(at) } });
          if (old.length) await prisma.fileAsset.deleteMany({ where: { tenantId, id: { in: old }, path: { startsWith: `t/${tenantId}/private/` } } });
          sum.updated++;
        }
      }

      // ประกันจริงผ่าน facade (คีย์ของฉาก · ทีละรายการ)
      const held = await securityDepositHeld({ tenantId, unitId, leaseId });
      if (held !== deposit) {
        if (held !== 0) {
          errors.push(`${no} ยอดถือ ${held} ≠ ${deposit} (แก้ด้วย --clear แล้วรันใหม่)`);
          continue;
        }
        const r = await postSecurityDeposit({ tenantId, unitId, leaseId, amountSatang: deposit, idempotencyKey: `${KEY_PREFIX}${no}`, partyId: party.id, paidAt: new Date(), channel: "TRANSFER", note: draft ? `เงินจองห้อง ${no} (ฉาก SVC QC)` : `เงินประกันห้อง ${no} (ฉาก SVC QC)` });
        if (!r.ok) errors.push(`${no} รับประกันไม่สำเร็จ ${r.code}: ${r.reason}`);
        else if (!r.duplicate) sum.created++;
        else errors.push(`${no} คีย์ ${KEY_PREFIX}${no} เคยใช้กับสัญญาอื่น (แก้ด้วย --clear แล้วรันใหม่)`);
      }
    }

    // สัญญาฉากที่ห้องไม่อยู่ในฉากผังแล้ว ⇒ ลบ
    for (const l of sceneLeases) if (!wantRoomIds.has(l.roomId)) await removeLease(l);
    console.log(`${LABEL}: วันนี้ ${today} · สัญญาฉาก ${wantRoomIds.size} ห้อง (จอง ${OCC_SCENE.booked.number})`);
  }
  if (errors.length) {
    exitCode = 1;
    console.error(`🔴 ${LABEL}: ไม่สำเร็จ ${errors.length} ห้อง — ${errors.join(" · ")}`);
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
