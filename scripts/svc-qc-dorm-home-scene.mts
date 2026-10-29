// svc-qc-dorm-home-scene.mts — SVC D.13 · ฉากหน้าแรกหอ (KPI · รอบบิล · ต้องทำวันนี้) + ค่าตั้งหน้า 17 บนร้าน svcqc (ภาพ หอ 01 · หอ 17 · README หอ "3 พ.ย.")
//
// ใช้ (ต้องมีฉากผัง R0.9 + ฉากสัญญา D.5 ก่อน — svc-qc-roomboard-scene.mts → svc-qc-lease-scene.mts):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-dorm-home-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-dorm-home-scene.mts --clear    # ลบเฉพาะแถวของฉาก (+ คืนค่าตั้ง 4 ค่า)
//   ⚠️ DormBill.leaseId เป็น FK Restrict ⇒ ล้างฉากต้องเรียง "D.13 --clear ก่อน" แล้วค่อย svc-qc-lease-scene.mts --clear
//
// ฉาก (ค่าจาก SQC_DORM_HOME_SCENE + SQC_DORM_POLICY_SCENE เท่านั้น · วันที่สัมพัทธ์วันนี้ไทย — ใบสั่ง D.13 §9):
//   • งวดปัจจุบัน P = (วันที่ไทยวันนี้ ≤ 5 ? เดือนนี้ : เดือนหน้า) · ครบกำหนด P-05 · งวดก่อน P−1 (ครบกำหนด (P−1)-05) · ส่ง = min((P−1)-26, วันนี้)
//   • DormBillRun P (SENT · 31 บิลตาม bills) และ P−1 (SENT · 2 บิลค้าง prevUnpaid) — createdById = mark · บิลจ่ายแล้ว PAID (paid = total) / อื่น SENT
//   • PaymentSlip NEEDS_REVIEW ของ slipPending (fileId = FileAsset private ของฉาก · คีย์ checks.idempotencyKey `svcqc-d13:<ห้อง>:<งวด>`)
//   • DormRepair OPEN ตาม repairsOpen · ค่าตั้งหอ: แม่แบบ + 4 ค่า ผ่านเครื่องยนต์ในนามเจ้าของ svcqc
// มีรอบของคนอื่น (createdById ≠ mark) ที่ P หรือ P−1 ⇒ exit 3 (เลน D.8 ใช้ร่วม) · สัญญาฉาก D.5 < 31 ⇒ exit 3
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_DORM_HOME_SCENE as SCN, SQC_DORM_POLICY_SCENE as POL } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-dorm-home-scene";
const ORDER_WARN = "⚠️ ล้างฉากต้องเรียง: svc-qc-dorm-home-scene.mts --clear ก่อน แล้วค่อย svc-qc-lease-scene.mts --clear (DormBill.leaseId เป็น FK Restrict)";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างฉากหน้าแรกหอ + ค่าตั้งหน้า 17 บนร้าน svcqc · --clear ลบเฉพาะแถวฉาก\n${ORDER_WARN}`);
  process.exit(0);
}
const unknown = argv.filter((a) => a !== "--clear");
if (unknown.length) {
  console.error(`🔴 ${LABEL}: ไม่รู้จัก ${unknown.join(" ")} (ใช้ได้: --clear · --help)`);
  process.exit(2);
}
const clear = argv.includes("--clear");
loadSvcQcEnv(LABEL);

const { prisma } = await import("@/lib/core/db");
const { applyTemplate, resetSetting, resolveSettings, setSettings } = await import("@/lib/core/settings");

const MARK = SCN.mark;
const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const KEY_PREFIX = "svcqc-d13:";
const ownerU = SQC.users.find((u) => u.key === "owner")!;
const owner = { role: "OWNER" as const, unitAccess: ["*"], permissions: {}, userId: ownerU.userId };
const ctx = { tenantId };

const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const shift = (period: string, n: number) => {
  const m = Number(period.slice(5, 7)) - 1 + n;
  const y = Number(period.slice(0, 4)) + Math.floor(m / 12);
  return `${y}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}`;
};
const P = Number(today.slice(8, 10)) <= 5 ? today.slice(0, 7) : shift(today.slice(0, 7), 1);
const PP = shift(P, -1);
const dueP = `${P}-05`;
const duePP = `${PP}-05`;
const sentYmd = `${PP}-26` < today ? `${PP}-26` : today;
const sentAt = new Date(`${sentYmd}T10:00:00+07:00`);

const sum = { created: 0, updated: 0, removed: 0 };

const slipKey = (room: string, period: string) => `${KEY_PREFIX}${room}:${period}`;
const slipPath = (room: string) => `t/${tenantId}/private/svcqc-d13-slip-${room}.jpg`;

async function clearScene() {
  const runs = await prisma.dormBillRun.findMany({ where: { tenantId, unitId, createdById: MARK }, select: { id: true } });
  const runIds = runs.map((r) => r.id);
  const bills = runIds.length ? await prisma.dormBill.findMany({ where: { tenantId, unitId, runId: { in: runIds } }, select: { id: true } }) : [];
  const slips = await prisma.paymentSlip.findMany({ where: { tenantId, unitId, domain: "DORM", refType: "DORM_BILL", fileId: { not: "" } }, select: { id: true, checks: true, fileId: true } });
  const sceneSlips = slips.filter((s) => {
    const k = s.checks && typeof s.checks === "object" && !Array.isArray(s.checks) ? (s.checks as Record<string, unknown>).idempotencyKey : null;
    return typeof k === "string" && k.startsWith(KEY_PREFIX);
  });
  if (sceneSlips.length) {
    await prisma.paymentSlip.deleteMany({ where: { tenantId, id: { in: sceneSlips.map((s) => s.id) } } });
    sum.removed += sceneSlips.length;
  }
  const files = await prisma.fileAsset.deleteMany({ where: { tenantId, path: { startsWith: `t/${tenantId}/private/svcqc-d13-` } } });
  sum.removed += files.count;
  if (bills.length) {
    await prisma.dormBill.deleteMany({ where: { tenantId, id: { in: bills.map((b) => b.id) } } });
    sum.removed += bills.length;
  }
  if (runIds.length) {
    await prisma.dormBillRun.deleteMany({ where: { tenantId, id: { in: runIds } } });
    sum.removed += runIds.length;
  }
  const rooms = await prisma.hotelRoom.findMany({ where: { tenantId, unitId }, select: { id: true, number: true } });
  const roomId = new Map(rooms.map((r) => [r.number, r.id]));
  for (const r of SCN.repairsOpen) {
    const rid = roomId.get(r.room);
    if (!rid) continue;
    const d = await prisma.dormRepair.deleteMany({ where: { tenantId, unitId, roomId: rid, category: r.category, text: r.text, leaseId: null } });
    sum.removed += d.count;
  }
  const cur = await prisma.settingValue.findMany({ where: { tenantId, scope: "UNIT", scopeId: unitId, key: { in: POL.unitDiffs.map((d) => d.key) } }, select: { key: true } });
  for (const k of new Set(cur.map((c) => c.key))) {
    const r = await resetSetting(owner, ctx, { key: k, scope: "UNIT", scopeId: unitId });
    if (!r.ok) throw new Error(`คืนค่าตั้ง ${k}: ${r.issues.map((i) => i.messageTh).join(" · ")}`);
    sum.removed++;
  }
  console.log(`${LABEL}: --clear ลบฉาก (รอบบิล ${runIds.length} · บิล ${bills.length} · สลิป ${sceneSlips.length})\n${ORDER_WARN}`);
}

async function upsertRun(periodKey: string, due: string, billRows: { room: string; total: number; status: "PAID" | "SENT" }[], leaseOf: Map<string, { id: string; roomId: string; partyId: string }>) {
  let run = await prisma.dormBillRun.findFirst({ where: { tenantId, unitId, periodKey }, select: { id: true, status: true, sentAt: true, dueDate: true, issueDate: true, billCount: true, totalSatang: true, createdById: true } });
  const total = billRows.reduce((a, b) => a + b.total, 0);
  const want = { status: "SENT", sentAt, dueDate: dbDate(due), issueDate: dbDate(sentYmd), billCount: billRows.length, totalSatang: total };
  if (!run) {
    run = await prisma.dormBillRun.create({ data: { tenantId, unitId, periodKey, createdById: MARK, ...want }, select: { id: true, status: true, sentAt: true, dueDate: true, issueDate: true, billCount: true, totalSatang: true, createdById: true } });
    sum.created++;
  } else if (
    run.status !== want.status ||
    run.sentAt?.getTime() !== sentAt.getTime() ||
    ymdOf(run.dueDate) !== due ||
    ymdOf(run.issueDate) !== sentYmd ||
    run.billCount !== want.billCount ||
    run.totalSatang !== want.totalSatang
  ) {
    await prisma.dormBillRun.update({ where: { id: run.id }, data: want });
    sum.updated++;
  }
  const existing = await prisma.dormBill.findMany({
    where: { tenantId, unitId, runId: run.id },
    select: { id: true, leaseId: true, roomId: true, partyId: true, status: true, totalSatang: true, paidSatang: true, subtotalSatang: true, dueDate: true },
  });
  const byLease = new Map(existing.map((b) => [b.leaseId, b]));
  const keep = new Set<string>();
  const billIdOf = new Map<string, string>();
  for (const b of billRows) {
    const l = leaseOf.get(b.room);
    if (!l) throw new Error(`ไม่มีสัญญาฉาก D.5 ของห้อง ${b.room}`);
    const paid = b.status === "PAID" ? b.total : 0;
    const data = {
      status: b.status,
      totalSatang: b.total,
      subtotalSatang: b.total,
      paidSatang: paid,
      dueDate: dbDate(due),
      roomId: l.roomId,
      partyId: l.partyId,
      paidAt: b.status === "PAID" ? new Date(`${sentYmd}T12:00:00+07:00`) : null,
      sentAt,
    };
    const cur = byLease.get(l.id);
    if (!cur) {
      const row = await prisma.dormBill.create({ data: { tenantId, unitId, runId: run.id, leaseId: l.id, periodKey, lines: [], ...data }, select: { id: true } });
      billIdOf.set(b.room, row.id);
      keep.add(row.id);
      sum.created++;
      continue;
    }
    keep.add(cur.id);
    billIdOf.set(b.room, cur.id);
    if (cur.status !== data.status || cur.totalSatang !== data.totalSatang || cur.subtotalSatang !== data.subtotalSatang || cur.paidSatang !== paid || ymdOf(cur.dueDate) !== due || cur.roomId !== l.roomId || cur.partyId !== l.partyId) {
      await prisma.dormBill.update({ where: { id: cur.id }, data });
      sum.updated++;
    }
  }
  const extra = existing.filter((b) => !keep.has(b.id)).map((b) => b.id);
  if (extra.length) {
    await prisma.paymentSlip.deleteMany({ where: { tenantId, unitId, refType: "DORM_BILL", refId: { in: extra } } });
    await prisma.dormBill.deleteMany({ where: { tenantId, id: { in: extra } } });
    sum.removed += extra.length;
  }
  return billIdOf;
}

let exitCode = 0;
try {
  if (clear) await clearScene();
  else {
    const leases = await prisma.dormLease.findMany({
      where: { tenantId, unitId, createdById: "SvcQcScene" },
      select: { id: true, roomId: true, partyId: true, status: true },
    });
    if (leases.length < 31) {
      console.error(`🔴 ${LABEL}: สัญญาฉาก D.5 มี ${leases.length} (ต้อง ≥ 31) — รันก่อน: svc-qc-roomboard-scene.mts แล้ว svc-qc-lease-scene.mts`);
      await prisma.$disconnect();
      process.exit(3);
    }
    const foreign = await prisma.dormBillRun.findMany({ where: { tenantId, unitId, periodKey: { in: [P, PP] }, NOT: { createdById: MARK } }, select: { periodKey: true, createdById: true } });
    if (foreign.length) {
      console.error(`🔴 ${LABEL}: มีรอบบิลของคนอื่นที่งวด ${foreign.map((f) => f.periodKey).join(", ")} (createdById ${foreign.map((f) => f.createdById ?? "null").join(", ")}) — เลน D.8 ใช้หน่วยนี้อยู่ ไม่เขียนทับ\n${ORDER_WARN}`);
      await prisma.$disconnect();
      process.exit(3);
    }
    const rooms = await prisma.hotelRoom.findMany({ where: { tenantId, unitId }, select: { id: true, number: true } });
    const numberOf = new Map(rooms.map((r) => [r.id, r.number]));
    const roomIdOf = new Map(rooms.map((r) => [r.number, r.id]));
    const leaseOf = new Map<string, { id: string; roomId: string; partyId: string }>();
    for (const l of leases) if (l.status === "ACTIVE") leaseOf.set(numberOf.get(l.roomId) ?? "", { id: l.id, roomId: l.roomId, partyId: l.partyId });

    // ── รอบบิล P + P−1 ──
    const slipPending = SCN.slipPending as readonly string[];
    const unpaid = SCN.unpaid as readonly string[];
    const cur = Object.entries(SCN.bills).map(([room, total]) => ({ room, total, status: (slipPending.includes(room) || unpaid.includes(room) ? "SENT" : "PAID") as "PAID" | "SENT" }));
    const billP = await upsertRun(P, dueP, cur, leaseOf);
    await upsertRun(PP, duePP, Object.entries(SCN.prevUnpaid).map(([room, total]) => ({ room, total, status: "SENT" as const })), leaseOf);

    // ── สลิปรอตรวจ ──
    for (const room of slipPending) {
      const billId = billP.get(room)!;
      const key = slipKey(room, P);
      const path = slipPath(room);
      let file = await prisma.fileAsset.findFirst({ where: { tenantId, path }, select: { id: true } });
      if (!file) {
        file = await prisma.fileAsset.create({ data: { tenantId, kind: "ATTACHMENT", path, cdnUrl: `private://${path}`, contentType: "image/jpeg", bytes: 0 }, select: { id: true } });
        sum.created++;
      }
      const all = await prisma.paymentSlip.findMany({ where: { tenantId, unitId, domain: "DORM", refType: "DORM_BILL" }, select: { id: true, checks: true, refId: true, status: true, fileId: true, expectedSatang: true } });
      const hit = all.find((s) => s.checks && typeof s.checks === "object" && !Array.isArray(s.checks) && (s.checks as Record<string, unknown>).idempotencyKey === key);
      const amount = SCN.bills[room as keyof typeof SCN.bills] as number;
      const want = { refId: billId, status: "NEEDS_REVIEW", fileId: file.id, expectedSatang: amount };
      if (!hit) {
        await prisma.paymentSlip.create({
          data: {
            tenantId, unitId, domain: "DORM", refType: "DORM_BILL", refId: billId, fileId: file.id,
            imageHash: createHash("sha256").update(key).digest("hex").slice(0, 32),
            expectedSatang: amount, amountSatang: amount, checks: { idempotencyKey: key, scene: MARK }, status: "NEEDS_REVIEW",
          },
        });
        sum.created++;
      } else if (!isDeepStrictEqual({ refId: hit.refId, status: hit.status, fileId: hit.fileId, expectedSatang: hit.expectedSatang }, want)) {
        await prisma.paymentSlip.update({ where: { id: hit.id }, data: want });
        sum.updated++;
      }
    }

    // ── แจ้งซ่อม OPEN ──
    for (const r of SCN.repairsOpen) {
      const rid = roomIdOf.get(r.room);
      if (!rid) throw new Error(`ไม่มีห้อง ${r.room}`);
      const hit = await prisma.dormRepair.findFirst({ where: { tenantId, unitId, roomId: rid, category: r.category, text: r.text, leaseId: null }, select: { id: true, status: true } });
      if (!hit) {
        await prisma.dormRepair.create({ data: { tenantId, unitId, roomId: rid, category: r.category, text: r.text, status: "OPEN" } });
        sum.created++;
      } else if (hit.status !== "OPEN") {
        await prisma.dormRepair.update({ where: { id: hit.id }, data: { status: "OPEN", doneAt: null } });
        sum.updated++;
      }
    }

    // ── ค่าตั้งหน้า 17 (เครื่องยนต์ · ในนามเจ้าของ) ──
    const keys = POL.unitDiffs.map((d) => d.key);
    const before = await resolveSettings(ctx, keys, { unitId });
    if (before[keys[0]]?.templateKey !== POL.template) {
      const r = await applyTemplate(owner, ctx, { unitId, domain: "rooms", templateKey: POL.template, overwrite: "KEEP_CUSTOM" });
      if (!r.ok) throw new Error(`แม่แบบ: ${r.issues.map((i) => i.messageTh).join(" · ")}`);
      sum.updated++;
    }
    const now = await resolveSettings(ctx, keys, { unitId });
    const changes = POL.unitDiffs
      .filter((d) => !(now[d.key]?.source === "UNIT" && isDeepStrictEqual(now[d.key]?.value, d.value)))
      .map((d) => ({ key: d.key, scope: "UNIT", scopeId: unitId, value: d.value as unknown }));
    if (changes.length) {
      const r = await setSettings(owner, ctx, changes);
      if (!r.ok) throw new Error(`ค่าตั้ง 17: ${r.issues.map((i) => i.messageTh).join(" · ")}`);
      sum.updated += changes.length;
    }
    console.log(`${LABEL}: วันนี้ ${today} · งวด ${P} (ครบ ${dueP}) · งวดก่อน ${PP} · ส่ง ${sentYmd}`);
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
