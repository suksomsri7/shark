// QC — B27 (17 พ.ย. 2026) สวิตช์ AI แนะนำคำตอบ · การแปล · ภาษาที่ทีมอ่าน ในแอป + ปุ่ม ✨ ขอร่างคำตอบ
// สัญญา: เจ้าของอนุมัติ 17 พ.ย. — GET/PUT /api/mobile/inbox/ai-settings (ด่าน/ตัวเขียนเดียวกับฟอร์มเว็บ setChatAiSettingsAction) ·
//        `can.aiSuggest` = คีย์ chat.ai.suggest ∧ ร้านเปิด aiSuggestEnabled (แบบเดียวกับ can.translate)
//
// กลุ่มข้อ:
//   R  เส้นทาง GET/PUT inbox/ai-settings
//   A  ค่าเริ่มต้นปิด (ไม่มีแถว ChatSetting) · เจ้าของ/ผู้จัดการเปิดได้ · STAFF ไม่มีคีย์ = อ่านได้ canEdit=false + PUT 403 ไทย ·
//      STAFF มีคีย์ตั้งค่าแชท = เปิดได้ · ร้านอื่นเขียน/อ่านระบบนี้ไม่ได้ (404 · แถวไม่เปลี่ยน) · staffLang นอกชุด/รูปผิด = 422 · ไม่มีสิทธิ์ดูแชท = 403 · ไม่มี Bearer = 401
//   W  ฟอร์มเว็บยังเขียน 3 ฟิลด์เดิมผ่านตัวเขียนร่วม (static) + ตัวเขียนร่วม runtime (สร้างแถวเมื่อไม่มี · ระบบร้านอื่น = null ไม่สร้าง) + กติกาภาษาฟอร์มเดิม
//   C  can.aiSuggest ตามสวิตช์ร้าน (เปิด = true · ปิด = false) · can.translate ตามสวิตช์เดิม · ai-suggest ร้านปิด = ok:false reason ไทย
//   M  แอป: ปุ่ม ✨ / ส่วนตั้งค่า (static — testID · เงื่อนไข · i18n th/en · ชื่อ Lekaa)
//   X  ไม่มีความลับใน DTO · D fitness
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-b27-chat-ai.mts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-b27-chat-ai";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-b27-chat-ai");
process.env.SHARK_AI_MOCK = "1";
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
const rd = (p: string) => readFileSync(join(ROOT, p), "utf8");
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { prisma } = await import("@/lib/core/db");
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const J = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const route = async (p: string): Promise<Record<string, Handler> | null> => { try { return (await import(p)) as unknown as Record<string, Handler>; } catch (e) { console.log(`  ⚠️ import ${p}: ${errMsg(e)}`); return null; } };
const P = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const jsonOf = async (r: Response) => { try { return (await r.json()) as Record<string, unknown>; } catch { return {}; } };

console.log("── R: เส้นทาง ──");
const mods: Record<string, Record<string, Handler> | null> = {};
for (const p of ["inbox/ai-settings", "inbox/conversations/[id]", "inbox/conversations/[id]/ai-suggest"]) mods[p] = await route(`@/app/api/mobile/${p}/route`);
chk("R-1", "มี GET+PUT inbox/ai-settings", typeof mods["inbox/ai-settings"]?.GET === "function" && typeof mods["inbox/ai-settings"]?.PUT === "function");

console.log("── W: ฟอร์มเว็บ (static) ──");
{
  const act = rd("src/lib/modules/chat/inbox-actions.ts");
  const fn = act.slice(act.indexOf("export async function setChatAiSettingsAction"), act.indexOf("// ═══════════════ ปักหมุด"));
  const ui = rd("src/lib/modules/chat/ui.tsx");
  const ok1 = /assertCan\(membershipOf\(auth\), \{ module: "chat", action: CHAT_SETTING_ACTION \}\)/.test(fn) && /writeChatAiSettings\(auth\.active\.tenantId, systemId, \{/.test(fn)
    && /aiSuggestEnabled: String\(formData\.get\("aiSuggestEnabled"\) \?\? ""\) === "on"/.test(fn) && /translateEnabled: String\(formData\.get\("translateEnabled"\) \?\? ""\) === "on"/.test(fn)
    && /staffLang: staffLangFromForm\(formData\.get\("staffLang"\)\)/.test(fn) && !/chatSetting\.updateMany/.test(fn) && /revalidatePath\(path\)/.test(fn);
  const ok2 = /<form action=\{setChatAiSettingsAction\}/.test(ui) && /name="aiSuggestEnabled"/.test(ui) && /name="translateEnabled"/.test(ui) && /name="staffLang"/.test(ui);
  const keys = rd("src/lib/modules/chat/guard-keys.ts");
  const route = rd("src/app/api/mobile/inbox/ai-settings/route.ts");
  const ok3 = /CHAT_SETTING_ACTION = "chat\.setting\.setMemberSystem"/.test(keys) && /action: CHAT_SETTING_ACTION/.test(route) && /writeChatAiSettings\(/.test(route) && /limited\(a\.c, "ai-settings", 30\)/.test(route) && /withErrors\("inbox\/ai-settings PUT"/.test(route) && /\.strict\(\)/.test(route);
  chk("W-1", "setChatAiSettingsAction: คีย์เดิม (CHAT_SETTING_ACTION) · เขียน 3 ฟิลด์เดิมผ่าน writeChatAiSettings · ไม่มี updateMany ตรง · ยัง revalidate", ok1, fn.slice(0, 200));
  chk("W-2", "ฟอร์มเว็บยังส่ง aiSuggestEnabled/translateEnabled/staffLang ไปที่ setChatAiSettingsAction", ok2);
  chk("W-3", "route แอปใช้คีย์เดียวกัน + ตัวเขียนเดียวกัน + rate limit 30 + withErrors + zod strict", ok3);
}

const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const aiMod = (await import("@/lib/modules/chat/ai-settings")) as AnyMod;
const PFX = "qcb27ai-";
const U = { owner: `${PFX}owner`, mgr: `${PFX}mgr`, staff: `${PFX}staff`, setter: `${PFX}setter`, none: `${PFX}none`, owner2: `${PFX}owner2` };
const tids: string[] = [];
const cleanup = async () => {
  for (const tid of tids) {
    for (const m of ["chatAiSuggestion", "chatMessage", "chatConversation", "chatContact", "chatSetting", "membership", "appSystem", "businessUnit"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-b27-ai-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.session.deleteMany({ where: { userId: { startsWith: PFX } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: PFX } } }); } catch { /* */ }
};
try {
  await cleanup();
  const tA = await prisma.tenant.create({ data: { name: "QC B27 AI A", slug: `qc-b27-ai-a-${Date.now().toString(36)}` } }); tids.push(tA.id);
  const tB = await prisma.tenant.create({ data: { name: "QC B27 AI B", slug: `qc-b27-ai-b-${Date.now().toString(36)}` } }); tids.push(tB.id);
  const tid = tA.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `คุณ${k}` } });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "สาขา A", slug: `u-${Date.now().toString(36)}` } });
  const readPerm = { "chat.conversation.read": true, "chat.message.send": true, "chat.ai.suggest": true, "chat.translate.use": true };
  const mk = (tenantId: string, role: "OWNER" | "MANAGER" | "STAFF", userId: string, permissions: Record<string, unknown>) => prisma.membership.create({ data: { tenantId, userId, role, unitAccess: ["*"], permissions, acceptedAt: new Date() } as never });
  await mk(tid, "OWNER", U.owner, {}); await mk(tid, "MANAGER", U.mgr, {}); await mk(tid, "STAFF", U.staff, readPerm);
  await mk(tid, "STAFF", U.setter, { ...readPerm, "chat.setting.setMemberSystem": true }); await mk(tid, "STAFF", U.none, {});
  await mk(tB.id, "OWNER", U.owner2, {});
  const sid = (await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT", name: "แชท QC A" } as never })).id;
  const sidB = (await prisma.appSystem.create({ data: { tenantId: tB.id, type: "CHAT", name: "แชท QC B" } as never })).id;
  // ไม่สร้าง ChatSetting ของร้าน A — ค่าเริ่มต้นต้องมาจาก CHAT_AI_DEFAULTS · ตัวเขียนต้องสร้างแถวเอง
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", externalUserId: `${PFX}c-${Date.now().toString(36)}`, displayName: "ลูกค้า QC", lang: "en" } as never });
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: sid, channel: "WEBCHAT", contactId: contact.id, status: "OPEN", unitId: unit.id, assigneeUserId: U.staff, lastMessageAt: new Date(), firstCustomerMessageAt: new Date() } as never });
  await prisma.chatMessage.create({ data: { tenantId: tid, systemId: sid, conversationId: conv.id, direction: "IN", type: "TEXT", body: "Hello, can I book a table?" } as never });

  const hdr = async (uid: string, tenantId = tid) => ({ authorization: `Bearer ${(await auth.issueMobileToken(uid)).token}`, "x-tenant-id": tenantId });
  const H = { owner: await hdr(U.owner), mgr: await hdr(U.mgr), staff: await hdr(U.staff), setter: await hdr(U.setter), none: await hdr(U.none), owner2: await hdr(U.owner2, tB.id) };
  const bodies: string[] = [];
  const call = async (p: string, meth: string, headers: Record<string, string>, opt: { body?: unknown; params?: Record<string, string>; qs?: string } = {}) => {
    const fn = mods[p]?.[meth]; if (!fn) return { status: 0, json: {} as Record<string, unknown> };
    const res = await fn(J(`/api/mobile/${p.replace("[id]", opt.params?.id ?? "")}${opt.qs ?? ""}`, meth, opt.body, headers), opt.params ? P(opt.params) : undefined);
    const text = await res.clone().text(); bodies.push(text);
    return { status: res.status, json: await jsonOf(res) };
  };
  const S = "inbox/ai-settings";
  const row = () => prisma.chatSetting.findUnique({ where: { systemId: sid }, select: { aiSuggestEnabled: true, translateEnabled: true, staffLang: true } });
  const on = { systemId: sid, aiSuggestEnabled: true, translateEnabled: true, staffLang: "en" };

  console.log("── A: ai-settings ──");
  {
    const g = await call(S, "GET", H.owner, { qs: `?systemId=${sid}` });
    const langs = g.json.langs as unknown[];
    chk("A-1", "ค่าเริ่มต้น (ยังไม่มีแถว) = ปิด/ปิด/th · langs 8 ภาษาเดียวกับฟอร์มเว็บ · เจ้าของ canEdit", g.status === 200 && g.json.aiSuggestEnabled === false && g.json.translateEnabled === false && g.json.staffLang === "th" && g.json.systemId === sid && g.json.canEdit === true && JSON.stringify(langs) === JSON.stringify(["th", "en", "cn", "ja", "ko", "de", "fr", "ru"]) && (await row()) === null, JSON.stringify(g));
    const gs = await call(S, "GET", H.staff, { qs: `?systemId=${sid}` });
    const ps = await call(S, "PUT", H.staff, { body: on });
    chk("A-2", "STAFF ไม่มีคีย์ตั้งค่าแชท: GET 200 canEdit=false · PUT 403 ข้อความไทย · ไม่มีแถวเกิดขึ้น", gs.status === 200 && gs.json.canEdit === false && gs.json.aiSuggestEnabled === false && ps.status === 403 && ps.json.error === "forbidden" && thai(ps.json.message) && (await row()) === null, JSON.stringify({ gs, ps }));
    const po = await call(S, "PUT", H.owner, { body: on });
    const r1 = await row();
    chk("A-3", "เจ้าของเปิดทั้งคู่ + ภาษา en ⇒ 200 ค่าใหม่ · แถว ChatSetting ถูกสร้างและตรงกัน", po.status === 200 && po.json.aiSuggestEnabled === true && po.json.translateEnabled === true && po.json.staffLang === "en" && po.json.canEdit === true && r1?.aiSuggestEnabled === true && r1?.translateEnabled === true && r1?.staffLang === "en", JSON.stringify({ po, r1 }));
    const pm = await call(S, "PUT", H.mgr, { body: { ...on, translateEnabled: false } });
    const pt = await call(S, "PUT", H.setter, { body: { ...on, translateEnabled: true, staffLang: "ja" } });
    const r2 = await row();
    chk("A-4", "ผู้จัดการ (ผ่านตาม evaluate) และ STAFF ที่มีคีย์ chat.setting.setMemberSystem แก้ได้ (เหมือนเว็บ)", pm.status === 200 && pm.json.translateEnabled === false && pt.status === 200 && r2?.translateEnabled === true && r2?.staffLang === "ja", JSON.stringify({ pm: pm.status, pt: pt.status, r2 }));
    const before = JSON.stringify(await row());
    const px = await call(S, "PUT", H.owner2, { body: { ...on, aiSuggestEnabled: false, staffLang: "th" } });
    const gx = await call(S, "GET", H.owner2, { qs: `?systemId=${sid}` });
    const pxb = await call(S, "PUT", H.owner2, { body: { systemId: sidB, aiSuggestEnabled: true, translateEnabled: false, staffLang: "ko" } });
    const rowB = await prisma.chatSetting.findUnique({ where: { systemId: sidB } });
    chk("A-5", "ร้านอื่นใช้ systemId ของร้านนี้: PUT 404 · GET 404 · แถวร้านนี้ไม่เปลี่ยน · (ร้าน B เขียนของตัวเองได้ = แถวของ B)", px.status === 404 && gx.status === 404 && JSON.stringify(await row()) === before && pxb.status === 200 && rowB?.tenantId === tB.id && rowB?.staffLang === "ko", JSON.stringify({ px: px.status, gx: gx.status, pxb: pxb.status, rowB: rowB?.staffLang }));
    const bad = [
      await call(S, "PUT", H.owner, { body: { ...on, staffLang: "xx" } }),
      await call(S, "PUT", H.owner, { body: { ...on, staffLang: "zh" } }),
      await call(S, "PUT", H.owner, { body: { ...on, staffLang: "" } }),
      await call(S, "PUT", H.owner, { body: { ...on, aiSuggestEnabled: "on" } }),
      await call(S, "PUT", H.owner, { body: { aiSuggestEnabled: true, translateEnabled: true } }),
      await call(S, "PUT", H.owner, { body: { ...on, extra: 1 } }),
      await call(S, "PUT", H.owner, { body: "{nope" }),
    ];
    chk("A-6", "staffLang นอกชุด (xx/zh/ว่าง) · ไม่ใช่ boolean · ขาดฟิลด์ · ฟิลด์เกิน ⇒ 422 · JSON เสีย ⇒ 400 · แถวไม่เปลี่ยน", bad.slice(0, 6).every((r) => r.status === 422 && thai(r.json.message)) && bad[6]!.status === 400 && JSON.stringify(await row()) === before, JSON.stringify(bad.map((b) => b.status)));
    const gn = await call(S, "GET", H.none, { qs: `?systemId=${sid}` });
    const pn = await call(S, "PUT", H.none, { body: on });
    const g0 = await call(S, "GET", {});
    chk("A-7", "ไม่มีสิทธิ์ดูแชท ⇒ GET/PUT 403 · ไม่มี Bearer ⇒ 401", gn.status === 403 && pn.status === 403 && g0.status === 401, JSON.stringify([gn.status, pn.status, g0.status]));
  }

  console.log("── W: ตัวเขียนร่วม (runtime) ──");
  {
    const lang = [aiMod.staffLangFromForm("JA "), aiMod.staffLangFromForm("bad1"), aiMod.staffLangFromForm(null), aiMod.staffLangFromForm("en")];
    chk("W-4", "กติกาภาษาของฟอร์มเว็บเดิม: a-z 2 ตัว (ตัดช่องว่าง/ตัวเล็ก) · อย่างอื่น = th", JSON.stringify(lang) === JSON.stringify(["ja", "th", "th", "en"]), JSON.stringify(lang));
    const x = await aiMod.writeChatAiSettings(tid, sidB, { aiSuggestEnabled: true, translateEnabled: true, staffLang: "de" });
    const rowB = await prisma.chatSetting.findUnique({ where: { systemId: sidB } });
    const sidC = (await prisma.appSystem.create({ data: { tenantId: tid, type: "CHAT", name: "แชท QC A2" } as never })).id;
    const y = await aiMod.writeChatAiSettings(tid, sidC, { aiSuggestEnabled: false, translateEnabled: true, staffLang: "fr" });
    const rowC = await prisma.chatSetting.findUnique({ where: { systemId: sidC } });
    chk("W-5", "writeChatAiSettings: systemId ของร้านอื่น ⇒ null + แถวของร้านนั้นไม่เปลี่ยน · ระบบของร้านนี้ที่ยังไม่มีแถว ⇒ สร้างแถว (tenant ถูก)", x === null && rowB?.staffLang === "ko" && rowB?.translateEnabled === false && y?.staffLang === "fr" && rowC?.tenantId === tid && rowC?.translateEnabled === true && rowC?.aiSuggestEnabled === false, JSON.stringify({ x, rowB: rowB?.staffLang, y, rowC: rowC?.tenantId === tid }));
  }

  console.log("── C: can.aiSuggest / can.translate ตามสวิตช์ร้าน ──");
  {
    const C = "inbox/conversations/[id]";
    const canOf = async (h: Record<string, string>) => { const r = await call(C, "GET", h, { params: { id: conv.id }, qs: `?systemId=${sid}` }); return { status: r.status, can: (((r.json.conversation ?? {}) as AnyMod).can ?? {}) as AnyMod, staffLang: ((r.json.conversation ?? {}) as AnyMod).staffLang }; };
    await call(S, "PUT", H.owner, { body: { systemId: sid, aiSuggestEnabled: true, translateEnabled: true, staffLang: "th" } });
    const a1 = await canOf(H.staff), a2 = await canOf(H.setter);
    chk("C-1", "ร้านเปิด ⇒ STAFF ที่มีคีย์ chat.ai.suggest: can.aiSuggest = true · can.translate = true · staffLang ตามค่าตั้ง", a1.status === 200 && a1.can.aiSuggest === true && a1.can.translate === true && a1.staffLang === "th" && a2.can.aiSuggest === true, JSON.stringify({ a1, a2 }));
    await call(S, "PUT", H.owner, { body: { systemId: sid, aiSuggestEnabled: false, translateEnabled: true, staffLang: "th" } });
    const b1 = await canOf(H.staff), b2 = await canOf(H.owner);
    const sug = await call("inbox/conversations/[id]/ai-suggest", "POST", H.staff, { params: { id: conv.id }, body: { systemId: sid } });
    chk("C-2", "ร้านปิด AI แนะนำ ⇒ can.aiSuggest = false (STAFF + OWNER) · can.translate ยัง true · POST ai-suggest ⇒ 200 ok:false reason ไทย", b1.can.aiSuggest === false && b2.can.aiSuggest === false && b1.can.translate === true && b1.can.reply === true && sug.status === 200 && sug.json.ok === false && thai(sug.json.reason), JSON.stringify({ b1: b1.can, b2: b2.can, sug }).slice(0, 400));
    await call(S, "PUT", H.owner, { body: { systemId: sid, aiSuggestEnabled: true, translateEnabled: false, staffLang: "th" } });
    const c1 = await canOf(H.staff);
    chk("C-3", "เปิด AI ปิดแปล ⇒ aiSuggest true · translate false (สองสวิตช์อิสระ)", c1.can.aiSuggest === true && c1.can.translate === false, JSON.stringify(c1.can));
  }

  console.log("── X ──");
  { const leak = bodies.filter((b) => /"phone":"\+66|codeHash|accessToken|"token":"|apiKey|secret"/i.test(b)); chk("X-1", "ไม่มีเบอร์เต็ม/ความลับใน DTO", leak.length === 0, leak.map((b) => b.slice(0, 80)).join(" | ").slice(0, 200)); }
} catch (e) {
  console.log(`  💥 ${errMsg(e)}`); chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally { await cleanup(); }

console.log("── M: แอป (static) ──");
{
  const room = rd("apps/mobile/app/(app)/customers/[id]/index.tsx");
  const set = rd("apps/mobile/app/(app)/secretary/settings/customers.tsx");
  const api = rd("apps/mobile/src/api/inbox.ts");
  const th = rd("apps/mobile/src/i18n/th.ts"), en = rd("apps/mobile/src/i18n/en.ts");
  chk("M-1", "ห้อง: ปุ่ม cust-draft-ask ขึ้นเมื่อ can.aiSuggest === true ∧ ตอบได้ ∧ ไม่ใช่บันทึกภายใน ∧ หน้าต่างไม่ปิด · เรียก …/ai-suggest · ok:false ⇒ แถบแจ้ง (reason) · กำลังขอ = busy · ยังขอเองเมื่อ aiDraft",
    /testID="cust-draft-ask"/.test(room) && /const canSuggest = conv\?\.can\?\.aiSuggest === true && canReplyHere;/.test(room) && /canSuggest && !internal && !windowClosed \?/.test(room)
    && /inboxPostId\("inbox\/conversations\/\[id\]\/ai-suggest", id, \{ systemId \}\)/.test(room) && /r\.ok === false && r\.reason\?\.trim\(\)\) \|\| t\("cust\.draft\.fail"\)/.test(room) && /busy: suggesting/.test(room) && /th\.conversation\.aiDraft && th\.conversation\.can\?\.aiSuggest !== false/.test(room) && /<LekaaFabSlot \/>/.test(room));
  chk("M-2", "ตั้งค่า: GET/PUT inbox/ai-settings · สวิตช์ cust-set-ai-suggest/translate + ภาษา cust-set-ai-lang-<code> · ปิดเมื่อ !canEdit · บรรทัดค่าใช้จ่าย",
    /"inbox\/ai-settings": "\/api\/mobile\/inbox\/ai-settings"/.test(api) && /inboxGet\("inbox\/ai-settings", \{ systemId: sid \}\)/.test(set) && /inboxPut\("inbox\/ai-settings"/.test(set) && /testID="cust-set-ai-suggest"[^\n]*disabled=\{!ai\.canEdit \|\| busy\}/.test(set) && /testID="cust-set-ai-translate"[^\n]*disabled=\{!ai\.canEdit \|\| busy\}/.test(set) && /testID=\{`cust-set-ai-lang-\$\{code\}`\}/.test(set) && /t\("cust\.ai\.cost"\)/.test(set));
  const keys = ["cust.draft.ask", "cust.draft.asking", "cust.draft.fail", "cust.ai.section", "cust.ai.suggest.title", "cust.ai.suggest.sub", "cust.ai.translate.title", "cust.ai.translate.sub", "cust.ai.lang", "cust.ai.langSub", "cust.ai.cost", "cust.ai.readOnly"];
  const miss = keys.filter((k) => !th.includes(`"${k}":`) || !en.includes(`"${k}":`));
  const custShark = [...th.matchAll(/^ {2}"cust\.[^"]+": "[^"\n]*Shark[^"\n]*",$/gm), ...en.matchAll(/^ {2}"cust\.[^"]+": "[^"\n]*Shark[^"\n]*",$/gm)].map((m) => m[0].trim().slice(0, 60));
  chk("M-3", "i18n th+en ครบทุกคีย์ใหม่ · การ์ดร่าง = \"Lekaa ร่างคำตอบ\" / \"Lekaa's draft reply\" · ไม่มีคำ Shark ในข้อความ cust.* (ชื่อแพลตฟอร์ม SHARK ตัวใหญ่ยกเว้น)",
    miss.length === 0 && th.includes(`"cust.draft.title": "Lekaa ร่างคำตอบ",`) && en.includes(`"cust.draft.title": "Lekaa's draft reply",`) && custShark.length === 0, JSON.stringify({ miss, custShark }));
  const hex = [room, set].some((s) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(s.replace(/\/\/.*$/gm, "")));
  chk("M-4", "ไม่มีสี hex/rgba ในไฟล์จอที่แก้", !hex);
}

console.log("── D: fitness ──");
{ const r = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 600_000 }); chk("D-1", "pnpm fitness = 0", r.status === 0, (r.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | ")); }
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน · ${skipped.length} ข้าม`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length ? 1 : 0);
