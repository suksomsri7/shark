// C5.5-fix9 REVIEW probe (independent reviewer) — own throwaway tenant on QC3; CLEAN at the end.
//   R  erase with injected batch 1 and 2 over a mixed fixture: merged chain (A merged into B) · rows of A, B and a live control Q created
//      interleaved (ids interleave across persons) · a card linked to A AND B · a removed link · a card shared by B and Q · cards on B's
//      deal · portal requests of A and B with cards — nothing of A/B left, nothing of Q touched (over-erasure)
//   S  `notThePerson` without LIMIT: 250 live contacts hold P's address e1, one more (Q) holds P's address e2 — Q's mail keeps e2 (shared),
//      P's unshared address e3 is still stripped from an unlinked mail (positive control); the OLD query (LIMIT 200) is replayed read-only
//      to show whether it would have missed e2 on this fixture
//   T  "fails loudly": a row lock held by another transaction on one of the person's kanban cards for 75 s makes the 60 s erase
//      transaction time out — expect an error, full rollback (no erase audit, no outbox event, form answers intact, contact intact),
//      no OpsEvent for ops (finding: silent to ops), and a later retry succeeds
//   U  person export by a STAFF actor (OWN activity visibility) — rows hidden by visibility vs the new `complete:true` claim
//   W  export ceiling on file links (CONTACT + ACTIVITY union) and web events (through the session relation) with injected
//      tableMax 5 / page 2 · default export = same row SETS as the old (pre-fix) queries for a small person
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf12/review/probe-cf12-review.mts
// A check marked "FINDING" = a reviewer finding (RED = the finding reproduces); controls must be GREEN.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf12-review: QC3 only (host=${host})`);
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("probe-cf12-review: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf12r-${rand}`;
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
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
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
  const deps = { del: async (_p: string) => undefined };
  let n = 0;
  const mkContact = async (label: string, extra: Any = {}) => {
    n += 1;
    const name = `${label} ${TAG}`;
    const phone = `09${String(Date.now() % 1e6).padStart(6, "0")}${String(n).padStart(2, "0")}`;
    const email = `r${n}-${rand}@qc.invalid`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone } });
    const c = await P.crmContact.create({ data: { tenantId: T, systemId: S, name, firstName: label, partyId: party.id, ownerUserId: u.id, email, phone, ...extra } });
    return { id: c.id as string, name, phone, email };
  };
  const coParty = await P.party.create({ data: { tenantId: T, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
  const company = (await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: `บริษัท ${TAG}` } })).id as string;
  const board = (await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `งาน ${TAG}` } })).id as string;
  const col = (await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board, name: "ต้องทำ" } })).id as string;
  const form = (await P.formDef.create({ data: { tenantId: T, name: `ฟอร์ม ${TAG}`, publicToken: `${TAG}-form` } })).id as string;
  const pipe = (await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ท่อ ${TAG}` } })).id as string;
  const stage = (await P.crmStage.create({ data: { tenantId: T, systemId: S, pipelineId: pipe, name: "ใหม่" } })).id as string;
  const PORTAL_PREFIX = "crm:portal-request:";
  const card = async (title: string, description: string | null = null, sourceKey: string | null = null) =>
    (await P.kanbanCard.create({ data: { tenantId: T, systemId: K, boardId: board, columnId: col, title, description, sourceKey } })).id as string;
  const link = (cardId: string, linkType: string, linkId: string, removed = false) =>
    P.kanbanCardLink.create({ data: { tenantId: T, systemId: K, cardId, linkType, linkId, role: "RELATED", ...(removed ? { removedAt: new Date() } : {}) } });
  const comment = (cardId: string, body: string) => P.kanbanComment.create({ data: { tenantId: T, cardId, authorUserId: u.id, body } });
  const hist = (cardId: string, title: string) => P.kanbanActivity.create({ data: { tenantId: T, boardId: board, cardId, type: "CARD_CREATED", data: { title, nested: [{ t: title }] } } });
  let mailN = 0;
  const mail = async (contactId: string | null, fromAddr: string, toAddrs: string[], subject: string) => {
    mailN += 1;
    return (
      await P.crmEmailMessage.create({
        data: { tenantId: T, systemId: S, contactId, direction: "IN", messageId: `<${TAG}-${mailN}@qc.invalid>`, threadKey: `${TAG}-t${mailN}`, fromAddr, toAddrs, subject, status: "RECEIVED", trackTokenHash: `${TAG}-h${mailN}` },
      })
    ).id as string;
  };

  // ════════ R · erase with batch 1 / 2 over a mixed, interleaved fixture ════════
  for (const batch of [1, 2]) {
    await sub(`R${batch}`, async () => {
      const B = await mkContact(`เป้า${batch}`);
      const A = await mkContact(`รวม${batch}`, { mergedIntoId: B.id });
      const Q = await mkContact(`คุม${batch}`);
      const deal = (await P.crmDeal.create({ data: { tenantId: T, systemId: S, contactId: B.id, pipelineId: pipe, stageId: stage, title: `ดีล ${B.name}` } })).id as string;
      const cards: Record<string, string> = {};
      // c1 linked to A and B · c2 removed link to B · c3 shared B+Q · d0..d4 on B's deal · cq Q only
      cards.c1 = await card(`โทร ${A.name}`, `เบอร์ ${B.phone}`);
      await link(cards.c1, "CRM_CONTACT", A.id);
      await link(cards.c1, "CRM_CONTACT", B.id);
      cards.c2 = await card(`ส่งของ ${B.name}`, null);
      await link(cards.c2, "CRM_CONTACT", B.id, true);
      cards.c3 = await card(`นัด ${Q.name}`, `ประชุมร่วม`);
      await link(cards.c3, "CRM_CONTACT", B.id);
      await link(cards.c3, "CRM_CONTACT", Q.id);
      for (let i = 0; i < 5; i += 1) {
        cards[`d${i}`] = await card(`งานดีล ${B.name} ${i}`, `โทร ${B.phone}`);
        await link(cards[`d${i}`], "DEAL", deal);
      }
      cards.cq = await card(`งานของ ${Q.name}`, `เบอร์ ${Q.phone}`);
      await link(cards.cq, "CRM_CONTACT", Q.id);
      for (const k of Object.keys(cards)) {
        for (let i = 0; i < 3; i += 1) await comment(cards[k], k === "c3" ? `B ${B.phone} / Q ${Q.phone} #${i}` : k === "cq" ? `Q ${Q.phone} #${i}` : `ติดต่อ ${B.phone} ${A.phone} #${i}`);
        await hist(cards[k], k === "cq" ? `สร้าง ${Q.name}` : `สร้าง ${B.name} ${A.name}`);
      }
      // portal requests (A, B, Q interleaved) with cards
      const pcards: Record<string, string[]> = { A: [], B: [], Q: [] };
      for (let i = 0; i < 4; i += 1) {
        for (const [who, p] of [["A", A], ["B", B], ["Q", Q]] as const) {
          const r = await P.crmPortalRequest.create({ data: { tenantId: T, systemId: S, companyId: company, contactId: p.id, kind: "ISSUE", payload: { title: `แจ้ง ${p.name}` }, approvalRequestId: `${TAG}-${who}-${batch}-${i}` } });
          const c = await card(`คำขอของ ${p.name} ${i}`, `ติดต่อ ${p.phone}`, `${PORTAL_PREFIX}${r.id}`);
          await P.crmPortalRequest.update({ where: { id: r.id }, data: { kanbanCardId: c } });
          await comment(c, `ตอบ ${p.phone}`);
          pcards[who].push(c);
        }
      }
      // form answers + audit rows interleaved across A, B, Q
      const formIds: Record<string, string[]> = { A: [], B: [], Q: [] };
      const auditIds: Record<string, string[]> = { A: [], B: [], Q: [] };
      for (let i = 0; i < 5; i += 1) {
        for (const [who, p] of [["A", A], ["B", B], ["Q", Q]] as const) {
          formIds[who].push((await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: p.id, answersJson: { name: p.name, phone: p.phone }, pageUrl: `https://shop.qc.invalid/${who}${i}` } })).id);
          auditIds[who].push((await P.auditLog.create({ data: { tenantId: T, actorType: "USER", actorId: u.id, action: "crm.contact.update", targetType: "CrmContact", targetId: p.id, before: { phone: null }, after: { phone: p.phone, note: `โทร ${p.phone}` } } })).id);
        }
      }
      const qBefore = {
        cq: j(await P.kanbanCard.findUnique({ where: { id: cards.cq }, select: { title: true, description: true } })),
        cqComments: j(await P.kanbanComment.findMany({ where: { cardId: cards.cq }, select: { body: true }, orderBy: { id: "asc" } })),
        qPortal: j(await P.kanbanCard.findMany({ where: { id: { in: pcards.Q } }, select: { title: true, description: true }, orderBy: { id: "asc" } })),
        qForms: j(await P.formSubmission.findMany({ where: { id: { in: formIds.Q } }, select: { answersJson: true, pageUrl: true }, orderBy: { id: "asc" } })),
        qAudit: j(await P.auditLog.findMany({ where: { id: { in: auditIds.Q } }, select: { before: true, after: true }, orderBy: { id: "asc" } })),
      };
      const r = await CRM.privacy.eraseContact(ctx, owner, { contactId: B.id, confirm: true, reason: `ลูกค้าขอลบข้อมูล (review batch ${batch})` }, { ...deps, batch });
      chk(`R${batch}.0`, `control: erase with batch ${batch} commits (erased:true · mergedContacts 1 · formSubmissions 10)`, r?.erased === true && r?.counts?.mergedContacts === 1 && r?.counts?.formSubmissions === 10, j({ erased: r?.erased, merged: r?.counts?.mergedContacts, forms: r?.counts?.formSubmissions, portal: r?.counts?.portal, kanban: r?.counts?.kanban }));
      const toks = [B.name, B.phone, A.name, A.phone];
      const has = (v: unknown) => toks.some((t) => j(v).includes(t));
      const ab = Object.entries(cards).filter(([k]) => k !== "cq").map(([, v]) => v).concat(pcards.A, pcards.B);
      const cardRows = (await P.kanbanCard.findMany({ where: { id: { in: ab } }, select: { id: true, title: true, description: true } })) as Any[];
      const comRows = (await P.kanbanComment.findMany({ where: { cardId: { in: ab } }, select: { body: true } })) as Any[];
      const histRows = (await P.kanbanActivity.findMany({ where: { cardId: { in: ab } }, select: { data: true } })) as Any[];
      const left = { cards: cardRows.filter(has).length, comments: comRows.filter(has).length, history: histRows.filter(has).length };
      chk(`R${batch}.1`, `no A/B identity left on any of ${ab.length} cards (A+B link · removed link · shared · 5 deal cards · 8 portal cards) incl. comments/history`, left.cards + left.comments + left.history === 0 && cardRows.length === ab.length && comRows.length === ab.length * 3 - 8 * 2, j({ ...left, cards: cardRows.length, comments: comRows.length }));
      const formsAB = (await P.formSubmission.findMany({ where: { id: { in: [...formIds.A, ...formIds.B] } }, select: { answersJson: true, pageUrl: true } })) as Any[];
      const auditAB = (await P.auditLog.findMany({ where: { id: { in: [...auditIds.A, ...auditIds.B] } }, select: { after: true } })) as Any[];
      const reqAB = (await P.crmPortalRequest.count({ where: { tenantId: T, contactId: { in: [A.id, B.id] } } })) as number;
      chk(`R${batch}.2`, "every interleaved form answer (10) and audit row (10) of A and B is cleared/scrubbed; their 8 portal requests are gone",
        formsAB.every((f) => j(f.answersJson) === "{}" && f.pageUrl === null) && auditAB.every((a) => !has(a.after)) && formsAB.length === 10 && auditAB.length === 10 && reqAB === 0,
        j({ formsLeft: formsAB.filter((f) => j(f.answersJson) !== "{}" || f.pageUrl !== null).length, auditLeft: auditAB.filter((a) => has(a.after)).length, reqAB }));
      const qAfter = {
        cq: j(await P.kanbanCard.findUnique({ where: { id: cards.cq }, select: { title: true, description: true } })),
        cqComments: j(await P.kanbanComment.findMany({ where: { cardId: cards.cq }, select: { body: true }, orderBy: { id: "asc" } })),
        qPortal: j(await P.kanbanCard.findMany({ where: { id: { in: pcards.Q } }, select: { title: true, description: true }, orderBy: { id: "asc" } })),
        qForms: j(await P.formSubmission.findMany({ where: { id: { in: formIds.Q } }, select: { answersJson: true, pageUrl: true }, orderBy: { id: "asc" } })),
        qAudit: j(await P.auditLog.findMany({ where: { id: { in: auditIds.Q } }, select: { before: true, after: true }, orderBy: { id: "asc" } })),
      };
      const qReq = (await P.crmPortalRequest.count({ where: { tenantId: T, contactId: Q.id } })) as number;
      const c3 = (await P.kanbanComment.findMany({ where: { cardId: cards.c3 }, select: { body: true } })) as Any[];
      chk(`R${batch}.3`, "over-erasure control: Q's card/comments/portal cards/forms/audit byte-identical · Q's 4 requests kept · shared card c3 keeps Q's phone",
        j(qBefore) === j(qAfter) && qReq === 4 && c3.every((c) => String(c.body).includes(Q.phone) && !String(c.body).includes(B.phone)),
        j({ same: Object.fromEntries(Object.keys(qBefore).map((k) => [k, (qBefore as Any)[k] === (qAfter as Any)[k]])), qReq, c3: c3.map((c) => c.body) }));
      const ea = (await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.contact.erase", targetId: B.id }, select: { after: true } })) as Any;
      const ap = (ea?.after?.followUp?.approvalRequestIds ?? []) as string[];
      chk(`R${batch}.4`, "the erase follow-up lists all 8 approval ids of A and B (none of Q)", ap.length === 8 && ap.every((x) => !x.includes(`-Q-`)), j(ap));
    });
  }

  // ════════ S · shared address beyond the old 200-pair LIMIT ════════
  await sub("S", async () => {
    const e1 = `shared-${rand}@qc.invalid`;
    const e2 = `second-${rand}@qc.invalid`;
    const e3 = `own-${rand}@qc.invalid`;
    const Pp = await mkContact("ที่อยู่", { email: e1, previousEmails: [e2, e3] });
    const rows = Array.from({ length: 250 }, (_v, i) => ({ tenantId: T, systemId: S, name: `ผู้ถือ ${i} ${TAG}`, previousEmails: [e1], ownerUserId: u.id }));
    await P.crmContact.createMany({ data: rows });
    const Q = await mkContact("ถือที่สอง", { previousEmails: [e2] });
    const mQ = await mail(Q.id, e2, [`shop-${rand}@qc.invalid`], `เรื่องของ ${Q.name}`);
    const mOwn = await mail(null, e3, [`shop-${rand}@qc.invalid`], `ติดต่อจากลูกค้า`);
    // replay the OLD set query (read-only) — would it have seen e2 as "held by someone else"?
    const em = [e1, e2, e3];
    const old = (await P.$queryRawUnsafe(
      `SELECT DISTINCT c."id", lower(btrim(x.e)) AS "v" FROM "CrmContact" c, unnest(array_append(c."previousEmails", c."email")) x(e)
        WHERE c."tenantId" = $1 AND NOT (c."id" = ANY($2::text[]))
          AND NOT EXISTS (SELECT 1 FROM "AuditLog" e WHERE e."action" = 'crm.contact.erase' AND e."targetId" = c."id" AND e."tenantId" = c."tenantId")
          AND x.e IS NOT NULL AND lower(btrim(x.e)) = ANY($3::text[]) LIMIT 200`,
      T,
      [Pp.id],
      em,
    )) as Any[];
    const oldHasE2 = old.some((r) => r.v === e2);
    console.log(`        (old LIMIT-200 query on this fixture: ${old.length} pairs · e2 present = ${oldHasE2})`);
    const r = await CRM.privacy.eraseContact(ctx, owner, { contactId: Pp.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review S)" }, deps);
    const q = (await P.crmEmailMessage.findUnique({ where: { id: mQ }, select: { fromAddr: true } })) as Any;
    const o = (await P.crmEmailMessage.findUnique({ where: { id: mOwn }, select: { fromAddr: true } })) as Any;
    chk("S1", "shared address e2 (held by live Q, beyond 250 holders of e1) stays on Q's mail; P's unshared e3 is stripped from the unlinked mail (positive control)", r?.erased === true && q?.fromAddr === e2 && o?.fromAddr === "", j({ erased: r?.erased, qFrom: q?.fromAddr, ownFrom: o?.fromAddr, oldQueryWouldMissE2: !oldHasE2 }));
    const warn = (await P.opsEvent.findMany({ where: { tenantId: T, source: "crm.privacy" }, select: { message: true, detail: true } })) as Any[];
    const held = warn.map((w) => { try { return JSON.parse(String(w.detail)); } catch { return null; } }).find((d) => d?.contactId === Pp.id && Array.isArray(d?.heldBy));
    chk("S2", "holders WARN lists ≤ 20 ids (window LIMIT) and names Q among them? (informational: Q is the only holder of e2)", !!held && held.heldBy.length <= 20, j({ heldBy: held?.heldBy?.length, hasQ: held?.heldBy?.includes(Q.id) }));
  });

  // ════════ T · transaction timeout under a held row lock ════════
  await sub("T", async () => {
    const L = await mkContact("ล็อก");
    const lc = await card(`โทร ${L.name}`, `เบอร์ ${L.phone}`);
    await link(lc, "CRM_CONTACT", L.id);
    const fs = (await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: L.id, answersJson: { name: L.name, phone: L.phone }, pageUrl: "https://shop.qc.invalid/lock" } })).id as string;
    const opsBefore = (await P.opsEvent.count({ where: { tenantId: T } })) as number;
    const holder = P.$transaction(
      async (tx: Any) => {
        await tx.$queryRawUnsafe(`SELECT "id" FROM "KanbanCard" WHERE "id" = $1 FOR UPDATE`, lc);
        await sleep(75_000);
      },
      { timeout: 150_000, maxWait: 20_000 },
    );
    await sleep(1_500);
    const ts = Date.now();
    let err: Any = null;
    let res: Any = null;
    try {
      res = await CRM.privacy.eraseContact(ctx, owner, { contactId: L.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review T)" }, deps);
    } catch (e) {
      err = e;
    }
    const took = Date.now() - ts;
    await holder.catch(() => undefined);
    console.log(`        (erase under the lock returned after ${took} ms · error=${err ? `${err.name} ${err.code ?? ""}` : "none"})`);
    const after = {
      erased: !!(await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.contact.erase", targetId: L.id } })),
      outbox: (await P.outboxEvent.count({ where: { tenantId: T, idempotencyKey: `crm.contact.erased#${L.id}` } })) as number,
      form: j((await P.formSubmission.findUnique({ where: { id: fs }, select: { answersJson: true } }))?.answersJson),
      name: (await P.crmContact.findUnique({ where: { id: L.id }, select: { name: true } }))?.name,
    };
    chk("T1", "control: the erase that cannot finish inside 60 s throws (no erased result) and rolls back whole (no erase audit · no outbox event · form answers and contact name intact)",
      !!err && !res && !after.erased && after.outbox === 0 && after.form.includes(L.phone) && after.name === L.name,
      j({ threw: !!err, errName: err?.name, code: err?.code, msg: String(err?.message ?? "").replace(/\s+/g, " ").slice(0, 220), tookMs: took, ...after, form: after.form.includes(L.phone) ? "intact" : after.form }));
    const opsAfter = (await P.opsEvent.count({ where: { tenantId: T } })) as number;
    chk("T2", "FINDING: a staff erase (REQUEST) that times out leaves a trace for ops (OpsEvent) — the action only console.errors the error name and shows a generic 'try again'", opsAfter > opsBefore, j({ opsBefore, opsAfter }), true);
    const r2 = await CRM.privacy.eraseContact(ctx, owner, { contactId: L.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review T retry)" }, deps);
    const c = (await P.kanbanCard.findUnique({ where: { id: lc }, select: { title: true, description: true } })) as Any;
    chk("T3", "control: the retry after the lock is gone erases (erased:true) and masks the card", r2?.erased === true && !j(c).includes(L.phone) && !j(c).includes(L.name), j({ erased: r2?.erased, card: c }));
  });

  // ════════ U · export by a STAFF actor: visibility vs complete:true ════════
  await sub("U", async () => {
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
    const bs = await CRM.privacy.exportContact({ ...ctx, actorUserId: su.id }, staff, V.id);
    const no = (bo?.tables?.CrmActivity ?? []).length;
    const ns = (bs?.tables?.CrmActivity ?? []).length;
    console.log(`        (owner export: ${no} activities complete=${bo?.complete} · staff export: ${ns} activities complete=${bs?.complete})`);
    chk("U1", "FINDING: a person export that omits rows hidden by the requester's visibility does not claim complete:true", !(ns < no && bs?.complete === true), j({ owner: no, staff: ns, staffComplete: bs?.complete, staffTruncated: bs?.truncated ?? null }), true);
  });

  // ════════ W · export ceiling on unions/relations + set equality with the old queries ════════
  await sub("W", async () => {
    const Wc = await mkContact("ส่งออกเล็ก");
    for (let i = 0; i < 3; i += 1) await P.crmFileLink.create({ data: { tenantId: T, systemId: S, entityType: "CONTACT", entityId: Wc.id, fileId: `${TAG}-w-c${i}`, name: `c${i}.pdf`, size: 10, mime: "application/pdf" } });
    const acts: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const a = await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: Wc.id, type: "NOTE", title: `บันทึก ${i}`, ownerUserId: u.id } });
      acts.push(a.id);
      await P.crmFileLink.create({ data: { tenantId: T, systemId: S, entityType: "ACTIVITY", entityId: a.id, fileId: `${TAG}-w-a${i}`, name: `a${i}.pdf`, size: 10, mime: "application/pdf" } });
    }
    const sess: string[] = [];
    for (let s = 0; s < 2; s += 1) {
      const ws = await P.crmWebSession.create({ data: { tenantId: T, systemId: S, visitorId: `${TAG}-wv${s}`, contactId: Wc.id, firstUrl: `https://shop.qc.invalid/w${s}` } });
      sess.push(ws.id);
      for (let i = 0; i < 4; i += 1) await P.crmWebEvent.create({ data: { tenantId: T, sessionId: ws.id, kind: "PAGEVIEW", url: `https://shop.qc.invalid/w${s}/${i}`, at: new Date(Date.now() - (s * 4 + i) * 1_000) } });
    }
    for (let i = 0; i < 3; i += 1) await P.crmScoreLog.create({ data: { tenantId: T, contactId: Wc.id, points: i, reason: `w ${i}` } });
    for (let i = 0; i < 3; i += 1) await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: Wc.id, answersJson: { name: Wc.name, i }, pageUrl: `https://shop.qc.invalid/f${i}` } });

    const cut = await CRM.privacy.exportContact(ctx, owner, Wc.id, { tableMax: 5, page: 2 });
    const allLinks = (await P.crmFileLink.findMany({ where: { tenantId: T, systemId: S, OR: [{ entityType: "CONTACT", entityId: Wc.id }, { entityType: "ACTIVITY", entityId: { in: acts } }] }, select: { id: true, name: true }, orderBy: { id: "desc" } })) as Any[];
    const want5 = allLinks.slice(0, 5).map((l) => l.name);
    const got5 = (cut?.tables?.CrmFileLink ?? []).map((l: Any) => l.name);
    const allEv = (await P.crmWebEvent.findMany({ where: { sessionId: { in: sess } }, select: { url: true }, orderBy: { id: "desc" } })) as Any[];
    const gotEv = (cut?.tables?.CrmWebEvent ?? []).map((e: Any) => e.url);
    chk("W1", "file links: union CONTACT+ACTIVITY cut at 5 keeps the 5 newest ids of the union and says truncated {5, 7}; web events via the session relation cut at 5 = newest 5 of 8, truncated {5, 8}",
      cut?.complete === false && j(cut?.truncated?.CrmFileLink) === j({ exported: 5, total: 7 }) && j(got5) === j(want5) && j(cut?.truncated?.CrmWebEvent) === j({ exported: 5, total: 8 }) && j(gotEv) === j(allEv.slice(0, 5).map((e) => e.url)),
      j({ complete: cut?.complete, truncated: cut?.truncated, linksMatch: j(got5) === j(want5), eventsMatch: j(gotEv) === j(allEv.slice(0, 5).map((e) => e.url)) }));

    // default export vs the OLD (pre-fix) queries — same row SETS (order is allowed to differ)
    const full = await CRM.privacy.exportContact(ctx, owner, Wc.id);
    const clean = (rows: unknown[]) => (JSON.parse(JSON.stringify(rows)) as unknown[]).map((r) => JSON.stringify(r)).sort();
    const forms = (await import("@/lib/modules/forms" as string)) as Any;
    const old: Record<string, unknown[]> = {
      CrmActivity: await P.crmActivity.findMany({ where: { tenantId: T, systemId: S, contactId: Wc.id }, select: { id: true, type: true, title: true, body: true, direction: true, channel: true, outcome: true, durationSec: true, dueAt: true, doneAt: true, startAt: true, createdAt: true }, take: 5_000 }),
      CrmWebSession: await P.crmWebSession.findMany({ where: { tenantId: T, contactId: Wc.id }, select: { id: true, startedAt: true, lastSeenAt: true, pageViews: true, firstUrl: true, referrer: true, utm: true, consentVersion: true, consentAt: true }, take: 5_000 }),
      CrmWebEvent: await P.crmWebEvent.findMany({ where: { sessionId: { in: sess } }, select: { sessionId: true, kind: true, url: true, title: true, at: true }, take: 20_000 }),
      CrmScoreLog: await P.crmScoreLog.findMany({ where: { tenantId: T, contactId: Wc.id }, select: { points: true, reason: true, createdAt: true }, take: 5_000 }),
      CrmFileLink: await P.crmFileLink.findMany({ where: { tenantId: T, systemId: S, OR: [{ entityType: "CONTACT", entityId: Wc.id }, { entityType: "ACTIVITY", entityId: { in: acts } }] }, select: { entityType: true, entityId: true, name: true, mime: true, size: true, createdAt: true }, take: 5_000 }),
      FormSubmission: (await forms.submissionsOfCrmContacts(P, T, [Wc.id], { take: 5_000 })).map((x: Any) => ({ id: x.id, form: x.formName, answers: x.answers, createdAt: x.createdAt, pageUrl: x.pageUrl, referrer: x.referrer, utm: x.utm })),
    };
    const diffs = Object.entries(old).filter(([k, v]) => j(clean(v)) !== j(clean(full?.tables?.[k] ?? []))).map(([k]) => k);
    const orderSame = Object.entries(old).filter(([k, v]) => j(JSON.parse(JSON.stringify(v))) === j(full?.tables?.[k] ?? [])).map(([k]) => k);
    chk("W2", "small person: default export = the old queries' row sets for 6 paged tables (complete:true, no truncated key)", diffs.length === 0 && full?.complete === true && !("truncated" in (full ?? {})), j({ setDiffs: diffs, sameOrderAsOldUnorderedRead: orderSame, keys: Object.keys(full ?? {}) }));
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
console.log(`\n(${Math.round((Date.now() - t0) / 1000)} s) controls ${controls.filter((c) => c.ok).length}/${controls.length} green · finding checks GREEN ${findings.filter((c) => c.ok).length}/${findings.length} (RED = reproduced)`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "NOT-REPRODUCED" : "REPRODUCED"]) })}`);
process.exit(controls.every((c) => c.ok) ? 0 : 1);
