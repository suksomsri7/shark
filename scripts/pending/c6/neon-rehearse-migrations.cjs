// C6.1 migration rehearsal (controller only): create a throw-away Neon branch of the PRODUCTION default branch, run
// `prisma migrate deploy` + `migrate status` + `pnpm drift` against it with the repo's current migrations, then delete the branch.
// NEON_API_KEY / NEON_PROJECT_ID are read from the project's .env IN-PROCESS; the branch connection string is handed to child
// processes through their env only and is never printed. Nothing touches the production branch itself (read-only parent).
// Usage: node scripts/pending/c6/neon-rehearse-migrations.cjs            (keeps nothing; branch deleted at the end, also on error)
const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "../../..");
const env = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) { const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l); if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"); }
const KEY = env.NEON_API_KEY, PROJECT = env.NEON_PROJECT_ID;
if (!KEY || !PROJECT) { console.error("NEON_API_KEY / NEON_PROJECT_ID missing in .env"); process.exit(1); }
const API = "https://console.neon.tech/api/v2";
async function neon(method, p, body) {
  const r = await fetch(API + p, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; }
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}
const redact = (s) => s.replace(/postgres(ql)?:\/\/[^\s'"]+/g, "postgres://<redacted>");
function run(name, cmd, args, extraEnv) {
  const r = spawnSync(cmd, args, { cwd: ROOT, env: { ...process.env, ...extraEnv }, encoding: "utf8", maxBuffer: 64 << 20 });
  const out = redact((r.stdout || "") + (r.stderr || ""));
  console.log(`\n## ${name} → exit ${r.status}\n` + out.split("\n").filter((l) => l.trim() && !/SSL modes|libpq|sslmode|trace-warnings|To prepare for this change|current behavior|libpq compatibility|postgresql.org\/docs/.test(l)).slice(-40).join("\n"));
  return r.status;
}
(async () => {
  const branches = (await neon("GET", `/projects/${PROJECT}/branches`)).branches;
  const parent = branches.find((b) => b.default) || branches.find((b) => b.primary);
  if (!parent) throw new Error("no default branch found");
  console.log(`project ${PROJECT} · parent (prod default) branch ${parent.name} ${parent.id} · existing branches ${branches.length}`);
  const name = `c6-rehearse-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
  const created = await neon("POST", `/projects/${PROJECT}/branches`, { branch: { parent_id: parent.id, name }, endpoints: [{ type: "read_write" }] });
  const br = created.branch; const ep = (created.endpoints || [])[0];
  console.log(`created branch ${br.name} ${br.id} · endpoint ${ep ? ep.id : "?"}`);
  let rc = 1;
  try {
    // wait until endpoint is active
    for (let i = 0; i < 30; i++) { const e = (await neon("GET", `/projects/${PROJECT}/endpoints/${ep.id}`)).endpoint; if (e.current_state === "active" || e.current_state === "idle") break; await new Promise((r) => setTimeout(r, 2000)); }
    const dbs = (await neon("GET", `/projects/${PROJECT}/branches/${br.id}/databases`)).databases;
    const roles = (await neon("GET", `/projects/${PROJECT}/branches/${br.id}/roles`)).roles;
    // use the migrate/app role (prod probe: current_user = neondb_owner on both URLs); "anonymous"/"authenticated" are passwordless
    const db = dbs.find((d) => d.name === "neondb") || dbs[0];
    const role = roles.find((r) => r.name === "neondb_owner") || roles.find((r) => /_owner$/.test(r.name)) || roles.find((r) => !r.protected && !/^(anonymous|authenticated|authenticator)$/.test(r.name)) || roles[0];
    console.log(`roles: ${roles.map((r) => r.name).join(", ")}`);
    console.log(`database ${db.name} · role ${role.name}`);
    const uri = (await neon("GET", `/projects/${PROJECT}/connection_uri?branch_id=${br.id}&database_name=${encodeURIComponent(db.name)}&role_name=${encodeURIComponent(role.name)}&pooled=false`)).uri;
    const child = { DATABASE_URL: uri, DIRECT_URL: uri };
    const before = run("migrate status BEFORE", "pnpm", ["exec", "prisma", "migrate", "status"], child);
    const t0 = Date.now();
    const dep = run("migrate deploy", "pnpm", ["exec", "prisma", "migrate", "deploy"], child);
    console.log(`\nmigrate deploy took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const after = run("migrate status AFTER", "pnpm", ["exec", "prisma", "migrate", "status"], child);
    const drift = run("drift", "pnpm", ["drift"], child);
    const probe = run("prod-probe on branch (N post-checks)", "node", ["scripts/pending/c6/prod-probe-c61.cjs", "--direct", "--url-from-env"], child);
    rc = dep === 0 && after === 0 && drift === 0 ? 0 : 1;
    console.log(`\nREHEARSAL ${rc === 0 ? "GREEN" : "RED"} (status-before ${before}, deploy ${dep}, status-after ${after}, drift ${drift}, probe ${probe})`);
  } finally {
    await neon("DELETE", `/projects/${PROJECT}/branches/${br.id}`);
    console.log(`deleted branch ${br.id}`);
  }
  process.exit(rc);
})().catch((e) => { console.error("ERR", redact(String(e.message || e))); process.exit(1); });
