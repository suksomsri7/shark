// QC — บอร์ดงาน WO K2.12: หนี้ P2 — ตาราง parity ภาพ 04 · ปฏิทินรวมระบบ · REST op + AI tool ของ P2 · UI ค้าง (เทมเพลตมือถือ · แก้ตัวเลือกฟิลด์/เทมเพลต · ลากเรียงมุมมอง) · ชิป "โดยกฎอัตโนมัติ"
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K2.F/K2.12
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/system-calendar.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/system-calendar.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null>; dayFromToday: (n: number, h?: number) => Date };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const P = prisma as Any;
let tid = ""; let SYS = "";
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const sc = (await import("@/lib/modules/kanban/system-calendar" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const reg = (await import("@/lib/modules/kanban/api/registry" as string)) as { KANBAN_OPS: Any[] };
  const kops = (await import("@/lib/ai/kanban-ops" as string)) as Record<string, (...a: Any[]) => Any>;
  const skills = (await import("@/lib/ai/skills" as string)) as Record<string, Any>;
  const rp = (await import("@/lib/modules/kanban/reports" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: owner.userId }; const ctxT = { tenantId: tid, systemId: SYS, actorUserId: thana.userId };
  const NOW = kq.dayFromToday(0, 10); const FROM = kq.dayFromToday(-7, 0); const TO = kq.dayFromToday(35, 0);
  await P.kanbanBoardMember.deleteMany({ where: { boardId: E.boards.patong.id } });

  // ═══ S1 ตาราง parity ภาพ 04 (static) ═══
  const tv = read("src/components/kanban/TableView.tsx");
  const bulkIdx = tv.indexOf('data-testid="bulk-bar"'); const tableIdx = tv.indexOf('data-testid="table-view"');
  const bulkBlock = bulkIdx >= 0 ? tv.slice(Math.max(0, bulkIdx - 600), bulkIdx + 400) : "";
  chk("K2.12-S1.1", "TableView: แถบเลือกหลายรายการ (bulk-bar) อยู่ **บนตาราง** ในซอร์ส (ก่อน table-view) · ไม่ใช่ fixed/bottom ลอยล่างจอ · พื้นโทนฟ้าอ่อน (var(--color-accent-soft)/accent) ตามภาพ 04 · ข้อความ 'เลือก n การ์ด' + 5 การกระทำเดิม", bulkIdx >= 0 && tableIdx >= 0 && bulkIdx < tableIdx && !/fixed|bottom-4|bottom:\s*\d/.test(bulkBlock) && /accent/.test(bulkBlock), "บนตาราง · ไม่ fixed", `bulk=${bulkIdx} table=${tableIdx}`);
  chk("K2.12-S1.2", "ชิปกำหนดส่งในตารางใช้ dueBadgeFrom (สัมพัทธ์ 'วันนี้ 18:00' · 'เลย 4 วัน' · 'พรุ่งนี้' + สีตามความเร่ง) · คอลัมน์ 'แก้ไขล่าสุด' ใช้ relativeThaiTime ('2 ชม.' · 'เมื่อวาน') · ไม่มี toLocale*", /dueBadgeFrom/.test(tv) && /relativeThaiTime/.test(tv) && !/toLocale/.test(tv), "ครบ", "ขาด");

  const tl = read("src/components/kanban/TimelineView.tsx");
  chk("K2.12-S1.3", "ไทม์ไลน์ (K2.3 หนี้ UI): แถบแคบ (< 80px เช่นการ์ด 1 วัน) แสดงชื่อการ์ดเต็มข้างแถบ (testid timeline-bar-label ไม่ตัดเหลือ 1 ตัวอักษร) · ช่วงปริยาย (ไม่มี ?from=) เริ่มจากสัปดาห์ที่มีวันนี้ (เส้นวันนี้อยู่ในจอ)", tl.includes("timeline-bar-label") && /วันนี้|today/i.test(tl), "มี", "ขาด");

  // ═══ S2 ปฏิทินรวมระบบ ═══
  const cal = await sc.listSystemCalendar(ctxO, owner, { from: FROM, to: TO, now: NOW });
  const calT = await sc.listSystemCalendar(ctxT, thana, { from: FROM, to: TO, now: NOW });
  const boards = await prisma.kanbanBoard.findMany({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE" }, select: { id: true } });
  const dueInRange = await prisma.kanbanCard.count({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE", boardId: { in: boards.map((b) => b.id) }, dueAt: { gte: FROM, lte: TO } } });
  const dueMaint = await prisma.kanbanCard.count({ where: { boardId: E.boards.maint.id, status: "ACTIVE", dueAt: { gte: FROM, lte: TO } } });
  const total = (c: Any) => Object.values(c?.days ?? {}).reduce((n: number, d: Any) => n + (d.cards?.length ?? 0), 0);
  chk("K2.12-S2.1", `listSystemCalendar(ctx, actor, {from,to,now,boardIds?}) → { days: {YYYY-MM-DD: {cards:[{...CalCardDto, boardId, boardName, boardColor}]}}, boards:[{id,name,color,count}] } · owner รวมทุกบอร์ดที่มองเห็น = ${dueInRange} ใบ · thana เห็นเฉพาะซ่อม = ${dueMaint}`, total(cal) === dueInRange && cal.boards.length === boards.length && total(calT) === dueMaint && Object.values(cal.days).flatMap((d: Any) => d.cards).every((c: Any) => typeof c.boardName === "string" && c.boardColor), `${dueInRange} / ${dueMaint}`, `${total(cal)} / ${total(calT)}`);
  const page = read("src/app/app/sys/[id]/kanban/calendar/page.tsx"); const comp = read("src/components/kanban/SystemCalendar.tsx");
  chk("K2.12-S2.2", "หน้า /kanban/calendar (page.tsx → listSystemCalendar) + SystemCalendar.tsx testid system-calendar (reuse โครง CalendarView: เดือน/สัปดาห์ · ‹ › · วันนี้ · ชิปสีตามบอร์ด + ชื่อบอร์ดกำกับ · คลิกการ์ด → หน้าบอร์ดนั้น ?card= · ตัวกรองเลือกบอร์ด testid calendar-boards · ไม่มีถาดลาก (ปฏิทินรวมอ่านอย่างเดียว)) · nav.ts calendar → ready · qc-nav-functions เขียว", page.length > 0 && comp.includes("system-calendar") && comp.includes("calendar-boards") && /key:\s*"calendar"[^}]*status:\s*"ready"/.test(read("src/lib/modules/kanban/nav.ts")), "ครบ", "ขาด");

  // ═══ S3 REST op + AI tool ของ P2 ═══
  const ops = reg.KANBAN_OPS; const ids = ops.map((o) => o.id);
  const REQ_OPS = ["boards.table", "boards.calendar", "views.list", "views.create", "views.delete", "fields.list", "fields.create", "fields.update", "fields.delete", "cards.fields.set", "templates.cards.list", "templates.cards.create", "cards.recurrence.set", "inbox.list", "inbox.quickAdd", "inbox.move", "automation.rules.list", "automation.rules.create", "automation.rules.toggle", "automation.rules.dryRun", "reports.overdue", "reports.workload", "reports.throughput", "reports.aging", "cards.watch", "cards.unwatch"];
  const missing = REQ_OPS.filter((id) => !ids.includes(id));
  chk("K2.12-S3.1", `ทะเบียน KANBAN_OPS มี op ของ P2 ครบ ${REQ_OPS.length} ตัว · ทุกตัว test ขึ้นต้น K2.12- · id/path ไม่ซ้ำ · kind ถูก (read/write) · action ขึ้นต้น kanban.`, missing.length === 0 && REQ_OPS.every((id) => /^K2\.12-/.test(ops.find((o) => o.id === id)?.test ?? "")) && new Set(ids).size === ids.length && new Set(ops.map((o) => `${o.method} ${o.path}`)).size === ops.length && ops.filter((o) => REQ_OPS.includes(o.id)).every((o) => /^kanban\./.test(o.action)), "ครบ", missing.join(",") || "test/kind ไม่ตรง");
  const names: string[] = kops.kanbanToolNames();
  const REQ_TOOLS = ["kanban_inbox_add", "kanban_overdue_report", "kanban_workload_report", "kanban_list_rules"];
  let regErr: string | null = null; try { skills.assertSkillRegistryComplete(); } catch (e) { regErr = (e as Error).message; }
  chk("K2.12-S3.2", "AI tool ใหม่ 4 ตัว (จาก op ที่ประกาศ tool): kanban_inbox_add (เขียน→ข้อเสนอ) · kanban_overdue_report · kanban_workload_report · kanban_list_rules (อ่าน) · อยู่ในสกิล tasks · assertSkillRegistryComplete ผ่าน · คำอธิบายอังกฤษ", REQ_TOOLS.every((n) => names.includes(n)) && regErr === null && REQ_TOOLS.every((n) => skills.SKILLS.find((s: Any) => s.id === "tasks")?.tools?.includes(n)), "4/4", REQ_TOOLS.filter((n) => !names.includes(n)).join(",") || (regErr ?? ""));
  const od = await rp.overdue(ctxO, owner, { now: NOW });
  const tOd = await kops.runKanbanTool(tid, "kanban_overdue_report", {}, { systemId: SYS });
  const tInbox = await kops.runKanbanTool(tid, "kanban_inbox_add", { title: "QC K2.12 จดจาก AI" }, { systemId: SYS });
  chk("K2.12-S3.3", "runKanbanTool(kanban_overdue_report) → read · total = reports.overdue().total · kanban_inbox_add → propose (ไม่สร้างแถว KanbanInboxItem)", tOd?.mode === "read" && tOd.result?.total === od.total && tInbox?.mode === "propose" && (await P.kanbanInboxItem.count({ where: { tenantId: tid, title: "QC K2.12 จดจาก AI" } })) === 0, "read/propose", JSON.stringify({ tOd: tOd?.mode, total: tOd?.result?.total, exp: od?.total, tInbox: tInbox?.mode }));
  const md = read("docs/api/KANBAN-API.md"); const ep = read(".claude/skills/shark-kanban-api/references/endpoints.md");
  chk("K2.12-S3.4", "docs/api/KANBAN-API.md + skill endpoints.md regen ครอบ op ใหม่ (ทุก op มี `METHOD path` ใน endpoints.md) · fitness F13 เขียว (builder รัน)", ops.every((o) => ep.includes(`${o.method} ${o.path}`)) && REQ_OPS.every((id) => md.includes(id) || ep.includes(id)), "ครบ", ops.filter((o) => !ep.includes(`${o.method} ${o.path}`)).map((o) => o.id).slice(0, 5).join(","));

  // ═══ S4 UI ค้าง (static) ═══
  chk("K2.12-S4.1", "มือถือ: MobileBoard/แผ่นเพิ่มการ์ดเร็ว มี 'จากเทมเพลต' (testid card-template-picker) เมื่อบอร์ดมีเทมเพลต", (read("src/components/kanban/MobileBoard.tsx") + read("src/components/kanban/CardTemplatePicker.tsx")).includes("card-template-picker") && /จากเทมเพลต/.test(read("src/components/kanban/MobileBoard.tsx")), "มี", "ขาด");
  chk("K2.12-S4.2", "ตั้งค่า › ฟิลด์: แก้ตัวเลือก SELECT / หน่วย NUMBER หลังสร้าง (testid field-edit-options) · ตั้งค่า › เทมเพลตการ์ด: แก้ชื่อการ์ด/รายละเอียด (testid template-edit-title) · มุมมองที่บันทึกไว้: ปุ่ม ↑↓ หรือลาก (testid view-reorder) เรียก reorderViews", read("src/components/kanban/settings/CustomFieldsSettings.tsx").includes("field-edit-options") && read("src/components/kanban/CardTemplatesSettings.tsx").includes("template-edit-title") && read("src/components/kanban/settings/SavedViewsSettings.tsx").includes("view-reorder") && /reorderViews/.test(read("src/lib/modules/kanban/actions.ts") + read("src/lib/modules/kanban/views.ts")), "ครบ", "ขาด");
  const ccols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanComment'`)).map((c) => c.column_name);
  chk("K2.12-S4.3", "ความเห็นที่กฎอัตโนมัติเขียน: KanbanComment.automationRuleId String? (additive migration) · automation.ts ตั้งค่าตอนเขียน · Comments/Timeline แสดงชิป 'โดยกฎอัตโนมัติ' แทนชื่อคน", ccols.includes("automationRuleId") && /automationRuleId/.test(read("src/lib/modules/kanban/automation.ts")) && /โดยกฎอัตโนมัติ/.test(read("src/components/kanban/Comments.tsx") + read("src/components/kanban/Timeline.tsx")), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/2.12") ? readdirSync(".qc-shots/kanban/2.12").filter((f) => f.endsWith(".png")) : [];
  chk("K2.12-S4.4", "ภาพจริง ≥ 3 ใบใน .qc-shots/kanban/2.12 (ตารางเลือก 2 แถว → แถบฟ้าบนตาราง เทียบ 04 · ปฏิทินรวมระบบ · มือถือจากเทมเพลต)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try { if (tid) await P.kanbanInboxItem.deleteMany({ where: { tenantId: tid, title: { startsWith: "QC K2.12" } } }); await prisma.aiProposal.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }).catch(() => null); } catch { /* */ }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K2.12 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
