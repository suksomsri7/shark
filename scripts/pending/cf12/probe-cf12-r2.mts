// C5.5-fix9 round 2 probe (review M1 · M2 · M3 · L2 · I2) — own throwaway tenant on QC3; CLEAN at the end.
//   V  M1(a) person export by a requester whose visibility hides rows: file + audit say so (complete:false · scope.limitedByRequesterVisibility)
//   C  M1(b) person export covers the merged chain like the erase does (A merged into B ⇒ export(B) holds A's form answers / score logs)
//   T  M2   erase that runs past the transaction limit: specific error (TOO_LARGE) · OpsEvent ERROR · failed-attempt audit without personal data ·
//           retry erases (the limit is shortened through deps.txTimeoutMs — tests only)
//   A  M3   post-commit approval cancels are bulk (1,500 ids quickly · idempotent) · erase with 1,203 approval ids answers quickly · consumer completes
//   L  L2   a table cut at the ceiling stays marked even when rows vanish between paging and the count (test seam `beforeCount`)
//   I  I2   the UI warning no longer promises "contact the SHARK team for the rest"
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf12/probe-cf12-r2.mts
// "FINDING" checks assert the fixed behaviour (expected RED on 268c7716); controls must be GREEN on both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf12-r2: QC3 only (host=${host})`);
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("probe-cf12-r2: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf12r2-${rand}`;
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
const USERS: string[] = [];
const t0 = Date.now();

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const PORTAL = (await import("@/lib/modules/crm/portal" as string)) as Any;
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
  const deps = { del: async () => undefined };
  let phoneN = 0;
  const mkContact = async (label: string, extra: Record<string, unknown> = {}) => {
    const name = `${label} ${TAG}`;
    const phone = `09${String(Date.now() % 1e6).padStart(6, "0")}${String(++phoneN).padStart(2, "0")}`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone } });
    const c = await P.crmContact.create({ data: { tenantId: T, systemId: S, name, firstName: label, partyId: party.id, ownerUserId: u.id, phone, ...extra } });
    return { id: c.id as string, name, phone };
  };
  const form = (await P.formDef.create({ data: { tenantId: T, name: `ฟอร์ม ${TAG}`, publicToken: `${TAG}-form` } })).id as string;

  // ════════ V · M1(a) requester visibility ════════
  await sub("V", async () => {
    const su = await P.user.create({ data: { email: `${TAG}-staff@qc.invalid`, name: `QC staff ${TAG}` } });
    USERS.push(su.id);
    const perms = { "crm.contact.export": true, "crm.contact.read": true, "crm.activity.read": true, "crm.deal.read": true };
    await P.membership.create({ data: { userId: su.id, tenantId: T, role: "STAFF", unitAccess: ["*"], permissions: perms, acceptedAt: new Date() } });
    const staff = { userId: su.id, role: "STAFF", unitAccess: ["*"], permissions: perms };
    const V = await mkContact("มองเห็น");
    await P.crmContact.update({ where: { id: V.id }, data: { ownerUserId: su.id } });
    for (let i = 0; i < 3; i += 1) await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: V.id, type: "CALL", title: `โทรโดยเจ้าของ ${i}`, ownerUserId: u.id } });
    for (let i = 0; i < 2; i += 1) await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: V.id, type: "CALL", title: `โทรโดยพนักงาน ${i}`, ownerUserId: su.id } });
    const bo = await CRM.privacy.exportContact(ctx, owner, V.id);
    chk("V1", "control: the owner's export of the same contact holds 5 activities and says complete:true (no visibility limit)", (bo?.tables?.CrmActivity ?? []).length === 5 && bo?.complete === true && !bo?.scope?.limitedByRequesterVisibility, j({ acts: (bo?.tables?.CrmActivity ?? []).length, complete: bo?.complete, scope: bo?.scope ?? null }));
    const bs = await CRM.privacy.exportContact({ ...ctx, actorUserId: su.id }, staff, V.id);
    const ns = (bs?.tables?.CrmActivity ?? []).length;
    chk("V2", "FINDING: the STAFF export (2 of 5 activities visible) says complete:false + scope.limitedByRequesterVisibility:true + withheldTables ⊇ CrmActivity (no withheld counts or rows in the file)",
      ns === 2 && bs?.complete === false && bs?.scope?.limitedByRequesterVisibility === true && (bs?.scope?.withheldTables ?? []).includes("CrmActivity") && !j(bs).includes("โทรโดยเจ้าของ"),
      j({ acts: ns, complete: bs?.complete, scope: bs?.scope ?? null }), true);
    const a = (await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.contact.export.person", targetId: V.id, actorId: su.id }, select: { after: true } })) as Any;
    chk("V3", "FINDING: the audit row of the STAFF export records complete:false and the withheld count per table (CrmActivity 3)", a?.after?.complete === false && a?.after?.withheld?.CrmActivity === 3, j(a?.after ?? null), true);
  });

  // ════════ C · M1(b) merged chain ════════
  await sub("C", async () => {
    const B = await mkContact("ผู้รอด");
    const A = await mkContact("ถูกรวม", { mergedIntoId: B.id, archivedAt: new Date() });
    for (const c of [A, B]) {
      for (let i = 0; i < 2; i += 1) {
        await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: c.id, answersJson: { name: c.name, i } } });
        await P.crmScoreLog.create({ data: { tenantId: T, contactId: c.id, points: 1, reason: `${c.name} ${i}` } });
      }
      await P.crmContactConsent.create({ data: { tenantId: T, systemId: S, contactId: c.id, channel: "EMAIL", granted: true, source: "FORM" } });
    }
    const b = await CRM.privacy.exportContact(ctx, owner, B.id);
    const forms = (b?.tables?.FormSubmission ?? []).length;
    const scores = (b?.tables?.CrmScoreLog ?? []).length;
    const consents = (b?.tables?.CrmContactConsent ?? []).length;
    chk("C1", "FINDING: export(B) covers the merged chain like the erase: FormSubmission 4/4 · CrmScoreLog 4/4 · consents 2/2 · scope.mergedContactIds = [A] · complete:true (owner)",
      forms === 4 && scores === 4 && consents === 2 && j(b?.scope?.mergedContactIds) === j([A.id]) && b?.complete === true, j({ forms, scores, consents, complete: b?.complete, scope: b?.scope ?? null }), true);
  });

  // ════════ T · M2 erase over the transaction limit ════════
  await sub("T", async () => {
    const L = await mkContact("ล็อก");
    const reason = `ลูกค้าขอลบข้อมูล ${L.phone} (probe r2)`;
    const fs = (await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: L.id, answersJson: { name: L.name, phone: L.phone } } })).id as string;
    const holder = P.$transaction(
      async (tx: Any) => {
        await tx.$queryRawUnsafe(`SELECT "id" FROM "CrmContact" WHERE "id" = $1 FOR UPDATE`, L.id);
        await sleep(8_000);
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    await sleep(1_000);
    const ts = Date.now();
    let err: Any = null;
    let res: Any = null;
    try {
      res = await CRM.privacy.eraseContact(ctx, owner, { contactId: L.id, confirm: true, reason }, { ...deps, txTimeoutMs: 3_000 });
    } catch (e) {
      err = e;
    }
    const took = Date.now() - ts;
    await holder.catch(() => undefined);
    console.log(`        (erase returned after ${took} ms · error=${err ? `${err.name} ${err.code ?? ""}` : "none"})`);
    chk("T1", "FINDING: the erase that runs past the transaction limit throws PrivacyError TOO_LARGE with a Thai message (too large for one step · team notified), nothing erased",
      !res && err?.name === "PrivacyError" && err?.code === "TOO_LARGE" && /ทีมงาน/.test(String(err?.message)) && !(await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.contact.erase", targetId: L.id } })) && j((await P.formSubmission.findUnique({ where: { id: fs } }))?.answersJson).includes(L.phone),
      j({ res: res ? { erased: res.erased } : null, name: err?.name, code: err?.code, msg: String(err?.message ?? "").slice(0, 200) }), true);
    const ops = (await P.opsEvent.findMany({ where: { tenantId: T, source: "crm.privacy", level: "ERROR" }, select: { message: true, detail: true } })) as Any[];
    chk("T2", "FINDING: an OpsEvent ERROR (crm.privacy) names the contact id and carries no name/phone",
      ops.length === 1 && String(ops[0]?.detail ?? "").includes(L.id) && !j(ops).includes(L.phone) && !j(ops).includes(L.name), j(ops), true);
    const fa = (await P.auditLog.findMany({ where: { tenantId: T, action: "crm.contact.erase.failed", targetId: L.id }, select: { actorId: true, after: true } })) as Any[];
    chk("T3", "FINDING: one audit row crm.contact.erase.failed (actor = clicker · reason TIMEOUT) without personal data (no name/phone/reason text)",
      fa.length === 1 && fa[0]?.actorId === u.id && fa[0]?.after?.failure === "TIMEOUT" && !j(fa).includes(L.phone) && !j(fa).includes(L.name), j(fa), true);
    const r2 = await CRM.privacy.eraseContact(ctx, owner, { contactId: L.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe r2 retry)" }, deps);
    const erasedNow = !!(await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.contact.erase", targetId: L.id } }));
    chk("T4", "control: after the retry (no lock, normal limit) the contact is erased (erase audit row exists)", erasedNow, j({ retryErased: r2?.erased, erasedNow }));
  });

  // ════════ A · M3 approval cancels ════════
  await sub("A", async () => {
    const pol = (await P.approvalPolicy.create({ data: { tenantId: T, name: `pol ${TAG}`, entityType: "crm.portal.request" } })).id as string;
    const mkAp = async (i: number) => (await P.approvalRequest.create({ data: { tenantId: T, policyId: pol, entityType: "crm.portal.request", entityId: `${TAG}-e${i}`, requestedById: u.id, idempotencyKey: `${TAG}-ap-${i}` } })).id as string;
    const real = [await mkAp(1), await mkAp(2), await mkAp(3)];
    const fake = Array.from({ length: 1_497 }, (_v, i) => `${TAG}-noap-${i}`);
    const ts = Date.now();
    const n1 = await PORTAL.cancelErasedApprovals(T, [...fake, ...real]);
    const took = Date.now() - ts;
    const st = ((await P.approvalRequest.findMany({ where: { id: { in: real } }, select: { status: true } })) as Any[]).map((r) => r.status);
    chk("A1", "FINDING: cancelErasedApprovals over 1,500 ids (3 real PENDING) finishes in < 8 s, returns 3, the 3 are CANCELLED", n1 === 3 && took < 8_000 && st.every((s) => s === "CANCELLED"), j({ n1, took, st }), true);
    const n2 = await PORTAL.cancelErasedApprovals(T, [...fake, ...real]);
    chk("A2", "control: a second run (retry/redelivery) cancels nothing more (idempotent)", n2 === 0, j({ n2 }));

    const pr = await mkContact("พอร์ทัล");
    const coParty = await P.party.create({ data: { tenantId: T, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
    const company = (await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: `บริษัท ${TAG}` } })).id as string;
    const realB = [await mkAp(11), await mkAp(12), await mkAp(13)];
    const rows = [
      ...Array.from({ length: 1_200 }, (_v, i) => ({ tenantId: T, systemId: S, companyId: company, contactId: pr.id, kind: "ISSUE", payload: { i }, approvalRequestId: `${TAG}-nob-${i}` })),
      ...realB.map((id, i) => ({ tenantId: T, systemId: S, companyId: company, contactId: pr.id, kind: "ISSUE", payload: { r: i }, approvalRequestId: id })),
    ];
    for (let i = 0; i < rows.length; i += 1_000) await P.crmPortalRequest.createMany({ data: rows.slice(i, i + 1_000) });
    const te = Date.now();
    const r = await CRM.privacy.eraseContact(ctx, owner, { contactId: pr.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe r2 approvals)" }, deps);
    const tookE = Date.now() - te;
    chk("A3", "FINDING: the erase with 1,203 approval ids in its follow-up answers erased:true within 20 s", r?.erased === true && tookE < 20_000, j({ erased: r?.erased, followUp: r?.followUp, tookE }), true);
    await CRM.privacy.onContactErased({ tenantId: T, payload: { contactId: pr.id } });
    const stB = ((await P.approvalRequest.findMany({ where: { id: { in: realB } }, select: { status: true } })) as Any[]).map((x) => x.status);
    chk("A4", "control: after the erase (+ the crm.contact.erased consumer run) the 3 real approvals are CANCELLED", stB.every((s) => s === "CANCELLED"), j(stB));
  });

  // ════════ L · L2 marker survives rows vanishing before the count ════════
  await sub("L", async () => {
    const k = await mkContact("นับหาย");
    await P.crmScoreLog.createMany({ data: Array.from({ length: 12 }, (_v, i) => ({ tenantId: T, contactId: k.id, points: 1, reason: `r ${i}` })) });
    let hooked = 0;
    const b = await CRM.privacy.exportContact(ctx, owner, k.id, {
      tableMax: 10,
      page: 4,
      beforeCount: async (table: string) => {
        if (table !== "CrmScoreLog") return;
        hooked += 1;
        const ids = ((await P.crmScoreLog.findMany({ where: { contactId: k.id }, select: { id: true }, take: 5 })) as Any[]).map((x) => x.id);
        await P.crmScoreLog.deleteMany({ where: { id: { in: ids } } });
      },
    });
    chk("L1", "FINDING (seam-driven; a pure race cannot be reproduced on the old code): 5 rows deleted between paging and the count ⇒ CrmScoreLog still marked truncated (exported 10 · total ≥ 11) and complete:false",
      hooked === 1 && (b?.tables?.CrmScoreLog ?? []).length === 10 && b?.complete === false && (b?.truncated?.CrmScoreLog?.total ?? 0) >= 11, j({ hooked, n: (b?.tables?.CrmScoreLog ?? []).length, complete: b?.complete, truncated: b?.truncated ?? null }), true);
  });

  // ════════ I · I2 UI text ════════
  await sub("I", async () => {
    const src = readFileSync("src/app/app/sys/[id]/crm/contacts/_components/ContactPrivacyBlock.tsx", "utf8");
    chk("I1", "FINDING: the export warning no longer promises 'ติดต่อทีม SHARK เพื่อขอส่วนที่เหลือ' and names the visibility limit", !src.includes("ติดต่อทีม SHARK") && src.includes("limitedByRequesterVisibility"), j({ promise: src.includes("ติดต่อทีม SHARK"), visibility: src.includes("limitedByRequesterVisibility") }), true);
  });
} finally {
  await sleep(500);
  const left: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
    .map((r) => String(r.table_name))
    .filter((t) => /^[A-Za-z_]+$/.test(t));
  if (T) {
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
  if (T) chk("CLEAN", "throwaway tenant, users and every tenant row removed (0 rows left)", left.length === 0 && (await P.tenant.count({ where: { id: T } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, left.join(" · ") || "-");
  await prisma.$disconnect();
}
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\n(${Math.round((Date.now() - t0) / 1000)} s) controls ${controls.filter((c) => c.ok).length}/${controls.length} green · finding checks GREEN (= fixed) ${findings.filter((c) => c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "FIXED" : "RED"]) })}`);
process.exit(controls.every((c) => c.ok) && findings.every((c) => c.ok) ? 0 : 1);
