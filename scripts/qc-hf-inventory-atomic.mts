// QC — HF-INV-1: ตัวนับสต็อกต้องไม่ "อัปเดตหาย" เมื่อมีหลายรายการพร้อมกัน (D1) · oracle-first
//
// สัญญาที่คุม (ต้องแดงบนโค้ดเดิม 93573210 · เขียวหลังแก้):
//   ทุกการเปลี่ยนสต็อกของสินค้าตัวเดียวต้องเรียงคิวกัน (row lock ที่ InvItem ใน tx เดียวกับที่เขียน) ⇒ หลังทุกรอบ:
//     InvItem.onHand == Σ InvLocationStock == Σ InvMovement.qtyDelta (ledger)
//     แถวสต็อกต่อคลัง == Σ movement ของคลังนั้น · lot == Σ movement ของ lot นั้น
//     balanceAfter ต่อกันเป็นสายเดียวได้ (มีลำดับ serial ที่อธิบายทุกแถว) และต้นทุนถัวเฉลี่ยตรงเป๊ะตามกติกา rules.ts
//       (replay movingAvgCost ตามลำดับสาย · ขาออก/ปรับยอดต้องบันทึกต้นทุน = ค่าเฉลี่ย ณ ตอนนั้น)
//   idempotencyKey เดียวกันยิงพร้อมกัน ×10 ⇒ movement เดียว · ตัดครั้งเดียว · ไม่มี error โผล่ถึงผู้เรียก
//   ผู้เรียกหลายสินค้าใน tx เดียว (ใบเบิกบัญชี · ตัดส่วนประกอบชุด) สลับลำดับสินค้า ⇒ สำเร็จทุกใบ ไม่มี deadlock
//   ผู้เรียกจริง: POS createSale ×10 ขายสินค้าตัวเดียวกัน · รับของตาม PO ×2 ต่อใบพร้อมกัน
//
// รอบ 2 (R2 · แดงบน c4ca074b · เขียวหลังแก้):
//   R2.1 สินค้าบัญชีที่ "ไม่ผูกคลัง" — AccountProduct.qtyOnHand เปลี่ยนในคำสั่งเดียว (ไม่อ่าน-คำนวณ-เขียน):
//     เบิกพร้อมกัน (สลับลำดับบรรทัด) · เบิก+คืน · ตัดส่วนประกอบชุด [A,B]/[B,A] · ยอดยกมา+เบิก · กติกา "สต็อกไม่พอ" ใต้การแข่ง
//     (เอกสารชนิด/งวดเดียวกันเรียงคิวที่แถวเลขที่เอกสารอยู่แล้ว ⇒ ข้อสอบลงวันที่คนละเดือน = ทางที่แข่งกันได้จริง)
//   R2.2 รอล็อกสินค้าไม่เกิน 5 วิ (SET LOCAL lock_timeout · ไม่รั่วหลัง commit/rollback บน connection เดิม)
//     ตัวห่อรอเกิน → ลองใหม่ 1 ครั้ง (console.warn ไม่มีข้อมูลลูกค้า) → ข้อความไทยพร้อม cause ภายใน ≈5–11 วิ (ไม่ใช่ 30)
//   R2.3 เพดานคืนเบิกตรวจ "หลัง" ล็อก — คืน 2 ใบพร้อมกันเกินที่เบิก ⇒ สำเร็จใบเดียว (ผูกคลัง · ไม่ผูก · ปน)
//     + คืนครบจำนวนที่ยังคืนได้ต้องผ่าน (ใบที่กำลังคืนต้องไม่ถูกนับซ้ำเป็น "คืนไปแล้ว")
//
// การแข่ง: ≥10 รายการพร้อมกัน × 5 รอบ ต่อสถานการณ์ · ครึ่งหนึ่งผ่านตัวห่อ (pool ของแอป = คนละ connection)
//   อีกครึ่งผ่าน `*InTx` บน PrismaClient แยกต่อเลน (คนละ client · คนละ connection แน่นอน)
// DB: ฐาน QC ผ่าน qc-env-guard (กัน prod) · ร้านชั่วคราว slug qc-hfatom-* · ลบใน finally
import type { Prisma as PrismaNS } from "@prisma/client";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-hf-inventory-atomic");

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const inv = await import("@/lib/modules/inventory/service");
const proc = await import("@/lib/modules/inventory/procurement");
const { movingAvgCost } = await import("@/lib/modules/inventory/rules");
const pos = await import("@/lib/modules/pos/service");
const gl = await import("@/lib/modules/account/gl");
const prod = await import("@/lib/modules/account/product");
const link = await import("@/lib/modules/account/inventory-link");
const accSvc = await import("@/lib/modules/account/service");
const bundle = await import("@/lib/modules/account/bundle");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, detail = "", s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok || !detail ? "" : ` — ${detail}`}`);
};

const ROUNDS = 5;
const PAR = 10;
const stamp = Date.now();
const tenants: string[] = [];
const timings: Record<string, number[]> = {};
const time = async <T,>(tag: string, f: () => Promise<T>): Promise<T> => {
  const t0 = Date.now();
  try {
    return await f();
  } finally {
    (timings[tag] ??= []).push(Date.now() - t0);
  }
};
// สุ่มแบบกำหนดได้ (รันซ้ำได้ผลแบบเดียวกัน)
let seed = 20261001;
const rnd = (lo: number, hi: number) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return lo + (seed % (hi - lo + 1));
};

// เลน: PrismaClient แยกต่อเลน → การแข่งเกิดบนคนละ connection จริง
const lanes = Array.from({ length: PAR / 2 }, () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }));
type Tx = PrismaNS.TransactionClient;

// ต้นทุนเริ่มต้นของแต่ละสินค้า (ใช้ replay ค่าเฉลี่ย)
const initCost = new Map<string, number>();

type Mv = { id: string; type: string; locationId: string | null; lotCode: string | null; qtyDelta: number; balanceAfter: number; costSatang: number; createdAt: Date; newCost?: number };
// ใบปรับต้นทุน (บัญชี) ไม่มี movement — ใส่เป็นแถวเทียม COSTADJ ในสาย: ต้องเกิด ณ ยอดคงเหลือ = qty ของใบ
//   และต้นทุนเดิมของใบ = ค่าเฉลี่ย ณ ตอนนั้น แล้วค่าเฉลี่ยกลายเป็นต้นทุนใหม่
const costAdjOf = new Map<string, Mv[]>();

// มีลำดับ serial ที่อธิบายทุก movement ได้ไหม (balanceAfter ต่อกัน + ต้นทุนถัวเฉลี่ยตามกติกา) — DFS + ตัดกิ่งซ้ำ
function chainOk(mvs: Mv[], start: { bal: number; avg: number }, target: { bal: number; avg: number } | null, withCost: boolean): boolean {
  const n = mvs.length;
  const used = new Array<boolean>(n).fill(false);
  let steps = 0;
  const go = (k: number, bal: number, avg: number): boolean => {
    if (++steps > 300_000) return false;
    if (k === n) return target === null || (bal === target.bal && (!withCost || avg === target.avg));
    const tried = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const m = mvs[i];
      if (m.balanceAfter - m.qtyDelta !== bal) continue;
      let nAvg = avg;
      if (withCost) {
        if (m.type === "IN") nAvg = movingAvgCost(bal, avg, m.qtyDelta, m.costSatang);
        else if (m.costSatang !== avg) continue;
        if (m.type === "COSTADJ") nAvg = m.newCost ?? avg;
      }
      const key = `${m.type}|${m.qtyDelta}|${m.costSatang}|${m.balanceAfter}`;
      if (tried.has(key)) continue;
      tried.add(key);
      used[i] = true;
      if (go(k + 1, m.balanceAfter, nAvg)) return true;
      used[i] = false;
    }
    return false;
  };
  return go(0, start.bal, start.avg);
}

// ตรวจ invariant ครบชุดของสินค้า 1 ตัว → รายการปัญหา (ว่าง = ผ่าน)
async function problemsOf(itemId: string, defaultLocId: string): Promise<string[]> {
  const item = await prisma.invItem.findUniqueOrThrow({ where: { id: itemId } });
  const mvs: Mv[] = await prisma.invMovement.findMany({
    where: { itemId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, type: true, locationId: true, lotCode: true, qtyDelta: true, balanceAfter: true, costSatang: true, createdAt: true },
  });
  const locs = await prisma.invLocationStock.findMany({ where: { itemId } });
  const lots = await prisma.invLot.findMany({ where: { itemId } });
  const out: string[] = [];
  const ledger = mvs.reduce((s, m) => s + m.qtyDelta, 0);
  const locSum = locs.reduce((s, l) => s + l.onHand, 0);
  if (item.onHand !== ledger) out.push(`cache ${item.onHand} ≠ ledger ${ledger}`);
  if (item.onHand !== locSum) out.push(`cache ${item.onHand} ≠ Σlocation ${locSum}`);
  const byLoc = new Map<string, number>();
  for (const m of mvs) {
    const k = m.locationId ?? defaultLocId;
    byLoc.set(k, (byLoc.get(k) ?? 0) + m.qtyDelta);
  }
  for (const l of locs) {
    const want = byLoc.get(l.locationId) ?? 0;
    if (l.onHand !== want) out.push(`location row ${l.onHand} ≠ Σ its movements ${want}`);
  }
  for (const [k, v] of byLoc) if (v !== 0 && !locs.some((l) => l.locationId === k)) out.push(`movements at a location with no row (${v})`);
  for (const lot of lots) {
    const want = mvs.filter((m) => m.lotCode === lot.lotCode).reduce((s, m) => s + m.qtyDelta, 0);
    if (lot.onHand !== want) out.push(`lot ${lot.lotCode} ${lot.onHand} ≠ Σ lot movements ${want}`);
  }
  const main = [...mvs.filter((m) => m.type !== "TRANSFER"), ...(costAdjOf.get(itemId) ?? [])];
  if (!chainOk(main, { bal: 0, avg: initCost.get(itemId) ?? 0 }, { bal: item.onHand, avg: item.costSatang }, true)) {
    const bal = main.map((m) => m.balanceAfter);
    out.push(`balanceAfter/avg-cost chain broken (n=${main.length} cache onHand=${item.onHand} cost=${item.costSatang} · last balances ${bal.slice(-8).join(",")})`);
  }
  // คลังต่อคลัง: ขา TRANSFER บันทึกยอดคงเหลือ "ของคลัง" → ต้องต่อกันเป็นสายต่อคลัง
  const tLocs = new Set(mvs.filter((m) => m.type === "TRANSFER").map((m) => m.locationId ?? defaultLocId));
  for (const L of tLocs) {
    const atL = mvs.filter((m) => (m.locationId ?? defaultLocId) === L);
    // ใช้ได้เฉพาะสินค้าที่ IN/OUT ทั้งหมดเกิดตอนมีคลังเดียว (สถานการณ์โอน) — สินค้าอื่นไม่มี TRANSFER อยู่แล้ว
    if (!chainOk(atL, { bal: 0, avg: 0 }, null, false)) out.push(`per-location balanceAfter chain broken at a location (n=${atL.length})`);
  }
  return out;
}

const short = (e: unknown) => (e instanceof Error ? `${e.constructor.name}:${(e as { code?: string }).code ?? ""}:${e.message.replace(/\s+/g, " ").slice(0, 160)}` : String(e));
const settle = async (ps: Promise<unknown>[]) => {
  const rs = await Promise.allSettled(ps);
  return { ok: rs.filter((r) => r.status === "fulfilled").length, errs: rs.flatMap((r) => (r.status === "rejected" ? [short(r.reason)] : [])), rs };
};
const roundCheck = async (id: string, label: string, itemIds: string[], defLoc: string, errs: string[], extra?: { ok: boolean; detail: string }) => {
  const probs: string[] = [];
  for (const it of itemIds) for (const p of await problemsOf(it, defLoc)) probs.push(p);
  if (errs.length) probs.push(`${errs.length} call(s) threw: ${[...new Set(errs)].slice(0, 2).join(" | ")}`);
  if (extra && !extra.ok) probs.push(extra.detail);
  chk(id, label, probs.length === 0, probs.join(" · "));
};

try {
  // ═══════════ setup ร้าน 1: POS + คลัง (ไม่มีระบบบัญชี — ตัด GL ออกจากการแข่ง) ═══════════
  const t = await prisma.tenant.create({ data: { name: "QC HF-INV-1 atomic", slug: `qc-hfatom-${stamp}` } });
  tenants.push(t.id);
  const tid = t.id;
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "หน้าร้าน", slug: `hfatom-${stamp}` } });
  const posSys = await sys.createSystem(tid, "POS", "POS");
  const invSys = await sys.createSystem(tid, "INVENTORY", "คลัง");
  await sys.linkUnit(tid, posSys.id, unit.id);
  await sys.linkUnit(tid, invSys.id, unit.id);
  const ctx = { tenantId: tid, systemId: invSys.id };
  // คลัง default สร้างก่อนแข่ง (การสร้างคลัง default ครั้งแรกพร้อมกันเป็นอีกเรื่อง — ไม่ใช่ D1)
  const defLoc = (await inv.ensureDefaultLocation(ctx)).id;
  const loc2 = (await inv.createLocation(ctx, { name: "สาขา 2" })).id;
  const mkItem = async (sku: string, cost = 0) => {
    const it = await inv.createItem(ctx, { sku: `${sku}-${stamp}`, name: `QC ${sku}`, costSatang: cost });
    initCost.set(it.id, cost);
    return it.id;
  };
  const viaLane = <T,>(i: number, f: (tx: Tx) => Promise<T>): Promise<T> => lanes[i % lanes.length].$transaction((tx) => f(tx));
  const consumeTx = (i: number, input: Parameters<typeof inv.consumeInTx>[2]) => viaLane(i, (tx) => inv.consumeInTx(tx, ctx, input));
  const receiveTx = (i: number, input: Parameters<typeof inv.receiveInTx>[2]) => viaLane(i, (tx) => inv.receiveInTx(tx, ctx, input));

  // ═══════════ AT-1: ตัดพร้อมกัน ═══════════
  console.log("\nAT-1 ตัดสต็อกสินค้าตัวเดียว 10 รายการพร้อมกัน × 5 รอบ (5 ตัวห่อ + 5 InTx คนละ client)");
  const i1 = await mkItem("AT1", 1000);
  await inv.receive(ctx, { itemId: i1, qty: 500, costSatang: 1000, idempotencyKey: `at1-seed-${stamp}` });
  let expect1 = 500;
  for (let r = 1; r <= ROUNDS; r++) {
    const qs = Array.from({ length: PAR }, () => rnd(1, 3));
    expect1 -= qs.reduce((s, q) => s + q, 0);
    const res = await time("AT-1", () =>
      settle(qs.map((q, i) => (i % 2 === 0
        ? inv.consume(ctx, { itemId: i1, qty: q, idempotencyKey: `at1-${r}-${i}-${stamp}`, sourceModule: "POS" })
        : consumeTx(i, { itemId: i1, qty: q, idempotencyKey: `at1-${r}-${i}-${stamp}`, sourceModule: "POS" })))),
    );
    const oh = (await inv.onHand(ctx, [i1]))[0]?.onHand;
    await roundCheck(`AT-1.${r}`, `รอบ ${r}: cache = ledger = Σคลัง · สาย balanceAfter ต่อกัน · onHand = ${expect1}`, [i1], defLoc, res.errs, { ok: oh === expect1, detail: `onHand ${oh} ≠ expected ${expect1}` });
  }

  // ═══════════ AT-2: รับเข้าพร้อมกันคนละต้นทุน ═══════════
  console.log("\nAT-2 รับเข้าพร้อมกัน 10 รายการ คนละต้นทุน × 5 รอบ (ค่าเฉลี่ยตรงตามกติกาถึงสตางค์)");
  const i2 = await mkItem("AT2", 0);
  let expect2 = 0;
  for (let r = 1; r <= ROUNDS; r++) {
    const ls = Array.from({ length: PAR }, () => ({ q: rnd(1, 12), c: rnd(101, 9_999) }));
    expect2 += ls.reduce((s, l) => s + l.q, 0);
    const res = await time("AT-2", () =>
      settle(ls.map((l, i) => (i % 2 === 0
        ? inv.receive(ctx, { itemId: i2, qty: l.q, costSatang: l.c, idempotencyKey: `at2-${r}-${i}-${stamp}`, sourceModule: "procurement" })
        : receiveTx(i, { itemId: i2, qty: l.q, costSatang: l.c, idempotencyKey: `at2-${r}-${i}-${stamp}`, sourceModule: "procurement" })))),
    );
    const oh = (await inv.onHand(ctx, [i2]))[0]?.onHand;
    await roundCheck(`AT-2.${r}`, `รอบ ${r}: ไม่มีรับเข้าหาย (onHand = ${expect2}) · ค่าเฉลี่ยถัว = replay ตามลำดับจริง`, [i2], defLoc, res.errs, { ok: oh === expect2, detail: `onHand ${oh} ≠ expected ${expect2}` });
  }

  // ═══════════ AT-3: รับเข้า + ตัด ปนกัน (มี lot) ═══════════
  console.log("\nAT-3 รับเข้า + ตัด ปนกัน 10 รายการ × 5 รอบ (ครึ่งหนึ่งระบุ lot)");
  const i3 = await mkItem("AT3", 500);
  await inv.receive(ctx, { itemId: i3, qty: 100, costSatang: 500, idempotencyKey: `at3-seed-${stamp}`, lotCode: "LOT-A" });
  let expect3 = 100;
  for (let r = 1; r <= ROUNDS; r++) {
    const ops = Array.from({ length: PAR }, (_, i) => ({ inb: i % 2 === 0, q: rnd(1, 6), c: rnd(300, 900), lot: i % 4 < 2 ? "LOT-A" : null }));
    expect3 += ops.reduce((s, o) => s + (o.inb ? o.q : -o.q), 0);
    const res = await time("AT-3", () =>
      settle(ops.map((o, i) => {
        const key = `at3-${r}-${i}-${stamp}`;
        if (o.inb) return i % 4 === 0 ? inv.receive(ctx, { itemId: i3, qty: o.q, costSatang: o.c, idempotencyKey: key, lotCode: o.lot }) : receiveTx(i, { itemId: i3, qty: o.q, costSatang: o.c, idempotencyKey: key, lotCode: o.lot });
        return i % 4 === 1 ? inv.consume(ctx, { itemId: i3, qty: o.q, idempotencyKey: key, lotCode: o.lot }) : consumeTx(i, { itemId: i3, qty: o.q, idempotencyKey: key, lotCode: o.lot });
      })),
    );
    const oh = (await inv.onHand(ctx, [i3]))[0]?.onHand;
    await roundCheck(`AT-3.${r}`, `รอบ ${r}: cache = ledger = Σคลัง · lot = Σ movement ของ lot · ค่าเฉลี่ยตรง · onHand = ${expect3}`, [i3], defLoc, res.errs, { ok: oh === expect3, detail: `onHand ${oh} ≠ expected ${expect3}` });
  }

  // ═══════════ AT-4: โอน A→B และ B→A พร้อมกัน ═══════════
  console.log("\nAT-4 โอนคลังหลัก→สาขา 2 และกลับ พร้อมกัน 10 รายการ × 5 รอบ");
  const i4 = await mkItem("AT4", 700);
  await inv.receive(ctx, { itemId: i4, qty: 200, costSatang: 700, idempotencyKey: `at4-seed-${stamp}` });
  await inv.transfer(ctx, { itemId: i4, fromLocationId: defLoc, toLocationId: loc2, qty: 100, idempotencyKey: `at4-seed-tf-${stamp}` });
  for (let r = 1; r <= ROUNDS; r++) {
    const res = await time("AT-4", () =>
      settle(Array.from({ length: PAR }, (_, i) => inv.transfer(ctx, {
        itemId: i4,
        fromLocationId: i % 2 === 0 ? defLoc : loc2,
        toLocationId: i % 2 === 0 ? loc2 : defLoc,
        qty: rnd(1, 9),
        idempotencyKey: `at4-${r}-${i}-${stamp}`,
      }))),
    );
    const oh = (await inv.onHand(ctx, [i4]))[0]?.onHand;
    await roundCheck(`AT-4.${r}`, `รอบ ${r}: Σคลัง = 200 = onHand · แถวคลัง = Σ movement ของคลัง · สายยอดต่อคลังต่อกัน`, [i4], defLoc, res.errs, { ok: oh === 200, detail: `onHand ${oh} ≠ 200` });
  }

  // ═══════════ AT-5: นับสต็อก (adjust) แข่งกับการตัด ═══════════
  console.log("\nAT-5 ปรับยอดนับ (adjust) ×2 แข่งกับตัด ×8 × 5 รอบ");
  const i5 = await mkItem("AT5", 250);
  await inv.receive(ctx, { itemId: i5, qty: 300, costSatang: 250, idempotencyKey: `at5-seed-${stamp}` });
  for (let r = 1; r <= ROUNDS; r++) {
    const res = await time("AT-5", () =>
      settle(Array.from({ length: PAR }, (_, i) => (i === 3 || i === 7
        ? inv.adjust(ctx, { itemId: i5, newQty: 200 + r * 10 + i, idempotencyKey: `at5-${r}-${i}-${stamp}`, note: "นับสต็อก" })
        : i % 2 === 0
          ? inv.consume(ctx, { itemId: i5, qty: rnd(1, 4), idempotencyKey: `at5-${r}-${i}-${stamp}` })
          : consumeTx(i, { itemId: i5, qty: rnd(1, 4), idempotencyKey: `at5-${r}-${i}-${stamp}` })))),
    );
    await roundCheck(`AT-5.${r}`, `รอบ ${r}: ปรับยอดกับตัดเรียงกัน — qtyDelta ของ ADJUST = ยอดนับ − ยอดก่อนหน้าจริง · สายต่อกัน`, [i5], defLoc, res.errs);
  }

  // ═══════════ AT-6: idempotencyKey เดียวกัน ×10 พร้อมกัน ═══════════
  console.log("\nAT-6 คีย์เดียวกันยิงพร้อมกัน 10 ครั้ง × 5 รอบ → movement เดียว · ตัดครั้งเดียว");
  const i6 = await mkItem("AT6", 100);
  await inv.receive(ctx, { itemId: i6, qty: 100, costSatang: 100, idempotencyKey: `at6-seed-${stamp}` });
  let expect6 = 100;
  for (let r = 1; r <= ROUNDS; r++) {
    const key = `at6-${r}-${stamp}`;
    expect6 -= 2;
    const res = await time("AT-6", () =>
      settle(Array.from({ length: PAR }, (_, i) => (i % 2 === 0
        ? inv.consume(ctx, { itemId: i6, qty: 2, idempotencyKey: key })
        : consumeTx(i, { itemId: i6, qty: 2, idempotencyKey: key })))),
    );
    const n = await prisma.invMovement.count({ where: { tenantId: tid, idempotencyKey: key } });
    const oh = (await inv.onHand(ctx, [i6]))[0]?.onHand;
    chk(`AT-6.${r}a`, `รอบ ${r}: movement ของคีย์นี้ = 1 · onHand = ${expect6} (ตัดครั้งเดียว)`, n === 1 && oh === expect6, `movements ${n} onHand ${oh}`);
    const ids = new Set(res.rs.flatMap((x) => (x.status === "fulfilled" ? [(x.value as { id: string }).id] : [])));
    chk(`AT-6.${r}b`, `รอบ ${r}: ทั้ง 10 ครั้งคืนรายการเดิม ไม่มี error ถึงผู้เรียก`, res.errs.length === 0 && ids.size === 1, `errors ${res.errs.length} (${res.errs[0] ?? ""}) · distinct ids ${ids.size}`, "MAJOR");
  }
  await roundCheck("AT-6.z", "หลัง 5 รอบ: invariant ครบ", [i6], defLoc, []);

  // ═══════════ AT-8: POS createSale ×10 พร้อมกัน ขายสินค้าตัวเดียว ═══════════
  console.log("\nAT-8 POS ขายสินค้าตัวเดียว 10 บิลพร้อมกัน × 5 รอบ (ตัดสต็อกหลังบิล commit)");
  const i8 = await mkItem("AT8", 2000);
  await inv.receive(ctx, { itemId: i8, qty: 400, costSatang: 2000, idempotencyKey: `at8-seed-${stamp}` });
  const sale = (k: string, q: number) => pos.createSale({
    tenantId: tid, unitId: unit.id, systemId: posSys.id, idempotencyKey: k,
    lines: [{ name: "QC สินค้า", qty: q, unitPriceSatang: 5000, itemId: i8 }],
    payMethods: [{ type: "CASH", amountSatang: 5000 * q }],
  });
  await sale(`at8-warm-${stamp}`, 1); // เลขใบเสร็จงวดแรกสร้างก่อนแข่ง
  let expect8 = 399;
  for (let r = 1; r <= ROUNDS; r++) {
    const qs = Array.from({ length: PAR }, () => rnd(1, 3));
    expect8 -= qs.reduce((s, q) => s + q, 0);
    const res = await time("AT-8", () => settle(qs.map((q, i) => sale(`at8-${r}-${i}-${stamp}`, q))));
    const ids = res.rs.flatMap((x) => (x.status === "fulfilled" ? [(x.value as { saleId: string }).saleId] : []));
    const outs = await prisma.invMovement.count({ where: { tenantId: tid, type: "OUT", refType: "PosSale", refId: { in: ids } } });
    const oh = (await inv.onHand(ctx, [i8]))[0]?.onHand;
    await roundCheck(`AT-8.${r}`, `รอบ ${r}: 10 บิล → OUT 10 แถว · onHand = ${expect8} · invariant ครบ`, [i8], defLoc, res.errs, { ok: outs === PAR && oh === expect8, detail: `OUT rows ${outs} onHand ${oh} (expected ${expect8})` });
  }

  // ═══════════ AT-9: รับของตาม PO พร้อมกัน (10 ใบ × กดซ้ำ 2 ครั้ง) ═══════════
  console.log("\nAT-9 รับของตาม PO 10 ใบพร้อมกัน แต่ละใบกด 2 ครั้ง × 5 รอบ (คนละต้นทุน)");
  const i9 = await mkItem("AT9", 0);
  const sup = await proc.createSupplier(ctx, { name: `QC ผู้ขาย ${stamp}` });
  let expect9 = 0;
  for (let r = 1; r <= ROUNDS; r++) {
    const poIds: string[] = [];
    for (let k = 0; k < PAR; k++) {
      const q = rnd(1, 10);
      expect9 += q;
      const po = await proc.createPo(ctx, { supplierId: sup.id, lines: [{ itemId: i9, qty: q, costSatang: rnd(500, 5_000) }] });
      await proc.markOrdered(ctx, po.id);
      poIds.push(po.id);
    }
    const res = await time("AT-9", () => settle(poIds.flatMap((id) => [proc.receivePo(ctx, id), proc.receivePo(ctx, id)])));
    const oks = res.rs.filter((x) => x.status === "fulfilled" && (x.value as { ok: boolean }).ok).length;
    const oh = (await inv.onHand(ctx, [i9]))[0]?.onHand;
    await roundCheck(`AT-9.${r}`, `รอบ ${r}: รับสำเร็จ 10/20 ครั้ง (ใบละครั้ง) · onHand = ${expect9} · ค่าเฉลี่ยตรง`, [i9], defLoc, res.errs, { ok: oks === PAR && oh === expect9, detail: `ok ${oks} onHand ${oh} (expected ${expect9})` });
  }

  // ═══════════ AT-11: ฐานข้อมูลยกเลิก tx ของตัวห่อเพราะ deadlock → ลองใหม่เอง ไม่ปล่อย error ดิบถึงผู้เรียก ═══════════
  // เลนถือแถวคลังของสินค้าไว้ แล้วค่อยขอล็อกแถวสินค้า (ลำดับกลับกับโมดูลคลัง — จงใจ) ขณะที่ตัวห่อถือแถวสินค้าแล้วรอแถวคลัง
  //   ⇒ deadlock จริง · ฝั่งที่รอก่อน (ตัวห่อ) มักถูกเลือกเป็นเหยื่อ → ต้องลองใหม่แล้วสำเร็จ (หรือได้ข้อความไทยให้ลองใหม่)
  console.log("\nAT-11 deadlock ที่ฐานข้อมูลเลือกตัวห่อเป็นเหยื่อ × 3 รอบ → ลองใหม่ 1 ครั้งแล้วสำเร็จ");
  const i11 = await mkItem("AT11", 300);
  await inv.receive(ctx, { itemId: i11, qty: 50, costSatang: 300, idempotencyKey: `at11-seed-${stamp}` });
  const deadlocks = async () => Number((await prisma.$queryRaw<{ n: bigint }[]>`SELECT deadlocks AS n FROM pg_stat_database WHERE datname = current_database()`)[0]?.n ?? 0);
  for (let r = 1; r <= 3; r++) {
    const d0 = await deadlocks();
    const lane = viaLane(0, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "InvLocationStock" WHERE "itemId" = ${i11} FOR UPDATE`;
      await tx.$executeRaw`SELECT pg_sleep(0.6)`;
      await tx.$queryRaw`SELECT "id" FROM "InvItem" WHERE "id" = ${i11} FOR UPDATE`;
      return "lane-ok";
    });
    await new Promise((res) => setTimeout(res, 200));
    const key = `at11-${r}-${stamp}`;
    const wrap = inv.consume(ctx, { itemId: i11, qty: 1, idempotencyKey: key });
    const [lr, wr] = await Promise.allSettled([lane, wrap]);
    await new Promise((res) => setTimeout(res, 1500)); // ให้สถิติ deadlock ของ PG flush
    const d1 = await deadlocks();
    const n = await prisma.invMovement.count({ where: { tenantId: tid, idempotencyKey: key } });
    const wrapErr = wr.status === "rejected" ? short(wr.reason) : "";
    const thaiBusy = wr.status === "rejected" && /ลองใหม่อีกครั้ง/.test(wrapErr);
    console.log(`     · รอบ ${r}: lane ${lr.status === "fulfilled" ? "สำเร็จ" : `ถูกยกเลิก (${short(lr.reason).replace(/^.*?invocation:? ?/, "").slice(0, 140)})`} · ตัวห่อ ${wr.status === "fulfilled" ? "สำเร็จ" : wrapErr.slice(0, 80)} · deadlock ที่ PG นับได้ +${d1 - d0}`);
    chk(`AT-11.${r}a`, `รอบ ${r}: ตัวห่อไม่ปล่อย error ดิบของฐานข้อมูล (สำเร็จ หรือข้อความไทยให้ลองใหม่) · movement ${wr.status === "fulfilled" ? "1" : "0"} แถว`, (wr.status === "fulfilled" && n === 1) || (thaiBusy && n === 0), `wrapper ${wr.status} ${wrapErr} · movements ${n}`);
    await roundCheck(`AT-11.${r}b`, `รอบ ${r}: invariant ครบหลัง deadlock`, [i11], defLoc, []);
    if (d1 - d0 < 1 || lr.status !== "fulfilled") console.log(`     ℹ️ รอบ ${r}: ${d1 - d0 < 1 ? "PG ไม่นับ deadlock (สถิติอาจยังไม่ flush หรือจังหวะไม่ชน)" : "เลนเป็นเหยื่อ — ตัวห่อไม่ต้องลองใหม่"}`);
  }

  // ═══════════ setup ร้าน 2: บัญชี + คลัง (ผู้เรียกหลายสินค้าใน tx เดียว) ═══════════
  console.log("\nAT-7 ผู้เรียกหลายสินค้าใน tx เดียว สลับลำดับ (ใบเบิก [A,B]/[B,A] + ตัดส่วนประกอบชุด [A,B]/[B,A]) × 5 รอบ");
  const t2 = await prisma.tenant.create({ data: { name: "QC HF-INV-1 multi", slug: `qc-hfatom-m-${stamp}` } });
  tenants.push(t2.id);
  const accSys = await sys.createSystem(t2.id, "ACCOUNT", "บัญชี");
  const inv2 = await sys.createSystem(t2.id, "INVENTORY", "คลัง");
  await gl.ensureAccounting({ tenantId: t2.id, systemId: accSys.id });
  const accCtx = { tenantId: t2.id, systemId: accSys.id };
  const ctx2 = { tenantId: t2.id, systemId: inv2.id };
  const defLoc2 = (await inv.ensureDefaultLocation(ctx2)).id;
  const mkGoods = async (sku: string, cost: number) => {
    const p = await prod.createProduct(t2.id, accSys.id, { name: `QC ${sku}`, type: "GOODS", sku: `${sku}-${stamp}`, buyPrice: cost, salePrice: cost * 2 });
    if (!p.ok) throw new Error(`createProduct ${sku}: ${p.reason}`);
    const item = await inv.createItem(ctx2, { sku: `${sku}-${stamp}`, name: `QC ${sku}`, costSatang: cost });
    initCost.set(item.id, cost);
    await inv.receive(ctx2, { itemId: item.id, qty: 5000, costSatang: cost, idempotencyKey: `at7-seed-${sku}-${stamp}` });
    const l = await link.linkProductToItem(accCtx, p.id, { itemId: item.id });
    if (!l.ok) throw new Error(`link ${sku}: ${l.reason}`);
    return { pid: p.id, itemId: item.id };
  };
  const A = await mkGoods("AT7A", 3000);
  const B = await mkGoods("AT7B", 4500);
  const mkBundle = async (name: string, order: { pid: string }[]) => {
    const b = await prod.createProduct(t2.id, accSys.id, { name, type: "BUNDLE", salePrice: 10_000 });
    if (!b.ok) throw new Error(`bundle ${name}: ${b.reason}`);
    const rcp = await prod.setBundleItems(t2.id, accSys.id, b.id, order.map((o) => ({ componentProductId: o.pid, qty: 1 })));
    if (!rcp.ok) throw new Error(`recipe ${name}: ${rcp.reason}`);
    return b.id;
  };
  const bundleAB = await mkBundle(`QC ชุด AB ${stamp}`, [A, B]);
  const bundleBA = await mkBundle(`QC ชุด BA ${stamp}`, [B, A]);
  const contact = await accSvc.createContact({ tenantId: t2.id, systemId: accSys.id, kind: "CUSTOMER", name: "QC ลูกค้า" });
  const draftDoc = async (bundleId: string) =>
    (await accSvc.createDocument({ tenantId: t2.id, systemId: accSys.id, docType: "INVOICE", contactId: contact.id, issueDate: new Date(), lines: [{ description: "ชุด", qty: 1, unitPrice: 10_000, productId: bundleId }] })).id;
  const issue = (order: { pid: string }[]) => prod.createGoodsMovement({ tenantId: t2.id, systemId: accSys.id, docType: "GOODS_ISSUE", lines: order.map((o) => ({ productId: o.pid, qty: rnd(1, 3) })), note: "QC เบิก" });
  // ใบแรกสร้างเลขที่งวดก่อนแข่ง
  const warm = await issue([A]);
  if (!warm.ok) throw new Error(`warm issue: ${warm.reason}`);
  for (let r = 1; r <= ROUNDS; r++) {
    const docs: { id: string; ab: boolean }[] = [];
    for (let k = 0; k < 6; k++) docs.push({ id: await draftDoc(k % 2 === 0 ? bundleAB : bundleBA), ab: k % 2 === 0 });
    const calls: Promise<unknown>[] = [];
    for (let k = 0; k < 4; k++) calls.push(issue(k % 2 === 0 ? [A, B] : [B, A]).then((x) => { if (!x.ok) throw new Error(`goods issue: ${x.reason}`); return x; }));
    // ตัดส่วนประกอบชุดบน client แยกต่อเลน (ตัวจริง `consumeBundleComponentsInTx` · ตัวห่อ `consumeBundleComponentsForDoc`
    //   ใช้ pool เดียวกับใบเบิก — 10 tx บัญชีพร้อมกันใน process เดียวกิน pool เต็ม แล้วรอ connection ที่ 11 ของ
    //   `inventorySystemId` จนหมดเวลา 30 วิ = ปัญหา pool เดิม ไม่ใช่ D1 · ดูโน้ต HF-INV-1 §7)
    docs.forEach((d, k) => calls.push(viaLane(k, (tx) => bundle.consumeBundleComponentsInTx(tx, accCtx, d.id)).then((x) => { if (x.consumed !== 2) throw new Error(`bundle consumed ${x.consumed}/2 (${x.reason ?? ""})`); return x; })));
    const res = await time("AT-7", () => settle(calls));
    await roundCheck(`AT-7.${r}`, `รอบ ${r}: 10 tx หลายสินค้าสลับลำดับ สำเร็จครบ ไม่มี deadlock · invariant A,B ครบ`, [A.itemId, B.itemId], defLoc2, res.errs);
  }

  // ═══════════ AT-10: ใบปรับต้นทุน (บัญชี · เขียน InvItem.costSatang ตรง) แข่งกับรับเข้า ═══════════
  console.log("\nAT-10 ใบปรับต้นทุนสินค้า ×1 แข่งกับรับเข้า ×9 × 5 รอบ (ต้นทุน/ยอดที่ใบใช้ = ค่า ณ จุดหนึ่งในสายจริง)");
  const C = await mkGoods("AT10C", 2500);
  for (let r = 1; r <= ROUNDS; r++) {
    const newCost = rnd(1_000, 9_000);
    const calls: Promise<unknown>[] = [
      prod.createCostAdjustment({ tenantId: t2.id, systemId: accSys.id, productId: C.pid, newCostSatang: newCost, reason: "QC ปรับต้นทุน" }).then((x) => {
        if (!x.ok) throw new Error(`cost adjustment: ${x.reason}`);
        const list = costAdjOf.get(C.itemId) ?? [];
        list.push({ id: x.id, type: "COSTADJ", locationId: null, lotCode: null, qtyDelta: 0, balanceAfter: x.qty, costSatang: x.oldCost, newCost: x.newCost, createdAt: new Date() });
        costAdjOf.set(C.itemId, list);
        return x;
      }),
    ];
    for (let k = 1; k < PAR; k++) {
      const q = rnd(1, 9);
      const c = rnd(500, 9_500);
      const key = `at10-${r}-${k}-${stamp}`;
      // R2: รับเข้าทั้งหมดผ่าน InTx บนเลน — ตัวห่อ `receive` โพสต์ GL หลัง commit และเลขที่ใบสำคัญ (gl.nextJournalNo = count+1)
      //   ชนกับ GL ของใบปรับต้นทุนเป็นครั้งคราว (P2002 systemId+docNo — ปัญหา GL เดิม ไม่ใช่สต็อก · ดูโน้ต Round 2)
      //   สัญญาของข้อนี้คือ "ใบปรับต้นทุนเรียงคิวกับรับเข้าที่ล็อก InvItem" — ตัวห่อกับ InTx ใช้ล็อกเดียวกัน
      calls.push(viaLane(k, (tx) => inv.receiveInTx(tx, ctx2, { itemId: C.itemId, qty: q, costSatang: c, idempotencyKey: key, sourceModule: "procurement" })));
    }
    const res = await time("AT-10", () => settle(calls));
    await roundCheck(`AT-10.${r}`, `รอบ ${r}: ใบปรับต้นทุน + รับเข้าเรียงคิวกัน — ยอด/ต้นทุนเดิมบนใบตรงกับจุดหนึ่งในสาย · ค่าเฉลี่ยสุดท้ายตรง`, [C.itemId], defLoc2, res.errs);
  }

  // ═══════════ R2.1 · AT-12..16: สินค้าบัญชีที่ไม่ผูกคลัง (AccountProduct.qtyOnHand) ═══════════
  // เอกสารเบิก/คืนชนิดเดียวกัน งวดเดียวกัน เรียงคิวกันที่แถว AccountDocSequence (upsert increment ถือล็อกจน commit)
  //   ⇒ การแข่งจริงเกิด "ข้ามงวด" (ลงวันที่ย้อนหลังคนละเดือน) · ข้ามชนิด (เบิก vs คืน) · ใบขายชุด · ยอดยกมา
  const R2 = 3;
  const acc = { tenantId: t2.id, systemId: accSys.id };
  const monthDate = (k: number) => new Date(Date.UTC(2025, k % 12, 15, 5)); // 12 งวดของปี 2025 = แถวเลขที่คนละแถว
  const mkUnlinked = async (sku: string) => {
    const p = await prod.createProduct(t2.id, accSys.id, { name: `QC ${sku}`, type: "GOODS", sku: `${sku}-${stamp}`, buyPrice: 100, salePrice: 200 });
    if (!p.ok) throw new Error(`createProduct ${sku}: ${p.reason}`);
    return p.id;
  };
  const setQty = (pid: string, q: number) => prisma.accountProduct.update({ where: { id: pid }, data: { qtyOnHand: q } });
  const qtyOf = async (pid: string) => Number((await prisma.accountProduct.findUniqueOrThrow({ where: { id: pid }, select: { qtyOnHand: true } })).qtyOnHand);
  type GLine = { productId: string; qty: number };
  const gDoc = (docType: "GOODS_ISSUE" | "GOODS_ISSUE_RETURN", lines: GLine[], issueDate: Date, extra: { sourceDocId?: string } = {}) =>
    prod.createGoodsMovement({ ...acc, docType, issueDate, lines, note: "QC R2", ...extra });
  const okOrThrow = (tag: string) => (x: { ok: boolean; reason?: string }) => {
    if (!x.ok) throw new Error(`${tag}: ${x.reason}`);
    return x;
  };

  console.log("\nAT-12 ใบเบิกสินค้าไม่ผูกคลัง 10 ใบพร้อมกัน (2 สินค้า สลับลำดับบรรทัด · คนละงวด) × 3 รอบ — จาก 20 เหลือ 10 พอดี");
  const U1 = await mkUnlinked("U12A");
  const U1b = await mkUnlinked("U12B");
  for (let r = 1; r <= R2; r++) {
    await setQty(U1, 20);
    await setQty(U1b, 20);
    const res = await time("AT-12", () =>
      settle(Array.from({ length: PAR }, (_, k) =>
        gDoc("GOODS_ISSUE", k % 2 === 0 ? [{ productId: U1, qty: 1 }, { productId: U1b, qty: 1 }] : [{ productId: U1b, qty: 1 }, { productId: U1, qty: 1 }], monthDate(k)).then(okOrThrow("goods issue")))),
    );
    const [q1, q2] = [await qtyOf(U1), await qtyOf(U1b)];
    const probs = [...(q1 === 10 && q2 === 10 ? [] : [`qtyOnHand ${q1}/${q2} ≠ 10/10`]), ...(res.errs.length ? [`${res.errs.length} failed: ${[...new Set(res.errs)].slice(0, 2).join(" | ")}`] : [])];
    chk(`AT-12.${r}`, `รอบ ${r}: เบิก 10 ใบสำเร็จครบ ไม่มี deadlock · คงเหลือ 10/10 พอดี`, probs.length === 0, probs.join(" · "));
  }

  console.log("\nAT-13 ใบเบิก ×5 (−2) + ใบคืน ×5 (+1) สินค้าไม่ผูกคลังพร้อมกัน × 3 รอบ — จาก 50 เหลือ 45 พอดี");
  const U2 = await mkUnlinked("U13");
  for (let r = 1; r <= R2; r++) {
    await setQty(U2, 50);
    const res = await time("AT-13", () =>
      settle(Array.from({ length: PAR }, (_, k) => (k % 2 === 0
        ? gDoc("GOODS_ISSUE", [{ productId: U2, qty: 2 }], monthDate(k)).then(okOrThrow("goods issue"))
        : gDoc("GOODS_ISSUE_RETURN", [{ productId: U2, qty: 1 }], monthDate(k)).then(okOrThrow("goods return"))))),
    );
    const q = await qtyOf(U2);
    const probs = [...(q === 45 ? [] : [`qtyOnHand ${q} ≠ 45`]), ...(res.errs.length ? [`${res.errs.length} failed: ${[...new Set(res.errs)].slice(0, 2).join(" | ")}`] : [])];
    chk(`AT-13.${r}`, `รอบ ${r}: เบิก+คืนปนกัน สำเร็จครบ · คงเหลือ 45 พอดี`, probs.length === 0, probs.join(" · "));
  }

  console.log("\nAT-14 ตัดส่วนประกอบชุดที่ไม่ผูกคลัง [A,B]/[B,A] 10 ใบพร้อมกัน (คนละ client) × 3 รอบ — ส่วนประกอบละ −10 พอดี");
  const UA = await mkUnlinked("U14A");
  const UB = await mkUnlinked("U14B");
  const uAB = await mkBundle(`QC ชุดไม่ผูก AB ${stamp}`, [{ pid: UA }, { pid: UB }]);
  const uBA = await mkBundle(`QC ชุดไม่ผูก BA ${stamp}`, [{ pid: UB }, { pid: UA }]);
  for (let r = 1; r <= R2; r++) {
    await setQty(UA, 100);
    await setQty(UB, 100);
    const docs: string[] = [];
    for (let k = 0; k < PAR; k++) docs.push(await draftDoc(k % 2 === 0 ? uAB : uBA));
    const res = await time("AT-14", () =>
      settle(docs.map((d, k) => viaLane(k, (tx) => bundle.consumeBundleComponentsInTx(tx, accCtx, d)).then((x) => {
        if (x.consumed !== 2) throw new Error(`bundle consumed ${x.consumed}/2 (${x.reason ?? ""})`);
        return x;
      }))),
    );
    const [qa, qb] = [await qtyOf(UA), await qtyOf(UB)];
    const probs = [...(qa === 90 && qb === 90 ? [] : [`qtyOnHand ${qa}/${qb} ≠ 90/90`]), ...(res.errs.length ? [`${res.errs.length} failed: ${[...new Set(res.errs)].slice(0, 2).join(" | ")}`] : [])];
    chk(`AT-14.${r}`, `รอบ ${r}: ตัดชุด 10 ใบสำเร็จครบ ไม่มี deadlock · ส่วนประกอบเหลือ 90/90 พอดี`, probs.length === 0, probs.join(" · "));
  }

  console.log("\nAT-15 ยอดยกมา (+7) แข่งกับใบเบิก ×8 (−1) + ผู้ถือแถวที่ลด 1 ค้างไว้ 1 วิ · สินค้าไม่ผูกคลัง × 3 รอบ — จาก 30 เป็น 28 พอดี");
  const U3 = await mkUnlinked("U15");
  for (let r = 1; r <= R2; r++) {
    await setQty(U3, 30);
    // ผู้ถือ (คนละ client): ลด 1 แล้วค้างล็อกแถวไว้ 1 วิ ⇒ ยอดยกมาที่อ่านยอดก่อนล็อก (โค้ดเดิม) อ่านได้ 30 แน่นอน
    //   แล้วเขียน 37 ทับหลังผู้ถือ commit (29) = ยอดหาย 1 แบบกำหนดได้ — ไม่พึ่งจังหวะสุ่ม
    const holder = viaLane(r, async (tx) => {
      await tx.$executeRaw`UPDATE "AccountProduct" SET "qtyOnHand" = "qtyOnHand" - 1 WHERE "id" = ${U3}`;
      await tx.$executeRaw`SELECT pg_sleep(1)`;
      return "held";
    });
    await new Promise((res) => setTimeout(res, 150));
    const calls: Promise<unknown>[] = [holder, prod.addOpeningLot(t2.id, accSys.id, U3, { lotDate: new Date(), qty: 7, unitCost: 100 }).then(okOrThrow("opening lot"))];
    for (let k = 2; k < PAR; k++) calls.push(gDoc("GOODS_ISSUE", [{ productId: U3, qty: 1 }], monthDate(k)).then(okOrThrow("goods issue")));
    const res = await time("AT-15", () => settle(calls));
    const q = await qtyOf(U3);
    const probs = [...(q === 28 ? [] : [`qtyOnHand ${q} ≠ 28`]), ...(res.errs.length ? [`${res.errs.length} failed: ${[...new Set(res.errs)].slice(0, 2).join(" | ")}`] : [])];
    chk(`AT-15.${r}`, `รอบ ${r}: ยอดยกมา + เบิก สำเร็จครบ · คงเหลือ 28 พอดี`, probs.length === 0, probs.join(" · "));
  }

  console.log("\nAT-16 กติกา 'สต็อกไม่พอ' ใต้การแข่ง: เบิก 3 × 5 ใบพร้อมกันจาก 10 (ไม่อนุญาตติดลบ) × 3 รอบ — สำเร็จ 3 ใบพอดี ไม่ติดลบ");
  const U4 = await mkUnlinked("U16");
  const u4name = `QC U16`;
  for (let r = 1; r <= R2; r++) {
    await setQty(U4, 10);
    const docsBefore = await prisma.accountDocument.count({ where: { tenantId: t2.id, docType: "GOODS_ISSUE" } });
    const res = await time("AT-16", () => settle(Array.from({ length: 5 }, (_, k) => gDoc("GOODS_ISSUE", [{ productId: U4, qty: 3 }], monthDate(k)))));
    const outs = res.rs.flatMap((x) => (x.status === "fulfilled" ? [x.value as { ok: boolean; reason?: string }] : []));
    const oks = outs.filter((o) => o.ok).length;
    const refusals = outs.filter((o) => !o.ok).map((o) => o.reason ?? "");
    const msgOk = refusals.every((m) => new RegExp(`^สต็อก "${u4name}" ไม่พอ \\(คงเหลือ 1, เบิก 3\\)$`).test(m));
    const q = await qtyOf(U4);
    const docsAfter = await prisma.accountDocument.count({ where: { tenantId: t2.id, docType: "GOODS_ISSUE" } });
    const probs = [
      ...(oks === 3 ? [] : [`${oks} succeeded (want 3)`]),
      ...(q === 1 ? [] : [`qtyOnHand ${q} ≠ 1${q < 0 ? " (NEGATIVE)" : ""}`]),
      ...(docsAfter - docsBefore === oks ? [] : [`documents +${docsAfter - docsBefore} ≠ successes ${oks}`]),
      ...(msgOk ? [] : [`refusal text: ${[...new Set(refusals)].slice(0, 2).join(" | ")}`]),
      ...(res.errs.length ? [`${res.errs.length} threw: ${res.errs[0]}`] : []),
    ];
    chk(`AT-16.${r}`, `รอบ ${r}: สำเร็จ 3 ใบ · ถูกปฏิเสธ 2 ใบด้วยข้อความเดิม (คงเหลือ 1, เบิก 3) · คงเหลือ 1 ไม่ติดลบ`, probs.length === 0, probs.join(" · "));
  }

  // ═══════════ R2.3 · AT-17: เพดานคืนเบิก (RPR อ้างอิง PRR) ═══════════
  console.log("\nAT-17 เพดานคืนเบิก: คืนครบจำนวนผ่าน · คืน 2 ใบพร้อมกัน (คนละงวด) เกินที่เบิก ⇒ สำเร็จใบเดียว");
  const U5 = await mkUnlinked("U17");
  await setQty(U5, 1000);
  const onHandA = async () => (await prisma.invItem.findUniqueOrThrow({ where: { id: A.itemId } })).onHand;
  {
    const iss = await gDoc("GOODS_ISSUE", [{ productId: A.pid, qty: 2 }, { productId: U5, qty: 2 }], new Date());
    if (!iss.ok) throw new Error(`AT-17 issue: ${iss.reason}`);
    const ret = await gDoc("GOODS_ISSUE_RETURN", [{ productId: A.pid, qty: 2 }, { productId: U5, qty: 2 }], new Date(), { sourceDocId: iss.id });
    chk("AT-17.0", "คืนครบจำนวนที่ยังคืนได้ (เบิก 2 คืน 2 · ผูกคลัง+ไม่ผูก) ผ่าน — ใบที่กำลังคืนไม่ถูกนับเป็น 'คืนไปแล้ว'", ret.ok, ret.ok ? "" : ret.reason, "MAJOR");
  }
  const kinds: { label: string; lines: GLine[] }[] = [
    { label: "ผูกคลัง", lines: [{ productId: A.pid, qty: 5 }] },
    { label: "ไม่ผูกคลัง", lines: [{ productId: U5, qty: 5 }] },
    { label: "ปน", lines: [{ productId: A.pid, qty: 5 }, { productId: U5, qty: 5 }] },
  ];
  let n17 = 0;
  for (const kind of kinds) {
    for (let r = 1; r <= 2; r++) {
      n17++;
      const iss = await gDoc("GOODS_ISSUE", kind.lines, new Date());
      if (!iss.ok) throw new Error(`AT-17 issue: ${iss.reason}`);
      const [a0, u0] = [await onHandA(), await qtyOf(U5)];
      // คนละงวด = คนละแถวเลขที่ ⇒ ไม่มีอะไรเรียงคิวสองใบนี้นอกจากตัวกันของ R2.3
      const res = await time("AT-17", () => settle([
        gDoc("GOODS_ISSUE_RETURN", kind.lines, new Date(), { sourceDocId: iss.id }),
        gDoc("GOODS_ISSUE_RETURN", kind.lines, monthDate(n17), { sourceDocId: iss.id }),
      ]));
      const outs = res.rs.flatMap((x) => (x.status === "fulfilled" ? [x.value as { ok: boolean; reason?: string }] : []));
      const oks = outs.filter((o) => o.ok).length;
      const refusal = outs.find((o) => !o.ok)?.reason ?? "";
      const [a1, u1] = [await onHandA(), await qtyOf(U5)];
      const wantA = kind.lines.some((l) => l.productId === A.pid) ? 5 : 0;
      const wantU = kind.lines.some((l) => l.productId === U5) ? 5 : 0;
      const left = await prod.returnableQtyForIssueNow(t2.id, accSys.id, iss.id);
      const probs = [
        ...(oks === 1 ? [] : [`${oks} returns succeeded (want 1)`]),
        ...(oks === 1 && !/เกินจำนวนที่เบิกไว้/.test(refusal) ? [`refusal text: ${refusal}`] : []),
        ...(a1 - a0 === wantA && u1 - u0 === wantU ? [] : [`stock +${a1 - a0}/+${u1 - u0} ≠ +${wantA}/+${wantU}`]),
        ...([...left.values()].every((v) => v === 0) ? [] : [`returnable left ${JSON.stringify([...left.values()])}`]),
        ...(res.errs.length ? [`${res.errs.length} threw: ${res.errs[0]}`] : []),
      ];
      chk(`AT-17.${n17}`, `${kind.label} รอบ ${r}: คืน 5+5 พร้อมกันจากเบิก 5 ⇒ สำเร็จ 1 · อีกใบ "เกินจำนวนที่เบิกไว้" · สต็อกเพิ่ม 5 ครั้งเดียว`, probs.length === 0, probs.join(" · "));
    }
  }

  // ═══════════ R2.2 · AT-18: รอล็อกสินค้าไม่เกิน 5 วิ + ไม่รั่วหลัง tx ═══════════
  console.log("\nAT-18 lock_timeout 5 วิ ใน tx สต็อก · ไม่รั่ว · ตัวห่อรอเกิน → ลองใหม่ 1 ครั้ง → ข้อความไทยใน ≈5–11 วิ");
  const i18 = await mkItem("AT18", 400);
  await inv.receive(ctx, { itemId: i18, qty: 40, costSatang: 400, idempotencyKey: `at18-seed-${stamp}` });
  // connection ตรง (ไม่ผ่าน pooler) 1 เส้น ⇒ คำสั่งหลัง commit วิ่งบน backend เดิมแน่นอน (pid เดียวกัน)
  const direct = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL, max: 1 }) });
  try {
    type Q = { $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T> };
    const showLt = async (c: unknown) => (await (c as Q).$queryRaw<{ lock_timeout: string }[]>`SHOW lock_timeout`)[0]?.lock_timeout;
    const pidOf = async (c: unknown) => Number((await (c as Q).$queryRaw<{ p: number }[]>`SELECT pg_backend_pid() AS p`)[0]?.p);
    const base = await showLt(direct);
    const pid0 = await pidOf(direct);
    const inTxConsume = await direct.$transaction(async (tx) => {
      await inv.consumeInTx(tx, ctx, { itemId: i18, qty: 1, idempotencyKey: `at18-lt1-${stamp}` });
      return showLt(tx);
    });
    const afterCommit = await showLt(direct);
    const inTxLockMany = await direct.$transaction(async (tx) => {
      await inv.lockItemsInTx(tx, ctx, [i18]);
      return showLt(tx);
    });
    const afterCommit2 = await showLt(direct);
    await direct.$transaction(async (tx) => {
      await inv.lockItemsInTx(tx, ctx, [i18]);
      throw new Error("rollback on purpose");
    }).catch(() => undefined);
    const afterRollback = await showLt(direct);
    const pid1 = await pidOf(direct);
    chk("AT-18.1", `ใน tx สต็อก lock_timeout = 5s (consumeInTx: ${inTxConsume} · lockItemsInTx: ${inTxLockMany})`, inTxConsume === "5s" && inTxLockMany === "5s", `got ${inTxConsume}/${inTxLockMany}`);
    chk("AT-18.2", `หลัง commit/rollback บน backend เดิม (pid ${pid0}) lock_timeout กลับเป็นค่าเดิม (${base})`, pid0 === pid1 && afterCommit === base && afterCommit2 === base && afterRollback === base, `pid ${pid0}→${pid1} · after ${afterCommit}/${afterCommit2}/${afterRollback} base ${base}`);
    // ตัวควบคุมของตัวตรวจรั่ว: SET ระดับ session (connection ตรง ของเราเอง) ต้องถูกมองเห็น แล้ว RESET คืนทันที
    await direct.$executeRaw`SET lock_timeout = '7s'`;
    const seenLeak = await showLt(direct);
    await direct.$executeRaw`RESET lock_timeout`;
    const resetOk = (await showLt(direct)) === base;
    chk("AT-18.2c", "ตัวควบคุม: ตัวตรวจเห็นค่าที่รั่วจริง (SET ระดับ session = 7s) แล้ว RESET คืน", seenLeak === "7s" && resetOk, `seen ${seenLeak} reset ${resetOk}`, "MAJOR");
  } finally {
    await direct.$disconnect();
  }
  {
    const warns: unknown[][] = [];
    const origWarn = console.warn;
    const before = (await inv.onHand(ctx, [i18]))[0]?.onHand ?? NaN;
    const key18 = `at18-busy-${stamp}`;
    let w: { ok: true } | { ok: false; e: unknown };
    let el = 0;
    const holder = lanes[0].$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "InvItem" WHERE "id" = ${i18} FOR UPDATE`;
      await tx.$executeRaw`SELECT pg_sleep(12)`;
      return "held";
    }, { timeout: 40_000 });
    try {
      await new Promise((res) => setTimeout(res, 400));
      console.warn = (...a: unknown[]) => {
        if (typeof a[0] === "string" && a[0].startsWith("[inventory]")) warns.push(a);
        else origWarn(...a);
      };
      const t0 = Date.now();
      w = await inv.consume(ctx, { itemId: i18, qty: 1, idempotencyKey: key18 }).then(() => ({ ok: true as const }), (e: unknown) => ({ ok: false as const, e }));
      el = Date.now() - t0;
    } finally {
      console.warn = origWarn;
      await holder.catch(() => undefined);
    }
    const msg = w.ok ? "(succeeded)" : short(w.e);
    console.log(`     · ตัวห่อจบใน ${(el / 1000).toFixed(1)} วิ — ${msg.slice(0, 140)}`);
    chk("AT-18.3", `ผู้ถือล็อก 12 วิ ⇒ ตัวห่อได้ข้อความไทย "ลองใหม่อีกครั้ง" ใน 4.5–11.5 วิ (ได้ ${(el / 1000).toFixed(1)} วิ)`, !w.ok && /ลองใหม่อีกครั้ง/.test(msg) && el >= 4_500 && el <= 11_500, `${msg} after ${el} ms`);
    const cause = !w.ok && w.e instanceof Error ? (w.e as Error & { cause?: unknown }).cause : undefined;
    // ไล่สาย cause/meta.driverAdapterError เก็บ message/code ทุกชั้น
    const chainText = (e: unknown): string => {
      const out: string[] = [];
      let cur: unknown = e;
      for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
        const o = cur as { message?: unknown; code?: unknown; originalCode?: unknown; cause?: unknown; meta?: { driverAdapterError?: unknown } };
        out.push(String(o.message ?? ""), String(o.code ?? ""), String(o.originalCode ?? ""));
        cur = o.cause ?? o.meta?.driverAdapterError;
      }
      return out.join(" ");
    };
    chk("AT-18.4", "error สุดท้ายเก็บ cause (ข้อผิดพลาดจริงของฐานข้อมูล: lock timeout / 55P03)", cause !== undefined && /lock timeout|55P03/i.test(chainText(cause)), `cause ${chainText(cause).slice(0, 120)}`, "MAJOR");
    const w0 = warns[0];
    const meta = (w0?.[1] ?? {}) as Record<string, unknown>;
    chk(
      "AT-18.5",
      `console.warn ตอนลองใหม่ 1 ครั้ง: ข้อความคงที่ + { code, op, itemId } เท่านั้น (ได้ ${warns.length} ครั้ง)`,
      warns.length === 1 && w0?.[0] === "[inventory] stock write contention — retrying" && Object.keys(meta).sort().join(",") === "code,itemId,op" && meta.code === "55P03" && meta.op === "consume" && meta.itemId === i18,
      JSON.stringify(warns).slice(0, 200),
      "MAJOR",
    );
    const again = await inv.consume(ctx, { itemId: i18, qty: 1, idempotencyKey: key18 }).then(() => "ok", (e: unknown) => short(e));
    const n = await prisma.invMovement.count({ where: { tenantId: tid, idempotencyKey: key18 } });
    const after = (await inv.onHand(ctx, [i18]))[0]?.onHand;
    chk("AT-18.6", "ผู้ถือปล่อยแล้ว คีย์เดิมสำเร็จ · movement ของคีย์ = 1 · ตัดครั้งเดียว", again === "ok" && n === 1 && after === before - 1, `again ${again} · movements ${n} · onHand ${before}→${after}`);
  }
  {
    // ทาง InTx (ใบเบิกบัญชี · tx ของผู้เรียก ไม่มีตัวห่อ) — รอเกิน 5 วิ ⇒ ใบล้มทั้งใบ (ไม่ค้าง 30 วิ) · ไม่มีเอกสาร/สต็อกครึ่ง ๆ
    const holder = lanes[1].$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "InvItem" WHERE "id" = ${A.itemId} FOR UPDATE`;
      await tx.$executeRaw`SELECT pg_sleep(9)`;
      return "held";
    }, { timeout: 40_000 });
    let r: { ok: boolean; reason?: string } = { ok: false };
    let el = 0;
    const a0 = await onHandA();
    const d0 = await prisma.accountDocument.count({ where: { tenantId: t2.id } });
    try {
      await new Promise((res) => setTimeout(res, 400));
      const t0 = Date.now();
      r = await gDoc("GOODS_ISSUE", [{ productId: A.pid, qty: 1 }], new Date());
      el = Date.now() - t0;
    } finally {
      await holder.catch(() => undefined);
    }
    const d1 = await prisma.accountDocument.count({ where: { tenantId: t2.id } });
    const a1 = await onHandA();
    console.log(`     · ใบเบิกจบใน ${(el / 1000).toFixed(1)} วิ — ${r.ok ? "สำเร็จ" : r.reason}`);
    chk("AT-18.7", `ใบเบิกบัญชีที่รอล็อกสินค้า (ผู้ถือ 9 วิ) ล้มใน < 8 วิ ทั้งใบ — ไม่มีเอกสาร ไม่แตะสต็อก (ได้ ${(el / 1000).toFixed(1)} วิ)`, !r.ok && el < 8_000 && d1 === d0 && a1 === a0, `ok ${r.ok} after ${el} ms · docs +${d1 - d0} · onHand ${a0}→${a1}`);
    const retry = await gDoc("GOODS_ISSUE", [{ productId: A.pid, qty: 1 }], new Date());
    chk("AT-18.8", "ตัวควบคุม: ผู้ถือปล่อยแล้ว ใบเบิกเดิมสำเร็จ", retry.ok, retry.ok ? "" : retry.reason, "MAJOR");
  }

  // ═══════════ ปิดท้าย: ทุกสินค้าในทั้งสองร้าน ═══════════
  const all = await prisma.invItem.findMany({ where: { tenantId: { in: tenants } }, select: { id: true, systemId: true } });
  const finalProbs: string[] = [];
  for (const it of all) for (const p of await problemsOf(it.id, it.systemId === inv2.id ? defLoc2 : defLoc)) finalProbs.push(p);
  chk("AT-Z", `ปิดท้าย: ${all.length} สินค้าทั้งหมด invariant ครบ`, finalProbs.length === 0, finalProbs.slice(0, 4).join(" · "));
} catch (e) {
  chk("AT-ERR", "สคริปต์ล้มกลางทาง", false, short(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ลบต่อ */ } };
  const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
  for (const id of tenants) {
    await d(() => P.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => P.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
    for (const m of [
      "accountJournalEntry", "accountDocumentRelation", "accountDocumentLine", "accountDocument", "accountProductBundleItem", "accountProductOpeningLot", "accountProduct",
      "accountContact", "accountUnit", "accountCategory", "accountMapping", "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings",
      "posPayment", "posSaleLine", "posSale", "posReceiptCounter",
      "invMovement", "invLot", "invLocationStock", "invLocation", "poLine", "purchaseOrder", "supplier", "invItemImage", "invItem", "invSettings", "invCategory",
      "approvalRequest", "appNotification", "outboxEvent", "auditLog", "party", "appSystemUnit", "appSystem", "businessUnit",
    ]) {
      await d(() => P[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-hfatom-" } } }).catch(() => -1);
  if (left !== 0) console.log(`  ⚠️ เหลือร้านทดสอบ ${left} ร้าน (slug qc-hfatom-*)`);
  await Promise.all(lanes.map((l) => l.$disconnect()));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
const tm = Object.entries(timings).map(([k, v]) => `${k} ${v.map((x) => (x / 1000).toFixed(1)).join("/")}s`).join(" · ");
console.log(`\nTIMING per round (wall, 10 parallel): ${tm}`);
console.log(`\n===== QC HF-INV-1 inventory atomic =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
