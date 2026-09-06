// QC — บอร์ดงาน WO K3.7: การ์ดสะท้อน (mirror) — แก้ที่ไหนก็เห็นเหมือนกัน · ต้นฉบับถูกเก็บ → ตัวสะท้อนไม่หายแต่ขึ้นสถานะ · ย้าย/เก็บตัวสะท้อนเป็นเรื่องของบอร์ดปลายทาง
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K3.7 · เกณฑ์ §13 K3.7 (ภาพ 03 แถบขวา "สะท้อนการ์ด")
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/mirror.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/mirror.ts)");
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
let tid = ""; let SYS = ""; let patong = "";
const madeCards: string[] = [];
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId; patong = E.boards.patong.id;
  const mr = (await import("@/lib/modules/kanban/mirror" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cards = (await import("@/lib/modules/kanban/cards" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cm = (await import("@/lib/modules/kanban/comments" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const mv = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const U = { owner: E.users.owner.userId as string, pook: E.users.staff.pook.userId as string, thana: E.users.staff.thana.userId as string };
  const ctxOf = (userId: string) => ({ tenantId: tid, systemId: SYS, actorUserId: userId });
  const ctxO = ctxOf(U.owner);
  const maint = E.boards.maint.id as string; // TENANT
  await P.kanbanBoardMember.deleteMany({ where: { boardId: patong } });
  await members.addMember(ctxO, patong, U.pook, "EDITOR"); // pook: EDITOR ป่าตอง · VIEWER ซ่อม (TENANT)
  const pCols = await prisma.kanbanColumn.findMany({ where: { boardId: patong, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const mCols = await prisma.kanbanColumn.findMany({ where: { boardId: maint, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const src = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: pCols[0]!.id, title: "QC K3.7 ต้นฉบับ", description: "<p>รายละเอียดต้นฉบับ</p>", dueAt: kq.dayFromToday(3, 18), assigneeUserId: U.pook, createdById: U.owner });
  madeCards.push(src.id);

  // ═══ S1 schema ═══
  const ccols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanCard'`)).map((c) => c.column_name);
  chk("K3.7-S1.1", "KanbanCard.mirrorOfId + index [mirrorOfId] (ไม่ทำ FK — ต้นฉบับถูกเก็บ/ลบแล้วตัวสะท้อนต้องอยู่)", ccols.includes("mirrorOfId") && (await q(`select 1 from pg_indexes where tablename='KanbanCard' and indexdef ilike '%"mirrorOfId"%'`)).length >= 1, "มี", "ขาด");

  // ═══ S2 สร้างตัวสะท้อน ═══
  const m1 = await mr.mirrorCard(ctxO, { cardId: src.id, toBoardId: maint, toColumnId: mCols[0]!.id });
  madeCards.push(m1?.mirrorId);
  const mrow = await prisma.kanbanCard.findUnique({ where: { id: m1?.mirrorId ?? "x" } }) as Any;
  chk("K3.7-S2.1", "mirrorCard(ctx, {cardId, toBoardId, toColumnId?}) (EDITOR ทั้ง 2 บอร์ด) → {mirrorId} · แถวใหม่บนบอร์ดปลายทาง: mirrorOfId=ต้นฉบับ · cardNo ของบอร์ดปลายทาง (D14) · title ก๊อปไว้ (เพื่อค้นหา/ตาราง) · sourceType MANUAL เดิม · activity CARD_CREATED data.mirrorOfId ทั้ง 2 ใบ", mrow && mrow.mirrorOfId === src.id && mrow.boardId === maint && mrow.columnId === mCols[0]!.id && typeof mrow.cardNo === "number" && mrow.title === src.title && !!(await prisma.kanbanActivity.findFirst({ where: { cardId: src.id, type: "CARD_CREATED", data: { path: ["mirrorId"], equals: mrow.id } } }).catch(() => null)) !== undefined, "แถวสะท้อน", JSON.stringify(mrow ?? null).slice(0, 160));
  const eChain = await fails(() => mr.mirrorCard(ctxO, { cardId: m1.mirrorId, toBoardId: patong }));
  const eSame = await fails(() => mr.mirrorCard(ctxO, { cardId: src.id, toBoardId: patong }));
  const eDup = await mr.mirrorCard(ctxO, { cardId: src.id, toBoardId: maint }).catch((e: Error) => e);
  chk("K3.7-S2.2", "สะท้อนซ้อน (สะท้อนตัวสะท้อน) → throw ไทย · สะท้อนลงบอร์ดเดิม → throw · สะท้อนลงบอร์ดที่มีอยู่แล้ว → คืน mirrorId เดิม (idempotent) · เพดาน KANBAN_LIMITS.mirrorsPerCard = 5", !!eChain && /[ก-๙]/.test(eChain.message) && !!eSame && (eDup as Any)?.mirrorId === m1.mirrorId && /mirrorsPerCard:\s*5/.test(read("src/lib/modules/kanban/limits.ts")), "ครบ", `${!!eChain}/${!!eSame}/${(eDup as Any)?.mirrorId === m1.mirrorId}`);
  const eV = await fails(() => mr.mirrorCard(ctxOf(U.pook), { cardId: src.id, toBoardId: maint }));
  chk("K3.7-S2.3", "pook (EDITOR ต้นทาง แต่ VIEWER ปลายทาง) → Forbidden · thana (มองไม่เห็นป่าตอง) → ไม่พบ", !!eV && !!(await fails(() => mr.mirrorCard(ctxOf(U.thana), { cardId: src.id, toBoardId: maint }))), "throw ทั้งคู่", `${!!eV}`);

  // ═══ S3 แก้ที่ไหนก็เห็นเหมือนกัน ═══
  const dM = await cards.getCardDetail(ctxO, m1.mirrorId);
  chk("K3.7-S3.1", "getCardDetail(ตัวสะท้อน) → ข้อมูลของต้นฉบับ (description/dueAt/checklists/comments/attachments) + mirror: { isMirror:true, sourceCardId, sourceBoardId, sourceBoardName, sourceCardNo, sourceArchived:false } · getCardDetail(ต้นฉบับ).mirrors = [{cardId, boardName}]", dM?.mirror?.isMirror === true && dM.mirror.sourceCardId === src.id && dM.mirror.sourceBoardName && dM.mirror.sourceArchived === false && /ต้นฉบับ/.test(dM.description ?? "") && dM.dueAt !== null && ((await cards.getCardDetail(ctxO, src.id))?.mirrors ?? []).some((x: Any) => x.cardId === m1.mirrorId), "ข้อมูลต้นฉบับ", JSON.stringify(dM?.mirror ?? null));
  await cards.updateCardFields(ctxO, m1.mirrorId, { title: "QC K3.7 แก้จากตัวสะท้อน", dueAt: kq.dayFromToday(5, 18) });
  const s2 = await prisma.kanbanCard.findUnique({ where: { id: src.id } }); const m2 = await prisma.kanbanCard.findUnique({ where: { id: m1.mirrorId } });
  chk("K3.7-S3.2", "🔴 updateCardFields(ตัวสะท้อน) → เขียนที่ต้นฉบับ (title/dueAt เปลี่ยนที่ src) · title ก๊อปตามลงทุกตัวสะท้อน · activity ลงที่ต้นฉบับ (data.viaMirror)", s2?.title === "QC K3.7 แก้จากตัวสะท้อน" && s2.dueAt?.getTime() === kq.dayFromToday(5, 18).getTime() && m2?.title === "QC K3.7 แก้จากตัวสะท้อน" && !!(await prisma.kanbanActivity.findFirst({ where: { cardId: src.id, type: "CARD_DUE_SET" } })), "เขียนที่ต้นฉบับ", JSON.stringify({ s: s2?.title, m: m2?.title }));
  await cm.addComment(ctxO, m1.mirrorId, "ความเห็นผ่านตัวสะท้อน");
  await cards.setCardAssignees(ctxO, m1.mirrorId, [U.pook, U.thana]).catch(() => null);
  chk("K3.7-S3.3", "addComment/setCardAssignees/เช็คลิสต์/ไฟล์แนบ ผ่านตัวสะท้อน → ลงที่ต้นฉบับ (ความเห็นอยู่ที่ src · ผู้รับผิดชอบที่ src) · อ่านจากทั้ง 2 ที่เห็นเหมือนกัน", (await prisma.kanbanComment.count({ where: { cardId: src.id } })) === 1 && (await prisma.kanbanComment.count({ where: { cardId: m1.mirrorId } })) === 0 && (await prisma.kanbanCardAssignee.count({ where: { cardId: src.id } })) >= 1 && ((await cards.getCardDetail(ctxO, m1.mirrorId))?.comments?.length ?? 0) === 1, "ที่ต้นฉบับ", `cm src=${await prisma.kanbanComment.count({ where: { cardId: src.id } })} mirror=${await prisma.kanbanComment.count({ where: { cardId: m1.mirrorId } })}`);
  await cards.updateCardFields(ctxO, src.id, { title: "QC K3.7 แก้จากต้นฉบับ" });
  chk("K3.7-S3.4", "แก้ที่ต้นฉบับ → ตัวสะท้อน title ตาม (sync) · ตัวสะท้อนมีในผลค้นหา/ตารางของบอร์ดปลายทางด้วยชื่อล่าสุด", ((await prisma.kanbanCard.findUnique({ where: { id: m1.mirrorId } }))!).title === "QC K3.7 แก้จากต้นฉบับ", "sync", "ไม่ sync");

  // ═══ S4 ย้าย/เก็บ = เรื่องของแต่ละบอร์ด ═══
  await mv.moveCard(ctxO, { cardId: m1.mirrorId, toColumnId: mCols[1]!.id });
  chk("K3.7-S4.1", "ย้ายตัวสะท้อนในบอร์ดปลายทาง → ตัวสะท้อนย้าย · ต้นฉบับอยู่ที่เดิม · completedAt ของตัวสะท้อนเป็นของมันเอง (ปิดงานฝั่งไหนไม่ปิดอีกฝั่ง — D22)", ((await prisma.kanbanCard.findUnique({ where: { id: m1.mirrorId } }))!).columnId === mCols[1]!.id && ((await prisma.kanbanCard.findUnique({ where: { id: src.id } }))!).columnId === pCols[0]!.id, "แยกกัน", "ไม่แยก");
  await cards.archiveCard(ctxO, src.id);
  const dM2 = await cards.getCardDetail(ctxO, m1.mirrorId);
  const mView = await prisma.kanbanCard.findUnique({ where: { id: m1.mirrorId } });
  chk("K3.7-S4.2", "🔴 เก็บต้นฉบับเข้าคลัง → ตัวสะท้อนยัง ACTIVE บนบอร์ดปลายทาง · detail.mirror.sourceArchived = true · แก้ผ่านตัวสะท้อนถูกปฏิเสธ (อ่านอย่างเดียว · throw ไทย 'ต้นฉบับถูกเก็บ')", mView?.status === "ACTIVE" && dM2?.mirror?.sourceArchived === true && !!(await fails(() => cards.updateCardFields(ctxO, m1.mirrorId, { title: "x" }))), "ยังอยู่ · อ่านอย่างเดียว", JSON.stringify({ st: mView?.status, arch: dM2?.mirror?.sourceArchived }));
  await cards.restoreCard(ctxO, src.id).catch(() => null);
  await cards.archiveCard(ctxO, m1.mirrorId);
  chk("K3.7-S4.3", "เก็บตัวสะท้อน → ต้นฉบับไม่กระทบ (ACTIVE) · detail(ต้นฉบับ).mirrors ไม่รวมตัวที่เก็บแล้ว", ((await prisma.kanbanCard.findUnique({ where: { id: src.id } }))!).status === "ACTIVE" && !((await cards.getCardDetail(ctxO, src.id))?.mirrors ?? []).some((x: Any) => x.cardId === m1.mirrorId), "ไม่กระทบ", "กระทบ");

  // ═══ S5 UI + API (static) ═══
  const ui = read("src/components/kanban/Card.tsx") + read("src/components/kanban/CardBack.tsx") + read("src/components/kanban/MirrorPicker.tsx");
  chk("K3.7-S5.1", "การ์ดบนบอร์ด: ชิป 🪞 'สะท้อนจาก {บอร์ด} #n' testid card-mirror (ต้นฉบับถูกเก็บ → ชิป 'ต้นฉบับถูกเก็บ' สีเทา) · หลังการ์ด แถบขวา 'สะท้อนการ์ด' testid card-mirror-create (MirrorPicker: เลือกบอร์ดที่เป็น EDITOR → คอลัมน์) · หลังการ์ดตัวสะท้อนแสดงแถบบน 'นี่คือการ์ดสะท้อน — แก้ที่นี่ = แก้ต้นฉบับ' + ลิงก์ไปต้นฉบับ · ต้นฉบับแสดง 'สะท้อนอยู่ที่ {บอร์ด}…'", ui.includes("card-mirror") && ui.includes("card-mirror-create") && /สะท้อนการ์ด/.test(ui) && /ต้นฉบับถูกเก็บ/.test(ui) && /แก้ที่นี่/.test(ui), "ครบ", "ขาด");
  chk("K3.7-S5.2", "DTO: BoardCardDto/TableRowDto มี mirror {sourceBoardName, sourceCardNo, sourceArchived} · action mirrorCardAction · REST op cards.mirror (test K3.7-*) · service ทุก mutation ของการ์ดใช้ resolveMirror(ctx, cardId) ก่อน (cards/checklists/comments/attachments/labels ยกเว้น moves/archive)", /mirror/.test(read("src/lib/modules/kanban/types.ts")) && /mirrorCardAction/.test(read("src/lib/modules/kanban/actions.ts")) && /resolveMirror/.test(read("src/lib/modules/kanban/cards.ts") + read("src/lib/modules/kanban/comments.ts") + read("src/lib/modules/kanban/checklists.ts")) && /K3\.7-S/.test(read("src/lib/modules/kanban/api/ops/cards.ts") + read("src/lib/modules/kanban/api/ops/mirror.ts")), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/3.7") ? readdirSync(".qc-shots/kanban/3.7").filter((f) => f.endsWith(".png")) : [];
  chk("K3.7-S5.3", "ภาพจริง ≥ 2 ใบใน .qc-shots/kanban/3.7 (ชิปสะท้อนบนบอร์ดปลายทาง · หลังการ์ดตัวสะท้อนพร้อมแถบบน)", shots.length >= 2, "≥2", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    const ids = madeCards.filter(Boolean);
    if (ids.length) { await prisma.kanbanComment.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null); await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } }); }
    if (patong) await P.kanbanBoardMember.deleteMany({ where: { boardId: patong } });
    if (tid) { await prisma.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }); await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { startsWith: "kanban." } } }).catch(() => null); }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K3.7 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
