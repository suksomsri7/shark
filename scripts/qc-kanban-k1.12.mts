// QC — บอร์ดงาน WO K1.12: เทมเพลต 6 ชุดธุรกิจไทย + สร้างบอร์ดจากเทมเพลต (atomic) + บันทึกเป็นเทมเพลตร้าน + หน้ารวมบอร์ดใหม่ (boardsHome)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.12 — ส่วนภาพ: visual-kanban.mts 1.12
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/templates.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/templates.ts)");
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
const q = async <T = Any,>(sql: string): Promise<T[]> => prisma.$queryRawUnsafe(sql) as Promise<T[]>;
const fails = async (f: () => Promise<unknown>): Promise<Any> => { try { await f(); return null; } catch (e) { return e; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
const created: string[] = []; let otherTid = "";
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const tpl = (await import("@/lib/modules/kanban/templates" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };

  // ═══ S1 schema + เทมเพลตแพลตฟอร์ม 6 ชุด ═══
  const cols = (await q<{ column_name: string; is_nullable: string }>(`select column_name, is_nullable from information_schema.columns where table_name='KanbanBoardTemplate'`));
  chk("K1.12-S1.1", "ตาราง KanbanBoardTemplate: tenantId nullable · scope · key · name · description · icon · structure", ["scope", "key", "name", "description", "icon", "structure"].every((c) => cols.some((r) => r.column_name === c)) && cols.some((r) => r.column_name === "tenantId" && r.is_nullable === "YES"), "ครบ", cols.map((c) => c.column_name).join(","));
  const list = await tpl.listTemplates(ctxO);
  const KEYS = ["dive-shop", "hotel", "restaurant", "clinic", "retail", "weekly"];
  const platform = (list ?? []).filter((t: Any) => t.scope === "PLATFORM");
  chk("K1.12-S1.2", "listTemplates → เทมเพลตแพลตฟอร์ม 6 ชุด key dive-shop/hotel/restaurant/clinic/retail/weekly ชื่อไทย + icon + คำอธิบาย", platform.length === 6 && KEYS.every((k) => platform.some((t: Any) => t.key === k && /[ก-๙]/.test(t.name) && typeof t.icon === "string" && /[ก-๙]/.test(t.description ?? ""))), "6 ชุด", platform.map((t: Any) => t.key).join(","));
  const structOk = platform.every((t: Any) => Array.isArray(t.structure?.columns) && t.structure.columns.length >= 3 && Array.isArray(t.structure?.labels) && t.structure.labels.length >= 2 && Array.isArray(t.structure?.cards) && t.structure.cards.length >= 3);
  chk("K1.12-S1.3", "structure ทุกชุด: columns ≥3 · labels ≥2 · cards ≥3 (บางใบมี checklist) · ทุกชุดมีคอลัมน์ done 1 ตัว", structOk && platform.every((t: Any) => t.structure.columns.filter((c: Any) => c.isDone).length === 1) && platform.some((t: Any) => t.structure.cards.some((c: Any) => Array.isArray(c.checklist) && c.checklist.length > 0)), "โครงครบ", JSON.stringify(platform.map((t: Any) => [t.key, t.structure?.columns?.length, t.structure?.cards?.length])));

  // ═══ S2 สร้างบอร์ดจากเทมเพลต (ทั้ง 6) ═══
  let allOk = true; const details: string[] = [];
  for (const k of KEYS) {
    const t = platform.find((x: Any) => x.key === k);
    const b = await tpl.createBoardFromTemplate(ctxO, owner, k, { name: `QC ${k}`, unitId: null, visibility: "PRIVATE" });
    created.push(b.id);
    const bc = await prisma.kanbanColumn.count({ where: { boardId: b.id, status: "ACTIVE" } });
    const bl = await P.kanbanLabel.count({ where: { boardId: b.id } });
    const cards = await prisma.kanbanCard.findMany({ where: { boardId: b.id, status: "ACTIVE" } }) as Any[];
    const bdone = await prisma.kanbanColumn.count({ where: { boardId: b.id, isDoneColumn: true } });
    const tplChecklists = t.structure.cards.reduce((n: number, c: Any) => n + (c.checklist?.length ? 1 : 0), 0);
    const bcl = await P.kanbanChecklist.count({ where: { card: { boardId: b.id } } });
    const ok = bc === t.structure.columns.length && bl === t.structure.labels.length && cards.length === t.structure.cards.length && bdone === 1 && cards.every((c) => c.sourceType === "TEMPLATE" && c.assigneeUserId === null && typeof c.cardNo === "number" && typeof c.position === "string") && bcl === tplChecklists && b.templateOfId === t.id;
    if (!ok) allOk = false;
    details.push(`${k}:${bc}/${t.structure.columns.length}c ${bl}/${t.structure.labels.length}l ${cards.length}/${t.structure.cards.length}k done=${bdone} cl=${bcl}/${tplChecklists}`);
  }
  chk("K1.12-S2.1", "สร้างจากทั้ง 6 → คอลัมน์/ป้าย/การ์ด/เช็คลิสต์ตรง structure · done column 1 · การ์ด sourceType TEMPLATE ไม่มี assignee · มี cardNo/position · templateOfId", allOk, "ตรง", details.join(" | "));
  const b0 = await prisma.kanbanBoard.findUnique({ where: { id: created[0]! } }) as Any;
  chk("K1.12-S2.2", "บอร์ดจากเทมเพลต: visibility ตามที่ขอ (PRIVATE) · createdById = owner · ผู้สร้างเป็น ADMIN ในตารางสมาชิก", b0.visibility === "PRIVATE" && b0.createdById === owner.userId && (await P.kanbanBoardMember.count({ where: { boardId: b0.id, userId: owner.userId, role: "ADMIN" } })) === 1, "ครบ", JSON.stringify({ v: b0.visibility, c: b0.createdById === owner.userId }));
  const eUnknown = await fails(() => tpl.createBoardFromTemplate(ctxO, owner, "not-a-template", {}));
  chk("K1.12-S2.3", "key ที่ไม่มี → error ไทย · ไม่มีบอร์ดเศษ", !!eUnknown && /[ก-๙]/.test(String(eUnknown?.message ?? eUnknown)) && (await prisma.kanbanBoard.count({ where: { tenantId: tid, name: { startsWith: "QC not-a" } } })) === 0, "error", String(eUnknown?.message ?? "").slice(0, 60), "MAJOR");
  const eNoPerm = await fails(() => tpl.createBoardFromTemplate(ctxT, { ...thana, permissions: {} }, "weekly", {}));
  chk("K1.12-S2.4", "คนไม่มี kanban.board.create → Forbidden · ไม่มีบอร์ดเศษ", !!eNoPerm && (await prisma.kanbanBoard.count({ where: { tenantId: tid, name: { contains: "QC weekly" } } })) === 1, "403", String(eNoPerm?.name ?? ""), "MAJOR");

  // ═══ S3 บันทึกบอร์ดเป็นเทมเพลตของร้าน ═══
  const saved = await tpl.saveBoardAsTemplate(ctxO, owner, E.boards.maint.id, { name: "ซ่อมบำรุงของร้านเรา", description: "จากบอร์ดจริง" });
  chk("K1.12-S3.1", "saveBoardAsTemplate → scope TENANT · tenantId = ร้าน · structure มีคอลัมน์ 4 + ป้ายของบอร์ด · ไม่คัดลอกการ์ดที่เก็บ/ผู้รับผิดชอบ", saved?.scope === "TENANT" && saved?.tenantId === tid && saved?.structure?.columns?.length === 4 && Array.isArray(saved.structure.labels) && saved.structure.cards.every((c: Any) => !c.assigneeUserId), "TENANT", JSON.stringify({ s: saved?.scope, c: saved?.structure?.columns?.length }));
  const list2 = await tpl.listTemplates(ctxO);
  chk("K1.12-S3.2", "listTemplates ของร้านเห็น 6 + 1 (ของร้านต่อท้าย)", list2.length === 7 && list2.some((t: Any) => t.id === saved.id), "7", String(list2?.length));
  const t2 = await prisma.tenant.create({ data: { name: "QC K1.12 อื่น", slug: `qc-k112-${Date.now()}` } }); otherTid = t2.id;
  const s2 = await (await import("@/lib/modules/system/service")).createSystem(t2.id, "KANBAN", "B");
  const listB = await tpl.listTemplates({ tenantId: t2.id, systemId: s2.id, actorUserId: owner.userId });
  chk("K1.12-S3.3", "ร้านอื่นเห็นเทมเพลตแพลตฟอร์ม 6 แต่ไม่เห็นของร้านเรา (tenant extension whitelist tenantId null)", listB.length === 6 && !listB.some((t: Any) => t.id === saved.id), "6", String(listB?.length));
  const fromSaved = await tpl.createBoardFromTemplate(ctxO, owner, saved.id, { name: "QC จากเทมเพลตร้าน" });
  created.push(fromSaved.id);
  chk("K1.12-S3.4", "สร้างจากเทมเพลตร้าน (อ้างด้วย id) ได้ 4 คอลัมน์", (await prisma.kanbanColumn.count({ where: { boardId: fromSaved.id, status: "ACTIVE" } })) === 4, "4", String(await prisma.kanbanColumn.count({ where: { boardId: fromSaved.id, status: "ACTIVE" } })), "MAJOR");
  await tpl.deleteTenantTemplate(ctxO, owner, saved.id);
  chk("K1.12-S3.5", "deleteTenantTemplate ลบได้ · ลบของแพลตฟอร์มไม่ได้", (await P.kanbanBoardTemplate.count({ where: { id: saved.id } })) === 0 && !!(await fails(() => tpl.deleteTenantTemplate(ctxO, owner, platform[0].id))), "ลบได้/ห้าม", "ผิด", "MAJOR");

  // ═══ S4 หน้ารวมบอร์ด (boardsHome) ═══
  await members.starBoard(ctxO, E.boards.maint.id);
  const home = await svc.boardsHome(ctxO, owner);
  chk("K1.12-S4.1", "boardsHome → {starred[], byUnit:[{unit{id,name},boards[]}], tenantWide[], templates[], totals{boards,openCards}} · starred มีบอร์ดซ่อม · byUnit มีป่าตอง/กะตะ · templates 6", Array.isArray(home?.starred) && home.starred.some((b: Any) => b.id === E.boards.maint.id) && Array.isArray(home?.byUnit) && home.byUnit.some((u: Any) => u.unit?.id === E.units.patong && u.boards.length >= 1) && Array.isArray(home?.tenantWide) && home.templates?.length === 6 && typeof home?.totals?.boards === "number", "โครงครบ", JSON.stringify({ s: home?.starred?.length, u: home?.byUnit?.length, tw: home?.tenantWide?.length, t: home?.templates?.length }));
  const card0 = home.starred[0];
  chk("K1.12-S4.2", "การ์ดบอร์ดใน home มี {id,name,color,unitId,visibility,cardCount,overdueCount,members[{userId,name}],updatedAt}", typeof card0?.cardCount === "number" && typeof card0?.overdueCount === "number" && Array.isArray(card0?.members) && typeof card0?.color === "string", "ฟิลด์ครบ", JSON.stringify(card0).slice(0, 160), "MAJOR");
  const homeT = await svc.boardsHome(ctxT, thana);
  chk("K1.12-S4.3", "boardsHome ของ thana: ไม่มีบอร์ด PRIVATE ที่ไม่ใช่สมาชิก (เห็นเฉพาะซ่อม + ไม่มีป่าตอง/กะตะ)", [...homeT.starred, ...homeT.tenantWide, ...homeT.byUnit.flatMap((u: Any) => u.boards)].every((b: Any) => b.id !== E.boards.patong.id && b.id !== E.boards.kata.id), "ไม่รั่ว", "รั่ว");
  await members.unstarBoard(ctxO, E.boards.maint.id);

  // ═══ S5 static UI ═══
  const page = read("src/app/app/sys/[id]/kanban/boards/page.tsx"); const comps = ["BoardsHome.tsx", "TemplatePicker.tsx", "CreateBoardModal.tsx"].map((f) => read(`src/components/kanban/${f}`)).join("\n");
  chk("K1.12-S5.1", "หน้ารวมบอร์ดใหม่: testid boards-starred · boards-by-unit · boards-tenant · templates-row · create-board · ปุ่ม 'สร้างบอร์ด' · ค้นหา (Ctrl K)", ["boards-starred", "boards-by-unit", "boards-tenant", "templates-row", "create-board"].every((t) => (page + comps).includes(`"${t}"`)) && /สร้างบอร์ด/.test(page + comps), "ครบ", ["boards-starred", "boards-by-unit", "boards-tenant", "templates-row", "create-board"].filter((t) => !(page + comps).includes(`"${t}"`)).join(",") || "ครบ");
  chk("K1.12-S5.2", "empty state 'ยังไม่มีบอร์ด — เริ่มจากเทมเพลตเร็วกว่าสร้างเอง' + ปุ่ม 2 ตัว", /ยังไม่มีบอร์ด/.test(page + comps) && /เทมเพลต/.test(page + comps), "มี", "ไม่มี", "MAJOR");
  chk("K1.12-S5.3", "actions: createBoardFromTemplateAction · saveBoardAsTemplateAction · deleteTenantTemplateAction · starBoardAction (export เฉพาะ *Action)", ["createBoardFromTemplateAction", "saveBoardAsTemplateAction", "deleteTenantTemplateAction", "starBoardAction"].every((a) => read("src/lib/modules/kanban/actions.ts").includes(`function ${a}`)), "ครบ", "ขาด", "MAJOR");

  // cleanup
  for (const id of created) { await P.kanbanChecklistItem.deleteMany({ where: { checklist: { card: { boardId: id } } } }).catch(() => {}); await P.kanbanChecklist.deleteMany({ where: { card: { boardId: id } } }).catch(() => {}); await P.kanbanCardLabel.deleteMany({ where: { card: { boardId: id } } }).catch(() => {}); await P.kanbanCardAssignee.deleteMany({ where: { card: { boardId: id } } }).catch(() => {}); await prisma.kanbanCard.deleteMany({ where: { boardId: id } }); await P.kanbanLabel.deleteMany({ where: { boardId: id } }); await P.kanbanBoardMember.deleteMany({ where: { boardId: id } }); await prisma.kanbanColumn.deleteMany({ where: { boardId: id } }); await prisma.kanbanBoard.deleteMany({ where: { id } }); }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  if (otherTid) { try { await P.appSystem.deleteMany({ where: { tenantId: otherTid } }); await prisma.tenant.delete({ where: { id: otherTid } }); } catch { /* */ } }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.12 — ส่วนภาพ: pnpm exec tsx scripts/visual-kanban.mts 1.12 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
