// QC — SECRETARY · เบอร์ทดสอบ SMS (SMS_TEST_LOGINS · 8 พ.ย. 2026 เจ้าของสั่ง) · ฐาน QC ของ RUN เลขาเท่านั้น
//   F  phoneTestCode: เบอร์ในรายชื่อ (รูปแบบ 0…/+66…) ได้รหัส · เบอร์อื่น null · รหัสผิดรูปถูกข้าม · เกิน 5 รายการถูกข้าม · env ว่าง null
//   Q  requestPhoneOtp เบอร์ทดสอบ: ไม่เรียก send · แถว hash = HMAC(phone:รหัสประจำ) · verify ok · ผิด 5 ครั้ง = locked
//   N  เบอร์อื่น: เรียก send ตามปกติ · รหัสประจำใช้ไม่ได้ (invalid)
//   R  route /api/mobile/auth/sms/request ไม่มีเกตเวย์: เบอร์อื่น 503 · เบอร์ทดสอบ 200
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-sec-smstest.mts
import { createHash, createHmac } from "node:crypto";
const LABEL = "qc-sec-smstest";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
try { process.loadEnvFile(process.env.QC_ENV_FILE ?? ".env.qc-sec"); } catch { /* ไม่มีไฟล์ */ }
for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) {
  const h = (() => { try { return new URL(process.env[n] ?? "").hostname.toLowerCase(); } catch { return ""; } })();
  if (!h.startsWith(SEC_HOST) || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — หยุด`); process.exit(4); }
}
delete process.env.SMS_PROVIDER; delete process.env.SMS_API_KEY; delete process.env.SMS_ENDPOINT;
const TEST = "+66800018001", OTHER = "+66800018002", CODE = "375140";
process.env.SMS_TEST_LOGINS = `0800018001:${CODE}, 0800018009:12ab56,bad`;
const hmac = (v: string) => (process.env.SESSION_SECRET ? createHmac("sha256", process.env.SESSION_SECRET) : createHash("sha256")).update(v).digest("hex");
let pass = 0; const failed: string[] = [];
const chk = (id: string, name: string, ok: boolean, d = "") => { if (ok) pass++; else failed.push(id); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${d ? " — " + d : ""}`); };

const { prisma } = await import("@/lib/core/db");
const pa = await import("@/lib/core/phone-auth");
const clean = () => prisma.phoneOtp.deleteMany({ where: { phone: { in: [TEST, OTHER] } } });
try {
  await clean();
  chk("F1", "เบอร์ทดสอบรูปแบบ 0… ได้รหัส", pa.phoneTestCode("0800018001") === CODE);
  chk("F2", "เบอร์ทดสอบรูปแบบ +66… ได้รหัส", pa.phoneTestCode(TEST) === CODE);
  chk("F3", "เบอร์อื่น = null", pa.phoneTestCode(OTHER) === null);
  chk("F4", "รหัสไม่ใช่ 6 หลัก ถูกข้าม", pa.phoneTestCode("0800018009") === null);
  const saved = process.env.SMS_TEST_LOGINS;
  process.env.SMS_TEST_LOGINS = ["0800018101", "0800018102", "0800018103", "0800018104", "0800018105", "0800018106"].map((p) => `${p}:111111`).join(",");
  chk("F5", "เกิน 5 รายการ ถูกข้าม", pa.phoneTestCode("0800018105") === "111111" && pa.phoneTestCode("0800018106") === null);
  process.env.SMS_TEST_LOGINS = "";
  chk("F6", "env ว่าง = null", pa.phoneTestCode(TEST) === null);
  process.env.SMS_TEST_LOGINS = saved;

  let sent = 0; const spy = async () => { sent++; return { ok: true }; };
  const r1 = await pa.requestPhoneOtp(TEST, { send: spy, ip: "10.9.9.1" });
  chk("Q1", "ขอรหัสเบอร์ทดสอบ ok · ไม่ส่ง SMS", r1.ok === true && sent === 0, JSON.stringify(r1));
  const row = await prisma.phoneOtp.findFirst({ where: { phone: TEST }, orderBy: { createdAt: "desc" } });
  chk("Q2", "แถวเก็บเป็น HMAC ของรหัสประจำ (ไม่เก็บรหัสตรง)", !!row && row.codeHash === hmac(`${TEST}:${CODE}`) && row.codeHash !== CODE);
  const v1 = await pa.verifyPhoneOtp(TEST, CODE);
  chk("Q3", "ตรวจรหัสประจำผ่าน", v1.ok === true);
  for (let i = 0; i < 5; i++) await pa.verifyPhoneOtp(TEST, "000000");
  const v2 = await pa.verifyPhoneOtp(TEST, CODE);
  chk("Q4", "ผิด 5 ครั้ง = locked แม้เป็นเบอร์ทดสอบ", v2.ok === false && (v2 as { reason?: string }).reason === "locked", JSON.stringify(v2));

  const r2 = await pa.requestPhoneOtp(OTHER, { send: spy, ip: "10.9.9.2" });
  chk("N1", "เบอร์อื่นเรียก send ตามปกติ", r2.ok === true && sent === 1);
  const v3 = await pa.verifyPhoneOtp(OTHER, CODE);
  chk("N2", "รหัสประจำใช้กับเบอร์อื่นไม่ได้", v3.ok === false && (v3 as { reason?: string }).reason === "invalid", JSON.stringify(v3));

  await clean();
  const route = await import("@/app/api/mobile/auth/sms/request/route");
  const call = (phone: string) => route.POST(new Request("http://qc.local/api/mobile/auth/sms/request", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.3" }, body: JSON.stringify({ phone }) }));
  chk("R1", "ไม่มีเกตเวย์: เบอร์อื่น 503", (await call("0800018002")).status === 503);
  chk("R2", "ไม่มีเกตเวย์: เบอร์ทดสอบ 200", (await call("0800018001")).status === 200);
} finally {
  await clean();
  await prisma.$disconnect();
}
console.log(`${LABEL}: ${pass}/${pass + failed.length}${failed.length ? " · FAIL " + failed.join(",") : ""}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: pass + failed.length, passed: pass, failed }));
process.exit(failed.length ? 1 : 0);
