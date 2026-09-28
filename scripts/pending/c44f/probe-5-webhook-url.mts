// C4.4-fix item 5 (I3): crmWebhookUrlProblem — https always · plain http ONLY for a loopback target AND ONLY when the SSRF
//   guard's own private-targets switch is on (WEBHOOK_ALLOW_PRIVATE=1 and APP_ENV ≠ production) · prod unchanged
//   Pure (no DB) — env is read per call, so the probe flips it in-process. Also proves the SSRF guard is unchanged.
// Run: pnpm exec tsx scripts/pending/c44f/probe-5-webhook-url.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const res: { id: string; ok: boolean; msg: string }[] = [];
const chk = (id: string, ok: boolean, msg: string) => {
  res.push({ id, ok, msg });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${msg}`);
};
const W = (await import("@/lib/modules/crm/api/webhook-events" as string)) as Any;
const S = (await import("@/lib/webhooks/service" as string)) as Any;
const setEnv = (allow: string | undefined, appEnv: string | undefined) => {
  if (allow === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE;
  else process.env.WEBHOOK_ALLOW_PRIVATE = allow;
  if (appEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = appEnv;
};
const p = (u: string) => W.crmWebhookUrlProblem(u) as string | null;
const LOOP = ["http://127.0.0.1:23456/hook", "http://127.9.9.9/x", "http://localhost:3000/hook", "http://[::1]:8080/hook"];
const NOT_LOOP = ["http://10.0.0.5/hook", "http://192.168.1.2/hook", "http://169.254.169.254/latest", "http://example.com/hook", "http://127.0.0.1.nip.io/hook", "http://localhost.evil.com/x", "ftp://127.0.0.1/x"];

setEnv(undefined, undefined);
chk("5.1", LOOP.every((u) => p(u) !== null) && p("https://example.com/h") === null, `switch OFF: every http target refused (incl. loopback) · https ok — got ${JSON.stringify(LOOP.map(p))}`);

setEnv("1", "development");
chk("5.2", LOOP.every((u) => p(u) === null), `switch ON (dev/QC): http loopback accepted — got ${JSON.stringify(LOOP.map(p))}`);
chk("5.3", NOT_LOOP.every((u) => p(u) !== null) && p("https://example.com/h") === null, `switch ON: http to anything that is not loopback still refused — got ${JSON.stringify(NOT_LOOP.map(p))}`);

setEnv("1", "production");
chk("5.4", LOOP.every((u) => p(u) !== null) && p("https://example.com/h") === null, `APP_ENV=production + switch ON: http refused even for loopback (prod unchanged) — got ${JSON.stringify(LOOP.map(p))}`);

setEnv("0", "development");
chk("5.5", LOOP.every((u) => p(u) !== null), `switch = "0": refused — got ${JSON.stringify(LOOP.map(p))}`);

// SSRF guard unchanged: loopback https is still blocked without the switch, allowed with it (existing contract)
setEnv(undefined, undefined);
const g1 = await S.webhookTargetProblem("https://127.0.0.1/hook");
const g2 = await S.webhookTargetProblem("http://10.1.2.3/hook");
setEnv("1", "development");
const g3 = await S.webhookTargetProblem("http://127.0.0.1:23456/hook");
setEnv("1", "production");
const g4 = await S.webhookTargetProblem("http://127.0.0.1:23456/hook");
chk("5.6", !!g1 && !!g2 && g3 === null && !!g4, `SSRF guard (webhookTargetProblem) behaviour unchanged — off:${JSON.stringify([g1, g2])} on:${g3} prod:${g4}`);

const bad = res.filter((r) => !r.ok).length;
console.log(`\n${bad === 0 ? "🟢" : "🔴"} probe-5-webhook-url: ${res.length - bad}/${res.length}`);
process.exit(bad === 0 ? 0 : 1);
