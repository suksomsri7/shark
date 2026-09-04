// QC WO 6.2 — ปิดงวดเช็กลิสต์ + ทะเบียนสินทรัพย์/ค่าเสื่อม — DESIGN-SPEC-V2 §11.4–11.5
//
// requires: acc-v2-seed (บล็อก 8.10 — สินทรัพย์ 2 · ค่าเสื่อม 3 งวด · ปิดงวด 2026-08 · ⚑+9999 ใน ก.ย.)
// รัน: QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-period-assets.mts
//
// 🔴 ร้าน QC จริง = **อ่านอย่างเดียว** — การเขียน (ปิด/เปิดงวด · รันค่าเสื่อม · จำหน่าย) เกิดใน "ร้านทิ้ง"
//
// ครอบคลุม
//   T1  เช็กลิสต์ของงวดที่ปิดแล้ว (ส.ค.): ทั้ง 4 ข้อคำนวณจากข้อมูลจริง · ข้อบังคับผ่านหมด
//   T2  เช็กลิสต์ของงวดเปิด (ก.ย.): บัญชีพัก ≠ 0 และมี ⚑ ⇒ ปิดไม่ได้ พร้อมเหตุผลไทยที่ระบุตัวเลขจริง
//   T3  สถานะงวดในตาราง: ส.ค. ปิด (มีผู้ปิด/เวลา) · ก.ย. เปิด · งวดที่ไม่มีแถว = เปิดตามนิยาม gl
//   T4  ตารางค่าเสื่อมรายงวดของสินทรัพย์: จำนวนงวด · ยอดต่องวด · สะสม · NBV = เฉลย · ทุกงวดคลิกทะลุใบสำคัญได้
//   T5  พรีวิวค่าเสื่อมงวดถัดไป = เฉลย · งวดที่ลงแล้วขึ้น "ลงบัญชีงวดนี้แล้ว" (ไม่คิดซ้ำ)
//   T6  ตรรกะบริสุทธิ์: isPeriodKey · periodLabel · nextDepreciationAmount (งวดสุดท้ายเก็บเศษ)
//   T7  ร้านทิ้ง — ปิดงวดถูกบล็อกเมื่อบัญชีพัก 9999 ≠ 0 · เคลียร์แล้วปิดได้
//   T8  ร้านทิ้ง — ปิดงวด → โพสต์ย้อนหลังถูกปฏิเสธ → เปิดงวดใหม่ (ต้องมีสิทธิ์) → โพสต์ได้อีก
//   T9  ร้านทิ้ง — รันค่าเสื่อมจริง: ยอด = พรีวิว · JV Dr 6800 / Cr 16x9 · รันซ้ำไม่คิดเบิ้ล (idempotent)
//   T10 ร้านทิ้ง — จำหน่ายสินทรัพย์: JV กำไร/ขาดทุนถูกต้อง · สถานะ + วิธีจำหน่ายถูกบันทึก · จำหน่ายซ้ำไม่ได้
//   T11 ร้านทิ้ง — ภ.พ.30 "ยื่นแล้ว": ทำเครื่องหมาย → เช็กลิสต์ข้อ 4 ผ่าน · ทำซ้ำไม่ได้ · ยกเลิกได้
//   T12 guard + แยกร้าน: สิทธิ์ปิด/เปิดงวดคนละตัว · แตะงวด/สินทรัพย์ของร้านอื่นไม่ได้

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
const jv = await import("@/lib/modules/account/journal-v2");
const pc = await import("@/lib/modules/account/period-close");
const asset = await import("@/lib/modules/account/asset");
const assetV2 = await import("@/lib/modules/account/asset-v2");
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
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 });

console.log(`\n===== QC WO 6.2 · ปิดงวด + สินทรัพย์/ค่าเสื่อม (§11.4–11.5) =====`);
console.log(`🗄️  DB QC: ${host}\n`);

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));
const W = E.wo62 as {
  suspenseCredit: number;
  assets: { id: string; code: string; name: string; cost: number; salvageValue: number; usefulLifeMonths: number; monthlyAmount: number; periods: number; accumDepreciation: number; netBookValue: number }[];
  depreciationRows: { code: string; periodKey: string; amount: number }[];
  depreciationPreviewSept: number;
  periods: { closed: string[]; open: string };
  vatFiled: string[];
};
const ctx = { tenantId: E.tenantId as string, systemId: E.systemId as string };
const CLOSED = W.periods.closed[0];
const OPEN = W.periods.open;

let sTenantId: string | null = null;
try {
  // ═════════ T1 — เช็กลิสต์งวดที่ปิดแล้ว ═════════
  console.log(`T1 เช็กลิสต์ของงวด ${CLOSED} (งวดที่ seed ปิดไว้):`);
  const cAug = await pc.periodChecklist(ctx, CLOSED);
  eq("T1.1 เช็กลิสต์มี 4 ข้อ ตาม §11.4", cAug.items.map((i) => i.key), ["SUSPENSE", "NEEDS_REVIEW", "RECONCILE", "VAT"]);
  eq("T1.2 ข้อบังคับ = บัญชีพัก + ธง ⚑ (อีก 2 ข้อเป็นเตือน)", cAug.items.filter((i) => i.blocking).map((i) => i.key), ["SUSPENSE", "NEEDS_REVIEW"]);
  eq("T1.3 บัญชีพัก 9999 ถึงสิ้นงวดนี้ = 0 → ผ่าน", cAug.items.find((i) => i.key === "SUSPENSE")?.state, "PASS");
  eq("T1.4 ไม่มีใบติดธง ⚑ ในงวดนี้ → ผ่าน", cAug.items.find((i) => i.key === "NEEDS_REVIEW")?.state, "PASS");
  eq("T1.5 ทำเครื่องหมายยื่น ภ.พ.30 แล้ว → ผ่าน", cAug.items.find((i) => i.key === "VAT")?.state, "PASS");
  eq("T1.6 ข้อบังคับผ่านหมด ⇒ ปิดงวดได้", cAug.canClose, true);
  for (const it of cAug.items) assert(`T1.7-${it.key} มีคำอธิบายไทยประกอบ (ไม่ใช่ป้ายเปล่า)`, it.detail.length > 3, it.detail);

  // ═════════ T2 — เช็กลิสต์งวดเปิดที่ยังปิดไม่ได้ ═════════
  console.log(`\nT2 เช็กลิสต์ของงวด ${OPEN} (มี ⚑ + บัญชีพักค้าง โดยตั้งใจ):`);
  const cSep = await pc.periodChecklist(ctx, OPEN);
  eq("T2.1 บัญชีพัก 9999 ยังค้าง → ไม่ผ่าน", cSep.items.find((i) => i.key === "SUSPENSE")?.state, "FAIL");
  assert(
    "T2.2 เหตุผลระบุจำนวนเงินจริง (ไม่ใช่ข้อความลอย ๆ)",
    (cSep.items.find((i) => i.key === "SUSPENSE")?.detail ?? "").includes(baht(W.suspenseCredit)),
    cSep.items.find((i) => i.key === "SUSPENSE")?.detail ?? "",
  );
  eq("T2.3 มีใบติดธง ⚑ → ไม่ผ่าน", cSep.items.find((i) => i.key === "NEEDS_REVIEW")?.state, "FAIL");
  assert(
    "T2.4 เหตุผลบอกจำนวนใบที่ค้างตรวจ",
    (cSep.items.find((i) => i.key === "NEEDS_REVIEW")?.detail ?? "").includes("1 รายการ"),
    cSep.items.find((i) => i.key === "NEEDS_REVIEW")?.detail ?? "",
  );
  eq("T2.5 ข้อบังคับไม่ผ่าน ⇒ ปิดงวดไม่ได้", cSep.canClose, false);
  eq("T2.6 ข้อ 'กระทบยอด' ของงวดนี้เป็นข้อเตือน (ไม่บล็อก)", cSep.items.find((i) => i.key === "RECONCILE")?.blocking, false);
  eq("T2.7 ยังไม่ได้ยื่น ภ.พ.30 งวดนี้ → เตือน", cSep.items.find((i) => i.key === "VAT")?.state, "FAIL");
  assert("T2.8 นับข้อเตือนที่ค้างได้", cSep.warnings >= 1, String(cSep.warnings));

  // ═════════ T3 — ตารางงวด ═════════
  console.log("\nT3 ตารางงวดบัญชี:");
  const periods = await pc.listPeriods(ctx, new Date(`${QC.today}T12:00:00+07:00`));
  const aug = periods.find((p) => p.periodKey === CLOSED);
  const sep = periods.find((p) => p.periodKey === OPEN);
  eq("T3.1 งวด ส.ค. อยู่ในตารางและสถานะปิด", aug?.status, "CLOSED");
  assert("T3.2 งวดที่ปิดมีชื่อผู้ปิด", !!aug?.closedByName, String(aug?.closedByName));
  assert("T3.3 งวดที่ปิดมีเวลาที่ปิด", !!aug?.closedAt, String(aug?.closedAt));
  eq("T3.4 งวด ก.ย. เปิดอยู่", sep?.status, "OPEN");
  eq("T3.5 ป้ายเดือนเป็นภาษาไทย", [aug?.label, sep?.label], ["สิงหาคม 2026", "กันยายน 2026"]);
  assert("T3.6 นับจำนวนใบสำคัญต่องวดได้", (sep?.entryCount ?? 0) > 0, String(sep?.entryCount));
  // งวดที่มีใบสำคัญแต่ยังไม่เคยสร้างแถว AccountPeriod ต้องโผล่ในตารางด้วย (ไม่งั้นปิดไม่ได้)
  const keysWithEntries = await prisma.accountJournalEntry.groupBy({ by: ["periodKey"], where: { systemId: ctx.systemId } });
  const missing = keysWithEntries.filter((g) => !periods.some((p) => p.periodKey === g.periodKey));
  eq("T3.7 ทุกงวดที่มีใบสำคัญโผล่ในตาราง (แม้ยังไม่มีแถว AccountPeriod)", missing.length, 0);
  const rows5 = periods.slice(0, 5).map((p) => p.periodKey);
  eq("T3.8 เรียงงวดใหม่→เก่า", rows5, [...rows5].sort().reverse());

  // ═════════ T4 — ตารางค่าเสื่อมรายงวด ═════════
  console.log("\nT4 ตารางค่าเสื่อมรายงวด (§11.5 'มีข้อมูลแล้วแต่ไม่เคยแสดง'):");
  for (const a of W.assets) {
    const d = await assetV2.assetDetail(ctx, a.id);
    assert(`T4.1-${a.code} เปิดหน้าสินทรัพย์ได้`, !!d, "ไม่พบ");
    if (!d) continue;
    eq(`T4.2-${a.code} จำนวนงวดในตาราง = เฉลย (${a.periods})`, d.rows.length, a.periods);
    eq(`T4.3-${a.code} ค่าเสื่อมต่องวด = เฉลย (${baht(a.monthlyAmount)})`, [...new Set(d.rows.map((r) => r.amount))], [a.monthlyAmount]);
    eq(`T4.4-${a.code} ค่าเสื่อมสะสม = เฉลย (${baht(a.accumDepreciation)})`, d.accumDepreciation, a.accumDepreciation);
    eq(`T4.5-${a.code} มูลค่าสุทธิ = เฉลย (${baht(a.netBookValue)})`, d.netBookValue, a.netBookValue);
    // คอลัมน์สะสม/NBV ต่องวดต้องไล่ถูกทีละแถว (ไม่ใช่แค่ยอดรวมท้ายตารางถูก)
    let run = 0;
    let stepBad = 0;
    for (const r of d.rows) {
      run += r.amount;
      if (r.accumAfter !== run || r.netBookAfter !== a.cost - run) stepBad++;
    }
    eq(`T4.6-${a.code} คอลัมน์สะสม/มูลค่าสุทธิถูกต้องทุกแถว`, stepBad, 0);
    eq(`T4.7-${a.code} ทุกงวดคลิกทะลุไปใบสำคัญได้`, d.rows.filter((r) => !r.entryId || !r.entryDocNo).length, 0);
    eq(`T4.8-${a.code} งวดเรียงเก่า→ใหม่`, d.rows.map((r) => r.periodKey), [...d.rows.map((r) => r.periodKey)].sort());
    // ใบสำคัญของค่าเสื่อมต้องเป็น Dr 6800 / Cr 16x9 จริง
    const entry = await jv.journalEntryDetail(ctx, d.rows[0].entryId!);
    eq(`T4.9-${a.code} ใบค่าเสื่อม: Dr ค่าเสื่อมราคา 6800`, entry?.lines.find((l) => l.debit > 0)?.code, "6800");
    assert(`T4.10-${a.code} ใบค่าเสื่อม: Cr ค่าเสื่อมสะสม 16x9`, /^16\d9$/.test(entry?.lines.find((l) => l.credit > 0)?.code ?? ""), entry?.lines.find((l) => l.credit > 0)?.code ?? "");
    eq(`T4.11-${a.code} ใบค่าเสื่อมสมดุลและเท่ายอดของงวด`, [entry?.totalDebit, entry?.totalCredit], [a.monthlyAmount, a.monthlyAmount]);
    eq(`T4.12-${a.code} ป้ายสถานะไทย`, d.statusLabel, "ใช้งาน");
  }
  const depAll = await prisma.accountDepreciation.count({ where: { systemId: ctx.systemId } });
  eq("T4.13 จำนวนแถวค่าเสื่อมทั้งชุด = เฉลย", depAll, W.depreciationRows.length);

  // ═════════ T5 — พรีวิวค่าเสื่อม ═════════
  console.log("\nT5 พรีวิว 'คิดค่าเสื่อมงวดนี้':");
  const pv = await assetV2.previewDepreciation(ctx, OPEN);
  eq("T5.1 พรีวิวครอบคลุมสินทรัพย์ที่ใช้งานอยู่ทุกตัว", pv.rows.length, W.assets.length);
  eq(`T5.2 ยอดรวมที่จะลง = เฉลย (${baht(W.depreciationPreviewSept)})`, pv.totalAmount, W.depreciationPreviewSept);
  eq("T5.3 ยังไม่มีตัวไหนลงงวดนี้", pv.alreadyPostedCount, 0);
  eq("T5.4 ทุกตัวพร้อมลงบัญชี", pv.postableCount, W.assets.length);
  const pvDone = await assetV2.previewDepreciation(ctx, W.depreciationRows[0].periodKey);
  eq("T5.5 งวดที่ลงไปแล้ว = ไม่คิดซ้ำ (ยอด 0)", pvDone.totalAmount, 0);
  eq("T5.6 งวดที่ลงแล้วขึ้นเหตุผล 'ลงบัญชีงวดนี้แล้ว'", [...new Set(pvDone.rows.map((r) => r.skipReason))], ["ลงบัญชีงวดนี้แล้ว"]);
  const pvEarly = await assetV2.previewDepreciation(ctx, "2026-01");
  eq("T5.7 งวดก่อนวันเริ่มคิดค่าเสื่อม = ไม่คิด", pvEarly.totalAmount, 0);
  eq("T5.8 เหตุผล 'ยังไม่ถึงงวดเริ่มคิดค่าเสื่อม'", [...new Set(pvEarly.rows.map((r) => r.skipReason))], ["ยังไม่ถึงงวดเริ่มคิดค่าเสื่อม"]);

  // ═════════ T6 — ตรรกะบริสุทธิ์ ═════════
  console.log("\nT6 ตรรกะบริสุทธิ์:");
  eq("T6.1 isPeriodKey ถูกรูปแบบ", [pc.isPeriodKey("2026-09"), pc.isPeriodKey("2026-13"), pc.isPeriodKey("2026-9"), pc.isPeriodKey("")], [true, false, false, false]);
  eq("T6.2 ป้ายเดือนไทย", pc.periodLabel("2026-02"), "กุมภาพันธ์ 2026");
  const a0 = W.assets[0];
  eq(
    "T6.3 ค่าเสื่อมงวดถัดไป = ยอดรายเดือน",
    asset.nextDepreciationAmount({ cost: a0.cost, salvageValue: a0.salvageValue, usefulLifeMonths: a0.usefulLifeMonths, monthsDepreciated: a0.periods, accumDepreciation: a0.accumDepreciation }),
    a0.monthlyAmount,
  );
  // งวดสุดท้ายต้องเก็บเศษให้มูลค่าสุทธิ = มูลค่าซากพอดี (กติกาที่ทำให้ปัดเศษไม่ทิ้งสตางค์)
  const lastMonthAccum = a0.monthlyAmount * (a0.usefulLifeMonths - 1);
  const last = asset.nextDepreciationAmount({ cost: a0.cost, salvageValue: a0.salvageValue, usefulLifeMonths: a0.usefulLifeMonths, monthsDepreciated: a0.usefulLifeMonths - 1, accumDepreciation: lastMonthAccum });
  eq("T6.4 งวดสุดท้ายเก็บเศษ → มูลค่าสุทธิ = มูลค่าซากพอดี", a0.cost - (lastMonthAccum + last), a0.salvageValue);
  eq(
    "T6.5 ครบอายุแล้ว = ไม่คิดอีก",
    asset.nextDepreciationAmount({ cost: a0.cost, salvageValue: a0.salvageValue, usefulLifeMonths: a0.usefulLifeMonths, monthsDepreciated: a0.usefulLifeMonths, accumDepreciation: a0.cost - a0.salvageValue }),
    0,
  );

  // ═════════ ร้านทิ้ง ═════════
  console.log("\n── สร้างร้านทดสอบ (การเขียนทั้งหมด) ──");
  const stamp = Date.now();
  const tag = `qc-pa-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const tid = sTenantId;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: { "account.period.close": true } },
  });
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" },
  });
  const accSys = await sysMod.createSystem(tid, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(tid, accSys.id, unit.id);
  const S = { tenantId: tid, systemId: accSys.id };
  await glMod.ensureAccounting(S);
  const led = Object.fromEntries(
    (await prisma.accountLedger.findMany({ where: { systemId: S.systemId }, select: { id: true, code: true } })).map((l) => [l.code, l.id]),
  ) as Record<string, string>;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const cur = today.slice(0, 7);
  const prevKey = pc.isPeriodKey(cur) ? (() => { const [y, m] = cur.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })() : cur;

  // ═════════ T7 — บัญชีพัก 9999 บล็อกการปิดงวด ═════════
  console.log("\nT7 บัญชีพัก 9999 บล็อกการปิดงวด:");
  const dirty = await jv.createManualEntry(S, {
    dateKey: `${prevKey}-15`,
    postedById: owner.id,
    lines: [
      { accountId: led["6900"], debit: 200_000, credit: 0, note: "ค่าใช้จ่าย" },
      { accountId: led["1000"], debit: 0, credit: 150_000, note: "จ่ายเงินสด" },
      { accountId: led["9999"], debit: 0, credit: 50_000, note: "ส่วนต่างรอตรวจสอบ" },
    ],
  });
  assert("T7.1 ลง JV ที่มีบัญชีพักได้ (ระบบไม่ห้ามลง — ห้ามแค่ปิดงวด)", dirty.ok, dirty.ok ? "" : dirty.reason);
  const c7 = await pc.periodChecklist(S, prevKey);
  eq("T7.2 เช็กลิสต์: บัญชีพักไม่ผ่าน", c7.items.find((i) => i.key === "SUSPENSE")?.state, "FAIL");
  eq("T7.3 ปิดงวดไม่ได้", c7.canClose, false);
  await rejected("T7.4 สั่งปิดงวดจริง = ถูกปฏิเสธ พร้อมเหตุผลไทย", () => pc.closePeriodWithChecklist(S, prevKey, owner.id), "บัญชีพัก");
  // เคลียร์บัญชีพัก แล้วต้องปิดได้
  const clear = await jv.createManualEntry(S, {
    dateKey: `${prevKey}-16`,
    postedById: owner.id,
    lines: [
      { accountId: led["9999"], debit: 50_000, credit: 0, note: "เคลียร์บัญชีพัก" },
      { accountId: led["1000"], debit: 0, credit: 50_000, note: "จ่ายส่วนต่างเพิ่ม" },
    ],
  });
  assert("T7.5 ลง JV เคลียร์บัญชีพักได้", clear.ok, clear.ok ? "" : clear.reason);
  const c7b = await pc.periodChecklist(S, prevKey);
  eq("T7.6 เคลียร์แล้ว = ข้อบัญชีพักผ่าน", c7b.items.find((i) => i.key === "SUSPENSE")?.state, "PASS");
  eq("T7.7 เคลียร์แล้ว = ปิดงวดได้", c7b.canClose, true);
  await rejected("T7.8 รูปแบบงวดผิด = ปฏิเสธ", () => pc.closePeriodWithChecklist(S, "2026-13", owner.id), "รูปแบบงวด");

  // ═════════ T8 — ปิด → โพสต์ไม่ได้ → เปิดใหม่ → โพสต์ได้ ═════════
  console.log("\nT8 ปิดงวด → ล็อกการโพสต์ → เปิดใหม่:");
  const closed = await pc.closePeriodWithChecklist(S, prevKey, owner.id);
  assert("T8.1 ปิดงวดสำเร็จ", closed.ok, closed.ok ? "" : closed.reason);
  const perRow = await prisma.accountPeriod.findFirstOrThrow({ where: { systemId: S.systemId, periodKey: prevKey } });
  eq("T8.2 สถานะในตาราง = CLOSED + มีผู้ปิด + เวลา", [perRow.status, perRow.closedById === owner.id, !!perRow.closedAt], ["CLOSED", true, true]);
  assert("T8.3 เก็บ snapshot เช็กลิสต์ตอนปิดไว้ (ผู้ตรวจสอบย้อนดูได้)", Array.isArray(perRow.checklist), JSON.stringify(perRow.checklist)?.slice(0, 60) ?? "null");
  await rejected(
    "T8.4 โพสต์ย้อนหลังในงวดที่ปิดถูกปฏิเสธ (ล็อกจริงที่ gl ไม่ใช่แค่ซ่อนปุ่ม)",
    () => jv.createManualEntry(S, { dateKey: `${prevKey}-20`, postedById: owner.id, lines: [
      { accountId: led["6900"], debit: 10_000, credit: 0 },
      { accountId: led["1000"], debit: 0, credit: 10_000 },
    ] }),
    "ปิดแล้ว",
  );
  const reopen = await pc.reopenPeriodV2(S, prevKey, "ต้องแก้รายการย้อนหลังตามคำสั่งผู้สอบบัญชี", owner.id);
  assert("T8.5 เปิดงวดใหม่สำเร็จ", reopen.ok, reopen.ok ? "" : reopen.reason);
  const perRow2 = await prisma.accountPeriod.findFirstOrThrow({ where: { systemId: S.systemId, periodKey: prevKey } });
  eq("T8.6 สถานะกลับเป็น OPEN + ล้างผู้ปิด", [perRow2.status, perRow2.closedById, perRow2.closedAt], ["OPEN", null, null]);
  assert("T8.7 ประทับเวลาที่เปิดใหม่", !!perRow2.reopenedAt, String(perRow2.reopenedAt));
  const log = Array.isArray(perRow2.reopenLog) ? (perRow2.reopenLog as { reason?: string }[]) : [];
  eq("T8.8 บันทึกเหตุผลการเปิดงวดไว้ถาวร", log.length, 1);
  assert("T8.9 เหตุผลที่บันทึกตรงกับที่กรอก", (log[0]?.reason ?? "").includes("ผู้สอบบัญชี"), JSON.stringify(log[0]));
  const afterReopen = await jv.createManualEntry(S, { dateKey: `${prevKey}-20`, postedById: owner.id, lines: [
    { accountId: led["6900"], debit: 10_000, credit: 0 },
    { accountId: led["1000"], debit: 0, credit: 10_000 },
  ] });
  assert("T8.10 เปิดใหม่แล้วโพสต์ย้อนหลังได้อีกครั้ง", afterReopen.ok, afterReopen.ok ? "" : afterReopen.reason);

  // ═════════ T9 — รันค่าเสื่อมจริง ═════════
  console.log("\nT9 คิดค่าเสื่อมงวดนี้ (พรีวิว → รันจริง → รันซ้ำ):");
  const reg = await asset.registerAsset(S, {
    name: "ตู้เก็บอุปกรณ์ดำน้ำ",
    category: "อุปกรณ์",
    acquiredDate: new Date(`${prevKey}-01T10:00:00+07:00`),
    startDepDate: new Date(`${prevKey}-01T10:00:00+07:00`),
    cost: 12_000_000,
    salvageValue: 100,
    usefulLifeMonths: 60,
    assetAccountId: led["1610"],
    accumAccountId: led["1619"],
    expenseAccountId: led["6800"],
  });
  assert("T9.1 ขึ้นทะเบียนสินทรัพย์ได้", reg.ok, reg.ok ? "" : reg.reason);
  const pvS = await assetV2.previewDepreciation(S, cur);
  eq("T9.2 พรีวิวมี 1 รายการพร้อมลง", pvS.postableCount, 1);
  const wantAmount = Math.round((12_000_000 - 100) / 60);
  eq(`T9.3 ยอดพรีวิว = สูตรเส้นตรง (${baht(wantAmount)})`, pvS.totalAmount, wantAmount);
  const run1 = await asset.runDepreciation(S, cur);
  eq("T9.4 รันจริงลงบัญชี 1 รายการ", run1.posted.length, 1);
  eq("T9.5 ยอดที่ลงจริง = ยอดพรีวิว (พรีวิวไม่โกหก)", run1.posted[0].amount, pvS.totalAmount);
  const depEntry = await jv.journalEntryDetail(S, run1.posted[0].entryId);
  eq("T9.6 JV ค่าเสื่อม: Dr 6800 / Cr 1619", [depEntry?.lines.find((l) => l.debit > 0)?.code, depEntry?.lines.find((l) => l.credit > 0)?.code], ["6800", "1619"]);
  eq("T9.7 JV ค่าเสื่อมสมดุล", depEntry?.totalDebit, depEntry?.totalCredit);
  const run2 = await asset.runDepreciation(S, cur);
  eq("T9.8 รันซ้ำงวดเดิม = ไม่ลงเพิ่ม (idempotent)", run2.posted.length, 0);
  const depRows = await prisma.accountDepreciation.count({ where: { systemId: S.systemId, periodKey: cur } });
  eq("T9.9 มีแถวค่าเสื่อมของงวดนี้แค่แถวเดียว", depRows, 1);
  const pvAfter = await assetV2.previewDepreciation(S, cur);
  eq("T9.10 พรีวิวหลังรัน = 'ลงบัญชีงวดนี้แล้ว'", [pvAfter.totalAmount, pvAfter.alreadyPostedCount], [0, 1]);
  const dS = await assetV2.assetDetail(S, reg.ok ? reg.id : "");
  eq("T9.11 ตารางค่าเสื่อมของสินทรัพย์มี 1 งวด", dS?.rows.length, 1);
  eq("T9.12 มูลค่าสุทธิ = ต้นทุน − ค่าเสื่อมสะสม", dS?.netBookValue, 12_000_000 - wantAmount);

  // ═════════ T10 — จำหน่าย / ตัดบัญชี ═════════
  console.log("\nT10 จำหน่าย / ตัดบัญชีสินทรัพย์:");
  const assetId = reg.ok ? reg.id : "";
  const nbv = 12_000_000 - wantAmount;
  const proceeds = nbv + 100_000; // ขายได้สูงกว่ามูลค่าสุทธิ 1,000.00 บาท ⇒ กำไร
  // ต้องมีช่องทางเงินให้เงินขายเข้า (disposeAsset ปฏิเสธถ้าขายได้เงินแต่ไม่บอกว่าเข้าบัญชีไหน — ถูกแล้ว)
  const cashChannel = await prisma.accountFinance.create({
    data: { tenantId: tid, systemId: S.systemId, type: "CASH", name: "เงินสด (ทดสอบ)", code: "CSH001", ledgerAccountId: led["1000"] },
  });
  await rejected(
    "T10.0 ขายได้เงินแต่ไม่ระบุบัญชีเงินรับ = ปฏิเสธ",
    () => asset.disposeAsset(S, { assetId, mode: "SELL", date: new Date(`${today}T10:00:00+07:00`), proceeds, financeAccountId: null }),
    "บัญชีเงินที่รับเงินขาย",
  );
  const disp = await asset.disposeAsset(S, {
    assetId,
    mode: "SELL",
    date: new Date(`${today}T10:00:00+07:00`),
    proceeds,
    financeAccountId: cashChannel.id,
  });
  assert("T10.1 ขายสินทรัพย์สำเร็จ", disp.ok, disp.ok ? "" : disp.reason);
  eq("T10.2 กำไร/ขาดทุน = เงินที่ได้ − มูลค่าสุทธิ", disp.ok ? disp.gainLoss : null, 100_000);
  const dispRow = await prisma.accountFixedAsset.findUniqueOrThrow({ where: { id: assetId } });
  eq("T10.3 สถานะ + วิธีจำหน่าย + ยอดขาย ถูกบันทึก", [dispRow.status, dispRow.disposalMethod, dispRow.disposalAmount], ["DISPOSED", "SELL", proceeds]);
  const dispEntry = disp.ok ? await jv.journalEntryDetail(S, disp.entryId) : null;
  eq("T10.4 JV จำหน่ายสมดุล", dispEntry?.totalDebit, dispEntry?.totalCredit);
  const crAsset = dispEntry?.lines.find((l) => l.code === "1610" && l.credit > 0);
  eq("T10.5 Cr ต้นทุนสินทรัพย์เต็มจำนวน", crAsset?.credit, 12_000_000);
  const drAccum = dispEntry?.lines.find((l) => l.code === "1619" && l.debit > 0);
  eq("T10.6 Dr ล้างค่าเสื่อมสะสม", drAccum?.debit, wantAmount);
  const gainLine = dispEntry?.lines.find((l) => l.code === "4900");
  eq("T10.7 กำไรจากการจำหน่ายเข้าบัญชี 4900 ฝั่งเครดิต", gainLine?.credit, 100_000);
  const drCash = dispEntry?.lines.find((l) => l.code === "1000" && l.debit > 0);
  eq("T10.7b Dr เงินสดตามช่องทางที่เลือก = เงินที่ได้รับ", drCash?.debit, proceeds);
  const dispDetail = await assetV2.assetDetail(S, assetId);
  eq("T10.8 หน้าสินทรัพย์แสดงป้ายวิธีจำหน่ายเป็นไทย", dispDetail?.disposalMethodLabel, "ขาย");
  await rejected("T10.9 จำหน่ายซ้ำไม่ได้", () => asset.disposeAsset(S, { assetId, mode: "WRITE_OFF", date: new Date(), proceeds: 0 }), "ไปแล้ว");
  await rejected("T10.10 จำหน่ายสินทรัพย์ของร้านอื่นไม่ได้", () => asset.disposeAsset(S, { assetId: W.assets[0].id, mode: "WRITE_OFF", date: new Date(), proceeds: 0 }), "ไม่พบ");

  // ═════════ T11 — ภ.พ.30 ยื่นแล้ว ═════════
  console.log("\nT11 เครื่องหมายยื่น ภ.พ.30 (เช็กลิสต์ข้อ 4):");
  const before11 = await pc.periodChecklist(S, cur);
  eq("T11.1 ก่อนทำเครื่องหมาย = ข้อ VAT ไม่ผ่าน (เตือน)", [before11.items.find((i) => i.key === "VAT")?.state, before11.items.find((i) => i.key === "VAT")?.blocking], ["FAIL", false]);
  const mark = await pc.markVatFiled(S, { periodKey: cur, salesVat: 700_00, inputVat: 300_00, userId: owner.id });
  assert("T11.2 ทำเครื่องหมายยื่นได้", mark.ok, mark.ok ? "" : mark.reason);
  const after11 = await pc.periodChecklist(S, cur);
  eq("T11.3 หลังทำเครื่องหมาย = ข้อ VAT ผ่าน", after11.items.find((i) => i.key === "VAT")?.state, "PASS");
  const filingRow = await prisma.accountVatFiling.findFirstOrThrow({ where: { systemId: S.systemId, periodKey: cur } });
  eq("T11.4 เก็บยอดภาษีขาย/ซื้อ/ที่ต้องชำระไว้เป็นหลักฐาน", [filingRow.salesVatSatang, filingRow.inputVatSatang, filingRow.payableSatang], [70_000, 30_000, 40_000]);
  await rejected("T11.5 ทำเครื่องหมายซ้ำงวดเดิมไม่ได้", () => pc.markVatFiled(S, { periodKey: cur, salesVat: 1, inputVat: 0, userId: owner.id }), "ไปแล้ว");
  await rejected("T11.6 รูปแบบงวดผิด = ปฏิเสธ", () => pc.markVatFiled(S, { periodKey: "2026-99", salesVat: 1, inputVat: 0, userId: owner.id }), "รูปแบบงวด");
  const unmark = await pc.unmarkVatFiled(S, cur);
  assert("T11.7 ยกเลิกเครื่องหมายได้", unmark.ok, unmark.ok ? "" : unmark.reason);
  const after11b = await pc.periodChecklist(S, cur);
  eq("T11.8 ยกเลิกแล้วข้อ VAT กลับเป็นไม่ผ่าน", after11b.items.find((i) => i.key === "VAT")?.state, "FAIL");
  await rejected("T11.9 ยกเลิกงวดที่ยังไม่ได้ทำเครื่องหมาย = ปฏิเสธ", () => pc.unmarkVatFiled(S, "2026-01"), "ยังไม่ได้");

  // ═════════ T12 — guard + แยกร้าน ═════════
  console.log("\nT12 สิทธิ์ + แยกร้าน:");
  const authOf = (perms: Record<string, boolean>) => ({ user: { id: staff.id }, active: { ...mStaff, permissions: perms, tenant: t } }) as never;
  const denied = (name: string, action: string, perms: Record<string, boolean>) => {
    try {
      assertAccountCan(authOf(perms), action);
      bad(name, "ผ่านทั้งที่ไม่ควรมีสิทธิ์");
    } catch {
      ok(name);
    }
  };
  try {
    assertAccountCan(authOf({ "account.period.close": true }), "account.period.close");
    ok("T12.1 staff ที่มี account.period.close ปิดงวดได้");
  } catch (e) {
    bad("T12.1 staff ที่มี account.period.close ปิดงวดได้", String(e));
  }
  denied("T12.2 สิทธิ์ปิดงวด **ไม่ได้** แปลว่าเปิดงวดใหม่ได้ (คนละ action)", "account.period.reopen", { "account.period.close": true });
  denied("T12.3 staff ไม่มี account.asset.manage = แตะทะเบียนสินทรัพย์ไม่ได้", "account.asset.manage", { "account.period.close": true });
  const crossAsset = await assetV2.assetDetail(S, W.assets[0].id);
  eq("T12.4 อ่านสินทรัพย์ของร้านอื่นไม่ได้", crossAsset, null);
  const crossPeriods = await pc.listPeriods(S);
  eq("T12.5 ตารางงวดของร้านทดสอบไม่ปนงวดที่ปิดของร้านจริง", crossPeriods.filter((p) => p.periodKey === CLOSED && p.status === "CLOSED").length, 0);
  const realStillClosed = await prisma.accountPeriod.count({ where: { systemId: ctx.systemId, periodKey: CLOSED, status: "CLOSED" } });
  eq("T12.6 งวดของร้านจริงไม่ถูกแตะต้อง", realStillClosed, 1);
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
    await d(() => prisma.accountDepreciation.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountFixedAsset.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountVatFiling.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountFinanceOpening.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
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
