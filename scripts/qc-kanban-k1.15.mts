// QC — บอร์ดงาน WO K1.15: REST API /api/v1/kanban/* + แกนกลาง src/lib/api + scope bundles + AI tools จากทะเบียน + คู่มือ/สกิล (D15/D18)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.15
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast · เรียก route handler ในโปรเซส (ไม่ต้องมี server)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/api/registry.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/api/registry.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
const keyIds: string[] = []; let otherTid = "";
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const reg = (await import("@/lib/modules/kanban/api/registry" as string)) as { KANBAN_OPS: Any[] };
  const ops = reg.KANBAN_OPS;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
  const route = (await import("@/app/api/v1/kanban/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;

  // ═══ S1 แกนกลางร่วม + ทะเบียน ═══
  chk("K1.15-S1.1", "มี src/lib/api/{op,respond,run,idempotency,require,dispatch,openapi}.ts และ account/api ใช้แกนกลาง (import จาก @/lib/api/) ไม่ก๊อป", ["op", "respond", "run", "idempotency", "require", "dispatch", "openapi"].every((f) => existsSync(`src/lib/api/${f}.ts`)) && /@\/lib\/api\//.test(read("src/lib/modules/account/api/dispatch.ts") + read("src/lib/modules/account/api/require.ts") + read("src/lib/modules/account/api/run.ts")), "แกนกลางเดียว", "ซ้ำ/ขาด");
  const ids = ops.map((o) => o.id); const paths = ops.map((o) => `${o.method} ${o.path}`);
  chk("K1.15-S1.2", "ทะเบียน ≥ 50 op · id/method+path ไม่ซ้ำ · ทุก op มี test · kind ∈ read/write/danger · action ขึ้นต้น kanban.", ops.length >= 50 && new Set(ids).size === ids.length && new Set(paths).size === paths.length && ops.every((o) => typeof o.test === "string" && ["read", "write", "danger"].includes(o.kind) && /^kanban\./.test(o.action)), "≥50 ไม่ซ้ำ", `${ops.length} uniqIds=${new Set(ids).size} uniqPaths=${new Set(paths).size}`);
  const must = ["ping", "boards.list", "boards.get", "boards.create", "boards.update", "boards.archive", "boards.members.add", "columns.create", "columns.move", "cards.list", "cards.get", "cards.create", "cards.update", "cards.move", "cards.archive", "cards.assignees.set", "cards.labels.set", "labels.create", "checklists.create", "checklist-items.update", "comments.create", "attachments.create", "search", "my-tasks", "templates.list"];
  chk("K1.15-S1.3", "op หลักครบ 25 ตัว", must.every((m) => ids.includes(m)), "ครบ", must.filter((m) => !ids.includes(m)).join(",") || "ครบ");
  chk("K1.15-S1.4", "danger ops: boards.archive · boards.members.remove · cards.archive · columns.archive", ["boards.archive", "boards.members.remove", "cards.archive"].every((m) => ops.find((o) => o.id === m)?.kind === "danger"), "danger", ops.filter((o) => o.kind === "danger").map((o) => o.id).join(","), "MAJOR");
  const bundles = scopes.API_SCOPE_BUNDLES as { id: string; scopes: string[] }[];
  chk("K1.15-S1.5", "bundle kanban-read / kanban-edit / kanban-admin ใน scopes.ts · kanban-admin ครอบ kanban.board.member.manage", ["kanban-read", "kanban-edit", "kanban-admin"].every((b) => bundles.some((x) => x.id === b)) && bundles.find((x) => x.id === "kanban-admin")!.scopes.includes("kanban.board.member.manage") && bundles.find((x) => x.id === "kanban-read")!.scopes.length <= 2, "3 bundle", bundles.map((b) => b.id).join(","));

  // ═══ S2 ยิงจริงผ่าน route handler ═══
  const mkKey = async (bundle: string, tenantId = tid, systemId = SYS) => { const k = await ak.createApiKey({ tenantId }, `QC K1.15 ${bundle}`, { scopes: scopes.expandBundles([bundle]), systemId }); keyIds.push(k.id); return k.rawKey as string; };
  const kEdit = await mkKey("kanban-edit"); const kRead = await mkKey("kanban-read"); const kAdmin = await mkKey("kanban-admin");
  const call = async (method: string, path: string, key: string, body?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `k115-${Date.now()}-${Math.random().toString(16).slice(2)}` }), ...extra };
    let b: string | undefined; if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const res = await route[method]!(new Request(`http://x/api/v1/kanban${path}`, { method, headers, body: b }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
    const text = await res.text(); let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed, headers: res.headers };
  };
  const ping = await call("GET", "/ping", kEdit);
  chk("K1.15-S2.1", "GET /ping → 200 {ok, systemId, keyName} + requestId + X-RateLimit-Remaining", ping.status === 200 && ping.body?.data?.ok === true && ping.body?.data?.systemId === SYS && typeof ping.body?.requestId === "string" && !!ping.headers.get("x-ratelimit-remaining"), "200", `${ping.status} ${JSON.stringify(ping.body).slice(0, 120)}`);
  const noKey = await route.GET!(new Request("http://x/api/v1/kanban/ping"), { params: Promise.resolve({ path: ["ping"] }) });
  chk("K1.15-S2.2", "ไม่มีคีย์ → 401 unauthorized", noKey.status === 401, "401", String(noKey.status));
  const bl = await call("GET", "/boards", kEdit);
  chk("K1.15-S2.3", "GET /boards (คีย์ผูก system) → 3 บอร์ด (D18: คีย์เห็นทุกบอร์ดของ system) · แถวมี {id,name,visibility,unitId,color,cardCount}", bl.status === 200 && Array.isArray(bl.body?.data) && bl.body.data.length >= 3 && bl.body.data.every((b: Any) => typeof b.cardCount === "number" && typeof b.visibility === "string"), "3", `${bl.status} n=${bl.body?.data?.length}`);
  const bg = await call("GET", `/boards/${E.boards.kata.id}`, kRead);
  chk("K1.15-S2.4", "GET /boards/{kata} ด้วยคีย์ read → 200 (คีย์เห็น PRIVATE ของ system) · มี columns[].cards[] · role VIEWER", bg.status === 200 && Array.isArray(bg.body?.data?.columns) && bg.body.data.role === "VIEWER", "200 VIEWER", `${bg.status} role=${bg.body?.data?.role}`);
  const patongCol = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const idem = `k115-idem-${Date.now()}`;
  const c1 = await call("POST", `/boards/${E.boards.patong.id}/cards`, kEdit, { columnId: patongCol.id, title: "การ์ดจาก API", labels: [], dueAt: null }, { "idempotency-key": idem });
  const c1b = await call("POST", `/boards/${E.boards.patong.id}/cards`, kEdit, { columnId: patongCol.id, title: "การ์ดจาก API", labels: [], dueAt: null }, { "idempotency-key": idem });
  chk("K1.15-S2.5", "POST cards.create → 200 {id,cardNo,position} · ส่งซ้ำ Idempotency-Key เดิม → ตอบเดิม + Idempotent-Replayed · การ์ดใน DB 1 ใบ", c1.status === 200 && typeof c1.body?.data?.cardNo === "number" && c1b.status === 200 && c1b.headers.get("idempotent-replayed") === "true" && c1b.body?.data?.id === c1.body?.data?.id && (await prisma.kanbanCard.count({ where: { boardId: E.boards.patong.id, title: "การ์ดจาก API" } })) === 1, "200 + replay", `${c1.status}/${c1b.status} replay=${c1b.headers.get("idempotent-replayed")}`);
  const cardId = c1.body?.data?.id as string;
  const noIdem = await route.POST!(new Request(`http://x/api/v1/kanban/boards/${E.boards.patong.id}/cards`, { method: "POST", headers: { authorization: `Bearer ${kEdit}`, "content-type": "application/json" }, body: JSON.stringify({ columnId: patongCol.id, title: "x" }) }), { params: Promise.resolve({ path: ["boards", E.boards.patong.id, "cards"] }) });
  chk("K1.15-S2.6", "write ไม่มี Idempotency-Key → 400 idempotency_required", noIdem.status === 400, "400", String(noIdem.status));
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: E.boards.patong.id, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const mv = await call("POST", `/cards/${cardId}/move`, kEdit, { toColumnId: cols[2]!.id });
  chk("K1.15-S2.7", "POST cards.move → 200 {ok:true, position, placedAt}", mv.status === 200 && mv.body?.data?.ok === true && typeof mv.body?.data?.position === "string", "200 ok", `${mv.status} ${JSON.stringify(mv.body?.data).slice(0, 80)}`);
  const upd = await call("PATCH", `/cards/${cardId}`, kEdit, { title: "การ์ดจาก API (แก้)", dueAt: "2026-10-05T10:00:00.000Z" });
  chk("K1.15-S2.8", "PATCH cards.update → 200 ชื่อ/กำหนดส่งเปลี่ยน", upd.status === 200 && upd.body?.data?.title === "การ์ดจาก API (แก้)" && !!upd.body?.data?.dueAt, "200", `${upd.status}`, "MAJOR");
  const roWrite = await call("POST", `/boards/${E.boards.patong.id}/cards`, kRead, { columnId: patongCol.id, title: "x" });
  chk("K1.15-S2.9", "คีย์ kanban-read เขียน → 403 scope_missing + hint", roWrite.status === 403 && roWrite.body?.error?.code === "scope_missing" && typeof roWrite.body?.error?.hint === "string", "403", `${roWrite.status} ${roWrite.body?.error?.code}`);
  const t2 = await prisma.tenant.create({ data: { name: "QC K1.15 อื่น", slug: `qc-k115-${Date.now()}` } }); otherTid = t2.id;
  const s2 = await (await import("@/lib/modules/system/service")).createSystem(t2.id, "KANBAN", "B");
  const kOther = await mkKey("kanban-admin", t2.id, s2.id);
  const cross = await call("GET", `/boards/${E.boards.patong.id}`, kOther);
  const crossMove = await call("POST", `/cards/${cardId}/move`, kOther, { toColumnId: cols[0]!.id });
  chk("K1.15-S2.10", "คีย์ร้านอื่นดู/ย้ายการ์ดของเรา → 404 not_found (ไม่ leak)", cross.status === 404 && crossMove.status === 404, "404/404", `${cross.status}/${crossMove.status}`);
  const del0 = await call("DELETE", `/cards/${cardId}`, kEdit, { reason: "ทดสอบ" });
  chk("K1.15-S2.11", "danger cards.archive ไม่มี confirm:true → 409 confirm_required", del0.status === 409 && del0.body?.error?.code === "confirm_required", "409", `${del0.status} ${del0.body?.error?.code}`);
  const del1 = await call("DELETE", `/cards/${cardId}`, kEdit, { confirm: true, reason: "ทดสอบ archive ผ่าน API" });
  chk("K1.15-S2.12", "danger + confirm:true + reason → 200 · การ์ด ARCHIVED · AuditLog actorType API_KEY", del1.status === 200 && ((await prisma.kanbanCard.findUnique({ where: { id: cardId } })) as Any).status === "ARCHIVED" && (await prisma.auditLog.count({ where: { tenantId: tid, actorType: "API_KEY", action: { contains: "cards.archive" } } })) >= 1, "200 ARCHIVED", `${del1.status}`);
  const badBody = await call("POST", `/boards/${E.boards.patong.id}/cards`, kEdit, { columnId: patongCol.id, title: "", extra: 1 });
  chk("K1.15-S2.13", "body ผิด schema (title ว่าง · ฟิลด์เกิน) → 422 validation + details[]", badBody.status === 422 && badBody.body?.error?.code === "validation" && Array.isArray(badBody.body?.error?.details), "422", `${badBody.status}`, "MAJOR");
  const sr = await call("GET", `/search?q=${encodeURIComponent("Sea Fox")}`, kRead);
  chk("K1.15-S2.14", "GET /search?q=Sea Fox → 3 (คีย์เห็นทุกบอร์ด)", sr.status === 200 && sr.body?.data?.length === 3, "3", `${sr.status} ${sr.body?.data?.length}`);
  const memAdd = await call("POST", `/boards/${E.boards.maint.id}/members`, kEdit, { userId: E.users.staff.thana.userId, role: "EDITOR" });
  const memAdd2 = await call("POST", `/boards/${E.boards.maint.id}/members`, kAdmin, { userId: E.users.staff.thana.userId, role: "EDITOR" });
  chk("K1.15-S2.15", "members.add ด้วยคีย์ edit → 403 (ต้อง member.manage) · คีย์ admin → 200", memAdd.status === 403 && memAdd2.status === 200, "403/200", `${memAdd.status}/${memAdd2.status}`);
  await P.kanbanBoardMember.deleteMany({ where: { boardId: E.boards.maint.id, userId: E.users.staff.thana.userId } });
  const csv = await call("GET", `/boards/${E.boards.patong.id}/cards`, kRead, undefined, { accept: "text/csv" });
  chk("K1.15-S2.16", "cards.list รองรับ Accept: text/csv (BOM + header)", csv.status === 200 && typeof csv.body?._raw === "string" && csv.body._raw.charCodeAt(0) === 0xfeff, "csv", `${csv.status} ${String(csv.body?._raw ?? JSON.stringify(csv.body)).slice(0, 40)}`, "MAJOR");

  // ═══ S3 openapi + docs + developers + skill ═══
  const oa = (await import("@/app/api/v1/kanban/openapi.json/route" as string)) as { GET: (r: Request) => Promise<Response> };
  const spec = await (await oa.GET(new Request("http://x/api/v1/kanban/openapi.json"))).json();
  const specOps = Object.values(spec.paths ?? {}).reduce((n: number, v: Any) => n + Object.keys(v).length, 0);
  chk("K1.15-S3.1", "GET /api/v1/kanban/openapi.json (ไม่ต้องมีคีย์) = จำนวน op ในทะเบียน", specOps === ops.length && spec.info?.title, "= ทะเบียน", `${specOps}/${ops.length}`);
  const { spawnSync } = await import("node:child_process");
  const gen = spawnSync("pnpm", ["exec", "tsx", "scripts/gen-kanban-api-docs.mts", "--check"], { encoding: "utf8" });
  chk("K1.15-S3.2", "gen-kanban-api-docs --check ผ่าน (docs/api/KANBAN-API.md + skill endpoints.md ไม่ stale)", gen.status === 0 && existsSync("docs/api/KANBAN-API.md"), "exit 0", `${gen.status} ${(gen.stdout + gen.stderr).slice(-120)}`);
  const md = read("docs/api/KANBAN-API.md");
  chk("K1.15-S3.3", "KANBAN-API.md มี Webhooks (kanban.card.moved …) + AI agents + Idempotency-Key + confirm", /kanban\.card\.moved/.test(md) && /AI agents/i.test(md) && /Idempotency-Key/.test(md) && /confirm/.test(md), "ครบ", "ขาด", "MAJOR");
  const skill = read(".claude/skills/shark-kanban-api/SKILL.md");
  chk("K1.15-S3.4", "สกิล shark-kanban-api: SKILL.md (EN · https://shark.in.th/api/v1/kanban · Bearer · X-Shark-System · Idempotency-Key) + references/endpoints.md ครบทุก op + recipes ≥6 curl + copy ไป /root/.claude/skills", /name:\s*shark-kanban-api/.test(skill) && /https:\/\/shark\.in\.th\/api\/v1\/kanban/.test(skill) && /Idempotency-Key/.test(skill) && ops.every((o) => read(".claude/skills/shark-kanban-api/references/endpoints.md").includes(`${o.method} ${o.path}`)) && (read(".claude/skills/shark-kanban-api/references/recipes.md").match(/curl /g) ?? []).length >= 6 && read("/root/.claude/skills/shark-kanban-api/SKILL.md") === skill, "ครบ", "ขาด");
  const devPage = read("src/app/developers/kanban/page.tsx");
  const mdRoute = (await import("@/app/developers/kanban.md/route" as string).catch(() => null)) as { GET: (r: Request) => Promise<Response> } | null;
  const mdText = mdRoute ? await (await mdRoute.GET(new Request("http://x/developers/kanban.md"))).text() : "";
  chk("K1.15-S3.5", "หน้า /developers/kanban (render จาก buildOpenApi) + /developers/kanban.md = docs เป๊ะ + ลิงก์จาก /developers", /buildOpenApi|KANBAN_OPS/.test(devPage) && mdText === md && /developers\/kanban/.test(read("src/app/developers/page.tsx")), "ครบ", `page=${!!devPage} md=${mdText.length}/${md.length}`);
  const labels = (await import("@/lib/webhooks/labels")).WEBHOOK_EVENTS as { value: string }[];
  chk("K1.15-S3.6", "WEBHOOK_EVENTS มี kanban.* ≥ 9 (created/moved/assigned/completed/due_soon/overdue/checklist.completed/comment.added/archived)", labels.filter((e) => e.value.startsWith("kanban.")).length >= 9, "≥9", labels.filter((e) => e.value.startsWith("kanban.")).map((e) => e.value).join(","), "MAJOR");

  // ═══ S4 AI tools จากทะเบียน ═══
  const skills = (await import("@/lib/ai/skills" as string)) as { SKILLS: { id: string; tools: string[] }[]; toolRegistry?: () => { name: string }[] };
  const tasks = skills.SKILLS.find((s) => s.id === "tasks");
  const kbTools = (tasks?.tools ?? []).filter((t) => t.startsWith("kanban_"));
  chk("K1.15-S4.1", "สกิล tasks มี kanban_* ≥ 15 (generate จากทะเบียน) และคงชื่อเดิม kanban_my_tasks/kanban_create_board/kanban_create_card", kbTools.length >= 15 && ["kanban_my_tasks", "kanban_create_board", "kanban_create_card"].every((t) => kbTools.includes(t)), "≥15", `${kbTools.length}: ${kbTools.slice(0, 6).join(",")}…`);
  chk("K1.15-S4.2", "ทุก op ที่มี tool ⇒ tool.name อยู่ในสกิล และ danger ops มี risk DESTRUCTIVE", ops.filter((o) => o.tool).every((o) => kbTools.includes(o.tool.name)) && ops.filter((o) => o.tool && o.kind === "danger").every((o) => o.tool.risk === "DESTRUCTIVE"), "ตรง", ops.filter((o) => o.tool && !kbTools.includes(o.tool.name)).map((o) => o.id).join(",") || "ตรง");
  const tk = read("src/lib/ai/tools-kanban.ts");
  chk("K1.15-S4.3", "tools-kanban.ts generate จาก KANBAN_OPS.filter(o => o.tool) · read รันทันที · write = proposal (pendingConfirmation)", /KANBAN_OPS/.test(tk) && /pendingConfirmation|createProposal/.test(tk), "generate", "ไม่พบ", "MAJOR");

  // cleanup
  await P.kanbanBoardMember.deleteMany({ where: { boardId: E.boards.maint.id, userId: E.users.staff.thana.userId } });
  await prisma.kanbanCard.deleteMany({ where: { boardId: E.boards.patong.id, title: { startsWith: "การ์ดจาก API" } } });
  await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${E.boards.patong.id}'`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try { await prisma.apiKey.deleteMany({ where: { id: { in: keyIds } } }); await prisma.apiIdempotency.deleteMany({ where: { idemKey: { startsWith: "k115-" } } }).catch(() => {}); await prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'kb:api:%' OR key LIKE 'kanban:api:%'`); } catch { /* */ }
  if (otherTid) { try { await P.apiKey.deleteMany({ where: { tenantId: otherTid } }); await P.appSystem.deleteMany({ where: { tenantId: otherTid } }); await prisma.tenant.delete({ where: { id: otherTid } }); } catch { /* */ } }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.15 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
