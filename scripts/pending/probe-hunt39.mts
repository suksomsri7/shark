// probe-hunt39.mts — security bug hunt for C3.9 (PDPA erase/export · retention · limits) at a9d4d146 — NOT an oracle · QC1 only
// Run: bash scripts/iso.sh bash scripts/pending/run-hunt39.sh probe-hunt39
// Throwaway tenant `qc-hunt39-<rand>-a` · everything created is removed in finally (every table with tenantId, then tenant/users).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const env = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-plain-art/.test(host)) { console.log(`not QC1 (${host})`); process.exit(1); }
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-hunt39-${rand}`;
const out: Record<string, unknown> = { db: host, tag: TAG };
const TENANTS: string[] = [];
const USERS: string[] = [];
const safe = async <T,>(label: string, f: () => Promise<T>): Promise<T | string> => { try { return await f(); } catch (e) { const x = e as Any; return `ERR ${label}: ${x?.name ?? ""}(${x?.code ?? "-"}) ${String(x?.message ?? e).slice(0, 220)}`; } };

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const PRIV = (await import("@/lib/modules/crm/privacy" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const FORMS = (await import("@/lib/modules/forms/service" as string)) as Any;
  const FBR = (await import("@/lib/platform/crm-bridges/forms" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;

  const t = await P.tenant.create({ data: { name: `${TAG}-a`, slug: `${TAG}-a` } });
  TENANTS.push(t.id);
  const T = t.id as string;
  const mkUser = async (role: string, permissions: Record<string, unknown> = {}) => {
    const u = await P.user.create({ data: { email: `${TAG}-${role.toLowerCase()}-${USERS.length}@qc.invalid`, name: `QC ${role} ${TAG}` } });
    USERS.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    return { userId: u.id as string, role, unitAccess: ["*"], permissions };
  };
  const owner = await mkUser("OWNER");
  const manager = await mkUser("MANAGER");
  // STAFF granted ONLY the CRM erase key (plus read) — no member key at all
  const staff = await mkUser("STAFF", { "crm.contact.read": true, "crm.contact.delete": true });
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  const M = (await sysSvc.createSystem(T, "MEMBER", `สมาชิก ${TAG}`)).id as string;
  const K = (await sysSvc.createSystem(T, "KANBAN", `บอร์ด ${TAG}`)).id as string;
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = '{"crm":{"uiVersion":2,"bridgesEnabled":true}}'::jsonb WHERE "id" = $1`, S);
  const ctxO = { tenantId: T, systemId: S, actorUserId: owner.userId };
  const DEL: string[] = [];
  const PUT: Record<string, Uint8Array> = {};
  const okDeps = { del: async (p: string) => { DEL.push(p); } };
  const scanTables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
    .map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
  const scan = async (toks: string[]) => {
    const hits: Record<string, number> = {};
    for (const tb of scanTables) for (const tk of toks) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" x WHERE x."tenantId" = $1 AND strpos(row_to_json(x)::text, $2) > 0`, T, tk).catch(() => [{ n: 0 }])) as Any[];
      const n = Number(r[0]?.n ?? 0);
      if (n > 0) hits[`${tb}<${tk.slice(0, 14)}>`] = n;
    }
    return hits;
  };

  // ════════ H1 — erase completeness: a lead that came in through the public form (the real C2.6 path) ════════
  {
    const phone = `08${String(Math.floor(Math.random() * 1e8)).padStart(8, "7")}`;
    const email = `hunt.${rand}@qc.invalid`;
    const first = `ฮันต์${rand}`;
    const last = `เดิม${rand}`;
    const newLast = `ใหม่${rand}`;
    const token = `hunt-${randomBytes(10).toString("hex")}`;
    const form = await P.formDef.create({ data: { tenantId: T, name: `ฟอร์มติดต่อ ${TAG}`, publicToken: token, active: true, crmEnabled: true, crmSystemId: S,
      fieldsJson: [{ key: "name", label: "ชื่อ", type: "text", required: true }, { key: "phone", label: "เบอร์", type: "phone" }, { key: "email", label: "อีเมล", type: "email" }, { key: "message", label: "ข้อความ", type: "textarea" }] } });
    const sub = await FORMS.submitPublicForm(token, { name: `${first} ${last}`, phone, email, message: `สนใจแพ็กเกจ โทรกลับที่ ${phone} ค่ะ` }, { ip: "198.51.100.77" });
    await FBR.onFormLead({ id: `hunt-${rand}`, tenantId: T, type: "forms.submission.received", payload: { formId: form.id, submissionId: sub.id } });
    const subRow = await P.formSubmission.findUnique({ where: { id: sub.id } });
    const A = subRow?.crmContactId as string;
    out.H1_lead = { submissionId: sub.id, contactId: A ?? null };
    if (!A) throw new Error("form bridge produced no contact");
    // a normal edit (rename) through the real service ⇒ AuditLog crm.contact.update before/after
    const upd = await safe("updateContact", () => CRM.contacts.updateContact(ctxO, owner, A, { lastName: newLast, jobTitle: `ผู้จัดการ ${rand}` }));
    // another contact B whose thread has A in cc + body mentioning A's phone (by construction — the inbound writer stores cc raw, emails.ts:1908)
    const B = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ลูกค้าบี ${TAG}`, email: `b.${rand}@qc.invalid`, ownerUserId: owner.userId } });
    const mkMail = (data: Record<string, unknown>) => P.crmEmailMessage.create({ data: { tenantId: T, systemId: S, direction: "IN", messageId: `<${randomBytes(8).toString("hex")}@qc.invalid>`, threadKey: randomBytes(8).toString("hex"), subject: "เรื่องแพ็กเกจ", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: randomBytes(16).toString("hex"), ...data } });
    const mB = await mkMail({ contactId: B.id, fromAddr: `b.${rand}@qc.invalid`, toAddrs: ["sales@qc.invalid"], ccAddrs: [email], bodyText: `cc คุณ${first} ${newLast} (${phone}) ด้วยนะครับ`, matchedBy: "EMAIL" });
    // an unmatched inbound mail from A's address (contactId null · matchedBy NONE — what the inbound path stores when strangerToLead is off)
    const mU = await mkMail({ contactId: null, fromAddr: email, fromName: `${first} ${last}`, toAddrs: ["sales@qc.invalid"], bodyText: `สวัสดีค่ะ ${first} ${last} โทร ${phone}`, matchedBy: "NONE" });
    // AI assistant conversation about A (AiConversation/AiMessage are tenant-scoped · the contract lists "AI proposals/prompts")
    const conv = await P.aiConversation.create({ data: { tenantId: T, title: `สรุปลูกค้า ${first}` } });
    await P.aiMessage.create({ data: { tenantId: T, conversationId: conv.id, role: "USER", content: `สรุปลูกค้า ${first} ${newLast} เบอร์ ${phone} อีเมล ${email}` } });
    await P.aiMessage.create({ data: { tenantId: T, conversationId: conv.id, role: "ASSISTANT", content: `คุณ${first} ${newLast} (${phone}) กรอกฟอร์มเมื่อวานนี้` } });
    // a task-board card linked to A (CRM_CONTACT) with a comment + CARD_CREATED history (by construction — shapes of kanban/cards.ts:590)
    const kb = await safe("kanban", async () => {
      const board = await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: "งานขาย" } });
      const col = await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board.id, name: "ต้องทำ" } });
      const card = await P.kanbanCard.create({ data: { tenantId: T, systemId: K, boardId: board.id, columnId: col.id, title: `โทรหา ${first} ${newLast}` } });
      await P.kanbanCardLink.create({ data: { tenantId: T, systemId: K, cardId: card.id, linkType: "CRM_CONTACT", linkId: A, role: "RELATED" } });
      await P.kanbanComment.create({ data: { tenantId: T, cardId: card.id, authorUserId: owner.userId, body: `ลูกค้าให้โทร ${phone} หลัง 5 โมง` } });
      await P.kanbanActivity.create({ data: { tenantId: T, boardId: board.id, cardId: card.id, type: "CARD_CREATED", data: { title: `โทรหา ${first} ${newLast}`, columnId: col.id } } });
      return card.id;
    });
    // a tenant-wide export generated BEFORE the erase (real exportTenant + runExportJobs · put captured)
    const ex = await safe("exportTenant", () => PRIV.exportTenant(ctxO, owner, { format: "CSV" }));
    const run = await safe("runExportJobs", () => PRIV.runExportJobs({ tenantIds: [T], deps: { put: async (p: string, d: Uint8Array) => { PUT[p] = d; } } }));
    const exportText = Object.values(PUT).map((d) => new TextDecoder().decode(d)).join("\n");
    const toks = [phone, email, `${first} ${newLast}`, last, newLast];
    const before = await scan(toks);
    const r = await PRIV.eraseContact(ctxO, owner, { contactId: A, confirm: true, reason: `ลูกค้าขอลบข้อมูล ${TAG}` }, okDeps);
    const after = await scan(toks);
    const exportJob = typeof ex === "object" ? await P.crmImportJob.findUnique({ where: { id: (ex as Any).jobId }, select: { status: true, fileId: true } }) : null;
    out.H1 = {
      updateContact: typeof upd === "string" ? upd : "ok",
      erase: { erased: r.erased, followUp: r.followUp, counts: r.counts },
      scanBefore: before,
      scanAfter: after,
      samples: {
        formSubmissionAnswers: (await P.formSubmission.findUnique({ where: { id: sub.id }, select: { answersJson: true, ip: true, crmContactId: true } })),
        otherThreadCc: (await P.crmEmailMessage.findUnique({ where: { id: mB.id }, select: { contactId: true, ccAddrs: true, bodyText: true } })),
        unmatchedFromA: (await P.crmEmailMessage.findUnique({ where: { id: mU.id }, select: { contactId: true, fromAddr: true, fromName: true, bodyText: true } })),
        aiMessages: (await P.aiMessage.findMany({ where: { conversationId: conv.id }, select: { role: true, content: true } })),
        aiConversationTitle: (await P.aiConversation.findUnique({ where: { id: conv.id }, select: { title: true } }))?.title,
        auditUpdateRows: (await P.auditLog.findMany({ where: { tenantId: T, action: "crm.contact.update", targetId: A }, select: { before: true, after: true } })),
        kanban: typeof kb === "string" && kb.startsWith("ERR") ? kb : {
          cardTitle: (await P.kanbanCard.findUnique({ where: { id: kb }, select: { title: true } }))?.title,
          comments: (await P.kanbanComment.findMany({ where: { cardId: kb }, select: { body: true } })).map((c: Any) => c.body),
          history: (await P.kanbanActivity.findMany({ where: { cardId: kb }, select: { type: true, data: true } })),
        },
        formNotification: (await P.appNotification.findMany({ where: { tenantId: T, title: "มีคนกรอกฟอร์มเข้ามา" }, select: { body: true } })).map((n: Any) => n.body),
        tenantExport: { run, job: exportJob, fileAssetStillThere: exportJob?.fileId ? await P.fileAsset.count({ where: { id: exportJob.fileId } }) : 0, fileContainsPhone: exportText.includes(phone), fileContainsEmail: exportText.includes(email),
          getExportAfterErase: await safe("getExport", async () => { const g = await PRIV.getExport(ctxO, owner, (ex as Any).jobId); return { status: g.status, hasUrl: !!g.url }; }) },
      },
    };

    // ════════ H3 — post-erase writes land on the erased row and are unreachable by any later erase ════════
    const act = await safe("logActivity", () => CRM.activities.logActivity(ctxO, owner, { type: "CALL", title: "ลูกค้าโทรเข้ามา", body: `ลูกค้าโทรกลับจาก ${phone} ขอใบเสนอราคาใหม่ ส่งที่ ${email}`, contactId: A, direction: "IN", done: true }));
    const again = await safe("eraseContact#2", () => PRIV.eraseContact(ctxO, owner, { contactId: A, confirm: true, reason: `ลูกค้าขอลบอีกครั้ง ${TAG}` }, okDeps));
    const bodies = await P.crmActivity.findMany({ where: { tenantId: T, contactId: A, body: { not: null } }, select: { title: true, body: true } });
    out.H3 = {
      logActivityOnErasedContact: typeof act === "string" ? act : { ok: true },
      secondErase: typeof again === "string" ? again : { erased: (again as Any).erased, counts: (again as Any).counts },
      activityBodiesStillOnErasedContact: bodies,
      scanAfterSecondErase: await scan([phone, email]),
    };
  }

  // ════════ H2 — CRM erase key erases a MEMBER record without the member key and around the member approval policy ════════
  {
    const mkCustomer = async (tag: string) => {
      const phone = `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "4")}`;
      const name = `สมาชิก${tag} ${TAG}`;
      const partyId = (await P.party.create({ data: { tenantId: T, name, kind: "PERSON", phone } })).id as string;
      const cust = await P.customer.create({ data: { tenantId: T, memberSystemId: M, name, phone, partyId } });
      return { id: cust.id as string, name, phone, partyId };
    };
    // (a) STAFF with crm.contact.delete only
    const c1 = await mkCustomer("หนึ่ง");
    const k1 = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: c1.name, phone: c1.phone, partyId: c1.partyId, memberCustomerId: c1.id, ownerUserId: staff.userId } });
    const memberSide = await safe("member.requestErase(staff)", () => MEM.requestErase({ tenantId: T, systemId: M, actorUserId: staff.userId }, staff, c1.id, { via: "STAFF", reason: "ลูกค้าขอลบ" }));
    const crmSide = await safe("crm.eraseContact(staff)", () => PRIV.eraseContact({ tenantId: T, systemId: S, actorUserId: staff.userId }, staff, { contactId: k1.id, confirm: true, reason: `ลูกค้าขอลบ ${TAG}` }, okDeps));
    const c1After = await P.customer.findUnique({ where: { id: c1.id }, select: { name: true, phone: true, status: true } });
    // (b) MANAGER while the shop requires OWNER approval for member erasure
    await P.approvalPolicy.create({ data: { tenantId: T, name: `member.erase ${TAG}`, entityType: "member.erase", active: true, steps: { create: [{ tenantId: T, order: 1, approverRole: "OWNER" }] } } });
    const c2 = await mkCustomer("สอง");
    const k2 = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: c2.name, phone: c2.phone, partyId: c2.partyId, memberCustomerId: c2.id, ownerUserId: manager.userId } });
    const memberSide2 = await safe("member.requestErase(manager)", () => MEM.requestErase({ tenantId: T, systemId: M, actorUserId: manager.userId }, manager, c2.id, { via: "STAFF", reason: "ลูกค้าขอลบ" }));
    const c2Mid = await P.customer.findUnique({ where: { id: c2.id }, select: { status: true } });
    const crmSide2 = await safe("crm.eraseContact(manager)", () => PRIV.eraseContact({ tenantId: T, systemId: S, actorUserId: manager.userId }, manager, { contactId: k2.id, confirm: true, reason: `ลูกค้าขอลบ ${TAG}` }, okDeps));
    const c2After = await P.customer.findUnique({ where: { id: c2.id }, select: { name: true, phone: true, status: true } });
    const approvals = await P.approvalRequest.findMany({ where: { tenantId: T, entityType: "member.erase" }, select: { status: true } });
    out.H2 = {
      staff: { memberSideRequestErase: memberSide, crmErase: typeof crmSide === "string" ? crmSide : { erased: (crmSide as Any).erased, memberErased: (crmSide as Any).counts?.memberErased, followUp: (crmSide as Any).followUp }, customerAfter: c1After },
      manager: { memberSideRequestErase: memberSide2, customerAfterMemberRequest: c2Mid, crmErase: typeof crmSide2 === "string" ? crmSide2 : { erased: (crmSide2 as Any).erased, memberErased: (crmSide2 as Any).counts?.memberErased }, customerAfter: c2After, approvalRequests: approvals },
      memberErasedEvents: await P.outboxEvent.count({ where: { tenantId: T, type: "member.erased" } }),
    };
  }
} catch (e) {
  out.fatal = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
} finally {
  await new Promise((r) => setTimeout(r, 4000)); // let the in-process drain scheduled by submitPublicForm settle before cleanup
  for (let pass = 0; pass < 4; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[]).map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) { await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined); await P.tenant.delete({ where: { id } }).catch(() => undefined); }
  for (const id of USERS) { await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined); await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined); await P.user.delete({ where: { id } }).catch(() => undefined); }
  out.cleanup = {
    tenantsLeft: await P.tenant.count({ where: { id: { in: TENANTS } } }),
    usersLeft: await P.user.count({ where: { id: { in: USERS } } }),
    opsLeft: await P.opsEvent.count({ where: { tenantId: { in: TENANTS } } }),
    outboxLeft: await P.outboxEvent.count({ where: { tenantId: { in: TENANTS } } }),
    auditLeft: await P.auditLog.count({ where: { tenantId: { in: TENANTS } } }),
    filesLeft: await P.fileAsset.count({ where: { tenantId: { in: TENANTS } } }),
  };
  console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await prisma.$disconnect();
  process.exit(0);
}
