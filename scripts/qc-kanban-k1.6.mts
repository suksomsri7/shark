// QC — บอร์ดงาน WO K1.6: หลังการ์ด — service (แก้ฟิลด์ · sanitize · ทำสำเนา · เก็บ/กู้คืน · สิทธิ์) + static UI — ส่วนภาพ: visual-kanban.mts 1.6
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K1.6
// requires: kanban-seed
// ⚠️ standalone-typesafe: dynamic import + wide cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/components/kanban/CardBack.tsx") || !existsSync("src/lib/modules/kanban/sanitize.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (CardBack.tsx / sanitize.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const kq = (await import("./kanban-qc-env.mts" as string)) as { KQC: Any; resolveKanbanScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null>; dayFromToday: (n: number, h?: number) => Date };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (f: () => Promise<unknown>): Promise<Any> => { try { await f(); return null; } catch (e) { return e; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  const { tenantId: tid, systemId: SYS } = scope;
  const cards = (await import("@/lib/modules/kanban/cards" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const san = (await import("@/lib/modules/kanban/sanitize" as string)) as Record<string, (...a: Any[]) => Any>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const members = (await import("@/lib/modules/kanban/members" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const owner = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId };
  const thanaCtx = { tenantId: tid, systemId: SYS, actorUserId: E.users.staff.thana.userId };

  // ═══ S1 sanitize (pure) ═══
  const dirty = `<p>สวัสดี <b>หนา</b> <script>alert(1)</script><a href="javascript:alert(1)">x</a><a href="https://ok.test" onclick="evil()">ok</a><img src=x onerror=alert(1)><h1>หัว</h1><h3>ตัด</h3><ul><li>ข้อ</li></ul><iframe src="//x"></iframe></p>`;
  const clean = san.sanitizeDescription(dirty) as string;
  chk("K1.6-S1.1", "sanitizeDescription ตัด script/iframe/img/on*/javascript: · คง p/b/a(https)/h1/ul/li · h3 → ถูกลดหรือตัดแท็ก (allowlist v1 §11.6)", !/<script|<iframe|<img|onerror|onclick|javascript:/i.test(clean) && /<b>หนา<\/b>/.test(clean) && /href="https:\/\/ok\.test"/.test(clean) && /<li>ข้อ<\/li>/.test(clean) && !/<h3>/.test(clean) && /ตัด/.test(clean), "สะอาด+คงเนื้อหา", clean.slice(0, 200));
  chk("K1.6-S1.2", "sanitizeDescription คืน string ว่างสำหรับ null/undefined และไม่โยน", san.sanitizeDescription(null) === "" && san.sanitizeDescription(undefined) === "", "\"\"", JSON.stringify([san.sanitizeDescription(null)]), "MAJOR");
  chk("K1.6-S1.3", "markdown-lite: '- ข้อ' และ '**เน้น**' → ul/li และ strong (renderDescription)", typeof san.renderDescription === "function" && /<li>ข้อ<\/li>/.test(san.renderDescription("- ข้อ")) && /<strong>เน้น<\/strong>/.test(san.renderDescription("**เน้น**")), "แปลงได้", typeof san.renderDescription === "function" ? san.renderDescription("- ข้อ\n**เน้น**").slice(0, 120) : "ไม่มี renderDescription", "MAJOR");

  // ═══ S2 updateCardFields ═══
  const col = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const c = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col.id, title: "QC K1.6 การ์ด" });
  const due = kq.dayFromToday(3, 17);
  const r1 = await cards.updateCardFields(owner, c.id, { title: "  ชื่อใหม่  ", description: "<p>รายละเอียด</p><script>x</script>", dueAt: due, startAt: kq.dayFromToday(1, 9), reminderMinutesBefore: 1440 });
  const c1 = await prisma.kanbanCard.findUnique({ where: { id: c.id } }) as Any;
  chk("K1.6-S2.1", "updateCardFields: ชื่อ trim · description ถูก sanitize · dueAt/startAt/reminder บันทึก", c1.title === "ชื่อใหม่" && c1.description === "<p>รายละเอียด</p>" && c1.dueAt?.getTime() === due.getTime() && c1.startAt instanceof Date && c1.reminderMinutesBefore === 1440 && !!r1, "ครบ", JSON.stringify({ t: c1.title, d: c1.description, r: c1.reminderMinutesBefore }));
  const eEmpty = await fails(() => cards.updateCardFields(owner, c.id, { title: "   " }));
  chk("K1.6-S2.2", "ชื่อว่าง → error ไทย ไม่บันทึก", !!eEmpty && /[ก-๙]/.test(String(eEmpty?.message ?? eEmpty)) && ((await prisma.kanbanCard.findUnique({ where: { id: c.id } })) as Any).title === "ชื่อใหม่", "error", String(eEmpty?.message ?? eEmpty).slice(0, 60));
  const eStartAfterDue = await fails(() => cards.updateCardFields(owner, c.id, { startAt: kq.dayFromToday(10), dueAt: kq.dayFromToday(3) }));
  chk("K1.6-S2.3", "วันเริ่มหลังกำหนดส่ง → error ไทย", !!eStartAfterDue && /[ก-๙]/.test(String(eStartAfterDue?.message ?? eStartAfterDue)), "error", String(eStartAfterDue?.message ?? eStartAfterDue).slice(0, 60), "MAJOR");
  await cards.updateCardFields(owner, c.id, { dueAt: null, reminderMinutesBefore: null });
  const c2 = await prisma.kanbanCard.findUnique({ where: { id: c.id } }) as Any;
  chk("K1.6-S2.4", "ล้างกำหนดส่ง (null) → dueAt null · reminder null · reminderSentAt null", c2.dueAt === null && c2.reminderMinutesBefore === null && c2.reminderSentAt === null, "null", `${c2.dueAt}/${c2.reminderMinutesBefore}`);
  const eViewer = await fails(() => cards.updateCardFields(thanaCtx, c.id, { title: "โดนแก้" }));
  chk("K1.6-S2.5", "thana (ไม่ใช่สมาชิกบอร์ด PRIVATE) แก้การ์ด → ไม่พบ (404-class) · ไม่เปลี่ยน", !!eViewer && (eViewer?.name === "KanbanNotFoundError" || /ไม่พบ/.test(String(eViewer?.message))) && ((await prisma.kanbanCard.findUnique({ where: { id: c.id } })) as Any).title === "ชื่อใหม่", "ไม่พบ", `${eViewer?.name}`);
  await members.addMember(owner, E.boards.patong.id, E.users.staff.thana.userId, "VIEWER");
  const eViewer2 = await fails(() => cards.updateCardFields(thanaCtx, c.id, { title: "โดนแก้" }));
  chk("K1.6-S2.6", "VIEWER แก้การ์ด → KanbanForbiddenError (403) · ไม่เปลี่ยน", !!eViewer2 && (eViewer2?.name === "KanbanForbiddenError" || eViewer2?.status === 403) && ((await prisma.kanbanCard.findUnique({ where: { id: c.id } })) as Any).title === "ชื่อใหม่", "403", `${eViewer2?.name}`);
  await members.setMemberRole(owner, E.boards.patong.id, E.users.staff.thana.userId, "EDITOR");
  await cards.updateCardFields(thanaCtx, c.id, { title: "EDITOR แก้ได้" });
  chk("K1.6-S2.7", "EDITOR แก้ได้", ((await prisma.kanbanCard.findUnique({ where: { id: c.id } })) as Any).title === "EDITOR แก้ได้", "แก้ได้", "ไม่ได้");

  // ═══ S3 ทำสำเนา ═══
  const labels = (await import("@/lib/modules/kanban/labels" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const lbl = (await labels.listLabels(owner, E.boards.patong.id))[0];
  await labels.setCardLabels(owner, c.id, [lbl.id]);
  await cards.setCardAssignees(owner, c.id, [E.users.staff.pook.userId]);
  const dup = await cards.duplicateCard(owner, c.id);
  const dupRow = await prisma.kanbanCard.findUnique({ where: { id: dup.id } }) as Any;
  chk("K1.6-S3.1", "duplicateCard → การ์ดใหม่ คอลัมน์เดียวกัน ต่อจากต้นฉบับ · cardNo ใหม่ · ชื่อ + ' (สำเนา)' · description/due คัดลอก · ป้าย+ผู้รับผิดชอบคัดลอก · completedAt/reminderSentAt ไม่คัดลอก", !!dupRow && dupRow.columnId === col.id && dupRow.cardNo !== c1.cardNo && /สำเนา/.test(dupRow.title) && dupRow.description === "<p>รายละเอียด</p>" && dupRow.completedAt === null && (await P.kanbanCardLabel.count({ where: { cardId: dup.id } })) === 1 && (await P.kanbanCardAssignee.count({ where: { cardId: dup.id } })) === 1 && dupRow.position > c1.position, "สำเนาครบ", JSON.stringify({ t: dupRow?.title, no: dupRow?.cardNo, pos: dupRow?.position > c1.position }));

  // ═══ S4 เก็บ/กู้คืน ═══
  await cards.archiveCard(owner, c.id);
  const arch = await prisma.kanbanCard.findUnique({ where: { id: c.id } }) as Any;
  chk("K1.6-S4.1", "archiveCard → ARCHIVED + archivedAt + archivedById", arch.status === "ARCHIVED" && arch.archivedAt instanceof Date && arch.archivedById === E.users.owner.userId, "ARCHIVED", `${arch.status}/${arch.archivedById}`);
  await cards.restoreCard(owner, c.id);
  const rest = await prisma.kanbanCard.findUnique({ where: { id: c.id } }) as Any;
  chk("K1.6-S4.2", "restoreCard → ACTIVE · archivedAt null · คอลัมน์เดิม", rest.status === "ACTIVE" && rest.archivedAt === null && rest.columnId === col.id, "ACTIVE", rest.status);
  // คอลัมน์เดิมถูกเก็บ → กู้คืนไปคอลัมน์แรก
  const tmpCol = await svc.createColumn(tid, SYS, E.boards.patong.id, "QC ชั่วคราว");
  const moves = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  await moves.moveCard(owner, { cardId: dup.id, toColumnId: tmpCol.id });
  await cards.archiveCard(owner, dup.id);
  await moves.archiveColumn(owner, tmpCol.id);
  await cards.restoreCard(owner, dup.id);
  const rest2 = await prisma.kanbanCard.findUnique({ where: { id: dup.id } }) as Any;
  const firstCol = (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.patong.id, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  chk("K1.6-S4.3", "กู้คืนการ์ดที่คอลัมน์เดิมถูกเก็บ → ไปท้ายคอลัมน์แรก", rest2.status === "ACTIVE" && rest2.columnId === firstCol.id, "คอลัมน์แรก", rest2.columnId === firstCol.id ? "ok" : "ผิดคอลัมน์");
  const listArch = await cards.listArchivedCards(owner, E.boards.patong.id);
  chk("K1.6-S4.4", "listArchivedCards(ctx, boardId) คืนรายการ (ตอนนี้ 0 หลังกู้คืนหมด) + รองรับ query", Array.isArray(listArch), "array", typeof listArch, "MAJOR");

  // ═══ S5 static UI ═══
  const cb = read("src/components/kanban/CardBack.tsx");
  const ids = ["card-back", "card-title", "card-title-input", "card-description", "card-due", "card-labels", "card-members", "card-archive", "card-close"];
  chk("K1.6-S5.1", "CardBack เป็น client component มี data-testid ครบ 9 + ปิดด้วย Esc + โฟกัสกักในโมดัล (role=dialog aria-modal)", /^"use client";?/m.test(cb) && ids.every((i) => cb.includes(`"${i}"`)) && /Escape/.test(cb) && /role="dialog"/.test(cb) && /aria-modal/.test(cb), "ครบ", ids.filter((i) => !cb.includes(`"${i}"`)).join(",") || "testid ครบ · เช็ค Esc/dialog");
  const page = read("src/app/app/sys/[id]/kanban/b/[boardId]/page.tsx") + read("src/components/kanban/BoardView.tsx");
  chk("K1.6-S5.2", "เปิดหลังการ์ดจาก URL ?card=<id> (searchParams.card) และปิดแล้วเอาพารามิเตอร์ออก (history)", /searchParams|useSearchParams/.test(page) && /card/.test(page) && /replaceState|router\.replace|router\.push/.test(page + cb), "URL sync", "ไม่พบ", "MAJOR");
  chk("K1.6-S5.3", "ปุ่มที่ WO ถัดไปยังไม่มา (เช็คลิสต์/ไฟล์แนบ/ติดตาม/สะท้อน/เทมเพลต/อัตโนมัติ/AI) เป็น disabled + title 'เร็ว ๆ นี้' ไม่ใช่หายไป", /เร็ว ๆ นี้|เร็วๆ นี้/.test(cb) && /disabled/.test(cb), "disabled + เร็ว ๆ นี้", "ไม่พบ", "MAJOR");
  chk("K1.6-S5.4", "VIEWER ไม่เห็นปุ่มแก้ (เงื่อนไข role ใน DOM ไม่ใช่แค่ CSS)", /role === "VIEWER"|canEdit|role !== "VIEWER"/.test(cb), "เงื่อนไข role", "ไม่พบ", "MAJOR");
  const actions = read("src/lib/modules/kanban/actions.ts");
  chk("K1.6-S5.5", "actions: updateCardFieldsAction · duplicateCardAction · archiveCardAction · restoreCardAction (เรียก cards.ts) และ export เฉพาะ *Action", ["updateCardFieldsAction", "duplicateCardAction", "archiveCardAction", "restoreCardAction"].every((a) => actions.includes(`function ${a}`)) && (actions.match(/export (async )?function (\w+)/g) ?? []).every((m) => /Action\b/.test(m)), "ครบ", "ขาด");

  // cleanup
  await members.removeMember(owner, E.boards.patong.id, E.users.staff.thana.userId).catch(() => {});
  await P.kanbanCardAssignee.deleteMany({ where: { cardId: { in: [c.id, dup.id] } } });
  await P.kanbanCardLabel.deleteMany({ where: { cardId: { in: [c.id, dup.id] } } });
  await prisma.kanbanCard.deleteMany({ where: { id: { in: [c.id, dup.id] } } });
  await prisma.kanbanColumn.deleteMany({ where: { id: tmpCol.id } });
  await prisma.$executeRawUnsafe(`UPDATE "KanbanBoard" b SET "cardNoSeq" = COALESCE((SELECT MAX("cardNo") FROM "KanbanCard" c WHERE c."boardId" = b.id), 0) WHERE b.id = '${E.boards.patong.id}'`);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K1.6 — ส่วนภาพ: pnpm exec tsx scripts/visual-kanban.mts 1.6 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
