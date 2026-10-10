// C5.5-fix9 REVIEW round 2 probe (independent reviewer) — own throwaway tenants on QC3; CLEAN at the end.
//   P  where the erase transaction spends its time: the round-1 E fixture (2,005 links · 5,005 portal requests · 5,005 audit rows ·
//      5,005 form rows, ~25 identity rows) erased through an instrumented Prisma client (query events) — top statements by total time
//   H  merged chain direction: D ← B ← A (A merged into B, B merged into D) and an unrelated X → Y; export(B) = A+B only,
//      export(D) = A+B+D; a STAFF requester who owns B but not A receives A's rows (visibility of the chain — observation)
//   L  L2 boundary: exactly ceiling rows ⇒ not cut; ceiling + 1 ⇒ cut {ceiling, ceiling+1}
//   T  M2 seam (txTimeoutMs 1): TOO_LARGE · rollback · failed-attempt audit and OpsEvent carry no personal data · not an "erased" flag ·
//      two failures ⇒ two OpsEvent rows (logOps throttles only the e-mail) · later erase succeeds
//   A  M3: cancelRequests is tenant-scoped (other tenant's PENDING id untouched) · only PENDING rows change · > 1,000 ids ·
//      erase with 101 follow-up files answers PENDING without touching storage, the consumer step (completeErasure) finishes it;
//      100 files ⇒ inline (DONE, 100 deletes)
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf12/review/probe-cf12-review-r2.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf12-review-r2: QC3 only`);
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;

// instrumented client installed as the app singleton BEFORE `@/lib/core/db` loads (db.ts reuses globalThis.prisma outside production)
const QUERIES: { q: string; d: number }[] = [];
let RECORD = false;
{
  const { PrismaClient } = (await import("@prisma/client" as string)) as Any;
  const { PrismaPg } = (await import("@prisma/adapter-pg" as string)) as Any;
  const pc = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    transactionOptions: { timeout: 30_000, maxWait: 10_000 },
    log: [{ emit: "event", level: "query" }],
  });
  pc.$on("query", (e: Any) => {
    if (RECORD) QUERIES.push({ q: String(e.query), d: Number(e.duration) });
  });
  (globalThis as Any).prisma = pc;
}
const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf12rr-${rand}`;
const cks: { id: string; ok: boolean; finding: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string, finding = false) => {
  cks.push({ id, ok: !!ok, finding });
  console.log(`  ${ok ? "✅" : "❌"} [${id}]${finding ? " (FINDING check)" : " (control)"} ${n}\n        — ACTUAL ${actual}`);
};
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 600) : String(e));
  }
};
const j = (v: unknown) => JSON.stringify(v ?? null);
const chunks = async <X,>(rows: X[], fn: (part: X[]) => Promise<unknown>, n = 1_000) => {
  for (let i = 0; i < rows.length; i += n) await fn(rows.slice(i, i + n));
};
const TENANTS: string[] = [];
const USERS: string[] = [];
const t0 = Date.now();

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const AP = (await import("@/lib/modules/approval" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const mkTenant = async (suffix: string) => {
    const T = (await P.tenant.create({ data: { name: `${TAG}${suffix}`, slug: `${TAG}${suffix}` } })).id as string;
    TENANTS.push(T);
    return T;
  };
  const T = await mkTenant("");
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  const K = (await sysSvc.createSystem(T, "KANBAN", `${TAG} board`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  let n = 0;
  const mkContact = async (label: string, extra: Any = {}) => {
    n += 1;
    const name = `${label} ${TAG}`;
    const phone = `08${String(Date.now() % 1e6).padStart(6, "0")}${String(n).padStart(2, "0")}`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone } });
    const c = await P.crmContact.create({ data: { tenantId: T, systemId: S, name, firstName: label, partyId: party.id, ownerUserId: u.id, phone, email: `rr${n}-${rand}@qc.invalid`, ...extra } });
    return { id: c.id as string, name, phone };
  };
  const coParty = await P.party.create({ data: { tenantId: T, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
  const company = (await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: `บริษัท ${TAG}` } })).id as string;
  const board = (await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `งาน ${TAG}` } })).id as string;
  const col = (await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board, name: "ต้องทำ" } })).id as string;
  const form = (await P.formDef.create({ data: { tenantId: T, name: `ฟอร์ม ${TAG}`, publicToken: `${TAG}-form` } })).id as string;

  // ════════ P · where the erase transaction spends its time ════════
  await sub("P", async () => {
    const p = await mkContact("เวลา");
    const id = (k: string, i: number) => `${TAG}-${k}-${String(i).padStart(5, "0")}`;
    const cards = Array.from({ length: 2_000 }, (_v, i) => ({ id: id("fc", i), tenantId: T, systemId: K, boardId: board, columnId: col, title: `งานทั่วไป ${i}`, sortOrder: i }));
    await chunks(cards, (part) => P.kanbanCard.createMany({ data: part }));
    await chunks(cards, (part) => P.kanbanCardLink.createMany({ data: part.map((c) => ({ tenantId: T, systemId: K, cardId: c.id, linkType: "CRM_CONTACT", linkId: p.id, role: "RELATED" })) }));
    const reqs = Array.from({ length: 5_000 }, (_v, i) => ({ id: id("fr", i), tenantId: T, systemId: S, companyId: company, contactId: p.id, kind: "ISSUE", payload: { title: `ทั่วไป ${i}` }, approvalRequestId: `${TAG}-ap-${i}` }));
    await chunks(reqs, (part) => P.crmPortalRequest.createMany({ data: part }));
    const audits = Array.from({ length: 5_000 }, (_v, i) => ({ id: id("fa", i), tenantId: T, actorType: "USER", actorId: u.id, action: "crm.contact.update", targetType: "CrmContact", targetId: p.id, before: { note: "เดิม" }, after: { note: `ทั่วไป ${i}` } }));
    await chunks(audits, (part) => P.auditLog.createMany({ data: part }));
    const forms = Array.from({ length: 5_000 }, (_v, i) => ({ id: id("ff", i), tenantId: T, formId: form, crmContactId: p.id, answersJson: {}, pageUrl: `https://filler.qc.invalid/${i}` }));
    await chunks(forms, (part) => P.formSubmission.createMany({ data: part }));
    for (let i = 0; i < 5; i += 1) {
      const c = await P.kanbanCard.create({ data: { tenantId: T, systemId: K, boardId: board, columnId: col, title: `โทรหา ${p.name} ${i}` } });
      await P.kanbanCardLink.create({ data: { tenantId: T, systemId: K, cardId: c.id, linkType: "CRM_CONTACT", linkId: p.id, role: "RELATED" } });
      await P.auditLog.create({ data: { tenantId: T, actorType: "USER", actorId: u.id, action: "crm.contact.update", targetType: "CrmContact", targetId: p.id, after: { phone: p.phone } } });
      await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: p.id, answersJson: { name: p.name, phone: p.phone } } });
    }
    QUERIES.length = 0;
    RECORD = true;
    const ts = Date.now();
    const r = await CRM.privacy.eraseContact(ctx, owner, { contactId: p.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review r2 P)" }, { del: async () => undefined });
    const wall = Date.now() - ts;
    RECORD = false;
    const norm = (q: string) => q.replace(/\$\d+(\s*,\s*\$\d+)+/g, "$N").replace(/\s+/g, " ").slice(0, 170);
    const agg = new Map<string, { c: number; d: number }>();
    for (const x of QUERIES) {
      const k = norm(x.q);
      const a = agg.get(k) ?? { c: 0, d: 0 };
      a.c += 1;
      a.d += x.d;
      agg.set(k, a);
    }
    const sum = QUERIES.reduce((s, x) => s + x.d, 0);
    const top = [...agg.entries()].sort((a, b) => b[1].d - a[1].d).slice(0, 12);
    console.log(`        P: erase wall=${wall} ms · statements=${QUERIES.length} · sum(duration)=${Math.round(sum)} ms · erased=${r?.erased}`);
    for (const [k, a] of top) console.log(`        P:   ${String(Math.round(a.d)).padStart(6)} ms ×${String(a.c).padStart(5)}  ${k}`);
    chk("P0", "control: the E-sized fixture erases and the statement log was captured", r?.erased === true && QUERIES.length > 0, j({ wall, statements: QUERIES.length, sumMs: Math.round(sum) }));
  });

  // ════════ H · merged chain direction ════════
  await sub("H", async () => {
    const D = await mkContact("ปลายสาย");
    const B = await mkContact("กลางสาย", { mergedIntoId: D.id });
    const A = await mkContact("ต้นสาย", { mergedIntoId: B.id });
    const Y = await mkContact("อื่นปลาย");
    const X = await mkContact("อื่นต้น", { mergedIntoId: Y.id });
    for (const c of [A, B, D, X, Y]) await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: c.id, answersJson: { who: c.name } } });
    const who = (b: Any) => (b?.tables?.FormSubmission ?? []).map((f: Any) => String(f.answers?.who ?? "").split(" ")[0]).sort();
    const eB = await CRM.privacy.exportContact(ctx, owner, B.id);
    const eD = await CRM.privacy.exportContact(ctx, owner, D.id);
    chk("H1", "chain direction: export(B) = A+B (not D, not X/Y) · export(D) = A+B+D · scope.mergedContactIds matches",
      j(who(eB)) === j(["กลางสาย", "ต้นสาย"]) && j(who(eD)) === j(["กลางสาย", "ต้นสาย", "ปลายสาย"]) && j([...(eB?.scope?.mergedContactIds ?? [])].sort()) === j([A.id]) && j([...(eD?.scope?.mergedContactIds ?? [])].sort()) === j([A.id, B.id].sort()) && eD?.complete === true,
      j({ B: who(eB), D: who(eD), scopeB: eB?.scope, completeD: eD?.complete }));
    // STAFF who owns the survivor but not the absorbed contact
    const su = await P.user.create({ data: { email: `${TAG}-staff@qc.invalid`, name: `QC staff ${TAG}` } });
    USERS.push(su.id);
    const perms = { "crm.contact.export": true, "crm.contact.read": true, "crm.activity.read": true, "crm.deal.read": true };
    await P.membership.create({ data: { userId: su.id, tenantId: T, role: "STAFF", unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
    const staff = { userId: su.id, role: "STAFF", unitAccess: ["*"], permissions: perms };
    const S1 = await mkContact("รอดของพนักงาน", { ownerUserId: su.id });
    const A1 = await mkContact("ถูกรวมของเจ้าของ", { mergedIntoId: S1.id });
    await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: A1.id, answersJson: { who: A1.name } } });
    let seesA1 = false;
    try {
      await CRM.privacy.exportContact({ ...ctx, actorUserId: su.id }, staff, A1.id);
      seesA1 = true;
    } catch {
      seesA1 = false;
    }
    const eS = await CRM.privacy.exportContact({ ...ctx, actorUserId: su.id }, staff, S1.id);
    const gotA1 = who(eS).includes("ถูกรวมของเจ้าของ");
    console.log(`        H2: staff can export A1 directly = ${seesA1} · staff export of S1 includes A1's form answer = ${gotA1} · complete=${eS?.complete} scope=${j(eS?.scope)}`);
    chk("H2", "observation: staff export of the survivor includes the absorbed contact's rows (same person by merge) — recorded for the owner", true, j({ seesA1Directly: seesA1, includesA1: gotA1 }));
  });

  // ════════ L · L2 boundary ════════
  await sub("L", async () => {
    const e5 = await mkContact("ห้าแถว");
    const e6 = await mkContact("หกแถว");
    for (let i = 0; i < 5; i += 1) await P.crmScoreLog.create({ data: { tenantId: T, contactId: e5.id, points: 1, reason: `r${i}` } });
    for (let i = 0; i < 6; i += 1) await P.crmScoreLog.create({ data: { tenantId: T, contactId: e6.id, points: 1, reason: `r${i}` } });
    const b5 = await CRM.privacy.exportContact(ctx, owner, e5.id, { tableMax: 5, page: 2 });
    const b6 = await CRM.privacy.exportContact(ctx, owner, e6.id, { tableMax: 5, page: 2 });
    chk("L1", "exactly 5 rows at ceiling 5 ⇒ 5 rows, not cut, complete:true · 6 rows ⇒ 5 rows, truncated {5,6}, complete:false",
      (b5?.tables?.CrmScoreLog ?? []).length === 5 && !b5?.truncated && b5?.complete === true && (b6?.tables?.CrmScoreLog ?? []).length === 5 && j(b6?.truncated?.CrmScoreLog) === j({ exported: 5, total: 6 }) && b6?.complete === false,
      j({ five: { n: (b5?.tables?.CrmScoreLog ?? []).length, truncated: b5?.truncated ?? null, complete: b5?.complete }, six: { n: (b6?.tables?.CrmScoreLog ?? []).length, truncated: b6?.truncated, complete: b6?.complete } }));
  });

  // ════════ T · M2 seam ════════
  await sub("T", async () => {
    const reason = "ลูกค้าขอลบข้อมูล เหตุผลลับ-REASON";
    const errs: Any[] = [];
    const people = [await mkContact("หมดเวลา1"), await mkContact("หมดเวลา2")];
    for (const p of people) {
      await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: p.id, answersJson: { name: p.name, phone: p.phone } } });
      try {
        await CRM.privacy.eraseContact(ctx, owner, { contactId: p.id, confirm: true, reason }, { del: async () => undefined, txTimeoutMs: 1 });
        errs.push(null);
      } catch (e) {
        errs.push(e);
      }
    }
    const fails = (await P.auditLog.findMany({ where: { tenantId: T, action: "crm.contact.erase.failed", targetId: { in: people.map((p) => p.id) } }, select: { actorId: true, after: true } })) as Any[];
    const ops = (await P.opsEvent.findMany({ where: { tenantId: T, source: "crm.privacy", level: "ERROR" }, select: { message: true, detail: true } })) as Any[];
    const pii = (v: unknown) => people.some((p) => j(v).includes(p.name) || j(v).includes(p.phone)) || j(v).includes("REASON");
    const flagged = (await P.auditLog.count({ where: { tenantId: T, action: "crm.contact.erase", targetId: { in: people.map((p) => p.id) } } })) as number;
    const names = (await P.crmContact.findMany({ where: { id: { in: people.map((p) => p.id) } }, select: { name: true } })) as Any[];
    chk("T1", "two timed-out erases: both TOO_LARGE · 2 failed-attempt audit rows (keys systemId/source/failure/elapsedMs/timeoutMs, actor = clicker) · 2 OpsEvent ERROR rows · no name/phone/reason text in either · no erase flag · contacts intact",
      errs.every((e) => e?.code === "TOO_LARGE") && fails.length === 2 && fails.every((f) => j(Object.keys(f.after ?? {}).sort()) === j(["elapsedMs", "failure", "source", "systemId", "timeoutMs"]) && f.actorId === u.id) && ops.length === 2 && !pii(fails) && !pii(ops) && flagged === 0 && j(names.map((x: Any) => String(x.name)).sort()) === j(people.map((p) => p.name).sort()),
      j({ codes: errs.map((e) => e?.code ?? e?.name), fails: fails.length, keys: Object.keys(fails[0]?.after ?? {}), ops: ops.length, pii: pii(fails) || pii(ops), flagged, msg: String(errs[0]?.message ?? "").slice(0, 140) }));
    const r = await CRM.privacy.eraseContact(ctx, owner, { contactId: people[0]!.id, confirm: true, reason }, { del: async () => undefined });
    const failAfter = (await P.auditLog.findMany({ where: { tenantId: T, action: "crm.contact.erase.failed", targetId: people[0]!.id }, select: { after: true } })) as Any[];
    chk("T2", "control: a normal erase afterwards commits; the failed-attempt row stays (no personal data)", r?.erased === true && failAfter.length === 1 && !pii(failAfter), j({ erased: r?.erased, failAfter: failAfter.map((f) => f.after) }));
  });

  // ════════ A · M3 ════════
  await sub("A", async () => {
    const T2 = await mkTenant("-b");
    const pol1 = (await P.approvalPolicy.create({ data: { tenantId: T, name: `pol ${TAG}`, entityType: "Probe" } })).id as string;
    const pol2 = (await P.approvalPolicy.create({ data: { tenantId: T2, name: `pol ${TAG}`, entityType: "Probe" } })).id as string;
    const mk = async (tenantId: string, policyId: string, status: string, i: number) =>
      (await P.approvalRequest.create({ data: { tenantId, policyId, entityType: "Probe", entityId: `${TAG}-${i}`, status, requestedById: u.id, idempotencyKey: `${TAG}-${tenantId}-${i}` } })).id as string;
    const pend = [await mk(T, pol1, "PENDING", 1), await mk(T, pol1, "PENDING", 2)];
    const appr = await mk(T, pol1, "APPROVED", 3);
    const other = await mk(T2, pol2, "PENDING", 4);
    const bogus = Array.from({ length: 1_200 }, (_v, i) => `${TAG}-none-${i}`);
    const nCancelled = await AP.cancelRequests({ tenantId: T }, [...bogus, pend[0], pend[1], pend[0], appr, other]);
    const st = Object.fromEntries(((await P.approvalRequest.findMany({ where: { id: { in: [...pend, appr, other] } }, select: { id: true, status: true, decidedAt: true } })) as Any[]).map((r) => [r.id, r.status]));
    const again = await AP.cancelRequests({ tenantId: T }, [...pend]);
    chk("A1", "cancelRequests: 1,205 ids (1,200 unknown · a duplicate · one APPROVED · one PENDING of ANOTHER tenant) ⇒ 2 cancelled; APPROVED stays; other tenant's PENDING stays; re-run = 0",
      nCancelled === 2 && st[pend[0]!] === "CANCELLED" && st[pend[1]!] === "CANCELLED" && st[appr] === "APPROVED" && st[other] === "PENDING" && again === 0,
      j({ nCancelled, st, again }));

    const files = async (p: Any, k: number) => {
      for (let i = 0; i < k; i += 1) {
        const fa = await P.fileAsset.create({ data: { tenantId: T, kind: "ATTACHMENT", path: `t/${T}/attachment/${TAG}-${p.id.slice(-6)}-${i}.pdf`, cdnUrl: `private://${TAG}-${p.id.slice(-6)}-${i}`, contentType: "application/pdf", bytes: 10 } });
        await P.crmFileLink.create({ data: { tenantId: T, systemId: S, entityType: "CONTACT", entityId: p.id, fileId: fa.id, name: `f${i}.pdf`, size: 10, mime: "application/pdf" } });
      }
    };
    const big = await mkContact("ไฟล์มาก");
    await files(big, 101);
    const delsBig: string[] = [];
    const rb = await CRM.privacy.eraseContact(ctx, owner, { contactId: big.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review A big)" }, { del: async (p: string) => { delsBig.push(p); } });
    const evt = (await P.outboxEvent.findFirst({ where: { tenantId: T, idempotencyKey: `crm.contact.erased#${big.id}` }, select: { status: true } })) as Any;
    const leftBefore = (await P.fileAsset.count({ where: { tenantId: T, path: { contains: `${TAG}-${big.id.slice(-6)}-` } } })) as number;
    const delsC: string[] = [];
    const post = await CRM.privacy.completeErasure(T, big.id, { del: async (p: string) => { delsC.push(p); } });
    const leftAfter = (await P.fileAsset.count({ where: { tenantId: T, path: { contains: `${TAG}-${big.id.slice(-6)}-` } } })) as number;
    const post2 = await CRM.privacy.completeErasure(T, big.id, { del: async (p: string) => { delsC.push(p); } });
    chk("A2", "101 follow-up files: erase answers erased:true followUp PENDING with 0 storage calls · the outbox event is queued · the consumer step deletes all 101 · a second consumer run is a no-op",
      rb?.erased === true && rb?.followUp === "PENDING" && delsBig.length === 0 && !!evt && leftBefore === 101 && post?.files === 101 && leftAfter === 0 && delsC.length === 101 && post2?.files === 101,
      j({ erased: rb?.erased, followUp: rb?.followUp, inlineDeletes: delsBig.length, event: evt?.status, leftBefore, consumerFiles: post?.files, leftAfter, storageCalls: delsC.length, second: post2?.files }));
    const small = await mkContact("ไฟล์ร้อย");
    await files(small, 100);
    const delsS: string[] = [];
    const rs = await CRM.privacy.eraseContact(ctx, owner, { contactId: small.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review A small)" }, { del: async (p: string) => { delsS.push(p); } });
    chk("A3", "100 follow-up files: inline (followUp DONE · 100 storage calls)", rs?.erased === true && rs?.followUp === "DONE" && delsS.length === 100, j({ followUp: rs?.followUp, deletes: delsS.length }));
  });
} finally {
  RECORD = false;
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
    .map((r) => String(r.table_name))
    .filter((t) => /^[A-Za-z_]+$/.test(t));
  const left: string[] = [];
  for (const T of TENANTS) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const t of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[];
      if (Number(r?.[0]?.n ?? 0) > 0) left.push(`${t}=${r[0].n}`);
    }
  }
  for (const uid of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  if (TENANTS.length) chk("CLEAN", "throwaway tenants, users and every tenant row removed (0 rows left)", left.length === 0 && (await P.tenant.count({ where: { id: { in: TENANTS } } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, left.join(" · ") || "-");
  await prisma.$disconnect();
}
const controls = cks.filter((c) => !c.finding);
console.log(`\n(${Math.round((Date.now() - t0) / 1000)} s) controls ${controls.filter((c) => c.ok).length}/${controls.length} green`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]) })}`);
process.exit(controls.every((c) => c.ok) ? 0 : 1);
