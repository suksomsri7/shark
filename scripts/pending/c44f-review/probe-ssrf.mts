// pure — no DB. C4.4-fix I3 URL gate under hostname tricks (switch ON vs production)
const { crmWebhookUrlProblem } = await import("@/lib/modules/crm/api/webhook-events" as string);
const urls = ["http://localhost/x","http://localhost./x","http://LOCALHOST:8080/x","http://127.1/x","http://0x7f.1/x","http://2130706433/x","http://0177.0.0.1/x","http://[::1]/x","http://[::ffff:127.0.0.1]/x","http://a@127.0.0.1/x","http://127.0.0.1.nip.io/x","http://localhost.evil.com/x","http://0.0.0.0/x","http://10.0.0.1/x","http://169.254.169.254/x","https://example.com/x","http://example.com/x","http://127.0.0.1%2f@evil.com/x"];
for (const env of [{ W: "1", A: "development" }, { W: "1", A: "production" }, { W: "", A: "development" }]) {
  process.env.WEBHOOK_ALLOW_PRIVATE = env.W; process.env.APP_ENV = env.A;
  console.log(`--- WEBHOOK_ALLOW_PRIVATE=${env.W || "(unset)"} APP_ENV=${env.A}`);
  for (const u of urls) { let h = "?"; try { h = new URL(u).hostname; } catch { h = "PARSE-ERR"; } console.log(`${crmWebhookUrlProblem(u) === null ? "ALLOW" : "block"}  ${u}  (hostname=${h})`); }
}
