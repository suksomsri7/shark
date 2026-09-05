// QC — บอร์ดงาน WO K1.3: สมาชิกบอร์ด/ดาว + สิทธิ์ 2 ชั้น (boardRole) + คีย์สิทธิ์ใหม่ + 404 + AuditLog
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.3
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/access.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/access.ts)");
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
const P = prisma as Any;
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const access = (await import("@/lib/modules/kanban/access" as string)) as Record<string, (...a: Any[]) => Any>;
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const perms = (await import("@/lib/core/permissions" as string)) as Record<string, Any>;

  // actor = membership ของแต่ละคน (โหลดจาก DB จริง)
  const actorOf = async (userId: string) => {
    const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!;
    return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> };
  };
  const owner = await actorOf(E.users.owner.userId); const manager = await actorOf(E.users.manager.userId);
  const thana = await actorOf(E.users.staff.thana.userId); const pook = await actorOf(E.users.staff.pook.userId); const noPerm = await actorOf(E.users.noPerm.userId);
  const ctxOf = (a: Any) => ({ tenantId: tid, systemId: SYS, actorUserId: a.userId });
  const bPatong = (await prisma.kanbanBoard.findUnique({ where: { id: E.boards.patong.id } })) as Any;
  const bMaint = (await prisma.kanbanBoard.findUnique({ where: { id: E.boards.maint.id } })) as Any;
  const bKata = (await prisma.kanbanBoard.findUnique({ where: { id: E.boards.kata.id } })) as Any;
  // ให้แน่ใจว่า visibility ตามเฉลย (seed ก่อน K1.1 อาจถูก backfill เป็น TENANT)
  await prisma.kanbanBoard.update({ where: { id: bPatong.id }, data: { visibility: "PRIVATE", unitId: E.units.patong } });
  await prisma.kanbanBoard.update({ where: { id: bMaint.id }, data: { visibility: "TENANT", unitId: null } });
  await prisma.kanbanBoard.update({ where: { id: bKata.id }, data: { visibility: "PRIVATE", unitId: E.units.kata } });
  const fresh = async (id: string) => (await prisma.kanbanBoard.findUnique({ where: { id } })) as Any;

  // ═══ S1 schema + permission keys ═══
  const tables = (await q<{ table_name: string }>(`select table_name from information_schema.tables where table_name in ('KanbanBoardMember','KanbanBoardStar')`)).map((r) => r.table_name);
  chk("K1.3-S1.1", "ตาราง KanbanBoardMember · KanbanBoardStar", tables.length === 2, "2", tables.join(","));
  const en = await q<{ labels: string }>(`select string_agg(e.enumlabel, ',' order by e.enumsortorder) labels from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typname='KanbanBoardRole'`);
  chk("K1.3-S1.2", "enum KanbanBoardRole VIEWER,EDITOR,ADMIN", en[0]?.labels === "VIEWER,EDITOR,ADMIN", "VIEWER,EDITOR,ADMIN", String(en[0]?.labels));
  const idx = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='KanbanBoardMember'`);
  chk("K1.3-S1.3", "unique(boardId,userId) บนสมาชิก", idx.some((i) => /UNIQUE/.test(i.indexdef) && /"boardId", "userId"/.test(i.indexdef)), "unique", idx.map((i) => i.indexdef.replace(/.*USING btree /, "")).join("|"), "MAJOR");
  const keysNeeded = ["kanban.board.read", "kanban.card.comment", "kanban.card.attach", "kanban.board.member.manage", "kanban.label.manage", "kanban.automation.manage", "kanban.report.view", "kanban.template.manage"];
  const permSrc = readFileSync("src/lib/core/permissions.ts", "utf8");
  chk("K1.3-S1.4", "permissions.ts มีคีย์ใหม่ 8 ตัวพร้อมป้ายไทย", keysNeeded.every((k) => new RegExp(`"${k.replace(/\./g, "\\.")}":\\s*"[ก-๙]`).test(permSrc)), "8 คีย์", keysNeeded.filter((k) => !new RegExp(`"${k.replace(/\./g, "\\.")}"`).test(permSrc)).join(",") || "ครบ");
  chk("K1.3-S1.5", "isPermissionKey ของทะเบียนกลางรู้จักคีย์ใหม่", typeof perms.isPermissionKey !== "function" || keysNeeded.every((k) => perms.isPermissionKey(k)), "รู้จัก", "ไม่รู้จัก", "MAJOR");

  // ═══ S2 boardRole (ชั้น 2) ═══
  chk("K1.3-S2.1", "OWNER → ADMIN ทุกบอร์ด (ไม่ต้องเชิญ)", access.boardRole(owner, await fresh(bPatong.id)) === "ADMIN" && access.boardRole(owner, await fresh(bKata.id)) === "ADMIN" && access.boardRole(owner, await fresh(bMaint.id)) === "ADMIN", "ADMIN×3", `${access.boardRole(owner, await fresh(bPatong.id))}`);
  chk("K1.3-S2.2", "MANAGER สาขาป่าตอง → EDITOR บอร์ดป่าตอง (unit ตรง) · VIEWER บอร์ด TENANT · null บอร์ดลับกะตะ (PRIVATE unit อื่น)", access.boardRole(manager, await fresh(bPatong.id)) === "EDITOR" && access.boardRole(manager, await fresh(bMaint.id)) === "VIEWER" && access.boardRole(manager, await fresh(bKata.id)) === null, "EDITOR/VIEWER/null", `${access.boardRole(manager, await fresh(bPatong.id))}/${access.boardRole(manager, await fresh(bMaint.id))}/${access.boardRole(manager, await fresh(bKata.id))}`);
  chk("K1.3-S2.3", "STAFF ไม่ใช่สมาชิก → PRIVATE = null · TENANT = VIEWER", access.boardRole(thana, await fresh(bPatong.id)) === null && access.boardRole(thana, await fresh(bMaint.id)) === "VIEWER", "null/VIEWER", `${access.boardRole(thana, await fresh(bPatong.id))}/${access.boardRole(thana, await fresh(bMaint.id))}`);
  chk("K1.3-S2.4", "STAFF ไม่มีคีย์ kanban.* เลย → null ทุกบอร์ด (แม้ TENANT)", access.boardRole(noPerm, await fresh(bMaint.id)) === null && access.boardRole(noPerm, await fresh(bPatong.id)) === null, "null", `${access.boardRole(noPerm, await fresh(bMaint.id))}`);
  chk("K1.3-S2.5", "STAFF ที่มีคีย์ kanban.* อื่น (ไม่มี board.read ตรง ๆ) ยังอ่านได้ — implied (backward compat ผู้ใช้เดิม)", access.boardRole(thana, await fresh(bMaint.id)) === "VIEWER" && !("kanban.board.read" in thana.permissions), "VIEWER", String(access.boardRole(thana, await fresh(bMaint.id))));
  const visOwner = await prisma.kanbanBoard.findMany({ where: { AND: [{ tenantId: tid, systemId: SYS, status: "ACTIVE" }, access.visibleBoardsWhere(owner)] } });
  const visManager = await prisma.kanbanBoard.findMany({ where: { AND: [{ tenantId: tid, systemId: SYS, status: "ACTIVE" }, access.visibleBoardsWhere(manager)] } });
  const visThana = await prisma.kanbanBoard.findMany({ where: { AND: [{ tenantId: tid, systemId: SYS, status: "ACTIVE" }, access.visibleBoardsWhere(thana)] } });
  const visNo = await prisma.kanbanBoard.findMany({ where: { AND: [{ tenantId: tid, systemId: SYS, status: "ACTIVE" }, access.visibleBoardsWhere(noPerm)] } });
  chk("K1.3-S2.6", "visibleBoardsWhere: owner 3 · manager 2 (ป่าตอง+ซ่อม) · thana 1 (ซ่อม) · noPerm 0", visOwner.length === 3 && visManager.length === 2 && !visManager.some((b) => b.id === bKata.id) && visThana.length === 1 && visThana[0]!.id === bMaint.id && visNo.length === 0, "3/2/1/0", `${visOwner.length}/${visManager.length}/${visThana.length}/${visNo.length}`);

  // ═══ S3 สมาชิก ═══
  const added = await members.addMember(ctxOf(owner), bPatong.id, thana.userId, "EDITOR");
  chk("K1.3-S3.1", "OWNER เพิ่ม thana เป็น EDITOR → แถวสมาชิก + boardRole = EDITOR", !!added && access.boardRole(thana, await fresh(bPatong.id), [{ userId: thana.userId, role: "EDITOR" }]) === "EDITOR" || (await P.kanbanBoardMember.count({ where: { boardId: bPatong.id, userId: thana.userId, role: "EDITOR" } })) === 1, "EDITOR", "ไม่ใช่");
  const roleAsync = await members.boardRoleOf(ctxOf(thana), bPatong.id).catch(() => "ERR");
  chk("K1.3-S3.2", "members.boardRoleOf (โหลดสมาชิกจาก DB) ของ thana = EDITOR", roleAsync === "EDITOR", "EDITOR", String(roleAsync));
  const eNotMember = await fails(() => members.addMember(ctxOf(owner), bPatong.id, "user_not_in_tenant", "VIEWER"));
  chk("K1.3-S3.3", "เพิ่มคนที่ไม่ใช่ membership ของร้าน → error ไทย", !!eNotMember && /[ก-๙]/.test(String(eNotMember?.message ?? eNotMember)), "error", String(eNotMember?.message ?? eNotMember).slice(0, 80));
  const eByEditor = await fails(() => members.addMember(ctxOf(thana), bPatong.id, pook.userId, "VIEWER"));
  chk("K1.3-S3.4", "EDITOR เชิญคนไม่ได้ (ต้อง ADMIN) → error สิทธิ์ · ไม่มีแถว", !!eByEditor && (await P.kanbanBoardMember.count({ where: { boardId: bPatong.id, userId: pook.userId } })) === 0, "ปฏิเสธ", String(eByEditor?.message ?? eByEditor).slice(0, 80));
  const eInvisible = await fails(() => members.addMember(ctxOf(thana), bKata.id, pook.userId, "VIEWER"));
  chk("K1.3-S3.5", "แตะบอร์ดที่มองไม่เห็น (กะตะ) → error ชนิด 'ไม่พบ' (404 ไม่ใช่ 403 — ไม่ leak ว่ามีบอร์ด)", !!eInvisible && (eInvisible?.name === "KanbanNotFoundError" || eInvisible?.status === 404 || /ไม่พบ/.test(String(eInvisible?.message ?? eInvisible))), "ไม่พบ", `${eInvisible?.name} ${String(eInvisible?.message ?? "").slice(0, 60)}`);
  await members.addMember(ctxOf(owner), bPatong.id, pook.userId, "ADMIN");
  await members.setMemberRole(ctxOf(pook), bPatong.id, thana.userId, "VIEWER");
  chk("K1.3-S3.6", "ADMIN (pook) เปลี่ยนบทบาท thana → VIEWER", (await P.kanbanBoardMember.findFirst({ where: { boardId: bPatong.id, userId: thana.userId } }))?.role === "VIEWER", "VIEWER", "ไม่ใช่");
  const eLastAdmin = await fails(() => members.removeMember(ctxOf(pook), bPatong.id, pook.userId));
  chk("K1.3-S3.7", "ถอด ADMIN ที่ประกาศคนสุดท้ายออก → error ไทย (ต้องตั้ง ADMIN ใหม่ก่อน)", !!eLastAdmin && /[ก-๙]/.test(String(eLastAdmin?.message ?? eLastAdmin)) && (await P.kanbanBoardMember.count({ where: { boardId: bPatong.id, userId: pook.userId } })) === 1, "error", String(eLastAdmin?.message ?? eLastAdmin).slice(0, 80));
  await members.removeMember(ctxOf(owner), bPatong.id, thana.userId);
  chk("K1.3-S3.8", "OWNER ถอด thana → แถวหาย · boardRole กลับเป็น null (PRIVATE)", (await P.kanbanBoardMember.count({ where: { boardId: bPatong.id, userId: thana.userId } })) === 0 && (await members.boardRoleOf(ctxOf(thana), bPatong.id).catch(() => null)) === null, "null", "ยังเห็น");
  const listM = await members.listMembers(ctxOf(owner), bPatong.id);
  chk("K1.3-S3.9", "listMembers คืน [{userId,name,email,role,tenantRole}] มี pook ADMIN", Array.isArray(listM) && listM.some((m: Any) => m.userId === pook.userId && m.role === "ADMIN" && typeof m.name === "string" && typeof m.tenantRole === "string"), "pook ADMIN", JSON.stringify(listM).slice(0, 120));
  // งานของฉัน: การ์ดของ thana บนบอร์ด PRIVATE ที่ถูกถอด → ไม่โชว์ · แต่บอร์ด TENANT ยังโชว์
  const myThana = await svc.listMyCards(tid, SYS, thana.userId, thana) as Any[];
  chk("K1.3-S3.10", "listMyCards(…, actor) ของ thana หลังถูกถอด: ไม่มีการ์ดจากบอร์ดป่าตอง (PRIVATE) เหลือแต่บอร์ด TENANT", myThana.every((c) => c.boardId !== bPatong.id) && myThana.some((c) => c.boardId === bMaint.id), "เฉพาะ TENANT", `${myThana.filter((c) => c.boardId === bPatong.id).length} ใบจากป่าตอง / ${myThana.length} รวม`);

  // ═══ S4 ดาว + visibility + AuditLog ═══
  await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
  await members.starBoard(ctxOf(thana), bMaint.id);
  const starred = await members.listStarredBoardIds(ctxOf(thana));
  chk("K1.3-S4.1", "starBoard/listStarredBoardIds", Array.isArray(starred) && starred.includes(bMaint.id), "มีดาว", JSON.stringify(starred));
  await members.starBoard(ctxOf(thana), bMaint.id);
  chk("K1.3-S4.2", "ติดดาวซ้ำไม่ error ไม่ซ้ำแถว", (await P.kanbanBoardStar.count({ where: { boardId: bMaint.id, userId: thana.userId } })) === 1, "1", "≠1", "MAJOR");
  await members.unstarBoard(ctxOf(thana), bMaint.id);
  const eStarHidden = await fails(() => members.starBoard(ctxOf(thana), bKata.id));
  chk("K1.3-S4.3", "unstar ได้ · ติดดาวบอร์ดที่มองไม่เห็น → ไม่พบ", (await P.kanbanBoardStar.count({ where: { boardId: bMaint.id, userId: thana.userId } })) === 0 && !!eStarHidden, "0 + ไม่พบ", `${await P.kanbanBoardStar.count({ where: { boardId: bMaint.id, userId: thana.userId } })}`);
  await members.setBoardVisibility(ctxOf(owner), bMaint.id, "PRIVATE");
  const eVisByViewer = await fails(() => members.setBoardVisibility(ctxOf(manager), bPatong.id, "TENANT"));
  chk("K1.3-S4.4", "setBoardVisibility: OWNER ทำได้ · EDITOR (manager สาขา) ทำไม่ได้", (await fresh(bMaint.id)).visibility === "PRIVATE" && !!eVisByViewer && (await fresh(bPatong.id)).visibility === "PRIVATE", "PRIVATE + ปฏิเสธ", `${(await fresh(bMaint.id)).visibility} ${String(eVisByViewer?.message ?? "").slice(0, 40)}`);
  chk("K1.3-S4.5", "TENANT→PRIVATE แล้ว thana (ไม่ใช่สมาชิก) มองไม่เห็นบอร์ดซ่อมทันที", access.boardRole(thana, await fresh(bMaint.id)) === null, "null", String(access.boardRole(thana, await fresh(bMaint.id))));
  await members.setBoardVisibility(ctxOf(owner), bMaint.id, "TENANT");
  const audits = await prisma.auditLog.findMany({ where: { tenantId: tid }, orderBy: { createdAt: "asc" } }) as Any[];
  const actions = audits.map((a) => a.action);
  chk("K1.3-S4.6", "AuditLog กลางมีแถวสำหรับ visibility (×2) · member add/role/remove — action ขึ้นต้น kanban. และ targetId = boardId", actions.filter((a) => /kanban\.board\.visibility/.test(a)).length >= 2 && actions.some((a) => /kanban\.board\.member\.(add|added)/.test(a)) && actions.some((a) => /kanban\.board\.member\.(role|changed)/.test(a)) && actions.some((a) => /kanban\.board\.member\.(remove|removed)/.test(a)) && audits.every((a) => /^kanban\./.test(a.action) && !!a.targetId), "ครบ", actions.join(",").slice(0, 200));

  // ═══ S5 listBoards ผ่านสิทธิ์ · getBoard 404 ═══
  const lbThana = await svc.listBoardsFor(ctxOf(thana), thana).catch((e: Any) => e);
  chk("K1.3-S5.1", "listBoardsFor(ctx, actor) ของ thana = เฉพาะบอร์ดซ่อม (TENANT) — ไม่มี PRIVATE 2 ใบ", Array.isArray(lbThana) && lbThana.length === 1 && lbThana[0].id === bMaint.id, "1 ใบ", Array.isArray(lbThana) ? String(lbThana.length) : String(lbThana?.message));
  const gbHidden = await fails(() => svc.getBoardFor(ctxOf(thana), thana, bKata.id));
  const gbOk = await svc.getBoardFor(ctxOf(thana), thana, bMaint.id).catch(() => null);
  chk("K1.3-S5.2", "getBoardFor: บอร์ดที่มองไม่เห็น → KanbanNotFoundError · บอร์ด TENANT → ได้บอร์ด + role VIEWER", !!gbHidden && (gbHidden?.name === "KanbanNotFoundError" || /ไม่พบ/.test(String(gbHidden?.message))) && !!gbOk && gbOk.role === "VIEWER", "404 / VIEWER", `${gbHidden?.name} / ${gbOk?.role}`);

  // cleanup
  await P.kanbanBoardMember.deleteMany({ where: { boardId: bPatong.id } });
  await P.kanbanBoardStar.deleteMany({ where: { userId: thana.userId } });
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.3 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
