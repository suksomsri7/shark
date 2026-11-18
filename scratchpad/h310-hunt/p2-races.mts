// H3.10 hunter p2 — check C: cross-ticket concurrency with held locks (deterministic start order via pg_blocking_pids)
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h310-hunt/p2-races.mts
import { type Any, setup, short, OPEN, T, MONTHS, underLock, errText } from "./common.mjs";

const S = await setup("h310-p2");
const { P, TT, V, c, rows, safe, sys, book, fin, emp, create, approve, pay, reverse, runOf, entries, PAY, OPM, FS, BK } = S;
const out = (k: string, v: unknown) => console.log(`${k} ${typeof v === "string" ? v : short(v, 900)}`);
const own = V.owner;
const PROFILE = { taxId: "0105555000013", branchNo: "000000", employerName: "บริษัท คิวซี ฮันเตอร์ จำกัด", employerAddress: "1 ถนนทดสอบ แขวงทุ่งพญาไท เขตราชเทวี กรุงเทพมหานคร 10400", deptName: "สำนักงานใหญ่", lto: false, branchType: "", rdUserId: "QCREF00000000000036", rdFormFlag: 2, ssoAccountNo: "9876543210", ssoBranchNo: "000000", ssoEncoding: "TIS620", ssoWageMode: "CLAMPED", signerName: "นายผู้ลงนาม ทดสอบ", certPrefix: "HR50" };
const PK = "2031-09";
const lockKey = (s: string) => ({ key: `hr:payroll:run:${s}:${PK}`, seed: 0 });
const ent = async (id: string) => (await entries(id)).map((e: Any) => `${e.journal}:${e.status}:${String(e.k).split("#").slice(2).join("#").replace(/:[a-z0-9]{20,}$/, "")}`);
/** HR system + own book + money account + default pay account + 1 employee (+ filing data) */
async function lane(n: string, filing = false) {
  const s = await sys(`ทีม ${n}`);
  const b = await book(n);
  await PAY.setPayrollBook(c(s), own, { accountSystemId: b });
  const f = await fin(b, n);
  await PAY.setPayrollPayAccount(c(s), own, { financeAccountId: f });
  const e = await emp(s, `${n}01`, { salary: 3_000_000, nid: "1102000123454" });
  if (filing) {
    await FS.saveFilingProfile(c(s), own, PROFILE);
    await FS.saveFilingPerson(c(s), own, { employeeId: e, title: "นาย", firstName: "เอก", lastName: "ทดสอบ" });
  }
  return { s, b, f, e };
}
const draft = async (L: Any) => (await create(L.s, PK))?.id as string;
const approved = async (L: Any) => {
  const id = await draft(L);
  const a = await approve(L.s, id);
  if (!a?.ok) out(`  setup approve ${L.s}`, a);
  return id;
};
let crashed = "";
try {
  // C1 approve ∥ reverse (approve queued first on the period lock)
  {
    const L = await lane("C1");
    const id = await draft(L);
    const r = await underLock(P, lockKey(L.s), [() => approve(L.s, id), () => reverse(L.s, id)]);
    out("C1.approve||reverse", { res: r.res, blocked: r.blocked, run: (await runOf(id))?.status, entries: await ent(id) });
  }
  // C1b reverse queued first, then approve
  {
    const L = await lane("C1b");
    const id = await draft(L);
    const r = await underLock(P, lockKey(L.s), [() => reverse(L.s, id), () => approve(L.s, id)]);
    out("C1b.reverse||approve", { res: r.res, blocked: r.blocked, run: (await runOf(id))?.status, entries: await ent(id) });
  }
  // C2 pay ∥ reverse — both orders
  {
    const L = await lane("C2");
    const id = await approved(L);
    const r = await underLock(P, lockKey(L.s), [() => pay(L.s, id, PK), () => reverse(L.s, id)]);
    out("C2.pay||reverse", { res: r.res, blocked: r.blocked, run: (await runOf(id))?.status, entries: await ent(id) });
    const L2 = await lane("C2b");
    const id2 = await approved(L2);
    const r2 = await underLock(P, lockKey(L2.s), [() => reverse(L2.s, id2), () => pay(L2.s, id2, PK)]);
    out("C2b.reverse||pay", { res: r2.res, blocked: r2.blocked, run: (await runOf(id2))?.status, entries: await ent(id2) });
  }
  // C3 50 ทวิ ∥ reverse
  const NOWJ = { now: T("2032-01-05T03:00:00Z") };
  {
    // (a) reverse queued on the period lock; bulk issue is not blocked by it → certificate first, then reverse
    const L = await lane("C3a", true);
    const id = await approved(L);
    await pay(L.s, id, PK);
    const r = await underLock(P, lockKey(L.s), [() => reverse(L.s, id), () => safe(() => FS.issueTaxCertificatesBulk(c(L.s), own, { taxYear: 2031 }, NOWJ))], [true, false]);
    const list = await safe(() => FS.listTaxCertificates(c(L.s), own, { taxYear: 2031 }));
    const cert = await rows(`SELECT "docNo", "contentJson"->'figures' AS f, "contentJson" AS j, "voidedAt" FROM "HrTaxCertificate" WHERE "systemId" = $1`, L.s);
    out("C3a.reverse||issue", { res: r.res.map((x: Any) => ({ ok: x?.ok, code: x?.code, note: x?.note, issued: x?.issued?.length, skipped: x?.skipped, stopped: x?.stopped })), blocked: r.blocked, run: (await runOf(id))?.status, entries: await ent(id) });
    out("C3a.certAfterReverse", { n: cert.length, docNo: cert[0]?.docNo, keys: Object.keys(cert[0]?.j ?? {}), list: list?.items ?? list });
    out("C3a.certJsonMoney", short(cert[0]?.j, 600));
    out("C3a.candidates", await safe(() => FS.listCertCandidates(c(L.s), own, { taxYear: 2031 })));
    // (b) issue queued on hr:ytd; reverse must not need hr:ytd → finishes first; issue then sees the reversed run
    const L2 = await lane("C3b", true);
    const id2 = await approved(L2);
    await pay(L2.s, id2, PK);
    const r2 = await underLock(P, { key: `hr:ytd:${L2.s}:2031`, seed: 0 }, [() => safe(() => FS.issueTaxCertificate(c(L2.s), own, { employeeId: L2.e, taxYear: 2031, kind: "ANNUAL" }, NOWJ)), () => reverse(L2.s, id2)], [true, false]);
    out("C3b.issue||reverse", { res: r2.res, blocked: r2.blocked, run: (await runOf(id2))?.status, certs: (await rows(`SELECT count(*)::int AS n FROM "HrTaxCertificate" WHERE "systemId" = $1`, L2.s))[0]?.n });
  }
  // C4 bank-file download ∥ reverse
  const NOWB = { now: T(MONTHS[PK]![1]) };
  {
    // (a) holder FOR SHARE on the run row: reverse queued (FOR UPDATE) first, download behind it
    const L = await lane("C4a");
    const id = await approved(L);
    const g = await safe(() => BK.generateBankFile(c(L.s), own, { runId: id, format: "CSV", presetId: "GENERIC" }, NOWB));
    const r = await underLock(P, { rowSql: `SELECT id FROM "HrPayrollRun" WHERE id = $1 FOR SHARE`, args: [id] }, [() => reverse(L.s, id), () => safe(() => BK.downloadBankFile(c(L.s), own, { fileId: g?.fileId }, NOWB))]);
    out("C4a.reverse||download", { gen: g?.ok, res: r.res.map((x: Any) => ({ ok: x?.ok, code: x?.code, note: x?.note, bytes: x?.bytes?.length })), blocked: r.blocked, run: (await runOf(id))?.status, entries: await ent(id) });
    // (b) reverse queued on the period lock, download runs through (run still APPROVED), then after release reverse; download again
    const L2 = await lane("C4b");
    const id2 = await approved(L2);
    const g2 = await safe(() => BK.generateBankFile(c(L2.s), own, { runId: id2, format: "CSV", presetId: "GENERIC" }, NOWB));
    const r2 = await underLock(P, lockKey(L2.s), [() => reverse(L2.s, id2), () => safe(() => BK.downloadBankFile(c(L2.s), own, { fileId: g2?.fileId }, NOWB))], [true, false]);
    const again = await safe(() => BK.downloadBankFile(c(L2.s), own, { fileId: g2?.fileId }, NOWB));
    out("C4b.reverse||download", { res: r2.res.map((x: Any) => ({ ok: x?.ok, code: x?.code, note: x?.note })), blocked: r2.blocked, again: { ok: again?.ok, code: again?.code }, run: (await runOf(id2))?.status });
  }
  // C5 opening save ∥ approve (approve queued on the period lock, save not blocked)
  {
    const L = await lane("C5", true);
    const id = await draft(L);
    const r = await underLock(P, lockKey(L.s), [() => approve(L.s, id), () => safe(() => OPM.saveOpeningYtd(c(L.s), own, { employeeId: L.e, taxYear: 2031, ...OPEN, expectRev: null }, { now: T("2031-09-26T05:00:00Z") }))], [true, false]);
    out("C5.approve||openingSave", { res: r.res, blocked: r.blocked, run: (await runOf(id))?.status, entries: await ent(id) });
  }
  // global: every hr-payroll key at most once per run per event, reversals ≤ 1 per original
  out("Z.dupKeys", await rows(`SELECT "idempotencyKey" AS k, count(*)::int AS n FROM "AccountJournalEntry" WHERE "tenantId" = $1 AND "idempotencyKey" IS NOT NULL GROUP BY 1 HAVING count(*) > 1`, TT));
  out("Z.dupReversals", await rows(`SELECT "reversalOfId" AS r, count(*)::int AS n FROM "AccountJournalEntry" WHERE "tenantId" = $1 AND "reversalOfId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1`, TT));
  out("Z.paidWithoutPay", await rows(`SELECT r.id FROM "HrPayrollRun" r WHERE r."tenantId" = $1 AND r.status::text = 'PAID' AND r."accountSystemId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "AccountJournalEntry" e WHERE e."idempotencyKey" = 'hr-payroll#' || r.id || '#pay')`, TT));
  out("Z.reversedWithLiveEntry", await rows(`SELECT r.id, e."idempotencyKey" AS k FROM "HrPayrollRun" r JOIN "AccountJournalEntry" e ON e."refId" = r.id AND e.status::text = 'POSTED' AND e.journal::text <> 'REVERSAL' WHERE r."tenantId" = $1 AND r.status::text = 'REVERSED'`, TT));
  out("Z.deadlockOps", await rows(`SELECT level, message, detail FROM "OpsLog" WHERE "tenantId" = $1 ORDER BY "createdAt"`, TT).catch((e: unknown) => errText(e)));
} catch (e) {
  crashed = errText(e);
  console.log(`CRASH ${crashed}`);
} finally {
  await S.cleanup();
}
process.exit(crashed ? 1 : 0);
