// QC — บอร์ดงาน WO K3.2: สร้างงานจากแชท — สวิตช์รายร้าน (integrations) · ปุ่มในหัวห้องแชท · แผงเตรียมการ์ด (ภาพ 09) · AI ร่าง (fallback deterministic) · facade createCardFromExternal + ลิงก์ CHAT/PARTY + ไฟล์แนบ + บันทึกภายในในแชท
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K3.2 · เกณฑ์ §3.11/§9.2/§13 K3.2
// requires: kanban-seed · K3.1 (links.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/integrations.ts") || !existsSync("src/lib/modules/chat/task-from-chat.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (kanban/integrations.ts + chat/task-from-chat.ts)");
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
const bkkDay = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const P = prisma as Any;
let tid = ""; let SYS = ""; let chatSysId: string | null = null; let convId: string | null = null; let contactId: string | null = null; let settingsBackup: unknown = null;
const madeCards: string[] = []; const madeParty: string[] = [];
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const integ = (await import("@/lib/modules/kanban/integrations" as string)) as Record<string, (...a: Any[]) => Any>;
  const tfc = (await import("@/lib/modules/chat/task-from-chat" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string, perms?: Record<string, boolean>) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: perms ?? (m.permissions as Record<string, unknown>) }; };
  const U = { owner: E.users.owner.userId as string, pook: E.users.staff.pook.userId as string, thana: E.users.staff.thana.userId as string };
  const owner = await actorOf(U.owner); const thana = await actorOf(U.thana);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner };
  const board = E.boards.maint.id as string;
  const cols = await prisma.kanbanColumn.findMany({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } });
  const c0 = cols[0]!; const c1 = cols[1]!;
  settingsBackup = (await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } }))?.settings ?? {};
  const NOW = kq.dayFromToday(0, 10); // พุธ 30 ก.ย. 2569 10:00 ไทย
  // เตรียมแชท: ระบบ CHAT ชั่วคราว + ผู้ติดต่อ + ห้อง + ข้อความ IN 2 / OUT 1 + ไฟล์แนบ 1
  const chatSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT" as Any, name: "แชท QC K3.2" } }); chatSysId = chatSys.id;
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", externalUserId: `qc-k32-${Date.now()}`, displayName: "คุณสมชาย (บริษัท เอบีซี)", phone: "0812345678" } }); contactId = contact.id;
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", contactId: contact.id, status: "OPEN" } }); convId = conv.id;
  const m1 = await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: conv.id, direction: "IN", type: "TEXT", body: "สวัสดีครับ พอดีบริษัทอยากจัดทริปดำน้ำให้พนักงาน 12 คน ช่วง 24–26 ต.ค. ครับ มีใบรับรอง 9 คน มือใหม่ 3 คน", createdAt: new Date(NOW.getTime() - 3 * 60_000) } });
  const m2 = await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: conv.id, direction: "IN", type: "TEXT", body: "งบประมาณราว ๆ 15,000 ต่อคน ขอใบเสนอราคาในนามบริษัทด้วยครับ ต้องการคำตอบภายในศุกร์นี้", createdAt: new Date(NOW.getTime() - 2 * 60_000) } });
  const m3 = await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: conv.id, direction: "OUT", type: "TEXT", body: "รับทราบครับ เดี๋ยวทีมขายทำใบเสนอราคาส่งกลับภายในพรุ่งนี้นะครับ", senderUserId: U.pook, createdAt: new Date(NOW.getTime() - 60_000) } });
  await prisma.chatAttachment.create({ data: { tenantId: tid, systemId: chatSys.id, messageId: m1.id, kind: "FILE", storageKey: `t/${tid}/chat/qc-k32.pdf`, url: "https://cdn.example.test/qc-k32.pdf", fileName: "รายชื่อพนักงาน.pdf", mimeType: "application/pdf", sizeBytes: 12345 } });
  const msgs = [m1, m2, m3].map((m) => ({ id: m.id, direction: m.direction, body: m.body, createdAt: m.createdAt, senderName: m.direction === "OUT" ? "ปุ๊ก" : null }));

  // ═══ S1 สวิตช์รายร้าน (integrations ใน AppSystem.settings ของระบบ KANBAN) ═══
  const d0 = await integ.getIntegrations(tid, SYS);
  chk("K3.2-S1.1", "getIntegrations(tenantId, systemId) → IntegrationsConfig (zod · ปริยาย **ปิดทุกตัว**): openTaskFromChat cardFromForm cardFromApproval closeCardOnDocApproved cardOnLeave cardOnVoidedSale cardFromEmail ทุกตัว {enabled:false}", d0 && ["openTaskFromChat", "cardFromForm", "cardFromApproval", "closeCardOnDocApproved", "cardOnLeave", "cardOnVoidedSale", "cardFromEmail"].every((k) => d0[k] && d0[k].enabled === false), "ปิดทุกตัว", JSON.stringify(d0).slice(0, 200));
  const eT = await fails(() => integ.setIntegrations({ ...ctxO, actorUserId: U.thana }, thana, { openTaskFromChat: { enabled: true, boardId: board } }));
  chk("K3.2-S1.2", "setIntegrations(ctx, actor, patch) — STAFF ไม่มีคีย์ kanban.automation.manage → Forbidden · OWNER ได้", !!eT, "throw", "ไม่ throw");
  const eBoard = await fails(() => integ.setIntegrations(ctxO, owner, { openTaskFromChat: { enabled: true, boardId: E.boards.kata.id, columnId: c0.id } }));
  await integ.setIntegrations(ctxO, owner, { openTaskFromChat: { enabled: true, boardId: board, columnId: c0.id, unassignedMinutes: 30 } });
  const d1 = await integ.getIntegrations(tid, SYS);
  chk("K3.2-S1.3", "patch ตรวจ boardId/columnId ต้องเป็นบอร์ด ACTIVE ที่ actor เป็น ADMIN + คอลัมน์ของบอร์ดนั้น (คอลัมน์ผิดบอร์ด → throw) · เขียนทับเฉพาะคีย์ที่ส่ง (คีย์อื่นคงเดิม) · อ่านกลับได้", !!eBoard && d1.openTaskFromChat.enabled === true && d1.openTaskFromChat.boardId === board && d1.openTaskFromChat.columnId === c0.id && d1.openTaskFromChat.unassignedMinutes === 30 && d1.cardFromForm.enabled === false, "ตรง", JSON.stringify(d1.openTaskFromChat));
  const btn = await integ.chatTaskButtonConfig(tid);
  await integ.setIntegrations(ctxO, owner, { openTaskFromChat: { enabled: false } });
  const btnOff = await integ.chatTaskButtonConfig(tid);
  await integ.setIntegrations(ctxO, owner, { openTaskFromChat: { enabled: true, boardId: board, columnId: c0.id } });
  chk("K3.2-S1.4", "chatTaskButtonConfig(tenantId) → { kanbanSystemId, boardId, columnId } เมื่อเปิด · null เมื่อปิด (หน้าแชทใช้ตัดสินว่าโชว์ปุ่มไหม — สวิตช์ปิด = ปุ่มไม่โผล่)", btn?.kanbanSystemId === SYS && btn.boardId === board && btnOff === null, "config/null", JSON.stringify({ btn, btnOff }));

  // ═══ S2 ร่างด้วย AI — fallback deterministic (ไม่มีคีย์ AI ใน QC) ═══
  const draft = tfc.draftFromMessages(msgs, { now: NOW, contactName: contact.displayName });
  chk("K3.2-S2.1", "draftFromMessages(messages, {now, contactName}) (pure) → { title ≤ 80 (จากข้อความลูกค้าแรก · ไม่มีขึ้นบรรทัด), summary ≤ 500 (รวมข้อความลูกค้า · มี 12 คน/15,000), dueAt, dueGuessed, checklist ≤ 5, readCount = 3 }", draft && typeof draft.title === "string" && draft.title.length > 0 && draft.title.length <= 80 && !/\n/.test(draft.title) && /12 คน/.test(draft.summary) && /15,000/.test(draft.summary) && draft.summary.length <= 500 && Array.isArray(draft.checklist) && draft.checklist.length <= 5 && draft.readCount === 3, "โครงครบ", JSON.stringify(draft).slice(0, 240));
  chk("K3.2-S2.2", "เดากำหนดส่งจากคำไทย: 'ภายในศุกร์นี้' (now = พุธ 30 ก.ย.) → ศุกร์ 2 ต.ค. 18:00 ไทย · dueGuessed true · ไม่มีคำบอกเวลา → dueAt null + dueGuessed false", draft.dueAt && bkkDay(new Date(draft.dueAt)) === bkkDay(kq.dayFromToday(2)) && new Date(draft.dueAt).getUTCHours() === 11 && draft.dueGuessed === true && tfc.draftFromMessages([{ id: "x", direction: "IN", body: "สอบถามราคาคอร์ส", createdAt: NOW, senderName: null }], { now: NOW, contactName: "ก" }).dueAt === null, "2 ต.ค. 18:00", String(draft.dueAt));
  const aiJson = JSON.stringify({ title: "ทำใบเสนอราคาทริปเรือ Sea Fox 3 วัน 2 คืน — กลุ่มบริษัท เอบีซี 12 คน", summary: "12 ท่าน ช่วง 24–26 ต.ค. งบ 15,000/คน ขอใบเสนอราคาในนามบริษัท", dueAt: kq.dayFromToday(2, 18).toISOString(), checklist: ["เช็ควันว่างเรือ", "ขอเลขผู้เสียภาษี", "คำนวณต้นทุน"] });
  const dAi = await tfc.draftTaskFromChat({ tenantId: tid, systemId: chatSys.id, actorUserId: U.owner }, conv.id, { deps: { complete: async () => aiJson } });
  const dBad = await tfc.draftTaskFromChat({ tenantId: tid, systemId: chatSys.id, actorUserId: U.owner }, conv.id, { deps: { complete: async () => "ไม่ใช่ JSON {{{" } });
  chk("K3.2-S2.3", "draftTaskFromChat(ctx, conversationId, {deps?: {complete}}) → อ่าน ≤ 12 ข้อความล่าสุดของห้อง → ใช้ AI เมื่อมี (prompt อังกฤษ · ตอบ JSON ผ่าน zod) → title/summary/checklist จาก AI · aiUsed true · AI ตอบเพี้ยน → fallback (aiUsed false) ไม่ throw", dAi?.title?.includes("Sea Fox") && dAi.checklist?.length === 3 && dAi.aiUsed === true && dAi.readCount === 3 && dBad?.aiUsed === false && typeof dBad.title === "string", "AI/fallback", JSON.stringify({ ai: dAi?.title, used: dAi?.aiUsed, bad: dBad?.aiUsed }));
  chk("K3.2-S2.4", "prompt ของ AI เป็นภาษาอังกฤษ (reference_llm_thai_token_cost) · ไม่ส่งชื่อ/เบอร์ลูกค้าเข้า prompt (ส่งเฉพาะเนื้อข้อความ)", /system|prompt/i.test(read("src/lib/modules/chat/task-from-chat.ts")) && !/สรุปบทสนทนา|ตั้งชื่อการ์ด.*prompt/.test(read("src/lib/modules/chat/task-from-chat.ts").split("complete(")[1] ?? "") && !/phone|displayName/.test((read("src/lib/modules/chat/task-from-chat.ts").match(/const prompt[\s\S]{0,800}/)?.[0]) ?? ""), "อังกฤษ · ไม่มี PII", "ตรวจโค้ด", "MAJOR");

  // ═══ S3 สร้างการ์ดจริง ═══
  const input = { conversationId: conv.id, title: dAi.title, description: `<p>${dAi.summary}</p>`, boardId: board, columnId: c1.id, assigneeUserIds: [U.pook], dueAt: kq.dayFromToday(2, 18), checklist: dAi.checklist, link: { conversation: true, party: true, copyAttachments: true } };
  const r1 = await tfc.createTaskFromChat({ tenantId: tid, systemId: chatSys.id, actorUserId: U.owner }, owner, input);
  if (r1?.cardId) madeCards.push(r1.cardId);
  if (r1?.partyId) madeParty.push(r1.partyId);
  const card = await prisma.kanbanCard.findUnique({ where: { id: r1?.cardId ?? "x" }, include: { assignees: true, checklists: { include: { items: true } }, attachments: true } }) as Any;
  const links = await P.kanbanCardLink.findMany({ where: { cardId: r1?.cardId ?? "x", removedAt: null } });
  chk("K3.2-S3.1", "🔴 createTaskFromChat(ctx(chat), actor, {conversationId, title, description, boardId, columnId?, assigneeUserIds?, dueAt?, labelIds?, checklist?, link:{conversation, party, copyAttachments}}) → {cardId, cardNo, created:true, partyId} · การ์ดอยู่บอร์ด/คอลัมน์ที่เลือก · sourceType CHAT · sourceKey chat:conv:{conv}:{ข้อความลูกค้าล่าสุด} · ผู้รับผิดชอบ pook · dueAt · เช็คลิสต์ 3 ข้อ", r1?.created === true && typeof r1.cardNo === "number" && card?.boardId === board && card.columnId === c1.id && card.sourceType === "CHAT" && card.sourceKey === `chat:conv:${conv.id}:${m2.id}` && card.assignees.some((a: Any) => a.userId === U.pook) && card.dueAt?.getTime() === kq.dayFromToday(2, 18).getTime() && card.checklists?.[0]?.items?.length === 3, "ครบ", JSON.stringify({ r1, col: card?.columnId === c1.id, sk: card?.sourceKey, cl: card?.checklists?.[0]?.items?.length }));
  chk("K3.2-S3.2", "ลิงก์: CHAT_CONVERSATION (role SOURCE) + PARTY (ผู้ติดต่อจาก ChatContact ผ่าน facade party.safeFindOrCreate — ชื่อ+เบอร์ · partyId คืนมา) · ไฟล์แนบในแชท 1 ไฟล์ถูกคัดลอกเป็น FileAsset (cdnUrl เดิม) + KanbanAttachment", links.some((l: Any) => l.linkType === "CHAT_CONVERSATION" && l.linkId === conv.id && l.role === "SOURCE") && links.some((l: Any) => l.linkType === "PARTY" && l.linkId === r1.partyId) && !!(await prisma.party.findFirst({ where: { id: r1.partyId ?? "x", tenantId: tid, name: { contains: "สมชาย" } } })) && card.attachments.length === 1 && !!(await prisma.fileAsset.findFirst({ where: { id: card.attachments[0].fileId, cdnUrl: "https://cdn.example.test/qc-k32.pdf" } })), "2 ลิงก์ + 1 ไฟล์", JSON.stringify({ links: links.map((l: Any) => l.linkType), att: card?.attachments?.length }));
  const note = await prisma.chatMessage.findFirst({ where: { conversationId: conv.id, isInternal: true }, orderBy: { createdAt: "desc" } });
  chk("K3.2-S3.3", "แปะบันทึกภายในในห้องแชท (isInternal · ไม่ส่งออกช่องทาง): 'สร้างงาน #{cardNo} …' + ลิงก์ไปการ์ด · senderUserId = คนกด", !!note && note.isInternal && note.body?.includes(`#${r1.cardNo}`) && /\?card=/.test(note.body ?? "") && note.senderUserId === U.owner && note.direction === "OUT", "มีบันทึก", note?.body?.slice(0, 100) ?? "ไม่มี");
  const r2 = await tfc.createTaskFromChat({ tenantId: tid, systemId: chatSys.id, actorUserId: U.owner }, owner, input);
  chk("K3.2-S3.4", "กดซ้ำ (ห้องเดิม · ข้อความลูกค้าล่าสุดใบเดิม) → created:false cardId เดิม · ไม่แปะบันทึกซ้ำ", r2?.created === false && r2.cardId === r1.cardId && (await prisma.chatMessage.count({ where: { conversationId: conv.id, isInternal: true } })) === 1, "เดิม", JSON.stringify(r2));
  await integ.setIntegrations(ctxO, owner, { openTaskFromChat: { enabled: false } });
  const eOff = await fails(() => tfc.createTaskFromChat({ tenantId: tid, systemId: chatSys.id, actorUserId: U.owner }, owner, { ...input, title: "ปิดสวิตช์" }));
  await integ.setIntegrations(ctxO, owner, { openTaskFromChat: { enabled: true, boardId: board, columnId: c0.id } });
  const thanaNoChat = await actorOf(U.thana);
  const eNoChat = await fails(() => tfc.createTaskFromChat({ tenantId: tid, systemId: chatSys.id, actorUserId: U.thana }, thanaNoChat, { ...input, title: "ไม่มีสิทธิ์แชท" }));
  chk("K3.2-S3.5", "สวิตช์ปิด → throw ไทย (ฝั่ง server ไม่เชื่อแค่ UI) · thana ไม่มี chat.conversation.read → Forbidden · บอร์ดที่ actor ไม่ใช่ EDITOR → Forbidden (ผ่าน facade)", !!eOff && /[ก-๙]/.test(eOff.message) && !!eNoChat, "throw ทั้งคู่", `${!!eOff}/${!!eNoChat}`);

  // ═══ S4 สถาปัตยกรรม + UI (static) ═══
  const kanbanFiles = readdirSync("src/lib/modules/kanban").filter((f) => f.endsWith(".ts") || f.endsWith(".tsx")).map((f) => read(`src/lib/modules/kanban/${f}`)).join("\n");
  const tfcSrc = read("src/lib/modules/chat/task-from-chat.ts");
  chk("K3.2-S4.1", "🔴 ทิศทางเดียว: ไม่มีไฟล์ใน modules/kanban import จาก @/lib/modules/chat · task-from-chat.ts (โมดูลแชท) เรียก kanban ผ่าน facade `@/lib/modules/kanban/links` (createCardFromExternal) เท่านั้น ไม่ล้วง service/cards · fitness ALLOWED_EDGES มี chat→kanban (Fable อนุมัติ K3.2)", !/@\/lib\/modules\/chat/.test(kanbanFiles) && /@\/lib\/modules\/kanban\/links/.test(tfcSrc) && !/@\/lib\/modules\/kanban\/(service|cards|moves|checklists|attachments)/.test(tfcSrc) && /"chat→kanban"/.test(read("scripts/fitness.mts")), "ทิศเดียว", "ผิดทิศ");
  const panel = read("src/lib/modules/chat/task-from-chat-panel.tsx");
  const room = read("src/lib/modules/chat/inbox-client.tsx");
  chk("K3.2-S4.2", "หัวห้องแชทมีปุ่ม 'สร้างงาน' testid chat-create-task (แสดงเฉพาะเมื่อ chatTaskButtonConfig ไม่ null — ส่งเป็น prop จาก server) · เปิดแผงขวา 380px testid task-from-chat-panel (task-from-chat-panel.tsx) หัว 'สร้างงานจากบทสนทนานี้'", room.includes("chat-create-task") && /สร้างงาน/.test(room) && panel.includes("task-from-chat-panel") && /สร้างงานจากบทสนทนานี้/.test(panel) && /380/.test(panel), "ครบ", "ขาด");
  chk("K3.2-S4.3", "แผงตามภาพ 09: กล่อง 'ผู้ช่วย AI เตรียมให้แล้ว' + 'อ่าน {n} ข้อความล่าสุด → ตั้งชื่อการ์ด สรุปรายละเอียด เดากำหนดส่ง และร่างเช็คลิสต์ให้ · แก้ไขได้ก่อนบันทึก' · ฟิลด์ ชื่อการ์ด / ลงบอร์ด / คอลัมน์ / ผู้รับผิดชอบ / กำหนดส่ง (ชิป AI เมื่อ dueGuessed) / ป้ายกำกับ / รายละเอียด (สรุปจากแชท) · 'เชื่อมอัตโนมัติ' 4 ติ๊ก (บทสนทนา {ช่องทาง} นี้ · ผู้ติดต่อ: {ชื่อ} CRM / Party · คัดลอกไฟล์แนบในแชท ({n} ไฟล์) · สร้างใบเสนอราคาร่างในระบบบัญชีด้วย = ปิดไว้ 'เร็ว ๆ นี้') · บรรทัด 'เมื่อการ์ดถูกปิด ระบบจะกลับมาแปะบันทึกในบทสนทนานี้ให้อัตโนมัติ' · ท้าย 'ปุ่มนี้เปิด/ปิดได้ที่ ตั้งค่า › การเชื่อมต่อ' · ปุ่ม ยกเลิก / สร้างการ์ด (testid task-from-chat-submit)", /ผู้ช่วย AI เตรียมให้แล้ว/.test(panel) && /แก้ไขได้ก่อนบันทึก/.test(panel) && /ลงบอร์ด/.test(panel) && /ผู้รับผิดชอบ/.test(panel) && /กำหนดส่ง/.test(panel) && /สรุปจากแชท/.test(panel) && /เชื่อมอัตโนมัติ/.test(panel) && /คัดลอกไฟล์แนบในแชท/.test(panel) && /ใบเสนอราคาร่าง/.test(panel) && /แปะบันทึกในบทสนทนานี้/.test(panel) && /การเชื่อมต่อ/.test(panel) && panel.includes("task-from-chat-submit"), "ครบตามภาพ", "ขาด");
  const settings = read("src/components/kanban/IntegrationsSettings.tsx") + read("src/app/app/sys/[id]/kanban/settings/page.tsx");
  chk("K3.2-S4.4", "ตั้งค่าบอร์ดงาน › 'การเชื่อมต่อ' testid kanban-integrations (IntegrationsSettings.tsx): สวิตช์ 'สร้างงานจากแชท' + เลือกบอร์ด/คอลัมน์ปลายทาง + คำอธิบาย · (สวิตช์อื่นของ K3.3 อยู่บล็อกเดียวกัน — ตอนนี้แสดง 'เร็ว ๆ นี้') · action setIntegrationsAction", settings.includes("kanban-integrations") && /สร้างงานจากแชท/.test(settings) && /setIntegrationsAction/.test(settings + read("src/lib/modules/kanban/actions.ts")), "ครบ", "ขาด");
  chk("K3.2-S4.5", "actions ฝั่งแชท: draftTaskFromChatAction(conversationId) · createTaskFromChatAction(input) ใน chat/task-from-chat-actions.ts (\"use server\" · ตรวจ assertChatCan ก่อน) · ผลลัพธ์แสดง toast 'สร้างการ์ด #n แล้ว' + ลิงก์เปิดการ์ด", /draftTaskFromChatAction/.test(read("src/lib/modules/chat/task-from-chat-actions.ts")) && /createTaskFromChatAction/.test(read("src/lib/modules/chat/task-from-chat-actions.ts")) && /assertChatCan|requireChatRead/.test(read("src/lib/modules/chat/task-from-chat-actions.ts")), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/3.2") ? readdirSync(".qc-shots/kanban/3.2").filter((f) => f.endsWith(".png")) : [];
  chk("K3.2-S4.6", "ภาพจริง ≥ 3 ใบใน .qc-shots/kanban/3.2 (แผงซ้อนบนหน้าแชทจริงเทียบภาพ 09 · หลังสร้าง (toast + บันทึกภายในในห้อง) · ปุ่มไม่โผล่เมื่อปิดสวิตช์)", shots.length >= 3, "≥3", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tid) {
      const ids = madeCards.filter(Boolean);
      if (ids.length) { await P.kanbanCardLink.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null); await prisma.kanbanAttachment.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null); await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } }); }
      if (convId) { await prisma.chatAttachment.deleteMany({ where: { message: { conversationId: convId } } }).catch(() => null); await prisma.chatMessage.deleteMany({ where: { conversationId: convId } }).catch(() => null); await prisma.chatConversation.deleteMany({ where: { id: convId } }).catch(() => null); }
      if (contactId) await prisma.chatContact.deleteMany({ where: { id: contactId } }).catch(() => null);
      if (chatSysId) await prisma.appSystem.deleteMany({ where: { id: chatSysId } }).catch(() => null);
      if (madeParty.length) await prisma.party.deleteMany({ where: { id: { in: madeParty } } }).catch(() => null);
      await prisma.fileAsset.deleteMany({ where: { tenantId: tid, cdnUrl: "https://cdn.example.test/qc-k32.pdf" } }).catch(() => null);
      if (settingsBackup !== null) await prisma.appSystem.update({ where: { id: SYS }, data: { settings: settingsBackup as Any } }).catch(() => null);
      await prisma.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { startsWith: "kanban." } } }).catch(() => null);
    }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K3.2 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
