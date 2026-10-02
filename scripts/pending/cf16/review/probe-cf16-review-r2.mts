// C5.5-fix12 REVIEW round 2 probe (independent reviewer) — attacks on 555b02ab
//   JB   getImportJob: runner (STAFF · MANAGER) reads own · OWNER reads all · everyone else gets the SAME answer as a non-existent id
//        (code · text · class) · timing of "exists but not yours" vs "does not exist" (measured, info)
//   NW   "nothing written" on RATE_LIMITED — including the very first contact write of a fresh CRM system (field seeding runs before
//        the limiter in createContact)
//   ID   withIdempotency with a real API-key-shaped actor: RATE_LIMITED released (retry runs) vs plan-cap LIMIT stored (replayed) — and
//        whether a key can reach the limiter at all
//   MB   mobileErrorOf / card-scan for the round-1 neutral DUPLICATE and the plan-cap LIMIT (the builder's "found, not fixed")
// QC2 only (ep-cool-shadow) · throwaway tenants `qc-cf16-rw-*` (swept in done()) + the rate buckets / idempotency rows it touched.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf16/review/probe-cf16-review-r2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
const { fixture } = (await import("../_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("rw");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 140) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));
const rand = TAG.slice(-8);
const info = (id: string, msg: string) => console.log(`  ℹ️  [${id}] ${msg}`);

const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const SHARED = (await import("@/lib/modules/crm/contacts-shared" as string)) as Any;
const MOBILE = (await import("@/lib/modules/crm/mobile" as string)) as Any;
const OPS = (await import("@/lib/modules/crm/api/ops/contacts" as string)) as Any;
const { toCrmApiError } = (await import("@/lib/modules/crm/api/http-errors" as string)) as Any;
const { withIdempotency } = (await import("@/lib/api/idempotency" as string)) as Any;
const { crmActorForKey } = (await import("@/lib/modules/crm/api/actor" as string)) as Any;
const LIM = SHARED.CONTACT_IDENT_RATE.limit as number;
const BUCKETS = new Set<string>();
const fill = async (k: string) => { BUCKETS.add(k); await P.chatRateBucket.upsert({ where: { key: k }, create: { key: k, count: LIM, windowStart: new Date() }, update: { count: LIM, windowStart: new Date() } }); };
let seq = 0;
const newPhone = () => `09${String(Date.now() % 1e7).padStart(7, "0")}${(seq++ % 10)}`.slice(0, 10);

async function member(shop: Any, suffix: string, role: "STAFF" | "MANAGER", keys: string[]) {
  const uid = await mkUser(`-${suffix}`);
  const permissions = Object.fromEntries(keys.map((k) => [k, true]));
  const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  return { uid, actor: toMemberActor(uid, m), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: uid } };
}
const TABLES = ((await P.$queryRawUnsafe(`select distinct table_name from information_schema.columns where table_schema='public' and column_name='tenantId'`)) as Any[])
  .map((r) => String(r.table_name)).filter((x) => /^[A-Za-z_]+$/.test(x)).sort();
async function snap(tid: string) {
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
    if (n) counts[t] = n;
  }
  return counts;
}
const diff = (a: Any, b: Any) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => (a[k] ?? 0) !== (b[k] ?? 0)).map((k) => `${k} ${a[k] ?? 0}→${b[k] ?? 0}`).join(" · ") || "none";

try {
  const shop = await mkShop("a");
  const owner = { actor: shop.owner, ctx: shop.ctx, uid: shop.uid };
  const KEYS = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.import"];
  const s1 = await member(shop, "s1", "STAFF", KEYS);
  const s2 = await member(shop, "s2", "STAFF", KEYS);
  const mgr = await member(shop, "mgr", "MANAGER", []);
  const mgr2 = await member(shop, "mgr2", "MANAGER", []);

  // ═══════════ JB · import job scope ═══════════
  console.log("\n── JB ──");
  {
    const run = async (who: Any, tag: string) => (await CON.importContacts(who.ctx, who.actor, { rows: [{ ชื่อ: `${tag} ${rand}`, เบอร์: newPhone() }], mapping: { ชื่อ: "firstName", เบอร์: "phone" }, options: { onDuplicate: "skip", source: "IMPORT" } })).jobId as string;
    const jOwner = await run(owner, "งานเจ้าของ");
    const jMgr = await run(mgr, "งานผู้จัดการ");
    const jS1 = await run(s1, "งานสตาฟ");
    const ghost = randomUUID();
    const read = (who: Any, id: string) => call(() => CON.getImportJob(who.ctx, who.actor, id));
    const allowed = [[owner, jOwner], [owner, jMgr], [owner, jS1], [mgr, jMgr], [s1, jS1]] as const;
    const denied = [[mgr, jS1], [mgr, jOwner], [mgr2, jMgr], [s2, jS1], [s1, jOwner], [s1, jMgr]] as const;
    const ok1 = await Promise.all(allowed.map(([w, id]) => read(w, id)));
    const ghostR = await read(s2, ghost);
    const den = await Promise.all(denied.map(([w, id]) => read(w, id)));
    const sameAsGhost = (r: Any) => !r.ok && codeOf(r) === codeOf(ghostR) && r.err?.message === ghostR.err?.message && r.err?.constructor?.name === ghostR.err?.constructor?.name && j(Object.keys(r.err ?? {}).sort()) === j(Object.keys(ghostR.err ?? {}).sort());
    chk("JB-scope", ok1.every((r) => r.ok) && den.every(sameAsGhost) && !ghostR.ok,
      `allowed (owner→3 jobs · manager→own · staff→own): ${ok1.map(codeOf).join(",")} · denied (manager→staff's/owner's · other manager→manager's · staff→other staff's/owner's/manager's): ${den.map(codeOf).join(",")} identical to a non-existent id (${codeOf(ghostR)} "${cut(ghostR.err?.message, 50)}")=${den.every(sameAsGhost)}`);
    // timing: "exists but not yours" vs "does not exist" (same single query; measured, info)
    const t = async (id: string) => { const a = process.hrtime.bigint(); await read(s2, id); return Number(process.hrtime.bigint() - a) / 1e6; };
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < 12; i += 1) { xs.push(await t(jS1)); ys.push(await t(randomUUID())); }
    const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
    info("JB-timing", `median ms over 12: exists-not-yours ${med(xs).toFixed(1)} · non-existent ${med(ys).toFixed(1)} (QC2 over the network)`);
  }

  // ═══════════ NW · nothing written, incl. the first write of a fresh CRM system ═══════════
  console.log("\n── NW ──");
  {
    const fresh = await mkShop("fresh");
    const u = await member(fresh, "fs", "STAFF", KEYS);
    const seeded0 = await P.memberField.count({ where: { tenantId: fresh.tid } }).catch(() => -1);
    await fill(`crm:contact:ident:${fresh.tid}:${u.uid}`);
    const s0 = await snap(fresh.tid);
    const r = await call(() => CON.createContact(u.ctx, u.actor, { firstName: `แรก ${rand}`, phone: newPhone() }));
    const s1x = await snap(fresh.tid);
    const d = diff(s0, s1x);
    info("NW-first-write", `fresh CRM system (contact fields seeded before: ${seeded0}) · create with phone at the limit → ${codeOf(r)} · tenant writes: ${d}`);
    chk("NW-no-contact-data", codeOf(r) === "RATE_LIMITED" && !/CrmContact|Party|AuditLog|OutboxEvent/.test(d), `no contact / party / audit / outbox row on the refusal (other writes: ${d})`);
  }

  // ═══════════ ID · idempotency with an API-key actor ═══════════
  console.log("\n── ID ──");
  {
    const op = (OPS.CONTACTS_OPS as Any[]).find((o) => o.id === "contacts.create");
    const keyActor = { kind: "apikey", module: "crm", tenantId: shop.tid, systemId: shop.S, keyId: `${TAG}-k`, keyName: "probe", userId: s1.uid, scopes: ["crm.contact.read", "crm.contact.create"] };
    const memberOfKey = crmActorForKey({ keyId: keyActor.keyId, scopes: keyActor.scopes, createdById: s1.uid });
    // can a key reach the limiter? s1's bucket full → key (created by s1) create with phone
    const bucket = `crm:contact:ident:${shop.tid}:${s1.uid}`;
    await fill(bucket);
    const viaKey = await call(() => op.handler({ actor: keyActor, params: {}, input: { firstName: `คีย์ ${rand}`, phone: newPhone() }, requestId: `r-${rand}`, idempotencyKey: "x" }));
    info("ID-key-reach", `API key (creator's bucket full) contacts.create → ${codeOf(viaKey)} (keys skip the person limiter: isApiActor=${!!memberOfKey.apiRole})`);
    await P.chatRateBucket.deleteMany({ where: { key: bucket } });
    // mechanism: a run that throws the mapped RATE_LIMITED vs the mapped plan-cap LIMIT, same key retried
    const mk = (idem: string) => new Request("https://shark.invalid/api/v1/crm/contacts", { method: "POST", headers: { "idempotency-key": idem, "content-type": "application/json" }, body: "{}" });
    const out: string[] = [];
    let ok = true;
    for (const [code, wantFirst, wantReplay] of [["RATE_LIMITED", 429, false], ["LIMIT", 409, true]] as const) {
      const idem = `${TAG}-${code}`;
      let n = 0;
      const run = async () => {
        n += 1;
        if (n === 1) throw toCrmApiError(new SHARED.ContactsError(code, code === "RATE_LIMITED" ? SHARED.CONTACT_IDENT_RATE_MSG(30) : "ระบบนี้ถึงเพดานแล้ว", code === "RATE_LIMITED" ? { retryAfterSec: 30 } : {}));
        return { status: 201, body: { data: { ok: true } } };
      };
      const r1 = await withIdempotency(keyActor, mk(idem), op, "{}", `q1-${code}`, {}, run);
      const b1 = JSON.parse(await r1.text());
      const r2 = await withIdempotency(keyActor, mk(idem), op, "{}", `q2-${code}`, {}, run);
      const replay = r2.headers.get("Idempotent-Replayed") === "true";
      const good = r1.status === wantFirst && replay === wantReplay && (wantReplay ? r2.status === 409 : r2.status === 201) && (code !== "RATE_LIMITED" || (b1?.error?.code === "rate_limited" && !/[0-9a-f]{8}-/.test(j(b1))));
      ok = ok && good;
      out.push(`${code}: first ${r1.status} ${b1?.error?.code} hint=${j(b1?.error?.hint ?? null)} · retry same key ${r2.status} replayed=${replay}`);
    }
    chk("ID-release-vs-store", ok, out.join(" · "));
    await P.apiIdempotency.deleteMany({ where: { tenantId: shop.tid } });
  }

  // ═══════════ MB · mobile / card-scan for DUPLICATE and LIMIT (found, not fixed) ═══════════
  console.log("\n── MB ──");
  {
    const dup = MOBILE.mobileErrorOf(new SHARED.ContactsError("DUPLICATE", SHARED.CONTACT_DUPLICATE_HIDDEN_MSG));
    const cap = MOBILE.mobileErrorOf(new SHARED.ContactsError("LIMIT", "ระบบนี้ถึงเพดานผู้ติดต่อแล้ว"));
    const rl = MOBILE.mobileErrorOf(new SHARED.ContactsError("RATE_LIMITED", SHARED.CONTACT_IDENT_RATE_MSG(60), { retryAfterSec: 60 }));
    info("MB-mobile", `mobileErrorOf: hidden DUPLICATE → ${dup.status} ${dup.error} "${cut(dup.message, 60)}" · plan-cap LIMIT → ${cap.status} ${cap.error} · RATE_LIMITED → ${rl.status} ${rl.error}`);
    chk("MB-rate-limited", rl.status === 429 && rl.error === "rate_limited" && /ยังไม่ได้บันทึก/.test(rl.message), "mobile maps RATE_LIMITED to 429 with the service text");
  }
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
for (const k of BUCKETS) await P.chatRateBucket.deleteMany({ where: { key: k } }).catch(() => undefined);
await P.apiIdempotency.deleteMany({ where: { keyId: { startsWith: TAG } } }).catch(() => undefined);
await done("probe-cf16-review-r2");
