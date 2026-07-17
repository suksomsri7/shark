// QC — DEPOSIT/ROOM_CHARGE ลงบัญชีถูกช่อง (WO-0040a) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// ปัญหาเดิม (account-bridge.ts channelOf): DEPOSIT/ROOM_CHARGE ถูกยุบเป็น TRANSFER → ลงธนาคาร (1010) ผิด
//   ที่ถูก: DEPOSIT = ลูกค้าใช้เงินมัดจำที่วางไว้ → Dr 2110 เงินมัดจำรับ (ลดหนี้สิน) · ROOM_CHARGE = ลงบิลห้อง → Dr 1100 ลูกหนี้
// สัญญาแก้ (คงสมดุล Cr รายได้ 4000 + Cr VAT 2200 เท่าเดิม เปลี่ยนแค่ขา Dr):
//   1) src/lib/modules/pos/account-bridge.ts channelOf → คืน PosPayType passthrough: "CASH"|"TRANSFER"|"PROMPTPAY"|"DEPOSIT"|"ROOM_CHARGE" (เลิกยุบ DEPOSIT/ROOM_CHARGE)
//   2) src/lib/modules/account/index.ts applyExternalSale: payMethods channel type +DEPOSIT +ROOM_CHARGE ·
//      drLines key map: CASH→"CASH" · PROMPTPAY/TRANSFER→"BANK" · DEPOSIT→"DEPOSIT_RECEIVED" · ROOM_CHARGE→"AR"
//   3) src/lib/modules/account/gl.ts postExternalSale: drLines key type ขยายเป็น "CASH"|"BANK"|"DEPOSIT_RECEIVED"|"AR" (Book.id รองรับ key พวกนี้อยู่แล้ว — resolveLine)
//   ⚠️ ห้ามแตะ pos/service.ts (สร้างบิลเหมือนเดิม) · ห้ามแตะ oracle/CHART · qc-account-cpa 107 + qc-hotel-money + qc-pos-account ต้องเขียวเป๊ะ
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const pos = (await import("@/lib/modules/pos/service")) as unknown as { createSale: (i: any) => Promise<{ saleId: string }> };
const acc = (await import("@/lib/modules/account/service")) as unknown as { saveSettings: (t: string, s: string, x: unknown) => Promise<unknown> };
const gl = (await import("@/lib/modules/account/gl")) as unknown as { ensureAccounting: (c: { tenantId: string; systemId: string }) => Promise<unknown> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
async function drainAll() { try { const w = (await import("@/lib/outbox-consumers")) as unknown as { drainAll: () => Promise<unknown> }; await w.drainAll(); } catch {} }
async function entriesOf(systemId: string, refId: string) { return prisma.accountJournalEntry.findMany({ where: { systemId, refType: "PosSale", refId }, include: { lines: { include: { account: { select: { code: true } } } } } }); }
const sumSide = (es: any[], code: string, side: "dr" | "cr") => es.flatMap((e: any) => e.lines).filter((l: any) => l.account.code === code).reduce((a: number, l: any) => a + (side === "dr" ? l.debit : l.credit), 0);

let tenantId = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC MONEY-MAP", slug: `qc-mmap-${Date.now()}` } }); tenantId = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId, type: "HOTEL", name: "รีสอร์ต", slug: `mm-${Date.now()}` } });
  const posSys = await sys.createSystem(tenantId, "POS", "POS");
  const accSys = await sys.createSystem(tenantId, "ACCOUNT", "บัญชี");
  await acc.saveSettings(tenantId, accSys.id, { orgName: "รีสอร์ตคิวซี จำกัด", taxId: "0105561177639", vatRegistered: true } as never);
  await gl.ensureAccounting({ tenantId, systemId: accSys.id });
  await prisma.accountSystemLink.create({ data: { tenantId, systemId: accSys.id, linkedKind: "POS", linkedId: posSys.id } });
  const sale = (i: number, methods: { type: string; amountSatang: number }[]) => pos.createSale({ tenantId, unitId: unit.id, systemId: posSys.id, idempotencyKey: `mm-${i}-${t.slug}`, lines: [{ name: `รายการ #${i}`, qty: 1, unitPriceSatang: methods.reduce((a, m) => a + m.amountSatang, 0) }], payMethods: methods });

  // 1) DEPOSIT → Dr 2110 (ไม่ใช่ 1010)
  const s1 = await sale(1, [{ type: "DEPOSIT", amountSatang: 10700 }]); await drainAll();
  const e1 = await entriesOf(accSys.id, s1.saleId);
  const bal = (es: any[]) => { const d = es.flatMap((e: any) => e.lines).reduce((a: number, l: any) => a + l.debit, 0); const c = es.flatMap((e: any) => e.lines).reduce((a: number, l: any) => a + l.credit, 0); return d === c; };
  chk("MM-1.1", "DEPOSIT 107 → Dr เงินมัดจำรับ 2110 = 107 (ไม่เข้า 1010)", sumSide(e1, "2110", "dr") === 10700 && sumSide(e1, "1010", "dr") === 0, "2110=10700/1010=0", `2110=${sumSide(e1, "2110", "dr")}/1010=${sumSide(e1, "1010", "dr")}`);
  chk("MM-1.2", "entry สมดุล + Cr รายได้ 4000 = 100 (ฐานหลังถอด VAT) + Cr VAT 2200 = 7", bal(e1) && sumSide(e1, "4000", "cr") === 10000 && sumSide(e1, "2200", "cr") === 700, "สมดุล/100/7", `${bal(e1)}/${sumSide(e1, "4000", "cr")}/${sumSide(e1, "2200", "cr")}`);

  // 2) ROOM_CHARGE → Dr 1100 ลูกหนี้
  const s2 = await sale(2, [{ type: "ROOM_CHARGE", amountSatang: 21400 }]); await drainAll();
  const e2 = await entriesOf(accSys.id, s2.saleId);
  chk("MM-2.1", "ROOM_CHARGE 214 → Dr ลูกหนี้ 1100 = 214 (ไม่เข้า 1010) + สมดุล", sumSide(e2, "1100", "dr") === 21400 && sumSide(e2, "1010", "dr") === 0 && bal(e2), "1100=21400", `1100=${sumSide(e2, "1100", "dr")}/1010=${sumSide(e2, "1010", "dr")}`);

  // 3) CASH ยังถูก (regression ในตัว)
  const s3 = await sale(3, [{ type: "CASH", amountSatang: 10700 }]); await drainAll();
  const e3 = await entriesOf(accSys.id, s3.saleId);
  chk("MM-3.1", "CASH 107 → Dr เงินสด 1000 = 107 (พฤติกรรมเดิมไม่เพี้ยน)", sumSide(e3, "1000", "dr") === 10700 && bal(e3), "1000=10700", `1000=${sumSide(e3, "1000", "dr")}`);

  // 4) จ่ายผสม: CASH 50 + DEPOSIT 57 → Dr 1000=50 + Dr 2110=57
  const s4 = await sale(4, [{ type: "CASH", amountSatang: 5000 }, { type: "DEPOSIT", amountSatang: 5700 }]); await drainAll();
  const e4 = await entriesOf(accSys.id, s4.saleId);
  chk("MM-4.1", "จ่ายผสม CASH 50 + DEPOSIT 57 → Dr 1000=50 · Dr 2110=57 · สมดุล", sumSide(e4, "1000", "dr") === 5000 && sumSide(e4, "2110", "dr") === 5700 && bal(e4), "50/57", `1000=${sumSide(e4, "1000", "dr")}/2110=${sumSide(e4, "2110", "dr")}`);
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tenantId) {
    for (const m of ["accountJournalLine", "accountJournalEntry", "accountLedger", "accountMapping", "accountSettings", "accountSystemLink", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "outboxEvent", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId } }));
    await d(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Money Mapping =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
