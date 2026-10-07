// C5.5-fix3b REVIEW child (F4) — webhook service with the composition root replaced by an EMPTY module (same technique as
//   ../guard-child.mts), then registers guards itself (plain JS call, i.e. what a mistyped / `as any` registration would do):
//   mode "CRM-upper": one pass-everything guard under "CRM" (wrong case)  ⇒ want fail CLOSED for every CRM / all-events write, 0 guard runs
//   mode "two"      : pass-everything guards under "member" AND "crm"     ⇒ want every write to pass, both guards run
// Prints `CHILD_JSON {...}`. Args: <mode> <tenantId> <endpointId>
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
let calls = 0;
const pass = async () => {
  calls++;
  return null;
};
if (mode === "CRM-upper") svc.registerWebhookEventGuard("CRM", pass);
if (mode === "two") {
  svc.registerWebhookEventGuard("member", pass);
  svc.registerWebhookEventGuard("crm", pass);
}
const errOf = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return "ok";
  } catch (e) {
    return `${(e as Any)?.name ?? "Error"}: ${String((e as Any)?.message ?? e).slice(0, 120)}`;
  }
};
const by = { actor: { userId: "u-cf5-rv", role: "OWNER", unitAccess: ["*"], permissions: {} } };
out.toggleOn = await errOf(() => svc.setEndpointActive({ tenantId }, endpointId, true, by));
await errOf(() => svc.setEndpointActive({ tenantId }, endpointId, false, by));
out.all = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, [], by));
out.crm = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["crm.deal.won"], by));
out.unknownCrm = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["crm.nope.unknown"], by));
out.mixed = await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, ["member.created", "team.updated"], by));
await errOf(() => svc.setEndpointEvents({ tenantId }, endpointId, [], undefined as Any));
out.guardCalls = calls;
const { prisma } = await import("@/lib/core/db");
await prisma.$disconnect();
console.log(`CHILD_JSON ${JSON.stringify(out)}`);
