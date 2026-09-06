// QC — บอร์ดงาน WO K3.4: ย้อนกลับ (outbound §9.3) — การ์ดที่ผูกแชทถูกปิด → แปะบันทึกภายในในบทสนทนา · ผูกเอกสารบัญชี → แค่กิจกรรม (ไม่แตะสถานะเอกสาร) · เก็บเข้าคลัง → ไม่ทำอะไร
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K3.4 · เกณฑ์ §9.3/§13 K3.4 · ต้องมี K3.1 ก่อน
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
if (!existsSync("src/lib/platform/kanban-outbound.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/platform/kanban-outbound.ts)");
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
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = ""; let chatSysId: string | null = null; let convId: string | null = null; let contactId: string | null = null;
const madeCards: string[] = [];
const evt = (type: string, payload: Any) => ({ id: `qc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tenantId: tid, type, payload, systemId: SYS, unitId: null });
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const oc = (await import("@/lib/outbox-consumers" as string)) as { consumers: Record<string, (e: Any) => Promise<void>> };
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const mv = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const cards = (await import("@/lib/modules/kanban/cards" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const U = { owner: E.users.owner.userId as string, pook: E.users.staff.pook.userId as string };
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner };
  const board = E.boards.maint.id as string;
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const c0 = cols[0]!; const done = cols.find((c) => c.isDoneColumn)!;
  const chatSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT" as Any, name: "แชท QC K3.4" } }); chatSysId = chatSys.id;
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", externalUserId: `qc-k34-${Date.now()}`, displayName: "ลูกค้า K3.4" } }); contactId = contact.id;
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", contactId: contact.id, status: "OPEN" } }); convId = conv.id;
  const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K3.4 งานจากแชท", createdById: U.owner }); madeCards.push(card.id);
  await P.kanbanCardLink.create({ data: { tenantId: tid, systemId: SYS, cardId: card.id, linkType: "CHAT_CONVERSATION", linkId: conv.id, role: "SOURCE" } });
  await P.kanbanCardLink.create({ data: { tenantId: tid, systemId: SYS, cardId: card.id, linkType: "ACCOUNT_DOC", linkId: "qc-doc-k34", role: "RELATED", label: "INV-K34" } });

  // ═══ S1 payload ของ kanban.card.completed มี actorUserId (ใครปิด) ═══
  await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, type: "kanban.card.completed", payload: { path: ["cardId"], equals: card.id } } });
  await mv.moveCard(ctxO, { cardId: card.id, toColumnId: done.id });
  const ob = await prisma.outboxEvent.findFirst({ where: { tenantId: tid, type: "kanban.card.completed", payload: { path: ["cardId"], equals: card.id } } }) as Any;
  chk("K3.4-S1.1", "moves.ts: outbox kanban.card.completed payload เพิ่ม actorUserId (ใครปิด · null = อัตโนมัติ) + cardNo + completedAt เดิม", !!ob && ob.payload.actorUserId === U.owner && typeof ob.payload.cardNo === "number" && typeof ob.payload.completedAt === "string", "มี actorUserId", JSON.stringify(ob?.payload ?? null));

  // ═══ S2 ปิดการ์ด → บันทึกภายในในแชท (idempotent) ═══
  const before = await prisma.chatMessage.count({ where: { conversationId: conv.id } });
  for (let i = 0; i < 3; i++) await oc.consumers["kanban.card.completed"]!(evt("kanban.card.completed", ob.payload));
  const notes = await prisma.chatMessage.findMany({ where: { conversationId: conv.id, isInternal: true }, orderBy: { createdAt: "asc" } });
  chk("K3.4-S2.1", "🔴 consumer kanban.card.completed ×3 → บันทึกภายใน **1 ข้อความ** ในห้องที่ผูก (isInternal · direction OUT · ไม่ส่งออกช่องทาง) 'งาน #{cardNo} \"{ชื่อ}\" ปิดแล้วโดย {ชื่อคน}' + ลิงก์การ์ด · idempotent ด้วย meta.kanbanKey = kanban.card.completed#{cardId}#{completedAt}", notes.length === 1 && before === 0 && notes[0]!.direction === "OUT" && notes[0]!.body?.includes(`#${ob.payload.cardNo}`) && /ปิดแล้ว/.test(notes[0]!.body ?? "") && /[ก-๙]/.test(notes[0]!.body ?? "") && /\?card=/.test(notes[0]!.body ?? "") && (notes[0]!.meta as Any)?.kanbanKey === `kanban.card.completed#${card.id}#${ob.payload.completedAt}`, "1 ข้อความ", JSON.stringify({ n: notes.length, body: notes[0]?.body?.slice(0, 100), meta: notes[0]?.meta }));
  chk("K3.4-S2.2", "ชื่อคนปิดมาจาก User/Membership ของ actorUserId (เจ้าของร้าน (KB QC)) · ผ่าน facade แชท (`sendReply` ของ chat/service · senderUserId = คนปิด) ไม่เขียน chatMessage ตรง", notes[0]!.senderUserId === U.owner && /เจ้าของร้าน/.test(notes[0]!.body ?? "") && /@\/lib\/modules\/chat\/service/.test(read("src/lib/platform/kanban-outbound.ts")) && !/chatMessage\.create/.test(read("src/lib/platform/kanban-outbound.ts")), "ผ่าน facade", `sender=${notes[0]?.senderUserId === U.owner}`);
  const ob2 = { ...ob.payload, actorUserId: null };
  await oc.consumers["kanban.card.completed"]!(evt("kanban.card.completed", { ...ob2, completedAt: new Date().toISOString() }));
  const notes2 = await prisma.chatMessage.findMany({ where: { conversationId: conv.id, isInternal: true }, orderBy: { createdAt: "asc" } });
  chk("K3.4-S2.3", "actorUserId null (กฎอัตโนมัติ/cron ปิดให้) → 'ปิดแล้วโดยระบบอัตโนมัติ' · senderUserId = ผู้สร้างการ์ด หรือเจ้าของร้าน (fallback) · completedAt ใหม่ = key ใหม่ → ข้อความที่ 2", notes2.length === 2 && /อัตโนมัติ/.test(notes2[1]!.body ?? "") && !!notes2[1]!.senderUserId, "2 ข้อความ", JSON.stringify({ n: notes2.length, body: notes2[1]?.body?.slice(0, 80) }));

  // ═══ S3 เอกสารบัญชี → กิจกรรมอย่างเดียว ═══
  const acts = await prisma.kanbanActivity.findMany({ where: { cardId: card.id, type: "CARD_UPDATED" } });
  const outActs = acts.filter((a) => JSON.stringify(a.data).includes("ACCOUNT_DOC"));
  const src = read("src/lib/platform/kanban-outbound.ts");
  chk("K3.4-S3.1", "การ์ดผูก ACCOUNT_DOC ถูกปิด → activity CARD_UPDATED data {outbound:'ACCOUNT_DOC', linkId, label} **1 ครั้ง** (ทั้ง 4 การยิง) · **ไม่แตะสถานะเอกสาร** (โค้ดไม่ import account · ไม่เขียน prisma.account*)", outActs.length === 1 && !/@\/lib\/modules\/account/.test(src) && !/prisma\.account[A-Z]\w*\.(update|create|delete|upsert)/.test(src), "1 กิจกรรม · ไม่แตะบัญชี", `${outActs.length}`);

  // ═══ S4 เก็บเข้าคลัง → ไม่ทำอะไรกับปลายทาง ═══
  await cards.archiveCard(ctxO, card.id);
  const obA = await prisma.outboxEvent.findFirst({ where: { tenantId: tid, type: "kanban.card.archived", payload: { path: ["cardId"], equals: card.id } }, orderBy: { createdAt: "desc" } }) as Any;
  if (obA) await oc.consumers["kanban.card.archived"]!(evt("kanban.card.archived", obA.payload));
  chk("K3.4-S4.1", "เก็บการ์ดเข้าคลัง (kanban.card.archived) → ไม่มีข้อความใหม่ในแชท · ไม่มี activity outbound เพิ่ม (กันผลข้างเคียงเกินคาด §9.3)", (await prisma.chatMessage.count({ where: { conversationId: conv.id, isInternal: true } })) === 2 && (await prisma.kanbanActivity.count({ where: { cardId: card.id, type: "CARD_UPDATED" } })) === acts.length, "ไม่มีเพิ่ม", `msgs=${await prisma.chatMessage.count({ where: { conversationId: conv.id, isInternal: true } })}`);

  // ═══ S5 ความทนทาน + สถาปัตยกรรม (static) ═══
  const cons = read("src/lib/outbox-consumers.ts");
  chk("K3.4-S5.1", "consumer kanban.card.completed = withAutomation(compose(เดิม, kanbanOutbound.cardCompleted)) · outbound พังห้ามล้ม consumer (try/catch + logOps WARN) · ห้องแชทถูกลบ/ไม่พบ → ข้ามเงียบ · kanban-outbound.ts อยู่ composition root ไม่มี any · โมดูล kanban ยังไม่ import chat", /kanbanOutbound|kanban-outbound/.test(cons) && /logOps\(\s*"WARN"/.test(src) && !/:\s*any\b/.test(src) && !/@\/lib\/modules\/chat/.test(readFileSync("src/lib/modules/kanban/service.ts", "utf8") + read("src/lib/modules/kanban/moves.ts") + read("src/lib/modules/kanban/cards.ts")), "ครบ", "ขาด");
  chk("K3.4-S5.2", "UI: ในหลังการ์ด บล็อกเชื่อมข้อมูล SHARK แถว CHAT_CONVERSATION มีบรรทัด 'เมื่อปิดงาน ระบบจะแปะบันทึกในบทสนทนานี้ให้' (CardLinks.tsx)", /แปะบันทึก/.test(read("src/components/kanban/CardLinks.tsx")), "มี", "ขาด", "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tid) {
      const ids = madeCards.filter(Boolean);
      if (ids.length) { await P.kanbanCardLink.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null); await prisma.kanbanComment.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null); await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } }); }
      if (convId) { await prisma.chatMessage.deleteMany({ where: { conversationId: convId } }).catch(() => null); await prisma.chatConversation.deleteMany({ where: { id: convId } }).catch(() => null); }
      if (contactId) await prisma.chatContact.deleteMany({ where: { id: contactId } }).catch(() => null);
      if (chatSysId) await prisma.appSystem.deleteMany({ where: { id: chatSysId } }).catch(() => null);
      await prisma.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { startsWith: "kanban." } } }).catch(() => null);
    }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K3.4 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
