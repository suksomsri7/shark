// QC — ความพร้อมยื่นสโตร์ (App Store / Google Play / Meta) · Fable oracle
// ⚠️ standalone-typesafe: อ่านไฟล์อย่างเดียว ไม่แตะ DB ไม่ต่อเน็ต
//
// ทำไมต้องมีด่านนี้: URL พวกนี้ถูก "ลงทะเบียนไว้ที่อื่น" (App Store Connect, Meta App Dashboard)
// ถ้าวันหนึ่งมีคนย้าย/ลบ route ทิ้ง เว็บเรายังเขียวหมดทุกข้อสอบ แต่ **การยื่นแอปพัง**
// และไม่มีใครรู้จนกว่าจะโดนตีกลับ → ด่านนี้ผูก "หน้าเว็บ" เข้ากับ "ข้อบังคับของสโตร์" ให้เป็นกลไก
//
// สัญญาที่ต้องจริงเสมอ:
//   AS-1 หน้าที่สโตร์บังคับต้องมีอยู่จริงทุกหน้า (privacy · terms · support · account-deletion)
//   AS-2 /data-deletion ต้องยังใช้ได้ — Meta ลงทะเบียน URL นี้ไว้แล้ว ห้ามลบทิ้งเฉย ๆ
//   AS-3 ทุกหน้ามีช่องทางติดต่อจริง (support@shark.in.th) — Apple ตรวจว่าติดต่อได้จริง
//   AS-4 ลิงก์ใน footer ชี้ไปหน้าที่มีจริงทุกอัน (ผู้ตรวจกดแล้วต้องไม่เจอ 404)
//   AS-5 🔴 หน้ากฎหมายห้ามสัญญาเกินของจริง — เส้นทางในแอปที่หน้านั้นบอกให้ผู้ใช้เดินตาม ต้องมีไฟล์อยู่จริง
//   AS-6 landing ต้องอธิบายว่าแอปทำอะไร (Apple 2.3 Accurate Metadata) ไม่ใช่หน้าเปล่า
//   AS-7 🔴 ของที่ "เน่าตามเวลา" ต้องรีเฟรชได้ด้วยการรันซ้ำ + ชื่อแอปในเครื่องต้องตรงกับชื่อในสโตร์
//
// รัน: pnpm qc:appstore
import { existsSync, readFileSync } from "node:fs";

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const SUPPORT_EMAIL = "support@shark.in.th";

// route สาธารณะ → ไฟล์ที่ต้องมี
const ROUTES: Record<string, string> = {
  "/": "src/app/page.tsx",
  "/privacy": "src/app/(marketing)/privacy/page.tsx",
  "/terms": "src/app/(marketing)/terms/page.tsx",
  "/support": "src/app/(marketing)/support/page.tsx",
  "/account-deletion": "src/app/(marketing)/account-deletion/page.tsx",
  "/data-deletion": "src/app/(marketing)/data-deletion/page.tsx",
  "/login": "src/app/(marketing)/login/page.tsx",
};

// ── AS-1 หน้าที่สโตร์บังคับ ──
console.log("── AS-1 หน้าที่สโตร์บังคับต้องมีจริง ──");
const REQUIRED = ["/privacy", "/terms", "/support", "/account-deletion"] as const;
for (const r of REQUIRED) {
  chk(`AS-1${r}`, `มีหน้า ${r}`, existsSync(ROUTES[r]!), "มีไฟล์", ROUTES[r]!);
}

// ── AS-2 URL ที่ลงทะเบียนกับ Meta ไว้แล้ว ──
console.log("\n── AS-2 URL เดิมที่ลงทะเบียนไว้ภายนอก ──");
chk("AS-2.1", "/data-deletion ยังใช้ได้ (Meta ลงทะเบียนไว้ ห้ามลบ)", existsSync(ROUTES["/data-deletion"]!), "มีไฟล์", "หาย");
{
  const src = read(ROUTES["/data-deletion"]!);
  const redirects = /permanentRedirect\(\s*["']\/account-deletion["']\s*\)/.test(src);
  const hasOwnContent = /ลบ|delete/i.test(src) && src.length > 1200;
  chk("AS-2.2", "/data-deletion ชี้ไป /account-deletion หรือมีเนื้อหาเอง (ห้ามเป็นหน้าว่าง)",
    redirects || hasOwnContent, "redirect หรือมีเนื้อหา", "ว่างเปล่า");
}

// ── AS-3 ช่องทางติดต่อจริง ──
console.log("\n── AS-3 ช่องทางติดต่อ ──");
for (const r of ["/support", "/account-deletion"]) {
  const src = read(ROUTES[r]!);
  // อีเมลอาจมาจากค่าคงที่กลาง (SUPPORT_EMAIL) — นับว่าผ่านทั้งสองแบบ
  const ok = src.includes(SUPPORT_EMAIL) || /SUPPORT_EMAIL/.test(src);
  chk(`AS-3${r}`, `${r} มีอีเมลติดต่อ`, ok, SUPPORT_EMAIL, "ไม่พบ");
}
chk("AS-3.chrome", `ค่าคงที่ SUPPORT_EMAIL = ${SUPPORT_EMAIL}`,
  read("src/components/public-chrome.tsx").includes(SUPPORT_EMAIL), SUPPORT_EMAIL, "ไม่ตรง");

// ── AS-4 ลิงก์ใน footer ต้องไม่ตาย ──
console.log("\n── AS-4 ลิงก์ใน footer ชี้หน้าที่มีจริง ──");
{
  const chrome = read("src/components/public-chrome.tsx");
  const hrefs = [...chrome.matchAll(/href:\s*"(\/[a-z0-9/-]*)"/g)].map((m) => m[1]!);
  const dead = hrefs.filter((h) => !ROUTES[h] || !existsSync(ROUTES[h]!));
  chk("AS-4.1", `ลิงก์ footer ${hrefs.length} อันไม่ตาย`, dead.length === 0, "0 ตาย", dead.join(",") || "-");
  chk("AS-4.2", "footer ถูกใช้จริงทั้ง landing และกลุ่มหน้าสาธารณะ",
    /PublicFooter/.test(read("src/app/page.tsx")) && /PublicFooter/.test(read("src/app/(marketing)/layout.tsx")),
    "ใช้ทั้ง 2 ที่", "ขาด");
}

// ── AS-5 🔴 ห้ามสัญญาเกินของจริง ──
// หน้ากฎหมายบอกผู้ใช้ให้เดินไป "ตั้งค่า → ความเป็นส่วนตัว (PDPA)" แล้วกดลบ
// ผู้ตรวจของ Apple จะกดตามจริง → หน้านั้นกับ action ต้องมีอยู่ ไม่ใช่แค่เขียนไว้สวย ๆ
console.log("\n── AS-5 คำสัญญาในหน้ากฎหมายต้องมีของจริงรองรับ ──");
{
  const del = read(ROUTES["/account-deletion"]!);
  const claimsPdpaPath = /ความเป็นส่วนตัว\s*\(PDPA\)/.test(del);
  chk("AS-5.1", "หน้าลบบัญชีอ้างเส้นทางในแอป (ตั้งค่า → ความเป็นส่วนตัว)", claimsPdpaPath, "อ้าง", "ไม่อ้าง", "MAJOR");
  chk("AS-5.2", "🔴 เส้นทางที่อ้างมีอยู่จริง — หน้า /app/settings/privacy",
    existsSync("src/app/app/settings/privacy/page.tsx"), "มีไฟล์", "ไม่มี");
  const actions = read("src/lib/pdpa/actions.ts");
  chk("AS-5.3", "🔴 ปุ่มที่อ้างมีของจริง — ขอลบร้าน + ดาวน์โหลดข้อมูล",
    /export async function requestDeleteAction/.test(actions) && /export async function exportMyDataAction/.test(actions),
    "มีทั้ง 2 action", "ขาด");
  chk("AS-5.4", "🔴 ช่วงพัก 30 วันถูกกวาดลบจริงด้วย cron (ไม่ใช่ค้าง PENDING_DELETE ตลอดกาล)",
    /sweepPendingDeletes/.test(read("src/lib/platform/cron.ts")), "cron เรียก sweepPendingDeletes", "ไม่เรียก");

  // เจอของจริงตอนเขียนหน้านี้: ผมเผลอเขียนว่า "แจ้งปัญหาจากปุ่มช่วยเหลือ" แต่ปุ่มนั้น
  // ถูกถอดออกไปแล้วตั้งแต่ help-v2 (เปลี่ยนเป็นแจ้งผ่านแชท AI → openCaseFromAi)
  // → ด่านนี้ผูกข้อความในหน้า support เข้ากับกลไกที่ยังมีอยู่จริง
  const sup = read(ROUTES["/support"]!);
  const claimsHelpButton = /ปุ่ม\s*[“"]?ช่วยเหลือ/.test(sup);
  const helpButtonGone = /เอาปุ่มศูนย์ช่วยเหลือออก/.test(read("src/components/app-shell/Topbar.tsx"));
  chk("AS-5.5", "🔴 /support ไม่อ้างปุ่มช่วยเหลือที่ถูกถอดออกไปแล้ว",
    !(claimsHelpButton && helpButtonGone), "ไม่อ้างปุ่มที่ไม่มี", "อ้างปุ่มที่ถอดไปแล้ว");
  chk("AS-5.6", "เส้นทางแจ้งปัญหาที่ /support อ้าง (แชท AI → เปิดเคส) มีของจริง",
    /openCaseFromAi/.test(read("src/lib/support/service.ts")), "มี openCaseFromAi", "ไม่มี");

  // 🔴 Apple 5.1.1(v): ลบ "บัญชี" ต้องทำได้จากในแอป ไม่ใช่แค่ลบ "ร้าน" หรือให้ส่งอีเมลมา
  chk("AS-5.7", "🔴 หน้าลบบัญชีบอกว่าลบบัญชีเองได้ในแอป (ไม่ใช่แค่ให้เมลมา)",
    /ลบบัญชีของฉัน/.test(del), "อ้างปุ่มลบบัญชีในแอป", "ไม่อ้าง");
  chk("AS-5.8", "🔴 ปุ่มลบบัญชีมีของจริง — action + service + อยู่บนหน้า PDPA",
    /export async function deleteMyAccountAction/.test(read("src/lib/pdpa/actions.ts")) &&
      /export async function deleteAccount/.test(read("src/lib/platform/account-deletion.ts")) &&
      /deleteMyAccountAction/.test(read("src/app/app/settings/privacy/page.tsx")),
    "ครบ 3 ชั้น", "ขาด");
  chk("AS-5.9", "ลบบัญชีไม่จำกัดเฉพาะ OWNER (พนักงานต้องลบตัวเองได้)",
    !/deleteMyAccountAction[\s\S]{0,200}requireOwner/.test(read("src/lib/pdpa/actions.ts")), "ใช้ requireAuth", "ติด requireOwner");
}

// ── AS-6 landing ต้องบอกว่าแอปทำอะไร ──
console.log("\n── AS-6 landing อธิบายแอป (Apple 2.3 Accurate Metadata) ──");
{
  const src = read("src/app/page.tsx");
  // เดิมนับ `title: "` ในไฟล์ = นับ "ลิสต์ที่พิมพ์มือ" ซึ่งวัดผิดตัว: ลิสต์นั้นเพี้ยนจากแอปได้
  // (และเพี้ยนจริง — ไอคอน POS ในลิสต์เป็น 💵 แต่แอปใช้ 🧾) · 21 ส.ค. landing อ่าน SYSTEM_DEFS ตรง ๆ
  // → วัดที่ "รายการที่ผู้ใช้เห็นจริง" = จำนวนระบบ available ในทะเบียน + ต้องผูกกับทะเบียนจริง
  const { SYSTEM_DEFS } = await import("@/lib/systems");
  const available = SYSTEM_DEFS.filter((s) => s.status === "available").length;
  chk("AS-6.1", `landing มีรายการความสามารถ ≥ 6 อัน (มี ${available})`, available >= 6, "≥6", String(available), "MAJOR");
  chk("AS-6.2", "landing มีทางไปศูนย์ช่วยเหลือ", /\/support/.test(src), "มีลิงก์", "ไม่มี", "MAJOR");
  chk("AS-6.3", "🔴 landing อ่านรายการระบบจากทะเบียนเดียวกับแอป (ห้ามพิมพ์ลิสต์ซ้ำ — เพี้ยนจากแอปได้)",
    /SYSTEM_DEFS/.test(src), "ใช้ SYSTEM_DEFS", "พิมพ์ลิสต์เอง");
  // ภาพบน landing ต้องมีไฟล์อยู่จริง — ผู้ตรวจเปิดหน้าแล้วเจอรูปแตกคือหน้าไม่พร้อมยื่น
  const imgs = [...src.matchAll(/src:\s*"(\/[^"]+\.(?:webp|png|jpg|jpeg|svg))"/g)].map((m) => m[1]!);
  const missing = imgs.filter((p) => !existsSync(`public${p}`));
  chk("AS-6.4", `รูปบน landing มีไฟล์จริงครบ (${imgs.length} รูป)`,
    imgs.length > 0 && missing.length === 0, "ครบ", missing.join(",") || "ไม่มีรูปเลย");
}

// ── AS-7 ข้อมูลร้านผู้ตรวจต้องรีเฟรชได้ + ชื่อแอปต้องตรงกัน ──
// ที่มา (22 ส.ค.): เจอว่าบิลขายในร้านผู้ตรวจลงวันที่ของเมื่อวาน → "ยอดขายวันนี้" เป็น ฿0
// ทั้งที่สคริปต์ seed ตั้งใจกันเรื่องนี้ไว้ — เพราะกุญแจกันซ้ำของบิลไม่มีวันที่อยู่ในตัว
// รันซ้ำก่อนยื่นกี่รอบก็ไม่เกิดบิลใหม่ · ด่านนี้ทำให้ "รันซ้ำแล้วสด" เป็นกลไก ไม่ใช่ความจำของคน
console.log("\n── AS-7 ร้านผู้ตรวจรีเฟรชได้ + ชื่อแอปตรงสโตร์ ──");
{
  const seed = read("scripts/seed-review-shop.mts");
  chk("AS-7.1", "🔴 กุญแจกันซ้ำของบิลขายมีวันที่ (รันซ้ำวันใหม่ = ยอดขายวันนี้ไม่เป็น ฿0)",
    /idempotencyKey:\s*`seed-review-sale-\$\{dayKey\}/.test(seed), "มี ${dayKey}", "ไม่มีวันที่ในกุญแจ");
  chk("AS-7.2", "กุญแจกันซ้ำของนัดหมายมีวันที่ (ปฏิทินผู้ตรวจไม่ว่าง)",
    /idempotencyKey:\s*`seed-review-appt-\$\{p\.dateStr\}/.test(seed), "มี ${p.dateStr}", "ไม่มีวันที่ในกุญแจ");
  chk("AS-7.3", "สคริปต์ seed ไม่มีวันที่ฮาร์ดโค้ด (ระเบิดเวลา)",
    !/["'`]20\d\d-\d\d-\d\d/.test(seed), "ไม่มี", "มีวันที่ตายตัว", "MAJOR");

  // ชื่อใต้ไอคอน (app.json) กับชื่อในสโตร์ (asc-listing.py) เพี้ยนกันได้ง่าย เพราะอยู่คนละไฟล์
  // และแก้คนละจังหวะ (สโตร์แก้ทันที · ใต้ไอคอนต้องบิลด์ใหม่) → ผูกให้เพี้ยนแล้วแดง
  const appJson = read("apps/mobile/app.json");
  const asc = read("scripts/asc-listing.py");
  const localName = (appJson.match(/"name":\s*"([^"]+)"/) ?? [])[1] ?? "";
  const storeName = (asc.match(/"locale":\s*locale,\s*"name":\s*"([^"]+)"/) ?? [])[1] ?? "";
  chk("AS-7.4", `🔴 ชื่อใต้ไอคอน = ชื่อในสโตร์ (${localName || "?"} / ${storeName || "?"})`,
    Boolean(localName) && localName === storeName, storeName || "อ่านไม่ออก", localName || "อ่านไม่ออก");
}

const failed = cks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: ความพร้อมยื่นสโตร์ =====");
console.log(`ผ่าน ${cks.length - failed.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({
  total: cks.length,
  passed: cks.length - failed.length,
  findings: failed.map((c) => ({ id: c.id, sev: c.sev })),
}));
process.exit(failed.length ? 1 : 0);
