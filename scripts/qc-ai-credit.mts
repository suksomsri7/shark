// QC — กระเป๋าเครดิตผู้ช่วย AI (prepaid) · มติเจ้าของ 8 ส.ค. 2026
// ⚠️ Oracle ภายใต้ change control — Fable (Auditor) เป็นเจ้าของ
//
// สัญญาที่ต้องจริงเสมอ:
// [1] ราคา    — costMicroUsd คิดตามราคาโมเดลจริง · ปัดขึ้น · ใช้จริงแต่เศษน้อยต้องไม่เป็น 0
// [2] กระเป๋า — เปิดครั้งแรกได้เครดิตต้อนรับ $10 ครั้งเดียว (เรียกซ้ำไม่แจกซ้ำ)
// [3] หัก     — chargeUsage หักตามจริง + ลง ledger ที่มี balanceAfter ตรงกับยอดจริง
// [4] กัน     — เครดิตหมด → canSpend=false และ sendMessage ต้องคืน over_budget โดย **ไม่แตะ provider**
// [5] เติม    — topUp idempotent ต่อ ref (webhook ยิงซ้ำ = ไม่เติมซ้ำ)
// [6] webhook — parseReference/creditFromCharge: ref เพี้ยน/จ่ายน้อยกว่าที่อ้าง = ไม่เติม
// [7] แยกทาง — usageBySource แยกยอดตามต้นทางได้จริง (คำถาม "เงินหมดไปกับอะไร")
//
// รัน: pnpm exec tsx scripts/qc-ai-credit.mts
process.env.SHARK_AI_MOCK = "1"; // ไม่ยิง LLM จริง — ข้อสอบห้ามเผาเงิน
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ env จาก secrets */ }

const { prisma } = await import("@/lib/core/db");
const pricing = await import("@/lib/ai/pricing");
const credit = await import("@/lib/ai/credit");
const topup = await import("@/lib/ai/topup");
const svc = await import("@/lib/ai/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}

const M = pricing.MICRO_PER_USD;

// ─────────── [1] ราคา (pure — ไม่แตะ DB) ───────────
console.log("── ราคา: คิดเงินตามราคาโมเดลจริง ──");
{
  // haiku $1/$5 ต่อ 1M → 1M in + 1M out = $6 = 6,000,000 micro
  const haiku = pricing.costMicroUsd("anthropic/claude-haiku-4.5", 1_000_000, 1_000_000);
  chk("PR-1.1", "haiku 1M in + 1M out = $6", haiku === 6 * M, String(6 * M), String(haiku));
  // sonnet $3/$15 → $18
  const sonnet = pricing.costMicroUsd("anthropic/claude-sonnet-5", 1_000_000, 1_000_000);
  chk("PR-1.2", "sonnet 1M in + 1M out = $18", sonnet === 18 * M, String(18 * M), String(sonnet));
  chk("PR-1.3", "ขาออกแพงกว่าขาเข้า (token เท่ากันแต่ราคาต่างกัน)",
    pricing.costMicroUsd("haiku", 0, 1000) > pricing.costMicroUsd("haiku", 1000, 0), "out > in", "ไม่ใช่");
  chk("PR-1.4", "ใช้จริงแต่เศษน้อย → ไม่คิดเป็น 0 (ห้ามมีการเรียกที่ฟรีสนิท)",
    pricing.costMicroUsd("haiku", 1, 0) >= 1, "≥1", String(pricing.costMicroUsd("haiku", 1, 0)));
  chk("PR-1.5", "ไม่ได้ใช้เลย = 0", pricing.costMicroUsd("haiku", 0, 0) === 0, "0", String(pricing.costMicroUsd("haiku", 0, 0)));
  chk("PR-1.6", "โมเดลไม่รู้จัก → คิดเรทแพงสุด (ปลอดภัยกว่าคิดถูกไปแล้วขาดทุนเงียบ)",
    pricing.costMicroUsd("ยี่ห้อประหลาด", 1_000_000, 0) === pricing.costMicroUsd("opus", 1_000_000, 0),
    "= opus", "ไม่เท่า");
}

// ─────────── [6] webhook (pure) ───────────
console.log("── webhook เติมเงิน: ตรวจ reference + ยอดจ่ายจริง ──");
{
  const ref = topup.buildReference("t_abc", 10 * M, "n1");
  const parsed = topup.parseReference(ref);
  chk("WH-1.1", "reference ไป-กลับได้ครบ (tenant + จำนวนเงิน)",
    parsed?.tenantId === "t_abc" && parsed?.microUsd === 10 * M, "t_abc/10000000", JSON.stringify(parsed));
  chk("WH-1.2", "reference เพี้ยน → null (ไม่เดา ไม่เติมมั่ว)",
    topup.parseReference("ขยะ") === null && topup.parseReference("aicredit:x:0:n") === null, "null ทั้งคู่", "มีตัวที่ผ่าน");
}

let tenantId = "";
let tenantB = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC เครดิต AI", slug: `qc-credit-${Date.now()}` } });
  tenantId = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC เครดิต B", slug: `qc-credit-b-${Date.now()}` } });
  tenantB = t2.id;

  // ─────────── [2] เครดิตต้อนรับ ───────────
  console.log("── กระเป๋า: เครดิตต้อนรับแจกครั้งเดียว ──");
  const w1 = await credit.ensureWallet(tenantId);
  chk("WA-2.1", "เปิดกระเป๋าครั้งแรกได้เครดิตต้อนรับ $10", w1.balanceMicro === credit.welcomeGrantMicro(),
    String(credit.welcomeGrantMicro()), String(w1.balanceMicro));
  const w2 = await credit.ensureWallet(tenantId);
  chk("WA-2.2", "เรียกซ้ำไม่แจกซ้ำ (ยอดคงเดิม)", w2.balanceMicro === w1.balanceMicro, String(w1.balanceMicro), String(w2.balanceMicro));
  const grants = await prisma.aiCreditTxn.count({ where: { tenantId, kind: "GRANT" } });
  chk("WA-2.3", "ledger มีรายการ GRANT ใบเดียว", grants === 1, "1", String(grants));

  // ─────────── [3] หักเงิน ───────────
  console.log("── หักเงิน: ตรงตามจริง + ลง ledger ──");
  const before = await credit.balanceOf(tenantId);
  const charged = await credit.chargeUsage({ tenantId }, {
    source: "CHAT", model: "anthropic/claude-haiku-4.5", tokensIn: 100_000, tokensOut: 10_000,
  });
  const after = await credit.balanceOf(tenantId);
  chk("CH-3.1", "หักเท่ากับราคาที่คิดได้", before - after === charged, String(charged), String(before - after));
  const last = await prisma.aiCreditTxn.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  chk("CH-3.2", "ledger บันทึกยอดติดลบ + balanceAfter ตรงกับยอดจริง",
    last?.amountMicro === -charged && last?.balanceAfter === after, `${-charged}/${after}`,
    JSON.stringify({ a: last?.amountMicro, b: last?.balanceAfter }));
  chk("CH-3.3", "เก็บโมเดล + token ไว้ตรวจย้อนหลังได้",
    last?.model === "anthropic/claude-haiku-4.5" && last?.tokensIn === 100_000 && last?.tokensOut === 10_000,
    "ครบ", JSON.stringify({ m: last?.model, i: last?.tokensIn, o: last?.tokensOut }));

  // ─────────── [5] เติมเงิน idempotent ───────────
  console.log("── เติมเงิน: ยิงซ้ำต้องไม่เติมซ้ำ ──");
  const t1 = await credit.topUp(tenantId, 5 * M, { ref: "charge_xyz" });
  const t2r = await credit.topUp(tenantId, 5 * M, { ref: "charge_xyz" });
  chk("TU-5.1", "เติมครั้งแรกเข้าจริง", t1.credited === true && t1.balanceMicro === after + 5 * M,
    String(after + 5 * M), String(t1.balanceMicro));
  chk("TU-5.2", "ref เดิมยิงซ้ำ → ไม่เติมซ้ำ (webhook ยิงซ้ำได้ตามสเปค)",
    t2r.credited === false && t2r.balanceMicro === t1.balanceMicro, "ไม่เติม/ยอดเท่าเดิม", JSON.stringify(t2r));

  // ─────────── [6] creditFromCharge ตรวจยอดจ่ายจริง ───────────
  const refB = topup.buildReference(tenantB, 10 * M, "nb");
  await credit.ensureWallet(tenantB);
  const balB0 = await credit.balanceOf(tenantB);
  const short = await topup.creditFromCharge({ referenceId: refB, chargeId: "c_short", paidSatang: 100 }); // จ่าย 1 บาท
  chk("WH-1.3", "จ่ายน้อยกว่าที่ reference อ้าง → ไม่เติม (กันแก้ราคาฝั่ง client)",
    short.ok === false && (await credit.balanceOf(tenantB)) === balB0, "ไม่เติม", JSON.stringify(short));
  const okPay = await topup.creditFromCharge({
    referenceId: refB, chargeId: "c_ok", paidSatang: Math.round(10 * topup.thbPerUsd() * 100),
  });
  chk("WH-1.4", "จ่ายครบ → เติมเข้าจริง", okPay.ok === true && (await credit.balanceOf(tenantB)) === balB0 + 10 * M,
    String(balB0 + 10 * M), String(await credit.balanceOf(tenantB)));

  // ─────────── [4] เครดิตหมด = กันตั้งแต่ต้นทาง ───────────
  console.log("── เครดิตหมด: ต้องกันก่อนแตะ provider ──");
  await prisma.aiCreditWallet.update({ where: { tenantId }, data: { balanceMicro: 0 } });
  chk("BL-4.1", "ยอด 0 → canSpend = false", (await credit.canSpend(tenantId)) === false, "false", "true");

  let providerCalls = 0;
  const spy = { chat: async () => { providerCalls++; return { text: "ไม่ควรถูกเรียก", tokensIn: 1, tokensOut: 1, model: "mock" }; } };
  const blocked = await svc.sendMessage({ tenantId }, { text: "ยอดขายวันนี้เท่าไหร่" }, { provider: spy });
  chk("BL-4.2", "เครดิตหมด → over_budget scope=credit **โดยไม่เรียก provider เลย**",
    blocked.ok === false && blocked.error === "over_budget" && blocked.scope === "credit" && providerCalls === 0,
    "over_budget/credit/0 call", JSON.stringify({ r: blocked, calls: providerCalls }));

  await credit.topUp(tenantId, 2 * M, { ref: "refill-after-block" });
  const okRes = await svc.sendMessage({ tenantId }, { text: "สวัสดี" }, { provider: spy });
  chk("BL-4.3", "เติมแล้วคุยต่อได้ทันที (ไม่ต้องรอรอบใหม่)", okRes.ok === true && providerCalls === 1,
    "ok/1 call", JSON.stringify({ ok: okRes.ok, calls: providerCalls }));
  const chatTxn = await prisma.aiCreditTxn.findFirst({
    where: { tenantId, kind: "USAGE", source: "CHAT" }, orderBy: { createdAt: "desc" },
  });
  chk("BL-4.4", "แชทที่สำเร็จถูกหักเงินจริง (ไม่มีการใช้ฟรี)", (chatTxn?.amountMicro ?? 0) < 0,
    "amount < 0", String(chatTxn?.amountMicro));

  // ─────────── [7] แยกยอดตามต้นทาง ───────────
  console.log("── แยกยอดตามต้นทาง: ตอบได้ว่าเงินหมดไปกับอะไร ──");
  await credit.chargeUsage({ tenantId }, { source: "WEEKLY_REPORT", model: "sonnet", tokensIn: 20_000, tokensOut: 2_000 });
  await credit.chargeUsage({ tenantId }, { source: "AUTO_TITLE", model: "haiku", tokensIn: 500, tokensOut: 60 });
  const by = await credit.usageBySource(tenantId, 30);
  const kinds = new Set(by.map((r) => r.source));
  chk("BS-7.1", "แยกได้ครบทั้ง CHAT / WEEKLY_REPORT / AUTO_TITLE",
    kinds.has("CHAT") && kinds.has("WEEKLY_REPORT") && kinds.has("AUTO_TITLE"), "ครบ 3", JSON.stringify([...kinds]));
  chk("BS-7.2", "ยอดที่แยกได้เป็นบวกทุกช่อง (ยอดใช้ ไม่ใช่ยอดติดลบดิบ)",
    by.every((r) => r.spentMicro > 0), "บวกหมด", JSON.stringify(by));
  chk("BS-7.3", "รายงานสัปดาห์ (sonnet) แพงกว่าตั้งชื่อห้อง (haiku) — น้ำหนักโมเดลมีผลจริง",
    (by.find((r) => r.source === "WEEKLY_REPORT")?.spentMicro ?? 0) >
      (by.find((r) => r.source === "AUTO_TITLE")?.spentMicro ?? 0), "weekly > title", JSON.stringify(by));

  // ─────────── [8] งานที่ระบบทำเองต้องปิดไว้ก่อน ───────────
  console.log("── ค่าเริ่มต้น: ระบบต้องไม่หักเงินจากงานที่ร้านไม่ได้สั่ง ──");
  const s0 = await credit.getAiSettings(tenantId);
  chk("AU-8.1", "ร้านใหม่: รายงานสัปดาห์ปิดอยู่ (ไม่ต้องสร้างแถวก่อน)", s0.weeklyReportEnabled === false, "false", String(s0.weeklyReportEnabled));
  chk("AU-8.2", "ร้านที่ยังไม่เปิดสวิตช์ ไม่อยู่ในรายชื่อที่ cron จะยิง",
    !(await credit.tenantsWithWeeklyReport()).includes(tenantId), "ไม่อยู่", "อยู่");
  await credit.setWeeklyReportEnabled(tenantId, true);
  chk("AU-8.3", "เปิดสวิตช์แล้วเข้ารายชื่อที่ cron ยิง",
    (await credit.tenantsWithWeeklyReport()).includes(tenantId) && (await credit.getAiSettings(tenantId)).weeklyReportEnabled,
    "อยู่/true", "ไม่อยู่");
  await credit.setWeeklyReportEnabled(tenantId, false);
  chk("AU-8.4", "ปิดกลับได้ (ไม่ใช่ทางเดียว)",
    !(await credit.tenantsWithWeeklyReport()).includes(tenantId), "ไม่อยู่", "ยังอยู่");
  const analystSrc = (await import("node:fs")).readFileSync("src/lib/ai/analyst.ts", "utf8");
  chk("AU-8.5", "cron รายงานสัปดาห์กรองด้วยสวิตช์จริง ไม่ใช่ยิงทุกร้านที่มีระบบ",
    analystSrc.includes("tenantsWithWeeklyReport"), "มีการกรอง", "ยังยิงทุกร้าน");
  chk("AU-8.6", "การ์ดตั้งงานประจำบอกค่าใช้จ่ายก่อนให้กดยืนยัน",
    (await import("node:fs")).readFileSync("src/lib/ai/tools.ts", "utf8").includes("ใช้เครดิตประมาณ"), "บอกราคา", "ไม่บอก");

  // ─────────── ledger ต้องอ่านย้อนหลังได้ ───────────
  const page = await credit.listTxns(tenantId, { take: 3 });
  chk("LG-8.1", "ประวัติเรียงล่าสุดก่อน + มี cursor ให้ดูต่อ",
    page.rows.length === 3 && page.nextCursor !== null &&
      page.rows[0].createdAt >= page.rows[2].createdAt, "3 แถว + cursor", JSON.stringify({ n: page.rows.length, c: page.nextCursor }));
} catch (e) {
  chk("CRASH", "harness ทำงานจนจบ", false, "จบปกติ", e instanceof Error ? (e.stack ?? e.message).slice(0, 200) : String(e));
} finally {
  for (const id of [tenantId, tenantB]) {
    if (!id) continue;
    const del = async (n: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (err) { console.log(`  ⚠ cleanup ${n}: ${err instanceof Error ? err.message.slice(0, 60) : err}`); }
    };
    await del("txn", () => prisma.aiCreditTxn.deleteMany({ where: { tenantId: id } }));
    await del("wallet", () => prisma.aiCreditWallet.deleteMany({ where: { tenantId: id } }));
    await del("aiSettings", () => prisma.aiSettings.deleteMany({ where: { tenantId: id } }));
    await del("aiMessage", () => prisma.aiMessage.deleteMany({ where: { tenantId: id } }));
    await del("aiConversation", () => prisma.aiConversation.deleteMany({ where: { tenantId: id } }));
    await del("aiUsage", () => prisma.aiUsage.deleteMany({ where: { tenantId: id } }));
    await del("aiUsageWindow", () => prisma.aiUsageWindow.deleteMany({ where: { tenantId: id } }));
    await del("tenant", () => prisma.tenant.delete({ where: { id } }));
  }
  console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: เครดิตผู้ช่วย AI =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
