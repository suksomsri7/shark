// C5.5 hunt — F-IDEM: C5.4-A H3 maps transient infra errors (P2024 pool timeout, P1017 connection closed …) to 503 and
// `withIdempotency` deletes the claim for 503 ⇒ when the write ALREADY COMMITTED and only a later query (DTO re-read after the
// tx, a second service call) hits the transient error, the client's retry with the same Idempotency-Key runs the write AGAIN.
// Before C5.4-A (prod 3677d983) the same error was stored (422) and replayed — wrong status, but never a duplicate.
// In-process against QC3, own tenant only, cleaned.
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c55/probe-idem.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture } = (await import("./_fx.mts" as string)) as { fixture: (label: string) => Promise<Any> };

const fx = await fixture("idem");
const { P, chk, done } = fx;
try {
  const shop = await fx.mkShop("i");
  const { withIdempotency } = (await import("@/lib/api/idempotency" as string)) as Any;
  const actor = { kind: "apikey", module: "crm", tenantId: shop.tid, systemId: shop.S, keyId: `${fx.TAG}-key`, keyName: "probe", userId: shop.uid, scopes: [], membership: { role: "STAFF", unitAccess: ["*"], permissions: {} } };
  const op = { id: "probe.write", method: "POST", path: "/probe", kind: "write", action: "crm.contact.create" };
  const mkReq = (k: string) => new Request("https://shark.invalid/api/v1/crm/probe", { method: "POST", headers: { "idempotency-key": k, "content-type": "application/json" }, body: "{}" });
  // stands for any committed business write (contact/deal/payment row) — an AppNotification row of our own tenant
  const write = (label: string) => P.appNotification.create({ data: { tenantId: shop.tid, recipientUserId: shop.uid, title: `qc.c55.${label}`, body: fx.TAG } });
  const countRows = async (label: string) => P.appNotification.count({ where: { tenantId: shop.tid, title: `qc.c55.${label}` } });

  // A — committed write, then a transient infra error on the follow-up read (Prisma P2024 = pool timeout)
  const transient = () => Object.assign(new Error("Timed out fetching a new connection from the connection pool."), { code: "P2024", name: "PrismaClientKnownRequestError" });
  const runA = async () => {
    await write("a");
    throw transient();
  };
  const a1 = await withIdempotency(actor, mkReq(`${fx.TAG}-A`), op, "{}", "req-a1", {}, runA);
  const a2 = await withIdempotency(actor, mkReq(`${fx.TAG}-A`), op, "{}", "req-a2", {}, runA);
  const nA = await countRows("a");
  const bodyA = await a1.text();
  chk("IDEM-A", nA === 1, `same Idempotency-Key, write committed then P2024: status ${a1.status}/${a2.status} · replayed2=${a2.headers.get("Idempotent-Replayed")} · rows written=${nA} (expected 1) · body says "${(JSON.parse(bodyA)?.error?.message_th ?? JSON.parse(bodyA)?.message_th ?? bodyA).toString().slice(0, 80)}"`);

  // B — positive control: a non-transient failure after the write is stored and replayed (one row)
  const runB = async () => {
    await write("b");
    throw new Error("unexpected");
  };
  const b1 = await withIdempotency(actor, mkReq(`${fx.TAG}-B`), op, "{}", "req-b1", {}, runB);
  const b2 = await withIdempotency(actor, mkReq(`${fx.TAG}-B`), op, "{}", "req-b2", {}, runB);
  const nB = await countRows("b");
  chk("IDEM-B(control)", nB === 1 && b2.headers.get("Idempotent-Replayed") === "true", `non-transient error after write: status ${b1.status}/${b2.status} replayed2=${b2.headers.get("Idempotent-Replayed")} rows=${nB}`);
  await P.apiIdempotency.deleteMany({ where: { tenantId: shop.tid } });
} catch (e) {
  chk("IDEM-ERR", false, String((e as Error)?.stack ?? e).slice(0, 800));
} finally {
  await done("probe-idem");
}
