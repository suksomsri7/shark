// QC — บอร์ดงาน WO K3.5: เครื่องมือ AI ครบ 8 ตาม §8.2 (เพิ่ม kanban_card_detail · kanban_set_due · kanban_card_from_chat) + ปุ่ม AI 3 ปุ่มในหลังการ์ด + ป้าย "ผู้ช่วย AI" ในสายกิจกรรม · ทุกการเขียนเป็นข้อเสนอ · ตรวจสิทธิ์คนกดยืนยัน · executor ผ่าน service
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K3.5 · เกณฑ์ §8.2/§8.3/§13 K3.5 · ต้องมี K3.2 (task-from-chat) ก่อน
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/kanban/ai.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/kanban/ai.ts)");
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
let tid = ""; let SYS = ""; let chatSysId: string | null = null; let convId: string | null = null; let contactId: string | null = null; let settingsBackup: unknown = null;
const madeCards: string[] = []; const madeProposals: string[] = [];
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId;
  const kops = (await import("@/lib/ai/kanban-ops" as string)) as Record<string, (...a: Any[]) => Any>;
  const skills = (await import("@/lib/ai/skills" as string)) as Record<string, Any>;
  const ai = (await import("@/lib/modules/kanban/ai" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const svc = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const integ = (await import("@/lib/modules/kanban/integrations" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string, perms?: Record<string, boolean>) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: perms ?? (m.permissions as Record<string, unknown>) }; };
  const U = { owner: E.users.owner.userId as string, pook: E.users.staff.pook.userId as string, thana: E.users.staff.thana.userId as string, noPerm: (await prisma.user.findFirst({ where: { email: kq.KQC.noPermEmail } }))!.id };
  const owner = await actorOf(U.owner); const noPerm = await actorOf(U.noPerm);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner };
  const board = E.boards.maint.id as string;
  const c0 = (await prisma.kanbanColumn.findFirst({ where: { boardId: board, status: "ACTIVE" }, orderBy: { position: "asc" } }))!;
  const card = await svc.createCard({ tenantId: tid, systemId: SYS, columnId: c0.id, title: "QC K3.5 การ์ดสำหรับ AI", description: "<p>ลูกค้าขอใบเสนอราคาทริป 12 คน ช่วง 24–26 ต.ค. งบ 15,000/คน</p>", createdById: U.owner }); madeCards.push(card.id);
  const cl = await prisma.kanbanChecklist.create({ data: { tenantId: tid, cardId: card.id, title: "ขั้นตอน", position: "a0" } });
  await prisma.kanbanChecklistItem.create({ data: { tenantId: tid, checklistId: cl.id, text: "เช็ควันว่างเรือ", position: "a0", done: false } });
  await prisma.kanbanComment.create({ data: { tenantId: tid, cardId: card.id, authorUserId: U.pook, body: "ติดต่อลูกค้าแล้ว รอเลขผู้เสียภาษี" } });
  settingsBackup = (await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } }))?.settings ?? {};

  // ═══ S1 ทะเบียน 8 ตัวครบ + ประเภทถูก ═══
  const names: string[] = kops.kanbanToolNames();
  const REQ = ["kanban_search_cards", "kanban_board_summary", "kanban_card_detail", "kanban_move_card", "kanban_assign_card", "kanban_set_due", "kanban_add_checklist", "kanban_card_from_chat"];
  chk("K3.5-S1.1", "kanbanToolNames() มีครบ 8 ตัวของ §8.2 (+ ของเดิม) · 3 ตัวใหม่ = kanban_card_detail (read) · kanban_set_due (write) · kanban_card_from_chat (write) — มาจาก op ที่ประกาศ tool ในทะเบียน (ไม่มีรายชื่อชุดที่สอง)", REQ.every((n) => names.includes(n)) && names.length >= 19, "8/8", REQ.filter((n) => !names.includes(n)).join(",") || `${names.length} ตัว`);
  const infos: Any[] = kops.kanbanToolInfos();
  const info = (n: string) => infos.find((i) => i.name === n);
  chk("K3.5-S1.2", "ชนิด: card_detail = อ่าน (write false) · set_due / card_from_chat / move / assign / add_checklist = เขียน (ข้อเสนอ) · คำอธิบาย tool เป็นอังกฤษ (ไม่มีอักษรไทย) · parameters เป็น JSON schema", info("kanban_card_detail")?.write === false && ["kanban_set_due", "kanban_card_from_chat", "kanban_move_card", "kanban_assign_card", "kanban_add_checklist"].every((n) => info(n)?.write === true) && REQ.every((n) => !/[ก-๙]/.test(info(n)?.description ?? "ก")) && REQ.every((n) => typeof info(n)?.parameters === "object"), "ชนิดถูก · อังกฤษ", JSON.stringify(REQ.map((n) => [n, info(n)?.write, /[ก-๙]/.test(info(n)?.description ?? "")])));
  let regErr: string | null = null; try { skills.assertSkillRegistryComplete(); } catch (e) { regErr = (e as Error).message; }
  const tasks = skills.SKILLS.find((s: Any) => s.id === "tasks");
  chk("K3.5-S1.3", "assertSkillRegistryComplete() ผ่าน · สกิล tasks มีชื่อครบ 8 · summary สกิล (อังกฤษ) กล่าวถึง card detail / set due / create a card from a chat thread", regErr === null && REQ.every((n) => tasks?.tools?.includes(n)) && /chat/i.test(tasks?.summary ?? "") && /due/i.test(tasks?.summary ?? "") && !/[ก-๙]/.test(tasks?.summary ?? "ก"), "ผ่าน", regErr ?? JSON.stringify(REQ.filter((n) => !tasks?.tools?.includes(n))));
  const access = kops.kanbanKindAccess() as Record<string, { module: string; action: string }>;
  const kindOf = (opId: string) => kops.kanbanKindOf(opId) as string;
  chk("K3.5-S1.4", "KIND_ACCESS (derive จาก op.action): set_due → kanban.card.update · card_from_chat → kanban.card.create · move → kanban.card.move · assign → kanban.card.update · add_checklist → kanban.card.update (§8.2)", access[kindOf("cards.setDue")]?.action === "kanban.card.update" && access[kindOf("cards.fromChat")]?.action === "kanban.card.create" && access[kindOf("cards.move")]?.action === "kanban.card.move" && access[kindOf("cards.assignees.set")]?.action === "kanban.card.update" && access[kindOf("checklists.create")]?.action === "kanban.card.update", "ครบ", JSON.stringify({ due: access[kindOf("cards.setDue")], chat: access[kindOf("cards.fromChat")] }));

  // ═══ S2 อ่าน: card_detail ═══
  const det = await kops.runKanbanTool(tid, "kanban_card_detail", { cardId: card.id }, { systemId: SYS });
  chk("K3.5-S2.1", "kanban_card_detail {cardId | cardNo+boardName} → mode read · ผล: title, description (ข้อความล้วน ไม่มี HTML), column, board, assignees, dueAt, labels, checklists[{title, items[{text, done}]}], comments[{author, body, at}] (ไม่รวมที่ลบ), links (K3.1)", det?.mode === "read" && det.result?.title === card.title && !/<p>/.test(JSON.stringify(det.result)) && det.result.checklists?.[0]?.items?.[0]?.text === "เช็ควันว่างเรือ" && det.result.comments?.length === 1 && /รอเลขผู้เสียภาษี/.test(det.result.comments[0].body) && Array.isArray(det.result.links), "read ครบ", JSON.stringify(det).slice(0, 240));
  const ghost = await kops.runKanbanTool(tid, "kanban_card_detail", { cardId: "ไม่มี" }, { systemId: SYS });
  chk("K3.5-S2.2", "การ์ดไม่มี/ต่างร้าน → mode error ไทย (ไม่ throw)", ghost?.mode === "error" && /[ก-๙]/.test(ghost.error), "error ไทย", JSON.stringify(ghost));

  // ═══ S3 เขียน = ข้อเสนอเสมอ · executor ผ่าน service · ตรวจสิทธิ์คนกดยืนยัน ═══
  const due = kq.dayFromToday(3, 18);
  const pd = await kops.runKanbanTool(tid, "kanban_set_due", { cardId: card.id, dueAt: due.toISOString(), reminderMinutesBefore: 60 }, { systemId: SYS });
  const cardBefore = await prisma.kanbanCard.findUnique({ where: { id: card.id } });
  chk("K3.5-S3.1", "🔴 kanban_set_due → mode propose (kind ของ op cards.setDue · summary ไทยมีชื่อการ์ด+วันที่ไทย · payload {cardId, dueAt, reminderMinutesBefore}) · **ยังไม่เขียน DB** (dueAt ยัง null)", pd?.mode === "propose" && pd.kind === kindOf("cards.setDue") && /[ก-๙]/.test(pd.summary) && pd.summary.includes(card.title) && pd.payload?.cardId === card.id && cardBefore?.dueAt === null, "propose · ยังไม่เขียน", JSON.stringify({ mode: pd?.mode, kind: pd?.kind, due: cardBefore?.dueAt }));
  const m = (a: Any) => ({ role: a.role, unitAccess: a.unitAccess, permissions: a.permissions });
  const eNoPerm = await fails(() => kops.dispatchKanbanKind(m(noPerm), tid, "qc-proposal-1", pd.kind, { ...pd.payload, systemId: SYS }, U.noPerm));
  chk("K3.5-S3.2", "🔴 กดยืนยันด้วยบัญชีที่ไม่มีสิทธิ์ (STAFF ไม่มีคีย์ kanban.card.update) → ถูกปฏิเสธ (throw ไทย) · การ์ดยังไม่เปลี่ยน — ตรวจสิทธิ์ของ **คนกดยืนยัน**", !!eNoPerm && /[ก-๙]/.test(eNoPerm.message) && ((await prisma.kanbanCard.findUnique({ where: { id: card.id } }))!).dueAt === null, "ปฏิเสธ", eNoPerm?.message?.slice(0, 60) ?? "ไม่ throw");
  const okMsg = await kops.dispatchKanbanKind(m(owner), tid, "qc-proposal-1", pd.kind, { ...pd.payload, systemId: SYS }, U.owner);
  const cardAfter = await prisma.kanbanCard.findUnique({ where: { id: card.id } });
  chk("K3.5-S3.3", "OWNER กดยืนยัน → executor เรียก updateCardFields (service) → dueAt/reminder ตั้ง · activity CARD_DUE_SET actorUserId = คนกดยืนยัน + data.viaAi/proposalId · ข้อความผลไทย", typeof okMsg === "string" && /[ก-๙]/.test(okMsg) && cardAfter?.dueAt?.getTime() === due.getTime() && cardAfter.reminderMinutesBefore === 60 && !!(await prisma.kanbanActivity.findFirst({ where: { cardId: card.id, type: "CARD_DUE_SET", actorUserId: U.owner } })), "ตั้งแล้ว", JSON.stringify({ okMsg: okMsg?.slice?.(0, 60), due: cardAfter?.dueAt }));
  chk("K3.5-S3.4", "executor ของ kanban ไม่แตะ Prisma ตรง (kanban-ops.ts ไม่มี prisma.kanban*.(create|update|delete) — อ่านชื่อเพื่อทำข้อความผลได้)", !/prisma\.kanban\w+\.(create|update|delete|upsert)/.test(read("src/lib/ai/kanban-ops.ts")), "ผ่าน service", "แตะตรง");

  // ═══ S4 kanban_card_from_chat (หัวใจของภาพ 09 ฝั่ง AI) ═══
  await integ.setIntegrations(ctxO, owner, { openTaskFromChat: { enabled: true, boardId: board, columnId: c0.id } });
  const chatSys = await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT" as Any, name: "แชท QC K3.5" } }); chatSysId = chatSys.id;
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", externalUserId: `qc-k35-${Date.now()}`, displayName: "คุณสมหญิง" } }); contactId = contact.id;
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", contactId: contact.id, status: "OPEN" } }); convId = conv.id;
  const im = await prisma.chatMessage.create({ data: { tenantId: tid, systemId: chatSys.id, conversationId: conv.id, direction: "IN", type: "TEXT", body: "อยากจองคอร์ส Open Water 2 คน ปลายเดือนนี้ ขอราคาด้วยค่ะ", createdAt: new Date() } });
  const pc = await kops.runKanbanTool(tid, "kanban_card_from_chat", { conversationId: conv.id }, { systemId: SYS });
  chk("K3.5-S4.1", "kanban_card_from_chat {conversationId, boardName?} → อ่านบทสนทนา (≤12 ข้อความ · ผ่าน draftTaskFromChat ของ K3.2 fallback ไม่มี AI) → mode propose · summary ไทย 'สร้างการ์ด \"{ชื่อ}\" จากแชทของ {ผู้ติดต่อ}…' · payload {conversationId, title, description, boardId, columnId, dueAt?, checklist?} · ยังไม่มีการ์ด", pc?.mode === "propose" && pc.kind === kindOf("cards.fromChat") && /[ก-๙]/.test(pc.summary) && /สมหญิง/.test(pc.summary) && pc.payload?.conversationId === conv.id && typeof pc.payload.title === "string" && /Open Water/.test(pc.payload.title + pc.payload.description) && (await prisma.kanbanCard.count({ where: { tenantId: tid, sourceType: "CHAT", sourceKey: { startsWith: `chat:conv:${conv.id}` } } as Any })) === 0, "propose", JSON.stringify(pc).slice(0, 240));
  const okChat = await kops.dispatchKanbanKind(m(owner), tid, "qc-proposal-2", pc.kind, { ...pc.payload, systemId: SYS }, U.owner);
  const fromChat = await prisma.kanbanCard.findFirst({ where: { tenantId: tid, sourceType: "CHAT", sourceKey: `chat:conv:${conv.id}:${im.id}` } as Any });
  if (fromChat) madeCards.push(fromChat.id);
  chk("K3.5-S4.2", "ยืนยัน → เรียก createTaskFromChat (โมดูลแชท · ทางเดียวกับปุ่มในหน้าแชท) → การ์ด sourceKey chat:conv:{conv}:{msg} + ลิงก์ CHAT_CONVERSATION + บันทึกภายในในห้อง · ข้อความผลมี #เลขการ์ด", typeof okChat === "string" && !!fromChat && /#\d+/.test(okChat) && (await P.kanbanCardLink.count({ where: { cardId: fromChat?.id ?? "x", linkType: "CHAT_CONVERSATION" } })) === 1 && (await prisma.chatMessage.count({ where: { conversationId: conv.id, isInternal: true } })) === 1, "การ์ด + ลิงก์ + บันทึก", JSON.stringify({ okChat: okChat?.slice?.(0, 60), card: !!fromChat }));
  await integ.setIntegrations(ctxO, owner, { openTaskFromChat: { enabled: false } });
  const pcOff = await kops.runKanbanTool(tid, "kanban_card_from_chat", { conversationId: conv.id }, { systemId: SYS });
  chk("K3.5-S4.3", "สวิตช์สร้างงานจากแชทปิด → mode error ไทย บอกให้เปิดที่ ตั้งค่า › การเชื่อมต่อ (AI ไม่ข้ามสวิตช์ของร้าน)", pcOff?.mode === "error" && /การเชื่อมต่อ|ตั้งค่า/.test(pcOff.error), "error ไทย", JSON.stringify(pcOff));

  // ═══ S5 ปุ่ม AI 3 ปุ่มในหลังการ์ด (kanban/ai.ts · deps.complete ฉีดได้) ═══
  const ccols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanComment'`)).map((c) => c.column_name);
  chk("K3.5-S5.1", "KanbanComment เพิ่ม aiGenerated Boolean default false (ป้าย 'ผู้ช่วย AI' ในสายกิจกรรม · ห้ามปลอมเป็นคน)", ccols.includes("aiGenerated"), "มี", "ขาด");
  const sum = await ai.summarizeCard(ctxO, owner, card.id, { deps: { complete: async (p: string) => (/[ก-๙]/.test(p.split("\n")[0] ?? "") ? "PROMPT_THAI" : "สรุป: ลูกค้าขอใบเสนอราคาทริป 12 คน · รอเลขผู้เสียภาษี · เช็ควันว่างเรือยังไม่เสร็จ") } });
  const sumRow = await prisma.kanbanComment.findFirst({ where: { cardId: card.id, aiGenerated: true } as Any, orderBy: { createdAt: "desc" } }) as Any;
  chk("K3.5-S5.2", "summarizeCard(ctx, actor, cardId, {deps}) → อ่านชื่อ/รายละเอียด/เช็คลิสต์/ความเห็น → prompt **อังกฤษ** (บรรทัดแรกไม่มีไทย) → เขียนความเห็น aiGenerated=true authorUserId=คนกด body ขึ้นต้น 'สรุปโดยผู้ช่วย AI' · activity AI_SUGGESTED · คืน {commentId, text}", sum?.commentId && sum.text !== "PROMPT_THAI" && !!sumRow && sumRow.authorUserId === U.owner && /ผู้ช่วย AI/.test(sumRow.body) && /12 คน/.test(sumRow.body) && !!(await prisma.kanbanActivity.findFirst({ where: { cardId: card.id, type: "AI_SUGGESTED" as Any } })), "ความเห็น AI", JSON.stringify({ sum, body: sumRow?.body?.slice(0, 80) }));
  const sug = await ai.suggestChecklist(ctxO, owner, card.id, { deps: { complete: async () => JSON.stringify({ title: "ขั้นตอนใบเสนอราคา", items: ["ขอเลขผู้เสียภาษี", "คำนวณต้นทุน", "ส่งให้ลูกค้า"] }) } });
  chk("K3.5-S5.3", "suggestChecklist → **ข้อเสนอ** (ยังไม่สร้างเช็คลิสต์ · คืน {title, items[]} ให้ผู้ใช้กดยอมรับ) · acceptChecklistSuggestion(ctx, actor, cardId, {title, items}) → สร้างผ่าน checklists service (ชุดใหม่ + รายการ) · activity ระบุ AI", sug?.title === "ขั้นตอนใบเสนอราคา" && sug.items?.length === 3 && (await prisma.kanbanChecklist.count({ where: { cardId: card.id } })) === 1 && !!(await ai.acceptChecklistSuggestion(ctxO, owner, card.id, sug)) && (await prisma.kanbanChecklist.count({ where: { cardId: card.id } })) === 2 && (await prisma.kanbanChecklistItem.count({ where: { checklist: { cardId: card.id } } })) === 4, "เสนอก่อน แล้วสร้างเมื่อยอมรับ", JSON.stringify({ sug, cl: await prisma.kanbanChecklist.count({ where: { cardId: card.id } }) }));
  const thanaActor = await actorOf(U.thana);
  const draft = await ai.draftReply(ctxO, owner, card.id, { deps: { complete: async () => "เรียนคุณลูกค้า ทางเราได้รับคำขอใบเสนอราคาแล้ว จะส่งให้ภายในวันศุกร์นี้ค่ะ" } });
  chk("K3.5-S5.4", "draftReply → คืนร่างข้อความ (ไม่บันทึกอะไร · ผู้ใช้ก๊อปไปใช้/แก้ก่อนส่ง) · ทั้ง 3 ฟังก์ชันต้องเป็น EDITOR+ · ไม่มีคีย์ AI และไม่มี deps → throw ไทย 'ยังไม่ได้ตั้งค่าผู้ช่วย AI'", typeof draft?.text === "string" && /ใบเสนอราคา/.test(draft.text) && (await prisma.kanbanComment.count({ where: { cardId: card.id, aiGenerated: true } as Any })) === 1 && !!(await fails(() => ai.summarizeCard({ ...ctxO, actorUserId: U.thana }, thanaActor, card.id, { deps: { complete: async () => "x" } }))), "ร่างอย่างเดียว", JSON.stringify(draft).slice(0, 120));

  // ═══ S6 UI + ทะเบียน (static) ═══
  const cb = read("src/components/kanban/CardBack.tsx") + read("src/components/kanban/CardAi.tsx");
  chk("K3.5-S6.1", "หลังการ์ด แถบขวา 3 ปุ่ม AI testid card-ai-summarize / card-ai-checklist / card-ai-reply (CardAi.tsx) · ผลเช็คลิสต์แสดงเป็นข้อเสนอให้กด 'เพิ่มเช็คลิสต์นี้' ก่อน · ร่างคำตอบมีปุ่มคัดลอก · ไม่มีคีย์ AI = ปุ่มบอก 'ตั้งค่าผู้ช่วย AI ก่อน'", ["card-ai-summarize", "card-ai-checklist", "card-ai-reply"].every((t) => cb.includes(t)) && /เพิ่มเช็คลิสต์นี้/.test(cb) && /คัดลอก/.test(cb), "ครบ", "ขาด");
  chk("K3.5-S6.2", "สายกิจกรรม/ความเห็น: ความเห็น aiGenerated แสดงป้าย 'ผู้ช่วย AI' (Timeline.tsx/Comments.tsx) · activity AI_SUGGESTED มีประโยคไทย (activity-text.ts)", /ผู้ช่วย AI/.test(read("src/components/kanban/Timeline.tsx") + read("src/components/kanban/Comments.tsx")) && /AI_SUGGESTED/.test(read("src/lib/modules/kanban/activity-text.ts")), "มีป้าย", "ขาด");
  chk("K3.5-S6.3", "actions summarizeCardAction suggestChecklistAction acceptChecklistSuggestionAction draftReplyAction · op ใหม่ผูก test K3.5-* · docs/skill endpoints อัปเดต (F13) · ข้อสอบ qc-ai-skills ยังเขียว (builder รัน)", ["summarizeCardAction", "suggestChecklistAction", "acceptChecklistSuggestionAction", "draftReplyAction"].every((a) => read("src/lib/modules/kanban/actions.ts").includes(a)) && /K3\.5-S/.test(read("src/lib/modules/kanban/api/ops/cards.ts") + read("src/lib/modules/kanban/api/ops/ai.ts")), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/3.5") ? readdirSync(".qc-shots/kanban/3.5").filter((f) => f.endsWith(".png")) : [];
  chk("K3.5-S6.4", "ภาพจริง ≥ 2 ใบใน .qc-shots/kanban/3.5 (ปุ่ม AI ในหลังการ์ด · ความเห็นที่มีป้ายผู้ช่วย AI)", shots.length >= 2, "≥2", String(shots.length), "MAJOR");
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
      if (settingsBackup !== null) await prisma.appSystem.update({ where: { id: SYS }, data: { settings: settingsBackup as Any } }).catch(() => null);
      await prisma.aiProposal.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }).catch(() => null);
      await prisma.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { startsWith: "kanban." } } }).catch(() => null);
    }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K3.5 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
