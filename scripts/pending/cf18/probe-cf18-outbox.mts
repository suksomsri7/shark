// C5.5-fix13 probe — scope addition P-it5-2 (write paths that never wake the outbox drain) + P-it5-3 (/u done page viewport).
//   RED on 839b348e · GREEN on the fix. Own throwaway tenant `qc-cf18-*` on QC3 · CLEAN at the end.
//   OUTBOX GUARD (same as qc-crm-c5.3): every outbox candidate query of THIS process sees only this run's tenant ⇒ a drain woken by our writes
//   can't touch anybody else's rows. No cron runs on QC; a control row proves nothing else drains this tenant during the window.
//   W  each write path, called the way the app calls it (server action inside a request scope whose `after()` runs the task once the action
//      returned · route handler · portal page read), must get its new OutboxEvent rows picked up by a drain within the window (status leaves
//      PENDING, or attempts > 0) — the path wakes the queue itself.
//   V  /u/<token>/one-click and /no-track answer pages carry a mobile viewport meta tag.
// Run (QC3): bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//              bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf18/probe-cf18-outbox.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
const host = accEnv.loadQcEnv().host;
if (!/ep-weathered-river/.test(String(host ?? "")) || !/ep-weathered-river/.test(String(process.env.DATABASE_URL ?? ""))) {
  console.error(`probe-cf18-outbox: QC3 only (host=${host})`);
  process.exit(4);
}
process.env.SHARK_AI_MOCK = "1";
delete process.env.SHARK_AI_KEY;
if (!process.env.RESEND_API_KEY) process.env.RESEND_API_KEY = "re_qc_probe_dummy_key";
globalThis.fetch = (async () => {
  throw new Error("probe-cf18-outbox: network blocked");
}) as typeof fetch;

const { prisma } = await import("@/lib/core/db" as string);
const P = prisma as Any;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string)) as Any;
const coreHash = (await import("@/lib/core/hash" as string)) as Any;
const rand = randomBytes(4).toString("hex").replace(/[0-9]/g, (d) => "qrstuvwxyz"[Number(d)]!);
const TAG = `qc-cf18-${rand}`;
const cks: { id: string; ok: boolean; finding: boolean }[] = [];
const chk = (id: string, n: string, ok: unknown, actual: string, finding = false) => {
  cks.push({ id, ok: !!ok, finding });
  console.log(`  ${ok ? "✅" : "❌"} [${id}]${finding ? " (FINDING)" : " (control)"} ${n}\n        — ACTUAL ${actual}`);
};
const sub = async (id: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    chk(id, "block ran", false, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 600) : String(e));
  }
};
const j = (v: unknown) => JSON.stringify(v ?? null);
const cut = (v: unknown, n = 160) => {
  const s = String(v ?? "").replace(/\s+/g, " ");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WINDOW_MS = 15_000; // same window as qc-crm-c5.3 L3-M1b

// request scope whose after() runs the task after the action returned (like the platform's waitUntil) — copied from qc-crm-c5.3
async function inScope<T>(cookie: string, pathname: string, phase: "action" | "render", fn: () => Promise<T>): Promise<T> {
  const req = new Request(`http://qc.local${pathname}`, { headers: { cookie, "user-agent": "probe-cf18-outbox", "x-forwarded-for": "203.0.113.181" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const afterContext = { after: (task: Any) => { setTimeout(() => { void Promise.resolve().then(() => (typeof task === "function" ? task() : task)).catch(() => undefined); }, 0); } };
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [], afterContext };
  const unit = { type: "request", phase, implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

let T = "";
const USERS: string[] = [];
let OB_RESTORE: (() => void) | null = null;

try {
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const MEM = (await import("@/lib/modules/member" as string)) as Any;
  const PANEL = (await import("../../../src/lib/modules/chat/crm-panel-actions.ts" as string)) as Any;
  const TEAMS = (await import("../../../src/app/app/settings/teams/actions.ts" as string)) as Any;
  const R_ONE = (await import("../../../src/app/u/[token]/one-click/route.ts" as string)) as Any;
  const R_NOT = (await import("../../../src/app/u/[token]/no-track/route.ts" as string)) as Any;

  T = (await P.tenant.create({ data: { name: TAG, slug: TAG } })).id as string;
  // OUTBOX GUARD
  const OB_DLG = P.outboxEvent;
  const OB_FIND = OB_DLG.findMany;
  OB_DLG.findMany = (a: Any) => OB_FIND.call(OB_DLG, { ...(a ?? {}), where: { AND: [a?.where ?? {}, { tenantId: T }] } });
  OB_RESTORE = () => { OB_DLG.findMany = OB_FIND; };
  const guardProbe = (await P.outboxEvent.findMany({ where: { status: "PENDING" }, select: { tenantId: true }, take: 20 })) as Any[];
  if (P.outboxEvent.findMany === OB_FIND || !guardProbe.every((r) => r.tenantId === T)) throw new Error("outbox guard not installed — refusing to run");

  const u = await P.user.create({ data: { email: `${TAG}-owner@qc.invalid`, name: `QC owner ${TAG}` } });
  USERS.push(u.id);
  const owner = u.id as string;
  const mrow = await P.membership.create({ data: { userId: owner, tenantId: T, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const tok = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: owner, tokenHash: coreHash.sha256(tok), idleExpiresAt: new Date(Date.now() + 86_400_000), expiresAt: new Date(Date.now() + 86_400_000) } });
  const cookie = `shark_session=${tok}; __Host-shark_session=${tok}; shark_tenant=${T}`;
  const S = (await sysSvc.createSystem(T, "CRM", `${TAG} crm`)).id as string;
  await P.$executeRawUnsafe(
    `UPDATE "AppSystem" SET "settings" = jsonb_set(CASE WHEN jsonb_typeof("settings")='object' THEN "settings" ELSE '{}'::jsonb END, '{crm}', $1::jsonb, true) WHERE "id" = $2`,
    JSON.stringify({ uiVersion: 2, bridgesEnabled: true, portal: { enabled: true } }),
    S,
  );
  const CHAT = (await sysSvc.createSystem(T, "CHAT", `${TAG} chat`)).id as string;
  const actor = MEM.toMemberActor(owner, mrow);
  const ctx = { tenantId: T, systemId: S, actorUserId: owner };

  // rows created since t0 for this tenant (excluding the control row) → processed = left PENDING or attempted
  const rowsSince = async (t0: Date, exclude: string[] = []) =>
    (await P.outboxEvent.findMany({ where: { tenantId: T, createdAt: { gte: t0 }, id: { notIn: exclude } }, select: { id: true, type: true, status: true, attempts: true, lastError: true } })) as Any[];
  const waitProcessed = async (t0: Date, exclude: string[] = []) => {
    const until = Date.now() + WINDOW_MS;
    let rows: Any[] = [];
    for (;;) {
      rows = await rowsSince(t0, exclude);
      const pending = rows.filter((r) => r.status === "PENDING" && Number(r.attempts) === 0);
      if (rows.length > 0 && pending.length === 0) return { ok: true, rows };
      if (Date.now() > until) return { ok: false, rows };
      await sleep(500);
    }
  };
  const desc = (rows: Any[]) => j(rows.map((r) => `${r.type}:${r.status}${r.attempts ? `/a${r.attempts}` : ""}${r.lastError ? `!${cut(r.lastError, 40)}` : ""}`));
  const settle = () => sleep(1_500); // let a woken drain finish its last round before the next write (keeps windows separate)

  // ── control: nothing drains this tenant on its own (no cron on QC, guard narrows other processes' drains? no — other processes are not
  //    guarded; the gate lock keeps other heavy jobs off while this runs) — a row written directly, no wake, stays PENDING for 6 s ──
  console.log("\n── C0 control: no background drain ──");
  const ctrl = await P.outboxEvent.create({ data: { tenantId: T, systemId: S, type: `qc.cf18.control.${rand}`, idempotencyKey: `${TAG}-ctrl`, payload: {} } });
  await sleep(6_000);
  const ctrlAfter = await P.outboxEvent.findUnique({ where: { id: ctrl.id }, select: { status: true, attempts: true } });
  chk("C0.1", "control: a row written with no wake stays PENDING (attempts 0) for 6 s — nothing else drains this tenant", ctrlAfter?.status === "PENDING" && Number(ctrlAfter?.attempts) === 0, j(ctrlAfter));
  await P.outboxEvent.delete({ where: { id: ctrl.id } });

  // ── W1 /app/settings/teams action ──
  console.log("\n── W1 teams action ──");
  await sub("W1", async () => {
    const t0 = new Date();
    const r: Any = await inScope(cookie, "/app/settings/teams", "action", () => TEAMS.createTeamAction({ name: `ทีม ${TAG}` }));
    const w = await waitProcessed(t0);
    chk("W1.1", "FINDING: createTeamAction's outbox rows are picked up by a drain within 15 s (the action wakes the queue)", r?.ok === true && w.ok, `action=${j(r)} rows=${desc(w.rows)}`, true);
    await settle();
  });

  // ── W2 chat CRM panel: create lead · log activity ──
  console.log("\n── W2 chat CRM panel ──");
  let convId = "";
  await sub("W2", async () => {
    const cc = await P.chatContact.create({ data: { tenantId: T, systemId: CHAT, channel: "LINE", externalUserId: `${TAG}-line`, displayName: `ลูกค้าแชท ${TAG}`, phone: `08${Array.from(randomBytes(8)).map((b) => String(b % 10)).join("")}` } });
    convId = (await P.chatConversation.create({ data: { tenantId: T, systemId: CHAT, channel: "LINE", contactId: cc.id, lastMessageAt: new Date() } })).id as string;
    const t0 = new Date();
    const r: Any = await inScope(cookie, "/app/sys/chat", "action", () => PANEL.createLeadFromChatAction(convId));
    const w = await waitProcessed(t0);
    chk("W2.1", "FINDING: chat panel 'create lead' — its outbox rows are drained within 15 s", r?.ok === true && w.ok, `action=${cut(j(r), 120)} rows=${desc(w.rows)}`, true);
    await settle();
    const t1 = new Date();
    const r2: Any = await inScope(cookie, "/app/sys/chat", "action", () => PANEL.logActivityFromChatAction(convId, { type: "NOTE", title: `โน้ตจากแชท ${TAG}` }));
    const w2 = await waitProcessed(t1);
    chk("W2.2", "FINDING: chat panel 'log activity' — its outbox rows are drained within 15 s", r2?.ok === true && w2.ok, `action=${cut(j(r2), 120)} rows=${desc(w2.rows)}`, true);
    await settle();
  });

  // ── W3/W4 /u/<token> one-click · no-track (public routes) ──
  console.log("\n── W3/W4 /u routes ──");
  await sub("W3", async () => {
    const email = `cust-${rand}@cust.qc.invalid`;
    const party = await P.party.create({ data: { tenantId: T, name: `ลูกค้าเมล ${TAG}`, kind: "PERSON", email } });
    const k = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ลูกค้าเมล ${TAG}`, firstName: "ลูกค้าเมล", partyId: party.id, ownerUserId: owner, email } });
    const inRow = await P.crmEmailMessage.create({
      data: {
        tenantId: T, systemId: S, contactId: k.id, direction: "IN", messageId: `${S}:${TAG}-in@cust.qc.invalid`, threadKey: randomBytes(16).toString("hex"), fromAddr: email,
        toAddrs: [`crm@${TAG}.qc.invalid`], subject: `สอบถาม ${TAG}`, bodyText: "สอบถาม", status: "RECEIVED", receivedAt: new Date(), trackTokenHash: randomBytes(12).toString("hex"),
      },
    });
    const sent: Any[] = [];
    await CRM.emails.sendEmail(ctx, actor, { contactId: k.id, replyToEmailId: inRow.id, subject: `Re: ${TAG}`, bodyText: "ตอบกลับค่ะ" }, { transport: async (m: Any) => { sent.push(m); return { ok: true, id: `qc-${rand}` }; } });
    const utok = (j(sent).match(/\/u\/([A-Za-z0-9_.~-]+)/) ?? [])[1] ?? "";
    chk("W3.0", "control (premise): the sent mail carries a /u/<token> link", !!utok, `token=${utok ? "found" : "missing"} sent=${sent.length}`);
    await settle();
    // drain whatever the send left (send path wakes) so the window below only holds the route's rows
    const t0 = new Date();
    const res = await R_NOT.POST(new Request(`http://qc.local/u/${utok}/no-track`, { method: "POST", headers: { "user-agent": "probe-cf18-outbox" } }), { params: Promise.resolve({ token: utok }) });
    const htmlNT = await res.text();
    const wNT = await waitProcessed(t0);
    const optT = await P.crmContact.findUnique({ where: { id: k.id }, select: { trackingOptOut: true } });
    chk("W4.1", "FINDING: /u/<token>/no-track — the opt-out is written and its outbox rows (if any) are drained within 15 s", res.status === 200 && optT?.trackingOptOut === true && (wNT.rows.length === 0 || wNT.ok), `status=${res.status} optOut=${optT?.trackingOptOut} rows=${desc(wNT.rows)}`, true);
    await settle();
    const t1 = new Date();
    const res2 = await R_ONE.POST(new Request(`http://qc.local/u/${utok}/one-click`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.182" }, body: "List-Unsubscribe=One-Click" }), { params: Promise.resolve({ token: utok }) });
    const htmlOC = await res2.text();
    const wOC = await waitProcessed(t1);
    const optE = await P.crmContact.findUnique({ where: { id: k.id }, select: { emailOptOut: true } });
    chk("W3.1", "FINDING: /u/<token>/one-click — the unsubscribe is written and its outbox rows are drained within 15 s", res2.status === 200 && optE?.emailOptOut === true && wOC.rows.length > 0 && wOC.ok, `status=${res2.status} optOut=${optE?.emailOptOut} rows=${desc(wOC.rows)}`, true);
    const vp = /<meta name="viewport" content="width=device-width, initial-scale=1">/;
    chk("V1", "FINDING (P-it5-3): both /u done pages carry the mobile viewport meta tag", vp.test(htmlOC) && vp.test(htmlNT), `one-click=${vp.test(htmlOC)} no-track=${vp.test(htmlNT)}`, true);
    await settle();
  });

  // ── W5 portal view (page read → crm.portal.viewed, first per access per Thai day) ──
  console.log("\n── W5 portal view ──");
  await sub("W5", async () => {
    const coParty = await P.party.create({ data: { tenantId: T, name: `บริษัทพอร์ทัล ${TAG}`, kind: "COMPANY" } });
    const co = await P.crmCompany.create({ data: { tenantId: T, systemId: S, partyId: coParty.id, name: `บริษัทพอร์ทัล ${TAG}`, ownerUserId: owner } });
    const pParty = await P.party.create({ data: { tenantId: T, name: `ผู้ใช้พอร์ทัล ${TAG}`, kind: "PERSON", email: `portal-${rand}@cust.qc.invalid` } });
    const pc = await P.crmContact.create({ data: { tenantId: T, systemId: S, name: `ผู้ใช้พอร์ทัล ${TAG}`, partyId: pParty.id, ownerUserId: owner, email: `portal-${rand}@cust.qc.invalid`, companyId: co.id } });
    await P.crmCompanyContact.create({ data: { tenantId: T, companyId: co.id, contactId: pc.id, isPrimary: true, startedAt: new Date(Date.now() - 60_000) } });
    const acc = await P.crmPortalAccess.create({ data: { tenantId: T, systemId: S, companyId: co.id, contactId: pc.id, role: "APPROVE", invitedById: owner, acceptedAt: new Date(), loginMethods: ["EMAIL_OTP"] } });
    const raw = `cp_${TAG}${randomBytes(16).toString("hex")}`;
    await P.portalSession.create({ data: { tenantId: T, portalAccessId: acc.id, crmContactId: pc.id, crmSystemId: S, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 86_400_000) } });
    const t0 = new Date();
    let home: Any = null;
    try {
      home = await inScope("", "/b/x", "render", () => CRM.portal.home(raw));
    } catch (e) {
      home = { threw: e instanceof Error ? e.message : String(e) };
    }
    const w = await waitProcessed(t0);
    chk("W5.1", "FINDING: a portal page view writes crm.portal.viewed and it is drained within 15 s", !home?.threw && w.rows.some((r) => r.type === "crm.portal.viewed") && w.ok, `home=${home?.threw ? cut(home.threw, 120) : "ok"} rows=${desc(w.rows)}`, true);
    await settle();
  });

  const left = (await P.outboxEvent.findMany({ where: { tenantId: T, status: "PENDING", attempts: 0 }, select: { type: true } })) as Any[];
  console.log(`  ℹ️  never-attempted PENDING rows left in the tenant at the end: ${j(left.map((r) => r.type))}`);
} finally {
  await sleep(2_000);
  OB_RESTORE?.();
  const leftT: string[] = [];
  const tables = ((await P.$queryRawUnsafe(`select table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
    .map((r) => String(r.table_name))
    .filter((t) => /^[A-Za-z_]+$/.test(t));
  if (T) {
    await P.opsEvent.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${T}%`).catch(() => undefined);
    for (let pass = 0; pass < 4; pass += 1) for (const t of tables) await P.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => undefined);
    await P.appSystem.deleteMany({ where: { tenantId: T } }).catch(() => undefined);
    await P.tenant.delete({ where: { id: T } }).catch(() => undefined);
    for (const t of tables) {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, T).catch(() => [{ n: 0 }])) as Any[];
      if (Number(r?.[0]?.n ?? 0) > 0) leftT.push(`${t}=${r[0].n}`);
    }
  }
  for (const uid of USERS) {
    await P.appNotification.deleteMany({ where: { recipientUserId: uid } }).catch(() => undefined);
    await P.session.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => undefined);
    await P.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  if (T) chk("CLEAN", "throwaway tenant and user removed (0 rows left)", leftT.length === 0 && (await P.tenant.count({ where: { id: T } })) === 0 && (await P.user.count({ where: { id: { in: USERS } } })) === 0, leftT.join(" · ") || "-");
  await prisma.$disconnect();
}
const controls = cks.filter((c) => !c.finding);
const findings = cks.filter((c) => c.finding);
console.log(`\ncontrols ${controls.filter((c) => c.ok).length}/${controls.length} green · findings GREEN (fixed) ${findings.filter((c) => c.ok).length}/${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ controls: controls.map((c) => [c.id, c.ok]), findings: findings.map((c) => [c.id, c.ok ? "GREEN" : "RED"]) })}`);
process.exit(cks.every((c) => c.ok) ? 0 : 1);
