// QC — Mobile Phase 0: conversations + chat SSE + proposals + dna — Builder B (ledger/MOBILE_PLAN.md M-11) · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น · รัน Mock เสมอ (SHARK_AI_MOCK=1) ไม่เผาเงิน
//
// สัญญา lib:
//   src/lib/mobile/conversations.ts:
//     listConversations(ctx) → [{id,title,updatedAt,unread:boolean}] — ตัด deletedAt ออก เรียง updatedAt desc
//       (unread = มีข้อความ ASSISTANT ใหม่กว่า lastReadAt · lastReadAt null + มี ASSISTANT = unread)
//     createConversation(ctx, title?) → {id} · renameConversation(ctx,id,title) → boolean (ข้าม tenant = false)
//     deleteConversation(ctx,id) → boolean (soft: set deletedAt — ห้ามลบแถวจริง) · markRead(ctx,id) → boolean
//   src/lib/mobile/chat.ts:
//     sendMobileChat(ctx, {conversationId?,text,imageUrls?}, deps?) → AsyncGenerator<{type:"tool",name}|{type:"done",result}|{type:"error",error}>
//       — wrap sendMessage เดิม (ห้าม fork) · done.result มี conversationId · จบแล้ว set lastReadAt (คนส่งอ่านอยู่แล้ว)
// สัญญา route (Bearer+X-Tenant-Id ผ่าน requireMobile ทุกตัว · ห้าม next/headers):
//   GET/POST /api/mobile/conversations · PATCH/DELETE /api/mobile/conversations/[id] {title} · POST /api/mobile/conversations/[id]/read
//   POST /api/mobile/chat/send {conversationId?,text,imageUrls?} → SSE text/event-stream (data: {type,...}) จบด้วย done
//   GET /api/mobile/proposals?conversationId= → {proposals:[...]} (PENDING) · POST /api/mobile/proposals/confirm {id,confirm2x?} · POST /api/mobile/proposals/reject {id}
//   POST /api/mobile/plans/confirm {id} · POST /api/mobile/plans/reject {id}
//   GET /api/mobile/dna/questions → {questions:[13 ข้อ]} · POST /api/mobile/dna/answers {facts} → {blueprintId,plan} · POST /api/mobile/dna/apply {blueprintId} → {ok,results}
process.env.SHARK_AI_MOCK = "1";
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1"; // ย้ำหลัง loadEnvFile — .env ห้าม override ข้อสอบ
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const J = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const route = async (p: string): Promise<Record<string, Handler> | null> => { try { return (await import(p)) as unknown as Record<string, Handler>; } catch { return null; } };
const P = (id: string) => ({ params: Promise.resolve({ id }) });

const ts = Date.now();
const tids: string[] = []; const uids: string[] = [];
try {
  const t1 = await prisma.tenant.create({ data: { name: "QC MC หลัก", slug: `qc-mc1-${ts}` } }); tids.push(t1.id);
  const t2 = await prisma.tenant.create({ data: { name: "QC MC อื่น", slug: `qc-mc2-${ts}` } }); tids.push(t2.id);
  const td = await prisma.tenant.create({ data: { name: "ร้านเสริมสวย QC DNA", slug: `qc-mcd-${ts}` } }); tids.push(td.id);
  const ctx = { tenantId: t1.id }; const ctx2 = { tenantId: t2.id };

  // ── lib conversations ──
  const conv = ((await route("@/lib/mobile/conversations")) ?? {}) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
  if (typeof conv.listConversations !== "function") chk("MC-1.0", "มี lib mobile/conversations", false, "มี", "ยังไม่สร้าง");
  else {
    const c1 = await conv.createConversation(ctx, "งานสต็อก");
    const c2 = await conv.createConversation(ctx);
    let list = await conv.listConversations(ctx);
    chk("MC-1.1", "create 2 ห้อง → list 2 แถว unread=false ทั้งคู่", list.length === 2 && list.every((r: any) => r.unread === false), "2/false", JSON.stringify(list.map((r: any) => r.unread)));
    await prisma.aiMessage.create({ data: { tenantId: t1.id, conversationId: c1.id, role: "ASSISTANT", content: "เสร็จแล้วครับ" } });
    await prisma.aiConversation.update({ where: { id: c1.id }, data: { updatedAt: new Date() } });
    list = await conv.listConversations(ctx);
    const r1 = list.find((r: any) => r.id === c1.id);
    chk("MC-1.2", "AI ตอบใหม่ → ห้องนั้น unread=true + ขึ้นบนสุด (เรียง updatedAt)", r1?.unread === true && list[0]?.id === c1.id, "true/บนสุด", JSON.stringify({ u: r1?.unread, top: list[0]?.id === c1.id }));
    await conv.markRead(ctx, c1.id);
    list = await conv.listConversations(ctx);
    chk("MC-1.3", "markRead → unread=false", list.find((r: any) => r.id === c1.id)?.unread === false, "false", "?");
    chk("MC-1.4", "rename ห้องตัวเอง=true · ข้าม tenant=false (กันข้ามกิจการ)", (await conv.renameConversation(ctx, c1.id, "สต็อกหลังร้าน")) === true && (await conv.renameConversation(ctx2, c1.id, "hack")) === false && (await prisma.aiConversation.findUnique({ where: { id: c1.id } }))?.title === "สต็อกหลังร้าน", "true/false", "?");
    await conv.deleteConversation(ctx, c2.id);
    const row2 = await prisma.aiConversation.findUnique({ where: { id: c2.id } });
    chk("MC-1.5", "delete = soft (deletedAt) + หายจาก list + แถวจริงยังอยู่", !!row2?.deletedAt && (await conv.listConversations(ctx)).every((r: any) => r.id !== c2.id), "soft", JSON.stringify({ del: !!row2?.deletedAt }));
    chk("MC-1.6", "ข้าม tenant ลบไม่ได้", (await conv.deleteConversation(ctx2, c1.id)) === false && !(await prisma.aiConversation.findUnique({ where: { id: c1.id } }))?.deletedAt, "false", "?");
  }

  // ── lib chat (Mock) ──
  const chat = ((await route("@/lib/mobile/chat")) ?? {}) as unknown as { sendMobileChat?: (...a: any[]) => AsyncGenerator<any> };
  if (typeof chat.sendMobileChat !== "function") chk("MC-2.0", "มี lib mobile/chat.sendMobileChat", false, "มี", "ยังไม่สร้าง");
  else {
    const events: any[] = [];
    for await (const ev of chat.sendMobileChat(ctx, { text: "สวัสดี ทดสอบระบบ" })) events.push(ev);
    const done = events.find((e) => e.type === "done");
    const cid = done?.result?.conversationId as string | undefined;
    chk("MC-2.1", "sendMobileChat → มี done + conversationId", !!done && !!cid, "done+cid", JSON.stringify(events.map((e) => e.type)));
    const msgs = cid ? await prisma.aiMessage.findMany({ where: { conversationId: cid }, orderBy: { createdAt: "asc" } }) : [];
    chk("MC-2.2", "DB มีคู่ USER+ASSISTANT", msgs.some((m) => m.role === "USER") && msgs.some((m) => m.role === "ASSISTANT"), "คู่", JSON.stringify(msgs.map((m) => m.role)));
    const convRow = cid ? await prisma.aiConversation.findUnique({ where: { id: cid } }) : null;
    chk("MC-2.3", "จบแล้ว set lastReadAt (คนส่งอ่านอยู่แล้ว — ไม่ขึ้น unread เอง)", !!convRow?.lastReadAt, "มี", String(convRow?.lastReadAt));
    chk("MC-2.4", "ตั้งชื่อห้องอัตโนมัติหลังคุยครั้งแรก (title ไม่ว่าง — คำสั่งเจ้าของ)", (convRow?.title ?? "").trim().length >= 2, "มีชื่อ", JSON.stringify(convRow?.title));
  }

  // ── routes (ต้องมี Bearer จริง) ──
  const authLib = (await import("@/lib/mobile/auth")) as unknown as { issueMobileToken: (uid: string) => Promise<{ token: string }> };
  const u = await prisma.user.create({ data: { email: `qc-mc-${ts}@qc.local` } }); uids.push(u.id);
  await prisma.membership.create({ data: { userId: u.id, tenantId: t1.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  await prisma.membership.create({ data: { userId: u.id, tenantId: td.id, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const { token } = await authLib.issueMobileToken(u.id);
  const H = { authorization: `Bearer ${token}`, "x-tenant-id": t1.id };
  const HD = { authorization: `Bearer ${token}`, "x-tenant-id": td.id };

  const rConv = await route("@/app/api/mobile/conversations/route");
  const rConvId = await route("@/app/api/mobile/conversations/[id]/route");
  const rRead = await route("@/app/api/mobile/conversations/[id]/read/route");
  if (!rConv?.GET || !rConv?.POST || !rConvId?.PATCH || !rConvId?.DELETE || !rRead?.POST) chk("MC-3.0", "มี routes conversations ครบ (GET/POST/PATCH/DELETE/read)", false, "ครบ", "ยังไม่ครบ");
  else {
    const cr = await rConv.POST(J("/api/mobile/conversations", "POST", { title: "จากแอป" }, H));
    const cb = (await cr.json().catch(() => ({}))) as { id?: string };
    const ls = await rConv.GET(J("/api/mobile/conversations", "GET", undefined, H));
    const lb = (await ls.json().catch(() => ({}))) as { conversations?: { id: string }[] };
    chk("MC-3.1", "POST+GET conversations ผ่าน route", cr.status === 200 && !!cb.id && !!lb.conversations?.some((r) => r.id === cb.id), "มีห้องใหม่", JSON.stringify(cb));
    chk("MC-3.2", "GET ไม่มี Bearer → 401", (await rConv.GET(J("/api/mobile/conversations", "GET"))).status === 401, "401", "?");
    const pa = await rConvId.PATCH(J(`/api/mobile/conversations/${cb.id}`, "PATCH", { title: "เปลี่ยนชื่อ" }, H), P(cb.id ?? ""));
    const rd = await rRead.POST(J(`/api/mobile/conversations/${cb.id}/read`, "POST", undefined, H), P(cb.id ?? ""));
    const de = await rConvId.DELETE(J(`/api/mobile/conversations/${cb.id}`, "DELETE", undefined, H), P(cb.id ?? ""));
    chk("MC-3.3", "PATCH/read/DELETE → 200 ครบ", pa.status === 200 && rd.status === 200 && de.status === 200, "200x3", `${pa.status}/${rd.status}/${de.status}`);
  }

  const rMsgs = await route("@/app/api/mobile/conversations/[id]/messages/route");
  if (!rMsgs?.GET) chk("MC-3.4", "มี route conversations/[id]/messages", false, "มี", "ยังไม่สร้าง");
  else {
    const cv = await prisma.aiConversation.create({ data: { tenantId: t1.id, title: "ห้องอ่านย้อน" } });
    await prisma.aiMessage.create({ data: { tenantId: t1.id, conversationId: cv.id, role: "USER", content: "คำถาม" } });
    await prisma.aiMessage.create({ data: { tenantId: t1.id, conversationId: cv.id, role: "ASSISTANT", content: "คำตอบ" } });
    const ms = await rMsgs.GET(J(`/api/mobile/conversations/${cv.id}/messages`, "GET", undefined, H), P(cv.id));
    const mb = (await ms.json().catch(() => ({}))) as { messages?: { role: string; content: string }[] };
    const msX = await rMsgs.GET(J(`/api/mobile/conversations/${cv.id}/messages`, "GET", undefined, { ...H, "x-tenant-id": t2.id }), P(cv.id));
    chk("MC-3.4", "GET messages → คู่ USER/ASSISTANT · ข้าม tenant = 403 (ไม่ใช่สมาชิก)", ms.status === 200 && mb.messages?.length === 2 && msX.status === 403, "2 แถว/403", `${ms.status}/${mb.messages?.length}/${msX.status}`);
  }

  const rSend = await route("@/app/api/mobile/chat/send/route");
  if (!rSend?.POST) chk("MC-4.0", "มี route chat/send", false, "มี", "ยังไม่สร้าง");
  else {
    const res = await rSend.POST(J("/api/mobile/chat/send", "POST", { text: "ทดสอบ SSE จากแอป" }, H));
    const ct = res.headers.get("content-type") ?? "";
    const body = await res.text();
    chk("MC-4.1", "chat/send → SSE (text/event-stream) + จบด้วย done", res.status === 200 && ct.includes("text/event-stream") && body.includes('"type":"done"') && body.includes("conversationId"), "SSE+done", `${res.status}/${ct}/${body.slice(-120)}`);
    chk("MC-4.2", "ไม่มี Bearer → 401", (await rSend.POST(J("/api/mobile/chat/send", "POST", { text: "x" }))).status === 401, "401", "?");
  }

  // ── proposals (seed ตรง — DESTRUCTIVE ต้อง confirm2x) ──
  const seedConv = await prisma.aiConversation.create({ data: { tenantId: t1.id, title: "ทดสอบ proposal" } });
  const prop = await prisma.aiProposal.create({ data: { tenantId: t1.id, conversationId: seedConv.id, kind: "member_create", risk: "DESTRUCTIVE", summary: "ทดสอบยืนยัน 2 ชั้น", payload: {}, expiresAt: new Date(Date.now() + 3600e3) } });
  const rPl = await route("@/app/api/mobile/proposals/route");
  const rPc = await route("@/app/api/mobile/proposals/confirm/route");
  const rPr = await route("@/app/api/mobile/proposals/reject/route");
  if (!rPl?.GET || !rPc?.POST || !rPr?.POST) chk("MC-5.0", "มี routes proposals ครบ (list/confirm/reject)", false, "ครบ", "ยังไม่ครบ");
  else {
    const ls = await rPl.GET(J(`/api/mobile/proposals?conversationId=${seedConv.id}`, "GET", undefined, H));
    const lb = (await ls.json().catch(() => ({}))) as { proposals?: { id: string; risk?: string; summary?: string }[] };
    chk("MC-5.1", "GET proposals → เห็น PENDING พร้อม risk+summary (การ์ดยืนยัน)", ls.status === 200 && lb.proposals?.[0]?.id === prop.id && lb.proposals?.[0]?.risk === "DESTRUCTIVE" && !!lb.proposals?.[0]?.summary, "1 แถว", JSON.stringify(lb).slice(0, 100));
    const c1 = await rPc.POST(J("/api/mobile/proposals/confirm", "POST", { id: prop.id }, H));
    const c1b = (await c1.json().catch(() => ({}))) as { needsSecondConfirm?: boolean };
    const still = await prisma.aiProposal.findUnique({ where: { id: prop.id } });
    chk("MC-5.2", "DESTRUCTIVE ไม่ส่ง confirm2x → needsSecondConfirm + ยัง PENDING (server บังคับเสมอ)", c1b.needsSecondConfirm === true && still?.status === "PENDING", "ค้าง PENDING", JSON.stringify({ n: c1b.needsSecondConfirm, s: still?.status }));
    const rj = await rPr.POST(J("/api/mobile/proposals/reject", "POST", { id: prop.id }, H));
    chk("MC-5.3", "reject → REJECTED", rj.status === 200 && (await prisma.aiProposal.findUnique({ where: { id: prop.id } }))?.status === "REJECTED", "REJECTED", "?");
  }
  const rPlanC = await route("@/app/api/mobile/plans/confirm/route");
  const rPlanR = await route("@/app/api/mobile/plans/reject/route");
  chk("MC-5.4", "มี routes plans confirm+reject (ผ่าน executePlan/rejectPlan เดิม)", !!rPlanC?.POST && !!rPlanR?.POST, "มี", "ยังไม่สร้าง", "MAJOR");

  // ── dna (tenant สด td) ──
  const rDq = await route("@/app/api/mobile/dna/questions/route");
  const rDa = await route("@/app/api/mobile/dna/answers/route");
  const rDap = await route("@/app/api/mobile/dna/apply/route");
  if (!rDq?.GET || !rDa?.POST || !rDap?.POST) chk("MC-6.0", "มี routes dna ครบ (questions/answers/apply)", false, "ครบ", "ยังไม่ครบ");
  else {
    const { QUESTIONS } = (await import("@/lib/dna/questions")) as unknown as { QUESTIONS: unknown[] };
    const qs = await rDq.GET(J("/api/mobile/dna/questions", "GET", undefined, HD));
    const qb = (await qs.json().catch(() => ({}))) as { questions?: unknown[] };
    chk("MC-6.1", "GET questions → ครบทุกข้อตรง lib (JSON เดียวกับเว็บ)", qs.status === 200 && qb.questions?.length === QUESTIONS.length, String(QUESTIONS.length), String(qb.questions?.length));
    const facts = { industryHint: "SALON", branchCount: 1, appointment: true, tables: false, rooms: false, walkinQueue: false, sellsGoods: true, membership: true, rewardRedeem: true, staffCount: 3, vatRegistered: false, wantsAccounting: true, usesLineOA: false };
    const an = await rDa.POST(J("/api/mobile/dna/answers", "POST", { facts }, HD));
    const ab = (await an.json().catch(() => ({}))) as { blueprintId?: string; plan?: { steps?: unknown[] } };
    chk("MC-6.2", "POST answers → blueprintId + plan.steps", an.status === 200 && !!ab.blueprintId && (ab.plan?.steps?.length ?? 0) > 0, "มี blueprint", JSON.stringify(ab).slice(0, 100));
    const ap = await rDap.POST(J("/api/mobile/dna/apply", "POST", { blueprintId: ab.blueprintId }, HD));
    const apb = (await ap.json().catch(() => ({}))) as { ok?: boolean };
    const sysCount = await prisma.appSystem.count({ where: { tenantId: td.id } });
    chk("MC-6.3", "POST apply → ok + ระบบถูก instantiate จริง (AppSystem > 0)", ap.status === 200 && apb.ok === true && sysCount > 0, "ok+>0", JSON.stringify({ ok: apb.ok, sys: sysCount }));
    const badFacts = await rDa.POST(J("/api/mobile/dna/answers", "POST", { facts: { industryHint: "SALON" } }, HD));
    chk("MC-6.4", "facts ไม่ครบ (Zod) → 400", badFacts.status === 400, "400", String(badFacts.status), "MAJOR");
  }
} finally {
  for (const tid of tids) {
    for (const m of ["aiMessage", "aiConversation", "aiProposal", "aiMemory", "aiUsage", "appNotification", "dnaProfile", "dnaBlueprint", "appSystemUnit", "appSystem", "businessUnit", "membership"] as const) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]?.deleteMany({ where: { tenantId: tid } }).catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  for (const uid of uids) { await prisma.session.deleteMany({ where: { userId: uid } }); await prisma.user.deleteMany({ where: { id: uid } }); }
  await prisma.$disconnect();
}
const crit = cks.filter((c) => !c.ok && c.sev === "CRITICAL").length;
console.log(`\nqc-mobile-chat: ${cks.filter((c) => c.ok).length}/${cks.length} ผ่าน · CRITICAL fail ${crit}`);
if (cks.some((c) => !c.ok)) process.exit(1);
