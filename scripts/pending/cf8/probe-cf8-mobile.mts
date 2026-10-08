// probe — CRM C5.5-authz-sweep: the three remaining mobile AI doors that the hotfix (2026-10-01 Item 4) left on "member of the shop"
//   W1 GET  /api/mobile/proposals?conversationId=  → ai.chat.send  (web twin: lib/ai/actions.ts listPendingProposalsAction · loadAiChatAction)
//   W2 GET  /api/mobile/usage                       → ai.chat.send  (web twin: lib/ai/actions.ts loadAiQuotaAction — the chat quota bar; the app's QuotaBar is the only caller)
//   W3 POST /api/mobile/chat/welcome                → ai.chat.send  (creates an AI room + message like POST /api/mobile/conversations, gated by the hotfix;
//                                                      web opens the AI room only through loadAiChatAction/sendAiMessageAction, both ai.chat.send)
//   Matrix through the REAL route handlers (Bearer from issueMobileToken + X-Tenant-Id): OWNER · MANAGER · STAFF no keys · STAFF+ai.chat.send ·
//   STAFF holding an unrelated key (systems.system.create) — denied = 403 {error:"forbidden"} and NO side effect; positive controls.
//   INFO lines (not counted): proposals/reject + plans/reject by a key-less STAFF — evidence for the owner decision (web door rejectProposalAction /
//   rejectPlanAction is equally permissive for non-CRM kinds ⇒ not changed by this card).
// QC DATABASE ONLY (acc-v2-env loadQcEnv prod-host guard runs before the db import) · own tenant `qc-cf8-mob-<rand>` · cleans to 0.
// Run: bash scripts/iso.sh env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf8/probe-cf8-mobile.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("../../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const auth = (await import("@/lib/mobile/auth" as string)) as { issueMobileToken: (u: string) => Promise<{ token: string }> };
const R = {
  props: (await import("../../../src/app/api/mobile/proposals/route.ts" as string)) as Any,
  usage: (await import("../../../src/app/api/mobile/usage/route.ts" as string)) as Any,
  welcome: (await import("../../../src/app/api/mobile/chat/welcome/route.ts" as string)) as Any,
  pReject: (await import("../../../src/app/api/mobile/proposals/reject/route.ts" as string)) as Any,
  plReject: (await import("../../../src/app/api/mobile/plans/reject/route.ts" as string)) as Any,
};
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const info = (id: string, n: string, a: string) => console.log(`  ℹ️  [${id}] ${n} — ${a}`);
const P = prisma as Any;
const TAG = `qc-cf8-mob-${Math.random().toString(36).slice(2, 8)}`;
const tids: string[] = [];
const userIds: string[] = [];
try {
  const mkTenant = async (suffix: string) => {
    const t = await P.tenant.create({ data: { name: `${TAG}${suffix}`, slug: `${TAG}${suffix}` } });
    tids.push(t.id);
    return t.id as string;
  };
  const tid = await mkTenant("");
  const tidWelcome = await mkTenant("-w"); // empty shop (no AI room yet) for chat/welcome
  const mkUser = async (key: string, role: string, permissions: Record<string, boolean>) => {
    const u = await P.user.create({ data: { email: `${TAG}-${key}@qc.invalid`, name: key } });
    userIds.push(u.id);
    for (const t of tids) await P.membership.create({ data: { userId: u.id, tenantId: t, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    return (await auth.issueMobileToken(u.id)).token;
  };
  const tok = {
    owner: await mkUser("owner", "OWNER", {}),
    manager: await mkUser("manager", "MANAGER", {}),
    staff: await mkUser("staff", "STAFF", {}),
    staffAi: await mkUser("staffai", "STAFF", { "ai.chat.send": true }),
    staffSys: await mkUser("staffsys", "STAFF", { "systems.system.create": true }),
  };
  type Who = keyof typeof tok;
  const req = (who: Who, method: string, opts: { body?: unknown; qs?: string; tenant?: string } = {}) =>
    new Request(`http://qc.invalid/api/mobile/x${opts.qs ?? ""}`, {
      method,
      headers: { authorization: `Bearer ${tok[who]}`, "x-tenant-id": opts.tenant ?? tid, "content-type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  const drain = async (res: Response) => { try { await res.text(); } catch { /* closed */ } return res.status; };
  const is403 = async (pr: Promise<Response>) => {
    let res: Response;
    try { res = await pr; } catch { return false; }
    const st = res.status; const b = st === 403 ? await res.json().catch(() => ({})) : (await drain(res), {});
    return st === 403 && (b as Any).error === "forbidden";
  };
  const statusOf = async (pr: Promise<Response>) => { try { return String(await drain(await pr)); } catch (e) { return `threw:${(e as Error).message.slice(0, 40)}`; } };

  // fixtures: a shop AI room with a pending proposal + a pending plan; a wallet with a top-up
  const conv = await P.aiConversation.create({ data: { tenantId: tid, title: "QC ห้อง" } });
  const exp = new Date(Date.now() + 3_600_000);
  const prop = await P.aiProposal.create({ data: { tenantId: tid, conversationId: conv.id, kind: "inventory_receive", summary: "QC รับของลับ 99 ชิ้น", payload: {}, expiresAt: exp } });
  const plan = await P.aiPlan.create({ data: { tenantId: tid, conversationId: conv.id, title: "QC แผนลับ", stepsJson: [], expiresAt: exp } });
  await P.aiCreditWallet.create({ data: { tenantId: tid, balanceMicro: 4_321_000, grantedAt: new Date() } });
  await P.aiCreditTxn.create({ data: { tenantId: tid, kind: "TOPUP", source: "TOPUP", amountMicro: 10_000_000, balanceAfter: 4_321_000, note: "qc", ref: `${TAG}-topup` } }).catch(async () => {
    // enum value names differ? fall back to GRANT (route reads kind in [GRANT, TOPUP])
    await P.aiCreditTxn.create({ data: { tenantId: tid, kind: "GRANT", source: "GRANT", amountMicro: 10_000_000, balanceAfter: 4_321_000, note: "qc", ref: `${TAG}-grant` } });
  });

  // ═══ W1 proposals GET ═══
  const qs = `?conversationId=${conv.id}`;
  const w1No = await is403(R.props.GET(req("staff", "GET", { qs })));
  const w1Sys = await is403(R.props.GET(req("staffSys", "GET", { qs })));
  chk("CF8-W1.1", "GET proposals: STAFF without ai.chat.send → 403 (also STAFF holding only systems.system.create)", w1No && w1Sys, "403", `staff=${w1No} staffSys=${w1Sys}`);
  const w1Ok: Record<string, string> = {};
  for (const w of ["owner", "manager", "staffAi"] as Who[]) {
    const r = await R.props.GET(req(w, "GET", { qs }));
    const b = r.status === 200 ? JSON.stringify(await r.json()) : (await drain(r), "");
    w1Ok[w] = `${r.status}:${b.includes(prop.id) && b.includes("QC รับของลับ")}`;
  }
  // ORACLE-EDIT C5.5-G2: the fixture room is written without a creator (legacy) ⇒ only the OWNER sees its proposal; MANAGER and
  //   STAFF+ai.chat.send still pass the key gate (200) and get an empty list (= the room does not exist for them)
  chk("CF8-W1.2", "positive control: OWNER / MANAGER / STAFF+ai.chat.send → 200 · the legacy room's pending proposal shown to the OWNER only", w1Ok.owner === "200:true" && w1Ok.manager === "200:false" && w1Ok.staffAi === "200:false", "owner 200:true · manager/staffAi 200:false", JSON.stringify(w1Ok));

  // ═══ W2 usage GET ═══
  const w2No = await is403(R.usage.GET(req("staff", "GET")));
  const w2Sys = await is403(R.usage.GET(req("staffSys", "GET")));
  chk("CF8-W2.1", "GET usage: STAFF without ai.chat.send → 403 (no AI wallet balance)", w2No && w2Sys, "403", `staff=${w2No} staffSys=${w2Sys}`, "MAJOR");
  const w2Ok: Record<string, string> = {};
  for (const w of ["owner", "manager", "staffAi"] as Who[]) {
    const r = await R.usage.GET(req(w, "GET"));
    const b = r.status === 200 ? ((await r.json()) as Any) : (await drain(r), {});
    w2Ok[w] = `${r.status}:${b.balanceMicro === 4_321_000 && typeof b.pct === "number"}`;
  }
  chk("CF8-W2.2", "positive control: OWNER / MANAGER / STAFF+ai.chat.send → 200, same body shape (balanceMicro, pct)", Object.values(w2Ok).every((s) => s === "200:true"), "200:true ×3", JSON.stringify(w2Ok), "MAJOR");

  // ═══ W3 chat/welcome POST ═══ (empty shop tidWelcome)
  const rooms = () => P.aiConversation.count({ where: { tenantId: tidWelcome } });
  const r0 = await rooms();
  const w3No = await is403(R.welcome.POST(req("staff", "POST", { body: {}, tenant: tidWelcome })));
  const w3Sys = await is403(R.welcome.POST(req("staffSys", "POST", { body: {}, tenant: tidWelcome })));
  const r1 = await rooms();
  chk("CF8-W3.1", "POST chat/welcome: STAFF without ai.chat.send → 403 and no AI room / message created (no onboarding checklist / DNA summary revealed)", w3No && w3Sys && r0 === 0 && r1 === 0, "403 + 0 rooms", `staff=${w3No} staffSys=${w3Sys} rooms=${r0}→${r1}`, "MAJOR");
  const w3OkRes = await R.welcome.POST(req("staffAi", "POST", { body: {}, tenant: tidWelcome }));
  const w3OkBody = w3OkRes.status === 200 ? ((await w3OkRes.json()) as Any) : (await drain(w3OkRes), {});
  const r2 = await rooms();
  const w3Again: Record<string, string> = {};
  // ORACLE-EDIT C5.5-G2: a room is its creator's — the STAFF's welcome room is not "existing" for the OWNER/MANAGER: each gets
  //   their own welcome room on the first tap (existing:false) and existing:true on the second
  for (const w of ["owner", "manager"] as Who[]) {
    const seen: string[] = [];
    for (let tap = 0; tap < 2; tap += 1) {
      const r = await R.welcome.POST(req(w, "POST", { body: {}, tenant: tidWelcome }));
      const b = r.status === 200 ? ((await r.json()) as Any) : (await drain(r), {});
      seen.push(`${r.status}:${b.existing}`);
    }
    w3Again[w] = seen.join(",");
  }
  chk("CF8-W3.2", "positive control: STAFF+ai.chat.send → 200 creates the welcome room once · OWNER/MANAGER → own welcome room, then 200 existing:true",
    w3OkRes.status === 200 && w3OkBody.existing === false && !!w3OkBody.conversationId && r2 === 1 && Object.values(w3Again).every((s) => s === "200:false,200:true"),
    "200 created + existing ×2", `staffAi=${w3OkRes.status}/${w3OkBody.existing} rooms=${r2} again=${JSON.stringify(w3Again)}`, "MAJOR");

  // ═══ cross-tenant control: a valid token with a tenant the user is not a member of ═══
  const foreign = await P.tenant.create({ data: { name: `${TAG}-x`, slug: `${TAG}-x` } });
  tids.push(foreign.id);
  const xs = await statusOf(R.props.GET(req("owner", "GET", { qs, tenant: foreign.id })));
  chk("CF8-X.1", "control: OWNER token + X-Tenant-Id of a shop they are not a member of → not 200 (requireMobile)", xs !== "200", "≠200", xs, "MINOR");

  // ═══ INFO (owner decision evidence — behaviour NOT changed by this card) ═══
  const prej = await R.pReject.POST(req("staff", "POST", { body: { id: prop.id } }));
  const prejB = prej.status === 200 ? JSON.stringify(await prej.json()) : (await drain(prej), "");
  const propAfter = (await P.aiProposal.findUnique({ where: { id: prop.id } }))?.status;
  info("CF8-I.1", "proposals/reject by a key-less STAFF (non-CRM kind)", `status=${prej.status} body=${prejB} row=${propAfter} (web rejectProposalAction: same, no key)`);
  const plrej = await R.plReject.POST(req("staff", "POST", { body: { id: plan.id } }));
  const plrejB = plrej.status === 200 ? JSON.stringify(await plrej.json()) : (await drain(plrej), "");
  const planAfter = (await P.aiPlan.findUnique({ where: { id: plan.id } }))?.status;
  info("CF8-I.2", "plans/reject by a key-less STAFF", `status=${plrej.status} body=${plrejB} row=${planAfter} (web rejectPlanAction: same, no key)`);
} catch (e) {
  chk("CRASH", "finished", false, "finished", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tids.length) {
      const w = { tenantId: { in: tids } };
      await P.aiProposal.deleteMany({ where: w });
      await P.aiPlan.deleteMany({ where: w });
      await P.aiMessage.deleteMany({ where: w });
      await P.aiConversation.deleteMany({ where: w });
      await P.aiCreditTxn.deleteMany({ where: w });
      await P.aiCreditWallet.deleteMany({ where: w });
      await P.membership.deleteMany({ where: w });
    }
    if (userIds.length) {
      await P.session.deleteMany({ where: { userId: { in: userIds } } });
      await P.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (tids.length) await P.tenant.deleteMany({ where: { id: { in: tids } } });
    const w = { tenantId: { in: tids } };
    const left = (tids.length
      ? (await P.aiConversation.count({ where: w })) + (await P.aiProposal.count({ where: w })) + (await P.aiPlan.count({ where: w }))
        + (await P.aiCreditWallet.count({ where: w })) + (await P.aiCreditTxn.count({ where: w })) + (await P.membership.count({ where: w }))
        + (await P.tenant.count({ where: { id: { in: tids } } }))
      : 0)
      + (await P.user.count({ where: { email: { startsWith: TAG } } })) + (await P.session.count({ where: { userId: { in: userIds } } }));
    chk("CF8-CLEAN", "cleanup → 0 rows of this run left", left === 0, "0", String(left), "MAJOR");
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 160)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== probe cf8 mobile =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.length > 0 ? 1 : 0);
