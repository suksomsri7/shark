// hunt-1 — teammate-token replay after erase · sticky-close bypass through WITHDRAW · identity-close evasion · list cursor of another shop
import { huntSetup, type Rec } from "./probe-trips-a1.2-hunt-lib.mjs";

const H = await huntSetup("probe-a1.2-hunt-1");
const { AU, R, fmt, q, meta, report } = H;
try {
  const A = await H.mkTenant("p1a"); // needs approval (default)
  const B = await H.mkTenant("p1b"); // auto-approve
  const sa = await H.setAutoApprove(B);
  console.log(`setup: autoApprove(B) = ${fmt(sa)}`);

  // ───────────── T1: teammate token replay after the teammate was erased ─────────────
  {
    const X = await H.signup("t1x");
    const mateEmail = H.mail("t1mate");
    const { who: Y1, token } = await H.teammate(X, mateEmail, "ADMIN", "t1");
    const erased = R(await AU("eraseTeammate")(X.token, { targetUserId: Y1.agentUserId }));
    const dead = await AU("resolveAgentSession")(Y1.token);
    // the erased person still has the mailbox and the old invite link (≤ 48 h)
    const Y2 = await H.login(mateEmail, { teammateInvite: token, teammateName: `${H.MARK} mate t1 again` });
    const team = R(await AU("agentTeam")(X.token));
    const roles = (Array.isArray(team.items) ? team.items : []).map((i) => `${R(i).role}:${R(i).status}`);
    const bug = Y2.raw.ok === true;
    report("T1", "teammate invite token replayed after the owner erased that teammate (same token, same e-mail)", bug,
      "second use of an already-accepted teammate token ⇒ INVITE_INVALID (owner removed the person; no new invite was issued)",
      `erase=${fmt({ ok: erased.ok, replayed: erased.replayed })} oldSession=${dead === null ? "null" : "LIVE"} · replay verify → ${fmt({ ok: Y2.raw.ok, code: Y2.raw.code, created: Y2.raw.created })} · new agentUserId≠old: ${Y2.agentUserId !== "" && Y2.agentUserId !== Y1.agentUserId} · team now = [${roles.join(", ")}]`);

    // T1b: same replay with an OWNER token
    const ownerMail = H.mail("t1own");
    const { who: O1, token: otok } = await H.teammate(X, ownerMail, "OWNER", "t1o");
    await AU("eraseTeammate")(X.token, { targetUserId: O1.agentUserId });
    const O2 = await H.login(ownerMail, { teammateInvite: otok, teammateName: `${H.MARK} mate t1o again` });
    const s = R(await AU("resolveAgentSession")(O2.token));
    report("T1b", "erased OWNER teammate rejoins as OWNER with the old token", O2.raw.ok === true,
      "INVITE_INVALID", `verify → ${fmt({ ok: O2.raw.ok, code: O2.raw.code, created: O2.raw.created })} · session role = ${fmt(s.role)}`);

    // T1c (control): token of a DISABLED (not erased) teammate is refused
    const dMail = H.mail("t1dis");
    const { who: D1, token: dtok } = await H.teammate(X, dMail, "SALES", "t1d");
    await AU("disableTeammate")(X.token, { targetUserId: D1.agentUserId });
    const D2 = await H.login(dMail, { teammateInvite: dtok });
    report("T1c", "control: replay for a DISABLED teammate", D2.raw.ok === true, "refused (LOGIN_UNAVAILABLE in r1 · INVITE_INVALID since the token is single-use)", fmt({ ok: D2.raw.ok, code: D2.raw.code }));
  }

  // ───────────── T2: sticky close (CLOSED_BY_SHOP) → re-apply must always be PENDING — bypass through WITHDRAW ─────────────
  {
    const X = await H.signup("t2x");
    const a1 = R(await AU("agentApply")(X.token, { shopSlug: B.slug, application: H.app() }, meta()));
    const closed = await H.shop("closeAgentAccount", B.ctx, { agentAccountId: a1.agentAccountId });
    const soon = R(await AU("agentApply")(X.token, { shopSlug: B.slug, application: H.app() }, meta()));
    const later = new Date(Date.now() + 8 * 86_400_000);
    const a2 = R(await AU("agentApply")(X.token, { shopSlug: B.slug, application: H.app() }, meta({ now: later })));
    const w = R(await AU("agentWithdraw")(X.token, { shopSlug: B.slug }, meta({ now: later })));
    const a3 = R(await AU("agentApply")(X.token, { shopSlug: B.slug, application: H.app() }, meta({ now: later })));
    const scope = await AU("agentScope")(X.token, { shopSlug: B.slug });
    const row = (await q<{ status: string; approvedById: string | null; statusReason: string | null }>(`SELECT status, "approvedById", "statusReason" FROM "AgentAccount" WHERE id = $1`, [String(a1.agentAccountId)]))[0];
    const audits = (await q<{ action: string; after: Rec }>(`SELECT action, after FROM "AuditLog" WHERE "tenantId" = $1 AND "targetId" = $2 ORDER BY "createdAt"`, [B.id, String(a1.agentAccountId)])).map((r) => `${r.action.replace("agency.account.", "")}:${R(r.after).from ?? "-"}→${R(r.after).to}`);
    const bug = a3.ok === true && a3.status === "ACTIVE";
    report("T2", "shop closed the agency (CLOSED_BY_SHOP · sticky). After the cooldown: apply → PENDING → withdraw → apply again", bug,
      "every re-application after CLOSED_BY_SHOP stays PENDING until the shop approves (ruling R1#6 · brief §6.5)",
      `first=${a1.status} · close=${closed.status} · reapply in cooldown=${soon.code} · reapply +8d=${a2.status} · withdraw=${w.status}/${fmt(w.replayed)} · apply again=${fmt({ ok: a3.ok, status: a3.status, code: a3.code })} · row=${fmt(row)} · agentScope=${scope ? "GRANTED" : "null"}\n                audit trail: ${audits.join(" | ")}`);

    // T2b: same thing after REJECTED at a shop that later turned approval off is the same path; check REJECTED at shop A (needs approval) stays PENDING (control)
    const Z = await H.signup("t2z");
    const z1 = R(await AU("agentApply")(Z.token, { shopSlug: A.slug, application: H.app() }, meta()));
    await H.shop("rejectAgentAccount", A.ctx, { agentAccountId: z1.agentAccountId });
    const z2 = R(await AU("agentApply")(Z.token, { shopSlug: A.slug, application: H.app() }, meta({ now: later })));
    await AU("agentWithdraw")(Z.token, { shopSlug: A.slug }, meta({ now: later }));
    const z3 = R(await AU("agentApply")(Z.token, { shopSlug: A.slug, application: H.app() }, meta({ now: later })));
    report("T2b", "control: shop that requires approval — REJECTED → reapply → withdraw → apply", z3.status === "ACTIVE", "PENDING", `${z2.status} → withdraw → ${fmt({ status: z3.status, code: z3.code })}`);
  }

  // ───────────── T3: SUSPENDED / sticky state evaded by closing the identity and signing up again with the same e-mail ─────────────
  {
    const email = H.mail("t3x");
    const X = await H.signup("t3x", email);
    const a1 = R(await AU("agentApply")(X.token, { shopSlug: B.slug, application: H.app() }, meta()));
    const sus = await H.shop("suspendAgentAccount", B.ctx, { agentAccountId: a1.agentAccountId });
    const blocked = R(await AU("agentApply")(X.token, { shopSlug: B.slug, application: H.app() }, meta()));
    const cl = R(await AU("closeMyIdentity")(X.token, { confirm: true }));
    const X2 = await H.login(email, { signup: { agencyName: `${H.MARK} t3x reborn`, ownerName: `${H.MARK} owner t3x` } });
    const a2 = R(await AU("agentApply")(X2.token, { shopSlug: B.slug, application: H.app() }, meta()));
    const scope = await AU("agentScope")(X2.token, { shopSlug: B.slug });
    report("T3", "suspended agency closes its identity, signs up again with the SAME e-mail and applies to the same shop (no wait)", a2.status === "ACTIVE",
      "(design question) a shop's SUSPEND / sticky close should not be escapable in minutes by the same mailbox",
      `suspend=${sus.status} · apply while suspended=${blocked.code} · closeMyIdentity=${fmt({ ok: cl.ok, closedAccounts: cl.closedAccounts })} · re-signup created=${X2.raw.created} newIdentity=${X2.identityId !== X.identityId} · apply=${fmt({ ok: a2.ok, status: a2.status })} · agentScope=${scope ? "GRANTED" : "null"}`);
  }

  // ───────────── T4: listAgentAccounts cursor = id of ANOTHER shop's account ─────────────
  {
    const X = await H.signup("t4x");
    const Y = await H.signup("t4y");
    const xa = R(await AU("agentApply")(X.token, { shopSlug: A.slug, application: H.app() }, meta()));
    const yb = R(await AU("agentApply")(Y.token, { shopSlug: B.slug, application: H.app() }, meta())); // account at B, created after A's rows
    const ya = R(await AU("agentApply")(Y.token, { shopSlug: A.slug, application: H.app() }, meta()));
    const base = await H.shop("listAgentAccounts", A.ctx, {});
    const foreign = await H.shop("listAgentAccounts", A.ctx, { cursor: yb.agentAccountId });
    const none = await H.shop("listAgentAccounts", A.ctx, { cursor: "aa_000000000000000000000000" });
    const own = await H.shop("listAgentAccounts", A.ctx, { cursor: ya.agentAccountId });
    const n = (r: Rec) => (Array.isArray(r.items) ? r.items.length : `fail:${r.code}`);
    const getForeign = await H.shop("getAgentAccount", A.ctx, { agentAccountId: yb.agentAccountId });
    const getNone = await H.shop("getAgentAccount", A.ctx, { agentAccountId: "aa_000000000000000000000000" });
    const apprForeign = await H.shop("approveAgentAccount", A.ctx, { agentAccountId: yb.agentAccountId });
    const bug = fmt(n(foreign)) !== fmt(n(none));
    report("T4", "shop A lists with cursor = account id of shop B vs. an id that exists nowhere", bug,
      "identical result for both (a foreign id must be indistinguishable from a non-existent id)",
      `rows of A=${n(base)} (x=${String(xa.agentAccountId).slice(0, 8)}…) · cursor=foreign → ${n(foreign)} items · cursor=nonexistent → ${n(none)} items · cursor=own newest → ${n(own)} items`);
    report("T4b", "get/approve by shop A of shop B's account id vs. non-existent id", fmt(getForeign) !== fmt(getNone) || apprForeign.code !== "NOT_FOUND", "same NOT_FOUND bytes", `get foreign=${fmt(getForeign)} · get none=${fmt(getNone)} · approve foreign=${apprForeign.code}`);
  }
} catch (e) {
  console.log(`PROBE ERROR: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await H.cleanup();
}
process.exit(0);
