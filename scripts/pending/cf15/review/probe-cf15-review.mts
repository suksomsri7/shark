// C5.5-fix11 REVIEW (tip only) — own throwaway tenant on QC3; CLEAN at the end.
//   D  statement size: a RETENTION erase (bodies masked, not cleared) of a lead with 25 mails × (1,000,000-char HTML + 1,000,000-char text)
//      ⇒ one UPDATE … FROM unnest carries ≈ 50 MB of array parameters — does it go through the pooled Neon connection, how long?
//   X  a real expired transaction (prisma.$transaction timeout 50 ms, work 300 ms): code / message / meta as the classifier sees them
//   W  R2-4 resweep: first erase with a failing storage stub (follow-up PENDING, 3 files left) · re-erase with a working stub deletes
//      the 3 · a third re-erase makes 0 storage calls · approvals recorded in the follow-up are cancelled at most once
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf15/review/probe-cf15-review.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

if (!/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error("QC3 only");
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;
const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf15r-${rand}`;
const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string) => {
  cks.push({ id, ok: !!ok });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}\n        — ACTUAL ${actual}`);
};
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 600) : String(e));
  }
};
const j = (v: unknown) => JSON.stringify(v ?? null);
let T = "";
const USERS: string[] = [];
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const shared = (await import("@/lib/modules/crm/privacy-shared" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  let n = 0;
  const mkContact = async (label: string) => {
    n += 1;
    const name = `${label} ${TAG}`;
    const phone = `0870${String(Date.now() % 1e5).padStart(5, "0")}${n}`;
    const email = `r${n}-${rand}@qc.invalid`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone, email } });
    const c = await P.crmContact.create({ data: { tenantId: T, systemId: S, name, firstName: label, partyId: party.id, ownerUserId: u.id, phone, email } });
    return { id: c.id as string, name, phone, email };
  };

  // ════════ D · one big statement ════════
  await sub("D", async () => {
    const L = await mkContact("ใหญ่");
    const N = 25;
    const big = (k: string) => `${L.name} ${L.phone} ` + k.repeat(1_000_000 - L.name.length - L.phone.length - 2);
    for (let i = 0; i < N; i += 1) {
      await P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, contactId: L.id, direction: "IN", status: "RECEIVED", messageId: `<${TAG}-big-${i}@probe>`, threadKey: `${TAG}-big-${i}`, trackTokenHash: `${TAG}-bigt-${i}`, fromAddr: L.email, toAddrs: ["crm@shark.in.th"], subject: `ใหญ่ ${i}`, bodyHtml: big("h"), bodyText: big("t") } });
    }
    const ts = Date.now();
    let err: Any = null;
    let r: Any = null;
    try {
      r = await CRM.privacy.eraseContact(ctx, null, { contactId: L.id, confirm: true, reason: "lead ครบอายุเก็บข้อมูล (review D)", source: "RETENTION" }, { del: async () => undefined });
    } catch (e) {
      err = e;
    }
    const ms = Date.now() - ts;
    const rows = (await P.$queryRawUnsafe(`SELECT length("bodyHtml") AS h, length("bodyText") AS t, strpos("bodyHtml", $2) AS leak FROM "CrmEmailMessage" WHERE "tenantId" = $1 AND "contactId" = $3`, T, L.phone, L.id)) as Any[];
    console.log(`        D: ${N} mails × 2 × 1,000,000 chars · erase ${ms} ms · error=${err ? `${err.name} ${err.code ?? ""} ${String(err.message).replace(/\s+/g, " ").slice(0, 200)}` : "none"}`);
    chk("D1", `RETENTION erase writing ${N} × 2 MB of masked bodies in one statement per column page succeeds (bodies masked, length kept)`, r?.erased === true && rows.length === N && rows.every((x) => Number(x.leak) === 0 && Number(x.h) > 999_000), j({ erased: r?.erased, ms, rows: rows.length, leaks: rows.filter((x) => Number(x.leak) > 0).length, err: err?.code ?? err?.name ?? null }));
  });

  // ════════ X · a real expired transaction as the classifier sees it ════════
  await sub("X", async () => {
    let err: Any = null;
    try {
      await P.$transaction(async (tx: Any) => {
        await new Promise((res) => setTimeout(res, 300));
        await tx.$queryRawUnsafe("SELECT 1");
      }, { timeout: 50, maxWait: 5_000 });
    } catch (e) {
      err = e;
    }
    console.log(`        X: name=${err?.name} code=${err?.code} meta=${j(err?.meta)} msg=${String(err?.message ?? "").replace(/\s+/g, " ").slice(0, 220)}`);
    chk("X1", "a real expiry is classified as expired (P2028 + 'expired transaction' wording of the installed Prisma)", shared.isExpiredTransactionError(err) === true, j({ code: err?.code, meta: err?.meta ?? null }));
    let err2: Any = null;
    try {
      await P.$transaction(async () => {
        throw new Error("Transaction already closed: plain error that is not Prisma's");
      });
    } catch (e) {
      err2 = e;
    }
    chk("X2", "a non-Prisma error whose text mentions transactions is NOT classified as expired", shared.isExpiredTransactionError(err2) === false, j({ name: err2?.name }));
  });

  // ════════ W · resweep finishes the recorded follow-up ════════
  await sub("W", async () => {
    const F = await mkContact("ไฟล์ค้าง");
    const pol = (await P.approvalPolicy.create({ data: { tenantId: T, name: `pol ${TAG}`, entityType: "Probe" } })).id as string;
    const co = await P.party.create({ data: { tenantId: T, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
    const company = (await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: co.id, name: `บริษัท ${TAG}` } })).id as string;
    const ap = (await P.approvalRequest.create({ data: { tenantId: T, policyId: pol, entityType: "Probe", entityId: `${TAG}-x`, requestedById: u.id, idempotencyKey: `${TAG}-ap` } })).id as string;
    await P.crmPortalRequest.create({ data: { tenantId: T, systemId: S, companyId: company, contactId: F.id, kind: "ISSUE", payload: { t: 1 }, approvalRequestId: ap } });
    for (let i = 0; i < 3; i += 1) {
      const fa = await P.fileAsset.create({ data: { tenantId: T, kind: "ATTACHMENT", path: `t/${T}/attachment/${TAG}-w${i}.pdf`, cdnUrl: `private://${TAG}-w${i}`, contentType: "application/pdf", bytes: 10 } });
      await P.crmFileLink.create({ data: { tenantId: T, systemId: S, entityType: "CONTACT", entityId: F.id, fileId: fa.id, name: `w${i}.pdf`, size: 10, mime: "application/pdf" } });
    }
    const left = async () => (await P.fileAsset.count({ where: { tenantId: T, path: { contains: `${TAG}-w` } } })) as number;
    const r1 = await CRM.privacy.eraseContact(ctx, owner, { contactId: F.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review W1)" }, { del: async () => { throw new Error("storage down"); } });
    const l1 = await left();
    const apSt1 = (await P.approvalRequest.findUnique({ where: { id: ap }, select: { status: true, decidedAt: true } })) as Any;
    // someone approves/decides nothing; re-erase with storage back
    const calls2: string[] = [];
    const r2 = await CRM.privacy.eraseContact(ctx, owner, { contactId: F.id, confirm: true, reason: "ลบซ้ำ (review W2)" }, { del: async (p: string) => { calls2.push(p); } });
    const l2 = await left();
    const apSt2 = (await P.approvalRequest.findUnique({ where: { id: ap }, select: { status: true, decidedAt: true } })) as Any;
    const calls3: string[] = [];
    const r3 = await CRM.privacy.eraseContact(ctx, owner, { contactId: F.id, confirm: true, reason: "ลบซ้ำ (review W3)" }, { del: async (p: string) => { calls3.push(p); } });
    chk("W1", "erase with storage down ⇒ erased:true · followUp PENDING · 3 files left; re-erase ⇒ erased:false · followUp DONE · 3 storage calls · 0 left; third re-erase ⇒ DONE · 0 calls; the approval was cancelled once and its decidedAt did not move",
      r1?.erased === true && r1?.followUp === "PENDING" && l1 === 3 && r2?.erased === false && r2?.followUp === "DONE" && calls2.length === 3 && l2 === 0 && r3?.followUp === "DONE" && calls3.length === 0 && apSt1?.status === "CANCELLED" && String(apSt1?.decidedAt) === String(apSt2?.decidedAt),
      j({ r1: [r1?.erased, r1?.followUp], l1, r2: [r2?.erased, r2?.followUp], calls2: calls2.length, l2, r3: r3?.followUp, calls3: calls3.length, ap: [apSt1?.status, apSt2?.status, String(apSt1?.decidedAt) === String(apSt2?.decidedAt)] }));
  });
} finally {
  if (T) {
    const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((x) => String(x.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    let left = 0;
    for (const t of tables) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])?.[0]?.n ?? 0);
    for (const uid of USERS) {
      await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
      await P.user.delete({ where: { id: uid } }).catch(() => undefined);
    }
    chk("CLEAN", "tenant + user + every tenant row removed", left === 0 && (await P.tenant.count({ where: { id: T } })) === 0, `left=${left}`);
  }
  await prisma.$disconnect();
}
console.log(`\ncontrols ${cks.filter((c) => c.ok).length}/${cks.length} green`);
console.log(`JSON_SUMMARY ${JSON.stringify(cks.map((c) => [c.id, c.ok]))}`);
process.exit(cks.every((c) => c.ok) ? 0 : 1);
