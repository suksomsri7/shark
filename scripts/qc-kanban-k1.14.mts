// QC — บอร์ดงาน WO K1.14: ปุ่มลัด (ปิดได้ · ไม่ชนช่องพิมพ์/IME) · empty state ทุกหน้า · realtime (publish + subscribe/polling) · คลังเก็บ/กู้คืน · เมนู 7 หมวด
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.14 — ส่วน "2 browser เห็นกัน" ตรวจด้วย visual-kanban.mts 1.14 (Fable)
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/components/kanban/Shortcuts.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/components/kanban/Shortcuts.tsx)");
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
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId };
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cardsSvc = (await import("@/lib/modules/kanban/cards" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const moves = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const archive = (await import("@/lib/modules/kanban/archive" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const rt = (await import("@/lib/modules/kanban/realtime" as string)) as Record<string, (...a: Any[]) => Any>;

  // ═══ S1 ปุ่มลัด (static) ═══
  const sc = read("src/components/kanban/Shortcuts.tsx");
  const keys = ['"?"', '"b"', '"f"', '"x"', '"n"', '"t"', '"d"', '"l"', '"c"', '"j"', '"k"', '"z"', "Escape"];
  chk("K1.14-S1.1", "Shortcuts.tsx (client) ผูกปุ่ม ? b f x n t d l c j k z Esc + Shift+←/→ + Ctrl/⌘K + g แล้ว i/t/b", /"use client"/.test(sc) && keys.every((k) => sc.includes(k)) && /shiftKey/.test(sc) && /ArrowLeft/.test(sc) && /metaKey|ctrlKey/.test(sc) && /"g"/.test(sc), "ครบ", keys.filter((k) => !sc.includes(k)).join(",") || "ครบ (เช็ค shift/g)");
  chk("K1.14-S1.2", "ไม่ทำงานเมื่อ focus อยู่ใน input/textarea/contenteditable หรือ IME composing (isComposing / keyCode 229)", /INPUT|TEXTAREA/.test(sc) && /isContentEditable|contenteditable/i.test(sc) && /isComposing|229/.test(sc), "guard ครบ", "ขาด");
  chk("K1.14-S1.3", "ปิดปุ่มลัดได้จากตั้งค่าผู้ใช้ (prop enabled อ่านจาก user preference `kanbanShortcuts`) + หน้า ? แสดงรายการ (testid shortcuts-help)", /kanbanShortcuts/.test(sc + read("src/app/app/settings/page.tsx") + read("src/lib/modules/kanban/preferences.ts")) && sc.includes('"shortcuts-help"'), "ปิดได้ + help", "ไม่พบ", "MAJOR");

  // ═══ S2 empty state ทุกหน้า (static · ข้อความตาม §5.7) ═══
  const all = ["BoardsHome", "BoardView", "Column", "MyTasks", "ArchivePage", "FilterBar"].map((f) => read(`src/components/kanban/${f}.tsx`)).join("\n") + read("src/app/app/sys/[id]/kanban/boards/page.tsx") + read("src/app/app/sys/[id]/kanban/b/[boardId]/archive/page.tsx");
  const empties = ["ยังไม่มีบอร์ด", "บอร์ดนี้ยังว่าง", "ลากการ์ดมาวางที่นี่", "ไม่มีการ์ดตรงกับตัวกรอง", "วันนี้ไม่มีงานค้าง", "ยังไม่มีการ์ดที่เก็บเข้าคลัง"];
  chk("K1.14-S2.1", "empty state ครบ 6 ข้อความตามแบบ §5.7 และแต่ละอันมีปุ่มขั้นต่อไป", empties.every((t) => all.includes(t)), "6 ข้อความ", empties.filter((t) => !all.includes(t)).join(" | ") || "ครบ");

  // ═══ S3 realtime ═══
  const ch = rt.kanbanChannel(tid, E.boards.patong.id);
  chk("K1.14-S3.1", "kanbanChannel(tenantId, boardId) → 'kanban:<tenantId>:<boardId>' (ไม่ปนร้าน)", typeof ch === "string" && ch.includes(tid) && ch.includes(E.boards.patong.id) && /^kanban:/.test(ch), "kanban:<t>:<b>", String(ch));
  const srcMut = read("src/lib/modules/kanban/moves.ts") + read("src/lib/modules/kanban/cards.ts") + read("src/lib/modules/kanban/labels.ts") + read("src/lib/modules/kanban/comments.ts") + read("src/lib/modules/kanban/checklists.ts") + read("src/lib/modules/kanban/realtime.ts");
  chk("K1.14-S3.2", "ทุก mutation หลัก (move/create/update/archive/label/assign/comment/checklist) เรียก publishBoardSignal(...) หลัง commit (ไม่ใช่ใน tx) และ realtime ไม่เป็นเงื่อนไขความถูกต้อง (catch)", (srcMut.match(/publishBoardSignal\(/g) ?? []).length >= 6 && /catch/.test(read("src/lib/modules/kanban/realtime.ts")), "≥6 จุด + catch", `${(srcMut.match(/publishBoardSignal\(/g) ?? []).length} จุด`);
  const sig = rt.boardSignal({ type: "card.moved", cardId: "c1", columnId: "col1" });
  chk("K1.14-S3.3", "boardSignal สร้าง payload ขั้นต่ำ {type, ids, at} — ไม่มีชื่อ/เนื้อหาการ์ด (ไม่ส่งเนื้อหาออกนอกบ้าน)", sig && sig.type === "card.moved" && !("title" in sig) && !("body" in sig) && typeof sig.at === "string", "ไม่มีเนื้อหา", JSON.stringify(sig));
  const bv = read("src/components/kanban/BoardView.tsx") + read("src/components/kanban/useBoardLive.ts");
  chk("K1.14-S3.4", "client: useBoardLive — โหมด realtime subscribe channel · โหมด polling ดึงทุก ≤ 5 วิ (revalidate) · หยุดเมื่อแท็บซ่อน (visibilitychange)", /useBoardLive/.test(bv) && /subscribe|Ably|realtime/i.test(bv) && /setInterval|poll/i.test(bv) && /visibilitychange/.test(bv), "ครบ", "ขาด", "MAJOR");

  // ═══ S4 คลังเก็บ/กู้คืน ═══
  const board = E.boards.patong.id as string;
  const col = (await prisma.kanbanColumn.findFirst({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const c1 = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col.id, title: "QC K1.14 เก็บ 1" });
  const c2 = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col.id, title: "QC K1.14 เก็บ 2 ค้นหาได้" });
  await cardsSvc.archiveCard(ctxO, c1.id); await cardsSvc.archiveCard(ctxO, c2.id);
  const tmpCol = await svc.createColumn(tid, SYS, board, "QC คอลัมน์เก็บ");
  await moves.archiveColumn(ctxO, tmpCol.id);
  const list = await archive.listArchived(ctxO, board, {});
  chk("K1.14-S4.1", "listArchived(ctx, boardId) → {cards[{id,cardNo,title,archivedAt,archivedBy{name}|null,columnName}], columns[{id,name,archivedAt,cardCount}]} เรียงล่าสุดก่อน", Array.isArray(list?.cards) && list.cards.length >= 2 && list.cards[0].title.startsWith("QC K1.14") && Array.isArray(list?.columns) && list.columns.some((c: Any) => c.id === tmpCol.id), "โครงครบ", JSON.stringify({ c: list?.cards?.length, col: list?.columns?.length }));
  const q = await archive.listArchived(ctxO, board, { q: "ค้นหาได้" });
  chk("K1.14-S4.2", "ค้นในคลังด้วย q → 1 ใบ", q?.cards?.length === 1 && q.cards[0].id === c2.id, "1", String(q?.cards?.length), "MAJOR");
  await archive.restoreColumn(ctxO, tmpCol.id);
  chk("K1.14-S4.3", "restoreColumn → ACTIVE ท้ายบอร์ด (position หลังทุกคอลัมน์)", ((await prisma.kanbanColumn.findUnique({ where: { id: tmpCol.id } })) as Any).status === "ACTIVE", "ACTIVE", "ARCHIVED");
  await cardsSvc.restoreCard(ctxO, c1.id);
  chk("K1.14-S4.4", "กู้คืนการ์ดจากหน้าคลัง → ACTIVE + หายจาก listArchived", ((await prisma.kanbanCard.findUnique({ where: { id: c1.id } })) as Any).status === "ACTIVE" && !(await archive.listArchived(ctxO, board, {})).cards.some((c: Any) => c.id === c1.id), "ACTIVE", "ค้าง");
  const eHidden = await archive.listArchived({ tenantId: tid, systemId: SYS, actorUserId: E.users.staff.thana.userId }, board, {}).catch((e: Any) => e);
  chk("K1.14-S4.5", "thana (มองไม่เห็นบอร์ด PRIVATE) ดูคลัง → ไม่พบ", !!eHidden && (eHidden?.name === "KanbanNotFoundError" || /ไม่พบ/.test(String(eHidden?.message))), "ไม่พบ", `${eHidden?.name}`);
  const ap = read("src/app/app/sys/[id]/kanban/b/[boardId]/archive/page.tsx") + read("src/components/kanban/ArchivePage.tsx");
  chk("K1.14-S4.6", "หน้าคลัง /kanban/b/{id}/archive: testid archive-page · แท็บ การ์ด/คอลัมน์ · ค้นหา · ปุ่มกู้คืน · ลิงก์จากเมนู ⋯ ของบอร์ด", ap.includes('"archive-page"') && /กู้คืน/.test(ap) && /คอลัมน์/.test(ap) && /archive/.test(read("src/components/kanban/BoardHeader.tsx") + read("src/components/kanban/BoardMenu.tsx")), "ครบ", "ขาด", "MAJOR");

  // ═══ S5 เมนู 7 หมวด ตรงกัน 2 ที่ ═══
  const layout = read("src/app/app/layout.tsx"); const ui = read("src/lib/modules/kanban/ui.tsx") + read("src/lib/modules/kanban/nav.ts");
  const menu = ["บอร์ด", "งานของฉัน", "กล่องงานเข้า", "ปฏิทินงาน", "ระบบอัตโนมัติ", "รายงาน", "ตั้งค่า"];
  chk("K1.14-S5.1", "เมนู KANBAN 7 หมวดตามแบบ §5.2 ใน layout (childrenFor) และ kanbanTabs อ่านจากทะเบียนเดียว (nav.ts) — หน้าที่ยังไม่มาถูกซ่อน/ติดป้าย 'เร็ว ๆ นี้'", menu.every((m) => (layout + ui).includes(m)) && /kanbanNav|KANBAN_NAV|nav\.ts|from "\.\/nav"/.test(layout + ui), "7 หมวด + ทะเบียนเดียว", menu.filter((m) => !(layout + ui).includes(m)).join(",") || "ครบ (เช็คทะเบียน)");

  // cleanup
  await prisma.kanbanCard.deleteMany({ where: { id: { in: [c1.id, c2.id] } } });
  await prisma.kanbanColumn.deleteMany({ where: { id: tmpCol.id } });
  await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${board}'`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.14 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
