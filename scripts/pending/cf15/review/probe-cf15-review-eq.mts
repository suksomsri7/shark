// C5.5-fix11 REVIEW — adversarial end-state equivalence (base 3e9930ec per-row Prisma writes vs tip set-based raw writes).
//   Same deterministic fixture, same erases (REQUEST of P · RETENTION of R); the dump is read with RAW SQL so it sees what Prisma hides:
//   SQL NULL vs JSON null (`IS NULL` + `jsonb_typeof`), exact jsonb text (big numbers, unicode, escapes), text[] NULL vs '{}' and
//   element text (commas, quotes, braces, backslashes, "NULL", ""), enum status, timestamp "changed after the erase started" flags.
//   Run once per code tree with a label; with a second label the two dumps are diffed line by line.
// Run (QC3): bash scripts/iso.sh bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf15/review/probe-cf15-review-eq.mts <label> [compareLabel]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

if (!/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? "")) || !/ep-weathered-river/.test(String(process.env.DIRECT_URL ?? ""))) {
  console.error("probe-cf15-review-eq: QC3 only (export DATABASE_URL/DIRECT_URL through scripts/qc3.sh)");
  process.exit(4);
}
globalThis.fetch = (async () => {
  throw new Error("network blocked");
}) as typeof fetch;
const LABEL = String(process.argv[2] ?? "run");
const CMP = process.argv[3] ? String(process.argv[3]) : null;
const LOGDIR = "/tmp/cf15-review-logs";
mkdirSync(LOGDIR, { recursive: true });

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf15e-${rand}`;
const T = `${TAG}-t`;
const UID = `${TAG}-u`;
let ok = true;
const out: string[] = [];
const log = (s: string) => {
  out.push(s);
  console.log(s);
};

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  await P.tenant.create({ data: { id: T, name: TAG, slug: TAG } });
  await P.user.create({ data: { id: UID, email: `${TAG}-owner@qc.invalid`, name: `QC ${TAG}` } });
  await P.membership.create({ data: { userId: UID, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: UID, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  const K = (await sysSvc.createSystem(T, "KANBAN", `${TAG} board`)).id as string;
  const M = (await sysSvc.createSystem(T, "MEMBER", `${TAG} member`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true }),
    S,
  );
  const ctx = { tenantId: T, systemId: S, actorUserId: UID };
  const deps = { del: async (_p: string) => undefined };
  const id = (k: string) => `${TAG}-${k}`;
  await P.kanbanBoard.create({ data: { id: id("board"), tenantId: T, systemId: K, name: "งาน" } });
  await P.kanbanColumn.create({ data: { id: id("col"), tenantId: T, systemId: K, boardId: id("board"), name: "ต้องทำ" } });
  await P.crmPipeline.create({ data: { id: id("pipe"), tenantId: T, systemId: S, name: "ขาย" } });
  await P.crmStage.create({ data: { id: id("stage"), tenantId: T, systemId: S, pipelineId: id("pipe"), name: "ใหม่" } });
  await P.party.create({ data: { id: id("coparty"), tenantId: T, name: "บริษัท ทดสอบ", kind: "COMPANY" } });
  await P.crmCompany.create({ data: { id: id("co"), tenantId: T, systemId: S, partyId: id("coparty"), name: "บริษัท ทดสอบ" } });
  await P.customer.create({ data: { id: id("cust"), tenantId: T, memberSystemId: M, name: "สมาชิก" } });
  const mkContact = async (key: string, name: string, phone: string, email: string) => {
    await P.party.create({ data: { id: id(`party-${key}`), tenantId: T, name, kind: "PERSON", phone, email } });
    await P.crmContact.create({ data: { id: id(`c-${key}`), tenantId: T, systemId: S, name, firstName: name.split(" ")[0], partyId: id(`party-${key}`), ownerUserId: UID, phone, email } });
    return id(`c-${key}`);
  };
  // person P (REQUEST) — a name with a quote, an emoji and a backslash
  const pName = `ปิยะ "พี่" 😀 O\\Neil ${rand}`;
  const pPhone = "0891234567";
  const pMail = `piya-${rand}@qc.invalid`;
  const qName = `ควบคุม คงเดิม ${rand}`;
  const qMail = `control-${rand}@qc.invalid`;
  const rName = `รักษา อายุเก็บ ${rand}`;
  const rPhone = "0897654321";
  const rMail = `retain-${rand}@qc.invalid`;
  const p = await mkContact("p", pName, pPhone, pMail);
  const q = await mkContact("q", qName, "0880000000", qMail);
  const r = await mkContact("r", rName, rPhone, rMail);
  const old = new Date(Date.now() - 86_400_000);
  const mail = (k: string, d: Record<string, unknown>) =>
    P.crmEmailMessage.create({ data: { id: id(k), tenantId: T, systemId: S, messageId: `<${id(k)}@probe>`, threadKey: id(`th-${k}`), trackTokenHash: id(`tt-${k}`), fromAddr: "shop@qc.invalid", subject: "x", toAddrs: [], ...d } });
  // set 1 (linked to P): addresses with comma, braces, quotes, backslash, unicode; empty cc; providerError cleared
  await mail("e1", { contactId: p, direction: "IN", status: "RECEIVED", fromAddr: pMail, fromName: pName, toAddrs: [`"Doe, John {x}" <doe@qc.invalid>`, `back\\slash@qc.invalid`, `ünï@qc.invalid`, `"NULL"@qc.invalid`], ccAddrs: [], bccAddrs: [`"quo\\"ted" <${pMail}>`], subject: `เรื่อง ${pName}`, bodyText: `โทร ${pPhone} บรรทัด`, bodyHtml: `<p>${pName}</p>`, snippet: pName, attachments: [{ fileId: id("f1"), meta: { n: null, big: 1e300 } }], providerError: "boom", receivedAt: old });
  await mail("e2", { contactId: p, direction: "OUT", status: "QUEUED", toAddrs: [pMail], subject: `นัด ${pName}`, bodyText: "x", scheduledAt: new Date(Date.now() + 3_600_000), providerError: "prev" });
  // set 2 (someone else's mail that carries P's address): element texts "NULL" and "" and a brace
  await mail("e3", { contactId: q, direction: "OUT", status: "SENT", toAddrs: [qMail, `"P, alias" <${pMail}>`, "NULL", "", "{brace}@qc.invalid"], ccAddrs: [`with"quote@qc.invalid`], subject: `ถึง ${qName} เรื่อง ${pName}`, bodyText: `เบอร์ ${pPhone} ของ ${pName}`, providerError: "keep me", sentAt: old });
  await mail("e4", { contactId: null, direction: "IN", status: "QUEUED", fromAddr: pMail, toAddrs: ["crm@shark.in.th"], subject: `จาก ${pName}`, bodyText: "y", attachments: { odd: "object not array" } });
  // RETENTION person: masked, not cleared
  await mail("e5", { contactId: r, direction: "IN", status: "RECEIVED", fromAddr: rMail, fromName: rName, toAddrs: ["crm@shark.in.th"], subject: `ถาม ${rName} 🙂`, bodyText: `ติดต่อ ${rPhone} \\ "q"`, bodyHtml: `<b>${rName}</b>\n<i>${rPhone}</i>`, snippet: `${rName}…`, attachments: [{ fileId: id("f5") }], providerError: "kept", receivedAt: old });
  await mail("e6", { contactId: r, direction: "OUT", status: "QUEUED", toAddrs: [rMail], subject: `ตอบ ${rName}`, bodyText: `เรียน ${rName}`, attachments: [{ fileId: id("f6") }], scheduledAt: new Date(Date.now() + 3_600_000) });
  // activities / deals / stage notes / deal-level activity / member timeline
  await P.crmActivity.create({ data: { id: id("a1"), tenantId: T, systemId: S, contactId: p, type: "CALL", title: `โทร "${pName}"`, body: "b", transcript: "t", aiSummary: "s", aiNextStep: "n", location: "l", meetingUrl: "https://m", attendees: [{ name: pName, n: null }], recordingFileId: id("rec1") } });
  await P.crmActivity.create({ data: { id: id("a2"), tenantId: T, systemId: S, contactId: r, type: "CALL", title: `โทร ${rName}`, body: `b ${rPhone}`, attendees: { k: [1, null] }, recordingFileId: id("rec2") } });
  await P.crmDeal.create({ data: { id: id("d1"), tenantId: T, systemId: S, contactId: p, pipelineId: id("pipe"), stageId: id("stage"), title: `ดีล ${pName}`, nextStep: null, lostReason: `เหตุ ${pPhone}` } });
  await P.crmDeal.create({ data: { id: id("d2"), tenantId: T, systemId: S, contactId: p, pipelineId: id("pipe"), stageId: id("stage"), title: "ดีลเฉย ๆ" } });
  await P.crmDealStageHistory.create({ data: { id: id("h1"), tenantId: T, dealId: id("d1"), toStageId: id("stage"), note: `ย้าย ${pName} \\n` } });
  await P.crmActivity.create({ data: { id: id("a3"), tenantId: T, systemId: S, contactId: q, dealId: id("d1"), type: "MEETING", title: pName, body: null } });
  await P.memberActivity.create({ data: { id: id("ma1"), tenantId: T, customerId: id("cust"), module: "crm", type: "NOTE", summary: `${pName} ซื้อ`, data: { n: null, a: [1] }, crmContactId: p } });
  // audit trail — inserted with raw SQL so the stored jsonb is exactly this text (JSON null vs SQL NULL · big numbers · unicode · escapes)
  const aud = async (k: string, before: string | null, after: string | null) =>
    P.$executeRawUnsafe(
      `INSERT INTO "AuditLog" ("id","tenantId","actorType","actorId","action","targetType","targetId","before","after","createdAt") VALUES ($1,$2,'USER',$3,'crm.contact.update','CrmContact',$4,$5::jsonb,$6::jsonb,$7)`,
      id(k), T, UID, p, before, after, old,
    );
  const js = (s: string) => JSON.stringify(s).slice(1, -1);
  await aud("au1", "null", `{"z":1,"a":{"phone":"${pPhone}","deep":[{"name":"${js(pName)}"},null,true,12345678901234567890,1.5e300,-0,0.1]},"emoji":"😀","esc":"line\\nbreak \\"q\\" \\\\ back \\u2028"}`);
  await aud("au2", null, `{"note":"free ${pPhone}","keep":12345678901234567890}`);
  await aud("au3", `{"b":1,"a":12345678901234567890}`, `{"b":2}`);
  await aud("au4", `"${pPhone}"`, `["${js(pName)}",{"email":"${pMail}"},[],{}]`);
  await aud("au5", `{"phone":null}`, `{"phone":"(เปลี่ยน)"}`);
  // kanban: card linked to P, a portal-request card (redact path), control card
  const card = (k: string, title: string, description: string | null, sourceKey: string | null = null) =>
    P.kanbanCard.create({ data: { id: id(k), tenantId: T, systemId: K, boardId: id("board"), columnId: id("col"), title, description, sourceKey } });
  await card("k1", `"โทร" \\ ${pName}`, null);
  await P.kanbanCardLink.create({ data: { tenantId: T, systemId: K, cardId: id("k1"), linkType: "CRM_CONTACT", linkId: p, role: "RELATED" } });
  await P.kanbanComment.create({ data: { id: id("kc1"), tenantId: T, cardId: id("k1"), authorUserId: UID, body: `โทร ${pPhone} 😀 "ok" \\` } });
  await P.$executeRawUnsafe(
    `INSERT INTO "KanbanActivity" ("id","tenantId","boardId","cardId","type","data","createdAt") VALUES ($1,$2,$3,$4,'CARD_CREATED',$5::jsonb,now())`,
    id("ka1"), T, id("board"), id("k1"), `{"z":"${js(pName)}","a":[null,12345678901234567890,"${pPhone}"],"esc":"\\\\"}`,
  );
  await P.$executeRawUnsafe(
    `INSERT INTO "KanbanActivity" ("id","tenantId","boardId","cardId","type","data","createdAt") VALUES ($1,$2,$3,$4,'CARD_CREATED','null'::jsonb,now())`,
    id("ka2"), T, id("board"), id("k1"),
  );
  await P.crmPortalRequest.create({ data: { id: id("req"), tenantId: T, systemId: S, companyId: id("co"), contactId: p, kind: "ISSUE", payload: { t: 1 } } });
  await card("k2", `คำขอของ ${pName}`, `ติดต่อ ${pPhone}`, `crm:portal-request:${id("req")}`);
  await P.crmPortalRequest.update({ where: { id: id("req") }, data: { kanbanCardId: id("k2") } });
  await P.kanbanComment.create({ data: { id: id("kc2"), tenantId: T, cardId: id("k2"), authorUserId: UID, body: `อ้าง "คำขอของ ${pName}"` } });
  await card("k3", "ควบคุม", "ไม่เกี่ยว");

  const startedSql = new Date().toISOString();
  await new Promise((res) => setTimeout(res, 1_100));
  const r1 = await CRM.privacy.eraseContact(ctx, owner, { contactId: p, confirm: true, reason: "ลูกค้าขอลบข้อมูล (review eq)" }, deps);
  const r2 = await CRM.privacy.eraseContact(ctx, null, { contactId: r, confirm: true, reason: "lead ครบอายุเก็บข้อมูล (review eq)", source: "RETENTION" }, deps);
  const like = `${TAG}-%`;
  const q1 = async (sql: string) => (await P.$queryRawUnsafe(sql, T, like, startedSql)) as Any[];
  const ts = (c: string) => `CASE WHEN x."${c}" IS NULL THEN 'null' WHEN x."${c}" > ($3::timestamptz AT TIME ZONE 'UTC') THEN 'after' ELSE 'before' END AS "${c}"`;
  const arr = (c: string) => `CASE WHEN x."${c}" IS NULL THEN 'SQLNULL' ELSE array_to_json(x."${c}")::text END AS "${c}"`;
  const jb = (c: string) => `CASE WHEN x."${c}" IS NULL THEN 'SQLNULL' ELSE x."${c}"::text END AS "${c}"`;
  const dump = {
    erase: { p: { erased: r1?.erased, followUp: r1?.followUp, counts: r1?.counts }, r: { erased: r2?.erased, followUp: r2?.followUp, counts: r2?.counts } },
    mails: await q1(`SELECT x."id", x."subject", x."fromAddr", x."fromName", ${arr("toAddrs")}, ${arr("ccAddrs")}, ${arr("bccAddrs")}, x."bodyHtml", x."bodyText", x."snippet", ${jb("attachments")}, x."status"::text AS "status", ${ts("scheduledAt")}, ${ts("leaseUntil")}, x."providerError", ${ts("purgedAt")}, ${ts("updatedAt")} FROM "CrmEmailMessage" x WHERE x."tenantId" = $1 AND x."id" LIKE $2 ORDER BY x."id"`),
    activities: await q1(`SELECT x."id", x."title", x."body", x."transcript", x."aiSummary", x."aiNextStep", x."location", x."meetingUrl", ${jb("attendees")}, x."recordingFileId" FROM "CrmActivity" x WHERE x."tenantId" = $1 AND x."id" LIKE $2 AND $3::text IS NOT NULL ORDER BY x."id"`),
    deals: await q1(`SELECT x."id", x."title", x."nextStep", x."lostReason", ${ts("updatedAt")} FROM "CrmDeal" x WHERE x."tenantId" = $1 AND x."id" LIKE $2 ORDER BY x."id"`),
    notes: await q1(`SELECT x."id", x."note" FROM "CrmDealStageHistory" x WHERE x."tenantId" = $1 AND x."id" LIKE $2 AND $3::text IS NOT NULL ORDER BY x."id"`),
    timeline: await q1(`SELECT x."id", x."summary", ${jb("data")} FROM "MemberActivity" x WHERE x."tenantId" = $1 AND x."id" LIKE $2 AND $3::text IS NOT NULL ORDER BY x."id"`),
    audit: await q1(`SELECT x."id", ${jb("before")}, ${jb("after")}, jsonb_typeof(x."before") AS "tb", jsonb_typeof(x."after") AS "ta" FROM "AuditLog" x WHERE x."tenantId" = $1 AND x."id" LIKE $2 AND $3::text IS NOT NULL ORDER BY x."id"`),
    cards: await q1(`SELECT x."id", x."title", x."description", x."sourceKey", ${ts("updatedAt")} FROM "KanbanCard" x WHERE x."tenantId" = $1 AND x."id" LIKE $2 ORDER BY x."id"`),
    comments: await q1(`SELECT x."id", x."body" FROM "KanbanComment" x WHERE x."tenantId" = $1 AND x."id" LIKE $2 AND $3::text IS NOT NULL ORDER BY x."id"`),
    history: await q1(`SELECT x."id", ${jb("data")}, jsonb_typeof(x."data") AS "t" FROM "KanbanActivity" x WHERE x."tenantId" = $1 AND x."id" LIKE $2 AND $3::text IS NOT NULL ORDER BY x."id"`),
    eraseAudit: await q1(`SELECT x."after" - 'reason' AS "after" FROM "AuditLog" x WHERE x."tenantId" = $1 AND x."action" = 'crm.contact.erase' AND $2::text IS NOT NULL AND $3::text IS NOT NULL ORDER BY x."targetId"`),
  };
  let norm = JSON.stringify(dump, null, 1);
  for (const [k, v] of [[TAG, "<TAG>"], [rand, "<R>"], [S, "<S>"], [K, "<K>"], [M, "<M>"]] as const) norm = norm.split(v === "<R>" ? k : k).join(v);
  const file = `${LOGDIR}/eq-${LABEL}.json`;
  writeFileSync(file, norm);
  log(`DUMP ${file} lines=${norm.split("\n").length} erasedP=${r1?.erased} erasedR=${r2?.erased}`);
  if (CMP) {
    const other = `${LOGDIR}/eq-${CMP}.json`;
    if (!existsSync(other)) {
      ok = false;
      log(`COMPARE missing ${other}`);
    } else {
      const al = readFileSync(other, "utf8").split("\n");
      const bl = norm.split("\n");
      const diffs: string[] = [];
      for (let i = 0; i < Math.max(al.length, bl.length); i += 1) if (al[i] !== bl[i]) diffs.push(`L${i + 1}: ${al[i] ?? "∅"} ⇄ ${bl[i] ?? "∅"}`);
      ok = diffs.length === 0;
      log(`COMPARE ${CMP} vs ${LABEL}: ${diffs.length === 0 ? `IDENTICAL (${al.length} lines)` : `${diffs.length} differing lines`}`);
      for (const d of diffs.slice(0, 40)) log(`  ${d.slice(0, 400)}`);
    }
  }
} catch (e) {
  ok = false;
  log(`ERROR ${e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 800) : String(e)}`);
} finally {
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((x) => String(x.table_name)).filter((t) => /^[A-Za-z_]+$/.test(t));
  await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
  for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
  await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
  await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
  let left = 0;
  for (const t of tables) left += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[])?.[0]?.n ?? 0);
  await P.membership.deleteMany({ where: { userId: UID } }).catch(() => undefined);
  await P.user.delete({ where: { id: UID } }).catch(() => undefined);
  log(`CLEAN left=${left} tenant=${await P.tenant.count({ where: { id: T } })} user=${await P.user.count({ where: { id: UID } })}`);
  if (left) ok = false;
  await prisma.$disconnect();
}
process.exit(ok ? 0 : 1);
