// QC — HR V2 · H4.5 LINE notices for employees (self link code · notices · delivery engine · menu) + in-app fallback
//      brief ledger/hr-briefs/hr-brief-H4.5.md (CONTROLLER RULINGS 14 Nov win) + notes ledger/wo-notes/hr-H4.5-oracle.md (shapes fixed by the oracle)
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
// 🔴 No real LINE: fake server 127.0.0.1:<free port> (scripts/qc-hr-h4.5-lib.mts) via LINE_API_BASE · lineApiBase() asserted = fake before the first send ·
//    fetch to any non-local host blocked. Webhook = the real route POST with a body HMAC-signed by the fixture OA secret.
// 🔴 Bodies byte for byte (ruling Q6) = MSG table in the lib · fixed `now` for every time rule · SKIP while hr/line-rules.ts is absent (QC_FORCE=1 runs) · --list
// Run: bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-h4.5.mts
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  type Any, type Base, type Sev, ROOT, short, errText, srt, failedKeys, canon, isThai, baseRef, pathInBase, makeRegistry, qc4Env, makeFixtures, cleanupFx, residueOf, commitInBase, vOf, fitnessNoEnv, tagOf, loadOpt, modState,
} from "./qc-hr-lib.mjs";
import { holdRows } from "./qc-hr-h3.8-lib.mjs";
import {
  sentence, HREF, bodyOk, flexParts, startFake, evText, evPostback, signedBody, repliesOf, ADVISORY_SQL, CHECKS_SRC, runStatic, runPure, exists,
  F, NEW, AUDIT, LINK_COLS, NOTICE_COLS, STATUS_FNS, SAVE_FNS,
} from "./qc-hr-h4.5-lib.mjs";

const SUITE = "qc-hr-h4.5";
const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1" || ARGV.includes("--force-run");
const SLUG_PREFIX = "qc-hr-h45-";

const SEV: Record<string, Sev> = { C: "CRITICAL", M: "MAJOR", m: "MINOR" };
const CHECKS = CHECKS_SRC.trim().split("\n").map((l) => {
  const [id, g, sv, b, t] = l.split("|");
  return [`H4.5-${id}`, g, SEV[sv], (b === "R" ? "RED" : "GREEN") as Base, t] as const;
});
const { chk, printList, skipExit, finish } = makeRegistry(SUITE, "H4.5-", CHECKS);
if (ARGV.includes("--list")) {
  printList();
  process.exit(0);
}
const skipReasons: string[] = [];
if (!existsSync(join(ROOT, F.rules))) skipReasons.push(`${F.rules} absent (H4.5 not built)`);
if (skipReasons.length && !FORCE) skipExit(skipReasons);
const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
// base-aware like qc-hr-h3.8: local merge-base wins when it descends from the origin-derived base · in base ⇒ base-diff statics n/a
const LOCAL_MB = (() => {
  try {
    return execFileSync("git", ["merge-base", "HEAD", "session/hr"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
})();
const MB0 = baseRef("QC_H45_BASE");
const BASE = !process.env.QC_H45_BASE && MB0 && LOCAL_MB && LOCAL_MB !== MB0 && commitInBase(MB0, LOCAL_MB) ? LOCAL_MB : MB0;
const IN_BASE = !!BASE && pathInBase(F.rules, BASE);

// ═════════════════════════ module calls (console captured) ═════════════════════════
type RO = { ok: boolean; text: string; value: Any };
const REAL = { log: console.log, info: console.info, warn: console.warn, error: console.error };
const CAPTURED: string[] = [];
let depth = 0;
async function quiet<T>(f: () => Promise<T>): Promise<T> {
  const cap = (...a: unknown[]) => void CAPTURED.push(a.map((x) => (typeof x === "string" ? x : short(x, 400))).join(" "));
  if (depth++ === 0) Object.assign(console, { log: cap, info: cap, warn: cap, error: cap });
  try {
    return await f();
  } finally {
    if (--depth === 0) Object.assign(console, REAL);
  }
}
const fnIn = (mods: Any[], names: string[]): [Any, string] | null => {
  for (const n of names) for (const m of mods) if (m && !m.__err && typeof m[n] === "function") return [m, n];
  return null;
};
async function call(Mo: Any, fn: string, ...args: unknown[]): Promise<RO> {
  const mo = Mo && !Mo.__err ? Mo : null;
  if (typeof mo?.[fn] !== "function") return { ok: false, text: `∅${fn} (${modState(Mo ?? null, fn)})`, value: undefined };
  try {
    const v = (await quiet(() => mo[fn](...args))) as Any;
    const ok = v !== null && v !== undefined && !(typeof v === "object" && v.ok === false);
    return { ok, text: ok ? "" : String(v?.reason ?? v?.code ?? short(v, 80)), value: v };
  } catch (e) {
    return { ok: false, text: `THROW ${errText(e)}`, value: undefined };
  }
}

// ═════════════════════════ db ═════════════════════════
const { P, coreHash } = await qc4Env(SUITE);
if (FORCE && skipReasons.length) console.log(`⚠️ QC_FORCE=1 — running although: ${skipReasons.join(" · ")}`);
const R = await loadOpt(F.rules, "@/lib/modules/hr/line-rules");
const LL = await loadOpt(F.link, "@/lib/modules/hr/line-link");
const LN = await loadOpt(F.notify, "@/lib/modules/hr/line-notify");
const HL = await loadOpt(F.glue, "@/lib/platform/hr-line");
console.log(`[${SUITE}] rules=${modState(R, F.rules)} · link=${modState(LL, F.link)} · notify=${modState(LN, F.notify)} · glue=${modState(HL, F.glue)} · base=${BASE.slice(0, 9)}`);
const ROUTE = (await import("@/app/api/chat/webhook/[connectionId]/route" as string)) as Any;
const PB = (await import("@/lib/platform/postback-routes")) as Any;
const NC = (await import("@/lib/platform/notify-customer")) as Any;
const LINE = (await import("@/lib/modules/chat/line")) as Any;
const CODE = (await import("@/lib/modules/chat/link-code")) as Any;
const CHAT = (await import("@/lib/modules/chat")) as Any;
const CONS = ((await import("@/lib/outbox-consumers")) as Any).consumers as Record<string, (e: Any) => Promise<void>>;
const LIFE = (await import("@/lib/modules/hr/lifecycle")) as Any;
const OT = (await import("@/lib/modules/hr/ot")) as Any;
const sysSvc = (await import("@/lib/modules/system/service")) as Any;
const tag = tagOf(String(Date.now())) + Math.random().toString(36).slice(2, 5).replace(/\d/g, "q");
const SLUG = `${SLUG_PREFIX}${Date.now()}${tag}`;
const fx = makeFixtures(P, coreHash, SLUG);
const raw = async (sql: string, ...p: unknown[]) => ((await fx.rawRows(sql, ...p)) ?? []) as Any[];
const exq = (sql: string, ...p: unknown[]) => P.$executeRawUnsafe(sql, ...p).catch((e: unknown) => (console.log(`  ⚠ ${errText(e).slice(0, 90)}`), -1));
const ENV_KEYS = ["LINE_API_BASE", "APP_URL", "NEXT_PUBLIC_APP_URL", "SESSION_SECRET"];
const ENV_SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const envSet = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
const APP = "https://qc45.shark.invalid";
const fake = await startFake();
envSet("LINE_API_BASE", fake.base);
envSet("APP_URL", APP);
envSet("NEXT_PUBLIC_APP_URL", APP);
if ((process.env.SESSION_SECRET ?? "").length < 32) envSet("SESSION_SECRET", randomBytes(32).toString("hex")); // run-local (process only) — link codes need a key
const RAW_CODES: string[] = [];
const MIN = 60_000;
const at = (iso: string, plusMin = 0) => new Date(Date.parse(iso) + plusMin * MIN);

async function runDb(): Promise<void> {
  const baseOk = LINE.lineApiBase() === fake.base;
  const TT = await fx.newTenant("", "QC HR H4.5 ไลน์");
  const T2 = await fx.newTenant("-other", "QC HR H4.5 ร้านอื่น");
  const u1 = await fx.newUnit(TT, `สาขาเหนือ ${tag}`, "u1");
  const u2 = await fx.newUnit(TT, `สาขาใต้ ${tag}`, "u2");
  const u3 = await fx.newUnit(TT, `สาขาตะวันออก ${tag}`, "u3");
  const sA = (await sysSvc.createSystem(TT, "HR", `ทีม A ${tag}`)).id as string;
  const sO = (await sysSvc.createSystem(T2, "HR", `ทีมอื่น ${tag}`)).id as string;
  const chatA = (await P.appSystem.create({ data: { tenantId: TT, type: "CHAT", name: `${SLUG} chat` } })).id as string;
  const chatO = (await P.appSystem.create({ data: { tenantId: T2, type: "CHAT", name: `${SLUG} chat-o` } })).id as string;
  const cA = { tenantId: TT, systemId: sA };
  const cO = { tenantId: T2, systemId: sO };
  const SECRET: Record<string, string> = {};
  const conn = async (k: string, tid: string, sys: string, basic: string | null) => {
    SECRET[k] = `qc45s${randomBytes(12).toString("hex")}`;
    return (await P.chatChannelConnection.create({ data: { tenantId: tid, systemId: sys, type: "LINE", displayName: `${SLUG}-${k}`, externalAccountId: `${SLUG}-${k}`, credentials: { channelAccessToken: `qc45t${randomBytes(8).toString("hex")}`, channelSecret: SECRET[k] }, ...(basic ? { meta: { basicId: basic } } : {}) } })).id as string;
  };
  const C = { c1: await conn("c1", TT, chatA, "@qc45a"), c2: await conn("c2", TT, chatA, null), cO: await conn("cO", T2, chatO, null) };
  const sv = async (key: string, unitId: string, value: unknown) => {
    await P.settingValue.deleteMany({ where: { tenantId: TT, key, scope: "UNIT", scopeId: unitId } });
    await P.settingValue.create({ data: { tenantId: TT, key, scope: "UNIT", scopeId: unitId, value } });
  };
  await sv("messaging.lineConnectionId", u1, C.c1);
  await sv("messaging.lineConnectionId", u2, C.c2);
  for (const u of [u1, u2, u3]) await sv("messaging.quietHours", u, { start: "00:00", end: "00:00" }); // no quiet window (oracle never depends on the clock)
  const mk = (t: string, r: "OWNER" | "MANAGER" | "STAFF", ua: string[], p: Record<string, boolean>, tid = TT) => fx.mkUser(tid, t, `QC45 ${t} ${tag}`, r, ua, p);
  const KEY = { "hr.employee.create": true };
  const U: Record<string, Any> = {
    owner: await mk("owner", "OWNER", [], {}), mgrAll: await mk("mgrall", "MANAGER", ["*"], KEY), mgrU1: await mk("mgru1", "MANAGER", [u1], KEY),
    keyEmpty: await mk("keyempty", "STAFF", [], KEY), keyU2: await mk("keyu2", "STAFF", [u2], KEY), member: await mk("member", "STAFF", [], {}), other: await mk("other", "OWNER", [], {}, T2),
  };
  const V = (k: string) => vOf(U[k]);
  const actor = (w: Any) => ({ tenantId: w.tenantId, userId: w.id, role: w.role, unitAccess: w.unitAccess, permissions: w.permissions });
  // employee eN ↔ user sN · contact kN (ext id prefix decides fake behaviour)
  const E: Record<string, string> = {};
  const EXT: Record<string, string> = {};
  const K: Record<string, string> = {};
  const emp = async (n: string, unitId: string | null, o: { status?: string; active?: boolean; noUser?: boolean } = {}) => {
    if (!o.noUser) U[`s${n}`] = await mk(`s${n}`, "STAFF", [], {});
    E[n] = await fx.mkEmp(TT, sA, `พนักงาน${n} ${tag}`, { code: `L${n}`, startDate: "2024-01-01", unitId, linkedUserId: o.noUser ? null : U[`s${n}`].id, ...(o.status ? { status: o.status } : {}), ...(o.active === false ? { active: false } : {}) });
  };
  const contact = async (k: string, connKey: "c1" | "c2" | "cO", prefix = "Uqc", lang: string | null = "th") => {
    const ext = `${prefix}${k}${randomBytes(6).toString("hex")}`;
    const tid = connKey === "cO" ? T2 : TT;
    const name = `ไลน์${k}${tag}`;
    fake.names.set(ext, name);
    K[k] = (await P.chatContact.create({ data: { tenantId: tid, systemId: connKey === "cO" ? chatO : chatA, channel: "LINE", channelConnectionId: C[connKey], externalUserId: ext, displayName: name, lang } })).id as string;
    EXT[k] = ext;
  };
  for (const n of ["1", "2", "4", "5", "6", "7", "8", "9", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25"]) await emp(n, u1);
  await emp("3", u2);
  await emp("10", u3);
  await emp("end", u1, { status: "ENDED", active: false });
  await emp("nouser", u1, { noUser: true });
  const eOther = await fx.mkEmp(T2, sO, `พนักงานอื่น ${tag}`, { code: "O1" });
  for (const k of ["1", "4", "5", "6", "7a", "7b", "9", "11", "11b", "12", "13", "14", "15", "20", "21", "22", "23", "24a", "24b", "25", "bad", "free"]) await contact(k, "c1");
  await contact("2", "c1", "Uqc", "en");
  await contact("3", "c2");
  await contact("11c2", "c2");
  await contact("O", "cO");
  await contact("16", "c1", "Udown");
  await contact("17", "c1", "Ufail");
  await contact("18", "c1", "Uquota");
  await contact("19", "c1", "Uslow");
  if (!baseOk) throw new Error("lineApiBase() is not the fake — no send attempted");

  // ── helpers ──
  const save = fnIn([LN, LL, HL], SAVE_FNS);
  const statusFn = fnIn([LL, LN], STATUS_FNS);
  const POL = (o: Record<string, unknown> = {}) => ({ enabled: true, events: { ROSTER: true, LEAVE: true, OT: true, SWAP: true, SLIP: true }, mode: "IMMEDIATE", digestAt: "17:30", monthlyCap: 200, unitId: null, ...o });
  const setPol = (o: Record<string, unknown> = {}, v = V("owner")) => (save ? call(save[0], save[1], cA, v, POL(o)) : Promise.resolve({ ok: false, text: `∅ ${SAVE_FNS[0]}`, value: undefined } as RO));
  const links = (e: string) => raw(`SELECT * FROM "HrLineLink" WHERE "tenantId" = $1 AND "employeeId" = $2 ORDER BY "createdAt", "id"`, TT, E[e]);
  const active = async (e: string) => (await links(e)).filter((r) => r.status === "ACTIVE");
  const notices = (e: string, refId?: string) => raw(`SELECT * FROM "HrNotice" WHERE "tenantId" = $1 AND "employeeId" = $2 ${refId ? `AND "refId" = $3` : ""} ORDER BY "createdAt", "id"`, TT, E[e], ...(refId ? [refId] : []));
  const notesOf = async (e: string) => (await P.appNotification.count({ where: { tenantId: TT, recipientUserId: U[`s${e}`]?.id ?? "∅", NOT: { body: { contains: "/chat?c=" } } } })) as number; // chat-inbox notes = base chat behaviour
  const pushes = (k: string, from = 0) => fake.reqs.slice(from).filter((r) => r.path === "/v2/bot/message/push" && r.to === EXT[k] && r.retryKey);
  const auditsOf = (action: string) => raw(`SELECT * FROM "AuditLog" WHERE "tenantId" = $1 AND "action" = $2 ORDER BY "createdAt"`, TT, action);
  const issue = async (s: string) => {
    const r = await call(HL, "issueHrLineCode", actor(U[`s${s}`]));
    if (r.value?.code && typeof r.value.code === "string" && r.ok) RAW_CODES.push(r.value.code);
    return r;
  };
  const hook = async (connKey: string, events: Any[], badSig = false) => {
    const { body, sig } = signedBody(SECRET[connKey]!, events);
    const req = new Request(`http://qc.local/api/chat/webhook/${C[connKey as "c1"]}`, { method: "POST", headers: { "content-type": "application/json", "x-line-signature": badSig ? `AAAA${sig.slice(4)}` : sig }, body });
    const res: Response = await quiet(() => ROUTE.POST(req, { params: Promise.resolve({ connectionId: C[connKey as "c1"] }) }));
    return res.status;
  };
  const connOfK = (k: string) => (k === "O" ? "cO" : k === "3" || k === "11c2" ? "c2" : "c1");
  const type = async (k: string, text: string) => {
    const from = fake.reqs.length;
    const ev = evText(EXT[k]!, text, `t${k}`);
    const status = await hook(connOfK(k), [ev]);
    return { status, replies: repliesOf(fake, from, ev), ev };
  };
  const press = async (k: string, data: string) => {
    const from = fake.reqs.length;
    const ev = evPostback(EXT[k]!, data, `p${k}`);
    const status = await hook(connOfK(k), [ev]);
    return { status, replies: repliesOf(fake, from, ev) };
  };
  const textOf = (rs: Any[]) => rs.filter((m) => m.type === "text").map((m) => m.text).join("|");
  const FAILED = PB.LINK_FAILED_TEXT as string;
  const linkVia = async (s: string, k: string) => {
    const r = await issue(s);
    return r.ok ? type(k, r.value.code) : { status: 0, replies: [], ev: null };
  };
  let evSeq = 0;
  const evt = (type: string, payload: Any, key = `${type}#qc45-${++evSeq}`) => ({ id: `qc45-evt-${tag}-${evSeq}`, tenantId: TT, systemId: sA, unitId: null, type, payload: { systemId: sA, ...payload }, idempotencyKey: key, status: "PENDING", attempts: 0, createdAt: new Date() });
  const consume = (e: Any) => quiet(() => CONS[e.type]!(e)).then(() => "ok", (x: unknown) => `THROW ${errText(x)}`);
  const roster = (emps: string[]) => evt("hr.roster.published", { publishId: `pub-${tag}-${++evSeq}`, unitId: u1, from: "2031-01-01", to: "2031-01-07", entryIds: [], employeeIds: emps.map((e) => E[e]) });
  const plan = (e: Any) => call(LN, "planHrNotices", e);
  const send = (ids: string[], now: Date) => call(HL, "sendHrLineNotices", { tenantId: TT, ids }, { now });
  const job = (now: Date) => call(HL, "runHrLineJobs", now, { budgetMs: 20_000 });
  const noticeOne = async (e: string, now?: Date) => {
    const ev = roster([e]);
    await plan(ev);
    const n = (await notices(e, ev.payload.publishId))[0];
    if (n && now) await exq(`UPDATE "HrNotice" SET "createdAt" = $2 WHERE "id" = $1`, n.id, now);
    return n?.id as string | undefined;
  };
  const row = async (id?: string) => (id ? (await raw(`SELECT * FROM "HrNotice" WHERE "id" = $1`, id))[0] : undefined);

  {
    // positive controls of the harness itself (base code only): signed webhook → route → LINK_FAILED_TEXT reply seen by the fake · facade push → fake records the retry key
    const t = await type("free", "QQ23ZZZZ");
    const rk = "9b1d5f0e-3c2a-4b7e-8f6d-1a2b3c4d5e6f";
    const p: Any = await quiet(() => CHAT.pushLineMessagesToContact({ tenantId: TT }, { chatContactId: K.free, connectionId: C.c1, messages: [{ type: "text", text: "qc45 control" }], retryKey: rk }));
    const seen = fake.reqs.filter((r) => r.to === EXT.free && r.retryKey === rk && r.status === 200).length;
    ck("S3.0", { fake: baseOk && fake.blocked.length === 0, fixtures: Object.keys(E).length === 27, webhook: t.status === 200 && textOf(t.replies) === FAILED, push: p?.ok === true && seen === 1 }, "fake = lineApiBase · webhook + push reach the fake", `lineApiBase=${baseOk ? "fake" : "NOT FAKE"} hook=${t.status}/${short(textOf(t.replies), 30)} push=${p?.ok}/${seen}`);
  }
  // ── S3 link ──
  {
    const st0 = await call(LL, "myLineStatus", actor(U.s1));
    const dis = await issue("1");
    await setPol();
    const noEmp = await call(HL, "issueHrLineCode", actor(U.member));
    const inact = await issue("end");
    const noOa = await issue("10");
    const w = await raw(`SELECT count(*)::int AS n FROM "HrLineLink" WHERE "tenantId" = $1`, TT);
    ck("S3.1", { off: st0.value?.ok === true && st0.value?.shopEnabled === false, dis: dis.value?.code === "DISABLED", noEmp: noEmp.value?.code === "NO_EMPLOYEE", inact: inact.value?.code === "INACTIVE", noOa: noOa.value?.code === "NO_OA", none: Number(w[0]?.n ?? -1) === 0 }, "OFF · 4 refusal codes · no row", `${dis.text}|${noEmp.text}|${inact.text}|${noOa.text}`);
  }
  {
    const r = await issue("1");
    const ls = await links("1");
    const lk = ls[0];
    const clc = lk ? await P.chatLinkCode.findMany({ where: { tenantId: TT, refId: lk.id } }) : [];
    const dbDump = canon([ls, clc, await raw(`SELECT * FROM "AuditLog" WHERE "tenantId" = $1`, TT)]);
    const code = String(r.value?.code ?? "∅∅");
    ck("S3.2", { ok: r.ok && /^[A-Z0-9]{8}$/.test(code), pending: ls.length === 1 && lk.status === "PENDING" && lk.issuedForUserId === U.s1.id && lk.connectionId === C.c1, ttl: !!lk && Math.abs(new Date(lk.expiresAt).getTime() - new Date(lk.createdAt).getTime() - 10 * MIN) < 5000, chatCode: clc.length === 1 && clc[0].purpose === "HR_EMPLOYEE" && clc[0].connectionId === C.c1, noRaw: !dbDump.includes(code) && !CAPTURED.join("\n").includes(code) }, "code once · PENDING", r.text);
    const notes0 = await notesOf("1");
    const t = await type("1", code);
    const act = await active("1");
    const conv = await raw(`SELECT m."body" FROM "ChatMessage" m JOIN "ChatConversation" c ON c."id" = m."conversationId" WHERE c."contactId" = $1`, K["1"]);
    const au = await auditsOf("hr.line.link");
    const kc = await P.chatContact.findUnique({ where: { id: K["1"] } });
    const st = await call(LL, "myLineStatus", actor(U.s1));
    const okText = [PB.LINK_OK_TEXT, R?.HR_LINE_TEXT?.linked].filter(Boolean);
    ck("S3.3", {
      status: t.status === 200, active: act.length === 1 && act[0].chatContactId === K["1"] && act[0].connectionId === C.c1 && !!act[0].linkedAt, reply: t.replies.length === 1 && okText.includes(t.replies[0]?.text),
      mask: conv.some((m) => m.body === CODE.LINK_CODE_MASK) && !conv.some((m) => String(m.body).includes(code)), audit: au.length === 1 && srt(Object.keys(au[0].after ?? {})) === "employeeId" && au[0].after.employeeId === E["1"],
      note: (await notesOf("1")) === notes0 + 1, r5: kc?.partyId === null && kc?.customerId === null, self: st.value?.state === "ACTIVE" && st.value?.displayName === fake.names.get(EXT["1"]!),
    }, "linked", `reply=${short(textOf(t.replies), 60)}`);
  }
  {
    const r1 = await issue("11");
    if (r1.ok) await exq(`UPDATE "HrLineLink" SET "expiresAt" = now() - interval '1 minute' WHERE "tenantId" = $1 AND "employeeId" = $2 AND "status" = 'PENDING'`, TT, E["11"]);
    const expired = r1.ok ? await type("11", r1.value.code) : null;
    const replay = await type("bad", RAW_CODES[RAW_CODES.length - 2] ?? "AAAA2222"); // the code consumed in S3.3
    const a = await issue("11");
    const b = await issue("11");
    const reissued = a.ok ? await type("11", a.value.code) : null;
    const ls = await links("11");
    const cancelled = ls.filter((x) => x.status === "CANCELLED" && x.endReason === "REISSUED").length;
    const okAll = [expired, replay, reissued].every((x) => x && textOf(x.replies) === FAILED);
    ck("S3.4", { replies: okAll, noActive: (await active("11")).length === 0 && (await active("1")).length === 1 && (await active("1"))[0].chatContactId === K["1"], reissued: cancelled >= 1 && b.ok }, "LINK_FAILED_TEXT ×3", `cancelled=${cancelled}`);
    const wrongOa = b.ok ? await type("11c2", b.value.code) : null;
    const otherShop = b.ok ? await type("O", b.value.code) : null;
    const unused = b.ok ? (await P.chatLinkCode.findMany({ where: { tenantId: TT, purpose: "HR_EMPLOYEE", usedAt: null, refId: { in: ls.map((x) => x.id) } } })).length : 0;
    ck("S3.5", { replies: !!wrongOa && !!otherShop && textOf(wrongOa.replies) === FAILED && textOf(otherShop.replies) === FAILED, noActive: (await active("11")).length === 0, pendingKept: ls.length > 0 && (await links("11")).some((x) => x.status === "PENDING"), unusedOnOtherShop: unused >= 1 }, "same bytes · nothing revealed");
  }
  {
    const r12 = await issue("12");
    await exq(`UPDATE "HrEmployee" SET "active" = false, "employmentStatus" = 'ENDED' WHERE "id" = $1`, E["12"]);
    const t12 = r12.ok ? await type("12", r12.value.code) : null;
    const r13 = await issue("13");
    await P.hrEmployee.update({ where: { id: E["13"] }, data: { linkedUserId: U.member.id } });
    const t13 = r13.ok ? await type("13", r13.value.code) : null;
    const r14 = await issue("14");
    await P.membership.deleteMany({ where: { userId: U.s14.id, tenantId: TT } });
    const t14 = r14.ok ? await type("14", r14.value.code) : null;
    const act = [...(await active("12")), ...(await active("13")), ...(await active("14"))];
    ck("S3.6", { replies: [t12, t13, t14].every((x) => x && textOf(x.replies) === FAILED), noActive: act.length === 0 }, "3 refused", `${[t12, t13, t14].map((x) => short(textOf(x?.replies ?? []), 20)).join("|")}`);
  }
  {
    for (let i = 0; i < 10; i++) await type("15", `QQ${"23456789"[i % 8]}${"23456789"[(i / 8) | 0]}ZZZZ`);
    const r = await issue("15");
    const t = r.ok ? await type("15", r.value.code) : null;
    ck("S3.7", { issued: r.ok, refused: !!t && textOf(t.replies) === FAILED, noActive: (await active("15")).length === 0 }, "11th refused");
  }
  {
    const rs = [];
    for (let i = 0; i < 6; i++) rs.push(await issue("9"));
    const pend = (await links("9")).filter((x) => x.status === "PENDING").length;
    ck("S3.8", { five: rs.slice(0, 5).every((x) => x.ok), sixth: rs[5]?.value?.code === "RATE", onePending: pend === 1 }, "6th RATE", rs.map((x) => (x.ok ? "ok" : x.value?.code ?? x.text.slice(0, 20))).join(","));
  }
  {
    await linkVia("7", "7a");
    await linkVia("7", "7b");
    const l7 = await links("7");
    const relink = l7.some((x) => x.status === "ENDED" && x.endReason === "RELINK" && x.chatContactId === K["7a"]) && l7.some((x) => x.status === "ACTIVE" && x.chatContactId === K["7b"]);
    await linkVia("8", "7b");
    const l7b = await links("7");
    const a8 = await active("8");
    ck("S3.9", { relink, reused: l7b.some((x) => x.status === "ENDED" && x.endReason === "CONTACT_REUSED" && x.chatContactId === K["7b"]) && (await active("7")).length === 0, b: a8.length === 1 && a8[0].chatContactId === K["7b"] }, "RELINK · CONTACT_REUSED");
  }
  {
    const r = await issue("20");
    const ev = r.ok ? evText(EXT["20"]!, r.value.code, "dup") : evText(EXT["20"]!, "AAAA2222", "dup");
    const bad = await hook("c1", [evText(EXT["20"]!, r.value?.code ?? "AAAA2222", "bad")], true);
    const afterBad = (await active("20")).length;
    const unusedAfterBad = (await P.chatLinkCode.count({ where: { tenantId: TT, purpose: "HR_EMPLOYEE", usedAt: null, refId: { in: (await links("20")).map((x) => x.id) } } })) as number;
    const from = fake.reqs.length;
    const s1 = await hook("c1", [ev]);
    const s2 = await hook("c1", [ev]);
    const reps = repliesOf(fake, from, ev);
    ck("S3.10", { bad: bad === 401 && afterBad === 0 && unusedAfterBad === 1, twice: s1 === 200 && s2 === 200 && (await active("20")).length === 1 && (await links("20")).length === 1, oneReply: reps.length === 1 }, "1 link · 1 reply · 401", `bad=${bad} replies=${reps.length}`);
  }
  {
    const self = await call(LL, "unlinkMyLine", actor(U.s8));
    await linkVia("21", "21");
    const adm = await call(LL, "adminUnlinkLine", cA, V("owner"), { employeeId: E["21"] });
    await linkVia("22", "22");
    await press("free", `hr.unlink?employeeId=${E["22"]}`);
    const stillActive = (await active("22")).length === 1;
    await press("22", "hr.unlink");
    const ends = [[await links("8"), "SELF"], [await links("21"), "ADMIN"], [await links("22"), "LINE"]] as const;
    const au = await auditsOf("hr.line.unlink");
    ck("S3.11", { self: self.ok, admin: adm.ok, ended: ends.every(([ls, why]) => ls.some((x) => x.status === "ENDED" && x.endReason === why) && !ls.some((x) => x.status === "ACTIVE")), paramIgnored: stillActive, audit: au.length >= 3 && au.every((a) => srt(Object.keys(a.after ?? {})) === "employeeId,reason") }, "SELF · ADMIN · LINE", `${self.text}|${adm.text} audits=${au.length}`);
  }
  {
    const m = await press("1", "hr.menu");
    const fl = m.replies.find((x) => x.type === "flex");
    const uris = fl ? flexParts(fl.contents).actions.map((a) => String(a.uri ?? "")) : [];
    const un = await press("free", "hr.menu");
    const ot = await press("O", "hr.menu");
    const pr = await press("free", `hr.menu?employeeId=${E["1"]}&tenantId=${TT}`);
    const ids = [TT, sA, E["1"], U.s1.id, C.c1];
    ck("S3.12", {
      menu: ["/app/me/hr/week", "/app/me/hr/requests", "/app/me/hr/pay"].every((p) => uris.some((u) => u.includes(p))) && uris.every((u) => !ids.some((i) => u.includes(i))),
      notLinked: un.replies.length >= 1 && canon(un.replies) === canon(ot.replies) && canon(un.replies) === canon(pr.replies) && !un.replies.some((x) => x.type === "flex"),
    }, "menu · identical notLinked", `uris=${uris.length} un=${short(textOf(un.replies), 40)}`);
  }
  // links used by notices
  await linkVia("2", "2");
  await linkVia("3", "3");
  for (const n of ["4", "5", "6", "16", "17", "18", "19"]) await linkVia(n, n === "6" ? "6" : n);

  // ── S4 notices (real clock · quiet hours disabled · IMMEDIATE) ──
  const KEYOF = (n: Any) => NC.lineRetryKeyOf(TT, n.dedupeKey);
  const delivered = async (e: string, k: string, kind: string, refId: string, outcome: string | null, loc: "th" | "en", from: number) => {
    const ns = (await notices(e, refId)).filter((n) => n.kind === kind);
    const ps = pushes(k, from);
    const n = ns[0];
    const href = `${APP}${HREF(kind, refId)}`;
    const b = ps.length === 1 ? bodyOk(ps[0]!.messages[0], loc, sentence(loc, kind, outcome), href) : `pushes=${ps.length}`;
    return { ok: ns.length === 1 && n.line === "SENT" && ps.length === 1 && ps[0]!.retryKey === KEYOF(n) && !b && ps[0]!.messages.length === 1, why: `${e}:${kind} n=${ns.length} line=${n?.line} ${b}` };
  };
  const S4: Record<string, Any> = {};
  {
    const ev = roster(["1", "2"]);
    const n1 = await notesOf("1"), n2 = await notesOf("2"), from = fake.reqs.length;
    S4.roster = ev;
    const r = await consume(ev);
    const a = await delivered("1", "1", "ROSTER", ev.payload.publishId, null, "th", from);
    const b = await delivered("2", "2", "ROSTER", ev.payload.publishId, null, "en", from);
    ck("S4.1", { run: r === "ok", e1: a.ok, e2: b.ok, inapp: (await notesOf("1")) === n1 + 1 && (await notesOf("2")) === n2 + 1, others: pushes("3", from).length === 0 }, "2 recipients exact", `${a.why} | ${b.why}`);
  }
  {
    const lv = async (e: string, status: string, by: string) => (await P.hrLeave.create({ data: { tenantId: TT, systemId: sA, employeeId: E[e], fromDate: new Date("2031-02-03T00:00:00Z"), toDate: new Date("2031-02-03T00:00:00Z"), status, days: 1, decidedById: by } })).id as string;
    const l1 = await lv("1", "APPROVED", U.owner.id), l2 = await lv("2", "REJECTED", U.s2.id), l3 = await lv("3", "CANCELLED", U.s3.id);
    const n1 = await notesOf("1"), from = fake.reqs.length;
    const evs = [evt("hr.leave.decided", { leaveId: l1, employeeId: E["1"], status: "APPROVED", previousStatus: "PENDING" }), evt("hr.leave.decided", { leaveId: l2, employeeId: E["2"], status: "REJECTED", previousStatus: "PENDING" }), evt("hr.leave.decided", { leaveId: l3, employeeId: E["3"], status: "CANCELLED", previousStatus: "PENDING" })];
    for (const e of evs) await consume(e);
    S4.leave = evs;
    const a = await delivered("1", "1", "LEAVE", l1, "APPROVED", "th", from);
    ck("S4.2", { approved: a.ok && (await notesOf("1")) >= n1 + 1, ownDecider: (await notices("2", l2)).length === 0 && pushes("2", from).length === 0, cancelled: (await notices("3", l3)).length === 0 && pushes("3", from).length === 0 }, "APPROVED only", a.why);
  }
  {
    const o = (await P.hrOtRequest.create({ data: { tenantId: TT, systemId: sA, employeeId: E["1"], date: new Date("2031-02-04T00:00:00Z"), startAt: new Date("2031-02-04T11:00:00Z"), endAt: new Date("2031-02-04T13:00:00Z"), minutes: 120, timing: "BEFORE", status: "APPROVED", decidedById: U.owner.id } })).id as string;
    const n1 = await notesOf("1"), from = fake.reqs.length;
    const ev = evt("hr.ot.decided", { otRequestId: o, employeeId: E["1"], status: "APPROVED" });
    S4.ot = ev;
    await consume(ev);
    const a = await delivered("1", "1", "OT", o, "APPROVED", "th", from);
    const ns = await notices("1", o);
    ck("S4.3", { push: a.ok, appFalse: ns.length === 1 && ns[0].appNotified === false, inapp: (await notesOf("1")) === n1 + 1 }, "OT: notice without new in-app", `${a.why} notes+${(await notesOf("1")) - n1}`);
  }
  {
    const sh = await P.hrShift.create({ data: { tenantId: TT, systemId: sA, unitId: u1, name: `กะเช้า ${tag}`, startMin: 480, endMin: 1020 } });
    const en = async (e: string) => (await P.hrRosterEntry.create({ data: { tenantId: TT, systemId: sA, employeeId: E[e], date: new Date("2031-02-05T00:00:00Z"), shiftId: sh.id, unitId: u1, startMin: 480, endMin: 1020, breakMin: 60, crossesMidnight: false, published: true } })).id as string;
    const f1 = await en("1"), f2 = await en("2");
    const swR = (await P.hrShiftSwapRequest.create({ data: { tenantId: TT, systemId: sA, requesterEmployeeId: E["2"], fromEntryId: f2, targetEmployeeId: E["1"], toEntryId: f1, status: "AWAITING_PEER" } })).id as string;
    const swA = (await P.hrShiftSwapRequest.create({ data: { tenantId: TT, systemId: sA, requesterEmployeeId: E["1"], fromEntryId: f1, targetEmployeeId: E["2"], toEntryId: f2, status: "APPROVED" } })).id as string;
    const from = fake.reqs.length;
    const evR = evt("hr.shift.swap_requested", { swapId: swR, fromEntryId: f2, toEntryId: f1, requesterEmployeeId: E["2"], targetEmployeeId: E["1"] });
    const evA = evt("hr.shift.swap_approved", { swapId: swA, entryIds: [f1, f2], employeeIds: [E["1"], E["2"]], dates: ["2031-02-05"] });
    S4.swap = [evR, evA];
    await consume(evR);
    const ask = await delivered("1", "1", "SWAP_ASK", swR, null, "th", from);
    const noReq = (await notices("2", swR)).length === 0;
    const from2 = fake.reqs.length;
    await consume(evA);
    const a1 = await delivered("1", "1", "SWAP", swA, "APPROVED", "th", from2);
    const a2 = await delivered("2", "2", "SWAP", swA, "APPROVED", "en", from2);
    ck("S4.4", { ask: ask.ok, requesterNone: noReq, both: a1.ok && a2.ok }, "counterpart · both", `${ask.why} | ${a1.why} | ${a2.why}`);
  }
  {
    const mkRun = async (pk: string, ev: number, steps: Any, emps: string[]) => {
      const r = await P.hrPayrollRun.create({ data: { tenantId: TT, systemId: sA, periodKey: pk, payDate: new Date(`${pk}-25T00:00:00Z`), status: "PAID", engineVersion: ev, ...(steps ? { stepsJson: steps } : {}), totalGrossSatang: 1_000_000 * emps.length, totalNetSatang: 1_000_000 * emps.length } });
      for (const e of emps) await P.hrPayrollItem.create({ data: { tenantId: TT, systemId: sA, runId: r.id, employeeId: E[e], grossSatang: 1_000_000, ssoBaseSatang: 0, ssoEmployeeSatang: 0, ssoEmployerSatang: 0, whtSatang: 0, netSatang: 1_000_000 } });
      return r.id as string;
    };
    const rv1 = await mkRun("2031-01", 1, null, ["1", "3"]);
    const rv2 = await mkRun("2031-02", 2, { finalized: false }, ["1"]);
    const from = fake.reqs.length;
    const e1 = evt("hr.payroll.paid", { runId: rv1, periodKey: "2031-01" }, `hr.payroll.paid#${rv1}`);
    const e2 = evt("hr.payroll.paid", { runId: rv2, periodKey: "2031-02" }, `hr.payroll.paid#${rv2}`);
    S4.pay = [e1, e2];
    await consume(e1);
    await consume(e2);
    const a = await delivered("1", "1", "SLIP", rv1, null, "th", from);
    const b = await delivered("3", "3", "SLIP", rv1, null, "th", from);
    ck("S4.5", { issued: a.ok && b.ok, unfinalized: (await notices("1", rv2)).length === 0 }, "ISSUED only", `${a.why} | ${b.why}`);
  }
  {
    const all = [S4.roster, ...S4.leave, S4.ot, ...S4.swap, ...S4.pay].filter(Boolean);
    const cnt = async () => [Number((await raw(`SELECT count(*)::int AS n FROM "HrNotice" WHERE "tenantId" = $1`, TT))[0]?.n ?? -1), (await P.appNotification.count({ where: { tenantId: TT } })) as number];
    const before = await cnt(), from = fake.reqs.length;
    for (let i = 0; i < 2; i++) for (const e of all) await consume(e);
    const after = await cnt();
    const newPush = fake.reqs.slice(from).filter((r) => r.path === "/v2/bot/message/push").length;
    ck("S4.6", { notices: before[0]! > 0 && after[0] === before[0], inapp: after[1] === before[1], pushes: newPush === 0 }, "replay ×2 = nothing new", `notices ${before[0]}→${after[0]} inapp ${before[1]}→${after[1]} pushes=${newPush}`);
  }
  {
    await setPol({ enabled: false });
    const n1 = await notesOf("1"), from = fake.reqs.length;
    const ev = roster(["1"]);
    await consume(ev);
    const off = pushes("1", from).length === 0 && (await notesOf("1")) === n1 + 1 && (await notices("1", ev.payload.publishId)).every((n) => ["NONE", "SKIPPED"].includes(n.line));
    await setPol({ events: { ROSTER: false, LEAVE: true, OT: true, SWAP: true, SLIP: true } });
    const ev2 = roster(["1"]);
    await consume(ev2);
    const toggled = pushes("1", from).length === 0 && (await notices("1", ev2.payload.publishId)).length === 1;
    await setPol();
    ck("S4.7", { off, toggled }, "0 pushes · in-app kept");
  }

  // ── S5 delivery engine (fixed now) ──
  const T0 = new Date("2031-03-10T03:00:00Z"); // 10:00 BKK
  {
    const id = await noticeOne("16", T0);
    const n0 = await notesOf("16");
    await send(id ? [id] : [], T0);
    const r1 = await row(id);
    fake.script.set(EXT["16"]!, [200]); // Udown answers 503 forever ⇒ one scripted 200 for the retry
    await job(at("2031-03-10T03:00:00Z", 6));
    const r2 = await row(id);
    const ps = pushes("16");
    ck("S5.1", {
      failed: r1?.line === "FAILED" && r1?.lineAttempts === 1 && r1?.nextAttemptAt && new Date(r1.nextAttemptAt).getTime() === T0.getTime() + 5 * MIN, inapp: n0 >= 1,
      sent: r2?.line === "SENT" && ps.length === 2 && ps.every((p) => p.retryKey === (r1 ? KEYOF(r1) : "∅")) && ps[1]!.status === 200, sentAt: !!r2?.sentAt && new Date(r2.sentAt).getTime() === at("2031-03-10T03:00:00Z", 6).getTime(),
    }, "FAILED → SENT same key", `r1=${r1?.line}/${r1?.lineAttempts} r2=${r2?.line} pushes=${ps.map((p) => p.status).join(",")}`);
  }
  {
    const id = await noticeOne("17", T0);
    const steps: string[] = [];
    await send(id ? [id] : [], T0);
    let r = await row(id);
    steps.push(`${r?.lineAttempts}:${r?.nextAttemptAt ? (new Date(r.nextAttemptAt).getTime() - T0.getTime()) / MIN : "null"}`);
    for (const m of [6, 40, 200]) {
      await job(at("2031-03-10T03:00:00Z", m));
      r = await row(id);
      steps.push(`${r?.lineAttempts}:${r?.nextAttemptAt ? (new Date(r.nextAttemptAt).getTime() - T0.getTime()) / MIN : "null"}`);
    }
    const n = pushes("17").length;
    await job(at("2031-03-10T03:00:00Z", 900));
    chk("S5.2", steps.join(" ") === "1:5 2:36 3:160 4:null" && r?.line === "FAILED" && n === 4 && pushes("17").length === 4, "1:5 2:36 3:160 4:null · FAILED · 4 requests", `${steps.join(" ")} line=${r?.line} requests=${pushes("17").length}`);
  }
  {
    const a = await noticeOne("18", T0);
    await send(a ? [a] : [], T0);
    const b = await noticeOne("18", T0);
    await send(b ? [b] : [], at("2031-03-10T03:00:00Z", 60));
    await job(at("2031-03-10T03:00:00Z", 300));
    const ra = await row(a), rb = await row(b);
    const au = await auditsOf("hr.line.quota");
    ck("S5.3", { quota: ra?.line === "QUOTA" && rb?.line === "QUOTA" && pushes("18").length === 2, audit: au.length === 1 && canon(au[0].after) === canon({ connectionId: C.c1 }) }, "QUOTA · 1 audit", `${ra?.line}/${rb?.line} audits=${au.length}`);
  }
  {
    const id = await noticeOne("19", T0);
    const t = Date.now();
    await send(id ? [id] : [], T0);
    const r = await row(id);
    chk("S5.4", r?.line === "FAILED" && Date.now() - t < 20_000, "FAILED < 20 s", `${r?.line} ${Date.now() - t} ms`);
    fake.script.set(EXT["19"]!, [200, 200, 200]); // later job retries of this row answer at once
  }
  {
    const id = await noticeOne("20", T0);
    await P.chatContact.update({ where: { id: K["20"] }, data: { blockedAt: new Date() } });
    await send(id ? [id] : [], T0);
    const r = await row(id);
    const ls = await links("20");
    ck("S5.5", { skipped: r?.line === "SKIPPED", ended: ls.some((x) => x.status === "ENDED" && x.endReason === "BLOCKED") && !ls.some((x) => x.status === "ACTIVE"), none: pushes("20").length === 0 }, "SKIPPED · BLOCKED", `${r?.line}`);
  }
  {
    const id = await noticeOne("1", T0);
    await send(id ? [id] : [], T0);
    const r1 = await row(id);
    const T2x = at("2031-03-10T03:00:00Z", 60);
    await exq(`UPDATE "HrNotice" SET "line" = 'SENDING', "sentAt" = NULL, "nextAttemptAt" = $2 WHERE "id" = $1`, id ?? "∅", new Date(T2x.getTime() - 3 * MIN));
    await job(T2x);
    const r2 = await row(id);
    const ps = r1 ? fake.reqs.filter((q) => q.retryKey === KEYOF(r1)) : [];
    ck("S5.6", { first: r1?.line === "SENT", resent: ps.length === 2 && ps[1]!.status === 409, sent: r2?.line === "SENT", one: ps.filter((p) => p.status === 200).length === 1 }, "409 ⇒ SENT · 1 delivery", `${ps.map((p) => p.status).join(",")} ${r2?.line}`);
  }
  {
    const id = await noticeOne("1", T0);
    const from = fake.reqs.length;
    envSet("APP_URL", undefined);
    envSet("NEXT_PUBLIC_APP_URL", undefined);
    await send(id ? [id] : [], T0);
    envSet("APP_URL", APP);
    envSet("NEXT_PUBLIC_APP_URL", APP);
    const r = await row(id);
    chk("S5.7", r?.line === "SKIPPED" && r?.skipCode === "NO_URL" && pushes("1", from).length === 0, "SKIPPED NO_URL", `${r?.line}/${r?.skipCode}`);
  }
  {
    await sv("messaging.quietHours", u1, { start: "21:00", end: "08:00" });
    const Q = new Date("2031-04-10T15:00:00Z");
    const id = await noticeOne("1", Q);
    const from = fake.reqs.length;
    await send(id ? [id] : [], Q);
    const r1 = await row(id);
    const held = r1?.line === "HELD" && !!r1?.nextAttemptAt && new Date(r1.nextAttemptAt).toISOString() === "2031-04-11T01:00:00.000Z" && pushes("1", from).length === 0;
    await job(new Date("2031-04-11T01:01:00Z"));
    const r2 = await row(id);
    await sv("messaging.quietHours", u1, { start: "00:00", end: "00:00" });
    ck("S5.8", { held, sent: r2?.line === "SENT" && pushes("1", from).length === 1 }, "HELD → 08:00 → SENT", `${r1?.line}@${r1?.nextAttemptAt ? new Date(r1.nextAttemptAt).toISOString() : "-"} → ${r2?.line}`);
  }
  {
    await setPol({ mode: "DIGEST" });
    const D0 = new Date("2031-05-10T03:00:00Z");
    const n0 = await notesOf("1");
    const ids = [await noticeOne("1", D0), await noticeOne("1", D0), await noticeOne("1", D0)];
    const rs0 = await Promise.all(ids.map(row));
    const from = fake.reqs.length;
    await job(new Date("2031-05-10T10:31:00Z"));
    const dg = (await notices("1")).filter((n) => n.kind === "DIGEST");
    const rs = await Promise.all(ids.map(row));
    const ps = pushes("1", from);
    await job(new Date("2031-05-10T10:36:00Z"));
    await setPol();
    const b = ps.length === 1 ? bodyOk(ps[0]!.messages[0], "th", sentence("th", "DIGEST", null, 3), `${APP}/app/me/hr`) : `pushes=${ps.length}`;
    ck("S5.9", { held: rs0.every((r) => r?.line === "HELD"), inapp: (await notesOf("1")) === n0 + 3, digest: dg.length === 1 && dg[0].line === "SENT", members: rs.every((r) => r?.line === "SENT" && r?.digestOf === dg[0]?.id), push: !b, once: pushes("1", from).length === 1 }, "1 DIGEST push \"3\"", `${b} digests=${dg.length}`);
  }
  {
    await setPol({ monthlyCap: 2 });
    const C0 = new Date("2033-03-10T03:00:00Z");
    const n0 = await notesOf("3");
    const from = fake.reqs.length;
    const rs: Any[] = [];
    for (let i = 0; i < 4; i++) {
      const id = await noticeOne("3", C0);
      await send(id ? [id] : [], new Date(C0.getTime() + i * MIN));
      rs.push(await row(id));
    }
    const au = await auditsOf("hr.line.cap_reached");
    await setPol();
    ck("S5.10", { lines: rs.map((r) => r?.line).join(",") === "SENT,SENT,CAP,CAP", pushes: pushes("3", from).length === 2, audit: au.length === 1 && canon(au[0].after) === canon({ monthKey: "2033-03" }), inapp: (await notesOf("3")) === n0 + 4 }, "SENT,SENT,CAP,CAP · 1 audit", `${rs.map((r) => r?.line).join(",")} audits=${au.length}`);
  }
  {
    const l9 = await links("9");
    chk("S5.11", l9.length > 0 && l9.every((x) => x.status === "CANCELLED"), "expired PENDING cancelled", l9.map((x) => x.status).join(","));
  }

  // ── S6 end of employment / account ──
  {
    const id = await noticeOne("4");
    const from = fake.reqs.length;
    const off = await call(LIFE, "offboardEmployee", cA, V("owner"), E["4"], { reason: "RESIGNED" });
    const oe = await P.outboxEvent.findMany({ where: { tenantId: TT, type: "hr.employee.offboarded" } });
    for (const e of oe) await consume(e);
    await send(id ? [id] : [], new Date());
    await consume(roster(["4"]));
    const ls = await links("4");
    const r = await row(id);
    ck("S6.1", { off: off.ok && oe.length >= 1, ended: ls.some((x) => x.status === "ENDED" && x.endReason === "OFFBOARD") && !ls.some((x) => x.status === "ACTIVE"), skipped: r?.line === "SKIPPED", none: pushes("4", from).length === 0 }, "OFFBOARD", `${off.text} line=${r?.line}`);
  }
  for (const [cid, e, mutate] of [
    ["S6.2", "5", () => P.hrEmployee.update({ where: { id: E["5"] }, data: { linkedUserId: null } })],
    ["S6.3", "6", () => P.membership.deleteMany({ where: { userId: U.s6.id, tenantId: TT } })],
  ] as const) {
    const id = await noticeOne(e);
    const from = fake.reqs.length;
    await mutate();
    await send(id ? [id] : [], new Date());
    const ls = await links(e);
    const r = await row(id);
    ck(cid, { ended: ls.some((x) => x.status === "ENDED" && x.endReason === "ACCOUNT") && !ls.some((x) => x.status === "ACTIVE"), skipped: r?.line === "SKIPPED", none: pushes(e, from).length === 0 }, "ENDED/ACCOUNT · SKIPPED", `line=${r?.line} links=${ls.map((x) => `${x.status}/${x.endReason}`).join(",")}`);
  }

  // ── S7 races ──
  {
    const ev = roster(["3"]);
    const n0 = await notesOf("3"), from = fake.reqs.length;
    await Promise.all(Array.from({ length: 10 }, () => call(HL, "onHrEventForLine", ev)));
    chk("S7.1", (await notices("3", ev.payload.publishId)).length === 1 && (await notesOf("3")) === n0 + 1 && pushes("3", from).length === 1, "1 · 1 · 1", `notices=${(await notices("3", ev.payload.publishId)).length} inapp+${(await notesOf("3")) - n0} pushes=${pushes("3", from).length}`);
  }
  {
    const id = await noticeOne("2");
    const from = fake.reqs.length;
    const h = await holdRows(P, `SELECT "id" FROM "HrNotice" WHERE "id" = $1 FOR UPDATE`, [id ?? "∅"], () => Promise.all([send(id ? [id] : [], new Date()), send(id ? [id] : [], new Date())]), { until: "settled" });
    const duringHold = h.settledWhileHeld ? pushes("2", from).length : 0;
    if ((await row(id))?.line !== "SENT") await send(id ? [id] : [], new Date());
    const r = await row(id);
    ck("S7.2", { evidence: h.blocked || (h.settledWhileHeld && duringHold === 0), once: r?.line === "SENT" && pushes("2", from).filter((p) => p.status === 200).length === 1 }, "claimed once", `blocked=${h.blocked} skip=${h.settledWhileHeld} pushes=${pushes("2", from).length} ${h.holderErr}`);
  }
  {
    const r = await issue("23");
    const h = await holdRows(P, ADVISORY_SQL, [`hrline:${sA}:${E["23"]}`], () => (r.ok ? type("23", r.value.code) : Promise.resolve(null)), { until: "blocked" });
    const a = await issue("24");
    const b = await issue("24");
    await Promise.all([a.ok ? type("24a", a.value.code) : null, b.ok ? type("24b", b.value.code) : null]);
    const c = await issue("25");
    await Promise.all([c.ok ? type("25", c.value.code) : null, issue("25")]);
    const l25 = await links("25");
    ck("S7.3", {
      blocked: h.blocked && (await active("23")).length === 1, one: (await active("24")).length === 1 && (await active("24"))[0].chatContactId === K["24b"],
      consistent: l25.filter((x) => x.status === "ACTIVE").length <= 1 && l25.filter((x) => x.status === "PENDING").length <= 1 && l25.some((x) => ["ACTIVE", "PENDING"].includes(x.status)) && !l25.some((x) => x.status === "CANCELLED" && x.linkedAt),
    }, "lock · 1 ACTIVE · consistent", `blocked=${h.blocked} l25=${l25.map((x) => x.status).join(",")}`);
  }
  {
    const h = await holdRows(P, ADVISORY_SQL, [`hr:clockpolicy:${sA}`], () => Promise.all([setPol({ monthlyCap: 150 }), call(OT, "saveOtPolicy", cA, V("owner"), { afterHours: 13 })]), { until: "blocked" });
    const s = ((await P.appSystem.findUnique({ where: { id: sA } }))?.settings ?? {}) as Any;
    await setPol();
    ck("S7.4", { blocked: h.blocked, line: s?.lineNotify?.monthlyCap === 150, ot: s?.hrOt?.afterHours === 13, both: h.res.every((x: RO) => x.ok) }, "both keys kept", `${h.res.map((x: RO) => x.text || "ok").join("|")}`);
  }

  // ── S8 viewer matrix ──
  {
    const st = (vk: string, e: string, ctx = cA) => (statusFn ? call(statusFn[0], statusFn[1], ctx, V(vk), { employeeId: e }) : Promise.resolve({ ok: false, text: `∅ ${STATUS_FNS[0]}`, value: undefined } as RO));
    const okKeys = (r: RO) => r.ok && srt(Object.keys(r.value ?? {})) === "linkedAt,ok,state" && r.value.state === "ACTIVE";
    const res = {
      owner: okKeys(await st("owner", E["1"]!)), mgrAll: okKeys(await st("mgrAll", E["3"]!)), keyEmpty: okKeys(await st("keyEmpty", E["3"]!)), mgrU1: okKeys(await st("mgrU1", E["1"]!)), keyU2: okKeys(await st("keyU2", E["3"]!)),
      mgrU1no: !(await st("mgrU1", E["3"]!)).ok, keyU2no: !(await st("keyU2", E["1"]!)).ok, member: !(await st("member", E["1"]!)).ok, self: !(await call(statusFn?.[0], statusFn?.[1] ?? "∅", cA, vOf(U.s1), { employeeId: E["1"] })).ok,
      other: !(statusFn ? await call(statusFn[0], statusFn[1], cO, V("other"), { employeeId: E["1"] }) : { ok: true }).ok,
    };
    ck("S8.1", res, "matrix", statusFn ? `fn=${statusFn[1]}` : `∅ ${STATUS_FNS.join("|")}`);
    const a = await st("mgrU1", E["3"]!), b = await st("mgrU1", "qc45-unknown-id"), c = await st("mgrU1", eOther);
    const reason = String(a.value?.reason ?? "");
    ck("S8.2", { refused: a.value?.ok === false, same: canon(a.value) === canon(b.value) && canon(b.value) === canon(c.value), thai: isThai(reason), keys: srt(Object.keys(a.value ?? {})) === "code,ok,reason" || srt(Object.keys(a.value ?? {})) === "ok,reason", noIds: ![u1, u2, E["3"], eOther, TT].some((i) => String(canon(a.value)).includes(i!)) }, "identical Thai refusal", short(a.value, 100));
    const x = await call(LL, "adminUnlinkLine", cA, V("mgrU1"), { employeeId: E["3"] });
    const y = await call(LL, "adminUnlinkLine", cA, V("mgrU1"), { employeeId: "qc45-unknown-id" });
    const z = await call(LL, "adminUnlinkLine", cA, V("member"), { employeeId: E["1"] });
    ck("S8.3", { refused: x.value?.ok === false && z.value?.ok === false, same: canon(x.value) === canon(y.value), kept: (await active("3")).length === 1 && (await active("1")).length === 1 }, "refused · unchanged", short(x.value, 80));
    const m1 = await call(LL, "myLineStatus", actor(U.s1));
    const m2 = await call(LL, "myLineStatus", { ...actor(U.s1), employeeId: E["3"] });
    ck("S8.4", { keys: srt(Object.keys(m1.value ?? {})) === "displayName,linkedAt,ok,shopEnabled,state", own: m1.value?.displayName === fake.names.get(EXT["1"]!) && m1.value?.shopEnabled === true, forged: canon(m1.value) === canon(m2.value) }, "self DTO", short(m1.value, 120));
    const before = canon(((await P.appSystem.findUnique({ where: { id: sA } }))?.settings as Any)?.lineNotify);
    const mem = await setPol({ monthlyCap: 100 }, V("member"));
    const big = await setPol({ monthlyCap: 5001 });
    const mid = canon(((await P.appSystem.findUnique({ where: { id: sA } }))?.settings as Any)?.lineNotify);
    const own = await setPol();
    const au = await auditsOf("hr.line.settings");
    ck("S8.5", { member: !mem.ok, big: !big.ok, unchanged: typeof before === "string" && before === mid, owner: own.ok, audit: au.length >= 3 }, "gate · range · audit", `${mem.text}|${big.text} audits=${au.length}`);
  }

  // ── S9 privacy of rows / audits / logs ──
  {
    const cols = async (t: string) => srt((await raw(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = $1`, t)).map((r) => String(r.c)));
    const lc = await cols("HrLineLink"), nc = await cols("HrNotice");
    const rowsDump = canon([await raw(`SELECT * FROM "HrLineLink" WHERE "tenantId" = $1`, TT), await raw(`SELECT * FROM "HrNotice" WHERE "tenantId" = $1`, TT)]);
    const secrets = [...fx.names, ...Object.values(EXT), ...[...fake.names.values()]].filter((s) => s && s.length > 4);
    const hits = secrets.filter((s) => rowsDump.includes(s));
    ck("S9.1", { link: lc === LINK_COLS, notice: nc === NOTICE_COLS, rows: rowsDump.length > 10 && hits.length === 0 }, "R1 columns · no PII", `link=${lc.slice(0, 50)} hits=${hits.slice(0, 3).join(",")}`);
    const aud = await raw(`SELECT "action", "after", "before" FROM "AuditLog" WHERE "tenantId" = $1`, TT);
    const keysOk = aud.filter((a) => AUDIT.includes(a.action)).every((a) => ({ "hr.line.link": "employeeId", "hr.line.unlink": "employeeId,reason", "hr.line.cap_reached": "monthKey", "hr.line.quota": "connectionId" } as Record<string, string>)[a.action] === undefined || srt(Object.keys(a.after ?? {})) === ({ "hr.line.link": "employeeId", "hr.line.unlink": "employeeId,reason", "hr.line.cap_reached": "monthKey", "hr.line.quota": "connectionId" } as Record<string, string>)[a.action]);
    const notes = canon(await P.appNotification.findMany({ where: { tenantId: TT, recipientUserId: { in: Object.keys(U).filter((k) => /^s/.test(k)).map((k) => U[k].id) } }, select: { title: true, body: true } })); // employees' in-app rows (staff chat-inbox notes are base chat behaviour)
    const leakSet = [...RAW_CODES, ...Object.values(EXT), ...[...fake.names.values()].filter((n) => n.length > 4), ...Object.values(K)];
    const where = (blob: string) => leakSet.filter((s) => blob.includes(s)).length;
    const audBlob = canon(aud.filter((a) => /^hr\./.test(String(a.action))));
    ck("S9.2", { keys: keysOk && aud.some((a) => a.action === "hr.line.link"), audits: where(audBlob) === 0, inapp: where(notes) === 0, logs: RAW_CODES.filter((c) => CAPTURED.join("\n").includes(c)).length === 0 }, "no secrets", `audits=${where(audBlob)} inapp=${where(notes)} codesInLogs=${RAW_CODES.filter((c) => CAPTURED.join("\n").includes(c)).length}`);
  }
}

// ═════════════════════════ main ═════════════════════════
let crashed = "";
async function cleanMine(): Promise<void> {
  for (const tid of fx.tenants) {
    const sub = `(SELECT "id" FROM "ChatConversation" WHERE "tenantId" = $1)`;
    for (const t of ["ChatConversationEvent", "ChatConversationPref", "ChatReadState"]) await exq(`DELETE FROM "${t}" WHERE "conversationId" IN ${sub}`, tid);
    for (const sql of [
      `DELETE FROM "ChatAttachment" WHERE "systemId" IN (SELECT "id" FROM "AppSystem" WHERE "tenantId" = $1)`, `DELETE FROM "ChatMessage" WHERE "tenantId" = $1`, `DELETE FROM "ChatConversation" WHERE "tenantId" = $1`,
      `DELETE FROM "HrNotice" WHERE "tenantId" = $1`, `DELETE FROM "HrLineLink" WHERE "tenantId" = $1`, `DELETE FROM "ChatLinkCode" WHERE "tenantId" = $1`,
      `DELETE FROM "ChatRateBucket" WHERE "key" LIKE '%' || $1 || '%'`, `DELETE FROM "ChatContact" WHERE "tenantId" = $1`,
      `DELETE FROM "ChatWebhookLog" WHERE "connectionId" IN (SELECT "id" FROM "ChatChannelConnection" WHERE "tenantId" = $1)`, `DELETE FROM "ChatChannelConnection" WHERE "tenantId" = $1`,
      `DELETE FROM "SettingValue" WHERE "tenantId" = $1`, `DELETE FROM "HrPayrollItem" WHERE "tenantId" = $1`, `DELETE FROM "HrPayrollRun" WHERE "tenantId" = $1`,
    ]) await fx.rawRows(sql, tid);
  }
}
try {
  runStatic({ chk, ck, BASE, IN_BASE });
  runPure(R, { chk, ck });
  await runDb();
} catch (e) {
  crashed = errText(e);
  console.log(`💥 harness: ${crashed}`);
}
{
  const r = await fitnessNoEnv().catch((e: unknown) => ({ ok: false, note: errText(e) }));
  chk("X1", r.ok, "exit 0 ×2", r.note);
}
await cleanMine();
await cleanupFx(P, fx, SLUG);
{
  const res = await residueOf(P, fx, SLUG, SLUG_PREFIX);
  const mine: string[] = [];
  for (const tid of fx.tenants)
    for (const t of ["HrLineLink", "HrNotice", "ChatContact", "ChatChannelConnection", "ChatLinkCode", "ChatMessage", "SettingValue"]) {
      const r = await fx.rawRows(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid);
      if (r && Number(r[0]?.n ?? 0) !== 0) mine.push(`${t}=${r[0]?.n}`); // table absent (r = null) = nothing left
    }
  const buckets = fx.tenants.length ? await fx.rawRows(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE "key" LIKE ANY($1::text[])`, fx.tenants.map((t) => `%${t}%`)) : [{ n: 0 }];
  if (Number(buckets?.[0]?.n ?? 0) !== 0) mine.push(`ChatRateBucket=${buckets?.[0]?.n}`);
  chk("Z1", res.length === 0 && mine.length === 0, "none", [...res, ...mine].join(",") || "none");
}
for (const k of ENV_KEYS) envSet(k, ENV_SAVED[k]);
const lineHosts = fake.blocked.filter((h) => /line\.me$/.test(h));
if (lineHosts.length) console.log(`🔴 blocked real LINE calls: ${lineHosts.length}`);
fake.restore();
await fake.close();
const missing = [...NEW, "prisma/migrations/20270111000000_hr_line_link"].filter((f) => !exists(f));
process.exitCode = finish({ forced: FORCE, crashed, missing });
await P.$disconnect?.();
process.exit(process.exitCode);
