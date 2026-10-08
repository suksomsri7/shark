// C5.4-C round-9 hunter probe B (QC2 only · throwaway tenant · deleted at the end)
//   R1b  voidPayment(first child) racing recordGroupPayment-by-cheque — with reasons + resulting state ×8
//   R1d  deterministic replay of that window with the service calls recordGroupPayment makes (children → void child 1 → createCheque{paymentId}) → bounce
//   H1b  bounced batch: can voidGroupPayment on it re-sync the head? does a per-child payment re-sync it?
//   L1   group cheque CLEARED → voidPayment(sibling) / voidGroupPayment refused → bounce after clear: I1/I2 · events
//   CN1  partial CN on the sibling while the cheque is live → bounce: outstanding / status / I2
//   VD1  voidDocument on a child while the cheque is live (refused?) — and after bounce
//   E1   events: bounce ×3 concurrent + retry → payment.voided exactly once per child payment
//   K1   form payment (single-doc cheque, key <kb>:<n>) on child 1 + group cheque batch for the rest → bounce group cheque must not touch the form payment; bounce the form cheque must not touch the batch
//   C1   clientKey edge shapes on one group: "a#b" vs "a-b" · 61-char keys differing only at char 61 · "" · "%_" — second submit silently no-op?
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r9/probe-r9b.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54cw-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.includes(k);
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R9", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  if (!bank?.ok) throw new Error(`bank: ${bank?.reason}`);
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const inv = async () => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  const live = async (id: string) => { const a = await P.accountDocumentPayment.aggregate({ where: { documentId: id, voidedAt: null }, _sum: { amount: true, whtAmountSatang: true } }); return Number(a._sum.amount ?? 0) + Number(a._sum.whtAmountSatang ?? 0); };
  const bal = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
  const outAR = async (ids: string[]) => { let s = 0; for (const id of ids) s += accSvc.paymentOutstandingOf((await accSvc.paymentTargetOf(T, A, id)).target); return s; };
  const short = (r: Any) => (r?.ok ? `ok${r.recorded !== undefined ? `(recorded ${r.recorded})` : ""}${r.voided !== undefined ? `(voided ${r.voided})` : ""}` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 90)})`);
  const i1inv = async (ids: string[]) => { const bad: string[] = []; for (const id of ids) { const s = await st(id); const l = await live(id); if (s.paidTotal !== l) bad.push(`${id.slice(-5)} paidTotal ${s.paidTotal} ≠ Σlive ${l}`); } return bad; };
  let seq = 0;
  const payGrp = (groupId: string, tieOff: number, opts: { cheque?: { chequeNo: string; bankName: string } | null; clientKey?: string } = {}) => {
    seq += 1;
    return grp.recordGroupPayment(T, A, groupId, { paidAt: today, financeAccountId: bank.id, tieOffSatang: tieOff, note: "", feeSatang: 0, wht: [], cheque: opts.cheque === undefined ? { chequeNo: `R9B-${seq}`, bankName: "KBank", chequeDate: today } : opts.cheque ? { ...opts.cheque, chequeDate: today } : null }, { clientKey: opts.clientKey ?? `r9b${seq}_${randomBytes(3).toString("hex")}` });
  };
  const mkGroup = async (kids: string[]) => { const g = await grp.createGroupDoc(T, A, { docType: "BILLING_NOTE", contactId: cust.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] }); if (!g.ok) throw new Error(`group: ${g.reason}`); return g.id as string; };
  const batchPays = async (bk: string) => (await P.accountDocumentPayment.findMany({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${bk}#` } }, orderBy: [{ documentId: "asc" }], select: { id: true, documentId: true, chequeId: true, voidedAt: true, amount: true, channel: true } })) as Any[];

  // ── R1b: race with reasons ──
  if (on("R1b")) {
    const tally: Record<string, number> = {}; const notes: string[] = [];
    for (let k = 0; k < 8; k += 1) {
      const kids = [await inv(), await inv(), await inv()];
      const g = await mkGroup(kids);
      const ar0 = await bal("1100"); const t0 = await bal("1040");
      const ck = `r1b_${k}_${randomBytes(3).toString("hex")}`; const bk = grp.groupBatchKey(g, ck);
      let stop = false; let vr: Any = null; let when = -1;
      const delay = k % 4; // poll back-off → vary how far into the loop the void lands
      const poller = (async () => {
        while (!stop) {
          const n = await P.accountDocumentPayment.count({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${bk}#` } } });
          if (n >= 1 + Math.min(delay, 2)) {
            const p = await P.accountDocumentPayment.findFirst({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${bk}#` } }, orderBy: { createdAt: "asc" }, select: { id: true, documentId: true } });
            when = n; vr = await accSvc.voidPayment(T, A, p.documentId, p.id, "window"); return;
          }
        }
      })();
      const r = await payGrp(g, 32_100_000, { clientKey: ck });
      stop = true; await poller;
      const ps = await batchPays(bk); const cqId = ps.find((p) => p.chequeId)?.chequeId;
      const key = `pay ${short(r)} · void@${when} ${vr ? short(vr) : "none"} · cheque ${cqId ? "yes" : "no"} · linked-voided ${ps.some((p) => p.chequeId && p.voidedAt)}`;
      tally[key] = (tally[key] ?? 0) + 1;
      if (notes.length < 3) notes.push(`#${k} payments ${ps.length} live ${ps.filter((p) => !p.voidedAt).length} channels ${ps.map((p) => p.channel).join(",")} · docs ${JSON.stringify(await Promise.all(kids.map(async (x) => (await st(x)).status)))} · 1040 Δ ${(await bal("1040")) - t0} · AR Δ ${(await bal("1100")) - ar0} · cheques ${await P.accountCheque.count({ where: { systemId: A, chequeNo: { startsWith: "R9B-" } } })}`);
    }
    log(`R1b ${JSON.stringify(tally)}`);
    for (const n of notes) log(`R1b state ${n}`);
  }

  // ── R1d: deterministic replay of the window (same service calls recordGroupPayment makes, in the same order) ──
  if (on("R1d")) {
    const kids = [await inv(), await inv()];
    const g = await mkGroup(kids);
    const ar0 = await bal("1100"); const t0 = await bal("1040"); const o0 = await outAR(kids);
    const bk = grp.groupBatchKey(g, `r1d_${randomBytes(3).toString("hex")}`);
    const pids: string[] = [];
    for (const c of kids) { const r = await accSvc.recordPayment(T, A, c, { channel: "CHEQUE", financeAccountId: null, amount: 10_700_000, idempotencyKey: grp.groupChildKey(bk, c) }); pids.push(r.paymentId); }
    const v = await accSvc.voidPayment(T, A, kids[0], pids[0], "in window"); // cheque not linked yet ⇒ B2c cannot see it
    const cq = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `R1D`, bankName: "KBank", chequeDate: new Date(), amount: 21_400_000, documentId: kids[0], paymentId: pids[0] });
    const linkedTo = (await P.accountDocumentPayment.findUnique({ where: { id: pids[0] }, select: { chequeId: true, voidedAt: true } }));
    log(`R1d window replay: void child-1 before link → ${short(v)} · createCheque{paymentId: voided payment} → ${short(cq)} · linked payment voided=${!!linkedTo.voidedAt} · cheque amount 21,400,000 vs live cheque money ${(await live(kids[0])) + (await live(kids[1]))} · 1040 Δ ${(await bal("1040")) - t0}`);
    if (cq.ok) {
      const b = await cheque.bounceCheque(T, A, cq.id, "x");
      const o1 = await outAR(kids);
      log(`R1d bounce → ${short(b)} · Σ outstanding ${o1} (sub-ledger Δ ${o1 - o0}) · GL AR Δ ${(await bal("1100")) - ar0} · 1040 Δ ${(await bal("1040")) - t0} (must be 0) · I1 ${JSON.stringify(await i1inv(kids))}`);
    }
  }

  // ── H1b: bounced batch → re-sync paths ──
  if (on("H1b")) {
    const kids = [await inv(), await inv()];
    const g = await mkGroup(kids);
    const r = await payGrp(g, 21_400_000);
    const cq = (await batchPays(r.batchKey)).find((p) => p.chequeId)?.chequeId;
    await cheque.bounceCheque(T, A, cq, "x");
    const p1 = await accSvc.recordPayment(T, A, kids[0], { channel: "TRANSFER", financeAccountId: bank.id, amount: 10_700_000 });
    const h1 = await st(g);
    const v = await grp.voidGroupPayment(T, A, g, r.batchKey, "resync");
    const h2 = await st(g);
    log(`H1b after bounce: pay child 1 directly ${short(p1)} → head ${JSON.stringify(h1)} (truth PARTIAL 10,700,000) · voidGroupPayment(bounced batch) ${short(v)} → head ${JSON.stringify(h2)}`);
  }

  // ── L1: CLEARED group cheque ──
  if (on("L1")) {
    const kids = [await inv(), await inv()];
    const g = await mkGroup(kids);
    const ar0 = await bal("1100"); const bk0 = await bal("1010").catch(() => 0);
    const r = await payGrp(g, 21_400_000);
    const ps = await batchPays(r.batchKey); const cq = ps.find((p) => p.chequeId)?.chequeId; const sib = ps.find((p) => !p.chequeId);
    const d = await cheque.depositCheque(T, A, cq); const c = await cheque.clearCheque(T, A, cq);
    const ob0 = await P.outboxEvent.count({ where: { tenantId: T } }); const je0 = await P.accountJournalEntry.count({ where: { systemId: A } });
    const vs = await accSvc.voidPayment(T, A, sib.documentId, sib.id, "x");
    const vg = await grp.voidGroupPayment(T, A, g, r.batchKey, "x");
    const writes = `${(await P.outboxEvent.count({ where: { tenantId: T } })) - ob0}/${(await P.accountJournalEntry.count({ where: { systemId: A } })) - je0}`;
    const b = await cheque.bounceCheque(T, A, cq, "after clear");
    const o1 = await outAR(kids);
    const ev = await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.voided", idempotencyKey: { in: ps.map((p) => `account.payment.voided#${p.id}`) } } });
    log(`L1 deposit ${short(d)} clear ${short(c)} · voidPayment(sibling) ${short(vs)} · voidGroupPayment ${short(vg)} · writes by refusals outbox/JE ${writes} (expect 0/0) · bounce after clear ${short(b)} · docs ${JSON.stringify(await Promise.all(kids.map(st)))} · Σout ${o1} · GL AR Δ ${(await bal("1100")) - ar0} (expect 21,400,000) · payment.voided events ${ev}/2`);
  }

  // ── CN1: CN on the sibling while the cheque is live, then bounce ──
  if (on("CN1")) {
    const kids = [await inv(), await inv()];
    const g = await mkGroup(kids);
    const ar0 = await bal("1100");
    const r = await payGrp(g, 21_400_000);
    const cq = (await batchPays(r.batchKey)).find((p) => p.chequeId)?.chequeId;
    const cn = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "CREDIT_NOTE", contactId: cust.id, sourceDocId: kids[1], adjustReason: "x", vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 4_000_000 }] });
    const ci = await accSvc.issueDocument(T, A, cn.id);
    const arCn = (await bal("1100")) - ar0;
    const b = await cheque.bounceCheque(T, A, cq, "x");
    const o1 = await outAR(kids); const arD = (await bal("1100")) - ar0;
    log(`CN1 CN 4,280,000 on PAID sibling while cheque live → issue ${short(ci)} (AR Δ after CN ${arCn}) · bounce ${short(b)} · docs ${JSON.stringify(await Promise.all(kids.map(st)))} · Σout ${o1} (true 21,400,000 − 4,280,000 = 17,120,000) · GL AR Δ ${arD} · I1 ${JSON.stringify(await i1inv(kids))}`);
  }

  // ── VD1: voidDocument on a child while cheque live ──
  if (on("VD1")) {
    const kids = [await inv(), await inv()];
    const g = await mkGroup(kids);
    const r = await payGrp(g, 21_400_000);
    const cq = (await batchPays(r.batchKey)).find((p) => p.chequeId)?.chequeId;
    const v1 = await accSvc.voidDocument(T, A, kids[1], "x");
    const b = await cheque.bounceCheque(T, A, cq, "x");
    const v2 = await accSvc.voidDocument(T, A, kids[1], "x");
    log(`VD1 voidDocument(sibling) while cheque live → ${short(v1)} · after bounce ${short(b)} → voidDocument ${short(v2)} · docs ${JSON.stringify(await Promise.all(kids.map(st)))}`);
  }

  // ── E1: events once ──
  if (on("E1")) {
    const kids = [await inv(), await inv(), await inv()];
    const g = await mkGroup(kids);
    const r = await payGrp(g, 32_100_000);
    const ps = await batchPays(r.batchKey); const cq = ps.find((p) => p.chequeId)?.chequeId;
    const rs = await Promise.all([1, 2, 3].map(() => cheque.bounceCheque(T, A, cq, "x")));
    const r2 = await cheque.bounceCheque(T, A, cq, "retry");
    const ev = await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.voided", idempotencyKey: { in: ps.map((p) => `account.payment.voided#${p.id}`) } } });
    const rec = await P.outboxEvent.count({ where: { tenantId: T, type: "account.payment.recorded", idempotencyKey: { in: ps.map((p) => `account.payment.recorded#${p.id}`) } } });
    const chg = await P.outboxEvent.count({ where: { tenantId: T, type: "account.cheque.changed", idempotencyKey: `account.cheque.changed#${cq}#BOUNCED` } });
    log(`E1 3× concurrent bounce ${rs.map(short).join("|")} · retry ${short(r2)} · payment.recorded ${rec}/3 · payment.voided ${ev}/3 · cheque.changed BOUNCED ${chg}/1 · I1 ${JSON.stringify(await i1inv(kids))}`);
  }

  // ── K1: form cheque payment on child 1 + group batch → isolation both ways ──
  if (on("K1")) {
    const kids = [await inv(), await inv()];
    const g = await mkGroup(kids);
    const pay = (await import("@/lib/modules/account/payment" as string)) as Any;
    const fn = Object.keys(pay).find((k) => /^recordPayments$/.test(k));
    let formRes: Any = null;
    if (fn) formRes = await pay[fn](T, A, kids[0], [{ paidAt: today, financeAccountId: null, amountSatang: 5_000_000, whtAmountSatang: 0, whtRateBp: null, whtIncomeType: null, feeSatang: 0, note: "", cheque: { chequeNo: "FORM-1", bankName: "KBank", chequeDate: today } }], { keyBase: `kb${randomBytes(3).toString("hex")}` });
    const formPay = await P.accountDocumentPayment.findFirst({ where: { documentId: kids[0], chequeId: { not: null } }, select: { id: true, chequeId: true, idempotencyKey: true } });
    const r = await payGrp(g, 21_400_000 - 5_000_000);
    const ps = await batchPays(r.batchKey); const gcq = ps.find((p) => p.chequeId)?.chequeId;
    const b1 = await cheque.bounceCheque(T, A, gcq, "x");
    const formAfter = await P.accountDocumentPayment.findUnique({ where: { id: formPay?.id ?? "-" }, select: { voidedAt: true } });
    const b2 = await cheque.bounceCheque(T, A, formPay?.chequeId, "x");
    const psAfter = await batchPays(r.batchKey);
    log(`K1 form ${fn ?? "?"} ${short(formRes)} key=${formPay?.idempotencyKey} · group batch ${short(r)} payments ${ps.length} · bounce group cheque ${short(b1)} → form payment voided=${!!formAfter?.voidedAt} (expect false) · bounce form cheque ${short(b2)} · I1 ${JSON.stringify(await i1inv(kids))} · docs ${JSON.stringify(await Promise.all(kids.map(st)))} · batch voided ${psAfter.filter((p) => p.voidedAt).length}/${psAfter.length}`);
  }

  // ── C1: clientKey edge shapes ──
  if (on("C1")) {
    const res: string[] = [];
    const pairs: [string, string, string][] = [
      ["#→-", "a#b", "a-b"],
      ["truncate@60", `${"x".repeat(60)}1`, `${"x".repeat(60)}2`],
      ["empty", "", ""],
      ["like-wildcards", "%_", "%_"],
    ];
    for (const [name, k1, k2] of pairs) {
      const kids = [await inv(), await inv()];
      const g = await mkGroup(kids);
      const a = await payGrp(g, 10_700_000, { cheque: null, clientKey: k1 });
      const b = await payGrp(g, 10_700_000, { cheque: null, clientKey: k2 });
      const docs = await Promise.all(kids.map(st));
      res.push(`${name}: 1st ${short(a)} 2nd ${short(b)} → docs ${docs.map((d: Any) => d.status).join(",")} (2nd is a different request when keys differ; ok(recorded 0) = silently not recorded)`);
    }
    // another group reusing the same clientKey
    const g1 = await mkGroup([await inv()]); const g2 = await mkGroup([await inv()]);
    const a = await payGrp(g1, 10_700_000, { cheque: null, clientKey: "same" }); const b = await payGrp(g2, 10_700_000, { cheque: null, clientKey: "same" });
    res.push(`same clientKey on two groups: ${short(a)} / ${short(b)}`);
    for (const r of res) log(`C1 ${r}`);
  }
} catch (e) { log(`FATAL ${e instanceof Error ? e.stack : String(e)}`); }
finally {
  if (T) { const tbs = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    for (let pass = 0; pass < 4; pass += 1) for (const t of tbs) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined); await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0; for (const t of tbs) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])[0]?.n ?? 0);
    log(`CLEAN left=${left}`); }
  await prisma.$disconnect();
}
process.exit(0);
