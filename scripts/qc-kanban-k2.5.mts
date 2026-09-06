// QC — บอร์ดงาน WO K2.5: มุมมองที่บันทึกไว้ (KanbanBoardView PRIVATE/BOARD) — views.ts · ?savedView= · UI ตั้งค่าบอร์ด + dropdown ในหัวบอร์ด
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.5
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/views.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/views.ts)");
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
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
let boardId = "";
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const views = (await import("@/lib/modules/kanban/views" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const pook = await actorOf(E.users.staff.pook.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxP = { tenantId: tid, systemId: SYS, actorUserId: pook.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };
  boardId = E.boards.maint.id; // TENANT board: ทุกคนเห็น · pook = EDITOR? (seed) · owner = ADMIN

  // ═══ S1 schema ═══
  const cols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanBoardView'`)).map((c) => c.column_name);
  chk("K2.5-S1.1", "ตาราง KanbanBoardView: tenantId systemId boardId? ownerUserId? name scope config sortOrder", ["tenantId", "systemId", "boardId", "ownerUserId", "name", "scope", "config", "sortOrder"].every((c) => cols.includes(c)), "ครบ", cols.join(","));
  const enums = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='KanbanViewScope'`)).map((e) => e.enumlabel);
  chk("K2.5-S1.2", "enum KanbanViewScope = PRIVATE | BOARD", enums.includes("PRIVATE") && enums.includes("BOARD"), "2 ค่า", enums.join(","));

  // ═══ S2 service ═══
  const cfg = { view: "table", filters: { label: "ด่วน", due: "overdue" }, sort: "due", group: "column" };
  const v1 = await views.saveView(ctxP, pook, { boardId, name: "ด่วนเลยกำหนด (ของฉัน)", scope: "PRIVATE", config: cfg });
  chk("K2.5-S2.1", "saveView PRIVATE โดย EDITOR → row {id,name,scope PRIVATE,ownerUserId=pook,config}", v1?.scope === "PRIVATE" && v1.ownerUserId === pook.userId && v1.config?.filters?.label === "ด่วน", "PRIVATE", JSON.stringify(v1).slice(0, 160));
  const eB = await fails(() => views.saveView(ctxP, pook, { boardId, name: "ทีม", scope: "BOARD", config: cfg }));
  chk("K2.5-S2.2", "saveView scope BOARD โดย EDITOR → Forbidden (ต้อง ADMIN)", !!eB && /Forbidden|สิทธิ์|ผู้ดูแล/.test(`${eB.name} ${eB.message}`), "403", eB?.message?.slice(0, 60) ?? "ไม่ throw");
  const v2 = await views.saveView(ctxO, owner, { boardId, name: "งานทีม — เลยกำหนด", scope: "BOARD", config: { view: "board", filters: { due: "overdue" } } });
  chk("K2.5-S2.3", "saveView BOARD โดย ADMIN → ownerUserId null · scope BOARD", v2?.scope === "BOARD" && v2.ownerUserId === null, "BOARD", JSON.stringify(v2).slice(0, 120));
  const lp = await views.listViews(ctxP, pook, boardId);
  const lt = await views.listViews(ctxT, thana, boardId);
  chk("K2.5-S2.4", "listViews: pook เห็น 2 (ของตัวเอง + ทีม) · thana เห็น 1 (ทีมเท่านั้น ไม่เห็นส่วนตัวของ pook) · เรียง BOARD ก่อน PRIVATE", lp.length === 2 && lt.length === 1 && lt[0].scope === "BOARD" && lp[0].scope === "BOARD", "2/1", `${lp.length}/${lt.length} ${JSON.stringify(lp.map((v: Any) => v.scope))}`);
  const eU = await fails(() => views.updateView(ctxT, thana, v1.id, { name: "แฮ็ก" }));
  chk("K2.5-S2.5", "thana แก้มุมมองส่วนตัวของ pook → ไม่พบ/Forbidden", !!eU, "throw", "ไม่ throw");
  await views.updateView(ctxP, pook, v1.id, { name: "ด่วนเลยกำหนด v2", config: { ...cfg, sort: "updated" } });
  const v1b = await (prisma as Any).kanbanBoardView.findUnique({ where: { id: v1.id } });
  chk("K2.5-S2.6", "updateView โดยเจ้าของ → ชื่อ+config เปลี่ยน · config ผ่าน schema (zod) ตัดคีย์แปลกทิ้ง", v1b?.name === "ด่วนเลยกำหนด v2" && v1b?.config?.sort === "updated", "อัปเดต", JSON.stringify(v1b).slice(0, 160));
  const eBad = await fails(() => views.saveView(ctxP, pook, { boardId, name: "", scope: "PRIVATE", config: { view: "nope" } }));
  chk("K2.5-S2.7", "ชื่อว่าง / view ไม่รู้จัก → throw ไทย (validate config)", !!eBad && /[ก-๙]/.test(eBad.message), "throw ไทย", eBad?.message?.slice(0, 60) ?? "ไม่ throw", "MAJOR");
  const applied = await views.applyView(ctxP, pook, v1.id);
  chk("K2.5-S2.8", "applyView(ctx, actor, viewId) → { view, filters, sort, group, href:'?view=table&label=ด่วน&due=overdue&sort=updated&group=column&savedView=<id>' } (ตัวกรองถูกเขียนลง URL ตาม §2.3)", applied?.href?.includes("view=table") && applied.href.includes("label=") && applied.href.includes("due=overdue") && applied.href.includes(`savedView=${v1.id}`), "href ครบ", JSON.stringify(applied).slice(0, 200));
  const eDel = await fails(() => views.deleteView(ctxP, pook, v2.id));
  await views.deleteView(ctxO, owner, v2.id); await views.deleteView(ctxP, pook, v1.id);
  chk("K2.5-S2.9", "deleteView: EDITOR ลบมุมมองทีมไม่ได้ · ADMIN ลบได้ · เจ้าของลบส่วนตัวได้ → เหลือ 0", !!eDel && (await views.listViews(ctxP, pook, boardId)).length === 0, "0", String((await views.listViews(ctxP, pook, boardId)).length));
  const many = await fails(async () => { for (let i = 0; i < 21; i++) await views.saveView(ctxP, pook, { boardId, name: `v${i}`, scope: "PRIVATE", config: { view: "board" } }); });
  chk("K2.5-S2.10", "เพดาน 20 มุมมองต่อคนต่อบอร์ด (KANBAN_LIMITS.viewsPerBoard) → ใบที่ 21 throw ไทย", !!many && /[ก-๙]/.test(many.message), "throw ที่ 21", many?.message?.slice(0, 60) ?? "ไม่ throw", "MAJOR");
  await (prisma as Any).kanbanBoardView.deleteMany({ where: { boardId, ownerUserId: pook.userId } });

  // ═══ S3 UI/URL (static) ═══
  const page = read("src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx");
  const hdr = read("src/components/kanban/BoardHeader.tsx") + read("src/components/kanban/SavedViewsMenu.tsx");
  chk("K2.5-S3.1", "หน้าบอร์ดรองรับ ?savedView= (โหลด config แล้ว redirect/merge เป็นพารามิเตอร์จริง) · หัวบอร์ดมี dropdown 'มุมมองที่บันทึกไว้' testid saved-views + 'บันทึกมุมมองนี้'", /savedView/.test(page) && /saved-views/.test(hdr) && /บันทึกมุมมองนี้/.test(hdr), "ครบ", "ขาด");
  const settings = read("src/components/kanban/settings/SavedViewsSettings.tsx") + read("src/app/app/sys/[id]/kanban/settings/views/page.tsx");
  chk("K2.5-S3.2", "ตั้งค่าบอร์ด › มุมมองที่บันทึกไว้ (ภาพ 10): รายการ + ป้าย ทั้งทีม/ส่วนตัว + คำบรรยายเงื่อนไข ('ตาราง · กรอง: เลยกำหนด · เรียงตามวันที่') + แก้ชื่อ/ลบ · testid saved-views-settings", /saved-views-settings/.test(settings) && /ทั้งทีม/.test(settings) && /ส่วนตัว/.test(settings) && /กรอง/.test(settings), "ครบ", "ขาด", "MAJOR");
  const shots = existsSync(".qc-shots/kanban/2.5") ? readdirSync(".qc-shots/kanban/2.5").filter((f) => f.endsWith(".png")) : [];
  chk("K2.5-S3.3", "ภาพจริง ≥ 3 ใบ (dropdown มุมมอง · บันทึกมุมมอง · หน้าตั้งค่ามุมมอง)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try { if (boardId) await (prisma as Any).kanbanBoardView.deleteMany({ where: { boardId } }); } catch { /* */ }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.5 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
