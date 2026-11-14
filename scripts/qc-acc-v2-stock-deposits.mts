// QC ACC T4.8 — คลัง: สาเหตุเบิกครบ + ผู้อนุมัติ + ผลบัญชี/VAT · เงินประกันหอ 6 เท่า/3 ปี · แต้มคงค้าง ณ วันสิ้นงวด
// ใบงาน ledger/ACCOUNT-TAX-PLAN.md T4.8 (ปิด H3 I4 I9) · design note ledger/wo-notes/T4.8.md
// ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T4.8 คลัง" · ลบเองใน finally · KEEP=1 = เก็บไว้)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-stock-deposits.mts
//
// เฉลยมือ (สตางค์): สินค้า ทุน 1,000/หน่วย สต็อก 100
//   G1 ของแถม 2 หน่วย (ออกทันที โดยเจ้าของ) → Dr 6310 2,000 / Cr 1200 2,000 · ผู้อนุมัติ = เจ้าของ · คำเตือน GIVEAWAY
//   G2 ใช้ส่วนตัวเจ้าของ 3 หน่วย: ไม่ยืนยัน = ไม่เขียนอะไร (legal STOCK_ISSUE_PERSONAL_USE) · ยืนยัน → Dr 3100 3,000 + แถวยืนยัน + APPROVER_SAME
//   G3 ของเสีย 1 หน่วย ร่างโดยพนักงาน → อนุมัติโดยเจ้าของ → Dr 5320 1,000 · ผู้อนุมัติ = เจ้าของ · ไม่มี APPROVER_SAME
//   G4 สินค้าขาด 1 หน่วย ร่างและอนุมัติโดยเจ้าของ → APPROVER_SAME
//   G5 "ชำรุด/สูญหาย" (สาเหตุเดิม) 1 หน่วย → Dr 5300 (บัญชีเดิม ไม่เปลี่ยน) + คำเตือน WASTE
//   หอ: L1 ค่าเช่า 5,000 ประกัน 30,000 (6 เท่า) 12 เดือน = ผ่าน · L2 ประกัน 35,000 (7 เท่า) = เกิน · L3 ค่าเช่า 4,000 ประกัน 8,000 สัญญา 48 เดือน = เกินปี
//        L4 ต่อสัญญา (ก่อน 24 + นี้ 24 = 48 เดือน) ค่าเช่า 5,000 ประกัน 10,000 = แนวทางไม่ยืนยัน · ร้านตั้ง 7 เท่า → L2 ไม่เกิน + SHOP_DIFFERS
//   แต้ม: +500 (10 วันก่อน) · −200 (5 วันก่อน) · +300 (วันนี้) · อัตราแลก 10 สตางค์/แต้ม → ณ เมื่อวาน 300 แต้ม 3,000 · ณ วันนี้ 600 แต้ม 6,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-stock-deposits");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
const KEEP = process.env.KEEP === "1";
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const PR: Any = await import("@/lib/modules/account/product" as string);
const SR: Any = await import("@/lib/modules/account/stock-issue-reasons" as string);
const DP: Any = await import("@/lib/modules/account/deposits-points" as string);
const LV: Any = await import("@/lib/modules/account/legal-values" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);

const TENANT_NAME = "QC T4.8 คลัง";
async function purgeTenant(tenantId: string) {
  const rows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
  let pending = rows.map((r) => r.table_name).filter((t) => t !== "TenantDeletionLog");
  for (let pass = 0; pass < 12 && pending.length > 0; pass++) {
    const still: string[] = [];
    for (const t of pending) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenantId);
      } catch {
        still.push(t);
      }
    }
    if (still.length === pending.length) break;
    pending = still;
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

// ═══ K0 นิยามสาเหตุ ═══
console.log("\n── K0 สาเหตุการเบิก ──");
{
  const d = SR.GOODS_ISSUE_REASON_DEFS as Any[];
  const by = (c: string) => d.find((x) => x.code === c);
  chk("K0.1", "สาเหตุครบ: ของแถม · อาหารพนักงาน · ใช้ส่วนตัว · ของเสีย · สินค้าขาด + สาเหตุเดิม 5 ตัว", ["GIVEAWAY", "STAFF_MEAL", "PERSONAL_USE", "WASTE", "SHORTAGE"].every((c) => by(c)) && ["ใช้ในกิจการ", "ตัวอย่าง/แจก", "ชำรุด/สูญหาย", "โอนสาขา", "อื่น ๆ"].every((l) => PR.GOODS_ISSUE_REASONS.includes(l)), "ครบ", d.map((x) => x.code));
  chk("K0.2", "สาเหตุเดิมคงบัญชี 5300 · ใหม่: ของแถม 6310 · อาหาร 6050 · ใช้ส่วนตัว 3100 · ของเสีย/ขาด 5320", ["BUSINESS_USE", "SAMPLE", "DAMAGED", "TRANSFER", "OTHER"].every((c) => by(c).defaultCode === "5300") && by("GIVEAWAY").defaultCode === "6310" && by("STAFF_MEAL").defaultCode === "6050" && by("PERSONAL_USE").defaultCode === "3100" && by("WASTE").defaultCode === "5320" && by("SHORTAGE").defaultCode === "5320", "ตามนั้น", d.map((x) => [x.code, x.defaultCode]));
  const pw = W.legalWarning("STOCK_ISSUE_PERSONAL_USE");
  chk("K0.3", "ใช้ส่วนตัว = ถือเป็นขาย [V] ม.77/1(8)(ง) · ต้องยืนยัน", pw.tag === "V" && pw.ack === true && /ม\.77\/1\(8\)\(ง\)/.test(pw.lawTh ?? "") && by("PERSONAL_USE").deemedSale === true, "V+ack", pw);
  chk("K0.4", "ของแถม ฉ.40 ข้อ 2(1) · อาหาร ข้อ 2(8) · ตัวอย่าง ข้อ 2(7) [V] · ขาด [U]", /ข้อ 2\(1\)/.test(W.legalWarning("STOCK_ISSUE_GIVEAWAY").lawTh) && /ข้อ 2\(8\)/.test(W.legalWarning("STOCK_ISSUE_STAFF_MEAL").lawTh) && /ข้อ 2\(7\)/.test(W.legalWarning("STOCK_ISSUE_SAMPLE").lawTh) && W.legalWarning("STOCK_ISSUE_SHORTAGE").tag === "U", "ครบ", "ขาด");
  chk("K0.5", "goodsIssueWarnings: ขาด + ผู้อนุมัติ = ผู้ทำ → SHORTAGE + APPROVER_SAME · ร่าง (ยังไม่อนุมัติ) ไม่เตือนผู้อนุมัติ", JSON.stringify(SR.goodsIssueWarnings("SHORTAGE", { createdById: "u", approverId: "u" }).map((w: Any) => w.code)) === JSON.stringify(["STOCK_ISSUE_SHORTAGE", "STOCK_ISSUE_APPROVER_SAME"]) && SR.goodsIssueWarnings("SHORTAGE", { createdById: "u" }).length === 1, "ตามนั้น", "ต่าง");
}

let tid = "";
try {
  console.log("\n── K1 ฟิกซ์เจอร์ ──");
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  const stamp = Date.now().toString(36);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t48-${stamp}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-t48-${stamp}@qc.local`, name: "เจ้าของ T4.8" } });
  const clerk = await prisma.user.create({ data: { email: `qc-t48-${stamp}-c@qc.local`, name: "พนักงานคลัง T4.8" } });
  for (const u of [owner, clerk]) await prisma.membership.create({ data: { userId: u.id, tenantId: tid, role: u === owner ? "OWNER" : "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T4.8")).id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T4.8", vatRegistered: true, vatRateBp: 700, taxId: "0105561000017", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  const prod = await prisma.accountProduct.create({ data: { tenantId: tid, systemId: SYS, name: "น้ำดื่ม T4.8", type: "GOODS", buyPrice: 1_000, qtyOnHand: 100 } });
  const mk = (reason: string, qty: number, who: string, extra: Any = {}) =>
    PR.createGoodsMovement({ tenantId: tid, systemId: SYS, docType: "GOODS_ISSUE", lines: [{ productId: prod.id, qty }], createdById: who, adjustReason: reason, allowNegative: true, ...extra });
  const jvOf = async (docId: string) => prisma.accountJournalEntry.findFirst({ where: { systemId: SYS, refId: docId }, include: { lines: { include: { account: { select: { code: true } } } } } });
  const dr = (jv: Any) => (jv?.lines ?? []).filter((l: Any) => l.debit > 0).map((l: Any) => `${l.account.code}:${l.debit}`).join();

  // ═══ K2 ใบเบิก ═══
  console.log("\n── K2 ใบเบิก ──");
  const g1 = await mk("ของแถม", 2, owner.id);
  const g1d = g1.ok ? await prisma.accountDocument.findUnique({ where: { id: g1.id } }) : null;
  chk("K2.1", "ของแถม: Dr 6310 2,000 · รหัส GIVEAWAY · ผู้อนุมัติ = เจ้าของ · คำเตือน GIVEAWAY", g1.ok && dr(await jvOf(g1.id)) === "6310:2000" && g1d?.adjustReasonCode === "GIVEAWAY" && g1d?.approvedById === owner.id && g1.warnings?.some((w: Any) => w.code === "STOCK_ISSUE_GIVEAWAY"), "6310:2000", { g1, dr: g1.ok ? dr(await jvOf(g1.id)) : null });
  const before = await prisma.accountDocument.count({ where: { systemId: SYS } });
  const g2a = await mk("ใช้ส่วนตัวเจ้าของ", 3, owner.id);
  chk("K2.2", "ใช้ส่วนตัว ไม่ยืนยัน: ไม่ทำ (legal STOCK_ISSUE_PERSONAL_USE) · ไม่มีเอกสารใหม่", !g2a.ok && g2a.legal?.warnings?.some((w: Any) => w.code === "STOCK_ISSUE_PERSONAL_USE") && (await prisma.accountDocument.count({ where: { systemId: SYS } })) === before, "legal", g2a);
  const g2 = await mk("ใช้ส่วนตัวเจ้าของ", 3, owner.id, { ack: ["STOCK_ISSUE_PERSONAL_USE"] });
  const ackRow = g2.ok ? await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "legal.warning.ack", targetId: g2.id } }) : null;
  chk("K2.3", "ใช้ส่วนตัว ยืนยัน: Dr 3100 3,000 · แถวยืนยัน · APPROVER_SAME (ออกเองคนเดียว)", g2.ok && dr(await jvOf(g2.id)) === "3100:3000" && !!ackRow && g2.warnings?.some((w: Any) => w.code === "STOCK_ISSUE_APPROVER_SAME"), "3100:3000", { g2, ackRow: !!ackRow });
  const g3 = await mk("ของเสีย/ทำลาย", 1, clerk.id, { asDraft: true });
  const g3a = await PR.approveGoodsMovement(tid, SYS, g3.id, { allowNegative: true, approverId: owner.id });
  const g3d = await prisma.accountDocument.findUnique({ where: { id: g3.id } });
  chk("K2.4", "ของเสีย: ร่างโดยพนักงาน → เจ้าของอนุมัติ: Dr 5320 1,000 · ผู้อนุมัติ = เจ้าของ · ไม่มี APPROVER_SAME", g3a.ok && dr(await jvOf(g3.id)) === "5320:1000" && g3d?.approvedById === owner.id && !g3a.warnings?.some((w: Any) => w.code === "STOCK_ISSUE_APPROVER_SAME") && g3a.warnings?.some((w: Any) => w.code === "STOCK_ISSUE_WASTE"), "5320:1000", { g3a, dr: dr(await jvOf(g3.id)) });
  const g4 = await mk("สินค้าขาด (นับแล้วขาด)", 1, owner.id, { asDraft: true });
  const g4a = await PR.approveGoodsMovement(tid, SYS, g4.id, { allowNegative: true, approverId: owner.id });
  chk("K2.5", "สินค้าขาด: ร่างและอนุมัติโดยคนเดียวกัน → SHORTAGE + APPROVER_SAME (แจ้ง ไม่บล็อก)", g4a.ok && JSON.stringify(g4a.warnings?.map((w: Any) => w.code)) === JSON.stringify(["STOCK_ISSUE_SHORTAGE", "STOCK_ISSUE_APPROVER_SAME"]), ["SHORTAGE", "APPROVER_SAME"], g4a);
  const g5 = await mk("ชำรุด/สูญหาย", 1, owner.id);
  chk("K2.6", "สาเหตุเดิม 'ชำรุด/สูญหาย' คงบัญชี 5300 + คำเตือน WASTE", g5.ok && dr(await jvOf(g5.id)) === "5300:1000" && g5.warnings?.some((w: Any) => w.code === "STOCK_ISSUE_WASTE"), "5300:1000", { g5, dr: g5.ok ? dr(await jvOf(g5.id)) : null });
  const g6 = await mk("ใช้ในกิจการ", 1, owner.id);
  chk("K2.7", "ใช้ในกิจการ: 5300 · ไม่มีคำเตือน (พฤติกรรมเดิม)", g6.ok && dr(await jvOf(g6.id)) === "5300:1000" && !g6.warnings, "5300 ไม่เตือน", g6);
  const g7 = await mk("ใช้ส่วนตัวเจ้าของ", 1, owner.id, { asDraft: true });
  const g7a = await PR.approveGoodsMovement(tid, SYS, g7.id, { allowNegative: true, approverId: clerk.id });
  chk("K2.8", "อนุมัติร่าง 'ใช้ส่วนตัว' ไม่ยืนยัน = ไม่อนุมัติ (ยังเป็นร่าง)", !g7a.ok && g7a.legal && (await prisma.accountDocument.findUnique({ where: { id: g7.id } }))?.status === "DRAFT", "DRAFT", g7a);

  // ═══ K3 เงินประกันหอ ═══
  console.log("\n── K3 เงินประกันหอพัก ──");
  const dorm = await prisma.businessUnit.create({ data: { tenantId: tid, name: "หอ T4.8", type: "DORM", slug: `qc-t48-dorm-${stamp}` } });
  await prisma.accountSystemLink.create({ data: { tenantId: tid, systemId: SYS, linkedKind: "BUSINESS", linkedId: dorm.id } });
  const rt = await prisma.hotelRoomType.create({ data: { tenantId: tid, unitId: dorm.id, name: "ห้องพัดลม" } });
  const room = (n: string) => prisma.hotelRoom.create({ data: { tenantId: tid, unitId: dorm.id, roomTypeId: rt.id, number: n } });
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const lease = async (n: string, rent: number, dep: number, start: string, end: string, prev?: string, status = "ACTIVE") =>
    prisma.dormLease.create({ data: { tenantId: tid, unitId: dorm.id, roomId: (await room(n)).id, partyId: `party-${n}`, status, startDate: d(start), endDate: d(end), rentSatang: rent, depositSatang: dep, ...(prev ? { previousLeaseId: prev } : {}) } });
  await lease("101", 500_000, 3_000_000, "2026-01-01", "2026-12-31");
  await lease("102", 500_000, 3_500_000, "2026-01-01", "2026-12-31");
  await lease("103", 400_000, 800_000, "2026-01-01", "2029-12-31");
  const prevL = await lease("104", 500_000, 1_000_000, "2024-01-01", "2025-12-31", undefined, "ENDED");
  await lease("105", 500_000, 1_000_000, "2026-01-01", "2027-12-31", prevL.id);
  const rep = await DP.dormDepositReport(ctx, new Date());
  const row = (n: string) => rep.rows.find((r: Any) => r.roomNumber === n);
  chk("K3.1", "เพดาน 6 เท่า / 3 ปี จากตาราง · 4 สัญญาที่มีผล (ENDED ไม่นับ)", rep.maxMultiple === 6 && rep.maxYears === 3 && rep.rows.length === 4, "6/3/4", { m: rep.maxMultiple, y: rep.maxYears, n: rep.rows.length });
  chk("K3.2", "101 (6 เท่า · 12 เดือน) ไม่เตือน", row("101")?.multiple === 6 && !row("101")?.overMultiple && row("101")?.warnings.length === 0, "ไม่เตือน", row("101"));
  chk("K3.3", "102 (7 เท่า) → DORM_DEPOSIT_OVER_MULTIPLE [V]", row("102")?.multiple === 7 && row("102")?.overMultiple && row("102")?.warnings[0]?.code === "DORM_DEPOSIT_OVER_MULTIPLE" && row("102")?.warnings[0]?.tag === "V", "OVER_MULTIPLE", row("102"));
  chk("K3.4", "103 (48 เดือน) → DORM_DEPOSIT_LONG_CONTRACT", row("103")?.contractMonths === 48 && row("103")?.overYears && row("103")?.warnings.some((w: Any) => w.code === "DORM_DEPOSIT_LONG_CONTRACT"), "LONG", row("103"));
  chk("K3.5", "105 ต่อสัญญา (สาย 48 เดือน · สัญญานี้ 24) → DORM_DEPOSIT_UNVERIFIED_CASE [U]", row("105")?.chainMonths === 48 && !row("105")?.overYears && row("105")?.warnings.some((w: Any) => w.code === "DORM_DEPOSIT_UNVERIFIED_CASE" && w.tag === "U"), "UNVERIFIED", row("105"));
  chk("K3.6", "นับเกิน = 2 (102 · 103)", rep.flagged === 2, 2, rep.flagged);
  const sv = await LV.saveBookTax({ role: "OWNER", unitAccess: ["*"], permissions: {}, userId: owner.id }, ctx, { complianceRows: [{ id: "", key: "DORM_DEPOSIT_MAX_RENT_MULTIPLE", value: 7, from: null, to: null, source: "นักบัญชี", checkedAt: null }] });
  const rep2 = await DP.dormDepositReport(ctx, new Date());
  chk("K3.7", "ร้านตั้ง 7 เท่า: 102 ไม่เกินแล้ว · คำเตือน SHOP_DIFFERS_FROM_DEFAULT (บันทึก + รายงาน)", sv.ok && sv.warnings.some((w: Any) => w.code === "SHOP_DIFFERS_FROM_DEFAULT") && rep2.maxMultiple === 7 && !rep2.rows.find((r: Any) => r.roomNumber === "102")?.overMultiple && rep2.warnings.some((w: Any) => w.code === "SHOP_DIFFERS_FROM_DEFAULT"), "7 · เตือน", { sv: sv.warnings, w: rep2.warnings.map((w: Any) => w.code) });

  // ═══ K4 แต้มคงค้าง ═══
  console.log("\n── K4 แต้มคงค้าง ณ วันสิ้นงวด ──");
  const PT = (await sysSvc.createSystem(tid, "POINT", "แต้ม T4.8")).id;
  await prisma.pointSettings.create({ data: { tenantId: tid, burnRateSatang: 10 } });
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
  const pl = (delta: number, at: Date, key: string) => prisma.pointLedger.create({ data: { tenantId: tid, systemId: PT, customerId: "cust-t48", delta, type: delta > 0 ? "EARN" : "BURN", idempotencyKey: `qc-t48-${stamp}-${key}`, createdAt: at } });
  await pl(500, ago(10), "a");
  await pl(-200, ago(5), "b");
  await pl(300, new Date(), "c");
  const ymd = (dt: Date) => new Date(dt.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const y = await DP.pointsOutstandingAt(ctx, ymd(ago(1)));
  chk("K4.1", "ณ เมื่อวาน: 300 แต้ม · 3,000 สตางค์ · สมาชิก 1", y.totalPoints === 300 && y.totalValueSatang === 3_000 && y.rows[0]?.members === 1, "300/3000", y);
  const t = await DP.pointsOutstandingAt(ctx, ymd(new Date()));
  chk("K4.2", "ณ วันนี้: 600 แต้ม · 6,000 สตางค์", t.totalPoints === 600 && t.totalValueSatang === 6_000, "600/6000", t.totalPoints);
  chk("K4.3", "คำเตือน LOYALTY_POINTS_OUTSTANDING [U] พร้อมยอด", t.warnings[0]?.code === "LOYALTY_POINTS_OUTSTANDING" && t.warnings[0]?.tag === "U" && /600/.test(t.warnings[0].messageTh) && /60\.00/.test(t.warnings[0].messageTh), "เตือน", t.warnings);
  const e = await DP.pointsOutstandingAt(ctx, ymd(ago(20)));
  chk("K4.4", "ก่อนมีแต้ม: 0 · ไม่เตือน", e.totalPoints === 0 && e.warnings.length === 0, 0, e.totalPoints);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  if (tid && !KEEP) await purgeTenant(tid).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email: { startsWith: "qc-t48-" } } }).catch(() => undefined);
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T4.8 คลัง · เงินประกันหอ · แต้ม =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
