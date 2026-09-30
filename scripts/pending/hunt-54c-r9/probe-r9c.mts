// C5.4-C round-9 hunter probe C (QC2 only · throwaway tenant · deleted at the end)
//   R1c  voidPayment(first child) racing recordGroupPayment-by-cheque, END TO END: race → (cheque linked to a voided payment?) → bounce → I1/I2/1040
//        + the raw error behind the generic "บันทึกชำระไม่สำเร็จ" (prisma.$transaction wrapped in-process, no src change)
//   R1p  same race on the purchase side (voidVendorPayment ∥ recordGroupPayment COMBINED_PAYMENT by cheque) → voidCheque → AP/2300
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54c-r9/probe-r9c.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { randomBytes } from "node:crypto";
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = accEnv.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !/ep-cool-shadow/.test(String(process.env.DATABASE_URL ?? ""))) { console.log(`QC2 only — got ${host}`); process.exit(1); }
globalThis.fetch = (async () => { throw new Error("network blocked"); }) as typeof fetch;
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rawErrors: string[] = [];
const origTx = P.$transaction.bind(P);
P.$transaction = async (...a: Any[]) => { try { return await origTx(...a); } catch (e) { const m = String((e as Any)?.code ?? "") + " " + String((e as Any)?.message ?? e).replace(/\s+/g, " ").slice(0, 220); if (!/[ก-๙]/.test(m.slice(0, 40)) || /deadlock|40P01|P20/.test(m)) rawErrors.push(m); throw e; } };
const TAG = `qc-hunt54cx-${randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!)}`;
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
  const inv = async () => { const d = await accSvc.createDocument({ tenantId: T, systemId: A, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", vatTiming: "ON_ISSUE", lines: [{ description: "งาน", qty: 1, unitPrice: 10_000_000 }] }); const r = await accSvc.issueDocument(T, A, d.id); if (!r.ok) throw new Error(r.reason); return d.id as string; };
  const expDoc = async () => { const ex = await exp.createExpenseDoc({ tenantId: T, systemId: A, docType: "EXPENSE", contactId: vend.id, vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 10_000_000 }] }); const r = await exp.issueExpenseDoc(T, A, ex.id); if (!r.ok) throw new Error(`issue exp: ${r.reason}`); return ex.id as string; };
  const st = async (id: string) => (await P.accountDocument.findUnique({ where: { id }, select: { status: true, paidTotal: true, grandTotal: true } })) as Any;
  const live = async (id: string) => { const a = await P.accountDocumentPayment.aggregate({ where: { documentId: id, voidedAt: null }, _sum: { amount: true, whtAmountSatang: true } }); return Number(a._sum.amount ?? 0) + Number(a._sum.whtAmountSatang ?? 0); };
  const bal = async (code: string) => Number(((await P.$queryRawUnsafe(`SELECT COALESCE(sum(l."debit" - l."credit"),0)::bigint AS n FROM "AccountJournalLine" l JOIN "AccountJournalEntry" e ON e."id" = l."entryId" JOIN "AccountLedger" a ON a."id" = l."accountId" WHERE e."systemId" = $1 AND a."code" = $2`, A, code)) as Any[])[0]?.n);
  const outOf = async (side: "IN" | "OUT", ids: string[]) => { let s = 0; for (const id of ids) { if (side === "IN") s += accSvc.paymentOutstandingOf((await accSvc.paymentTargetOf(T, A, id)).target); else { const d = await st(id); s += d.grandTotal - d.paidTotal; } } return s; };
  const short = (r: Any) => (r?.ok ? `ok${r.recorded !== undefined ? `(recorded ${r.recorded})` : ""}` : `FAIL(${String(r?.reason ?? r).replace(/\s+/g, " ").slice(0, 70)})`);
  const i1inv = async (ids: string[]) => { const bad: string[] = []; for (const id of ids) { const s = await st(id); const l = await live(id); if (s.paidTotal !== l) bad.push(`${id.slice(-5)} paidTotal ${s.paidTotal} ≠ Σlive ${l}`); } return bad; };
  const batchPays = async (bk: string) => (await P.accountDocumentPayment.findMany({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${bk}#` } }, orderBy: [{ documentId: "asc" }], select: { id: true, documentId: true, chequeId: true, voidedAt: true, amount: true } })) as Any[];

  for (const side of ["IN", "OUT"] as const) {
    if (!on(side === "IN" ? "R1c" : "R1p")) continue;
    const name = side === "IN" ? "R1c" : "R1p";
    const ctl = side === "IN" ? "1100" : "2100"; const transit = side === "IN" ? "1040" : "2300";
    const tally: Record<string, number> = {}; const broken: string[] = []; let brokenN = 0; let linkedVoidedN = 0;
    rawErrors.length = 0;
    for (let k = 0; k < 12; k += 1) {
      const kids = side === "IN" ? [await inv(), await inv(), await inv()] : [await expDoc(), await expDoc(), await expDoc()];
      const g0 = await grp.createGroupDoc(T, A, { docType: side === "IN" ? "BILLING_NOTE" : "COMBINED_PAYMENT", contactId: side === "IN" ? cust.id : vend.id, issueDate: today, dueDate: null, note: null, childIds: kids, createdById: null, source: "MANUAL", tags: [] });
      if (!g0.ok) throw new Error(`group: ${g0.reason}`);
      const g = g0.id as string;
      const c0 = await bal(ctl); const t0 = await bal(transit); const o0 = await outOf(side, kids);
      const ck = `${name}_${k}_${randomBytes(3).toString("hex")}`; const bk = grp.groupBatchKey(g, ck);
      let stop = false; let vr: Any = null;
      const need = 3; // void child 1 once all 3 child payments are committed (= the window just before createCheque links child 1)
      const poller = (async () => {
        while (!stop) {
          const n = await P.accountDocumentPayment.count({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${bk}#` } } });
          if (n >= need) {
            const p = await P.accountDocumentPayment.findFirst({ where: { tenantId: T, systemId: A, idempotencyKey: { startsWith: `${bk}#` } }, orderBy: { createdAt: "asc" }, select: { id: true, documentId: true } });
            vr = side === "IN" ? await accSvc.voidPayment(T, A, p.documentId, p.id, "window") : await exp.voidVendorPayment(T, A, p.documentId, p.id, "window"); return;
          }
        }
      })();
      const r = await grp.recordGroupPayment(T, A, g, { paidAt: today, financeAccountId: bank.id, tieOffSatang: 32_100_000, note: "", feeSatang: 0, wht: [], cheque: { chequeNo: `${name}-${k}`, bankName: "KBank", chequeDate: today } }, { clientKey: ck });
      stop = true; await poller;
      const ps = await batchPays(bk); const cq = ps.find((p) => p.chequeId)?.chequeId;
      const linkedVoided = ps.some((p) => p.chequeId && p.voidedAt);
      if (linkedVoided) linkedVoidedN += 1;
      const key = `pay ${short(r)} · void ${vr ? short(vr) : "none"} · cheque ${cq ? "yes" : "no"} · linked-voided ${linkedVoided}`;
      tally[key] = (tally[key] ?? 0) + 1;
      if (cq) {
        const u = side === "IN" ? await cheque.bounceCheque(T, A, cq, "x") : await cheque.voidCheque(T, A, cq, "x");
        const o1 = await outOf(side, kids); const cD = side === "IN" ? (await bal(ctl)) - c0 : -((await bal(ctl)) - c0); const tD = (await bal(transit)) - t0;
        const i1 = await i1inv(kids);
        if (cD !== o1 - o0 || tD !== 0 || i1.length) { brokenN += 1; if (broken.length < 3) broken.push(`#${k} ${side === "IN" ? "bounce" : "voidCheque"} ${short(u)} · sub-ledger Δ ${o1 - o0} vs GL ${side === "IN" ? "AR" : "AP"} Δ ${cD} · ${transit} Δ ${tD} (must be 0) · I1 ${JSON.stringify(i1)}`); }
      }
    }
    log(`${name} race tally ${JSON.stringify(tally)}`);
    log(`${name} cheque linked to a voided payment in ${linkedVoidedN}/12 · after ${side === "IN" ? "bounce" : "voidCheque"} I2/1040 broken in ${brokenN}: ${broken.join(" ; ") || "none"}`);
    log(`${name} raw errors behind generic failures (${rawErrors.length}): ${[...new Set(rawErrors)].slice(0, 4).join(" ‖ ") || "none"}`);
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
