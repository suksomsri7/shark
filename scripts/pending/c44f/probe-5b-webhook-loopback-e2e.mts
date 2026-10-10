// C4.4-fix item 5 (I3) end-to-end on QC3: with the private-targets switch on (dev/QC), a CRM webhook to a plain-http
//   loopback capture server passes crmWebhookUrlProblem, is saved, is delivered (real HTTP), and carries a verifiable
//   X-Shark-Signature over the exact body `{ id, type, payload, sentAt }` with ids only. Switch off ⇒ refused at save.
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/probe-5b-webhook-loopback-e2e.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import http from "node:http";
import { createHmac } from "node:crypto";
const { fixture } = (await import("./_fx.mts" as string)) as Any;
const realFetch = globalThis.fetch;
const { P, chk, mkShop, done } = await fixture("wh");
globalThis.fetch = realFetch; // this probe needs real loopback HTTP (the capture server below) — nothing leaves the box
const captured: { headers: Any; body: string }[] = [];
const server = http.createServer((req, res) => {
  const b: Buffer[] = [];
  req.on("data", (c) => b.push(c));
  req.on("end", () => {
    captured.push({ headers: req.headers, body: Buffer.concat(b).toString("utf8") });
    res.writeHead(200);
    res.end("ok");
  });
});
const port = 20000 + Math.floor(Math.random() * 20000);
await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
const url = `http://127.0.0.1:${port}/hook`;
try {
  const W = (await import("@/lib/modules/crm/api/webhook-events" as string)) as Any;
  const S = (await import("@/lib/webhooks/service" as string)) as Any;
  const shop = await mkShop("a");
  process.env.WEBHOOK_ALLOW_PRIVATE = "0";
  chk("5b.1", W.crmWebhookUrlProblem(url) !== null, `switch off ⇒ http loopback refused at save (prod behaviour)`);
  process.env.WEBHOOK_ALLOW_PRIVATE = "1";
  process.env.APP_ENV = "development";
  const problem = W.crmWebhookUrlProblem(url);
  const ep = await S.createEndpoint({ tenantId: shop.tid }, { url, events: ["crm.deal.stale"] });
  const n = await S.dispatchWebhooks({ tenantId: shop.tid, type: "crm.deal.stale", payload: { dealId: "deal-x", days: 14 }, id: `evt-${shop.tid}` });
  const row = await P.webhookDelivery.findFirst({ where: { endpointId: ep.id }, select: { status: true, lastError: true } });
  const secret = (await P.webhookEndpoint.findFirst({ where: { id: ep.id }, select: { secret: true } }))?.secret as string;
  const hit = captured[0];
  const body = hit ? JSON.parse(hit.body) : null;
  const sigOk = !!hit && createHmac("sha256", secret).update(hit.body).digest("hex") === hit.headers["x-shark-signature"];
  chk("5b.2", problem === null && n >= 1 && row?.status === "OK" && !!hit, `switch on ⇒ saved + delivered over real HTTP — problem=${problem} dispatched=${n} row=${JSON.stringify(row)} captured=${captured.length}`);
  chk("5b.3", sigOk && body?.payload?.dealId === "deal-x" && body?.type === "crm.deal.stale" && !!body?.id && !!body?.sentAt,
    `signature verifies over the exact body; body shape is { id, type, payload:{dealId}, sentAt } (dealId is under payload, NOT top-level) — got sig=${sigOk} body=${hit?.body}`);
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  server.close();
  delete process.env.WEBHOOK_ALLOW_PRIVATE;
  await done("probe-5b-webhook-loopback-e2e");
}
