// H4.5 bug hunt probes (security · privacy · race) — calls service/platform layer directly like qc-hr-h4.5. LINE = local fake only.
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scratchpad/h45-hunt/hunt.mts [P1 P2 ...]
// Every tenant/user/row it creates is deleted at the end (RESIDUE line).
import { randomBytes } from "node:crypto";
import { type Any, canon, short, errText, sleep, qc4Env, makeFixtures, cleanupFx, residueOf, vOf, tagOf } from "../../scripts/qc-hr-lib.mjs";
import { startFake, evText, evPostback, signedBody, repliesOf } from "../../scripts/qc-hr-h4.5-lib.mjs";

const WANT = process.argv.slice(2).filter((a) => /^P\d$/.test(a));
const on = (p: string) => !WANT.length || WANT.includes(p);
const { P, coreHash } = await qc4Env("h45-hunt");
const LL = (await import("@/lib/modules/hr/line-link")) as Any;
const LN = (await import("@/lib/modules/hr/line-notify")) as Any;
const HL = (await import("@/lib/platform/hr-line")) as Any;
const LINE = (await import("@/lib/modules/chat/line")) as Any;
const ROUTE = (await import("@/app/api/chat/webhook/[connectionId]/route" as string)) as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG_PREFIX = "qc-hr-h45hunt-";
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const raw = async (sql: string, ...p: unknown[]) => ((await fx.rawRows(sql, ...p)) ?? []) as Any[];
const ENV_KEYS = ["LINE_API_BASE", "APP_URL", "NEXT_PUBLIC_APP_URL", "SESSION_SECRET"];
const ENV_SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const envSet = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
const fake = await startFake();
envSet("LINE_API_BASE", fake.base);
envSet("APP_URL", "https://qc45hunt.shark.invalid");
envSet("NEXT_PUBLIC_APP_URL", "https://qc45hunt.shark.invalid");
if ((process.env.SESSION_SECRET ?? "").length < 32) envSet("SESSION_SECRET", randomBytes(32).toString("hex"));
const OUT: string[] = [];
const log = (s: string) => (OUT.push(s), console.log(s));
const MIN = 60_000;

async function main(): Promise<void> {
  if (LINE.lineApiBase() !== fake.base) throw new Error("lineApiBase() is not the fake — nothing sent");
  const TT = await fx.newTenant("", "QC H45 hunt");
  const u1 = await fx.newUnit(TT, `สาขาลับ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาสอง ${tag}`, "u2");
  const sA = (await sysSvc.createSystem(TT, "HR", `ทีม hunt ${tag}`)).id as string;
  const chatA = (await P.appSystem.create({ data: { tenantId: TT, type: "CHAT", name: `${SLUG} chat` } })).id as string;
  const cA = { tenantId: TT, systemId: sA };
  const SECRET = `qc45h${randomBytes(12).toString("hex")}`;
  const C1 = (await P.chatChannelConnection.create({ data: { tenantId: TT, systemId: chatA, type: "LINE", displayName: `${SLUG}-c1`, externalAccountId: `${SLUG}-c1`, credentials: { channelAccessToken: `qc45t${randomBytes(8).toString("hex")}`, channelSecret: SECRET } } })).id as string;
  for (const u of [u1, u2]) {
    await P.settingValue.create({ data: { tenantId: TT, key: "messaging.lineConnectionId", scope: "UNIT", scopeId: u, value: C1 } });
    await P.settingValue.create({ data: { tenantId: TT, key: "messaging.quietHours", scope: "UNIT", scopeId: u, value: { start: "00:00", end: "00:00" } } });
  }
  const U: Record<string, Any> = { owner: await fx.mkUser(TT, "owner", `QC45H owner ${tag}`, "OWNER", [], {}), mgrU2: await fx.mkUser(TT, "mgru2", `QC45H mgr ${tag}`, "MANAGER", [u2], { "hr.employee.create": true }) };
  const actor = (w: Any) => ({ tenantId: w.tenantId, userId: w.id, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });
  const E: Record<string, string> = {};
  const EXT: Record<string, string> = {};
  const K: Record<string, string> = {};
  const emp = async (n: string, unitId = u1) => {
    U[`s${n}`] = await fx.mkUser(TT, `s${n}`, `QC45H staff${n} ${tag}`, "STAFF", [], {});
    E[n] = await fx.mkEmp(TT, sA, `ลับพนักงาน${n} ${tag}`, { code: `H${n}`, startDate: "2024-01-01", unitId, linkedUserId: U[`s${n}`].id });
  };
  const contact = async (k: string, prefix = "Uqh", lang = "th") => {
    const ext = `${prefix}${k}${randomBytes(6).toString("hex")}`;
    const name = `ไลน์ลับ${k}${tag}`;
    fake.names.set(ext, name);
    K[k] = (await P.chatContact.create({ data: { tenantId: TT, systemId: chatA, channel: "LINE", channelConnectionId: C1, externalUserId: ext, displayName: name, lang } })).id as string;
    EXT[k] = ext;
  };
  const POL = (o: Record<string, unknown> = {}) => ({ enabled: true, events: { ROSTER: true, LEAVE: true, OT: true, SWAP: true, SLIP: true }, mode: "IMMEDIATE", digestAt: "17:30", monthlyCap: 200, unitId: null, ...o });
  const setPol = async (o: Record<string, unknown> = {}) => {
    const r = await LN.saveLineNotifyPolicy(cA, vOf(U.owner), POL(o));
    if (!r.ok) throw new Error(`setPol ${short(r)}`);
  };
  const hook = async (events: Any[]) => {
    const { body, sig } = signedBody(SECRET, events);
    const req = new Request(`http://qc.local/api/chat/webhook/${C1}`, { method: "POST", headers: { "content-type": "application/json", "x-line-signature": sig }, body });
    return ((await ROUTE.POST(req, { params: Promise.resolve({ connectionId: C1 }) })) as Response).status;
  };
  const type = async (k: string, text: string) => {
    const from = fake.reqs.length;
    const ev = evText(EXT[k]!, text, `t${k}`);
    const status = await hook([ev]);
    return { status, text: repliesOf(fake, from, ev).filter((m: Any) => m.type === "text").map((m: Any) => m.text).join("|") };
  };
  const press = async (k: string, data: string) => {
    const from = fake.reqs.length;
    const ev = evPostback(EXT[k]!, data, `p${k}`);
    await hook([ev]);
    return repliesOf(fake, from, ev);
  };
  const issue = async (n: string) => HL.issueHrLineCode(actor(U[`s${n}`]));
  const linkVia = async (n: string, k: string) => {
    const r = await issue(n);
    if (!r.ok) throw new Error(`issue ${n}: ${r.code}`);
    return type(k, r.code);
  };
  const links = (n: string) => raw(`SELECT "status","endReason","chatContactId","issuedForUserId" FROM "HrLineLink" WHERE "tenantId" = $1 AND "employeeId" = $2 ORDER BY "createdAt","id"`, TT, E[n]);
  const pushes = (k: string, from = 0) => fake.reqs.slice(from).filter((r) => r.path === "/v2/bot/message/push" && r.to === EXT[k] && r.retryKey);
  let seq = 0;
  const roster = (ns: string[]) => ({ id: `qc45h-${tag}-${++seq}`, tenantId: TT, systemId: sA, type: "hr.roster.published", payload: { systemId: sA, publishId: `pubh${tag}${seq}`, unitId: u1, employeeIds: ns.map((n) => E[n]) } });
  const noticesOf = (n: string) => raw(`SELECT "id","kind","line","lineAttempts","skipCode","digestOf","createdAt" FROM "HrNotice" WHERE "tenantId" = $1 AND "employeeId" = $2 ORDER BY "createdAt","id"`, TT, E[n]);
  const job = (now: Date) => HL.runHrLineJobs(now, { budgetMs: 60_000, tenantId: TT });

  for (const n of ["1", "2", "3", "4", "5", "6", "7"]) await emp(n);
  await emp("8", u2);
  for (const k of ["1", "att", "2a", "2b", "2c", "2d", "3", "4", "5", "6", "7", "8"]) await contact(k);
  await setPol();

  // ── P1 account takeover + account reassignment (stale ACTIVE link → new account sees old LINE name) ──
  if (on("P1")) {
    log("── P1 takeover / reassignment ──");
    const a = await linkVia("1", "1");
    const notes0 = await P.appNotification.count({ where: { tenantId: TT, recipientUserId: U.s1.id } });
    const r = await issue("1"); // victim's code leaked to attacker
    const fromVictim = fake.reqs.length;
    const b = await type("att", r.code);
    const notes1 = await P.appNotification.count({ where: { tenantId: TT, recipientUserId: U.s1.id } });
    const victimLine = fake.reqs.slice(fromVictim).filter((q) => q.to === EXT["1"]).length;
    const st1 = await LL.myLineStatus(actor(U.s1));
    log(`P1a link1=${a.text.slice(0, 20)} takeover=${b.text.slice(0, 20)} links=${canon((await links("1")).map((l) => `${l.status}/${l.endReason ?? "-"}`))} victimInApp+${notes1 - notes0} oldLINEtold=${victimLine} victimSeesName=${st1.displayName === fake.names.get(EXT.att!)}`);
    // reassignment: staff/service.ts revoke (linkedUserId=null) + link to another account — no HR LINE hook ends the link
    U.sX = await fx.mkUser(TT, "sx", `QC45H newholder ${tag}`, "STAFF", [], {});
    await P.hrEmployee.update({ where: { id: E["1"] }, data: { linkedUserId: null } });
    await P.hrEmployee.update({ where: { id: E["1"] }, data: { linkedUserId: U.sX.id } });
    const stX = await LL.myLineStatus(actor(U.sX));
    const chip = await LL.employeeLineStatus(cA, vOf(U.owner), { employeeId: E["1"] });
    const menu = await press("att", "hr.menu");
    log(`P1b newAccount myLineStatus=${short(stX, 200)}`);
    log(`P1b leak: newAccountSeesPrevLINEName=${stX.displayName === fake.names.get(EXT.att!)} adminChip=${chip.state} prevLINEstillGetsMenu=${menu.some((m: Any) => m.type === "flex")}`);
    // new holder may also unlink (the previous holder's LINE) — and gets the name before
    await P.hrEmployee.update({ where: { id: E["1"] }, data: { linkedUserId: U.s1.id } });
  }

  // ── P2 issue rate (parallel) · per-contact-only guess limit · concurrent consumption of one code ──
  if (on("P2")) {
    log("── P2 issue rate / guesses / double consume ──");
    const par = await Promise.all(Array.from({ length: 8 }, () => issue("2")));
    const ok = par.filter((x: Any) => x.ok).length;
    const pend = (await links("2")).filter((l) => l.status === "PENDING").length;
    log(`P2a 8 parallel issues ⇒ ok=${ok} rate=${par.filter((x: Any) => x.code === "RATE").length} PENDING=${pend} codes=${par.filter((x: Any) => x.ok).map((x: Any) => x.code.length).join(",")}`);
    await raw(`DELETE FROM "ChatRateBucket" WHERE "key" LIKE $1`, `%${TT}%`);
    await raw(`UPDATE "HrLineLink" SET "status"='CANCELLED',"endedAt"=now() WHERE "tenantId"=$1 AND "employeeId"=$2 AND "status"='PENDING'`, TT, E["2"]);
    const r = await issue("2");
    let wrongA = 0;
    for (let i = 0; i < 10; i++) if ((await type("2a", `ZZZZ${String(2000 + i)}`)).text) wrongA++;
    const eleventh = await type("2a", r.code);
    const fresh = await type("2b", r.code); // a second LINE account of the same attacker: fresh 10-guess budget
    const act = (await links("2")).filter((l) => l.status === "ACTIVE");
    log(`P2b wrong=${wrongA} 11thRightFromSameContact=${eleventh.text.slice(0, 18)} sameCodeFromFreshContact=${fresh.text.slice(0, 18)} ACTIVE=${act.length} viaFresh=${act[0]?.chatContactId === K["2b"]}`);
    const r2 = await issue("2");
    const [x, y] = await Promise.all([type("2c", r2.code), type("2d", r2.code)]);
    const act2 = (await links("2")).filter((l) => l.status === "ACTIVE");
    log(`P2c two contacts same code concurrently ⇒ replies=[${x.text.slice(0, 14)} | ${y.text.slice(0, 14)}] ACTIVE=${act2.length}`);
  }

  // ── P3 monthly cap at the edge under two concurrent senders (cap lock held, then released) ──
  if (on("P3")) {
    log("── P3 cap race ──");
    await linkVia("3", "3");
    await linkVia("4", "4");
    await setPol({ monthlyCap: 1 });
    const pl = await LN.planHrNotices(roster(["3", "4"]));
    const now = new Date();
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => (release = res));
    let held: () => void = () => {};
    const heldP = new Promise<void>((res) => (held = res));
    const holder = P.$transaction(async (tx: Any) => {
      await tx.$queryRawUnsafe(`SELECT count(pg_advisory_xact_lock(hashtextextended($1::text, 0)))::int AS n`, `hr:linecap:${sA}`);
      held();
      await gate;
    }, { maxWait: 10_000, timeout: 60_000 });
    await heldP;
    const from = fake.reqs.length;
    const runs = Promise.all(pl.ids.map((id: string) => HL.sendHrLineNotices({ tenantId: TT, ids: [id] }, { now })));
    let waiting = 0;
    for (let i = 0; i < 80 && waiting < 2; i++) {
      await sleep(100);
      const w = await raw(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event = 'advisory'`);
      waiting = Number(w[0]?.n ?? 0);
    }
    release();
    await holder;
    const t = await runs;
    const rows = [...(await noticesOf("3")), ...(await noticesOf("4"))].map((n) => n.line).sort();
    log(`P3 waitingOnCapLock=${waiting} lines=${rows.join(",")} pushes=${fake.reqs.slice(from).filter((q) => q.path.endsWith("/push")).length} tallies=${canon(t.map((x: Any) => [x.sent, x.cap]))}`);
    await setPol();
  }

  // ── P4 policy switched OFF / event toggled OFF with notices queued ──
  if (on("P4")) {
    log("── P4 OFF with queued notices ──");
    await linkVia("5", "5");
    await linkVia("6", "6");
    // (a) DIGEST mode: HELD → shop turns LINE OFF → job → turned back ON 40 days later
    await setPol({ mode: "DIGEST", digestAt: "17:30" });
    await LN.planHrNotices(roster(["5"]));
    await setPol({ enabled: false, mode: "DIGEST" });
    const d1 = new Date("2031-03-10T11:00:00Z"); // 18:00 BKK
    const f1 = fake.reqs.length;
    await job(d1);
    const afterOff = (await noticesOf("5")).map((n) => `${n.kind}:${n.line}:${n.skipCode ?? "-"}`);
    await setPol({ mode: "DIGEST" });
    const d2 = new Date("2031-04-20T11:00:00Z");
    await job(d2);
    const after = (await noticesOf("5")).map((n) => `${n.kind}:${n.line}`);
    log(`P4a offJobPushes=${pushes("5", f1).length} afterOff=${afterOff.join(",")} · re-enabled +41d ⇒ pushes=${pushes("5", f1).length} rows=${after.join(",")} text=${short(pushes("5", f1)[0]?.messages?.[0]?.altText ?? "-", 60)}`);
    // (b) IMMEDIATE: 500 ⇒ FAILED · owner switches ROSTER off · job retry +6 min
    await setPol();
    fake.script.set(EXT["6"]!, [500]);
    const n0 = new Date();
    const pl = await LN.planHrNotices(roster(["6"]));
    await HL.sendHrLineNotices({ tenantId: TT, ids: pl.ids }, { now: n0 });
    const s1 = (await noticesOf("6")).map((n) => n.line).join(",");
    await setPol({ events: { ROSTER: false, LEAVE: true, OT: true, SWAP: true, SLIP: true } });
    const f2 = fake.reqs.length;
    await job(new Date(n0.getTime() + 6 * MIN));
    log(`P4b afterFirst=${s1} · ROSTER off ⇒ retry pushes=${pushes("6", f2).length} final=${(await noticesOf("6")).map((n) => `${n.line}:${n.skipCode ?? "-"}`).join(",")}`);
    await setPol();
  }

  // ── P5 lifecycle: tenant SUSPENDED with a retry queued · employee offboard event not yet consumed + menu ──
  if (on("P5")) {
    log("── P5 suspended tenant ──");
    await linkVia("7", "7");
    fake.script.set(EXT["7"]!, [500]);
    const n0 = new Date();
    const pl = await LN.planHrNotices(roster(["7"]));
    await HL.sendHrLineNotices({ tenantId: TT, ids: pl.ids }, { now: n0 });
    await P.tenant.update({ where: { id: TT }, data: { status: "SUSPENDED" } });
    const f = fake.reqs.length;
    await job(new Date(n0.getTime() + 6 * MIN));
    const menu = await press("7", "hr.menu");
    log(`P5 SUSPENDED ⇒ retry pushes=${pushes("7", f).length} final=${(await noticesOf("7")).map((n) => n.line).join(",")} menuServed=${menu.some((m: Any) => m.type === "flex")}`);
    await P.tenant.update({ where: { id: TT }, data: { status: "ACTIVE" } });
  }

  // ── P6 matrix bits + byte scan of everything sent to the fake + in-app rows ──
  if (on("P6")) {
    log("── P6 matrix + sentinel scan ──");
    await linkVia("8", "8");
    const a = await LL.employeeLineStatus(cA, vOf(U.mgrU2), { employeeId: E["1"] }); // other branch
    const b = await LL.employeeLineStatus(cA, vOf(U.mgrU2), { employeeId: "qc45h-unknown" });
    const c = await LL.employeeLineStatus(cA, vOf(U.mgrU2), { employeeId: E["8"] });
    const d = await LL.employeeLineStatus(cA, vOf(U.s2), { employeeId: E["2"] }); // plain employee, own id
    const m = await LL.myLineStatus({ ...actor(U.s8), employeeId: E["1"] });
    log(`P6a otherBranch==unknown ${canon(a) === canon(b)} own-branch=${short(c, 90)} plainEmpOwn=${d.ok} selfForged=${m.displayName === fake.names.get(EXT["8"]!)} keys=${Object.keys(c).sort().join(",")}`);
    const sentinels = [...fx.names, TT, sA, u1, u2, ...Object.values(E), ...Object.values(K), ...Object.values(EXT), SLUG].filter((s) => s && s.length > 5);
    const blob = canon(fake.reqs.map((q) => q.messages));
    const notes = canon(await P.appNotification.findMany({ where: { tenantId: TT }, select: { title: true, body: true } }));
    const hit = sentinels.filter((s) => blob.includes(s));
    const hitN = sentinels.filter((s) => notes.includes(s));
    const kinds = new Set(fake.reqs.filter((q) => q.path.endsWith("/push") && q.retryKey).map((q) => short(q.messages?.[0]?.altText ?? "", 40)));
    log(`P6b requests=${fake.reqs.length} sentinelHitsInBodies=${hit.length}${hit.length ? ` ${hit.slice(0, 3).join(",")}` : ""} inApp=${hitN.length} altTexts=${[...kinds].join(" | ")} blocked=${fake.blocked.length}`);
  }
}

let crashed = "";
try {
  await main();
} catch (e) {
  crashed = errText(e);
  log(`💥 ${crashed}`);
}
for (const tid of fx.tenants) {
  for (const sql of [
    `DELETE FROM "ChatConversationEvent" WHERE "conversationId" IN (SELECT "id" FROM "ChatConversation" WHERE "tenantId" = $1)`,
    `DELETE FROM "ChatConversationPref" WHERE "conversationId" IN (SELECT "id" FROM "ChatConversation" WHERE "tenantId" = $1)`,
    `DELETE FROM "ChatReadState" WHERE "conversationId" IN (SELECT "id" FROM "ChatConversation" WHERE "tenantId" = $1)`,
    `DELETE FROM "ChatAttachment" WHERE "systemId" IN (SELECT "id" FROM "AppSystem" WHERE "tenantId" = $1)`, `DELETE FROM "ChatMessage" WHERE "tenantId" = $1`, `DELETE FROM "ChatConversation" WHERE "tenantId" = $1`,
    `DELETE FROM "HrNotice" WHERE "tenantId" = $1`, `DELETE FROM "HrLineLink" WHERE "tenantId" = $1`, `DELETE FROM "ChatLinkCode" WHERE "tenantId" = $1`,
    `DELETE FROM "ChatRateBucket" WHERE "key" LIKE '%' || $1 || '%'`, `DELETE FROM "ChatContact" WHERE "tenantId" = $1`,
    `DELETE FROM "ChatWebhookLog" WHERE "connectionId" IN (SELECT "id" FROM "ChatChannelConnection" WHERE "tenantId" = $1)`, `DELETE FROM "ChatChannelConnection" WHERE "tenantId" = $1`,
    `DELETE FROM "SettingValue" WHERE "tenantId" = $1`,
  ]) await fx.rawRows(sql, tid);
}
await cleanupFx(P, fx, SLUG);
const res = await residueOf(P, fx, SLUG, SLUG_PREFIX);
const mine: string[] = [];
for (const tid of fx.tenants)
  for (const t of ["HrLineLink", "HrNotice", "ChatContact", "ChatChannelConnection", "ChatLinkCode", "ChatMessage", "SettingValue"]) {
    const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
    if (r && Number(r[0]?.n ?? 0) !== 0) mine.push(`${t}=${r[0]?.n}`);
  }
const b = fx.tenants.length ? await fx.rawRows(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE ANY($1::text[])`, fx.tenants.map((t) => `%${t}%`)) : [{ n: 0 }];
if (Number(b?.[0]?.n ?? 0) !== 0) mine.push(`ChatRateBucket=${b?.[0]?.n}`);
console.log(`RESIDUE-H45 ${[...res, ...mine].join(",") || "none"} · external blocked=${fake.blocked.length} (${[...new Set(fake.blocked)].join(",") || "-"}) · fake requests=${fake.reqs.length}`);
for (const k of ENV_KEYS) envSet(k, ENV_SAVED[k]);
fake.restore();
await fake.close();
await P.$disconnect?.();
process.exit(crashed ? 1 : 0);
