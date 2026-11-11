// QC (ใบ S2.14) — ทะเบียนปุ่ม + กดจริงทุกปุ่มของจอ S2 ใน chromium (web export เดียวกับ shoot-sec · API mock จาก fixture)
//
// 2 โหมด:
//   node qc/click-sec.mjs --registry   สแกนซอร์สจอ S2 (app/(app)/secretary|customers|business/** + app/{login,signup,otp,phone}.tsx · ไม่รวม _gallery)
//                                     ⇒ qc/buttons-sec.json = [{ testID, files[], kind, handler, action }] (regex เดียวกับ oracle qc-sec-s2.14 B-1)
//                                     kind (จากแท็กที่ประกาศ testID): button = Pressable/IconBtn/PrimaryButton/Chip/Toggle/… · input = TextInput · view = กล่อง/ข้อความ
//                                     handler = นิพจน์ onPress/onChange/onChangeText ในแท็กนั้น · action = สรุป route/endpoint/สถานะจอที่ handler อ้าง
//   node qc/click-sec.mjs              กดจริง ⇒ qc/shots-sec/clicks-sec.json = [{ testID, ok, kind, effect, fixture, route, path[] }]
//     สำรวจทุก fixture × route ใน SCENARIOS (+ ชีต/เมนูที่เปิดจากปุ่ม ลึก 2 ชั้น) · ทุกการกด = เปิดหน้าใหม่แล้วเล่นทางเดิน (path) ซ้ำ
//     "มีผล" (ok) อย่างน้อย 1 อย่างหลังกด 1.1 วิ: request ใหม่ถึง API (ไม่ใช่ GET ที่จอ poll อยู่แล้ว) · เปลี่ยน route · testID โผล่/หาย ·
//       สถานะของปุ่มเปลี่ยน (aria-checked/selected/pressed/expanded) · ข้อความบนจอเปลี่ยน (เฉพาะจอที่ไม่มีข้อความขยับเอง) · เปิดลิงก์ (window.open) · ตัวเลือกไฟล์
//     ช่องพิมพ์ (input) = พิมพ์แล้วค่าเปลี่ยน · กล่อง (view) = เห็นบนจอใน fixture อย่างน้อย 1 ชุด (ไม่ใช่ปุ่ม — ไม่มีอะไรให้กด)
//     ปุ่มที่ปิดอยู่ (aria-disabled) ⇒ กรอกทุกช่องบนจอด้วยค่าตัวอย่างก่อน แล้วลองใหม่ · กดแล้วไม่มีอะไรเกิด / ปิดตลอด / ไม่เคยเห็น = ok:false (แดง)
//     ไฟล์ผลเขียนโดยสคริปต์นี้เท่านั้น (ห้ามแก้มือ)
//
// ตัวแปร: QC_COPY (ปริยาย /root/qc-shark-mobile-sec-d — ต้องมี dist จาก shoot-sec QC_PREPARE=1) · QC_PORT (4731) · QC_BASE · WORKERS (3) · ONLY=<testID,…> (กดเฉพาะ)
// รัน (จากรากรีโป): bash scripts/iso.sh env QC_COPY=/root/qc-shark-mobile-sec-d node apps/mobile/qc/click-sec.mjs
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const M = resolve(HERE, "..");
const APP = join(M, "app/(app)");
const FIX = join(M, "qc/fixtures/secretary");
const REG = join(M, "qc/buttons-sec.json");
const OUT = join(M, "qc/shots-sec/clicks-sec.json");

// ───────── สแกนซอร์ส (regex เดียวกับ oracle) ─────────
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : /\.tsx?$/.test(f) ? [q] : []; }) : []);
const SCREENS = [...walk(join(APP, "secretary")), ...walk(join(APP, "customers")), ...walk(join(APP, "business")), join(M, "app/login.tsx"), join(M, "app/signup.tsx"), join(M, "app/otp.tsx"), join(M, "app/phone.tsx")].filter((f) => !/_gallery/.test(f));

// SettingRow/InfoRow = ปุ่มเฉพาะเมื่อส่ง onPress (ไม่ส่ง = แถวแสดงผล · S2.14)
const BUTTON_TAGS = /^(Pressable|TouchableOpacity|IconBtn|PrimaryButton|Chip|Toggle|Segment|Tabs|LevelPicker|ChatLevelPicker|LevelGrid|Switch|StaffSheet|ConfirmSheet)$/;
/** แท็กเปิดที่ประกาศ testID ณ ตำแหน่ง i: ชื่อแท็ก + ข้อความทั้งแท็ก (นับวงเล็บปีกกา) */
function tagAt(src, i) {
  const lt = src.lastIndexOf("<", i);
  const name = (src.slice(lt + 1).match(/^[A-Za-z.]+/) ?? [""])[0];
  let depth = 0;
  let j = lt;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0 && src[j - 1] !== "=") break;
  }
  return { name, text: src.slice(lt, j + 1) };
}
/** มี prop นี้ที่ระดับบนของแท็ก (ไม่นับ onPress ของ JSX ที่ซ้อนอยู่ใน prop อื่น เช่น TopBar left={<IconBtn onPress/>}) */
function topProp(tag, prop) {
  let depth = 0;
  for (let i = 0; i < tag.length; i++) {
    const ch = tag[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0 && tag.startsWith(`${prop}=`, i) && /\s/.test(tag[i - 1] ?? "")) return true;
  }
  return false;
}
/** นิพจน์ของ prop (onPress={…}) — นับวงเล็บปีกกา */
function propExpr(tag, prop) {
  const k = tag.indexOf(`${prop}={`);
  if (k < 0) return null;
  let depth = 0;
  for (let j = k + prop.length + 1; j < tag.length; j++) {
    if (tag[j] === "{") depth++;
    else if (tag[j] === "}" && --depth === 0) return tag.slice(k + prop.length + 2, j).replace(/\s+/g, " ").trim();
  }
  return null;
}
function actionOf(kind, handler, src) {
  if (kind === "view") return "แสดงผล (ไม่ใช่ปุ่ม)";
  if (!handler) return kind === "input" ? "พิมพ์ค่า (state ของจอ)" : "ปุ่มของคอมโพเนนต์ (handler ภายใน)";
  const bits = [];
  for (const m of handler.matchAll(/router\.(back)\(|router\.(?:push|replace|navigate)\(\s*[`"'](\/[^`"']*)/g)) bits.push(`route ${m[1] ?? m[2]}`);
  for (const m of handler.matchAll(/["'`]((?:secretary|inbox|auth|member|me)\/[A-Za-z0-9/[\]._-]*)["'`]/g)) bits.push(`endpoint ${m[1]}`);
  // handler เรียกฟังก์ชันในไฟล์ ⇒ ตามไปดูตัวฟังก์ชัน 1 ชั้น (หา route/endpoint ที่อ้าง)
  if (!bits.length) {
    const fn = (handler.match(/(?:void\s+)?([A-Za-z_]\w*)\s*\(/) ?? handler.match(/^([A-Za-z_]\w*)$/) ?? [])[1];
    if (fn) {
      const at = src.search(new RegExp(`(?:const|function)\\s+${fn}\\b`));
      if (at >= 0) {
        // ตัวฟังก์ชัน = ถึงการประกาศตัวถัดไปในระดับเดียวกัน (const/function/return ต้นบรรทัด)
        const rest = src.slice(at + 10);
        const end = rest.search(/\n {0,2}(?:const |function |async function |return |export )/);
        const body = src.slice(at, at + 10 + (end < 0 ? 1500 : Math.min(end, 1500)));
        for (const m of body.matchAll(/router\.(back)\(|router\.(?:push|replace|navigate)\(\s*[`"'](\/[^`"']*)/g)) bits.push(`route ${m[1] ?? m[2]}`);
        for (const m of body.matchAll(/["'`]((?:secretary|inbox|auth|member)\/[A-Za-z0-9/[\]._-]*)["'`]/g)) bits.push(`endpoint ${m[1]}`);
      }
    }
  }
  if (!bits.length) bits.push(/set[A-Z]\w*\(|open\w*\(|close\w*\(|toggle/i.test(handler) ? "สถานะจอ (เปิด/ปิด/เลือก)" : "handler ในจอ");
  return [...new Set(bits)].slice(0, 4).join(" · ");
}
function scanRegistry() {
  const map = new Map();
  for (const f of SCREENS) {
    const raw = readFileSync(f, "utf8");
    const s = strip(raw);
    // R-S2.14m: รวม sendTestID/plusTestID ของ InputBar (ปุ่มส่ง/แนบ) — regex เดียวกับ oracle B-1
    for (const m of s.matchAll(/(testID|sendTestID|plusTestID)=["'`]([a-z][a-z0-9-]+)/g)) {
      const id = m[2];
      const { name, text } = tagAt(s, m.index);
      const sub = m[1] !== "testID";
      const kind = sub ? "button" : name === "TextInput" ? "input" : BUTTON_TAGS.test(name) || topProp(text, "onPress") ? "button" : "view";
      const handler = sub ? propExpr(text, m[1] === "sendTestID" ? "onSend" : "onPlus") : (propExpr(text, "onPress") ?? propExpr(text, "onChange") ?? propExpr(text, "onChangeText"));
      const cur = map.get(id) ?? { testID: id, files: [], kind, tag: name, handler: handler ?? null, action: actionOf(kind, handler, s) };
      const rel = relative(M, f);
      if (!cur.files.includes(rel)) cur.files.push(rel);
      if (cur.kind === "view" && kind !== "view") Object.assign(cur, { kind, tag: name, handler: handler ?? null, action: actionOf(kind, handler, s) });
      if (sub) cur.via = `${name} ${m[1]}`;
      map.set(id, cur);
    }
    // R-S2.14f: ชุด template `testID={`prefix-${…}`}` ⇒ แถว "prefix-*" (ต้องกดจริง ≥ 1 ตัวต่อชุด) · regex เดียวกับ oracle B-1
    for (const m of raw.matchAll(/testID=\{`([a-z][a-z0-9-]*?)-\$\{/g)) {
      const id = `${m[1]}-*`;
      const { name, text } = tagAt(raw, m.index);
      const kind = name === "TextInput" ? "input" : BUTTON_TAGS.test(name) || topProp(text, "onPress") ? "button" : "view";
      const handler = propExpr(text, "onPress") ?? propExpr(text, "onChange") ?? propExpr(text, "onChangeText");
      const cur = map.get(id) ?? { testID: id, template: true, files: [], kind, tag: name, handler: handler ?? null, action: actionOf(kind, handler, s) };
      const rel = relative(M, f);
      if (!cur.files.includes(rel)) cur.files.push(rel);
      if (cur.kind === "view" && kind !== "view") Object.assign(cur, { kind, tag: name, handler: handler ?? null, action: actionOf(kind, handler, s) });
      map.set(id, cur);
    }
  }
  return [...map.values()];
}

if (process.argv.includes("--registry")) {
  const reg = scanRegistry();
  writeFileSync(REG, JSON.stringify(reg, null, 1) + "\n");
  const by = reg.reduce((a, r) => ((a[r.kind] = (a[r.kind] ?? 0) + 1), a), {});
  console.log(`buttons-sec.json: ${reg.length} testID · ${JSON.stringify(by)}`);
  process.exit(0);
}

// ───────── กดจริง ─────────
const { serveDist, launch, openPage } = await import("./sec-harness.mjs");
const REG_TEXT = readFileSync(REG, "utf8");
const REGISTRY = JSON.parse(REG_TEXT);
const REG_HASH = createHash("sha256").update(REG_TEXT).digest("hex");
/** hash ของ build เว็บที่กด (index.html + ทุกไฟล์ JS ของ export) — RESUME ข้าม build ไม่ได้ */
function distHash(dir) {
  const hh = createHash("sha256");
  const files = [join(dir, "index.html"), ...walkAll(join(dir, "_expo"))].filter((f) => existsSync(f)).sort();
  for (const f of files) hh.update(relative(dir, f)).update(readFileSync(f));
  return hh.digest("hex");
}
function walkAll(d) {
  return existsSync(d) ? readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walkAll(q) : [q]; }) : [];
}
const TARGET = new Map(REGISTRY.map((r) => [r.testID, r]));
const ONLY = new Set((process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean));

const S12 = "/signup?name=%E0%B8%AA%E0%B8%B8%E0%B8%82&phone=0812345678&email=suk%40thebean.co";
const O12 = "/otp?phone=0812345678&mode=signup&name=%E0%B8%81&email=a%40b.co";
const R24 = "/secretary,/secretary/new,/secretary/room/r1,/secretary/inbox,/secretary/scheduled,/secretary/staff,/secretary/staff/m1,/secretary/staff/invite,/secretary/settings,/secretary/settings/secretary,/secretary/settings/access,/secretary/settings/rules,/secretary/settings/log,/secretary/settings/knowledge,/secretary/settings/customers,/secretary/settings/account,/secretary/settings/quota,/secretary/onboarding/name,/secretary/help,/secretary/help/c1,/customers,/customers/x1,/customers/x1/info,/business/new";
/** fixture → route ที่ fixture นั้นออกแบบมา (ชุดเดียวกับการถ่ายภาพ S2.13 README-reshoot + fixture สถานะ/กรณีของ S2.14) */
const SCENARIOS = [
  ["s2.20.json", "/secretary,/customers,/secretary/staff"],
  ["s2.1.json", R24],
  ["s2.12.json", `/login,${S12},${O12},/phone,/otp?phone=0812345678&mode=login&resend=1,/login?mode=email`],
  ["s2.2.json", "/secretary,/secretary/new"],
  ["s2.2-empty.json", "/secretary"],
  ["s2.4.json", "/secretary/room/r1"],
  ["s2.4-running.json", "/secretary/room/r1"],
  ["s2.4-done.json", "/secretary/room/r1"],
  ["s2.5.json", "/secretary/inbox,/secretary/scheduled"],
  ["s2.7.json", "/secretary/settings,/secretary/settings/secretary,/secretary/settings/quota,/secretary/settings/access,/secretary/settings/rules,/secretary/settings/log,/secretary/settings/knowledge,/secretary/settings/customers"],
  ["s2.7-staff.json", "/secretary/settings,/secretary/settings/access,/secretary/settings/rules,/secretary/settings/log,/secretary/settings/knowledge,/secretary/settings/customers"],
  ["s2.10.json", "/secretary/staff,/secretary/room/r2,/secretary/onboarding/name"],
  ["s2.15.json", "/secretary/help,/secretary/help/c1,/secretary/help/c2"],
  ["s2.17.json", "/customers,/customers/x1,/customers/x1/info,/secretary/settings/customers"],
  ["s2.21.json", "/business/new,/secretary/staff/invite,/secretary/staff/m1,/secretary/settings/account"],
  ["s2.21-mgr.json", "/secretary/staff/invite,/secretary/staff/m1,/secretary/staff/m2,/secretary/settings/account"],
  ["s3a6.json", "/customers/x9"], // S3a.6-A แปลภาษาห้องแชทลูกค้า (ปุ่มแปล · แปลแล้วส่ง · แผ่นยืนยัน)
  ...["s2.14-cases.json", "s2.14-loading.json", "s2.14-error.json", "s2.14-empty.json", "s2.14-denied.json"].filter((f) => existsSync(join(FIX, f))).map((f) => [f, JSON.parse(readFileSync(join(FIX, f), "utf8")).routes.join(",")]),
].flatMap(([f, rs]) => rs.split(",").filter(Boolean).map((route) => ({ fixture: f, route })))
  // SCEN=<regex ของชื่อ fixture> = สำรวจเฉพาะชุดนั้น (รอบแก้ตัวแดง · ใช้คู่ RESUME=1)
  .filter((sc) => !process.env.SCEN || new RegExp(process.env.SCEN).test(sc.fixture));

/** กรณีพิเศษ (ทางเดินกำหนดเอง: พิมพ์ค่า/เลือกไฟล์/กดตามลำดับ) — สถานะที่ fixture เปล่า ๆ ไปไม่ถึง (ข้อความผิดพลาด · ผลส่ง · ชีตชั้นลึก) */
const CASES = existsSync(join(FIX, "s2.14-cases.json")) ? (JSON.parse(readFileSync(join(FIX, "s2.14-cases.json"), "utf8")).cases ?? []) : [];
// กรณีพิเศษสำรวจก่อน (สถานะที่ต้องเตรียม ไม่ถูกเพดานครั้งของ fixture ทั่วไปกินหมดก่อน)
for (const c of [...CASES].reverse()) if (!process.env.SCEN || new RegExp(process.env.SCEN).test(c.fixture)) SCENARIOS.unshift({ fixture: c.fixture, route: c.route, path: c.path, depth: 1, isCase: true });
const COPY = process.env.QC_COPY ?? "/root/qc-shark-mobile-sec-d";
const DIST_HASH = distHash(join(COPY, "dist"));
const PORT = Number(process.env.QC_PORT ?? 4731);
const server = process.env.QC_BASE ? null : await serveDist(join(COPY, "dist"), PORT);
const BASE = process.env.QC_BASE ?? `http://127.0.0.1:${PORT}`;
const FXC = new Map();
const fxOf = (f) => FXC.get(f) ?? (FXC.set(f, JSON.parse(readFileSync(join(FIX, f), "utf8"))), FXC.get(f));

const res = new Map(); // testID → { ok, kind, effect, fixture, route, path }
const attempts = new Map(); // testID → จำนวนครั้งที่กดแล้วไม่มีผล (เพดาน MAX_TRY ข้ามทุก fixture)
const MAX_TRY = 4;
// RESUME=1: อ่านผลเดิม — testID ที่ ok แล้วไม่ต้องกดซ้ำ (ใช้รอบแก้เฉพาะตัวแดง · รอบปิดใบรันเต็มโดยไม่ตั้ง)
const RESUMED = process.env.RESUME === "1";
if (RESUMED && existsSync(OUT)) {
  // R-S2.14f: RESUME ได้เฉพาะทะเบียน + build เดียวกัน (hash ตรง) · ไฟล์ที่ได้ meta.resumed=true (ส่งมอบไม่ได้ — ใช้ไล่แก้เท่านั้น)
  const prev = JSON.parse(readFileSync(OUT, "utf8"));
  if (prev?.meta?.registryHash !== REG_HASH || prev?.meta?.distHash !== DIST_HASH) {
    console.error(`❌ RESUME ปฏิเสธ: hash ไม่ตรง (registry ${prev?.meta?.registryHash?.slice(0, 12)} ≠ ${REG_HASH.slice(0, 12)} หรือ dist ${prev?.meta?.distHash?.slice(0, 12)} ≠ ${DIST_HASH.slice(0, 12)}) — รันเต็มใหม่`);
    process.exit(2);
  }
  for (const x of prev.items ?? []) if (x.ok) res.set(x.testID, { ok: true, kind: x.kind, effect: x.effect, fixture: x.fixture, route: x.route, path: x.path ?? [] });
}
const tried = new Set(); // `${route}|${id}` ที่กดแล้ว (ทุก fixture)
/** ผลของทุก testID ที่กด/เห็น (รวมลูกของคอมโพเนนต์และสมาชิกชุด template) — ใช้ตัดสินแถว template + รากคอมโพเนนต์รวม */
const allRes = new Map();
/** testID ลูก (ใน DOM) ของแต่ละ testID — รากคอมโพเนนต์รวมตัดสินจากลูกที่กดแล้วมีผล */
const kidsOf = new Map();
const record = (id, r) => {
  const a = allRes.get(id);
  const better = !a || (!a.ok && r.ok) || (a.ok && r.ok && /^visible/.test(a.effect ?? "") && !/^visible/.test(r.effect ?? ""));
  if (better) allRes.set(id, r);
  if (!TARGET.has(id)) return;
  const cur = res.get(id);
  if (cur?.ok && !(/^visible/.test(cur.effect ?? "") && r.ok && !/^visible/.test(r.effect ?? ""))) return;
  if (!cur || r.ok || (cur.effect === "ไม่เคยเห็นบนจอ")) res.set(id, r);
};

/** ข้อมูลทุก testID ที่เห็นบนจอ */
const scan = (page) =>
  page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll("[data-testid]")) {
      const id = el.getAttribute("data-testid");
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      // ช่องพิมพ์โปร่งใสที่วางทับกล่องรหัส (OtpBoxes) ยังกดพิมพ์ได้ ⇒ ไม่ตัดด้วย opacity
      const field = el.tagName === "INPUT" || el.tagName === "TEXTAREA";
      const vis = r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none" && (field || Number(st.opacity) > 0.02);
      if (!vis) continue;
      // testID ซ้ำ: ปิดอยู่ = ทุกตัวปิด · state ของตัวแรก
      if (out[id]) {
        if (!(el.getAttribute("aria-disabled") === "true" || el.disabled === true)) out[id].disabled = false;
        continue;
      }
      const tag = el.tagName;
      const role = el.getAttribute("role") ?? "";
      const input = tag === "INPUT" || tag === "TEXTAREA";
      const btn = !input && (["button", "switch", "tab", "radio", "checkbox", "link", "imagebutton", "menuitem"].includes(role) || el.hasAttribute("tabindex"));
      // state = aria + ค่า + หน้าตา (class/style ของ RN-web เปลี่ยนเมื่อปุ่มถูกเลือก/สลับ)
      const kids = [...el.querySelectorAll("[data-testid]")].map((k) => k.getAttribute("data-testid")).filter((k) => k !== id).slice(0, 40);
      out[id] = { kids, kind: input ? "input" : btn ? "button" : "view", disabled: el.getAttribute("aria-disabled") === "true" || el.disabled === true || el.readOnly === true, state: [el.getAttribute("aria-checked"), el.getAttribute("aria-selected"), el.getAttribute("aria-pressed"), el.getAttribute("aria-expanded"), input ? el.value : null, el.className, el.getAttribute("style")].join("|") };
    }
    return out;
  });
const text = (page) => page.evaluate(() => document.body.innerText).catch(() => "");
const sample = (id) => (/phone|tel/.test(id) ? "0812345678" : /otp|code/.test(id) ? "123456" : /email/.test(id) ? "qc@example.com" : /search|filter/.test(id) ? "สม" : /limit|first|unassigned|sla/.test(id) ? "15" : "ทดสอบ QC");
async function fillAll(page) {
  const ins = await page.$$("input[data-testid]:not([type=checkbox]):not([readonly]), textarea[data-testid]:not([readonly])");
  for (const h of ins) {
    const [id, v, vis] = await h.evaluate((e) => [e.getAttribute("data-testid"), e.value, e.getBoundingClientRect().width > 0]);
    if (!vis || v) continue;
    await h.click({ count: 3 }).catch(() => {});
    await h.type(sample(id), { delay: 5 }).catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 300));
}
async function handleOf(page, id) {
  // testID ซ้ำหลายตัว (แถวในรายการ) ⇒ ตัวแรกที่เห็นและไม่ถูกปิด · ไม่มีตัวเปิด = ตัวแรกที่เห็น
  // ชิป/ตัวเลือกซ้ำ: เลือกตัวที่ยังไม่ถูกเลือก (กดตัวที่เลือกอยู่แล้ว = ไม่มีอะไรเปลี่ยนตามตั้งใจ)
  let first = null;
  let enabled = null;
  for (const h of await page.$$(`[data-testid="${id}"]`)) {
    const [vis, off, on] = await h.evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width > 0 && r.height > 0, e.getAttribute("aria-disabled") === "true", e.getAttribute("aria-selected") === "true" || e.getAttribute("aria-checked") === "true"]; }).catch(() => [false, false, false]);
    if (!vis) continue;
    if (!off && !on) return h;
    if (!off) enabled = enabled ?? h;
    first = first ?? h;
  }
  return enabled ?? first;
}
/** ค่าในช่องพิมพ์ทุกช่อง (testID → value) */
const fieldValues = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("input[data-testid], textarea[data-testid]")].map((e) => [e.getAttribute("data-testid"), e.value]))).catch(() => ({}));
/** hit-test: เลื่อนให้อยู่กลางจอแล้วดู document.elementFromPoint ที่จุดกลาง */
async function hitOk(h) {
  return h
    .evaluate((e) => {
      e.scrollIntoView({ block: "center", inline: "center" });
      const r = e.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === e || e.contains(hit));
    })
    .catch(() => false);
}
/** ขั้นเตรียมก่อนกดบางปุ่ม (ฟอร์มที่ต้องมีการแก้/กรอกก่อนปุ่มบันทึกทำงาน) — testID ที่จะกด/พิมพ์ตามลำดับ */
const PREP = {
  "sec-me-save": ["sec-me-name"],
  "sec-cust-save": ["sec-cust-afterhours"],
  "cust-set-routing-save": ["cust-set-rule-add"],
  "perm-save": ["perm-chat-VIEW"],
  "inv-submit": ["inv-name", "inv-phone", "inv-unit-all"],
  "biz-new-submit": ["biz-new-name"],
  "login-sms": ["login-phone"],
  "acct-delete-confirm": ["acct-delete-input=ลบบัญชี"],
  "cust-info-link-go": ["cust-info-link-search=สม"],
  "cust-info-ask-send": ["cust-info-ask-input=สรุปประวัติลูกค้านี้"],
  "cust-info-task-send": ["cust-info-task-input=ส่งใบเสนอราคา"],
  "login-verify": ["login-code=123456"],
};
/** ขั้นของทางเดิน: "<testID>" = กด/พิมพ์ค่าตัวอย่าง · "<testID>=<ข้อความ>" = พิมพ์ข้อความนี้ · "<testID>@file" = กดแล้วเลือกไฟล์ภาพตัวอย่าง · "wait:<ms>" = รอ */
async function step(page, spec) {
  if (spec.startsWith("wait:")) {
    await new Promise((r) => setTimeout(r, Number(spec.slice(5))));
    return true;
  }
  const file = spec.endsWith("@file");
  const [id, typed] = file ? [spec.slice(0, -5), undefined] : spec.split("=");
  const h = await handleOf(page, id);
  if (!h) return false;
  const tag = await h.evaluate((e) => e.tagName);
  if (tag === "INPUT" || tag === "TEXTAREA") {
    await h.click({ count: 3 }).catch(() => {});
    await page.keyboard.press("Backspace").catch(() => {});
    await h.type(typed ?? sample(id), { delay: 5 });
  } else if (typed !== undefined) {
    // ช่องรหัสแบบกล่อง (OtpBoxes) = View ครอบ input ที่ซ่อนอยู่ ⇒ แตะแล้วพิมพ์ด้วยคีย์บอร์ด
    await h.click().catch(() => {});
    await page.keyboard.type(typed, { delay: 20 });
  } else if (file) {
    const fc = page.waitForFileChooser({ timeout: 4000 });
    await h.click().catch(() => {});
    const ch = await fc.catch(() => null);
    if (!ch) return false;
    await ch.accept([join(M, "assets/favicon.png")]);
  } else {
    if (await h.evaluate((e) => e.getAttribute("aria-disabled") === "true")) await fillAll(page);
    await h.click().catch(() => {});
  }
  await new Promise((r) => setTimeout(r, 1000));
  return true;
}
/** รอหน้านิ่งแบบเร็ว: load แล้วรอจน request ถึง API เงียบ 450 ms (เพดาน 8 วิ — จอที่ poll ไม่ต้องรอ networkidle) */
async function settle(page, log, route) {
  await page.goto(BASE + route, { waitUntil: "load", timeout: 20000 }).catch(() => {});
  const t0 = Date.now();
  let n = -1;
  let since = Date.now();
  while (Date.now() - t0 < 8000) {
    await new Promise((r) => setTimeout(r, 150));
    const busy = await page.evaluate(() => document.querySelectorAll("[data-testid]").length).catch(() => 0);
    if (log.reqs.length !== n || busy === 0) {
      n = log.reqs.length;
      since = Date.now();
    } else if (Date.now() - since > 450) break;
  }
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await new Promise((r) => setTimeout(r, 250));
}
/** เปิด scenario + เล่นทางเดินซ้ำ · คืน { page, log } หรือ null ถ้าเล่นซ้ำไม่ได้ */
async function load(browser, sc) {
  const { page, log } = await openPage(browser, { base: BASE, route: sc.route, fx: fxOf(sc.fixture) });
  await settle(page, log, sc.route);
  for (const id of sc.path) {
    if (!(await step(page, id))) {
      await page.close();
      return null;
    }
  }
  return { page, log };
}

/** กด id ใน scenario · คืนผล + id ใหม่ที่โผล่ (สำหรับสำรวจชั้นถัดไป) */
async function act(browser, sc, id) {
  const L = await load(browser, sc);
  if (!L) return { r: { ok: false, effect: "เล่นทางเดินซ้ำไม่ได้" }, fresh: [] };
  const { page, log } = L;
  try {
    for (const p of PREP[id] ?? []) await step(page, p);
    let before = await scan(page);
    if (!before[id]) {
      // เครื่องหนัก: จอวาดช้ากว่ารอบสำรวจ ⇒ รออีกครั้งก่อนตัดสินว่าไม่เห็น
      await new Promise((r) => setTimeout(r, 1500));
      before = await scan(page);
    }
    const info = before[id];
    if (!info) return { r: { ok: false, effect: "ไม่เคยเห็นบนจอ" }, fresh: [] };
    if (info.kind === "view") return { r: { ok: true, kind: "view", effect: "visible (ไม่ใช่ปุ่ม)" }, fresh: [] };
    let h = await handleOf(page, id);
    if (info.kind === "input") {
      const mark0 = log.reqs.length;
      const v0 = await h.evaluate((e) => e.value);
      await h.click({ count: 3 }).catch(() => {});
      await h.type(sample(id), { delay: 5 });
      await new Promise((r) => setTimeout(r, 400));
      let v1 = await h.evaluate((e) => e.value).catch(() => v0);
      if (v1 === v0) {
        // ค่าตัวอย่างเท่าค่าเดิม (ช่องที่เติมมาให้) ⇒ ลองค่าอื่น
        await h.click({ count: 3 }).catch(() => {});
        await h.type(/phone|tel/.test(id) ? "0898765432" : /otp|code/.test(id) ? "654321" : "QC อื่น", { delay: 5 });
        await new Promise((r) => setTimeout(r, 300));
        v1 = await h.evaluate((e) => e.value).catch(() => v0);
      }
      // ช่องรหัส 6 หลักส่งเองเมื่อครบแล้วล้างค่า ⇒ request ที่เกิดจากการพิมพ์ = มีผล
      const sent = [...new Set(log.reqs.slice(mark0).filter((q) => q.method !== "GET").map((q) => `${q.method} ${q.path.replace("/api/mobile/", "")}`))];
      const ok = v1 !== v0 || sent.length > 0;
      return { r: { ok, kind: "input", effect: v1 !== v0 ? `input: "${String(v1).slice(0, 24)}"` : sent.length ? `input → ${sent.join(" · ")}` : "พิมพ์แล้วค่าไม่เปลี่ยน" }, fresh: [] };
    }
    if (info.disabled) {
      await fillAll(page);
      before = await scan(page);
      if (!before[id] || before[id].disabled) return { r: { ok: false, kind: "button", effect: "ปุ่มปิดอยู่ (กรอกทุกช่องแล้วก็ยังปิด)" }, fresh: [] };
      h = await handleOf(page, id);
    }
    const t0 = await text(page);
    const markPre = log.reqs.length;
    await new Promise((r) => setTimeout(r, 350));
    const t1 = await text(page);
    const recent = new Set(log.reqs.slice(markPre).map((q) => q.path + q.search));
    const noisy = t0 !== t1;
    const url0 = page.url();
    const vals0 = await fieldValues(page);
    // GET ที่จอยิงซ้ำเอง (poll ≥ 2 ครั้งก่อนกด) ไม่นับ · GET ซ้ำของเส้นที่ยิงครั้งเดียว (ปุ่มลองใหม่/โหลดใหม่) = มีผล
    const getCount = new Map();
    for (const q of log.reqs) if (q.method === "GET") getCount.set(q.path + q.search, (getCount.get(q.path + q.search) ?? 0) + 1);
    const mark = log.reqs.length;
    const ext0 = log.external.length;
    const dlg0 = log.dialogs.length;
    let chooser = false;
    const fc = page.waitForFileChooser({ timeout: 1100 }).then((c) => { chooser = true; return c.cancel(); }).catch(() => {});
    // R-S2.14e: กดได้จริงไหม — จุดกลางปุ่มต้องเป็นปุ่มนั้นหรือลูกของมัน (ไม่ถูกชีต/แถบ/ฉากบัง)
    if (!(await hitOk(h))) return { r: { ok: false, kind: "button", effect: "blocked (ถูกบัง)" }, fresh: [] };
    const clickT = Date.now();
    await h.click().catch(() => {});
    await new Promise((r) => setTimeout(r, 1100));
    // ตัวซ้ำ (ชิป/แถวรายการ): ตัวแรกกดแล้วนิ่ง ⇒ ลองตัวถัดไปบนหน้าเดิม (สูงสุด 3)
    for (const alt of (await page.$$(`[data-testid="${id}"]`)).slice(1, 3)) {
      if (log.reqs.length > mark || page.url() !== url0) break;
      const now = await scan(page).catch(() => ({}));
      if (Object.keys(now).length !== Object.keys(before).length || (now[id] && now[id].state !== before[id].state)) break;
      if (!(await alt.evaluate((e) => e.getBoundingClientRect().width > 0 && e.getAttribute("aria-disabled") !== "true").catch(() => false))) continue;
      if (!(await hitOk(alt))) continue;
      await alt.click().catch(() => {});
      await new Promise((r) => setTimeout(r, 1100));
    }
    await fc;
    const after = await scan(page).catch(() => ({}));
    const eff = [];
    // GET ซ้ำของเส้นที่จอ poll: นับเฉพาะเกิดทันทีหลังกด (< 500 ms) และไม่อยู่ในช่วงสังเกตก่อนกด (ปุ่มลองใหม่/โหลดใหม่)
    const reqs = log.reqs.slice(mark).filter((q) => q.method !== "GET" || (getCount.get(q.path + q.search) ?? 0) < 2 || (q.t - clickT < 500 && !recent.has(q.path + q.search)));
    if (reqs.length) eff.push(...[...new Set(reqs.map((q) => `${q.method} ${q.path.replace("/api/mobile/", "")}${q.method === "GET" ? q.search : ""}`))].slice(0, 3));
    if (page.url() !== url0) eff.push(`route ${page.url().replace(BASE, "")}`);
    const added = Object.keys(after).filter((k) => !before[k]);
    const removed = Object.keys(before).filter((k) => !after[k]);
    if (added.length || removed.length) eff.push(`ui +${added.slice(0, 3).join(",")} -${removed.slice(0, 3).join(",")}`);
    if (after[id] && after[id].state !== before[id].state) eff.push("state");
    // ปุ่มที่เติมค่าลงช่องพิมพ์อื่น (ชิปคำสั่งที่ใช้บ่อย · ตอบเร็ว) = ค่าในช่องเปลี่ยน
    const vals1 = await fieldValues(page);
    const changed = Object.keys(vals1).filter((k) => k !== id && vals1[k] !== vals0[k]);
    if (changed.length) eff.push(`field ${changed[0]}`);
    const opened = await page.evaluate(() => window.__opened ?? []).catch(() => []);
    if (opened.length) eff.push(`open ${opened[0].slice(0, 60)}`);
    if (log.external.length > ext0) eff.push("external");
    if (log.dialogs.length > dlg0) eff.push("dialog");
    if (chooser) eff.push("filechooser");
    if (!eff.length && !noisy && (await text(page)) !== t1) eff.push("text");
    if (process.env.DEBUG_ID === id) console.log("DEBUG", id, JSON.stringify({ reqs: log.reqs.map((q) => `${q.method} ${q.path}`), before: Object.keys(before), after: Object.keys(after), val: await page.evaluate(() => [...document.querySelectorAll("input")].map((e) => e.getAttribute("data-testid") + "=" + e.value)) }));
    const fresh = page.url() === url0 ? added : [];
    // กล่องแสดงผลที่โผล่หลังกด (ข้อความผล/ข้อผิดพลาด/ชีต) = เห็นบนจอแล้ว
    const shown = page.url() === url0 ? added.filter((k) => after[k]?.kind === "view") : [];
    return { r: { ok: eff.length > 0, kind: "button", effect: eff.length ? eff.join(" · ") : "กดแล้วไม่มีอะไรเกิด" }, fresh, shown };
  } finally {
    await page.close().catch(() => {});
  }
}

const MAX_DEPTH = Number(process.env.MAX_DEPTH ?? 2);
process.on("SIGTERM", () => {
  writeOut(); console.log("SIGTERM — เขียนผลบางส่วนแล้ว"); process.exit(3); });
const jobs = SCENARIOS.map((sc) => ({ ...sc, path: sc.path ?? [], kind: "scan" }));
const { browser, close } = await launch("click");
const started = Date.now();
let done = 0;
async function worker() {
  while (jobs.length) {
    const j = jobs.shift();
    try {
      if (j.kind === "scan") {
        // R-S2.14e: ทางเดินกรณีพิเศษ ⇒ กด/นับเฉพาะ testID ที่เพิ่งโผล่เทียบหน้าเดิมก่อนเดิน (ปุ่มเดิมของหน้าอาจถูกชีตบัง)
        if (j.isCase && j.path.length && !j.fresh) {
          const B0 = await load(browser, { ...j, path: [] });
          const base = B0 ? await scan(B0.page) : {};
          if (B0) await B0.page.close().catch(() => {});
          j.fresh = "__pending";
          j.base = base;
        }
        const L = await load(browser, j);
        if (!L) continue;
        const seen = await scan(L.page);
        // ข้อความผล/ข้อผิดพลาดที่มาช้า (เครื่องหนัก) — สแกนซ้ำหลัง 1.2 วิ รวมกัน
        await new Promise((r) => setTimeout(r, 1200));
        for (const [k, v] of Object.entries(await scan(L.page).catch(() => ({})))) if (!(k in seen)) seen[k] = v;
        await L.page.close().catch(() => {});
        if (j.fresh === "__pending") j.fresh = Object.keys(seen).filter((k) => !(k in j.base) || j.base[k].state !== seen[k].state || j.base[k].disabled !== seen[k].disabled);
        for (const [id, info] of Object.entries(seen)) {
          for (const k of info.kids ?? []) if (!kidsOf.get(id)?.includes(k)) kidsOf.set(id, [...(kidsOf.get(id) ?? []), k]);
          if (info.kind === "view") {
            // กล่องแสดงผล = เห็นจริงก็พอ (ไม่ต้องเพิ่งโผล่)
            record(id, { ok: true, kind: "view", effect: "visible (ไม่ใช่ปุ่ม)", fixture: j.fixture, route: j.route, path: j.path });
            continue;
          }
          // ชั้นลึก/กรณีพิเศษ: กดเฉพาะ testID ที่เพิ่งโผล่หรือสถานะเปลี่ยนเพราะทางเดิน — ปุ่มเดิมของหน้า (อาจถูกชีตบัง) สำรวจที่ชั้นบนแล้ว
          if (j.fresh && !j.fresh.includes(id)) continue;
          if (ONLY.size && !ONLY.has(id) && j.path.length === 0 && TARGET.has(id)) continue;
          const key = `${j.route}|${[...j.path, id].join(">")}`;
          const okNow = (x) => !!x?.ok && !/^visible/.test(x.effect ?? "");
          // ทุก testID (รวมลูกคอมโพเนนต์/สมาชิกชุด template) กดซ้ำได้ใน fixture อื่นจนมีผล (เพดาน MAX_TRY ครั้งที่ "กดแล้วนิ่ง")
          const need = (TARGET.has(id) ? !okNow(res.get(id)) : !okNow(allRes.get(id)) && j.path.length < MAX_DEPTH) && (attempts.get(id) ?? 0) < MAX_TRY;
          if (!need || tried.has(`${j.fixture}|${key}`)) continue;
          tried.add(key);
          tried.add(`${j.fixture}|${key}`);
          jobs.push({ fixture: j.fixture, route: j.route, path: j.path, kind: "act", id });
        }
      } else {
        const okNow = (x) => !!x?.ok && !/^visible/.test(x.effect ?? "");
        if ((TARGET.has(j.id) ? okNow(res.get(j.id)) : okNow(allRes.get(j.id))) && j.path.length >= MAX_DEPTH) continue;
        if (!(TARGET.has(j.id) ? okNow(res.get(j.id)) : okNow(allRes.get(j.id))) && (attempts.get(j.id) ?? 0) >= MAX_TRY) continue;
        const { r, fresh, shown = [] } = await act(browser, j, j.id);
        for (const v of shown) record(v, { ok: true, kind: "view", effect: "visible (ไม่ใช่ปุ่ม) หลังกด " + j.id, fixture: j.fixture, route: j.route, path: [...j.path, ...(PREP[j.id] ?? []), j.id] });
        // ปุ่มปิด/ไม่เห็น ในสถานะนั้น ไม่นับเพดาน (สถานะอื่นอาจเปิดได้) · กดแล้วนิ่งเท่านั้นที่นับ
        // ทางเดินที่เปิดชีต/ฉากทับไว้ (path ไม่ว่าง) ปุ่มใต้ฉากกดไม่ถึงตามตั้งใจ ⇒ ไม่นับเพดาน
        if (!r.ok && j.path.length === 0 && /ไม่มีอะไรเกิด|ค่าไม่เปลี่ยน/.test(r.effect)) attempts.set(j.id, (attempts.get(j.id) ?? 0) + 1);
        done++;
        record(j.id, { ...r, fixture: j.fixture, route: j.route, path: j.path });
        if (fresh.length && j.path.length < MAX_DEPTH) jobs.push({ fixture: j.fixture, route: j.route, path: [...j.path, ...(PREP[j.id] ?? []), j.id], kind: "scan", fresh });
        if (done % 25 === 0) console.log(`… ${done} การกด · ok ${[...res.values()].filter((x) => x.ok).length}/${TARGET.size} · คิว ${jobs.length} · ${Math.round((Date.now() - started) / 1000)} วิ`);
      }
    } catch (e) {
      console.log(`! ${j.fixture} ${j.route} ${j.path.join(">")} ${j.id ?? ""}: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
}
try {
  const N = Number(process.env.WORKERS ?? 3);
  // ผู้ทำงานหลายตัว: คิวโตระหว่างทาง ⇒ วนจนคิวว่างจริง
  while (jobs.length) await Promise.all(Array.from({ length: N }, () => worker()));
} finally {
  await close();
  if (server) server.close();
}

function writeOut() {
const isVisible = (e) => /^visible/.test(String(e ?? ""));
const out = REGISTRY.map((r) => {
  let x = res.get(r.testID);
  if (r.template) {
    // ชุด template: สมาชิก `prefix-…` (ที่ไม่ใช่ testID ตรงในทะเบียน) ที่กดแล้วมีผล ≥ 1 ตัว (ชุดที่เป็นกล่อง = เห็นจริง)
    const pre = r.testID.slice(0, -1);
    const hit = [...allRes.entries()].find(([id, v]) => id.startsWith(pre) && !TARGET.has(id) && v.ok && (r.kind === "view" || !isVisible(v.effect)));
    x = hit ? { ...hit[1], effect: `member ${hit[0]}: ${hit[1].effect}` } : { ok: false, kind: r.kind, effect: "ไม่มีสมาชิกของชุดที่กดแล้วมีผล" };
  } else if (r.kind !== "view" && x?.ok && isVisible(x.effect)) {
    // รากคอมโพเนนต์รวม (Segment/Tabs/LevelGrid/ชีต) DOM เป็นกล่อง ⇒ ต้องมีลูก `${id}-…` ที่กดแล้วมีผล ≥ 1
    const kids = new Set(kidsOf.get(r.testID) ?? []);
    const kid = [...allRes.entries()].find(([id, v]) => (id.startsWith(`${r.testID}-`) || kids.has(id)) && v.ok && !isVisible(v.effect));
    x = kid ? { ...x, kind: "group", effect: `child ${kid[0]}: ${kid[1].effect}` } : { ...x, ok: false, effect: "รากคอมโพเนนต์ไม่มีลูกที่กดแล้วมีผล" };
  }
  return { testID: r.testID, ok: !!x?.ok, kind: x?.kind ?? r.kind, effect: x?.effect ?? "ไม่เคยเห็นบนจอ", fixture: x?.fixture ?? null, route: x?.route ?? null, path: x?.path ?? [] };
});
if (process.env.DUMP_ALL) writeFileSync(process.env.DUMP_ALL, JSON.stringify(Object.fromEntries(allRes), null, 1));
const meta = { generatedAt: new Date().toISOString(), registryHash: REG_HASH, distHash: DIST_HASH, resumed: RESUMED, workers: Number(process.env.WORKERS ?? 3), clicks: done, seconds: Math.round((Date.now() - started) / 1000), scen: process.env.SCEN ?? null };
writeFileSync(OUT, JSON.stringify({ meta, items: out }, null, 1) + "\n");
return out;
}
const out = writeOut();
const dead = out.filter((x) => !x.ok);
console.log(`clicks-sec.json: ${out.length} testID · ok ${out.length - dead.length} · แดง ${dead.length} · ${done} การกด · ${Math.round((Date.now() - started) / 1000)} วิ`);
for (const d of dead) console.log(`  ✗ ${d.testID} — ${d.effect}${d.route ? ` (${d.fixture} ${d.route}${d.path.length ? " > " + d.path.join(">") : ""})` : ""}`);
process.exit(0);
