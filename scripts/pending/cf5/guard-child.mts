// C5.5-fix3b probe child (F4) — imports the webhook SERVICE ONLY, with the composition root `@/lib/webhook-guards` replaced by an EMPTY
//   module (require.cache seeded before the service loads, technique of scripts/pending/cf3/noroot-child.mts), then registers ONE guard itself:
//   mode "other": a guard under a non-CRM name ("member", passes everything) ⇒ registry NOT empty, but no guard owns the CRM family
//                 ⇒ want fail CLOSED for [] / crm.* / custom.record.* / team.* (toggle-on, set events, create) · member.* passes
//   mode "crm"  : a pass-everything guard registered under "crm" (positive control) ⇒ the same CRM writes pass
// Prints one line `CHILD_JSON {...}`. Spawned by probe-cf5.mts with the parent's env (QC2). Args: <mode> <tenantId> <endpointId>
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { createRequire } from "node:module";
import { resolve } from "node:path";
const mode = process.argv[2] ?? "";
const [tenantId, endpointId] = process.argv.slice(3);
const req = createRequire(import.meta.url);
const ROOT = resolve(process.cwd(), "src/lib/webhook-guards.ts");
const M = req("node:module") as Any;
const m = new M.Module(ROOT);
m.filename = ROOT;
m.loaded = true;
m.exports = {};
req.cache[ROOT] = m;
const out: Record<string, unknown> = { mode };
const svc = (await import("@/lib/webhooks/service" as string)) as Any;
const CALLS: string[] = [];
svc.registerWebhookEventGuard(mode === "crm" ? "crm" : "member", async (_t: string, _a: unknown, events: readonly string[]) => {
  CALLS.push(JSON.stringify(events));
  return null;
});
const errOf = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return "ok";
  } catch (e) {
    return `${(e as Any)?.name ?? "Error"}: ${String((e as Any)?.message ?? e).slice(0, 120)}`;
  }
};
const actor = { actor: { userId: "u-cf5", role: "OWNER", unitAccess: ["*"], permissions: {} } };
// endpoint row given by the parent: stored events [] (all events), inactive
out.toggleOff = await errOf(() => svc.setEndpointActive({ tenantId }, endpointId, false, actor));
out.toggleOnAll = await errOf(() => svc.setEndpointActive({ tenantId }, endpointId, true, actor));
await errOf(() => svc.setEndpointActive({ tenantId }, endpointId, false, actor));
out.allEvents = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, [], actor));
out.crm = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["crm.deal.won"], actor));
out.customRecord = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["custom.record.created"], actor));
out.team = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["team.updated"], actor)); // r2: a REAL team.* event (RV-5 refuses unknown names once the guard passes)
out.mixed = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["member.created", "crm.deal.won"], actor));
out.createAll = await errOf(() => svc.createEndpoint({ tenantId }, { url: `https://example.com/qc-cf5-${mode}`, events: [], by: actor }, { lookup: async () => "93.184.216.34" }));
out.member = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["member.created"], actor));
out.noBy = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["member.created"]));
out.guardCalls = CALLS.length;
const { prisma } = await import("@/lib/core/db");
await prisma.$disconnect();
console.log(`CHILD_JSON ${JSON.stringify(out)}`);
