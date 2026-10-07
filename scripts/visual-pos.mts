// visual-pos.mts — ถ่ายภาพหน้าจอจริงของ POS 3 ขนาด (RUN POS · ใบ P0.1)
//
// ใช้:
//   pnpm exec tsx scripts/visual-pos.mts <wo|all> --user owner|cashier --base http://127.0.0.1:<port> [--tenant coffee|resto] [--page register]
//   pnpm exec tsx scripts/visual-pos.mts all --user cashier --dry        # พิมพ์แผนการถ่าย (ไม่ต่อ DB · ไม่ต่อเซิร์ฟเวอร์ · ไม่เปิด chromium)
//   ฐานข้อมูลของ "เซิร์ฟเวอร์" ต้องเป็นฐานเดียวกับที่สคริปต์นี้ mint session (ระหว่าง CRM RUN = QC4):
//   bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts all --user owner --base http://127.0.0.1:<port>
//
// ถ่ายอะไร: หน้าที่มีจริงวันนี้ `/app/sys/[id]/pos/{register,sales,products,close}` (POS_PAGES) ×
//   1440×900 · 1024×768 (iPad แนวนอน) · 390×844 → `.qc-shots/pos/<wo>/<page>-<user>-<w>x<h>.png`
//   บันทึกต่อภาพ: HTTP status เทียบ PAGE_EXPECT (owner 200 · cashier บันทึกอย่างเดียว) · URL ปลายทาง (เด้งไป /login = mint ไม่ติด) ·
//   console error · ล้นแนวนอนที่ html/body/main (scrollWidth > clientWidth) · คำขอย่อย 5xx = ตก (4xx บันทึกอย่างเดียว)
//   <wo> รับเฉพาะ ^[A-Za-z0-9._-]+$ ไม่มี '..' · SIGINT/SIGTERM/SIGHUP = ทำความสะอาดแบบเดียวกับ finally ก่อนออก
//   ท้ายสุด `JSON_SUMMARY {...}` + `.qc-shots/pos/<wo>/summary-<user>.json`
//
// POS P1.3 ▸ ถ่าย "สถานะ" ของหน้าขายใหม่ (wo ขึ้นต้น p1.3 หรือ --states) — หน้า register แทนที่ภาพเดียวด้วยชุดสถานะ:
//   default · cart3 (3 บรรทัด + ส่วนลดรายการ) · line-editor · bill-discount · custom-item (owner = กล่อง · cashier = ข้อความเหตุผล)
//   paydlg-cash · sale-done (1440 เท่านั้น — ⚠️ สร้างบิลขายจริง PAID เงินสด 1 ใบต่อผู้ใช้ในร้าน QC: อเมริกาโน่×2 + ลาเต้ ไม่ผูกสต็อก)
//   search-empty · stock-warn (การ์ดเหลือน้อย/หมด/ปิดขาย + กล่องเตือนในบรรทัด) · mobile-sheet (390 เท่านั้น)
//   B2.5: cart4-01 (ตะกร้า 4 บรรทัดเท่าภาพ 01 · ไม่มีคูปอง = P1.12) · offline (ภาพ 19ง) · แคตตาล็อกว่าง = ข้าม (ดู STATE_PLAN)
//   ไฟล์: `<wo>/register-<state>-<user>-<w>x<h>[-en].png` · LOCALE=en (env) = ถ่ายเฉพาะ 1440 + คุกกี้ LOCALE=en (ภาพ 20B)
//   การ์ดเหลือน้อย/หมด/ปิดขาย: สร้างสินค้าชั่วคราว 3 ตัว (+ InvItem 2 ตัว) ที่สาขาของรอบนี้ ลบทิ้งใน finally/signal เสมอ
//     (id `posqc-vis-<pid>-*` · ซากที่ค้างเกิน 1 ชม. ถูกกวาดตอนเริ่ม) — ร้าน QC POS เท่านั้น (`--tenant coffee`)
//   P1.2 U R2: options-popover (desktop/ipad/mobile · สินค้าชั่วคราวมีตัวแปร 2 ตัว + กลุ่มตัวเลือก 4 กลุ่มเท่าภาพ 01 → เลือกตัวแปร +
//     ชิป 2 กลุ่ม "M +10" "นมโอ๊ต +15" + จำนวน 2 · md+ = ป๊อปโอเวอร์ยึดการ์ด · 390 = แผ่นล่าง) · weigh (desktop/mobile · สินค้าชั่งชั่วคราว ฿350/กก.
//     → กล่องน้ำหนัก · owner พิมพ์ 250 กรัม · cashier เห็นข้อความต้องมีสิทธิ์) — กลุ่ม/ตัวเลือก (MenuOptionGroup/Choice) ชั่วคราวลบใน finally ด้วย
//     (ชื่อกลุ่มซ้ำกับของร้านในสาขาเดียวกัน ⇒ ต่อท้าย " (QC <pid>)") · การ์ดถูกหาด้วยคำค้น (ช่องค้นหาจึงมีคำค้นค้างในภาพ)
//   P1.2 U R2 ข้อ 7 (กะ · P1.9): ธง registerV2 ⇒ บังคับเปิดกะ (required.register) — ก่อนทุกสถานะ ถ้ายังเห็นแถบ pos-reg-shift-required
//     (หลังรอสถานะของเครื่องมา 5 วิ) ⇒ เปิดกะผ่าน UI จริง: ลิงก์ "เปิดกะ" → หน้า /pos/shifts · เงินทอนตั้งต้น 1,000 → ยืนยัน → กลับหน้าขาย
//     1 กะต่อผู้ใช้ต่อรอบ (deviceId อยู่ใน localStorage ของ browser เดียวกันทุกแท็บ) · ปิดกะใน finally ด้วย closeShift ของบริการ (เจ้าของร้าน ·
//     นับเงิน = ยอดคาด ⇒ ขาด/เกิน 0 ไม่ต้องเหตุผล) — ปิดไม่ได้ = บันทึกใน summary (shiftClose) ไม่โยน · ห้ามปิดธง required.register เพื่อเลี่ยง
//   ต้องเปิดธง settings.pos.registerV2 ของร้าน QC ก่อน (scripts/seed-pos-qc.mts) — ไม่งั้นได้หน้าขายเดิม = ขั้นตอนสถานะตก
//   ขั้นตอนพัง = ภาพนั้นตก (บันทึก stepError) แต่ยังถ่ายหน้าจอ ณ จุดที่พังไว้ดู ◂
//
// 🔴 ไม่มีค่าปริยายของ base — ไม่ส่ง `--base`/`QC_BASE` = exit 2 · ต่อไม่ได้ = exit 2 · `:3215` = exit 2
//    (พอร์ต 3215 เป็นของเซิร์ฟเวอร์ CRM RUN — LANE-RULES ข้อ 4 · ตั้ง POS_VISUAL_ALLOW_3215=1 เมื่อ CRM ปิดแล้วเท่านั้น)
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้น qc- (ต้องมีเซิร์ฟเวอร์ + chromium — ไม่เข้า qc:all)
// 🔴 session ที่ mint ต้องถูกลบเสมอ: ปักธง userAgent `qc-visual-pos` · ลบ "เฉพาะ id ของรอบนี้" ใน finally + กวาดซากที่หมดอายุแล้ว
//    (ห้าม process.exit() ระหว่าง mint→finally — exit ข้าม finally = token ค้างในฐาน QC)
// 🔴 โปรไฟล์ chromium (`/tmp/chr-pos-<pid>` + สำเนาใน snap-private-tmp) ลบทุกครั้ง ทั้งจบปกติ/ตาย/ถูก Ctrl-C
//    (snap chromium ทิ้งโปรไฟล์ ~GB ต่อรอบ — เคยทำดิสก์ VPS 99%) · ลบเฉพาะของ pid นี้ ห้ามกวาด /tmp

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { PQC, POS_PAGES, POS_VIEWPORTS, type PosPage } from "./pos-qc-env.mjs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ═══════════════════ 1. อาร์กิวเมนต์ ═══════════════════
const argv = process.argv.slice(2);
const flag = (name: string): string | null => (argv.includes(name) ? (argv[argv.indexOf(name) + 1] ?? null) : null);
const DRY = argv.includes("--dry");
const WO = argv[0] && !argv[0].startsWith("--") ? argv[0] : null;
const USERS = ["owner", "cashier"] as const;
type UserKey = (typeof USERS)[number];
const userKey = (flag("--user") ?? "owner") as UserKey;
const tenantKey = (flag("--tenant") ?? "coffee") as "coffee" | "resto";
const onlyPage = flag("--page");

function die(msg: string): never {
  console.error(`❌ ${msg}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, shots: [], failures: 0, fatal: msg })}`);
  process.exit(2);
}
if (!WO) die("ต้องระบุ <wo|all> เป็นอาร์กิวเมนต์แรก เช่น `visual-pos.mts p1.3 --user owner --base http://127.0.0.1:3300`");
// wo กลายเป็นชื่อโฟลเดอร์ใต้ .qc-shots/pos — รับเฉพาะตัวอักษรปลอดภัย ห้าม `..` (กันเขียนไฟล์ออกนอกโฟลเดอร์)
if (!/^[A-Za-z0-9._-]+$/.test(WO) || WO.includes("..")) die(`<wo> "${WO}" ไม่ถูกต้อง — ใช้ได้เฉพาะ A-Z a-z 0-9 . _ - และห้ามมี ".."`);
if (!(USERS as readonly string[]).includes(userKey)) die(`--user ${userKey} ไม่รู้จัก — ใช้ได้: ${USERS.join(" · ")}`);
if (tenantKey !== "coffee" && tenantKey !== "resto") die(`--tenant ${tenantKey} ไม่รู้จัก — ใช้ได้: coffee · resto`);
if (onlyPage && !(POS_PAGES as readonly string[]).includes(onlyPage)) die(`--page ${onlyPage} ไม่รู้จัก — ใช้ได้: ${POS_PAGES.join(" · ")}`);

const T = PQC[tenantKey];
const U = T.users[userKey];
// สาขาที่ผู้ใช้เข้าได้ (แคชเชียร์ = สาขาเดียว) — ใส่ ?unit= ให้หน้าขายเปิดสาขาที่ถูก
const unitKey = U.units[0] === "*" ? Object.keys(T.units)[0]! : U.units[0]!;
const unitId = (T.units as Record<string, { id: string }>)[unitKey]!.id;
const SYS = T.systems.POS.id;
const pages: PosPage[] = onlyPage ? [onlyPage as PosPage] : [...POS_PAGES];
/**
 * สิ่งที่คาดต่อหน้า ต่อบทบาท (HTTP) — owner ต้องได้ 200 · cashier = "record" (บันทึกอย่างเดียว ไม่ตัดสิน)
 * จนกว่าผู้คุมงานรันจริงครั้งแรกแล้วกำหนด 200|404 ตามพฤติกรรมจริง (มติรอบ 2 · ใบ P1.15/P4.2 เป็นเจ้าของตาราง)
 */
const PAGE_EXPECT: Record<PosPage, Record<UserKey, number | "record">> = {
  register: { owner: 200, cashier: "record" },
  sales: { owner: 200, cashier: "record" },
  products: { owner: 200, cashier: "record" },
  close: { owner: 200, cashier: "record" },
};
const pathOf = (p: PosPage) => `/app/sys/${SYS}/pos/${p}${p === "register" ? `?unit=${unitId}` : ""}`;
const OUT = `${PQC.shotsDir}/${WO}`;
const fileOf = (p: PosPage, w: number, h: number) => `${OUT}/${p}-${userKey}-${w}x${h}.png`;

// ── POS P1.3 ▸ แผนสถานะของหน้าขายใหม่ ──
const STATES_ON = /^p1\.3/i.test(WO) || argv.includes("--states");
const LOCALE_EN = process.env.LOCALE === "en";
type Device = (typeof POS_VIEWPORTS)[number]["name"];
type StateKey = "default" | "cart3" | "cart4-01" | "line-editor" | "bill-discount" | "custom-item" | "paydlg-cash" | "sale-done" | "search-empty" | "stock-warn" | "offline" | "mobile-sheet" | "options-popover" | "weigh";
const STATE_PLAN: { key: StateKey; devices: readonly Device[]; note: string }[] = [
  { key: "default", devices: ["desktop", "ipad", "mobile"], note: "เปิดหน้า (ตะกร้าว่าง) — การ์ดเหลือน้อย/หมด/ปิดขายของ fixture อยู่ในกริด" },
  { key: "cart3", devices: ["desktop", "ipad", "mobile"], note: "อเมริกาโน่×2 · ลาเต้ (ลด ฿10) · ครัวซองต์ (สต็อก N → N−1)" },
  // B2.5 (สเปก §7 · ตัวเทียบภาพ 01): ตะกร้า 4 บรรทัดเท่าภาพ — ลาเต้ ×2 ฿100 · อเมริกาโน่ ฿70 · ครัวซองต์อัลมอนด์ ฿95 −฿10 · เมล็ดกาแฟ 250 g ฿320 (สต็อก 11)
  //   🔴 ไม่มีคูปอง WELCOME50 — คูปองเลื่อนไป P1.12 (มติ Q12) · บรรทัด VAT ขึ้นกับสมุดบัญชีของร้าน QC (ไม่ตั้งในสคริปต์นี้)
  { key: "cart4-01", devices: ["desktop", "ipad", "mobile"], note: "ตะกร้า 4 บรรทัดเท่าภาพ 01 (สินค้าชั่วคราว 4 ตัว · ไม่มีคูปอง = P1.12)" },
  { key: "line-editor", devices: ["desktop", "ipad", "mobile"], note: "cart3 + เปิดตัวแก้บรรทัดแรก" },
  { key: "bill-discount", devices: ["desktop", "ipad", "mobile"], note: "cart3 + กล่องส่วนลดท้ายบิล" },
  { key: "custom-item", devices: ["desktop", "ipad", "mobile"], note: "owner = กล่องรายการกำหนดเอง · cashier = ข้อความเหตุผล (ไม่มีสิทธิ์ตั้งราคา)" },
  { key: "paydlg-cash", devices: ["desktop", "ipad", "mobile"], note: "cart3 + กล่องชำระ เงินสด รับพอดี" },
  { key: "sale-done", devices: ["desktop"], note: "⚠️ ขายจริง 1 บิล (อเมริกาโน่×2 + ลาเต้ · เงินสด) → ขายสำเร็จ" },
  { key: "search-empty", devices: ["desktop", "ipad", "mobile"], note: "ค้นคำที่ไม่มี → กล่องไม่พบ" },
  { key: "stock-warn", devices: ["desktop", "ipad", "mobile"], note: "สินค้าเหลือ 2 ×3 → กล่องเตือนสต็อกในบรรทัด (19ฉ)" },
  // B2.5 (ภาพ 19ง): ออฟไลน์ = puppeteer setOfflineMode → แถบดำ + ปุ่มชำระปิด
  //   ข้าม "แคตตาล็อกว่าง" (19): ต้องมีสาขา POS ที่ไม่มีสินค้า/หมวดเลย — ร้าน QC มีแคตตาล็อกเต็ม สร้างสาขาชั่วคราว (BusinessUnit + ผูก POS) เกินขอบเขตสคริปต์ภาพ
  { key: "offline", devices: ["desktop", "ipad", "mobile"], note: "cart3 แล้วตัดเน็ต (setOfflineMode) → แถบออฟไลน์ + ชำระปิด" },
  { key: "mobile-sheet", devices: ["mobile"], note: "cart3 + แผ่นตะกร้าเปิด" },
  // P1.2 U R2 (ภาพ 01 ป๊อปโอเวอร์): สินค้าชั่วคราวมีตัวแปร + 4 กลุ่ม → เลือกตัวแปร · M +10 · นมโอ๊ต +15 · จำนวน 2
  { key: "options-popover", devices: ["desktop", "ipad", "mobile"], note: "ตัวเลือก/ตัวแปร: ป๊อปโอเวอร์ยึดการ์ด (390 = แผ่นล่าง) · เลือก 2 กลุ่ม + จำนวน 2" },
  { key: "weigh", devices: ["desktop", "mobile"], note: "สินค้าชั่ง ฿350/กก. → กล่องน้ำหนัก (owner พิมพ์ 250 กรัม · cashier = ต้องมีสิทธิ์)" },
];
type Job = { page: PosPage; v: (typeof POS_VIEWPORTS)[number]; state: StateKey | null; file: string };
const viewports = LOCALE_EN ? POS_VIEWPORTS.filter((v) => v.name === "desktop") : [...POS_VIEWPORTS];
const jobs: Job[] = pages.flatMap((p: PosPage): Job[] =>
  STATES_ON && p === "register"
    ? STATE_PLAN.flatMap((st): Job[] =>
        viewports
          .filter((v) => st.devices.includes(v.name))
          .map((v): Job => ({ page: p, v, state: st.key, file: `${OUT}/${p}-${st.key}-${userKey}-${v.w}x${v.h}${LOCALE_EN ? "-en" : ""}.png` })),
      )
    : viewports.map((v): Job => ({ page: p, v, state: null, file: LOCALE_EN ? fileOf(p, v.w, v.h).replace(/\.png$/, "-en.png") : fileOf(p, v.w, v.h) })),
);
const needFixtures = STATES_ON && tenantKey === "coffee" && jobs.some((j) => j.state);
if (STATES_ON && tenantKey !== "coffee" && pages.includes("register")) die("สถานะหน้าขาย P1.3 ถ่ายได้เฉพาะ --tenant coffee (มี PromptPay + สินค้าตายตัวที่ขั้นตอนใช้)");
// ◂

// ═══════════════════ 2. --dry: แผนการถ่าย (ไม่แตะอะไรเลย) ═══════════════════
const BASE_RAW = flag("--base") ?? process.env.QC_BASE ?? "";
if (DRY) {
  const plan = jobs.map((j) => ({ page: j.page, state: j.state, viewport: `${j.v.w}x${j.v.h}`, device: j.v.name, path: pathOf(j.page), file: j.file, expect: PAGE_EXPECT[j.page][userKey] }));
  console.log(`แผนการถ่าย POS · wo ${WO} · ผู้ใช้ ${userKey} (${U.email}) · ร้าน ${T.slug} · สาขา ${unitKey} · base ${BASE_RAW || "(ยังไม่ระบุ — รันจริงต้องมี --base)"}`);
  for (const s of plan) console.log(`  ${s.page.padEnd(9)} ${(s.state ?? "-").padEnd(13)} ${s.viewport.padEnd(9)} ${s.device.padEnd(8)} คาด ${String(s.expect).padEnd(6)} ${s.path} → ${s.file}`);
  if (STATES_ON) {
    console.log(`สถานะหน้าขาย P1.3${LOCALE_EN ? " (LOCALE=en · 1440 เท่านั้น)" : ""}:`);
    for (const st of STATE_PLAN) console.log(`  · ${st.key.padEnd(13)} ${st.devices.join("/").padEnd(20)} ${st.note}`);
    if (needFixtures) console.log(`  fixture: สินค้าชั่วคราว 11 ตัว (เหลือ 2 · หมดสต็อก · ปิดขาย + 4 ตัวของภาพ 01 + ลาเต้มีตัวแปร 1+2 + สินค้าชั่ง 1) + กลุ่มตัวเลือก 4 กลุ่ม ที่สาขา ${unitKey} — ลบใน finally`);
  }
  console.log(`รวม ${plan.length} ภาพ (${pages.length} หน้า × ${viewports.length} ขนาด${STATES_ON ? " · หน้าขายแยกตามสถานะ" : ""} × 1 ผู้ใช้)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, dry: true, locale: LOCALE_EN ? "en" : "th", states: STATES_ON, pages: pages.length, viewports: viewports.length, shots: plan.length, plan })}`);
  process.exit(0);
}

// ═══════════════════ 3. base: ต้องระบุ · ห้าม 3215 · ต้องต่อได้ ═══════════════════
if (!BASE_RAW) die("ไม่ได้ระบุเซิร์ฟเวอร์ — ส่ง `--base http://127.0.0.1:<port>` หรือ QC_BASE (ไม่มีค่าปริยาย · ห้ามใช้ :3215 ของ CRM)");
let BASE: string;
try {
  const u = new URL(BASE_RAW);
  if (u.port === "3215" && process.env.POS_VISUAL_ALLOW_3215 !== "1") die(`${BASE_RAW} คือเซิร์ฟเวอร์ของ CRM RUN (:3215) — POS ห้ามใช้ (LANE-RULES ข้อ 4)`);
  BASE = u.origin;
} catch {
  die(`--base ${BASE_RAW} ไม่ใช่ URL`);
}
{
  const ping = await fetch(BASE, { redirect: "manual", signal: AbortSignal.timeout(8_000) }).catch((e: unknown) => e as Error);
  if (ping instanceof Error) die(`ต่อเซิร์ฟเวอร์ ${BASE} ไม่ได้ (${ping.message}) — ให้ผู้คุมงานเปิดเซิร์ฟเวอร์ QC ของ POS ก่อน (CONTROLLER-RUN)`);
}

// ═══════════════════ 4. env + DB (หลังด่านทั้งหมด — --dry/ไม่มี base ไม่เคยถึงตรงนี้) ═══════════════════
const { loadPosQcEnv } = await import("./pos-qc-env.mjs");
loadPosQcEnv("visual-pos");
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const UA = "qc-visual-pos";
const PROFILE_DIRS = [`/tmp/chr-pos-${process.pid}`, `/tmp/snap-private-tmp/snap.chromium/tmp/chr-pos-${process.pid}`];
const cleanProfiles = () => {
  for (const d of PROFILE_DIRS) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* ไม่มี/ไม่มีสิทธิ์ */
    }
  }
};
class Fatal extends Error {}
const MINE: string[] = [];
let BROWSER: Any = null;
/** ลบ session ที่รอบนี้ mint (เฉพาะ id ของตัวเอง) + ซากที่หมดอายุแล้ว — เรียกได้ซ้ำ (finally และ signal) */
let sessionsCleaned = false;
async function cleanSessions(): Promise<{ removed: number; stale: number }> {
  if (sessionsCleaned) return { removed: 0, stale: 0 };
  sessionsCleaned = true;
  let removed = 0;
  if (MINE.length) removed = (await prisma.session.deleteMany({ where: { id: { in: MINE } } })).count;
  // ซากของรอบที่ถูก kill -9: แท็กเดียวกัน + หมดอายุแล้ว (รอบที่ยังวิ่งมีอายุอีก 1 ชม. จึงไม่โดน)
  const stale = (await prisma.session.deleteMany({ where: { userAgent: UA, expiresAt: { lt: new Date() } } })).count;
  return { removed, stale };
}
// POS P1.3 ▸ สินค้าชั่วคราวของภาพสถานะ (การ์ดเหลือน้อย/หมด/ปิดขาย) — เขียนตรงด้วย prisma ได้เพราะเป็นสคริปต์ (F15.1 สแกนเฉพาะ src/)
//   id ของรอบนี้เท่านั้น · ลบซ้ำได้ · ซากของรอบที่ถูก kill -9 (เกิน 1 ชม.) ถูกกวาดก่อนสร้างใหม่ ◂
const FIX = { prefix: "posqc-vis-", products: [] as string[], items: [] as string[], groups: [] as string[] };
let fixturesCleaned = false;
async function cleanFixtures(): Promise<{ products: number; items: number }> {
  if (fixturesCleaned) return { products: 0, items: 0 };
  fixturesCleaned = true;
  // P1.2 U: ลิงก์กลุ่ม (PosProductOptionGroup) ตามสินค้า (cascade) · ตัวเลือก → กลุ่ม ลบเอง
  if (FIX.groups.length) {
    await prisma.posProductOptionGroup.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: FIX.groups } } });
    await prisma.menuOptionChoice.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: FIX.groups } } });
    await prisma.menuOptionGroup.deleteMany({ where: { tenantId: T.tenantId, id: { in: FIX.groups } } });
  }
  const products = FIX.products.length ? (await prisma.posProduct.deleteMany({ where: { tenantId: T.tenantId, id: { in: FIX.products } } })).count : 0;
  const items = FIX.items.length ? (await prisma.invItem.deleteMany({ where: { tenantId: T.tenantId, id: { in: FIX.items } } })).count : 0;
  return { products, items };
}
async function makeFixtures(): Promise<void> {
  const old = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.posProduct.deleteMany({ where: { tenantId: T.tenantId, id: { startsWith: FIX.prefix }, createdAt: { lt: old } } });
  await prisma.invItem.deleteMany({ where: { tenantId: T.tenantId, id: { startsWith: FIX.prefix }, createdAt: { lt: old } } });
  const oldGroups = (await prisma.menuOptionGroup.findMany({ where: { tenantId: T.tenantId, id: { startsWith: FIX.prefix }, createdAt: { lt: old } }, select: { id: true } })).map((g) => g.id);
  if (oldGroups.length) {
    await prisma.posProductOptionGroup.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: oldGroups } } });
    await prisma.menuOptionChoice.deleteMany({ where: { tenantId: T.tenantId, groupId: { in: oldGroups } } });
    await prisma.menuOptionGroup.deleteMany({ where: { tenantId: T.tenantId, id: { in: oldGroups } } });
  }
  const inv = (T.systems as Record<string, { id: string }>).INVENTORY!.id;
  const tag = `${FIX.prefix}${process.pid}`;
  const mk = async (key: string, name: string, nameEn: string, price: number, onHand: number | null, off: boolean) => {
    let invItemId: string | null = null;
    if (onHand !== null) {
      invItemId = `${tag}-${key}-inv`;
      FIX.items.push(invItemId);
      await prisma.invItem.create({ data: { id: invItemId, tenantId: T.tenantId, systemId: inv, sku: `PQC-VIS-${process.pid}-${key}`.toUpperCase(), name, onHand, kind: "PRODUCT" } });
    }
    const id = `${tag}-${key}`;
    FIX.products.push(id);
    await prisma.posProduct.create({
      data: { id, tenantId: T.tenantId, systemId: SYS, unitId, invItemId, kind: "PRODUCT", name, nameEn, basePriceSatang: price, trackStock: onHand !== null ? true : null, unavailableUnitIds: off ? [unitId] : [] },
    });
    return id;
  };
  FIXTURE_IDS.low = await mk("low", "บราวนี่ (ภาพ QC)", "Brownie (QC shot)", 6500, 2, false);
  FIXTURE_IDS.out = await mk("out", "ครัวซองต์อัลมอนด์ (ภาพ QC)", "Almond croissant (QC shot)", 9500, 0, false);
  FIXTURE_IDS.off = await mk("off", "มัทฉะลาเต้ (ภาพ QC)", "Matcha latte (QC shot)", 9000, null, true);
  // B2.5: สินค้าของตะกร้าภาพ 01 (ชื่อ/ราคาเท่าภาพ · ลบใน finally เหมือนตัวอื่น)
  FIXTURE_IDS.m01latte = await mk("m01latte", M01.latte, "Latte", 10000, null, false);
  FIXTURE_IDS.m01amer = await mk("m01amer", M01.amer, "Americano", 7000, null, false);
  FIXTURE_IDS.m01crois = await mk("m01crois", M01.crois, "Almond croissant", 9500, null, false);
  FIXTURE_IDS.m01beans = await mk("m01beans", M01.beans, "Coffee beans 250 g", 32000, 11, false);
  // P1.2 U R2: ลาเต้มีตัวแปร (ร้อน/เย็น · ลูกใช้ราคาแม่) + 4 กลุ่มของภาพ 01 ผูกที่แม่ · สินค้าชั่ง ฿350/กก.
  FIXTURE_IDS.optParent = await mk("optp", M01.optName, "Latte (QC options)", 7500, null, false);
  for (const [k, nm, en] of [["optv1", "ร้อน", "Hot"], ["optv2", "เย็น", "Iced"]] as const) {
    const id = `${tag}-${k}`;
    FIX.products.unshift(id); // ลูกก่อนแม่ตอนลบ
    await prisma.posProduct.create({ data: { id, tenantId: T.tenantId, systemId: SYS, unitId, kind: "PRODUCT", name: `${M01.optName} ${nm}`, nameEn: `Latte ${en}`, basePriceSatang: null, parentId: FIXTURE_IDS.optParent } });
  }
  const groups: [string, string, number, number, [string, string, number][]][] = [
    ["size", "ขนาด", 1, 1, [["S", "S", 0], ["M", "M", 1000], ["L", "L", 2000]]],
    ["milk", "นม", 1, 1, [["ปกติ", "Regular", 0], ["นมโอ๊ต", "Oat milk", 1500], ["นมอัลมอนด์", "Almond milk", 1500]]],
    ["sweet", "ความหวาน", 1, 1, [["ปกติ", "Regular", 0], ["น้อย", "Less", 0], ["ไม่หวาน", "None", 0]]],
    ["top", "ท็อปปิ้ง", 0, 2, [["วิปครีม", "Whipped cream", 1000], ["ช็อตเพิ่ม", "Extra shot", 2000]]],
  ];
  let order = 0;
  for (const [gk, gname, min, max, choices] of groups) {
    const gid = `${tag}-g-${gk}`;
    const make = (name: string) => prisma.menuOptionGroup.create({ data: { id: gid, tenantId: T.tenantId, unitId, name, minSelect: min, maxSelect: max } });
    try {
      await make(gname);
    } catch {
      await make(`${gname} (QC ${process.pid})`); // ชื่อกลุ่มซ้ำของร้านในสาขาเดียวกัน (@@unique unitId+name)
    }
    FIX.groups.push(gid);
    let co = 0;
    for (const [cn, cen, delta] of choices) {
      const cid = `${gid}-c${co}`;
      await prisma.menuOptionChoice.create({ data: { id: cid, tenantId: T.tenantId, unitId, groupId: gid, name: cn, nameEn: cen, priceDelta: delta, sortOrder: co++ } });
      if (gk === "size" && cn === "M") FIXTURE_IDS.optSizeM = cid;
      if (gk === "milk" && cn === "นมโอ๊ต") FIXTURE_IDS.optOat = cid;
    }
    await prisma.posProductOptionGroup.create({ data: { tenantId: T.tenantId, productId: FIXTURE_IDS.optParent, groupId: gid, sortOrder: order++ } });
  }
  FIXTURE_IDS.weighed = `${tag}-weigh`;
  FIX.products.push(FIXTURE_IDS.weighed);
  await prisma.posProduct.create({
    data: { id: FIXTURE_IDS.weighed, tenantId: T.tenantId, systemId: SYS, unitId, kind: "PRODUCT", name: M01.weighName, nameEn: "Roasted beans by weight (QC)", basePriceSatang: 35000, soldByWeight: true },
  });
}
const FIXTURE_IDS = { low: "", out: "", off: "", m01latte: "", m01amer: "", m01crois: "", m01beans: "", optParent: "", optSizeM: "", optOat: "", weighed: "" };
/** ชื่อบรรทัดของภาพ 01 — ใช้เป็นคำค้นด้วย (ชื่อซ้ำกับสินค้าจริงของร้าน QC ได้ ⇒ แตะด้วย testid ของ fixture เสมอ) */
const M01 = { latte: "ลาเต้", amer: "อเมริกาโน่", crois: "ครัวซองต์อัลมอนด์", beans: "เมล็ดกาแฟ 250 g", optName: "ลาเต้ตัวเลือก QC", weighName: "เมล็ดคั่วชั่งกิโล QC" };
// ถูก Ctrl-C/kill/ปิดเทอร์มินัล: ทำความสะอาดแบบเดียวกับ finally (ปิด chromium · ลบ session ของรอบนี้ · ลบโปรไฟล์) แล้วค่อยออก
process.on("exit", cleanProfiles);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    console.error(`\n⚠️ ได้รับ ${sig} — ทำความสะอาดก่อนออก`);
    const done = (async () => {
      try {
        await BROWSER?.close();
      } catch {
        /* ปิดไม่ได้ก็ลบโปรไฟล์ต่อ */
      }
      try {
        const r = await cleanSessions();
        console.error(`🧹 ลบ session ${r.removed} (+ซาก ${r.stale})`);
      } catch (e) {
        console.error(`❌ ลบ session ไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      try {
        const f = await cleanFixtures();
        if (f.products || f.items) console.error(`🧹 ลบสินค้าชั่วคราว ${f.products} (+InvItem ${f.items})`);
      } catch (e) {
        console.error(`❌ ลบสินค้าชั่วคราวไม่สำเร็จ: ${e instanceof Error ? e.message : e}`);
      }
      cleanProfiles();
    })();
    void done.finally(() => process.exit(130));
  });
}
// ═══════════════════ POS P1.3 ▸ ขั้นตอนของแต่ละสถานะ (ปุ่มหาโดย data-testid ที่มองเห็นเท่านั้น) ═══════════════════
const QC_IDS = { amer: "", latte: "", crois: "" };
class StepError extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tid = (id: string) => `[data-testid="${id}"]`;
const tidPrefix = (p: string) => `[data-testid^="${p}"]`;
async function visibleEl(page: Any, sel: string, nth = 0, timeout = 10_000): Promise<Any> {
  const until = Date.now() + timeout;
  for (;;) {
    const hs: Any[] = await page.$$(sel);
    const vis: Any[] = [];
    for (const h of hs) if (await h.isVisible().catch(() => false)) vis.push(h);
    if (vis[nth]) return vis[nth];
    if (Date.now() > until) throw new StepError(`ไม่พบ ${sel}${nth ? ` ตัวที่ ${nth + 1}` : ""} ที่มองเห็น`);
    await sleep(200);
  }
}
async function clickEl(page: Any, sel: string, nth = 0) {
  const h = await visibleEl(page, sel, nth);
  // B2.5: เลื่อนให้อยู่กลางจอก่อนคลิก — ที่ 390 แถวการ์ดล่างอยู่ "ในจอ" (puppeteer ไม่เลื่อนให้) แต่ถูกแถบตะกร้า sticky ทับ ⇒ คลิกหายเงียบ
  await h.evaluate((el: Element) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await sleep(150);
  await h.click();
  await sleep(200);
}
/**
 * B2.5: ตรวจจำนวนบรรทัดตะกร้าหลังลูปเพิ่มสินค้า — คลิกหาย = ขั้นตอนตก (ไม่ใช่ภาพผิดเงียบ ๆ)
 *   md+ = นับ [data-testid^=pos-reg-cart-line-] ที่มองเห็น · มือถือ = data-count ของแถบตะกร้า (บรรทัดอยู่ในแผ่นที่ยังไม่เปิด)
 */
async function expectLines(page: Any, n: number) {
  const ok = await page
    .waitForFunction(
      (want: number) => {
        const bar = document.querySelector('[data-testid="pos-reg-cart-bar"]');
        if (bar && bar.getClientRects().length > 0) return Number(bar.getAttribute("data-count")) === want;
        const lines = Array.from(document.querySelectorAll('[data-testid^="pos-reg-cart-line-"]')).filter((e) => e.getClientRects().length > 0);
        return lines.length === want;
      },
      { timeout: 5_000 },
      n,
    )
    .then(() => true)
    .catch(() => false);
  if (!ok) throw new StepError(`ตะกร้าไม่ได้ ${n} บรรทัดหลังคลิกเพิ่มสินค้า (คลิกหาย?)`);
}
/** B2.5: หาการ์ดสินค้าด้วยคำค้น (fixture อาจอยู่นอกหน้าแรกของกริด) แล้วแตะ · ล้างคำค้นด้วย Esc */
async function pickBySearch(page: Any, id: string, term: string, times = 1) {
  await typeInto(page, tid("pos-reg-search"), term);
  await visibleEl(page, tid(`pos-reg-product-${id}`), 0, 10_000);
  for (let i = 0; i < times; i++) await clickEl(page, tid(`pos-reg-product-${id}`));
  await page.keyboard.press("Escape");
  await sleep(300);
}
async function typeInto(page: Any, sel: string, text: string) {
  const h = await visibleEl(page, sel);
  await h.click({ count: 3 });
  await h.type(text);
  await sleep(200);
}
/** ปุ่มชำระ (ตะกร้าข้าง หรือแถบล่างมือถือ) เปิด = quote ของเซิร์ฟเวอร์มาแล้วและตรงตะกร้า */
async function waitPayReady(page: Any) {
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[data-testid="pos-reg-pay"],[data-testid="pos-reg-cart-bar-pay"]')).some(
          (e) => e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled,
        ),
      { timeout: 15_000 },
    )
    .catch(() => {
      throw new StepError("ปุ่มชำระไม่เปิดภายใน 15 วิ (quote ไม่มา/ถูกปฏิเสธ)");
    });
}
async function addCart3(page: Any, device: Device) {
  if (!QC_IDS.amer || !QC_IDS.latte || !QC_IDS.crois) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC (อเมริกาโน่เย็น/ลาเต้ร้อน/ครัวซองต์เนยสด) — รัน seed-pos-qc + backfill ก่อน");
  for (const id of [QC_IDS.amer, QC_IDS.amer, QC_IDS.latte, QC_IDS.crois]) await clickEl(page, tid(`pos-reg-product-${id}`));
  await expectLines(page, 3); // อเมริกาโน่ ×2 รวมเป็นบรรทัดเดียว
  await waitPayReady(page);
  // ส่วนลดรายการ ฿10 ที่บรรทัดที่ 2 (ลาเต้)
  if (device === "mobile") await clickEl(page, tid("pos-reg-cart-view"));
  await clickEl(page, tidPrefix("pos-reg-cart-line-"), 1);
  await typeInto(page, tidPrefix("pos-reg-line-discount-"), "10");
  await clickEl(page, tid("pos-reg-editor-apply"));
  if (device === "mobile") {
    await page.keyboard.press("Escape"); // ปิดแผ่นตะกร้า
    await sleep(250);
  }
  await waitPayReady(page);
}
const openCartOnMobile = async (page: Any, device: Device) => {
  if (device === "mobile") await clickEl(page, tid("pos-reg-cart-view"));
};
const clickPay = (page: Any, device: Device) => clickEl(page, tid(device === "mobile" ? "pos-reg-cart-bar-pay" : "pos-reg-pay"));
// ── P1.2 U R2 ข้อ 7: กะของรอบนี้ (เปิดผ่าน UI ครั้งเดียว · ปิดใน finally) ──
const RUN_STARTED = new Date();
const SHIFT = { opened: false, id: "" as string, close: null as null | { ok: boolean; detail: string } };
/** แถบ "เปิดกะก่อนเริ่มขาย" ยังอยู่หลังสถานะของเครื่อง (deviceId) มาแล้ว = ยังไม่มีกะ */
async function shiftBannerStays(page: Any): Promise<boolean> {
  const gone = await page
    .waitForFunction(() => !Array.from(document.querySelectorAll('[data-testid="pos-reg-shift-required"]')).some((e) => e.getClientRects().length > 0), { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  return !gone;
}
async function ensureShift(page: Any): Promise<void> {
  if (!(await shiftBannerStays(page))) return;
  if (SHIFT.opened) throw new StepError("เปิดกะไปแล้วในรอบนี้แต่แถบเปิดกะยังอยู่ (deviceId ไม่ตรง?)");
  await clickEl(page, tid("pos-reg-shift-open-link"));
  await visibleEl(page, tid("pos-shift-open"), 0, 15_000).catch(() => {
    throw new StepError("หน้ากะไม่ขึ้นกล่องเปิดกะ (pos-shift-open) — ผู้ใช้นี้มีสิทธิ์ pos.shift.operate หรือไม่?");
  });
  await typeInto(page, tid("pos-shift-open-float"), "1000");
  await page
    .waitForFunction(() => !(document.querySelector('[data-testid="pos-shift-open-submit"]') as HTMLButtonElement | null)?.disabled, { timeout: 10_000 })
    .catch(() => undefined);
  await clickEl(page, tid("pos-shift-open-submit"));
  await visibleEl(page, tid("pos-shift-current"), 0, 15_000).catch(() => {
    throw new StepError("เปิดกะไม่สำเร็จ (ไม่เห็น pos-shift-current)");
  });
  SHIFT.opened = true;
  const row = await prisma.posShift.findFirst({
    where: { tenantId: T.tenantId, unitId, systemId: SYS, openedByUserId: U.userId, status: "OPEN", openedAt: { gte: new Date(RUN_STARTED.getTime() - 60_000) } },
    orderBy: { openedAt: "desc" },
    select: { id: true },
  });
  SHIFT.id = row?.id ?? "";
  await page.goto(`${BASE}${pathOf("register")}`, { waitUntil: "networkidle2", timeout: 60_000 });
  await visibleEl(page, tid("pos-reg-root"), 0, 15_000);
  if (await shiftBannerStays(page)) throw new StepError("เปิดกะแล้วแต่หน้าขายยังขึ้น \"เปิดกะก่อนเริ่มขาย\"");
}
/** finally: ปิดกะของรอบนี้แบบนับตรงยอด (closeShift ของบริการ · actor = เจ้าของร้าน QC) — ผลอยู่ใน summary ไม่โยน */
async function closeRunShift(): Promise<void> {
  if (!SHIFT.opened) return;
  try {
    const { closeShift, computeReport } = await import("@/lib/modules/pos/shift");
    const sh = SHIFT.id ? await prisma.posShift.findFirst({ where: { id: SHIFT.id, tenantId: T.tenantId } }) : null;
    if (!sh) {
      SHIFT.close = { ok: false, detail: "หาแถวกะของรอบนี้ไม่เจอ (เปิดผ่าน UI แล้วแต่ไม่พบใน DB)" };
      return;
    }
    if (sh.status !== "OPEN") {
      SHIFT.close = { ok: true, detail: `กะ ${sh.id} สถานะ ${sh.status} อยู่แล้ว` };
      return;
    }
    const expected = (await computeReport(prisma, sh)).expectedCashSatang;
    const own = T.users.owner;
    const mb = await prisma.membership.findUnique({ where: { id: own.membershipId }, select: { role: true, unitAccess: true, permissions: true } });
    if (expected === null || !mb) {
      SHIFT.close = { ok: false, detail: `คำนวณยอดคาดไม่ได้ (${expected}) หรือไม่พบ membership เจ้าของร้าน` };
      return;
    }
    const actor = {
      userId: own.userId,
      role: mb.role as "OWNER" | "MANAGER" | "STAFF",
      unitAccess: Array.isArray(mb.unitAccess) ? (mb.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
      permissions: mb.permissions && typeof mb.permissions === "object" ? (mb.permissions as Record<string, unknown>) : {},
    };
    const r = await closeShift({ tenantId: T.tenantId, systemId: SYS, unitId }, actor, { shiftId: sh.id, countedCashSatang: expected, idempotencyKey: `${FIX.prefix}${process.pid}-close` });
    SHIFT.close = r.ok ? { ok: true, detail: `ปิดกะ ${sh.id} (ยอดคาด = ยอดนับ ${expected})` } : { ok: false, detail: `ปิดกะไม่สำเร็จ: ${r.code}` };
  } catch (e) {
    SHIFT.close = { ok: false, detail: `ปิดกะล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}` };
  }
}

async function runState(page: Any, state: StateKey, device: Device): Promise<void> {
  await visibleEl(page, tid("pos-reg-root"), 0, 15_000).catch(() => {
    throw new StepError("หน้าขายใหม่ไม่ขึ้น (pos-reg-root) — ธง settings.pos.registerV2 ของร้าน QC เปิดหรือยัง? (seed-pos-qc)");
  });
  // ข้อ 7: ร้าน QC บังคับเปิดกะ (P1.9) — เปิดผ่าน UI ครั้งเดียวต่อรอบ ภาพจึงมีหัว "กะ #… · เปิด …" เหมือนภาพ 01
  await ensureShift(page);
  switch (state) {
    case "default":
      return;
    case "cart3":
      return addCart3(page, device);
    case "cart4-01": {
      const f = FIXTURE_IDS;
      if (!f.m01latte || !f.m01amer || !f.m01crois || !f.m01beans) throw new StepError("ไม่มีสินค้าชั่วคราวของภาพ 01 — ถ่ายสถานะนี้ได้เฉพาะ --tenant coffee");
      await pickBySearch(page, f.m01latte, M01.latte, 2);
      await pickBySearch(page, f.m01amer, M01.amer);
      await pickBySearch(page, f.m01crois, M01.crois);
      await pickBySearch(page, f.m01beans, M01.beans);
      await expectLines(page, 4);
      await waitPayReady(page);
      // ส่วนลด ฿10 ที่ครัวซองต์ (บรรทัดที่ 3)
      await openCartOnMobile(page, device);
      await clickEl(page, tidPrefix("pos-reg-cart-line-"), 2);
      await typeInto(page, tidPrefix("pos-reg-line-discount-"), "10");
      await clickEl(page, tid("pos-reg-editor-apply"));
      if (device === "mobile") {
        await page.keyboard.press("Escape");
        await sleep(250);
      }
      await waitPayReady(page);
      return;
    }
    case "offline":
      await addCart3(page, device);
      await page.setOfflineMode(true);
      await visibleEl(page, tid("pos-reg-offline-banner"), 0, 10_000);
      return;
    case "line-editor":
      await addCart3(page, device);
      await openCartOnMobile(page, device);
      await clickEl(page, tidPrefix("pos-reg-line-qty-"));
      await visibleEl(page, tid("pos-reg-line-editor"));
      return;
    case "bill-discount":
      await addCart3(page, device);
      await openCartOnMobile(page, device);
      await clickEl(page, tid("pos-reg-bill-discount"));
      await visibleEl(page, tid("pos-reg-bill-discount-dialog"));
      return;
    case "custom-item":
      await clickEl(page, tid("pos-reg-custom-item"));
      await visibleEl(page, tid(userKey === "owner" ? "pos-reg-custom-dialog" : "pos-reg-toast"));
      return;
    case "paydlg-cash":
      await addCart3(page, device);
      await clickPay(page, device);
      await clickEl(page, tid("pos-reg-paydlg-quick-exact"));
      await visibleEl(page, tid("pos-reg-paydlg-change"));
      return;
    case "sale-done":
      if (!QC_IDS.amer || !QC_IDS.latte) throw new StepError("ไม่พบสินค้าตายตัวของร้าน QC");
      for (const id of [QC_IDS.amer, QC_IDS.amer, QC_IDS.latte]) await clickEl(page, tid(`pos-reg-product-${id}`));
      await expectLines(page, 2);
      await waitPayReady(page);
      await clickPay(page, device);
      await clickEl(page, tid("pos-reg-paydlg-quick-exact"));
      await clickEl(page, tid("pos-reg-paydlg-confirm"));
      await visibleEl(page, tid("pos-reg-done"), 0, 20_000);
      return;
    case "search-empty":
      await typeInto(page, tid("pos-reg-search"), "zz-no-such-item-qc");
      await visibleEl(page, tid("pos-reg-search-empty"), 0, 10_000);
      return;
    case "stock-warn":
      if (!FIXTURE_IDS.low) throw new StepError("ไม่มีสินค้าชั่วคราว (fixture) — ถ่ายสถานะนี้ได้เฉพาะ --tenant coffee");
      for (let i = 0; i < 3; i++) await clickEl(page, tid(`pos-reg-product-${FIXTURE_IDS.low}`));
      await expectLines(page, 1);
      await waitPayReady(page);
      await openCartOnMobile(page, device);
      await visibleEl(page, tidPrefix("pos-reg-line-warn-"));
      return;
    case "mobile-sheet":
      await addCart3(page, device);
      await clickEl(page, tid("pos-reg-cart-view"));
      await visibleEl(page, tid("pos-reg-cart-sheet"));
      return;
    case "options-popover": {
      const f = FIXTURE_IDS;
      if (!f.optParent || !f.optSizeM || !f.optOat) throw new StepError("ไม่มีสินค้าชั่วคราวที่มีตัวเลือก — ถ่ายสถานะนี้ได้เฉพาะ --tenant coffee");
      // คำค้นค้างในช่อง (Esc จะปิดป๊อปโอเวอร์) — การ์ดอาจอยู่นอกหน้าแรกของกริด
      await typeInto(page, tid("pos-reg-search"), M01.optName);
      await clickEl(page, tid(`pos-reg-product-${f.optParent}`));
      await visibleEl(page, tid("pos-reg-options-dialog"), 0, 10_000);
      await clickEl(page, tidPrefix("pos-reg-variant-"));
      await clickEl(page, tid(`pos-reg-option-${f.optSizeM}`));
      await clickEl(page, tid(`pos-reg-option-${f.optOat}`));
      await clickEl(page, tid("pos-reg-options-qty-inc"));
      return;
    }
    case "weigh":
      if (!FIXTURE_IDS.weighed) throw new StepError("ไม่มีสินค้าชั่งชั่วคราว — ถ่ายสถานะนี้ได้เฉพาะ --tenant coffee");
      await typeInto(page, tid("pos-reg-search"), M01.weighName);
      await clickEl(page, tid(`pos-reg-product-${FIXTURE_IDS.weighed}`));
      await visibleEl(page, tid("pos-reg-weigh-dialog"), 0, 10_000);
      if (userKey === "owner") await typeInto(page, tid("pos-reg-weigh-grams"), "250");
      return;
  }
}
// ◂

type Shot = { page: string; state: string | null; stepError: string | null; viewport: string; file: string; status: number; expect: number | "record"; http5xx: number; finalUrl: string; redirectedToLogin: boolean; overflow: boolean; overflowEl: string | null; consoleErrors: string[]; httpErrors: string[]; ok: boolean };
const shots: Shot[] = [];
let failures = 0;
let fatal = "";
mkdirSync(OUT, { recursive: true });

try {
  // ── mint session (ผู้ใช้ QC id ตายตัวจาก PQC · ต้อง seed-pos-qc ก่อน) ──
  const user = await prisma.user.findUnique({ where: { id: U.userId }, select: { id: true, email: true } });
  if (!user || user.email !== U.email) throw new Fatal(`ไม่พบผู้ใช้ ${U.email} (${U.userId}) ในฐานนี้ — รัน seed-pos-qc บนฐานเดียวกับเซิร์ฟเวอร์ก่อน`);
  const token = "pos" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const ttl = new Date(Date.now() + 60 * 60 * 1000);
  const row = await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl }, select: { id: true } });
  MINE.push(row.id);
  const https = BASE.startsWith("https:");
  const host = new URL(BASE).hostname;
  // ชื่อคุกกี้ผูกกับโปรโตคอล: http = shark_session · https = __Host-shark_session (เหมือน visual-crm)
  const cookies: Any[] = https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: T.tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: T.tenantId, domain: host, path: "/" }];
  // POS P1.3 ▸ ภาษาอังกฤษ (ภาพ 20B) — next-intl อ่าน locale จากคุกกี้ LOCALE ◂
  if (LOCALE_EN) cookies.push(https ? { name: "LOCALE", value: "en", url: BASE, path: "/", secure: true } : { name: "LOCALE", value: "en", domain: host, path: "/" });
  if (needFixtures) await makeFixtures();
  // ข้อมูลตายตัวของร้าน QC ที่ขั้นตอนสถานะใช้ (หาจากชื่อ — seed-pos-qc · ไม่ผูกสต็อก ยกเว้นครัวซองต์)
  if (STATES_ON) {
    const rows = await prisma.posProduct.findMany({ where: { tenantId: T.tenantId, systemId: SYS, archivedAt: null }, select: { id: true, name: true } });
    const byName = (n: string) => rows.find((r) => r.name === n)?.id ?? "";
    QC_IDS.amer = byName("อเมริกาโน่เย็น");
    QC_IDS.latte = byName("ลาเต้ร้อน");
    QC_IDS.crois = byName("ครัวซองต์เนยสด");
  }

  const pptr = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string).catch((e: unknown) => {
    throw new Fatal(`เปิด puppeteer-core ไม่ได้ (${e instanceof Error ? e.message : e}) — ต้องมี /root/dive3d/node_modules/puppeteer-core`);
  })) as Any;
  const browser = (BROWSER = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${PROFILE_DIRS[0]}`],
  }));
  try {
    for (const job of jobs) {
      {
        const p = job.page;
        const v = job.v;
        const page = await browser.newPage();
        await page.setViewport({ width: v.w, height: v.h, deviceScaleFactor: 2, isMobile: v.mobile, hasTouch: v.name !== "desktop" });
        await page.setCookie(...cookies);
        const consoleErrors: string[] = [];
        const httpErrors: string[] = [];
        const http5xx: string[] = [];
        page.on("pageerror", (e: Error) => consoleErrors.push(e.message.slice(0, 160)));
        page.on("console", (m: Any) => {
          if (m.type() === "error") consoleErrors.push(String(m.text()).slice(0, 160));
        });
        page.on("response", (r: Any) => {
          try {
            const line = `HTTP ${r.status()} ${String(r.url()).replace(BASE, "").slice(0, 160)}`;
            if (r.status() >= 500) http5xx.push(line); // คำขอย่อย 5xx = ภาพตก
            else if (r.status() >= 400) httpErrors.push(line); // 4xx = บันทึกอย่างเดียว
          } catch {
            /* ignore */
          }
        });
        const resp = await page.goto(`${BASE}${pathOf(p)}`, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 800));
        // POS P1.3 ▸ ขั้นตอนของสถานะ (พัง = บันทึก stepError แล้วถ่าย ณ จุดนั้น) ◂
        let stepError: string | null = null;
        if (job.state) {
          try {
            await runState(page, job.state, v.name);
            await new Promise((r) => setTimeout(r, 500));
          } catch (e) {
            stepError = e instanceof Error ? e.message.slice(0, 200) : String(e);
          }
        }
        const finalUrl = String(page.url()).replace(BASE, "");
        // ล้นแนวนอน = เนื้อหากว้างกว่ากรอบที่มองเห็น (เกณฑ์ X10 — ไม่มี overflow ทั้ง 3 ขนาด)
        const ov = (await page
          .evaluate(() => {
            const d = document.documentElement;
            // ตรวจ html · body · กรอบเลื่อนหลัก (main / [role=main]) — เลย์เอาต์ที่ล็อก html แล้วให้ main เลื่อนเองจะไม่ล้นที่ html
            const boxes = [d, document.body, ...Array.from(document.querySelectorAll("main, [role=main]"))].filter(Boolean) as Element[];
            const overBox = boxes.find((b) => b.scrollWidth > b.clientWidth + 1);
            const over = !!overBox;
            if (!over) return { over, el: null as string | null };
            const boxName = overBox === d ? "html" : overBox === document.body ? "body" : overBox!.tagName.toLowerCase();
            let best: { r: number; d: string } | null = null;
            for (const el of Array.from(document.querySelectorAll("body *"))) {
              const cs = getComputedStyle(el);
              if (cs.position === "fixed" || cs.display === "none") continue;
              const b = el.getBoundingClientRect();
              if (b.width === 0 || b.right <= d.clientWidth + 1) continue;
              if (!best || b.right > best.r) {
                const tid = el.getAttribute("data-testid");
                best = { r: b.right, d: `${el.tagName.toLowerCase()}${tid ? `[data-testid=${tid}]` : ""} right=${Math.round(b.right)}` };
              }
            }
            return { over, el: `${boxName}: ${best?.d ?? "?"}` };
          })
          .catch(() => ({ over: false, el: null }))) as { over: boolean; el: string | null };
        const file = job.file;
        await page.screenshot({ path: file, fullPage: true });
        const status = resp?.status() ?? 0;
        const redirectedToLogin = /\/login\b/.test(finalUrl);
        const exp = PAGE_EXPECT[p][userKey];
        const statusOk = exp === "record" ? true : status === exp && !redirectedToLogin;
        const judged = exp === "record" ? status > 0 && status < 400 : true; // record-only: หน้าที่ถูกปฏิเสธ ไม่ตัดสินเลย์เอาต์/console
        const ok = statusOk && !stepError && (!judged || (consoleErrors.length === 0 && !ov.over && http5xx.length === 0));
        if (!ok) failures++;
        shots.push({ page: p, state: job.state, stepError, viewport: `${v.w}x${v.h}`, file, status, expect: exp, finalUrl, redirectedToLogin, overflow: ov.over, overflowEl: ov.el, consoleErrors, httpErrors: [...http5xx, ...httpErrors], http5xx: http5xx.length, ok });
        console.log(
          `  ${ok ? "✅" : "❌"} ${p}${job.state ? `/${job.state}` : ""} ${v.w}x${v.h} HTTP ${status}${stepError ? ` · ขั้นตอนพัง: ${stepError}` : ""} (คาด ${exp})${http5xx.length ? ` · คำขอย่อย 5xx ${http5xx.length}: ${http5xx[0]}` : ""}${redirectedToLogin ? " · เด้งไป /login" : ""}${ov.over ? ` · ล้นแนวนอน ${ov.el ?? "?"}` : ""}${consoleErrors.length ? ` · console error ${consoleErrors.length}: ${consoleErrors[0]}` : ""} → ${file}`,
        );
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  fatal = e instanceof Fatal ? e.message : `ผิดพลาดกลางคัน — ${e instanceof Error ? (e.stack ?? e.message).slice(0, 400) : String(e)}`;
} finally {
  await closeRunShift();
  if (SHIFT.close && !SHIFT.close.ok) console.error(`⚠️ ${SHIFT.close.detail}`);
  const { removed, stale } = await cleanSessions();
  let fixOut = "";
  try {
    const f = await cleanFixtures();
    if (f.products || f.items) fixOut = ` · ลบสินค้าชั่วคราว ${f.products} (+InvItem ${f.items})`;
  } catch (e) {
    fixOut = ` · ❌ ลบสินค้าชั่วคราวไม่สำเร็จ: ${e instanceof Error ? e.message : e}`;
    failures++;
  }
  await prisma.$disconnect();
  cleanProfiles();
  writeFileSync(`${OUT}/summary-${userKey}.json`, JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, at: new Date().toISOString(), shiftClose: SHIFT.close, shots }, null, 2));
  console.log(`\n🧹 ลบ session ของรอบนี้ ${removed}${stale ? ` (+ซากหมดอายุ ${stale})` : ""}${fixOut} · ลบโปรไฟล์ chromium ${PROFILE_DIRS[0]} · ภาพ ${shots.length} ใบใน ${OUT}`);
}
if (fatal) console.error(`❌ ${fatal}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, tenant: tenantKey, base: BASE, shiftClose: SHIFT.close, shots: shots.map(({ consoleErrors, httpErrors, ...s }) => ({ ...s, consoleErrors: consoleErrors.length, httpErrors: httpErrors.length })), failures, fatal: fatal || null })}`);
process.exit(fatal ? 2 : failures > 0 ? 1 : 0);
