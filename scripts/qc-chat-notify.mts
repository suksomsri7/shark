// Wave4-A Chat notify harness — "ปิดโมดูลเงียบ": inbound ลูกค้า → แจ้งเตือนพนักงาน + outbox
// ขับ service จริงกับ Neon → verify AppNotification/outbox/de-dup/AI tool → ลบ test data
// รัน: pnpm exec tsx scripts/qc-chat-notify.mts
// fail-before/pass-after: stash การแก้ receive*Inbound แล้วรัน → เห็น FAIL (ไม่มี notification) → unstash → PASS
try { process.loadEnvFile(".env"); } catch { /* CI ไม่มี .env */ }
try { process.loadEnvFile(".env.local"); } catch {}

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const chat = await import("@/lib/modules/chat/service");
const tools = await import("@/lib/ai/tools");

let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}

const tag = "QCNOTIFY-" + Date.now();
let tenantId = "";
let tenant2Id = "";

// นับ AppNotification "ลูกค้าทักเข้ามา" ของ tenant
const notifCount = (tid: string) =>
  prisma.appNotification.count({ where: { tenantId: tid, title: "ลูกค้าทักเข้ามา" } });
const outboxCount = (tid: string) =>
  prisma.outboxEvent.count({ where: { tenantId: tid, type: "chat.message.received" } });
const unread = async (convId: string) =>
  (await prisma.chatConversation.findUnique({ where: { id: convId }, select: { staffUnreadCount: true } }))
    ?.staffUnreadCount ?? -1;

try {
  // ── seed core ──
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email: tag.toLowerCase() + "@qc.local", name: "QC" } });
  await prisma.membership.create({ data: { userId: u.id, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const sys = await system.createSystem(tenantId, "CHAT", "แชท " + tag);
  const conn = await chat.ensureWebchatConnection(tenantId, sys.id);
  console.log(`[seed] tenant ${tenantId} · system ${sys.id} · webchat conn OK\n`);

  // ─────────────── A) inbound webchat ใหม่ → AppNotification 1 + unread +1 + outbox + ลิงก์ห้องแชท ───────────────
  console.log("A) inbound ใหม่ → แจ้งเตือน 1 อัน:");
  const gtoken = "web-notify-" + Date.now();
  {
    const before = await notifCount(tenantId);
    const r = await chat.receiveWebchatInbound({ connection: conn, guestToken: gtoken, body: "สวัสดีครับ สนใจสินค้า", displayName: "คุณเอ" });
    assert("รับ inbound สำเร็จ", r.ok === true && !!r.conversationId, JSON.stringify(r));
    const convId = r.conversationId!;
    const after = await notifCount(tenantId);
    assert("AppNotification เพิ่ม 1 อัน", after - before === 1, `before=${before} after=${after}`);
    assert("conversation staffUnreadCount = 1", (await unread(convId)) === 1);
    assert("outbox chat.message.received ถูก emit", (await outboxCount(tenantId)) >= 1);
    const n = await prisma.appNotification.findFirst({ where: { tenantId, title: "ลูกค้าทักเข้ามา" }, orderBy: { createdAt: "desc" } });
    assert("แจ้งเตือนมีชื่อลูกค้า + ช่องทาง", !!n && n.body.includes("คุณเอ") && n.body.includes("แชทหน้าเว็บ"), n?.body ?? "no-notif");
    assert("แจ้งเตือนมีลิงก์ห้องแชท (/app/sys/.../chat?c=)", !!n && n.body.includes(`/app/sys/${sys.id}/chat?c=${convId}`), n?.body ?? "");
    (globalThis as Record<string, unknown>).__convId = convId;
  }

  // ─────────────── B) de-dup: ลูกค้าพิมพ์ต่ออีก 2 บรรทัด (ยังไม่อ่าน) → แจ้งเตือนไม่เพิ่ม ───────────────
  console.log("\nB) de-dup — พิมพ์รัวยังไม่อ่าน = ไม่แจ้งซ้ำ:");
  const convId = (globalThis as Record<string, unknown>).__convId as string;
  {
    const before = await notifCount(tenantId);
    await chat.receiveWebchatInbound({ connection: conn, guestToken: gtoken, body: "บรรทัดสอง" });
    await chat.receiveWebchatInbound({ connection: conn, guestToken: gtoken, body: "บรรทัดสาม" });
    const after = await notifCount(tenantId);
    assert("2 ข้อความติดกัน → AppNotification ไม่เพิ่ม (ยัง 1)", after - before === 0, `before=${before} after=${after}`);
    assert("staffUnreadCount สะสม = 3", (await unread(convId)) === 3);
    assert("outbox emit ต่อข้อความ (>=3)", (await outboxCount(tenantId)) >= 3);
  }

  // ─────────────── C) re-arm: พนักงานอ่านแล้ว → ข้อความใหม่แจ้งเตือนอีกครั้ง ───────────────
  console.log("\nC) พนักงานอ่านแล้ว → ทักใหม่ = แจ้งเตือนอีก 1:");
  {
    await chat.markRead({ tenantId, systemId: sys.id, conversationId: convId, userId: u.id, unitAccess: ["*"] });
    assert("markRead → staffUnreadCount = 0", (await unread(convId)) === 0);
    const before = await notifCount(tenantId);
    await chat.receiveWebchatInbound({ connection: conn, guestToken: gtoken, body: "กลับมาถามใหม่" });
    const after = await notifCount(tenantId);
    assert("อ่านครบแล้วทักใหม่ → แจ้งเตือน +1", after - before === 1, `before=${before} after=${after}`);
    assert("staffUnreadCount = 1", (await unread(convId)) === 1);
  }

  // ─────────────── D) duplicate webhook (LINE externalMessageId ซ้ำ) → ไม่แจ้งเตือนซ้ำ ───────────────
  console.log("\nD) duplicate webhook (externalMessageId ซ้ำ) → ไม่แจ้ง/ไม่นับซ้ำ:");
  {
    const lineConn = await prisma.chatChannelConnection.create({
      data: {
        tenantId, systemId: sys.id, type: "LINE", displayName: "LINE " + tag,
        externalAccountId: "line-" + tag, status: "CONNECTED",
        credentials: { channelAccessToken: "fake-token", channelSecret: "fake-secret" },
      },
    });
    const extId = "line-msg-" + Date.now();
    const inbound = { externalUserId: "Uline" + Date.now(), externalMessageId: extId, type: "TEXT" as const, body: "ทักผ่าน LINE", sentAt: new Date() };
    const r1 = await chat.receiveInbound({ connection: lineConn, inbound });
    assert("LINE inbound แรกสำเร็จ", r1.ok === true && r1.duplicate !== true, JSON.stringify(r1));
    const convLine = r1.conversationId!;
    const afterFirst = await notifCount(tenantId);
    const unreadFirst = await unread(convLine);

    const r2 = await chat.receiveInbound({ connection: lineConn, inbound }); // webhook ส่งซ้ำ
    assert("LINE inbound ซ้ำ ตรวจจับเป็น duplicate", r2.duplicate === true, JSON.stringify(r2));
    const afterDup = await notifCount(tenantId);
    assert("duplicate → AppNotification ไม่เพิ่ม", afterDup === afterFirst, `first=${afterFirst} dup=${afterDup}`);
    assert("duplicate → staffUnreadCount ไม่เพิ่ม", (await unread(convLine)) === unreadFirst, `first=${unreadFirst}`);
  }

  // ─────────────── E) AI tool chat_unread_conversations ───────────────
  console.log("\nE) AI tool chat_unread_conversations:");
  {
    const raw = await tools.runTool({ tenantId }, "chat_unread_conversations", {});
    const data = JSON.parse(raw) as { จำนวนห้องที่ยังไม่อ่าน?: number; ห้องแชท?: { ลูกค้า: string; ช่องทาง: string; ข้อความค้าง: number }[] };
    // มี unread 2 ห้อง: webchat (จาก C) + LINE (จาก D)
    assert("tool คืนห้อง unread ครบ (2 ห้อง)", data.จำนวนห้องที่ยังไม่อ่าน === 2, JSON.stringify(data));
    const chans = new Set((data.ห้องแชท ?? []).map((h) => h.ช่องทาง));
    assert("tool มีทั้ง LINE + แชทหน้าเว็บ", chans.has("LINE") && chans.has("แชทหน้าเว็บ"), [...chans].join(","));
    assert("tool คืนจำนวนข้อความค้าง > 0", (data.ห้องแชท ?? []).every((h) => h.ข้อความค้าง > 0));
  }

  // ─────────────── F) cross-tenant isolation ───────────────
  console.log("\nF) cross-tenant isolation:");
  {
    const t2 = await prisma.tenant.create({ data: { name: tag + "-2", slug: tag.toLowerCase() + "-2" } });
    tenant2Id = t2.id;
    const sys2 = await system.createSystem(tenant2Id, "CHAT", "แชท2 " + tag);
    const conn2 = await chat.ensureWebchatConnection(tenant2Id, sys2.id);
    const t1NotifBefore = await notifCount(tenantId);
    await chat.receiveWebchatInbound({ connection: conn2, guestToken: "web-t2-" + Date.now(), body: "ทักคนละร้าน", displayName: "ลูกค้าร้าน2" });
    assert("tenant2 ได้ notification ของตัวเอง", (await notifCount(tenant2Id)) === 1);
    assert("tenant1 notification ไม่โดนผลจาก tenant2", (await notifCount(tenantId)) === t1NotifBefore);
    const raw1 = await tools.runTool({ tenantId }, "chat_unread_conversations", {});
    assert("tool ของ tenant1 ไม่เห็นห้องของ tenant2", !raw1.includes("ลูกค้าร้าน2"));
    const raw2 = await tools.runTool({ tenantId: tenant2Id }, "chat_unread_conversations", {});
    const d2 = JSON.parse(raw2) as { จำนวนห้องที่ยังไม่อ่าน?: number };
    assert("tool ของ tenant2 เห็นแค่ห้องของตัวเอง (1)", d2.จำนวนห้องที่ยังไม่อ่าน === 1, raw2);
  }
} catch (e) {
  bad("HARNESS", e instanceof Error ? (e.stack ?? e.message) : String(e));
} finally {
  // ปล่อยให้ drainAll (fire-and-forget) ใน service เดินจบก่อนล้าง
  await new Promise((r) => setTimeout(r, 600));
  for (const tid of [tenantId, tenant2Id].filter(Boolean)) {
    await prisma.chatMessage.deleteMany({ where: { tenantId: tid } });
    await prisma.chatConversationEvent.deleteMany({ where: { tenantId: tid } });
    await prisma.chatReadState.deleteMany({ where: { tenantId: tid } });
    await prisma.chatConversation.deleteMany({ where: { tenantId: tid } });
    await prisma.chatContact.deleteMany({ where: { tenantId: tid } });
    await prisma.chatQuickReply.deleteMany({ where: { tenantId: tid } });
    await prisma.chatSetting.deleteMany({ where: { tenantId: tid } });
    await prisma.chatChannelConnection.deleteMany({ where: { tenantId: tid } });
    await prisma.appNotification.deleteMany({ where: { tenantId: tid } });
    await prisma.outboxEvent.deleteMany({ where: { tenantId: tid } });
    await prisma.appSystem.deleteMany({ where: { tenantId: tid } });
    await prisma.membership.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.delete({ where: { id: tid } }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { email: tag.toLowerCase() + "@qc.local" } });
  console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
}

console.log("\n===== Wave4-A Chat notify =====");
console.log(`ผ่าน ${passed} ข้อ · FINDINGS ${findings.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ passed, findings }));
if (findings.length) process.exit(1);
