// QC WO 6.1 — ผังบัญชี V2 — DESIGN-SPEC-V2 §11.1 · เฟรม f8-chart-of-accounts.png
//
// requires: acc-v2-seed (seed สร้างบัญชีสร้างเอง 6301/4031 + บัญชีปิดใช้งาน 6302 ไว้ให้ — บล็อก 8.9)
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-coa.mts
//
// 🔴 ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** — การเขียนทั้งหมด (สร้าง/ปิด/กู้คืน/นำเข้า CSV/guard/
//    แยกร้าน) เกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเองแล้วลบใน finally (กติกาเดียวกับ WO 5.3/5.4)
//
// ครอบคลุม
//   T1  ต้นไม้: จำนวนบัญชีทั้งหมด/ต่อหมวด/ต่อหมวดรอง = เฉลย SQL อิสระ · ทุกโหนดมีระดับถูกต้อง (1→2→3→บัญชี)
//   T2  ค้นหา: ตรงรหัส · ตรงชื่อไทย · ตรงชื่ออังกฤษ · ไม่เจอ = ต้นไม้ว่าง
//   T3  รายละเอียด: ยอดคงเหลือ/เคลื่อนไหวเดือนนี้ของ 3 บัญชีตัวอย่าง = เฉลย SQL อิสระ **และ** = งบทดลอง (reports.ts)
//   T4  เคลื่อนไหวล่าสุด 5 แถว: เรียงใหม่→เก่า · ยอดสะสมแถวบนสุด = ยอดคงเหลือ · ถอยหลังถูกต้องทุกแถว
//   T5  ป้าย/ฟิลด์: บัญชีระบบ · ผูกกับช่องทางเงิน · หมวดหลัก/รอง/ย่อย · WHT/ภาษี/คำอธิบายของบัญชีที่ seed ตั้งไว้
//   T6  ตรรกะบริสุทธิ์: ช่วงรหัสของหมวดย่อย · codeInRange · ยอดตามธรรมชาติของหมวด · validate ฟอร์ม
//   T7  ร้านทิ้ง — สร้างบัญชี: รหัสถูกช่วง (ok) · นอกช่วง (ปฏิเสธ) · รหัสซ้ำ (ปฏิเสธ) · ชื่อว่าง (ปฏิเสธ)
//   T8  ร้านทิ้ง — ปิดใช้งาน: มีรายการในสมุดรายวัน / ผูก mapping / ผูกช่องทางเงิน / บัญชีระบบ = ปฏิเสธพร้อมเหตุผลไทย
//   T9  ร้านทิ้ง — ปิด+กู้คืนบัญชีที่ยังไม่ถูกใช้ (ปิดแล้วหายจากต้นไม้ · กู้คืนแล้วกลับมา)
//   T10 ร้านทิ้ง — นำเข้า CSV: พรีวิวจับรหัสซ้ำ + รหัสนอกช่วง · นำเข้าจริงได้ 8 · นำเข้าซ้ำได้ 0 (idempotent)
//   T11 บัญชีที่ปักหมุด (pinned) ยังทำงานเหมือนเดิมหลังเขียนหน้าใหม่ (หน้าหลัก §4)
//   T12 guard: staff ที่ไม่มี account.chart.manage / account.import ถูกปฏิเสธ
//   T13 แยกร้าน: ledgerDetail/setLedgerActive ของอีกร้านแตะไม่ได้
//   T14 ยอด "ณ วันที่" (asOf): รายการที่ลงวันที่ล่วงหน้ายังไม่ถูกนับ · เดือนนี้นับถึงวันนี้เท่านั้น
//   T15 หน้าบัญชีแยกประเภท (ledgerRunning — ปลายทางลิงก์ "ดูบัญชีแยกประเภท") ต้องได้ยอดเท่ากับแผงขวา
//       แม้บัญชีนั้นมีใบสำคัญที่ถูกกลับรายการ (บั๊กเดิม: กรอง status=POSTED เหลือแต่ขากลับ)

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const glMod = await import("@/lib/modules/account/gl");
const finMod = await import("@/lib/modules/account/finance");
const coa = await import("@/lib/modules/account/coa");
const coaV2 = await import("@/lib/modules/account/coa-v2");
const reports = await import("@/lib/modules/account/reports");
const dash = await import("@/lib/modules/account/dashboard-home");
const importActions = await import("@/lib/modules/account/import-actions");
const { assertAccountCan } = await import("@/lib/modules/account/access");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => {
  passed++;
  console.log("  ✅ " + name);
};
const bad = (name: string, detail: string) => {
  findings.push(`${name} — ${detail}`);
  console.log("  ❌ " + name + " — " + detail);
};
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};
/** คาดว่า "ต้องถูกปฏิเสธ" — ok:false หรือโยน error ก็นับว่าผ่าน */
const rejected = async (name: string, fn: () => Promise<{ ok: boolean; reason?: string }>, contains?: string) => {
  try {
    const r = await fn();
    if (r.ok) return bad(name, "ผ่านทั้งที่ควรถูกปฏิเสธ");
    if (contains && !(r.reason ?? "").includes(contains)) return bad(name, `เหตุผล "${r.reason}" ไม่มีคำว่า "${contains}"`);
    return ok(name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (contains && !msg.includes(contains)) return bad(name, `error "${msg}" ไม่มีคำว่า "${contains}"`);
    return ok(name);
  }
};

console.log(`\n===== QC WO 6.1 · ผังบัญชี V2 (§11.1 · f8) =====`);
console.log(`🗄️  DB QC: ${host}\n`);

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as {
  tenantId: string;
  systemId: string;
  coa?: {
    monthKey: string;
    activeAccounts: number;
    byType: Record<string, number>;
    byGroup2: Record<string, number>;
    samples: { code: string; id: string; balanceSatang: number; monthDeltaSatang: number }[];
    custom: { onlineAds: string; rentalIncome: string; archived: string };
  };
  finance?: Record<string, number>;
};
if (!E.coa) {
  console.error("❌ เฉลยยังไม่มีคีย์ coa — รัน scripts/seed-acc-v2-qc.mts ใหม่ก่อน");
  process.exit(1);
}
const tenantId = E.tenantId;
const systemId = E.systemId;
const ctx = { tenantId, systemId };
const COA = E.coa;
// 🔴 WO 6.1 รอบ 2: ยอดคิด "ณ วันที่" (asOf) แล้ว — ข้อสอบต้องตรึง asOf ที่ QC.today (วันอ้างอิงของชุดข้อมูล)
//    ไม่งั้นตัวเลขจะขยับตามนาฬิกาเครื่องที่รัน (ชุด QC มีรายการถึง 30 ก.ย. แต่วันนี้อาจเป็นต้นเดือน)
const ASOF = new Date(`${QC.today}T12:00:00+07:00`);

let sTenantId: string | null = null;

try {
  // ═════════ T1 — ต้นไม้ ═════════
  console.log("T1 ต้นไม้ผังบัญชี:");
  const tree = await coa.chartTree(ctx, { asOf: ASOF });
  eq("T1.1 จำนวนบัญชีที่เปิดใช้งาน = เฉลย SQL", tree.grandTotal, COA.activeAccounts);
  const byTypeActual: Record<string, number> = {};
  for (const g1 of tree.nodes) {
    const type = coaV2.CHART_TYPE_ORDER.find((t) => coaV2.CHART_TYPE_DIGIT[t] === g1.code)!;
    // นับเฉพาะบัญชีที่เปิดใช้งาน (ต้นไม้รวมที่ปิดไว้ด้วย — เฉลย SQL นับเฉพาะที่เปิด)
    let n = 0;
    for (const g2 of g1.children)
      if (g2.kind === "group")
        for (const g3 of g2.children)
          if (g3.kind === "group") for (const a of g3.children) if (a.kind === "account" && !a.archived) n++;
    byTypeActual[type] = n;
  }
  eq("T1.2 จำนวนต่อหมวด (ระดับ 1) = เฉลย SQL", byTypeActual, COA.byType);

  const byGroup2Actual: Record<string, number> = {};
  for (const g1 of tree.nodes)
    for (const g2 of g1.children)
      if (g2.kind === "group") {
        let n = 0;
        for (const g3 of g2.children)
          if (g3.kind === "group") for (const a of g3.children) if (a.kind === "account" && !a.archived) n++;
        byGroup2Actual[g2.code] = (byGroup2Actual[g2.code] ?? 0) + n;
      }
  eq("T1.3 จำนวนต่อหมวดรอง (ระดับ 2) = เฉลย SQL", byGroup2Actual, COA.byGroup2);

  let levelsOk = true;
  let leafCount = 0;
  for (const g1 of tree.nodes) {
    if (g1.level !== 1) levelsOk = false;
    for (const g2 of g1.children) {
      if (g2.kind !== "group" || g2.level !== 2) levelsOk = false;
      else
        for (const g3 of g2.children) {
          if (g3.kind !== "group" || g3.level !== 3) levelsOk = false;
          else
            for (const a of g3.children) {
              if (a.kind !== "account" || a.level !== 4) levelsOk = false;
              else leafCount++;
            }
        }
    }
  }
  assert("T1.4 ทุกโหนดมีระดับถูกต้อง 1 › 2 › 3 › บัญชี", levelsOk);
  eq("T1.5 จำนวนใบทั้งหมด (รวมที่ปิดใช้งาน) = total ของต้นไม้", leafCount, tree.total);
  eq("T1.6 มีบัญชีที่ปิดใช้งาน 1 ใบ (6302 จาก seed)", tree.total - tree.grandTotal, 1);
  eq("T1.7 หมวดระดับ 1 ครบ 6 หมวดตาม f8", tree.nodes.map((n) => `${n.code}:${n.name}`), [
    "1:สินทรัพย์",
    "2:หนี้สิน",
    "3:ส่วนของเจ้าของ",
    "4:รายได้",
    "5:ต้นทุนขาย",
    "6:ค่าใช้จ่าย",
  ]);

  // ═════════ T2 — ค้นหา ═════════
  console.log("\nT2 ค้นหา:");
  const byCode = await coa.chartTree(ctx, { q: "1150", asOf: ASOF });
  eq("T2.1 ค้นด้วยรหัส 1150 เจอ 1 บัญชี", byCode.total, 1);
  const byName = await coa.chartTree(ctx, { q: "โฆษณา", asOf: ASOF });
  eq("T2.2 ค้นด้วยชื่อไทย 'โฆษณา' เจอ 3 (6300 + 6301 + 6302 ที่ปิดใช้งาน)", byName.total, 3);
  const byEn = await coa.chartTree(ctx, { q: "Online Advertising", asOf: ASOF });
  eq("T2.3 ค้นด้วยชื่ออังกฤษเจอ 1", byEn.total, 1);
  const none = await coa.chartTree(ctx, { q: "ไม่มีบัญชีชื่อนี้แน่นอน", asOf: ASOF });
  eq("T2.4 ค้นไม่เจอ = ต้นไม้ว่าง", [none.total, none.nodes.length], [0, 0]);
  eq("T2.5 ค้นไม่เจอ แต่ตัวนับหัวข้อยังเป็นจำนวนบัญชีทั้งหมด", none.grandTotal, COA.activeAccounts);

  // ═════════ T3 — ยอดคงเหลือ/เคลื่อนไหวเดือนนี้ ═════════
  console.log("\nT3 ยอดคงเหลือ + เคลื่อนไหวเดือนนี้:");
  const tb = await reports.trialBalance(ctx, "2000-01", "2100-12");
  for (const s of COA.samples) {
    const d = await coa.ledgerDetail(ctx, s.id, { asOf: ASOF });
    if (!d) {
      bad(`T3 ${s.code} — ไม่พบบัญชี`, "ledgerDetail คืน null");
      continue;
    }
    eq(`T3.1 ${s.code} ยอดคงเหลือ = เฉลย SQL อิสระ`, d.balanceSatang, s.balanceSatang);
    eq(`T3.2 ${s.code} เคลื่อนไหวเดือนนี้ = เฉลย SQL อิสระ`, d.monthDeltaSatang, s.monthDeltaSatang);
    const row = tb.rows.find((r) => r.code === s.code);
    const tbNatural = row ? (row.closingDebit || 0) - (row.closingCredit || 0) : 0;
    const want = d.type === "LIABILITY" || d.type === "EQUITY" || d.type === "INCOME" ? -tbNatural : tbNatural;
    eq(`T3.3 ${s.code} ยอดคงเหลือ = งบทดลอง (reports.trialBalance)`, d.balanceSatang, want);
  }
  const cash = COA.samples.find((s) => s.code === "1000-01");
  if (cash && E.finance?.CSH001 != null)
    eq("T3.4 บัญชีลูกของช่องทางเงินสด = ยอดช่องทาง CSH001 ในเฉลย", cash.balanceSatang, E.finance.CSH001);

  // ═════════ T4 — เคลื่อนไหวล่าสุด ═════════
  console.log("\nT4 เคลื่อนไหวล่าสุด 5 แถว:");
  const cashDetail = await coa.ledgerDetail(ctx, COA.samples.find((s) => s.code === "1000-01")!.id, { asOf: ASOF });
  if (!cashDetail) throw new Error("ไม่พบบัญชีเงินสด 1000-01");
  eq("T4.1 คืนมาไม่เกิน 5 แถว", cashDetail.movements.length, 5);
  const dates = cashDetail.movements.map((m) => new Date(m.date).getTime());
  assert("T4.2 เรียงวันที่ใหม่→เก่า", dates.every((d, i) => i === 0 || dates[i - 1] >= d));
  eq("T4.3 ยอดสะสมแถวบนสุด = ยอดคงเหลือปัจจุบัน", cashDetail.movements[0].runningSatang, cashDetail.balanceSatang);
  let runningOk = true;
  for (let i = 1; i < cashDetail.movements.length; i++) {
    const prev = cashDetail.movements[i - 1];
    const expectPrev = cashDetail.movements[i].runningSatang + (prev.debit - prev.credit);
    if (expectPrev !== prev.runningSatang) runningOk = false;
  }
  assert("T4.4 ยอดสะสมถอยหลังตรงทุกแถว (คงเหลือ − เดบิต + เครดิต)", runningOk);
  const lineIds = cashDetail.movements.map((m) => m.id);
  eq("T4.5 ไม่มีบรรทัดซ้ำ", new Set(lineIds).size, lineIds.length);

  // ═════════ T5 — ป้าย/ฟิลด์ ═════════
  console.log("\nT5 ป้ายและฟิลด์ในแผงขวา:");
  const adsDetail = await coa.ledgerDetail(ctx, COA.custom.onlineAds, { asOf: ASOF });
  if (!adsDetail) throw new Error("ไม่พบบัญชี 6301");
  eq("T5.1 6301 หมวดหลัก/รอง/ย่อย", [adsDetail.group1.code, adsDetail.group2.code, adsDetail.group3.code], ["6", "63", "630"]);
  eq("T5.2 6301 ชื่อหมวดย่อยจากตารางชื่อ", adsDetail.group3.name, "ค่าการตลาดและโฆษณา");
  eq("T5.3 6301 อัตราหัก ณ ที่จ่ายเริ่มต้น = 2% ค่าโฆษณา", coaV2.whtLabel(adsDetail.defaultWhtRateBp, adsDetail.defaultWhtType), "2% · ค่าโฆษณา");
  eq("T5.4 6301 ประเภทภาษี = ภาษีซื้อขอคืนได้", coaV2.vatTreatmentLabel(adsDetail.vatTreatment), "ภาษีซื้อขอคืนได้");
  eq("T5.5 6301 ไม่ใช่บัญชีระบบ + ไม่ผูกช่องทางเงิน", [adsDetail.isSystem, adsDetail.finance], [false, null]);
  eq("T5.6 6301 ปิดใช้งานได้ (ยังไม่ถูกใช้)", adsDetail.blockReason, null);

  const cashChild = cashDetail;
  assert("T5.7 บัญชีลูกช่องทางเงิน มีป้าย 'ผูกกับบัญชีเงิน'", !!cashChild.finance);
  eq("T5.8 ชื่อช่องทางเงินที่ผูก", cashChild.finance?.code, "CSH001");
  eq("T5.9 บัญชีลูกช่องทางเงิน ปิดใช้งานไม่ได้ (ผูกช่องทาง)", cashChild.blockReason, "ปิดใช้งานไม่ได้ เพราะบัญชีนี้ผูกกับช่องทางเงินอยู่ — ปิดช่องทางเงินก่อน");

  const vatInput = await prisma.accountLedger.findFirstOrThrow({ where: { systemId, code: "1150" }, select: { id: true } });
  const vatDetail = await coa.ledgerDetail(ctx, vatInput.id, { asOf: ASOF });
  assert("T5.10 1150 เป็นบัญชีระบบ", !!vatDetail?.isSystem);
  assert("T5.11 1150 มี mapping VAT_INPUT", (vatDetail?.mappingKeys ?? []).includes("VAT_INPUT"));

  const archivedDetail = await coa.ledgerDetail(ctx, COA.custom.archived, { asOf: ASOF });
  assert("T5.12 6302 อยู่ในสถานะปิดใช้งาน", !!archivedDetail?.archivedAt);

  // ═════════ T6 — ตรรกะบริสุทธิ์ ═════════
  console.log("\nT6 ตรรกะบริสุทธิ์ (ช่วงรหัส/ยอดตามธรรมชาติ/validate):");
  eq("T6.1 ช่วงรหัสของหมวดย่อย 630 = 6300–6309", coaV2.codeRangeOf("630"), { min: "6300", max: "6309" });
  eq("T6.2 6305 อยู่ในช่วง 630", coaV2.codeInRange("6305", "630"), true);
  eq("T6.3 6410 ไม่อยู่ในช่วง 650", coaV2.codeInRange("6410", "650"), false);
  eq("T6.4 ยอดตามธรรมชาติ: สินทรัพย์ = Dr−Cr", coaV2.naturalAmount("ASSET", 1000, 400), 600);
  eq("T6.5 ยอดตามธรรมชาติ: รายได้ = Cr−Dr", coaV2.naturalAmount("INCOME", 400, 1000), 600);
  eq("T6.6 levelOf: level=null = บัญชี (ระดับ 4)", coaV2.levelOf({ level: null }), 4);
  const vBad = coaV2.validateLedgerInput({ code: "6410", name: "ทดสอบ", groupPrefix: "650" });
  assert("T6.7 validate: รหัสนอกช่วงมี error ที่ช่องรหัส", !!vBad.code && vBad.code.includes("6500–6509"));
  const vEmpty = coaV2.validateLedgerInput({ code: "", name: "", groupPrefix: "" });
  eq("T6.8 validate: กรอกว่าง = error 3 ช่อง", Object.keys(vEmpty).sort(), ["code", "groupPrefix", "name"]);
  const vOk = coaV2.validateLedgerInput({ code: "6305", name: "ทดสอบ", groupPrefix: "630" });
  eq("T6.9 validate: ข้อมูลถูกต้อง = ไม่มี error", vOk, {});

  // ═════════ ร้านทิ้ง (การเขียนทั้งหมด) ═════════
  console.log("\n── สร้างร้านทดสอบ (สร้าง/ปิด/กู้คืน/นำเข้า CSV) ──");
  const stamp = Date.now();
  const tag = `qc-coa-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const tid = sTenantId;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" },
  });
  const accSys = await sysMod.createSystem(tid, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(tid, accSys.id, unit.id);
  const sSystemId = accSys.id;
  const S = { tenantId: tid, systemId: sSystemId };
  await glMod.ensureAccounting(S);

  // ═════════ T7 — สร้างบัญชี ═════════
  console.log("\nT7 เพิ่มบัญชี (ตรวจรหัสตามช่วงของหมวดย่อย):");
  const c1 = await coa.createLedgerV2(S, { code: "6305", name: "ค่าอีเวนต์ออกบูธ", nameEn: "Event Booth", groupPrefix: "630" });
  assert("T7.1 รหัสในช่วงของหมวดย่อย = สร้างได้", c1.ok);
  const created1 = c1.ok ? c1.id : "";
  const c1row = await prisma.accountLedger.findUniqueOrThrow({ where: { id: created1 } });
  eq("T7.2 ประเภทสืบทอดจากหมวด (630 → ค่าใช้จ่าย)", c1row.type, "EXPENSE");
  eq("T7.3 บัญชีที่สร้างเองไม่ใช่บัญชีระบบ + level = 4", [c1row.isSystem, c1row.level], [false, 4]);
  const c2 = await coa.createLedgerV2(S, { code: "6410", name: "นอกช่วง", groupPrefix: "650" });
  assert("T7.4 รหัสนอกช่วงของหมวดย่อย = ปฏิเสธ", !c2.ok && !!(c2 as { fields: Record<string, string> }).fields.code);
  const c3 = await coa.createLedgerV2(S, { code: "6305", name: "ซ้ำ", groupPrefix: "630" });
  assert(
    "T7.5 รหัสซ้ำ = ปฏิเสธ พร้อมข้อความไทย",
    !c3.ok && ((c3 as { fields: Record<string, string> }).fields.code ?? "").includes("มีรหัสบัญชี 6305 อยู่แล้ว"),
  );
  const c4 = await coa.createLedgerV2(S, { code: "6306", name: "   ", groupPrefix: "630" });
  assert("T7.6 ชื่อว่าง = ปฏิเสธ", !c4.ok);
  const c5 = await coa.createLedgerV2(S, { code: "63x5", name: "รหัสมีตัวอักษร", groupPrefix: "630" });
  assert("T7.7 รหัสไม่ใช่ตัวเลข = ปฏิเสธ", !c5.ok);
  const u1 = await coa.updateLedgerV2(S, created1, {
    code: "6305",
    name: "ค่าอีเวนต์ออกบูธ (แก้ชื่อ)",
    groupPrefix: "630",
    description: "ค่าเช่าพื้นที่ + ค่าตกแต่งบูธ",
    defaultWhtRateBp: 500,
    defaultWhtType: "SERVICE",
    vatTreatment: "NON_CLAIMABLE",
  });
  assert("T7.8 แก้ไขบัญชีสำเร็จ", u1.ok);
  const afterU = await coa.ledgerDetail(S, created1);
  eq("T7.9 ฟิลด์ใหม่ถูกบันทึกครบ", [afterU?.defaultWhtRateBp, afterU?.defaultWhtType, afterU?.vatTreatment, afterU?.description], [500, "SERVICE", "NON_CLAIMABLE", "ค่าเช่าพื้นที่ + ค่าตกแต่งบูธ"]);
  const sysLedger = await prisma.accountLedger.findFirstOrThrow({ where: { systemId: sSystemId, code: "6100" }, select: { id: true } });
  const uSys = await coa.updateLedgerV2(S, sysLedger.id, { code: "6105", name: "ค่าเช่า (ย้ายรหัส)", groupPrefix: "610" });
  assert("T7.10 บัญชีระบบเปลี่ยนรหัสไม่ได้", !uSys.ok);
  const uSysName = await coa.updateLedgerV2(S, sysLedger.id, { code: "6100", name: "ค่าเช่าสำนักงาน", groupPrefix: "610" });
  assert("T7.11 บัญชีระบบแก้ชื่อได้", uSysName.ok);

  // ═════════ T8 — ปิดใช้งานไม่ได้ ═════════
  console.log("\nT8 ปิดใช้งาน — กรณีที่ต้องถูกปฏิเสธ:");
  // (ก) บัญชีที่มีรายการในสมุดรายวัน — ลง JV มือ 1 ใบ (Dr 6305 / Cr 2100)
  const apLedger = await prisma.accountLedger.findFirstOrThrow({ where: { systemId: sSystemId, code: "2100" }, select: { id: true } });
  await glMod.postManualJV(S, {
    date: new Date("2026-09-02T10:00:00+07:00"),
    memo: "ทดสอบบัญชีที่มีรายการ",
    postedById: owner.id,
    lines: [
      { accountId: created1, debit: 10_000, credit: 0 },
      { accountId: apLedger.id, debit: 0, credit: 10_000 },
    ],
  });
  await rejected("T8.1 บัญชีที่มีรายการในสมุดรายวัน = ปิดไม่ได้", () => coa.setLedgerActive(S, created1, false), "มีรายการเคลื่อนไหวในสมุดรายวัน");
  // (ข) บัญชีที่ผูก mapping อัตโนมัติ (2100 = AP) — สร้างบัญชีใหม่แล้วผูกแทน (2100 เป็นบัญชีระบบด้วย)
  const mapTarget = await coa.createLedgerV2(S, { code: "6307", name: "ค่าใช้จ่ายที่ผูก mapping", groupPrefix: "630" });
  if (!mapTarget.ok) throw new Error("สร้างบัญชีสำหรับทดสอบ mapping ไม่สำเร็จ");
  await coa.setMapping(S, "EXPENSE_DEFAULT", mapTarget.id);
  await rejected("T8.2 บัญชีที่ระบบใช้ลงบัญชีอัตโนมัติ = ปิดไม่ได้", () => coa.setLedgerActive(S, mapTarget.id, false), "ลงบัญชีอัตโนมัติ");
  // (ค) บัญชีที่ผูกช่องทางเงิน
  const bank = await finMod.createFinanceAccount({ tenantId: tid, systemId: sSystemId, type: "BANK", name: "กสิกรไทย ทดสอบ", bankName: "กสิกรไทย" });
  if (!bank.ok) throw new Error("สร้างช่องทางเงินทดสอบไม่สำเร็จ: " + bank.reason);
  const bankFin = await prisma.accountFinance.findFirstOrThrow({ where: { systemId: sSystemId }, select: { ledgerAccountId: true } });
  await rejected("T8.3 บัญชีที่ผูกช่องทางเงิน = ปิดไม่ได้", () => coa.setLedgerActive(S, bankFin.ledgerAccountId!, false), "ผูกกับช่องทางเงิน");
  // (ง) บัญชีระบบ
  await rejected("T8.4 บัญชีระบบ = ปิดไม่ได้", () => coa.setLedgerActive(S, sysLedger.id, false), "บัญชีระบบ");

  // ═════════ T9 — ปิด + กู้คืน ═════════
  console.log("\nT9 ปิดใช้งาน + กู้คืน (บัญชีที่ยังไม่ถูกใช้):");
  const spare = await coa.createLedgerV2(S, { code: "6308", name: "บัญชีทดลองปิด", groupPrefix: "630" });
  if (!spare.ok) throw new Error("สร้างบัญชีทดลองปิดไม่สำเร็จ");
  const off = await coa.setLedgerActive(S, spare.id, false);
  assert("T9.1 ปิดใช้งานบัญชีที่ยังไม่ถูกใช้ได้", off.ok);
  const treeOff = await coa.chartTree(S, {});
  const inActiveTree = (tr: Awaited<ReturnType<typeof coa.chartTree>>, id: string) =>
    tr.nodes.some((g1) =>
      g1.children.some(
        (g2) =>
          g2.kind === "group" &&
          g2.children.some((g3) => g3.kind === "group" && g3.children.some((a) => a.kind === "account" && a.id === id && !a.archived)),
      ),
    );
  eq("T9.2 บัญชีที่ปิดแล้วไม่นับใน 'N บัญชี'", inActiveTree(treeOff, spare.id), false);
  const detailOff = await coa.ledgerDetail(S, spare.id);
  assert("T9.3 ยังเปิดดูรายละเอียดบัญชีที่ปิดแล้วได้", !!detailOff?.archivedAt);
  const on = await coa.setLedgerActive(S, spare.id, true);
  assert("T9.4 กู้คืนได้", on.ok);
  const treeOn = await coa.chartTree(S, {});
  eq("T9.5 กู้คืนแล้วกลับมาอยู่ในต้นไม้", inActiveTree(treeOn, spare.id), true);
  const onAgain = await coa.setLedgerActive(S, spare.id, true);
  assert("T9.6 กู้คืนซ้ำ = idempotent (ไม่ error)", onAgain.ok);

  // ═════════ T10 — นำเข้าผังบัญชี (CSV) ═════════
  console.log("\nT10 นำเข้าผังบัญชีจาก CSV:");
  const csv = readFileSync("scripts/fixtures/acc-v2/coa-import.csv", "utf8");
  const preview = await importActions.previewImportCore(tid, sSystemId, "chart_of_accounts", csv);
  if (!preview.ok) throw new Error("พรีวิวนำเข้าผังบัญชีล้ม: " + preview.reason);
  eq("T10.1 อ่านได้ 10 แถว", preview.totalRows, 10);
  eq("T10.2 ผ่าน 8 · ผิด 2", [preview.counts.ok, preview.counts.err], [8, 2]);
  const dupRow = preview.previewRows.find((r) => r.reasons.some((x) => x.includes("มีรหัสบัญชี 4910")));
  assert("T10.3 จับรหัสซ้ำกับผังเดิม (4910 ดอกเบี้ยรับ)", !!dupRow && dupRow.status === "err");
  const rangeRow = preview.previewRows.find((r) => r.reasons.some((x) => x.includes("อยู่นอกช่วงของหมวดย่อย")));
  assert("T10.4 จับรหัสนอกช่วงของหมวดย่อย (6410 ในหมวด 650)", !!rangeRow && rangeRow.status === "err");
  const run1 = await importActions.runImportCore(tid, sSystemId, owner.id, "chart_of_accounts", csv, preview.mapping, true);
  if (!run1.ok) throw new Error("นำเข้าผังบัญชีล้ม: " + run1.reason);
  eq("T10.5 นำเข้าจริงได้ 8 บัญชี", run1.created, 8);
  const imported = await prisma.accountLedger.findMany({
    where: { systemId: sSystemId, code: { in: ["1210", "1410", "2140", "4050", "5320", "6110", "6220", "6910"] } },
    select: { code: true, type: true, description: true },
    orderBy: { code: "asc" },
  });
  eq("T10.6 บัญชีที่นำเข้าอยู่ใน DB ครบ 8", imported.length, 8);
  eq("T10.7 ประเภทบัญชีมาจากคอลัมน์ประเภท (2140 = หนี้สิน · 4050 = รายได้)", [
    imported.find((r) => r.code === "2140")?.type,
    imported.find((r) => r.code === "4050")?.type,
  ], ["LIABILITY", "INCOME"]);
  assert("T10.8 คำอธิบายถูกบันทึก", (imported.find((r) => r.code === "6220")?.description ?? "").includes("สตาร์ลิงก์"));
  const run2 = await importActions.runImportCore(tid, sSystemId, owner.id, "chart_of_accounts", csv, preview.mapping, true);
  if (!run2.ok) throw new Error("นำเข้าซ้ำล้ม: " + run2.reason);
  eq("T10.9 นำเข้าไฟล์เดิมซ้ำ = 0 รายการใหม่ (idempotent)", run2.created, 0);
  const totalAfter = await prisma.accountLedger.count({ where: { systemId: sSystemId, code: { in: ["1210", "1410", "2140", "4050", "5320", "6110", "6220", "6910"] } } });
  eq("T10.10 ไม่มีบัญชีซ้ำหลังนำเข้ารอบสอง", totalAfter, 8);
  const treeAfterImport = await coa.chartTree(S, {});
  const g12 = treeAfterImport.nodes
    .find((n) => n.code === "1")
    ?.children.find((g) => g.kind === "group" && g.code === "12");
  assert("T10.11 บัญชีที่นำเข้าเข้าไปอยู่ในหมวดของตัวเอง (1210 → หมวดรอง 12)", !!g12);

  // ═════════ T11 — ปักหมุด ═════════
  console.log("\nT11 บัญชีที่ปักหมุด (หน้าหลัก §4):");
  const pinned = await prisma.accountLedger.findMany({ where: { systemId, pinned: true }, select: { id: true, code: true } });
  assert("T11.1 ร้าน QC มีบัญชีที่ปักหมุดอยู่", pinned.length > 0);
  const home = await dash.loadDashboardHome(ctx, {}, { base: `/app/sys/${systemId}/account` });
  const homePinned = home.ledgerAccounts.filter((l) => l.pinned).map((l) => l.code).sort();
  eq("T11.2 หน้าหลักยังเห็นบัญชีที่ปักหมุดครบเท่าเดิม", homePinned, pinned.map((p) => p.code).sort());
  const setPin = await coa.setPinnedLedgerAccounts(S, [created1]);
  assert("T11.3 ตั้งบัญชีที่ปักหมุดในร้านทดสอบได้", setPin.ok);
  const crossPin = await coa.setPinnedLedgerAccounts(S, [COA.custom.onlineAds]);
  assert("T11.4 ปักหมุดบัญชีของร้านอื่นไม่ได้", !crossPin.ok);

  // ═════════ T12 — guard ═════════
  console.log("\nT12 ด่านสิทธิ์:");
  const authStaff = { user: { id: staff.id }, active: { ...mStaff, tenant: t } } as never;
  await rejected("T12.1 staff ที่ไม่มี account.chart.manage ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.chart.manage");
    return { ok: true };
  });
  await rejected("T12.2 staff ที่ไม่มี account.import ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.import");
    return { ok: true };
  });
  await rejected("T12.3 staff ที่ไม่มี account.mapping.manage ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.mapping.manage");
    return { ok: true };
  });
  const authChart = { user: { id: staff.id }, active: { ...mStaff, permissions: { "account.chart.manage": true }, tenant: t } } as never;
  let chartOk = true;
  try {
    assertAccountCan(authChart, "account.chart.manage");
  } catch {
    chartOk = false;
  }
  assert("T12.4 staff ที่มี account.chart.manage ผ่านด่าน", chartOk);

  // ═════════ T14 — ยอด "ณ วันที่" ═════════
  console.log("\nT14 ยอดคงเหลือ ณ วันที่ (asOf):");
  // ใบสำคัญของ T8 ลงวันที่ 2026-09-02 (Dr 6305 10,000) — เป็นรายการเดียวของบัญชีนี้
  const beforeEntry = await coa.ledgerDetail(S, created1, { asOf: new Date("2026-09-01T12:00:00+07:00") });
  const onEntryDay = await coa.ledgerDetail(S, created1, { asOf: new Date("2026-09-02T00:30:00+07:00") });
  const afterEntry = await coa.ledgerDetail(S, created1, { asOf: new Date("2026-09-20T12:00:00+07:00") });
  eq("T14.1 ยอด ณ วันก่อนหน้ารายการ = 0 (ยังไม่นับรายการล่วงหน้า)", beforeEntry?.balanceSatang, 0);
  eq("T14.2 ยอด ณ วันเดียวกับรายการ = 10,000 สตางค์ (นับทั้งวัน ไม่สนเวลาใน entry.date)", onEntryDay?.balanceSatang, 10_000);
  eq("T14.3 ยอด ณ วันหลังจากนั้น = 10,000 สตางค์", afterEntry?.balanceSatang, 10_000);
  eq("T14.4 เคลื่อนไหวเดือนนี้ ณ 1 ก.ย. = 0 · ณ 20 ก.ย. = 10,000", [beforeEntry?.monthDeltaSatang, afterEntry?.monthDeltaSatang], [0, 10_000]);
  eq("T14.5 แผงขวาบอกวันที่ที่ใช้คิดยอด (ป้าย 'ยอดคงเหลือ ณ …' ตรงกับเลขจริง)", afterEntry?.asOf.toISOString(), new Date("2026-09-20T12:00:00+07:00").toISOString());
  const treeBefore = await coa.chartTree(S, { asOf: new Date("2026-09-01T12:00:00+07:00") });
  const leafBefore = treeBefore.nodes
    .flatMap((g1) => g1.children)
    .flatMap((g2) => (g2.kind === "group" ? g2.children : []))
    .flatMap((g3) => (g3.kind === "group" ? g3.children : []))
    .find((a) => a.kind === "account" && a.id === created1);
  eq("T14.6 ต้นไม้ก็คิด ณ วันที่เดียวกัน (บัญชีเดียวกันยอด 0)", leafBefore?.kind === "account" ? leafBefore.balanceSatang : null, 0);
  // เทียบกับ "ยอดตามช่องทางเงิน" ของ 5.1 ว่าใช้กติกาเดียวกันแล้ว
  const finAsOfBefore = await finMod.financeBalances(tid, sSystemId, new Date("2026-09-01T12:00:00+07:00"));
  const finAsOfAfter = await finMod.financeBalances(tid, sSystemId, new Date("2026-09-20T12:00:00+07:00"));
  const bankLedgerId = bankFin.ledgerAccountId!;
  const bankDetailAfter = await coa.ledgerDetail(S, bankLedgerId, { asOf: new Date("2026-09-20T12:00:00+07:00") });
  eq(
    "T14.7 financeBalances (5.1) กับ ledgerDetail (6.1) ให้ยอด ณ วันเดียวกันเท่ากัน",
    finAsOfAfter.find((f) => f.ledgerAccountId === bankLedgerId)?.balance,
    bankDetailAfter?.balanceSatang,
  );
  assert(
    "T14.8 ยอดช่องทางเงิน ณ วันก่อนหน้า ≤ ณ วันหลัง (ตัดตามวันที่จริง ไม่ใช่รวมทั้งสมุด)",
    (finAsOfBefore.find((f) => f.ledgerAccountId === bankLedgerId)?.balance ?? 0) <=
      (finAsOfAfter.find((f) => f.ledgerAccountId === bankLedgerId)?.balance ?? 0),
  );

  // ═════════ T15 — หน้าบัญชีแยกประเภท (ใบที่ถูกกลับรายการ) ═════════
  console.log("\nT15 บัญชีแยกประเภท (ปลายทางลิงก์ 'ดูบัญชีแยกประเภท'):");
  const revTarget = await coa.createLedgerV2(S, { code: "6309", name: "บัญชีทดสอบกลับรายการ", groupPrefix: "630" });
  if (!revTarget.ok) throw new Error("สร้างบัญชีทดสอบกลับรายการไม่สำเร็จ");
  const jv = await glMod.postManualJV(S, {
    date: new Date("2026-09-10T10:00:00+07:00"),
    memo: "รายการที่จะถูกกลับ",
    postedById: owner.id,
    lines: [
      { accountId: revTarget.id, debit: 25_000, credit: 0 },
      { accountId: apLedger.id, debit: 0, credit: 25_000 },
    ],
  });
  await glMod.reverseEntry(S, jv.entryId, "กลับรายการทดสอบ (QC 6.1)");
  const revDetail = await coa.ledgerDetail(S, revTarget.id, { asOf: new Date("2026-09-20T12:00:00+07:00") });
  const revLedgerPage = await coa.ledgerRunning(S, revTarget.id, {
    from: new Date("2026-09-01T00:00:00+07:00"),
    to: new Date("2026-09-20T23:59:59+07:00"),
  });
  eq("T15.1 ยอดยกไปของหน้าแยกประเภท = ยอดคงเหลือในแผงขวาของผังบัญชี", revLedgerPage.closing, revDetail?.balanceSatang);
  eq("T15.2 หลังกลับรายการยอดต้องเป็น 0 (เดิมกรอง POSTED จะได้ −25,000)", revLedgerPage.closing, 0);
  eq("T15.3 เห็นทั้ง 2 ขา (ใบเดิม + ใบกลับรายการ)", revLedgerPage.rows.length, 2);
  eq("T15.4 ใบเดิมติดสถานะ 'กลับรายการแล้ว' 1 ใบ", revLedgerPage.rows.filter((r) => r.reversed).length, 1);
  eq("T15.5 เดบิต/เครดิตรวมในงวดเท่ากัน (25,000/25,000)", [revLedgerPage.movementDebit, revLedgerPage.movementCredit], [25_000, 25_000]);

  // ═════════ T13 — แยกร้าน ═════════
  console.log("\nT13 แยกร้าน:");
  const crossDetail = await coa.ledgerDetail(S, COA.custom.onlineAds);
  eq("T13.1 ledgerDetail ของบัญชีร้านอื่น = null", crossDetail, null);
  await rejected("T13.2 ปิดใช้งานบัญชีของร้านอื่นไม่ได้", () => coa.setLedgerActive(S, COA.custom.rentalIncome, false), "ไม่พบบัญชีนี้");
  const crossUpdate = await coa.updateLedgerV2(S, COA.custom.rentalIncome, { code: "4031", name: "แก้ข้ามร้าน", groupPrefix: "403" });
  assert("T13.3 แก้ไขบัญชีของร้านอื่นไม่ได้", !crossUpdate.ok);
  const crossTree = await coa.chartTree(S, {});
  const crossCodes = new Set<string>();
  for (const g1 of crossTree.nodes)
    for (const g2 of g1.children)
      if (g2.kind === "group")
        for (const g3 of g2.children)
          if (g3.kind === "group") for (const a of g3.children) if (a.kind === "account") crossCodes.add(a.code);
  eq("T13.4 ต้นไม้ของร้านทดสอบไม่มีบัญชีลูกช่องทางเงินของร้านจริง (1000-01)", crossCodes.has("1000-01"), false);
} finally {
  if (sTenantId) {
    console.log("\n[cleanup] ลบร้านทดสอบ");
    const d = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.log(`  ⚠ cleanup: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      }
    };
    const tid = sTenantId;
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountFinanceOpening.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountFinance.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountMapping.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountPeriod.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountSettings.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.membership.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}

console.log(`\n${findings.length === 0 ? "✅" : "❌"} ผ่าน ${passed} ข้อ · พบปัญหา ${findings.length} ข้อ`);
if (findings.length) {
  for (const f of findings) console.log("   • " + f);
  process.exit(1);
}
