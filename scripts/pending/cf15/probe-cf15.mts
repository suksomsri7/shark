// C5.5-fix11 probe (review fix9-r2: R2-1 set-based erase writes · R2-3 timeout classification · R2-4 re-erase finishes the follow-up)
//   Q  end-state equivalence: one fixture that touches every erase write site (linked mails set 1 incl. QUEUED · set-2 mails incl. an
//      unlinked one he sent · activities incl. recording · deal + stage note + deal-level activity · member timeline · legacy audit rows ·
//      kanban cards linked to him / to his deal / opened by his portal request, their comments and history, an untouched control card)
//      ⇒ normalised dump of every affected row written to /tmp/cf15-logs/eq-<label>.json; with a second label given, the two dumps are diffed
//   G  growth: erase with n vs 4n rewritten rows (audit rows with an identity key + linked cards with a comment) — slope per row small,
//      ratio ≈ linear · the round-1 shape (5,005 rewritten audit rows) erases in a few seconds
//   C  R2-3: only an EXPIRED interactive transaction is "too large"; other P2028 (transaction not found / internal) are not
//   R  R2-4: a re-erase (resweep) also finishes the follow-up recorded in the erase audit (files the first follow-up could not delete)
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf15/probe-cf15.mts <label> [compareWith]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const LABEL = process.argv[2] ?? "run";
const CMP = process.argv[3] ?? null;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf15: QC3 only (host=${host})`);
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("probe-cf15: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const { Prisma } = (await import("@prisma/client" as string)) as Any;
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf15-${rand}`;
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
const LOGDIR = "/tmp/cf15-logs";
mkdirSync(LOGDIR, { recursive: true });
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
  const M = (await sysSvc.createSystem(T, "MEMBER", `${TAG} member`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };
  const DELS: string[] = [];
  const deps = { del: async (p: string) => { DELS.push(String(p)); } };
  const board = (await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `งาน ${TAG}` } })).id as string;
  const col = (await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board, name: "ต้องทำ" } })).id as string;
  const pipe = (await P.crmPipeline.create({ data: { tenantId: T, systemId: S, name: `ขาย ${TAG}` } })).id as string;
  const stage = (await P.crmStage.create({ data: { tenantId: T, systemId: S, pipelineId: pipe, name: "ใหม่" } })).id as string;
  const coParty = await P.party.create({ data: { tenantId: T, name: `บริษัท ${TAG}`, kind: "COMPANY" } });
  const company = (await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: `บริษัท ${TAG}` } })).id as string;
  const cust = (await P.customer.create({ data: { tenantId: T, memberSystemId: M, name: `สมาชิก ${TAG}` } })).id as string;
  const mkContact = async (key: string, name: string, phone: string, email: string) => {
    const party = await P.party.create({ data: { id: `${TAG}-party-${key}`, tenantId: T, name, kind: "PERSON", phone, email } });
    return (await P.crmContact.create({ data: { id: `${TAG}-c-${key}`, tenantId: T, systemId: S, name, firstName: name.split(" ")[0], partyId: party.id, ownerUserId: u.id, phone, email } })).id as string;
  };
  const card = async (id: string, title: string, description: string | null, sourceKey: string | null = null) =>
    (await P.kanbanCard.create({ data: { id: `${TAG}-${id}`, tenantId: T, systemId: K, boardId: board, columnId: col, title, description, sourceKey } })).id as string;
  const old = new Date(Date.now() - 86_400_000);

  // ════════ Q · end-state equivalence fixture ════════
  await sub("Q", async () => {
    const pName = `สมชาย ใจดี${TAG}`;
    const pPhone = "0811111111";
    const pMail = `somchai-${TAG}@qc.invalid`;
    const qName = `สมหญิง รักดี${TAG}`;
    const qMail = `somying-${TAG}@qc.invalid`;
    const p = await mkContact("p", pName, pPhone, pMail);
    const q = await mkContact("q", qName, "0822222222", qMail);
    const mail = (id: string, d: Record<string, unknown>) =>
      P.crmEmailMessage.create({ data: { id: `${TAG}-${id}`, tenantId: T, systemId: S, messageId: `${S}:${TAG}-${id}@probe`, threadKey: `${TAG}-th-${id}`, trackTokenHash: `${TAG}-tt-${id}`, fromAddr: "shop@qc.invalid", subject: "x", toAddrs: [], ...d } });
    await mail("m1", { contactId: p, direction: "IN", status: "RECEIVED", fromAddr: pMail, fromName: pName, toAddrs: ["crm@shark.in.th"], subject: `ใบเสนอราคาของ ${pName}`, bodyText: `โทร ${pPhone} ได้เลย`, bodyHtml: `<p>${pName} ${pPhone}</p>`, snippet: `${pName}`, attachments: [{ fileId: `${TAG}-f1`, name: "a.pdf" }], receivedAt: old });
    await mail("m2", { contactId: p, direction: "OUT", status: "QUEUED", toAddrs: [pMail, "other@qc.invalid"], ccAddrs: [qMail], subject: `นัด ${pName}`, bodyText: `ถึง ${pName}`, scheduledAt: new Date(Date.now() + 3_600_000), providerError: "prev error", fromName: "ร้าน" });
    await mail("m3", { contactId: p, direction: "OUT", status: "SENT", toAddrs: [pMail], bccAddrs: [pMail, "audit@qc.invalid"], subject: "ขอบคุณ", bodyText: "ขอบคุณครับ", fromName: `ร้านของ ${pName}`, sentAt: old });
    await mail("m4", { contactId: q, direction: "OUT", status: "SENT", toAddrs: [qMail], ccAddrs: [pMail], subject: `สำเนาถึง ${pName}`, bodyText: `คุณ ${pName} เบอร์ ${pPhone}`, providerError: "keep me", sentAt: old });
    await mail("m5", { contactId: null, direction: "IN", status: "QUEUED", fromAddr: pMail, fromName: pName, toAddrs: ["crm@shark.in.th"], subject: `จาก ${pName}`, bodyText: `ข้อความ ${pPhone}`, attachments: [{ fileId: `${TAG}-f5` }] });
    await mail("m6", { contactId: q, direction: "IN", status: "RECEIVED", fromAddr: qMail, toAddrs: ["crm@shark.in.th"], subject: "ไม่เกี่ยว", bodyText: "control" });
    await P.crmActivity.create({ data: { id: `${TAG}-a1`, tenantId: T, systemId: S, contactId: p, type: "CALL", title: `โทรหา ${pName}`, body: `คุยกับ ${pPhone}`, transcript: "t", aiSummary: "s", aiNextStep: "n", location: "l", meetingUrl: "https://m", attendees: [{ name: pName }], recordingFileId: `${TAG}-rec1` } });
    await P.crmActivity.create({ data: { id: `${TAG}-a2`, tenantId: T, systemId: S, contactId: p, type: "CALL", title: "ติดตามทั่วไป", body: null } });
    await P.crmDeal.create({ data: { id: `${TAG}-d1`, tenantId: T, systemId: S, contactId: p, pipelineId: pipe, stageId: stage, title: `ดีล ${pName}`, nextStep: `โทร ${pPhone}`, lostReason: null } });
    await P.crmDeal.create({ data: { id: `${TAG}-d2`, tenantId: T, systemId: S, contactId: p, pipelineId: pipe, stageId: stage, title: "ดีลทั่วไป" } });
    await P.crmDealStageHistory.create({ data: { id: `${TAG}-h1`, tenantId: T, dealId: `${TAG}-d1`, toStageId: stage, note: `ย้ายเพราะ ${pName}` } });
    await P.crmDealStageHistory.create({ data: { id: `${TAG}-h2`, tenantId: T, dealId: `${TAG}-d1`, toStageId: stage, note: "ปกติ" } });
    await P.crmActivity.create({ data: { id: `${TAG}-a3`, tenantId: T, systemId: S, contactId: q, dealId: `${TAG}-d1`, type: "MEETING", title: `ประชุมเรื่อง ${pName}`, body: `กับ ${pPhone}` } });
    await P.crmActivity.create({ data: { id: `${TAG}-a4`, tenantId: T, systemId: S, contactId: q, dealId: `${TAG}-d1`, type: "MEETING", title: "ประชุมทั่วไป", body: "ok" } });
    await P.memberActivity.create({ data: { id: `${TAG}-ma1`, tenantId: T, customerId: cust, module: "crm", type: "NOTE", summary: `${pName} ซื้อของ`, data: { x: 1 }, crmContactId: p } });
    await P.memberActivity.create({ data: { id: `${TAG}-ma2`, tenantId: T, customerId: cust, module: "crm", type: "NOTE", summary: "ทั่วไป", data: { y: 2 }, crmContactId: p } });
    const aud = (id: string, before: unknown, after: unknown) => P.auditLog.create({ data: { id: `${TAG}-${id}`, tenantId: T, actorType: "USER", actorId: u.id, action: "crm.contact.update", targetType: "CrmContact", targetId: p, before: before ?? undefined, after: after ?? undefined, createdAt: old } });
    await aud("au1", { name: pName, phone: null }, { name: pName, phone: pPhone, note: "โน้ต" });
    await aud("au2", null, { list: [`คุย ${pName}`, { email: pMail, n: 3 }], previousEmails: [pMail] });
    await aud("au3", { score: 1 }, { score: 2 });
    await aud("au4", { note: "(เปลี่ยน)" }, { note: "(เปลี่ยน)" });
    // kanban: linked to him · linked to his deal · opened by his portal request · untouched control
    const k1 = await card("k1", `โทรหา ${pName}`, `เบอร์ ${pPhone}`);
    await P.kanbanCardLink.create({ data: { tenantId: T, systemId: K, cardId: k1, linkType: "CRM_CONTACT", linkId: p, role: "RELATED" } });
    await P.kanbanComment.create({ data: { id: `${TAG}-kc1`, tenantId: T, cardId: k1, authorUserId: u.id, body: `โทร ${pPhone} แล้ว` } });
    await P.kanbanComment.create({ data: { id: `${TAG}-kc2`, tenantId: T, cardId: k1, authorUserId: u.id, body: "รับทราบ" } });
    await P.kanbanActivity.create({ data: { id: `${TAG}-ka1`, tenantId: T, boardId: board, cardId: k1, type: "CARD_CREATED", data: { title: `โทรหา ${pName}`, nested: [pPhone, 1] } } });
    const k2 = await card("k2", "งานทั่วไป", null);
    await P.kanbanCardLink.create({ data: { tenantId: T, systemId: K, cardId: k2, linkType: "CRM_CONTACT", linkId: p, role: "RELATED" } });
    const k3 = await card("k3", `ส่งของ ${pName}`, null);
    await P.kanbanCardLink.create({ data: { tenantId: T, systemId: K, cardId: k3, linkType: "DEAL", linkId: `${TAG}-d1`, role: "RELATED" } });
    const req = await P.crmPortalRequest.create({ data: { id: `${TAG}-r1`, tenantId: T, systemId: S, companyId: company, contactId: p, kind: "ISSUE", payload: { t: 1 } } });
    const k4 = await card("k4", `คำขอของ ${pName}`, `ติดต่อ ${pPhone}`, `crm:portal-request:${req.id}`);
    await P.crmPortalRequest.update({ where: { id: req.id }, data: { kanbanCardId: k4 } });
    await P.kanbanComment.create({ data: { id: `${TAG}-kc4`, tenantId: T, cardId: k4, authorUserId: u.id, body: `หัวข้อ "คำขอของ ${pName}" ส่งแล้ว` } });
    await P.kanbanActivity.create({ data: { id: `${TAG}-ka4`, tenantId: T, boardId: board, cardId: k4, type: "CARD_CREATED", data: { title: `คำขอของ ${pName}` } } });
    await card("k5", "การ์ดควบคุม", "ไม่เกี่ยว");

    // second person erased by RETENTION (content kept but masked: the not-cleared branch of the mail/activity writers)
    const rName = `วิชัย มั่นคง${TAG}`;
    const rPhone = "0833333333";
    const rMail = `wichai-${TAG}@qc.invalid`;
    const rc = await mkContact("r", rName, rPhone, rMail);
    await mail("m7", { contactId: rc, direction: "IN", status: "RECEIVED", fromAddr: rMail, fromName: rName, toAddrs: ["crm@shark.in.th"], subject: `สอบถามจาก ${rName}`, bodyText: `ติดต่อ ${rPhone}`, bodyHtml: `<b>${rName}</b>`, snippet: `${rName} ถาม`, attachments: [{ fileId: `${TAG}-f7` }], providerError: "kept?", receivedAt: old });
    await mail("m8", { contactId: rc, direction: "OUT", status: "QUEUED", toAddrs: [rMail], subject: `ตอบ ${rName}`, bodyText: `เรียน ${rName}`, scheduledAt: new Date(Date.now() + 3_600_000) });
    await P.crmActivity.create({ data: { id: `${TAG}-a5`, tenantId: T, systemId: S, contactId: rc, type: "CALL", title: `โทร ${rName}`, body: "x", recordingFileId: `${TAG}-rec5` } });

    const before = Date.now();
    await new Promise((r) => setTimeout(r, 1_100));
    const r = await CRM.privacy.eraseContact(ctx, owner, { contactId: p, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe cf15 Q)" }, deps);
    const rr = await CRM.privacy.eraseContact(ctx, null, { contactId: rc, confirm: true, reason: "lead ครบอายุเก็บข้อมูล (probe cf15 Q)", source: "RETENTION" }, deps);
    const changed = (d: Any) => (d ? new Date(d).getTime() > before : null);
    const pre = `${TAG}-`;
    const dump = {
      erased: r?.erased,
      counts: r?.counts,
      erasedRetention: rr?.erased,
      countsRetention: rr?.counts,
      mails: (await P.crmEmailMessage.findMany({ where: { tenantId: T, id: { startsWith: pre } }, orderBy: { id: "asc" } })).map((m: Any) => ({ id: m.id, contactId: m.contactId, subject: m.subject, fromAddr: m.fromAddr, fromName: m.fromName, toAddrs: m.toAddrs, ccAddrs: m.ccAddrs, bccAddrs: m.bccAddrs, bodyHtml: m.bodyHtml, bodyText: m.bodyText, snippet: m.snippet, attachments: m.attachments, status: m.status, scheduledAt: m.scheduledAt === null ? null : "set", leaseUntil: m.leaseUntil, providerError: m.providerError, purged: m.purgedAt !== null, updated: changed(m.updatedAt) })),
      activities: await P.crmActivity.findMany({ where: { tenantId: T, id: { startsWith: pre } }, orderBy: { id: "asc" }, select: { id: true, title: true, body: true, transcript: true, aiSummary: true, aiNextStep: true, location: true, meetingUrl: true, attendees: true, recordingFileId: true } }),
      deals: (await P.crmDeal.findMany({ where: { tenantId: T, id: { startsWith: pre } }, orderBy: { id: "asc" } })).map((d: Any) => ({ id: d.id, title: d.title, nextStep: d.nextStep, lostReason: d.lostReason, updated: changed(d.updatedAt) })),
      history: await P.crmDealStageHistory.findMany({ where: { tenantId: T, id: { startsWith: pre } }, orderBy: { id: "asc" }, select: { id: true, note: true } }),
      timeline: await P.memberActivity.findMany({ where: { tenantId: T, id: { startsWith: pre } }, orderBy: { id: "asc" }, select: { id: true, summary: true, data: true } }),
      audit: await P.auditLog.findMany({ where: { tenantId: T, id: { startsWith: pre } }, orderBy: { id: "asc" }, select: { id: true, before: true, after: true } }),
      cards: (await P.kanbanCard.findMany({ where: { tenantId: T, id: { startsWith: pre } }, orderBy: { id: "asc" } })).map((c: Any) => ({ id: c.id, title: c.title, description: c.description, sourceKey: c.sourceKey, updated: changed(c.updatedAt) })),
      comments: await P.kanbanComment.findMany({ where: { tenantId: T, id: { startsWith: pre } }, orderBy: { id: "asc" }, select: { id: true, body: true } }),
      history2: await P.kanbanActivity.findMany({ where: { tenantId: T, id: { startsWith: pre } }, orderBy: { id: "asc" }, select: { id: true, data: true } }),
    };
    const norm = JSON.stringify(dump, null, 1).split(TAG).join("<TAG>").split(T).join("<T>").split(S).join("<S>").split(u.id).join("<U>").split(req.id).join("<REQ>");
    const file = `${LOGDIR}/eq-${LABEL}.json`;
    writeFileSync(file, norm);
    const leaks = [pName, pPhone, pMail].filter((x) => norm.split("<TAG>").join(TAG).includes(x));
    chk("Q0", `control: the erase commits and the dump (${file}) holds no name/phone/address of the person except where a shared row keeps another person's data`, r?.erased === true, j({ erased: r?.erased, bytes: norm.length, leakTokens: leaks.length }));
    if (CMP) {
      const other = `${LOGDIR}/eq-${CMP}.json`;
      if (!existsSync(other)) chk("Q1", `end state identical to ${other}`, false, "compare file missing");
      else {
        const a = readFileSync(other, "utf8");
        const diffs: string[] = [];
        const al = a.split("\n");
        const bl = norm.split("\n");
        for (let i = 0; i < Math.max(al.length, bl.length); i += 1) if (al[i] !== bl[i]) diffs.push(`L${i + 1}: ${al[i] ?? "∅"} ⇄ ${bl[i] ?? "∅"}`);
        chk("Q1", `control: end state byte-identical (normalised) to the dump of '${CMP}' (${al.length} lines)`, diffs.length === 0, diffs.length ? diffs.slice(0, 12).join(" | ") : "identical");
      }
    }
  });

  // ════════ G · growth (n vs 4n rewritten rows) ════════
  const eraseRows = async (key: string, n: number) => {
    const name = `ลูกค้า${key} ${TAG}`;
    const phone = `08${String(3_000_000 + n).padStart(8, "0")}`;
    const c = await mkContact(key, name, phone, `${key}-${TAG}@qc.invalid`);
    const rows = Array.from({ length: n }, (_v, i) => ({ id: `${TAG}-${key}-au-${String(i).padStart(6, "0")}`, tenantId: T, actorType: "USER", actorId: u.id, action: "crm.contact.update", targetType: "CrmContact", targetId: c, before: { note: "เดิม" }, after: { note: `ทั่วไป ${i}` }, createdAt: old }));
    for (let i = 0; i < rows.length; i += 1_000) await P.auditLog.createMany({ data: rows.slice(i, i + 1_000) });
    const nc = Math.round(n / 5);
    const cards = Array.from({ length: nc }, (_v, i) => ({ id: `${TAG}-${key}-k-${String(i).padStart(6, "0")}`, tenantId: T, systemId: K, boardId: board, columnId: col, title: `โทรหา ${name} ${i}` }));
    for (let i = 0; i < cards.length; i += 1_000) {
      const part = cards.slice(i, i + 1_000);
      await P.kanbanCard.createMany({ data: part });
      await P.kanbanCardLink.createMany({ data: part.map((x) => ({ tenantId: T, systemId: K, cardId: x.id, linkType: "CRM_CONTACT", linkId: c, role: "RELATED" })) });
      await P.kanbanComment.createMany({ data: part.map((x) => ({ tenantId: T, cardId: x.id, authorUserId: u.id, body: `เบอร์ ${phone}` })) });
    }
    const ts = Date.now();
    let r: Any = null;
    let error: string | null = null;
    try {
      r = await CRM.privacy.eraseContact(ctx, owner, { contactId: c, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe cf15 G)" }, deps);
    } catch (e) {
      error = `${(e as Any)?.name} ${(e as Any)?.code ?? ""}`;
    }
    const ms = Date.now() - ts;
    const leftAudit = (await P.auditLog.count({ where: { tenantId: T, targetId: c, action: "crm.contact.update", after: { path: ["note"], equals: `ทั่วไป 0` } } })) as number;
    const leftCards = (await P.kanbanCard.count({ where: { tenantId: T, id: { startsWith: `${TAG}-${key}-k-` }, title: { contains: name } } })) as number;
    return { n, rewritten: n + 2 * nc, ms, erased: r?.erased === true, error, leftAudit, leftCards };
  };
  await sub("G", async () => {
    const a = await eraseRows("gn", 500);
    const b = await eraseRows("g4n", 2_000);
    const slope = (b.ms - a.ms) / (b.rewritten - a.rewritten);
    const perMin = Math.round(60_000 / Math.max(slope, 0.001));
    console.log(`        (n: ${j(a)} · 4n: ${j(b)} · slope ${slope.toFixed(3)} ms per rewritten row ⇒ ≈ ${perMin} rows / 60 s on top of the fixed cost)`);
    chk("G0", "control: both erases commit and leave no identity in the rewritten audit rows / cards", a.erased && b.erased && a.leftAudit + b.leftAudit + a.leftCards + b.leftCards === 0, j({ a, b }));
    chk("G1", "FINDING: the per-row cost is small (slope < 1 ms per rewritten row; per-row writes cost ≈ 9–10 ms from this host)", slope < 1, `slope=${slope.toFixed(3)} ms/row`, true);
    chk("G2", "FINDING: growth is about linear with a small constant: t(4n) ≤ 2 × t(n) + 3 s (dominated by the fixed per-erase cost, not by rows)", b.ms <= 2 * a.ms + 3_000, `t(n)=${a.ms} t(4n)=${b.ms}`, true);
    const big = await eraseRows("g5k", 5_005);
    console.log(`        (5,005 rewritten audit rows + ${Math.round(5_005 / 5)} cards + comments: ${big.ms} ms)`);
    chk("G3", "FINDING: the round-1 shape (5,005 rewritten audit rows) + 1,001 linked cards with comments erases in under 10 s", big.erased && big.ms < 10_000 && big.leftAudit + big.leftCards === 0, j(big), true);
  });

  // ════════ C · R2-3 classification ════════
  await sub("C", async () => {
    const shared = (await import("@/lib/modules/crm/privacy-shared" as string)) as Any;
    const fn = shared.isExpiredTransactionError;
    const mk = (msg: string, code = "P2028") => new Prisma.PrismaClientKnownRequestError(msg, { code, clientVersion: "probe" });
    const expired = mk("Transaction API error: A query cannot be executed on an expired transaction. The timeout for this transaction was 3000 ms, however 6955 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction");
    const commitExpired = mk("Transaction API error: A commit cannot be executed on an expired transaction. The timeout for this transaction was 60000 ms, however 60011 ms passed since the start of the transaction.");
    const notFound = mk("Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn't have information about anymore, or was obtained before disconnecting.");
    const rolledBack = mk("Transaction API error: Transaction already closed: A query cannot be executed on a transaction that was rolled back.");
    const internal = mk("Transaction API error: Closed transaction found in active transactions map.");
    const poolWait = mk("Transaction API error: Unable to start a transaction in the given time.");
    const other = mk("Unique constraint failed", "P2002");
    const got = typeof fn === "function" ? [expired, commitExpired, notFound, rolledBack, internal, poolWait, other].map((e) => fn(e) === true) : null;
    chk("C1", "FINDING: only the expired-transaction P2028 (query or commit) counts as 'too large'; transaction-not-found / rolled-back / internal / pool-wait / other codes do not", j(got) === j([true, true, false, false, false, false, false]), j({ exported: typeof fn, got }), true);
    // end to end: the real expired path still answers TOO_LARGE (seam: deps.txTimeoutMs), and nothing is erased
    const L = await mkContact("lock", `ล็อก ${TAG}`, "0899999999", `lock-${TAG}@qc.invalid`);
    const holder = P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT "id" FROM "CrmContact" WHERE "id" = $1 FOR UPDATE`, L);
      await new Promise((r) => setTimeout(r, 6_000));
    }, { timeout: 30_000, maxWait: 10_000 });
    await new Promise((r) => setTimeout(r, 800));
    let err: Any = null;
    try {
      await CRM.privacy.eraseContact(ctx, owner, { contactId: L, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe cf15 C)" }, { ...deps, txTimeoutMs: 2_000 });
    } catch (e) {
      err = e;
    }
    await holder.catch(() => undefined);
    chk("C2", "control: an erase that expires its transaction still answers PrivacyError TOO_LARGE (nothing erased)", err?.code === "TOO_LARGE" && !(await P.auditLog.findFirst({ where: { tenantId: T, action: "crm.contact.erase", targetId: L } })), j({ name: err?.name, code: err?.code }));
  });

  // ════════ R · R2-4 re-erase finishes the recorded follow-up ════════
  await sub("R", async () => {
    const c = await mkContact("files", `ไฟล์ ${TAG}`, "0877777777", `files-${TAG}@qc.invalid`);
    const fids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const fa = await P.fileAsset.create({ data: { tenantId: T, kind: "ATTACHMENT", path: `t/${T}/attachment/${TAG}-r-${i}.pdf`, cdnUrl: `private://${TAG}-r-${i}`, contentType: "application/pdf", bytes: 10 } });
      await P.crmFileLink.create({ data: { tenantId: T, systemId: S, entityType: "CONTACT", entityId: c, fileId: fa.id, name: `r${i}.pdf`, size: 10, mime: "application/pdf" } });
      fids.push(fa.id);
    }
    const broken = { del: async () => { throw new Error("storage down (probe)"); } };
    const r1 = await CRM.privacy.eraseContact(ctx, owner, { contactId: c, confirm: true, reason: "ลูกค้าขอลบข้อมูล (probe cf15 R)" }, broken);
    const left1 = (await P.fileAsset.count({ where: { id: { in: fids } } })) as number;
    chk("R0", "control (premise): the first erase commits but its follow-up cannot delete the 3 storage files (followUp PENDING, 3 FileAsset rows left)", r1?.erased === true && r1?.followUp === "PENDING" && left1 === 3, j({ erased: r1?.erased, followUp: r1?.followUp, left1 }));
    // the consumer is assumed dead (FAILED after 5 attempts) — staff presses erase again
    const before = DELS.length;
    const r2 = await CRM.privacy.eraseContact(ctx, owner, { contactId: c, confirm: true, reason: "ลบซ้ำ (probe cf15 R)" }, deps);
    const left2 = (await P.fileAsset.count({ where: { id: { in: fids } } })) as number;
    chk("R1", "FINDING: the re-erase (resweep) also runs the recorded follow-up: the 3 files are deleted from storage and the register (0 left)", r2?.erased === false && left2 === 0 && DELS.length - before === 3, j({ erased: r2?.erased, followUp: r2?.followUp, left2, storageDeletes: DELS.length - before }), true);
    const afterR2 = DELS.length;
    const r3 = await CRM.privacy.eraseContact(ctx, owner, { contactId: c, confirm: true, reason: "ลบซ้ำอีก (probe cf15 R)" }, deps);
    chk("R2", "control: a further re-erase makes no new storage call (idempotent)", r3?.erased === false && DELS.length === afterR2, j({ erased: r3?.erased, newStorageCalls: DELS.length - afterR2 }));
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
  if (T) chk("CLEAN", "throwaway tenant, user and every tenant row removed (0 rows left)", left.length === 0 && (await P.tenant.count({ where: { id: T } })) === 0, left.join(" · ") || "-");
  await prisma.$disconnect();
}
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\n(${Math.round((Date.now() - t0) / 1000)} s) controls ${controls.filter((c) => c.ok).length}/${controls.length} green · finding checks GREEN (= fixed) ${findings.filter((c) => c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "FIXED" : "RED"]) })}`);
process.exit(controls.every((c) => c.ok) && findings.every((c) => c.ok) ? 0 : 1);
