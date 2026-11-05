// QC (ใบ S2.14) — 3 สถานะของทุกจอ S2: กำลังโหลด / ว่าง / ล้ม (+ ไม่มีสิทธิ์) · fixture แยกไฟล์ต่อสถานะ · ภาพเดี่ยวต่อจอต่อสถานะ
//
//   node qc/states-sec.mjs --make   สร้าง fixture สถานะจากฐาน qc/fixtures/secretary/s2.1.json (ครบ 24 route) — คง /api/mobile/me (ตัวตน/กิจการ) ไว้เสมอ
//       s2.14-loading.json  ทุก GET อื่น หน่วง 60 วิ (__delayMs)        ⇒ จอต้องแสดงโครง/ตัวโหลด ไม่ใช่จอว่างเปล่าหรือข้อความ "ไม่มีข้อมูล"
//       s2.14-empty.json    รายการทุกชุด = [] · ตัวเลข = 0 · จอรายละเอียด (ห้อง/เรื่อง/แชท/พนักงาน) = 404  ⇒ ข้อความว่าง/ไม่พบ ที่บอกต่อว่าทำอะไรได้
//       s2.14-error.json    ทุก GET อื่น = 500                           ⇒ ข้อความล้ม/ออฟไลน์ + ทางลองใหม่ ไม่ค้างที่ตัวโหลด
//       s2.14-denied.json   ทุก GET อื่น = 403                           ⇒ ข้อความไม่มีสิทธิ์ (ไม่โทษผู้ใช้)
//   node qc/states-sec.mjs          ถ่าย 390×844 (สว่าง) ทุก route × 4 สถานะ ⇒ qc/shots-sec/s2.14-states/<สถานะ>/<route>.png + states.json
//       states.json = [{ state, route, file, errors[], unmocked[], texts }] · ok = ไม่มี pageerror · ไม่มี request ที่ไม่มี mock
//       + แผ่นรวม <สถานะ>-sheet-<n>.png (6 จอต่อแผ่น) ให้ผู้คุมดูเร็ว
// ตัวแปร: QC_COPY (ปริยาย /root/qc-shark-mobile-sec-d) · QC_PORT (4732) · ONLY_STATE=loading|empty|error|denied
// รัน: bash scripts/iso.sh env QC_COPY=/root/qc-shark-mobile-sec-d node apps/mobile/qc/states-sec.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const M = resolve(HERE, "..");
const FIX = join(M, "qc/fixtures/secretary");
const STATES = ["loading", "empty", "error", "denied"];
const R24 = ["/secretary", "/secretary/new", "/secretary/room/r1", "/secretary/inbox", "/secretary/scheduled", "/secretary/staff", "/secretary/staff/m1", "/secretary/staff/invite", "/secretary/settings", "/secretary/settings/secretary", "/secretary/settings/access", "/secretary/settings/rules", "/secretary/settings/log", "/secretary/settings/knowledge", "/secretary/settings/customers", "/secretary/settings/account", "/secretary/settings/quota", "/secretary/onboarding/name", "/secretary/help", "/secretary/help/c1", "/customers", "/customers/x1", "/customers/x1/info", "/business/new"];
const KEEP = (k) => /^(GET )?\/api\/mobile\/me$/.test(k);
/** จอรายละเอียด: "ว่าง" = ไม่พบ (404) */
const DETAIL = /\/(rooms|support\/cases|conversations|staff)\/(?!invites$)[^/]+$/;

function emptied(v) {
  if (Array.isArray(v)) return [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Array.isArray(x) ? [] : typeof x === "number" && !/max|limit|cap|pct|quota/i.test(k) ? 0 : x && typeof x === "object" ? emptied(x) : x]));
  return v;
}

if (process.argv.includes("--make")) {
  const base = JSON.parse(readFileSync(join(FIX, "s2.1.json"), "utf8"));
  for (const st of STATES) {
    const endpoints = {};
    for (const [k, v] of Object.entries(base.endpoints)) {
      const get = !/^(POST|PUT|PATCH|DELETE) /.test(k);
      if (!get || KEEP(k)) endpoints[k] = v;
      else if (st === "loading") endpoints[k] = { __delayMs: 60000, __body: v };
      else if (st === "error") endpoints[k] = { __status: 500, __body: { error: "server_error", message: "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง" } };
      else if (st === "denied") endpoints[k] = { __status: 403, __body: { error: "forbidden", message: "บัญชีนี้ยังไม่มีสิทธิ์ส่วนนี้" } };
      else endpoints[k] = DETAIL.test(k.replace(/^GET /, "")) ? { __status: 404, __body: { error: "not_found", message: "ไม่พบ" } } : emptied(v);
    }
    const fx = { _about: `S2.14 สถานะ "${st}" ของทุกจอ S2 — สร้างโดย qc/states-sec.mjs --make จาก s2.1.json (อย่าแก้มือ) · __status/__delayMs อ่านโดย qc/sec-harness.mjs เท่านั้น`, noAuth: base.noAuth ?? ["/login"], routes: R24, endpoints };
    writeFileSync(join(FIX, `s2.14-${st}.json`), JSON.stringify(fx, null, 1) + "\n");
    console.log(`s2.14-${st}.json · ${Object.keys(endpoints).length} endpoint`);
  }
  makeCases(base);
  process.exit(0);
}

/** fixture "กรณีพิเศษ" ของ qc/click-sec.mjs (ทะเบียนปุ่ม S2.14) — สถานะที่ fixture ปกติไปไม่ถึง + ทางเดิน (cases[]) ที่ click-sec เล่นตาม
 *  s2.14-cases.json       เจ้าของร้าน: ห้องงานปิดแล้ว r9 · เรื่องช่วยเหลือไม่ผูกห้อง c2 (RESOLVED) · ห้องลูกค้า x2 ยังไม่มีคนรับ · x9 Facebook หน้าต่างตอบหมด + มีข้อความเก่ากว่า ·
 *                         รายการแชทมีหน้าถัดไป · ค้นสมาชิกเจอ · คำเชิญที่ส่งถึงฉัน · สั่ง Shark ⇒ 402 โควตาหมด · เชิญซ้ำ ⇒ 409 · สร้างงานบอร์ด ⇒ 404 not_configured
 *  s2.14-cases-staff.json พนักงานที่ตอบลูกค้าไม่ได้ (inbox/systems.canReply=false) — K1/K2 ดูอย่างเดียว · G2 ไม่มีสิทธิ์เชิญ
 *  s2.14-cases-new.json   สมัครใหม่ ยังไม่มีกิจการ (memberships []) — G1 มีลิงก์ออกจากระบบ + การ์ดคำเชิญ + สร้างกิจการล้ม 409
 *  s2.14-cases-auth.json  ยังไม่เข้าระบบ: อีเมลขอรหัสได้ · ยืนยัน SMS ⇒ 404 no_account · ขอรหัสใหม่ ⇒ 503 sms_unavailable */
function makeCases(base) {
  const E = base.endpoints;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const ROUTES = R24;
  const room = clone(E["GET /api/mobile/secretary/rooms/r1"]);
  const r9 = { ...room, id: "r9", conversationId: "c-r9", title: "สรุปยอดขายเดือนตุลาคม", status: "CLOSED", closedAt: "2026-11-04T12:00:00.000Z", canManage: true };
  const x1 = clone(E["GET /api/mobile/inbox/conversations/x1"]);
  const days = (d) => new Date(Date.parse("2026-11-05T03:00:00.000Z") - d * 864e5).toISOString();
  const x9msgs = x1.messages.slice(0, 3).map((m, i) => ({ ...m, id: `m9${i}`, createdAt: days(3 - i * 0.01) }));
  const x9 = { ...x1, conversation: { ...x1.conversation, id: "x9", channel: "FACEBOOK", aiDraft: false, replyWindowEndsAt: days(2), tags: ["รอคน", "ดีล"] }, messages: x9msgs, nextBefore: `${x9msgs[0].createdAt}|m90`, linkedMember: { id: "mem1", name: "สมชาย ใจดี", phoneMasked: "081-xxx-5678" } };
  const x2 = { ...x1, conversation: { ...x1.conversation, id: "x2", assigneeUserId: null, assigneeName: null, waitingMin: 4, aiDraft: false }, nextBefore: null };
  const list = clone(E["GET /api/mobile/inbox/conversations"]);
  list.nextBefore = "2026-11-01T00:00:00.000Z|x0";
  const pending = { items: [{ inviteId: "pi1", tenantName: "ร้านข้างบ้าน (QC)", role: "STAFF", expiresAt: "2026-11-12T00:00:00.000Z" }] };
  const c1 = clone(E["GET /api/mobile/secretary/support/cases/c1"]);
  const c2 = { ...c1, case: { ...c1.case, id: "c2", caseNo: 43, status: "RESOLVED", roomId: null } };
  const fail = (status, error, message) => ({ __status: status, __body: { error, message } });
  const owner = {
    ...E,
    "GET /api/mobile/secretary/rooms/r9": r9,
    "GET /api/mobile/secretary/rooms/r9/messages": E["GET /api/mobile/secretary/rooms/r1/messages"],
    "GET /api/mobile/secretary/rooms/r9/proposals": { items: [] },
    "GET /api/mobile/inbox/conversations": list,
    "GET /api/mobile/inbox/conversations/x9": x9,
    "GET /api/mobile/inbox/conversations/x2": x2,
    "GET /api/mobile/member/search": { items: [{ id: "mem2", memberCode: "M-0002", name: "สมหญิง (QC)", phoneMasked: "089-xxx-1234" }] },
    "GET /api/mobile/secretary/invites/pending": pending,
    "GET /api/mobile/secretary/support/cases/c2": c2,
    "POST /api/mobile/secretary/support/upload": { url: "https://cdn.qc.invalid/help/a.png", name: "a.png", mimeType: "image/png", size: 1200 },
    "POST /api/mobile/secretary/rooms": fail(402, "quota_exhausted", "งานเดือนนี้ครบแพ็กแล้ว"),
    "POST /api/mobile/secretary/staff/invite": fail(409, "already_member", "เบอร์นี้เป็นพนักงานของร้านอยู่แล้ว"),
    "POST /api/mobile/inbox/conversations/x1/task": fail(404, "not_configured", "ร้านยังไม่ได้เปิด \"สร้างงานจากแชท\" — เปิดได้ที่ตั้งค่าแชทบนเว็บ"),
    "POST /api/mobile/inbox/conversations/x9/reply": fail(422, "invalid", "ช่องทางนี้ตอบได้ภายใน 24 ชม. หลังลูกค้าทักล่าสุด"),
    "GET /api/mobile/secretary/access": JSON.parse(readFileSync(join(FIX, "s2.7.json"), "utf8")).endpoints["GET /api/mobile/secretary/access"],
    "PUT /api/mobile/secretary/access": fail(422, "refused", "ระดับนี้ยังเปิดไม่ได้ในรุ่นนี้"),
  };
  const cases = [
    { fixture: "s2.2.json", route: "/secretary", path: ["sec-home-search=zzqqxx"] },
    { fixture: "s2.14-cases.json", route: "/secretary/new", path: ["sec-new-input-field=สรุปยอดขายเมื่อวาน", "sec-new-send"] },
    { fixture: "s2.14-cases.json", route: "/secretary/onboarding/name", path: ["sec-onb-name-input="] },
    { fixture: "s2.14-cases.json", route: "/secretary/settings/secretary", path: ["sec-me-name="] },
    { fixture: "s2.14-cases.json", route: "/secretary/settings/customers", path: ["sec-cust-disclosure="] },
    { fixture: "s2.14-cases.json", route: "/secretary/room/r9", path: [] },
    { fixture: "s2.14-cases.json", route: "/secretary/help/c2", path: [] },
    { fixture: "s2.14-cases.json", route: "/secretary/help?roomId=r1", path: [] },
    { fixture: "s2.14-cases.json", route: "/secretary/help", path: ["help-home-attach@file"] },
    { fixture: "s2.14-cases.json", route: "/secretary/settings/account", path: [] },
    // บันทึกระดับล้ม (422) ⇒ ข้อความ sec-access-note
    { fixture: "s2.14-cases.json", route: "/secretary/settings/access", path: ["sec-access-level-pos-READ"] },
    { fixture: "s2.14-cases.json", route: "/secretary/staff/invite", path: ["inv-phone=0212345678"] },
    { fixture: "s2.14-cases.json", route: "/customers", path: [] },
    { fixture: "s2.14-cases.json", route: "/customers/x2", path: [] },
    { fixture: "s2.14-cases.json", route: "/customers/x9", path: [] },
    { fixture: "s2.14-cases.json", route: "/customers/x9", path: ["cust-input-field=สวัสดีค่ะ", "cust-send"] },
    { fixture: "s2.14-cases.json", route: "/customers/x1", path: ["cust-attach@file"] },
    { fixture: "s2.14-cases.json", route: "/customers/x1/info", path: ["cust-info-link", "cust-info-link-search=สม", "cust-info-link-go"] },
    { fixture: "s2.14-cases.json", route: "/customers/x1/info", path: ["cust-info-ask-shark", "cust-info-ask-input=สรุปประวัติลูกค้านี้", "cust-info-ask-send"] },
    { fixture: "s2.14-cases.json", route: "/customers/x1/info", path: ["cust-info-task", "cust-info-task-send"] },
    { fixture: "s2.14-cases-staff.json", route: "/customers", path: [] },
    { fixture: "s2.14-cases-staff.json", route: "/customers/x1", path: [] },
    { fixture: "s2.14-cases-staff.json", route: "/secretary/staff/invite", path: [] },
    { fixture: "s2.14-cases-new.json", route: "/business/new", path: [] },
    { fixture: "s2.14-cases-new.json", route: "/business/new", path: ["biz-new-name=ร้านใหม่ QC", "biz-new-submit"] },
    { fixture: "s2.14-cases-auth.json", route: "/login", path: [] },
    { fixture: "s2.14-cases-auth.json", route: "/login", path: ["login-email-toggle", "login-email=qc@example.com", "login-email-request"] },
    // ส่งรหัสอีเมลอีกครั้งได้หลังนับถอยหลัง 60 วิ
    { fixture: "s2.14-cases-auth.json", route: "/login", path: ["login-email-toggle", "login-email=qc@example.com", "login-email-request", "wait:61500"] },
    { fixture: "s2.14-cases-auth.json", route: "/otp?phone=0812345678&mode=login", path: ["otp-input=123456"] },
    { fixture: "s2.14-cases-auth.json", route: "/otp?phone=0812345678&mode=signup&name=%E0%B8%81&email=a%40b.co", path: [] },
    { fixture: "s2.14-cases-auth.json", route: "/otp?phone=0812345678&mode=login&resend=1", path: ["wait:1500"] },
    { fixture: "s2.14-cases-auth.json", route: "/phone", path: [] },
    { fixture: "s2.14-cases-phone.json", route: "/phone", path: ["phone-input=0812345678", "phone-request"] },
    { fixture: "s2.14-cases-phone.json", route: "/phone", path: ["phone-input=0812345678", "phone-request", "phone-otp=123456", "wait:1500"] },
    { fixture: "s2.14-cases-phone2.json", route: "/phone", path: ["phone-input=0812345678", "phone-request", "phone-otp=123456", "wait:1000"] },
    { fixture: "s2.14-cases-auth2.json", route: "/otp?phone=0812345678&mode=login", path: ["otp-input=123456", "wait:1000"] },
    { fixture: "s2.14-cases-auth2.json", route: "/login", path: ["login-email-toggle", "login-email=qc@example.com", "login-email-request", "login-code=123456", "wait:1000"] },
    { fixture: "s2.5.json", route: "/secretary/inbox", path: ["sec-inbox-approve"] },
  ];
  const about = "S2.14 กรณีพิเศษของทะเบียนปุ่ม — สร้างโดย qc/states-sec.mjs --make จาก s2.1.json (อย่าแก้มือ) · __status อ่านโดย qc/sec-harness.mjs เท่านั้น";
  const write = (f, endpoints, extra = {}) => {
    writeFileSync(join(FIX, f), JSON.stringify({ _about: about, noAuth: base.noAuth ?? ["/login"], routes: [], ...extra, endpoints }, null, 1) + "\n");
    console.log(`${f} · ${Object.keys(endpoints).length} endpoint`);
  };
  write("s2.14-cases.json", owner, { cases });
  const me = clone(E["GET /api/mobile/me"]);
  write("s2.14-cases-staff.json", {
    ...E,
    "GET /api/mobile/me": { ...me, memberships: [{ tenantId: "t1", name: "The Bean Café", role: "STAFF", branding: null }] },
    "GET /api/mobile/inbox/systems": { ...E["GET /api/mobile/inbox/systems"], canReply: false },
    "GET /api/mobile/inbox/conversations/x1": { ...x1, conversation: { ...x1.conversation, can: { reply: false, assign: false, setStatus: false, linkCustomer: false, aiSuggest: false } } },
  });
  write("s2.14-cases-new.json", {
    ...E,
    "GET /api/mobile/me": { ...me, memberships: [] },
    "GET /api/mobile/secretary/invites/pending": pending,
    "POST /api/mobile/secretary/tenants/create": fail(409, "name_taken", "มีกิจการชื่อนี้ในบัญชีแล้ว"),
  });
  write(
    "s2.14-cases-auth.json",
    {
      "GET /api/mobile/me": { user: { id: "u-qc-new", email: "qc@example.com", pendingEmail: null, name: "ทดสอบ QC", phone: null }, memberships: [{ tenantId: "t1", name: "ร้านทดสอบ", role: "OWNER", branding: null }] },
      "POST /api/mobile/auth/otp": { ok: true },
      "POST /api/mobile/auth/verify": fail(401, "invalid_code", "รหัสไม่ถูกต้อง"),
      "POST /api/mobile/auth/sms/request": fail(503, "sms_unavailable", "ระบบส่ง SMS ขัดข้องชั่วคราว"),
      "POST /api/mobile/auth/sms/verify": fail(404, "no_account", "ยังไม่มีบัญชีของเบอร์นี้"),
      "POST /api/mobile/auth/phone/link": { ok: true, phone: "+66812345678" },
    },
    { noAuth: ["/login", "/signup", "/otp"] },
  );
  // ผูกเบอร์สำเร็จแต่โหลดบัญชีใหม่ล้ม ⇒ ปุ่มลองใหม่ (phone-retry) · me ก่อนผูก = ยังไม่มีเบอร์
  const meNoPhone = { user: { id: "u-qc-new", email: "qc@example.com", pendingEmail: null, name: "ทดสอบ QC", phone: null }, memberships: [{ tenantId: "t1", name: "ร้านทดสอบ", role: "OWNER", branding: null }] };
  write("s2.14-cases-phone.json", {
    "GET /api/mobile/me": { __afterReq: "POST /api/mobile/auth/phone/link", __body: meNoPhone, __then: { __status: 500, __body: { error: "server_error", message: "QC" } } },
    "POST /api/mobile/auth/sms/request": { ok: true, resendAfterSec: 1 },
    "POST /api/mobile/auth/phone/link": { ok: true, phone: "+66812345678" },
  });
  // ยืนยันรหัส SMS/อีเมลล้มชั่วคราว (500) ⇒ รหัสคงอยู่ · ปุ่ม "ยืนยัน" (otp-submit · login-verify) กดซ้ำได้
  write(
    "s2.14-cases-auth2.json",
    {
      "GET /api/mobile/me": meNoPhone,
      "POST /api/mobile/auth/otp": { ok: true },
      "POST /api/mobile/auth/verify": fail(500, "server_error", "ระบบขัดข้องชั่วคราว"),
      "POST /api/mobile/auth/sms/verify": fail(500, "server_error", "ระบบขัดข้องชั่วคราว"),
      "POST /api/mobile/auth/sms/request": { ok: true, resendAfterSec: 1 },
    },
    { noAuth: ["/login", "/signup", "/otp"] },
  );
  // ผูกเบอร์ล้มชั่วคราว (500) ⇒ รหัสคงอยู่ · ปุ่ม "ยืนยัน" (phone-submit) กดซ้ำได้
  write("s2.14-cases-phone2.json", {
    "GET /api/mobile/me": meNoPhone,
    "POST /api/mobile/auth/sms/request": { ok: true, resendAfterSec: 1 },
    "POST /api/mobile/auth/phone/link": fail(500, "server_error", "ระบบขัดข้องชั่วคราว"),
  });
}

const { serveDist, launch, openPage, goto } = await import("./sec-harness.mjs");
const COPY = process.env.QC_COPY ?? "/root/qc-shark-mobile-sec-d";
const PORT = Number(process.env.QC_PORT ?? 4732);
const OUT = join(M, "qc/shots-sec/s2.14-states");
const server = await serveDist(join(COPY, "dist"), PORT);
const BASE = `http://127.0.0.1:${PORT}`;
const name = (r) => r.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9_]+/g, "-") || "index";
const out = [];
/** testID สถานะที่ต้องเห็นต่อจอต่อสถานะ (regex) · null = ไม่ใช้กับจอนี้ (เหตุผลใน NA) */
const L = (p) => new RegExp(`^(${p})-loading$`);
const ER = (p) => new RegExp(`^(${p})-(error|offline)$`);
const DN = (p) => new RegExp(`^(${p})-(denied|error)$|^(${p})-gone$`);
const EX = {
  "/secretary": ["sec-home", /^sec-home-(empty|nomatch)$/],
  "/secretary/room/r1": ["sec-room", /^sec-room-gone$/],
  "/secretary/inbox": ["sec-inbox", /^sec-inbox-empty$/],
  "/secretary/scheduled": ["sec-sched", /^sec-sched-empty$/],
  "/secretary/staff": ["sec-staff", /^sec-staff-empty$/],
  "/secretary/staff/m1": ["perm", /^perm-missing$/],
  "/secretary/settings/access": ["sec-access", /^sec-access-(empty|note)$/],
  "/secretary/settings/rules": ["sec-rules", null],
  "/secretary/settings/log": ["sec-log", /^sec-log-empty$/],
  "/secretary/settings/knowledge": ["sec-know", /^sec-know-(facts|lessons)-empty$/],
  "/secretary/settings/customers": ["sec-cust|cust-set", null],
  "/secretary/settings/quota": ["sec-quota", null],
  "/secretary/settings/secretary": ["sec-me", null],
  "/secretary/help": ["help", /^help-empty$/],
  "/secretary/help/c1": ["help-case", /^help-gone$/],
  "/customers": ["cust", /^cust-empty$/],
  "/customers/x1": ["cust-room", /^cust-room-gone$/],
  "/customers/x1/info": ["cust-info", /^cust-info-gone$/],
};
const EXPECT = Object.fromEntries(Object.entries(EX).map(([r, [p, empty]]) => [r, { loading: L(p), error: ER(p), denied: DN(p), empty }]));
const FORM = "ฟอร์มกรอก/จอเมนู — ไม่มีรายการให้โหลด (ค่าที่โหลดได้แสดงเมื่อมา · ล้ม = ฟอร์มเปล่าใช้งานได้)";
const NA = {
  "/secretary/new": { loading: FORM, empty: FORM, error: FORM, denied: FORM },
  "/secretary/settings": { loading: FORM, empty: FORM, error: FORM, denied: FORM },
  "/secretary/onboarding/name": { loading: FORM, empty: FORM, error: FORM, denied: FORM },
  "/business/new": { loading: FORM, empty: FORM, error: FORM, denied: FORM },
  "/secretary/staff/invite": { loading: FORM, empty: FORM },
  "/secretary/settings/account": { loading: FORM, empty: FORM },
};
for (const r of Object.keys(NA)) EXPECT[r] = { loading: null, empty: null, error: null, denied: null, ...(EXPECT[r] ?? {}) };
for (const [r, v] of Object.entries(EX)) if (v[1] === null) { NA[r] = { ...(NA[r] ?? {}), empty: "ค่าตั้ง (ไม่มีรายการว่าง)" }; EXPECT[r].empty = null; }
EXPECT["/secretary/staff/invite"].error = /^inv-(error|denied)$/;
EXPECT["/secretary/staff/invite"].denied = /^inv-(denied|error)$/;
EXPECT["/secretary/settings/account"].error = /^acct-error$/;
// G4: 403 ของ notify/inbox ⇒ ไม่มีสิทธิ์แชท = แถวเวรขึ้น "ตอบลูกค้าไม่ได้" (ไม่ใช่ล้ม) · ข้อมูลหลักมาจาก /me
EXPECT["/secretary/settings/account"].denied = null;
NA["/secretary/settings/account"].denied = "403 ของ notify/shift = ไม่มีสิทธิ์แชท ⇒ แถวเวร \"ตอบลูกค้าไม่ได้\" · ข้อมูลบัญชีมาจาก /me (โหลดได้)";
const { browser, close } = await launch("states");
try {
  for (const st of STATES.filter((s) => !process.env.ONLY_STATE || s === process.env.ONLY_STATE)) {
    const fx = JSON.parse(readFileSync(join(FIX, `s2.14-${st}.json`), "utf8"));
    mkdirSync(join(OUT, st), { recursive: true });
    for (const route of R24) {
      const { page, log } = await openPage(browser, { base: BASE, route, fx, scale: 1 });
      await goto(page, BASE, route, { idleMs: st === "loading" ? 2500 : 15000, waitMs: st === "loading" ? 900 : 1200 });
      const file = join(OUT, st, `${name(route)}.png`);
      await page.screenshot({ path: file });
      const texts = String(await page.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
      // R-S2.14h: ok = ไม่มี pageerror/unmocked และ "เห็น testID สถานะของจอนั้นจริง" (ตาราง EXPECT · null = จอไม่มีข้อมูลให้โหลดในสถานะนั้น พร้อมเหตุผล)
      const ids = await page.evaluate(() => [...document.querySelectorAll("[data-testid]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.left < window.innerWidth; }).map((e) => e.getAttribute("data-testid")));
      const want = EXPECT[route]?.[st];
      const seenState = want === null || want === undefined ? null : ids.find((x) => want.test(x)) ?? null;
      const stateOk = want === null ? true : !!seenState;
      out.push({ state: st, route, file: file.slice(M.length + 1), ok: log.errors.length === 0 && log.unmocked.length === 0 && stateOk, expect: want ? String(want) : (NA[route]?.[st] ?? "n/a"), seen: seenState, errors: log.errors, unmocked: log.unmocked, texts });
      await page.close();
    }
    // แผ่นรวม 6 จอ/แผ่น (ImageMagick montage)
    const files = R24.map((r) => join(OUT, st, `${name(r)}.png`));
    for (let i = 0; i < files.length; i += 6) {
      execFileSync("montage", [...files.slice(i, i + 6), "-tile", "6x1", "-geometry", "390x844+6+6", "-background", "#888888", "-depth", "8", "-strip", join(OUT, `${st}-sheet-${i / 6 + 1}.png`)]);
    }
  }
} finally {
  await close();
  server.close();
}
writeFileSync(join(OUT, "states.json"), JSON.stringify({ generatedAt: new Date().toISOString(), states: out }, null, 1) + "\n");
const bad = out.filter((x) => !x.ok);
console.log(`states: ${out.length} ภาพ · ok ${out.length - bad.length}`);
for (const b of bad) console.log(`  ✗ ${b.state} ${b.route} errors=${JSON.stringify(b.errors)} unmocked=${JSON.stringify(b.unmocked)}`);
