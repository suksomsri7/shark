// QC — HF-APIV1 (hotfix รอบ 1+2): ทางเดินที่ใช้ "คีย์ API กลาง" ต้องเคารพ scope + ระบบที่ผูกของคีย์
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น (เรียก Route Handler ตรง ๆ ไม่ต้องมีเซิร์ฟเวอร์)
//
// สัญญา:
//   คีย์กลาง (คีย์รุ่นเดิมระดับร้าน = scopes [] และไม่ผูกระบบ · ออกจาก /app/settings/api · รวมคีย์ที่หมุนจากมัน)
//     ⇒ 8 route ข้อมูล · แชทโหมด secret · เครื่องมือ AI นอก 4 โมดูล ทำงานเหมือนเดิม
//   คีย์ที่มี scope และ/หรือผูกระบบ (คีย์ของโมดูล บัญชี/บอร์ดงาน/สมาชิก/CRM)
//     ⇒ 8 route ข้อมูล 403 (body เดียวกันทุกตัวอักษร · code key_not_general · ไทยไม่โทษผู้ใช้ + error_en · ไม่มีข้อมูล)
//     ⇒ แชทโหมด secret 403 ทุกเส้น ไม่มีแถวใหม่ — ยกเว้นคีย์ที่ผูก "ระบบแชท" ของร้านนี้ (ใช้ระบบนั้น · หัว X-Shark-System อื่น = 403)
//     ⇒ AI: เครื่องมือนอก 4 โมดูล (sales_summary · financial_summary · remember_fact · kb_auto_save · chat_unread_conversations …)
//        manifest กรองทิ้ง (สารบัญไม่โชว์ · /skills/<id> 404 · core ว่าง) · เรียกตรง 403 · ไม่เขียนอะไรเลย
//        เครื่องมือของโมดูลตัวเองที่ scope ถึง ยังใช้ได้เหมือนเดิม
//   scopesJson เสีย (ไม่ใช่ array / มีสมาชิกไม่ใช่ string) ⇒ ไม่นับเป็นคีย์กลาง (ปิดไว้ก่อน)
//   หมดอายุ / เพิกถอน ⇒ 401 เหมือนเดิม · คีย์ร้านอื่น ⇒ เห็นเฉพาะร้านตัวเอง · /api/v1/me เปิดให้ทุกคีย์ (คืนแค่ตัวตนร้าน)
// ข้อมูลทดสอบ: ร้านชั่วคราว 2 ร้าน slug `qc-hf-apiv1-<rand>` · ลบทุกตารางที่มี tenantId ของ 2 ร้านนี้ใน finally
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-hf-apiv1-scope"); // 🔴 กัน prod
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const { readFileSync, readdirSync } = await import("node:fs");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

type Handler = { GET: (r: Request) => Promise<Response> };
type Body = Record<string, unknown>;
type Res = { status: number; text: string; body: Body };
type AnyFn = (...a: any[]) => Promise<any>; // any จงใจ: oracle ไม่ผูก type ของโค้ด
const TAG = `qc-hf-apiv1-${Math.random().toString(36).slice(2, 8)}`;
const tids: string[] = [];
const keyIds: string[] = [];
const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; count: (a: unknown) => Promise<number> }>;

// ตารางทุกตัวที่มีคอลัมน์ tenantId (อ่านจาก schema ตรง ๆ — ใช้นับ "ไม่มีอะไรถูกเขียน" + ล้างข้อมูลทดสอบ)
const TENANT_MODELS: string[] = (() => {
  const out: string[] = [];
  for (const f of readdirSync("prisma/schema").filter((x) => x.endsWith(".prisma"))) {
    const src = readFileSync(`prisma/schema/${f}`, "utf8");
    for (const m of src.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      if (/^\s*tenantId\s+String\b/m.test(m[2]!)) out.push(m[1]!.charAt(0).toLowerCase() + m[1]!.slice(1));
    }
  }
  return out;
})();
// ตัวนับเพดานอัตรา/เวลาใช้คีย์ไม่ใช่ "ข้อมูลร้าน" — คำขอที่ถูกปฏิเสธยังนับโควตาได้
const COUNT_SKIP = new Set(["apiKey", "rateLimitBucket", "chatRateBucket"]);
async function snapshot(tid: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const m of TENANT_MODELS) {
    if (COUNT_SKIP.has(m) || !P[m]) continue;
    try { out[m] = await P[m].count({ where: { tenantId: tid } }); } catch { /* ตารางที่นับแบบนี้ไม่ได้ */ }
  }
  return out;
}
const diffSnap = (a: Record<string, number>, b: Record<string, number>) => Object.keys(b).filter((k) => a[k] !== b[k]).map((k) => `${k}:${a[k]}→${b[k]}`);

const ROUTES: { id: string; path: string; mod: string; seeded: string }[] = [
  { id: "sales", path: "/api/v1/sales", mod: "@/app/api/v1/sales/route", seeded: "receiptNo" },
  { id: "customers", path: "/api/v1/customers", mod: "@/app/api/v1/customers/route", seeded: "name" },
  { id: "inventory", path: "/api/v1/inventory/items", mod: "@/app/api/v1/inventory/items/route", seeded: "name" },
  { id: "appointments", path: "/api/v1/appointments", mod: "@/app/api/v1/appointments/route", seeded: "customerName" },
  { id: "queue", path: "/api/v1/queue/tickets", mod: "@/app/api/v1/queue/tickets/route", seeded: "number" },
  { id: "reservations", path: "/api/v1/reservations", mod: "@/app/api/v1/reservations/route", seeded: "guestName" },
  { id: "shop", path: "/api/v1/shop/orders", mod: "@/app/api/v1/shop/orders/route", seeded: "customerName" },
  { id: "tickets", path: "/api/v1/tickets/orders", mod: "@/app/api/v1/tickets/orders/route", seeded: "buyerName" },
];

const hdr = (key?: string, extra: Record<string, string> = {}) => ({ ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra });
async function toRes(r: Response): Promise<Res> {
  const text = await r.text();
  let body: Body = {};
  try { body = JSON.parse(text) as Body; } catch { /* ไม่ใช่ JSON */ }
  return { status: r.status, text, body };
}
const get = async (h: Handler, path: string, key?: string, extra: Record<string, string> = {}) => toRes(await h.GET(new Request(`http://x${path}`, { headers: hdr(key, extra) })));
const notGeneral = (r: Res) => r.status === 403 && r.body.code === "key_not_general" && /[ก-๙]/.test(String(r.body.error ?? "")) && typeof r.body.error_en === "string" && !("data" in r.body);
const seededRowOf = (text: string, label: string) => text.includes(`${TAG}-`) && new RegExp(`${TAG}-[^"]*-${label}"`).test(text);

try {
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, AnyFn>;
  const scopesMod = (await import("@/lib/api-keys/scopes" as string)) as { expandBundles: (ids: string[]) => string[] };
  const { businessDateOf } = (await import("@/lib/modules/queue/service" as string)) as { businessDateOf: () => string };

  // ── ร้านทดสอบ: ทุก route ข้อมูลมีอย่างน้อย 1 แถวที่ติดป้าย `${TAG}-…-<ร้าน>` ──
  const seed = async (label: string) => {
    const t = await prisma.tenant.create({ data: { name: `QC HF ${label}`, slug: `${TAG}-${label.toLowerCase()}` } });
    tids.push(t.id);
    const tenantId = t.id;
    const unit = await prisma.businessUnit.create({ data: { tenantId, type: "SHOP", name: `สาขา ${label}`, slug: `${TAG}-u-${label.toLowerCase()}` } });
    const unitId = unit.id;
    const pos = await sys.createSystem(tenantId, "POS", "POS");
    const member = await sys.createSystem(tenantId, "MEMBER", "สมาชิก");
    const inv = await sys.createSystem(tenantId, "INVENTORY", "คลัง");
    const acc = await sys.createSystem(tenantId, "ACCOUNT", "สมุดบัญชี");
    const kb = await sys.createSystem(tenantId, "KANBAN", "บอร์ดงาน");
    const chat1 = await sys.createSystem(tenantId, "CHAT", "แชท 1");
    const chat2 = await sys.createSystem(tenantId, "CHAT", "แชท 2");
    const D = prisma as never as Record<string, { create: (a: unknown) => Promise<{ id: string }> }>;
    await D.posSale.create({ data: { tenantId, unitId, systemId: pos.id, idempotencyKey: `${TAG}-${label}`, subtotalSatang: 10000, grandTotalSatang: 10700, receiptNo: `${TAG}-R-${label}` } });
    await D.customer.create({ data: { tenantId, memberSystemId: member.id, name: `${TAG}-ลูกค้า-${label}`, phone: "0812223333" } });
    await D.invItem.create({ data: { tenantId, systemId: inv.id, sku: `${TAG}-${label}`, name: `${TAG}-สินค้า-${label}` } });
    await D.shopOrder.create({ data: { tenantId, unitId, code: `${TAG}-SO-${label}`, customerName: `${TAG}-ผู้ซื้อ-${label}`, customerPhone: "0812223333" } });
    const staff = await D.bookingStaff.create({ data: { tenantId, unitId, name: `${TAG}-ช่าง-${label}` } });
    const svc = await D.bookingService.create({ data: { tenantId, unitId, name: `${TAG}-บริการ-${label}`, durationMin: 30 } });
    const at = new Date(Date.now() + 86_400_000);
    await D.appointment.create({ data: { tenantId, unitId, staffId: staff.id, serviceId: svc.id, startAt: at, endAt: new Date(at.getTime() + 1_800_000), customerName: `${TAG}-นัด-${label}`, customerPhone: "0812223333" } });
    const qt = await D.queueType.create({ data: { tenantId, unitId, code: `QC${label}`, name: "ทั่วไป", prefix: "Q" } });
    await D.queueTicket.create({ data: { tenantId, unitId, typeId: qt.id, businessDate: businessDateOf(), seq: 1, number: `${TAG}-Q-${label}`, priority: 0, channel: "STAFF" } });
    const rt = await D.hotelRoomType.create({ data: { tenantId, unitId, name: `${TAG}-ห้อง-${label}` } });
    await D.hotelReservation.create({ data: { tenantId, unitId, code: `${TAG}-HR-${label}`, guestName: `${TAG}-แขก-${label}`, roomTypeId: rt.id, checkInDate: new Date("2026-12-01"), checkOutDate: new Date("2026-12-02") } });
    const ev = await D.ticketEvent.create({ data: { tenantId, unitId, name: `${TAG}-งาน-${label}`, startAt: at } });
    await D.ticketOrder.create({ data: { tenantId, unitId, eventId: ev.id, orderNo: `${TAG}-TO-${label}`, buyerName: `${TAG}-ผู้ซื้อตั๋ว-${label}` } });
    return { tid: tenantId, ctx: { tenantId }, acc, kb, chat1, chat2 };
  };
  const A = await seed("A");
  const B = await seed("B");

  const mk = async (ctx: { tenantId: string }, name: string, opts: Record<string, unknown> = {}) => {
    const k = (await ak.createApiKey(ctx, `${TAG} ${name}`, opts)) as { id: string; rawKey: string };
    keyIds.push(k.id);
    return k;
  };
  const legacy = await mk(A.ctx, "legacy");
  const legacy2 = await mk(A.ctx, "legacy-to-rotate");
  const rotated = (await ak.rotateApiKey(A.ctx, legacy2.id)) as { id: string; rawKey: string };
  keyIds.push(rotated.id);
  const scopedOnly = await mk(A.ctx, "kanban-read", { scopes: scopesMod.expandBundles(["kanban-read"]) });
  const boundOnly = await mk(A.ctx, "acc-bound", { systemId: A.acc.id, scopes: [] });
  const scopedBound = await mk(A.ctx, "acc-read-bound", { systemId: A.acc.id, scopes: scopesMod.expandBundles(["read-only"]) });
  const kbBound = await mk(A.ctx, "kb-read-bound", { systemId: A.kb.id, scopes: scopesMod.expandBundles(["kanban-read"]) });
  const chatBound = await mk(A.ctx, "chat2-bound", { systemId: A.chat2.id, scopes: [] });
  const expired = await mk(A.ctx, "expired");
  await prisma.apiKey.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  const revoked = await mk(A.ctx, "revoked");
  await ak.revokeApiKey(A.ctx, revoked.id);
  // N2: scopesJson เสีย 3 แบบ (เขียนตรงลง DB — UI/serviceออกแบบนี้ไม่ได้ แต่แถวเก่า/แก้มือทำได้)
  const malformed: { label: string; key: string }[] = [];
  for (const [label, val] of [["object", { a: 1 }], ["string", "account.doc.view"], ["array-of-number", [1]]] as const) {
    const k = await mk(A.ctx, `malformed-${label}`);
    await prisma.apiKey.update({ where: { id: k.id }, data: { scopesJson: val as never } });
    malformed.push({ label, key: k.rawKey });
  }
  const legacyB = await mk(B.ctx, "legacy B");
  const scopedB = await mk(B.ctx, "kanban-read B", { scopes: scopesMod.expandBundles(["kanban-read"]) });

  const denied: { label: string; key: string }[] = [
    { label: "scope อย่างเดียว (kanban-read)", key: scopedOnly.rawKey },
    { label: "ผูกสมุดบัญชี scopes []", key: boundOnly.rawKey },
    { label: "scope + ผูกสมุดบัญชี (read-only)", key: scopedBound.rawKey },
    { label: "scope + ผูกบอร์ดงาน (kanban-read)", key: kbBound.rawKey },
  ];
  const deniedTexts = new Set<string>();

  // ═══ HF-1…5 route ข้อมูลรุ่นเดิม 8 เส้น ═══
  for (const r of ROUTES) {
    const h = (await import(r.mod as string)) as Handler;
    const L = await get(h, r.path, legacy.rawKey);
    chk(`HF-1.${r.id}`, `${r.path} คีย์รุ่นเดิม → 200 data มีแถวของร้าน A`, L.status === 200 && Array.isArray(L.body.data) && seededRowOf(L.text, "A"), "200 + แถว A", `${L.status} ${L.text.slice(0, 80)}`);
    for (const d of denied) {
      const D = await get(h, r.path, d.key);
      chk(`HF-2.${r.id}.${denied.indexOf(d) + 1}`, `${r.path} ${d.label} → 403 key_not_general ไม่มีข้อมูล`, notGeneral(D) && !D.text.includes(TAG), "403 no data", `${D.status} ${D.text.slice(0, 100)}`);
      if (D.status === 403) deniedTexts.add(D.text);
    }
    const E = await get(h, r.path, expired.rawKey);
    const R = await get(h, r.path, revoked.rawKey);
    const O = await get(h, r.path, legacy2.rawKey); // ตัวก่อนหมุน = ถูกเพิกถอนแล้ว
    chk(`HF-3.${r.id}`, `${r.path} หมดอายุ/เพิกถอน/ตัวก่อนหมุน → 401 (เดิม)`, [E, R, O].every((x) => x.status === 401 && !("data" in x.body)), "401×3", `${E.status}/${R.status}/${O.status}`);
    const LB = await get(h, r.path, legacyB.rawKey);
    chk(`HF-4.${r.id}`, `${r.path} คีย์รุ่นเดิมร้าน B → 200 เห็นแถวร้าน B ไม่เห็นร้าน A`, LB.status === 200 && seededRowOf(LB.text, "B") && !seededRowOf(LB.text, "A"), "200 B only", `${LB.status} ${LB.text.slice(0, 80)}`);
    const DB = await get(h, r.path, scopedB.rawKey);
    if (DB.status === 403) deniedTexts.add(DB.text);
    chk(`HF-5.${r.id}`, `${r.path} คีย์ scope ร้าน B → 403 เหมือนร้าน A`, DB.status === 403, "403", `${DB.status}`);
    // S3: คีย์ที่หมุนจากคีย์รุ่นเดิม = ยังเป็นคีย์รุ่นเดิม
    const RT = await get(h, r.path, rotated.rawKey);
    chk(`HF-7.${r.id}`, `${r.path} คีย์รุ่นเดิมที่หมุนแล้ว → 200 มีแถวของร้าน A`, RT.status === 200 && seededRowOf(RT.text, "A"), "200 + แถว A", `${RT.status} ${RT.text.slice(0, 80)}`);
  }
  chk("HF-5.0", "body 403 เหมือนกันทุก route ทุกคีย์ทุกร้าน (ไม่บอกใบ้ว่ามีข้อมูลหรือไม่)", deniedTexts.size === 1, "1 แบบ", `${deniedTexts.size} แบบ: ${[...deniedTexts].map((t) => t.slice(0, 60)).join(" | ")}`);

  // ═══ HF-6 /me ═══
  const me = (await import("@/app/api/v1/me/route" as string)) as Handler;
  const meAll = await Promise.all([legacy, rotated, scopedOnly, boundOnly, scopedBound, kbBound, chatBound].map((k) => get(me, "/api/v1/me", k.rawKey)));
  chk("HF-6.1", "/me คีย์ที่ใช้ได้ทุกแบบ → 200 { tenant: {id,name,slug} } ของร้าน A เท่านั้น",
    meAll.every((m) => m.status === 200 && (m.body.tenant as Body | undefined)?.id === A.tid && Object.keys(m.body).join() === "tenant" && Object.keys(m.body.tenant as Body).sort().join() === "id,name,slug"),
    "200 identity", meAll.map((m) => m.status).join(","));
  const meBad = await Promise.all([expired, revoked].map((k) => get(me, "/api/v1/me", k.rawKey)));
  chk("HF-6.2", "/me หมดอายุ/เพิกถอน → 401", meBad.every((m) => m.status === 401), "401", meBad.map((m) => m.status).join(","));

  // ═══ HF-8 (N2) scopesJson เสีย ⇒ ไม่ใช่คีย์กลาง ═══
  const salesH = (await import("@/app/api/v1/sales/route" as string)) as Handler;
  for (const m of malformed) {
    const S = await get(salesH, "/api/v1/sales", m.key);
    chk(`HF-8.${m.label}`, `scopesJson เสีย (${m.label}) → /sales 403 ไม่มีข้อมูล`, notGeneral(S) && !S.text.includes(TAG), "403", `${S.status} ${S.text.slice(0, 80)}`);
  }

  // ═══ HF-9…11 แชท โหมด secret ═══
  type ChatH = Record<string, (r: Request) => Promise<Response>>;
  const chatMod = async (p: string) => (await import(`@/app/api/v1/chat/${p}/route` as string)) as ChatH;
  const C = {
    identities: await chatMod("identities"), messages: await chatMod("messages"), thread: await chatMod("thread"), unread: await chatMod("unread"),
    replies: await chatMod("replies"), read: await chatMod("read"), attachments: await chatMod("attachments"),
  };
  const post = async (h: ChatH, path: string, key: string, body: unknown, extra: Record<string, string> = {}) =>
    toRes(await h.POST!(new Request(`http://x${path}`, { method: "POST", headers: { ...hdr(key, extra), "content-type": "application/json" }, body: JSON.stringify(body) })));
  const cget = async (h: ChatH, path: string, key: string, extra: Record<string, string> = {}) => toRes(await h.GET!(new Request(`http://x${path}`, { headers: hdr(key, extra) })));
  const uid = `${TAG}-u1`;
  // HF-9 ตัวคุมฝั่งบวก: เส้นที่ SiamDive ใช้จริง (คีย์รุ่นเดิม)
  const ci = await post(C.identities, "/api/v1/chat/identities", legacy.rawKey, { externalUserId: uid, displayName: "ลูกค้าทดสอบ" });
  chk("HF-9.1", "แชท /identities คีย์รุ่นเดิม → 200 { contactId }", ci.status === 200 && typeof ci.body.contactId === "string", "200 contactId", `${ci.status} ${ci.text.slice(0, 80)}`);
  const cm = await post(C.messages, "/api/v1/chat/messages", legacy.rawKey, { externalUserId: uid, body: `${TAG} สวัสดี` });
  chk("HF-9.2", "แชท /messages คีย์รุ่นเดิม → 200 { ok, conversationId, messageId, createdAt }", cm.status === 200 && cm.body.ok === true && typeof cm.body.messageId === "string" && typeof cm.body.conversationId === "string", "200 ok", `${cm.status} ${cm.text.slice(0, 80)}`);
  const ct = await cget(C.thread, `/api/v1/chat/thread?externalUserId=${encodeURIComponent(uid)}`, legacy.rawKey);
  chk("HF-9.3", "แชท /thread คีย์รุ่นเดิม → 200 มีข้อความที่เพิ่งส่ง", ct.status === 200 && Array.isArray(ct.body.messages) && ct.text.includes(`${TAG} สวัสดี`), "200 + ข้อความ", `${ct.status} ${ct.text.slice(0, 80)}`);
  const cu = await cget(C.unread, `/api/v1/chat/unread?externalUserId=${encodeURIComponent(uid)}`, legacy.rawKey);
  chk("HF-9.4", "แชท /unread คีย์รุ่นเดิม → 200 { unread: number }", cu.status === 200 && typeof cu.body.unread === "number" && Object.keys(cu.body).join() === "unread", "200 unread", `${cu.status} ${cu.text.slice(0, 80)}`);
  const cr = await cget(C.unread, `/api/v1/chat/unread?externalUserId=${encodeURIComponent(uid)}`, rotated.rawKey);
  chk("HF-9.5", "แชท /unread คีย์รุ่นเดิมที่หมุนแล้ว → 200", cr.status === 200 && typeof cr.body.unread === "number", "200", `${cr.status}`);
  const contactSys = async (ext: string) => (await prisma.chatContact.findFirst({ where: { tenantId: A.tid, externalUserId: ext } as never, select: { systemId: true } }))?.systemId ?? null;
  chk("HF-9.6", "แชท คีย์รุ่นเดิมไม่ส่งหัวระบบ → ใช้ระบบแชทตัวแรกของร้าน (เดิม)", (await contactSys(uid)) === A.chat1.id, A.chat1.id, String(await contactSys(uid)));
  const ch2 = await post(C.identities, "/api/v1/chat/identities", legacy.rawKey, { externalUserId: `${uid}-h2` }, { "x-shark-system": A.chat2.id });
  chk("HF-9.7", "แชท คีย์รุ่นเดิม + X-Shark-System ระบบแชทที่ 2 → 200 ใช้ระบบนั้น (เดิม)", ch2.status === 200 && (await contactSys(`${uid}-h2`)) === A.chat2.id, "200 chat2", `${ch2.status}`);

  // HF-10 คีย์ของโมดูล ⇒ 403 ทุกเส้น · ไม่มีแถวใหม่
  const before = await snapshot(A.tid);
  const neg = `${TAG}-neg`;
  for (const d of [...denied, ...malformed.map((m) => ({ label: `scopesJson เสีย ${m.label}`, key: m.key }))]) {
    const rs: [string, Res][] = [
      ["identities", await post(C.identities, "/api/v1/chat/identities", d.key, { externalUserId: neg })],
      ["messages", await post(C.messages, "/api/v1/chat/messages", d.key, { externalUserId: neg, body: `${TAG} ห้ามเข้า` })],
      ["thread", await cget(C.thread, `/api/v1/chat/thread?externalUserId=${encodeURIComponent(uid)}`, d.key)],
      ["unread", await cget(C.unread, `/api/v1/chat/unread?externalUserId=${encodeURIComponent(uid)}`, d.key)],
      ["replies", await post(C.replies, "/api/v1/chat/replies", d.key, { externalUserId: uid, body: `${TAG} ปลอมเป็นทีมงาน` })],
      ["read", await post(C.read, "/api/v1/chat/read", d.key, { externalUserId: uid })],
      // ไม่แนบไฟล์โดยตั้งใจ — โค้ดเดิมตอบ 400 (ไม่มีการอัปโหลดจริงระหว่างจับ RED) · หลังแก้ต้องตกด่านคีย์ 403 ก่อนอ่าน form
      ["attachments", await toRes(await C.attachments.POST!(new Request("http://x/api/v1/chat/attachments", { method: "POST", headers: hdr(d.key), body: new FormData() })))],
    ];
    const bad = rs.filter(([, r]) => !notGeneral(r) || r.text.includes("สวัสดี"));
    chk(`HF-10.${d.label}`, `แชท ${d.label} → 403 key_not_general ทั้ง 7 เส้น`, bad.length === 0, "403×7", bad.map(([n, r]) => `${n}=${r.status}`).join(" ") || "ok");
  }
  const after = await snapshot(A.tid);
  chk("HF-10.0", "แชท คีย์ที่ถูกปฏิเสธ → ไม่มีแถวใหม่ในตารางใดของร้าน (ข้อความ/ผู้ติดต่อ/ไฟล์แนบ/ห้อง …)", diffSnap(before, after).length === 0, "ไม่เปลี่ยน", diffSnap(before, after).join(" ") || "ok");

  // HF-11 คีย์ที่ผูก "ระบบแชท" ของร้าน (ทางเลือก b)
  const cb = await post(C.identities, "/api/v1/chat/identities", chatBound.rawKey, { externalUserId: `${uid}-b` });
  chk("HF-11.1", "แชท คีย์ผูกระบบแชทที่ 2 ไม่ส่งหัว → 200 ใช้ระบบที่ผูก (ไม่ใช่ระบบแรก)", cb.status === 200 && (await contactSys(`${uid}-b`)) === A.chat2.id, "200 chat2", `${cb.status} ${String(await contactSys(`${uid}-b`))}`);
  const cbSame = await cget(C.unread, `/api/v1/chat/unread?externalUserId=${encodeURIComponent(`${uid}-b`)}`, chatBound.rawKey, { "x-shark-system": A.chat2.id });
  chk("HF-11.2", "แชท คีย์ผูกระบบแชท + หัวระบบเดียวกัน → 200", cbSame.status === 200, "200", `${cbSame.status}`);
  const cbOther = await cget(C.unread, `/api/v1/chat/unread?externalUserId=${encodeURIComponent(uid)}`, chatBound.rawKey, { "x-shark-system": A.chat1.id });
  chk("HF-11.3", "แชท คีย์ผูกระบบแชท + หัวระบบแชทอื่น → 403", cbOther.status === 403 && /[ก-๙]/.test(String(cbOther.body.error ?? "")) && typeof cbOther.body.error_en === "string", "403", `${cbOther.status} ${cbOther.text.slice(0, 80)}`);
  const cbData = await get(salesH, "/api/v1/sales", chatBound.rawKey);
  chk("HF-11.4", "คีย์ผูกระบบแชท → route ข้อมูลรุ่นเดิม 403 (ผูกระบบ = ไม่ใช่คีย์กลาง)", notGeneral(cbData), "403", `${cbData.status}`);

  // ═══ HF-12 AI ═══
  const skillsList = (await import("@/app/api/v1/ai/skills/route" as string)) as Handler;
  const skillOne = (await import("@/app/api/v1/ai/skills/[id]/route" as string)) as { GET: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response> };
  const toolRun = (await import("@/app/api/v1/ai/tools/[name]/route" as string)) as { POST: (r: Request, c: { params: Promise<{ name: string }> }) => Promise<Response> };
  const listSkills = async (key: string) => get(skillsList, "/api/v1/ai/skills", key);
  const oneSkill = async (key: string, id: string) => toRes(await skillOne.GET(new Request(`http://x/api/v1/ai/skills/${id}`, { headers: hdr(key) }), { params: Promise.resolve({ id }) }));
  const runTool = async (key: string, name: string, args: unknown, extra: Record<string, string> = {}) =>
    toRes(await toolRun.POST(new Request(`http://x/api/v1/ai/tools/${name}`, { method: "POST", headers: { ...hdr(key, extra), "content-type": "application/json" }, body: JSON.stringify({ args }) }), { params: Promise.resolve({ name }) }));
  const GENERAL = ["sales_summary", "financial_summary", "remember_fact", "kb_auto_save", "chat_unread_conversations"];
  const toolNamesIn = (r: Res) => ((r.body.tools as { function?: { name?: string } }[] | undefined) ?? []).map((t) => t.function?.name ?? "");
  // ตัวคุมฝั่งบวก: คีย์รุ่นเดิม (และที่หมุนแล้ว)
  for (const k of [{ label: "รุ่นเดิม", key: legacy.rawKey }, { label: "รุ่นเดิมที่หมุนแล้ว", key: rotated.rawKey }]) {
    const L = await listSkills(k.key);
    const ids = ((L.body.skills as { id: string }[] | undefined) ?? []).map((s) => s.id);
    chk(`HF-12.1.${k.label}`, `AI /skills คีย์${k.label} → มีสกิล sales/knowledge/memory + core 8 ตัว (เดิม)`, L.status === 200 && ["sales", "knowledge", "memory"].every((i) => ids.includes(i)) && ((L.body.core as { tools?: string[] })?.tools ?? []).length === 8, "ครบ", `${L.status} ${ids.join(",")}`);
    const S = await oneSkill(k.key, "sales");
    chk(`HF-12.2.${k.label}`, `AI /skills/sales คีย์${k.label} → 200 มี sales_summary + financial_summary`, S.status === 200 && ["sales_summary", "financial_summary"].every((n) => toolNamesIn(S).includes(n)), "200", `${S.status} ${toolNamesIn(S).join(",")}`);
    const T = await runTool(k.key, "sales_summary", {});
    chk(`HF-12.3.${k.label}`, `AI tools/sales_summary คีย์${k.label} → 200 ทำงาน`, T.status === 200 && T.body.tool === "sales_summary" && "result" in T.body, "200", `${T.status} ${T.text.slice(0, 80)}`);
  }
  // คีย์ของโมดูล ⇒ เครื่องมือนอก 4 โมดูล: สารบัญไม่โชว์ · /skills/<id> 404 · เรียกตรง 403 · ไม่เขียนอะไร
  const aiBefore = await snapshot(A.tid);
  for (const d of denied) {
    const L = await listSkills(d.key);
    const ids = ((L.body.skills as { id: string }[] | undefined) ?? []).map((s) => s.id);
    const core = (L.body.core as { tools?: string[] } | undefined)?.tools ?? [];
    chk(`HF-12.4.${denied.indexOf(d) + 1}`, `AI /skills ${d.label} → ไม่มีสกิลนอกโมดูล (sales/knowledge/memory/chat/inventory) · core ว่าง`, L.status === 200 && !["sales", "knowledge", "memory", "chat", "inventory"].some((i) => ids.includes(i)) && core.length === 0, "กรองทิ้ง", `${L.status} skills=${ids.join(",")} core=${core.length}`);
    const one = await Promise.all(["sales", "knowledge", "memory", "chat"].map((i) => oneSkill(d.key, i)));
    chk(`HF-12.5.${denied.indexOf(d) + 1}`, `AI /skills/{sales,knowledge,memory,chat} ${d.label} → 404 ทุกตัว`, one.every((x) => x.status === 404), "404×4", one.map((x) => x.status).join(","));
    const runs = await Promise.all(GENERAL.map((n) => runTool(d.key, n, n === "remember_fact" ? { content: `${TAG} ห้ามจำ` } : n === "kb_auto_save" ? { content: `${TAG}` } : {})));
    const badRun = runs.map((x, i) => [GENERAL[i]!, x] as const).filter(([, x]) => !notGeneral(x));
    chk(`HF-12.6.${denied.indexOf(d) + 1}`, `AI tools/${GENERAL.join("|")} ${d.label} → 403 key_not_general ทุกตัว`, badRun.length === 0, "403×5", badRun.map(([n, x]) => `${n}=${x.status}`).join(" ") || "ok");
  }
  const aiAfter = await snapshot(A.tid);
  chk("HF-12.7", "AI คีย์ที่ถูกปฏิเสธ → ไม่มีแถวใหม่ในตารางใดของร้าน (ความจำ/คลังความรู้/ห้องแชท AI/ข้อเสนอ …)", diffSnap(aiBefore, aiAfter).length === 0, "ไม่เปลี่ยน", diffSnap(aiBefore, aiAfter).join(" ") || "ok");
  // ตัวคุมฝั่งบวก: คีย์ของโมดูลยังใช้เครื่องมือของโมดูลตัวเองได้ตาม scope เดิม
  const kbList = await listSkills(kbBound.rawKey);
  chk("HF-12.8", "AI /skills คีย์บอร์ดงาน → ยังเห็นสกิล tasks", kbList.status === 200 && ((kbList.body.skills as { id: string }[] | undefined) ?? []).some((s) => s.id === "tasks"), "มี tasks", kbList.text.slice(0, 120));
  const kbOne = await oneSkill(kbBound.rawKey, "tasks");
  chk("HF-12.9", "AI /skills/tasks คีย์บอร์ดงาน → 200 มี kanban_list_boards", kbOne.status === 200 && toolNamesIn(kbOne).includes("kanban_list_boards"), "200", `${kbOne.status} ${toolNamesIn(kbOne).slice(0, 5).join(",")}`);
  const kbRun = await runTool(kbBound.rawKey, "kanban_list_boards", {});
  chk("HF-12.10", "AI tools/kanban_list_boards คีย์บอร์ดงาน (scope ถึง) → 200 ทำงาน", kbRun.status === 200 && kbRun.body.tool === "kanban_list_boards", "200", `${kbRun.status} ${kbRun.text.slice(0, 80)}`);
  const kbWrite = await runTool(kbBound.rawKey, "kanban_create_card", { boardId: "x", title: "x" });
  chk("HF-12.11", "AI tools/kanban_create_card คีย์ kanban-read (scope ไม่ถึง) → 403 เดิม (ไม่ใช่ key_not_general)", kbWrite.status === 403 && kbWrite.body.code !== "key_not_general", "403 เดิม", `${kbWrite.status} ${kbWrite.text.slice(0, 80)}`);
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ลบต่อ */ } };
  // ลบทุกตารางที่มี tenantId ของร้านทดสอบ วนหลายรอบตามลำดับ FK (ตารางลูกหายก่อน แม่ลบได้ในรอบถัดไป)
  for (let pass = 0; pass < 5; pass++) {
    for (const tid of tids) for (const m of TENANT_MODELS) if (P[m]) await d(() => P[m]!.deleteMany({ where: { tenantId: tid } }));
  }
  for (const id of keyIds) await d(() => P.chatRateBucket!.deleteMany({ where: { key: { contains: id } } }));
  for (const tid of tids) await d(() => prisma.tenant.delete({ where: { id: tid } }));
  const left = await prisma.tenant.count({ where: { slug: { startsWith: TAG } } }).catch(() => -1);
  if (left !== 0) console.log(`  ⚠️ ล้างไม่หมด: เหลือร้าน ${left} (slug ${TAG}*)`);
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC HF-APIV1 scope =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
