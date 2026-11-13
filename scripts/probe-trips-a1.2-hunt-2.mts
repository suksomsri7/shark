// hunt-2 — login codes · e-mail variants · rate-limit buckets · sessions · enumeration shapes
import { huntSetup, type Rec } from "./probe-trips-a1.2-hunt-lib.mjs";

const H = await huntSetup("probe-a1.2-hunt-2");
const { AU, R, fmt, q, meta, report } = H;
const opsSince = async (t: Date) => (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "OpsEvent" WHERE "createdAt" >= $1 AND source LIKE 'agency.%' AND level = 'ERROR'`, [t]).catch(() => [{ n: -1 }]))[0]?.n;
try {
  // ───────────── L1: IP bucket (codePerIp 60/h "the one bucket the attacker cannot reset") vs IPv6 neighbours / textual variants ─────────────
  {
    const ip = "2001:db8:aa:bb::1";
    const out: string[] = [];
    for (let i = 0; i < 61; i++) out.push(String(R(await H.reqCode(H.mail(`l1-${i}`), meta({ ip }))).code ?? "ok"));
    const okN = out.filter((x) => x === "ok").length;
    const sameAgain = R(await H.reqCode(H.mail("l1-same"), meta({ ip })));
    const neighbour = R(await H.reqCode(H.mail("l1-nb"), meta({ ip: "2001:db8:aa:bb::2" }))); // same /64 = same subscriber
    const upper = R(await H.reqCode(H.mail("l1-up"), meta({ ip: "2001:DB8:AA:BB::1" }))); // same address, other spelling
    const expanded = R(await H.reqCode(H.mail("l1-ex"), meta({ ip: "2001:db8:aa:bb:0:0:0:1" }))); // same address, expanded
    const bug = neighbour.ok === true || upper.ok === true || expanded.ok === true;
    report("L1", "codePerIp: 61 requests from one IPv6 address, then the same subscriber's next address / same address spelled differently", bug,
      "after the bucket is full the same client is refused whatever address of its /64 (or spelling) it uses",
      `first 61 → ok ${okN} / RATE_LIMITED ${61 - okN} · same ip again=${sameAgain.code} · ::2 (same /64)=${neighbour.ok === true ? "OK (new bucket)" : neighbour.code} · upper-case=${upper.ok === true ? "OK (new bucket)" : upper.code} · expanded=${expanded.ok === true ? "OK (new bucket)" : expanded.code}`);
  }

  // ───────────── L2: e-mail variants — which strings are accepted as a login e-mail, and do they share the per-e-mail bucket/target? ─────────────
  {
    const base = `hunta12-l2-${H.STAMP}@example.test`;
    const variants: [string, string][] = [
      ["upper-case", base.toUpperCase()],
      ["surrounding spaces", `  ${base} `],
      ["trailing dot", `${base}.`],
      ["plus tag", base.replace("@", "+x@")],
      ["zero-width space in local part", base.replace("-l2-", "-l​2-")],
      ["BOM in local part", base.replace("-l2-", "-l﻿2-")],
      ["NUL in local part", base.replace("-l2-", "-l\u00002-")],
      ["ESC control char", base.replace("-l2-", "-l\u001b2-")],
      ["RTL override", base.replace("-l2-", "-l‮2-")],
      ["cyrillic homoglyph а", base.replace("hunta12", "huntа12")],
      ["html in local part", base.replace("-l2-", "-<img/src=x>-")],
    ];
    const first = R(await H.reqCode(base));
    const t0 = (await q<{ target: string }>(`SELECT target FROM "AgentLoginCode" WHERE id = $1`, [String(first.codeId)]))[0]?.target;
    const lines: string[] = [];
    const accepted: string[] = [];
    for (const [name, v] of variants) {
      const r = R(await H.reqCode(v));
      const t = r.ok === true ? (await q<{ target: string }>(`SELECT target FROM "AgentLoginCode" WHERE id = $1`, [String(r.codeId)]))[0]?.target : null;
      const to = H.mails[H.mails.length - 1]?.to ?? "";
      lines.push(`${name}: ${r.ok === true ? (t === t0 ? "accepted · SAME target" : `accepted · DIFFERENT target · mail to=${JSON.stringify(to)}`) : `${r.code}`}`);
      if (r.ok === true && t !== t0) accepted.push(name);
    }
    const ctl = accepted.filter((n) => /zero-width|BOM|NUL|ESC|RTL/.test(n));
    report("L2", "e-mail variants accepted by requestAgentLoginCode (target = per-e-mail bucket + identity key)", ctl.length > 0,
      "invisible / control characters are rejected (VALIDATION) — the shop-side normEmail (cleanAgencyText) already rejects them; case/space variants map to the same target",
      `\n        ${lines.join("\n        ")}`);

    // L2b: sign up with an e-mail that contains NUL (passes the e-mail regex) → DB error path?
    const nul = base.replace("-l2-", "-nul\u0000-");
    const t = new Date();
    const r1 = R(await H.reqCode(nul));
    const code = H.lastMail(nul, "LOGIN_CODE")?.code;
    const v = R(await H.verify({ email: nul, codeId: r1.codeId, code, signup: { agencyName: `${H.MARK} nul`, ownerName: `${H.MARK} nul owner` } }));
    const ops = await opsSince(t);
    report("L2b", "sign-up with an e-mail containing U+0000 (request accepted it)", v.code === "BUSY",
      "VALIDATION at input (never reaches the database)", `request=${r1.ok === true ? "ok" : r1.code} · verify=${fmt({ ok: v.ok, code: v.code, reason: v.reason })} · new agency.* ERROR ops rows=${ops}`);

    // L2c: zero-width variant really becomes a second identity next to the clean one
    const zw = base.replace("-l2-", "-l​2-");
    const A1 = await H.login(base, { signup: { agencyName: `${H.MARK} l2 clean`, ownerName: `${H.MARK} o` } });
    // r2 (ruling §10 item 17): the zero-width address is now refused when the code is requested (H.login throws on a refused request) — a refusal is "held"
    let A2: Awaited<ReturnType<typeof H.login>> | null = null;
    let refused = "";
    try { A2 = await H.login(zw, { signup: { agencyName: `${H.MARK} l2 zw`, ownerName: `${H.MARK} o` } }); } catch (e) { refused = (e instanceof Error ? e.message : String(e)).replace(/^reqCode [^{]*/, "").slice(0, 160); }
    report("L2c", "sign-up with the zero-width variant of an e-mail that already has an identity", A2 !== null && A2.raw.ok === true && A2.identityId !== A1.identityId,
      "VALIDATION (or the same identity)", A2 === null ? `clean=${A1.raw.created} · zero-width=refused when the code was requested ${refused} · two identities=false` : `clean=${A1.raw.created} · zero-width=${fmt({ ok: A2.raw.ok, created: A2.raw.created, code: A2.raw.code })} · two identities=${A2.identityId !== "" && A2.identityId !== A1.identityId}`);
  }

  // ───────────── L3: codeId tricks ─────────────
  {
    const e = H.mail("l3");
    const X = await H.signup("l3", e);
    const r = R(await H.reqCode(e));
    const code = H.lastMail(e, "LOGIN_CODE")?.code ?? "";
    const t = new Date();
    const nul = R(await H.verify({ email: e, codeId: "alc_\u0000", code }));
    const ops = await opsSince(t);
    const long = R(await H.verify({ email: e, codeId: "x".repeat(65), code }));
    const obj = R(await H.verify({ email: e, codeId: { toString: () => String(r.codeId) }, code }));
    const arr = R(await H.verify({ email: e, codeId: r.codeId, code: [code] }));
    const num = R(await H.verify({ email: e, codeId: r.codeId, code: Number(code) }));
    const sp = R(await H.verify({ email: e, codeId: r.codeId, code: ` ${code}` }));
    const fw = R(await H.verify({ email: e, codeId: r.codeId, code: code.replace(/[0-9]/g, (d) => String.fromCharCode(0xff10 + Number(d))) }));
    const att = (await q<{ attempts: number; usedAt: Date | null }>(`SELECT attempts, "usedAt" FROM "AgentLoginCode" WHERE id = $1`, [String(r.codeId)]))[0];
    report("L3", "verify with malformed codeId / code types", nul.code !== "INVALID_CODE" && nul.code !== "VALIDATION",
      "every malformed input ⇒ VALIDATION or INVALID_CODE, no server error",
      `codeId with NUL=${fmt({ code: nul.code, reason: nul.reason })} (+${ops} ERROR ops rows) · 65 chars=${long.code} · object=${obj.code} · code array=${arr.code} · code number=${num.code} · leading space=${sp.code} · full-width digits=${fw.code} · attempts=${att?.attempts} usedAt=${att?.usedAt}`);
    void X;
  }

  // ───────────── L4: cross-target / replay / other user's codeId ─────────────
  {
    const ea = H.mail("l4a"), eb = H.mail("l4b");
    const A = await H.signup("l4a", ea);
    const B = await H.signup("l4b", eb);
    const ra = R(await H.reqCode(ea)), rb = R(await H.reqCode(eb));
    const ca = H.lastMail(ea, "LOGIN_CODE")?.code ?? "", cb = H.lastMail(eb, "LOGIN_CODE")?.code ?? "";
    const x1 = R(await H.verify({ email: ea, codeId: rb.codeId, code: cb })); // B's code+id, A's e-mail
    const x2 = R(await H.verify({ email: eb, codeId: ra.codeId, code: ca }));
    const x3 = R(await H.verify({ email: ea, codeId: rb.codeId, code: ca }));
    const attB = (await q<{ attempts: number }>(`SELECT attempts FROM "AgentLoginCode" WHERE id = $1`, [String(rb.codeId)]))[0]?.attempts;
    const good = R(await H.verify({ email: eb, codeId: rb.codeId, code: cb }));
    const sess = R(await AU("resolveAgentSession")(String(good.token)));
    report("L4", "code/codeId of e-mail B presented with e-mail A (and the reverse)", x1.ok === true || x2.ok === true || x3.ok === true || sess.agentUserId !== B.agentUserId,
      "all INVALID_CODE · B's attempts untouched · B's own verify still lands in B",
      `A+idB+codeB=${x1.code} · B+idA+codeA=${x2.code} · A+idB+codeA=${x3.code} · attempts(B)=${attB} · B verify ok=${good.ok} lands in B=${sess.agentUserId === B.agentUserId}`);
    void A;
  }

  // ───────────── L5: enumeration — known vs unknown e-mail ─────────────
  {
    const known = H.mail("l5k");
    await H.signup("l5k", known);
    const unknown = H.mail("l5u");
    const strip = (r: Rec) => JSON.stringify({ ...r, codeId: "X", expiresAt: "X", maskedTo: String(r.maskedTo).replace(/^./, "?") });
    const n0 = H.mails.length;
    const a = R(await H.reqCode(known)), b = R(await H.reqCode(unknown));
    const m = H.mails.slice(n0).map((x) => `${x.kind}:${Object.keys(x).filter((k) => (x as Rec)[k] !== undefined).sort().join("+")}`);
    const rowA = (await q<Rec>(`SELECT attempts, "usedAt", length(target) AS tl, length("codeHash") AS hl, ("expiresAt" - "createdAt")::text AS ttl FROM "AgentLoginCode" WHERE id = $1`, [String(a.codeId)]))[0];
    const rowB = (await q<Rec>(`SELECT attempts, "usedAt", length(target) AS tl, length("codeHash") AS hl, ("expiresAt" - "createdAt")::text AS ttl FROM "AgentLoginCode" WHERE id = $1`, [String(b.codeId)]))[0];
    const wa = R(await H.verify({ email: known, codeId: a.codeId, code: H.lastMail(known, "LOGIN_CODE")?.code === "000000" ? "111111" : "000000" }));
    const wb = R(await H.verify({ email: unknown, codeId: b.codeId, code: H.lastMail(unknown, "LOGIN_CODE")?.code === "000000" ? "111111" : "000000" }));
    const fa = R(await H.verify({ email: known, codeId: "alc_doesnotexist", code: "123456" }));
    const fb = R(await H.verify({ email: unknown, codeId: "alc_doesnotexist", code: "123456" }));
    const same = strip(a) === strip(b) && fmt(rowA) === fmt(rowB) && fmt(wa) === fmt(wb) && fmt(fa) === fmt(fb) && m[0] === m[1];
    report("L5", "request/verify for an e-mail that has an account vs. one that does not", !same, "identical shapes, rows and mails",
      `request shapes equal=${strip(a) === strip(b)} · code rows equal=${fmt(rowA) === fmt(rowB)} · mails=${m.join(" vs ")} · wrong code ${wa.code}/${wb.code} equal=${fmt(wa) === fmt(wb)} · unknown codeId ${fa.code}/${fb.code}`);
    // correct code, no signup: unknown e-mail (mailbox owner only) ⇒ LOGIN_UNAVAILABLE and the code stays usable for a later signup
    const cu = H.lastMail(unknown, "LOGIN_CODE")?.code;
    const nu = R(await H.verify({ email: unknown, codeId: b.codeId, code: cu }));
    const su = R(await H.verify({ email: unknown, codeId: b.codeId, code: cu, signup: { agencyName: `${H.MARK} l5u`, ownerName: `${H.MARK} l5u o` } }));
    report("L5b", "correct code without signup for a new e-mail, then again with signup (same code)", !(nu.code === "LOGIN_UNAVAILABLE" && su.ok === true), "LOGIN_UNAVAILABLE then ok/IDENTITY (documented by the builder)", `${nu.code} → ${fmt({ ok: su.ok, created: su.created, code: su.code })}`);
  }

  // ───────────── L6: parallel sign-up of one new e-mail with two valid codes · parallel same code ×20 ─────────────
  {
    const e = H.mail("l6");
    const r1 = R(await H.reqCode(e)); const c1 = H.lastMail(e, "LOGIN_CODE")?.code;
    const r2 = R(await H.reqCode(e)); const c2 = H.lastMail(e, "LOGIN_CODE")?.code;
    const su = { agencyName: `${H.MARK} l6`, ownerName: `${H.MARK} l6 o` };
    const out = await Promise.all([
      ...Array.from({ length: 10 }, () => H.verify({ email: e, codeId: r1.codeId, code: c1, signup: su })),
      ...Array.from({ length: 10 }, () => H.verify({ email: e, codeId: r2.codeId, code: c2, signup: su })),
    ]);
    const okN = out.filter((x) => x.ok === true).length;
    const idn = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentLogin" WHERE subject = $1`, [e]))[0]?.n;
    const idents = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentIdentity" WHERE "displayName" = $1`, [su.agencyName]))[0]?.n;
    const sess = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentSession" s JOIN "AgentLogin" l ON l."agentUserId" = s."agentUserId" WHERE l.subject = $1`, [e]))[0]?.n;
    const codes = [...new Set(out.filter((x) => x.ok !== true).map((x) => `${x.code}${x.reason ? `/${x.reason}` : ""}`))];
    report("L6", "20 parallel sign-up verifies (two valid codes × 10) for one new e-mail", !(okN === 1 && idn === 1 && idents === 1 && sess === 1),
      "exactly 1 ok · 1 login · 1 identity · 1 session", `ok=${okN} · logins=${idn} · identities=${idents} · sessions=${sess} · other results=${codes.join(",")}`);
  }

  // ───────────── L7: session cap 20 under parallel logins ─────────────
  {
    const e = H.mail("l7");
    const X = await H.signup("l7", e);
    for (let i = 0; i < 18; i++) await H.login(e); // 19 live
    const live0 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1 AND "revokedAt" IS NULL`, [X.agentUserId]))[0]?.n;
    const reqs: { id: unknown; code: string | undefined }[] = [];
    for (let i = 0; i < 8; i++) { const r = R(await H.reqCode(e, meta({ deps: H.depsOpen }))); reqs.push({ id: r.codeId, code: H.lastMail(e, "LOGIN_CODE")?.code }); }
    const out = await Promise.all(reqs.map((x) => H.verify({ email: e, codeId: x.id, code: x.code }, meta({ deps: H.depsOpen }))));
    const live1 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1 AND "revokedAt" IS NULL`, [X.agentUserId]))[0]?.n;
    for (let i = 0; i < 4; i++) await H.login(e);
    const live2 = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1 AND "revokedAt" IS NULL`, [X.agentUserId]))[0]?.n;
    const first = await AU("resolveAgentSession")(X.token);
    report("L7", "19 live sessions, then 8 parallel logins with 8 different valid codes, then 4 more", (live1 ?? 99) > 20 || (live2 ?? 99) > 20,
      "live sessions never exceed 20", `live before=${live0} · parallel ok=${out.filter((x) => x.ok === true).length} (${[...new Set(out.filter((x) => x.ok !== true).map((x) => `${x.code}${x.reason ? `/${x.reason}` : ""}`))].join(",")}) · live after parallel=${live1} · after 4 more=${live2} · oldest session=${first === null ? "revoked" : "live"}`);

    // L7b: logout-all racing with a login
    const r = R(await H.reqCode(e, meta({ deps: H.depsOpen }))); const c = H.lastMail(e, "LOGIN_CODE")?.code;
    const cur = await H.login(e);
    const [lo, vf] = await Promise.all([AU("logoutAllAgentSessions")(cur.token).then(R), H.verify({ email: e, codeId: r.codeId, code: c }, meta({ deps: H.depsOpen }))]);
    const liveAfter = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM "AgentSession" WHERE "agentUserId" = $1 AND "revokedAt" IS NULL`, [X.agentUserId]))[0]?.n;
    console.log(`ℹ️  INFO [L7b] logout-all ∥ login: logoutAll=${fmt({ ok: lo.ok, revoked: lo.revoked })} · login=${fmt({ ok: vf.ok, code: vf.code })} · live sessions afterwards=${liveAfter} (a login that commits after "log out everywhere" survives — inherent)`);
  }

  // ───────────── L8: token shape tricks ─────────────
  {
    const X = await H.signup("l8");
    const t = X.token;
    const tries: [string, unknown][] = [["ok token", t], ["upper prefix", `AG_${t.slice(3)}`], ["trailing space", `${t} `], ["trailing newline", `${t}\n`], ["leading space", ` ${t}`], ["bearer", `Bearer ${t}`], ["array", [t]], ["object toString", { toString: () => t }], ["String object", new String(t)], ["1MB string", "ag_" + "A".repeat(1_000_000)], ["null", null], ["undefined", undefined], ["number", 12345], ["percent-encoded", encodeURIComponent(`${t}`) + "%00"]];
    const res: string[] = [];
    let bad = false;
    for (const [name, v] of tries) {
      let s: string;
      try { const r = await AU("resolveAgentSession")(v); s = r === null ? "null" : "SESSION"; } catch (e) { s = `THROW ${String(e).slice(0, 40)}`; }
      let g: string;
      try { const r = await AU("agentScope")(v, { shopSlug: "nope" }); g = r === null ? "null" : "SCOPE"; } catch (e) { g = `THROW ${String(e).slice(0, 40)}`; }
      if (name !== "ok token" && (s !== "null" || g !== "null")) bad = true;
      res.push(`${name}=${s}/${g}`);
    }
    const slugs: unknown[] = [null, 42, ["a"], { shopSlug: "x" }, "a".repeat(5000), "../x", "x%00", "A\u0000"];
    const sres: string[] = [];
    for (const s of slugs) { try { sres.push(String(await AU("agentScope")(t, { shopSlug: s }))); } catch (e) { sres.push(`THROW ${String(e).slice(0, 30)}`); bad = true; } }
    let noInput = "";
    try { noInput = String(await AU("agentScope")(t, null)); } catch (e) { noInput = `THROW ${String(e).slice(0, 30)}`; bad = true; }
    report("L8", "session token / shopSlug shape tricks", bad, "only the exact token resolves · every other shape ⇒ null without throwing",
      `${res.join(" · ")}\n                slugs → ${sres.join(",")} · input null → ${noInput}`);
  }

  // ───────────── L9: limiter failure modes ─────────────
  {
    const S = await H.mkTenant("l9");
    const X = await H.signup("l9");
    const broken = { ...H.deps, rateLimit: async () => ({ ok: true }) }; // limiter store down (checkRateLimitDb's fail-open verdict)
    const throwing = { ...H.deps, rateLimit: async () => { throw new Error("db down"); } };
    const a = R(await AU("requestAgentLoginCode")({ email: H.mail("l9a") }, meta({ deps: broken })));
    const b = R(await AU("requestAgentLoginCode")({ email: H.mail("l9b") }, meta({ deps: throwing })));
    const ap = R(await AU("agentApply")(X.token, { shopSlug: S.slug, application: H.app() }, meta({ deps: broken })));
    const lk = await H.shop("lookupAgentIdentityByCode", S.ctx, { publicCode: X.publicCode }, { deps: broken });
    report("L9", "limiter store down (verdict without count) / limiter throws", a.ok === true || b.ok === true,
      "login-code request fails closed (RATE_LIMITED / BUSY)", `request(broken)=${a.code} · request(throwing)=${fmt({ code: b.code, reason: b.reason })}`);
    console.log(`ℹ️  INFO [L9b] same outage on the other buckets: agentApply=${fmt({ ok: ap.ok, status: ap.status, code: ap.code })} · lookupAgentIdentityByCode=${fmt({ ok: lk.ok, code: lk.code })} (apply / lookup / invite-accept / per-client / per-IP buckets fail OPEN by design — only the per-e-mail and per-code buckets fail closed)`);
  }

  // ───────────── L10: a shop's applyPerShop bucket (30/h) drained by 3 throw-away identities ─────────────
  {
    const S = await H.mkTenant("l10");
    const ids = [await H.signup("l10a"), await H.signup("l10b"), await H.signup("l10c")];
    const seen: string[] = [];
    for (const X of ids) for (let i = 0; i < 10; i++) { const r = R(await AU("agentApply")(X.token, { shopSlug: S.slug, application: H.app() }, meta())); seen.push(r.ok === true ? (r.replayed ? "replayed" : String(r.status)) : String(r.code)); }
    const victim = await H.signup("l10v");
    const v = R(await AU("agentApply")(victim.token, { shopSlug: S.slug, application: H.app() }, meta()));
    const tally = seen.reduce<Record<string, number>>((a, x) => { a[x] = (a[x] ?? 0) + 1; return a; }, {});
    report("L10", "3 identities each repeat their own (replayed) application 10× to one shop, then a genuine new agency applies", v.code === "RATE_LIMITED",
      "replays of an existing application should not consume the shop-wide bucket (or: a genuine applicant is not locked out by 3 accounts)",
      `attackers: ${fmt(tally)} · genuine applicant → ${fmt({ ok: v.ok, status: v.status, code: v.code, retryAfterSec: v.retryAfterSec })}`);
  }
} catch (e) {
  console.log(`PROBE ERROR: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await H.cleanup();
}
process.exit(0);
