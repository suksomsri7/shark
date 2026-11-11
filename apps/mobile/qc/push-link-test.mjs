// QC (ใบ S2.6 · ขยาย S2.20 ห้องลูกค้า P-10/P-11) — ทดสอบตัวจัดการแตะแจ้งเตือนของเลขาใน src/lib/push-register.ts ด้วย "การแตะปลอม" (ไม่มีเครื่องจริง · ไม่มีเซิร์ฟเวอร์)
// วิธี: esbuild รวม push-register.ts โดยแทนโมดูล native (expo-notifications/expo-device/expo-constants/react-native/api client) ด้วยตัวปลอม
//   แล้วเรียก handleSecretaryPush / openLastSecretaryPush / syncAppBadge กับ NotificationResponse ปลอม 5 แบบลิงก์ + ลิงก์ที่ต้องปล่อยผ่าน
// รัน (จากรากรีโป): pnpm exec node apps/mobile/qc/push-link-test.mjs   → พิมพ์ JSON_SUMMARY · exit 1 เมื่อมีข้อแดง
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = resolve(HERE, "..");
const ROOT = resolve(MOBILE, "../..");
const req = createRequire(join(ROOT, "package.json"));
const esbuild = createRequire(req.resolve("tsx/package.json"))("esbuild");

const STUBS = {
  // ตัวปลอมคุมผ่าน globalThis: __QC_LAST (แจ้งเตือนที่เปิดแอป) · __QC_CLEARED (นับการล้าง) · __QC_BADGE (ค่า badge ที่ตั้ง)
  "expo-notifications": `
    export function getLastNotificationResponse() { return globalThis.__QC_LAST ?? null; }
    export function clearLastNotificationResponse() { globalThis.__QC_CLEARED = (globalThis.__QC_CLEARED ?? 0) + 1; globalThis.__QC_LAST = null; }
    export async function setBadgeCountAsync(n) { (globalThis.__QC_BADGE ??= []).push(n); return true; }
    export async function getPermissionsAsync() { return { status: "denied" }; }
    export async function requestPermissionsAsync() { return { status: "denied" }; }
    export async function getExpoPushTokenAsync() { return { data: null }; }
    export function addNotificationResponseReceivedListener() { return { remove() {} }; }`,
  "expo-device": "export const isDevice = false;",
  "expo-constants": "export default { expoConfig: { extra: {} } };",
  "react-native": "export const Platform = { OS: globalThis.__QC_OS ?? 'ios' };",
  "@/src/api/client": "export async function api() { return {}; }",
};

const dir = mkdtempSync(join(tmpdir(), "qc-push-link-"));
const out = join(dir, "bundle.mjs");
try {
  await esbuild.build({
    entryPoints: [join(MOBILE, "src/lib/push-register.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: out,
    logLevel: "silent",
    plugins: [
      {
        name: "stubs",
        setup(b) {
          b.onResolve({ filter: /^(expo-notifications|expo-device|expo-constants|react-native|@\/src\/api\/client)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
        },
      },
    ],
  });
  const M = await import(pathToFileURL(out).href);

  const cks = [];
  const chk = (id, name, ok, detail = "") => {
    cks.push({ id, ok });
    console.log(`  ${ok ? "PASS" : "FAIL"} [${id}] ${name}${ok ? "" : " — " + detail}`);
  };
  let seq = 0;
  const resp = (data) => ({ actionIdentifier: "expo.modules.notifications.actions.DEFAULT", notification: { request: { identifier: `n${++seq}`, content: { title: "t", body: "b", data } } } });
  const mkDeps = (active = "t1") => {
    const log = [];
    return {
      log,
      deps: {
        activeTenantId: active,
        tenantIds: ["t1", "t2"],
        switchTenant: async (id) => {
          log.push(["switch", id]);
        },
        push: (href) => log.push(["push", href]),
      },
    };
  };
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const res = {};

  // 1 ห้องเลขา (รออนุมัติ/เสร็จ) ร้านอื่น ⇒ switchTenant ก่อนแล้วเปิดห้อง · conversationId ที่แนบมาไม่ทำให้หลุดไป /chat
  {
    const { log, deps } = mkDeps("t1");
    const handled = M.handleSecretaryPush(resp({ link: "/secretary/room/r9", conversationId: "c9", roomId: "r9", kind: "room", tenantId: "t2" }), deps);
    await tick();
    res.room = { handled, log };
    chk("P-1", "room: /secretary/room/<id> + tenantId ร้านอื่น ⇒ switch t2 แล้ว push /secretary/room/r9 (ก่อน conversationId)", handled === true && JSON.stringify(log) === JSON.stringify([["switch", "t2"], ["push", "/secretary/room/r9"]]), JSON.stringify(log));
  }
  // 2 กล่องรวม (รออนุมัติ) ไม่มี tenantId
  {
    const { log, deps } = mkDeps("t1");
    const handled = M.handleSecretaryPush(resp({ link: "/secretary/inbox?e=approval" }), deps);
    await tick();
    res.inbox = { handled, log };
    chk("P-2", "inbox: /secretary/inbox?e=… ⇒ push /secretary/inbox (ตัด ?e=) ไม่สลับร้าน", handled && JSON.stringify(log) === JSON.stringify([["push", "/secretary/inbox"]]), JSON.stringify(log));
  }
  // 3 ลูกค้า ร้านเดียวกัน ⇒ ไม่สลับ
  {
    const { log, deps } = mkDeps("t1");
    const handled = M.handleSecretaryPush(resp({ link: "/customers/conv1", tenantId: "t1" }), deps);
    await tick();
    res.customers = { handled, log };
    chk("P-3", "customers: /customers/<id> ร้านเดียวกัน ⇒ push อย่างเดียว", handled && JSON.stringify(log) === JSON.stringify([["push", "/customers/conv1"]]), JSON.stringify(log));
  }
  // 4 งานประจำ (โควตา/งานประจำ) tenantId ที่ไม่ได้เป็นสมาชิก ⇒ ไม่สลับ
  {
    const { log, deps } = mkDeps("t1");
    const handled = M.handleSecretaryPush(resp({ link: "/secretary/scheduled#x", tenantId: "t-other" }), deps);
    await tick();
    res.scheduled = { handled, log };
    chk("P-4", "scheduled: /secretary/scheduled + ร้านที่ไม่ได้เป็นสมาชิก ⇒ ไม่สลับ · push /secretary/scheduled", handled && JSON.stringify(log) === JSON.stringify([["push", "/secretary/scheduled"]]), JSON.stringify(log));
  }
  // 5 ช่วยเหลือ: /help/<id> ของเซิร์ฟเวอร์ และ /secretary/help/<id>
  {
    const { log, deps } = mkDeps("t2");
    const a = M.handleSecretaryPush(resp({ link: "/help/c7", tenantId: "t1" }), deps);
    const b = M.handleSecretaryPush(resp({ link: "/secretary/help/c8" }), deps);
    await tick();
    res.help = { a, b, log };
    // c7 รอสลับร้าน (async) ⇒ c8 เปิดก่อน แล้ว c7 ตามหลังสลับเสร็จ
    chk("P-5", "help: /help/c7 (t1) ⇒ switch t1 แล้ว /secretary/help/c7 · /secretary/help/c8 ⇒ push", a && b && JSON.stringify(log) === JSON.stringify([["switch", "t1"], ["push", "/secretary/help/c8"], ["push", "/secretary/help/c7"]]), JSON.stringify(log));
  }
  // 6 ลิงก์ที่ไม่ใช่ของเลขา ⇒ false (ตัวจัดการเดิมทำต่อ)
  {
    const { log, deps } = mkDeps("t1");
    const links = ["/app/sys/s1/crm/deals/d1?n=x", "/inbox", "/inbox/", "/inbox/a/b", "//evil.example/secretary/inbox", "https://evil.example/secretary/inbox", "/secretary/room/../../x", "/secretary/room/", null, 42];
    const r = links.map((l) => M.handleSecretaryPush(resp({ link: l, conversationId: "c1" }), deps));
    await tick();
    res.passThrough = { r, log };
    chk("P-6", "ลิงก์อื่น (CRM · /inbox ที่ไม่มี id · โดเมนอื่น · path แปลก · ไม่มีลิงก์) ⇒ false ไม่ push", r.every((x) => x === false) && log.length === 0, JSON.stringify(r));
  }
  // 7 ใบเดิมซ้ำ (listener + เปิดแอปจากแจ้งเตือน) ⇒ เปิดครั้งเดียว
  {
    const { log, deps } = mkDeps("t1");
    const r1 = resp({ link: "/secretary/inbox" });
    const x = M.handleSecretaryPush(r1, deps);
    const y = M.handleSecretaryPush(r1, deps);
    await tick();
    res.dedupe = { x, y, log };
    chk("P-7", "identifier เดิมสองครั้ง ⇒ true ทั้งคู่ แต่ push ครั้งเดียว", x && y && log.length === 1, JSON.stringify(log));
  }
  // 8 เปิดแอปจากแจ้งเตือน (แอปปิดอยู่) ⇒ เปิด + ล้าง last · ไม่มี = ไม่ทำอะไร · ลิงก์ไม่ใช่ของเลขา = ไม่ล้าง (ตัวเดิมยังใช้ได้)
  {
    const { log, deps } = mkDeps("t1");
    M.openLastSecretaryPush(deps);
    globalThis.__QC_LAST = resp({ link: "/secretary/room/r1", tenantId: "t2" });
    M.openLastSecretaryPush(deps);
    await tick();
    const cleared = globalThis.__QC_CLEARED ?? 0;
    globalThis.__QC_LAST = resp({ link: "/app/sys/s1/crm/deals/d1" });
    M.openLastSecretaryPush(deps);
    await tick();
    res.coldStart = { log, cleared, clearedAfterOther: globalThis.__QC_CLEARED ?? 0 };
    chk("P-8", "openLastSecretaryPush: ไม่มี ⇒ เฉย · ห้องเลขา ⇒ switch t2 + push + ล้าง 1 ครั้ง · ลิงก์ CRM ⇒ ไม่แตะ", JSON.stringify(log) === JSON.stringify([["switch", "t2"], ["push", "/secretary/room/r1"]]) && cleared === 1 && (globalThis.__QC_CLEARED ?? 0) === 1, JSON.stringify(res.coldStart));
  }
  // 9 badge ไอคอนแอป
  {
    let fetched = 0;
    await M.syncAppBadge(async () => {
      fetched++;
      return 3;
    });
    await M.syncAppBadge(async () => {
      fetched++;
      return null;
    });
    await M.syncAppBadge(async () => {
      throw new Error("offline");
    });
    res.badge = { fetched, set: globalThis.__QC_BADGE ?? [] };
    chk("P-9", "syncAppBadge: อ่าน secretary/badge แล้วตั้ง badge 3 · null/ล้ม = ไม่ตั้ง ไม่ throw", fetched === 2 && JSON.stringify(globalThis.__QC_BADGE) === "[3]", JSON.stringify(res.badge));
  }
  // 10 S2.20 ห้องลูกค้า: ลิงก์ /inbox/<id>?e= ของเซิร์ฟเวอร์ (chat/routing.ts) และ /customers/<id>?e= ⇒ /customers/<id>?s=<systemId>&e=<เหตุ> · ไม่ตกไป /chat ของ 1.0
  {
    const { log, deps } = mkDeps("t1");
    const a = M.handleSecretaryPush(resp({ link: "/inbox/conv1?e=assigned", conversationId: "conv1", systemId: "cs1", tenantId: "t2" }), deps);
    const b = M.handleSecretaryPush(resp({ link: "/customers/x1?e=helper", tenantId: "t1" }), deps);
    const c = M.handleSecretaryPush(resp({ link: "/inbox/x2?e=sla", systemId: "cs/../1" }), deps);
    const d = M.handleSecretaryPush(resp({ link: "/customers/x3?e=bogus&x=1", systemId: "cs2" }), deps);
    const e = M.handleSecretaryPush(resp({ link: "/inbox/x4?foo=1&e=handoff#z" }), deps);
    await tick();
    res.customersPush = { a, b, c, d, e, log };
    const want = [["switch", "t2"], ["push", "/customers/x1?e=helper"], ["push", "/customers/x2?e=sla"], ["push", "/customers/x3?s=cs2"], ["push", "/customers/x4?e=handoff"], ["push", "/customers/conv1?s=cs1&e=assigned"]];
    chk("P-10", "ห้องลูกค้า: /inbox|/customers/<id>?e= ⇒ /customers/<id>?s=&e= (เหตุที่รู้จักเท่านั้น · systemId รูปแปลก = ไม่ใส่) + สลับร้าน", [a, b, c, d, e].every(Boolean) && JSON.stringify(log) === JSON.stringify(want), JSON.stringify(log));
    chk("P-11", "customerPushReason: รู้จัก 4 เหตุ · อื่น = null", M.customerPushReason("helper") === "helper" && M.customerPushReason("assigned") === "assigned" && M.customerPushReason("x") === null && M.customerPushReason(undefined) === null, "");
  }
  const failed = cks.filter((c) => !c.ok).map((c) => c.id);
  console.log("RESULT " + JSON.stringify(res));
  console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed: cks.length - failed.length, failed }));
  process.exitCode = failed.length ? 1 : 0;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
