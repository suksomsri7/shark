// C5.5-fix9 probe (hunt 3 · H3-2 + H3-3 + sweep) — own throwaway tenant on QC3; CLEAN at the end.
//   X  PDPA person export (privacy.exportContact): every row of every table (keyset pages), deterministic order, same result twice;
//      a table cut at the size ceiling says so (bundle `complete:false` + `truncated.<table> = {exported,total}`) and the audit records
//      exported AND total counts
//   E  PDPA erase at/over the old fixed caps (default batch): kanban cards linked to the contact (2,000) · portal requests (5,000) ·
//      audit trail scrub (5,000) · form submissions (5,000) — the rows beyond the old cap are masked/cleared too
//   B  the same erase with an injected batch of 3 (deps.batch) over 7/6-row sets — the paging loops cover every page boundary
//   F  kanban facade inputs longer than the old cap (redactCardsInTx ids · maskCardsBySourcePrefixInTx prefixes) are not cut
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf12/probe-cf12.mts
// A check marked "FINDING" asserts the fixed behaviour (expected RED on 8cc1778a); controls must be GREEN on both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf12: QC3 only (host=${host})`);
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("probe-cf12: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf12-${rand}`;
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
let T = "";
const USERS: string[] = [];
const t0 = Date.now();

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const KL = (await import("@/lib/modules/kanban/links" as string)) as Any;
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
  const DELETED: string[] = [];
  const deps = { del: async (p: string) => { DELETED.push(String(p)); } };
  let phoneN = 0;
  const mkContact = async (label: string) => {
    const name = `${label} ${TAG}`;
    const phone = `08${String(Date.now() % 1e6).padStart(6, "0")}${String(++phoneN).padStart(2, "0")}`;
    const email = `${label.replace(/[^a-z]/gi, "") || "p"}-${phoneN}-${rand}@qc.invalid`;
    const party = await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone } });
    const c = await P.crmContact.create({ data: { tenantId: T, systemId: S, name, firstName: label, partyId: party.id, ownerUserId: u.id, email, phone } });
    return { id: c.id as string, name, phone, email };
  };
  const coParty = await P.party.create({ data: { tenantId: T, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
  const company = (await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: `บริษัท ${TAG}` } })).id as string;
  const board = (await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `งาน ${TAG}` } })).id as string;
  const col = (await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board, name: "ต้องทำ" } })).id as string;
  const form = (await P.formDef.create({ data: { tenantId: T, name: `ฟอร์ม ${TAG}`, publicToken: `${TAG}-form` } })).id as string;
  const PORTAL_PREFIX = "crm:portal-request:";

  // fixtures for a person: n token-bearing linked cards (+comment +history), portal requests with cards, audit rows, form answers;
  //   `fill` filler rows of each kind are inserted FIRST (no identity) so a fixed cap without ordering stops before the token rows
  const seed = async (p: Any, n: number, fill: { cards: number; requests: number; audits: number; forms: number }) => {
    const id = (k: string, i: number) => `${TAG}-${p.id.slice(-6)}-${k}-${String(i).padStart(5, "0")}`;
    if (fill.cards) {
      const cards = Array.from({ length: fill.cards }, (_v, i) => ({ id: id("fc", i), tenantId: T, systemId: K, boardId: board, columnId: col, title: `งานทั่วไป ${i}`, sortOrder: i }));
      await chunks(cards, (part) => P.kanbanCard.createMany({ data: part }));
      await chunks(cards, (part) => P.kanbanCardLink.createMany({ data: part.map((c) => ({ tenantId: T, systemId: K, cardId: c.id, linkType: "CRM_CONTACT", linkId: p.id, role: "RELATED" })) }));
    }
    const linked: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const c = await P.kanbanCard.create({ data: { tenantId: T, systemId: K, boardId: board, columnId: col, title: `โทรหา ${p.name} ${i}`, description: `เบอร์ ${p.phone}` } });
      await P.kanbanCardLink.create({ data: { tenantId: T, systemId: K, cardId: c.id, linkType: "CRM_CONTACT", linkId: p.id, role: "RELATED" } });
      await P.kanbanComment.create({ data: { tenantId: T, cardId: c.id, authorUserId: u.id, body: `ลูกค้าให้โทร ${p.phone}` } });
      await P.kanbanActivity.create({ data: { tenantId: T, boardId: board, cardId: c.id, type: "CARD_CREATED", data: { title: `โทรหา ${p.name} ${i}` } } });
      linked.push(c.id);
    }
    if (fill.requests) {
      const reqs = Array.from({ length: fill.requests }, (_v, i) => ({ id: id("fr", i), tenantId: T, systemId: S, companyId: company, contactId: p.id, kind: "ISSUE", payload: { title: `ทั่วไป ${i}` }, approvalRequestId: `${TAG}-ap-${i}` }));
      await chunks(reqs, (part) => P.crmPortalRequest.createMany({ data: part }));
    }
    const portalCards: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const r = await P.crmPortalRequest.create({ data: { tenantId: T, systemId: S, companyId: company, contactId: p.id, kind: "ISSUE", payload: { title: `แจ้งปัญหา ${p.name}` } } });
      const c = await P.kanbanCard.create({ data: { tenantId: T, systemId: K, boardId: board, columnId: col, title: `คำขอของ ${p.name} ${i}`, description: `ติดต่อ ${p.phone}`, sourceKey: `${PORTAL_PREFIX}${r.id}` } });
      await P.crmPortalRequest.update({ where: { id: r.id }, data: { kanbanCardId: c.id } });
      portalCards.push(c.id);
    }
    const old = Date.now() - 86_400_000;
    if (fill.audits) {
      const rows = Array.from({ length: fill.audits }, (_v, i) => ({ id: id("fa", i), tenantId: T, actorType: "USER", actorId: u.id, action: "crm.contact.update", targetType: "CrmContact", targetId: p.id, before: { note: "เดิม" }, after: { note: `ทั่วไป ${i}` }, createdAt: new Date(old - (fill.audits - i) * 1_000) }));
      await chunks(rows, (part) => P.auditLog.createMany({ data: part }));
    }
    const audits: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = await P.auditLog.create({ data: { tenantId: T, actorType: "USER", actorId: u.id, action: "crm.contact.update", targetType: "CrmContact", targetId: p.id, before: { phone: null }, after: { phone: p.phone, note: `โทรแล้ว ${p.phone}` } } });
      audits.push(a.id);
    }
    if (fill.forms) {
      const rows = Array.from({ length: fill.forms }, (_v, i) => ({ id: id("ff", i), tenantId: T, formId: form, crmContactId: p.id, answersJson: {}, pageUrl: `https://filler.qc.invalid/${i}` }));
      await chunks(rows, (part) => P.formSubmission.createMany({ data: part }));
    }
    const forms: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const f = await P.formSubmission.create({ data: { tenantId: T, formId: form, crmContactId: p.id, answersJson: { name: p.name, phone: p.phone, msg: `ขอใบเสนอราคา ${i}` }, pageUrl: `https://shop.qc.invalid/p?ref=${i}` } });
      forms.push(f.id);
    }
    return { linked, portalCards, audits, forms };
  };
  const verify = async (p: Any, s: Any) => {
    const cards = (await P.kanbanCard.findMany({ where: { id: { in: s.linked } }, select: { title: true, description: true } })) as Any[];
    const cardLeft = cards.filter((c) => j(c).includes(p.name) || j(c).includes(p.phone)).length;
    const comments = (await P.kanbanComment.findMany({ where: { cardId: { in: s.linked } }, select: { body: true } })) as Any[];
    const commentLeft = comments.filter((c) => String(c.body).includes(p.phone)).length;
    const hist = (await P.kanbanActivity.findMany({ where: { cardId: { in: s.linked } }, select: { data: true } })) as Any[];
    const histLeft = hist.filter((h) => j(h.data).includes(p.name)).length;
    const pcards = (await P.kanbanCard.findMany({ where: { id: { in: s.portalCards } }, select: { title: true, description: true } })) as Any[];
    const portalLeft = pcards.filter((c) => j(c).includes(p.name) || j(c).includes(p.phone)).length;
    const reqsLeft = (await P.crmPortalRequest.count({ where: { tenantId: T, contactId: p.id } })) as number;
    const aud = (await P.auditLog.findMany({ where: { id: { in: s.audits } }, select: { after: true } })) as Any[];
    const auditLeft = aud.filter((a) => j(a.after).includes(p.phone)).length;
    const fs = (await P.formSubmission.findMany({ where: { id: { in: s.forms } }, select: { answersJson: true, pageUrl: true } })) as Any[];
    const formLeft = fs.filter((f) => j(f.answersJson) !== "{}" || f.pageUrl !== null).length;
    return { cardLeft, commentLeft, histLeft, portalLeft, reqsLeft, auditLeft, formLeft, n: { cards: cards.length, comments: comments.length, hist: hist.length, pcards: pcards.length, aud: aud.length, forms: fs.length } };
  };

  // ════════ X · PDPA person export ════════
  await sub("X", async () => {
    const k = await mkContact("ส่งออก");
    const N = 5_100;
    const rows = Array.from({ length: N }, (_v, i) => ({ tenantId: T, contactId: k.id, points: 1, reason: `probe ${i}`, createdAt: new Date(Date.now() - (N - i) * 60_000) }));
    await chunks(rows, (part) => P.crmScoreLog.createMany({ data: part }));
    for (let s = 0; s < 4; s += 1) {
      const ws = await P.crmWebSession.create({ data: { tenantId: T, systemId: S, visitorId: `${TAG}-v${s}`, contactId: k.id, firstUrl: `https://shop.qc.invalid/${s}` } });
      await P.crmWebEvent.createMany({ data: Array.from({ length: 5 }, (_v, i) => ({ tenantId: T, sessionId: ws.id, kind: "PAGEVIEW", url: `https://shop.qc.invalid/${s}/${i}`, at: new Date(Date.now() - (s * 5 + i) * 1_000) })) });
    }
    for (let i = 0; i < 10; i += 1) {
      const a = await P.crmActivity.create({ data: { tenantId: T, systemId: S, contactId: k.id, type: "CALL", title: `โทรครั้งที่ ${i}` } });
      await P.crmFileLink.create({ data: { tenantId: T, systemId: S, entityType: "ACTIVITY", entityId: a.id, fileId: `${TAG}-f-a${i}`, name: `a${i}.pdf`, size: 10, mime: "application/pdf" } });
    }
    for (let i = 0; i < 2; i += 1) await P.crmFileLink.create({ data: { tenantId: T, systemId: S, entityType: "CONTACT", entityId: k.id, fileId: `${TAG}-f-c${i}`, name: `c${i}.pdf`, size: 10, mime: "application/pdf" } });
    const inDb = await P.crmScoreLog.count({ where: { tenantId: T, contactId: k.id } });
    chk("X0", "control: the contact has 5,100 score-log rows (more than the old 5,000 cap) · 20 web events · 10 activities · 12 file links", inDb === N, `inDb=${inDb}`);

    const b1 = await CRM.privacy.exportContact(ctx, owner, k.id);
    const b2 = await CRM.privacy.exportContact(ctx, owner, k.id);
    const n1 = (b1?.tables?.CrmScoreLog ?? []).length;
    chk("X1", "FINDING: the default person export holds every CrmScoreLog row (5,100) and says complete:true without a truncated block", n1 === N && b1?.complete === true && b1?.truncated === undefined, `exported=${n1} complete=${b1?.complete} truncated=${j(b1?.truncated)}`, true);
    const same = j(b1?.tables) === j(b2?.tables);
    const ids = (b1?.tables?.CrmActivity ?? []).map((r: Any) => String(r.id));
    const sorted = [...ids].sort().reverse();
    chk("X2", "FINDING: deterministic — a second export returns byte-identical tables, rows ordered newest-id first (CrmActivity ids strictly descending)", same && ids.length === 10 && j(ids) === j(sorted) && b1?.complete === true, `sameTables=${same} activityIds=${ids.length} descending=${j(ids) === j(sorted)} complete=${b1?.complete}`, true);
    const a1 = (await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.contact.export.person", targetId: k.id }, orderBy: { createdAt: "asc" }, select: { after: true } })) as Any;
    chk("X3", "FINDING: the audit line of the complete export records CrmScoreLog 5,100 and complete:true", a1?.after?.tables?.CrmScoreLog === N && a1?.after?.complete === true, `audit=${j(a1?.after?.tables?.CrmScoreLog)} complete=${j(a1?.after?.complete)}`, true);

    // ceiling path (injected small ceiling + page size; the server action never passes these)
    const b3 = await CRM.privacy.exportContact(ctx, owner, k.id, { tableMax: 100, page: 7 });
    const t3 = b3?.truncated?.CrmScoreLog;
    const head = j((b1?.tables?.CrmScoreLog ?? []).slice(0, 100)) === j(b3?.tables?.CrmScoreLog ?? null);
    chk("X4", "FINDING: a table over the ceiling is cut AND marked: complete:false · truncated.CrmScoreLog = {exported:100,total:5100} · the 100 rows are the first 100 of the complete export (newest first) · small tables under the ceiling are complete through 7-row pages (web events 20 · file links 12 · activities 10)",
      b3?.complete === false && t3?.exported === 100 && t3?.total === N && head && (b3?.tables?.CrmWebEvent ?? []).length === 20 && (b3?.tables?.CrmFileLink ?? []).length === 12 && (b3?.tables?.CrmActivity ?? []).length === 10 && Object.keys(b3?.truncated ?? {}).length === 1,
      `complete=${b3?.complete} truncated=${j(b3?.truncated)} headMatches=${head} web=${(b3?.tables?.CrmWebEvent ?? []).length} files=${(b3?.tables?.CrmFileLink ?? []).length} acts=${(b3?.tables?.CrmActivity ?? []).length}`, true);
    const a3 = (await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.contact.export.person", targetId: k.id }, orderBy: { createdAt: "desc" }, select: { after: true } })) as Any;
    chk("X5", "FINDING: the audit line of the cut export records both counts (tables.CrmScoreLog = 100 exported · truncated.CrmScoreLog.total = 5,100 · complete:false)",
      a3?.after?.tables?.CrmScoreLog === 100 && a3?.after?.truncated?.CrmScoreLog?.total === N && a3?.after?.complete === false, `audit=${j(a3?.after?.tables?.CrmScoreLog)} truncated=${j(a3?.after?.truncated)} complete=${j(a3?.after?.complete)}`, true);
    // the web events / file links default path at 7-row pages equals the default-page result (paging does not change the set)
    const b4 = await CRM.privacy.exportContact(ctx, owner, k.id, { page: 3 });
    chk("X6", "control: page size does not change the result (page 3 vs default: identical tables)", j(b4?.tables) === j(b1?.tables), `identical=${j(b4?.tables) === j(b1?.tables)}`);
  });

  // ════════ E · erase at/over the old caps (default batch) ════════
  await sub("E", async () => {
    const p = await mkContact("ลบหมด");
    const s = await seed(p, 5, { cards: 2_000, requests: 5_000, audits: 5_000, forms: 5_000 });
    const tE = Date.now();
    const r = await CRM.privacy.eraseContact(ctx, owner, { contactId: p.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe cf12)" }, deps);
    console.log(`        (erase over the old caps took ${Date.now() - tE} ms)`);
    chk("E0", "control: the erase commits (erased:true)", r?.erased === true, j({ erased: r?.erased, counts: r?.counts }));
    const v = await verify(p, s);
    chk("E1", "FINDING: kanban cards linked to the contact beyond the old 2,000 cap are masked (title/description · comments · history)", v.cardLeft === 0 && v.commentLeft === 0 && v.histLeft === 0 && v.n.cards === 5, j(v), true);
    chk("E2", "FINDING: portal-request cards beyond the old 5,000 cap are redacted (and every request row is gone)", v.portalLeft === 0 && v.reqsLeft === 0 && v.n.pcards === 5, `portalLeft=${v.portalLeft} reqsLeft=${v.reqsLeft}`, true);
    chk("E3", "FINDING: audit rows beyond the old 5,000 scrub cap (the newest) carry no phone", v.auditLeft === 0 && v.n.aud === 5, `auditLeft=${v.auditLeft}`, true);
    const fillForms = (await P.formSubmission.count({ where: { tenantId: T, crmContactId: p.id, pageUrl: { not: null } } })) as number;
    chk("E4", "FINDING: every one of the 5,005 form submissions is cleared (answers {} · pageUrl null — fillers carry a pageUrl so a cut at 5,000 shows)", v.formLeft === 0 && v.n.forms === 5 && fillForms === 0, `formLeft=${v.formLeft} withPageUrlLeft=${fillForms}`, true);
    const ea = (await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.contact.erase", targetId: p.id }, select: { after: true } })) as Any;
    const apIds = (ea?.after?.followUp?.approvalRequestIds ?? []) as string[];
    chk("E5", "FINDING: the erase follow-up lists the approval request of every one of the 5,000 filler portal requests (all 5,005 request rows were read, not 5,000)", apIds.length === 5_000 && new Set(apIds).size === 5_000, `approvalRequestIds=${apIds.length}`, true);
  });

  // ════════ B · erase with an injected batch of 3 ════════
  await sub("B", async () => {
    const p = await mkContact("ลบทีละสาม");
    const s = await seed(p, 7, { cards: 0, requests: 6, audits: 6, forms: 6 });
    const r = await CRM.privacy.eraseContact(ctx, owner, { contactId: p.id, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe cf12 batch)" }, { ...deps, batch: 3 });
    const v = await verify(p, s);
    chk("B1", "control (fix shape): with deps.batch = 3, every one of 7 linked cards / 7 portal cards / 13 requests / 13 audit rows / 13 form rows is handled (0 left)",
      r?.erased === true && v.cardLeft + v.commentLeft + v.histLeft + v.portalLeft + v.reqsLeft + v.auditLeft + v.formLeft === 0 && v.n.cards === 7 && v.n.pcards === 7, j(v));
    // idempotent re-run (resweep) with the same small batch: nothing changes, nothing throws
    const r2 = await CRM.privacy.eraseContact(ctx, owner, { contactId: p.id, confirm: true, reason: "ลบซ้ำ (probe cf12 batch)" }, { ...deps, batch: 3 });
    const v2 = await verify(p, s);
    chk("B2", "control: a second erase (resweep) with batch 3 answers erased:false and leaves 0 rows with identity", r2?.erased === false && j(v2) === j(v), j({ erased: r2?.erased }));
  });

  // ════════ F · kanban facade inputs longer than the old cap ════════
  await sub("F", async () => {
    const mk = async (title: string, sourceKey: string) => (await P.kanbanCard.create({ data: { tenantId: T, systemId: K, boardId: board, columnId: col, title, sourceKey } })).id as string;
    const real = [await mk("ข้อความลับ F1 a", `${PORTAL_PREFIX}${TAG}-f1-a`), await mk("ข้อความลับ F1 b", `${PORTAL_PREFIX}${TAG}-f1-b`), await mk("ข้อความลับ F1 c", `${PORTAL_PREFIX}${TAG}-f1-c`)];
    const bogus = Array.from({ length: 2_000 }, (_v, i) => `${TAG}-nocard-${i}`);
    const out1 = await P.$transaction((tx: Any) => KL.redactCardsInTx(tx, T, [...bogus, ...real], { title: "ลบตามคำขอ PDPA", sourceKeyPrefix: PORTAL_PREFIX }), { timeout: 120_000 });
    const t1 = (await P.kanbanCard.findMany({ where: { id: { in: real } }, select: { title: true } })) as Any[];
    chk("F1", "FINDING: redactCardsInTx given 2,000 unknown ids followed by 3 real card ids redacts the 3 real cards (no slice at 2,000)", t1.every((c) => c.title === "ลบตามคำขอ PDPA") && out1?.cards === 3, `titles=${j(t1.map((c) => c.title))} out=${j(out1)}`, true);
    const pre = `crm-rule:${TAG}-run-real:`;
    const realP = [await mk(`กฎเปิดการ์ด ${TAG}-ลับ 1`, `${pre}0`), await mk(`กฎเปิดการ์ด ${TAG}-ลับ 2`, `${pre}1`)];
    const bogusP = Array.from({ length: 2_000 }, (_v, i) => `crm-rule:${TAG}-none-${i}:`);
    const out2 = await P.$transaction((tx: Any) => KL.maskCardsBySourcePrefixInTx(tx, T, [...bogusP, pre], (x: string) => x.split(`${TAG}-ลับ`).join("[ข้อมูลถูกลบ]")), { timeout: 120_000 });
    const t2 = (await P.kanbanCard.findMany({ where: { id: { in: realP } }, select: { title: true } })) as Any[];
    chk("F2", "FINDING: maskCardsBySourcePrefixInTx given 2,000 unmatched prefixes followed by the real one masks the real cards (no slice at 2,000)", t2.every((c) => !String(c.title).includes(`${TAG}-ลับ`)) && out2?.cards === 2, `titles=${j(t2.map((c) => c.title))} out=${j(out2)}`, true);
    // batch 3 straight on the facade: 7 cards linked to a fake DEAL id
    const deal = `${TAG}-deal`;
    const dc: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const id = await mk(`ดีลของ ${TAG}-ลับ ${i}`, `${TAG}-deal-card-${i}`);
      await P.kanbanCardLink.create({ data: { tenantId: T, systemId: K, cardId: id, linkType: "DEAL", linkId: deal, role: "RELATED" } });
      dc.push(id);
    }
    const out3 = await P.$transaction((tx: Any) => KL.maskCardsLinkedInTx(tx, T, "DEAL", [deal], (x: string) => x.split(`${TAG}-ลับ`).join("[ข้อมูลถูกลบ]"), { batch: 3 }));
    const t3 = (await P.kanbanCard.findMany({ where: { id: { in: dc } }, select: { title: true } })) as Any[];
    chk("F3", "control (fix shape): maskCardsLinkedInTx with batch 3 masks all 7 linked cards (counts 7)", t3.every((c) => !String(c.title).includes(`${TAG}-ลับ`)) && out3?.cards === 7, `left=${t3.filter((c) => String(c.title).includes(`${TAG}-ลับ`)).length} out=${j(out3)}`);
  });
} finally {
  await new Promise((r) => setTimeout(r, 500));
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
  if (T) chk("CLEAN", "throwaway tenant, user and every tenant row removed (0 rows left)", left.length === 0 && (await P.tenant.count({ where: { id: T } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, left.join(" · ") || "-");
  await prisma.$disconnect();
}
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\n(${Math.round((Date.now() - t0) / 1000)} s) controls ${controls.filter((c) => c.ok).length}/${controls.length} green · finding checks GREEN (= fixed) ${findings.filter((c) => c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "FIXED" : "RED"]) })}`);
process.exit(controls.every((c) => c.ok) && findings.every((c) => c.ok) ? 0 : 1);
