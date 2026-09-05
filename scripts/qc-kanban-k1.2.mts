// QC — บอร์ดงาน WO K1.2: ป้ายกำกับจริง (KanbanLabel/KanbanCardLabel 6 สี) + ผู้รับผิดชอบหลายคน (KanbanCardAssignee) + backfill B
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.2
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/labels.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/labels.ts)");
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
const fails = async (f: () => Promise<unknown>): Promise<string | null> => { try { await f(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); } };
const P = prisma as Any;
let otherTid = "";
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId };
  const labels = (await import("@/lib/modules/kanban/labels" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cardsSvc = (await import("@/lib/modules/kanban/cards" as string).catch(() => import("@/lib/modules/kanban/service" as string))) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;

  // ═══ S1 schema ═══
  const tables = (await q<{ table_name: string }>(`select table_name from information_schema.tables where table_name in ('KanbanLabel','KanbanCardLabel','KanbanCardAssignee')`)).map((r) => r.table_name);
  chk("K1.2-S1.1", "ตาราง KanbanLabel · KanbanCardLabel · KanbanCardAssignee มีจริง", ["KanbanLabel", "KanbanCardLabel", "KanbanCardAssignee"].every((t) => tables.includes(t)), "3 ตาราง", tables.join(","));
  const idx = await q<{ tablename: string; indexdef: string }>(`select tablename, indexdef from pg_indexes where tablename in ('KanbanLabel','KanbanCardLabel','KanbanCardAssignee')`);
  chk("K1.2-S1.2", "unique(boardId,name) บน KanbanLabel · PK (cardId,labelId) · PK (cardId,userId) · index (tenantId,userId) บน assignee", idx.some((i) => i.tablename === "KanbanLabel" && /UNIQUE/.test(i.indexdef) && /"boardId", "name"/.test(i.indexdef)) && idx.some((i) => i.tablename === "KanbanCardLabel" && /"cardId", "labelId"/.test(i.indexdef)) && idx.some((i) => i.tablename === "KanbanCardAssignee" && /"cardId", "userId"/.test(i.indexdef)) && idx.some((i) => i.tablename === "KanbanCardAssignee" && /"tenantId", "userId"/.test(i.indexdef)), "ครบ", idx.map((i) => i.indexdef.replace(/.*USING btree /, "")).join(" | ").slice(0, 200), "MAJOR");

  // ═══ S2 backfill B (จาก labels Json + assigneeUserId ของ seed) ═══
  const bPatong = E.boards.patong.id as string;
  const seedCards = await prisma.kanbanCard.findMany({ where: { boardId: bPatong, status: "ACTIVE" } }) as Any[];
  const jsonNames = new Set<string>(); for (const c of seedCards) for (const n of (c.labels as string[]) ?? []) jsonNames.add(n);
  const rowsL = await P.kanbanLabel.findMany({ where: { boardId: bPatong } }) as Any[];
  chk("K1.2-S2.1", "backfill: ชื่อป้ายจาก labels Json ของบอร์ดป่าตอง → KanbanLabel ครบทุกชื่อ ไม่เกิน", jsonNames.size > 0 && [...jsonNames].every((n) => rowsL.some((l) => l.name === n)) && rowsL.length === jsonNames.size, `${jsonNames.size} ป้าย`, `${rowsL.length} แถว`);
  chk("K1.2-S2.2", "สีป้ายที่ backfill อยู่ใน 6 สี", rowsL.every((l) => ["SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE"].includes(l.color)), "6 สี", rowsL.map((l) => l.color).join(","));
  let linkOk = true;
  for (const c of seedCards) {
    const links = await P.kanbanCardLabel.findMany({ where: { cardId: c.id } }) as Any[];
    const names = links.map((l) => rowsL.find((x) => x.id === l.labelId)?.name).sort().join("|");
    if (names !== [...((c.labels as string[]) ?? [])].sort().join("|")) linkOk = false;
  }
  chk("K1.2-S2.3", "backfill: แถวเชื่อม KanbanCardLabel ตรงกับ labels Json ทุกการ์ด", linkOk, "ตรง", "ต่าง");
  const withAssignee = seedCards.filter((c) => c.assigneeUserId);
  const asg = await P.kanbanCardAssignee.findMany({ where: { cardId: { in: seedCards.map((c) => c.id) } } }) as Any[];
  chk("K1.2-S2.4", "backfill: assigneeUserId → KanbanCardAssignee 1 แถวต่อการ์ด (เท่าจำนวนการ์ดที่มีผู้รับ)", asg.length === withAssignee.length && withAssignee.every((c) => asg.some((a) => a.cardId === c.id && a.userId === c.assigneeUserId)), String(withAssignee.length), String(asg.length));
  const snap = JSON.stringify([rowsL.map((l) => l.id).sort(), asg.map((a) => a.cardId + a.userId).sort()]);
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("pnpm", ["exec", "tsx", "scripts/backfill-kanban-v2-b.mts"], { encoding: "utf8", env: process.env });
  const rowsL2 = await P.kanbanLabel.findMany({ where: { boardId: bPatong } }) as Any[];
  const asg2 = await P.kanbanCardAssignee.findMany({ where: { cardId: { in: seedCards.map((c) => c.id) } } }) as Any[];
  chk("K1.2-S2.5", "backfill B รันซ้ำ exit 0 และไม่เพิ่ม/เปลี่ยนแถว", r.status === 0 && JSON.stringify([rowsL2.map((l) => l.id).sort(), asg2.map((a) => a.cardId + a.userId).sort()]) === snap, "idempotent", `exit=${r.status} ${(r.stderr || "").slice(-120)}`);

  // ═══ S3 CRUD ป้าย ═══
  const nb = await svc.createBoard({ tenantId: tid, systemId: SYS, name: "QC K1.2 บอร์ดป้าย", createdById: E.users.owner.userId });
  const l1 = await labels.createLabel(ctx, nb.id, { name: "ด่วน", color: "RED" });
  chk("K1.2-S3.1", "createLabel → {id,name,color} + boardId", typeof l1?.id === "string" && l1.name === "ด่วน" && l1.color === "RED", "ok", JSON.stringify(l1).slice(0, 100));
  const dup = await fails(() => labels.createLabel(ctx, nb.id, { name: "ด่วน", color: "BLUE" }));
  chk("K1.2-S3.2", "ชื่อป้ายซ้ำในบอร์ดเดียว → error ไทย", !!dup && /[ก-๙]/.test(dup), "error ไทย", String(dup).slice(0, 80));
  const badColor = await fails(() => labels.createLabel(ctx, nb.id, { name: "สีแปลก", color: "PINK" }));
  chk("K1.2-S3.3", "สีนอก 6 สี → error (ไม่ใช่ 500 ดิบ)", !!badColor, "error", String(badColor).slice(0, 80), "MAJOR");
  for (let i = 0; i < 29; i++) await labels.createLabel(ctx, nb.id, { name: `ป้าย${i}`, color: ["SLATE", "BLUE", "GREEN", "AMBER", "PURPLE"][i % 5] });
  const over = await fails(() => labels.createLabel(ctx, nb.id, { name: "ป้ายที่ 31", color: "BLUE" }));
  chk("K1.2-S3.4", "ป้ายเกิน 30 ต่อบอร์ด → error ไทย", !!over && /[ก-๙]/.test(over) && (await P.kanbanLabel.count({ where: { boardId: nb.id } })) === 30, "30 + error", `${await P.kanbanLabel.count({ where: { boardId: nb.id } })} ${String(over).slice(0, 60)}`);
  const list = await labels.listLabels(ctx, nb.id);
  chk("K1.2-S3.5", "listLabels คืน 30 เรียงตาม sortOrder/ชื่อ พร้อม cardCount", Array.isArray(list) && list.length === 30 && list.every((l: Any) => typeof l.cardCount === "number"), "30 + cardCount", `${list?.length} ${JSON.stringify(list?.[0]).slice(0, 80)}`);
  await labels.updateLabel(ctx, l1.id, { name: "ด่วนมาก", color: "AMBER" });
  const l1b = await P.kanbanLabel.findUnique({ where: { id: l1.id } });
  chk("K1.2-S3.6", "updateLabel เปลี่ยนชื่อ/สี", l1b?.name === "ด่วนมาก" && l1b?.color === "AMBER", "ด่วนมาก/AMBER", `${l1b?.name}/${l1b?.color}`);
  const col = (await prisma.kanbanColumn.findFirst({ where: { boardId: nb.id, status: "ACTIVE" } }))!;
  const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col.id, title: "การ์ดทดสอบป้าย" });
  await labels.setCardLabels(ctx, card.id, [l1.id, list[1].id]);
  const links = await P.kanbanCardLabel.findMany({ where: { cardId: card.id } }) as Any[];
  const cardNow = await prisma.kanbanCard.findUnique({ where: { id: card.id } }) as Any;
  chk("K1.2-S3.7", "setCardLabels → แถวเชื่อม 2 + labels Json (ชื่อ) เขียนคู่ช่วงเปลี่ยนผ่าน", links.length === 2 && Array.isArray(cardNow.labels) && (cardNow.labels as string[]).includes("ด่วนมาก") && (cardNow.labels as string[]).length === 2, "2/2", `${links.length}/${JSON.stringify(cardNow.labels)}`);
  await labels.setCardLabels(ctx, card.id, [l1.id]);
  chk("K1.2-S3.8", "setCardLabels แทนที่ทั้งชุด (เหลือ 1)", (await P.kanbanCardLabel.count({ where: { cardId: card.id } })) === 1, "1", String(await P.kanbanCardLabel.count({ where: { cardId: card.id } })));
  const foreignLabel = rowsL[0]!; // ป้ายของบอร์ดป่าตอง
  const cross = await fails(() => labels.setCardLabels(ctx, card.id, [foreignLabel.id]));
  chk("K1.2-S3.9", "ใส่ป้ายของบอร์ดอื่นให้การ์ด → error (ไม่เขียน)", !!cross && (await P.kanbanCardLabel.count({ where: { cardId: card.id, labelId: foreignLabel.id } })) === 0, "error", String(cross).slice(0, 80));
  await labels.deleteLabel(ctx, l1.id);
  chk("K1.2-S3.10", "deleteLabel → ป้ายหาย + ปลดจากการ์ด + Json ไม่มีชื่อนั้น", (await P.kanbanLabel.count({ where: { id: l1.id } })) === 0 && (await P.kanbanCardLabel.count({ where: { cardId: card.id } })) === 0 && !(((await prisma.kanbanCard.findUnique({ where: { id: card.id } })) as Any).labels as string[]).includes("ด่วนมาก"), "หายหมด", "ยังค้าง");

  // ═══ S4 ผู้รับผิดชอบหลายคน ═══
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
  const thana = E.users.staff.thana.userId; const pook = E.users.staff.pook.userId; const kitti = E.users.staff.kitti.userId;
  const setA = cardsSvc.setCardAssignees ?? svc.setCardAssignees;
  await setA(ctx, card.id, [thana, pook]);
  const a1 = await P.kanbanCardAssignee.findMany({ where: { cardId: card.id } }) as Any[];
  const n1 = await prisma.appNotification.findMany({ where: { tenantId: tid } }) as Any[];
  const c1 = await prisma.kanbanCard.findUnique({ where: { id: card.id } }) as Any;
  chk("K1.2-S4.1", "setCardAssignees 2 คน → 2 แถว + แจ้งเตือน 2 ใบ recipientUserId ตรงคน + assigneeUserId (ช่องเดิม) = คนแรก", a1.length === 2 && n1.length === 2 && new Set(n1.map((n) => n.recipientUserId)).size === 2 && n1.every((n) => [thana, pook].includes(n.recipientUserId)) && c1.assigneeUserId === thana, "2/2/thana", `${a1.length}/${n1.length}/${c1.assigneeUserId === thana}`);
  await setA(ctx, card.id, [thana, pook, kitti]);
  const n2 = await prisma.appNotification.findMany({ where: { tenantId: tid } }) as Any[];
  chk("K1.2-S4.2", "เพิ่มคนที่ 3 → แจ้งเฉพาะคนใหม่ (รวม 3 ใบ ไม่แจ้งซ้ำ 2 คนเดิม)", n2.length === 3 && n2.filter((n) => n.recipientUserId === kitti).length === 1, "3", String(n2.length));
  await setA(ctx, card.id, [pook]);
  const a3 = await P.kanbanCardAssignee.findMany({ where: { cardId: card.id } }) as Any[];
  const c3 = await prisma.kanbanCard.findUnique({ where: { id: card.id } }) as Any;
  chk("K1.2-S4.3", "ถอดเหลือ 1 คน → แถวเดียว · assigneeUserId = pook · ไม่แจ้งเพิ่ม", a3.length === 1 && a3[0].userId === pook && c3.assigneeUserId === pook && (await prisma.appNotification.count({ where: { tenantId: tid } })) === 3, "1/pook/3", `${a3.length}/${c3.assigneeUserId === pook}/${await prisma.appNotification.count({ where: { tenantId: tid } })}`);
  await setA(ctx, card.id, []);
  const c4 = await prisma.kanbanCard.findUnique({ where: { id: card.id } }) as Any;
  chk("K1.2-S4.4", "ถอดหมด → 0 แถว · assigneeUserId null", (await P.kanbanCardAssignee.count({ where: { cardId: card.id } })) === 0 && c4.assigneeUserId === null, "0/null", `${c4.assigneeUserId}`);
  const noMember = await fails(() => setA(ctx, card.id, [E.users.noPerm.userId, "user_does_not_exist"]));
  chk("K1.2-S4.5", "ผู้ใช้ที่ไม่ใช่ membership ของร้าน → error ไทย ไม่เขียนบางส่วน", !!noMember && (await P.kanbanCardAssignee.count({ where: { cardId: card.id } })) === 0, "error", String(noMember).slice(0, 80));
  // my-tasks เห็นการ์ดที่เป็นผู้รับคนที่ 2
  await setA(ctx, card.id, [thana, pook]);
  const myPook = await svc.listMyCards(tid, SYS, pook) as Any[];
  chk("K1.2-S4.6", "listMyCards ของคนที่ 2 (pook) เห็นการ์ดนี้ (อ่านจากตาราง assignee ไม่ใช่แค่ช่องเดิม)", myPook.some((c) => c.id === card.id), "เห็น", "ไม่เห็น");
  // ผู้รับที่ backfill มา (seed) ยังอยู่ใน my-tasks
  const myKitti = await svc.listMyCards(tid, SYS, kitti) as Any[];
  chk("K1.2-S4.7", "listMyCards ของ kitti ยังเห็นการ์ด seed ที่ backfill มา (≥ 5 ใบ)", myKitti.length >= 5, "≥5", String(myKitti.length), "MAJOR");

  // ═══ S5 ข้ามร้าน ═══
  const t2 = await prisma.tenant.create({ data: { name: "QC K1.2 อื่น", slug: `qc-k12-other-${Date.now()}` } }); otherTid = t2.id;
  const s2 = await (await import("@/lib/modules/system/service")).createSystem(t2.id, "KANBAN", "บอร์ด B");
  const ctxB = { tenantId: t2.id, systemId: s2.id, actorUserId: E.users.owner.userId };
  const crossLabel = await fails(() => labels.setCardLabels(ctxB, card.id, [list[2].id]));
  const crossAsg = await fails(() => setA(ctxB, card.id, [thana]));
  const crossList = await labels.listLabels(ctxB, nb.id).catch(() => "ERR");
  chk("K1.2-S5.1", "ร้านอื่นแตะการ์ด/ป้ายของเรา → error/ว่าง ไม่เขียน", !!crossLabel && !!crossAsg && (crossList === "ERR" || (Array.isArray(crossList) && crossList.length === 0)) && (await P.kanbanCardAssignee.count({ where: { cardId: card.id } })) === 2, "ปฏิเสธ", `${String(crossLabel).slice(0, 40)} / ${String(crossAsg).slice(0, 40)} / ${JSON.stringify(crossList).slice(0, 40)}`);

  // cleanup
  await P.kanbanCardAssignee.deleteMany({ where: { cardId: card.id } });
  await P.kanbanCardLabel.deleteMany({ where: { cardId: card.id } });
  await prisma.kanbanCard.deleteMany({ where: { boardId: nb.id } });
  await P.kanbanLabel.deleteMany({ where: { boardId: nb.id } });
  await prisma.kanbanColumn.deleteMany({ where: { boardId: nb.id } });
  await prisma.kanbanBoard.deleteMany({ where: { id: nb.id } });
  await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  if (otherTid) { for (const m of ["appSystem", "tenant"]) { try { if (m === "tenant") await prisma.tenant.delete({ where: { id: otherTid } }); else await P[m].deleteMany({ where: { tenantId: otherTid } }); } catch { /* */ } } }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
