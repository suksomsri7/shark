// probe-erase-residue.mts — HUNTER C5.2 lens L5 (PDPA): what copies of a contact's name survive `privacy.eraseContact`
//   NOT an oracle · QC2 only · throwaway tenant `qc-hunt-l5-*` (deleted in finally)
// Run: bash scripts/qc2.sh pnpm exec tsx scripts/pending/hunt-l5/probe-erase-residue.mts
// Paths exercised (all real service code, no hand-written rows for the leaking copies):
//   A) deals.createDeal with the title the convert sheet pre-fills (`ดีล ${contactName}` — Contact360Actions.tsx:113)
//   B) automation rule on crm.contact.updated: OPEN_KANBAN_CARD title "โทรหา {ชื่อ}" + CREATE_DEAL titleTpl "ดีลอัตโนมัติ {ชื่อ}" via runForCrmEvent
//   C) aiBridges.onHotLeadTeamRoom → MEETING team room post "🔥 lead ร้อน: <name>"
//   D) positive control: an activity titled with the name (erase masks it)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";

const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host)) {
  console.log(`not QC2 (${host})`);
  process.exit(1);
}
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-hunt-l5-${rand}`;
const FIRST = `สมหญิง${rand}`;
const LAST = `ทดสอบลบ${rand}`;
const FULL = `${FIRST} ${LAST}`;
const out: Record<string, unknown> = { tag: TAG, name: FULL };
const TENANTS: string[] = [];
const USERS: string[] = [];
const safe = async <T,>(label: string, f: () => Promise<T>): Promise<T | string> => {
  try {
    return await f();
  } catch (e) {
    const x = e as Any;
    return `ERR ${label}: ${x?.name ?? ""}(${x?.code ?? "-"}) ${String(x?.message ?? e).slice(0, 200)}`;
  }
};

try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  TENANTS.push(t.id);
  const T = t.id as string;
  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC owner ${TAG}` } });
  USERS.push(u.id);
  await P.membership.create({ data: { userId: u.id, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const owner = { userId: u.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
  const S = (await sysSvc.createSystem(T, "CRM", `CRM ${TAG}`)).id as string;
  const K = (await sysSvc.createSystem(T, "KANBAN", `KB ${TAG}`)).id as string;
  const M = (await sysSvc.createSystem(T, "MEETING", `MT ${TAG}`)).id as string;
  const team = await P.team.create({ data: { tenantId: T, name: `ทีม ${TAG}` } });
  const channel = await P.meetingChannel.create({ data: { tenantId: T, systemId: M, name: `room-${rand}`, createdByUserId: u.id } });
  const settings = { crm: { uiVersion: 2, bridgesEnabled: true, teamRooms: { [team.id]: { meetingSystemId: M, channelId: channel.id } } } };
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = $2::jsonb WHERE "id" = $1`, S, JSON.stringify(settings));
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };

  const board = await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `บอร์ด ${TAG}` } });
  await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board.id, name: "ToDo" } });
  const pipe = await P.crmPipeline.create({
    data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, stages: { create: [{ tenantId: T, systemId: S, name: "ใหม่", kind: "OPEN", probability: 10, sortOrder: 0 }] } },
    include: { stages: true },
  });

  const created = await safe("createContact", () => CRM.contacts.createContact(ctx, owner, { firstName: FIRST, lastName: LAST, phone: "0891234567" }));
  const X = (created as Any)?.row?.id ?? (created as Any)?.contact?.id ?? (created as Any)?.id;
  out.contact = typeof created === "string" ? created : { id: X };
  await P.crmContact.update({ where: { id: X }, data: { teamId: team.id, score: 90 } });

  // A) deal with the convert-sheet default title
  const dealA = await safe("createDeal", () => CRM.deals.createDeal(ctx, owner, { pipelineId: pipe.id, stageId: pipe.stages[0].id, title: `ดีล ${FULL}`, contactId: X }));
  out.dealA = typeof dealA === "string" ? dealA : "ok";

  // B) real automation rule, fired by the engine
  const rule = await safe("createRule", () =>
    CRM.automation.createRule(ctx, owner, {
      name: `กฎ ${TAG}`,
      trigger: { event: "crm.contact.updated" },
      actions: [
        { type: "OPEN_KANBAN_CARD", params: { boardId: board.id, title: "โทรหา {ชื่อ}" } },
        { type: "CREATE_DEAL", params: { pipelineId: pipe.id, titleTpl: "ดีลอัตโนมัติ {ชื่อ}" } },
      ],
      enabled: true,
    }),
  );
  out.rule = typeof rule === "string" ? rule : "ok";
  const fired = await safe("runForCrmEvent", () =>
    CRM.automation.runForCrmEvent({ tenantId: T, systemId: S, type: "crm.contact.updated", payload: { contactId: X, changedKeys: ["tags"] }, id: `evt-${rand}`, idempotencyKey: `crm.contact.updated#${X}#${rand}` }),
  );
  out.fired = fired;

  // C) hot-lead team room post (the `crm.score.threshold` compose side)
  const hot = await safe("onHotLeadTeamRoom", () => CRM.aiBridges.onHotLeadTeamRoom({ id: `hot-${rand}`, tenantId: T, type: "crm.score.threshold", payload: { contactId: X, band: "HOT" }, systemId: S }));
  out.hot = hot === undefined ? "ok" : hot;

  // D) positive control
  await safe("activity", () => CRM.activities.logActivity(ctx, owner, { type: "TASK", title: `โทรหา ${FULL}`, contactId: X, dueAt: new Date() }));

  const snapshot = async () => {
    const deals = (await P.crmDeal.findMany({ where: { tenantId: T }, select: { title: true } })) as Any[];
    const cards = (await P.kanbanCard.findMany({ where: { tenantId: T }, select: { title: true, id: true } })) as Any[];
    const links = (await P.kanbanCardLink.count({ where: { tenantId: T, linkType: "CRM_CONTACT" } })) as number;
    const msgs = (await P.meetingMessage.findMany({ where: { tenantId: T }, select: { body: true } })) as Any[];
    const acts = (await P.crmActivity.findMany({ where: { tenantId: T, contactId: X }, select: { title: true } })) as Any[];
    const has = (s: unknown) => String(s ?? "").includes(FULL) || String(s ?? "").includes(FIRST);
    return {
      dealTitlesWithName: deals.filter((d) => has(d.title)).map((d) => d.title),
      cardTitlesWithName: cards.filter((c) => has(c.title)).map((c) => c.title),
      cardsLinkedToContact: links,
      meetingBodiesWithName: msgs.filter((m) => has(m.body)).map((m) => m.body),
      activityTitlesWithName: acts.filter((a) => has(a.title)).map((a) => a.title),
    };
  };
  out.before = await snapshot();
  const er = await safe("erase", () => CRM.privacy.eraseContact(ctx, owner, { contactId: X, confirm: true, reason: `hunter L5 probe ${TAG}` }));
  out.erase = typeof er === "string" ? er : { erased: (er as Any).erased, counts: (er as Any).counts };
  out.after = await snapshot();
  const a = out.after as Any;
  out.verdict = {
    dealTitleLeak: a.dealTitlesWithName.length,
    kanbanCardLeak: a.cardTitlesWithName.length,
    meetingPostLeak: a.meetingBodiesWithName.length,
    positiveControlActivityMasked: a.activityTitlesWithName.length === 0 && (out.before as Any).activityTitlesWithName.length > 0,
  };
} catch (e) {
  out.fatal = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
} finally {
  for (let pass = 0; pass < 4; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
      .map((r) => String(r.table_name))
      .filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) {
    await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
    await P.tenant.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.user.delete({ where: { id } }).catch(() => undefined);
  }
  out.cleanup = { tenantsLeft: await P.tenant.count({ where: { id: { in: TENANTS } } }), usersLeft: await P.user.count({ where: { id: { in: USERS } } }) };
  console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await prisma.$disconnect();
  process.exit(0);
}
