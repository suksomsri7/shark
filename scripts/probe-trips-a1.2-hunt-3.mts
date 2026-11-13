// hunt-3 — races (owners · close ∥ apply · invite accept) · deadlock classification · erase/close residue · input hygiene · caps · leak scans
import { createHmac } from "node:crypto";
import { huntSetup, type Rec } from "./probe-trips-a1.2-hunt-lib.mjs";

const H = await huntSetup("probe-a1.2-hunt-3");
const { AU, R, fmt, q, meta, report } = H;
const authKey = (label: string) => createHmac("sha256", String(process.env.SESSION_SECRET)).update(`shark:agent-auth:v1:${label}`).digest();
const authHash = (label: string, data: string) => `v1:${createHmac("sha256", authKey(label)).update(data).digest("hex")}`;
const NEVER = ["identityId", "agentUserId", "lastLoginAt", "providerId", "subject", "activeAgentAccountId", "taxIdHash", "taxIdEnc", "bankAccountEnc", "inviteTokenHash", "tokenHash", "codeHash", "target", "tenantIds", "otherAccounts"];
const keysDeep = (v: unknown, out: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(v)) { for (const x of v) keysDeep(x, out); return out; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Rec)) { out.add(k); keysDeep(x, out); }
  return out;
};
const tallyOf = (xs: Rec[]) => fmt(xs.reduce<Record<string, number>>((a, x) => { const k = x.ok === true ? `ok${x.replayed ? "(replayed)" : ""}${x.status ? `:${x.status}` : ""}` : `${x.code}${x.reason ? `/${x.reason}` : ""}`; a[k] = (a[k] ?? 0) + 1; return a; }, {}));
try {
  const A = await H.mkTenant("p3a"); // needs approval
  const B = await H.mkTenant("p3b"); // auto-approve
  await H.setAutoApprove(B);

  // ───────────── R1: two logins of one e-mail at the same moment (two valid codes) — how is the collision classified? ─────────────
  {
    // observe the raw error inside the service without touching source: wrap prisma.$transaction of this process
    const seen: string[] = [];
    let hooked = false;
    try {
      const { prisma } = (await import("@/lib/core/db")) as unknown as { prisma: Rec };
      const orig = (prisma.$transaction as (...a: unknown[]) => Promise<unknown>).bind(prisma);
      (prisma as Rec).$transaction = async (...a: unknown[]) => {
        try { return await orig(...a); } catch (e) {
          const o = (e ?? {}) as Rec; const m = (o.meta ?? {}) as Rec; const dae = (m.driverAdapterError ?? {}) as Rec; const cause = (dae.cause ?? o.cause ?? {}) as Rec;
          if (o.name !== "Abort" && !(e instanceof Error && e.constructor.name === "Abort")) seen.push(`name=${String(o.name)} code=${String(o.code)} meta.code=${String(m.code)} cause.originalCode=${String(cause.originalCode)} cause.kind=${String(cause.kind)}`);
          throw e;
        }
      };
      hooked = (prisma as Rec).$transaction !== orig;
    } catch (e) { console.log(`   (hook failed: ${String(e).slice(0, 80)})`); }
    const e = H.mail("r1");
    await H.signup("r1", e);
    const t0 = new Date();
    const all: Rec[] = [];
    for (let round = 0; round < 6; round++) {
      const r1 = R(await H.reqCode(e, meta({ deps: H.depsOpen }))); const c1 = H.lastMail(e, "LOGIN_CODE")?.code;
      const r2 = R(await H.reqCode(e, meta({ deps: H.depsOpen }))); const c2 = H.lastMail(e, "LOGIN_CODE")?.code;
      all.push(...(await Promise.all([H.verify({ email: e, codeId: r1.codeId, code: c1 }, meta({ deps: H.depsOpen })), H.verify({ email: e, codeId: r2.codeId, code: c2 }, meta({ deps: H.depsOpen }))])));
    }
    const ops = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE "createdAt" >= $1 AND source = 'agency.auth' AND level = 'ERROR'`, [t0]))[0]?.n;
    const unexpected = all.filter((x) => x.code === "BUSY" && x.reason === "UNEXPECTED").length;
    report("R1", "same user logs in on two devices at the same moment (2 valid codes, 6 rounds)", unexpected > 0,
      "one ok + the other INVALID_CODE (or BUSY/LOCK) — a lock collision is not an 'unexpected' server error",
      `results=${tallyOf(all)} · agency.auth ERROR ops rows written=${ops} · hook=${hooked}\n                raw errors seen inside $transaction: ${[...new Set(seen)].join(" | ") || "(none captured)"}`);
  }

  // ───────────── R2–R4: last-owner races ─────────────
  {
    const rounds = 4;
    const res: string[] = [];
    let zero = false;
    for (let i = 0; i < rounds; i++) {
      const O1 = await H.signup(`r2o1-${i}`);
      const { who: O2 } = await H.teammate(O1, H.mail(`r2o2-${i}`), "OWNER", `r2-${i}`);
      const out = (await Promise.all([AU("eraseTeammate")(O1.token, { targetUserId: O2.agentUserId }), AU("eraseTeammate")(O2.token, { targetUserId: O1.agentUserId })])).map(R);
      const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentUser" WHERE "identityId" = $1 AND role = 'OWNER' AND status = 'ACTIVE'`, [O1.identityId]))[0]?.n ?? 0;
      if (n < 1) zero = true;
      res.push(`${out.map((x) => (x.ok ? "ok" : x.code)).join("+")}→owners=${n}`);
    }
    report("R2", "two OWNERs erase each other in parallel", zero, "≥ 1 active OWNER left every round", res.join(" · "));

    const res3: string[] = [];
    let zero3 = false;
    for (let i = 0; i < rounds; i++) {
      const O1 = await H.signup(`r3o1-${i}`);
      const { who: O2 } = await H.teammate(O1, H.mail(`r3o2-${i}`), "OWNER", `r3-${i}`);
      const out = (await Promise.all([AU("disableTeammate")(O1.token, { targetUserId: O2.agentUserId }), AU("setTeammateRole")(O2.token, { targetUserId: O1.agentUserId, role: "ADMIN" }), AU("eraseTeammate")(O1.token, { targetUserId: O1.agentUserId })])).map(R);
      const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentUser" WHERE "identityId" = $1 AND role = 'OWNER' AND status = 'ACTIVE'`, [O1.identityId]))[0]?.n ?? 0;
      if (n < 1) zero3 = true;
      res3.push(`${out.map((x) => (x.ok ? "ok" : x.code)).join("+")}→owners=${n}`);
    }
    report("R3", "O1 disables O2 ∥ O2 demotes O1 ∥ O1 erases self", zero3, "≥ 1 active OWNER left every round", res3.join(" · "));

    const res4: string[] = [];
    let zero4 = false;
    for (let i = 0; i < rounds; i++) {
      const O1 = await H.signup(`r4o1-${i}`);
      const { who: O2 } = await H.teammate(O1, H.mail(`r4o2-${i}`), "OWNER", `r4-${i}`);
      const a = R(await AU("agentApply")(O1.token, { shopSlug: B.slug, application: H.app() }, meta())); // seats both owners
      const out = (await Promise.all([
        AU("setAccountMember")(O1.token, { agentAccountId: a.agentAccountId, targetUserId: O2.agentUserId, role: null }),
        AU("setAccountMember")(O2.token, { agentAccountId: a.agentAccountId, targetUserId: O1.agentUserId, role: null }),
        AU("setTeammateRole")(O1.token, { targetUserId: O2.agentUserId, role: "SALES" }),
        AU("disableTeammate")(O2.token, { targetUserId: O1.agentUserId }),
      ])).map(R);
      const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccountMember" m JOIN "AgentUser" u ON u.id = m."agentUserId" WHERE m."agentAccountId" = $1 AND m.active AND m.role = 'OWNER' AND u.status = 'ACTIVE'`, [String(a.agentAccountId)]))[0]?.n ?? 0;
      if (n < 1) zero4 = true;
      res4.push(`${out.map((x) => (x.ok ? "ok" : x.code)).join("+")}→ownerMembers=${n}`);
    }
    report("R4", "account level: owners remove each other from the account ∥ demote ∥ disable", zero4, "≥ 1 usable OWNER member on the ACTIVE account every round", res4.join(" · "));
  }

  // ───────────── R5–R6: closeMyIdentity racing with apply / teammate join ─────────────
  {
    const res: string[] = [];
    let bad = false;
    for (let i = 0; i < 4; i++) {
      const X = await H.signup(`r5-${i}`);
      const mateMail = H.mail(`r5m-${i}`);
      const ti = R(await AU("createTeammateInvite")(X.token, { email: mateMail, role: "ADMIN" }, meta()));
      const rc = R(await H.reqCode(mateMail)); const code = H.lastMail(mateMail, "LOGIN_CODE")?.code;
      const out = (await Promise.all([
        AU("closeMyIdentity")(X.token, { confirm: true }),
        AU("agentApply")(X.token, { shopSlug: B.slug, application: H.app() }, meta()),
        AU("agentApply")(X.token, { shopSlug: A.slug, application: H.app() }, meta()),
        H.verify({ email: mateMail, codeId: rc.codeId, code, teammateInvite: ti.teammateToken }),
      ])).map(R);
      const open = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "identityId" = $1 AND status <> 'CLOSED'`, [X.identityId]))[0]?.n ?? 0;
      const users = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentUser" WHERE "identityId" = $1 AND status <> 'ERASED'`, [X.identityId]))[0]?.n ?? 0;
      const logins = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLogin" l JOIN "AgentUser" u ON u.id = l."agentUserId" WHERE u."identityId" = $1`, [X.identityId]))[0]?.n ?? 0;
      const ist = (await q<{ status: string }>(`SELECT status FROM "AgentIdentity" WHERE id = $1`, [X.identityId]))[0]?.status;
      if (ist === "CLOSED" && (open > 0 || users > 0 || logins > 0)) bad = true;
      res.push(`[${out.map((x) => (x.ok ? `ok${x.status ? `:${x.status}` : ""}` : x.code)).join("+")}] identity=${ist} openAccounts=${open} liveUsers=${users} logins=${logins}`);
    }
    report("R5", "closeMyIdentity ∥ apply (2 shops) ∥ teammate joins with a valid invite", bad, "identity CLOSED ⇒ 0 non-CLOSED accounts · 0 non-ERASED users · 0 logins", `\n        ${res.join("\n        ")}`);
  }

  // ───────────── R7: one shop invite token, 6 identities accept in parallel · accept ∥ reissue ─────────────
  {
    const invMail = H.mail("r7inv");
    const inv = await H.shop("inviteAgent", A.ctx, { mode: "EMAIL", email: invMail, legalName: `${H.MARK} r7 legal`, payeeType: "TH_JURISTIC", idempotencyKey: `hunt-r7-${H.hex(6)}` });
    const ids = [] as Awaited<ReturnType<typeof H.signup>>[];
    for (let i = 0; i < 6; i++) ids.push(await H.signup(`r7-${i}`));
    const out = (await Promise.all([...ids.map((X) => AU("agentAcceptInvite")(X.token, { shopSlug: A.slug, inviteToken: inv.inviteToken }, meta())), H.shop("reissueAgentInvite", A.ctx, { agentAccountId: inv.agentAccountId })])).map(R);
    const row = (await q<Rec>(`SELECT status, "identityId" IS NOT NULL AS bound, "inviteTokenHash" IS NOT NULL AS "hasToken" FROM "AgentAccount" WHERE id = $1`, [String(inv.agentAccountId)]))[0];
    const mem = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccountMember" WHERE "agentAccountId" = $1`, [String(inv.agentAccountId)]))[0]?.n;
    const accepts = out.slice(0, 6).filter((x) => x.ok === true).length;
    const re = out[6];
    const incoherent = accepts > 1 || (accepts === 1 && (row?.hasToken === true || mem !== 1)) || (accepts === 0 && (row?.bound === true || mem !== 0));
    report("R7", "6 identities accept the same e-mail invite in parallel ∥ shop re-issues it", incoherent, "≤ 1 accept · row/members coherent with the winner · old token dead after re-issue",
      `accepts=${tallyOf(out.slice(0, 6))} · reissue=${fmt({ ok: re.ok, code: re.code })} · row=${fmt(row)} · members=${mem}`);
    const again = R(await AU("agentAcceptInvite")(ids[5].token, { shopSlug: A.slug, inviteToken: inv.inviteToken }, meta()));
    const wrongShop = R(await AU("agentAcceptInvite")(ids[5].token, { shopSlug: B.slug, inviteToken: inv.inviteToken }, meta()));
    console.log(`ℹ️  INFO [R7b] old token afterwards=${again.code} · same token at shop B's slug=${wrongShop.code}`);
  }

  // ───────────── R8: what stays after eraseTeammate / closeMyIdentity · does the e-mail land in the old identity again? ─────────────
  {
    const email = H.mail("r8x"), mateMail = H.mail("r8y");
    const X = await H.signup("r8x", email);
    const { who: Y } = await H.teammate(X, mateMail, "ADMIN", "r8");
    const contact = { name: `${H.MARK} r8 PERSON NAME`, phone: "+66811112222", email: `hunta12-r8contact-${H.STAMP}@example.test`, lineId: "r8line" };
    const a = R(await AU("agentApply")(X.token, { shopSlug: B.slug, application: H.app({ legalName: `${H.MARK} r8 legal`, contact, taxId: "0105556000017".length === 13 ? undefined : undefined }) }, meta()));
    await AU("setAccountMember")(X.token, { agentAccountId: a.agentAccountId, targetUserId: Y.agentUserId, role: "ADMIN" });
    await H.reqCode(mateMail); // an outstanding code for Y
    const er = R(await AU("eraseTeammate")(X.token, { targetUserId: Y.agentUserId }));
    const yUser = (await q<Rec>(`SELECT "displayName", status, "lastLoginAt" FROM "AgentUser" WHERE id = $1`, [Y.agentUserId]))[0];
    const yLogins = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLogin" WHERE "agentUserId" = $1 OR subject = $2`, [Y.agentUserId, mateMail]))[0]?.n;
    const ySess = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1`, [Y.agentUserId]))[0]?.n;
    const yCodes = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target = $1`, [authHash("login-target", mateMail)]))[0]?.n;
    const yMem = (await q<Rec>(`SELECT active, role, "agentUserId" = $2 AS "keepsUserId" FROM "AgentAccountMember" WHERE "agentAccountId" = $1 AND "agentUserId" = $2`, [String(a.agentAccountId), Y.agentUserId]))[0];
    const cl = R(await AU("closeMyIdentity")(X.token, { confirm: true }));
    const ident = (await q<Rec>(`SELECT "displayName", status, "publicCode" = $2 AS "codeKept", "taxIdHash" FROM "AgentIdentity" WHERE id = $1`, [X.identityId, X.publicCode]))[0];
    const acc = (await q<Rec>(`SELECT status, "statusReason", "legalName", contact FROM "AgentAccount" WHERE id = $1`, [String(a.agentAccountId)]))[0];
    const xCodes = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLoginCode" WHERE target = $1`, [authHash("login-target", email)]))[0]?.n;
    const sessDead = (await AU("resolveAgentSession")(X.token)) === null && (await AU("agentScope")(X.token, { shopSlug: B.slug })) === null;
    const back = await H.login(email);
    const back2 = await H.login(email, { signup: { agencyName: `${H.MARK} r8 again`, ownerName: `${H.MARK} r8 o` } });
    const oldMine = R(await AU("myAgentAccounts")(back2.token));
    const residue = yLogins !== 0 || ySess !== 0 || yCodes !== 0 || xCodes !== 0 || yUser?.status !== "ERASED" || String(yUser?.displayName).includes(H.MARK) || !sessDead || back2.identityId === X.identityId;
    report("R8", "erase teammate, then close the identity: global residue + can the e-mail get back into the old identity", residue,
      "no login/session/code rows · names replaced · old sessions dead · same e-mail ⇒ LOGIN_UNAVAILABLE without signup, a NEW identity with signup",
      `erase=${er.ok} user=${fmt(yUser)} logins=${yLogins} sessions=${ySess} codes(Y)=${yCodes} member=${fmt(yMem)}\n                close=${fmt({ ok: cl.ok, closedAccounts: cl.closedAccounts })} identity=${fmt(ident)} codes(X)=${xCodes} oldSessionDead=${sessDead}\n                login again (no signup)=${back.raw.code} · with signup=${back2.raw.created} newIdentity=${back2.identityId !== X.identityId} sees old accounts=${Array.isArray(oldMine.items) ? oldMine.items.length : fmt(oldMine)}`);
    console.log(`ℹ️  INFO [R8b] kept by the shop after the agency closed (brief §19.5 — by design): account=${fmt({ status: acc?.status, reason: acc?.statusReason, legalName: acc?.legalName })} contact=${fmt(acc?.contact)}`);
    const dto = await H.shop("getAgentAccount", B.ctx, { agentAccountId: a.agentAccountId });
    console.log(`ℹ️  INFO [R8c] shop DTO after close: identity=${fmt(R(dto.account).identity)} members=${fmt(R(dto.account).members)}`);
  }

  // ───────────── R9: input hygiene + serialisation + leak scan of everything the shop side can read ─────────────
  {
    const e = H.mail("r9");
    const tries: [string, string][] = [["10k chars", "A".repeat(10_000)], ["121 chars", "B".repeat(121)], ["html", `${H.MARK} <script>alert(1)</script><img src=x onerror=1>`], ["sql", `${H.MARK} '); DROP TABLE "AgentUser";--`], ["zero-width only", "​​"], ["zero-width inside", `${H.MARK} a​b`], ["rtl override", `${H.MARK} ‮gnp.exe`], ["newline", `${H.MARK} a\nb`], ["tab", `${H.MARK} a\tb`], ["NUL", `${H.MARK} a\u0000b`], ["lone surrogate", `${H.MARK} \ud800x`], ["NBSP only", "  "], ["emoji+combining", `${H.MARK} 🦈 é`]];
    const lines: string[] = [];
    let stored = "";
    for (const [name, v] of tries) {
      const r1 = R(await H.reqCode(e, meta({ deps: H.depsOpen }))); const code = H.lastMail(e, "LOGIN_CODE")?.code;
      const r = R(await H.verify({ email: e, codeId: r1.codeId, code, signup: { agencyName: v, ownerName: `${H.MARK} r9 owner` } }, meta({ deps: H.depsOpen })));
      if (r.ok === true && r.created === "IDENTITY") { const s = R(await AU("resolveAgentSession")(String(r.token))); stored = String(R(s.identity).displayName); lines.push(`${name}: ACCEPTED → stored ${JSON.stringify(stored)}`); await AU("closeMyIdentity")(String(r.token), { confirm: true }); }
      else lines.push(`${name}: ${r.ok === true ? `ok/${r.created}` : r.code}`);
    }
    const ctlAccepted = lines.filter((l) => /^(10k|121|zero-width only|rtl|newline|tab|NUL|lone|NBSP only)/.test(l) && l.includes("ACCEPTED"));
    report("R9", "agencyName at sign-up: control / invisible / oversize / markup strings", ctlAccepted.length > 0, "oversize, empty-after-clean, control, bidi-override, lone surrogate ⇒ VALIDATION · markup/SQL stored verbatim as text", `\n        ${lines.join("\n        ")}`);

    // application fields → shop DTO → JSON round trip + NEVER_SHOW scan + audit/outbox/ops scan for raw secrets
    const X = await H.signup("r9x");
    const xss = `${H.MARK} "><svg/onload=1> ${"ก".repeat(20)}`;
    const ap = R(await AU("agentApply")(X.token, { shopSlug: A.slug, application: H.app({ legalName: xss, contact: { name: xss, phone: "<b>1</b>", email: `"><x>@example.test`, lineId: "x' OR 1=1--" }, licenceNo: "<i>L</i>", licenceExpiry: "2031-02-29" }) }, meta()));
    const ap2 = R(await AU("agentApply")(X.token, { shopSlug: A.slug, application: H.app({ legalName: xss, contact: { name: xss, phone: "<b>1</b>", email: `"><x>@example.test`, lineId: "x' OR 1=1--" }, licenceNo: "<i>L</i>", licenceExpiry: "2031-02-28", __proto__: { x: 1 } }) }, meta()));
    const inv = await H.shop("inviteAgent", A.ctx, { mode: "EMAIL", email: H.mail("r9inv"), legalName: `${H.MARK} r9 invited`, payeeType: "FOREIGN", idempotencyKey: `hunt-r9-${H.hex(6)}` });
    const tm = R(await AU("createTeammateInvite")(X.token, { email: H.mail("r9mate"), role: "SALES" }, meta()));
    const dto = await H.shop("getAgentAccount", A.ctx, { agentAccountId: ap2.agentAccountId });
    const list = await H.shop("listAgentAccounts", A.ctx, { q: "%_\\' OR 1=1" });
    const listAll = await H.shop("listAgentAccounts", A.ctx, {});
    const scope = await AU("agentScope")(X.token, { shopSlug: A.slug });
    await H.shop("approveAgentAccount", A.ctx, { agentAccountId: ap2.agentAccountId });
    const scope2 = R(await AU("agentScope")(X.token, { shopSlug: A.slug }));
    let json = ""; let jsonErr = "";
    try { json = JSON.stringify([dto, listAll, scope2, R(await AU("myAgentAccounts")(X.token)), R(await AU("agentTeam")(X.token))]); JSON.parse(json); } catch (er) { jsonErr = String(er).slice(0, 80); }
    const never = [...keysDeep([dto, list, listAll, scope2])].filter((k) => NEVER.includes(k));
    const scopeKeys = Object.keys(scope2).sort().join(",");
    const audit = await q<{ j: string; after: Rec | null; actorType: string; actorId: string | null }>(`SELECT row_to_json(a)::text AS j, after, "actorType", "actorId" FROM "AuditLog" a WHERE "tenantId" = ANY($1::text[]) AND action LIKE 'agency.%'`, [[A.id, B.id]]); // agency.* rows only (the settings module's own rows of setAutoApprove are not agency code — HUNT.md note on R9b)
    const outbox = await q<{ j: string; payload: Rec }>(`SELECT row_to_json(o)::text AS j, payload FROM "OutboxEvent" o WHERE "tenantId" = ANY($1::text[]) AND type LIKE 'agency.%'`, [[A.id, B.id]]);
    const ops = await q<{ j: string }>(`SELECT row_to_json(o)::text AS j FROM "OpsEvent" o WHERE "createdAt" >= $1`, [H.RUN_START]);
    const secrets = [String(inv.inviteToken), String(tm.teammateToken), X.token, X.agentUserId, X.identityId, ...H.mails.map((m) => m.to), ...H.mails.map((m) => m.token ?? "").filter((t) => t.length > 10), ...[...H.agentUserIds], ...[...H.identityIds]].filter((s) => s && s.length >= 8);
    const hay = (rows: { j: string }[]) => rows.map((r) => r.j).join("\n");
    const hit = (s: string) => [...new Set(secrets.filter((x) => s.includes(x)))].map((x) => (x.includes("@") ? `email:${x.slice(0, 14)}…` : x.startsWith("ag_") ? "session-token" : x.length > 60 ? "teammate-token" : x.length === 43 ? "invite-token" : `id:${x.slice(0, 10)}…`));
    const allowedAfter = new Set(["from", "to", "reason", "actorKind", "fields", "idem", "body"]);
    const badAfter = [...new Set(audit.flatMap((r) => Object.keys(r.after ?? {}).filter((k) => !allowedAfter.has(k))))];
    const badPayload = outbox.filter((r) => Object.keys(r.payload ?? {}).join(",") !== "agentAccountId").length;
    const leakAudit = hit(hay(audit)), leakOutbox = hit(hay(outbox)), leakOps = hit(hay(ops));
    const bug = jsonErr !== "" || never.length > 0 || scopeKeys !== "agentAccountId,memberId,role,tenantId" || badAfter.length > 0 || badPayload > 0 || leakAudit.length > 0 || leakOutbox.length > 0 || leakOps.length > 0 || scope !== null;
    report("R9b", "shop-visible objects, audit, outbox, ops log: forbidden keys / raw tokens / e-mails / global ids", bug,
      "JSON-safe · no NEVER_SHOW key · agentScope = {agentAccountId,memberId,role,tenantId} · audit.after ⊂ allowed · outbox payload = {agentAccountId} · no token/e-mail/agentUserId/identityId anywhere",
      `apply(29 Feb 2031)=${ap.code} apply=${fmt({ ok: ap2.ok, status: ap2.status, code: ap2.code })} · json=${jsonErr || `ok ${json.length}b`} · NEVER keys=${fmt(never)} · scope before approve=${scope === null ? "null" : "GRANTED"} after keys=${scopeKeys} · q-injection list=${Array.isArray(list.items) ? `${list.items.length} items` : list.code}\n                audit rows=${audit.length} extra after-keys=${fmt(badAfter)} leaks=${fmt(leakAudit)} · outbox rows=${outbox.length} bad payloads=${badPayload} leaks=${fmt(leakOutbox)} · ops rows=${ops.length} leaks=${fmt(leakOps)}`);
    const d = R(dto.account);
    console.log(`ℹ️  INFO [R9c] stored verbatim (output encoding is the UI's job): legalName=${JSON.stringify(String(d.legalName).slice(0, 40))} contact.email=${JSON.stringify(R(d.contact).email)} phone=${JSON.stringify(R(d.contact).phone)} lineId=${JSON.stringify(R(d.contact).lineId)} licence=${fmt(d.licence)}`);
    const memberCols = (await q<{ c: string }>(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'AgentAccountMember' AND table_schema = current_schema()`)).map((r) => r.c).filter((c) => /agentUser/i.test(c));
    console.log(`ℹ️  INFO [R9d] tenant table AgentAccountMember carries global ids in columns ${fmt(memberCols)} (schema of A1.1 — brief §5.3 says tenant rows hold only agentAccountId + memberId)`);
  }

  // ───────────── R10: teammate token tampering ─────────────
  {
    const X = await H.signup("r10x");
    const Z = await H.signup("r10z");
    const mateMail = H.mail("r10m");
    const ti = String(R(await AU("createTeammateInvite")(X.token, { email: mateMail, role: "SALES" }, meta())).teammateToken);
    const tz = String(R(await AU("createTeammateInvite")(Z.token, { email: mateMail, role: "OWNER" }, meta())).teammateToken);
    const [P, S] = ti.split(".");
    const payload = JSON.parse(Buffer.from(P, "base64url").toString("utf8")) as Rec;
    const enc = (o: Rec) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
    const forged: [string, string][] = [
      ["role→OWNER, old signature", `${enc({ ...payload, r: "OWNER" })}.${S}`],
      ["payload of X + signature of Z's token", `${P}.${tz.split(".")[1]}`],
      ["expiry +10y, old signature", `${enc({ ...payload, e: Number(payload.e) + 315_360_000 })}.${S}`],
      ["empty signature", `${P}.`],
      ["signature = HMAC with empty key", `${P}.${createHmac("sha256", "").update(P).digest("base64url")}`],
      ["no dot", P],
      ["three parts", `${P}.${S}.${S}`],
      ["padding added", `${P}=.${S}`],
      ["other e-mail's token (invite was for mate, used by stranger)", ti],
    ];
    const res: string[] = [];
    let bad = false;
    for (const [name, tok] of forged) {
      const em = name.startsWith("other") ? H.mail("r10stranger") : mateMail;
      const r1 = R(await H.reqCode(em, meta({ deps: H.depsOpen }))); const code = H.lastMail(em, "LOGIN_CODE")?.code;
      const r = R(await H.verify({ email: em, codeId: r1.codeId, code, teammateInvite: tok }, meta({ deps: H.depsOpen })));
      if (r.ok === true) bad = true;
      res.push(`${name}=${r.ok === true ? `ACCEPTED/${r.created}` : r.code}`);
    }
    report("R10", "forged / swapped teammate tokens", bad, "all INVITE_INVALID (VALIDATION for malformed)", res.join(" · "));
  }

  // ───────────── R11: PENDING cap (200) under parallel applicants ─────────────
  {
    const S = await H.mkTenant("r11");
    const partyId = H.rid("party");
    let seeded = 0; let seedErr = "";
    try {
      await H.ins("Party", { id: partyId, tenantId: S.id, name: `${H.MARK} r11 party` });
      for (let i = 0; i < 197; i++) { await H.ins("AgentAccount", { id: H.rid(`r11a${i}`), tenantId: S.id, identityId: null, code: `H${String(i).padStart(4, "0")}`, status: "PENDING", partyId, legalName: `${H.MARK} seeded ${i}`, payeeType: "TH_JURISTIC", unitIds: [], kind: "AGENT", country: "TH", vatRegistered: false }); seeded++; }
    } catch (er) { seedErr = String(er).slice(0, 160); }
    if (seedErr) console.log(`ℹ️  INFO [R11] not run — could not seed PENDING rows: ${seedErr}`);
    else {
      const ids = [] as Awaited<ReturnType<typeof H.signup>>[];
      for (let i = 0; i < 8; i++) ids.push(await H.signup(`r11-${i}`));
      const out = (await Promise.all(ids.map((X) => AU("agentApply")(X.token, { shopSlug: S.slug, application: H.app() }, meta())))).map(R);
      const n = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentAccount" WHERE "tenantId" = $1 AND status = 'PENDING'`, [S.id]))[0]?.n ?? 0;
      report("R11", `shop with ${seeded} PENDING rows, 8 new agencies apply at the same moment (cap openPendingPerShop = 200)`, n > 200, "PENDING rows ≤ 200", `results=${tallyOf(out)} · PENDING rows now=${n}`);
    }
  }
} catch (e) {
  console.log(`PROBE ERROR: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await H.cleanup();
}
process.exit(0);
