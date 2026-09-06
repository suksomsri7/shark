// QC — บอร์ดงาน WO K3.1: KanbanCardLink — ผูกการ์ดกับวัตถุโมดูลอื่น · ตัวแปลผลรายชนิด · เช็คสิทธิ์รายคนทุกครั้ง (ไม่มี cache ข้าม user) · ขาย้อน listCardsForTarget · facade createCardFromExternal
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K3.1 · เกณฑ์ §9.1/§13 K3.1
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/links.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/links.ts)");
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
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const q = async <T = Any,>(sql: string): Promise<T[]> => (await prisma.$queryRawUnsafe(sql)) as T[];
const P = prisma as Any;
let tid = ""; let SYS = "";
const madeCards: string[] = []; let partyId: string | null = null; let chatSysId: string | null = null; let convId: string | null = null; let contactId: string | null = null; let policyId: string | null = null; let invSysId: string | null = null; let invItemId: string | null = null;
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const lk = (await import("@/lib/modules/kanban/links" as string)) as Record<string, (...a: Any[]) => Any>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const party = (await import("@/lib/modules/party" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const approval = (await import("@/lib/modules/approval/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const actorOf = async (userId: string, perms?: Record<string, boolean>) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: perms ?? (m.permissions as Record<string, unknown>) }; };
  const U = { owner: E.users.owner.userId as string, pook: E.users.staff.pook.userId as string, thana: E.users.staff.thana.userId as string };
  const owner = await actorOf(U.owner); const thana = await actorOf(U.thana); // STAFF: มีแค่คีย์ kanban.*
  const thanaChat = await actorOf(U.thana, { "kanban.board.read": true, "kanban.card.update": true, "chat.conversation.read": true, "inventory.item.read": true });
  const ctxOf = (userId: string) => ({ tenantId: tid, systemId: SYS, actorUserId: userId });
  const ctxO = ctxOf(U.owner); const ctxT = ctxOf(U.thana);
  const board = E.boards.maint.id as string; // TENANT: thana VIEWER · owner ADMIN
  const col0 = (await prisma.kanbanColumn.findFirst({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  // เตรียมวัตถุปลายทาง: Party (ผ่าน facade) · ChatConversation (ระบบ CHAT ชั่วคราว) · ApprovalRequest · InvItem (ถ้ามีโมเดล)
  partyId = await party.safeFindOrCreate(tid, { name: "คุณสมชาย ลูกค้า QC K3.1", phone: "0891234567" });
  const chatSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT" as Any, name: "แชท QC K3.1" } }); chatSysId = chatSys.id;
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", externalUserId: `qc-k31-${Date.now()}`, displayName: "ลูกค้าเว็บแชท" } }); contactId = contact.id;
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "WEBCHAT", contactId: contact.id, lastMessagePreview: "อยากจองคอร์ส AOW" } }); convId = conv.id;
  const pol = await approval.createPolicy({ tenantId: tid }, { name: "QC K3.1", entityType: "kanban.card", steps: [{ order: 1, approverRole: "OWNER" }] }); policyId = pol.id;
  const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: col0.id, title: "QC K3.1 การ์ดผูกข้อมูล", createdById: U.owner });
  madeCards.push(card.id);
  const sub = await approval.submitForApproval({ tenantId: tid }, { entityType: "kanban.card", entityId: card.id, systemId: SYS, requestedById: U.owner });
  const reqId = (sub as Any).requestId as string;

  // ═══ S1 schema ═══
  const enums = (await q<{ enumlabel: string }>(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='KanbanLinkType'`)).map((e) => e.enumlabel);
  const EXP_TYPES = ["PARTY", "CRM_CONTACT", "CHAT_CONVERSATION", "ACCOUNT_DOC", "APPROVAL_REQUEST", "HR_LEAVE", "HR_EMPLOYEE", "APPOINTMENT", "HOTEL_RESERVATION", "RENTAL_BOOKING", "SCHOOL_CLASS", "INV_ITEM", "QUEUE_TICKET", "TICKET_EVENT", "FORM_SUBMISSION", "KB_ARTICLE", "POS_SALE", "SHOP_ORDER", "RESTAURANT_ORDER", "URL"];
  const lcols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanCardLink'`)).map((c) => c.column_name);
  chk("K3.1-S1.1", "enum KanbanLinkType ครบ 20 ค่า (§4.2) · KanbanCardLink {tenantId systemId cardId linkType linkId role label createdById removedAt} · unique(cardId,linkType,linkId) · index(tenantId,systemId,linkType,linkId) · scope.ts sys()", EXP_TYPES.every((t) => enums.includes(t)) && ["tenantId", "systemId", "cardId", "linkType", "linkId", "role", "label", "createdById", "removedAt"].every((c) => lcols.includes(c)) && (await q(`select 1 from pg_indexes where tablename='KanbanCardLink' and indexdef ilike '%unique%' and indexdef ilike '%"linkType"%' and indexdef ilike '%"linkId"%'`)).length === 1 && /KanbanCardLink:\s*sys\(\)/.test(read("src/lib/core/scope.ts")), "ครบ", `${enums.length} enum · ${lcols.join(",")}`);
  const ccols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanCard'`)).map((c) => c.column_name);
  chk("K3.1-S1.2", "KanbanCard มี sourceKey (idempotency ของการ์ดจากภายนอก) + unique(tenantId, sourceKey) แบบ partial (null ซ้ำได้)", ccols.includes("sourceKey") && (await q(`select 1 from pg_indexes where tablename='KanbanCard' and indexdef ilike '%unique%' and indexdef ilike '%"sourceKey"%'`)).length === 1, "มี", "ขาด");

  // ═══ S2 addLink / list / สิทธิ์รายคน ═══
  const l1 = await lk.addLink(ctxO, card.id, { linkType: "PARTY", linkId: partyId, role: "RELATED", label: "คุณสมชาย" });
  const l2 = await lk.addLink(ctxO, card.id, { linkType: "CHAT_CONVERSATION", linkId: convId, role: "SOURCE" });
  const l3 = await lk.addLink(ctxO, card.id, { linkType: "APPROVAL_REQUEST", linkId: reqId, role: "RESULT" });
  const l4 = await lk.addLink(ctxO, card.id, { linkType: "URL", linkId: "https://example.com/spec.pdf", label: "สเปกอุปกรณ์" });
  const dup = await lk.addLink(ctxO, card.id, { linkType: "PARTY", linkId: partyId });
  chk("K3.1-S2.1", "addLink(ctx, cardId, {linkType, linkId, role?, label?}) (EDITOR) → แถว · ซ้ำ (cardId,linkType,linkId) → คืนแถวเดิม ไม่สร้างซ้ำ · activity LINK_ADDED", [l1, l2, l3, l4].every((l) => l?.id) && dup?.id === l1.id && (await P.kanbanCardLink.count({ where: { cardId: card.id, removedAt: null } })) === 4 && (await prisma.kanbanActivity.count({ where: { cardId: card.id, type: "LINK_ADDED" } })) === 4, "4 แถว · dup เดิม", `${await P.kanbanCardLink.count({ where: { cardId: card.id } })} · dup=${dup?.id === l1?.id}`);
  const eUrl = await fails(() => lk.addLink(ctxO, card.id, { linkType: "URL", linkId: "javascript:alert(1)" }));
  const eGhost = await fails(() => lk.addLink(ctxO, card.id, { linkType: "PARTY", linkId: "ไม่มีจริง" }));
  const eLabel = await fails(() => lk.addLink(ctxO, card.id, { linkType: "URL", linkId: "https://x.test", label: "ย".repeat(121) }));
  chk("K3.1-S2.2", "URL ต้อง https?: (javascript: → throw ไทย) · linkId ที่ไม่มีจริงในร้าน → throw · label > 120 → throw", !!eUrl && /[ก-๙]/.test(eUrl.message) && !!eGhost && !!eLabel, "throw 3", `${!!eUrl}/${!!eGhost}/${!!eLabel}`);
  const other = await prisma.party.create({ data: { tenantId: `${tid}-other`, name: "ร้านอื่น" } }).catch(() => null);
  if (other) { const eX = await fails(() => lk.addLink(ctxO, card.id, { linkType: "PARTY", linkId: other.id })); chk("K3.1-S2.3", "linkId ของ tenant อื่น (Party ร้านอื่น) → throw (ตัวแปลผลกรอง tenantId ทุกชนิด)", !!eX, "throw", "ไม่ throw"); await prisma.party.delete({ where: { id: other.id } }).catch(() => null); } else chk("K3.1-S2.3", "สร้าง Party ร้านอื่นไม่ได้ — ข้าม", true, "", "");
  const eV = await fails(() => lk.addLink(ctxT, card.id, { linkType: "URL", linkId: "https://x.test/1" }));
  chk("K3.1-S2.4", "thana (VIEWER บนบอร์ด TENANT) เพิ่มลิงก์ → Forbidden", !!eV, "throw", "ไม่ throw");
  const lo = await lk.listCardLinks(ctxO, owner, card.id);
  const byType = (arr: Any[], t: string) => arr.find((x) => x.linkType === t);
  chk("K3.1-S2.5", "listCardLinks(ctx, actor, cardId) → [{id, linkType, typeLabel ไทย, linkId, role, canView, title, subtitle, href, status}] · owner เห็นครบ: PARTY = ชื่อผู้ติดต่อ + href /app/party/{id} · CHAT = 'แชท…' + สถานะเคส + href ?c= · APPROVAL = 'รออนุมัติ' + href /app/approval… · URL = label + href = URL", lo.length === 4 && byType(lo, "PARTY")?.canView === true && /สมชาย/.test(byType(lo, "PARTY").title) && byType(lo, "PARTY").href === `/app/party/${partyId}` && byType(lo, "CHAT_CONVERSATION")?.canView === true && /แชท/.test(byType(lo, "CHAT_CONVERSATION").title) && /c=/.test(byType(lo, "CHAT_CONVERSATION").href) && byType(lo, "APPROVAL_REQUEST")?.canView === true && /อนุมัติ/.test(byType(lo, "APPROVAL_REQUEST").status ?? byType(lo, "APPROVAL_REQUEST").title) && /\/app\/approval/.test(byType(lo, "APPROVAL_REQUEST").href) && byType(lo, "URL")?.href === "https://example.com/spec.pdf" && byType(lo, "URL").title === "สเปกอุปกรณ์" && lo.every((x: Any) => /[ก-๙]/.test(x.typeLabel)), "ครบ 4 · เห็นหมด", JSON.stringify(lo.map((x: Any) => [x.linkType, x.canView, x.title, x.href])).slice(0, 300));
  const lt = await lk.listCardLinks(ctxT, thana, card.id);
  const pT = byType(lt, "PARTY"); const cT = byType(lt, "CHAT_CONVERSATION");
  chk("K3.1-S2.6", "🔴 thana (ไม่มีสิทธิ์โมดูลปลายทาง) เห็นแถวครบ 4 (ไม่ซ่อน) แต่ PARTY/CHAT/APPROVAL = canView false · title = '{ชนิด} (ไม่มีสิทธิ์เข้าถึง)' · **ไม่มีชื่อลูกค้า/ตัวอย่างข้อความ/ยอดเงิน** · href null · URL ยังเห็น", lt.length === 4 && pT?.canView === false && /ไม่มีสิทธิ์เข้าถึง/.test(pT.title) && !/สมชาย/.test(JSON.stringify(pT)) && pT.href === null && cT?.canView === false && !/AOW|ลูกค้าเว็บแชท/.test(JSON.stringify(cT)) && byType(lt, "APPROVAL_REQUEST")?.canView === false && byType(lt, "URL")?.canView === true, "ซ่อนรายละเอียด", JSON.stringify(lt.map((x: Any) => [x.linkType, x.canView, x.title])).slice(0, 300));
  const lt2 = await lk.listCardLinks(ctxT, thanaChat, card.id);
  chk("K3.1-S2.7", "🔴 ให้สิทธิ์ chat.conversation.read กับ thana (actor ใหม่ ไม่แก้ DB) → CHAT เห็นทันที (ไม่มี cache ข้าม user/ข้ามการเรียก) · PARTY ยังไม่เห็น (ไม่มีคีย์ crm/account/party)", byType(lt2, "CHAT_CONVERSATION")?.canView === true && /แชท/.test(byType(lt2, "CHAT_CONVERSATION").title) && byType(lt2, "PARTY")?.canView === false, "CHAT เห็น · PARTY ไม่", JSON.stringify(lt2.map((x: Any) => [x.linkType, x.canView])));
  const mgr = await actorOf(E.users.manager.userId);
  const lm = await lk.listCardLinks(ctxOf(E.users.manager.userId), mgr, card.id);
  chk("K3.1-S2.8", "MANAGER (เต็มสิทธิ์ในหน่วยที่คุม · evaluate เดิม) เห็น PARTY/CHAT/APPROVAL ได้ (tenant-level ไม่ผูก unit)", byType(lm, "PARTY")?.canView === true && byType(lm, "CHAT_CONVERSATION")?.canView === true, "เห็น", JSON.stringify(lm.map((x: Any) => [x.linkType, x.canView])));

  // ═══ S3 ขาย้อน + ลบ ═══
  const back = await lk.listCardsForTarget(ctxO, owner, { linkType: "PARTY", linkId: partyId });
  const backT = await lk.listCardsForTarget(ctxT, thana, { linkType: "PARTY", linkId: partyId });
  const kata = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: (await prisma.kanbanColumn.findFirst({ where: { boardId: E.boards.kataSecret.id, status: "ACTIVE" } }))!.id, title: "QC K3.1 บอร์ดลับ", createdById: U.owner });
  madeCards.push(kata.id);
  await lk.addLink(ctxO, kata.id, { linkType: "PARTY", linkId: partyId });
  const back2 = await lk.listCardsForTarget(ctxO, owner, { linkType: "PARTY", linkId: partyId });
  const back2T = await lk.listCardsForTarget(ctxT, thana, { linkType: "PARTY", linkId: partyId });
  chk("K3.1-S3.1", "listCardsForTarget(ctx, actor, {linkType, linkId}) → [{cardId, cardNo, title, boardId, boardName, columnName, status}] · owner เห็น 2 (ซ่อม + บอร์ดลับกะตะ) · thana เห็นเฉพาะบอร์ดที่มองเห็น (1 = ซ่อม) — ขาย้อนก็กรอง visibleBoardsWhere", back.length === 1 && back[0].cardId === card.id && typeof back[0].boardName === "string" && backT.length === 1 && back2.length === 2 && back2T.length === 1 && !back2T.some((c: Any) => c.cardId === kata.id), "2 / 1", `${back2.length} / ${back2T.length}`);
  await lk.removeLink(ctxO, card.id, l4.id);
  const afterRm = await lk.listCardLinks(ctxO, owner, card.id);
  chk("K3.1-S3.2", "removeLink(ctx, cardId, linkRowId) (EDITOR) → soft delete (removedAt) · หายจากรายการ · activity LINK_REMOVED · เพิ่มซ้ำหลังลบ = คืนชีพแถวเดิม (removedAt null)", afterRm.length === 3 && ((await P.kanbanCardLink.findUnique({ where: { id: l4.id } }))).removedAt !== null && (await prisma.kanbanActivity.count({ where: { cardId: card.id, type: "LINK_REMOVED" } })) === 1 && (await lk.addLink(ctxO, card.id, { linkType: "URL", linkId: "https://example.com/spec.pdf" }))?.id === l4.id && ((await P.kanbanCardLink.findUnique({ where: { id: l4.id } }))).removedAt === null, "soft delete + คืนชีพ", String(afterRm.length));
  const lim = read("src/lib/modules/kanban/limits.ts");
  chk("K3.1-S3.3", "KANBAN_LIMITS.linksPerCard = 30 · เกิน → throw ไทย LIMIT_REACHED (โค้ด)", /linksPerCard:\s*30/.test(lim) && /linksPerCard/.test(read("src/lib/modules/kanban/links.ts")) && /LIMIT_REACHED/.test(read("src/lib/modules/kanban/links.ts")), "มี", "ขาด", "MAJOR");

  // ═══ S4 facade createCardFromExternal (ใช้โดย K3.2/K3.3/K3.9) ═══
  const ext = { boardId: board, title: "QC K3.1 จากแชท", description: "<p>ลูกค้าถามคอร์ส AOW</p>", sourceType: "CHAT", sourceKey: `chat:qc-k31-${Date.now()}`, links: [{ linkType: "CHAT_CONVERSATION", linkId: convId, role: "SOURCE" }, { linkType: "PARTY", linkId: partyId }] };
  const x1 = await lk.createCardFromExternal({ tenantId: tid, systemId: SYS, actorUserId: null }, ext);
  const x2 = await lk.createCardFromExternal({ tenantId: tid, systemId: SYS, actorUserId: null }, ext);
  const x3 = await lk.createCardFromExternal({ tenantId: tid, systemId: SYS, actorUserId: null }, ext);
  if (x1?.cardId) madeCards.push(x1.cardId);
  const xc = await prisma.kanbanCard.findUnique({ where: { id: x1?.cardId ?? "x" } }) as Any;
  chk("K3.1-S4.1", "🔴 createCardFromExternal(ctx, {boardId, columnId?, title, description?, assigneeUserIds?, dueAt?, labelIds?, sourceType, sourceKey, links[]}) → {cardId, created} · ยิงซ้ำ 3 ครั้ง sourceKey เดิม = การ์ด 1 ใบ (created true/false/false · cardId เดิม) · คอลัมน์ปริยาย = คอลัมน์แรก · sourceType/sourceKey เก็บ · description ผ่าน sanitize · ลิงก์ 2 แถว · activity CARD_CREATED · outbox kanban.card.created", x1?.created === true && x2?.created === false && x3?.created === false && x2.cardId === x1.cardId && x3.cardId === x1.cardId && xc?.sourceType === "CHAT" && xc.sourceKey === ext.sourceKey && xc.columnId === col0.id && (await P.kanbanCardLink.count({ where: { cardId: x1.cardId } })) === 2 && (await prisma.kanbanCard.count({ where: { tenantId: tid, sourceKey: ext.sourceKey } as Any })) === 1, "1 ใบ · 2 ลิงก์", JSON.stringify({ x1, x2, x3, st: xc?.sourceType, links: await P.kanbanCardLink.count({ where: { cardId: x1?.cardId ?? "x" } }) }));
  const eBoard = await fails(() => lk.createCardFromExternal({ tenantId: tid, systemId: SYS, actorUserId: null }, { ...ext, sourceKey: "chat:qc-k31-archived", boardId: "ไม่มีบอร์ด" }));
  chk("K3.1-S4.2", "บอร์ดไม่มี/ARCHIVED → throw ไทย (ผู้เรียกฝั่ง consumer ต้อง catch เอง) · facade ไม่ import จาก chat/forms/approval (fitness: ทิศทางเดียว โมดูลอื่น → kanban)", !!eBoard && !/from "@\/lib\/modules\/(chat|forms|approval|hr|pos|account)/.test(read("src/lib/modules/kanban/links.ts")), "throw · ไม่ import ออก", `${!!eBoard}`);

  // ═══ S5 ตัวแปลผล (static) — ครอบทุกชนิด + กติกาข้อมูล ═══
  const src = read("src/lib/modules/kanban/links.ts") + read("src/lib/modules/kanban/link-resolvers.ts");
  chk("K3.1-S5.1", "ทะเบียน LINK_TYPES ครบ 20 ชนิด (label ไทย · module · access · href · resolve) · resolver select เฉพาะฟิลด์ปลอดภัย (ไม่ดึง phone/email/taxId ของ Party · ไม่ดึง payroll ของ HR) · ยอดเงินแสดงเฉพาะเมื่อ canView", EXP_TYPES.every((t) => new RegExp(`\\b${t}\\b`).test(src)) && !/phone:\s*true|email:\s*true|taxId:\s*true|salary|payroll/.test(src) && /canView/.test(src), "20 ชนิด", EXP_TYPES.filter((t) => !new RegExp(`\\b${t}\\b`).test(src)).join(","));
  chk("K3.1-S5.2", "PARTY ผ่าน facade ของ party เท่านั้น (import จาก @/lib/modules/party ไม่แตะ prisma.party ตรง) · ไม่มี cache (ไม่มี Map/lru ระดับโมดูลใน links.ts)", /@\/lib\/modules\/party/.test(src) && !/prisma\.party\./.test(src) && !/new Map\(\)\s*;?\s*\/\/\s*cache|lru|cacheMs/i.test(src), "facade · ไม่ cache", "ผิด");

  // ═══ S6 UI + API (static) ═══
  const cb = read("src/components/kanban/CardBack.tsx") + read("src/components/kanban/CardLinks.tsx");
  chk("K3.1-S6.1", "หลังการ์ดบล็อก 'เชื่อมข้อมูล SHARK' testid card-links (CardLinks.tsx): แถว = ไอคอนชนิด + title/subtitle + ชิปสถานะ + ลิงก์ · ไม่มีสิทธิ์ = เทา '(ไม่มีสิทธิ์เข้าถึง)' ไม่มีลิงก์ · ปุ่มลบ × (EDITOR) · 'เพิ่มการเชื่อม' testid card-link-add (URL กรอกเอง · ผู้ติดต่อ ค้นหาชื่อ) · การ์ดบนบอร์ดชิป 🔗 n testid card-link-count", cb.includes("card-links") && cb.includes("card-link-add") && /เชื่อมข้อมูล SHARK/.test(cb) && /ไม่มีสิทธิ์เข้าถึง/.test(cb) && read("src/components/kanban/Card.tsx").includes("card-link-count"), "ครบ", "ขาด");
  chk("K3.1-S6.2", "actions addCardLinkAction removeCardLinkAction searchPartyForLinkAction · REST op cards.links.list/add/remove (test: K3.1-*) · getCardDetail.links[] · TableRowDto.links เติมจริง (K2.1 เว้นว่างไว้)", ["addCardLinkAction", "removeCardLinkAction", "searchPartyForLinkAction"].every((a) => read("src/lib/modules/kanban/actions.ts").includes(a)) && /cards\.links\.(list|add|remove)/.test(read("src/lib/modules/kanban/api/ops/cards.ts") + read("src/lib/modules/kanban/api/ops/links.ts")) && /K3\.1-S/.test(read("src/lib/modules/kanban/api/ops/cards.ts") + read("src/lib/modules/kanban/api/ops/links.ts")) && /links/.test(read("src/lib/modules/kanban/table.ts")), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/3.1") ? readdirSync(".qc-shots/kanban/3.1").filter((f) => f.endsWith(".png")) : [];
  chk("K3.1-S6.3", "ภาพจริง ≥ 3 ใบใน .qc-shots/kanban/3.1 (บล็อกเชื่อมข้อมูลของ owner · ของคนไม่มีสิทธิ์ · popover เพิ่ม)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tid) {
      const ids = madeCards.filter(Boolean);
      if (ids.length) { await P.kanbanCardLink.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null); await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } }); }
      if (policyId) { await prisma.approvalRequest.deleteMany({ where: { tenantId: tid, entityType: "kanban.card" } }).catch(() => null); await prisma.approvalStep.deleteMany({ where: { policyId } }).catch(() => null); await prisma.approvalPolicy.deleteMany({ where: { id: policyId } }).catch(() => null); }
      if (convId) await prisma.chatConversation.deleteMany({ where: { id: convId } }).catch(() => null);
      if (contactId) await prisma.chatContact.deleteMany({ where: { id: contactId } }).catch(() => null);
      if (chatSysId) await prisma.appSystem.deleteMany({ where: { id: chatSysId } }).catch(() => null);
      if (partyId) await prisma.party.deleteMany({ where: { id: partyId } }).catch(() => null);
      await prisma.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { in: ["kanban.card.created", "approval.request.submitted"] } } }).catch(() => null);
    }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K3.1 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
