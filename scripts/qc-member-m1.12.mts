// QC — ระบบสมาชิก v2 WO M1.12: มือถือ (responsive ทุกหน้า M1 ≤ 390) + แผงข้าง "สมาชิก" ในห้องแชท (ภาพ 26 · 28ก/ข) — linkContact ทุกช่องทาง (D18) · candidates/ผูกรวม · สมัครจากแชท · ปุ่มด่วน (stub M2) · event chat.contact.linked
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M1.12 · พิมพ์เขียว §3.14 §5.11 (facade linkContact/briefFor) §7.1 (chat.contact.linked) §9.3 · ภาพ 26 · 28
// requires: member-seed
//
// สัญญา (facade src/lib/modules/member/index.ts → src/lib/modules/member/chat-bridge.ts)
//   linkContact(ctx, { contactId, customerId?, method?: "AUTO"|"MANUAL" }) → { customerId: string|null, matchedBy: "PHONE"|"EMAIL"|"CHANNEL_ID"|"MANUAL"|null, candidates: MemberBrief[] }
//     อ่าน ChatContact (tenant ต้องตรง · ไม่ตรง → throw ไม่พบ) → channel = chatChannelToKey(contact.channel) · externalId = contact.externalUserId · phone/email/displayName จาก contact → profile.linkIdentity (กติกา D18) · ตรงชัด → เขียน ChatContact.partyId/customerId/linkedBy/linkedAt + MemberChannelIdentity(contactId) + event `chat.contact.linked` {contactId, partyId, customerId, method} · MANUAL ต้องส่ง customerId (สมาชิกในระบบเดียวกัน) · ไม่ตรง → candidates (ชื่อคล้าย) ไม่มี event · ผูกซ้ำ contact เดิม = idempotent (CHANNEL_ID)
//   chatPanelFor(ctx, actor, { conversationId }) → { linked: boolean, contact: { id, channel, channelLabel, displayName, phoneMasked }, member?: { brief: MemberBrief(+tier{key,name,color}), stats: { points, vouchers, spent12mSatang, lastActivityAt }, identities: [{channel, label, current: boolean}], benefits: string[] (จาก benefitsFor · ข้อความไทย), history: [{ at, type, summary }] (≤ 5 · MemberActivity), cardFields: [{ key, label, display }] (showOnCard) , quickActions: { voucher: false, points: false, stamp: false, task: true } (stub M2 = false + ป้าย "M2.x") }, candidates: MemberBrief[], sameIdentityOtherChannel: { channel, customerId, name }|null (พบเบอร์/อีเมลตรงกับ identity ช่องอื่นของสมาชิกที่ยังไม่ผูกห้องนี้) }
//   registerFromChat(ctx, actor, { contactId, firstName?, lastName?, phone?, email? }) → { customerId, memberCode } · createMember source CHAT (LINE → LINE_OA) sourceChannel = key ช่องทาง · sourceDetail.contactId · แล้ว linkContact MANUAL
//   chat/service.ts#maybeAutoLinkMember → เรียก member.linkContact (facade) แทน findOrCreate ตรง · event chat.contact.linked ลง 3 ทะเบียน + consumer (no-op/บันทึก MemberActivity CHAT_LINKED)
//   UI: src/lib/modules/chat/context-panel.tsx เพิ่มบล็อก <MemberPanel> (client · โหลดผ่าน action `getChatMemberPanelAction(conversationId)` ใน member/chat-actions.ts) testid chat-member-panel chat-member-brief chat-member-open-360 chat-member-stats chat-member-channels chat-member-actions chat-member-benefits chat-member-history chat-member-fields · สถานะ 2: chat-member-candidates (chat-member-pick-{id}) chat-member-register chat-member-merge-hint · มือถือ: แผงเป็น sheet
//   responsive: ทุกหน้า M1 ที่ถ่ายมือถือแล้ว (1.3 · 1.5 · 1.7 · 1.8 · 1.10 · 1.6) ต้องไม่มี console error และไม่ล้นแนวนอน (ตรวจ scrollWidth ≤ 390 ใน harness · เก็บใน summary.overflow)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/chat-bridge.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/member/chat-bridge.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = "";
const tag = Date.now().toString(36);
const made = { contacts: [] as string[], convs: [] as string[], customers: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const chatSys = scope.systems.CHAT as string;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId); const thana = await actorOf(E.users.staff.thana.userId);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const mkContact = async (data: Record<string, unknown>) => { const c = await prisma.chatContact.create({ data: { tenantId: tid, systemId: chatSys, channel: "WEBCHAT" as Any, externalUserId: `qc112-${tag}-${Math.random().toString(36).slice(2, 6)}`, ...data } as Any }); made.contacts.push(c.id); const v = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: chatSys, channel: (data.channel as Any) ?? "WEBCHAT", contactId: c.id, lastMessagePreview: "สวัสดีครับ", lastMessageAt: new Date() } as Any }); made.convs.push(v.id); return { contact: c, conv: v }; };
  const outbox = (pred: (p: Any) => boolean) => P.outboxEvent.findMany({ where: { tenantId: tid, type: "chat.contact.linked" }, orderBy: { createdAt: "desc" }, take: 20 }).then((rows: Any[]) => rows.find((r) => pred(r.payload)));

  // ═══ S1 linkContact ═══
  const a = await mkContact({ channel: "WEBCHAT", phone: m(11).phone, displayName: "ลูกค้าเว็บ" });
  const l1 = await M.linkContact(ctxO, { contactId: a.contact.id });
  const ca = (await prisma.chatContact.findUnique({ where: { id: a.contact.id } })) as Any;
  const ev1 = await outbox((p) => p.contactId === a.contact.id);
  chk("M1.12-S1.1", "linkContact(เบอร์ตรงสมาชิก 11) → {customerId 11, matchedBy PHONE} · ChatContact.customerId/partyId (= สมาชิก)/linkedBy PHONE/linkedAt · MemberChannelIdentity channel WEBCHAT contactId · event chat.contact.linked {contactId, partyId, customerId, method PHONE}", l1?.customerId === m(11).id && l1.matchedBy === "PHONE" && ca.customerId === m(11).id && ca.partyId === m(11).partyId && ca.linkedBy === "PHONE" && !!ca.linkedAt && (await P.memberChannelIdentity.count({ where: { customerId: m(11).id, contactId: a.contact.id } })) === 1 && !!ev1 && ev1.payload.customerId === m(11).id && ev1.payload.method === "PHONE", "PHONE", JSON.stringify({ l1, ca: ca && [ca.customerId === m(11).id, ca.linkedBy], ev: !!ev1 }).slice(0, 200));
  const b = await mkContact({ channel: "WEBCHAT", email: m(12).email, displayName: "ลูกค้าอีเมล" });
  const l2 = await M.linkContact(ctxO, { contactId: b.contact.id });
  const l2b = await M.linkContact(ctxO, { contactId: b.contact.id });
  chk("M1.12-S1.2", "อีเมลตรงสมาชิก 12 → EMAIL · ผูกซ้ำ contact เดิม → idempotent (customerId เดิม · matchedBy CHANNEL_ID · identity 1 แถว · event ไม่เพิ่ม)", l2?.customerId === m(12).id && l2.matchedBy === "EMAIL" && l2b?.customerId === m(12).id && l2b.matchedBy === "CHANNEL_ID" && (await P.memberChannelIdentity.count({ where: { contactId: b.contact.id } })) === 1 && (await P.outboxEvent.count({ where: { tenantId: tid, type: "chat.contact.linked", payload: { path: ["contactId"], equals: b.contact.id } } })) === 1, "EMAIL → CHANNEL_ID", JSON.stringify({ l2, l2b }).slice(0, 160));
  const seedContact = (await prisma.chatContact.findFirst({ where: { tenantId: tid, channel: "LINE" as Any, phone: m(1).phone } })) as Any;
  const l3 = seedContact ? await M.linkContact(ctxO, { contactId: seedContact.id }) : null;
  chk("M1.12-S1.3", "contact LINE ของ seed (externalUserId = identity LINE ของสมาชิก 1 ที่ผูกไว้แล้ว) → matchedBy CHANNEL_ID → customerId สมาชิก 1 · ChatContact.customerId ตั้ง", !!seedContact && l3?.customerId === m(1).id && ["CHANNEL_ID", "PHONE"].includes(l3.matchedBy) && ((await prisma.chatContact.findUnique({ where: { id: seedContact.id } })) as Any).customerId === m(1).id, "CHANNEL_ID", JSON.stringify({ seed: !!seedContact, l3 }).slice(0, 160));
  const c9 = (await prisma.customer.findUnique({ where: { id: m(9).id } })) as Any;
  const c = await mkContact({ channel: "WEBCHAT", displayName: c9.firstName ?? c9.name, phone: "0855555550" });
  const l4 = await M.linkContact(ctxO, { contactId: c.contact.id });
  const cc = (await prisma.chatContact.findUnique({ where: { id: c.contact.id } })) as Any;
  chk("M1.12-S1.4", "ไม่ตรงเบอร์/อีเมล/id → {customerId null, candidates มีสมาชิก 9 (ชื่อคล้าย) ≤ 5} · ChatContact ไม่ถูกแตะ · ไม่มี event", l4?.customerId === null && l4.candidates?.some((x: Any) => x.id === m(9).id) && l4.candidates.length <= 5 && cc.customerId === null && !(await outbox((p) => p.contactId === c.contact.id)), "candidates", JSON.stringify({ l4: [l4?.customerId, l4?.candidates?.length] }));
  const l5 = await M.linkContact(ctxO, { contactId: c.contact.id, customerId: m(9).id, method: "MANUAL" });
  const cc2 = (await prisma.chatContact.findUnique({ where: { id: c.contact.id } })) as Any;
  const eOther = await fails(() => M.linkContact({ ...ctxO, tenantId: `${tid}-x` }, { contactId: c.contact.id }));
  const eGhost = await fails(() => M.linkContact(ctxO, { contactId: c.contact.id, customerId: "ไม่มี", method: "MANUAL" }));
  chk("M1.12-S1.5", "MANUAL + customerId → ผูก (linkedBy MANUAL · identity WEBCHAT externalId ของ contact) · event method MANUAL · contact ของร้านอื่น/ไม่มี → throw ไม่พบ · customerId ไม่มี → throw ไทย", l5?.customerId === m(9).id && l5.matchedBy === "MANUAL" && cc2.customerId === m(9).id && cc2.linkedBy === "MANUAL" && (await P.memberChannelIdentity.count({ where: { customerId: m(9).id, externalId: c.contact.externalUserId } })) === 1 && !!(await outbox((p) => p.contactId === c.contact.id && p.method === "MANUAL")) && !!eOther && thai(eGhost), "MANUAL", JSON.stringify({ l5, linkedBy: cc2?.linkedBy, other: !!eOther, ghost: !!eGhost }).slice(0, 160));

  // ═══ S2 event 3 ทะเบียน + auto-link ของโมดูลแชทใช้ facade ═══
  const consumers = read("src/lib/outbox-consumers.ts"); const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const chatSvc = read("src/lib/modules/chat/service.ts");
  chk("M1.12-S2.1", "chat.contact.linked ลง 3 ทะเบียน (consumer · AUTOMATION_EVENTS ป้ายไทย · WEBHOOK 1 ครั้ง) · chat/service.ts#maybeAutoLinkMember เรียก member facade linkContact (ไม่ใช่ findOrCreate ตรง)", /"chat\.contact\.linked":/.test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === "chat.contact.linked" && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === "chat.contact.linked").length === 1 && /linkContact/.test(chatSvc.slice(chatSvc.indexOf("async function maybeAutoLinkMember"), chatSvc.indexOf("async function maybeAutoLinkMember") + 2500)), "ครบ", `consumer=${/"chat\.contact\.linked":/.test(consumers)} auto=${/linkContact/.test(chatSvc.slice(chatSvc.indexOf("async function maybeAutoLinkMember"), chatSvc.indexOf("async function maybeAutoLinkMember") + 2500))}`);
  const { drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: C } = (await import("@/lib/outbox-consumers" as string)) as Any;
  await drainOutbox(C, { limit: 200 });
  const stuck = await P.outboxEvent.count({ where: { tenantId: tid, type: "chat.contact.linked", status: { not: "DONE" } } });
  chk("M1.12-S2.2", "drain → chat.contact.linked DONE ทั้งหมด · consumer เขียน MemberActivity {module chat · type CHAT_LINKED} ให้สมาชิก 11", stuck === 0 && (await prisma.memberActivity.count({ where: { customerId: m(11).id, module: "chat", type: { contains: "LINK" } } })) >= 1, "DONE · activity", `stuck=${stuck} act=${await prisma.memberActivity.count({ where: { customerId: m(11).id, module: "chat" } })}`);

  // ═══ S3 แผงข้าง DTO + สมัครจากแชท ═══
  const pnl = await M.chatPanelFor(ctxO, owner, { conversationId: a.conv.id });
  chk("M1.12-S3.1", "chatPanelFor(ห้องที่ผูกแล้ว) → linked true · contact {channelLabel ไทย, phoneMasked} · member.brief {memberCode, name, tier{key,name,color}} · stats {points, vouchers, spent12mSatang, lastActivityAt} · identities มี WEBCHAT current=true · benefits string[] · history ≤ 5 · cardFields (showOnCard) · quickActions {voucher:false, points:false, stamp:false, task:true} · candidates []", pnl?.linked === true && /[ก-๙]/.test(pnl.contact?.channelLabel ?? "") && /[x*]/.test(pnl.contact?.phoneMasked ?? "") && pnl.member?.brief?.memberCode === m(11).memberCode && pnl.member.brief.tier?.key && typeof pnl.member.stats?.points === "number" && typeof pnl.member.stats.spent12mSatang === "number" && pnl.member.identities?.some((i: Any) => i.channel === "WEBCHAT" && i.current === true) && Array.isArray(pnl.member.benefits) && Array.isArray(pnl.member.history) && pnl.member.history.length <= 5 && Array.isArray(pnl.member.cardFields) && pnl.member.quickActions?.task === true && pnl.member.quickActions.voucher === false && Array.isArray(pnl.candidates) && pnl.candidates.length === 0, "ครบ", JSON.stringify({ linked: pnl?.linked, brief: pnl?.member?.brief?.memberCode, stats: pnl?.member?.stats && Object.keys(pnl.member.stats), ids: pnl?.member?.identities?.length, qa: pnl?.member?.quickActions }).slice(0, 220));
  await M.linkContact(ctxO, { contactId: a.contact.id, customerId: m(11).id, method: "MANUAL" }).catch(() => null);
  const u = await mkContact({ channel: "WEBCHAT", displayName: c9.firstName ?? c9.name, phone: m(13).phone });
  const pnlU = await M.chatPanelFor(ctxO, owner, { conversationId: u.conv.id });
  chk("M1.12-S3.2", "ห้องที่ยังไม่ผูก (เบอร์ตรงสมาชิก 13 แต่ยังไม่กดผูก): linked false · sameIdentityOtherChannel/autoMatch = สมาชิก 13 (matchedBy PHONE พร้อมเสนอ 'ผูกรวม') · candidates ชื่อคล้ายมีสมาชิก 9 · member undefined", pnlU?.linked === false && (pnlU.autoMatch?.customerId === m(13).id || pnlU.sameIdentityOtherChannel?.customerId === m(13).id) && pnlU.candidates?.some((x: Any) => x.id === m(9).id) && !pnlU.member, "unlinked + match", JSON.stringify({ linked: pnlU?.linked, auto: pnlU?.autoMatch ?? pnlU?.sameIdentityOtherChannel, cand: pnlU?.candidates?.length }).slice(0, 200));
  const r = await mkContact({ channel: "LINE", externalUserId: `U-qc112-${tag}`, displayName: "ลูกค้าใหม่จากไลน์" });
  const reg = await M.registerFromChat(ctxO, thana, { contactId: r.contact.id, firstName: "ลูกค้าใหม่", phone: `0893${String(Date.now() % 1_000_000).padStart(6, "0")}` });
  if (reg?.customerId) made.customers.push(reg.customerId);
  const cr = reg?.customerId ? await prisma.customer.findUnique({ where: { id: reg.customerId } }) as Any : null;
  const rc = (await prisma.chatContact.findUnique({ where: { id: r.contact.id } })) as Any;
  const noPermActor = await actorOf(E.users.noPerm.userId);
  const eRegT = await fails(() => M.registerFromChat(ctxO, noPermActor, { contactId: r.contact.id, firstName: "x" }));
  chk("M1.12-S3.3", "registerFromChat(thana · contact LINE) → สมาชิกใหม่ source LINE_OA · sourceChannel LINE · sourceDetail.contactId · identity LINE externalId = U-qc112 · ChatContact ผูก (linkedBy MANUAL/CHANNEL_ID) · attribution FIRST LINE_OA · STAFF ไม่มี customer.create → throw", reg?.customerId && reg.memberCode && cr?.source === "LINE_OA" && cr.sourceChannel === "LINE" && (cr.sourceDetail as Any)?.contactId === r.contact.id && (await P.memberChannelIdentity.count({ where: { customerId: reg.customerId, channel: "LINE", externalId: `U-qc112-${tag}` } })) === 1 && rc.customerId === reg.customerId && ((await P.memberAttribution.findFirst({ where: { customerId: reg.customerId, touch: "FIRST" } })) as Any)?.source === "LINE_OA" && thai(eRegT), "CHAT → LINE_OA", JSON.stringify({ reg, src: cr?.source, ch: cr?.sourceChannel, linked: rc?.customerId === reg?.customerId, t: !!eRegT }).slice(0, 200));

  // ═══ S4 UI + ภาพ ═══
  const panel = read("src/lib/modules/chat/context-panel.tsx"); const mp = existsSync("src/components/member/ChatMemberPanel.tsx") ? read("src/components/member/ChatMemberPanel.tsx") : ""; const act = read("src/lib/modules/member/chat-actions.ts");
  const uiAll = panel + mp;
  const TIDS = ["chat-member-panel", "chat-member-brief", "chat-member-open-360", "chat-member-stats", "chat-member-channels", "chat-member-actions", "chat-member-benefits", "chat-member-history", "chat-member-fields", "chat-member-candidates", "chat-member-pick-", "chat-member-register", "chat-member-merge-hint"];
  chk("M1.12-S4.1", "context-panel.tsx มีบล็อกสมาชิก (ChatMemberPanel) โหลดผ่าน getChatMemberPanelAction · testid 13 · ปุ่มด่วน 4 (voucher/แต้ม/สแตมป์ = ปิด+ป้าย M2 · สร้างงาน = ลิงก์ K3.2) · เลือก candidate → linkContactAction MANUAL · สมัครจากแชท → registerFromChatAction · ผูกรวม → linkContactAction · chat-actions.ts 'use server' gate member.customer.update/create · ไม่มีอีโมจิ", TIDS.every((t) => uiAll.includes(t)) && /getChatMemberPanelAction/.test(uiAll) && /linkContact\w*Action/.test(uiAll) && /registerFromChat\w*Action/.test(uiAll) && /^\s*"use server"/m.test(act) && /member\.customer\.(update|create)/.test(act) && /M2\.|เร็ว ๆ นี้/.test(uiAll) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(uiAll.replace(/\/\/.*$/gm, "")), "ครบ", `missing=${TIDS.filter((t) => !uiAll.includes(t)).join(",")} act=${/^\s*"use server"/m.test(act)}`);
  const dir = `${mq.MQC.shotsDir}/1.12`;
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  const sumO = existsSync(`${dir}/summary-owner.json`) ? JSON.parse(read(`${dir}/summary-owner.json`)) : null;
  const rs = (n: string, d: string) => sumO?.results?.find((x: Any) => x.name === n && x.device === d);
  chk("M1.12-S4.2", "ภาพ 26: chat-member-linked-desktop 200 (ห้องที่ผูกแล้ว · testid panel/brief/channels/actions) · chat-member-unlinked-desktop 200 (candidates + สมัครใหม่ + ผูกรวม)", rs("chat-member-linked", "desktop")?.status === 200 && rs("chat-member-linked", "desktop")?.missing?.length === 0 && rs("chat-member-unlinked", "desktop")?.status === 200 && rs("chat-member-unlinked", "desktop")?.missing?.length === 0, "200 ×2", `shots=${shots.join(",")} l=${rs("chat-member-linked", "desktop")?.status} u=${rs("chat-member-unlinked", "desktop")?.status}`, "MAJOR");
  const mobileDirs = ["1.3", "1.5", "1.7", "1.8", "1.10", "1.6"];
  const mob = mobileDirs.map((w) => { const p = `${mq.MQC.shotsDir}/${w}/summary-owner.json`; const s = existsSync(p) ? JSON.parse(read(p)) : null; const rows = (s?.results ?? []).filter((x: Any) => x.device === "mobile"); return { w, n: rows.length, ok: rows.every((x: Any) => x.status === 200 && x.errors.length === 0 && (x.overflow === undefined || x.overflow === false)) }; });
  chk("M1.12-S4.3", "มือถือ (ภาพ 28ก/ข): ทุกหน้า M1 ที่ถ่าย 390 (1.3 1.5 1.7 1.8 1.10 1.6) HTTP 200 ไม่มี console error ไม่ล้นแนวนอน (summary.overflow=false) · chat-member-linked-mobile 200 (แผงเป็น sheet)", mob.every((x) => x.n >= 1 && x.ok) && rs("chat-member-linked", "mobile")?.status === 200 && rs("chat-member-linked", "mobile")?.overflow !== true, "200 ทุกหน้า", JSON.stringify(mob), "MAJOR");
  chk("M1.12-S4.4", "🔴 parity ภาพ 26 + 28 — Fable ตรวจด้วยตา · wo-notes/member-M1.12.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M1.12.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.12-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  await d(() => P.memberChannelIdentity.deleteMany({ where: { tenantId: tid, contactId: { in: made.contacts } } }));
  for (const id of made.convs) await d(() => prisma.chatConversation.delete({ where: { id } }));
  for (const id of made.contacts) await d(() => prisma.chatContact.delete({ where: { id } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity", "pointLedger", "pointBalance"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } }));
  }
  await d(() => prisma.memberActivity.deleteMany({ where: { tenantId: tid, module: "chat", type: { contains: "LINK" }, createdAt: { gte: new Date(Date.now() - 3600_000) } } }));
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { in: ["chat.contact.linked", "member.identity.linked", "member.created"] }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.12: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
