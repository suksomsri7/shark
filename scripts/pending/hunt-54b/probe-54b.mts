// probe-54b.mts — HUNTER C5.4 batch B (authz + PDPA) · NOT an oracle · QC2 only · throwaway tenant `qc-hunt54b-*` (deleted in finally)
// Run: bash scripts/qc2.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/hunt-54b/probe-54b.mts
//   A) portal: link ended the pre-fix way (endedAt only, access not revoked) → staff re-adds → does the OLD session come back?
//      control: the fixed removeContact → re-add → old session must stay dead
//   B) keys: account "rotate key" service takes ANY key id of the tenant — rotate the owner's crm.admin key as an accountant
//   C) erase: residual copies of a SECONDARY deal contact's identity (deal title variants, stage note, deal activity, its kanban card, won post)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { randomBytes } from "node:crypto";
const env = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const { host } = env.loadQcEnv();
if (!/ep-cool-shadow/.test(host) || !String(process.env.DATABASE_URL ?? "").includes("ep-cool-shadow")) {
  console.log(`REFUSE: not QC2 (${host})`);
  process.exit(2);
}
const { prisma } = await import("@/lib/core/db");
const P = prisma as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, "q");
const TAG = `qc-hunt54b-${rand}`;
const FULL = `สมหญิง${rand} ทดสอบลบ${rand}`;
const LOCAL = `somying.${rand}`;
const out: Record<string, unknown> = { tag: TAG };
const TENANTS: string[] = [];
const USERS: string[] = [];
const safe = async <T,>(label: string, f: () => Promise<T>): Promise<T | string> => {
  try { return await f(); } catch (e) { const x = e as Any; return `ERR ${label}: ${x?.name ?? ""}(${x?.code ?? "-"}) ${String(x?.message ?? e).slice(0, 200)}`; }
};
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const keys = (await import("@/lib/api-keys/service" as string)) as Any;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Any;
  const guard = (await import("@/lib/modules/crm/api/key-guard" as string)) as Any;
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
  const settings = { crm: { uiVersion: 2, bridgesEnabled: true, portal: { enabled: true, loginMethods: ["EMAIL_OTP"], showDeals: false, allowIssue: true }, teamRooms: { [team.id]: { meetingSystemId: M, channelId: channel.id } } } };
  await P.$executeRawUnsafe(`UPDATE "AppSystem" SET "settings" = $2::jsonb WHERE "id" = $1`, S, JSON.stringify(settings));
  const ctx = { tenantId: T, systemId: S, actorUserId: u.id };

  // ── A) portal ──
  {
    const party = await P.party.create({ data: { tenantId: T, name: `Co ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: party.id, name: `Co ${TAG}` } });
    const mk = async (n: string) => {
      const c = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `${n} ${TAG}`, firstName: n, email: `${TAG}-${n}@qc.invalid`, ownerUserId: u.id, companyId: co.id } });
      await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co.id, contactId: c.id } });
      const a = await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: co.id, contactId: c.id, role: "APPROVE", invitedById: u.id, acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } });
      const s = await CS.mintPortalSession(a.id, {});
      return { c, a, s };
    };
    const legacy = await mk("legacy");
    const fixed = await mk("fixed");
    const A: Record<string, unknown> = {};
    A.legacy_valid_before = !!(await CS.getPortalSession(legacy.s.token));
    // pre-C5.4-B removeContact = endedAt only (exactly the old code path) — what every ex-employee row on prod looks like today
    await P.crmCompanyContact.updateMany({ where: { companyId: co.id, contactId: legacy.c.id }, data: { endedAt: new Date(), isPrimary: false } });
    A.legacy_valid_after_end = !!(await CS.getPortalSession(legacy.s.token));
    A.readd_legacy = await safe("addContact", () => CRM.companies.addContact(ctx, owner, co.id, { contactId: legacy.c.id }).then(() => "ok"));
    A.legacy_OLD_session_valid_after_readd = !!(await CS.getPortalSession(legacy.s.token));
    // control: fixed path
    A.remove_fixed = await safe("removeContact", () => CRM.companies.removeContact(ctx, owner, co.id, fixed.c.id).then(() => "ok"));
    A.readd_fixed = await safe("addContact2", () => CRM.companies.addContact(ctx, owner, co.id, { contactId: fixed.c.id }).then(() => "ok"));
    A.fixed_OLD_session_valid_after_readd = !!(await CS.getPortalSession(fixed.s.token));
    out.A_portal = A;
  }

  // ── B) key rotation across modules ──
  {
    const B: Record<string, unknown> = {};
    const acc = await P.appSystem.create({ data: { tenantId: T, type: "ACCOUNT", name: `ACC ${TAG}` } });
    const v = await P.user.create({ data: { email: `${TAG}-acct@qc.invalid`, name: `QC accountant ${TAG}` } });
    USERS.push(v.id);
    await P.membership.create({ data: { userId: v.id, tenantId: T, role: "STAFF", unitAccess: ["*"], permissions: { "account.settings.manage": true, "api.key.create": true, "api.key.revoke": true }, acceptedAt: new Date() } });
    const sc = scopes.expandBundles(["crm.admin"]);
    const k = await keys.createApiKey({ tenantId: T }, "owner crm admin", { scopes: sc, systemId: S, createdById: u.id });
    B.owner_key_entitled = await guard.crmKeyCreatorStillEntitled({ tenantId: T, systemId: S, createdById: u.id, scopes: sc });
    const r = await safe("rotate", () => keys.rotateApiKey({ tenantId: T }, k.id, { createdById: v.id }));
    const nk = typeof r === "string" ? null : await P.apiKey.findUnique({ where: { id: (r as Any).id } });
    B.rotated_by_accountant = typeof r === "string" ? r : { newKeySystem: nk?.systemId === S ? "CRM" : nk?.systemId, newKeyCreator: nk?.createdById === v.id ? "accountant" : nk?.createdById, scopesCopied: (nk?.scopesJson as Any[])?.length === sc.length, rawKeyReturned: !!(r as Any).rawKey };
    B.owner_key_revoked = !!(await P.apiKey.findUnique({ where: { id: k.id } }))?.revokedAt;
    B.new_key_passes_guard = nk ? await guard.crmKeyCreatorStillEntitled({ tenantId: T, systemId: S, createdById: v.id, scopes: sc }) : null;
    // mint-time guard (what the CRM settings action would say for this accountant)
    const va = { userId: v.id, role: "STAFF", unitAccess: ["*"], permissions: { "account.settings.manage": true } };
    B.mint_guard_for_accountant = await guard.crmKeyWiderThanCreator({ tenantId: T, systemId: S }, va, sc);
    void acc;
    out.B_keys = B;
  }

  // ── C) erase residue ──
  {
    const pipe = await P.crmPipeline.create({
      data: { tenantId: T, systemId: S, name: `ขาย ${TAG}`, stages: { create: [
        { tenantId: T, systemId: S, name: "ใหม่", kind: "OPEN", probability: 10, sortOrder: 0 },
        { tenantId: T, systemId: S, name: "คุยแล้ว", kind: "OPEN", probability: 50, sortOrder: 1 },
        { tenantId: T, systemId: S, name: "ชนะ", kind: "WON", probability: 100, sortOrder: 2 },
      ] } },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    const board = await P.kanbanBoard.create({ data: { tenantId: T, systemId: K, name: `บอร์ด ${TAG}` } });
    await P.kanbanColumn.create({ data: { tenantId: T, systemId: K, boardId: board.id, name: "ToDo" } });
    const X = await CRM.contacts.createContact(ctx, owner, { firstName: `สมหญิง${rand}`, lastName: `ทดสอบลบ${rand}`, phone: "0891234567", email: `${LOCAL}@qc.invalid` });
    const Y = await CRM.contacts.createContact(ctx, owner, { firstName: `หลัก${rand}`, lastName: `ผู้ซื้อ${rand}`, phone: "0897654321" });
    const xId = X?.row?.id ?? X?.contact?.id ?? X?.id;
    const yId = Y?.row?.id ?? Y?.contact?.id ?? Y?.id;
    const d = await CRM.deals.createDeal(ctx, owner, { pipelineId: pipe.id, stageId: pipe.stages[0].id, title: `ต่อสัญญา ${FULL} โทร 089-123-4567 ${LOCAL}`, contactId: yId });
    const dealId = d?.id ?? d?.deal?.id;
    await P.crmDealContact.create({ data: { tenantId: T, dealId, contactId: xId } });
    await P.crmDeal.update({ where: { id: dealId }, data: { teamId: team.id } });
    const C: Record<string, unknown> = {};
    C.move = await safe("move", () => CRM.deals.moveDeal(ctx, owner, dealId, { stageId: pipe.stages[1].id, note: `คุยกับ ${FULL} แล้ว` }).then(() => "ok"));
    const act = await safe("act", () => CRM.activities.logActivity(ctx, owner, { type: "TASK", title: `นัด ${FULL}`, dealId, dueAt: new Date() }));
    const actId = (act as Any)?.row?.id ?? (act as Any)?.activity?.id ?? (act as Any)?.id;
    C.act = typeof act === "string" ? act : "ok";
    C.card = await safe("card", () => CRM.activities.openTaskCard(ctx, owner, { activityId: actId, boardId: board.id }).then((r: Any) => (r?.cardId ? "ok" : r)));
    C.won = await safe("won", () => CRM.aiBridges.onDealWonTeamRoom({ id: `won-${rand}`, tenantId: T, type: "crm.deal.won", payload: { dealId }, systemId: S }).then(() => "ok"));
    await safe("ctl", () => CRM.activities.logActivity(ctx, owner, { type: "TASK", title: `โทรหา ${FULL}`, contactId: xId, dueAt: new Date() }));
    const has = (s: unknown) => String(s ?? "").includes(FULL);
    const snap = async () => {
      const deal = await P.crmDeal.findUnique({ where: { id: dealId }, select: { title: true } });
      const hist = (await P.crmDealStageHistory.findMany({ where: { dealId }, select: { note: true } })) as Any[];
      const acts = (await P.crmActivity.findMany({ where: { tenantId: T }, select: { title: true, contactId: true } })) as Any[];
      const cards = (await P.kanbanCard.findMany({ where: { tenantId: T }, select: { title: true } })) as Any[];
      const msgs = (await P.meetingMessage.findMany({ where: { tenantId: T }, select: { body: true } })) as Any[];
      return {
        dealTitle: deal?.title,
        dealTitle_hasName: has(deal?.title), dealTitle_hasDashedPhone: String(deal?.title).includes("089-123-4567"), dealTitle_hasEmailLocal: String(deal?.title).includes(LOCAL),
        stageNotesWithName: hist.filter((h) => has(h.note)).length,
        dealActivityWithName: acts.filter((a) => a.contactId !== xId && has(a.title)).length,
        ownActivityWithName: acts.filter((a) => a.contactId === xId && has(a.title)).length,
        cardsWithName: cards.filter((c) => has(c.title)).length,
        wonPostsWithName: msgs.filter((m) => has(m.body)).length,
      };
    };
    C.before = await snap();
    const er = await safe("erase", () => CRM.privacy.eraseContact(ctx, owner, { contactId: xId, confirm: true, reason: `hunter 54b probe ${TAG}` }));
    C.erase = typeof er === "string" ? er : { erased: (er as Any).erased };
    C.after = await snap();
    out.C_erase = C;
  }
} catch (e) {
  out.fatal = e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 4).join("\n")}` : String(e);
} finally {
  for (let pass = 0; pass < 4; pass += 1) {
    const tables = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
      .map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x));
    for (const tb of tables) for (const id of TENANTS) await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id).catch(() => undefined);
  }
  for (const id of TENANTS) {
    await P.appSystem.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
    await P.tenant.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: id } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.session.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await P.user.delete({ where: { id } }).catch(() => undefined);
  }
  out.cleanup = { tenantsLeft: await P.tenant.count({ where: { id: { in: TENANTS } } }), usersLeft: await P.user.count({ where: { id: { in: USERS } } }) };
  console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  await prisma.$disconnect();
  process.exit(0);
}
