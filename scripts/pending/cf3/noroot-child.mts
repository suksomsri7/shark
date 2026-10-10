// C5.5-fix3a probe child (R2-2) — imports the webhook SERVICE ONLY (never `@/lib/webhook-guards` itself) and calls the guarded writers.
//   mode "noroot": the composition root must be loaded by the service on the first guarded call ⇒ the CRM guard runs (args: tenant, endpoint, userId)
//   mode "empty" : the root is replaced by an EMPTY module (require.cache seeded before the service loads) ⇒ registry empty after the import
//                  ⇒ fail CLOSED for [] / crm.* / custom.record.* / team.* · other events pass the guard step
// Prints one line `CHILD_JSON {...}`. Spawned by probe-cf3.mts with the parent's env (QC2).
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { createRequire } from "node:module";
import { resolve } from "node:path";
const mode = process.argv[2] ?? "";
const [tenantId, endpointId, userId] = process.argv.slice(3);
const req = createRequire(import.meta.url);
const ROOT = resolve(process.cwd(), "src/lib/webhook-guards.ts");
const rootLoaded = () => Object.keys(req.cache).some((k) => k.endsWith("src/lib/webhook-guards.ts"));
const out: Record<string, unknown> = { mode };
if (mode === "empty") {
  const M = req("node:module") as Any;
  const m = new M.Module(ROOT);
  m.filename = ROOT;
  m.loaded = true;
  m.exports = {};
  req.cache[ROOT] = m;
}
out.rootBefore = rootLoaded();
const svc = (await import("@/lib/webhooks/service" as string)) as Any;
const errOf = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return "ok";
  } catch (e) {
    return `${(e as Any)?.name ?? "Error"}: ${String((e as Any)?.message ?? e).slice(0, 120)}`;
  }
};
if (mode === "noroot") {
  out.allEvents = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, [], { userId }));
  out.rootAfter = rootLoaded() || "esm";
} else {
  const actor = { actor: { userId: "u-cf3", role: "OWNER", unitAccess: ["*"], permissions: {} } };
  // endpoint row given by the parent: stored events [] (all events), inactive
  out.toggleOff = await errOf(() => svc.setEndpointActive({ tenantId }, endpointId, false, actor));
  out.toggleOnAll = await errOf(() => svc.setEndpointActive({ tenantId }, endpointId, true, actor));
  out.allEvents = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, [], actor));
  out.crm = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["crm.deal.won"], actor));
  out.customRecord = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["custom.record.created"], actor));
  out.team = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["team.member.added"], actor));
  out.createAll = await errOf(() => svc.createEndpoint({ tenantId }, { url: "https://example.com/qc-cf3-empty", events: [], by: actor }, { lookup: async () => "93.184.216.34" }));
  out.member = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["member.created"], actor));
  out.noBy = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["member.created"]));
}
const { prisma } = await import("@/lib/core/db");
await prisma.$disconnect();
console.log(`CHILD_JSON ${JSON.stringify(out)}`);
