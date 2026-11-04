// QC — SECRETARY S1.19 · SMS OTP · เบอร์ = ID (phone-auth.ts · PhoneOtp/UserPhone · route มือถือ · mock SMS) · oracle ของผู้คุม — builder ห้ามแก้ไฟล์นี้
// สัญญา: ledger/secretary-briefs/sec-brief-S1.19.md · RESOLUTIONS R-K9/K10 · แบบ S1/S2 + R8
//
// กลุ่มข้อ:
//   M  mock SMS: SMS_PROVIDER=mock ⇒ smsEnabled · sendSms ok externalId mock-* · ไม่มี env = null
//   Q  requestPhoneOtp: bad_phone · แถว PhoneOtp (hash ≠ code · TTL 10 นาที · ip) · ข้อความมี code 6 หลัก · rate-limit 5/เบอร์ · 20/ip · ส่งล้ม ⇒ sms_failed ไม่เหลือแถว · ไม่คืน code
//   V  verifyPhoneOtp: not_found · invalid(attempts++) · locked ที่ 5 · expired · ตรง ⇒ ok ไม่ consume · userId null/มี · consumePhoneOtp ครั้งเดียว
//   S  signupWithPhone: bad_input · email_taken (ข้อความ R8) · phone_taken · สำเร็จ = User + UserPhone(verifiedAt) ใน tx · linkPhoneToUser · phoneOfUser
//   R  routes: request always-200 · verify 401/needSignup(ไม่ consume)/signup→token(isNew)/existing→token · code ใช้ซ้ำหลัง consume ⇒ 401 · link (Bearer) · me.phone
//   S2 รอบ 2 (RESOLUTIONS §H): placeholder email + pendingEmail (R-S1.19a) · จอง attempt ก่อนเทียบ (b) · mock ถูกเมินใน production (c) · normalizer เข้ม (d) · link ล็อกเมื่อมีเบอร์อื่น (e) · ขอซ้ำใน 60 วิ (f) · ไม่มีผู้ให้บริการ ⇒ 503 (g) · code ตัดตัวเลข (h)
//   D  fitness ×2 · phone-auth.ts ไม่ import @/lib/env
// ทุกแถวทดสอบ: เบอร์ +66800017xxx · ผู้ใช้ qcs19-* · ลบใน finally
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 SMS_PROVIDER=mock pnpm exec tsx scripts/qc-sec-s1.19.mts
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "qc-sec-s1.19";
const FORCED = process.env.QC_FORCE === "1";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
const PA_FILE = join(ROOT, "src/lib/core/phone-auth.ts");
if (!FORCED && !existsSync(PA_FILE)) {
  console.log(`⏭️  ${LABEL}: ยังไม่มี src/lib/core/phone-auth.ts (ใบยังไม่เริ่ม) และไม่ได้ตั้ง QC_FORCE=1 — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["ALL"], reason: "not-started" }));
  process.exit(0);
}
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
process.env.SMS_PROVIDER = "mock";
delete process.env.SMS_API_KEY; delete process.env.SMS_ENDPOINT;
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const req = (u: string, method: string, body?: unknown, headers: Record<string, string> = {}) => new Request(`http://qc.local${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async (r: Response) => ({ status: r.status, body: (await r.json().catch(() => ({}))) as AnyMod });
/** หา code จาก hash ในฐาน (6 หลัก) — ข้อสอบเท่านั้น */
function crack(phone: string, hash: string): string | null { for (let i = 0; i < 1_000_000; i++) { const c = String(i).padStart(6, "0"); if (sha(`${phone}:${c}`) === hash) return c; } return null; }

const { prisma } = await import("@/lib/core/db");
const sms = (await import("@/lib/core/sms")) as AnyMod;
const pa = existsSync(PA_FILE) ? ((await import("@/lib/core/phone-auth").catch((e) => { console.log("  ⚠️ import phone-auth: " + errMsg(e)); return null; })) as AnyMod | null) : null;
const hasTables = "phoneOtp" in prisma && "userPhone" in prisma;
const P = { a: "+66800017001", b: "+66800017002", c: "+66800017003", link: "+66800017004", ip: "+6680001799" };
const U = { existing: "qcs19-existing", linker: "qcs19-linker" };
const cleanup = async () => {
  try { if (hasTables) await (prisma as AnyMod).phoneOtp.deleteMany({ where: { phone: { startsWith: "+6680001" } } }); } catch { /* */ }
  try { if (hasTables) await (prisma as AnyMod).userPhone.deleteMany({ where: { phone: { startsWith: "+6680001" } } }); } catch { /* */ }
  try { await prisma.session.deleteMany({ where: { OR: [{ user: { email: { startsWith: "qcs19-" } } }, { user: { email: { startsWith: "6680001", endsWith: "@phone.shark.in.th" } } }] } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { OR: [{ id: { startsWith: "qcs19-" } }, { email: { startsWith: "qcs19-" } }, { email: { startsWith: "6680001", endsWith: "@phone.shark.in.th" } }] } }); } catch { /* */ }
  try { await prisma.authToken.deleteMany({ where: { email: { startsWith: "qcs19-" } } }); } catch { /* */ }
};

console.log("── M: mock SMS ──");
{
  sms.__resetSmsProviderCacheForTests?.();
  const en = typeof sms.__resetSmsProviderCacheForTests === "function" && sms.smsEnabled() === true;
  const r = en ? await sms.sendSms({ to: "0812345678", text: "ทดสอบ" }) : null;
  chk("M-1", "SMS_PROVIDER=mock ⇒ smsEnabled() true · sendSms ok · externalId ขึ้นต้น mock- · มี __resetSmsProviderCacheForTests", en && r?.ok === true && String(r?.externalId ?? "").startsWith("mock-"), JSON.stringify({ en, r }).slice(0, 160));
  process.env.SMS_PROVIDER = ""; sms.__resetSmsProviderCacheForTests?.();
  chk("M-2", "ไม่มี SMS_PROVIDER ⇒ getSmsProvider null · sendSms คืน ok:false ข้อความไทย (เดิม)", sms.getSmsProvider() === null && (await sms.sendSms({ to: "0812345678", text: "x" })).ok === false, "ดู provider");
  process.env.SMS_PROVIDER = "mock"; sms.__resetSmsProviderCacheForTests?.();
}

try {
  await cleanup();
  if (!pa || !hasTables) { for (const id of ["Q-1", "Q-2", "Q-3", "Q-4", "V-1", "V-2", "V-3", "V-4", "S-1", "S-2", "S-3", "R-1", "R-2", "R-3", "R-4", "R-5"]) skip(id, "phone-auth", pa ? "ไม่มีตาราง PhoneOtp/UserPhone" : "ไม่มี phone-auth.ts"); }
  else {
    console.log("── Q: requestPhoneOtp ──");
    const sent: { to: string; text: string }[] = [];
    const send = async (m: { to: string; text: string }) => { sent.push(m); return { ok: true }; };
    const bad = await pa.requestPhoneOtp("12345", { send });
    const r1 = await pa.requestPhoneOtp("0800017001", { send, ip: "10.0.0.1" });
    const row = await prisma.phoneOtp.findFirst({ where: { phone: P.a }, orderBy: { createdAt: "desc" } });
    const code1 = sent[0]?.text.match(/\b(\d{6})\b/)?.[1] ?? "";
    chk("Q-1", "เบอร์ผิด ⇒ bad_phone ไทย · 0800017001 ⇒ ok phone E.164 +66800017001 · แถว PhoneOtp (codeHash = sha256(phone:code) · TTL 10 นาที · ip) · ข้อความ SMS มี code 6 หลัก + 'SHARK' · ผลไม่มี code", bad.ok === false && bad.reason === "bad_phone" && thai(bad.message) && r1.ok === true && r1.phone === P.a && r1.resendAfterSec === 60 && !!row && row.codeHash === sha(`${P.a}:${code1}`) && row.ip === "10.0.0.1" && Math.abs(row.expiresAt.getTime() - row.createdAt.getTime() - 600_000) < 5_000 && /SHARK/.test(sent[0]?.text ?? "") && !JSON.stringify(r1).includes(code1), JSON.stringify({ bad, r1, hash: row?.codeHash?.slice(0, 8), code1 }).slice(0, 200));
    // R-S1.19f: ขอซ้ำภายใน 60 วิ ⇒ ok โดยไม่สร้างแถว — ข้อสอบเลื่อน now ทีละ 61 วิ เพื่อทดสอบเพดาน 5/10 นาที
    const rThrottle = await pa.requestPhoneOtp(P.a, { send, ip: "10.0.0.1" });
    const rowsAfterThrottle = await prisma.phoneOtp.count({ where: { phone: P.a } });
    for (let i = 1; i <= 4; i++) await pa.requestPhoneOtp(P.a, { send, ip: "10.0.0.1", now: new Date(Date.now() + i * 61_000) });
    const r6 = await pa.requestPhoneOtp(P.a, { send, ip: "10.0.0.1", now: new Date(Date.now() + 5 * 61_000) });
    chk("Q-2", "ขอซ้ำใน 60 วิ ⇒ ok ไม่สร้างแถว (resendAfterSec 1–60) · ขอครั้งที่ 6 ใน 10 นาที (เลื่อนเวลา) ⇒ rate_limited (ไทย) · แถว 5", rThrottle.ok === true && rowsAfterThrottle === 1 && rThrottle.resendAfterSec >= 1 && rThrottle.resendAfterSec <= 60 && sent.length === 1 && r6.ok === false && r6.reason === "rate_limited" && thai(r6.message) && (await prisma.phoneOtp.count({ where: { phone: P.a } })) === 5, JSON.stringify({ rThrottle, rowsAfterThrottle, sent: sent.length, r6 }).slice(0, 200));
    for (let i = 0; i < 20; i++) await pa.requestPhoneOtp(`+668000179${String(i).padStart(2, "0")}`, { send, ip: "10.9.9.9" }); // ORACLE-EDIT builder S1.19: 20 เบอร์ต่างกันจริง
    const rIp = await pa.requestPhoneOtp(P.b, { send, ip: "10.9.9.9" });
    chk("Q-3", "ip เดียวขอครั้งที่ 21 (คนละเบอร์) ⇒ rate_limited", rIp.ok === false && rIp.reason === "rate_limited", JSON.stringify(rIp).slice(0, 120), "MAJOR");
    const rF = await pa.requestPhoneOtp(P.c, { send: async () => ({ ok: false, error: "gateway down" }), ip: "10.0.0.2" });
    chk("Q-4", "ส่ง SMS ล้ม ⇒ sms_failed ไทย · แถวเก็บไว้แบบ consumed (นับใน rate-limit) · ไม่มีแถวที่ใช้ได้", rF.ok === false && rF.reason === "sms_failed" && thai(rF.message) && (await prisma.phoneOtp.count({ where: { phone: P.c, consumedAt: null } })) === 0 && (await prisma.phoneOtp.count({ where: { phone: P.c } })) >= 1, JSON.stringify(rF).slice(0, 120));
    await prisma.phoneOtp.deleteMany({ where: { phone: P.c } });

    console.log("── V: verifyPhoneOtp ──");
    const vN = await pa.verifyPhoneOtp(P.c, "123456");
    const rowA = await prisma.phoneOtp.findFirst({ where: { phone: P.a, consumedAt: null }, orderBy: { createdAt: "desc" } });
    const codeA = crack(P.a, rowA!.codeHash)!;
    const vBad = await pa.verifyPhoneOtp(P.a, codeA === "000000" ? "000001" : "000000");
    chk("V-1", "ไม่มีแถว ⇒ not_found · รหัสผิด ⇒ invalid และ attempts+1 (แถวล่าสุด)", vN.ok === false && vN.reason === "not_found" && vBad.ok === false && vBad.reason === "invalid" && (await prisma.phoneOtp.findUnique({ where: { id: rowA!.id } }))?.attempts === 1, JSON.stringify({ vN, vBad }).slice(0, 120));
    const vOk = await pa.verifyPhoneOtp(P.a, codeA);
    const rowA2 = await prisma.phoneOtp.findUnique({ where: { id: rowA!.id } });
    const vOk2 = await pa.verifyPhoneOtp(P.a, codeA);
    chk("V-2", "รหัสถูก ⇒ ok · phone · otpId · userId null (ยังไม่มีบัญชี) · ยังไม่ consume · verify ซ้ำได้ (attempts ไม่เพิ่ม)", vOk.ok === true && vOk.phone === P.a && vOk.otpId === rowA!.id && vOk.userId === null && rowA2?.consumedAt === null && rowA2?.attempts === 1 && vOk2.ok === true, JSON.stringify({ vOk, c: rowA2?.consumedAt, a: rowA2?.attempts }).slice(0, 160));
    const c1 = await pa.consumePhoneOtp(rowA!.id), c2 = await pa.consumePhoneOtp(rowA!.id);
    const vAfter = await pa.verifyPhoneOtp(P.a, codeA);
    chk("V-3", "consumePhoneOtp: ครั้งแรก true · ซ้ำ false · verify หลัง consume ⇒ ไม่ใช่ ok (แถวนี้ถูกข้าม)", c1 === true && c2 === false && vAfter.ok === false, JSON.stringify({ c1, c2, vAfter }).slice(0, 120));
    await prisma.phoneOtp.deleteMany({ where: { phone: P.b } });
    await pa.requestPhoneOtp(P.b, { send, ip: "10.0.0.3" });
    const rowB = await prisma.phoneOtp.findFirst({ where: { phone: P.b, consumedAt: null }, orderBy: { createdAt: "desc" } });
    for (let i = 0; i < 5; i++) await pa.verifyPhoneOtp(P.b, "000000");
    const codeB = crack(P.b, rowB!.codeHash)!;
    const vLocked = await pa.verifyPhoneOtp(P.b, codeB);
    await prisma.phoneOtp.update({ where: { id: rowB!.id }, data: { attempts: 0, expiresAt: new Date(Date.now() - 1000) } });
    const vExp = await pa.verifyPhoneOtp(P.b, codeB);
    chk("V-4", "ผิด 5 ครั้ง ⇒ locked แม้รหัสถูก · หมดอายุ ⇒ expired", vLocked.ok === false && vLocked.reason === "locked" && vExp.ok === false && vExp.reason === "expired", JSON.stringify({ vLocked, vExp }).slice(0, 120));

    console.log("── S2: รอบ 2 — normalizer · จอง attempt · mock guard ──");
    const n = (x: string) => pa.normalizeThaiMobile?.(x) ?? null;
    chk("S2-1", "normalizeThaiMobile: 0800017001/+66800017001/66800017001/+660800017001/660800017001 ⇒ +66800017001 · +12125551234/6612/++++++++++/0200017001 ⇒ null", typeof pa.normalizeThaiMobile === "function" && ["0800017001", "+66800017001", "66800017001", "+660800017001", "660800017001"].every((x) => n(x) === P.a) && ["+12125551234", "6612", "++++++++++", "0200017001", "+6680001700"].every((x) => n(x) === null) && (await pa.requestPhoneOtp("+12125551234", { send })).reason === "bad_phone" && (await pa.requestPhoneOtp("+660800017001", { send, now: new Date(Date.now() + 10 * 61_000) })).phone === P.a, `${n("+660800017001")} ${n("+12125551234")} ${n("6612")}`);
    await prisma.phoneOtp.deleteMany({ where: { phone: P.b } });
    await pa.requestPhoneOtp(P.b, { send, ip: "10.0.0.5" });
    const rowPar = await prisma.phoneOtp.findFirst({ where: { phone: P.b, consumedAt: null }, orderBy: { createdAt: "desc" } });
    const codePar = crack(P.b, rowPar!.codeHash)!;
    const wrongs = await Promise.all(Array.from({ length: 12 }, () => pa.verifyPhoneOtp(P.b, "000000")));
    const rowPar2 = await prisma.phoneOtp.findUnique({ where: { id: rowPar!.id } });
    const afterPar = await pa.verifyPhoneOtp(P.b, codePar);
    chk("S2-2", "เดาผิด 12 ทางพร้อมกัน ⇒ attempts ไม่เกิน 5 · ผลเป็น invalid/locked เท่านั้น · รหัสถูกหลังจากนั้น ⇒ locked (จอง attempt ก่อนเทียบ — R-S1.19b)", (rowPar2?.attempts ?? 99) <= 5 && wrongs.every((w: AnyMod) => w.ok === false && (w.reason === "invalid" || w.reason === "locked")) && wrongs.filter((w: AnyMod) => w.reason === "invalid").length <= 5 && afterPar.ok === false && afterPar.reason === "locked", `attempts=${rowPar2?.attempts} invalid=${wrongs.filter((w: AnyMod) => w.reason === "invalid").length} after=${afterPar.reason}`);
    await prisma.phoneOtp.deleteMany({ where: { phone: P.b } });
    process.env.APP_ENV = "production"; sms.__resetSmsProviderCacheForTests?.();
    const prodMock = sms.getSmsProvider();
    delete process.env.APP_ENV; sms.__resetSmsProviderCacheForTests?.();
    chk("S2-3", "APP_ENV=production + SMS_PROVIDER=mock ⇒ getSmsProvider null (R-S1.19c) · นอก production ⇒ mock กลับมา", prodMock === null && sms.getSmsProvider()?.name === "mock", `prod=${prodMock} after=${sms.getSmsProvider()?.name}`);

    console.log("── S: signup / link ──");
    await prisma.user.create({ data: { id: U.existing, email: "qcs19-existing@example.com", name: "คนเดิม" } });
    const sBad = await pa.signupWithPhone({ phone: P.a, email: "not-an-email", name: "x" });
    const sBad2 = await pa.signupWithPhone({ phone: P.a, email: "qcs19-new@example.com", name: "   " });
    const sEmail = await pa.signupWithPhone({ phone: P.a, email: "QCS19-Existing@example.com", name: "ใหม่" });
    chk("S-1", "signupWithPhone: อีเมลผิด/ชื่อว่าง ⇒ bad_input · อีเมลมีบัญชี (normalize ตัวเล็ก) ⇒ email_taken ข้อความ R8 (มี 'ผูกเบอร์') · ไม่สร้างอะไร", sBad.ok === false && sBad.reason === "bad_input" && sBad2.ok === false && sBad2.reason === "bad_input" && sEmail.ok === false && sEmail.reason === "email_taken" && /ผูกเบอร์/.test(sEmail.message) && (await prisma.userPhone.count({ where: { phone: P.a } })) === 0 && (await prisma.user.count({ where: { email: "qcs19-new@example.com" } })) === 0, JSON.stringify({ sBad, sEmail }).slice(0, 200));
    const sOk = await pa.signupWithPhone({ phone: P.a, email: "QCS19-New@Example.com ", name: " สมใจ " });
    const up = await prisma.userPhone.findUnique({ where: { phone: P.a } });
    const sDup = await pa.signupWithPhone({ phone: P.a, email: "qcs19-other@example.com", name: "อื่น" });
    const placeholder = `${P.a.replace("+", "")}@phone.shark.in.th`;
    const prefsNew = (sOk.ok ? (await prisma.user.findUnique({ where: { id: sOk.user.id } }))?.prefs : null) as AnyMod | null;
    chk("S-2", "สำเร็จ ⇒ User.email = placeholder <เบอร์>@phone.shark.in.th (R-S1.19a) · prefs.pendingEmail = อีเมลที่พิมพ์ (ตัวเล็ก trim) · name trim · UserPhone(verifiedAt) · เบอร์ซ้ำ ⇒ phone_taken · phoneOfUser · ไม่มี User ที่ email = อีเมลที่พิมพ์", sOk.ok === true && sOk.user.email === placeholder && prefsNew?.pendingEmail === "qcs19-new@example.com" && sOk.user.name === "สมใจ" && up?.userId === sOk.user.id && !!up?.verifiedAt && sDup.ok === false && sDup.reason === "phone_taken" && (await pa.phoneOfUser(sOk.user.id)) === P.a && (await pa.phoneOfUser(U.existing)) === null && (await prisma.user.count({ where: { email: "qcs19-new@example.com" } })) === 0, JSON.stringify({ email: sOk.ok ? sOk.user.email : sOk, pending: prefsNew?.pendingEmail, up: !!up, sDup }).slice(0, 220));
    // ยึดบัญชีผ่านอีเมล: ล็อกอินด้วยอีเมล OTP ที่คนอื่นอ้างไว้ ต้องไม่ตกไปบัญชีเบอร์ของผู้อ้าง
    const auth = await import("@/lib/core/auth");
    const vEmail = await (async () => { await auth.requestLogin("qcs19-new@example.com"); const tok = await prisma.authToken.findFirst({ where: { email: "qcs19-new@example.com", purpose: "OTP" }, orderBy: { createdAt: "desc" } }); let code = ""; for (let i = 0; i < 1_000_000; i++) { const c = String(i).padStart(6, "0"); if (sha(`qcs19-new@example.com:${c}`) === tok!.tokenHash) { code = c; break; } } return auth.verifyOtp("qcs19-new@example.com", code); })().catch((e: unknown) => ({ ok: false, err: errMsg(e) }));
    chk("S-2b", "ล็อกอินด้วยอีเมลที่ถูกอ้างตอนสมัครเบอร์ ⇒ ได้ user คนละคน (ไม่ใช่บัญชีเบอร์ของผู้อ้าง) — ไม่มีทางยึดบัญชี", (vEmail as AnyMod).ok === true && (vEmail as AnyMod).user?.id !== (sOk.ok ? sOk.user.id : "") && (vEmail as AnyMod).user?.email === "qcs19-new@example.com", JSON.stringify(vEmail).slice(0, 160));
    try { await prisma.authToken.deleteMany({ where: { email: "qcs19-new@example.com" } }); } catch { /* */ }
    const mail = await import("@/lib/core/email");
    const skipped = await (async () => { try { await mail.sendEmail(placeholder, "x", "y"); return true; } catch { return false; } })();
    chk("S-2c", "sendEmail ไปยัง placeholder @phone.shark.in.th ไม่ throw (ข้ามเงียบ)", skipped === true, "sendEmail โยน", "MAJOR");
    const l1 = await pa.linkPhoneToUser(U.existing, P.a);
    const l2 = await pa.linkPhoneToUser(U.existing, P.link);
    const l3 = await pa.linkPhoneToUser(U.existing, P.link);
    const l4 = await pa.linkPhoneToUser(U.existing, "abc");
    const l5 = await pa.linkPhoneToUser(U.existing, "+66800017005");
    chk("S-3", "linkPhoneToUser: เบอร์ของคนอื่น ⇒ phone_taken · เบอร์ว่าง ⇒ ok + UserPhone · ซ้ำเบอร์เดิมของตัวเอง ⇒ ok · เบอร์ผิด ⇒ bad_phone · มีเบอร์อื่นอยู่แล้ว ⇒ phone_change_locked (ไม่เปลี่ยน · R-S1.19e)", l1.ok === false && l1.reason === "phone_taken" && l2.ok === true && (await prisma.userPhone.findUnique({ where: { userId: U.existing } }))?.phone === P.link && l3.ok === true && l4.ok === false && l4.reason === "bad_phone" && l5.ok === false && l5.reason === "phone_change_locked" && (await prisma.userPhone.findUnique({ where: { userId: U.existing } }))?.phone === P.link, JSON.stringify({ l1, l2, l3, l4, l5 }).slice(0, 220));

    console.log("── R: routes ──");
    const reqRoute = (await import("@/app/api/mobile/auth/sms/request/route").catch(() => null)) as AnyMod | null;
    const verRoute = (await import("@/app/api/mobile/auth/sms/verify/route").catch(() => null)) as AnyMod | null;
    const linkRoute = (await import("@/app/api/mobile/auth/phone/link/route").catch(() => null)) as AnyMod | null;
    const meRoute = (await import("@/app/api/mobile/me/route")) as AnyMod;
    if (!reqRoute || !verRoute || !linkRoute) { for (const i of [1, 2, 3, 4, 5]) skip(`R-${i}`, "routes", "ไม่มี route sms/request · sms/verify · phone/link"); }
    else {
      await prisma.phoneOtp.deleteMany({ where: { phone: { in: [P.a, P.b, P.c] } } });
      const a1 = await json(await reqRoute.POST(req("/api/mobile/auth/sms/request", "POST", { phone: "0800017003" }, { "x-forwarded-for": "10.1.1.1" })));
      const a2 = await json(await reqRoute.POST(req("/api/mobile/auth/sms/request", "POST", { phone: "999" })));
      const a3 = await json(await reqRoute.POST(req("/api/mobile/auth/sms/request", "POST", {})));
      const rowC = await prisma.phoneOtp.findFirst({ where: { phone: P.c }, orderBy: { createdAt: "desc" } });
      process.env.SMS_PROVIDER = ""; sms.__resetSmsProviderCacheForTests?.();
      const a503 = await json(await reqRoute.POST(req("/api/mobile/auth/sms/request", "POST", { phone: "0800017002" })));
      process.env.SMS_PROVIDER = "mock"; sms.__resetSmsProviderCacheForTests?.();
      chk("R-1", "request: เบอร์ถูก ⇒ 200 {ok,resendAfterSec:60} + แถว (ip) + ไม่มี code ใน body · เบอร์ผิด ⇒ 200 ok (กัน enumeration) · ไม่มี phone ⇒ 400 · ไม่มีผู้ให้บริการ ⇒ 503 sms_unavailable ไทย (R-S1.19g)", a1.status === 200 && a1.body.ok === true && a1.body.resendAfterSec === 60 && rowC?.ip === "10.1.1.1" && !/\d{6}/.test(JSON.stringify(a1.body)) && a2.status === 200 && a2.body.ok === true && a3.status === 400 && a503.status === 503 && a503.body.error === "sms_unavailable" && thai(a503.body.message), JSON.stringify({ a1, a2: a2.status, a3: a3.status, a503 }).slice(0, 200));
      const codeC = crack(P.c, rowC!.codeHash)!;
      const v1 = await json(await verRoute.POST(req("/api/mobile/auth/sms/verify", "POST", { phone: P.c, code: "000000" })));
      const v2 = await json(await verRoute.POST(req("/api/mobile/auth/sms/verify", "POST", { phone: P.c, code: codeC })));
      const notConsumed = (await prisma.phoneOtp.findUnique({ where: { id: rowC!.id } }))?.consumedAt === null;
      chk("R-2", "verify: รหัสผิด ⇒ 401 · ถูก + ไม่มีบัญชี + ไม่มี signup ⇒ 200 {needSignup:true} ไม่มี token · ไม่ consume", v1.status === 401 && v2.status === 200 && v2.body.needSignup === true && !v2.body.token && notConsumed, JSON.stringify({ v1: v1.status, v2 }).slice(0, 160));
      const v3 = await json(await verRoute.POST(req("/api/mobile/auth/sms/verify", "POST", { phone: P.c, code: ` ${codeC.slice(0, 3)} ${codeC.slice(3)} `, signup: { email: "qcs19-c@example.com", name: "ซี" } })));
      const userC = await prisma.user.findUnique({ where: { email: `${P.c.replace("+", "")}@phone.shark.in.th` } });
      const v4 = await json(await verRoute.POST(req("/api/mobile/auth/sms/verify", "POST", { phone: P.c, code: codeC })));
      chk("R-3", "verify + signup (code มีช่องว่าง ⇒ ตัดตัวเลข R-S1.19h) ⇒ 200 token/expiresAt/user{phone, email null, pendingEmail}/isNew:true · User(placeholder)+UserPhone · consume · ใช้ code ซ้ำ ⇒ 401", v3.status === 200 && typeof v3.body.token === "string" && v3.body.isNew === true && v3.body.user?.phone === P.c && v3.body.user?.email === null && v3.body.user?.pendingEmail === "qcs19-c@example.com" && !!userC && (await prisma.userPhone.findUnique({ where: { userId: userC!.id } }))?.phone === P.c && v4.status === 401, JSON.stringify({ v3: { s: v3.status, isNew: v3.body.isNew, u: v3.body.user }, v4: v4.status }).slice(0, 220));
      // บัญชีเดิม (เบอร์ผูกแล้ว) เข้าด้วยเบอร์
      await reqRoute.POST(req("/api/mobile/auth/sms/request", "POST", { phone: P.c }));
      const rowC2 = await prisma.phoneOtp.findFirst({ where: { phone: P.c, consumedAt: null }, orderBy: { createdAt: "desc" } });
      const v5 = await json(await verRoute.POST(req("/api/mobile/auth/sms/verify", "POST", { phone: P.c, code: crack(P.c, rowC2!.codeHash)! })));
      const me = await json(await meRoute.GET(req("/api/mobile/me", "GET", undefined, { authorization: `Bearer ${v5.body.token}` })));
      chk("R-4", "บัญชีที่มีเบอร์: verify ⇒ 200 token isNew:false · GET /api/mobile/me ⇒ user.phone = เบอร์ · user.email null · pendingEmail", v5.status === 200 && v5.body.isNew === false && v5.body.user?.id === userC?.id && me.status === 200 && me.body.user?.phone === P.c && me.body.user?.email === null && me.body.user?.pendingEmail === "qcs19-c@example.com", JSON.stringify({ v5: { s: v5.status, isNew: v5.body.isNew }, me: me.body.user }).slice(0, 220));
      // link (R8): บัญชีเดิมไม่มีเบอร์
      await prisma.user.create({ data: { id: U.linker, email: "qcs19-linker@example.com", name: "ลิงก์" } });
      const { issueMobileToken } = await import("@/lib/mobile/auth");
      const tk = await issueMobileToken(U.linker, { userAgent: "qc" });
      const me0 = await json(await meRoute.GET(req("/api/mobile/me", "GET", undefined, { authorization: `Bearer ${tk.token}` })));
      await reqRoute.POST(req("/api/mobile/auth/sms/request", "POST", { phone: P.b }));
      const rowB2 = await prisma.phoneOtp.findFirst({ where: { phone: P.b, consumedAt: null }, orderBy: { createdAt: "desc" } });
      const codeB2 = crack(P.b, rowB2!.codeHash)!;
      const k0 = await json(await linkRoute.POST(req("/api/mobile/auth/phone/link", "POST", { phone: P.b, code: codeB2 })));
      const k1 = await json(await linkRoute.POST(req("/api/mobile/auth/phone/link", "POST", { phone: P.b, code: "000000" }, { authorization: `Bearer ${tk.token}` })));
      const k2 = await json(await linkRoute.POST(req("/api/mobile/auth/phone/link", "POST", { phone: P.b, code: codeB2 }, { authorization: `Bearer ${tk.token}` })));
      const me1 = await json(await meRoute.GET(req("/api/mobile/me", "GET", undefined, { authorization: `Bearer ${tk.token}` })));
      chk("R-5", "link: me.phone null ก่อน · ไม่มี Bearer ⇒ 401 · รหัสผิด ⇒ 401 · ถูก ⇒ 200 {ok,phone} · me.phone หลัง = เบอร์ · OTP consume", me0.body.user?.phone === null && k0.status === 401 && k1.status === 401 && k2.status === 200 && k2.body.phone === P.b && me1.body.user?.phone === P.b && (await prisma.phoneOtp.findUnique({ where: { id: rowB2!.id } }))?.consumedAt !== null, JSON.stringify({ me0: me0.body.user?.phone, k0: k0.status, k1: k1.status, k2, me1: me1.body.user?.phone }).slice(0, 200));
    }
  }
} finally {
  await cleanup();
}
console.log("── D: fitness ──");
{
  const f1 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-1", "pnpm fitness (มี env) exit 0", f1.status === 0, (f1.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const env2 = { ...process.env }; delete env2.DATABASE_URL; delete env2.DIRECT_URL;
  const f2 = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: env2, timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  chk("D-2", "pnpm fitness (ไม่มี env) exit 0", f2.status === 0, (f2.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | "));
  const src = existsSync(PA_FILE) ? readFileSync(PA_FILE, "utf8") : "";
  chk("D-3", "phone-auth.ts ไม่ import @/lib/env · ไม่แตะ AuthToken · core/auth.ts ไม่เปลี่ยน", (!src || (!/@\/lib\/env/.test(src) && !/authToken/.test(src))) && spawnSync("git", ["-C", ROOT, "diff", "--quiet", "3eca6a2b", "--", "src/lib/core/auth.ts", "prisma/schema/core.prisma"]).status === 0, "ตรวจไฟล์", "MAJOR");
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
