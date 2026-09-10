// QC — ระบบสมาชิก v2 WO M3.11: LIFF onboarding `/m/[slug]/join` 3 ขั้น (ที่มา ?src= · OTP · ฟิลด์ customerEditable+required · ผู้แนะนำ · ความยินยอม · นโยบาย) + แอปพนักงาน (Expo · 3 จอ: ค้น/สแกน QR · สรุป+ปุ่ม 4 · ประทับ PIN — ผ่าน /api/mobile/member/*) + ฝั่งลูกค้าในแอป (WebView /m/* + สะพาน push device) — ภาพ 29 · 28
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.11 · พิมพ์เขียว D4 §3.10 §8 (บรรทัด 454–457 ที่มา LIFF) §11.7 · M3.10 join.ts/REST · M2.9 customer-session · M1.8 sources · M3.5 referrals · M3.6 notifications (PUSH) · ภาพ 29 · 28
// requires: member-seed
//
// สัญญา
//   LIFF (src/app/m/[slug]/join/{page.tsx, done/page.tsx} + src/components/member/JoinFlow.tsx + member/join-actions.ts เรียก member/join.ts ของ M3.10 · ไม่ต้อง session · มือถือ ≤ 390 เป็นหลัก):
//     ขั้น (ก) ต้อนรับ: โลโก้/ชื่อร้าน · "สมัครสมาชิก <ร้าน> รับ <welcomePoints> แต้ม" · ที่มา "มาจาก: <ชื่อลิงก์> (src=<code>)" ตัวเล็กเมื่อ ?src= ตรง AcquisitionLink (hit +1 ครั้งต่อการเปิด) · ปุ่ม "สมัครด้วย LINE" (liff login → lineUserId) / "สมัครด้วยเบอร์โทร"
//     ขั้น (ข) ฟอร์มที่ร้านตั้ง (join.form): ชื่อ · เบอร์ + OTP 6 หลัก (ปุ่มขอรหัส → join.start · ยืนยัน → join.verify · ป้าย "ยืนยันแล้ว") · วันเกิด · ฟิลด์กำหนดเองที่ customerEditable (required ตาม layout) · ผู้แนะนำ (โค้ด · prefill จาก ?ref= · ตรวจแล้วขึ้น "คุณและเพื่อนจะได้รางวัล") · ความยินยอม 4 สวิตช์ (LINE/EMAIL/SMS/PUSH) + ยอมรับนโยบาย v<policyVersion> · ปุ่มสมัครสมาชิก → join.complete → ตั้ง cookie session → ไป /join/done
//     ขั้น (ค) สำเร็จ (/m/[slug]/join/done · ต้อง session ลูกค้า · ไม่มี → /m/[slug]/login): บัตรสมาชิกสีเข้ม + QR (แบบภาพ 09) · กล่อง "ได้รับ <n> แต้มต้อนรับ" · ปุ่ม "เปิดบัตรสมาชิก" (/card) · "เพิ่มเพื่อน LINE" (ถ้าร้านตั้ง)
//     เบอร์ที่เป็นสมาชิกอยู่แล้ว → verify คืน existing → หน้าแจ้ง "คุณเป็นสมาชิกอยู่แล้ว" + เข้าสู่ระบบให้เลย (ไป /card) · OTP ผิด → ข้อความไทยใต้ช่อง · ครบ 5 ครั้ง → ขอรหัสใหม่
//     testid: m-join m-join-welcome m-join-src m-join-start-line m-join-start-phone m-join-form m-join-phone m-join-otp-request m-join-otp m-join-otp-verify m-join-otp-ok m-join-field-<key> m-join-referral m-join-referral-reward m-join-consents m-join-policy m-join-submit m-join-error m-join-done m-join-done-card m-join-done-points m-join-done-open-card m-join-existing
//   แอปพนักงาน (apps/mobile · Expo Router · ห้ามบิลด์/OTA · ทดสอบด้วย web export + puppeteer เหมือน qc/shoot-ipad.mjs):
//     จอ apps/mobile/app/(app)/member/index.tsx (ค้นสมาชิก + ปุ่มสแกน QR ใหญ่เส้นประ (expo-camera · ผล SHARK-MC:<token>) + ผล 3 คน ชื่อ/เบอร์ปิดบัง/ระดับ) · member/[customerId].tsx (การ์ดสรุป · ตัวเลข 3 แต้ม/voucher/สแตมป์ · ปุ่ม 2×2 ประทับสแตมป์/ใช้สิทธิ์/ให้แต้ม/ออก voucher · ประวัติ 3 รายการ) · member/stamp.tsx (เลือกการ์ด · เหตุผล/บริการ · PIN 4–6 หลัก · ปุ่มประทับแล้ว · แบนเนอร์สำเร็จ "n/m · อีก k ครั้งได้ <รางวัล>") · ทางเข้าใน Drawer "สมาชิก" · testID: member-search member-scan member-result-<i> member-summary member-summary-stats member-action-stamp member-action-redeem member-action-points member-action-voucher member-history member-stamp member-stamp-card member-stamp-pin member-stamp-submit member-stamp-banner
//     API สำหรับแอป (ใช้ mobile session · ไม่ใช่ API key): src/app/api/mobile/member/{search,scan,summary,stamp}/route.ts — requireMobile + membership ของร้าน active + สิทธิ์ member.customer.read / member.loyalty.stamp (assertCan) → เรียก facade member/stamp/point เท่านั้น · ไม่มี token → 401 · token ผิด → 401 · ตอบ JSON ไทยเมื่อ error
//     QC render: apps/mobile/qc/shoot-member.mjs (แบบ shoot-ipad.mjs · mock /api/mobile/me + /api/mobile/member/* ด้วยข้อมูลจำลอง) → apps/mobile/qc/shots-member/{member-search,member-summary,member-stamp}-iphone.png + summary.json {screens:[{name, ok, errors[]}]} — Fable รัน
//   ฝั่งลูกค้าในแอป: src/app/m/[slug]/layout.tsx ฝังสะพาน push (data-testid m-push-bridge · เมื่อ UA มี "SharkCustomer/" หรือ window.ReactNativeWebView → รับ {type:"push-token", expoToken, platform} แล้ว POST /api/v1/member/me/push-devices ด้วย session ปัจจุบัน) · MemberPushDevice ผูก customerId · notifications PUSH ใช้ device นี้ (deps.push ได้ token)
//   ไม่ต้องบิลด์/OTA: apps/mobile/app.json version/runtimeVersion ไม่เปลี่ยน · ไม่มี eas build · หน้าใหม่รันได้ใน web export
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
process.env.QC_OTP_PREVIEW = "1";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
if (!existsSync("src/app/m/[slug]/join/page.tsx") || !existsSync("apps/mobile/app/(app)/member/index.tsx") || !existsSync("src/lib/modules/member/join.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (m/[slug]/join/page.tsx · apps/mobile/app/(app)/member/index.tsx · member/join.ts (M3.10))");
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
const made = { customers: [] as string[], links: [] as string[], devices: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const J = (await import("@/lib/modules/member/join" as string)) as Record<string, (...a: Any[]) => Any>;
  const SRC = (await import("@/lib/modules/member/sources" as string)) as Record<string, (...a: Any[]) => Any>;
  const F = (await import("@/lib/modules/member/fields" as string)) as Record<string, (...a: Any[]) => Any>;
  const RF = (await import("@/lib/modules/member/referrals" as string).catch(() => null)) as Record<string, (...a: Any[]) => Any> | null;
  const N = (await import("@/lib/modules/member/notifications" as string).catch(() => null)) as Record<string, (...a: Any[]) => Any> | null;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const slug = mq.MQC.tenantSlug as string;
  const phone = () => `0833${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  const link = await SRC.createLink(ctx, owner, { code: `qc311${Date.now().toString(36).slice(-4)}`, name: "โพสต์ Facebook ก.ย. (QC)", source: "LIFF", target: "LIFF_JOIN", costSatang: 50_000 });
  const linkRow = link?.link ?? link; made.links.push(linkRow.id);
  const form = await J.joinForm(slug);
  const reqKeys: string[] = (form?.fields ?? []).filter((f: Any) => f.required).map((f: Any) => f.key);
  const fill = (extra: Any = {}) => { const base: Any = { firstName: "สมัคร", lastName: "LIFF" }; for (const k of reqKeys) if (!(k in base)) base[k] = k === "birthDate" ? "1990-05-05" : k === "email" ? `j-${Date.now()}@example.com` : "ค่า"; return { ...base, ...extra }; };
  const consents = [{ channel: "LINE", granted: true }, { channel: "EMAIL", granted: false }, { channel: "SMS", granted: false }, { channel: "PUSH", granted: true }];

  // ═══ S1 join flow (service) ═══
  const p1 = phone();
  const s1 = await J.startJoin(slug, { phone: p1, src: linkRow.code }, { ip: "127.0.0.1" });
  const v1 = await J.verifyJoin(slug, { otpId: s1?.otpId, code: s1?.devOtp });
  const c1 = await J.completeJoin(slug, { joinToken: v1?.joinToken, fields: fill(), consents, policyVersion: form?.policyVersion ?? 1, src: linkRow.code }, { userAgent: "qc" });
  if (c1?.customerId) made.customers.push(c1.customerId);
  const cust1 = c1?.customerId ? await prisma.customer.findUnique({ where: { id: c1.customerId } }) : null;
  const cons1 = c1?.customerId ? await P.memberConsent.findMany({ where: { customerId: c1.customerId } }) : [];
  const sess1 = c1?.token ? await P.customerSession.findFirst({ where: { customerId: c1.customerId } }) : null;
  const bal1 = c1?.customerId ? await (await import("@/lib/modules/point" as string) as Any).getBalance(scope.systems.POINT, c1.customerId) : -1;
  chk("M3.11-S1.1", "joinForm(slug) → {fields[] (customerEditable · required flag), consents 4, policyVersion, welcomePoints} · startJoin(เบอร์ใหม่, src) → {otpId, devOtp} · verifyJoin → {joinToken jt_, existing false} · completeJoin → {customerId, memberCode, token cs_, welcomePoints} · Customer source LIFF · ยินยอม LINE/PUSH granted, EMAIL/SMS ไม่ · CustomerSession 1 · แต้มต้อนรับ = welcomePoints (0 ถ้าร้านไม่ตั้ง)", Array.isArray(form?.fields) && form.consents?.length === 4 && typeof form.policyVersion === "number" && typeof form.welcomePoints === "number" && /^\d{6}$/.test(s1?.devOtp ?? "") && /^jt_/.test(v1?.joinToken ?? "") && v1?.existing === false && !!c1?.customerId && !!c1.memberCode && /^cs_/.test(c1.token ?? "") && cust1?.source === "LIFF" && cons1.find((c: Any) => c.channel === "LINE")?.granted === true && cons1.find((c: Any) => c.channel === "PUSH")?.granted === true && !cons1.find((c: Any) => c.channel === "EMAIL")?.granted && !!sess1 && bal1 === (form.welcomePoints ?? 0), "สมัครสำเร็จ", `form=${JSON.stringify({ f: form?.fields?.length, c: form?.consents?.length, pv: form?.policyVersion, wp: form?.welcomePoints })} s1=${!!s1?.devOtp} v1=${JSON.stringify(v1)} c1=${JSON.stringify(c1)} src=${cust1?.source} cons=${cons1.map((c: Any) => `${c.channel}:${c.granted}`).join(",")} bal=${bal1}`);
  const s2 = await J.startJoin(slug, { phone: p1 }, { ip: "127.0.0.1" });
  const v2 = await J.verifyJoin(slug, { otpId: s2?.otpId, code: s2?.devOtp });
  const nDup = await prisma.customer.count({ where: { tenantId: tid, phone: p1 } });
  chk("M3.11-S1.2", "สมัครซ้ำเบอร์เดิม: startJoin ไม่เผยว่ามีสมาชิก (ยังคืน otpId) · verifyJoin → {existing true, token cs_, customerId เดิม} ไม่มี joinToken · Customer เบอร์นี้ยัง 1 คน", !!s2?.otpId && v2?.existing === true && /^cs_/.test(v2?.token ?? "") && v2?.customerId === c1?.customerId && !v2?.joinToken && nDup === 1, "existing", `s2=${!!s2?.otpId} v2=${JSON.stringify(v2)} n=${nDup}`);
  const s3 = await J.startJoin(slug, { phone: phone() }, { ip: "127.0.0.1" });
  const wrongs: (Error | null)[] = []; for (let k = 0; k < 5; k += 1) wrongs.push(await fails(() => J.verifyJoin(slug, { otpId: s3?.otpId, code: "000000" })));
  const eLocked = await fails(() => J.verifyJoin(slug, { otpId: s3?.otpId, code: s3?.devOtp }));
  const eNoTok = await fails(() => J.completeJoin(slug, { joinToken: "jt_nope", fields: fill(), consents, policyVersion: form?.policyVersion ?? 1 }, {}));
  chk("M3.11-S1.3", "OTP ผิด 5 ครั้ง → throw ไทยทุกครั้ง · ครั้งที่ 6 รหัสถูกก็ใช้ไม่ได้ (ล็อก · ขอใหม่) · joinToken มั่ว → throw ไทย", wrongs.every(thai) && thai(eLocked) && thai(eNoTok), "ล็อก", `wrong=${wrongs.map(thai).join(",")} locked=${eLocked?.message?.slice(0, 50)} noTok=${thai(eNoTok)}`);
  const refCode = (await prisma.customer.findUnique({ where: { id: m(1).id }, select: { referralCode: true } }))?.referralCode ?? "";
  const s4 = await J.startJoin(slug, { phone: phone(), referralCode: refCode }, { ip: "127.0.0.1" });
  const v4 = await J.verifyJoin(slug, { otpId: s4?.otpId, code: s4?.devOtp });
  const c4 = await J.completeJoin(slug, { joinToken: v4?.joinToken, fields: fill(), consents, policyVersion: form?.policyVersion ?? 1, referralCode: refCode }, {});
  if (c4?.customerId) made.customers.push(c4.customerId);
  const cust4 = c4?.customerId ? await prisma.customer.findUnique({ where: { id: c4.customerId } }) : null;
  const ref4 = c4?.customerId ? await P.referral.findFirst({ where: { tenantId: tid, refereeCustomerId: c4.customerId } }).catch(() => null) : null;
  const eBadRef = await (async () => { const s = await J.startJoin(slug, { phone: phone() }, { ip: "127.0.0.1" }); const v = await J.verifyJoin(slug, { otpId: s?.otpId, code: s?.devOtp }); return fails(() => J.completeJoin(slug, { joinToken: v?.joinToken, fields: fill(), consents, policyVersion: form?.policyVersion ?? 1, referralCode: "ZZZZ9999" }, {})); })();
  chk("M3.11-S1.4", "ผู้แนะนำ: referralCode ของสมาชิก 1 → Customer.referredById = สมาชิก 1 · source REFERRAL (หรือ LIFF + sourceDetail.referrerCustomerId) · Referral แถว (M3.5) status PENDING/REWARDED · โค้ดมั่ว → throw ไทย (ไม่สร้างสมาชิก)", !!refCode && !!cust4 && cust4.referredById === m(1).id && (cust4.source === "REFERRAL" || cust4.source === "LIFF") && (!RF || !!ref4) && thai(eBadRef), "ผู้แนะนำ", `code=${!!refCode} referredBy=${cust4?.referredById === m(1).id} src=${cust4?.source} ref=${ref4?.status ?? "-"} bad=${thai(eBadRef)}`);
  const s5 = await J.startJoin(slug, { phone: phone() }, { ip: "127.0.0.1" });
  const v5 = await J.verifyJoin(slug, { otpId: s5?.otpId, code: s5?.devOtp });
  const eMissing = reqKeys.length || true ? await fails(() => J.completeJoin(slug, { joinToken: v5?.joinToken, fields: { lastName: "x" }, consents, policyVersion: form?.policyVersion ?? 1 }, {})) : null;
  const ePolicy = await fails(() => J.completeJoin(slug, { joinToken: v5?.joinToken, fields: fill(), consents, policyVersion: (form?.policyVersion ?? 1) - 1 }, {}));
  const eSlug = await fails(() => J.startJoin("no-such-shop", { phone: phone() }, { ip: "127.0.0.1" }));
  chk("M3.11-S1.5", "ฟิลด์บังคับขาด (firstName) → throw ไทย · policyVersion เก่า → throw ไทย · slug ไม่มี → throw ไทย · joinToken ยังใช้ได้หลัง error (ไม่ถูกเผา)", thai(eMissing) && thai(ePolicy) && thai(eSlug) && !!(await J.completeJoin(slug, { joinToken: v5?.joinToken, fields: fill(), consents, policyVersion: form?.policyVersion ?? 1 }, {}).then((r: Any) => { if (r?.customerId) made.customers.push(r.customerId); return r?.customerId; }).catch(() => null)), "validation", `missing=${thai(eMissing)} policy=${thai(ePolicy)} slug=${thai(eSlug)}`);

  // ═══ S2 attribution ═══
  const linkAfter = await P.acquisitionLink.findUnique({ where: { id: linkRow.id } });
  const attr1 = c1?.customerId ? await P.memberAttribution.findMany({ where: { customerId: c1.customerId } }) : [];
  chk("M3.11-S2.1", "src ตรง AcquisitionLink: startJoin นับ hits ≥ 1 · completeJoin → link.signups 1 · MemberAttribution FIRST {source LIFF, linkId} ของคนที่ 1", (linkAfter?.hits ?? 0) >= 1 && linkAfter?.signups === 1 && attr1.some((a: Any) => a.kind === "FIRST" && a.linkId === linkRow.id && a.source === "LIFF"), "attribution", `hits=${linkAfter?.hits} signups=${linkAfter?.signups} attr=${JSON.stringify(attr1.map((a: Any) => [a.kind, a.source, a.linkId === linkRow.id]))}`);
  const s6 = await J.startJoin(slug, { phone: phone(), src: "no-such-src" }, { ip: "127.0.0.1" });
  const v6 = await J.verifyJoin(slug, { otpId: s6?.otpId, code: s6?.devOtp });
  const c6 = await J.completeJoin(slug, { joinToken: v6?.joinToken, fields: fill(), consents, policyVersion: form?.policyVersion ?? 1, src: "no-such-src" }, {});
  if (c6?.customerId) made.customers.push(c6.customerId);
  const attr6 = c6?.customerId ? await P.memberAttribution.findMany({ where: { customerId: c6.customerId } }) : [];
  chk("M3.11-S2.2", "src ไม่รู้จัก → ยังสมัครได้ source LIFF · attribution FIRST linkId null · link.signups ไม่เพิ่ม", !!c6?.customerId && attr6.some((a: Any) => a.kind === "FIRST" && a.source === "LIFF" && !a.linkId) && (await P.acquisitionLink.findUnique({ where: { id: linkRow.id } }))?.signups === 1, "ไม่พัง", `c6=${!!c6?.customerId} attr=${JSON.stringify(attr6.map((a: Any) => [a.kind, a.source, a.linkId]))}`);

  // ═══ S3 LIFF UI ═══
  const joinSrc = read("src/app/m/[slug]/join/page.tsx") + read("src/app/m/[slug]/join/done/page.tsx") + (existsSync("src/components/member/JoinFlow.tsx") ? read("src/components/member/JoinFlow.tsx") : "") + readdirSync("src/components/member").filter((f) => /join/i.test(f)).map((f) => read(`src/components/member/${f}`)).join("\n");
  const TIDS = ["m-join", "m-join-welcome", "m-join-src", "m-join-start-line", "m-join-start-phone", "m-join-form", "m-join-phone", "m-join-otp-request", "m-join-otp", "m-join-otp-verify", "m-join-otp-ok", "m-join-field-", "m-join-referral", "m-join-referral-reward", "m-join-consents", "m-join-policy", "m-join-submit", "m-join-error", "m-join-done", "m-join-done-card", "m-join-done-points", "m-join-done-open-card", "m-join-existing"];
  const missingT = TIDS.filter((t) => !joinSrc.includes(t));
  const LABELS = ["สมัครสมาชิก", "มาจาก", "สมัครด้วย LINE", "เบอร์โทร", "ขอรหัส", "ยืนยันแล้ว", "ผู้แนะนำ", "คุณและเพื่อนจะได้รางวัล", "ยอมรับนโยบาย", "แต้มต้อนรับ", "เปิดบัตรสมาชิก", "เป็นสมาชิกอยู่แล้ว"];
  const missingL = LABELS.filter((l) => !joinSrc.includes(l));
  const jAct = read("src/lib/modules/member/join-actions.ts");
  chk("M3.11-S3.1", "หน้า join + done มีจริง · testid 23 · ป้ายภาพ 29 ครบ · actions 'use server' เรียก join.ts (ไม่แตะ prisma) · done ต้อง session ลูกค้า (customer-session) · ไม่มีอีโมจิ/hex", missingT.length === 0 && missingL.length === 0 && /["']use server["']/.test(jAct) && /modules\/member\/join"|from "\.\/join"/.test(jAct) && !/@\/lib\/core\/db/.test(jAct) && /customer-session|getCustomerSession|requireCustomer/.test(read("src/app/m/[slug]/join/done/page.tsx")) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(joinSrc.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(joinSrc.replace(/\/\/.*$/gm, "")), "ครบ", `tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"}`);
  const dir = `${mq.MQC.shotsDir}/3.11`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  const custKey = `customer:${m(1).memberCode}`;
  chk("M3.11-S3.2", "ภาพ 29: m-join-welcome (owner · ?src=<TMP311>) mobile 200 (โลโก้ · รับ n แต้ม · มาจาก: … · ปุ่ม 2) · m-join-form (กดสมัครด้วยเบอร์ → ฟอร์ม: เบอร์+OTP · ฟิลด์ · ผู้แนะนำ prefill ?ref= · ยินยอม 4 · นโยบาย · ปุ่ม) · m-join-done (--user customer:สมาชิก 1) 200 (บัตร+QR · กล่องแต้ม · ปุ่มเปิดบัตร)", ok("owner", "m-join-welcome", "mobile") && ok("owner", "m-join-form", "mobile") && ok(custKey, "m-join-done", "mobile"), "200 ×3", `${r("owner", "m-join-welcome", "mobile")?.status}/${r("owner", "m-join-form", "mobile")?.status}/${r(custKey, "m-join-done", "mobile")?.status} missing=${JSON.stringify(r("owner", "m-join-form", "mobile")?.missing)}`);
  chk("M3.11-S3.3", "🔴 parity ภาพ 29 (3 จอ) + 28 (3 จอแอปพนักงาน) — Fable ตรวจด้วยตา · wo-notes/member-M3.11.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.11.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");

  // ═══ S4 แอปพนักงาน ═══
  const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
  const routes = ["search", "scan", "summary", "stamp"].map((k) => `src/app/api/mobile/member/${k}/route.ts`);
  const routeSrc = routes.map(read).join("\n");
  const noTok = await fetch(`${BASE}/api/mobile/member/search?q=x`).then((x) => x.status).catch(() => 0);
  const badTok = await fetch(`${BASE}/api/mobile/member/search?q=x`, { headers: { authorization: "Bearer nope" } }).then((x) => x.status).catch(() => 0);
  chk("M3.11-S4.1", "route /api/mobile/member/{search,scan,summary,stamp} มีครบ · requireMobile + assertCan(member.customer.read | member.loyalty.stamp) · เรียก facade (ไม่ import prisma ตรง) · ไม่มี token → 401 · token ผิด → 401", routes.every(existsSync) && /requireMobile/.test(routeSrc) && /assertCan|hasMemberPerm|member\.loyalty\.stamp/.test(routeSrc) && !/@\/lib\/core\/db"/.test(routeSrc) && /@\/lib\/modules\/(member|stamp|point)"/.test(routeSrc) && noTok === 401 && badTok === 401, "API แอป", `exists=${routes.map(existsSync).join(",")} noTok=${noTok} badTok=${badTok}`);
  const scr = ["apps/mobile/app/(app)/member/index.tsx", "apps/mobile/app/(app)/member/[customerId].tsx", "apps/mobile/app/(app)/member/stamp.tsx"];
  const scrSrc = scr.map(read).join("\n");
  const TID2 = ["member-search", "member-scan", "member-result-", "member-summary", "member-summary-stats", "member-action-stamp", "member-action-redeem", "member-action-points", "member-action-voucher", "member-history", "member-stamp", "member-stamp-card", "member-stamp-pin", "member-stamp-submit", "member-stamp-banner"];
  const miss2 = TID2.filter((t) => !scrSrc.includes(t));
  chk("M3.11-S4.2", "จอแอป 3 ไฟล์ · testID 15 · เรียก api('/api/mobile/member/…') ผ่าน src/api/client (ไม่ fetch ตรง shark.in.th) · Drawer มีเมนู 'สมาชิก' → /member · สแกน QR ใช้ expo-camera/barcode · ป้ายไทย (ประทับสแตมป์/ใช้สิทธิ์/ให้แต้ม/ออก voucher)", scr.every(existsSync) && miss2.length === 0 && /api\("\/api\/mobile\/member/.test(scrSrc) && !/fetch\(`?https:\/\/shark/.test(scrSrc) && /member/.test(read("apps/mobile/app/(app)/_layout.tsx")) && /สมาชิก/.test(read("apps/mobile/app/(app)/_layout.tsx")) && /expo-camera|BarCodeScanner|CameraView/.test(scrSrc) && ["ประทับสแตมป์", "ใช้สิทธิ์", "ให้แต้ม", "ออก voucher"].every((l) => scrSrc.includes(l)), "จอครบ", `exists=${scr.map(existsSync).join(",")} missing=${miss2.join(",") || "-"}`);
  const shotsDir = "apps/mobile/qc/shots-member";
  const shotSum = existsSync(`${shotsDir}/summary.json`) ? JSON.parse(read(`${shotsDir}/summary.json`)) : null;
  chk("M3.11-S4.3", "QC render (Fable รัน apps/mobile/qc/shoot-member.mjs · web export + mock API): shots-member/{member-search,member-summary,member-stamp}-iphone.png มี · summary.json ทุกจอ ok errors 0", existsSync("apps/mobile/qc/shoot-member.mjs") && ["member-search", "member-summary", "member-stamp"].every((n) => existsSync(`${shotsDir}/${n}-iphone.png`)) && !!shotSum && shotSum.screens?.length >= 3 && shotSum.screens.every((s: Any) => s.ok && (s.errors?.length ?? 0) === 0), "3 จอ", `script=${existsSync("apps/mobile/qc/shoot-member.mjs")} shots=${["member-search", "member-summary", "member-stamp"].map((n) => existsSync(`${shotsDir}/${n}-iphone.png`)).join(",")} sum=${JSON.stringify(shotSum?.screens?.map((s: Any) => [s.name, s.ok, s.errors?.length]))}`, "MAJOR");

  // ═══ S5 push device (ฝั่งลูกค้าในแอป) ═══
  const layoutM = read("src/app/m/[slug]/layout.tsx") + readdirSync("src/components/member").filter((f) => /push|bridge/i.test(f)).map((f) => read(`src/components/member/${f}`)).join("\n");
  const tok = `ExponentPushToken[qc311-${Date.now()}]`;
  const reg = await fetch(`${BASE}/api/v1/member/me/push-devices`, { method: "POST", headers: { authorization: `Bearer ${c1?.token}`, "content-type": "application/json", "idempotency-key": `m311-${Date.now()}` }, body: JSON.stringify({ expoToken: tok, platform: "ios" }) }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) })).catch(() => ({ status: 0, body: null }));
  const dev = await P.memberPushDevice.findFirst({ where: { customerId: c1?.customerId ?? "-" } }).catch(() => null);
  if (dev) made.devices.push(dev.id);
  const reg2 = await fetch(`${BASE}/api/v1/member/me/push-devices`, { method: "POST", headers: { authorization: `Bearer ${c1?.token}`, "content-type": "application/json", "idempotency-key": `m311b-${Date.now()}` }, body: JSON.stringify({ expoToken: tok, platform: "ios" }) }).then((x) => x.status).catch(() => 0);
  chk("M3.11-S5.1", "layout /m ฝังสะพาน push (m-push-bridge · ฟัง message push-token · เรียก /api/v1/member/me/push-devices) · REST ลงทะเบียน (session ของคนที่เพิ่งสมัคร) → 201 → MemberPushDevice {customerId, expoToken, platform ios} · ลงซ้ำ token เดิม → 200 ไม่ซ้ำแถว", /m-push-bridge/.test(layoutM) && /push-token/.test(layoutM) && /me\/push-devices/.test(layoutM) && reg.status === 201 && !!dev && dev.expoToken === tok && dev.platform === "ios" && [200, 201].includes(reg2) && (await P.memberPushDevice.count({ where: { customerId: c1?.customerId ?? "-" } })) === 1, "device ok", `bridge=${/m-push-bridge/.test(layoutM)} reg=${reg.status} dev=${!!dev} reg2=${reg2} n=${await P.memberPushDevice.count({ where: { customerId: c1?.customerId ?? "-" } }).catch(() => -1)}`);
  const pushCalls: Any[] = [];
  const sent = N && c1?.customerId ? await N.send(ctx, { event: "VOUCHER_NEW", customerId: c1.customerId, vars: { voucher: "ทดสอบ push" } }, { now: new Date(new Date().setUTCHours(7, 0, 0, 0)), deps: { push: async (x: Any) => { pushCalls.push(x); return { ok: true }; }, line: async () => ({ ok: true }), email: async () => ({ ok: true }) } }).catch((e: Any) => ({ err: e.message })) : null;
  const pushRes = sent?.results?.find((x: Any) => x.channel === "PUSH");
  chk("M3.11-S5.2", "notifications (M3.6) ส่ง VOUCHER_NEW ให้คนนี้ (ยินยอม PUSH · มี device) → ช่อง PUSH SENT · deps.push ได้ {to/token = expoToken, title, body} (ไม่มี M3.6 = ข้าม)", !N || (pushRes?.status === "SENT" && pushCalls.length === 1 && JSON.stringify(pushCalls[0]).includes(tok) && !!(pushCalls[0].title ?? pushCalls[0].body)), "PUSH SENT", `N=${!!N} res=${JSON.stringify(pushRes)} calls=${JSON.stringify(pushCalls[0]).slice(0, 120)} err=${sent?.err ?? "-"}`);

  // ═══ S6 ไม่ต้องบิลด์/OTA ═══
  const appJson = JSON.parse(read("apps/mobile/app.json") || "{}");
  const headApp = (() => { try { return JSON.parse(execSync("git show HEAD:apps/mobile/app.json", { encoding: "utf8" })); } catch { return null; } })();
  chk("M3.11-S6.1", "apps/mobile/app.json version/runtimeVersion เท่า HEAD (ไม่มีบิลด์/OTA ใหม่) · ไม่มีไฟล์ build ใหม่ (apps/mobile/*.ipa|*.apk|*.aab) · wo-notes ระบุ 'ไม่ต้องบิลด์'", !!headApp && appJson?.expo?.version === headApp?.expo?.version && JSON.stringify(appJson?.expo?.runtimeVersion) === JSON.stringify(headApp?.expo?.runtimeVersion) && !readdirSync("apps/mobile").some((f) => /\.(ipa|apk|aab)$/.test(f)) && /ไม่ต้องบิลด์|ไม่ต้อง build|OTA/.test(read("ledger/wo-notes/member-M3.11.md")), "ไม่บิลด์", `ver=${appJson?.expo?.version}/${headApp?.expo?.version} rt=${JSON.stringify(appJson?.expo?.runtimeVersion)}/${JSON.stringify(headApp?.expo?.runtimeVersion)}`);
} catch (e) {
  console.error("💥", e);
  chk("M3.11-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  if (made.devices.length) await d(() => P.memberPushDevice.deleteMany({ where: { id: { in: made.devices } } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    await d(() => P.referral.deleteMany({ where: { OR: [{ refereeCustomerId: { in: made.customers } }, { referrerCustomerId: { in: made.customers } }] } }));
    await d(() => P.voucher.deleteMany({ where: { customerId: { in: made.customers } } }));
    for (const mdl of ["memberPushDevice", "customerSession", "memberNotification", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await d(() => P[mdl]?.deleteMany?.({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  await d(() => P.customerOtp.deleteMany({ where: { tenantId: tid, target: { startsWith: "0833" } } }));
  if (made.links.length) await d(() => P.acquisitionLink.deleteMany({ where: { id: { in: made.links } } }));
  for (const t of ["member.", "point.", "referral."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.11: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
