// QC — HR V2 H0.2 · ความถูกต้องของรอบจ่ายเงินเดือน (D1 · D5 · D6 · D12) — oracle (ผู้เขียนข้อสอบ · ห้ามแก้โค้ดสินค้า)
// requires: hr + account systems (สร้างเองในร้านชั่วคราว) · H0.1 (deleteDraftRun · recomputeDraftRun · approveRun(ctx, runId, expect))
// สัญญา: ledger/hr-briefs/hr-brief-H0.2.md (R1–R5 + "Oracle writer additions (7 Oct)") · ledger/wo-notes/hr-H0.2-oracle.md
//
// [S1] D1 ใครอยู่ในรอบ (งวด 2026-08 = 2026-08-01 … 2026-08-31 ตามปฏิทินกรุงเทพ):
//      startDate ≤ lastDay · endDate ≥ firstDay · (active OR endDate ไม่ว่าง) — คนที่ถูกลบโดยไม่มีวันสิ้นสุด = ไม่จ่าย + รายงาน
//      เข้า/ออกกลางเดือน = จ่ายเต็มเดือนตามเดิม + snapshot.flags ["PARTIAL_MONTH"] · runExclusions(ctx, periodKey) · รายการของคนที่ถูกตัด = ไม่ผูก
// [S2] D5 งวดที่มีรอบแล้ว (ทุกสถานะ) — ทางยื่นปกติปฏิเสธ PERIOD_CLOSED ข้อความเดียวกับทาง CRM · อนุมัติแถวปกติที่งวดมีรอบแล้ว = ย้ายไปงวดถัดไปที่ว่าง ·
//      strandedAdjustments(ctx) = รายการค้าง (ปกติ + CRM) · strandedCommissionAdjustments ผลเหมือนเดิม
// [S3] D6 สุทธิติดลบ — computeItem เดิม (−8,300 สตางค์) · flag NEGATIVE_NET · approveRun ปฏิเสธด้วยข้อความไทยตายตัว · ไม่มี JV ·
//      แก้รายการหัก → คำนวณใหม่ → อนุมัติได้ (Dr = Cr) · รอบผสม (ยอดรวมบวก) ก็ต้องปฏิเสธ
// [S4] D12 งวด/วันจ่ายปลอม — 2026-13 · 2026-00 · 2026-1 · "  " · วันจ่ายไม่ถูกต้อง → ปฏิเสธ ไม่มีแถว · action คืน { ok:false, reason }
// [S5] static — computeItem + payroll-rules.ts ไม่เปลี่ยน (hash) · strandedCommissionAdjustments ไม่เปลี่ยน · หน้าเงินเดือนกันผู้ไม่ดูเงินเดือนก่อนอ่าน
// [X6] แข่งข้าม process (connection แยก) 10 เลน × 3 รอบ: approve ∥ recompute ของรอบ NEGATIVE_NET · decide(APPROVED) ∥ createPayrollRun
// [S9/X9] Oracle round 2 (8 Oct · brief §9): CR-H0.2-3 รายการที่มี crmCommissionId ลบจาก HR ไม่ได้ (ทุกสถานะ · มี/ไม่มี actor) + หน้าเงินเดือนซ่อนปุ่มลบ ·
//      CR-H0.2-4 payDate อยู่ใน [วันแรก − 31 วัน, วันสุดท้าย + 62 วัน] · X9 CRM withdraw ∥ คำนวณใหม่ ∥ approve(expect สด)
//
// รัน (VPS · QC4 เท่านั้น):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-hr-h0.2.mts            → SKIP (exit 0) ถ้าของ H0.2/H0.1 ยังไม่มี
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h0.2.mts → แดงตามเหตุผล ไม่ crash
//   --list = พิมพ์ทุก id ไม่แตะ DB · --hashes = พิมพ์ hash ของ S5 ไม่แตะ DB
// DB: ร้านชั่วคราว slug qc-hr-h0.2-<rand> (+ ร้านอื่น qc-hr-h0.2-<rand>-x) · ลบทั้งหมดใน finally · Z1 ตรวจไม่เหลือแถวทุกตารางที่มี tenantId
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";

const SUITE = "qc-hr-h0.2";
const ROOT = process.cwd();
const THIS_FILE = fileURLToPath(import.meta.url);
const FORCE = process.env.QC_FORCE === "1";
const QC4_HOST_MARK = "ep-frosty-lab";
const THAI = /[฀-๿]/;

// ═════════════════════════ ทะเบียนข้อสอบ ═════════════════════════
const CHECKS: readonly (readonly [string, string])[] = [
  ["S1.1", "D1 · พนักงาน active ไม่มีวันเริ่ม/สิ้นสุด → อยู่ในรอบ · ไม่มี flag (guard)"],
  ["S1.2", "D1 · endDate 2026-07-31 (ยัง active) → ไม่อยู่ในรอบ 2026-08"],
  ["S1.3", "D1 · endDate 2026-08-15 + active=false → อยู่ในรอบ · flags มี PARTIAL_MONTH · ยอดเต็มเดือน (ไม่คิดสัดส่วน)"],
  ["S1.4", "D1 · endDate 2026-08-31 + active=false → อยู่ในรอบ · ไม่มี PARTIAL_MONTH"],
  ["S1.5", "D1 · startDate 2026-09-01 → ไม่อยู่ในรอบ 2026-08"],
  ["S1.6", "D1 · startDate 2026-08-20 → อยู่ในรอบ · flags มี PARTIAL_MONTH · ยอดเต็มเดือน"],
  ["S1.7", "D1 · active=false ไม่มี endDate → ไม่อยู่ในรอบ"],
  ["S1.8", "D1 · startDate 2026-08-01 (วันแรกของงวด) → อยู่ในรอบ · ไม่มี PARTIAL_MONTH"],
  ["S1.9", "D1 · รายการ APPROVED ของคนที่ถูกตัด (endDate ก่อนงวด) runId = null + สถานะเดิม · ของคนในรอบถูกผูก (positive control)"],
  ["S1.10", "D1 · runExclusions(ctx, 2026-08) = 3 คนพอดี {ENDED_BEFORE · STARTS_AFTER · REMOVED_NO_END_DATE} + ชื่อ"],
  ["S1.11", "D1 · runExclusions ของร้านอื่น / ระบบ HR อื่น ไม่เห็นคนของระบบนี้ (X1)"],
  ["S1.12", "X4 · ยอดรวมของรอบ = Σ รายการ (ทุกช่อง) · 5 รายการ"],
  ["S1.13", "D1 · recomputeDraftRun (H0.1) → สมาชิกและ flags เดิม · รายการของคนที่ถูกตัดยังไม่ผูก"],
  ["S2.1", "D5 · ยื่นทางปกติเข้างวดที่มีรอบ DRAFT → code PERIOD_CLOSED + ข้อความเดียวกับทาง CRM · ไม่มีแถวใหม่"],
  ["S2.2", "D5 · ยื่นทางปกติเข้างวดที่มีรอบ APPROVED → PERIOD_CLOSED · ไม่มีแถวใหม่"],
  ["S2.3", "D5 · ยื่นทางปกติเข้างวดที่มีรอบ PAID → PERIOD_CLOSED · ไม่มีแถวใหม่"],
  ["S2.4", "D5 · ทาง CRM เข้างวดที่มีรอบ → PERIOD_CLOSED ข้อความเดิม (guard · ข้อความอ้างอิง)"],
  ["S2.5", "D5 · ยื่นทางปกติเข้างวดที่ยังไม่มีรอบ → ok · PENDING (guard)"],
  ["S2.6", "D5 · strandedAdjustments(ctx) = รายการค้างของ fixture พอดี (ปกติ PENDING ×2 + CRM ×1)"],
  ["S2.7", "R5 · strandedCommissionAdjustments(tenantId) = [แถว CRM] ทุกช่อง/ลำดับช่องเดิม · ไม่มีแถวปกติ (guard)"],
  ["S2.8", "D5 · อนุมัติแถวปกติ PENDING ที่งวดมีรอบแล้ว → ok · movedFrom 2026-09 · movedTo 2026-12 · แถวอยู่งวด 2026-12"],
  ["S2.9", "D5 · รอบ 2026-12 ดึงแถวที่ย้ายมา (runId + addSatang ของพนักงาน)"],
  ["S2.10", "D5 · หลังย้าย strandedAdjustments เหลือแต่แถว CRM"],
  ["S2.11", "R5 · อนุมัติแถว CRM ที่ค้าง → ย้ายไป 2027-01 เหมือนเดิม (regression guard)"],
  ["S2.12", "D5 · ปฏิเสธ (REJECTED) แถวปกติที่ค้าง → ไม่ย้ายงวด (guard)"],
  ["S3.1", "D6 · computeItem เดิม: ssoEligible ฐาน 1,000 บาท + ADVANCE 5,000 → gross 0 · ปสส. 8,300 · net −8,300 สตางค์ (guard)"],
  ["S3.2", "D6 · รายการติดลบมี flags NEGATIVE_NET · รายการบวกไม่มี"],
  ["S3.3", "D6 · approveRun(expect ถูก) ปฏิเสธด้วยข้อความ N=1 ตายตัว · ยัง DRAFT · ไม่มี JV"],
  ["S3.4", "D6 · ลบรายการหัก (fixture) → recomputeDraftRun → net ≥ 0 · ไม่มี NEGATIVE_NET · ยอดรวม = Σ"],
  ["S3.5", "D6 · อนุมัติหลังคำนวณใหม่ → APPROVED · JV Dr = Cr · Cr ธนาคาร = ยอดสุทธิรวม"],
  ["S3.6", "D6 · รอบผสม (ติดลบ 2 คน · ยอดรวมบวก) approveRun ไม่ส่ง expect → ปฏิเสธข้อความ N=2 · DRAFT · ไม่มี JV"],
  ["S3.7", "D6 · ทางของสินค้า: deleteDraftRun → cancelAdjustment → createPayrollRun → approve ok · Dr = Cr"],
  ["S3.8", "R5 · RN-10 เดิม: ssoEligible:false หักเกิน → gross 0 · net 0 · ไม่มี NEGATIVE_NET (guard)"],
  ["S4.1", "D12 · createPayrollRun 2026-13 → throw ไทย · ไม่มีแถว"],
  ["S4.2", "D12 · createPayrollRun 2026-00 → throw ไทย · ไม่มีแถว"],
  ["S4.3", "D12 · createPayrollRun 2026-1 → throw ไทย · ไม่มีแถว"],
  ["S4.4", "D12 · createPayrollRun \"  \" → throw ไทย · ไม่มีแถว"],
  ["S4.5", "D12 · createPayrollRun payDate = Invalid Date → throw ไทย · ไม่มีแถว"],
  ["S4.6", "D12 · createPayrollRunAction 2027-13 → { ok:false, reason ไทย } · ไม่มีแถว"],
  ["S4.7", "D12 · createPayrollRunAction payDate 2026-02-31 / abc → { ok:false, reason ไทย } · ไม่มีแถว"],
  ["S4.8", "D12 · createPayrollRunAction ถูกต้อง → { ok:true } + แถว · ซ้ำงวดเดิม → { ok:false, reason ไทย } (ไม่ throw)"],
  ["S5.1", "R5 · computeItem (ตัวฟังก์ชัน) hash เท่าฐาน"],
  ["S5.2", "R5 · payroll-rules.ts hash เท่าฐาน (FREEZE)"],
  ["S5.3", "R5 · strandedCommissionAdjustments ลายเซ็น + ตัวฟังก์ชัน hash เท่าฐาน"],
  ["S5.4", "privacy · PayrollSection กันผู้ไม่ดูเงินเดือน (return) ก่อนอ่านรอบ/รายการ/ผู้ถูกตัด · ทางนั้นไม่มีข้อความ flag (guard)"],
  ["S5.5", "R1–R3 UI · หน้าเงินเดือนเรียก runExclusions + strandedAdjustments หลังด่าน · มีข้อความ PARTIAL_MONTH + NEGATIVE_NET"],
  ["S5.6", "R4 · createPayrollRunAction ไม่ใช้ /^\\d{4}-\\d{2}$/ · ใช้ PERIOD_RE · คืนผล { ok, reason }"],
  ["X6.1", "race · approve ∥ recompute ของรอบ NEGATIVE_NET (10 เลน × 3 รอบ) → ไม่มีรอบไหน APPROVED · ไม่มี JV · ยังมีรายการติดลบ · ADVANCE ผูก 1 ครั้ง"],
  ["X6.2", "race · ผล approve ทุกเลน = ปฏิเสธข้อความไทย (ไม่ throw) · recompute ทุกเลน = ok หรือคำปฏิเสธไทย"],
  ["X6.3", "race · decide(APPROVED) ∥ createPayrollRun (10 เลน × 3 รอบ) → ทุกแถวอยู่ในรอบ หรือถูกย้าย หรืออยู่ใน strandedAdjustments · addSatang = Σ แถวที่ผูก"],
  ["X6.4", "race · รอบเดียวต่องวด · create ที่แพ้ = ข้อความไทยซ้ำงวด · decide ทุกเลน ok"],
  // ── Oracle round 2 (8 Oct · hunter findings · brief §9 CR-H0.2-3 / CR-H0.2-4) ──
  ["S9.1", "CR-H0.2-3 · รายการ COMMISSION จาก CRM ที่ยังไม่เข้ารอบ (APPROVED + PENDING): cancelAdjustment มี/ไม่มี actor → ok:false ข้อความ CRM ตายตัว · แถวยังอยู่ · CrmCommission.hrPayAdjustmentId เดิม"],
  ["S9.2", "CR-H0.2-3 · รายการ COMMISSION จาก CRM ที่ผูกรอบร่าง: ลบทั้งสองทาง → ข้อความ CRM · ยอดรวม/ลายนิ้วมือเดิม · Σ รายการ = ยอดรวม · ไม่มี audit hr.payadjust.delete"],
  ["S9.3", "CR-H0.2-3 · รายการหักคืน (DEDUCTION ของแถวถอนคืน CRM) ผูกรอบร่าง: ลบถูกปฏิเสธ · ทาง CRM (withdraw) เดิม: ผูกอยู่ = false · ลบร่างแล้ว = true · Σ = ยอดรวมทุกขั้น"],
  ["S9.4", "CR-H0.2-3 (source) · หน้าเงินเดือนแสดงปุ่มลบรายการเฉพาะแถวที่ไม่มี crmCommissionId"],
  ["S9.5", "CR-H0.2-4 · payDate ต้องอยู่ใน [วันแรกของงวด − 31 วัน, วันสุดท้าย + 62 วัน]: ในช่วง ok ×3 · 1970-01-01 / 9999-12-31 / งวด+3 เดือน → PayrollInputError ข้อความตายตัว · action คืน reason ตรง · ไม่มีแถว"],
  ["X9.1", "race · CRM withdraw ∥ คำนวณร่างใหม่ ∥ approve (expect สด) ×3 รอบ → ไม่มี JV ของรอบที่แถวเปลี่ยนใต้มือ · คอมมิชชันไม่ถูกนับซ้ำ · Σ = ยอดรวม"],
  ["Z1", "คืนสภาพ: ไม่เหลือแถวของร้านชั่วคราวในทุกตารางที่มี tenantId · ไม่เหลือ tenant/user ชั่วคราว"],
];
const ID = (k: string) => `H0.2-${k}`;

if (process.argv.includes("--list")) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ`);
  for (const [k, t] of CHECKS) console.log(`${ID(k)}\t${t}`);
  process.exit(0);
}

// ═════════════════════════ static helpers (S5) ═════════════════════════
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** ตัวฟังก์ชันจากหัว `head` ถึง `\n}\n` แรก (ปิดที่คอลัมน์ 0) */
function fnRegion(src: string, head: string): string {
  const i = src.indexOf(head);
  if (i < 0) return "";
  const j = src.indexOf("\n}\n", i);
  return j < 0 ? "" : src.slice(i, j + 3);
}
const PAYROLL = "src/lib/modules/hr/payroll.ts";
const RULES = "src/lib/modules/hr/payroll-rules.ts";
const UI = "src/lib/modules/hr/payroll-ui.tsx";
const ACTIONS = "src/lib/modules/hr/payroll-actions.ts";
const SIG_STRANDED = "export async function strandedCommissionAdjustments(tenantId: string, limit = 100): Promise<CommissionAdjustmentRef[]> {";
// hash ของฐาน f85f5455 (= afcb9bc3 สำหรับไฟล์เหล่านี้) — คำนวณด้วย --hashes
const BASE_HASH = {
  computeItem: "b151a83c16eb96cb9adca8d5ed8b622612ebc50c39ad729f6f7966c43a47cd13",
  rules: "75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7",
  stranded: "6c6332f004f79ab22c42ebfd28492bfbd79c7e502fd51de56dda198fa64a7698",
};
function staticHashes() {
  const p = rd(PAYROLL);
  return {
    computeItem: sha(fnRegion(p, "function computeItem(")),
    rules: sha(rd(RULES)),
    stranded: sha(fnRegion(p, "export async function strandedCommissionAdjustments(")),
  };
}
if (process.argv.includes("--hashes")) {
  console.log(JSON.stringify(staticHashes(), null, 2));
  process.exit(0);
}

// ═════════════════════════ env (QC4 เท่านั้น) ═════════════════════════
process.env.QC_ENV_FILE ??= ".env.qc";
if (process.env.QC_ENV_FILE === ".env") {
  console.error(`🔴 ${SUITE}: QC_ENV_FILE=.env คือ production — ห้าม`);
  process.exit(4);
}
const { loadLegacyQcEnv } = (await import("./qc-env-guard.mjs" as string)) as Any;
loadLegacyQcEnv(SUITE);
{
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u.includes(QC4_HOST_MARK));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: เขียนได้เฉพาะ QC4 (${QC4_HOST_MARK}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// Next อ่าน globalThis.AsyncLocalStorage ตอนโหลดโมดูล ⇒ ต้องตั้งก่อน import ใด ๆ ที่ลากโมดูลของ next มา (account facade → next/cache)
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const pay = (await import("@/lib/modules/hr/payroll" as string)) as Any;
const fnOf = (name: string): ((...a: Any[]) => Promise<Any>) | null => (typeof pay?.[name] === "function" ? pay[name] : null);
const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ═════════════════════════ worker (X6 — process + pool ของตัวเอง) ═════════════════════════
if (process.argv[2] === "--x6-worker") {
  const arg = JSON.parse(Buffer.from(String(process.argv[3]), "base64").toString("utf8")) as Any;
  await P.$queryRaw`SELECT 1`;
  const late = Date.now() > Number(arg.startAt);
  const out: string[] = [];
  const one = async (c: Any): Promise<string> => {
    if (Number(c.delayMs) > 0) await new Promise((r) => setTimeout(r, Number(c.delayMs))); // Oracle round 2 (X9.1): ลำดับต่างกันต่อรอบ · X6 ไม่ส่ง
    try {
      if (c.fn === "approve") {
        const r = c.expect ? await pay.approveRun(c.ctx, c.runId, c.expect) : await pay.approveRun(c.ctx, c.runId);
        return `${c.tag}:${r?.ok ? "OK" : "NO"}:${String(r?.note ?? r?.reason ?? "")}`;
      }
      if (c.fn === "recompute") {
        const f = fnOf("recomputeDraftRun");
        if (!f) return `${c.tag}:MISSING:recomputeDraftRun`;
        const r = await f(c.ctx, c.runId, c.actor);
        return `${c.tag}:${r?.ok === false ? "NO" : "OK"}:${String(r?.reason ?? r?.note ?? "")}`;
      }
      if (c.fn === "decide") {
        const r = await pay.decideAdjustment(c.ctx, c.id, "APPROVED", c.decider);
        return `${c.tag}:${r?.ok ? "OK" : "NO"}:${String(r?.reason ?? "")}`;
      }
      if (c.fn === "create") {
        const r = await pay.createPayrollRun(c.ctx, { periodKey: c.periodKey, payDate: new Date(c.payDate) });
        return `${c.tag}:OK:${String(r?.id ?? "")}`;
      }
      // Oracle round 2 (X9.1): ทาง CRM ถอนรายการคอมมิชชัน (hr facade · ไม่ส่ง tx)
      if (c.fn === "withdraw") {
        const r = await pay.withdrawCommissionAdjustment(c.ctx, { adjustmentId: c.id, crmCommissionId: c.cid, statuses: ["PENDING", "APPROVED"] });
        return `${c.tag}:${r === true ? "TRUE" : r === false ? "FALSE" : `BAD(${String(r)})`}:`;
      }
      return `${c.tag}:BAD:${c.fn}`;
    } catch (e) {
      return `${c.tag}:THROW:${msgOf(e).replace(/\s+/g, " ").slice(0, 160)}`;
    }
  };
  for (const round of arg.rounds as Any[]) {
    const at = Number(arg.startAt) + Number(round.atMs);
    while (Date.now() < at) await new Promise((r) => setTimeout(r, 2));
    out.push(...(await Promise.all((round.calls as Any[]).map(one))));
  }
  console.log("X6_RESULT " + JSON.stringify({ out, late }));
  await P.$disconnect();
  process.exit(0);
}

// ═════════════════════════ SKIP guard ═════════════════════════
const skipReasons: string[] = [];
for (const n of ["runExclusions", "strandedAdjustments"]) if (!fnOf(n)) skipReasons.push(`payroll.ts ยังไม่มี ${n} (H0.2)`);
for (const n of ["recomputeDraftRun", "deleteDraftRun"]) if (!fnOf(n)) skipReasons.push(`payroll.ts ยังไม่มี ${n} (H0.1 — ต้องมาก่อน H0.2)`);
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของ H0.2/H0.1 ยังไม่มี`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect();
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash)`);

// ═════════════════════════ ตัวช่วย ═════════════════════════
const TITLE = new Map(CHECKS.map(([k, t]) => [ID(k), t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
const short = (v: unknown, n = 220) => {
  try {
    return (typeof v === "string" ? v : JSON.stringify(v) ?? "undefined").slice(0, n);
  } catch {
    return String(v).slice(0, n);
  }
};
function chk(k: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const id = ID(k);
  if (!TITLE.has(id)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${id}`);
  const r = { ok: !!ok, expected: short(expected, 300), actual: short(actual, 400) };
  results.set(id, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${id}] ${TITLE.get(id)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const B = (baht: number) => Math.round(baht * 100);
const flagsOf = (item: Any): string[] => {
  const f = (item?.snapshotJson ?? {})?.flags;
  return Array.isArray(f) ? f.map(String) : [];
};
const NEG_MSG = (n: number) => `มีพนักงาน ${n} คนที่ยอดสุทธิติดลบ (รายการหักมากกว่าเงินได้) — แก้รายการหักแล้วกด 'คำนวณใหม่'`;
const CLOSED_MSG = (p: string) => `งวด ${p} มีรอบจ่ายเงินเดือนแล้ว — ยื่นเข้างวดถัดไปแทน`;
const errOf = async (f: () => Promise<unknown>): Promise<string | null> => {
  try {
    await f();
    return null;
  } catch (e) {
    return msgOf(e);
  }
};
const TOTAL_PAIRS: [string, string][] = [
  ["totalGrossSatang", "grossSatang"],
  ["totalSsoEmployeeSatang", "ssoEmployeeSatang"],
  ["totalSsoEmployerSatang", "ssoEmployerSatang"],
  ["totalWhtSatang", "whtSatang"],
  ["totalNetSatang", "netSatang"],
  ["totalAddSatang", "addSatang"],
  ["totalDeductSatang", "deductSatang"],
];
async function runAndItems(runId: string): Promise<{ run: Any; items: Any[]; sumOk: boolean; diff: string[] }> {
  const run = await P.hrPayrollRun.findUnique({ where: { id: runId } });
  const items = (await P.hrPayrollItem.findMany({ where: { runId }, orderBy: { id: "asc" } })) as Any[];
  const diff = TOTAL_PAIRS.filter(([t, i]) => (run?.[t] ?? NaN) !== items.reduce((s, x) => s + Number(x[i] ?? 0), 0)).map(([t]) => t);
  return { run, items, sumOk: !!run && diff.length === 0, diff };
}
async function jvBalance(entryId: string | null | undefined): Promise<{ dr: number; cr: number; lines: number }> {
  if (!entryId) return { dr: -1, cr: -2, lines: 0 };
  const jl = (await P.accountJournalLine.findMany({ where: { entryId } })) as Any[];
  return { dr: jl.reduce((s, l) => s + Number(l.debit), 0), cr: jl.reduce((s, l) => s + Number(l.credit), 0), lines: jl.length };
}

// ── Next request scope (เทคนิคเดียวกับ qc-hf-o23 / qc-crm-c3.5) — ให้ requireTenant() อ่านคุกกี้ได้ในโปรเซส ──
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("ไม่มี Next request scope (next/dist/... โหลดไม่ได้)");
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": SUITE, "x-forwarded-for": "203.0.113.124" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

// ═════════════════════════ fixture ═════════════════════════
const RAND = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SLUG = `qc-hr-h0.2-${RAND}`;
const tenants: string[] = [];
const users: string[] = [];
const sys = (await import("@/lib/modules/system/service" as string)) as Any;
const hr = (await import("@/lib/modules/hr/service" as string)) as Any;

let tid = "";
let ownerId = "";
let cookie = "";
const OWNER = () => ({ userId: ownerId, isOwner: true });
async function mkEmp(ctx: Any, name: string, baseBaht: number, o: { start?: string; end?: string; active?: boolean; sso?: boolean } = {}): Promise<string> {
  const e = await hr.createEmployee(ctx, { name });
  const data: Any = {};
  if (o.start) data.startDate = D(o.start);
  if (o.end) data.endDate = D(o.end);
  if (o.active === false) data.active = false;
  if (Object.keys(data).length) await P.hrEmployee.update({ where: { id: e.id }, data }); // fixture ตรง: สินค้าไม่มีตัวเขียน endDate/active ในทางนี้
  await pay.setSalaryProfile(ctx, { employeeId: e.id, baseSalarySatang: B(baseBaht), ssoEligible: o.sso ?? true });
  return e.id as string;
}
async function approvedAdj(ctx: Any, employeeId: string, periodKey: string, kind: string, baht: number): Promise<string> {
  const r = await pay.requestAdjustment(ctx, { employeeId, periodKey, kind, amountSatang: B(baht), requestedById: "qc-h02-staff" });
  if (!r?.ok) throw new Error(`fixture: ยื่นรายการไม่ได้ ${short(r)}`);
  const d = await pay.decideAdjustment(ctx, r.id, "APPROVED", OWNER());
  if (!d?.ok) throw new Error(`fixture: อนุมัติรายการไม่ได้ ${short(d)}`);
  return r.id as string;
}
const jvCount = () => P.accountJournalEntry.count({ where: { tenantId: tid } }) as Promise<number>;

// ═════════════════════════ S5 static ═════════════════════════
function runStatic(): void {
  const h = staticHashes();
  chk("S5.1", h.computeItem === BASE_HASH.computeItem, BASE_HASH.computeItem.slice(0, 16), h.computeItem.slice(0, 16));
  chk("S5.2", h.rules === BASE_HASH.rules, BASE_HASH.rules.slice(0, 16), h.rules.slice(0, 16));
  const p = rd(PAYROLL);
  chk("S5.3", p.includes(SIG_STRANDED) && h.stranded === BASE_HASH.stranded, "signature + body hash เดิม", `sig=${p.includes(SIG_STRANDED)} hash=${h.stranded.slice(0, 16)}`);

  const ui = rd(UI);
  const i0 = ui.indexOf("export async function PayrollSection(");
  const body = i0 >= 0 ? ui.slice(i0) : "";
  const guard = body.indexOf("if (!canViewPayroll(membership))");
  const ctxAt = guard >= 0 ? body.indexOf("const ctx", guard) : -1;
  const nonViewer = guard >= 0 && ctxAt > guard ? body.slice(guard, ctxAt) : "";
  const reads = ["listRuns(", "listAdjustments(", "listSalaryProfiles(", "runExclusions(", "strandedAdjustments("].map((s) => body.indexOf(s)).filter((i) => i >= 0);
  const firstRead = reads.length ? Math.min(...reads) : -1;
  chk(
    "S5.4",
    guard > 0 && ctxAt > guard && firstRead > ctxAt && /return \(/.test(nonViewer) && !/flags|NEGATIVE_NET|PARTIAL_MONTH|runExclusions|strandedAdjustments|ยังไม่คิดตามสัดส่วน/.test(nonViewer),
    "guard → return ก่อนอ่านทุกอย่าง · ทางผู้ไม่ดูไม่มีข้อความ flag",
    `guard=${guard} ctx=${ctxAt} firstRead=${firstRead} leak=${/flags|NEGATIVE_NET|PARTIAL_MONTH/.test(nonViewer)}`,
  );
  const hrTsx = ["payroll-ui.tsx", "RunRowActions.tsx"].map((f) => rd(`src/lib/modules/hr/${f}`)).join("\n");
  const exAt = body.indexOf("runExclusions(");
  const stAt = body.indexOf("strandedAdjustments(");
  chk(
    "S5.5",
    exAt > ctxAt && stAt > ctxAt && ctxAt > 0 && hrTsx.includes("ยังไม่คิดตามสัดส่วน") && /NEGATIVE_NET/.test(hrTsx) && /PARTIAL_MONTH/.test(hrTsx),
    "runExclusions + strandedAdjustments หลังด่าน · ข้อความ ต้องตรวจ/ยังไม่คิดตามสัดส่วน · NEGATIVE_NET · PARTIAL_MONTH",
    `runExclusions@${exAt} stranded@${stAt} ctx@${ctxAt} partialText=${hrTsx.includes("ยังไม่คิดตามสัดส่วน")} NEG=${/NEGATIVE_NET/.test(hrTsx)} PM=${/PARTIAL_MONTH/.test(hrTsx)}`,
  );
  const act = rd(ACTIONS);
  const a0 = act.indexOf("export async function createPayrollRunAction(");
  const a1 = a0 >= 0 ? act.indexOf("\n}\n", a0) : -1;
  const ab = a0 >= 0 && a1 > a0 ? act.slice(a0, a1) : "";
  chk(
    "S5.6",
    !!ab && !ab.includes("/^\\d{4}-\\d{2}$/") && ab.includes("PERIOD_RE") && /return \{[^}]*ok:/.test(ab),
    "ไม่มี regex หลวม · PERIOD_RE · return { ok … }",
    ab ? `loose=${ab.includes("/^\\d{4}-\\d{2}$/")} PERIOD_RE=${ab.includes("PERIOD_RE")} returnsOk=${/return \{[^}]*ok:/.test(ab)}` : "ไม่พบ createPayrollRunAction",
  );
}

// ═════════════════════════ DB groups ═════════════════════════
async function setupTenant(): Promise<void> {
  const t = await P.tenant.create({ data: { name: "QC HR H0.2 run integrity", slug: SLUG } });
  tenants.push(t.id);
  tid = t.id;
  const t2 = await P.tenant.create({ data: { name: "QC HR H0.2 other tenant", slug: `${SLUG}-x` } });
  tenants.push(t2.id);
  await sys.createSystem(tid, "ACCOUNT", "บัญชี"); // ให้ approveRun ลงบัญชี
  const coreHash = (await import("@/lib/core/hash" as string)) as Any;
  const u = await P.user.create({ data: { email: `${SLUG}-owner@qc.invalid`, name: `QC H0.2 owner ${RAND}` } });
  users.push(u.id);
  ownerId = u.id;
  await P.membership.create({ data: { userId: u.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const token = coreHash.randomToken(32) as string;
  const DAY = 86_400_000;
  await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
  cookie = `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}`;
}

// ── S1 D1 ──
async function groupS1(): Promise<void> {
  console.log("── S1 D1 ใครอยู่ในรอบ (2026-08) ──");
  const hr1 = await sys.createSystem(tid, "HR", "HR S1");
  const ctx = { tenantId: tid, systemId: hr1.id };
  const A = await mkEmp(ctx, "S1-A ทำงานปกติ", 20_000);
  const Bx = await mkEmp(ctx, "S1-B ออกก่อนงวด", 20_000, { end: "2026-07-31" });
  const C = await mkEmp(ctx, "S1-C ออกกลางเดือน", 20_000, { end: "2026-08-15", active: false });
  const Dd = await mkEmp(ctx, "S1-D ออกสิ้นเดือน", 20_000, { end: "2026-08-31", active: false });
  const E = await mkEmp(ctx, "S1-E เริ่มเดือนหน้า", 20_000, { start: "2026-09-01" });
  const F = await mkEmp(ctx, "S1-F เริ่มกลางเดือน", 20_000, { start: "2026-08-20" });
  const G = await mkEmp(ctx, "S1-G ถูกลบไม่มีวันสิ้นสุด", 20_000, { active: false });
  const H = await mkEmp(ctx, "S1-H เริ่มวันแรกของงวด", 20_000, { start: "2026-08-01" });
  const adjB = await approvedAdj(ctx, Bx, "2026-08", "BONUS", 1_000);
  const adjA = await approvedAdj(ctx, A, "2026-08", "ALLOWANCE", 500);

  const run = await pay.createPayrollRun(ctx, { periodKey: "2026-08", payDate: D("2026-08-31") });
  const { run: runRow, items, sumOk, diff } = await runAndItems(run.id);
  const it = (e: string) => items.find((i) => i.employeeId === e);
  const full = B(20_000);
  chk("S1.1", !!it(A) && flagsOf(it(A)).length === 0, "in · flags []", `in=${!!it(A)} flags=${short(flagsOf(it(A)))}`);
  chk("S1.2", !it(Bx), "ไม่มีรายการ", `in=${!!it(Bx)}`);
  chk("S1.3", !!it(C) && flagsOf(it(C)).includes("PARTIAL_MONTH") && it(C)?.grossSatang === full, `in · PARTIAL_MONTH · gross ${full}`, `in=${!!it(C)} flags=${short(flagsOf(it(C)))} gross=${it(C)?.grossSatang}`);
  chk("S1.4", !!it(Dd) && !flagsOf(it(Dd)).includes("PARTIAL_MONTH"), "in · ไม่มี PARTIAL_MONTH", `in=${!!it(Dd)} flags=${short(flagsOf(it(Dd)))}`);
  chk("S1.5", !it(E), "ไม่มีรายการ", `in=${!!it(E)}`);
  chk("S1.6", !!it(F) && flagsOf(it(F)).includes("PARTIAL_MONTH") && it(F)?.grossSatang === full, `in · PARTIAL_MONTH · gross ${full}`, `in=${!!it(F)} flags=${short(flagsOf(it(F)))} gross=${it(F)?.grossSatang}`);
  chk("S1.7", !it(G), "ไม่มีรายการ", `in=${!!it(G)}`);
  chk("S1.8", !!it(H) && !flagsOf(it(H)).includes("PARTIAL_MONTH"), "in · ไม่มี PARTIAL_MONTH", `in=${!!it(H)} flags=${short(flagsOf(it(H)))}`);
  const rowB = await P.hrPayAdjustment.findUnique({ where: { id: adjB } });
  const rowA = await P.hrPayAdjustment.findUnique({ where: { id: adjA } });
  chk("S1.9", rowB?.runId === null && rowB?.status === "APPROVED" && rowA?.runId === run.id, "B: runId null APPROVED · A: ผูกรอบ", `B=${rowB?.runId}/${rowB?.status} A=${rowA?.runId === run.id}`);

  const ex = fnOf("runExclusions");
  if (!ex) {
    chk("S1.10", false, "runExclusions", "MISSING runExclusions");
    chk("S1.11", false, "runExclusions", "MISSING runExclusions");
  } else {
    let list: Any[] = [];
    let err = "";
    try {
      list = (await ex(ctx, "2026-08")) as Any[];
    } catch (e) {
      err = msgOf(e);
    }
    const want: Record<string, [string, string]> = { [Bx]: ["ENDED_BEFORE", "S1-B ออกก่อนงวด"], [E]: ["STARTS_AFTER", "S1-E เริ่มเดือนหน้า"], [G]: ["REMOVED_NO_END_DATE", "S1-G ถูกลบไม่มีวันสิ้นสุด"] };
    const ok10 = Array.isArray(list) && list.length === 3 && list.every((r) => want[r?.employeeId]?.[0] === r?.reason && want[r?.employeeId]?.[1] === r?.name) && new Set(list.map((r) => r?.employeeId)).size === 3;
    chk("S1.10", ok10, "3 คน ENDED_BEFORE/STARTS_AFTER/REMOVED_NO_END_DATE + ชื่อ", err || short(list, 400));
    const hrOther = await sys.createSystem(tenants[1]!, "HR", "HR อื่น");
    const hr1b = await sys.createSystem(tid, "HR", "HR S1 ระบบที่สอง");
    let a: Any[] = [], b: Any[] = [];
    let err2 = "";
    try {
      a = (await ex({ tenantId: tenants[1]!, systemId: hr1.id }, "2026-08")) as Any[];
      b = (await ex({ tenantId: tid, systemId: hr1b.id }, "2026-08")) as Any[];
      await ex({ tenantId: tenants[1]!, systemId: hrOther.id }, "2026-08");
    } catch (e) {
      err2 = msgOf(e);
    }
    const mine = new Set([A, Bx, C, Dd, E, F, G, H]);
    chk("S1.11", !err2 && Array.isArray(a) && Array.isArray(b) && ![...a, ...b].some((r) => mine.has(r?.employeeId)), "ไม่มีคนของระบบนี้", err2 || `otherTenant=${short(a)} otherSystem=${short(b)}`);
  }
  chk("S1.12", sumOk && items.length === 5, "Σ ตรงทุกช่อง · 5 รายการ", `items=${items.length} diff=${diff.join(",")} net=${runRow?.totalNetSatang}`);

  const rc = fnOf("recomputeDraftRun");
  if (!rc) chk("S1.13", false, "recomputeDraftRun", "MISSING recomputeDraftRun (H0.1)");
  else {
    const before = items.map((i) => `${i.employeeId}:${flagsOf(i).sort().join("+")}`).sort().join("|");
    let r: Any = null;
    let err = "";
    try {
      r = await rc(ctx, run.id, OWNER());
    } catch (e) {
      err = msgOf(e);
    }
    const after = await runAndItems(run.id);
    const aft = after.items.map((i) => `${i.employeeId}:${flagsOf(i).sort().join("+")}`).sort().join("|");
    const rowB2 = await P.hrPayAdjustment.findUnique({ where: { id: adjB } });
    chk("S1.13", !err && r?.ok !== false && aft === before && after.sumOk && rowB2?.runId === null, "สมาชิก/flags เดิม · Σ ตรง · B ไม่ผูก", err || `res=${short(r)} same=${aft === before} sum=${after.sumOk} B=${rowB2?.runId}`);
  }
}

// ── S2 D5 ──
async function groupS2(): Promise<void> {
  console.log("── S2 D5 งวดที่ปิดแล้ว ──");
  const hr2 = await sys.createSystem(tid, "HR", "HR S2");
  const ctx = { tenantId: tid, systemId: hr2.id };
  const M = await mkEmp(ctx, "S2-M", 20_000);
  await mkEmp(ctx, "S2-N", 18_000);
  const req = (periodKey: string, kind: string, baht: number, extra: Any = {}) => pay.requestAdjustment(ctx, { employeeId: M, periodKey, kind, amountSatang: B(baht), requestedById: "qc-h02-staff", ...extra });
  const COM = `qc-h02-com-${RAND}`;
  const p1 = await req("2026-09", "BONUS", 1_000);
  const c1 = await req("2026-09", "COMMISSION", 500, { crmCommissionId: COM, note: "QC H0.2 commission" });
  const p4 = await req("2026-10", "DEDUCTION", 300);
  if (!p1?.ok || !c1?.ok || !p4?.ok) throw new Error(`fixture S2: ${short([p1, c1, p4])}`);
  const r09 = await pay.createPayrollRun(ctx, { periodKey: "2026-09", payDate: D("2026-09-30") });
  const r10 = await pay.createPayrollRun(ctx, { periodKey: "2026-10", payDate: D("2026-10-31") });
  const a10 = await pay.approveRun(ctx, r10.id);
  const r11 = await pay.createPayrollRun(ctx, { periodKey: "2026-11", payDate: D("2026-11-30") });
  const a11 = await pay.approveRun(ctx, r11.id);
  const m11 = await pay.markPaid(ctx, r11.id);
  const st = await P.hrPayrollRun.findMany({ where: { systemId: hr2.id }, select: { periodKey: true, status: true }, orderBy: { periodKey: "asc" } });
  if (!a10?.ok || !a11?.ok || !m11?.ok) throw new Error(`fixture S2 runs: ${short([a10, a11, m11, st])}`);

  const countAt = (p: string) => P.hrPayAdjustment.count({ where: { systemId: hr2.id, periodKey: p } }) as Promise<number>;
  // อ้างอิงทาง CRM ก่อน (S2.4) — ข้อความนี้คือมาตรฐานของ S2.1–S2.3
  const crmRef = await pay.requestAdjustment(ctx, { employeeId: M, periodKey: "2026-09", kind: "COMMISSION", amountSatang: B(1), crmCommissionId: `${COM}-ref`, requestedById: "qc-h02-staff" });
  for (const [k, p, status] of [["S2.1", "2026-09", "DRAFT"], ["S2.2", "2026-10", "APPROVED"], ["S2.3", "2026-11", "PAID"]] as const) {
    const n0 = await countAt(p);
    const r = await req(p, "BONUS", 777);
    const n1 = await countAt(p);
    const runSt = st.find((x: Any) => x.periodKey === p)?.status;
    chk(k, runSt === status && r?.ok === false && r?.code === "PERIOD_CLOSED" && r?.reason === CLOSED_MSG(p) && r?.reason === String(crmRef?.reason ?? "").replace("2026-09", p) && n1 === n0, `${status} · PERIOD_CLOSED · "${CLOSED_MSG(p)}" · แถว +0`, `run=${runSt} res=${short(r)} rows ${n0}→${n1}`);
  }
  chk("S2.4", crmRef?.ok === false && crmRef?.code === "PERIOD_CLOSED" && crmRef?.reason === CLOSED_MSG("2026-09"), CLOSED_MSG("2026-09"), short(crmRef));
  const open = await req("2027-06", "BONUS", 100);
  const openRow = open?.id ? await P.hrPayAdjustment.findUnique({ where: { id: open.id } }) : null;
  chk("S2.5", open?.ok === true && openRow?.status === "PENDING" && openRow?.periodKey === "2027-06", "ok · PENDING 2027-06", short(open));

  const sa = fnOf("strandedAdjustments");
  const fixtureIds = new Set([p1.id, c1.id, p4.id, open?.id].filter(Boolean));
  const strandedIds = async (): Promise<string[] | string> => {
    if (!sa) return "MISSING strandedAdjustments";
    try {
      const rows = (await sa(ctx)) as Any[];
      return Array.isArray(rows) ? rows.map((r) => String(r?.id)).filter((id) => fixtureIds.has(id)).sort() : `not array: ${short(rows)}`;
    } catch (e) {
      return `THROW ${msgOf(e)}`;
    }
  };
  const s6 = await strandedIds();
  chk("S2.6", Array.isArray(s6) && s6.join(",") === [p1.id, c1.id, p4.id].sort().join(","), "P1 (ปกติ) · P4 (ปกติ) · C1 (CRM)", short(s6));

  const c1Row = await P.hrPayAdjustment.findUnique({ where: { id: c1.id } });
  const expC1 = { id: c1Row.id, systemId: c1Row.systemId, employeeId: c1Row.employeeId, periodKey: "2026-09", kind: "COMMISSION", status: "PENDING", runId: null, amountSatang: B(500), note: "QC H0.2 commission", requestedById: "qc-h02-staff", crmCommissionId: COM };
  const sc = (await pay.strandedCommissionAdjustments(tid)) as Any[];
  chk("S2.7", JSON.stringify(sc) === JSON.stringify([expC1]), short([expC1], 400), short(sc, 400));

  const rej = await pay.decideAdjustment(ctx, p4.id, "REJECTED", OWNER());
  const p4Row = await P.hrPayAdjustment.findUnique({ where: { id: p4.id } });
  chk("S2.12", rej?.ok === true && !rej?.movedTo && p4Row?.status === "REJECTED" && p4Row?.periodKey === "2026-10", "REJECTED · งวดเดิม 2026-10", `${short(rej)} ${p4Row?.status}/${p4Row?.periodKey}`);

  const mv = await pay.decideAdjustment(ctx, p1.id, "APPROVED", OWNER());
  const p1Row = await P.hrPayAdjustment.findUnique({ where: { id: p1.id } });
  chk("S2.8", mv?.ok === true && mv?.movedFrom === "2026-09" && mv?.movedTo === "2026-12" && p1Row?.status === "APPROVED" && p1Row?.periodKey === "2026-12" && p1Row?.runId === null, "ok · 2026-09 → 2026-12", `${short(mv)} row=${p1Row?.status}/${p1Row?.periodKey}/${p1Row?.runId}`);

  const r12 = await pay.createPayrollRun(ctx, { periodKey: "2026-12", payDate: D("2026-12-31") });
  const p1b = await P.hrPayAdjustment.findUnique({ where: { id: p1.id } });
  const itM = await P.hrPayrollItem.findFirst({ where: { runId: r12.id, employeeId: M } });
  chk("S2.9", p1b?.runId === r12.id && itM?.addSatang === B(1_000), "P1 ผูกรอบ 2026-12 · addSatang 100000", `runId=${p1b?.runId === r12.id ? "run12" : p1b?.runId} add=${itM?.addSatang}`);

  const s10 = await strandedIds();
  chk("S2.10", Array.isArray(s10) && s10.join(",") === c1.id, "C1 เท่านั้น", short(s10));

  const mc = await pay.decideAdjustment(ctx, c1.id, "APPROVED", OWNER());
  const c1b = await P.hrPayAdjustment.findUnique({ where: { id: c1.id } });
  chk("S2.11", mc?.ok === true && mc?.movedTo === "2027-01" && c1b?.periodKey === "2027-01" && c1b?.status === "APPROVED", "ย้ายไป 2027-01", `${short(mc)} ${c1b?.periodKey}/${c1b?.status}`);
  void r09;
}

// ── S3 D6 ──
async function groupS3(): Promise<void> {
  console.log("── S3 D6 สุทธิติดลบ ──");
  const h0 = fnOf("deleteDraftRun");
  const rc = fnOf("recomputeDraftRun");
  // S3a: รอบที่มีแต่คนติดลบ
  const hr3a = await sys.createSystem(tid, "HR", "HR S3a");
  const ca = { tenantId: tid, systemId: hr3a.id };
  const S = await mkEmp(ca, "S3-S ฐาน 1,000", 1_000, { sso: true });
  const advS = await approvedAdj(ca, S, "2027-02", "ADVANCE", 5_000);
  const runA = await pay.createPayrollRun(ca, { periodKey: "2027-02", payDate: D("2027-02-28") });
  let ra = await runAndItems(runA.id);
  const iS = ra.items.find((i) => i.employeeId === S);
  chk("S3.1", iS?.grossSatang === 0 && iS?.ssoEmployeeSatang === 8_300 && iS?.whtSatang === 0 && iS?.netSatang === -8_300, "gross 0 · sso 8300 · wht 0 · net −8300", short({ g: iS?.grossSatang, s: iS?.ssoEmployeeSatang, w: iS?.whtSatang, n: iS?.netSatang }));

  // S3b: รอบผสม (ติดลบ 2 · บวก 1 · RN-10 ssoEligible:false 1)
  const hr3b = await sys.createSystem(tid, "HR", "HR S3b");
  const cb = { tenantId: tid, systemId: hr3b.id };
  const N1 = await mkEmp(cb, "S3-N1", 1_000, { sso: true });
  const N2 = await mkEmp(cb, "S3-N2", 1_000, { sso: true });
  const T = await mkEmp(cb, "S3-T ฐาน 30,000", 30_000, { sso: true });
  const Z = await mkEmp(cb, "S3-Z RN-10", 1_000, { sso: false });
  const advN1 = await approvedAdj(cb, N1, "2027-02", "ADVANCE", 5_000);
  const advN2 = await approvedAdj(cb, N2, "2027-02", "DEDUCTION", 5_000);
  await approvedAdj(cb, Z, "2027-02", "ADVANCE", 5_000);
  const runB = await pay.createPayrollRun(cb, { periodKey: "2027-02", payDate: D("2027-02-28") });
  const rb = await runAndItems(runB.id);
  const ib = (e: string) => rb.items.find((i) => i.employeeId === e);
  chk(
    "S3.2",
    flagsOf(iS).includes("NEGATIVE_NET") && flagsOf(ib(N1)).includes("NEGATIVE_NET") && flagsOf(ib(N2)).includes("NEGATIVE_NET") && !flagsOf(ib(T)).includes("NEGATIVE_NET"),
    "S/N1/N2 มี NEGATIVE_NET · T ไม่มี",
    short({ S: flagsOf(iS), N1: flagsOf(ib(N1)), N2: flagsOf(ib(N2)), T: flagsOf(ib(T)) }),
  );
  chk("S3.8", ib(Z)?.grossSatang === 0 && ib(Z)?.netSatang === 0 && !flagsOf(ib(Z)).includes("NEGATIVE_NET"), "0/0 · ไม่มี flag", short({ g: ib(Z)?.grossSatang, n: ib(Z)?.netSatang, f: flagsOf(ib(Z)) }));

  // S3.3 อนุมัติรอบติดลบ (expect ถูกต้อง)
  const j0 = await jvCount();
  const ap = await pay.approveRun(ca, runA.id, { totalNetSatang: ra.run.totalNetSatang, itemCount: ra.items.length });
  const afterA = await P.hrPayrollRun.findUnique({ where: { id: runA.id } });
  const j1 = await jvCount();
  chk("S3.3", ap?.ok === false && String(ap?.note ?? ap?.reason) === NEG_MSG(1) && afterA?.status === "DRAFT" && afterA?.journalEntryId === null && j1 === j0, `ok:false · "${NEG_MSG(1)}" · DRAFT · JV +0`, `${short(ap)} status=${afterA?.status} jv ${j0}→${j1}`);

  // S3.4 ลบรายการหัก (fixture — ผูกกับรอบร่างอยู่ สินค้าลบไม่ได้: ดูคำถามเปิด OQ-1) → คำนวณใหม่
  await P.hrPayAdjustment.delete({ where: { id: advS } });
  if (!rc) chk("S3.4", false, "recomputeDraftRun", "MISSING recomputeDraftRun (H0.1)");
  else {
    let r: Any = null;
    let err = "";
    try {
      r = await rc(ca, runA.id, OWNER());
    } catch (e) {
      err = msgOf(e);
    }
    ra = await runAndItems(runA.id);
    const i2 = ra.items.find((i) => i.employeeId === S);
    chk("S3.4", !err && r?.ok !== false && i2?.netSatang === B(1_000) - 8_300 && !flagsOf(i2).includes("NEGATIVE_NET") && ra.sumOk, "net 91700 · ไม่มี flag · Σ ตรง", err || short({ r, net: i2?.netSatang, f: flagsOf(i2), sum: ra.sumOk }));
  }
  const ap2 = await pay.approveRun(ca, runA.id, { totalNetSatang: ra.run.totalNetSatang, itemCount: ra.items.length });
  const afterA2 = await P.hrPayrollRun.findUnique({ where: { id: runA.id } });
  const bal = await jvBalance(afterA2?.journalEntryId);
  const bankCr = afterA2?.journalEntryId ? await P.accountJournalLine.findMany({ where: { entryId: afterA2.journalEntryId, credit: afterA2.totalNetSatang } }) : [];
  chk("S3.5", ap2?.ok === true && afterA2?.status === "APPROVED" && bal.dr === bal.cr && bal.dr > 0 && bankCr.length >= 1 && afterA2.totalNetSatang > 0, "APPROVED · Dr = Cr · Cr = net", `${short(ap2)} status=${afterA2?.status} dr/cr=${bal.dr}/${bal.cr} net=${afterA2?.totalNetSatang}`);

  // S3.6 รอบผสม — ไม่ส่ง expect (ทางเดิม)
  const j2 = await jvCount();
  const ap3 = await pay.approveRun(cb, runB.id);
  const afterB = await P.hrPayrollRun.findUnique({ where: { id: runB.id } });
  const j3 = await jvCount();
  chk("S3.6", rb.run.totalNetSatang > 0 && ap3?.ok === false && String(ap3?.note ?? ap3?.reason) === NEG_MSG(2) && afterB?.status === "DRAFT" && afterB?.journalEntryId === null && j3 === j2, `total>0 · ok:false · "${NEG_MSG(2)}" · DRAFT · JV +0`, `total=${rb.run.totalNetSatang} ${short(ap3)} status=${afterB?.status} jv ${j2}→${j3}`);

  // S3.7 ทางของสินค้า: ลบร่าง → ลบรายการหัก → สร้างรอบใหม่ → อนุมัติ
  if (!h0) chk("S3.7", false, "deleteDraftRun", "MISSING deleteDraftRun (H0.1)");
  else {
    let step = "";
    try {
      step = "deleteDraftRun";
      const d = await h0(cb, runB.id, OWNER());
      if (d?.ok === false) throw new Error(`deleteDraftRun: ${short(d)}`);
      step = "cancelAdjustment";
      for (const id of [advN1, advN2]) {
        const c = await pay.cancelAdjustment(cb, id, OWNER());
        if (!c?.ok) throw new Error(`cancelAdjustment: ${short(c)}`);
      }
      step = "createPayrollRun";
      const nb = await pay.createPayrollRun(cb, { periodKey: "2027-02", payDate: D("2027-02-28") });
      const x = await runAndItems(nb.id);
      step = "approveRun";
      const a = await pay.approveRun(cb, nb.id, { totalNetSatang: x.run.totalNetSatang, itemCount: x.items.length });
      const fin = await P.hrPayrollRun.findUnique({ where: { id: nb.id } });
      const b2 = await jvBalance(fin?.journalEntryId);
      chk("S3.7", a?.ok === true && fin?.status === "APPROVED" && b2.dr === b2.cr && b2.dr > 0 && !x.items.some((i) => i.netSatang < 0), "APPROVED · Dr = Cr · ไม่มีติดลบ", `${short(a)} status=${fin?.status} dr/cr=${b2.dr}/${b2.cr}`);
    } catch (e) {
      chk("S3.7", false, "ทางของสินค้าผ่านครบ", `${step}: ${msgOf(e).slice(0, 200)}`);
    }
  }
}

// ── S4 D12 ──
async function groupS4(): Promise<void> {
  console.log("── S4 D12 งวด/วันจ่ายปลอม ──");
  const hr4 = await sys.createSystem(tid, "HR", "HR S4");
  const ctx = { tenantId: tid, systemId: hr4.id };
  await mkEmp(ctx, "S4-A", 15_000);
  const runsOf = () => P.hrPayrollRun.findMany({ where: { systemId: hr4.id }, select: { periodKey: true } }) as Promise<Any[]>;
  for (const [k, p] of [["S4.1", "2026-13"], ["S4.2", "2026-00"], ["S4.3", "2026-1"], ["S4.4", "  "]] as const) {
    const e = await errOf(() => pay.createPayrollRun(ctx, { periodKey: p, payDate: D("2026-12-25") }));
    const n = (await runsOf()).filter((r) => r.periodKey === p || r.periodKey === p.trim()).length;
    chk(k, !!e && THAI.test(e) && n === 0, "throw ไทย · 0 แถว", `err=${short(e)} rows=${n}`);
  }
  {
    const e = await errOf(() => pay.createPayrollRun(ctx, { periodKey: "2027-03", payDate: new Date("not-a-date") }));
    const n = (await runsOf()).filter((r) => r.periodKey === "2027-03").length;
    chk("S4.5", !!e && THAI.test(e) && !/Invalid|prisma|invocation/i.test(e) && n === 0, "throw ไทย (ไม่ใช่ error ของฐาน) · 0 แถว", `err=${short(e)} rows=${n}`);
  }
  const act = (await import("@/lib/modules/hr/payroll-actions" as string)) as Any;
  const callAct = async (periodKey: string, payDate: string): Promise<Any> => {
    const fd = new FormData();
    fd.set("systemId", hr4.id);
    fd.set("periodKey", periodKey);
    fd.set("payDate", payDate);
    try {
      return await inScope(cookie, `/app/sys/${hr4.id}/hr/payroll`, () => (act.createPayrollRunAction.length >= 2 ? act.createPayrollRunAction({ ok: true }, fd) : act.createPayrollRunAction(fd)));
    } catch (e) {
      return { status: "THROW", message: `${(e as Error)?.name}: ${msgOf(e).slice(0, 160)}` };
    }
  };
  {
    const r = await callAct("2027-13", "2026-12-25"); // งวดที่ S4.1 ไม่ได้ใช้ (ฐานสร้างแถว 2026-13 ไว้แล้ว ⇒ จะชนซ้ำ ไม่ใช่เหตุผลจริง)
    const n = (await runsOf()).filter((x) => x.periodKey === "2027-13").length;
    chk("S4.6", r?.ok === false && THAI.test(String(r?.reason ?? "")) && n === 0, "{ ok:false, reason ไทย } · 0 แถว", `${short(r)} rows=${n}`);
  }
  {
    const r1 = await callAct("2029-05", "2026-02-31");
    const r2 = await callAct("2029-06", "abc");
    const n = (await runsOf()).filter((x) => x.periodKey === "2029-05" || x.periodKey === "2029-06").length;
    chk("S4.7", r1?.ok === false && THAI.test(String(r1?.reason ?? "")) && r2?.ok === false && THAI.test(String(r2?.reason ?? "")) && n === 0, "ทั้งคู่ { ok:false, reason ไทย } · 0 แถว", `${short(r1)} · ${short(r2)} rows=${n}`);
  }
  {
    const r1 = await callAct("2027-04", "2027-04-25");
    const n1 = (await runsOf()).filter((x) => x.periodKey === "2027-04").length;
    const r2 = await callAct("2027-04", "2027-04-25");
    const n2 = (await runsOf()).filter((x) => x.periodKey === "2027-04").length;
    chk("S4.8", r1?.ok === true && n1 === 1 && r2?.ok === false && THAI.test(String(r2?.reason ?? "")) && n2 === 1, "ok:true + 1 แถว · ซ้ำ → { ok:false, reason ไทย }", `${short(r1)} n=${n1} · ${short(r2)} n=${n2}`);
  }
}

// ── X6 races ──
function spawnWorker(arg: Any): Promise<{ out: string[]; late: boolean; err?: string }> {
  return new Promise((resolve) => {
    const enc = Buffer.from(JSON.stringify(arg), "utf8").toString("base64");
    const ch = spawn("pnpm", ["exec", "tsx", THIS_FILE, "--x6-worker", enc], { env: process.env, cwd: ROOT });
    let so = "";
    let se = "";
    const to = setTimeout(() => ch.kill("SIGKILL"), 240_000);
    ch.stdout.on("data", (d: Buffer) => (so += d.toString()));
    ch.stderr.on("data", (d: Buffer) => (se += d.toString()));
    ch.on("error", (e: unknown) => {
      clearTimeout(to);
      resolve({ out: [], late: true, err: `SPAWN-ERROR ${String(e)}` });
    });
    ch.on("close", (code: number | null) => {
      clearTimeout(to);
      const line = so.split("\n").find((l) => l.startsWith("X6_RESULT "));
      if (!line) return resolve({ out: [], late: true, err: `exit=${code} ${se.slice(-300)} ${so.slice(-200)}` });
      const j = JSON.parse(line.slice("X6_RESULT ".length));
      resolve({ out: j.out, late: j.late });
    });
  });
}
async function groupX6(): Promise<void> {
  console.log("── X6 races (worker processes · 10 เลน × 3 รอบ) ──");
  const ROUNDS = 3;
  const PER = 5; // 5 เลนต่อ worker × 2 worker = 10 เลนต่อรอบ
  // race 1: approve ∥ recompute ของรอบที่มี NEGATIVE_NET (ยอดรวมบวก — ฐานจะอนุมัติผ่าน)
  const hr6a = await sys.createSystem(tid, "HR", "HR X6a");
  const ca = { tenantId: tid, systemId: hr6a.id };
  const Sx = await mkEmp(ca, "X6-S ติดลบ", 1_000, { sso: true });
  await mkEmp(ca, "X6-T บวก", 30_000, { sso: true });
  const periodsA = ["2027-07", "2027-08", "2027-09"];
  const runsA: { id: string; expect: Any; adv: string }[] = [];
  for (const p of periodsA) {
    const adv = await approvedAdj(ca, Sx, p, "ADVANCE", 5_000);
    const r = await pay.createPayrollRun(ca, { periodKey: p, payDate: D(`${p}-25`) });
    const x = await runAndItems(r.id);
    runsA.push({ id: r.id, expect: { totalNetSatang: x.run.totalNetSatang, itemCount: x.items.length }, adv });
  }
  // race 2: decide(APPROVED) ∥ createPayrollRun ของงวดเดียวกัน
  const hr6b = await sys.createSystem(tid, "HR", "HR X6b");
  const cb = { tenantId: tid, systemId: hr6b.id };
  const Ex = await mkEmp(cb, "X6-E", 20_000);
  const periodsB = ["2028-01", "2028-04", "2028-07"];
  const rowsB: string[][] = [];
  for (const p of periodsB) {
    const ids: string[] = [];
    for (let i = 0; i < PER; i++) {
      const r = await pay.requestAdjustment(cb, { employeeId: Ex, periodKey: p, kind: "BONUS", amountSatang: B(100 + i), requestedById: "qc-h02-staff" });
      if (!r?.ok) throw new Error(`fixture X6b: ${short(r)}`);
      ids.push(r.id);
    }
    rowsB.push(ids);
  }
  const j0 = await jvCount();
  const startAt = Date.now() + 35_000;
  const gap = 5_000;
  const mk = (calls: (r: number) => Any[]) => ({ startAt, rounds: Array.from({ length: ROUNDS }, (_, r) => ({ atMs: r * gap, calls: calls(r) })) });
  const wApprove = mk((r) => Array.from({ length: PER }, (_, l) => ({ tag: "A", fn: "approve", ctx: ca, runId: runsA[r]!.id, ...(l < 3 ? { expect: runsA[r]!.expect } : {}) })));
  const wRecompute = mk((r) => Array.from({ length: PER }, () => ({ tag: "R", fn: "recompute", ctx: ca, runId: runsA[r]!.id, actor: OWNER() })));
  const wDecide = mk((r) => rowsB[r]!.map((id) => ({ tag: "D", fn: "decide", ctx: cb, id, decider: OWNER() })));
  const wCreate = mk((r) => Array.from({ length: PER }, () => ({ tag: "C", fn: "create", ctx: cb, periodKey: periodsB[r]!, payDate: `${periodsB[r]!}-25T00:00:00Z` })));
  const [ra, rr, rd2, rc] = await Promise.all([spawnWorker(wApprove), spawnWorker(wRecompute), spawnWorker(wDecide), spawnWorker(wCreate)]);
  const lateOrErr = [ra, rr, rd2, rc].filter((w) => w.late || w.err).map((w) => w.err ?? "late");

  // X6.1 / X6.2
  const bad1: string[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const x = await runAndItems(runsA[r]!.id);
    const bound = await P.hrPayAdjustment.count({ where: { id: runsA[r]!.adv, runId: runsA[r]!.id } });
    if (x.run?.status !== "DRAFT" || x.run?.journalEntryId !== null || !x.items.some((i) => i.netSatang < 0) || bound !== 1 || x.items.length !== 2 || !x.sumOk)
      bad1.push(`r${r}:${x.run?.status}/jv=${!!x.run?.journalEntryId}/neg=${x.items.some((i) => i.netSatang < 0)}/bound=${bound}/items=${x.items.length}/sum=${x.sumOk}`);
  }
  const j1 = await jvCount();
  chk("X6.1", lateOrErr.length === 0 && bad1.length === 0 && j1 === j0 && ra.out.length === ROUNDS * PER && rr.out.length === ROUNDS * PER, "3 รอบ DRAFT · JV +0 · ติดลบยังอยู่ · ผูก 1", `${lateOrErr.join(" | ").slice(0, 200)} ${bad1.join(" ")} jv ${j0}→${j1} outs=${ra.out.length}/${rr.out.length}`);
  const aBad = ra.out.filter((o) => !(o.startsWith("A:NO:") && THAI.test(o)));
  const rBad = rr.out.filter((o) => !(o.startsWith("R:OK:") || (o.startsWith("R:NO:") && THAI.test(o))));
  chk("X6.2", ra.out.length === ROUNDS * PER && aBad.length === 0 && rr.out.length === ROUNDS * PER && rBad.length === 0, "A:NO:<ไทย> ×15 · R:OK|NO:<ไทย> ×15", `A bad=${short(aBad.slice(0, 2))} R bad=${short(rBad.slice(0, 2))}`);

  // X6.3 / X6.4
  const sa = fnOf("strandedAdjustments");
  let listed = new Set<string>();
  if (sa) {
    try {
      listed = new Set(((await sa(cb)) as Any[]).map((r) => String(r?.id)));
    } catch {
      /* ว่าง = ไม่เห็น */
    }
  }
  const bad3: string[] = [];
  const bad4: string[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const p = periodsB[r]!;
    const runs = (await P.hrPayrollRun.findMany({ where: { systemId: hr6b.id, periodKey: p } })) as Any[];
    if (runs.length !== 1) bad4.push(`r${r}:runs=${runs.length}`);
    const run = runs[0];
    const rows = (await P.hrPayAdjustment.findMany({ where: { id: { in: rowsB[r]! } } })) as Any[];
    let boundSum = 0;
    for (const a of rows) {
      const inRun = !!run && a.runId === run.id && a.periodKey === p;
      const moved = a.runId === null && a.status === "APPROVED" && a.periodKey !== p && (await P.hrPayrollRun.count({ where: { systemId: hr6b.id, periodKey: a.periodKey } })) === 0;
      const seen = listed.has(a.id);
      if (inRun) boundSum += a.amountSatang;
      if (!inRun && !moved && !seen) bad3.push(`r${r}:${a.id.slice(-5)}=${a.status}/${a.periodKey}/${a.runId ? "bound" : "free"}`);
    }
    const item = run ? await P.hrPayrollItem.findFirst({ where: { runId: run.id, employeeId: Ex } }) : null;
    if (run && item?.addSatang !== boundSum) bad3.push(`r${r}:add=${item?.addSatang}≠Σ${boundSum}`);
  }
  chk("X6.3", lateOrErr.length === 0 && rd2.out.length === ROUNDS * PER && bad3.length === 0, "ทุกแถว: ในรอบ | ย้าย | อยู่ใน strandedAdjustments · add = Σ", `${lateOrErr.join(" | ").slice(0, 120)} ${bad3.slice(0, 6).join(" ")}${sa ? "" : " (strandedAdjustments MISSING)"}`);
  const cOk = rc.out.filter((o) => o.startsWith("C:OK:")).length;
  const cBad = rc.out.filter((o) => !o.startsWith("C:OK:") && !(o.startsWith("C:THROW:") && o.includes("มีรอบจ่ายงวด") && THAI.test(o)));
  const dBad = rd2.out.filter((o) => !o.startsWith("D:OK:"));
  chk("X6.4", rc.out.length === ROUNDS * PER && cOk === ROUNDS && cBad.length === 0 && dBad.length === 0 && bad4.length === 0, "create ok 3 · แพ้ = 'มีรอบจ่ายงวด …' · decide ok 15", `cOk=${cOk} cBad=${short(cBad.slice(0, 2))} dBad=${short(dBad.slice(0, 2))} ${bad4.join(" ")}`);
}

// ═════════════════════════ Oracle round 2 (8 Oct) — hunter findings · brief §9 ═════════════════════════
// CR-H0.2-3: รายการที่มี crmCommissionId (คอมมิชชัน หรือหักคืน) ลบจาก HR ไม่ได้ ทุกสถานะ ทั้งทางมี/ไม่มี actor · ทาง CRM (withdraw/move) เดิม
// CR-H0.2-4: payDate ต้องอยู่ใน [วันแรกของงวด − 31 วัน, วันสุดท้ายของงวด + 62 วัน]
const CRM_CANCEL_MSG = "รายการนี้มาจาก CRM — ถอนหรือแก้ที่ CRM แล้วระบบจะถอนออกจากรอบจ่ายให้เอง";
const PAYDATE_WINDOW_MSG = "วันที่จ่ายต้องอยู่ใกล้งวดนี้ (ก่อนงวดไม่เกิน 1 เดือน หรือหลังงวดไม่เกิน 2 เดือน)";
const ADJ_ROWS_UI = "src/lib/modules/hr/PayAdjustRowActions.tsx";
const digestMod = (await import("@/lib/modules/hr/payroll-digest" as string).catch(() => null)) as Any;
/** ตัวเลขที่หน้าเว็บส่งตอนอนุมัติ (H0.1 CR11 · CR16) อ่านสด ณ ตอนนี้ */
async function freshExpect(runId: string): Promise<Any> {
  const run = await P.hrPayrollRun.findUnique({ where: { id: runId } });
  const items = (await P.hrPayrollItem.findMany({ where: { runId }, select: digestMod?.PAYROLL_DIGEST_SELECT ?? { employeeId: true } })) as Any[];
  const digest = typeof digestMod?.payrollItemsDigest === "function" ? String(digestMod.payrollItemsDigest(items)) : undefined;
  return { totalNetSatang: Number(run?.totalNetSatang ?? 0), itemCount: items.length, totalGrossSatang: Number(run?.totalGrossSatang ?? 0), ...(digest ? { itemsDigest: digest } : {}) };
}
const sameExpect = (a: Any, b: Any) => a.totalNetSatang === b.totalNetSatang && a.itemCount === b.itemCount && a.totalGrossSatang === b.totalGrossSatang && a.itemsDigest === b.itemsDigest;

// ── S9.4 (source) ──
/** ตัดคอมเมนต์ JSX/บรรทัด ออกก่อนจับ (คอมเมนต์ที่พูดถึง crmCommissionId ไม่นับเป็นเงื่อนไข) */
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
// "แถวนี้ไม่มี crmCommissionId": !x.crmCommissionId (ไม่ใช่ !!) · x.crmCommissionId == / === null|undefined
const NO_CRM_RE = /(?<![!\w])!(?!!)\s*\(?\s*[\w$.?]*crmCommissionId\b|[\w$.?]*crmCommissionId\s*===?\s*(?:null|undefined)\b/;
function runStaticS9(): void {
  const ui = rd(UI);
  const tagAt = ui.indexOf("<PayAdjustRowActions");
  const tagEnd = tagAt >= 0 ? ui.indexOf("/>", tagAt) : -1;
  const props = tagAt >= 0 && tagEnd > tagAt ? stripComments(ui.slice(tagAt, tagEnd)) : "";
  const chipAt = tagAt >= 0 ? ui.lastIndexOf("<StatusChip", tagAt) : -1;
  const from = tagAt < 0 ? 0 : chipAt >= 0 && tagAt - chipAt < 800 ? chipAt : Math.max(0, tagAt - 400);
  const gate = tagAt >= 0 ? stripComments(ui.slice(from, tagAt)) : "";
  // ทาง A: เงื่อนไขก่อน <PayAdjustRowActions> ในแถวรายการ = "ไม่มี crmCommissionId" (หรือ ternary x.crmCommissionId ? … : <PayAdjustRowActions)
  //        + ยังต้องให้แถว PENDING ของ CRM มีปุ่มอนุมัติ/ไม่อนุมัติ (เงื่อนไขมี PENDING/pending แบบ OR) — ซ่อนแค่ปุ่มลบ ไม่ใช่ทั้งชุด
  const ternary = /[\w$.?]*crmCommissionId\s*\?[^:]*:\s*\(?\s*$/.test(gate);
  const pathA = (NO_CRM_RE.test(gate) || ternary) && /PENDING|pending/.test(gate) && /\|\|/.test(gate);
  // ทาง B: ส่ง prop ที่มาจาก crmCommissionId ให้ PayAdjustRowActions แล้วฟอร์มลบ (op=delete) อยู่ใต้เงื่อนไขของ prop นั้น (ขั้วถูก)
  //        หรือส่งทั้งแถว แล้วคอมโพเนนต์เช็ก crmCommissionId เองก่อนฟอร์มลบ
  const pm = /(\w+)\s*=\s*\{([^{}]*crmCommissionId[^{}]*)\}/.exec(props);
  const comp = stripComments(rd(ADJ_ROWS_UI));
  const delAt = comp.search(/value=["']delete["']/);
  const retAt = comp.indexOf("return (");
  const compWin = delAt > 0 ? comp.slice(retAt >= 0 && retAt < delAt ? retAt : Math.max(0, delAt - 1200), delAt) : "";
  let pathB = false;
  let bWhy = "no crm prop";
  if (pm) {
    const name = pm[1]!;
    const expr = pm[2]!;
    const positive = NO_CRM_RE.test(expr); // true = "ลบได้" (ไม่มี crmCommissionId)
    const n = name.replace(/[$]/g, "\\$&");
    const posUse = new RegExp(`(?<![!\\w$])${n}\\b\\s*(?:&&|\\?)`);
    const negUse = new RegExp(`(?<![!\\w$])!\\s*${n}\\b\\s*(?:&&|\\?)|(?<![!\\w$])${n}\\b\\s*\\?[^:]*:\\s*\\(?\\s*(?:<>)?\\s*<form\\b(?:(?!<form\\b)[\\s\\S])*$`);
    // ใช้ prop ในเงื่อนไขก่อนฟอร์มลบ — ขั้ว: positive ⇒ `name &&`/`name ?` · negative ⇒ `!name &&` หรือ `name ? … : <ลบ>`
    pathB = !!compWin && (positive ? posUse.test(compWin) && !negUse.test(compWin) : negUse.test(compWin));
    bWhy = `prop ${name}={${expr.trim().slice(0, 60)}} ${positive ? "positive" : "negative"} used=${pathB}`;
  } else if (/\b\w+\s*=\s*\{\s*\w+\s*\}/.test(props) && NO_CRM_RE.test(compWin)) {
    pathB = true;
    bWhy = "row prop + component checks !crmCommissionId before delete";
  }
  chk(
    "S9.4",
    tagAt > 0 && delAt > 0 && (pathA || pathB),
    "ปุ่มลบแสดงเฉพาะแถวที่ไม่มี crmCommissionId (A: เงื่อนไขในแถวของ payroll-ui.tsx + PENDING ยังมีปุ่มอนุมัติ · B: prop/แถวไป PayAdjustRowActions แล้วฟอร์มลบอยู่ใต้เงื่อนไขนั้น)",
    `tag@${tagAt} delForm@${delAt} gate="${gate.replace(/\s+/g, " ").trim().slice(-160)}" A=${pathA} B=${pathB} (${bWhy})`,
  );
}

// ── S9.1–S9.3 · S9.5 ──
async function groupS9(): Promise<void> {
  console.log("── S9 รายการจาก CRM ห้ามลบจาก HR · วันที่จ่ายต้องใกล้งวด ──");
  const hr9 = await sys.createSystem(tid, "HR", "HR S9");
  const ctx = { tenantId: tid, systemId: hr9.id };
  const E = await mkEmp(ctx, "S9-E พนักงานขาย", 30_000);
  const F = await mkEmp(ctx, "S9-F", 18_000);
  let seq = 0;
  // fixture CRM (แบบ qc-hr-h0.1 S7.5): แถว CrmCommission ตรง + รายการ HR ผ่านทางเข้าของ CRM (requestAdjustment + crmCommissionId) + ลิงก์สองทาง
  const mkCom = async (o: { baht: number; periodKey: string; status?: string; reversedOfId?: string }): Promise<string> => {
    const id = `qch02${RAND}s9c${++seq}`;
    await P.crmCommission.create({
      data: {
        id, tenantId: tid, systemId: `qc-h02-crm-${RAND}`, dealId: `qc-h02-deal-${RAND}`, ruleId: `qc-h02-rule-${RAND}`, userId: `qc-h02-seller-${RAND}`,
        amountSatang: BigInt(B(o.baht)), basisSatang: BigInt(B(o.baht) * 10), basis: "PAID", status: o.status ?? "APPROVED", periodKey: o.periodKey, refId: id,
        ...(o.reversedOfId ? { reversedOfId: o.reversedOfId, refType: "REVERSAL", decidedAt: new Date() } : {}),
      },
    });
    return id;
  };
  const link = async (cid: string, employeeId: string, kind: string, periodKey: string, baht: number, approve: boolean): Promise<string> => {
    const r = await pay.requestAdjustment(ctx, { employeeId, periodKey, kind, amountSatang: B(baht), note: `QC H0.2 S9 ${kind}`, requestedById: "qc-h02-crm-approver", crmCommissionId: cid });
    if (!r?.ok) throw new Error(`fixture S9: ยื่นรายการ CRM ไม่ได้ ${short(r)}`);
    if (approve) {
      const d = await pay.decideAdjustment(ctx, r.id, "APPROVED", OWNER());
      if (!d?.ok || d?.movedTo) throw new Error(`fixture S9: อนุมัติรายการ CRM ไม่ได้ ${short(d)}`);
    }
    await P.crmCommission.update({ where: { id: cid }, data: { hrPayAdjustmentId: r.id } });
    return r.id as string;
  };
  const cancel = async (id: string, actor?: Any): Promise<Any> => {
    try {
      return actor ? await pay.cancelAdjustment(ctx, id, actor) : await pay.cancelAdjustment(ctx, id);
    } catch (e) {
      return { ok: "THROW", reason: msgOf(e).slice(0, 160) };
    }
  };
  const refused = (r: Any) => r?.ok === false && r?.reason === CRM_CANCEL_MSG;
  const rs = (r: Any) => `${r?.ok}:${String(r?.reason ?? "").slice(0, 70)}`;
  const delAudits = (ids: string[]) => P.auditLog.count({ where: { tenantId: tid, action: "hr.payadjust.delete", targetId: { in: ids } } }) as Promise<number>;
  const totalsOf = async (runId: string) => {
    const x = await runAndItems(runId);
    return { x, tot: TOTAL_PAIRS.map(([t]) => Number(x.run?.[t])).join(","), exp: await freshExpect(runId) };
  };

  // S9.1 — ยังไม่เข้ารอบ (APPROVED + PENDING) · ทางไม่มี actor ก่อน แล้วทางมี actor (ฐาน: ทางแรกลบไปแล้ว ⇒ ทางสอง "ไม่พบรายการ")
  {
    const cA = await mkCom({ baht: 500, periodKey: "2030-01" });
    const aA = await link(cA, E, "COMMISSION", "2030-01", 500, true);
    const cP = await mkCom({ baht: 400, periodKey: "2030-01" });
    const aP = await link(cP, E, "COMMISSION", "2030-01", 400, false);
    const res: string[] = [];
    let ok = true;
    for (const [id, cid, st] of [[aA, cA, "APPROVED"], [aP, cP, "PENDING"]] as const) {
      const r0 = await cancel(id);
      const r1 = await cancel(id, OWNER());
      const row = await P.hrPayAdjustment.findUnique({ where: { id } });
      const cm = await P.crmCommission.findUnique({ where: { id: cid } });
      const good = refused(r0) && refused(r1) && row?.status === st && row?.runId === null && row?.crmCommissionId === cid && cm?.hrPayAdjustmentId === id;
      ok &&= good;
      res.push(`${st}: noActor ${rs(r0)} · actor ${rs(r1)} · row=${row ? `${row.status}/${row.runId ?? "free"}` : "DELETED"} link=${cm?.hrPayAdjustmentId === id ? (row ? "intact" : "DANGLING (ชี้แถวที่ถูกลบ ⇒ ตัวกวาด CRM ไม่ส่งซ้ำ)") : `→${cm?.hrPayAdjustmentId ?? "null"}`}`);
    }
    const au = await delAudits([aA, aP]);
    chk("S9.1", ok && au === 0, `ทั้ง 4 ครั้ง ok:false "${CRM_CANCEL_MSG}" · แถวอยู่ · ลิงก์เดิม · audit delete 0`, `${res.join(" | ")} · audit=${au}`);
  }

  // S9.2 — ผูกรอบร่าง
  {
    const cC = await mkCom({ baht: 700, periodKey: "2030-02" });
    const aC = await link(cC, E, "COMMISSION", "2030-02", 700, true);
    await approvedAdj(ctx, F, "2030-02", "BONUS", 300);
    const run = await pay.createPayrollRun(ctx, { periodKey: "2030-02", payDate: D("2030-02-25") });
    const pre = await P.hrPayAdjustment.findUnique({ where: { id: aC } });
    const before = await totalsOf(run.id);
    const au0 = await delAudits([aC]);
    const r0 = await cancel(aC);
    const r1 = await cancel(aC, OWNER());
    const after = await totalsOf(run.id);
    const row = await P.hrPayAdjustment.findUnique({ where: { id: aC } });
    const cm = await P.crmCommission.findUnique({ where: { id: cC } });
    const au1 = await delAudits([aC]);
    const itE = after.x.items.find((i) => i.employeeId === E);
    chk(
      "S9.2",
      pre?.runId === run.id && refused(r0) && refused(r1) && row?.runId === run.id && row?.status === "APPROVED" && cm?.hrPayAdjustmentId === aC &&
        before.tot === after.tot && sameExpect(before.exp, after.exp) && after.x.sumOk && after.x.run?.status === "DRAFT" && after.x.run?.journalEntryId === null && itE?.addSatang === B(700) && au1 === au0,
      `ok:false "${CRM_CANCEL_MSG}" ×2 · ยังผูก · ยอดรวม/ลายนิ้วมือเดิม · Σ ตรง · add E = 70000 · audit +0`,
      `boundAtStart=${pre?.runId === run.id} noActor ${rs(r0)} · actor ${rs(r1)} · row=${row ? `${row.status}/${row.runId === run.id ? "bound" : row.runId}` : "DELETED"} link=${cm?.hrPayAdjustmentId === aC} totals ${before.tot}→${after.tot} digestSame=${before.exp.itemsDigest === after.exp.itemsDigest} sum=${after.x.sumOk} addE=${itE?.addSatang} audit +${au1 - au0}`,
    );
  }

  // S9.3 — หักคืน (DEDUCTION ของแถวถอนคืน CRM แบบ handoffReversal: crmCommissionId = แถว REVERSED) ผูกรอบร่าง
  {
    const cO = await mkCom({ baht: 600, periodKey: "2030-03", status: "PAID" });
    const cR = await mkCom({ baht: -600, periodKey: "2030-04", status: "REVERSED", reversedOfId: cO });
    const aR = await link(cR, E, "DEDUCTION", "2030-04", 600, true);
    const run = await pay.createPayrollRun(ctx, { periodKey: "2030-04", payDate: D("2030-04-25") });
    const pre = await P.hrPayAdjustment.findUnique({ where: { id: aR } });
    const steps: string[] = [`bound=${pre?.runId === run.id}`];
    let ok = pre?.runId === run.id;
    const r0 = await cancel(aR);
    const r1 = await cancel(aR, OWNER());
    const row1 = await P.hrPayAdjustment.findUnique({ where: { id: aR } });
    ok &&= refused(r0) && refused(r1) && row1?.runId === run.id;
    steps.push(`noActor ${rs(r0)} · actor ${rs(r1)} · row=${row1 ? (row1.runId === run.id ? "bound" : "free") : "DELETED"}`);
    const wd = (async () => {
      try {
        return await pay.withdrawCommissionAdjustment(ctx, { adjustmentId: aR, crmCommissionId: cR, statuses: ["PENDING", "APPROVED"] });
      } catch (e) {
        return `THROW ${msgOf(e).slice(0, 80)}`;
      }
    });
    const w1 = await wd();
    const row2 = await P.hrPayAdjustment.findUnique({ where: { id: aR } });
    ok &&= w1 === false && row2?.runId === run.id;
    steps.push(`withdraw(bound)=${w1} row=${row2 ? (row2.runId === run.id ? "bound" : "free") : "DELETED"}`);
    const rc = fnOf("recomputeDraftRun");
    const rr = rc ? await rc(ctx, run.id, OWNER()).catch((e: unknown) => ({ ok: "THROW", reason: msgOf(e) })) : { ok: "MISSING" };
    const x1 = await runAndItems(run.id);
    const ded1 = x1.items.find((i) => i.employeeId === E)?.deductSatang;
    ok &&= rr?.ok === true && x1.sumOk && ded1 === B(600) && x1.run?.status === "DRAFT";
    steps.push(`recompute ${rs(rr)} sum=${x1.sumOk} dedE=${ded1}`);
    const dd = fnOf("deleteDraftRun");
    const dr = dd ? await dd(ctx, run.id, OWNER()).catch((e: unknown) => ({ ok: "THROW", reason: msgOf(e) })) : { ok: "MISSING" };
    const row3 = await P.hrPayAdjustment.findUnique({ where: { id: aR } });
    const w2 = await wd();
    const row4 = await P.hrPayAdjustment.findUnique({ where: { id: aR } });
    ok &&= dr?.ok === true && row3?.runId === null && row3?.status === "APPROVED" && w2 === true && row4 === null;
    steps.push(`deleteDraft ${rs(dr)} row=${row3 ? `${row3.status}/${row3.runId ?? "free"}` : "DELETED"} withdraw(free)=${w2} gone=${row4 === null}`);
    let x2: Awaited<ReturnType<typeof runAndItems>> | null = null;
    try {
      const nr = await pay.createPayrollRun(ctx, { periodKey: "2030-04", payDate: D("2030-04-25") });
      x2 = await runAndItems(nr.id);
    } catch (e) {
      steps.push(`recreate THROW ${msgOf(e).slice(0, 80)}`);
    }
    const ded2 = x2?.items.find((i) => i.employeeId === E)?.deductSatang;
    ok &&= !!x2 && x2.sumOk && ded2 === 0;
    steps.push(`recreate sum=${x2?.sumOk} dedE=${ded2}`);
    chk("S9.3", ok, `ลบถูกปฏิเสธ ×2 · withdraw(ผูก)=false · คำนวณใหม่ Σ ตรง หัก 60000 ครั้งเดียว · ลบร่าง → withdraw=true → รอบใหม่ Σ ตรง หัก 0`, steps.join(" · "));
  }

  // S9.5 — วันที่จ่ายใกล้งวด (CR-H0.2-4)
  {
    const runsAt = async (p: string) => (await P.hrPayrollRun.count({ where: { systemId: hr9.id, periodKey: p } })) as number;
    const tryCreate = async (p: string, d: string): Promise<{ ok: boolean; err: string; name: string; rows: number }> => {
      try {
        await pay.createPayrollRun(ctx, { periodKey: p, payDate: D(d) });
        return { ok: true, err: "", name: "", rows: await runsAt(p) };
      } catch (e) {
        return { ok: false, err: msgOf(e), name: String((e as Error)?.name ?? ""), rows: await runsAt(p) };
      }
    };
    const okCases: [string, string][] = [["2031-03", "2031-03-25"], ["2031-05", "2031-04-05"], ["2031-07", "2031-08-05"]];
    const noCases: [string, string][] = [["2031-09", "1970-01-01"], ["2031-11", "9999-12-31"], ["2032-01", "2032-04-25"]];
    const bad: string[] = [];
    for (const [p, d] of okCases) {
      const r = await tryCreate(p, d);
      if (!(r.ok && r.rows === 1)) bad.push(`OK? ${p}@${d} → ${r.ok ? "ok" : r.err.slice(0, 60)} rows=${r.rows}`);
    }
    for (const [p, d] of noCases) {
      const r = await tryCreate(p, d);
      const isInputErr = r.name === "PayrollInputError" || (typeof pay.PayrollInputError === "function" && r.name === pay.PayrollInputError.name);
      if (!(!r.ok && r.err === PAYDATE_WINDOW_MSG && isInputErr && r.rows === 0)) bad.push(`NO? ${p}@${d} → ${r.ok ? "created" : `${r.name}:${r.err.slice(0, 60)}`} rows=${r.rows}`);
    }
    const act = (await import("@/lib/modules/hr/payroll-actions" as string)) as Any;
    const callAct = async (periodKey: string, payDate: string): Promise<Any> => {
      const fd = new FormData();
      fd.set("systemId", hr9.id);
      fd.set("periodKey", periodKey);
      fd.set("payDate", payDate);
      try {
        return await inScope(cookie, `/app/sys/${hr9.id}/hr/payroll`, () => (act.createPayrollRunAction.length >= 2 ? act.createPayrollRunAction({ ok: true }, fd) : act.createPayrollRunAction(fd)));
      } catch (e) {
        return { status: "THROW", message: `${(e as Error)?.name}: ${msgOf(e).slice(0, 120)}` };
      }
    };
    for (const [p, d] of [["2032-03", "1970-01-01"], ["2032-05", "9999-12-31"]] as const) {
      const r = await callAct(p, d);
      const n = await runsAt(p);
      if (!(r?.ok === false && r?.reason === PAYDATE_WINDOW_MSG && n === 0)) bad.push(`action ${p}@${d} → ${short(r, 120)} rows=${n}`);
    }
    {
      const r = await callAct("2032-07", "2032-07-25");
      const n = await runsAt("2032-07");
      if (!(r?.ok === true && n === 1)) bad.push(`action OK? 2032-07@2032-07-25 → ${short(r, 120)} rows=${n}`);
    }
    chk("S9.5", bad.length === 0, `ในช่วง ok ×3 (+action ok) · นอกช่วง ×3 → PayrollInputError "${PAYDATE_WINDOW_MSG}" 0 แถว · action ×2 → reason ตรง 0 แถว`, bad.join(" | ") || "—");
  }
}

// ── X9 race: CRM withdraw ∥ คำนวณร่างใหม่ ∥ approve (expect สด) ──
async function groupX9(): Promise<void> {
  console.log("── X9 race · CRM withdraw ∥ recompute ∥ approve(expect สด) (worker processes · 3 รอบ) ──");
  const ROUNDS = 3;
  const PER = 3;
  const hr9x = await sys.createSystem(tid, "HR", "HR X9");
  const cx = { tenantId: tid, systemId: hr9x.id };
  const E = await mkEmp(cx, "X9-E พนักงานขาย", 25_000);
  await mkEmp(cx, "X9-F", 15_000);
  const COM = B(3_000);
  const BONUS = B(1_000);
  const periods = ["2033-01", "2033-03", "2033-05"];
  const fx: { p: string; runId: string; cid: string; adj: string; expect: Any }[] = [];
  for (const p of periods) {
    await approvedAdj(cx, E, p, "BONUS", 1_000);
    const run = await pay.createPayrollRun(cx, { periodKey: p, payDate: D(`${p}-25`) });
    const cid = `qch02${RAND}x9${p.replace("-", "")}`;
    await P.crmCommission.create({ data: { id: cid, tenantId: tid, systemId: `qc-h02-crm-${RAND}`, dealId: `qc-h02-deal-x9-${RAND}`, ruleId: `qc-h02-rule-${RAND}`, userId: `qc-h02-seller-${RAND}`, amountSatang: BigInt(COM), basisSatang: BigInt(COM * 10), basis: "PAID", status: "APPROVED", periodKey: p, refId: cid } });
    // fixture ตรง: แถว CRM ที่ APPROVED แต่ยังไม่ผูก ในงวดที่มีรอบร่างแล้ว (เช่น พนักงานยังไม่มีโปรไฟล์ตอนสร้างรอบ — C3.3-fix H4/H5) ·
    //   ทางยื่นปฏิเสธงวดที่มีรอบแล้ว (R2) ⇒ เขียนตรง · คำนวณใหม่จะดึงมันเข้ารอบ ส่วน CRM อาจถอนมันพร้อมกัน
    const adj = await P.hrPayAdjustment.create({ data: { tenantId: tid, systemId: hr9x.id, employeeId: E, periodKey: p, kind: "COMMISSION", amountSatang: COM, status: "APPROVED", decidedById: ownerId, decidedAt: new Date(), requestedById: "qc-h02-crm-approver", note: "QC H0.2 X9 commission", crmCommissionId: cid } });
    await P.crmCommission.update({ where: { id: cid }, data: { hrPayAdjustmentId: adj.id } });
    fx.push({ p, runId: run.id, cid, adj: adj.id, expect: await freshExpect(run.id) });
  }
  const j0 = await jvCount();
  const startAt = Date.now() + 35_000;
  const gap = 5_000;
  const mk = (calls: (r: number) => Any[]) => ({ startAt, rounds: Array.from({ length: ROUNDS }, (_, r) => ({ atMs: r * gap, calls: calls(r) })) });
  // ลำดับต่อรอบ (ms หลังเวลาเริ่มของรอบ · เลนละ +15ms): r0 คำนวณใหม่นำ (ดึงคอมเข้ารอบ ⇒ approve ต้อง STALE · withdraw ต้อง false) ·
  //   r1 withdraw นำ แล้วคำนวณใหม่ แล้ว approve · r2 พร้อมกันหมด
  const DELAY: Record<string, number[]> = { W: [400, 0, 0], R: [0, 150, 0], A: [400, 400, 0] };
  const at = (k: string, r: number, l: number) => DELAY[k]![r]! + (DELAY[k]![r]! > 0 || r === 1 ? l * 15 : 0);
  const wW = mk((r) => Array.from({ length: PER }, (_, l) => ({ tag: "W", fn: "withdraw", ctx: cx, id: fx[r]!.adj, cid: fx[r]!.cid, delayMs: at("W", r, l) })));
  const wR = mk((r) => Array.from({ length: PER }, (_, l) => ({ tag: "R", fn: "recompute", ctx: cx, runId: fx[r]!.runId, actor: OWNER(), delayMs: at("R", r, l) })));
  const wA = mk((r) => Array.from({ length: PER }, (_, l) => ({ tag: "A", fn: "approve", ctx: cx, runId: fx[r]!.runId, expect: fx[r]!.expect, delayMs: at("A", r, l) })));
  const [ow, or, oa] = await Promise.all([spawnWorker(wW), spawnWorker(wR), spawnWorker(wA)]);
  const lateOrErr = [ow, or, oa].filter((w) => w.late || w.err).map((w) => w.err ?? "late");
  const bad: string[] = [];
  let approved = 0;
  const outcomes: string[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const f = fx[r]!;
    const lanes = (o: { out: string[] }) => o.out.slice(r * PER, (r + 1) * PER);
    const w = lanes(ow);
    const a = lanes(oa);
    const rc = lanes(or);
    const nTrue = w.filter((o) => o === "W:TRUE:").length;
    const aOk = a.filter((o) => o.startsWith("A:OK:")).length;
    const outBad = [...w.filter((o) => o !== "W:TRUE:" && o !== "W:FALSE:"), ...a.filter((o) => !(o.startsWith("A:OK:") || (o.startsWith("A:NO:") && THAI.test(o)))), ...rc.filter((o) => !(o.startsWith("R:OK:") || (o.startsWith("R:NO:") && THAI.test(o))))];
    const x = await runAndItems(f.runId);
    const row = await P.hrPayAdjustment.findUnique({ where: { id: f.adj } });
    const crmRows = (await P.hrPayAdjustment.count({ where: { tenantId: tid, crmCommissionId: f.cid } })) as number;
    const bound = !!row && row.runId === f.runId;
    const itE = x.items.find((i) => i.employeeId === E);
    const now = await freshExpect(f.runId);
    const tag = `r${r}(${x.run?.status} W=${nTrue} A=${aOk} row=${row ? (bound ? "bound" : "free") : "gone"})`;
    outcomes.push(`${tag} R=${short(rc.map((o) => o.split(":").slice(0, 2).join(":")))}`);
    if (outBad.length) bad.push(`${tag} out=${short(outBad.slice(0, 2), 120)}`);
    if (nTrue > 1 || (nTrue === 1 && row) || (nTrue === 0 && !row)) bad.push(`${tag} withdraw≠row`);
    if (crmRows > 1) bad.push(`${tag} crmRows=${crmRows}`);
    if (itE?.addSatang !== BONUS + (bound ? COM : 0)) bad.push(`${tag} addE=${itE?.addSatang} want ${BONUS + (bound ? COM : 0)} (นับคอมมิชชันผิด)`);
    if (!x.sumOk) bad.push(`${tag} Σ≠ยอดรวม ${x.diff.join(",")}`);
    if (x.run?.status === "APPROVED") {
      approved += 1;
      const bal = await jvBalance(x.run.journalEntryId);
      if (!sameExpect(now, f.expect)) bad.push(`${tag} JV ของรอบที่แถวเปลี่ยน (expect ${f.expect.totalNetSatang}/${f.expect.itemCount} → now ${now.totalNetSatang}/${now.itemCount} digestSame=${now.itemsDigest === f.expect.itemsDigest})`);
      if (!(bal.dr === bal.cr && bal.dr > 0)) bad.push(`${tag} JV dr/cr ${bal.dr}/${bal.cr}`);
      if (bound) bad.push(`${tag} คอมมิชชันที่ไม่อยู่ในตัวเลขที่อนุมัติ ถูกผูกกับรอบที่อนุมัติแล้ว`);
      if (aOk !== 1) bad.push(`${tag} approve ok ${aOk}≠1`);
    } else if (x.run?.status === "DRAFT") {
      if (x.run.journalEntryId !== null) bad.push(`${tag} DRAFT มี JV`);
      if (aOk !== 0) bad.push(`${tag} approve ok ${aOk} แต่ยัง DRAFT`);
    } else bad.push(`${tag} สถานะ ${x.run?.status}`);
  }
  console.log(`   X9 outcomes: ${outcomes.join(" · ")}`);
  const j1 = await jvCount();
  if (j1 - j0 !== approved) bad.push(`JV +${j1 - j0} ≠ APPROVED ${approved}`);
  const outs = `${ow.out.length}/${or.out.length}/${oa.out.length}`;
  chk(
    "X9.1",
    lateOrErr.length === 0 && ow.out.length === ROUNDS * PER && or.out.length === ROUNDS * PER && oa.out.length === ROUNDS * PER && bad.length === 0,
    "ทุกรอบ: APPROVED ⇒ แถว = ตัวเลขที่ expect · Dr = Cr · คอมมิชชันไม่ผูก | DRAFT ⇒ ไม่มี JV · add = โบนัส + คอม (ถ้าผูก) · withdraw true ⇔ แถวหาย · Σ ตรง",
    `${lateOrErr.join(" | ").slice(0, 160)} outs=${outs} approved=${approved} ${bad.slice(0, 5).join(" · ")}`,
  );
}

// ═════════════════════════ cleanup + residue ═════════════════════════
const ORDERED = [
  "hrPayrollItem", "hrPayrollRun", "hrPayAdjustment", "hrSalaryProfile", "hrAttendance", "hrLeave", "hrEmployeeDoc", "hrEmployee",
  "accountJournalLine", "accountJournalEntry", "auditLog", "outboxEvent", "appNotification", "opsLog", "party", "membership", "appSystemUnit",
];
let TENANT_MODELS: string[] = [];
async function loadTenantModels(): Promise<string[]> {
  // ทุกตารางที่มีคอลัมน์ tenantId (จาก DMMF ของ Prisma client) — ใช้ลบ + นับ residue ทั้งฐาน
  const pc = (await import("@prisma/client" as string).catch(() => null)) as Any;
  const models = (pc?.Prisma?.dmmf?.datamodel?.models ?? []) as Any[];
  return models.filter((m) => (m?.fields ?? []).some((f: Any) => f?.name === "tenantId")).map((m) => String(m.name).charAt(0).toLowerCase() + String(m.name).slice(1));
}
async function cleanup(): Promise<void> {
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* ลบต่อ */
    }
  };
  const all = TENANT_MODELS;
  for (const id of tenants) {
    for (const m of ORDERED) await d(() => P[m]?.deleteMany({ where: { tenantId: id } }));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < all.length; i += 10) await Promise.all(all.slice(i, i + 10).map((m) => d(() => P[m]?.deleteMany({ where: { tenantId: id } }))));
    }
    await d(() => P.appSystem.deleteMany({ where: { tenantId: id } }));
  }
  for (const id of tenants) await d(() => P.tenant.delete({ where: { id } }));
  for (const uid of users) {
    await d(() => P.session.deleteMany({ where: { userId: uid } }));
    await d(() => P.appNotification.deleteMany({ where: { recipientUserId: uid } }));
    await d(() => P.membership.deleteMany({ where: { userId: uid } }));
    await d(() => P.user.delete({ where: { id: uid } }));
  }
}

let crashed = "";
TENANT_MODELS = await loadTenantModels();
try {
  runStatic();
  runStaticS9(); // Oracle round 2
  await setupTenant();
  for (const g of [groupS1, groupS2, groupS3, groupS4, groupX6, groupS9, groupX9]) {
    try {
      await g();
    } catch (e) {
      const m = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
      crashed ||= `${g.name}: ${m}`;
      console.log(`💥 ${g.name}: ${m}`);
    }
  }
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await cleanup();
  } catch (e) {
    console.log(`💥 cleanup: ${msgOf(e).slice(0, 200)}`);
  }
}
const residue: string[] = [];
const models = TENANT_MODELS;
for (const id of tenants) {
  for (let i = 0; i < models.length; i += 10) {
    const counts = await Promise.all(models.slice(i, i + 10).map(async (m) => [m, await P[m].count({ where: { tenantId: id } }).catch(() => 0)] as const));
    for (const [m, n] of counts) if (n !== 0) residue.push(`${m}=${n}`);
  }
}
const leftTenants = await P.tenant.count({ where: { slug: { startsWith: SLUG } } }).catch(() => -1);
const leftUsers = users.length ? await P.user.count({ where: { id: { in: users } } }).catch(() => -1) : 0;
chk("Z1", residue.length === 0 && leftTenants === 0 && leftUsers === 0 && tenants.length === 2 && models.length > 50, "0 แถว · 0 tenant · 0 user", `models=${models.length} tenants=${tenants.length} left=${leftTenants} users=${leftUsers} ${residue.join(",")}`);
for (const [k] of CHECKS) if (!results.has(ID(k))) chk(k, false, "ถูกตรวจ", crashed ? `ไม่ถึง (ล้ม: ${crashed.slice(0, 120)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, missing: skipReasons, crashed: crashed ? crashed.slice(0, 160) : null })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
