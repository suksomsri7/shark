// QC — HOTFIX 2026-10-01 item 4: mobile AI routes + DNA apply — same permission checks as the web doors
//   4a POST /api/mobile/chat/send            → ai.chat.send (web: lib/ai/actions.ts sendAiMessageAction)
//   4b /api/mobile/conversations GET/POST · [id] PATCH/DELETE · [id]/messages GET · [id]/read POST → ai.chat.send
//      (web has no rename/delete/list door; every web AI read — loadAiChatAction, loadPlans, listPendingProposals — needs ai.chat.send ⇒ floor)
//   4c POST /api/mobile/dna/apply · web dna/actions.ts applyStepAction/applyAction → systems.system.create (web: lib/actions/systems.ts addSystemAction)
//   Matrix: OWNER · MANAGER · STAFF without keys · STAFF with ai.chat.send · STAFF with systems.system.create — through the REAL route handlers
//   (Bearer token issued with the house helper, X-Tenant-Id header) · denied = 403 {error:"forbidden"} and NO side effect · positive controls.
// QC DATABASE ONLY (scripts/acc-v2-env.mts prod-host guard runs before the db import) · own tenant `qc-hsan-mob-<rand>` · cleans to 0.
// Run: env NODE_OPTIONS=--max-old-space-size=3584 bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-mobile-authz-hotfix.mts
// Note: ledger/wo-notes/hotfix-sanitize-2026-10-01.md §"Item 4"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
const auth = (await import("@/lib/mobile/auth" as string)) as { issueMobileToken: (u: string) => Promise<{ token: string }> };
const R = {
  send: (await import("../src/app/api/mobile/chat/send/route.ts" as string)) as Any,
  convs: (await import("../src/app/api/mobile/conversations/route.ts" as string)) as Any,
  conv: (await import("../src/app/api/mobile/conversations/[id]/route.ts" as string)) as Any,
  msgs: (await import("../src/app/api/mobile/conversations/[id]/messages/route.ts" as string)) as Any,
  read: (await import("../src/app/api/mobile/conversations/[id]/read/route.ts" as string)) as Any,
  dna: (await import("../src/app/api/mobile/dna/apply/route.ts" as string)) as Any,
};
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const P = prisma as Any;
const TAG = `qc-hsan-mob-${Math.random().toString(36).slice(2, 8)}`;
let tid = "";
const userIds: string[] = [];
try {
  const t = await P.tenant.create({ data: { name: TAG, slug: TAG } });
  tid = t.id;
  const mkUser = async (key: string, role: string, permissions: Record<string, boolean>) => {
    const u = await P.user.create({ data: { email: `${TAG}-${key}@qc.invalid`, name: key } });
    userIds.push(u.id);
    await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } });
    return (await auth.issueMobileToken(u.id)).token;
  };
  const tok = {
    owner: await mkUser("owner", "OWNER", {}),
    manager: await mkUser("manager", "MANAGER", {}),
    staff: await mkUser("staff", "STAFF", {}),
    staffAi: await mkUser("staffai", "STAFF", { "ai.chat.send": true }),
    staffSys: await mkUser("staffsys", "STAFF", { "systems.system.create": true }),
  };
  type Who = keyof typeof tok;
  const req = (who: Who, method: string, body?: unknown) =>
    new Request("http://qc.invalid/api/mobile/x", {
      method,
      headers: { authorization: `Bearer ${tok[who]}`, "x-tenant-id": tid, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const p = (id: string) => ({ params: Promise.resolve({ id }) });
  const drain = async (res: Response) => { try { await res.text(); } catch { /* stream closed */ } return res.status; };
  // denied = a 403 Response with {error:"forbidden"} · a thrown error or any other status = NOT denied
  const is403 = async (pr: Promise<Response>) => {
    let res: Response;
    try { res = await pr; } catch { return false; }
    const st = res.status; const b = st === 403 ? await res.json().catch(() => ({})) : (await drain(res), {});
    return st === 403 && (b as Any).error === "forbidden";
  };
  // ORACLE-EDIT C5.5-G2: an AI room is its creator's (a room written without a creator is the OWNER's only) — the room the
  //   STAFF+ai.chat.send positive controls below read/rename/delete is that STAFF's own room, opened through the real route
  const conv = { id: String(((await (await R.convs.POST(req("staffAi", "POST", { title: "QC ห้องเดิม" }))).json()) as Any).id) };
  await P.aiMessage.create({ data: { tenantId: tid, conversationId: conv.id, role: "USER", content: "ข้อความลับของร้าน" } });

  // ═══ 4a chat/send ═══ (empty text ⇒ the allowed path stops before any model call / credit)
  const sendNo = await is403(R.send.POST(req("staff", "POST", { text: "" })));
  const sendOk: Record<string, number> = {};
  for (const w of ["owner", "manager", "staffAi"] as Who[]) sendOk[w] = await drain(await R.send.POST(req(w, "POST", { text: "" })));
  const staffSysSend = await is403(R.send.POST(req("staffSys", "POST", { text: "" })));
  chk("MZ-4a.1", "chat/send: STAFF without ai.chat.send → 403 {error:forbidden} (also STAFF holding only systems.system.create)", sendNo && staffSysSend, "403", `staff=${sendNo} staffSys=${staffSysSend}`);
  chk("MZ-4a.2", "positive control: OWNER / MANAGER / STAFF+ai.chat.send → 200 stream", Object.values(sendOk).every((s) => s === 200), "200×3", JSON.stringify(sendOk));

  // ═══ 4b conversations ═══
  const listNo = await is403(R.convs.GET(req("staff", "GET")));
  const listOkRes = await R.convs.GET(req("staffAi", "GET"));
  const listOk = listOkRes.status === 200 && JSON.stringify(await listOkRes.json()).includes(conv.id);
  chk("MZ-4b.1", "GET conversations: STAFF no key → 403 · STAFF+ai.chat.send → 200 with the shop's room", listNo && listOk, "403 / 200", `no=${listNo} ok=${listOk}`);
  const before = await P.aiConversation.count({ where: { tenantId: tid } });
  const createNo = await is403(R.convs.POST(req("staff", "POST", { title: "x" })));
  const createdNo = (await P.aiConversation.count({ where: { tenantId: tid } })) === before;
  const createOk = (await R.convs.POST(req("manager", "POST", { title: "QC ใหม่" }))).status === 200;
  chk("MZ-4b.2", "POST conversations: STAFF no key → 403 and no row · MANAGER → 200", createNo && createdNo && createOk, "403+0 rows / 200", `no=${createNo} rows=${createdNo} ok=${createOk}`, "MAJOR");
  const msgNo = await is403(R.msgs.GET(req("staff", "GET"), p(conv.id)));
  const msgOkRes = await R.msgs.GET(req("staffAi", "GET"), p(conv.id));
  const msgOk = msgOkRes.status === 200 && JSON.stringify(await msgOkRes.json()).includes("ข้อความลับของร้าน");
  chk("MZ-4b.3", "GET [id]/messages: STAFF no key → 403 (no chat history) · STAFF+ai.chat.send → 200 with the message", msgNo && msgOk, "403 / 200", `no=${msgNo} ok=${msgOk}`);
  const renNo = await is403(R.conv.PATCH(req("staff", "PATCH", { title: "ถูกแก้" }), p(conv.id)));
  const titleKept = (await P.aiConversation.findUnique({ where: { id: conv.id } }))?.title === "QC ห้องเดิม";
  const renOk = (await R.conv.PATCH(req("staffAi", "PATCH", { title: "QC เปลี่ยนชื่อ" }), p(conv.id))).status === 200 && (await P.aiConversation.findUnique({ where: { id: conv.id } }))?.title === "QC เปลี่ยนชื่อ";
  chk("MZ-4b.4", "PATCH [id]: STAFF no key → 403, title unchanged · STAFF+ai.chat.send → renamed", renNo && titleKept && renOk, "403+kept / renamed", `no=${renNo} kept=${titleKept} ok=${renOk}`);
  const readNo = await is403(R.read.POST(req("staff", "POST"), p(conv.id)));
  const readKept = (await P.aiConversation.findUnique({ where: { id: conv.id } }))?.lastReadAt == null;
  chk("MZ-4b.5", "POST [id]/read: STAFF no key → 403, lastReadAt untouched", readNo && readKept, "403", `no=${readNo} kept=${readKept}`, "MAJOR");
  const delNo = await is403(R.conv.DELETE(req("staff", "DELETE"), p(conv.id)));
  const notDeleted = (await P.aiConversation.findUnique({ where: { id: conv.id } }))?.deletedAt == null;
  const delOk = (await R.conv.DELETE(req("staffAi", "DELETE"), p(conv.id))).status === 200 /* ORACLE-EDIT C5.5-G2: the room's creator deletes it */ && (await P.aiConversation.findUnique({ where: { id: conv.id } }))?.deletedAt != null;
  chk("MZ-4b.6", "DELETE [id]: STAFF no key → 403, room not deleted · its creator (STAFF+ai.chat.send) → soft-deleted", delNo && notDeleted && delOk, "403+kept / deleted", `no=${delNo} kept=${notDeleted} ok=${delOk}`);

  // ═══ 4c dna/apply ═══ (unknown blueprint ⇒ an allowed caller passes the gate and then fails on the blueprint, creating nothing)
  const sysBefore = await P.appSystem.count({ where: { tenantId: tid } }).catch(() => -1);
  const dnaNo = await is403(R.dna.POST(req("staff", "POST", { blueprintId: "qc-none" })));
  const dnaAiNo = await is403(R.dna.POST(req("staffAi", "POST", { blueprintId: "qc-none" })));
  const passed: Record<string, string> = {};
  for (const w of ["owner", "manager", "staffSys"] as Who[]) {
    try { const r = await R.dna.POST(req(w, "POST", { blueprintId: "qc-none" })); passed[w] = String(r.status); await drain(r); }
    catch (e) { passed[w] = `threw:${(e as Error).message.slice(0, 40)}`; }
  }
  const sysAfter = await P.appSystem.count({ where: { tenantId: tid } }).catch(() => -1);
  chk("MZ-4c.1", "dna/apply: STAFF without systems.system.create → 403 (also STAFF holding only ai.chat.send)", dnaNo && dnaAiNo, "403", `staff=${dnaNo} staffAi=${dnaAiNo}`);
  chk("MZ-4c.2", "positive control: OWNER / MANAGER / STAFF+systems.system.create pass the gate (not 403) · nothing created for an unknown blueprint",
    Object.values(passed).every((s) => s !== "403") && sysBefore === sysAfter, "not 403", JSON.stringify(passed));
  const dsrc = readFileSync("src/lib/dna/actions.ts", "utf8");
  const gated = (fn: string, call: string) => {
    const i = dsrc.indexOf(`export async function ${fn}`); const j = dsrc.indexOf("export async function", i + 10);
    const b = i < 0 ? "" : dsrc.slice(i, j < 0 ? undefined : j);
    const g = b.search(/systems\.system\.create/); const c = b.indexOf(`${call}(`);
    return g > 0 && c > g;
  };
  chk("MZ-4c.3", "web dna/actions.ts applyStepAction / applyAction check systems.system.create before applyBlueprintStep / applyBlueprint (static — server actions need a cookie session)",
    gated("applyStepAction", "applyBlueprintStep") && gated("applyAction", "applyBlueprint"), "both gated", `step=${gated("applyStepAction", "applyBlueprintStep")} all=${gated("applyAction", "applyBlueprint")}`);
} catch (e) {
  chk("CRASH", "finished", false, "finished", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tid) {
      await P.aiMessage.deleteMany({ where: { tenantId: tid } });
      await P.aiConversation.deleteMany({ where: { tenantId: tid } });
      await P.membership.deleteMany({ where: { tenantId: tid } });
    }
    if (userIds.length) {
      await P.session.deleteMany({ where: { userId: { in: userIds } } });
      await P.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (tid) await P.tenant.deleteMany({ where: { id: tid } });
    const left = (tid ? (await P.aiConversation.count({ where: { tenantId: tid } })) + (await P.membership.count({ where: { tenantId: tid } })) + (await P.tenant.count({ where: { id: tid } })) : 0)
      + (await P.user.count({ where: { email: { startsWith: TAG } } })) + (await P.session.count({ where: { userId: { in: userIds } } }));
    chk("MZ-CLEAN", "cleanup → 0 rows of this run left (rooms, memberships, sessions, users, tenant)", left === 0, "0", String(left), "MAJOR");
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 160)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC hotfix mobile authz =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
