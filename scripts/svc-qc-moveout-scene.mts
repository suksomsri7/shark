// svc-qc-moveout-scene.mts — SVC D.12 · ฉากย้ายออก/คืนเงินประกันห้อง 207 บนร้าน svcqc (ภาพ หอ 07 · README หอ "ห้อง 207 ธนพล … ฿7,759.28")
//
// ใช้ (ต้องมีฉากผัง R0.9 + ฉากสัญญา D.5 ก่อน — svc-qc-roomboard-scene.mts → svc-qc-lease-scene.mts):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-moveout-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-moveout-scene.mts --clear    # ลบเฉพาะแถวฉากนี้
//   ⚠️ ล้างฉากต้องเรียง "moveout --clear ก่อน" แล้วค่อยฉาก D.8/D.13/D.5 --clear (บิล/ใบย้ายออกชี้สัญญาด้วย FK Restrict)
//
// ฉาก (ค่าจาก SQC_DORM_MOVEOUT_SCENE + SQC_DORM_MOVEOUT_DAYS ใน svc-qc-data.mts เท่านั้น · วันที่สัมพัทธ์วันนี้ไทย):
//   • ห้อง 207 ผู้เช่าเดิม "ธนพล ศรีสุข" สัญญา 12 เดือนจบ = วันออก (วันนี้ − 3) · สถานะ ENDED/MOVED_OUT (วันออกผ่านแล้ว — มติ R4)
//     ⇒ ไม่นับในผู้เช่าปัจจุบัน 31 ห้อง/ยอดถือ ฿296,400 ของ D.5/D.13 · เบญจา (DRAFT · ฉาก D.5) ไม่แตะ
//   • occupancy LEASE ของสัญญานี้ [เริ่มสัญญา, วันออก + 1) — มีแล้ว ⇒ ใช้แถวเดิม (ไม่สร้างซ้อน) · ไม่ทับช่วงจองของเบญจา
//   • ประกัน ฿9,000 ผ่าน facade postSecurityDeposit (คีย์ svcqc-scene:moveout:207) · บิลงวดวันออก (ไฟ meta.to 2,000 · น้ำ 383 · จ่ายครบ)
//     ผ่าน createExternalInvoice + recordExternalPayment จริง · ใบย้ายออก INSPECTED (ไม่ตรึง) · มิเตอร์วันออก 2,126 / 389 · หลักฐาน 2 ไฟล์ (FileAsset private)
//   • แถวของฉากนี้ติด createdById/enteredById/note "SvcQcScene:d12" (ไม่ใช้ "SvcQcScene" ของ D.5 — ฉาก D.5 ตามหาสัญญาห้อง 207 ด้วย mark นั้น)
//   • ไม่แตะค่าตั้งของร้าน/หน่วย (บทเรียน D.9: ฉากห้ามทับค่าตั้งที่ชุดอื่นใช้) · ห้องไม่มีมิเตอร์ ⇒ สร้างมิเตอร์ของฉาก · ไม่มีอัตราค่าน้ำไฟ ≤ เดือนวันออก ⇒ ใส่อัตราของฉาก
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_DORM_MOVEOUT_DAYS as DAYS, SQC_DORM_MOVEOUT_SCENE as SCN } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-moveout-scene";
const argv = process.argv.slice(2);
const unknownArgs = argv.filter((a) => a !== "--clear");
if (unknownArgs.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknownArgs.join(" ")} (ใช้ได้: --clear)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");
const { createExternalInvoice, postSecurityDeposit, recordExternalPayment, securityDepositHeld } = await import("@/lib/modules/account");
const { claimRoom, resizeOccupancy } = await import("@/lib/modules/rooms");
const { resolveSettings, snapshotPolicy } = await import("@/lib/core/settings");
const calc = await import("@/lib/modules/dorm/calc");
const bridge = await import("@/lib/modules/dorm/account-bridge");

const MARK = "SvcQcScene:d12";
const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const owner = SQC.users.find((u) => u.key === "owner");
const sum = { created: 0, updated: 0, removed: 0 };
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const shiftMonth = (p: string, k: number) => {
  const m0 = Number(p.slice(5, 7)) - 1 + k;
  return `${Number(p.slice(0, 4)) + Math.floor(m0 / 12)}-${String((((m0 % 12) + 12) % 12) + 1).padStart(2, "0")}`;
};
const NOVAT = { registered: false, pricesIncludeVat: true };
const moveOut = DAYS.moveOutDate;
const P = DAYS.billPeriod;
const filePath = (n: number) => `t/${tenantId}/private/svcqc-d12-evidence-${n}.png`;
const photoPath = `t/${tenantId}/private/svcqc-d12-movein-207.jpg`;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

async function clearScene() {
  const room = await prisma.hotelRoom.findFirst({ where: { tenantId, unitId, number: SCN.room }, select: { id: true } });
  const leases = room ? await prisma.dormLease.findMany({ where: { tenantId, unitId, roomId: room.id, createdById: MARK }, select: { id: true, partyId: true } }) : [];
  for (const l of leases) {
    sum.removed += (await prisma.dormMoveOut.deleteMany({ where: { tenantId, leaseId: l.id } })).count;
    sum.removed += (await prisma.dormMeterReading.deleteMany({ where: { tenantId, leaseId: l.id } })).count;
    sum.removed += (await prisma.dormBill.deleteMany({ where: { tenantId, leaseId: l.id } })).count;
    sum.removed += (await prisma.roomOccupancy.deleteMany({ where: { tenantId, refType: "DormLease", refId: l.id } })).count;
    // JV ประกันของฉาก (คีย์ของฉาก) ลบตรงได้แบบฉาก D.5 · ใบแจ้งหนี้/รับชำระของบิลฉากคงไว้ (เอกสารบัญชี · ref ผูกสัญญาที่ลบแล้ว ไม่มีใครชี้)
    sum.removed += (await prisma.accountJournalEntry.deleteMany({ where: { tenantId, refType: "DormSecurityDeposit", refId: `${unitId}:${l.id}`, idempotencyKey: { contains: `#RECEIVE:${SCN.depositKey}` } } })).count;
    sum.removed += (await prisma.dormLease.deleteMany({ where: { tenantId, id: l.id, createdById: MARK } })).count;
    if (!(await prisma.dormLease.count({ where: { tenantId, partyId: l.partyId } }))) sum.removed += (await prisma.party.deleteMany({ where: { tenantId, id: l.partyId, phoneNorm: null } })).count;
  }
  const meters = await prisma.dormMeter.findMany({ where: { tenantId, unitId, note: MARK }, select: { id: true } });
  if (meters.length) {
    sum.removed += (await prisma.dormMeterReading.deleteMany({ where: { tenantId, meterId: { in: meters.map((m) => m.id) } } })).count;
    sum.removed += (await prisma.dormMeter.deleteMany({ where: { tenantId, id: { in: meters.map((m) => m.id) } } })).count;
  }
  const runs = await prisma.dormBillRun.findMany({ where: { tenantId, unitId, createdById: MARK }, select: { id: true } });
  for (const r of runs) if (!(await prisma.dormBill.count({ where: { runId: r.id } }))) sum.removed += (await prisma.dormBillRun.deleteMany({ where: { id: r.id } })).count;
  sum.removed += (await prisma.dormUtilityRate.deleteMany({ where: { tenantId, unitId, enteredById: MARK } })).count;
  sum.removed += (await prisma.fileAsset.deleteMany({ where: { tenantId, path: { startsWith: `t/${tenantId}/private/svcqc-d12-` } } })).count;
  console.log(`${LABEL}: --clear ลบฉากย้ายออก 207 (${sum.removed} แถว)`);
}

async function fileOf(path: string, contentType: string): Promise<string> {
  const hit = await prisma.fileAsset.findFirst({ where: { tenantId, path }, select: { id: true } });
  if (hit) return hit.id;
  sum.created++;
  return (await prisma.fileAsset.create({ data: { tenantId, kind: "ATTACHMENT", path, cdnUrl: `private://${path}`, contentType, bytes: 0 }, select: { id: true } })).id;
}

let exitCode = 0;
try {
  if (clear) await clearScene();
  else {
    if (!owner) throw new Error("ไม่พบผู้ใช้เจ้าของ svcqc ใน SQC_USERS");
    const rooms = await prisma.hotelRoom.count({ where: { tenantId, unitId } });
    const d5 = await prisma.dormLease.count({ where: { tenantId, unitId, createdById: "SvcQcScene" } });
    const link = await prisma.accountSystemLink.findFirst({ where: { tenantId, linkedKind: "BUSINESS", linkedId: unitId, enabled: true, archivedAt: null }, select: { systemId: true } });
    if (rooms !== 36 || d5 < 31 || !link) {
      console.error(`🔴 ${LABEL}: ร้าน svcqc ยังไม่พร้อม (ห้อง ${rooms}/36 · สัญญาฉาก D.5 ${d5}/31 · สมุดบัญชี ${link ? "มี" : "ไม่มี"}) — รันก่อน: svc-qc-roomboard-scene.mts → svc-qc-lease-scene.mts`);
      await prisma.$disconnect();
      process.exit(3);
    }
    const room = await prisma.hotelRoom.findFirst({ where: { tenantId, unitId, number: SCN.room }, select: { id: true, roomTypeId: true, buildingId: true } });
    if (!room) throw new Error(`ไม่มีห้อง ${SCN.room}`);

    // ── ผู้เช่า (Party · ไม่มีเบอร์ในฉาก) ──
    let party = await prisma.party.findFirst({ where: { tenantId, name: SCN.tenant, mergedIntoId: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
    if (!party) {
      party = await prisma.party.create({ data: { tenantId, kind: "PERSON", name: SCN.tenant }, select: { id: true } });
      sum.created++;
    }

    // ── สัญญา (ENDED/MOVED_OUT) ──
    const photoId = await fileOf(photoPath, "image/jpeg");
    const want = {
      status: "ENDED",
      endReason: "MOVED_OUT",
      startDate: DAYS.leaseStart,
      endDate: moveOut,
      rentSatang: SCN.rentSatang,
      commonFeeSatang: 0,
      depositSatang: SCN.depositSatang,
      partyId: party.id,
      endedAt: new Date(`${addDays(moveOut, 1)}T00:05:00+07:00`),
      moveInPhotos: [{ fileId: photoId, kind: "ROOM_PHOTO", at: new Date(`${DAYS.leaseStart}T10:00:00+07:00`).toISOString() }],
    };
    let lease = await prisma.dormLease.findFirst({
      where: { tenantId, unitId, roomId: room.id, createdById: MARK },
      select: { id: true, status: true, endReason: true, startDate: true, endDate: true, rentSatang: true, commonFeeSatang: true, depositSatang: true, partyId: true, endedAt: true, moveInPhotos: true, occupancyId: true },
    });
    if (!lease) {
      const snap = await snapshotPolicy({ tenantId }, "lease", { unitId, roomTypeId: room.roomTypeId, roomId: room.id });
      lease = await prisma.dormLease.create({
        data: {
          tenantId, unitId, roomId: room.id, partyId: party.id, coTenants: { occupants: [], vehicles: [] }, status: want.status, endReason: want.endReason, termType: "FIXED",
          startDate: dbDate(want.startDate), endDate: dbDate(want.endDate), rentSatang: want.rentSatang, commonFeeSatang: 0, depositSatang: want.depositSatang, advanceRentSatang: 0, bookingFeeSatang: 0,
          templateKey: snap.template.key, templateVersion: snap.template.version, moveInPhotos: want.moveInPhotos, createdById: MARK, endedAt: want.endedAt,
          signedAt: new Date(`${DAYS.leaseStart}T10:00:00+07:00`),
          policySnapshot: JSON.parse(JSON.stringify({ ...snap, legal: { mode: "STRICT", level: "OK", code: null, reason: null, approvalId: null } })),
        },
        select: { id: true, status: true, endReason: true, startDate: true, endDate: true, rentSatang: true, commonFeeSatang: true, depositSatang: true, partyId: true, endedAt: true, moveInPhotos: true, occupancyId: true },
      });
      sum.created++;
    } else {
      const diff: Prisma.DormLeaseUncheckedUpdateInput = {};
      if (lease.status !== want.status) diff.status = want.status;
      if (lease.endReason !== want.endReason) diff.endReason = want.endReason;
      if (ymdOf(lease.startDate) !== want.startDate) diff.startDate = dbDate(want.startDate);
      if (ymdOf(lease.endDate) !== want.endDate) diff.endDate = dbDate(want.endDate);
      if (lease.rentSatang !== want.rentSatang) diff.rentSatang = want.rentSatang;
      if (lease.depositSatang !== want.depositSatang) diff.depositSatang = want.depositSatang;
      if (lease.partyId !== want.partyId) diff.partyId = want.partyId;
      if (lease.endedAt?.getTime() !== want.endedAt.getTime()) diff.endedAt = want.endedAt;
      if (!isDeepStrictEqual(lease.moveInPhotos, want.moveInPhotos)) diff.moveInPhotos = want.moveInPhotos;
      if (Object.keys(diff).length) {
        await prisma.dormLease.update({ where: { id: lease.id }, data: diff });
        sum.updated++;
      }
    }
    const leaseId = lease.id;

    // ── occupancy [เริ่ม, วันออก + 1) ──
    const occEnd = addDays(moveOut, 1);
    let occ = lease.occupancyId ? await prisma.roomOccupancy.findFirst({ where: { tenantId, id: lease.occupancyId, active: true }, select: { id: true, startDate: true, endDate: true } }) : null;
    occ ??= await prisma.roomOccupancy.findFirst({ where: { tenantId, unitId, roomId: room.id, kind: "LEASE", active: true, endDate: dbDate(occEnd) }, select: { id: true, startDate: true, endDate: true } });
    if (!occ) {
      const c = await prisma.$transaction((tx) =>
        claimRoom(tx, { tenantId, unitId, roomId: room.id, start: DAYS.leaseStart, end: occEnd, kind: "LEASE", refType: "DormLease", refId: leaseId, requireRentMode: "MONTHLY" }),
      );
      if (!c.ok) throw new Error(`ถือห้อง ${SCN.room} ไม่ได้: ${c.code}`);
      occ = { id: c.occupancyId, startDate: dbDate(DAYS.leaseStart), endDate: dbDate(occEnd) };
      sum.created++;
    } else if (ymdOf(occ.startDate) !== DAYS.leaseStart || ymdOf(occ.endDate) !== occEnd) {
      const occId = occ.id;
      const r = await prisma.$transaction((tx) => resizeOccupancy(tx, { tenantId, unitId, occupancyId: occId, start: DAYS.leaseStart, end: occEnd }));
      if (!r.ok) throw new Error(`ปรับช่วงถือห้อง ${SCN.room} ไม่ได้: ${r.code}`);
      sum.updated++;
    }
    if (lease.occupancyId !== occ.id) {
      await prisma.dormLease.update({ where: { id: leaseId }, data: { occupancyId: occ.id } });
      sum.updated++;
    }

    // ── ประกัน ฿9,000 (facade จริง) ──
    const held = await securityDepositHeld({ tenantId, unitId, leaseId });
    if (held === 0) {
      const r = await postSecurityDeposit({ tenantId, unitId, leaseId, amountSatang: SCN.depositSatang, idempotencyKey: SCN.depositKey, partyId: party.id, paidAt: new Date(`${DAYS.leaseStart}T10:00:00+07:00`), channel: "TRANSFER", note: `เงินประกันห้อง ${SCN.room} (ฉาก SVC QC D.12)` });
      if (!r.ok) throw new Error(`รับประกัน: ${r.code} ${r.reason}`);
      if (r.duplicate) throw new Error(`คีย์ ${SCN.depositKey} เคยใช้กับสัญญาอื่น — แก้ด้วย --clear แล้วรันใหม่`);
      sum.created++;
    } else if (held !== SCN.depositSatang) throw new Error(`ยอดถือ ${held} ≠ ${SCN.depositSatang} — แก้ด้วย --clear แล้วรันใหม่`);

    // ── มิเตอร์ห้อง (ใช้ของเดิม · ไม่มี ⇒ ของฉาก) ──
    const meters: Record<"ELEC" | "WATER", string> = { ELEC: "", WATER: "" };
    for (const kind of ["ELEC", "WATER"] as const) {
      const m = await prisma.dormMeter.findFirst({ where: { tenantId, unitId, roomId: room.id, kind, role: "ROOM", removedAt: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
      if (m) meters[kind] = m.id;
      else {
        meters[kind] = (await prisma.dormMeter.create({ data: { tenantId, unitId, roomId: room.id, kind, role: "ROOM", startReading: kind === "ELEC" ? 1000 : 300, digits: kind === "ELEC" ? 5 : 4, note: MARK }, select: { id: true } })).id;
        sum.created++;
      }
    }

    // ── อัตราค่าน้ำไฟ ≤ เดือนวันออก (ไม่มี ⇒ อัตราของฉาก · ไม่แตะค่าตั้ง) ──
    const month = moveOut.slice(0, 7);
    const S = await resolveSettings({ tenantId }, ["rooms.utility.elec.method", "rooms.utility.water.method"], { unitId, roomId: room.id });
    for (const kind of ["ELEC", "WATER"] as const) {
      const method = S[kind === "ELEC" ? "rooms.utility.elec.method" : "rooms.utility.water.method"]?.value;
      if (method !== undefined && method !== "ACTUAL_COST") continue;
      const has = await prisma.dormUtilityRate.findFirst({ where: { tenantId, unitId, kind, periodKey: { lte: month }, rateSatangPerUnit: { not: null }, OR: [{ buildingId: null }, { buildingId: room.buildingId }] }, select: { id: true } });
      if (has) continue;
      const m = SCN.meters[kind];
      await prisma.dormUtilityRate.create({
        data: { tenantId, unitId, buildingId: room.buildingId, kind, periodKey: month, mode: "ACTUAL_COST", authorityBillSatang: kind === "ELEC" ? 1_982_400 : 384_000, authorityUnits: kind === "ELEC" ? 4_200 : 240, rateSatangPerUnit: m.rateSatang, enteredById: MARK },
      });
      sum.created++;
    }

    // ── บิลงวดวันออก (จ่ายครบ · meta.to = เลขที่ออกบิลแล้ว) ──
    const bill = calc.buildDormBill({
      rentSatang: SCN.rentSatang,
      commonFeeSatang: 0,
      electricity: { kind: "METERED", segments: [{ start: SCN.meters.ELEC.base - 120, end: SCN.meters.ELEC.base }], method: { kind: "FIXED_RATE", satangPerUnit: SCN.meters.ELEC.rateSatang } },
      water: { kind: "METERED", segments: [{ start: SCN.meters.WATER.base - 8, end: SCN.meters.WATER.base }], method: { kind: "FIXED_RATE", satangPerUnit: SCN.meters.WATER.rateSatang } },
      vat: NOVAT,
    });
    const issue = `${shiftMonth(P, -1)}-25`;
    let run = await prisma.dormBillRun.findFirst({ where: { tenantId, unitId, periodKey: P }, select: { id: true } });
    if (!run) {
      run = await prisma.dormBillRun.create({ data: { tenantId, unitId, periodKey: P, status: "DRAFT", issueDate: dbDate(issue), dueDate: dbDate(`${P}-05`), createdById: MARK }, select: { id: true } });
      sum.created++;
    }
    const inv = await createExternalInvoice({
      tenantId, sourceKind: "DORM", unitId, refType: "DormBill", refId: `${leaseId}:${P}`, customer: { name: SCN.tenant }, partyId: party.id,
      lines: bridge.dormBillInvoiceLines(bill), vat: NOVAT, issueDate: issue, dueDate: `${P}-05`,
    });
    if (!inv.ok) throw new Error(`ใบแจ้งหนี้งวด ${P}: ${inv.code} ${inv.reason}`);
    if (inv.created) sum.created++;
    const pay = await recordExternalPayment({ tenantId, unitId, docId: inv.docId, amountSatang: bill.totalSatang, idempotencyKey: `${SCN.depositKey}:pay:${P}`, paidAt: new Date(`${P}-03T10:00:00+07:00`) });
    if (!pay.ok) throw new Error(`รับชำระงวด ${P}: ${pay.code} ${pay.reason}`);
    if (!pay.duplicate) sum.created++;
    const billRow = await prisma.dormBill.findFirst({ where: { tenantId, leaseId, periodKey: P }, select: { id: true, status: true, totalSatang: true, accountDocumentId: true, paidSatang: true } });
    const billData = {
      status: "PAID", lines: JSON.parse(JSON.stringify(bill.lines)), subtotalSatang: bill.subtotalSatang, vatSatang: bill.vatSatang, totalSatang: bill.totalSatang, paidSatang: bill.totalSatang,
      dueDate: dbDate(`${P}-05`), accountDocumentId: inv.docId, sentAt: new Date(`${issue}T10:00:00+07:00`), paidAt: new Date(`${P}-03T10:00:00+07:00`),
    };
    if (!billRow) {
      await prisma.dormBill.create({ data: { tenantId, unitId, runId: run.id, leaseId, roomId: room.id, partyId: party.id, periodKey: P, ...billData } });
      sum.created++;
    } else if (billRow.status !== "PAID" || billRow.totalSatang !== bill.totalSatang || billRow.accountDocumentId !== inv.docId || billRow.paidSatang !== bill.totalSatang) {
      await prisma.dormBill.update({ where: { id: billRow.id }, data: billData });
      sum.updated++;
    }

    // ── มิเตอร์วันออก (MOVE_OUT · 1 แถว/มิเตอร์/สัญญา) ──
    for (const kind of ["ELEC", "WATER"] as const) {
      const value = SCN.meters[kind].moveOut;
      const r = await prisma.dormMeterReading.findFirst({ where: { tenantId, meterId: meters[kind], leaseId, kind: "MOVE_OUT" }, select: { id: true, value: true, periodKey: true } });
      if (!r) {
        await prisma.dormMeterReading.create({ data: { tenantId, unitId, meterId: meters[kind], leaseId, periodKey: month, kind: "MOVE_OUT", value, readAt: new Date(`${moveOut}T11:02:00+07:00`), readById: owner.userId, source: "MANUAL" } });
        sum.created++;
      } else if (r.value !== value || r.periodKey !== month) {
        await prisma.dormMeterReading.update({ where: { id: r.id }, data: { value, periodKey: month } });
        sum.updated++;
      }
    }

    // ── ใบย้ายออก INSPECTED (ไม่ตรึง) ──
    const f1 = await fileOf(filePath(1), "image/png");
    const f2 = await fileOf(filePath(2), "image/png");
    const evidence: Record<string, string[]> = { screen: [f1], keys: [f2] };
    const at = new Date(`${moveOut}T11:02:00+07:00`).toISOString();
    const inspection = {
      originalEndDate: moveOut,
      noticeDate: DAYS.noticeDate,
      shortNoticeReason: null,
      files: [f1, f2].map((fileId) => ({ fileId, contentType: "image/png", at })),
      items: SCN.items.map((i) => ({ key: i.key, labelTh: i.labelTh, verdict: i.verdict, damageCode: null, amountSatang: i.amountSatang, evidenceFileIds: evidence[i.key] ?? [], note: i.note })),
      meters: (["ELEC", "WATER"] as const).map((kind) => ({ meterId: meters[kind], kind, baseValue: SCN.meters[kind].base, value: SCN.meters[kind].moveOut, units: SCN.meters[kind].units })),
      inspectedAt: at,
      inspectedById: owner.userId,
      hkMarkedAt: null,
    };
    const deductions = { rev: 1, frozen: null, history: [], settle: null };
    const refundDueAt = new Date(`${addDays(DAYS.refundDueDate, 1)}T00:00:00+07:00`);
    const moWant = {
      status: SCN.expect.status,
      noticeAt: new Date(`${DAYS.noticeDate}T10:00:00+07:00`),
      moveOutDate: dbDate(moveOut),
      inspection,
      deductions,
      depositSatang: 0,
      deductSatang: SCN.expect.deductSatang,
      refundSatang: 0,
      refundDueAt,
      refundedAt: null,
      settlementDocumentId: null,
      approvalId: null,
    };
    const mo = await prisma.dormMoveOut.findFirst({ where: { tenantId, leaseId }, select: { id: true, status: true, noticeAt: true, moveOutDate: true, inspection: true, deductions: true, deductSatang: true, refundDueAt: true } });
    if (!mo) {
      await prisma.dormMoveOut.create({ data: { tenantId, unitId, leaseId, createdById: MARK, ...moWant } });
      sum.created++;
    } else {
      const same =
        mo.status === moWant.status &&
        mo.noticeAt.getTime() === moWant.noticeAt.getTime() &&
        ymdOf(mo.moveOutDate) === moveOut &&
        isDeepStrictEqual(JSON.parse(JSON.stringify(mo.inspection)), JSON.parse(JSON.stringify(inspection))) &&
        isRec(mo.deductions) && mo.deductions.frozen === null && mo.deductions.settle === null &&
        mo.deductSatang === moWant.deductSatang &&
        mo.refundDueAt?.getTime() === refundDueAt.getTime();
      if (!same) {
        await prisma.dormMoveOut.update({ where: { id: mo.id }, data: moWant });
        sum.updated++;
      }
    }
    console.log(`${LABEL}: ห้อง ${SCN.room} ${SCN.tenant} · ย้ายออก ${moveOut} · แจ้ง ${DAYS.noticeDate} · ครบคืน ${DAYS.refundDueDate} · บิลงวด ${P}`);
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
