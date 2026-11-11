// pos-device-pair.mts — POS P4.3 fix4 (ตัวกด + ตัววัดผล หลัง P5.2 D+E · มติ CD-P43-10) — จับคู่ browser context กับเครื่องขาย
//   ด้วยทางของผลิตภัณฑ์เอง: เปิด ตั้งค่า › เครื่องขาย ในฐานะ "เจ้าของ" (session ที่ผู้เรียก mint) โดย localStorage `shark.pos.deviceId` = รหัสเครื่องของ fixture
//   แล้วกด `pos-device-pair-this` (รหัสลงทะเบียนแล้ว · เบราว์เซอร์นี้ไม่มีคุกกี้) หรือ `pos-device-register` → ชื่อ → ยืนยัน (รหัสยังไม่ลงทะเบียน)
//   → registerDeviceAction ตั้งคุกกี้ httpOnly `shark_pos_device` ใน context นี้ (คุกกี้อยู่ระดับ context — หน้าอื่นใน context เดียวกันใช้ได้)
//   ตรวจผล: สถานะของ devicePairingAction บนหน้า (pair-this หาย · ไม่มีการ์ดกุญแจ · ปุ่มลงทะเบียน = "ลงทะเบียนแล้ว" ปิด) + คุกกี้มีจริงใน context
//   จบแล้วลบคุกกี้ session ของเจ้าของออกจาก context (ผู้เรียกตั้ง session ของผู้ใช้ช่องต่อเอง) · ปิดหน้าที่ใช้จับคู่
// 🔴 บริสุทธิ์ฝั่ง node: ไม่ import "@/…" · ไม่แตะ DB · ไม่อ่าน .env · ไม่พิมพ์ค่าคุกกี้/กุญแจ (รายงานแค่ "มี/ไม่มี")
// 🔴 โค้ดฝั่งเบราว์เซอร์ส่งเป็น "สตริง" ทั้งหมด (tsx keepNames ใส่ __name() รอบฟังก์ชันที่ผูกชื่อ — CD-P53-O13)
// 🔴 กุญแจไม่ได้ตั้งบนเซิร์ฟเวอร์ (การ์ด `pos-device-key-unset`) = ผล state "key-unset" — ผู้เรียกต้องขวาง (ไม่ข้ามเงียบ)
// ใช้: import { pairBrowserDevice } from "./pos-device-pair.mjs" · ทดสอบตัวตัดสินแบบบริสุทธิ์: pnpm exec tsx scripts/pos-device-pair.mts --self-test
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export const POS_DEVICE_LS_KEY = "shark.pos.deviceId";
export const POS_DEVICE_COOKIE_NAME = "shark_pos_device";
export const SESSION_COOKIE_NAMES = ["shark_session", "__Host-shark_session"] as const;
/** ชื่อเครื่องเมื่อต้องลงทะเบียนผ่านหน้า (brief P4.3 fix4 §1) */
export const PAIR_DEVICE_NAME = "ตัวกด P4.2";
/** รอสถานะจับคู่ (devicePairingAction) หลังรายการเครื่องขึ้นก่อนตัดสินว่า "ลงทะเบียนใหม่" — การ์ดกุญแจมาทีหลังรายการ */
export const PAIR_SETTLE_MS = 2500;

export const devicesUrl = (base: string, systemId: string, unitId: string): string =>
  `${base}/app/sys/${encodeURIComponent(systemId)}/pos/settings?tab=devices&unit=${encodeURIComponent(unitId)}`;

export type PairSnap = {
  list: boolean; // pos-settings-devices
  loading: boolean; // pos-device-loading
  loadError: string; // pos-device-load-error (ข้อความ)
  keyUnset: boolean; // pos-device-key-unset มองเห็น
  pairThis: { present: boolean; disabled: boolean };
  register: { present: boolean; disabled: boolean };
  dialog: boolean; // pos-device-register-dialog
  note: string; // pos-device-note
  error: string; // pos-device-error
  regError: string; // pos-device-register-error
};
export type PairStep = "pair-this" | "register" | "key-unset" | "load-error" | "wait";
/** ตัดสินจากภาพหน้า (บริสุทธิ์ · ด่าน --self-test) — settledMs = เวลาตั้งแต่รายการเครื่องขึ้น */
export function pairDecision(s: PairSnap, settledMs: number): PairStep {
  if (s.loadError) return "load-error";
  if (s.keyUnset) return "key-unset";
  if (s.pairThis.present && !s.pairThis.disabled) return "pair-this";
  if (!s.list || s.loading) return "wait";
  if (s.register.present && !s.register.disabled && settledMs >= PAIR_SETTLE_MS) return "register";
  return "wait";
}
/** หลังจับคู่: สถานะของ devicePairingAction บนหน้า = จับคู่แล้ว (ไม่มีปุ่มจับคู่ · ไม่มีการ์ดกุญแจ · ปุ่มลงทะเบียนปิด "ลงทะเบียนแล้ว") */
export function pairedOnPage(s: PairSnap): boolean {
  return s.list && !s.loading && !s.loadError && !s.keyUnset && !s.pairThis.present && s.register.present && s.register.disabled;
}

export type PairOk = { ok: true; how: "pair-this" | "register" | "already"; detail: string; cookie: Any };
export type PairFail = { ok: false; state: "key-unset" | "load-error" | "refused" | "timeout" | "session" | "http" | "no-cookie" | "unverified"; detail: string };
export type PairResult = PairOk | PairFail;
export type PairOpts = {
  base: string;
  systemId: string;
  unitId: string;
  deviceCode: string;
  /** คุกกี้ session ของเจ้าของ (รูปแบบ page.setCookie) — ผู้เรียก mint และลบแถว session เอง */
  ownerCookies: Any[];
  name?: string;
  timeoutMs?: number;
};

const SNAP_JS = `(() => {
  const q = (t) => document.querySelector('[data-testid="' + t + '"]');
  const vis = (e) => !!e && e.getClientRects().length > 0;
  const txt = (t) => { const e = q(t); return vis(e) ? (e.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 160) : ""; };
  const btn = (t) => { const e = q(t); return { present: vis(e), disabled: !!e && (e.disabled === true || e.getAttribute("aria-disabled") === "true") }; };
  return {
    list: vis(q("pos-settings-devices")),
    loading: vis(q("pos-device-loading")),
    loadError: txt("pos-device-load-error"),
    keyUnset: vis(q("pos-device-key-unset")),
    pairThis: btn("pos-device-pair-this"),
    register: btn("pos-device-register"),
    dialog: vis(q("pos-device-register-dialog")),
    note: txt("pos-device-note"),
    error: txt("pos-device-error"),
    regError: txt("pos-device-register-error"),
  };
})()`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clickJs = (tid: string) => `(() => { const e = document.querySelector('[data-testid="${tid}"]'); if (!e) return false; e.click(); return true; })()`;
const setNameJs = (name: string) => `(() => {
  const e = document.querySelector('[data-testid="pos-device-register-name"]');
  if (!e) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, ${JSON.stringify(name)});
  e.dispatchEvent(new Event("input", { bubbles: true }));
  e.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`;
const snapOf = async (page: Any): Promise<PairSnap | null> => (await page.evaluate(SNAP_JS).catch(() => null)) as PairSnap | null;
const short = (s: PairSnap | null) =>
  s ? `list ${s.list ? 1 : 0} loading ${s.loading ? 1 : 0} keyUnset ${s.keyUnset ? 1 : 0} pairThis ${s.pairThis.present ? (s.pairThis.disabled ? "off" : "on") : "-"} register ${s.register.present ? (s.register.disabled ? "off" : "on") : "-"}${s.loadError ? ` loadError "${s.loadError}"` : ""}${s.error ? ` error "${s.error}"` : ""}${s.regError ? ` regError "${s.regError}"` : ""}` : "อ่านหน้าไม่ได้";

/** คุกกี้เครื่องของ context (มี = อ็อบเจกต์ CookieParam สำหรับคัดลอก · ไม่มี = null) — ไม่พิมพ์ค่า */
export async function deviceCookieOf(page: Any, base: string): Promise<Any | null> {
  const all: Any[] = await page.cookies(base).catch(() => []);
  const c = all.find((x) => x?.name === POS_DEVICE_COOKIE_NAME);
  if (!c) return null;
  const out: Any = { name: c.name, value: c.value, domain: c.domain, path: c.path ?? "/", httpOnly: !!c.httpOnly, secure: !!c.secure };
  if (c.sameSite) out.sameSite = c.sameSite;
  if (typeof c.expires === "number" && c.expires > 0) out.expires = c.expires;
  return out;
}

type Opened = { ok: true; step: "pair-this" | "register" | "wait"; snap: PairSnap | null } | PairFail;
/** เปิดหน้าเครื่องขายในฐานะเจ้าของ (localStorage = รหัสเครื่อง) แล้วรอจนตัดสินทางได้ — ไม่กดอะไร */
async function openAndDecide(page: Any, o: PairOpts, timeout: number): Promise<Opened> {
  const url = devicesUrl(o.base, o.systemId, o.unitId);
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(`try { window.localStorage.setItem(${JSON.stringify(POS_DEVICE_LS_KEY)}, ${JSON.stringify(o.deviceCode)}); } catch (e) {}`);
  if (o.ownerCookies.length) await page.setCookie(...o.ownerCookies);
  const r = await page.goto(url, { waitUntil: "networkidle2", timeout: 45_000 }).catch((e: unknown) => e as Error);
  if (r instanceof Error || !r) return { ok: false, state: "http", detail: `เปิด ${url.replace(o.base, "")} ไม่ได้ (${r instanceof Error ? r.message.slice(0, 100) : "ไม่มีคำตอบ"})` };
  const at = String(page.url());
  if (/\/login|\/onboarding/.test(at)) return { ok: false, state: "session", detail: `session เจ้าของไม่ติด — เด้งไป ${at.replace(o.base, "")}` };
  if (r.status() >= 400) return { ok: false, state: "http", detail: `HTTP ${r.status()} ${url.replace(o.base, "")}` };
  const t0 = Date.now();
  let listAt = 0;
  let s: PairSnap | null = null;
  let step: PairStep = "wait";
  while (Date.now() - t0 < timeout) {
    s = await snapOf(page);
    if (s?.list && !s.loading && !listAt) listAt = Date.now();
    step = s ? pairDecision(s, listAt ? Date.now() - listAt : 0) : "wait";
    if (step !== "wait") break;
    await sleep(250);
  }
  if (step === "key-unset") return { ok: false, state: "key-unset", detail: KEY_UNSET_DETAIL };
  if (step === "load-error") return { ok: false, state: "load-error", detail: `รายการเครื่องโหลดไม่ได้: ${s?.loadError}` };
  return { ok: true, step: step === "pair-this" || step === "register" ? step : "wait", snap: s };
}
const KEY_UNSET_DETAIL = "เซิร์ฟเวอร์ยังไม่ตั้ง POS_DEVICE_KEY (การ์ด pos-device-key-unset) — จับคู่เครื่องไม่ได้ ⇒ ขวาง (CD-P43-10: ผู้คุมเสิร์ฟด้วยกุญแจชั่วคราว)";
const dropOwnerSession = async (page: Any, base: string) => {
  for (const name of SESSION_COOKIE_NAMES) await page.deleteCookie({ name, url: base }).catch(() => {});
};

/** อ่านอย่างเดียว (pre-flight): กุญแจตั้งแล้วไหม + เครื่องนี้จับคู่ได้ทางไหน — ไม่กด (ไม่ลงทะเบียน · ไม่ออกคุกกี้) */
export async function inspectPairing(ctx: Any, o: PairOpts): Promise<{ ok: true; step: "pair-this" | "register" | "paired" | "wait"; detail: string } | PairFail> {
  const page = await ctx.newPage();
  try {
    const r = await openAndDecide(page, o, o.timeoutMs ?? 20_000);
    if (!r.ok) return r;
    if (r.step === "wait" && r.snap && pairedOnPage(r.snap) && (await deviceCookieOf(page, o.base))) return { ok: true, step: "paired", detail: short(r.snap) };
    return { ok: true, step: r.step === "pair-this" || r.step === "register" ? r.step : "wait", detail: short(r.snap) };
  } catch (e) {
    return { ok: false, state: "refused", detail: `ตรวจล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}` };
  } finally {
    await dropOwnerSession(page, o.base);
    await page.close().catch(() => {});
  }
}

/** จับคู่ context (ผ่านหน้า ตั้งค่า › เครื่องขาย ในฐานะเจ้าของ) — ไม่โยน · ผลบอก state + เหตุ */
export async function pairBrowserDevice(ctx: Any, o: PairOpts): Promise<PairResult> {
  const timeout = o.timeoutMs ?? 30_000;
  const page = await ctx.newPage();
  try {
    const opened = await openAndDecide(page, o, timeout);
    if (!opened.ok) return opened;
    const step = opened.step;
    const s = opened.snap;
    if (step === "wait") {
      // ไม่มีปุ่มให้กด: เบราว์เซอร์นี้จับคู่อยู่แล้ว (คุกกี้มี + หน้าบอกจับคู่แล้ว) หรือหน้าไม่พร้อม
      const ck = await deviceCookieOf(page, o.base);
      if (ck && s && pairedOnPage(s)) return { ok: true, how: "already", detail: `จับคู่อยู่แล้ว (${short(s)})`, cookie: ck };
      return { ok: false, state: "timeout", detail: `ไม่พบทางจับคู่ใน ${Math.round(timeout / 1000)} วิ (${short(s)})` };
    }
    // ── กด ──
    if (step === "pair-this") {
      await page.evaluate(clickJs("pos-device-pair-this"));
    } else {
      await page.evaluate(clickJs("pos-device-register"));
      const d0 = Date.now();
      while (Date.now() - d0 < 8000 && !(await snapOf(page))?.dialog) await sleep(150);
      if (!(await page.evaluate(setNameJs(o.name ?? PAIR_DEVICE_NAME)).catch(() => false))) return { ok: false, state: "refused", detail: `กด pos-device-register แล้วไม่เห็นช่องชื่อ pos-device-register-name (${short(await snapOf(page))})` };
      await sleep(150);
      await page.evaluate(clickJs("pos-device-register-confirm"));
    }
    // ── ผลของ action: note (สำเร็จ) / error ──
    const a0 = Date.now();
    let done: PairSnap | null = null;
    while (Date.now() - a0 < 20_000) {
      done = await snapOf(page);
      if (done && (done.note || done.error || done.regError)) break;
      await sleep(200);
    }
    if (done?.error || done?.regError) {
      const msg = done.error || done.regError;
      return { ok: false, state: /กุญแจ|key/i.test(msg) ? "key-unset" : "refused", detail: `${step} ถูกปฏิเสธ: ${msg}` };
    }
    // ── ตรวจ: สถานะของ devicePairingAction บนหน้า + คุกกี้ ──
    const v0 = Date.now();
    let v: PairSnap | null = null;
    while (Date.now() - v0 < 12_000) {
      v = await snapOf(page);
      if (v && pairedOnPage(v)) break;
      await sleep(250);
    }
    const ck = await deviceCookieOf(page, o.base);
    if (!ck) return { ok: false, state: "no-cookie", detail: `${step} แล้วไม่มีคุกกี้ ${POS_DEVICE_COOKIE_NAME} ใน context (${short(v)})` };
    if (!v || !pairedOnPage(v)) return { ok: false, state: "unverified", detail: `${step} แล้วหน้ายังไม่บอกจับคู่ (${short(v)})` };
    return { ok: true, how: step, detail: `${step} ✓ · ${done?.note ? `note "${done.note}" · ` : ""}คุกกี้ ${POS_DEVICE_COOKIE_NAME} มี (httpOnly ${ck.httpOnly ? "ใช่" : "ไม่"})`, cookie: ck };
  } catch (e) {
    return { ok: false, state: "refused", detail: `จับคู่ล้ม: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}` };
  } finally {
    // session เจ้าของออกจาก context — คุกกี้เครื่อง (ระดับ context) คงอยู่
    await dropOwnerSession(page, o.base);
    await page.close().catch(() => {});
  }
}

// ═════════════════════════ --self-test (บริสุทธิ์ · ไม่มีเบราว์เซอร์) ═════════════════════════
const isMain = (() => {
  try {
    return !!process.argv[1] && /pos-device-pair\.mts$/.test(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isMain) {
  if (!process.argv.includes("--self-test")) {
    console.log("ใช้: pnpm exec tsx scripts/pos-device-pair.mts --self-test   (โมดูล — ผู้ใช้จริงคือ qc-pos-buttons.mts · pos-buttons-fixtures.mts --preflight --base · qc-pos-p5.3.mts)");
    process.exit(2);
  }
  const base: PairSnap = { list: true, loading: false, loadError: "", keyUnset: false, pairThis: { present: false, disabled: false }, register: { present: true, disabled: true }, dialog: false, note: "", error: "", regError: "" };
  const S = (x: Partial<PairSnap>): PairSnap => ({ ...base, ...x });
  const cases: [string, PairStep | boolean, PairStep | boolean][] = [
    ["กุญแจไม่ตั้ง (การ์ด) = key-unset", pairDecision(S({ keyUnset: true }), 0), "key-unset"],
    ["กุญแจไม่ตั้ง + ปุ่มลงทะเบียนเปิด = key-unset (ไม่ลงทะเบียนทับ)", pairDecision(S({ keyUnset: true, register: { present: true, disabled: false } }), 9999), "key-unset"],
    ["รหัสลงแล้ว ไม่มีคุกกี้ = pair-this", pairDecision(S({ pairThis: { present: true, disabled: false }, register: { present: false, disabled: false } }), 0), "pair-this"],
    ["ปุ่มจับคู่ปิด (busy) = รอ", pairDecision(S({ pairThis: { present: true, disabled: true }, register: { present: false, disabled: false } }), 9999), "wait"],
    ["รหัสใหม่ ก่อนสถานะจับคู่นิ่ง = รอ", pairDecision(S({ register: { present: true, disabled: false } }), 500), "wait"],
    ["รหัสใหม่ หลังนิ่ง = register", pairDecision(S({ register: { present: true, disabled: false } }), PAIR_SETTLE_MS), "register"],
    ["รายการยังโหลด = รอ", pairDecision(S({ loading: true, register: { present: true, disabled: false } }), 9999), "wait"],
    ["โหลดรายการล้ม = load-error", pairDecision(S({ loadError: "x" }), 0), "load-error"],
    ["ปุ่มลงทะเบียนปิด (ลงแล้ว/สถานะยังไม่มา) = รอ", pairDecision(S({}), 9999), "wait"],
    ["หลังจับคู่: ไม่มีปุ่มจับคู่ + ลงทะเบียนปิด = จับคู่แล้ว", pairedOnPage(S({})), true],
    ["ยังมีปุ่มจับคู่ = ยังไม่จับคู่", pairedOnPage(S({ pairThis: { present: true, disabled: false } })), false],
    ["การ์ดกุญแจ = ยังไม่จับคู่", pairedOnPage(S({ keyUnset: true })), false],
    ["ปุ่มลงทะเบียนเปิด = ยังไม่จับคู่", pairedOnPage(S({ register: { present: true, disabled: false } })), false],
    ["devicesUrl", devicesUrl("http://127.0.0.1:3299", "sys1", "posqc-btn-unit") === "http://127.0.0.1:3299/app/sys/sys1/pos/settings?tab=devices&unit=posqc-btn-unit", true],
  ];
  let bad = 0;
  for (const [name, got, want] of cases) {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` — ได้ ${String(got)} คาด ${String(want)}`}`);
  }
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "pos-device-pair", mode: "self-test", total: cases.length, passed: cases.length - bad })}`);
  process.exit(bad ? 1 : 0);
}
