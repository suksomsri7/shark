// probe-c15-review.mts — หลักฐานการแก้ตามรีวิว C1.5 (builder · ไม่ใช่ oracle) · QC database only (.env.qc) · throwaway tenants `qc-p15-<rand>` ลบใน finally
// Run: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/probe-c15-review.mts
// แต่ละกรณีมีทั้ง "บวก" (สิ่งที่ต้องเกิดยังเกิด) และ "ลบ" (สิ่งที่ห้ามเกิดไม่เกิด):
//   S1 won/lost เฉพาะการ "เข้า" · S2 v1 bounce ยิง won ครั้งเดียวต่อดีล · S3 ปิด→เปิดต้องผ่าน reopenDeal · S4 convert ∥ moveDeal→WON ข้ามโพรเซส ·
//   S5 ผู้ติดต่อถูกเก็บถาวรระหว่างรอล็อก · S6 pipeline ถูกเก็บถาวรระหว่างรอล็อก · S8 ลบดีล (รายการวัตถุ · ไฟล์ · คำขออนุมัติ) ·
//   S9 issueInvoice พร้อมกัน → ใบเดียว + ต่างจากใบเสนอราคา → ปฏิเสธ · ยอดรวมคอลัมน์/พยากรณ์ > 2³¹ ตรงเป๊ะ
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { spawn } from "node:child_process";

const THIS = "scripts/pending/probe-c15-review.mts";
const ARGV = process.argv.slice(2);
const W = ARGV.indexOf("--worker");
const codeOf = (e: Any) => String(e?.code ?? "-");
const msgOf = (e: Any) => (e instanceof Error ? e.message : String(e));

const env = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const qcHost = env.loadQcEnv().host;

if (W >= 0) {
  const [mode, t, s, u, startAt, arg] = ARGV.slice(W + 1);
  const D = (await import("@/lib/modules/crm/deals" as string)) as Any;
  const CT = (await import("@/lib/modules/crm/contacts" as string)) as Any;
  const db = (await import("@/lib/core/db")) as Any;
  const ctx = { tenantId: t, systemId: s, actorUserId: u };
  const actor = { userId: u, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const a = JSON.parse(Buffer.from(String(arg), "base64url").toString("utf8"));
  const wait = Number(startAt) - Date.now();
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  const run = async (f: () => Promise<unknown>) => {
    try {
      await f();
      return "OK";
    } catch (e) {
      return `ERR:${codeOf(e)}:${msgOf(e).slice(0, 140)}`;
    }
  };
  let out: string[] = [];
  if (mode === "convert") out = await Promise.all((a.contacts as string[]).map((k, i) => run(() => CT.convertContact(ctx, actor, k, { idempotencyKey: `p15-cv-${i}-${a.tag}`, deal: { pipelineId: a.pipelineId, title: `ดีลแปลง ${i}` } }))));
  if (mode === "win") out = await Promise.all((a.deals as string[]).map((d) => run(() => D.moveDeal(ctx, actor, d, { stageId: a.stageId }))));
  console.log(`P15WORKER ${JSON.stringify(out)}`);
  await db.prisma.$disconnect();
  process.exit(0);
}

console.log(`[env] DB ${qcHost}`);
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const D = (await import("@/lib/modules/crm/deals" as string)) as Any;
const CO = (await import("@/lib/modules/crm/companies" as string)) as Any;
const SVC = (await import("@/lib/modules/crm/service" as string)) as Any;
const APR = (await import("@/lib/modules/approval/service" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;

const rand = Math.random().toString(36).slice(2, 8).replace(/[^a-z]/g, "q");
const TAG = `qc-p15-${rand}`;
const results: { id: string; ok: boolean; info: string }[] = [];
const chk = (id: string, title: string, ok: boolean, info: string) => {
  results.push({ id, ok, info });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${title}${ok ? "" : ` — ${info}`}`);
};
const call = async (f: () => Promise<unknown>): Promise<{ ok: boolean; v: Any; code: string; msg: string }> => {
  try {
    return { ok: true, v: await f(), code: "", msg: "" };
  } catch (e) {
    return { ok: false, v: null, code: codeOf(e), msg: msgOf(e) };
  }
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const DEAD = /40P01|deadlock|P2034/i;
let tid = "";
const USERS: string[] = [];

try {
  const tnt = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tid = tnt.id;
  const user = await P.user.create({ data: { email: `${TAG}@qc.invalid`, name: `QC ${TAG}` } });
  const sales = await P.user.create({ data: { email: `${TAG}-s@qc.invalid`, name: `QC s ${TAG}` } });
  USERS.push(user.id, sales.id);
  await P.membership.create({ data: { userId: user.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await P.membership.create({ data: { userId: sales.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: { "crm.*": true }, acceptedAt: new Date() } });
  const crm = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
  const acc = (await sysSvc.createSystem(tid, "ACCOUNT", `บัญชี ${TAG}`)).id as string;
  await P.accountSettings.create({ data: { tenantId: tid, systemId: acc, orgName: TAG, vatRegistered: true, vatRateBp: 700, vatTiming: "ON_ISSUE" } });
  await P.accountSystemLink.create({ data: { tenantId: tid, systemId: acc, linkedKind: "CRM", linkedId: crm } });
  const ctx = { tenantId: tid, systemId: crm, actorUserId: user.id };
  const cSales = { ...ctx, actorUserId: sales.id };
  const owner = { userId: user.id, role: "OWNER", unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
  const staff = { userId: sales.id, role: "STAFF", unitAccess: ["*"], permissions: { "crm.*": true } as Record<string, unknown> };
  const mkPipe = async (name: string, stages: { name: string; kind: string; probability: number }[]) => {
    const p = await P.crmPipeline.create({ data: { tenantId: tid, systemId: crm, name, stages: { create: stages.map((x, i) => ({ tenantId: tid, systemId: crm, sortOrder: i, ...x })) } }, include: { stages: true } });
    return { id: p.id as string, st: [...p.stages].sort((a: Any, b: Any) => a.sortOrder - b.sortOrder).map((x: Any) => x.id as string) };
  };
  const pp = await mkPipe("ทดสอบรีวิว", [
    { name: "เปิด", kind: "OPEN", probability: 50 }, { name: "เปิด 2", kind: "OPEN", probability: 20 },
    { name: "ชนะ ก", kind: "WON", probability: 100 }, { name: "ชนะ ข", kind: "WON", probability: 100 },
    { name: "แพ้ ก", kind: "LOST", probability: 0 }, { name: "แพ้ ข", kind: "LOST", probability: 0 },
  ]);
  const [O1, O2, W1, W2, L1, L2] = pp.st;
  const lr = (await P.crmLostReason.create({ data: { tenantId: tid, systemId: crm, key: `r-${rand}`, label: "ราคาสูงไป" } })).id as string;
  let seq = 0;
  const mkContact = async (name: string) => {
    const phone = `08${String(10_000_000 + Math.floor(Math.random() * 89_999_999) + seq++).slice(-8)}`;
    const party = await P.party.create({ data: { tenantId: tid, name, kind: "PERSON", phone } });
    return (await P.crmContact.create({ data: { tenantId: tid, systemId: crm, name, firstName: name, phone, partyId: party.id } })).id as string;
  };
  const mkCompany = async (name: string) => {
    const r = await CO.createCompany(ctx, owner, { name });
    return (r.company?.id ?? r.id) as string;
  };
  const deal = async (contactId: string, extra: Record<string, Any> = {}) => (await D.createDeal(ctx, owner, { pipelineId: pp.id, title: `ดีล ${seq++} ${rand}`, contactId, valueSatang: 100_000, ...extra })).id as string;
  const ev = (type: string, id: string) => P.outboxEvent.count({ where: { tenantId: tid, type, idempotencyKey: { startsWith: `${type}#${id}` } } }) as Promise<number>;
  const row = (id: string) => P.crmDeal.findFirst({ where: { id } }) as Promise<Any>;

  // ── S1 ──
  console.log("── S1 won/lost เฉพาะการเข้า ──");
  {
    const k = await mkContact(`ผู้ติดต่อ S1 ${rand}`);
    const d = await deal(k, { valueSatang: 500_000 });
    const a = await call(() => D.moveDeal(ctx, owner, d, { stageId: W1 }));
    const snap1 = (await row(d)).wonValueSatang;
    const won1 = await ev("crm.deal.won", d);
    await P.crmDeal.update({ where: { id: d }, data: { valueSatang: 999_999 } }); // ค่าเปลี่ยนหลังชนะ (จำลอง) — W1→W2 ต้องไม่ถ่ายภาพใหม่
    const b = await call(() => D.moveDeal(ctx, owner, d, { stageId: W2 }));
    const r = await row(d);
    chk("S1.1", "[บวก] OPEN → ชนะ ก ⇒ crm.deal.won 1 ครั้ง + ถ่ายภาพ wonValueSatang = 500,000", a.ok && won1 === 1 && String(snap1) === "500000", `${a.msg} won=${won1} snap=${snap1}`);
    chk("S1.2", "[ลบ] ชนะ ก → ชนะ ข ⇒ won ยังเป็น 1 · stage.changed เพิ่ม · wonValueSatang ไม่ถ่ายใหม่ (ยัง 500,000)", b.ok && (await ev("crm.deal.won", d)) === 1 && (await ev("crm.deal.stage.changed", d)) === 2 && String(r.wonValueSatang) === "500000" && r.stageId === W2, `${b.msg} won=${await ev("crm.deal.won", d)} snap=${r.wonValueSatang}`);
    const d2 = await deal(k);
    const c = await call(() => D.moveDeal(ctx, owner, d2, { stageId: L1, lostReasonId: lr }));
    const e = await call(() => D.moveDeal(ctx, owner, d2, { stageId: L2, lostReasonId: lr }));
    chk("S1.3", "[บวก] OPEN → แพ้ ก ⇒ crm.deal.lost 1 · [ลบ] แพ้ ก → แพ้ ข ⇒ lost ยัง 1 (stage.changed 2)", c.ok && e.ok && (await ev("crm.deal.lost", d2)) === 1 && (await ev("crm.deal.stage.changed", d2)) === 2, `${c.msg}${e.msg} lost=${await ev("crm.deal.lost", d2)}`);
  }

  // ── S2 ──
  console.log("── S2 ทาง v1 ──");
  {
    const k = await mkContact(`ผู้ติดต่อ S2 ${rand}`);
    const v1 = await SVC.createDeal({ tenantId: tid, systemId: crm }, { contactId: k, pipelineId: pp.id, stageId: O1, title: `v1 ${rand}`, valueSatang: 10_000 });
    const r1 = await call(() => SVC.moveDeal({ tenantId: tid, systemId: crm }, v1.id, W1));
    const r2 = await call(() => SVC.moveDeal({ tenantId: tid, systemId: crm }, v1.id, O1));
    const r3 = await call(() => SVC.moveDeal({ tenantId: tid, systemId: crm }, v1.id, W1));
    const keys = (await P.outboxEvent.findMany({ where: { tenantId: tid, type: "crm.deal.won", idempotencyKey: { startsWith: `crm.deal.won#${v1.id}` } } })).map((x: Any) => x.idempotencyKey);
    chk("S2.1", "[ลบ] v1 WON → OPEN → WON (bounce) ⇒ crm.deal.won ครั้งเดียวต่อดีล · key = crm.deal.won#<dealId> (v1 เดิม)", r1.ok && r2.ok && r3.ok && keys.length === 1 && keys[0] === `crm.deal.won#${v1.id}` && (await row(v1.id)).kind === "WON", `${r1.msg}${r2.msg}${r3.msg} keys=${JSON.stringify(keys)}`);
    const d = await deal(k);
    await D.moveDeal(ctx, owner, d, { stageId: W1 });
    const re = await call(() => D.reopenDeal(ctx, owner, d, { confirm: true, reason: "ลูกค้ากลับมาใหม่" }));
    const w2 = await call(() => D.moveDeal(ctx, owner, d, { stageId: W1 }));
    const k2 = (await P.outboxEvent.findMany({ where: { tenantId: tid, type: "crm.deal.won", idempotencyKey: { startsWith: `crm.deal.won#${d}` } } })).map((x: Any) => x.idempotencyKey);
    chk("S2.2", "[บวก] ทาง v2: ชนะ → เปิดใหม่ → ชนะ ⇒ won 2 ครั้ง (key ต่อการเข้า #<histId>)", re.ok && w2.ok && k2.length === 2 && k2.every((x: string) => x.split("#").length === 3), `${re.msg}${w2.msg} keys=${k2.length}`);
  }

  // ── S3 ──
  console.log("── S3 ปิด → เปิด ──");
  {
    const k = await mkContact(`ผู้ติดต่อ S3 ${rand}`);
    const d = await deal(k);
    await D.moveDeal(ctx, owner, d, { stageId: W1 });
    const a = await call(() => D.moveDeal(ctx, owner, d, { stageId: O2 }));
    const still = (await row(d)).kind;
    const b = await call(() => D.reopenDeal(ctx, owner, d, { stageId: O2, confirm: true, reason: "ลูกค้าขอแก้สัญญา" }));
    chk("S3.1", "[ลบ] OWNER moveDeal ชนะ → เปิด ⇒ CONFIRM_REQUIRED (ไทย · ชี้ไป \"เปิดดีลใหม่\") · ดีลยังชนะ", !a.ok && a.code === "CONFIRM_REQUIRED" && /เปิดดีลใหม่/.test(a.msg) && still === "WON", `${a.code} ${a.msg.slice(0, 60)} kind=${still}`);
    chk("S3.2", "[บวก] reopenDeal (ยืนยัน + เหตุผล) ⇒ OPEN ที่ขั้นที่เลือก", b.ok && (await row(d)).kind === "OPEN" && (await row(d)).stageId === O2, b.msg);
    const c = await call(() => D.moveDeal(cSales, staff, d, { stageId: W1 }));
    const st = await call(() => D.moveDeal(cSales, staff, d, { stageId: O1 }));
    chk("S3.3", "[ลบ] STAFF ชนะ → เปิด ⇒ FORBIDDEN (ก่อนด่านยืนยัน)", c.ok && !st.ok && st.code === "FORBIDDEN", `${c.msg} ${st.code}`);
  }

  // ── S4 ──
  console.log("── S4 convert ∥ moveDeal→WON ข้ามโพรเซส ──");
  {
    const co = await mkCompany(`บริษัท S4 ${rand}`);
    const contacts: string[] = [];
    const deals: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const k = await mkContact(`ผู้ติดต่อ S4 ${i} ${rand}`);
      await CO.addContact(ctx, owner, co, { contactId: k, isPrimary: true });
      contacts.push(k);
      deals.push(await deal(k, { companyId: co }));
    }
    const startAt = Date.now() + 40_000;
    const spawnW = (mode: string, arg: Any) =>
      new Promise<string>((resolve) => {
        const ch = spawn("pnpm", ["exec", "tsx", THIS, "--worker", mode, tid, crm, user.id, String(startAt), Buffer.from(JSON.stringify(arg)).toString("base64url")], { env: process.env });
        let o = "";
        ch.stdout.on("data", (x: Any) => (o += String(x)));
        ch.stderr.on("data", (x: Any) => (o += String(x)));
        ch.on("close", () => resolve(o));
      });
    const outs = await Promise.all([spawnW("convert", { contacts, pipelineId: pp.id, tag: rand }), spawnW("win", { deals, stageId: W1 })]);
    const parsed = outs.map((o) => { const m = /P15WORKER (\[.*\])/.exec(o); return m ? (JSON.parse(m[1]!) as string[]) : ["NO-OUTPUT"]; });
    const flat = parsed.flat();
    const dead = flat.filter((x) => DEAD.test(x));
    const created = await P.crmDeal.count({ where: { tenantId: tid, contactId: { in: contacts }, id: { notIn: deals } } });
    const wonEv = (await Promise.all(deals.map((d) => ev("crm.deal.won", d)))).every((n) => n === 1);
    const coRow = await P.crmCompany.findFirst({ where: { id: co } });
    const truth = await P.crmDeal.count({ where: { companyId: co, kind: "OPEN" } });
    chk("S4.0", "[บวก] 2 โพรเซสรันครบ (6 convert + 6 win)", flat.length === 12 && !flat.includes("NO-OUTPUT"), `${flat.length}`);
    chk("S4.1", "[ลบ] ไม่มี deadlock (40P01/P2034) · ทุกคำสั่ง OK · convert สร้างดีลใหม่ 6 ใบ (ผูกบริษัทปัจจุบัน) · won 1 ต่อดีล · แคช openDealCount ตรง", dead.length === 0 && flat.every((x) => x === "OK") && created === 6 && wonEv && coRow.openDealCount === truth, `dead=${dead.length} bad=${flat.filter((x) => x !== "OK").slice(0, 2).join(" | ")} created=${created} won1=${wonEv} cache=${coRow.openDealCount}/${truth}`);
    const cd = await P.crmDeal.findMany({ where: { tenantId: tid, contactId: { in: contacts }, id: { notIn: deals } }, select: { companyId: true } });
    chk("S4.2", "[บวก] ดีลจากการแปลงได้ companyId = บริษัทปัจจุบันของผู้ติดต่อ (ส่งชัดเจน)", cd.length === 6 && cd.every((x: Any) => x.companyId === co), JSON.stringify(cd.slice(0, 2)));
  }

  // ── S5 ──
  console.log("── S5 ผู้ติดต่อถูกเก็บถาวรระหว่างรอล็อก ──");
  {
    const k = await mkContact(`ผู้ติดต่อ S5 ${rand}`);
    const ok = await call(() => D.createDeal(ctx, owner, { pipelineId: pp.id, title: `S5 บวก ${rand}`, contactId: k }));
    chk("S5.1", "[บวก] ผู้ติดต่อปกติ ⇒ สร้างดีลได้", ok.ok, ok.msg);
    const k2 = await mkContact(`ผู้ติดต่อ S5b ${rand}`);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const holder = P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "CrmContact" WHERE id = $1 FOR UPDATE`, k2);
      await gate;
      await tx.crmContact.update({ where: { id: k2 }, data: { archivedAt: new Date() } });
    }, { timeout: 30_000 });
    await sleep(300);
    const racing = call(() => D.createDeal(ctx, owner, { pipelineId: pp.id, title: `S5 ลบ ${rand}`, contactId: k2 }));
    await sleep(1500);
    release();
    await holder;
    const r = await racing;
    const n = await P.crmDeal.count({ where: { title: `S5 ลบ ${rand}` } });
    chk("S5.2", "[ลบ] ผู้ติดต่อถูกเก็บถาวรระหว่าง createDeal รอล็อกแถวผู้ติดต่อ ⇒ VALIDATION (ไทย) · ไม่มีดีล", !r.ok && r.code === "VALIDATION" && /เก็บถาวร/.test(r.msg) && n === 0, `${r.ok ? "created" : r.code + " " + r.msg.slice(0, 60)} rows=${n}`);
  }

  // ── S6 ──
  console.log("── S6 pipeline ถูกเก็บถาวรระหว่างรอล็อก ──");
  {
    const p2 = await mkPipe("S6", [{ name: "เปิด", kind: "OPEN", probability: 10 }, { name: "ชนะ", kind: "WON", probability: 100 }]);
    const k = await mkContact(`ผู้ติดต่อ S6 ${rand}`);
    const ok = await call(() => D.createDeal(ctx, owner, { pipelineId: p2.id, title: `S6 บวก ${rand}`, contactId: k }));
    await P.crmDeal.deleteMany({ where: { title: `S6 บวก ${rand}` } });
    chk("S6.1", "[บวก] pipeline ใช้งานอยู่ ⇒ สร้างดีลได้", ok.ok, ok.msg);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const holder = P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "CrmPipeline" WHERE id = $1 FOR UPDATE`, p2.id);
      await gate;
      await tx.crmPipeline.update({ where: { id: p2.id }, data: { archivedAt: new Date() } });
    }, { timeout: 30_000 });
    await sleep(300);
    const racing = call(() => D.createDeal(ctx, owner, { pipelineId: p2.id, title: `S6 ลบ ${rand}`, contactId: k }));
    await sleep(1500);
    release();
    await holder;
    const r = await racing;
    chk("S6.2", "[ลบ] pipeline ถูกเก็บถาวรระหว่าง createDeal รอล็อก (FOR SHARE) ⇒ VALIDATION · ไม่มีดีล", !r.ok && r.code === "VALIDATION" && (await P.crmDeal.count({ where: { title: `S6 ลบ ${rand}` } })) === 0, `${r.ok ? "created" : r.code + " " + r.msg.slice(0, 60)}`);
  }

  // ── S8 ──
  console.log("── S8 ลบดีล ──");
  {
    const k = await mkContact(`ผู้ติดต่อ S8 ${rand}`);
    const d = await deal(k);
    const obj = await P.customObject.create({ data: { tenantId: tid, systemId: crm, key: `p15${rand}`, label: "สัญญา", labelPlural: "สัญญา", parentType: "DEAL", titleFieldKey: "title" } });
    const rec = await P.customRecord.create({ data: { tenantId: tid, systemId: crm, objectId: obj.id, parentType: "DEAL", parentId: d, title: "สัญญา 1" } });
    await P.crmFileLink.create({ data: { tenantId: tid, systemId: crm, entityType: "DEAL", entityId: d, fileId: `${TAG}-file`, name: "a.pdf", size: 1, mime: "application/pdf" } });
    await APR.createPolicy({ tenantId: tid }, { name: `ส่วนลด ${TAG}`, entityType: "crm.discount", steps: [{ order: 1, approverRole: "OWNER" }] });
    const pend = await call(() => D.setLines(cSales, staff, d, { lines: [{ name: "ลดมาก", qty: 1, unitPriceSatang: 100_000, discountBp: 2000 }] }));
    const reqId = (await row(d)).pendingApprovalRequestId;
    const a = await call(() => D.deleteDeal(ctx, owner, d, { confirm: true, reason: "ลูกค้ายกเลิกทั้งหมด" }));
    chk("S8.1", "[ลบ] มีรายการวัตถุกำหนดเองที่ยังใช้งานผูกดีล ⇒ CONFLICT (ไทย) · ดีลยังอยู่", !a.ok && a.code === "CONFLICT" && /เก็บถาวร/.test(a.msg) && !!(await row(d)), `${a.code} ${a.msg.slice(0, 60)}`);
    await P.customRecord.update({ where: { id: rec.id }, data: { archivedAt: new Date() } });
    const b = await call(() => D.deleteDeal(ctx, owner, d, { confirm: true, reason: "ลูกค้ายกเลิกทั้งหมด" }));
    const links = await P.crmFileLink.count({ where: { tenantId: tid, entityType: "DEAL", entityId: d } });
    const req = reqId ? await P.approvalRequest.findFirst({ where: { id: reqId } }) : null;
    chk("S8.2", "[บวก] เก็บถาวรรายการแล้ว ⇒ ลบได้ · CrmFileLink ของดีลหาย · คำขออนุมัติส่วนลดที่ค้าง = CANCELLED", pend.ok && b.ok && !(await row(d)) && links === 0 && req?.status === "CANCELLED", `${pend.msg}${b.msg} links=${links} req=${req?.status}`);
  }

  // ── S9 ──
  console.log("── S9 ใบแจ้งหนี้ ──");
  {
    const k = await mkContact(`ผู้ติดต่อ S9 ${rand}`);
    const d = await deal(k, { valueSatang: 250_000 });
    const rs = await Promise.all(Array.from({ length: 6 }, () => call(() => D.issueInvoice(ctx, owner, d))));
    const n = await P.accountDocument.count({ where: { tenantId: tid, docType: "INVOICE" } });
    const ids = new Set(rs.filter((r) => r.ok).map((r) => r.v.docId));
    chk("S9.1", "[ลบ] issueInvoice 6 ครั้งพร้อมกัน ⇒ ใบแจ้งหนี้ 1 ใบ · ทุกคำตอบ docId เดียวกัน · deal.invoiceDocId = ใบนั้น", rs.every((r) => r.ok) && n === 1 && ids.size === 1 && (await row(d)).invoiceDocId === [...ids][0], `ok=${rs.filter((r) => r.ok).length} invoices=${n} ids=${ids.size} ${rs.find((r) => !r.ok)?.msg ?? ""}`);
    const d2 = await deal(k, { valueSatang: 0 });
    await D.setLines(ctx, owner, d2, { lines: [{ name: "คอร์ส", qty: 1, unitPriceSatang: 300_000 }] });
    const q = await call(() => D.issueQuotation(ctx, owner, d2, {}));
    await D.setLines(ctx, owner, d2, { lines: [{ name: "คอร์ส", qty: 2, unitPriceSatang: 300_000 }] });
    const bad = await call(() => D.issueInvoice(ctx, owner, d2));
    chk("S9.2", "[ลบ] รายการเปลี่ยนหลังออกใบเสนอราคา ⇒ issueInvoice = VALIDATION \"ออกใบเสนอราคาใหม่ก่อน\" · ไม่มีใบแจ้งหนี้ใหม่", q.ok && !bad.ok && bad.code === "VALIDATION" && /ออกใบเสนอราคาใหม่ก่อน/.test(bad.msg) && (await P.accountDocument.count({ where: { tenantId: tid, docType: "INVOICE" } })) === 1, `${q.msg} ${bad.code} ${bad.msg.slice(0, 60)}`);
  }

  // ── ยอด > 2³¹ ──
  console.log("── ยอดรวม > 2³¹ ──");
  {
    const p3 = await mkPipe("ยอดใหญ่", [{ name: "เปิด", kind: "OPEN", probability: 50 }, { name: "ชนะ", kind: "WON", probability: 100 }]);
    const k = await mkContact(`ผู้ติดต่อ big ${rand}`);
    for (let i = 0; i < 2; i += 1) await D.createDeal(ctx, owner, { pipelineId: p3.id, title: `ใหญ่ ${i} ${rand}`, contactId: k, valueSatang: 1_500_000_000 });
    const bd = await D.getBoard(ctx, owner, { pipelineId: p3.id });
    const col = bd.columns.find((c: Any) => c.kind === "OPEN");
    const fc = await D.forecast(ctx, owner, { pipelineId: p3.id, groupBy: "owner" });
    chk("SUM.1", "[บวก] ดีล ฿15M × 2 ในคอลัมน์เดียว ⇒ sumSatang = 3,000,000,000 ตรงเป๊ะ · weighted 1,500,000,000 · forecast owner = 3e9 / 1.5e9", col?.sumSatang === 3_000_000_000 && col?.weightedSatang === 1_500_000_000 && col?.count === 2 && fc.rows[0]?.valueSatang === 3_000_000_000 && fc.rows[0]?.weightedSatang === 1_500_000_000, `col=${col?.count}/${col?.sumSatang}/${col?.weightedSatang} fc=${JSON.stringify(fc.rows)}`);
  }
} catch (e) {
  chk("FATAL", "probe ran to the end", false, msgOf(e).slice(0, 400));
} finally {
  if (tid) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`).catch(() => [])) as Any[]).map((r) => r.table_name as string).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => 0);
    await P.appSystemUnit.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => 0);
    await P.tenant.delete({ where: { id: tid } }).catch(() => 0);
    for (const u of USERS) await P.user.delete({ where: { id: u } }).catch(() => 0);
    let left = 0;
    for (const t of tables) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    const tenants = await P.tenant.count({ where: { id: tid } });
    chk("CLEAN", "throwaway tenant + users + every row gone", left === 0 && tenants === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, `rows=${left} tenants=${tenants}`);
  }
  await prisma.$disconnect();
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed === results.length ? "🟢" : "🔴"} probe-c15-review: ${passed}/${results.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: results.length, passed, findings: results.filter((r) => !r.ok).map((r) => r.id) })}`);
process.exit(passed === results.length ? 0 : 1);
