// S2.21+S2.22 interaction check (QC web export of /root/qc-shark-mobile-sec-d/dist · mocks from fixtures · no real server)
// รัน: cp README-click.mjs.txt <scratch>/s221-click.mjs && bash scripts/iso.sh node <scratch>/s221-click.mjs <s2.21.json> <s2.21-mgr.json> <outdir>
import puppeteer from "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { createServer } from "node:http"; import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs"; import { join, extname } from "node:path";
const DIST = "/root/qc-shark-mobile-sec-d/dist", FX = JSON.parse(readFileSync(process.argv[2], "utf8")), MG = JSON.parse(readFileSync(process.argv[3], "utf8")), OUT = process.argv[4];
mkdirSync(OUT, { recursive: true });
const PORT = 4724;
const srv = createServer((q, r) => { let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, "index.html"); r.writeHead(200, { "content-type": { ".html": "text/html", ".js": "application/javascript", ".ttf": "font/ttf", ".png": "image/png" }[extname(f)] ?? "application/octet-stream" }); r.end(readFileSync(f)); }).listen(PORT);
const UDD = `/tmp/chr-s221-${process.pid}`;
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", `--user-data-dir=${UDD}`] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
const clone = (x) => JSON.parse(JSON.stringify(x));
async function open(route, fx, over = {}, store = {}) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.setRequestInterception(true);
  await p.evaluateOnNewDocument(() => Object.defineProperty(navigator, "language", { get: () => "th-TH" }));
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
  const log = [];
  p.on("request", async (q) => { const u = new URL(q.url()); if (u.host === "shark.in.th") { if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: cors, body: "" }); const k = `${q.method()} ${u.pathname}`; const body = q.postData() ?? null; log.push({ k, q: u.search, body, tenant: q.headers()["x-tenant-id"] ?? null, t: Date.now() }); const o = over[k]; if (o) { const r = typeof o === "function" ? o(body, log) : o; if (r.delay) await sleep(r.delay); return q.respond({ status: r.status ?? 200, headers: cors, contentType: "application/json", body: JSON.stringify(r.body) }); } const bd = fx.endpoints[k]; return q.respond({ status: bd ? 200 : 404, headers: cors, contentType: "application/json", body: JSON.stringify(bd ?? { error: "x" }) }); } q.continue(); });
  await p.evaluateOnNewDocument((st) => { if (sessionStorage.getItem("qc-init")) return; sessionStorage.setItem("qc-init", "1"); localStorage.clear(); localStorage.setItem("shark_theme", "light"); if (!st.noToken) localStorage.setItem("shark_token", "qc-mock"); localStorage.setItem("shark_tenant", st.tenant ?? "t1"); }, store);
  await p.goto(`http://127.0.0.1:${PORT}` + route, { waitUntil: "networkidle0" });
  return { p, log };
}
const nth = async (p, id, i = 0) => (await p.$$(`[data-testid="${id}"]`))[i];
const count = async (p, id) => (await p.$$(`[data-testid="${id}"]`)).length;
const text = (p, id) => p.$eval(`[data-testid="${id}"]`, (e) => e.innerText).catch(() => null);
const bodies = (log, k) => log.filter((x) => x.k === k).map((x) => x.body);
const hits = (log, k) => log.filter((x) => x.k === k).length;
const ls = (p, k) => p.evaluate((kk) => localStorage.getItem(kk), k);
const path = (p) => new URL(p.url()).pathname;
const clear = async (p, id) => { const f = await p.$(`[data-testid="${id}"]`); await f.click({ clickCount: 3 }); await p.keyboard.press("Backspace"); };
const step = async (name, fn) => { try { await fn(); } catch (e) { res[name + "_ERROR"] = String(e).slice(0, 300); } };
try {
  // ── G1: กิจการที่ 2 (มีร้านแล้ว) ⇒ POST tenants/create {name,type,systems} ⇒ switchTenant ⇒ ห้องแรก ──
  await step("g1Second", async () => { let created = false; const me = clone(FX.endpoints["GET /api/mobile/me"]);
    const { p, log } = await open("/business/new", FX, { "GET /api/mobile/me": () => ({ body: created ? { ...me, memberships: [...me.memberships, { tenantId: "t4", name: "QC ใหม่", role: "OWNER", branding: null }] } : me }), "POST /api/mobile/secretary/tenants/create": () => { created = true; return { body: FX.endpoints["POST /api/mobile/secretary/tenants/create"] }; } });
    await p.waitForSelector('[data-testid="biz-new-name"]'); res.g1SubmitDisabledEmpty = await p.$eval('[data-testid="biz-new-submit"]', (e) => e.getAttribute("aria-disabled"));
    await p.type('[data-testid="biz-new-name"]', "QC ใหม่"); await p.click('[data-testid="biz-new-type-service"]'); await p.click('[data-testid="biz-new-system-INVENTORY"]'); await sleep(200);
    await p.screenshot({ path: `${OUT}/g1-filled.png` }); await p.click('[data-testid="biz-new-submit"]'); await sleep(1800);
    res.g1Post = bodies(log, "POST /api/mobile/secretary/tenants/create"); res.g1PostTenantHeader = log.find((x) => x.k === "POST /api/mobile/secretary/tenants/create")?.tenant ?? null;
    res.g1ActiveTenant = await ls(p, "shark_tenant"); res.g1Url = path(p); await p.close(); });
  // ── G1: กิจการแรก (ยังไม่มีร้าน) ⇒ switchTenant ⇒ /secretary/onboarding/name ──
  await step("g1First", async () => { let created = false; const me = clone(FX.endpoints["GET /api/mobile/me"]);
    const { p, log } = await open("/business/new", FX, { "GET /api/mobile/me": () => ({ body: { ...me, memberships: created ? [{ tenantId: "t4", name: "QC แรก", role: "OWNER", branding: null }] : [] } }), "POST /api/mobile/secretary/tenants/create": () => { created = true; return { body: FX.endpoints["POST /api/mobile/secretary/tenants/create"] }; } }, { tenant: "" });
    await p.waitForSelector('[data-testid="biz-new-name"]'); res.g1FirstNoClose = (await count(p, "biz-new-close")) === 0;
    await p.type('[data-testid="biz-new-name"]', "QC แรก"); await p.click('[data-testid="biz-new-submit"]'); await sleep(2000);
    res.g1FirstPost = bodies(log, "POST /api/mobile/secretary/tenants/create"); res.g1FirstActiveTenant = await ls(p, "shark_tenant"); res.g1FirstUrl = path(p); await p.close(); });
  // ── G1: เพดาน 3 ร้าน ⇒ ข้อความไทยของเซิร์ฟเวอร์ ──
  await step("g1Cap", async () => { const { p } = await open("/business/new", FX, { "POST /api/mobile/secretary/tenants/create": { status: 400, body: { error: "invalid", message: "สร้างกิจการได้สูงสุด 3 ร้านต่อบัญชี — ถ้าต้องการเพิ่ม ติดต่อทีมงาน" } } });
    await p.waitForSelector('[data-testid="biz-new-name"]'); await p.type('[data-testid="biz-new-name"]', "ร้านที่สี่"); await p.click('[data-testid="biz-new-submit"]'); await sleep(900);
    res.g1CapNote = await text(p, "biz-new-note"); res.g1CapUrl = path(p); await p.screenshot({ path: `${OUT}/g1-cap.png` }); await p.close(); });
  // ── หลังสมัครใหม่ (OTP signup isNew) ไม่มีร้าน ⇒ ยามพาไป /business/new (ไม่ใช่ /dna) ──
  await step("postSignup", async () => { const me = clone(FX.endpoints["GET /api/mobile/me"]); me.memberships = [];
    const { p, log } = await open("/otp?phone=0812345678&mode=signup&name=QC&email=a@qc.invalid", FX, { "GET /api/mobile/me": { body: me }, "POST /api/mobile/auth/sms/verify": { body: { token: "qc-new", isNew: true } }, "POST /api/mobile/auth/sms/request": { body: { ok: true, resendAfterSec: 60 } } }, { noToken: true });
    await p.waitForSelector('[data-testid="otp-input"]'); const inputs = await p.$$('[data-testid^="otp-input"] input, input[data-testid^="otp-input"]');
    await (inputs[0] ?? (await p.$('[data-testid="otp-input"]'))).click(); await p.keyboard.type("123456"); await sleep(2500);
    res.postSignupVerify = hits(log, "POST /api/mobile/auth/sms/verify"); res.postSignupUrl = path(p); await p.screenshot({ path: `${OUT}/post-signup-business-new.png` }); await p.close(); });
  // ── บัญชีเดิมไม่มีร้าน (ไม่ใช่เพิ่งสมัคร) ⇒ /dna ตามเดิม ──
  await step("noShopOld", async () => { const me = clone(FX.endpoints["GET /api/mobile/me"]); me.memberships = [];
    const { p } = await open("/secretary", FX, { "GET /api/mobile/me": { body: me } }, { tenant: "" }); await sleep(1500); res.noShopOldUrl = path(p); await p.close(); });

  // ── G2: ส่งคำเชิญ (ค่าเริ่มต้นทุกสาขา) ⇒ unitIds ["*"] · ปิดทุกระบบ ⇒ permissions {} ──
  await step("g2Default", async () => { const { p, log } = await open("/secretary/staff/invite", FX);
    await p.waitForSelector('[data-testid="inv-name"]'); await p.type('[data-testid="inv-name"]', "ก้อง"); await p.type('[data-testid="inv-phone"]', "0898765432"); await sleep(200);
    res.g2Sms = await text(p, "inv-sms-preview"); await p.click('[data-testid="inv-submit"]'); await sleep(1200);
    res.g2DefaultBody = bodies(log, "POST /api/mobile/secretary/staff/invite"); res.g2Result = await text(p, "inv-result"); await p.screenshot({ path: `${OUT}/g2-sent.png` }); await p.close(); });
  // ── G2: เลือกสาขา + ระดับ ⇒ unitIds ชัดเจน + คีย์ของระดับ (LevelGrid) ──
  await step("g2Levels", async () => { const { p, log } = await open("/secretary/staff/invite", FX);
    await p.waitForSelector('[data-testid="inv-level-dorm-USE"]'); res.g2LevelButtons = await p.$$eval('[data-testid^="inv-level-"][role="button"]', (es) => es.map((e) => e.getAttribute("data-testid")));
    res.g2ChatButtons = await p.$$eval('[data-testid^="inv-chat-"]', (es) => es.map((e) => e.getAttribute("data-testid")));
    await p.type('[data-testid="inv-name"]', "ก้อง"); await p.type('[data-testid="inv-phone"]', "089-876-5432"); await p.click('[data-testid="inv-unit-u-dorm"]');
    await p.click('[data-testid="inv-chat-VIEW"]'); await p.click('[data-testid="inv-level-dorm-USE"]'); await p.click('[data-testid="inv-level-booking-VIEW"]'); await sleep(200);
    await p.screenshot({ path: `${OUT}/g2-levels.png` }); await p.click('[data-testid="inv-submit"]'); await sleep(1200);
    const bd = JSON.parse(bodies(log, "POST /api/mobile/secretary/staff/invite")[0] ?? "{}"); res.g2LevelsBody = { name: bd.name, phone: bd.phone, role: bd.role, unitIds: bd.unitIds, permKeys: Object.keys(bd.permissions ?? {}).length, permSample: Object.keys(bd.permissions ?? {}).filter((k) => /^(chat|booking)\./.test(k)), anySensitive: Object.keys(bd.permissions ?? {}).filter((k) => /delete|refund|void|import|export|settings|payment|deposit|slip/i.test(k)) };
    await p.close(); });
  // ── G2: เหตุผลปฏิเสธ ⇒ ข้อความไทยของจอ ──
  for (const [reason, status] of [["rate_limited", 429], ["already_member", 409], ["already_invited", 409], ["pending_cap", 409], ["bad_permissions", 400], ["sms_unavailable", 503]]) {
    await step("g2Reason_" + reason, async () => { const { p } = await open("/secretary/staff/invite", FX, { "POST /api/mobile/secretary/staff/invite": { status, body: { error: reason, message: "server-" + reason } } });
      await p.waitForSelector('[data-testid="inv-name"]'); await p.type('[data-testid="inv-name"]', "ก้อง"); await p.type('[data-testid="inv-phone"]', "0898765432"); await p.click('[data-testid="inv-submit"]'); await sleep(900);
      (res.g2Reasons ??= {})[reason] = await text(p, "inv-note"); if (reason === "pending_cap") await p.screenshot({ path: `${OUT}/g2-reason-pending-cap.png` }); await p.close(); });
  }
  // ── G2: ส่งอีกครั้ง / ยกเลิก (ยืนยัน) ──
  await step("g2Pending", async () => { const { p, log } = await open("/secretary/staff/invite", FX); await p.waitForSelector('[data-testid="inv-resend"]');
    await p.click('[data-testid="inv-resend"]'); await sleep(900); res.g2Resend = bodies(log, "POST /api/mobile/secretary/staff/invites/inv1/resend"); res.g2ResendNote = await text(p, "inv-note");
    await p.click('[data-testid="inv-cancel"]'); await p.waitForSelector('[data-testid="inv-cancel-sheet-ok"]'); res.g2CancelBefore = hits(log, "DELETE /api/mobile/secretary/staff/invites/inv1");
    await p.screenshot({ path: `${OUT}/g2-cancel-confirm.png` }); await p.click('[data-testid="inv-cancel-sheet-ok"]'); await sleep(900); res.g2CancelAfter = hits(log, "DELETE /api/mobile/secretary/staff/invites/inv1"); await p.close(); });
  // ── G2 ผู้จัดการ: บทบาทให้เลือกแค่พนักงาน ──
  await step("g2Manager", async () => { const { p } = await open("/secretary/staff/invite", MG); await p.waitForSelector('[data-testid="inv-role"]');
    res.g2MgrRoles = await p.$$eval('[data-testid^="inv-role-"]', (es) => es.map((e) => e.getAttribute("data-testid"))); await p.close(); });

  // ── G3: ระดับที่มีเท่านั้น · โมดูล OFF-only ล็อก · แชท 3 ระดับ · PUT เฉพาะที่แก้ ──
  await step("g3Save", async () => { const fx = clone(FX); fx.endpoints["GET /api/mobile/secretary/access"].items.push({ module: "point", level: "OFF" });
    const { p, log } = await open("/secretary/staff/m1", fx); await p.waitForSelector('[data-testid="perm-level-dorm-USE"]');
    res.g3Buttons = await p.$$eval('[data-testid^="perm-level-"][role="button"]', (es) => es.map((e) => e.getAttribute("data-testid")));
    res.g3PointLocked = await count(p, "perm-level-point-locked"); res.g3Chat = await p.$$eval('[data-testid^="perm-chat-"]', (es) => es.map((e) => e.getAttribute("data-testid")));
    res.g3SaveDisabledClean = await p.$eval('[data-testid="perm-save"]', (e) => e.getAttribute("aria-disabled"));
    await p.click('[data-testid="perm-chat-VIEW"]'); await p.click('[data-testid="perm-level-dorm-VIEW"]'); await sleep(200); await p.screenshot({ path: `${OUT}/g3-edited.png` });
    await p.click('[data-testid="perm-save"]'); await sleep(1200); res.g3Put = bodies(log, "PUT /api/mobile/secretary/staff/m1"); res.g3Note = await text(p, "perm-note"); await p.close(); });
  await step("g3Suspend", async () => { const { p, log } = await open("/secretary/staff", FX); await p.waitForSelector('[data-testid="sec-staff-row"]'); await p.goto(`http://127.0.0.1:${PORT}/secretary/staff/m1`, { waitUntil: "networkidle0" });
    await p.waitForSelector('[data-testid="perm-suspend"]'); await p.click('[data-testid="perm-suspend"]'); await p.waitForSelector('[data-testid="perm-confirm-ok"]');
    res.g3SuspendBefore = hits(log, "POST /api/mobile/secretary/staff/m1/suspend"); res.g3SuspendSheet = await text(p, "perm-confirm"); await p.screenshot({ path: `${OUT}/g3-suspend-confirm.png` });
    await p.click('[data-testid="perm-confirm-ok"]'); await sleep(1200); res.g3SuspendAfter = bodies(log, "POST /api/mobile/secretary/staff/m1/suspend"); res.g3SuspendUrl = path(p); await p.close(); });
  await step("g3Remove", async () => { const { p, log } = await open("/secretary/staff/m1", FX); await p.waitForSelector('[data-testid="perm-remove"]'); await p.click('[data-testid="perm-remove"]'); await p.waitForSelector('[data-testid="perm-confirm-no"]');
    await p.click('[data-testid="perm-confirm-no"]'); await sleep(300); res.g3RemoveAfterNo = hits(log, "POST /api/mobile/secretary/staff/m1/remove");
    await p.click('[data-testid="perm-remove"]'); await p.waitForSelector('[data-testid="perm-confirm-ok"]'); await p.click('[data-testid="perm-confirm-ok"]'); await sleep(1000); res.g3RemoveAfterOk = hits(log, "POST /api/mobile/secretary/staff/m1/remove"); await p.close(); });
  await step("g3Refused", async () => { const { p } = await open("/secretary/staff/m1", FX, { "PUT /api/mobile/secretary/staff/m1": { status: 400, body: { error: "refused", message: "ระดับนี้ไม่มีในระบบนี้ — เลือก ปิด / ดู / ใช้งาน ตามที่หน้าจอแสดง" } } });
    await p.waitForSelector('[data-testid="perm-level-dorm-VIEW"]'); await p.click('[data-testid="perm-level-dorm-VIEW"]'); await p.click('[data-testid="perm-save"]'); await sleep(900); res.g3RefusedNote = await text(p, "perm-note"); await p.close(); });
  await step("g3Manager", async () => { const { p, log } = await open("/secretary/staff/m2", MG); await p.waitForSelector('[data-testid="perm-role"]'); await sleep(600);
    res.g3MgrOnManager = { readonly: await count(p, "perm-readonly"), save: await count(p, "perm-save"), suspend: await count(p, "perm-suspend"), remove: await count(p, "perm-remove") }; await p.screenshot({ path: `${OUT}/g3-manager-on-manager.png` }); await p.close();
    const o = await open("/secretary/staff/m1", MG); await o.p.waitForSelector('[data-testid="perm-role"]'); await sleep(600);
    res.g3MgrOnStaff = { roles: await o.p.$$eval('[data-testid^="perm-role-"]', (es) => es.map((e) => e.getAttribute("data-testid"))), save: await count(o.p, "perm-save"), suspend: await count(o.p, "perm-suspend") }; await o.p.close(); void log; });

  // ── การ์ดคำเชิญของตัวเอง ⇒ POST invites/accept ⇒ สลับร้าน ⇒ /secretary ──
  await step("received", async () => { let accepted = false; const me = clone(FX.endpoints["GET /api/mobile/me"]);
    const { p, log } = await open("/secretary/settings/account", FX, { "GET /api/mobile/secretary/invites/pending": () => ({ body: { items: accepted ? [] : [{ inviteId: "rinv1", tenantName: "ร้านเพื่อน QC", role: "STAFF", expiresAt: "2026-11-11T05:00:00.000Z" }] } }), "POST /api/mobile/secretary/invites/accept": () => { accepted = true; return { body: { ok: true, tenantId: "t5" } }; }, "GET /api/mobile/me": () => ({ body: accepted ? { ...me, memberships: [...me.memberships, { tenantId: "t5", name: "ร้านเพื่อน QC", role: "STAFF", branding: null }] } : me }) });
    await p.waitForSelector('[data-testid="acct-received-card"]'); res.recvCard = await text(p, "acct-received-card"); await p.screenshot({ path: `${OUT}/received-invite-card.png` });
    await p.click('[data-testid="acct-received-accept"]'); await sleep(1800); res.recvPost = bodies(log, "POST /api/mobile/secretary/invites/accept"); res.recvPostTenantHeader = log.find((x) => x.k === "POST /api/mobile/secretary/invites/accept")?.tenant ?? null; res.recvActive = await ls(p, "shark_tenant"); res.recvUrl = path(p); await p.close(); });

  // ── G4: ธีม · แจ้งเตือน · เวร · ลบบัญชี ──
  await step("g4Theme", async () => { const { p } = await open("/secretary/settings/account", FX); await p.waitForSelector('[data-testid="acct-theme-dark"]');
    await p.click('[data-testid="acct-theme-dark"]'); await sleep(500); res.g4ThemeStored = await ls(p, "shark_theme"); await p.screenshot({ path: `${OUT}/g4-theme-dark.png` });
    await p.reload({ waitUntil: "networkidle0" }); await p.waitForSelector('[data-testid="acct-theme-dark"]'); res.g4ThemeAfterReload = await p.$eval('[data-testid="acct-theme-dark"]', (e) => e.getAttribute("aria-selected")); res.g4ThemeStoredAfterReload = await ls(p, "shark_theme"); await p.close(); });
  await step("g4Notify", async () => { const { p, log } = await open("/secretary/settings/account", FX, { "PUT /api/mobile/secretary/notify": (body) => ({ body: { prefs: { inbox: "OFF", approval: "ALL", room: "ALL", help: "ALL" }, scope: "tenant", echo: body } }) });
    await p.waitForSelector('[data-testid="acct-notify"]'); res.g4NotifyGet = hits(log, "GET /api/mobile/secretary/notify"); await p.click('[data-testid="acct-notify"]'); await p.waitForSelector('[data-testid="acct-notify-inbox-OFF"]');
    await p.click('[data-testid="acct-notify-inbox-OFF"]'); await sleep(800); res.g4NotifyPut = bodies(log, "PUT /api/mobile/secretary/notify"); await p.screenshot({ path: `${OUT}/g4-notify-sheet.png` });
    await p.click('[data-testid="acct-notify-sheet-dim"]'); await sleep(300); res.g4NotifySummary = await text(p, "acct-notify"); await p.close(); });
  await step("g4Shift", async () => { const { p, log } = await open("/secretary/settings/account", FX); await p.waitForSelector('[data-testid="acct-shift-toggle"]'); await sleep(500);
    res.g4ShiftBefore = await p.$eval('[data-testid="acct-shift-toggle"]', (e) => e.getAttribute("aria-checked")); await p.click('[data-testid="acct-shift-toggle"]'); await sleep(800);
    res.g4ShiftPost = bodies(log, "POST /api/mobile/inbox/shift"); res.g4ShiftAfter = await p.$eval('[data-testid="acct-shift-toggle"]', (e) => e.getAttribute("aria-checked")); res.g4ShiftText = await text(p, "acct-shift"); await p.close(); });
  await step("g4Delete", async () => { const { p, log } = await open("/secretary/settings/account", FX); await p.waitForSelector('[data-testid="acct-delete"]');
    await p.click('[data-testid="acct-delete"]'); await p.waitForSelector('[data-testid="acct-delete-input"]'); await sleep(700);
    res.g4DelPreviewGet = hits(log, "GET /api/mobile/secretary/account/delete/preview"); res.g4DelPreview = await text(p, "acct-delete-preview");
    res.g4DelDisabledBefore = await p.$eval('[data-testid="acct-delete-confirm"]', (e) => e.getAttribute("aria-disabled"));
    await p.type('[data-testid="acct-delete-input"]', "ลบ"); await sleep(200); res.g4DelDisabledPartial = await p.$eval('[data-testid="acct-delete-confirm"]', (e) => e.getAttribute("aria-disabled"));
    await p.click('[data-testid="acct-delete-confirm"]'); await sleep(300); res.g4DelPostAfterPartial = hits(log, "POST /api/mobile/secretary/account/delete");
    await p.type('[data-testid="acct-delete-input"]', "บัญชี"); await sleep(200); await p.screenshot({ path: `${OUT}/g4-delete-typed.png` });
    await p.click('[data-testid="acct-delete-confirm"]'); await sleep(2000); res.g4DelPost = bodies(log, "POST /api/mobile/secretary/account/delete"); res.g4DelPostTenantHeader = log.find((x) => x.k === "POST /api/mobile/secretary/account/delete")?.tenant ?? null;
    res.g4DelLogout = hits(log, "POST /api/mobile/auth/logout"); res.g4DelToken = await ls(p, "shark_token"); res.g4DelUrl = path(p); await p.close(); });
  await step("g4Logout2step", async () => { const { p, log } = await open("/secretary/settings/account", FX); await p.waitForSelector('[data-testid="acct-logout"]');
    await p.click('[data-testid="acct-logout"]'); await sleep(300); res.g4Logout1 = { posts: hits(log, "POST /api/mobile/auth/logout"), label: await text(p, "acct-logout") }; await p.click('[data-testid="acct-logout"]'); await sleep(1200); res.g4Logout2 = { posts: hits(log, "POST /api/mobile/auth/logout"), url: path(p) }; await p.close(); });
  await step("g4PendingEmail", async () => { const { p } = await open("/secretary/settings/account", MG); await p.waitForSelector('[data-testid="acct-email"]'); await sleep(400); res.g4MgrEmail = await text(p, "acct-email"); res.g4MgrApple = await text(p, "acct-apple"); await p.close(); });
} finally {
  writeFileSync(`${OUT}/result.json`, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
  await b.close(); srv.close();
}
