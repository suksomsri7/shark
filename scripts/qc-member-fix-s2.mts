// QC — ชุดแก้ audit S2 "ความถูกต้องของเงิน/แต้ม" (ledger/member-briefs/member-fix-s2.md)
//   H5  ยอดสะสม `totalSpentSatang` ต้อง atomic: ธงกันซ้ำ (`recordOnce`) มาก่อน แล้วบวกด้วย `increment`
//   M9  `burnFifo` ต้องตรวจยอด+หักในคำสั่งเดียว (`updateMany where balance >= points`) — ยอด/ล็อตห้ามติดลบ
//   M10 บัญชีล้ม ⇒ ฝั่งสมาชิก/journey/webhook ต้องยังวิ่ง + event ยังถูกรายงานว่าล้ม (retry) · VOID ที่ไม่มี PURCHASE ห้ามลบยอด
//   M11 บิลที่ถูกยกเลิก: อ่านสถานะซ้ำก่อนให้แต้ม · การกลับรายการต้อง replay ได้ (EARN ที่ลงหลัง reverse ต้องถูกกลับด้วย)
//   M12 event ที่ให้ของมีค่า (booking DONE · deal won · shop paid) ต้อง emit **ใน** tx เดียวกับการเปลี่ยนสถานะ
//   L12 OpsEvent ห้ามมีเบอร์/อีเมลดิบ · L13 `approvalNotify` ห้ามแจ้งซ้ำตอน retry · L15 กันยอดทะลุเพดาน Int
//
// Fable oracle (ผู้เขียนข้อสอบ) · Builder ห้ามแตะไฟล์นี้ · ใช้ฐานข้อมูล QC (.env.qc) เท่านั้น
// รัน: bash scripts/iso.sh pnpm exec tsx scripts/qc-member-fix-s2.mts
//
// 🔴 หลักของไฟล์นี้
//   • ทุกเช็คเขียนตาม "พฤติกรรมที่แก้แล้ว" ⇒ บนโค้ดวันนี้ต้องแดง (ยกเว้นตัวที่ทำหน้าที่ positive control / guard)
//   • ข้อมูลทดสอบเป็นของชั่วคราวทั้งหมด (marker "fix-s2-") · ไม่แตะสมาชิกที่ seed ไว้ · ลบคืนใน finally
//   • การแข่งกัน (H5 · M9) วิ่งบน connection แยกจริง (PrismaClient ใหม่ต่อคำเรียก) ไม่ใช่ concurrency จอมปลอม
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as {
  MQC: Any;
  resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null>;
};

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const thai = (e: unknown) => e instanceof Error && /[ก-๙]/.test(e.message);
const P = prisma as Any;

const tag = Math.random().toString(36).slice(2, 8).replace(/[0-9]/g, "z"); // marker ตัวอักษรล้วน (กันชนกฎ redact ตัวเลข)
const T0 = new Date(Date.now() - 1000);
const made = {
  customers: [] as string[],
  sales: [] as string[],
  systems: [] as string[],
  links: [] as string[],
  endpoints: [] as string[],
  notifications: [] as string[],
  cards: [] as string[],
  outboxKeys: [] as string[],
};
const clients: Any[] = [];

let tid = "";
let SYS = "";
let PT = "";
let UNIT = "";

try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed ชุดข้อมูล QC ระบบสมาชิก");
  tid = scope.tenantId;
  SYS = scope.systemId;
  PT = scope.systems.POINT as string;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  UNIT = E.units.patong as string;

  // ── โมดูล (dynamic import ทั้งหมด — ของที่ยังไม่มี = เช็คตก ไม่ใช่สคริปต์ระเบิด) ──
  const load = async (p: string): Promise<Any> => {
    try {
      return await import(p as string);
    } catch {
      return null;
    }
  };
  const bridges: Any = await load("@/lib/member-bridges");
  const M: Any = await load("@/lib/modules/member");
  const PR: Any = await load("@/lib/modules/member/profile");
  const PS: Any = await load("@/lib/modules/point");
  const { drainOutbox, emitOutboxOutsideTx } = await import("@/lib/core/outbox");
  const CONS: Any = (await load("@/lib/outbox-consumers"))?.consumers ?? null;
  if (!bridges || !M || !PR || !PS || !CONS) throw new Error("โหลดโมดูลหลักไม่ได้ (member-bridges / member / point / consumers)");
  const drain = async (n = 2) => {
    for (let k = 0; k < n; k += 1) await drainOutbox(CONS, { limit: 300 });
  };

  // ── PrismaClient ใหม่ต่อคำเรียก = การแข่งกันเกิดบน connection คนละเส้นจริง ──
  const { PrismaClient } = (await import("@prisma/client")) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg")) as Any;
  /** เลนที่ i = PrismaClient ของตัวเอง (pool แยก) ⇒ คำเรียกที่แข่งกันวิ่งบน connection คนละเส้นจริง */
  const lane = (i: number): Any => {
    while (clients.length <= i) clients.push(new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2 }) }));
    return clients[i];
  };

  const owner = await (async () => {
    const uid = E.users.owner.userId as string;
    const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId: uid } }))!;
    return { userId: uid, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> };
  })();
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const pctx = { tenantId: tid, systemId: PT, memberSystemId: SYS, actorUserId: null };

  let seq = 0;
  const nextKey = (s: string) => `fix-s2-${tag}-${s}-${(seq += 1)}`;
  // ระบบ POS ชั่วคราว: บิลทดสอบไม่แตะระบบ POS ตัวจริง (ไม่มีลิงก์บัญชี ⇒ ขา "ลงบัญชี" เป็น no-op)
  const tmpPos = await P.appSystem.create({ data: { tenantId: tid, type: "POS", name: `fix-s2-${tag} POS ชั่วคราว` } });
  const tmpPosId: string = tmpPos.id;
  made.systems.push(tmpPosId);
  const mkMember = async (label: string): Promise<string> => {
    const phone = `09${String((Date.now() + Math.floor(Math.random() * 1_000_000)) % 100_000_000).padStart(8, "0")}`;
    const r = await PR.createMember(ctx as Any, owner, {
      phone,
      firstName: `fix-s2-${tag}`,
      lastName: label,
      source: "WALK_IN",
      homeUnitId: UNIT,
      idempotencyKey: nextKey("member"),
    });
    made.customers.push(r.customerId);
    return r.customerId as string;
  };
  /** บิลชั่วคราว — เขียนตรงเพื่อคุมสถานะ/ลำดับให้เป๊ะ (ไม่ผ่าน createSale ⇒ ไม่มี event/บัญชีติดมา) */
  const mkSale = async (o: { memberId: string | null; total: number; status?: string; receiptNo?: string | null; systemId?: string }) => {
    const s = await P.posSale.create({
      data: {
        tenantId: tid,
        unitId: UNIT,
        systemId: o.systemId ?? tmpPosId,
        memberId: o.memberId,
        idempotencyKey: nextKey("sale"),
        receiptNo: o.receiptNo ?? null,
        status: o.status ?? "PAID",
        subtotalSatang: o.total,
        grandTotalSatang: o.total,
        paidAt: new Date(),
      },
    });
    made.sales.push(s.id);
    await P.posSaleLine.create({
      data: { tenantId: tid, unitId: UNIT, saleId: s.id, name: `fix-s2-${tag} รายการทดสอบ`, qty: 1, unitPriceSatang: o.total, discountSatang: 0, lineTotalSatang: o.total },
    });
    return s;
  };
  const spentOf = async (cid: string): Promise<number> => (await prisma.customer.findUnique({ where: { id: cid } }))!.totalSpentSatang;
  const purchaseRows = (cid: string, type: string, saleId?: string) =>
    P.memberActivity.count({ where: { tenantId: tid, customerId: cid, module: "pos", type, ...(saleId ? { refId: saleId } : {}) } });

  console.log("── H5 ยอดสะสมแบบ atomic ──");
  // ═══════════════════════════════════════════════════════════════════
  // H5 — ยอดใช้จ่ายสะสมต้องไม่หาย/ไม่เบิ้ล เมื่อคิววิ่งพร้อมกัน
  // ═══════════════════════════════════════════════════════════════════
  {
    const rounds: string[] = [];
    let allOk = true;
    for (let r = 0; r < 2; r += 1) {
      const cid = await mkMember(`H5-different-${r}`);
      const amounts = Array.from({ length: 10 }, (_, i) => 10_000 + i * 100);
      const sales = [];
      for (const a of amounts) sales.push(await mkSale({ memberId: cid, total: a }));
      const before = await spentOf(cid);
      await Promise.all(sales.map((s) => bridges.onPosSalePaid(tid, s.id).catch(() => null)));
      const after = await spentOf(cid);
      const exp = amounts.reduce((n, a) => n + a, 0);
      const acts = await purchaseRows(cid, "PURCHASE");
      const ok = after - before === exp && acts === 10;
      if (!ok) allOk = false;
      rounds.push(`รอบ${r + 1}: +${after - before}/${exp} act=${acts}`);
    }
    chk(
      "S2-H5.1",
      "10 บิลคนละใบของสมาชิกคนเดียวถูกประมวลผลพร้อมกัน (Promise.all) → totalSpentSatang เพิ่มเท่าผลรวมเป๊ะ + แถว PURCHASE 10 แถว (ห้าม lost update จาก อ่าน-บวก-เขียน)",
      allOk,
      "ผลรวมตรงเป๊ะทุกรอบ",
      rounds.join(" · "),
    );
  }

  {
    const rounds: string[] = [];
    let allOk = true;
    for (let r = 0; r < 4; r += 1) {
      const cid = await mkMember(`H5-same-${r}`);
      const sale = await mkSale({ memberId: cid, total: 77_000 });
      const before = await spentOf(cid);
      // เหลื่อมเวลาแบบสุ่ม: คิวจริงไม่ได้เริ่มพร้อมกันเป๊ะ (lease หมดอายุกลางคัน) — เปิดหน้าต่าง "ตรวจธงแล้ว แต่ยังไม่ commit"
      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          sleep(r === 0 ? 0 : i * 50 + Math.floor(Math.random() * 30)).then(() => bridges.onPosSalePaid(tid, sale.id).catch(() => null)),
        ),
      );
      const after = await spentOf(cid);
      const acts = await purchaseRows(cid, "PURCHASE", sale.id);
      const ok = after - before === 77_000 && acts === 1;
      if (!ok) allOk = false;
      rounds.push(`รอบ${r + 1}: +${after - before}/77000 act=${acts}`);
    }
    chk(
      "S2-H5.2",
      "บิลใบเดียวถูกประมวลผลพร้อมกัน 12 ครั้ง (รอบแรกพร้อมกันเป๊ะ · รอบหลังเหลื่อมเวลา = lease หมดกลางคัน) → ยอดสะสมเพิ่มครั้งเดียว + แถว PURCHASE 1 แถว (ธงกันซ้ำต้องถูกยึดก่อนบวก)",
      allOk,
      "+77000 ครั้งเดียวทุกรอบ",
      rounds.join(" · "),
      // 🔴 เช็คนี้เป็น "ดักจังหวะ" ไม่ใช่ deterministic: บนโค้ดวันนี้แดงประมาณ 2 ใน 5 รอบการรัน เพราะบั๊ก
      //    อ่าน-บวก-เขียน (H5.3) บังเอิญกลบการบวกซ้ำเมื่อสองคิวอ่านค่าเดียวกัน · ตัวที่แดงแน่นอนคือ H5.1/H5.3
      //    หน้าที่จริงของเช็คนี้คือ **ดักการแก้ครึ่งเดียว**: ถ้าเปลี่ยนเป็น increment โดยไม่ย้ายธงมาก่อน
      //    ทั้ง 12 คิวจะบวกยอดหมด ⇒ แดงทุกรอบทันที
      "MAJOR",
    );
  }

  {
    const rounds: string[] = [];
    let allOk = true;
    for (let r = 0; r < 3; r += 1) {
      const cid = await mkMember(`H5-recordSpend-${r}`);
      const before = await spentOf(cid);
      await Promise.all(Array.from({ length: 10 }, (_, i) => M.recordSpend(tid, cid, 1_000, lane(i)).catch(() => null)));
      const after = await spentOf(cid);
      const ok = after - before === 10_000;
      if (!ok) allOk = false;
      rounds.push(`รอบ${r + 1}: +${after - before}/10000`);
    }
    chk(
      "S2-H5.3",
      "member.recordSpend 10 ครั้งพร้อมกันบน connection คนละเส้น (+1,000 ต่อครั้ง) → ยอดสะสม +10,000 เป๊ะ (ต้องเป็น increment ไม่ใช่ อ่าน-บวก-เขียน)",
      allOk,
      "+10000 ทุกรอบ",
      rounds.join(" · "),
    );
  }

  {
    // v1: สมาชิกที่ยังไม่มี tierDefId ต้องได้ระดับใหม่จากยอด "หลังบวก" เสมอ (กันฟื้นบั๊กตอนเปลี่ยนไปใช้ increment)
    const cid = await mkMember("H5-v1tier");
    await P.customer.update({ where: { id: cid }, data: { tierDefId: null, tier: "MEMBER", totalSpentSatang: 0 } });
    const cfg = (await P.memberTierConfig.findMany({ where: { tenantId: tid } })) as Any[];
    const target = cfg.filter((c) => c.minSpendSatang > 0).sort((a, b) => a.minSpendSatang - b.minSpendSatang)[0] ?? null;
    const amount = target ? target.minSpendSatang + 50_000 : 1_050_000;
    await M.recordSpend(tid, cid, amount).catch(() => null);
    const row = (await prisma.customer.findUnique({ where: { id: cid } }))! as Any;
    chk(
      "S2-H5.4",
      `สมาชิก v1 (ไม่มี tierDefId): recordSpend(+${amount}) → totalSpentSatang ตรง และ tier ถูกคิดใหม่จากยอดหลังบวก (เกณฑ์ร้าน ${target?.tier ?? "SILVER"} = ${target?.minSpendSatang ?? "?"})`,
      row.totalSpentSatang === amount && row.tier === (target?.tier ?? row.tier) && row.tierDefId === null,
      `spent=${amount} tier=${target?.tier ?? "-"}`,
      `spent=${row.totalSpentSatang} tier=${row.tier} tierDefId=${row.tierDefId}`,
      "MAJOR",
    );
  }

  console.log("── M9 แลกแต้มพร้อมกัน ──");
  // ═══════════════════════════════════════════════════════════════════
  // M9 — แลกแต้มพร้อมกันต้องไม่ทำให้ยอด/ล็อตติดลบ
  // ═══════════════════════════════════════════════════════════════════
  {
    const rounds: string[] = [];
    let okBalance = true;
    let okLots = true;
    let okThai = true;
    for (let r = 0; r < 3; r += 1) {
      const cid = await mkMember(`M9-${r}`);
      await PS.earnWithLot(pctx, { customerId: cid, points: 100, refType: "QC", refId: nextKey("m9seed"), idempotencyKey: nextKey("m9seed"), reason: "fix-s2 ทดสอบ" });
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          PS.burnFifo(pctx, { customerId: cid, points: 100, refType: "QC", refId: `${nextKey("m9burn")}-${i}`, idempotencyKey: `${nextKey("m9burn")}-${i}`, reason: "fix-s2 แลกพร้อมกัน" }, lane(i))
            .then(() => ({ ok: true, err: null as unknown }))
            .catch((e: unknown) => ({ ok: false, err: e })),
        ),
      );
      const wins = results.filter((x) => x.ok).length;
      const losses = results.filter((x) => !x.ok);
      const bal = await PS.getBalance(PT, cid);
      const lots = (await P.pointLot.findMany({ where: { tenantId: tid, customerId: cid }, select: { remaining: true } })) as Any[];
      const minLot = lots.reduce((m, l) => Math.min(m, l.remaining), 0);
      if (!(wins === 1 && bal === 0)) okBalance = false;
      if (minLot < 0) okLots = false;
      if (!(losses.length === 9 && losses.every((l) => thai(l.err) && /แต้มคงเหลือไม่พอ/.test((l.err as Error).message)))) okThai = false;
      rounds.push(`รอบ${r + 1}: สำเร็จ=${wins} bal=${bal} lotMin=${minLot} ล้ม=${losses.length}`);
    }
    chk("S2-M9.1", "แลกแต้ม 100 แต้มพร้อมกัน 10 คำขอ (มีอยู่ 100 แต้ม · connection คนละเส้น) → สำเร็จได้ 1 คำขอเท่านั้น และ PointBalance = 0 (ห้ามติดลบ)", okBalance, "สำเร็จ 1 · bal 0", rounds.join(" · "));
    chk("S2-M9.2", "ล็อตแต้ม (PointLot.remaining) ของสมาชิกที่ถูกแย่งแลกพร้อมกัน ห้ามติดลบสักใบ", okLots, "remaining ≥ 0", rounds.join(" · "));
    chk("S2-M9.3", 'ผู้แพ้การแข่งทั้ง 9 คำขอได้ error ไทยเดิม "แต้มคงเหลือไม่พอ" (ไม่ใช่ error ฐานข้อมูล/ไม่ใช่ยอมให้ผ่าน)', okThai, "ล้ม 9 ข้อความไทย", rounds.join(" · "));
  }

  console.log("── M10 บัญชีล้ม ──");
  // ═══════════════════════════════════════════════════════════════════
  // M10 — ขั้นบัญชีล้ม ห้ามทำให้ขั้นฝั่งสมาชิก/journey/webhook อดวิ่ง
  //   จำลองด้วยระบบบัญชีชั่วคราวที่ "ยังไม่มีผังบัญชี" + ผูกกับระบบ POS ชั่วคราวของบิลทดสอบเท่านั้น
  // ═══════════════════════════════════════════════════════════════════
  {
    const brokenPos = await P.appSystem.create({ data: { tenantId: tid, type: "POS", name: `fix-s2-${tag} POS บัญชีพัง` } });
    made.systems.push(brokenPos.id);
    const brokenAcc = await P.appSystem.create({ data: { tenantId: tid, type: "ACCOUNT", name: `fix-s2-${tag} บัญชีไม่มีผัง` } });
    made.systems.push(brokenAcc.id);
    const link = await P.accountSystemLink.create({ data: { tenantId: tid, systemId: brokenAcc.id, linkedKind: "POS", linkedId: brokenPos.id } });
    made.links.push(link.id);
    const hook = await P.webhookEndpoint.create({
      data: { tenantId: tid, url: "http://127.0.0.1:9/fix-s2", secret: `fix-s2-${tag}`, eventsJson: ["pos.sale.paid"], active: true },
    });
    made.endpoints.push(hook.id);

    // บัตรสะสมตราชั่วคราว — ใช้พิสูจน์ว่า extra "สแตมป์" (stampFromSale) ก็ต้องวิ่งแม้ base ล้ม
    const ST: Any = await load("@/lib/modules/stamp");
    const card = ST
      ? await ST.createCard(ctx as Any, owner, {
          name: `fix-s2-${tag} บัตรทดสอบ`,
          slots: 5,
          ruleKind: "PER_SALE_MIN",
          ruleConfig: { minSatang: 100_000, perDayMax: 3, allowAutoFromSale: true },
          rewardKind: "POINTS",
          rewardConfig: { points: 10 },
          autoRestart: true,
          tierDefIds: [],
          unitIds: [],
        }).catch(() => null)
      : null;
    if (card?.id) made.cards.push(card.id);

    const cid = await mkMember("M10");
    const sale = await mkSale({ memberId: cid, total: 123_400, systemId: brokenPos.id });
    const key = nextKey("m10");
    made.outboxKeys.push(key);
    await emitOutboxOutsideTx({ tenantId: tid, type: "pos.sale.paid", idempotencyKey: key, payload: { saleId: sale.id }, systemId: brokenPos.id, unitId: UNIT });
    await drain(1);

    const ev = (await P.outboxEvent.findFirst({ where: { tenantId: tid, idempotencyKey: key } })) as Any;
    const baseFailed = !!ev && ev.status !== "DONE" && /ผังบัญชี/.test(String(ev.lastError ?? ""));
    chk(
      "S2-M10.0",
      "[positive control] ขั้น “ลงบัญชี” ของ pos.sale.paid ล้มจริงในการทดลองนี้ (ระบบบัญชีไม่มีผัง) — event ไม่ DONE และ lastError บอกเหตุ",
      baseFailed,
      "event ไม่ DONE + lastError ผังบัญชี",
      `status=${ev?.status} attempts=${ev?.attempts} err=${String(ev?.lastError ?? "").slice(0, 80)}`,
      "MAJOR",
    );

    const spent = await spentOf(cid);
    const act = await purchaseRows(cid, "PURCHASE", sale.id);
    chk(
      "S2-M10.1",
      "บัญชีล้มถาวร แต่ฝั่งสมาชิกต้องวิ่งครบ: totalSpentSatang +123,400 และมีแถวไทม์ไลน์ PURCHASE ของบิลใบนั้น (extras ต้องไม่ถูก base ที่ล้มกินไปด้วย)",
      spent === 123_400 && act === 1,
      "spent=123400 act=1",
      `spent=${spent} act=${act}`,
    );

    const stEv = card?.id ? await P.stampEvent.count({ where: { tenantId: tid, refType: "SALE", refId: sale.id, type: "ADD" } }) : -1;
    chk(
      "S2-M10.2",
      "บัญชีล้มถาวร แต่ extra “สแตมป์” (stampFromSale) ต้องวิ่งด้วย: บิล ฿1,234 เข้าเกณฑ์บัตรทดสอบ → มี StampEvent ADD ของบิลใบนั้น",
      stEv === 1,
      "StampEvent ADD = 1",
      `stampEvent=${stEv}${card ? "" : " (สร้างบัตรทดสอบไม่ได้)"}`,
    );

    const del = await P.webhookDelivery.count({ where: { tenantId: tid, endpointId: hook.id, eventType: "pos.sale.paid" } });
    chk(
      "S2-M10.3",
      "บัญชีล้มอย่างเดียว → ชั้น automation/journey/webhook ยังต้องยิง: มีแถว WebhookDelivery ของ pos.sale.paid ไปยัง endpoint ที่ร้านสมัครไว้",
      del >= 1,
      "≥1 delivery",
      `delivery=${del}`,
    );

    chk(
      "S2-M10.4",
      "event ยังถูกรายงานว่าล้ม (ไม่ DONE) เพื่อให้ retry — ขั้น extras ที่วิ่งไปแล้ว idempotent ทั้งหมด",
      !!ev && ev.status !== "DONE",
      "status ≠ DONE",
      `status=${ev?.status}`,
      "MAJOR",
    );

    // VOID ที่ไม่เคยมี PURCHASE ⇒ ห้ามลบยอดที่ไม่เคยบวก
    const cid2 = await mkMember("M10-void");
    const sale2 = await mkSale({ memberId: cid2, total: 55_000, status: "VOIDED" });
    const spentBefore = await spentOf(cid2);
    await bridges.onPosSaleVoided(tid, sale2.id).catch(() => null);
    const spentAfter = await spentOf(cid2);
    chk(
      "S2-M10.5",
      "บิลถูกยกเลิกโดยที่ขา PURCHASE ไม่เคยสำเร็จ (บัญชีล้มถาวร/บิลถูก void ก่อนคิวมาถึง) → recordSpendOnce VOID ต้องไม่ลบยอด (ยอดสะสมคงเดิม ไม่ติดลบ)",
      spentAfter === spentBefore && spentAfter >= 0,
      `spent คงเดิม ${spentBefore}`,
      `${spentBefore} → ${spentAfter}`,
    );
  }

  console.log("── M11 แต้มของบิลที่ยกเลิก ──");
  // ═══════════════════════════════════════════════════════════════════
  // M11 — แต้มของบิลที่ถูกยกเลิก
  // ═══════════════════════════════════════════════════════════════════
  {
    const cid = await mkMember("M11-replay");
    const sale = await mkSale({ memberId: cid, total: 100_000 });
    await PS.earnWithLot(pctx, { customerId: cid, points: 200, refType: "QC", refId: nextKey("m11seed"), idempotencyKey: nextKey("m11seed"), reason: "fix-s2 ทดสอบ" });
    await PS.burnFifo(pctx, { customerId: cid, points: 50, refType: "PosSale", refId: sale.id, idempotencyKey: nextKey("m11burn"), reason: "fix-s2 ใช้แต้มกับบิล" });
    await P.posSale.update({ where: { id: sale.id }, data: { status: "VOIDED" } });
    await bridges.onPosSaleVoided(tid, sale.id).catch(() => null);
    const balAfterVoid = await PS.getBalance(PT, cid);
    // EARN ที่ "มาช้า" (คิวของบิลที่ปิดค้างอยู่วิ่งจบหลังคิวยกเลิก)
    await PS.earnWithLot(pctx, { customerId: cid, points: 20, refType: "PosSale", refId: sale.id, idempotencyKey: `pos-earn-${sale.id}`, reason: "fix-s2 แต้มมาช้า" }).catch(() => null);
    await bridges.onPosSaleVoided(tid, sale.id).catch(() => null);
    const balEnd = await PS.getBalance(PT, cid);
    const rev20 = await prisma.pointLedger.count({ where: { tenantId: tid, customerId: cid, refType: "PosSale", refId: sale.id, delta: -20 } });
    chk(
      "S2-M11.1",
      "EARN ที่ลงหลังการกลับรายการของบิลที่ยกเลิก ต้องถูกกลับด้วยเมื่อคิว void วิ่งอีกรอบ (คีย์กันซ้ำต้องผูกกับ ledger แต่ละแถว ไม่ใช่คีย์เดียวต่อบิล) — ยอดต้องกลับไปเท่าตอนหลัง void ครั้งแรก",
      balEnd === balAfterVoid && rev20 === 1,
      `bal=${balAfterVoid} · REVERSE −20 = 1`,
      `bal=${balEnd} rev20=${rev20}`,
    );
  }

  {
    // แข่งจริง: คิว "ปิดบิล" กำลังวิ่ง แล้วบิลถูกยกเลิก + คิว void วิ่งจบก่อนขั้นให้แต้ม
    const delays = [0, 5, 20, 50, 120, 250];
    const bad: string[] = [];
    for (const d of delays) {
      const cid = await mkMember(`M11-race-${d}`);
      const sale = await mkSale({ memberId: cid, total: 1_000_000 });
      const paid = bridges.onPosSalePaid(tid, sale.id).catch(() => null);
      await sleep(d);
      await P.posSale.update({ where: { id: sale.id }, data: { status: "VOIDED" } });
      await bridges.onPosSaleVoided(tid, sale.id).catch(() => null);
      await paid;
      const earn = (await prisma.pointLedger.aggregate({ where: { tenantId: tid, customerId: cid, refType: "PosSale", refId: sale.id, type: "EARN" }, _sum: { delta: true } }))._sum.delta ?? 0;
      const rev = (await prisma.pointLedger.aggregate({ where: { tenantId: tid, customerId: cid, refType: "PosSale", refId: sale.id, type: "REVERSE" }, _sum: { delta: true } }))._sum.delta ?? 0;
      if (earn + rev !== 0) bad.push(`หน่วง ${d}ms: EARN ${earn} คงค้าง ${earn + rev}`);
    }
    chk(
      "S2-M11.2",
      "บิลถูกยกเลิกระหว่างที่คิวปิดบิลกำลังวิ่ง (6 จังหวะ) → ห้ามเหลือ EARN ที่ไม่ถูกกลับรายการของบิลที่ยกเลิกแล้ว (ต้องอ่านสถานะบิลซ้ำก่อนให้แต้ม)",
      bad.length === 0,
      "ไม่มีแต้มค้างทุกจังหวะ",
      bad.join(" · ") || "-",
    );
  }

  console.log("── M12 emit ใน tx ──");
  // ═══════════════════════════════════════════════════════════════════
  // M12 — event ที่ให้ของมีค่า ต้อง emit ใน tx เดียวกับการเปลี่ยนสถานะ
  //   (ไม่มีตะเข็บให้บังคับ emit ล้มจากข้างนอก ⇒ ตรวจที่จุดเรียกตามกติกา core/outbox.ts:69-72)
  // ═══════════════════════════════════════════════════════════════════
  {
    const sites: { id: string; file: string; event: string; fn: string }[] = [
      { id: "S2-M12.1", file: "src/lib/modules/booking/service.ts", event: "booking.completed", fn: "setAppointmentStatus" },
      { id: "S2-M12.2", file: "src/lib/modules/crm/service.ts", event: "crm.deal.won", fn: "moveDeal" },
      { id: "S2-M12.3", file: "src/lib/modules/shop/service.ts", event: "shop.order.paid", fn: "confirmOrderPaid" },
    ];
    for (const s of sites) {
      const src = read(s.file);
      const at = src.indexOf(`type: "${s.event}"`);
      const head = at > 0 ? src.slice(Math.max(0, at - 600), at) : "";
      const lastOutside = head.lastIndexOf("emitOutboxOutsideTx(");
      const lastInTx = Math.max(head.lastIndexOf("emitOutbox("), head.lastIndexOf("emitOutboxMany("));
      const inTx = at > 0 && lastInTx > lastOutside && /emitOutbox(Many)?\(\s*[A-Za-z_$][\w$]*\s*,/.test(head.slice(lastInTx));
      const fnAt = src.indexOf(`function ${s.fn}`);
      const fnBody = fnAt > 0 ? src.slice(fnAt, at > fnAt ? at + 400 : fnAt + 4000) : "";
      const wrapped = /\$transaction\(|withTx\(/.test(fnBody);
      chk(
        s.id,
        `[static] ${s.file} · "${s.event}" ถูกยิงด้วย emitOutbox(tx, …) ใน transaction เดียวกับการเปลี่ยนสถานะใน ${s.fn} (ไม่ใช่ emitOutboxOutsideTx — กติกา core/outbox.ts:69-72)`,
        at > 0 && inTx && wrapped,
        "emitOutbox(tx, …) ใน tx",
        `found=${at > 0} inTx=${inTx} tx=${wrapped}`,
      );
    }
  }

  console.log("── L12 PII ใน OpsEvent ──");
  // ═══════════════════════════════════════════════════════════════════
  // L12 — OpsEvent ห้ามมีเบอร์/อีเมลดิบ
  // ═══════════════════════════════════════════════════════════════════
  {
    const phone = "0812345678";
    const email = "janedoe@example.com";
    const receiptNo = `fix-s2-${tag}-${phone}-${email}`;
    const sale = await mkSale({ memberId: `fix-s2-ghost-${tag}`, total: 42_000, receiptNo });
    const key = nextKey("l12");
    made.outboxKeys.push(key);
    await emitOutboxOutsideTx({ tenantId: tid, type: "pos.sale.paid", idempotencyKey: key, payload: { saleId: sale.id }, systemId: tmpPosId, unitId: UNIT });
    await drain(1);
    const rows = (await P.opsEvent.findMany({ where: { tenantId: tid, createdAt: { gte: T0 } }, orderBy: { createdAt: "desc" }, take: 200 })) as Any[];
    const mine = rows.filter((r) => `${r.message}\n${r.detail ?? ""}`.includes(`fix-s2-${tag}`));
    const blob = mine.map((r) => `${r.message}\n${r.detail ?? ""}`).join("\n");
    chk(
      "S2-L12.0",
      "[positive control] สะพานสมาชิกล้มจริงและเขียน OpsEvent ของการทดลองนี้ (มี marker fix-s2 อยู่ในข้อความ/รายละเอียด)",
      mine.length >= 1,
      "≥1 แถว",
      `rows=${mine.length}`,
      "MAJOR",
    );
    chk(
      "S2-L12.1",
      "OpsEvent ที่สะพานสมาชิกเขียน ต้องไม่มีเบอร์ลูกค้าดิบ — เลขติดกัน ≥ 7 หลักถูกปิดบังทั้งใน message และ detail/stack",
      mine.length >= 1 && !new RegExp(phone).test(blob) && !/\d{7,}/.test(blob),
      "ไม่มีเลข ≥7 หลักติดกัน",
      `phone=${new RegExp(phone).test(blob)} digits=${(blob.match(/\d{7,}/g) ?? []).slice(0, 3).join(",") || "-"}`,
    );
    chk(
      "S2-L12.2",
      "OpsEvent ที่สะพานสมาชิกเขียน ต้องไม่มีอีเมลลูกค้าดิบ — ส่วนหน้า @ ถูกปิดบัง",
      mine.length >= 1 && !/janedoe@/.test(blob) && !/[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(blob),
      "ไม่มี local part ของอีเมล",
      `hit=${(blob.match(/[A-Za-z0-9._%+-]{2,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).slice(0, 2).join(",") || "-"}`,
    );
  }

  console.log("── L13 แจ้งซ้ำตอน retry ──");
  // ═══════════════════════════════════════════════════════════════════
  // L13 — approvalNotify ห้ามแจ้งซ้ำตอน retry
  // ═══════════════════════════════════════════════════════════════════
  {
    const before = new Set((await P.appNotification.findMany({ where: { tenantId: tid }, select: { id: true } })).map((n: Any) => n.id));
    const key = nextKey("l13");
    made.outboxKeys.push(key);
    await emitOutboxOutsideTx({
      tenantId: tid,
      type: "approval.request.submitted",
      idempotencyKey: key,
      payload: { entityType: "LeaveRequest", entityId: `fix-s2-${tag}-approval`, requestId: `fix-s2-${tag}-approval` },
      systemId: null,
      unitId: UNIT,
    });
    await drain(1);
    const afterFirst = (await P.appNotification.findMany({ where: { tenantId: tid }, select: { id: true } })) as Any[];
    const new1 = afterFirst.filter((n) => !before.has(n.id)).map((n) => n.id);
    made.notifications.push(...new1);
    // จำลอง retry: คิวเดิมถูกหยิบใหม่ (lease หมด / ขั้นหลังล้มแล้ว drain รอบถัดไป)
    await P.outboxEvent.updateMany({ where: { tenantId: tid, idempotencyKey: key }, data: { status: "PENDING", availableAt: new Date(0), processedAt: null } });
    await drain(1);
    const afterSecond = (await P.appNotification.findMany({ where: { tenantId: tid }, select: { id: true } })) as Any[];
    const new2 = afterSecond.filter((n) => !before.has(n.id)).map((n) => n.id);
    made.notifications.push(...new2.filter((id) => !new1.includes(id)));
    chk(
      "S2-L13.1",
      "approval.request.submitted ถูก drain ซ้ำ (retry) → AppNotification ต้องมีใบเดียว (dedupe ด้วย event id / คำขออนุมัติ)",
      new1.length === 1 && new2.length === 1,
      "รอบแรก 1 · รอบสอง ยัง 1",
      `รอบแรก=${new1.length} รอบสอง=${new2.length}`,
    );
  }

  console.log("── L15 เพดาน Int ──");
  // ═══════════════════════════════════════════════════════════════════
  // L15 — totalSpentSatang เป็น Int (migration = DEFERRED) ⇒ ต้องมีด่านกันทะลุเพดาน
  // ═══════════════════════════════════════════════════════════════════
  {
    const MAX = 2_147_483_647;
    const cid = await mkMember("L15");
    await P.customer.update({ where: { id: cid }, data: { totalSpentSatang: MAX - 400_000 } });
    const sale = await mkSale({ memberId: cid, total: 2_000_000 });
    const opsBefore = await P.opsEvent.count({ where: { tenantId: tid, createdAt: { gte: T0 } } });
    await bridges.onPosSalePaid(tid, sale.id).catch(() => null);
    const row = (await prisma.customer.findUnique({ where: { id: cid } }))! as Any;
    chk(
      "S2-L15.1",
      `ยอดสะสมที่จะทะลุเพดาน Int (${MAX}) ต้องถูก clamp ไว้ที่เพดาน — ไม่ล้ม ไม่ค้างยอดเดิม (migration ขยายชนิดคอลัมน์ = DEFERRED)`,
      row.totalSpentSatang === MAX,
      `spent=${MAX}`,
      `spent=${row.totalSpentSatang}`,
    );
    const opsRows = (await P.opsEvent.findMany({ where: { tenantId: tid, createdAt: { gte: T0 } }, orderBy: { createdAt: "desc" }, take: 200 })) as Any[];
    const hit = opsRows.some((r) => `${r.message}\n${r.detail ?? ""}`.includes(cid) || `${r.message}\n${r.detail ?? ""}`.includes(sale.id));
    chk(
      "S2-L15.2",
      "การ clamp ต้องถูกบันทึกเป็น OpsEvent (ร้านต้องรู้ว่ายอดสะสมของสมาชิกคนไหน/บิลใบไหนชนเพดานแล้ว)",
      hit,
      "มี OpsEvent อ้างสมาชิก/บิล",
      `opsBefore=${opsBefore} opsNow=${opsRows.length} hit=${hit}`,
      "MAJOR",
    );
  }
} catch (e) {
  console.error("💥", e);
  chk("S2-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 300));
} finally {
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* ignore */
    }
  };
  // 1) ตัดลิงก์บัญชีพังก่อน แล้วระบายคิวให้เงียบ (ห้ามเหลือ consumer มาแตะแถวที่กำลังจะลบ)
  if (made.links.length) await d(() => P.accountSystemLink.deleteMany({ where: { id: { in: made.links } } }));
  if (made.endpoints.length) {
    await d(() => P.webhookEndpoint.updateMany({ where: { id: { in: made.endpoints } }, data: { active: false } }));
  }
  try {
    const { drainOutbox } = await import("@/lib/core/outbox");
    const CONS: Any = (await import("@/lib/outbox-consumers" as string)).consumers;
    for (let i = 0; i < 3; i += 1) await drainOutbox(CONS, { limit: 300 });
  } catch {
    /* ignore */
  }
  // 2) คิวของทดลอง (ทั้งที่ยิงเอง และที่โมดูลยิงถึงข้อมูลชั่วคราว)
  for (const k of made.outboxKeys) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, idempotencyKey: k } }));
  for (const sid of made.sales) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, payload: { path: ["saleId"], equals: sid } } }));
  for (const cid of made.customers) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, payload: { path: ["customerId"], equals: cid } } }));
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, idempotencyKey: { contains: `fix-s2-${tag}` } } }));
  // 3) webhook / แจ้งเตือน
  if (made.endpoints.length) {
    await d(() => P.webhookDelivery.deleteMany({ where: { endpointId: { in: made.endpoints } } }));
    await d(() => P.webhookEndpoint.deleteMany({ where: { id: { in: made.endpoints } } }));
  }
  if (made.notifications.length) await d(() => P.appNotification.deleteMany({ where: { id: { in: made.notifications } } }));
  // 4) บิลทดลอง + ร่องรอยของมัน
  if (made.sales.length) {
    const leds = (await P.pointLedger.findMany({ where: { tenantId: tid, refId: { in: made.sales } }, select: { id: true } }).catch(() => [])) as Any[];
    await d(() => P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l) => l.id) } } }));
    await d(() => P.pointLedger.deleteMany({ where: { id: { in: leds.map((l) => l.id) } } }));
    await d(() => P.memberActivity.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } } }));
    await d(() => P.accountJournalLine.deleteMany({ where: { entry: { refType: "PosSale", refId: { in: made.sales } } } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } } }));
    await d(() => P.accountDocument.deleteMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } } }));
    await d(() => P.posPayment.deleteMany({ where: { saleId: { in: made.sales } } }));
    await d(() => P.posSaleLine.deleteMany({ where: { saleId: { in: made.sales } } }));
    await d(() => P.posSale.deleteMany({ where: { id: { in: made.sales } } }));
  }
  // 5) สมาชิกทดลอง
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } }).catch(() => [])).map((c) => c.partyId).filter(Boolean) as string[];
    const progs = (await P.stampCardProgress.findMany({ where: { customerId: { in: made.customers } }, select: { id: true } }).catch(() => [])) as Any[];
    if (progs.length) await d(() => P.stampEvent.deleteMany({ where: { progressId: { in: progs.map((p) => p.id) } } }));
    for (const mdl of [
      "voucher",
      "stampCardProgress",
      "pointLot",
      "pointLedger",
      "pointBalance",
      "memberConsent",
      "memberAttribution",
      "memberTierHistory",
      "memberFieldValue",
      "memberChannelIdentity",
      "memberAccessLog",
      "memberActivity",
      "memberReferral",
      "memberNotificationLog",
    ]) {
      await d(() => P[mdl]?.deleteMany({ where: { customerId: { in: made.customers } } }));
    }
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) {
      await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } }));
      await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } }));
    }
  }
  // 6) บัตรสะสมตราชั่วคราว + ระบบชั่วคราว + log ของการทดลองนี้
  if (made.cards.length) {
    const progs2 = (await P.stampCardProgress.findMany({ where: { cardId: { in: made.cards } }, select: { id: true } }).catch(() => [])) as Any[];
    if (progs2.length) {
      await d(() => P.stampEvent.deleteMany({ where: { progressId: { in: progs2.map((p) => p.id) } } }));
      await d(() => P.stampCardProgress.deleteMany({ where: { id: { in: progs2.map((p) => p.id) } } }));
    }
    await d(() => P.stampCard.deleteMany({ where: { id: { in: made.cards } } }));
  }
  if (made.systems.length) await d(() => P.appSystem.deleteMany({ where: { id: { in: made.systems } } }));
  const opsRows = (await P.opsEvent.findMany({ where: { tenantId: tid, createdAt: { gte: T0 } }, select: { id: true, message: true, detail: true } }).catch(() => [])) as Any[];
  const mineOps = opsRows
    .filter((r) => {
      const blob = `${r.message}\n${r.detail ?? ""}`;
      return blob.includes(`fix-s2-${tag}`) || made.sales.some((s) => blob.includes(s)) || made.customers.some((c) => blob.includes(c));
    })
    .map((r) => r.id);
  if (mineOps.length) await d(() => P.opsEvent.deleteMany({ where: { id: { in: mineOps } } }));
  // 7) พิสูจน์ว่าคืนฐานข้อมูล QC ให้เหมือนเดิม — ไม่เหลือของที่ข้อสอบนี้สร้าง
  try {
    const left = {
      members: await prisma.customer.count({ where: { tenantId: tid, firstName: `fix-s2-${tag}` } }),
      sales: await P.posSale.count({ where: { tenantId: tid, idempotencyKey: { contains: `fix-s2-${tag}` } } }),
      systems: await P.appSystem.count({ where: { tenantId: tid, name: { contains: `fix-s2-${tag}` } } }),
      events: await P.outboxEvent.count({ where: { tenantId: tid, idempotencyKey: { contains: `fix-s2-${tag}` } } }),
      hooks: await P.webhookEndpoint.count({ where: { tenantId: tid, secret: `fix-s2-${tag}` } }),
      cards: await P.stampCard.count({ where: { tenantId: tid, name: { contains: `fix-s2-${tag}` } } }),
      ops: (await P.opsEvent.findMany({ where: { tenantId: tid, createdAt: { gte: T0 } }, select: { message: true, detail: true } })).filter((r: Any) =>
        `${r.message}\n${r.detail ?? ""}`.includes(`fix-s2-${tag}`),
      ).length,
    };
    const dirty = Object.values(left).reduce((n: number, v) => n + (v as number), 0);
    chk("S2-CLEAN", "ข้อสอบคืนฐานข้อมูล QC ให้เหมือนเดิม (ไม่เหลือสมาชิก/บิล/ระบบ/คิว/บัตรตรา/log ที่สร้างระหว่างเทส)", dirty === 0, "ไม่เหลือ", JSON.stringify(left), "MAJOR");
  } catch (e) {
    chk("S2-CLEAN", "ข้อสอบคืนฐานข้อมูล QC ให้เหมือนเดิม", false, "ไม่เหลือ", String((e as Error)?.message ?? e).slice(0, 120), "MAJOR");
  }
  for (const c of clients) await d(() => c.$disconnect());
  await prisma.$disconnect();
}

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} FIX-S2: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
