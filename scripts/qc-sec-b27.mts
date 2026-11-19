// QC — B27-FAB (17 พ.ย. 2026) · แถบบน topbar2 ลำดับระบบต่อคน + Lekaa FAB (page context · ลบห้อง · ปิดการชวนคน · ปฏิเสธจากกล่องอนุมัติ)
// เรียก handler ตรง (แบบ qc-sec-s1.14) บนฐาน QC เลขาเท่านั้น
//
// กลุ่มข้อ:
//   O  GET secretary/systems `order` + PUT secretary/systems/order — ค่าเริ่ม (home + ทะเบียน) · บันทึก · คีย์แปลก/ของร้านอื่นถูกตัด ·
//      ระบบเปิดใหม่ต่อท้าย · ระบบที่ปิดแล้วหายจากลำดับ · ต่อคน (เจ้าของ/พนักงานแยกกัน) · ร้านอื่นเขียนไม่ได้/ไม่ทับกัน · body ผิด 400 · prefs คีย์อื่นไม่หาย
//   P  page context: pure (applyPageMarkers/answerPageContext) · POST rooms เก็บป้ายที่เซิร์ฟเวอร์สร้าง · entity ร้านอื่นถูกทิ้ง ·
//      POST rooms/[id]/page-context: ยังไม่ถาม 409 · ASKED ⇒ yes 200 CONFIRMED + ข้อความ "ใช่ <ป้าย>" · ตอบซ้ำ 409
//   K  ลบห้อง (DELETE rooms/[id]): คนอื่น 404 · ผู้เปิด 200 · หายจากรายการ · ข้อเสนอ/แผน PENDING ⇒ REJECTED (เจ้าของตัดสินแล้ว 15 พ.ย.)
//   M  ปิดการชวนคน: POST rooms/[id]/members ⇒ 403 forbidden ข้อความไทย · ไม่มีแถว
//   V  OWNER ปฏิเสธข้อเสนอในห้องของ staff ได้ (canActOnApproval) แม้อ่านห้องไม่ได้ · STAFF คนอื่นไม่ได้
//   O-9..O-13 (17 พ.ย. เจ้าของสั่งจากเครื่องจริง: ทีม/ปฏิทิน จัดลำดับได้ · เว้นที่เหนือแถวแรก): "team" "calendar" เป็นคีย์ที่ถูกต้อง ·
//      ลำดับที่ไม่มี 2 คีย์นี้ ⇒ ขึ้นหน้าสุด ทีม → ปฏิทิน · items ไม่มี 2 ช่องนี้ (แอปรุ่นเก่าไม่เห็นซ้ำ) · ต่อคน
//      (O-1..O-6 เดิมเทียบส่วน "หลัง" ทีม/ปฏิทิน ด้วย core())
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-b27.mts
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-sec-b27"); // route systems → inbox/_shared import lib/env ตอนโหลด (SESSION_SECRET ฯลฯ) — โหลดจาก QC_ENV_FILE (.env.qc-sec) ไม่พิมพ์ค่า
const LABEL = "qc-sec-b27";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SHARK_AI_MOCK = "1";
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const { prisma } = await import("@/lib/core/db");
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;
const J = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const P = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const jsonOf = async (r: Response) => { try { return (await r.json()) as Record<string, unknown>; } catch { return {}; } };
const mods: Record<string, Record<string, Handler>> = {};
const call = async (p: string, method: string, body: unknown, headers: Record<string, string>, params: Record<string, string> = {}) => {
  const m = (mods[p] ??= (await import(`@/app/api/mobile/secretary/${p}/route`)) as unknown as Record<string, Handler>);
  if (typeof m[method] !== "function") return { status: 0, body: {} as Record<string, unknown> };
  const r = await m[method]!(J(`/api/mobile/secretary/${p}`, method, body, headers), P(params));
  return { status: r.status, body: await jsonOf(r) };
};

const U = { owner: "qcb27-owner", staff: "qcb27-staff", staff2: "qcb27-staff2", out: "qcb27-out" };
let tid = "", tid2 = "";
const cleanup = async () => {
  for (const t of [tid, tid2].filter(Boolean)) {
    for (const m of ["aiActionLog", "aiProposal", "aiPlan", "aiMessage", "aiRoomJob", "aiRoomMember", "aiRoom", "aiConversation", "aiJobCounter", "aiUsage", "aiCreditTxn", "aiCreditWallet", "aiSystemAccess", "aiApprovalRule", "appNotification", "appSystemUnit", "appSystem", "businessUnit", "membership"]) { try { await (prisma as AnyMod)[m].deleteMany({ where: { tenantId: t } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: t } }); } catch (e) { console.log(`  ⚠️ cleanup tenant: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-b27-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcb27-" } } }); } catch { /* */ }
  try { await (prisma as AnyMod).chatRateBucket.deleteMany({ where: { key: { startsWith: "sec:" } } }); } catch { /* */ }
};

try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC B27", slug: `qc-sec-b27-${Date.now().toString(36)}` } }); tid = t.id;
  const t2 = await prisma.tenant.create({ data: { name: "QC SEC B27 อื่น", slug: `qc-sec-b27-o-${Date.now().toString(36)}` } }); tid2 = t2.id;
  for (const [k, id] of Object.entries(U)) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: `ผู้ใช้ ${k}`, prefs: k === "owner" ? { kanbanShortcuts: false } : {} } });
  const perms = { "ai.chat.send": true };
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff, role: "STAFF", unitAccess: ["*"], permissions: perms as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.staff2, role: "STAFF", unitAccess: ["*"], permissions: perms as never, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { tenantId: tid2, userId: U.out, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const auth = await import("@/lib/mobile/auth");
  const tok = async (uid: string) => (await auth.issueMobileToken(uid)).token;
  const H = { authorization: `Bearer ${await tok(U.owner)}`, "x-tenant-id": tid };
  const HS = { authorization: `Bearer ${await tok(U.staff)}`, "x-tenant-id": tid };
  const HS2 = { authorization: `Bearer ${await tok(U.staff2)}`, "x-tenant-id": tid };
  const outTok = await tok(U.out);
  const HO = { authorization: `Bearer ${outTok}`, "x-tenant-id": tid }; // คนนอกชี้ร้าน a
  const HO2 = { authorization: `Bearer ${outTok}`, "x-tenant-id": tid2 }; // เจ้าของร้าน b ในร้านตัวเอง

  // ═══════════════ O. ลำดับระบบบนแถบบน ═══════════════
  console.log("── O: systems order ──");
  const sA = await prisma.appSystem.create({ data: { tenantId: tid, type: "ACCOUNT", name: "บัญชี" } });
  await new Promise((r) => setTimeout(r, 5));
  const sC = await prisma.appSystem.create({ data: { tenantId: tid, type: "CRM", name: "CRM" } });
  await new Promise((r) => setTimeout(r, 5));
  const sK = await prisma.appSystem.create({ data: { tenantId: tid, type: "KANBAN", name: "บอร์ดงาน" } });
  const sOther = await prisma.appSystem.create({ data: { tenantId: tid2, type: "CRM", name: "CRM ร้าน b" } });
  const kA = `s-${sA.id}`, kC = `s-${sC.id}`, kK = `s-${sK.id}`;
  const FRONT = ["team", "calendar"];
  const core = (o: unknown) => ((o ?? []) as string[]).filter((k) => !FRONT.includes(k)); // ลำดับไม่นับทีม/ปฏิทิน (O-1..O-6 เดิม)
  const g0 = await call("systems", "GET", undefined, H);
  const ordF = (g0.body.order ?? []) as string[];
  const ord0 = core(ordF);
  const items0 = ((g0.body.items ?? []) as { key: string }[]).map((x) => x.key);
  chk("O-9", "ค่าเริ่ม (ไม่เคยบันทึก): order = ทีม ปฏิทิน หน้าหลัก แล้วตามทะเบียน · items ไม่มี team/calendar/home (wire เดิมของแอปรุ่นเก่า)", g0.status === 200 && ordF[0] === "team" && ordF[1] === "calendar" && ordF[2] === "home" && !items0.some((k) => ["team", "calendar", "home"].includes(k)), JSON.stringify(ordF.slice(0, 4)));
  chk("O-1", "ค่าเริ่ม: order = home ก่อน แล้วตามทะเบียน (ระบบเรียงตามที่สร้าง แล้วหน้า fixed) · items ไม่มี home และเรียงเหมือน order", g0.status === 200 && ord0[0] === "home" && ord0[1] === kA && ord0[2] === kC && ord0[3] === kK && ord0.includes("fp-KB") && JSON.stringify(items0) === JSON.stringify(ord0.filter((k) => k !== "home")), JSON.stringify({ s: g0.status, ord0 }).slice(0, 240));

  const want = [kK, "home", kA];
  const p1 = await call("systems/order", "PUT", { keys: want }, H);
  const g1 = await call("systems", "GET", undefined, H);
  const ord1F = (g1.body.order ?? []) as string[];
  const ord1 = core(ord1F);
  const items1 = ((g1.body.items ?? []) as { key: string }[]).map((x) => x.key);
  chk("O-2", "บันทึก [บอร์ด, home, บัญชี] ⇒ 200 · GET order ขึ้นต้นตามนั้น แล้วที่เหลือต่อท้ายตามทะเบียน · items เรียงตาม (ไม่มี home)", p1.status === 200 && JSON.stringify(p1.body.order) === JSON.stringify(ord1F) && ord1[0] === kK && ord1[1] === "home" && ord1[2] === kA && ord1[3] === kC && JSON.stringify(items1) === JSON.stringify(ord1.filter((k) => k !== "home")), JSON.stringify({ p1: p1.status, ord1 }).slice(0, 240));

  chk("O-10", "บันทึกลำดับเก่าที่ไม่มีทีม/ปฏิทิน (ผู้ใช้เดิม/แอปรุ่นเก่า) ⇒ ทีม ปฏิทิน ขึ้นหน้าสุด แล้วตามที่บันทึก", ord1F[0] === "team" && ord1F[1] === "calendar" && ord1F[2] === kK && ord1F[3] === "home", JSON.stringify(ord1F.slice(0, 5)));
  const p2 = await call("systems/order", "PUT", { keys: ["zz-bogus", `s-${sOther.id}`, kC, "home"] }, H);
  const rawPrefs = ((await prisma.user.findUnique({ where: { id: U.owner }, select: { prefs: true } }))?.prefs ?? {}) as AnyMod;
  const stored = core(rawPrefs.secSystemOrder?.[tid]);
  chk("O-3", "คีย์แปลก/ระบบของร้านอื่นถูกตัด (ไม่เก็บ · ไม่คืน) · ที่เหลือเรียงตามที่ส่ง · prefs คีย์อื่น (kanbanShortcuts) ไม่หาย", p2.status === 200 && !stored.includes("zz-bogus") && !stored.includes(`s-${sOther.id}`) && stored[0] === kC && stored[1] === "home" && !((p2.body.order ?? []) as string[]).includes("zz-bogus") && rawPrefs.kanbanShortcuts === false, JSON.stringify({ p2: p2.status, stored, ks: rawPrefs.kanbanShortcuts }).slice(0, 240));

  const sNew = await prisma.appSystem.create({ data: { tenantId: tid, type: "MEMBER", name: "สมาชิก" } });
  await prisma.appSystem.update({ where: { id: sA.id }, data: { active: false } });
  const g2 = await call("systems", "GET", undefined, H);
  const ord2 = core(g2.body.order);
  chk("O-4", "ระบบที่เปิดใหม่ (ยังไม่อยู่ในลำดับ) ต่อท้ายตามทะเบียน · ระบบที่ปิดแล้ว (คีย์ยังอยู่ในลำดับที่บันทึก) ไม่โผล่", ord2[0] === kC && ord2[1] === "home" && ord2.includes(`s-${sNew.id}`) && ord2.indexOf(`s-${sNew.id}`) > ord2.indexOf(kK) && !ord2.includes(kA), JSON.stringify(ord2).slice(0, 240));
  await prisma.appSystem.update({ where: { id: sA.id }, data: { active: true } });

  const gS = await call("systems", "GET", undefined, HS);
  const ordS = core(gS.body.order);
  const pS = await call("systems/order", "PUT", { keys: [kA] }, HS);
  const gO = await call("systems", "GET", undefined, H);
  const gS2 = await call("systems", "GET", undefined, HS2);
  chk("O-5", "ต่อคน: staff เห็นลำดับเริ่มต้น (ไม่ใช่ของเจ้าของ) · staff บันทึกของตัวเอง ⇒ เจ้าของยังเป็นลำดับเดิม · staff2 ยังเป็นค่าเริ่ม", gS.status === 200 && ordS[0] === "home" && ordS[1] === kA && pS.status === 200 && core(gO.body.order)[0] === kC && core(gS2.body.order)[0] === "home", JSON.stringify({ ordS: ordS.slice(0, 3), o: core(gO.body.order).slice(0, 2), s2: core(gS2.body.order).slice(0, 2) }));

  const xO = await call("systems/order", "PUT", { keys: [kK] }, HO);
  const xG = await call("systems", "GET", undefined, HO);
  const pB = await call("systems/order", "PUT", { keys: [`s-${sOther.id}`, kK] }, HO2);
  const outPrefs = ((await prisma.user.findUnique({ where: { id: U.out }, select: { prefs: true } }))?.prefs ?? {}) as AnyMod;
  const gO2 = await call("systems", "GET", undefined, H);
  chk("O-6", "คนนอกชี้ร้าน a ⇒ PUT/GET 403/404 · เจ้าของร้าน b บันทึกในร้านตัวเอง ⇒ เก็บใต้ tid2 เท่านั้น (คีย์ร้าน a ถูกตัด) · ร้าน a ไม่เปลี่ยน", [403, 404].includes(xO.status) && [403, 404].includes(xG.status) && pB.status === 200 && !outPrefs.secSystemOrder?.[tid] && core(outPrefs.secSystemOrder?.[tid2])[0] === `s-${sOther.id}` && !(outPrefs.secSystemOrder?.[tid2] ?? []).includes(kK) && core(gO2.body.order)[0] === kC, JSON.stringify({ xO: xO.status, xG: xG.status, pB: pB.status, out: outPrefs.secSystemOrder }).slice(0, 240));

  // ── ทีม/ปฏิทิน (17 พ.ย.) ──
  const w1 = await call("systems/order", "PUT", { keys: [kK, "calendar", "TEAM", "teams", "home", "team"] }, H);
  const w1g = await call("systems", "GET", undefined, H);
  const w1o = (w1g.body.order ?? []) as string[];
  const w1s = ((await prisma.user.findUnique({ where: { id: U.owner }, select: { prefs: true } }))?.prefs as AnyMod)?.secSystemOrder?.[tid] as string[] | undefined;
  const w1i = ((w1g.body.items ?? []) as { key: string }[]).map((x) => x.key);
  chk("O-11", "team/calendar รับเป็นคีย์ที่ถูกต้อง (วางกลาง/ท้ายได้ · เก็บ · GET คืนตามนั้น) · คีย์คล้าย (TEAM/teams) ถูกตัด · items ยังไม่มี 2 ช่องนี้", w1.status === 200 && JSON.stringify(w1o.slice(0, 4)) === JSON.stringify([kK, "calendar", "home", "team"]) && JSON.stringify((w1s ?? []).slice(0, 4)) === JSON.stringify([kK, "calendar", "home", "team"]) && !w1o.includes("TEAM") && !w1o.includes("teams") && !(w1s ?? []).includes("teams") && !w1i.includes("team") && !w1i.includes("calendar"), JSON.stringify({ s: w1.status, w1o: w1o.slice(0, 5), w1s: (w1s ?? []).slice(0, 5) }).slice(0, 240));
  const w2 = await call("systems/order", "PUT", { keys: [kC, "team", "home"] }, H);
  chk("O-12", "ลำดับที่มีทีมแต่ไม่มีปฏิทิน ⇒ ปฏิทินขึ้นหน้าสุดตัวเดียว ทีมอยู่ที่ผู้ใช้วาง", w2.status === 200 && JSON.stringify(((w2.body.order ?? []) as string[]).slice(0, 4)) === JSON.stringify(["calendar", kC, "team", "home"]), JSON.stringify(((w2.body.order ?? []) as string[]).slice(0, 5)));
  const w3 = await call("systems/order", "PUT", { keys: ["home", "calendar", "team"] }, HS2);
  const w3o = core((await call("systems", "GET", undefined, H)).body.order);
  const w3s = (await call("systems", "GET", undefined, HS)).body.order as string[];
  const w3f = (await call("systems", "GET", undefined, H)).body.order as string[];
  chk("O-13", "ต่อคน: staff2 วางทีม/ปฏิทินท้าย ⇒ ของ staff2 เท่านั้น · เจ้าของยังเป็น [ปฏิทิน, CRM, ทีม, …] · staff ยังมีทีม ปฏิทิน หน้าสุด", w3.status === 200 && JSON.stringify(((w3.body.order ?? []) as string[]).slice(0, 3)) === JSON.stringify(["home", "calendar", "team"]) && w3f[0] === "calendar" && w3f[2] === "team" && w3o[0] === kC && w3s[0] === "team" && w3s[1] === "calendar", JSON.stringify({ w3: ((w3.body.order ?? []) as string[]).slice(0, 3), o: w3f.slice(0, 3), s: w3s.slice(0, 3) }));

  const b1 = await call("systems/order", "PUT", { keys: "home" }, H);
  const b2 = await call("systems/order", "PUT", { keys: ["home"], extra: 1 }, H);
  const b3 = await call("systems/order", "PUT", { keys: Array.from({ length: 201 }, (_, i) => `k${i}`) }, H);
  const b4 = await call("systems/order", "PUT", { keys: ["home"] }, { "x-tenant-id": tid });
  chk("O-7", "body ผิดรูป/คีย์เกิน/ช่องเกิน 200 ⇒ 400 · ไม่มี Bearer ⇒ 401", b1.status === 400 && b2.status === 400 && b3.status === 400 && b4.status === 401, JSON.stringify({ b1: b1.status, b2: b2.status, b3: b3.status, b4: b4.status }));
  const nav = await import("@/lib/core/nav-systems");
  chk("O-8", "orderNavKeys (pure): ซ้ำตัดทิ้ง · คีย์ที่ไม่มีไม่สน · ที่ขาดต่อท้ายตามทะเบียน", JSON.stringify(nav.orderNavKeys(["home", "a", "b", "c"], ["c", "x", "c", "home"])) === JSON.stringify(["c", "home", "a", "b"]), "");
  chk("O-14", "orderNavKeys (pure · กติกาเดียวกับ fullOrder ของแอป): ทีม/ปฏิทินที่ขาด ⇒ หน้าสุดตามลำดับ front · ที่บันทึกไว้ = อยู่ที่เดิม · ไม่บันทึกเลย = ทะเบียน", JSON.stringify(nav.orderNavKeys(["team", "calendar", "home", "a", "b"], ["b", "calendar", "home"])) === JSON.stringify(["team", "b", "calendar", "home", "a"]) && JSON.stringify(nav.orderNavKeys(["team", "calendar", "home", "a"], ["a", "home"])) === JSON.stringify(["team", "calendar", "a", "home"]) && JSON.stringify(nav.orderNavKeys(["team", "calendar", "home", "a"], [])) === JSON.stringify(["team", "calendar", "home", "a"]), "");

  // ═══════════════ P. page context ═══════════════
  console.log("── P: page context ──");
  const pc = await import("@/lib/ai/secretary/page-context");
  const base = { v: 1, system: null, systemId: null, systemName: null, path: null, title: null, route: "secretary/calendar", entity: null, label: "ปฏิทินวันที่ 20 พ.ย.", state: "PENDING", askId: null, refIds: [] };
  const mA = pc.applyPageMarkers("หมายถึงวันนี้ใช่ไหม ⟦ask⟧", base, "m1");
  const mR = pc.applyPageMarkers("เรียบร้อย ⟦ref⟧", { ...base, state: "CONFIRMED" }, "m2");
  const mX = pc.applyPageMarkers("ไม่เกี่ยว ⟦ref⟧", { ...base, state: "REJECTED" }, "m3");
  const aN = pc.answerPageContext(base, true), aY = pc.answerPageContext({ ...base, state: "ASKED", askId: "m1" }, false);
  chk("P-1", "applyPageMarkers: ⟦ask⟧ ⇒ ASKED+askId ตัดเครื่องหมาย · ⟦ref⟧ ⇒ refIds · REJECTED ไม่เปลี่ยน · answerPageContext: ไม่ได้ถาม ⇒ not_asked · ASKED+no ⇒ REJECTED", mA.text === "หมายถึงวันนี้ใช่ไหม" && mA.next?.state === "ASKED" && mA.next?.askId === "m1" && mR.text === "เรียบร้อย" && JSON.stringify(mR.next?.refIds) === '["m2"]' && mX.next === null && mX.text === "ไม่เกี่ยว" && aN.ok === false && aY.ok === true && aY.next.state === "REJECTED", JSON.stringify({ mA, mR: mR.next?.refIds, aN }).slice(0, 240));

  const otherMem = await prisma.membership.findFirst({ where: { tenantId: tid2 }, select: { id: true } });
  const r1 = await call("rooms", "POST", { instruction: "เตือนเรื่องนี้หน่อย", pageContext: { route: "secretary/calendar", entity: { type: "CAL_DAY", id: "2026-11-20", label: "ป้ายปลอมจากแอป" } } }, H);
  const room1 = await prisma.aiRoom.findUnique({ where: { id: String(r1.body.roomId ?? "") }, select: { pageContext: true } });
  const r2 = await call("rooms", "POST", { instruction: "ดูพนักงานคนนี้", pageContext: { route: "secretary/staff/[membershipId]", entity: { type: "STAFF", id: otherMem?.id ?? "x" } } }, H);
  const room2 = await prisma.aiRoom.findUnique({ where: { id: String(r2.body.roomId ?? "") }, select: { pageContext: true } });
  const r3 = await call("rooms", "POST", { instruction: "x", pageContext: { route: "a", bogus: 1 } }, H);
  const pc1 = (room1?.pageContext ?? {}) as AnyMod, pc2 = (room2?.pageContext ?? {}) as AnyMod;
  chk("P-2", "POST rooms: ป้ายสร้างที่เซิร์ฟเวอร์ (ไม่ใช้ป้ายของแอป) state PENDING · entity ของร้านอื่น ⇒ ทิ้ง entity (ป้ายตามจอ) · ช่องแปลก ⇒ 400", r1.status === 200 && pc1.entity?.type === "CAL_DAY" && pc1.label === "ปฏิทินวันที่ 20 พ.ย." && pc1.state === "PENDING" && r2.status === 200 && pc2.entity === null && pc2.label === "ทีม" && r3.status === 400, JSON.stringify({ r1: r1.status, pc1: pc1.label, r2: r2.status, pc2: [pc2.entity, pc2.label], r3: r3.status }).slice(0, 240));

  const roomId1 = String(r1.body.roomId ?? "");
  const q0 = await call("rooms/[id]/page-context", "POST", { answer: "yes" }, H, { id: roomId1 });
  await prisma.aiRoom.update({ where: { id: roomId1 }, data: { pageContext: { ...pc1, state: "ASKED", askId: "qc-ask" } } });
  const qS = await call("rooms/[id]/page-context", "POST", { answer: "yes" }, HS, { id: roomId1 });
  const q1 = await call("rooms/[id]/page-context", "POST", { answer: "yes" }, H, { id: roomId1 });
  const after1 = ((await prisma.aiRoom.findUnique({ where: { id: roomId1 }, select: { pageContext: true } }))?.pageContext ?? {}) as AnyMod;
  const yesMsg = await prisma.aiMessage.findFirst({ where: { content: "ใช่ ปฏิทินวันที่ 20 พ.ย.", role: "USER" }, orderBy: { createdAt: "desc" } });
  const q2 = await call("rooms/[id]/page-context", "POST", { answer: "no" }, H, { id: roomId1 });
  chk("P-3", "page-context: ยังไม่ถาม ⇒ 409 not_asked · คนอื่น ⇒ 404 · ASKED + yes ⇒ 200 CONFIRMED + ข้อความ USER \"ใช่ <ป้าย>\" · ตอบซ้ำ ⇒ 409", q0.status === 409 && q0.body.error === "not_asked" && qS.status === 404 && q1.status === 200 && q1.body.state === "CONFIRMED" && after1.state === "CONFIRMED" && !!yesMsg && q2.status === 409, JSON.stringify({ q0: q0.status, qS: qS.status, q1: [q1.status, q1.body.state ?? q1.body.error], st: after1.state, msg: !!yesMsg, q2: q2.status }).slice(0, 240));

  // ═══════════════ K. ลบห้อง ═══════════════
  console.log("── K: hide room ──");
  const roomId2 = String(r2.body.roomId ?? "");
  const conv2 = (await prisma.aiRoom.findUnique({ where: { id: roomId2 }, select: { conversationId: true } }))?.conversationId ?? "";
  const prop = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: conv2, kind: "kanban_create_card", summary: "qc", payload: { title: "x" } as never, expiresAt: new Date(Date.now() + 3_600_000) } });
  const plan = await prisma.aiPlan.create({ data: { tenantId: tid, conversationId: conv2, title: "qc plan", stepsJson: [] as never, expiresAt: new Date(Date.now() + 3_600_000) } });
  const kS = await call("rooms/[id]", "DELETE", undefined, HS, { id: roomId2 });
  const kO = await call("rooms/[id]", "DELETE", undefined, H, { id: roomId2 });
  const list = await call("rooms", "GET", undefined, H);
  const kG = await call("rooms/[id]", "GET", undefined, H, { id: roomId2 });
  const propAfter = await prisma.aiProposal.findUnique({ where: { id: prop.id }, select: { status: true } });
  const planAfter = await prisma.aiPlan.findUnique({ where: { id: plan.id }, select: { status: true } });
  const row2 = await prisma.aiRoom.findUnique({ where: { id: roomId2 }, select: { hiddenAt: true, closedAt: true } });
  chk("K-1", "DELETE ห้อง: คนอื่น ⇒ 404 · ผู้เปิด ⇒ 200 · hiddenAt+closedAt · หายจากรายการและ GET 404 · ข้อเสนอ/แผน PENDING ⇒ REJECTED", kS.status === 404 && kO.status === 200 && !!row2?.hiddenAt && !!row2?.closedAt && !((list.body.items ?? []) as { id: string }[]).some((x) => x.id === roomId2) && kG.status === 404 && propAfter?.status === "REJECTED" && planAfter?.status === "REJECTED", JSON.stringify({ kS: kS.status, kO: kO.status, kG: kG.status, p: propAfter?.status, pl: planAfter?.status }));

  // ═══════════════ M. ปิดการชวนคน ═══════════════
  console.log("── M: add member blocked ──");
  const mAdd = await call("rooms/[id]/members", "POST", { userId: U.staff }, H, { id: roomId1 });
  const mRows = await prisma.aiRoomMember.count({ where: { roomId: roomId1 } });
  const gR = await call("rooms/[id]", "GET", undefined, H, { id: roomId1 });
  const gRoom = (gR.body.room ?? gR.body) as AnyMod;
  chk("M-1", "POST rooms/[id]/members ⇒ 403 forbidden ข้อความไทย · ไม่มีแถว · roomDto canAddMembers=false + pageContext ส่งออก", mAdd.status === 403 && mAdd.body.error === "forbidden" && thai(mAdd.body.message) && mRows === 0 && gRoom.canAddMembers === false && gRoom.pageContext?.state === "CONFIRMED", JSON.stringify({ s: mAdd.status, b: mAdd.body, mRows, cam: gRoom.canAddMembers, pcs: gRoom.pageContext?.state }).slice(0, 240));

  // ═══════════════ V. ปฏิเสธจากกล่องอนุมัติ ═══════════════
  console.log("── V: approver reject ──");
  const rS = await call("rooms", "POST", { instruction: "งานของ staff" }, HS);
  const convS = (await prisma.aiRoom.findUnique({ where: { id: String(rS.body.roomId ?? "") }, select: { conversationId: true } }))?.conversationId ?? "";
  const pS1 = await prisma.aiProposal.create({ data: { tenantId: tid, conversationId: convS, kind: "kanban_create_card", summary: "qc staff", payload: { title: "y" } as never, expiresAt: new Date(Date.now() + 3_600_000) } });
  const proposals = await import("@/lib/ai/proposals");
  const actor = (userId: string, role: "OWNER" | "STAFF") => ({ kind: "member" as const, tenantId: tid, userId, membership: { role, unitAccess: ["*"], permissions: role === "STAFF" ? perms : {} } });
  const ctxOf = (a: ReturnType<typeof actor>) => ({ tenantId: tid, actor: a });
  const gRoomO = await call("rooms/[id]", "GET", undefined, H, { id: String(rS.body.roomId ?? "") });
  const rjS2 = await proposals.rejectProposal(ctxOf(actor(U.staff2, "STAFF")) as never, pS1.id);
  const rjO = await proposals.rejectProposal(ctxOf(actor(U.owner, "OWNER")) as never, pS1.id);
  const pAfter = await prisma.aiProposal.findUnique({ where: { id: pS1.id }, select: { status: true } });
  chk("V-1", "ห้องของ staff: OWNER เปิดห้องไม่ได้ (404) แต่ปฏิเสธข้อเสนอได้ (กล่องอนุมัติ · canActOnApproval) · staff2 (ไม่เกี่ยว) ปฏิเสธไม่ได้", rS.status === 200 && gRoomO.status === 404 && rjS2 === false && rjO === true && pAfter?.status === "REJECTED", JSON.stringify({ rS: rS.status, g: gRoomO.status, rjS2, rjO, st: pAfter?.status }));
} catch (e) {
  chk("Z-1", "ไม่มี exception หลุด", false, errMsg(e));
} finally {
  await cleanup();
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: [], findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length ? 1 : 0);
