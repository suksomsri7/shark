// QC — บอร์ดงาน WO K1.4: ย้ายการ์ด/คอลัมน์ (fractional · concurrency · neighbor fallback · rebalance) + done column/completedAt + WIP + cardNo unique
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.4
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/moves.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/moves.ts)");
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
const orderOf = async (columnId: string) => (await prisma.kanbanCard.findMany({ where: { columnId, status: "ACTIVE" }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }) as Any[]);
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId };
  const moves = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const ord = (await import("@/lib/modules/kanban/ordering" as string)) as Record<string, (...a: Any[]) => Any>;

  // บอร์ดทดสอบของตัวเอง 3 คอลัมน์ 6 การ์ด
  const nb = await svc.createBoard({ tenantId: tid, systemId: SYS, name: "QC K1.4 ย้าย", createdById: E.users.owner.userId });
  const cols0 = await prisma.kanbanColumn.findMany({ where: { boardId: nb.id, status: "ACTIVE" }, orderBy: { position: "asc" } }) as Any[];
  const [cA, cB, cC] = cols0; // default 3 คอลัมน์ ของ createBoard
  const mk = async (col: string, t: string) => svc.createCard({ tenantId: tid, systemId: SYS, columnId: col, title: t });
  const a1 = await mk(cA.id, "A1"); const a2 = await mk(cA.id, "A2"); const a3 = await mk(cA.id, "A3"); const a4 = await mk(cA.id, "A4");
  const b1 = await mk(cB.id, "B1"); const b2 = await mk(cB.id, "B2");

  // ═══ S1 ย้ายในคอลัมน์/ข้ามคอลัมน์ ลำดับคง ═══
  const r1 = await moves.moveCard(ctx, { cardId: a4.id, toColumnId: cA.id, beforeCardId: a2.id });
  chk("K1.4-S1.1", "ย้าย A4 ไปก่อน A2 (คอลัมน์เดียว) → ok · ลำดับ A1,A4,A2,A3", r1?.ok === true && (await orderOf(cA.id)).map((c) => c.title).join() === "A1,A4,A2,A3", "A1,A4,A2,A3", (await orderOf(cA.id)).map((c) => c.title).join());
  const r2 = await moves.moveCard(ctx, { cardId: a1.id, toColumnId: cB.id, afterCardId: b1.id });
  chk("K1.4-S1.2", "ย้าย A1 ไปคอลัมน์ B หลัง B1 → B1,A1,B2 · A เหลือ A4,A2,A3", r2?.ok === true && (await orderOf(cB.id)).map((c) => c.title).join() === "B1,A1,B2" && (await orderOf(cA.id)).map((c) => c.title).join() === "A4,A2,A3", "B1,A1,B2", (await orderOf(cB.id)).map((c) => c.title).join());
  const r3 = await moves.moveCard(ctx, { cardId: a3.id, toColumnId: cC.id });
  chk("K1.4-S1.3", "ย้ายไปคอลัมน์ว่างไม่ระบุเพื่อนบ้าน → ท้าย (placedAt end)", r3?.ok === true && r3?.placedAt === "end" && (await orderOf(cC.id)).map((c) => c.title).join() === "A3", "end", JSON.stringify(r3));
  const sortDual = await orderOf(cB.id);
  chk("K1.4-S1.4", "dual-write: sortOrder ในคอลัมน์ B เรียง 0,1,2 ตามลำดับ position (โค้ดเก่าอ่านได้ถูก)", sortDual.map((c) => c.sortOrder).join() === "0,1,2", "0,1,2", sortDual.map((c) => c.sortOrder).join(), "MAJOR");
  chk("K1.4-S1.5", "response มี position ใหม่ (string) และ updatedAt", typeof r2?.position === "string" && !!r2?.card?.updatedAt, "position", JSON.stringify(r2).slice(0, 100), "MAJOR");

  // ═══ S2 เพื่อนบ้านหาย / การ์ดถูกเก็บ / ข้ามบอร์ด ═══
  await svc.archiveCard(tid, SYS, b2.id);
  const r4 = await moves.moveCard(ctx, { cardId: a2.id, toColumnId: cB.id, afterCardId: b2.id });
  chk("K1.4-S2.1", "เพื่อนบ้านถูกเก็บระหว่างลาก → วางท้ายคอลัมน์ + placedAt end (ไม่ล้ม)", r4?.ok === true && r4?.placedAt === "end" && (await orderOf(cB.id)).map((c) => c.title).join() === "B1,A1,A2", "end", JSON.stringify(r4).slice(0, 80));
  const r5 = await moves.moveCard(ctx, { cardId: b2.id, toColumnId: cA.id });
  chk("K1.4-S2.2", "ย้ายการ์ดที่ถูกเก็บแล้ว → ok:false code CARD_ARCHIVED", r5?.ok === false && r5?.code === "CARD_ARCHIVED", "CARD_ARCHIVED", JSON.stringify(r5));
  const patongCol = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" } }))!;
  const r6 = await moves.moveCard(ctx, { cardId: a2.id, toColumnId: patongCol.id });
  chk("K1.4-S2.3", "ย้ายไปคอลัมน์ของบอร์ดอื่น → ok:false (ไม่ย้าย)", r6?.ok === false && (await prisma.kanbanCard.findUnique({ where: { id: a2.id } }))?.columnId === cB.id, "ok:false", JSON.stringify(r6));

  // ═══ S3 concurrency: 20 ตัวย้ายมาจุดเดียวพร้อมกัน ═══
  const many: Any[] = [];
  for (let i = 0; i < 20; i++) many.push(await mk(cC.id, `C${i}`));
  const target = (await orderOf(cB.id))[0]; // B1
  await Promise.all(many.map((c) => moves.moveCard(ctx, { cardId: c.id, toColumnId: cB.id, afterCardId: target.id })));
  const afterB = await orderOf(cB.id);
  const positions = afterB.map((c) => c.position as string);
  chk("K1.4-S3.1", "20 ย้ายพร้อมกันหลัง B1 → ทั้งหมดอยู่คอลัมน์ B (23 ใบ) ไม่มีใบหาย", afterB.length === 23 && many.every((m) => afterB.some((c) => c.id === m.id)), "23", String(afterB.length));
  chk("K1.4-S3.2", "ลำดับ deterministic: B1 ยังอยู่หัว · position ไม่ซ้ำ (หรือซ้ำแล้วแตกด้วย createdAt ให้เรียงได้)", afterB[0]!.title === "B1" && (new Set(positions).size === positions.length || afterB.every((c, i) => i === 0 || c.position >= afterB[i - 1]!.position)), "B1 หัว · เรียงได้", `${afterB[0]?.title} uniq=${new Set(positions).size}/${positions.length}`);
  // โหลดใหม่ผ่าน getBoard ลำดับตรงกับ orderOf
  const full = await svc.getBoard(tid, SYS, nb.id);
  const colB = full.columns.find((c: Any) => c.id === cB.id);
  chk("K1.4-S3.3", "getBoard เรียงคอลัมน์ B ตรงกับ position (หลังโหลดใหม่)", colB.cards.map((c: Any) => c.id).join() === afterB.map((c) => c.id).join(), "ตรง", "ต่าง");

  // ═══ S4 rebalance — Fable แก้ตามหลักฐาน builder: แทรก "หัวคอลัมน์" ไม่ทำคีย์ยาว (generateKeyBetween(null,head) ลดค่า) ·
  //     ต้องแทรก "ระหว่างคู่เดิม" (~1 ตัวอักษร/6 ครั้ง → >50 ราว ๆ รอบ 288) · ใช้คอลัมน์ใหม่ D กันปนกับ S1–S3 ═══
  const cD = await svc.createColumn(tid, SYS, nb.id, "D rebalance");
  const x1 = await mk(cD.id, "X1"); const x2 = await mk(cD.id, "X2");
  let prev = x2;
  for (let i = 0; i < 300; i++) {
    const c = await mk(cD.id, `R${i}`); // ต่อท้าย
    await moves.moveCard(ctx, { cardId: c.id, toColumnId: cD.id, afterCardId: x1.id, beforeCardId: prev.id }); // แทรกระหว่าง X1 กับใบก่อนหน้า (คู่แคบลงเรื่อย ๆ)
    prev = c;
  }
  const afterD = await orderOf(cD.id);
  const maxLen = Math.max(...afterD.map((c) => (c.position as string).length));
  chk("K1.4-S4.1", "แทรกระหว่างคู่เดิม 300 ครั้ง → rebalance ทำงาน: key ยาวสุด ≤ 50 · ลำดับ X1,R299..R0,X2 (302 ใบ ไม่สลับ)", maxLen <= 50 && afterD.length === 302 && afterD[0]!.title === "X1" && afterD[1]!.title === "R299" && afterD[300]!.title === "R0" && afterD.at(-1)!.title === "X2", "≤50 · X1,R299..R0,X2", `maxLen=${maxLen} n=${afterD.length} [0]=${afterD[0]?.title} [1]=${afterD[1]?.title} [300]=${afterD[300]?.title} last=${afterD.at(-1)?.title}`);
  chk("K1.4-S4.2", "needsRebalance(คอลัมน์ D หลัง rebalance) = false และ sortOrder 0..301", ord.needsRebalance(afterD.map((c) => c.position)) === false && afterD.every((c, i) => c.sortOrder === i), "false · 0..301", `sortOrder ok=${afterD.every((c, i) => c.sortOrder === i)}`, "MAJOR");
  // positive control (ท่าของ builder): ปลูกคีย์ยาว 51 ตัวอักษรตรง ๆ แล้วย้าย 1 ครั้ง → ทั้งคอลัมน์ต้องถูกเขียนใหม่
  const longKey = "a0" + "V".repeat(49);
  await prisma.kanbanCard.update({ where: { id: afterD[5]!.id }, data: { position: longKey } });
  chk("K1.4-S4.3", "positive control: หลังปลูกคีย์ 51 ตัวอักษร needsRebalance = true", ord.needsRebalance((await orderOf(cD.id)).map((c) => c.position)) === true, "true", "false");
  const before6 = (await orderOf(cD.id)).map((c) => c.id);
  const mvId = afterD[10]!.id; const aft = afterD[12]!.id; const bef = afterD[13]!.id;
  await moves.moveCard(ctx, { cardId: mvId, toColumnId: cD.id, afterCardId: aft, beforeCardId: bef });
  const afterFix = (await orderOf(cD.id)).map((c) => ({ id: c.id, len: (c.position as string).length }));
  const ids = afterFix.map((c) => c.id);
  const relOk = ids.filter((id) => id !== mvId).join() === before6.filter((id) => id !== mvId).join(); // ลำดับใบอื่นคงเดิม
  const placedOk = ids.indexOf(mvId) === ids.indexOf(aft) + 1 && ids.indexOf(bef) === ids.indexOf(mvId) + 1; // อยู่ระหว่างเพื่อนบ้านที่ขอ
  chk("K1.4-S4.4", "ย้าย 1 ครั้งหลังมีคีย์ยาว → ทั้งคอลัมน์ถูก rebalance (ยาวสุด ≤ 4) · ใบที่ย้ายอยู่ระหว่างเพื่อนบ้านที่ขอ · ลำดับใบอื่นคงเดิม · ไม่มีใบหาย", Math.max(...afterFix.map((c) => c.len)) <= 4 && placedOk && relOk && ids.length === 302, "≤4 · placed · rel", `maxLen=${Math.max(...afterFix.map((c) => c.len))} placed=${placedOk} rel=${relOk} n=${ids.length}`);

  // ═══ S5 done column + completedAt · WIP ═══
  await moves.setColumnDone(ctx, cC.id, true);
  const c0 = (await orderOf(cD.id))[0]!;
  await moves.moveCard(ctx, { cardId: c0.id, toColumnId: cC.id });
  const done1 = await prisma.kanbanCard.findUnique({ where: { id: c0.id } }) as Any;
  chk("K1.4-S5.1", "ย้ายเข้าคอลัมน์เสร็จ → completedAt ตั้ง", done1.completedAt instanceof Date, "Date", String(done1.completedAt));
  await moves.moveCard(ctx, { cardId: c0.id, toColumnId: cD.id });
  chk("K1.4-S5.2", "ย้ายออกจากคอลัมน์เสร็จ → completedAt null", ((await prisma.kanbanCard.findUnique({ where: { id: c0.id } })) as Any).completedAt === null, "null", "ไม่ null");
  await moves.setColumnDone(ctx, cC.id, false);
  const stillDone = await prisma.kanbanCard.findMany({ where: { columnId: cC.id, status: "ACTIVE", completedAt: { not: null } } });
  chk("K1.4-S5.3", "ปลดธง done ออกจากคอลัมน์ → การ์ดในคอลัมน์นั้น completedAt ถูกล้าง", stillDone.length === 0, "0", String(stillDone.length), "MAJOR");
  await moves.setColumnWip(ctx, cC.id, 2);
  const c1 = (await orderOf(cD.id))[0]!; const c2 = (await orderOf(cD.id))[1]!; const c3 = (await orderOf(cD.id))[2]!;
  await moves.moveCard(ctx, { cardId: c1.id, toColumnId: cC.id }); await moves.moveCard(ctx, { cardId: c2.id, toColumnId: cC.id });
  const wipRes = await moves.moveCard(ctx, { cardId: c3.id, toColumnId: cC.id });
  chk("K1.4-S5.4", "WIP limit 2: ใบที่ 3 → ok:false code WIP_LIMIT · ไม่ย้าย", wipRes?.ok === false && wipRes?.code === "WIP_LIMIT" && (await orderOf(cC.id)).length === 2, "WIP_LIMIT", JSON.stringify(wipRes));
  const forced = await moves.moveCard(ctx, { cardId: c3.id, toColumnId: cC.id, force: true });
  chk("K1.4-S5.5", "force:true (ADMIN) ข้าม WIP ได้", forced?.ok === true && (await orderOf(cC.id)).length === 3, "ok", JSON.stringify(forced).slice(0, 60), "MAJOR");
  const eWipBad = await fails(() => moves.setColumnWip(ctx, cC.id, 0));
  chk("K1.4-S5.6", "wipLimit 0/ลบ → error · null = ไม่จำกัด", !!eWipBad && (await moves.setColumnWip(ctx, cC.id, null), ((await prisma.kanbanColumn.findUnique({ where: { id: cC.id } })) as Any).wipLimit === null), "error + null", "ผิด", "MAJOR");

  // ═══ S6 คอลัมน์: ย้าย / rename / archive ต้องว่าง / moveAllCards ═══
  const rc = await moves.moveColumn(ctx, { columnId: cC.id, beforeColumnId: cA.id });
  const colsNow = await prisma.kanbanColumn.findMany({ where: { boardId: nb.id, status: "ACTIVE" }, orderBy: { position: "asc" } }) as Any[];
  chk("K1.4-S6.1", "moveColumn C ไปก่อน A → ลำดับ C,A,B,D · sortOrder 0,1,2,3", rc?.ok === true && colsNow.map((c) => c.id).join() === [cC.id, cA.id, cB.id, cD.id].join() && colsNow.map((c) => c.sortOrder).join() === "0,1,2,3", "C,A,B,D", colsNow.map((c) => c.name).join());
  await moves.renameColumn(ctx, cC.id, "เสร็จแล้ว ✓");
  chk("K1.4-S6.2", "renameColumn", ((await prisma.kanbanColumn.findUnique({ where: { id: cC.id } })) as Any).name === "เสร็จแล้ว ✓", "ชื่อใหม่", "เดิม", "MAJOR");
  const eArc = await fails(() => moves.archiveColumn(ctx, cC.id));
  chk("K1.4-S6.3", "archive คอลัมน์ที่มีการ์ด → error ไทย (ต้องว่างก่อน)", !!eArc && /[ก-๙]/.test(String(eArc?.message ?? eArc)) && ((await prisma.kanbanColumn.findUnique({ where: { id: cC.id } })) as Any).status === "ACTIVE", "error", String(eArc?.message ?? eArc).slice(0, 60));
  const mv = await moves.moveAllCards(ctx, { fromColumnId: cC.id, toColumnId: cA.id });
  chk("K1.4-S6.4", "moveAllCards C→A → คืน {moved:3} · C ว่าง · การ์ดต่อท้าย A ตามลำดับเดิม", mv?.moved === 3 && (await orderOf(cC.id)).length === 0, "moved 3", JSON.stringify(mv));
  await moves.archiveColumn(ctx, cC.id);
  chk("K1.4-S6.5", "archive คอลัมน์ว่าง → ARCHIVED", ((await prisma.kanbanColumn.findUnique({ where: { id: cC.id } })) as Any).status === "ARCHIVED", "ARCHIVED", "ACTIVE");

  // ═══ S7 cardNo ไม่ซ้ำเมื่อสร้างพร้อมกัน + unique index ═══
  const before = ((await prisma.kanbanBoard.findUnique({ where: { id: nb.id } })) as Any).cardNoSeq as number;
  const made = await Promise.all(Array.from({ length: 30 }, (_, i) => mk(cB.id, `P${i}`)));
  const nos = made.map((c) => c.cardNo as number);
  chk("K1.4-S7.1", "สร้าง 30 ใบพร้อมกัน → cardNo ไม่ซ้ำ ต่อเนื่อง seq+1..seq+30", new Set(nos).size === 30 && Math.min(...nos) === before + 1 && Math.max(...nos) === before + 30, "ไม่ซ้ำ", `uniq=${new Set(nos).size} min=${Math.min(...nos)} max=${Math.max(...nos)} before=${before}`);
  const uniq = await q<{ indexdef: string }>(`select indexdef from pg_indexes where tablename='KanbanCard' and indexdef like '%UNIQUE%' and indexdef like '%"boardId", "cardNo"%'`);
  chk("K1.4-S7.2", "migration B: unique(boardId,cardNo) ลงแล้ว", uniq.length === 1, "unique", String(uniq.length));

  // ═══ S8 event/outbox ═══
  const ev = await prisma.outboxEvent.findMany({ where: { tenantId: tid, type: { in: ["kanban.card.moved", "kanban.card.completed"] } } });
  const consumers = (await import("@/lib/outbox-consumers")).consumers as Record<string, unknown>;
  chk("K1.4-S8.1", "outbox: มี kanban.card.moved และ kanban.card.completed · consumer ลงทะเบียนทั้งคู่", ev.some((e) => e.type === "kanban.card.moved") && ev.some((e) => e.type === "kanban.card.completed") && typeof consumers["kanban.card.moved"] === "function" && typeof consumers["kanban.card.completed"] === "function", "ครบ", `moved=${ev.filter((e) => e.type === "kanban.card.moved").length} completed=${ev.filter((e) => e.type === "kanban.card.completed").length}`);
  const labelsMod = (await import("@/lib/automation/labels")).AUTOMATION_EVENTS as { value: string }[];
  chk("K1.4-S8.2", "AUTOMATION_EVENTS มี kanban.card.moved/completed/assigned (ตั้งกฎได้)", ["kanban.card.moved", "kanban.card.completed", "kanban.card.assigned"].every((v) => labelsMod.some((e) => e.value === v)), "3 ตัว", labelsMod.filter((e) => e.value.startsWith("kanban.")).map((e) => e.value).join(","), "MAJOR");

  // cleanup
  await P.kanbanCardAssignee.deleteMany({ where: { card: { boardId: nb.id } } }).catch(() => {});
  await prisma.kanbanCard.deleteMany({ where: { boardId: nb.id } });
  await prisma.kanbanColumn.deleteMany({ where: { boardId: nb.id } });
  await prisma.kanbanBoard.deleteMany({ where: { id: nb.id } });
  await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "kanban." } } });
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.4 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
