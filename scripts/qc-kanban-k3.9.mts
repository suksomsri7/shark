// QC — บอร์ดงาน WO K3.9: อีเมลเข้าบอร์ด (งาน+{emailKey}@shark.in.th → การ์ดพร้อมไฟล์แนบ · ซ้ำ messageId ไม่เกิดซ้ำ) + push มือถือรายคน sendPushToUsers (นับ sent/skipped ตรงจริง)
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/KANBAN-RUN.md §K3.9 · เกณฑ์ §7.4/§9.2/§13 K3.9 · ต้องมี K3.1 + K3.2 (integrations) ก่อน
// requires: kanban-seed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/platform/kanban-email-in.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/platform/kanban-email-in.ts)");
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
let tid = ""; let SYS = ""; let settingsBackup: unknown = null;
const madeCards: string[] = []; const madeDevices: string[] = []; let keyBackup: string | null | undefined = undefined; let board = "";
try {
  const scope = await kq.resolveKanbanScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
  tid = scope.tenantId; SYS = scope.systemId; board = E.boards.maint.id;
  const em = (await import("@/lib/platform/kanban-email-in" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const bd = (await import("@/lib/modules/kanban/boards" as string).catch(() => import("@/lib/modules/kanban/service" as string))) as Record<string, (...a: Any[]) => Promise<Any>>;
  const push = (await import("@/lib/core/push" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const integ = (await import("@/lib/modules/kanban/integrations" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const m = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: m.role, unitAccess: m.unitAccess as string[], permissions: m.permissions as Record<string, unknown> }; };
  const U = { owner: E.users.owner.userId as string, pook: E.users.staff.pook.userId as string, thana: E.users.staff.thana.userId as string };
  const owner = await actorOf(U.owner); const thana = await actorOf(U.thana);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner };
  settingsBackup = (await prisma.appSystem.findUnique({ where: { id: SYS }, select: { settings: true } }))?.settings ?? {};
  keyBackup = ((await prisma.kanbanBoard.findUnique({ where: { id: board } })) as Any)?.emailKey ?? null;
  const pookEmail = (await prisma.user.findUnique({ where: { id: U.pook } }))!.email;

  // ═══ S1 emailKey ═══
  const bcols = (await q<{ column_name: string }>(`select column_name from information_schema.columns where table_name='KanbanBoard'`)).map((c) => c.column_name);
  chk("K3.9-S1.1", "KanbanBoard.emailKey String? + unique(tenantId, emailKey) (partial · null ซ้ำได้)", bcols.includes("emailKey") && (await q(`select 1 from pg_indexes where tablename='KanbanBoard' and indexdef ilike '%unique%' and indexdef ilike '%"emailKey"%'`)).length === 1, "มี", "ขาด");
  const k1 = await bd.ensureEmailKey(ctxO, owner, board);
  const k2 = await bd.ensureEmailKey(ctxO, owner, board);
  chk("K3.9-S1.2", "ensureEmailKey(ctx, actor, boardId) (ADMIN) → { key (base32 8 ตัว a-z2-7), address 'งาน+{key}@shark.in.th' } · เรียกซ้ำได้ key เดิม · thana (VIEWER) → Forbidden", /^[a-z2-7]{8}$/.test(k1?.key ?? "") && k1.address === `งาน+${k1.key}@shark.in.th` && k2?.key === k1.key && !!(await fails(() => bd.ensureEmailKey({ ...ctxO, actorUserId: U.thana }, thana, board))), "8 ตัว · idempotent", JSON.stringify(k1));
  const k3 = await bd.rotateEmailKey(ctxO, owner, board);
  chk("K3.9-S1.3", "rotateEmailKey → key ใหม่ไม่ซ้ำเดิม · ของเก่าใช้ไม่ได้ทันที · activity BOARD_UPDATED {emailKeyRotated}", k3?.key && k3.key !== k1.key && /^[a-z2-7]{8}$/.test(k3.key) && !!(await prisma.kanbanActivity.findFirst({ where: { boardId: board, type: "BOARD_UPDATED" }, orderBy: { createdAt: "desc" } })), "ใหม่", JSON.stringify(k3));
  const KEY = k3.key as string;
  const fakeUpload = async (_data: Buffer, meta: { fileName: string; contentType: string }) => ({ storageKey: `t/${tid}/attachments/qc-k39-${meta.fileName}`, url: `https://cdn.example.test/qc-k39/${encodeURIComponent(meta.fileName)}`, bytes: 1234 });
  const mail = (over: Partial<Any> = {}) => ({ messageId: `<qc-k39-${Date.now()}@mail.test>`, to: [`งาน+${KEY}@shark.in.th`], from: pookEmail, subject: "ลูกค้าขอใบเสนอราคาทริปสิมิลัน", text: "รายละเอียด:\n- 12 คน\n- 24–26 ต.ค.\n<script>alert(1)</script>", html: null, attachments: [{ filename: "รายชื่อ.pdf", contentType: "application/pdf", content: Buffer.from("PDF").toString("base64") }], ...over });

  // ═══ S2 ingest — สวิตช์ปิด ═══
  await integ.setIntegrations(ctxO, owner, { cardFromEmail: { enabled: false } });
  const r0 = await em.ingestInboundEmail(mail(), { upload: fakeUpload });
  chk("K3.9-S2.1", "ingestInboundEmail(payload, deps?: {upload}) → สวิตช์ cardFromEmail ปิด → { ok:false, reason:'disabled' } ไม่มีการ์ด (สวิตช์ปริยายปิด)", r0?.ok === false && r0.reason === "disabled" && (await prisma.kanbanCard.count({ where: { tenantId: tid, sourceType: "EMAIL" } })) === 0, "disabled", JSON.stringify(r0));
  await integ.setIntegrations(ctxO, owner, { cardFromEmail: { enabled: true } });
  const m1 = mail();
  const r1 = await em.ingestInboundEmail(m1, { upload: fakeUpload });
  const r2 = await em.ingestInboundEmail(m1, { upload: fakeUpload });
  const r3 = await em.ingestInboundEmail(m1, { upload: fakeUpload });
  if (r1?.cardId) madeCards.push(r1.cardId);
  const card = await prisma.kanbanCard.findUnique({ where: { id: r1?.cardId ?? "x" }, include: { attachments: true, assignees: true } }) as Any;
  chk("K3.9-S2.2", "🔴 เปิดแล้ว: อีเมลเดียวกัน (messageId เดิม) ×3 → การ์ด 1 ใบ (created true/false/false · cardId เดิม) · sourceType EMAIL · sourceKey email:{messageId} · บอร์ดตาม emailKey · คอลัมน์แรก · ชื่อ = subject · description จาก text (ขึ้นบรรทัด → <br>/<p> · <script> ถูกตัด) · ไฟล์แนบ 1 ผ่าน deps.upload → FileAsset + KanbanAttachment · ผู้ส่งเป็นสมาชิก (pook) → ผู้รับผิดชอบ pook · activity CARD_CREATED", r1?.ok === true && r1.created === true && r2?.created === false && r3?.created === false && r2.cardId === r1.cardId && card?.sourceType === "EMAIL" && card.sourceKey === `email:${m1.messageId}` && card.boardId === board && card.title === m1.subject && /12 คน/.test(card.description ?? "") && !/<script/.test(card.description ?? "") && card.attachments.length === 1 && card.assignees.some((a: Any) => a.userId === U.pook) && !!(await prisma.fileAsset.findFirst({ where: { id: card.attachments[0].fileId, tenantId: tid } })), "1 ใบ ครบ", JSON.stringify({ r1, r2: r2?.created, r3: r3?.created, st: card?.sourceType, att: card?.attachments?.length, asg: card?.assignees?.length }));
  const rUnknown = await em.ingestInboundEmail(mail({ to: ["งาน+zzzzzzzz@shark.in.th"] }), { upload: fakeUpload });
  const rOld = await em.ingestInboundEmail(mail({ to: [`งาน+${k1.key}@shark.in.th`] }), { upload: fakeUpload });
  const rOther = await em.ingestInboundEmail(mail({ to: ["info@shark.in.th"] }), { upload: fakeUpload });
  chk("K3.9-S2.3", "key ไม่รู้จัก / key เก่าที่หมุนแล้ว / ที่อยู่ไม่ใช่รูปแบบ งาน+key → { ok:false, reason:'unknown_board' } · ไม่สร้างการ์ด · ไม่ throw", rUnknown?.ok === false && rUnknown.reason === "unknown_board" && rOld?.ok === false && rOther?.ok === false && (await prisma.kanbanCard.count({ where: { tenantId: tid, sourceType: "EMAIL" } })) === 1, "unknown_board", JSON.stringify({ rUnknown, rOld, rOther }));
  const noSubj = mail({ subject: "", from: "someone@outside.test", attachments: [] });
  const r4 = await em.ingestInboundEmail(noSubj, { upload: fakeUpload });
  if (r4?.cardId) madeCards.push(r4.cardId);
  const c4 = await prisma.kanbanCard.findUnique({ where: { id: r4?.cardId ?? "x" }, include: { assignees: true } });
  chk("K3.9-S2.4", "ไม่มีหัวข้อ → ชื่อ '(อีเมลไม่มีหัวข้อ)' · ผู้ส่งนอกร้าน → ไม่มอบหมาย + รายละเอียดขึ้นต้น 'จาก: {อีเมลผู้ส่ง}' · subject ยาว > 120 ถูกตัด · เกิน 20 ไฟล์ → เก็บ 20 แรก (โค้ด)", r4?.ok === true && /ไม่มีหัวข้อ/.test(c4?.title ?? "") && c4?.assignees.length === 0 && /someone@outside\.test/.test(c4?.description ?? "") && /120/.test(read("src/lib/platform/kanban-email-in.ts")) && /20/.test(read("src/lib/platform/kanban-email-in.ts")), "ครบ", JSON.stringify({ t: c4?.title, d: c4?.description?.slice(0, 60) }));
  const route = read("src/app/api/email/inbound/route.ts");
  chk("K3.9-S2.5", "route POST /api/email/inbound: ตรวจ secret (header X-Inbound-Secret หรือ HMAC จาก EMAIL_INBOUND_SECRET ใน env.ts · ไม่ตั้ง = 503 ปิดบริการ) → normalize payload ของผู้ให้บริการ (Resend/Cloudflare Email Worker) → ingestInboundEmail → 200 {ok, created} · ไม่ตรง secret → 401 · body > 10MB → 413 · ห้ามล้มเพราะอีเมลรูปแบบแปลก (try/catch → 200 ok:false)", route.length > 0 && /EMAIL_INBOUND_SECRET/.test(route + read("src/lib/env.ts")) && /401/.test(route) && /503/.test(route) && /ingestInboundEmail/.test(route), "ครบ", "ขาด");

  // ═══ S3 sendPushToUsers — ตัวเลขห้ามโกหก ═══
  for (const d of [{ u: U.pook, t: `ExponentPushToken[qc-k39-a-${Date.now()}]`, p: "ios" }, { u: U.pook, t: `ExponentPushToken[qc-k39-b-${Date.now()}]`, p: "android" }]) { const row = await prisma.pushDevice.create({ data: { userId: d.u, tenantId: tid, expoToken: d.t, platform: d.p } }); madeDevices.push(row.id); }
  const otherTenantDev = await prisma.pushDevice.create({ data: { userId: U.pook, tenantId: `${tid}-other`, expoToken: `ExponentPushToken[qc-k39-c-${Date.now()}]`, platform: "ios" } }); madeDevices.push(otherTenantDev.id);
  const posted: unknown[][] = [];
  const okPost = async (payloads: unknown[]) => { posted.push(payloads); return payloads.map(() => ({ status: "ok" })); };
  const res1 = await push.sendPushToUsers(tid, [U.pook, U.thana], { title: "ทดสอบ", body: "K3.9" }, { post: okPost });
  chk("K3.9-S3.1", "🔴 sendPushToUsers(tenantId, userIds[], msg, {post}) → { sent, skipped, users:{sent:[], noDevice:[]} } · pook มี 2 เครื่องในร้านนี้ (+1 เครื่องของร้านอื่น **ไม่ส่ง**) · thana ไม่มีเครื่อง → skipped 1 · sent = 2 นับเฉพาะ status ok · payload มี to/title/body", res1?.sent === 2 && res1.skipped === 1 && posted.flat().length === 2 && !posted.flat().some((p: Any) => p.to === otherTenantDev.expoToken) && posted.flat().every((p: Any) => p.title === "ทดสอบ" && p.body === "K3.9") && res1.users?.noDevice?.includes(U.thana), "sent 2 · skipped 1", JSON.stringify(res1));
  const res2 = await push.sendPushToUsers(tid, [U.pook], { title: "x", body: "y" }, { post: async (pl: unknown[]) => pl.map((_: unknown, i: number) => (i === 0 ? { status: "ok" } : { status: "error", details: { error: "DeviceNotRegistered" } })) });
  chk("K3.9-S3.2", "Expo ตอบ error DeviceNotRegistered → ไม่นับ sent (sent 1) + ลบ token ตาย · error อื่น → logOps (ไม่กลืน) · post throw → sent 0 ไม่ throw · userIds ว่าง → {sent:0, skipped:0} ไม่เรียก post", res2?.sent === 1 && (await prisma.pushDevice.count({ where: { userId: U.pook, tenantId: tid } })) === 1 && (await push.sendPushToUsers(tid, [U.pook], { title: "x", body: "y" }, { post: async () => { throw new Error("เน็ตล่ม"); } }))?.sent === 0 && (await push.sendPushToUsers(tid, [], { title: "x", body: "y" }, { post: async () => { throw new Error("ห้ามเรียก"); } }))?.sent === 0, "นับตรง", JSON.stringify(res2));
  chk("K3.9-S3.3", "ผู้เรียกหลายคนในบอร์ดงาน (notifyWatchers K2.11 · reminders · automation notify) เปลี่ยนมาใช้ sendPushToUsers ครั้งเดียว (ไม่วน sendPushToUser ต่อคน) · เรียกนอก transaction · จำกัด userIds ≤ 500", /sendPushToUsers/.test(read("src/lib/modules/kanban/notify.ts")) && /500/.test(read("src/lib/core/push.ts")), "ใช้แล้ว", "ยังวนรายคน", "MAJOR");

  // ═══ S4 UI (static) ═══
  const ui = read("src/components/kanban/BoardEmailIn.tsx") + read("src/app/app/sys/[id]/kanban/b/[boardId]/settings/page.tsx") + read("src/components/kanban/IntegrationsSettings.tsx");
  chk("K3.9-S4.1", "ตั้งค่าบอร์ด › ทั่วไป บล็อก 'อีเมลเข้าบอร์ด' testid board-email-in: ที่อยู่ งาน+{key}@shark.in.th + ปุ่มคัดลอก + 'สร้างที่อยู่ใหม่ (ของเก่าใช้ไม่ได้)' + คำอธิบาย 'หัวข้ออีเมล = ชื่อการ์ด · เนื้อหา = รายละเอียด · ไฟล์แนบติดมาด้วย' · สวิตช์ 'การ์ดจากอีเมล' อยู่ในตั้งค่า › การเชื่อมต่อ", ui.includes("board-email-in") && /อีเมลเข้าบอร์ด/.test(ui) && /คัดลอก/.test(ui) && /ใช้ไม่ได้/.test(ui) && /อีเมล/.test(read("src/components/kanban/IntegrationsSettings.tsx")), "ครบ", "ขาด");
  const shots = existsSync(".qc-shots/kanban/3.9") ? readdirSync(".qc-shots/kanban/3.9").filter((f) => f.endsWith(".png")) : [];
  chk("K3.9-S4.2", "ภาพจริง ≥ 1 ใบใน .qc-shots/kanban/3.9 (บล็อกอีเมลเข้าบอร์ด)", shots.length >= 1, "≥1", String(shots.length), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.name}: ${e.message.slice(0, 240)}` : String(e));
} finally {
  try {
    if (tid) {
      const ids = madeCards.filter(Boolean);
      if (ids.length) { await prisma.kanbanAttachment.deleteMany({ where: { cardId: { in: ids } } }).catch(() => null); await prisma.kanbanActivity.deleteMany({ where: { cardId: { in: ids } } }); await prisma.kanbanCard.deleteMany({ where: { id: { in: ids } } }); }
      await prisma.kanbanCard.deleteMany({ where: { tenantId: tid, sourceType: "EMAIL", createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }).catch(() => null);
      await prisma.fileAsset.deleteMany({ where: { tenantId: tid, cdnUrl: { contains: "qc-k39" } } }).catch(() => null);
      await prisma.pushDevice.deleteMany({ where: { expoToken: { contains: "qc-k39" } } }).catch(() => null);
      if (board && keyBackup !== undefined) await P.kanbanBoard.update({ where: { id: board }, data: { emailKey: keyBackup } }).catch(() => null);
      if (settingsBackup !== null) await prisma.appSystem.update({ where: { id: SYS }, data: { settings: settingsBackup as Any } }).catch(() => null);
      await prisma.appNotification.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
      await prisma.outboxEvent.deleteMany({ where: { tenantId: tid, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, type: { startsWith: "kanban." } } }).catch(() => null);
    }
  } catch (e) { console.log("⚠️ cleanup:", (e as Error).message.slice(0, 120)); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Kanban K3.9 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
