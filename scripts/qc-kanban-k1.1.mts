// QC — บอร์ดงาน WO K1.1: ไมเกรชัน A (additive) + backfill + ordering core (fractional-indexing) + แจ้งเตือนตรงคน
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.1
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readdirSync, readFileSync } from "node:fs";
// ⏭️ WO ยังไม่สร้าง → ข้ามแบบเห็นชัด (exit 0) ไม่ทำ qc:all แดงค้าง
if (!existsSync("src/lib/modules/kanban/ordering.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/ordering.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null>; dayFromToday: (n: number) => Date };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const q = async <T = Any,>(sql: string): Promise<T[]> => prisma.$queryRawUnsafe(sql) as Promise<T[]>;

try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed — รัน pnpm exec tsx scripts/seed-kanban-qc.mts");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;

  // ═══ S1 schema ลงจริง (information_schema · ไม่เชื่อ Prisma client) ═══
  const cols = async (table: string) => (await q<{ column_name: string; is_nullable: string; column_default: string | null; data_type: string }>(`select column_name, is_nullable, column_default, data_type from information_schema.columns where table_name='${table}'`));
  const board = await cols("KanbanBoard"); const col = await cols("KanbanColumn"); const card = await cols("KanbanCard");
  const has = (rows: Any[], name: string) => rows.some((r) => r.column_name === name);
  const nullableOrDefault = (rows: Any[], name: string) => rows.some((r) => r.column_name === name && (r.is_nullable === "YES" || r.column_default !== null));
  const boardNew = ["unitId", "color", "visibility", "cardNoSeq", "createdById", "templateOfId"];
  const colNew = ["position", "isDoneColumn", "wipLimit", "color"];
  const cardNew = ["cardNo", "position", "startAt", "completedAt", "reminderMinutesBefore", "reminderSentAt", "coverFileId", "sourceType", "sourceId", "createdById", "archivedById"];
  chk("K1.1-S1.1", "KanbanBoard มีคอลัมน์ใหม่ครบ 6", boardNew.every((c) => has(board, c)), boardNew.join(","), boardNew.filter((c) => !has(board, c)).join(",") || "ครบ");
  chk("K1.1-S1.2", "KanbanColumn มีคอลัมน์ใหม่ครบ 4", colNew.every((c) => has(col, c)), colNew.join(","), colNew.filter((c) => !has(col, c)).join(",") || "ครบ");
  chk("K1.1-S1.3", "KanbanCard มีคอลัมน์ใหม่ครบ 11", cardNew.every((c) => has(card, c)), cardNew.join(","), cardNew.filter((c) => !has(card, c)).join(",") || "ครบ");
  const allNew = [...boardNew.map((c) => [board, c] as const), ...colNew.map((c) => [col, c] as const), ...cardNew.map((c) => [card, c] as const)];
  chk("K1.1-S1.4", "คอลัมน์ใหม่ทุกตัว nullable หรือมี default (additive — โค้ดเก่าเสิร์ฟต่อได้ระหว่าง deploy)", allNew.every(([rows, c]) => nullableOrDefault(rows, c)), "ทุกตัว", allNew.filter(([rows, c]) => !nullableOrDefault(rows, c)).map(([, c]) => c).join(",") || "ครบ");
  const enums = await q<{ typname: string; labels: string }>(`select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) labels from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typname in ('KanbanBoardVisibility','KanbanLabelColor','KanbanCardSourceType') group by t.typname`);
  const en = Object.fromEntries(enums.map((r) => [r.typname, r.labels]));
  chk("K1.1-S1.5", "enum ใหม่ 3 ตัว: Visibility PRIVATE,TENANT · LabelColor 6 สี · SourceType 7 ค่า", en.KanbanBoardVisibility === "PRIVATE,TENANT" && en.KanbanLabelColor === "SLATE,BLUE,GREEN,AMBER,RED,PURPLE" && en.KanbanCardSourceType === "MANUAL,TEMPLATE,CHAT,FORM,EMAIL,AUTOMATION,AI", "ตามสัญญา", JSON.stringify(en));
  const idx = await q<{ indexname: string; indexdef: string }>(`select indexname, indexdef from pg_indexes where tablename in ('KanbanBoard','KanbanCard')`);
  chk("K1.1-S1.6", "index ใหม่: Board(tenantId,systemId,unitId) · Card(tenantId,systemId,status,dueAt) · Card(boardId,cardNo)", idx.some((i) => /"tenantId", "systemId", "unitId"/.test(i.indexdef)) && idx.some((i) => /"tenantId", "systemId", "?status"?, "dueAt"/.test(i.indexdef)) && idx.some((i) => /"boardId", "cardNo"/.test(i.indexdef)), "3 index", idx.map((i) => i.indexname).join(","), "MAJOR");
  // migration ไฟล์ additive
  const migDirs = readdirSync("prisma/migrations").filter((d) => /kanban_v2_a/i.test(d));
  const migSql = migDirs.map((d) => readFileSync(`prisma/migrations/${d}/migration.sql`, "utf8")).join("\n");
  chk("K1.1-S1.7", "มี migration `*_kanban_v2_a` และไม่มี DROP COLUMN / DROP TABLE / ALTER COLUMN ... TYPE (additive เท่านั้น)", migDirs.length >= 1 && !/DROP (COLUMN|TABLE)/i.test(migSql) && !/ALTER COLUMN[^;]*TYPE/i.test(migSql), "additive", migDirs.join(",") || "ไม่มี", "CRITICAL");
  const status = await q<{ migration_name: string; finished_at: string | null }>(`select migration_name, finished_at from _prisma_migrations where migration_name like '%kanban_v2_a%'`);
  chk("K1.1-S1.8", "migration ลง QC DB แล้ว (finished_at ไม่ null)", status.length >= 1 && status.every((s) => !!s.finished_at), "ลงแล้ว", JSON.stringify(status).slice(0, 120));

  // ═══ S2 backfill ═══
  const boards = await prisma.kanbanBoard.findMany({ where: { tenantId: tid, systemId: SYS }, orderBy: { createdAt: "asc" } }) as Any[];
  const columns = await prisma.kanbanColumn.findMany({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE" }, orderBy: [{ boardId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }) as Any[];
  const cards = await prisma.kanbanCard.findMany({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE" }, orderBy: [{ columnId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }) as Any[];
  chk("K1.1-S2.1", "backfill: ทุกคอลัมน์ ACTIVE มี position", columns.length > 0 && columns.every((c) => typeof c.position === "string" && c.position.length > 0), "ทุกแถว", `${columns.filter((c) => !c.position).length} แถวว่าง จาก ${columns.length}`);
  chk("K1.1-S2.2", "backfill: ทุกการ์ด ACTIVE มี position", cards.length > 0 && cards.every((c) => typeof c.position === "string" && c.position.length > 0), "ทุกแถว", `${cards.filter((c) => !c.position).length} แถวว่าง จาก ${cards.length}`);
  // ลำดับตาม position ต้องเท่าลำดับตาม sortOrder เดิม (ต่อคอลัมน์)
  const byCol = new Map<string, Any[]>();
  for (const c of cards) byCol.set(c.columnId, [...(byCol.get(c.columnId) ?? []), c]);
  let orderOk = true;
  for (const list of byCol.values()) {
    const bySort = [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()).map((c) => c.id);
    const byPos = [...list].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)).map((c) => c.id);
    if (bySort.join() !== byPos.join()) orderOk = false;
  }
  chk("K1.1-S2.3", "ลำดับตาม position = ลำดับ sortOrder เดิมทุกคอลัมน์ (ไม่มีการ์ดสลับที่)", orderOk, "เท่ากัน", "ต่างกัน");
  const byBoard = new Map<string, Any[]>();
  for (const c of cards) byBoard.set(c.boardId, [...(byBoard.get(c.boardId) ?? []), c]);
  let cardNoOk = true; let seqOk = true;
  for (const b of boards) {
    const list = (byBoard.get(b.id) ?? []).map((c) => c.cardNo as number | null);
    const nums = list.filter((n): n is number => typeof n === "number");
    if (nums.length !== list.length || new Set(nums).size !== nums.length || Math.min(...nums) < 1) cardNoOk = false;
    if (b.cardNoSeq !== Math.max(0, ...nums)) seqOk = false;
  }
  chk("K1.1-S2.4", "cardNo: ทุกการ์ดมี · ไม่ซ้ำต่อบอร์ด · เริ่ม 1", cardNoOk, "ครบ/ไม่ซ้ำ", "มีปัญหา");
  chk("K1.1-S2.5", "cardNoSeq ของบอร์ด = cardNo สูงสุด", seqOk, "เท่ากัน", boards.map((b) => `${b.name.slice(0, 8)}:${b.cardNoSeq}`).join(","));
  // seed ก่อน K1.1 → บอร์ดเก่าทุกใบต้องกลายเป็น TENANT (backfill) · seed หลัง K1.1 (โค้ดใหม่บันทึก visibility จริง) → ต้องตรงเฉลย
  const expVis: Record<string, string> = { [kq.KQC.boards.patong]: E.boards.patong.visibility, [kq.KQC.boards.maint]: E.boards.maint.visibility, [kq.KQC.boards.kataSecret]: E.boards.kata.visibility };
  const seededBefore = boards.every((b) => b.visibility === "TENANT");
  const seededAfter = boards.filter((b) => expVis[b.name]).every((b) => b.visibility === expVis[b.name]);
  chk("K1.1-S2.6", "visibility: บอร์ดที่มีก่อน K1.1 → TENANT (backfill ใช้เครื่องหมาย 'คอลัมน์ยังไม่มี position') · บอร์ดที่ seed ด้วยโค้ดใหม่ → ตรงเฉลย · บอร์ดใหม่ default PRIVATE", seededBefore || seededAfter, "TENANT หรือ ตรงเฉลย", boards.map((b) => `${b.name.slice(0, 10)}:${b.visibility}`).join(","));
  // รันซ้ำไม่เปลี่ยนค่า
  const snap = JSON.stringify(cards.map((c) => [c.id, c.position, c.cardNo]));
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("pnpm", ["exec", "tsx", "scripts/backfill-kanban-v2-a.mts"], { encoding: "utf8", env: process.env });
  const again = await prisma.kanbanCard.findMany({ where: { tenantId: tid, systemId: SYS, status: "ACTIVE" }, orderBy: [{ columnId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }) as Any[];
  chk("K1.1-S2.7", "backfill รันซ้ำได้ (exit 0) และไม่เปลี่ยน position/cardNo", r.status === 0 && JSON.stringify(again.map((c) => [c.id, c.position, c.cardNo])) === snap, "idempotent", `exit=${r.status} ${(r.stderr || r.stdout || "").slice(-160)}`);

  // ═══ S3 ordering.ts (ต้องไม่ import prisma) ═══
  const ordSrc = readFileSync("src/lib/modules/kanban/ordering.ts", "utf8");
  chk("K1.1-S3.1", "ordering.ts ไม่ import prisma และใช้แพ็กเกจ fractional-indexing", !/@\/lib\/core\/db|@prisma\/client/.test(ordSrc) && /from ["']fractional-indexing["']/.test(ordSrc), "pure", "ไม่ตรง");
  const ord = (await import("@/lib/modules/kanban/ordering" as string)) as Record<string, (...a: Any[]) => Any>;
  const lib = (await import("fractional-indexing" as string)) as { generateKeyBetween: (a: string | null, b: string | null) => string };
  const k0 = ord.keyBetween(null, null); const k1 = ord.keyBetween(k0, null); const kMid = ord.keyBetween(k0, k1);
  chk("K1.1-S3.2", "keyBetween ตรงไลบรารี (null,null)=a0 · เรียง k0<kMid<k1", k0 === lib.generateKeyBetween(null, null) && k0 === "a0" && k0 < kMid && kMid < k1, "a0 <", `${k0} ${kMid} ${k1}`);
  const ks = ord.keysBetween(null, null, 5) as string[];
  chk("K1.1-S3.3", "keysBetween(null,null,5) ได้ 5 คีย์เรียงขึ้น", ks.length === 5 && ks.every((k, i) => i === 0 || ks[i - 1]! < k), "5 เรียง", ks.join(","));
  // fractional-indexing โต ~1 ตัวอักษร/6 แทรก (base62 แบ่งครึ่ง) ⇒ ต้อง ~250 แทรกจุดเดิมถึงเกิน 50 (Fable แก้: เดิมเขียน 60 ตามสัญชาตญาณ base2)
  let a: string | null = null; let b: string | null = ord.keyBetween(null, null); const grown: string[] = [];
  for (let i = 0; i < 260; i++) { const k: string = ord.keyBetween(a, b); grown.push(k); a = k; }
  chk("K1.1-S3.4", "แทรกจุดเดิม 260 ครั้ง → key ยาวเกิน 50 และ needsRebalance() = true", ord.needsRebalance(grown) === true && Math.max(...grown.map((k) => k.length)) > 50, "true", `maxLen=${Math.max(...grown.map((k) => k.length))}`);
  const rb = ord.rebalanceKeys(24) as string[];
  chk("K1.1-S3.5", "rebalanceKeys(24) → 24 คีย์สั้น เรียงขึ้น ไม่ซ้ำ", rb.length === 24 && new Set(rb).size === 24 && rb.every((k, i) => i === 0 || rb[i - 1]! < k) && Math.max(...rb.map((k) => k.length)) <= 4, "24 สั้น", `${rb.length} maxLen=${Math.max(...rb.map((k) => k.length))}`);
  chk("K1.1-S3.6", "needsRebalance([]) = false และคีย์สั้น = false", ord.needsRebalance([]) === false && ord.needsRebalance(rb) === false, "false", "true", "MAJOR");

  // ═══ S4 service เขียน position + sortOrder คู่กัน · getBoard เรียงตาม position ═══
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const bPatong = boards.find((x) => x.name === kq.KQC.boards.patong)!;
  const firstCol = columns.find((c) => c.boardId === bPatong.id)!;
  const before = cards.filter((c) => c.columnId === firstCol.id);
  const created = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: firstCol.id, title: "QC K1.1 การ์ดใหม่", labels: [] });
  const lastPos = before.map((c) => c.position).sort().at(-1) ?? "";
  chk("K1.1-S4.1", "createCard ได้ position ท้ายคอลัมน์ (> ทุกใบเดิม) + sortOrder ต่อท้าย + cardNo ถัดไป", !!created && typeof created.position === "string" && created.position > lastPos && created.sortOrder === before.length && created.cardNo === (bPatong.cardNoSeq as number) + 1, "ท้าย", `pos=${created?.position} sort=${created?.sortOrder} no=${created?.cardNo}`);
  const bNow = await prisma.kanbanBoard.findUnique({ where: { id: bPatong.id } }) as Any;
  chk("K1.1-S4.2", "cardNoSeq เพิ่มเป็น 25 หลังสร้าง", bNow?.cardNoSeq === (bPatong.cardNoSeq as number) + 1, String((bPatong.cardNoSeq as number) + 1), String(bNow?.cardNoSeq));
  const newCol = await svc.createColumn(tid, SYS, bPatong.id, "QC คอลัมน์ใหม่");
  const colsNow = await prisma.kanbanColumn.findMany({ where: { boardId: bPatong.id, status: "ACTIVE" } }) as Any[];
  chk("K1.1-S4.3", "createColumn ได้ position ท้ายสุด + sortOrder", !!newCol && typeof newCol.position === "string" && colsNow.filter((c) => c.id !== newCol.id).every((c) => c.position < newCol.position), "ท้าย", `${newCol?.position}`);
  const full = await svc.getBoard(tid, SYS, bPatong.id);
  const colOrderOk = full.columns.every((c: Any, i: number) => i === 0 || full.columns[i - 1].position <= c.position);
  const cardOrderOk = full.columns.every((c: Any) => c.cards.every((k: Any, i: number) => i === 0 || c.cards[i - 1].position <= k.position));
  chk("K1.1-S4.4", "getBoard เรียงคอลัมน์/การ์ดตาม position (fallback sortOrder)", colOrderOk && cardOrderOk && full.columns.at(-1).id === newCol.id, "เรียงตาม position", "ไม่เรียง");
  const nb = await svc.createBoard({ tenantId: tid, systemId: SYS, name: "QC K1.1 บอร์ดใหม่", unitId: E.units.patong, visibility: "PRIVATE", color: "BLUE", createdById: E.users.owner.userId });
  chk("K1.1-S4.5", "createBoard รับ unitId/visibility/color/createdById · default ใหม่ = PRIVATE", nb?.unitId === E.units.patong && nb?.visibility === "PRIVATE" && nb?.color === "BLUE" && nb?.createdById === E.users.owner.userId, "ครบ", JSON.stringify({ u: nb?.unitId, v: nb?.visibility, c: nb?.color }));
  const nb2 = await svc.createBoard({ tenantId: tid, systemId: SYS, name: "QC K1.1 บอร์ดใหม่ 2" });
  chk("K1.1-S4.6", "createBoard ไม่ระบุ visibility → PRIVATE (บอร์ดใหม่ default ปิด)", nb2?.visibility === "PRIVATE", "PRIVATE", String(nb2?.visibility));

  // ═══ S5 แจ้งเตือนตรงคน (บั๊กเดิม: ทั้งร้านเห็น) ═══
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  await svc.updateCard({ tenantId: tid, systemId: SYS, cardId: created.id, assigneeUserId: E.users.staff.pook.userId });
  const notes = await prisma.appNotification.findMany({ where: { tenantId: tid } }) as Any[];
  chk("K1.1-S5.1", "มอบหมายงาน → AppNotification 1 แถว recipientUserId = ผู้รับ (ไม่ใช่ null ทั้งร้าน)", notes.length === 1 && notes[0].recipientUserId === E.users.staff.pook.userId, "ตรงคน", JSON.stringify(notes.map((n) => n.recipientUserId)));
  await svc.updateCard({ tenantId: tid, systemId: SYS, cardId: created.id, assigneeUserId: E.users.staff.pook.userId });
  chk("K1.1-S5.2", "มอบหมายคนเดิมซ้ำ → ไม่แจ้งซ้ำ", (await prisma.appNotification.count({ where: { tenantId: tid } })) === 1, "1", String(await prisma.appNotification.count({ where: { tenantId: tid } })), "MAJOR");

  // ═══ S6 ข้อสอบเก่าไม่แตะ prod ═══
  const oldQc = readFileSync("scripts/qc-kanban-notify.mts", "utf8");
  chk("K1.1-S6.1", "qc-kanban-notify.mts ไม่ loadEnvFile('.env') ตรง (ใช้ qc-env-guard) + ตรวจ recipientUserId", !/loadEnvFile\(["']\.env["']\)/.test(oldQc) && /qc-env-guard/.test(oldQc) && /recipientUserId/.test(oldQc), "env-guard", "ยังแตะ prod/ไม่ตรวจ", "CRITICAL");

  // cleanup ของที่ข้อสอบสร้าง (คืน cardNoSeq ให้เท่า cardNo สูงสุด — ไม่งั้นรอบถัดไป S2.5 แดงหลอก)
  await prisma.kanbanCard.deleteMany({ where: { id: created.id } });
  await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${bPatong.id}'`);
  await prisma.kanbanColumn.deleteMany({ where: { id: newCol.id } });
  await prisma.kanbanBoard.deleteMany({ where: { id: { in: [nb.id, nb2.id] } } });
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.1 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
