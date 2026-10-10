// C5.5-fix12 ROUND 2 probe (builder) — RV12-1 · sweep row #22
//   RL  the phone/e-mail rate-limit refusal of a person is a RATE LIMIT, not a plan cap:
//       service code RATE_LIMITED + a Thai "wait a few minutes" text (not the plan-cap text) · REST 429 rate_limited marked
//       nothing-written ⇒ the idempotency layer does not store it: the same Idempotency-Key succeeds once the bucket is clear ·
//       the AI-confirmation path (dispatchCrmKind) shows the same Thai text · the mobile mapper gives 429 too · control: a plan-cap LIMIT stays 409 state_conflict, stored
//   JB  getImportJob: the person who ran the import and the shop OWNER read it; another STAFF member, a MANAGER and an API key
//       holding the id get exactly the not-found answer of a job id that does not exist
// QC2 only (ep-cool-shadow) · throwaway tenant `qc-cf16-r2-*` (swept in done()) + the rate buckets / idempotency rows it made.
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc2.sh bash scripts/with-gate-lock.sh \
//        pnpm exec tsx scripts/pending/cf16/probe-cf16-r2.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { AsyncLocalStorage } from "node:async_hooks";
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const fx = await fixture("r2");
const { P, chk, call, mkShop, mkUser, done, TAG } = fx;
const j = (v: Any) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Date ? x.toISOString() : x));
const cut = (v: unknown, n = 120) => { const s = String(v ?? "").replace(/\s+/g, " "); return s.length > n ? `${s.slice(0, n)}…` : s; };
const codeOf = (r: Any) => (r.ok ? "OK" : String(r.err?.code ?? r.err?.name ?? "ERR"));
const rand = TAG.slice(-8);

const { toMemberActor } = (await import("@/lib/modules/member" as string)) as Any;
const CON = (await import("@/lib/modules/crm/contacts" as string)) as Any;
const SHARED = (await import("@/lib/modules/crm/contacts-shared" as string)) as Any;
const OPS = (await import("@/lib/modules/crm/api/ops/contacts" as string)) as Any;
const TOOLS = (await import("@/lib/modules/crm/api/tools" as string)) as Any;
const MOBILE = (await import("@/lib/modules/crm/mobile" as string)) as Any;
const { toCrmApiError } = (await import("@/lib/modules/crm/api/http-errors" as string)) as Any;
const { isNothingWritten } = (await import("@/lib/api/respond" as string)) as Any;
const { withIdempotency } = (await import("@/lib/api/idempotency" as string)) as Any;
const { crmActorForKey } = (await import("@/lib/modules/crm/api/actor" as string)) as Any;
const LIM = SHARED.CONTACT_IDENT_RATE.limit as number;
const PLAN_CAP_EN = "This CRM system reached one of its limits";
let seq = Math.floor(Math.random() * 1e6);
const newPhone = () => `08${String(10_000_000 + (seq++ % 89_999_999)).slice(0, 8)}`;
const PREFIXES: string[] = [];
const fill = (k: string) => P.chatRateBucket.upsert({ where: { key: k }, create: { key: k, count: LIM, windowStart: new Date() }, update: { count: LIM, windowStart: new Date() } });

async function person(shop: Any, suffix: string, role: "STAFF" | "MANAGER", keys: string[]) {
  const uid = await mkUser(`-${suffix}`);
  const permissions = Object.fromEntries(keys.map((k) => [k, true]));
  const m = await P.membership.create({ data: { userId: uid, tenantId: shop.tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
  return { uid, permissions, actor: toMemberActor(uid, m), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: uid } };
}

try {
  const shop = await mkShop("a");
  PREFIXES.push(`crm:contact:ident:${shop.tid}:`);
  const owner = { uid: shop.uid, actor: shop.owner, ctx: shop.ctx };
  const KEYS = ["crm.contact.read", "crm.contact.create", "crm.contact.update", "crm.contact.import"];
  const s1 = await person(shop, "s1", "STAFF", KEYS);
  const s2 = await person(shop, "s2", "STAFF", KEYS);
  const mgr = await person(shop, "mgr", "MANAGER", []);
  const countPhone = (p: string) => P.crmContact.count({ where: { tenantId: shop.tid, phone: p } });

  // ═══════════ RL · rate-limit refusal shape ═══════════
  console.log("\n── RL ──");
  const bucket = `crm:contact:ident:${shop.tid}:${s1.uid}`;
  {
    await fill(bucket);
    const p = newPhone();
    const r = await call(() => CON.createContact(s1.ctx, s1.actor, { firstName: `เกิน ${rand}`, phone: p }));
    const msg = String(r.err?.message ?? "");
    const ok = !r.ok && codeOf(r) === "RATE_LIMITED" && msg === SHARED.CONTACT_IDENT_RATE_MSG(r.err?.retryAfterSec) && /ลองใหม่/.test(msg) && /นาที/.test(msg) && /ยังไม่ได้บันทึก/.test(msg) && !/เพดาน/.test(msg) && (await countPhone(p)) === 0;
    chk("R2-RL-service", ok, `bucket at ${LIM}: person create with a phone → ${codeOf(r)} retryAfterSec=${r.err?.retryAfterSec} "${cut(msg, 140)}" · rows with that phone ${await countPhone(p)}`);
    const api = toCrmApiError(r.err);
    chk("R2-RL-rest-shape", api?.status === 429 && api?.code === "rate_limited" && isNothingWritten(api) === true && api?.message_th === msg && !String(api?.message_en ?? "").includes(PLAN_CAP_EN),
      `toCrmApiError → ${api?.status} ${api?.code} nothingWritten=${isNothingWritten(api)} hint=${j(api?.hint ?? null)} en="${cut(api?.message_en, 80)}"`);
    // the mobile app's scan-card accept (person path) maps service errors through mobileErrorOf
    const mob = MOBILE.mobileErrorOf(r.err);
    chk("R2-RL-mobile", mob.status === 429 && mob.error === "rate_limited" && mob.message === msg, `mobileErrorOf → ${mob.status} ${mob.error} "${cut(mob.message, 60)}"`);
  }
  // REST dispatcher's idempotency layer, driven with a person actor (the shape of the AI-confirmation / user lanes) that carries a key id
  {
    const op = (OPS.CONTACTS_OPS as Any[]).find((o) => o.id === "contacts.create");
    const restActor = { kind: "user", module: "crm", tenantId: shop.tid, systemId: shop.S, keyId: `${TAG}-u`, keyName: "probe", userId: s1.uid, scopes: [], membership: { role: "STAFF", unitAccess: ["*"], permissions: s1.permissions } };
    const p = newPhone();
    const input = { firstName: `ลองซ้ำคีย์เดิม ${rand}`, phone: p };
    const bodyText = JSON.stringify(input);
    const idem = `${TAG}-idem`;
    const mkReq = () => new Request("https://shark.invalid/api/v1/crm/contacts", { method: "POST", headers: { "idempotency-key": idem, "content-type": "application/json" }, body: bodyText });
    const run = async () => ({ status: 201, body: { data: await op.handler({ actor: restActor, params: {}, input, requestId: `r-${rand}`, idempotencyKey: idem }) } });
    await fill(bucket);
    const r1 = await withIdempotency(restActor, mkReq(), op, bodyText, "req-1", {}, run);
    const b1 = JSON.parse(await r1.text());
    const stored = await P.apiIdempotency.count({ where: { tenantId: shop.tid, keyId: `${TAG}-u`, idemKey: idem } });
    await P.chatRateBucket.deleteMany({ where: { key: bucket } }); // the window passed
    const r2 = await withIdempotency(restActor, mkReq(), op, bodyText, "req-2", {}, run);
    const b2 = JSON.parse(await r2.text());
    const rows = await countPhone(p);
    chk("R2-RL-idem-retry", r1.status === 429 && b1?.error?.code === "rate_limited" && stored === 0 && r2.status === 201 && r2.headers.get("Idempotent-Replayed") !== "true" && b2?.data?.created === true && rows === 1,
      `limited: ${r1.status} ${b1?.error?.code} "${cut(b1?.error?.message_th, 60)}" · stored for replay=${stored} · same key after the window: ${r2.status} replayed=${r2.headers.get("Idempotent-Replayed")} created=${b2?.data?.created ?? cut(b2?.error?.code, 30)} · rows ${rows}`);
    await P.apiIdempotency.deleteMany({ where: { tenantId: shop.tid } });
  }
  // AI proposal confirmation (dispatchCrmKind → runOpAsActor → op → toCrmApiError → message_th)
  {
    await fill(bucket);
    const p = newPhone();
    const r = await call(() => TOOLS.dispatchCrmKind({ tenantId: shop.tid, systemId: shop.S, userId: s1.uid, role: "STAFF", unitAccess: ["*"], permissions: s1.permissions, proposalId: `p-${rand}` },
      TOOLS.crmKindOf("contacts.create"), { opId: "contacts.create", systemId: shop.S, input: { firstName: `ผู้ช่วย ${rand}`, phone: p } }));
    const msg = String(r.err?.message ?? "");
    chk("R2-RL-ai-message", !r.ok && /ยังไม่ได้บันทึก/.test(msg) && /ลองใหม่/.test(msg) && !/เพดาน/.test(msg) && (await countPhone(p)) === 0, `AI confirmation while the bucket is full → ${codeOf(r)} "${cut(msg, 140)}"`);
    await P.chatRateBucket.deleteMany({ where: { key: bucket } });
  }
  // control: a plan cap (LIMIT) is unchanged — 409 state_conflict, stored for replay
  {
    const api = toCrmApiError(new SHARED.ContactsError("LIMIT", "ถึงเพดานจำนวนผู้ติดต่อ ของระบบนี้แล้ว (10 คน) — เก็บถาวร/ลบรายการที่ไม่ใช้ก่อน หรือติดต่อทีม SHARK เพื่อขยายเพดาน"));
    chk("R2-RL-plan-cap-control", api?.status === 409 && api?.code === "state_conflict" && isNothingWritten(api) === false, `plan-cap LIMIT → ${api?.status} ${api?.code} nothingWritten=${isNothingWritten(api)}`);
  }

  // ═══════════ JB · import job by id ═══════════
  console.log("\n── JB ──");
  {
    const imp = (who: Any, name: string) => CON.importContacts(who.ctx, who.actor, { rows: [{ ชื่อ: "", เบอร์: "" }, { ชื่อ: `${name} ${rand}`, เบอร์: newPhone() }], mapping: { ชื่อ: "firstName", เบอร์: "phone" }, options: { onDuplicate: "skip", source: "IMPORT" } });
    const jO = await imp(owner, "งานเจ้าของ");
    const jS = await imp(s1, "งานพนักงาน");
    const keyScopes = ["crm.contact.read", "crm.contact.create", "crm.contact.import"];
    const key = { actor: crmActorForKey({ keyId: `k-${rand}`, scopes: keyScopes, createdById: s2.uid }), ctx: { tenantId: shop.tid, systemId: shop.S, actorUserId: s2.uid } };
    const ghost = await call(() => CON.getImportJob(s2.ctx, s2.actor, "00000000-0000-4000-8000-000000000000"));
    const same = (r: Any) => !r.ok && codeOf(r) === codeOf(ghost) && r.err?.message === ghost.err?.message;
    const read = async (who: Any, id: string) => call(() => CON.getImportJob(who.ctx, who.actor, id));
    const cells: [string, Any, boolean][] = [
      ["owner→own", await read(owner, jO.jobId), true],
      ["s1→own", await read(s1, jS.jobId), true],
      ["owner→s1's", await read(owner, jS.jobId), true],
      ["s2→owner's", await read(s2, jO.jobId), false],
      ["s2→s1's", await read(s2, jS.jobId), false],
      ["s1→owner's", await read(s1, jO.jobId), false],
      ["manager→s1's", await read(mgr, jS.jobId), false],
      ["key(of s2)→s1's", await read(key, jS.jobId), false],
    ];
    const bad: string[] = [];
    for (const [lbl, r, want] of cells) {
      if (want && !(r.ok && r.v.result.created === 1 && r.v.result.failed === 1)) bad.push(`${lbl}: ${codeOf(r)} ${cut(r.err?.message, 50)}`);
      if (!want && !same(r)) bad.push(`${lbl}: ${codeOf(r)} ${r.ok ? `READ ${j(r.v.result).slice(0, 80)}` : cut(r.err?.message, 60)}`);
    }
    chk("R2-JB-scope", ghost.ok === false && bad.length === 0,
      `runner + OWNER read · others get the answer of a non-existent id (${codeOf(ghost)} "${cut(ghost.err?.message, 50)}") · ${cells.map(([l, r]) => `${l} ${codeOf(r)}`).join(" · ")}${bad.length ? ` · BAD ${bad.join(" | ")}` : ""}`);
  }
} catch (e) {
  chk("FATAL", false, String((e as Error)?.stack ?? e).slice(0, 900));
}
await done("probe-cf16-r2", async () => {
  for (const pre of PREFIXES) await P.chatRateBucket.deleteMany({ where: { key: { startsWith: pre } } }).catch(() => undefined);
  await P.apiIdempotency.deleteMany({ where: { keyId: { startsWith: TAG } } }).catch(() => undefined);
});
