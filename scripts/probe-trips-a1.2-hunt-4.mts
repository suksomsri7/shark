// hunt-4 — follow-ups: invite accept ∥ accept · agency-only audit/outbox scan · PENDING cap race · ADMIN mints ADMIN · session idle/absolute expiry
import { randomBytes } from "node:crypto";
import { huntSetup, type Rec } from "./probe-trips-a1.2-hunt-lib.mts";

const H = await huntSetup("probe-a1.2-hunt-4");
const { AU, R, fmt, q, meta, report } = H;
const tallyOf = (xs: Rec[]) => fmt(xs.reduce<Record<string, number>>((a, x) => { const k = x.ok === true ? `ok${x.replayed ? "(replayed)" : ""}${x.status ? `:${x.status}` : ""}` : `${x.code}${x.reason ? `/${x.reason}` : ""}`; a[k] = (a[k] ?? 0) + 1; return a; }, {}));
try {
  const A = await H.mkTenant("p4a"); // needs approval

  // ───────────── V1: one e-mail invite token, 6 identities accept in parallel (no re-issue this time) ─────────────
  {
    const res: string[] = [];
    let bad = false;
    for (let round = 0; round < 3; round++) {
      const inv = await H.shop("inviteAgent", A.ctx, { mode: "EMAIL", email: H.mail(`v1inv${round}`), legalName: `${H.MARK} v1 legal ${round}`, payeeType: "TH_JURISTIC", idempotencyKey: `hunt-v1-${H.hex(6)}` });
      const ids = [] as Awaited<ReturnType<typeof H.signup>>[];
      for (let i = 0; i < 6; i++) ids.push(await H.signup(`v1-${round}-${i}`));
      const out = (await Promise.all(ids.map((X) => AU("agentAcceptInvite")(X.token, { shopSlug: A.slug, inviteToken: inv.inviteToken }, meta())))).map(R);
      const row = (await q<Rec>(`SELECT status, "inviteTokenHash" IS NOT NULL AS "hasToken" FROM "AgentAccount" WHERE id = $1`, [String(inv.agentAccountId)]))[0];
      const mem = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccountMember" WHERE "agentAccountId" = $1`, [String(inv.agentAccountId)]))[0]?.n;
      const ev = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND payload->>'agentAccountId' = $2`, [A.id, String(inv.agentAccountId)]))[0]?.n;
      const okN = out.filter((x) => x.ok === true).length;
      if (okN !== 1 || mem !== 1 || ev !== 1 || row?.hasToken === true) bad = true;
      res.push(`${tallyOf(out)} row=${fmt(row)} members=${mem} events=${ev}`);
    }
    report("V1", "6 identities accept one e-mail invite token in parallel (3 rounds)", bad, "exactly 1 accept (PENDING — e-mail does not match) · 1 member · 1 event · token cleared", `\n        ${res.join("\n        ")}`);
  }

  // ───────────── V2: audit / outbox rows written by agency code only (re-scan of hunt-3 R9b without the settings rows) ─────────────
  {
    const X = await H.signup("v2x");
    const mateMail = H.mail("v2mate");
    const { who: Y } = await H.teammate(X, mateMail, "ADMIN", "v2");
    const ap = R(await AU("agentApply")(X.token, { shopSlug: A.slug, application: H.app({ contact: { name: `${H.MARK} v2 contact`, email: H.mail("v2contact") }, taxId: undefined }) }, meta()));
    await H.shop("approveAgentAccount", A.ctx, { agentAccountId: ap.agentAccountId, code: "V2CODE" });
    await AU("setAccountMember")(X.token, { agentAccountId: ap.agentAccountId, targetUserId: Y.agentUserId, role: "ADMIN" });
    await AU("setTeammateRole")(X.token, { targetUserId: Y.agentUserId, role: "SALES" });
    const dtoBefore = await H.shop("getAgentAccount", A.ctx, { agentAccountId: ap.agentAccountId });
    await H.shop("updateAgentAccountProfile", A.ctx, { agentAccountId: ap.agentAccountId, expectedUpdatedAt: R(dtoBefore.account).updatedAt, patch: { contact: { phone: "0812345678" }, bankAccount: "1234567890", taxId: "0105556000017" } });
    await H.shop("suspendAgentAccount", A.ctx, { agentAccountId: ap.agentAccountId });
    await H.shop("reinstateAgentAccount", A.ctx, { agentAccountId: ap.agentAccountId });
    const inv = await H.shop("inviteAgent", A.ctx, { mode: "EMAIL", email: H.mail("v2inv"), legalName: `${H.MARK} v2 invited`, payeeType: "FOREIGN", idempotencyKey: `hunt-v2-${H.hex(6)}` });
    await H.shop("reissueAgentInvite", A.ctx, { agentAccountId: inv.agentAccountId });
    await H.shop("revokeAgentInvite", A.ctx, { agentAccountId: inv.agentAccountId });
    await AU("eraseTeammate")(X.token, { targetUserId: Y.agentUserId });
    await AU("closeMyIdentity")(X.token, { confirm: true });
    const audit = await q<{ j: string; action: string; after: Rec | null; actorType: string; actorId: string | null; before: unknown }>(`SELECT row_to_json(a)::text AS j, action, after, "actorType", "actorId", before FROM "AuditLog" a WHERE "tenantId" = $1 AND action LIKE 'agency.%'`, [A.id]);
    const outbox = await q<{ j: string; type: string; payload: Rec }>(`SELECT row_to_json(o)::text AS j, type, payload FROM "OutboxEvent" o WHERE "tenantId" = $1 AND type LIKE 'agency.%'`, [A.id]);
    const ops = await q<{ j: string }>(`SELECT row_to_json(o)::text AS j FROM "OpsEvent" o WHERE "createdAt" >= $1`, [H.RUN_START]);
    const secrets = [X.token, Y.token, X.agentUserId, Y.agentUserId, X.identityId, String(inv.inviteToken), ...H.mails.map((m) => m.to), ...H.mails.map((m) => m.token ?? "").filter((t) => t.length > 10), ...H.mails.map((m) => m.code ?? "").filter((c) => c.length === 6).map((c) => `"${c}"`), "0105556000017", "1234567890", "0812345678", `${H.MARK} v2 contact`].filter((s) => s && s.length >= 8);
    const hit = (rows: { j: string }[]) => { const s = rows.map((r) => r.j).join("\n"); return [...new Set(secrets.filter((x) => s.includes(x)))].map((x) => (x.includes("@") ? "e-mail" : x.startsWith("ag_") ? "session-token" : x.length > 60 ? "teammate-token" : x.length === 43 ? "invite-token" : x === X.agentUserId || x === Y.agentUserId ? "agentUserId" : x === X.identityId ? "identityId" : `value:${x.slice(0, 12)}`)); };
    const allowedAfter = new Set(["from", "to", "reason", "actorKind", "fields", "idem", "body"]);
    const badAfter = [...new Set(audit.flatMap((r) => Object.keys(r.after ?? {}).filter((k) => !allowedAfter.has(k))))];
    const before = audit.filter((r) => r.before !== null).length;
    const badPayload = outbox.filter((r) => Object.keys(r.payload ?? {}).join(",") !== "agentAccountId").map((r) => r.type);
    const agentActors = audit.filter((r) => R(r.after).actorKind === "AGENT");
    const memberIds = new Set((await q<{ id: string }>(`SELECT id FROM "AgentAccountMember" WHERE "tenantId" = $1`, [A.id])).map((r) => r.id));
    const badActor = agentActors.filter((r) => r.actorType !== "SYSTEM" || (r.actorId !== null && !memberIds.has(r.actorId))).map((r) => `${r.action}:${r.actorType}:${String(r.actorId).slice(0, 8)}`);
    const la = hit(audit), lo = hit(outbox), lp = hit(ops);
    report("V2", "agency.* AuditLog / OutboxEvent of the shop + OpsEvent of this run after a full life-cycle (apply · approve · members · edit tax/bank · suspend · invite · reissue · revoke · erase · close)", badAfter.length > 0 || badPayload.length > 0 || badActor.length > 0 || la.length > 0 || lo.length > 0 || lp.length > 0 || before > 0,
      "audit.after ⊂ {from,to,reason,actorKind,fields,idem,body} · before null · agent-side actor = SYSTEM + memberId · payload = {agentAccountId} · no token / code / e-mail / tax id / bank no / global id anywhere",
      `audit rows=${audit.length} actions=${fmt([...new Set(audit.map((r) => r.action.replace("agency.", "")))])}\n                extra after-keys=${fmt(badAfter)} · before≠null=${before} · bad agent actors=${fmt(badActor)} · leaks audit=${fmt(la)} outbox=${fmt(lo)} ops=${fmt(lp)} · outbox rows=${outbox.length} bad payloads=${fmt(badPayload)}`);
  }

  // ───────────── V3: PENDING cap (200) with parallel applicants ─────────────
  {
    const S = await H.mkTenant("v3");
    const partyId = H.rid("party");
    const ALPHA = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
    let seeded = 0; let seedErr = "";
    try {
      await H.ins("Party", { id: partyId, tenantId: S.id, name: `${H.MARK} v3 party` });
      for (let i = 0; i < 197; i++) {
        const iid = H.rid(`v3i${i}`);
        await H.ins("AgentIdentity", { id: iid, displayName: `${H.MARK} seeded ${i}`, publicCode: `AG-${[...randomBytes(6)].map((b) => ALPHA[b % 30]).join("")}`, status: "ACTIVE" });
        H.identityIds.add(iid);
        await H.ins("AgentAccount", { id: H.rid(`v3a${i}`), tenantId: S.id, identityId: iid, code: `H${String(i).padStart(4, "0")}`, status: "PENDING", partyId, legalName: `${H.MARK} seeded ${i}`, payeeType: "TH_JURISTIC", unitIds: [], kind: "AGENT", country: "TH", vatRegistered: false });
        seeded++;
      }
    } catch (er) { seedErr = String(er).slice(0, 200); }
    if (seedErr) console.log(`ℹ️  INFO [V3] not run — could not seed PENDING rows (${seeded} done): ${seedErr}`);
    else {
      const ids = [] as Awaited<ReturnType<typeof H.signup>>[];
      for (let i = 0; i < 10; i++) ids.push(await H.signup(`v3-${i}`));
      const out = (await Promise.all(ids.map((X) => AU("agentApply")(X.token, { shopSlug: S.slug, application: H.app() }, meta())))).map(R);
      const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND status = 'PENDING'`, [S.id]))[0]?.n ?? 0;
      const late = await H.signup("v3-late");
      const l = R(await AU("agentApply")(late.token, { shopSlug: S.slug, application: H.app() }, meta()));
      report("V3", `shop with ${seeded} PENDING rows, 10 new agencies apply at the same moment (cap openPendingPerShop = 200)`, n > 200, "PENDING rows ≤ 200 (3 accepted, 7 RATE_LIMITED)", `results=${tallyOf(out)} · PENDING rows now=${n} · one more afterwards=${l.ok === true ? l.status : l.code}`);
    }
  }

  // ───────────── V4: ADMIN cannot promote to ADMIN — but can mint a new ADMIN through a teammate invite ─────────────
  {
    const X = await H.signup("v4x");
    const { who: Z } = await H.teammate(X, H.mail("v4admin"), "ADMIN", "v4a");
    const { who: Y } = await H.teammate(X, H.mail("v4sales"), "SALES", "v4s");
    const promote = R(await AU("setTeammateRole")(Z.token, { targetUserId: Y.agentUserId, role: "ADMIN" }));
    const inviteOwner = R(await AU("createTeammateInvite")(Z.token, { email: H.mail("v4o"), role: "OWNER" }, meta()));
    const { who: N } = await H.teammate(Z, H.mail("v4new"), "ADMIN", "v4n");
    const s = R(await AU("resolveAgentSession")(N.token));
    const disableNew = R(await AU("disableTeammate")(Z.token, { targetUserId: N.agentUserId }));
    console.log(`ℹ️  INFO [V4] ADMIN promotes SALES→ADMIN=${promote.code} · ADMIN invites OWNER=${inviteOwner.code} · ADMIN invites a NEW teammate as ADMIN → created=${N.raw.created} role=${fmt(s.role)} · the inviting ADMIN can disable that new ADMIN=${disableNew.ok === true ? "yes" : disableNew.code}  (brief §4 allows "OWNER/ADMIN invite others"; §9 says "ADMIN may only manage SALES/ACCOUNTING" — the two rules disagree; as built an ADMIN can create peers it can neither demote nor disable)`);
  }

  // ───────────── V5: session idle (72 h) / absolute (30 d) expiry with meta.now ─────────────
  {
    const X = await H.signup("v5x");
    const idleTok = (await H.login(X.email)).token; // never used again
    const h = (n: number) => new Date(Date.now() + n * 3_600_000);
    const steps: string[] = [];
    let alive = true;
    for (const at of [60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 719]) { const r = await AU("resolveAgentSession")(X.token, { now: h(at) }); steps.push(`+${at}h=${r ? "ok" : "null"}`); if (!r) alive = false; }
    const idleDead = (await AU("resolveAgentSession")(idleTok, { now: h(73) })) === null;
    const idleAlive71 = false; // (not probed: would slide the idle window of the control session)
    void idleAlive71;
    const absDead = (await AU("resolveAgentSession")(X.token, { now: h(721) })) === null;
    const scopeDead = (await AU("agentScope")(X.token, { shopSlug: A.slug }, { now: h(721) })) === null;
    const row = (await q<Rec>(`SELECT ("idleExpiresAt" <= "expiresAt") AS "idleLeAbs" FROM "AgentSession" WHERE "agentUserId" = $1 ORDER BY "createdAt" LIMIT 1`, [X.agentUserId]))[0];
    report("V5", "session kept alive every 60 h up to day 30, an unused session at +73 h, any session at +30 d 1 h", !alive || !idleDead || !absDead || !scopeDead || row?.idleLeAbs !== true,
      "active session lives to the absolute limit · unused session dies after 72 h · nothing survives 30 days · idle ≤ absolute", `${steps.join(" ")} · unused@+73h=${idleDead ? "null" : "LIVE"} · used@+721h=${absDead ? "null" : "LIVE"} · scope@+721h=${scopeDead ? "null" : "LIVE"} · ${fmt(row)}`);
  }
} catch (e) {
  console.log(`PROBE ERROR: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await H.cleanup();
}
process.exit(0);
