// QC — Kanban notification + งานของฉัน (Wave4-C) · Fable oracle · Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast
// สัญญา: createCard/updateCard เมื่อ assignee ตั้งใหม่/เปลี่ยน → AppNotification "ได้รับมอบหมายงาน"
//   + emitOutbox "kanban.card.assigned" · listMyCards(tenantId,systemId,userId) คืนการ์ดของฉัน
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const kanban = (await import("@/lib/modules/kanban/service" as string)) as {
  createBoard: (i: any) => Promise<any>;
  createCard: (i: any) => Promise<any>;
  updateCard: (i: any) => Promise<any>;
  listMyCards: (t: string, s: string, u: string) => Promise<any[]>;
};
const sys = await import("@/lib/modules/system/service");

type Sev = "CRITICAL" | "MAJOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e = "", a = "", s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

let tid = "", tid2 = "", uid = "", uid2 = "";
try {
  const t = await prisma.tenant.create({ data: { name: "QC KN", slug: `qc-kn-${Date.now()}` } });
  tid = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC KN2", slug: `qc-kn2-${Date.now()}` } });
  tid2 = t2.id;
  const u1 = await prisma.user.create({ data: { email: `qc-kn-a-${Date.now()}@qc.local`, name: "พนักงานเอ" } });
  uid = u1.id;
  const u2 = await prisma.user.create({ data: { email: `qc-kn-b-${Date.now()}@qc.local`, name: "พนักงานบี" } });
  uid2 = u2.id;
  await prisma.membership.create({ data: { userId: uid, tenantId: tid, role: "STAFF", unitAccess: ["*"], acceptedAt: new Date() } });
  await prisma.membership.create({ data: { userId: uid2, tenantId: tid, role: "STAFF", unitAccess: ["*"], acceptedAt: new Date() } });

  const knSys = await sys.createSystem(tid, "KANBAN", "บอร์ด QC");
  const board = await kanban.createBoard({ tenantId: tid, systemId: knSys.id, name: "บอร์ดงาน QC" });
  const col = await prisma.kanbanColumn.findFirst({ where: { tenantId: tid, systemId: knSys.id, boardId: board.id }, orderBy: { sortOrder: "asc" } });

  const notif = async (tenantId: string) => prisma.appNotification.count({ where: { tenantId, title: "ได้รับมอบหมายงาน" } });
  const outbox = async (tenantId: string) => prisma.outboxEvent.count({ where: { tenantId, type: "kanban.card.assigned" } });

  // ── createCard ไม่มอบหมาย → ไม่แจ้ง ──
  const n0 = await notif(tid);
  const c1 = await kanban.createCard({ tenantId: tid, systemId: knSys.id, columnId: col!.id, title: "งานไม่มอบหมาย" });
  chk("KN-1", "createCard ไม่มี assignee → ไม่แจ้ง", (await notif(tid)) === n0, String(n0), String(await notif(tid)));

  // ── createCard มอบหมาย → แจ้ง 1 + outbox ──
  const c2 = await kanban.createCard({ tenantId: tid, systemId: knSys.id, columnId: col!.id, title: "ออกแบบโปสเตอร์", assigneeUserId: uid });
  chk("KN-2", "createCard มี assignee → แจ้ง +1", (await notif(tid)) === n0 + 1, String(n0 + 1), String(await notif(tid)));
  chk("KN-3", "emitOutbox kanban.card.assigned ≥1", (await outbox(tid)) >= 1);

  // ── updateCard เปลี่ยน assignee เป็นคนใหม่ → แจ้ง ──
  const n1 = await notif(tid);
  await kanban.updateCard({ tenantId: tid, systemId: knSys.id, cardId: c2.id, assigneeUserId: uid2 });
  chk("KN-4", "updateCard เปลี่ยนผู้รับ → แจ้ง +1", (await notif(tid)) === n1 + 1, String(n1 + 1), String(await notif(tid)));

  // ── updateCard assignee เดิม (ไม่เปลี่ยน) → ไม่แจ้ง ──
  const n2 = await notif(tid);
  await kanban.updateCard({ tenantId: tid, systemId: knSys.id, cardId: c2.id, assigneeUserId: uid2 });
  chk("KN-5", "updateCard ผู้รับเดิม → ไม่แจ้งซ้ำ", (await notif(tid)) === n2, String(n2), String(await notif(tid)));

  // ── updateCard แก้ title อย่างเดียว → ไม่แจ้ง ──
  const n3 = await notif(tid);
  await kanban.updateCard({ tenantId: tid, systemId: knSys.id, cardId: c2.id, title: "ออกแบบโปสเตอร์ (แก้)" });
  chk("KN-6", "updateCard แก้ title → ไม่แจ้ง", (await notif(tid)) === n3, String(n3), String(await notif(tid)));

  // ── listMyCards ──
  const myB = await kanban.listMyCards(tid, knSys.id, uid2); // c2 ตอนนี้เป็นของ uid2
  chk("KN-7", "listMyCards(uid2) มี c2", myB.some((c) => c.id === c2.id), "มี c2", `${myB.length} ใบ`);
  const myA = await kanban.listMyCards(tid, knSys.id, uid); // c2 ย้ายไป uid2 แล้ว, c1 ไม่มอบหมาย
  chk("KN-8", "listMyCards(uid) ไม่มี c2 (ย้ายแล้ว)", !myA.some((c) => c.id === c2.id));

  // ── cross-tenant: tid2 ไม่มี notification/การ์ด ──
  chk("KN-9", "cross-tenant: tid2 ไม่มี notification", (await notif(tid2)) === 0, "0", String(await notif(tid2)));
  const cross = await kanban.listMyCards(tid2, knSys.id, uid2);
  chk("KN-10", "cross-tenant: listMyCards tid2 ว่าง", cross.length === 0, "0", String(cross.length));
  void c1;
} catch (e) {
  chk("KN-ERR", "รันจบไม่ throw", false, "no throw", e instanceof Error ? e.message : String(e));
} finally {
  for (const id of [tid, tid2]) {
    if (!id) continue;
    for (const m of ["appNotification", "outboxEvent", "kanbanCard", "kanbanColumn", "kanbanBoard", "membership", "appSystemUnit", "appSystem"]) {
      try { await (prisma as any)[m].deleteMany({ where: { tenantId: id } }); } catch {}
    }
    try { await prisma.tenant.delete({ where: { id } }); } catch {}
  }
  for (const id of [uid, uid2]) { if (id) try { await prisma.user.delete({ where: { id } }); } catch {} }
  console.log("[cleanup] เรียบร้อย");
}

const fail = cks.filter((c) => !c.ok);
console.log(`\nQC Kanban Notify: ${cks.length - fail.length}/${cks.length} ผ่าน`);
if (fail.length) { console.error(`❌ ตก ${fail.length}`); process.exit(1); }
console.log("✅ เขียวหมด");
