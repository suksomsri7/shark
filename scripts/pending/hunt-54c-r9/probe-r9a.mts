// C5.4-C round-9 hunter probe A (QC2 only · throwaway tenant · deleted at the end)
//   W1  sales group cheque WITH WHT on each child → bounce: paidTotal vs Σ live (I1) · WTI certs · 1160 · AR vs sub-ledger (I2)
//   W1s same on a single invoice paid by the form path (recordPayment CHEQUE + createCheque{paymentId}) — pre-existing control
//   W2  purchase group cheque WITH WHT → voidCheque: paidTotal vs Σ live · 50-ทวิ certs
//   T1  service invoices (vatTiming ON_PAYMENT) paid by group cheque → bounce → re-collect by transfer: live auto tax invoices · 2200 / 2210
//   T1s same on a single invoice (form path) — pre-existing control
//   H1  group head (billing note) after bounce: status / paidTotal / can it be paid again?
//   X1  createCheque refused AFTER the child payments committed (bankName " ") → what is left? retry same clientKey?
//   R1  voidPayment(child 1) racing recordGroupPayment-by-cheque inside the window (payments committed, cheque not yet linked) ×10
//   R2  same clientKey submitted twice concurrently by cheque ×8 → cheques per batch
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r9/probe-r9a.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const TAG = `qc-hunt54cv-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
const log = (s: string) => console.log(s);
let T = "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const on = (k: string) => ONLY.length === 0 || ONLY.includes(k);
try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Any;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Any;
  const grp = (await import("@/lib/modules/account/group" as string)) as Any;
  const cheque = (await import("@/lib/modules/account/cheque" as string)) as Any;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Any;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id;
  const A = (await sysSvc.createSystem(T, "ACCOUNT", `acc ${TAG}`)).id as string;
  await accSvc.saveSettings(T, A, { orgName: "QC R9", taxId: "0105561000003", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: T, systemId: A });
  const cust = await accSvc.createContact({ tenantId: T, systemId: A, kind: "CUSTOMER", legalType: "COMPANY", name: `ลูกค้า ${TAG}`, taxId: "0105561111111" });
  const vend = await accSvc.createContact({ tenantId: T, systemId: A, kind: "VENDOR", legalType: "COMPANY", name: `ผู้ขาย ${TAG}`, taxId: "0105561222222" });
  const bank = await fin.createFinanceAccount({ tenantId: T, systemId: A, type: "BANK", name: `ออมทรัพย์ ${TAG}`, bankName: "กสิกรไทย" });
  if (!bank?.ok) throw new Error(`bank: ${bank?.reason}`);
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const inv = async (timing: "ON_ISSUE" | "ON_PAYMENT" = "ON_ISSUE") => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: timing, lines: [{ description: "งานบริการ", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const expDoc = async () => { const ex = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 10_000_000 }] }); const r = await exp.issueExpenseDoc(T, A, ex.id); if (!r.ok) throw new Error(`issue exp: ${r.reason}`); return ex.id as string; };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  const live = async (id: string) => { const a = await P.accountDocumentPayment.aggregate({ where: { documentId: id, voidedAt: null }, _sum: { amount: true, whtAmountSatang: true } }); return Number(a._sum.amount ?? 0) + Number(a._sum.whtAmountSatang ?? 0); };
  const bal = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
  const outAR = async (ids: string[]) => { let s = 0; for (const id of ids) s += accSvc.paymentOutstandingOf((await accSvc.paymentTargetOf(T, A, id)).target); return s; };
  const outAP = async (ids: string[]) => { let s = 0; for (const id of ids) { const d = await st(id); s += d.grandTotal - d.paidTotal; } return s; };
  const short = (r: Any) => (r?.ok ? `ok${r.recorded !== undefined ? `(recorded ${r.recorded})` : ""}` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 90)})`);
  const certsOf = async (ids: string[]) => { const ps = await P.accountDocumentPayment.findMany({ where: { documentId: { in: ids } }, select: { id: true, voidedAt: true, whtCertDocId: true } }); const certIds = ps.map((p: Any) => p.whtCertDocId).filter(Boolean); const all = await P.accountDocument.findMany({ where: { systemId: A, docType: "WHT_CERT" }, select: { id: true, status: true, sourcePaymentId: true } }).catch(() => []); return { linked: certIds.length, liveCertDocs: (await P.accountDocument.count({ where: { id: { in: certIds }, status: { notIn: ["VOIDED", "CANCELLED"] } } })), whtCertDocsInBook: all.length, liveInBook: all.filter((d: Any) => !["VOIDED", "CANCELLED"].includes(d.status)).length, voidedPaymentsWithLiveCert: ps.filter((p: Any) => p.voidedAt && p.whtCertDocId).length }; };
  const tisOf = async (ids: string[]) => { const ps = (await P.accountDocumentPayment.findMany({ where: { documentId: { in: ids } }, select: { id: true, voidedAt: true } })) as Any[]; const tis = (await P.accountDocument.findMany({ where: { systemId: A, docType: "TAX_INVOICE", sourcePaymentId: { in: ps.map((p) => p.id) } }, select: { id: true, status: true, sourcePaymentId: true, vatAmount: true } })) as Any[]; const liveT = tis.filter((t) => !["VOIDED", "CANCELLED"].includes(t.status)); return { total: tis.length, live: liveT.length, liveVat: liveT.reduce((s, t) => s + t.vatAmount, 0), liveOnVoidedPayment: liveT.filter((t) => ps.find((p) => p.id === t.sourcePaymentId)?.voidedAt).length }; };
  let seq = 0;
  const payGrp = (groupId: string, tieOff: number, opts: { cheque?: { chequeNo: string; bankName: string } | null; wht?: Any[]; clientKey?: string } = {}) => {
    seq += 1;
    return grp.recordGroupPayment(T, A, groupId, { paidAt: today, financeAccountId: bank.id, tieOffSatang: tieOff, note: "", feeSatang: 0, wht: opts.wht ?? [], cheque: opts.cheque === undefined ? { chequeNo: `R9-${seq}`, bankName: "KBank", chequeDate: today } : opts.cheque ? { ...opts.cheque, chequeDate: today } : null }, { clientKey: opts.clientKey ?? `r9k${seq}_${randomBytes(3).toString("hex")}` });
  };
  const mkGroup = async (side: "IN" | "OUT", kids: string[]) => {
    const g = await grp.createGroupDoc(T, A, { docType: side === "IN" ? "BILLING_NOTE" : "COMBINED_PAYMENT", contactId: side === "IN" ? cust.id : vend.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] });
    if (!g.ok) throw new Error(`group: ${g.reason}`); return g.id as string;
  };
  const batchPays = async (bk: string) => (await P.accountDocumentPayment.findMany({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${bk}#` } }, orderBy: [{ documentId: "asc" }], select: { id: true, documentId: true, chequeId: true, voidedAt: true, amount: true, whtAmountSatang: true } })) as Any[];
  const i1inv = async (ids: string[]) => { const bad: string[] = []; for (const id of ids) { const s = await st(id); const l = await live(id); if (s.paidTotal !== l) bad.push(`${id.slice(-5)} paidTotal ${s.paidTotal} ≠ Σlive ${l} (${s.status})`); } return bad; };

  // ── W1: sales group cheque with WHT 3 % (300,000 per child) ──
  if (on("W1")) {
    const kids = [await inv(), await inv()];
    const g = await mkGroup("IN", kids);
    const ar0 = await bal("1100"); const wht0 = await bal("1160"); const o0 = await outAR(kids);
    const r = await payGrp(g, 21_400_000, { wht: kids.map((k) => ({ childDocId: k, incomeType: "M40_2", rateBp: 300, amountSatang: 300_000 })) });
    const ps = r.ok ? await batchPays(r.batchKey) : [];
    const cq = ps.find((p) => p.chequeId)?.chequeId;
    const c0 = await certsOf(kids);
    log(`W1 pay → ${short(r)} · payments ${ps.length} (cash ${ps.map((p) => p.amount).join("+")} wht ${ps.map((p) => p.whtAmountSatang).join("+")}) · cheque amount ${cq ? (await P.accountCheque.findUnique({ where: { id: cq } })).amount : "-"} · WHT certs ${JSON.stringify(c0)} · 1160 Δ ${(await bal("1160")) - wht0}`);
    const b = await cheque.bounceCheque(T, A, cq, "x");
    const o1 = await outAR(kids); const arD = (await bal("1100")) - ar0; const c1 = await certsOf(kids);
    log(`W1 bounce → ${short(b)} · docs ${JSON.stringify(await Promise.all(kids.map(st)))} · Σlive ${JSON.stringify(await Promise.all(kids.map(live)))}`);
    log(`W1 I1 ${JSON.stringify(await i1inv(kids))} · Σ outstanding ${o1} (before pay ${o0}, true debt if payment never happened = 21400000) · GL AR Δ since before pay ${arD} (sub-ledger Δ ${o1 - o0}) · 1160 Δ ${(await bal("1160")) - wht0} (expect 0 if WHT follows the voided payment) · certs after ${JSON.stringify(c1)}`);
    // re-collect what the system says is owed, by transfer
    let rc = "";
    for (const k of kids) { const o = accSvc.paymentOutstandingOf((await accSvc.paymentTargetOf(T, A, k)).target); const rr = await accSvc.recordPayment(T, A, k, { channel: "TRANSFER", financeAccountId: bank.id, amount: o }); rc += `${o}:${short(rr)} `; }
    log(`W1 re-collect outstanding by transfer → ${rc}· docs ${JSON.stringify(await Promise.all(kids.map(st)))} · I1 ${JSON.stringify(await i1inv(kids))} · AR Δ ${(await bal("1100")) - ar0} · 1160 Δ ${(await bal("1160")) - wht0} · certs ${JSON.stringify(await certsOf(kids))}`);
  }
  if (on("W1s")) { // pre-existing control: single invoice, form path
    const k = await inv(); const ar0 = await bal("1100"); const wht0 = await bal("1160");
    const p = await accSvc.recordPayment(T, A, k, { channel: "CHEQUE", amount: 10_400_000, whtAmountSatang: 300_000, whtRateBp: 300, whtIncomeType: "M40_2" });
    const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `S${randomBytes(2).toString("hex")}`, bankName: "B", chequeDate: new Date(), amount: 10_400_000, documentId: k, paymentId: p.paymentId });
    const b = await cheque.bounceCheque(T, A, c.id, "x");
    log(`W1s single-doc form cheque + WHT: pay ${short(p)} cheque ${short(c)} bounce ${short(b)} · doc ${JSON.stringify(await st(k))} Σlive ${await live(k)} · outstanding ${await outAR([k])} · AR Δ ${(await bal("1100")) - ar0} · 1160 Δ ${(await bal("1160")) - wht0} · certs ${JSON.stringify(await certsOf([k]))}`);
  }

  // ── W2: purchase group cheque with WHT ──
  if (on("W2")) {
    const kids = [await expDoc(), await expDoc()];
    const g = await mkGroup("OUT", kids);
    const ap0 = -(await bal("2100")); const o0 = await outAP(kids); const whtp0 = await bal("2130").catch(() => 0);
    const r = await payGrp(g, 21_400_000, { wht: kids.map((k) => ({ childDocId: k, incomeType: "M40_2", rateBp: 300, amountSatang: 300_000 })) });
    const ps = r.ok ? await batchPays(r.batchKey) : [];
    const cq = ps.find((p) => p.chequeId)?.chequeId;
    const c0 = await certsOf(kids);
    const v = cq ? await cheque.voidCheque(T, A, cq, "x") : { ok: false, reason: "no cheque" };
    log(`W2 purchase pay ${short(r)} (payments ${ps.length}, wht ${ps.map((p) => p.whtAmountSatang).join("+")}, certs before ${JSON.stringify(c0)}) → voidCheque ${short(v)} · docs ${JSON.stringify(await Promise.all(kids.map(st)))} · I1 ${JSON.stringify(await i1inv(kids))} · Σ outstanding ${await outAP(kids)} (before ${o0}) · GL AP Δ ${-(await bal("2100")) - ap0} · certs after ${JSON.stringify(await certsOf(kids))}`);
  }

  // ── T1: ON_PAYMENT service invoices paid by group cheque → bounce → re-collect ──
  if (on("T1")) {
    const kids = [await inv("ON_PAYMENT"), await inv("ON_PAYMENT")];
    const g = await mkGroup("IN", kids);
    const v0 = await bal("2200"); const u0 = await bal("2210"); const ar0 = await bal("1100");
    const r = await payGrp(g, 21_400_000);
    const ps = r.ok ? await batchPays(r.batchKey) : [];
    const cq = ps.find((p) => p.chequeId)?.chequeId;
    log(`T1 group cheque pay ${short(r)} · auto TIs ${JSON.stringify(await tisOf(kids))} · 2200 Δ ${(await bal("2200")) - v0} · 2210 Δ ${(await bal("2210")) - u0}  (positive control: expect 2 live TIs, VAT 1,400,000 moved)`);
    const b = await cheque.bounceCheque(T, A, cq, "x");
    log(`T1 bounce ${short(b)} · docs ${JSON.stringify(await Promise.all(kids.map(st)))} · auto TIs ${JSON.stringify(await tisOf(kids))} (expect live 0 — money never arrived) · 2200 Δ ${(await bal("2200")) - v0} · 2210 Δ ${(await bal("2210")) - u0}`);
    let rc = "";
    for (const k of kids) { const o = accSvc.paymentOutstandingOf((await accSvc.paymentTargetOf(T, A, k)).target); const rr = await accSvc.recordPayment(T, A, k, { channel: "TRANSFER", financeAccountId: bank.id, amount: o }); rc += `${o}:${short(rr)} `; }
    const t2 = await tisOf(kids);
    log(`T1 re-collect by transfer ${rc}· auto TIs ${JSON.stringify(t2)} (expect live 2, VAT 1,400,000) · output VAT 2200 Δ ${(await bal("2200")) - v0} (expect −1,400,000 i.e. one sale's VAT) · 2210 Δ ${(await bal("2210")) - u0} (expect 0) · AR Δ ${(await bal("1100")) - ar0}`);
  }
  if (on("T1s")) {
    const k = await inv("ON_PAYMENT"); const v0 = await bal("2200"); const u0 = await bal("2210");
    const p = await accSvc.recordPayment(T, A, k, { channel: "CHEQUE", amount: 10_700_000 });
    const c = await cheque.createCheque({ tenantId: T, systemId: A, direction: "IN", chequeNo: `S${randomBytes(2).toString("hex")}`, bankName: "B", chequeDate: new Date(), amount: 10_700_000, documentId: k, paymentId: p.paymentId });
    const b = await cheque.bounceCheque(T, A, c.id, "x");
    const t1 = await tisOf([k]);
    const o = await outAR([k]); const rr = await accSvc.recordPayment(T, A, k, { channel: "TRANSFER", financeAccountId: bank.id, amount: o });
    log(`T1s single-doc form cheque (ON_PAYMENT): pay ${short(p)} cheque ${short(c)} bounce ${short(b)} → TIs ${JSON.stringify(t1)} · re-collect ${o} ${short(rr)} → TIs ${JSON.stringify(await tisOf([k]))} · 2200 Δ ${(await bal("2200")) - v0} (expect −700,000) · 2210 Δ ${(await bal("2210")) - u0} (expect 0)`);
  }

  // ── H1: group head after bounce ──
  if (on("H1")) {
    const kids = [await inv(), await inv()];
    const g = await mkGroup("IN", kids);
    const r = await payGrp(g, 21_400_000);
    const cq = (await batchPays(r.batchKey)).find((p) => p.chequeId)?.chequeId;
    const h0 = await st(g);
    const b = await cheque.bounceCheque(T, A, cq, "x");
    const h1 = await st(g); const panel = await grp.groupPanelData(T, A, g);
    const again = await payGrp(g, 21_400_000, { cheque: null });
    log(`H1 group head after pay ${JSON.stringify(h0)} → bounce ${short(b)} → head ${JSON.stringify(h1)} · panel outstanding ${panel?.outstanding} canRecord ${panel?.canRecord} · batches ${JSON.stringify(panel?.batches?.map((x: Any) => ({ ch: x.channel, voided: x.voided })))} · pay the group again by transfer → ${short(again)} · head now ${JSON.stringify(await st(g))}`);
  }

  // ── X1: createCheque refused after the child payments committed ──
  if (on("X1")) {
    const kids = [await inv(), await inv()];
    const g = await mkGroup("IN", kids);
    const ar0 = await bal("1100"); const t0 = await bal("1040"); const cq0 = await P.accountCheque.count({ where: { systemId: A } }); const ob0 = await P.outboxEvent.count({ where: { tenantId: T } });
    const ck = `x1_${randomBytes(3).toString("hex")}`;
    const r = await payGrp(g, 21_400_000, { cheque: { chequeNo: "X1-001", bankName: " " }, clientKey: ck });
    const bk = grp.groupBatchKey(g, ck);
    const ps = await batchPays(bk);
    log(`X1 group pay by cheque with bankName " " → ${short(r)} · committed payments ${ps.length} (channel CHEQUE, chequeId ${ps.map((p) => p.chequeId).join(",")}) · docs ${JSON.stringify(await Promise.all(kids.map(st)))} · cheques +${(await P.accountCheque.count({ where: { systemId: A } })) - cq0} · 1040 Δ ${(await bal("1040")) - t0} · AR Δ ${(await bal("1100")) - ar0} · outbox +${(await P.outboxEvent.count({ where: { tenantId: T } })) - ob0}`);
    const r2 = await payGrp(g, 21_400_000, { cheque: { chequeNo: "X1-001", bankName: "KBank" }, clientKey: ck });
    log(`X1 retry same clientKey with a valid bank → ${short(r2)} · cheques +${(await P.accountCheque.count({ where: { systemId: A } })) - cq0} · group head ${JSON.stringify(await st(g))} (payments exist with channel CHEQUE but no cheque in the register ⇒ 1040 has ${(await bal("1040")) - t0} that no cheque can ever clear/bounce)`);
    const r3 = await payGrp(g, 21_400_000, { cheque: { chequeNo: "X1-001", bankName: "KBank" } });
    log(`X1 retry with a NEW clientKey → ${short(r3)}`);
  }

  // ── R1: voidPayment(child) inside the recordGroupPayment window ──
  if (on("R1")) {
    const tally: Record<string, number> = {}; const bad: string[] = [];
    for (let k = 0; k < 10; k += 1) {
      const kids = [await inv(), await inv(), await inv()];
      const g = await mkGroup("IN", kids);
      const ar0 = await bal("1100"); const t0 = await bal("1040"); const o0 = await outAR(kids);
      const ck = `r1_${k}_${randomBytes(3).toString("hex")}`; const bk = grp.groupBatchKey(g, ck);
      let stop = false; let vr: Any = null; let target = "";
      const poller = (async () => {
        while (!stop) {
          const p = await P.accountDocumentPayment.findFirst({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${bk}#` } }, orderBy: { createdAt: "asc" }, select: { id: true, documentId: true } });
          if (p) { target = p.id; vr = await accSvc.voidPayment(T, A, p.documentId, p.id, "window"); return; }
        }
      })();
      const r = await payGrp(g, 32_100_000, { clientKey: ck });
      stop = true; await poller;
      const ps = await batchPays(bk); const cqId = ps.find((p) => p.chequeId)?.chequeId;
      const linkedVoided = ps.some((p) => p.chequeId && p.voidedAt);
      const key = `pay ${r.ok ? "ok" : "fail"} · void ${vr ? (vr.ok ? "ok" : "refused") : "none"} · cheque ${cqId ? "yes" : "no"} · linkedPaymentVoided ${linkedVoided}`;
      tally[key] = (tally[key] ?? 0) + 1;
      if (cqId) {
        const cqa = (await P.accountCheque.findUnique({ where: { id: cqId } })).amount;
        const liveCash = ps.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0);
        const b = await cheque.bounceCheque(T, A, cqId, "x");
        const o1 = await outAR(kids); const arD = (await bal("1100")) - ar0;
        const i1 = await i1inv(kids);
        if (arD !== o1 - o0 + 0 || i1.length || (await bal("1040")) - t0 !== 0) bad.push(`#${k} cheque ${cqa} vs live cash ${liveCash} · bounce ${short(b)} · Σout ${o1} (sub-ledger Δ ${o1 - o0}) · GL AR Δ ${arD} · 1040 Δ ${(await bal("1040")) - t0} · I1 ${JSON.stringify(i1)}`);
      }
    }
    log(`R1 window race ${JSON.stringify(tally)}`);
    log(`R1 I2 after bounce (GL AR Δ must equal sub-ledger Δ, 1040 back to 0): ${bad.length ? bad.slice(0, 4).join(" ; ") : "held"}`);
  }

  // ── R2: same clientKey twice concurrently ──
  if (on("R2")) {
    const tally: Record<string, number> = {}; const bad: string[] = [];
    for (let k = 0; k < 8; k += 1) {
      const kids = [await inv(), await inv()];
      const g = await mkGroup("IN", kids);
      const ck = `r2_${k}_${randomBytes(3).toString("hex")}`; const bk = grp.groupBatchKey(g, ck);
      const t0 = await bal("1040");
      const rs = await Promise.all([payGrp(g, 21_400_000, { clientKey: ck, cheque: { chequeNo: `R2-${k}`, bankName: "KBank" } }), payGrp(g, 21_400_000, { clientKey: ck, cheque: { chequeNo: `R2-${k}`, bankName: "KBank" } })]);
      const ps = await batchPays(bk); const cqs = new Set(ps.map((p) => p.chequeId).filter(Boolean));
      const allCheques = await P.accountCheque.count({ where: { systemId: A, chequeNo: `R2-${k}` } });
      const key = `${rs.map((x: Any) => (x.ok ? `ok${x.recorded}` : /ไม่สำเร็จ$|deadlock|Unique/i.test(String(x.reason)) ? `GENERIC(${String(x.reason).slice(0, 40)})` : `refused(${String(x.reason).slice(0, 40)})`)).join("|")} · payments ${ps.length} · cheques ${allCheques}`;
      tally[key] = (tally[key] ?? 0) + 1;
      if (ps.length !== 2 || allCheques !== 1 || cqs.size !== 1) bad.push(`#${k} payments ${ps.length} cheques ${allCheques} · 1040 Δ ${(await bal("1040")) - t0}`);
    }
    log(`R2 double submit same key ${JSON.stringify(tally)} · anomalies ${bad.length ? bad.join(" ; ") : "none"}`);
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
