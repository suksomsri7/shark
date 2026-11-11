// svc-qc-report-scene.mts — SVC D.19 · ฉากรายงานหอ (งวดประวัติ 4 งวด) บนร้าน svcqc (ภาพ หอ 14 ส่วนพื้นฐาน)
//
// ใช้ (ต้องมีฉาก D.13 ก่อน — roomboard → lease → billing (D.8) → dorm-home (D.13) → report (D.19)):
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-report-scene.mts            # สร้าง/ปรับฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-report-scene.mts --clear    # ลบเฉพาะรอบ+บิลของฉากนี้
//
// ฉาก (ค่าจาก SQC_DORM_REPORT_SCENE เท่านั้น · ใบสั่ง ledger/svc-briefs/svc-brief-d.19.md §7):
//   • เดือนนี้ไทย M · งวดประวัติ = M + historyOffsets (−5 … −2) — ไม่ชน PP = M−1 (D.13) · M (D.8) · P = M+1 (D.13)
//   • ต่องวด: DormBillRun (SENT · createdById = mark) + DormBill ต่อสัญญา ACTIVE ของหน่วยที่ startDate ≤ วันสุดท้ายของงวด
//     lines = สำเนาบรรทัดของบิลงวด P ของสัญญานั้น (ไม่มี/ว่าง ⇒ RENT + COMMON จากสัญญา · net = gross = amount · EXEMPT/NONE)
//     ยอดรวมจากบรรทัด · PAID · paidSatang = total · paidAt = วันที่ paidDay ของงวด 12:00 ไทย · dueDate = วันที่ dueDay · ไม่มีเอกสารบัญชี
//   • ไม่เขียน SettingValue/OutboxEvent/ServiceMessageLog/AccountDocument · ไม่แตะรอบ/บิลของฉากอื่น
//   • รอบของ mark นี้ที่งวดอื่น (ค้างจากเดือนก่อน) ⇒ ลบ (เฉพาะ mark นี้)
// มีรอบของคนอื่นที่งวดประวัติ ⇒ exit 3 (ไม่เขียนทับ) · ไม่มีฉาก D.13 ⇒ exit 3
// idempotent: อ่านเทียบก่อน ต่างเท่านั้นถึงเขียน · รันซ้ำ = SCENE_SUMMARY 0/0/0
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { isDeepStrictEqual } from "node:util";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_DORM_REPORT_SCENE as SCN, SQC_DORM_HOME_SCENE as HOME } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-report-scene";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`${LABEL}: สร้างงวดประวัติของรายงานหอบนร้าน svcqc · --clear ลบเฉพาะรอบ+บิลของ ${SCN.mark}`);
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

const MARK = SCN.mark;
const tenantId = SQC.tenant.id;
const unitId = SQC.units.dorm.id;
const sum = { created: 0, updated: 0, removed: 0 };

const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const shift = (period: string, n: number) => {
  const m = Number(period.slice(5, 7)) - 1 + n;
  const y = Number(period.slice(0, 4)) + Math.floor(m / 12);
  return `${y}-${String((((m % 12) + 12) % 12) + 1).padStart(2, "0")}`;
};
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const lastDay = (period: string) => new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
const dd = (n: number) => String(n).padStart(2, "0");
const M = today.slice(0, 7);
const P = shift(M, 1);
const HIST = SCN.historyOffsets.map((o) => shift(M, o));

type Line = { code: string; labelTh: string; qty: number; unitPriceSatang: number | null; amountSatang: number; taxKind: string; netSatang: number; vatSatang: number; grossSatang: number };
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const asLines = (v: unknown): Line[] =>
  Array.isArray(v)
    ? v.filter(isRec).map((l) => ({
        code: String(l.code ?? "OTHER"),
        labelTh: String(l.labelTh ?? ""),
        qty: typeof l.qty === "number" ? l.qty : 1,
        unitPriceSatang: typeof l.unitPriceSatang === "number" ? l.unitPriceSatang : null,
        amountSatang: Number(l.amountSatang ?? 0),
        taxKind: String(l.taxKind ?? "NONE"),
        netSatang: Number(l.netSatang ?? 0),
        vatSatang: Number(l.vatSatang ?? 0),
        grossSatang: Number(l.grossSatang ?? 0),
      }))
    : [];
const fromLease = (rent: number, common: number): Line[] => {
  const out: Line[] = [{ code: "RENT", labelTh: "ค่าเช่าห้อง", qty: 1, unitPriceSatang: rent, amountSatang: rent, taxKind: "EXEMPT", netSatang: rent, vatSatang: 0, grossSatang: rent }];
  if (common > 0) out.push({ code: "COMMON", labelTh: "ค่าส่วนกลาง", qty: 1, unitPriceSatang: common, amountSatang: common, taxKind: "NONE", netSatang: common, vatSatang: 0, grossSatang: common });
  return out;
};

async function removeRuns(runIds: string[]) {
  if (!runIds.length) return;
  sum.removed += (await prisma.dormBill.deleteMany({ where: { tenantId, unitId, runId: { in: runIds } } })).count;
  sum.removed += (await prisma.dormBillRun.deleteMany({ where: { tenantId, unitId, id: { in: runIds }, createdById: MARK } })).count;
}

let exitCode = 0;
try {
  if (clear) {
    const runs = await prisma.dormBillRun.findMany({ where: { tenantId, unitId, createdById: MARK }, select: { id: true } });
    await removeRuns(runs.map((r) => r.id));
    console.log(`${LABEL}: --clear ลบรอบของฉาก ${runs.length} รอบ`);
  } else {
    const unit = await prisma.businessUnit.findFirst({ where: { tenantId, id: unitId, type: "DORM" }, select: { id: true } });
    const leases = unit
      ? await prisma.dormLease.findMany({ where: { tenantId, unitId, status: "ACTIVE" }, select: { id: true, roomId: true, partyId: true, startDate: true, rentSatang: true, commonFeeSatang: true }, orderBy: { id: "asc" } })
      : [];
    const homeRuns = unit ? await prisma.dormBillRun.count({ where: { tenantId, unitId, createdById: HOME.mark } }) : 0;
    if (!unit || !leases.length || !homeRuns) {
      console.error(`🔴 ${LABEL}: ร้าน svcqc ยังไม่มีฉาก D.13 (หน่วยหอ ${unit ? "มี" : "ไม่มี"} · สัญญา ACTIVE ${leases.length} · รอบฉาก D.13 ${homeRuns}) — รัน roomboard → lease → billing → dorm-home ก่อน`);
      await prisma.$disconnect();
      process.exit(3);
    }
    const foreign = await prisma.dormBillRun.findMany({ where: { tenantId, unitId, periodKey: { in: HIST }, NOT: { createdById: MARK } }, select: { periodKey: true, createdById: true } });
    if (foreign.length) {
      console.error(`🔴 ${LABEL}: มีรอบบิลของคนอื่นที่งวด ${foreign.map((f) => `${f.periodKey}(${f.createdById ?? "null"})`).join(", ")} — ไม่เขียนทับ`);
      await prisma.$disconnect();
      process.exit(3);
    }
    // รอบของฉากนี้ที่งวดอื่น (เดือนก่อน) ⇒ ลบ
    const stale = await prisma.dormBillRun.findMany({ where: { tenantId, unitId, createdById: MARK, periodKey: { notIn: HIST } }, select: { id: true } });
    await removeRuns(stale.map((r) => r.id));

    // บรรทัดต้นแบบ = บิลงวด P ของสัญญา (ฉาก D.13) · ไม่มี/ว่าง ⇒ ค่าเช่า + ส่วนกลางจากสัญญา
    const pBills = await prisma.dormBill.findMany({ where: { tenantId, unitId, periodKey: P, leaseId: { in: leases.map((l) => l.id) } }, select: { leaseId: true, lines: true } });
    const pLines = new Map(pBills.map((b) => [b.leaseId, asLines(b.lines)]));
    const linesOf = (l: (typeof leases)[number]) => {
      const x = pLines.get(l.id);
      return x && x.length ? x : fromLease(l.rentSatang, l.commonFeeSatang);
    };

    for (const period of HIST) {
      const due = `${period}-${dd(SCN.dueDay)}`;
      const paidAt = new Date(`${period}-${dd(SCN.paidDay)}T12:00:00+07:00`);
      const issue = `${shift(period, -1)}-26`;
      const sentAt = new Date(`${issue}T10:00:00+07:00`);
      const want = leases
        .filter((l) => ymdOf(l.startDate) <= lastDay(period))
        .map((l) => {
          const lines = linesOf(l);
          const subtotal = lines.reduce((a, x) => a + x.netSatang, 0);
          const vat = lines.reduce((a, x) => a + x.vatSatang, 0);
          const total = lines.reduce((a, x) => a + x.grossSatang, 0);
          return { l, lines, subtotal, vat, total };
        });
      const runTotal = want.reduce((a, w) => a + w.total, 0);
      const runWant = { status: "SENT", issueDate: dbDate(issue), dueDate: dbDate(due), sentAt, billCount: want.length, totalSatang: runTotal };
      let run = await prisma.dormBillRun.findFirst({ where: { tenantId, unitId, periodKey: period, createdById: MARK }, select: { id: true, status: true, issueDate: true, dueDate: true, sentAt: true, billCount: true, totalSatang: true } });
      if (!run) {
        run = await prisma.dormBillRun.create({ data: { tenantId, unitId, periodKey: period, createdById: MARK, ...runWant }, select: { id: true, status: true, issueDate: true, dueDate: true, sentAt: true, billCount: true, totalSatang: true } });
        sum.created++;
      } else if (
        run.status !== runWant.status || ymdOf(run.issueDate) !== issue || ymdOf(run.dueDate) !== due || run.sentAt?.getTime() !== sentAt.getTime() ||
        run.billCount !== runWant.billCount || run.totalSatang !== runWant.totalSatang
      ) {
        await prisma.dormBillRun.update({ where: { id: run.id }, data: runWant });
        sum.updated++;
      }
      const existing = await prisma.dormBill.findMany({
        where: { tenantId, unitId, runId: run.id },
        select: { id: true, leaseId: true, roomId: true, partyId: true, status: true, lines: true, subtotalSatang: true, vatSatang: true, totalSatang: true, paidSatang: true, dueDate: true, paidAt: true, sentAt: true, accountDocumentId: true },
      });
      const byLease = new Map(existing.map((b) => [b.leaseId, b]));
      const keep = new Set<string>();
      for (const w of want) {
        const data = {
          roomId: w.l.roomId, partyId: w.l.partyId, status: "PAID", lines: w.lines, subtotalSatang: w.subtotal, vatSatang: w.vat, totalSatang: w.total,
          paidSatang: w.total, dueDate: dbDate(due), paidAt, sentAt, accountDocumentId: null,
        };
        const cur = byLease.get(w.l.id);
        if (!cur) {
          const row = await prisma.dormBill.create({ data: { tenantId, unitId, runId: run.id, leaseId: w.l.id, periodKey: period, ...data }, select: { id: true } });
          keep.add(row.id);
          sum.created++;
          continue;
        }
        keep.add(cur.id);
        const same =
          cur.roomId === data.roomId && cur.partyId === data.partyId && cur.status === data.status && isDeepStrictEqual(asLines(cur.lines), w.lines) &&
          cur.subtotalSatang === data.subtotalSatang && cur.vatSatang === data.vatSatang && cur.totalSatang === data.totalSatang && cur.paidSatang === data.paidSatang &&
          ymdOf(cur.dueDate) === due && cur.paidAt?.getTime() === paidAt.getTime() && cur.sentAt?.getTime() === sentAt.getTime() && cur.accountDocumentId === null;
        if (!same) {
          await prisma.dormBill.update({ where: { id: cur.id }, data });
          sum.updated++;
        }
      }
      const extra = existing.filter((b) => !keep.has(b.id)).map((b) => b.id);
      if (extra.length) sum.removed += (await prisma.dormBill.deleteMany({ where: { tenantId, unitId, id: { in: extra } } })).count;
    }
    console.log(`${LABEL}: วันนี้ ${today} · งวดประวัติ ${HIST.join(" ")} · สัญญา ACTIVE ${leases.length} · ต้นแบบบรรทัดจากงวด ${P}`);
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
