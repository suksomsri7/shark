// C6.3 (controller, owner-authorised 7 Oct 2026 "ทำตามแนะนำ"): upsert CRM_V2_SWITCH_TENANTS on the shark Vercel project (Production)
// and redeploy the current production deployment so the runtime picks it up. Token/project/team read from .env IN-PROCESS, never printed.
// Usage: node scripts/pending/c6/vercel-env-switch.cjs <tenantId[,tenantId]> [--redeploy]
const fs = require("node:fs"), path = require("node:path");
const env = {}; for (const l of fs.readFileSync(path.join(__dirname, "../../../.env"), "utf8").split("\n")) { const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l); if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"); }
const TOKEN = env.SHARK_VERCEL_TOKEN, PROJECT = env.SHARK_VERCEL_PROJECT, TEAM = env.SHARK_VERCEL_TEAM;
if (!TOKEN || !PROJECT || !TEAM) { console.error("SHARK_VERCEL_TOKEN/PROJECT/TEAM missing"); process.exit(1); }
const value = process.argv[2]; const redeploy = process.argv.includes("--redeploy");
if (!value || !/^[a-z0-9]+(,[a-z0-9]+)*$/.test(value)) { console.error("tenant id list required"); process.exit(1); }
const api = async (method, p, body) => { const r = await fetch(`https://api.vercel.com${p}${p.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(TEAM)}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; } if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`); return j; };
(async () => {
  const proj = await api("GET", `/v9/projects/${PROJECT}`);
  console.log(`project ${proj.name} (${proj.id}) · framework ${proj.framework}`);
  const existing = (await api("GET", `/v9/projects/${PROJECT}/env`)).envs.filter((e) => e.key === "CRM_V2_SWITCH_TENANTS" || e.key === "CRM_V2_SWITCH");
  for (const e of existing) console.log(`existing ${e.key} targets=${(e.target || []).join(",")} id=${e.id}`);
  const up = await api("POST", `/v10/projects/${PROJECT}/env?upsert=true`, { key: "CRM_V2_SWITCH_TENANTS", value, type: "encrypted", target: ["production"] });
  console.log(`upsert CRM_V2_SWITCH_TENANTS (production) → ${up.created ? "created" : "updated"} id=${(up.created || {}).id || "?"}${up.failed && up.failed.length ? " FAILED " + JSON.stringify(up.failed).slice(0, 200) : ""}`);
  const dep = (await api("GET", `/v6/deployments?projectId=${proj.id}&target=production&limit=1`)).deployments[0];
  console.log(`current production deployment ${dep.uid} state=${dep.state} created=${new Date(dep.created).toISOString()} sha=${(dep.meta || {}).githubCommitSha ? dep.meta.githubCommitSha.slice(0, 8) : "?"}`);
  if (!redeploy) { console.log("(no --redeploy) done"); return; }
  const nd = await api("POST", `/v13/deployments`, { name: proj.name, deploymentId: dep.uid, target: "production" });
  console.log(`REDEPLOY started ${nd.id} state=${nd.readyState || nd.state} url=${nd.url}`);
})().catch((e) => { console.error("ERR", String(e.message || e).replace(/vcp_[A-Za-z0-9]+/g, "vcp_<redacted>")); process.exit(1); });
