// ถ่ายภาพหน้าจอ "แชทลูกค้า → สนทนา" (ChatInboxSection) แบบ headless เพื่อ QC responsive
//
// ทำไมไม่ยิงของจริงบน prod: หน้านี้ต้องล็อกอิน และ .env ชี้ DB prod (ห้ามแตะ)
// → bundle `src/lib/modules/chat/ui.tsx` ตัวจริงด้วย esbuild แล้ว stub เฉพาะชั้นข้อมูล
//   (prisma / requireTenant / service / actions / next-link) แล้วเรนเดอร์ด้วย react-dom/server
//   = markup + className ทุกตัวมาจากคอมโพเนนต์จริง ไม่ใช่ mock ที่วาดเอง
//
// ใช้: node scripts/shot-chat-mobile.mjs [--tag before|after]
// ผลลัพธ์: /root/qc-shots/chat/<tag>-<state>-<width>.png + ตัวเลข scrollWidth ทาง stdout
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, "..");
// pnpm strict node_modules — postcss/esbuild เป็น transitive dep ต้องอ้าง path ตรง
const P = (p) => path.join(ROOT, "node_modules/.pnpm", p);
const postcss = (await import(P("postcss@8.5.16/node_modules/postcss/lib/postcss.mjs"))).default;
const tailwind = (await import("@tailwindcss/postcss")).default;
const esbuild = await import(P("esbuild@0.28.1/node_modules/esbuild/lib/main.js"));
const TAG = (process.argv.includes("--tag") ? process.argv[process.argv.indexOf("--tag") + 1] : "shot") || "shot";
const OUT = "/root/qc-shots/chat";
mkdirSync(OUT, { recursive: true });

// ─────────── ข้อมูลปลอม (โครงเดียวกับที่ service.ts คืนจริง) ───────────
// เวลาคงที่ → ภาพ reproducible ไบต์ต่อไบต์ (เทียบ before/after ด้วย md5 ได้)
const T0 = Date.parse("2026-08-29T05:00:00+07:00");
const d = (min) => new Date(T0 - min * 60_000);
const CONVS = [
  {
    id: "c1", channel: "LINE", status: "OPEN", staffUnreadCount: 3, assigneeUserId: "u1",
    lastMessagePreview: "สวัสดีค่ะ อยากสอบถามเรื่องคอร์สเรียนทำผมที่เปิดรับสมัครรอบเดือนหน้า ยังมีที่ว่างอยู่ไหมคะ แล้วราคาเท่าไหร่",
    contact: { id: "ct1", displayName: "คุณสมหญิง ศรีสุวรรณพงษ์ไพบูลย์", phone: "0812345678", customerId: "m1" },
  },
  {
    id: "c2", channel: "WEBCHAT", status: "PENDING", staffUnreadCount: 0, assigneeUserId: null,
    lastMessagePreview: "ขอบคุณมากค่ะ เดี๋ยวจะโอนเงินมัดจำแล้วส่งสลิปมาให้ในแชทนี้เลยนะคะ",
    contact: { id: "ct2", displayName: "ลูกค้าเว็บ #4821", phone: null, customerId: null },
  },
  {
    id: "c3", channel: "FACEBOOK", status: "RESOLVED", staffUnreadCount: 0, assigneeUserId: "u2",
    lastMessagePreview: "รับทราบครับ ขอบคุณครับ",
    contact: { id: "ct3", displayName: "Nattapong Wattanachaikul", phone: "0899999999", customerId: null },
  },
  {
    id: "c4", channel: "LINE", status: "OPEN", staffUnreadCount: 12, assigneeUserId: null,
    lastMessagePreview: "รบกวนเช็คคิวว่างวันเสาร์ที่ 5 ให้หน่อยได้ไหมคะ ถ้าเต็มขอเป็นวันอาทิตย์แทนได้ไหม",
    contact: { id: "ct4", displayName: "แม่น้องปอนด์", phone: null, customerId: null },
  },
];
const MESSAGES = [
  { id: "m1", direction: "IN", type: "TEXT", body: "สวัสดีค่ะ อยากสอบถามเรื่องคอร์สเรียนทำผมที่เปิดรับสมัครรอบเดือนหน้า ยังมีที่ว่างอยู่ไหมคะ แล้วราคาเท่าไหร่คะ", isInternal: false, senderUserId: null, deliveryStatus: "SENT", deliveryError: null, createdAt: d(120) },
  { id: "m2", direction: "OUT", type: "TEXT", body: "สวัสดีค่ะ รอบเดือนหน้าเหลือ 2 ที่ค่ะ ราคา 12,500 บาท รวมอุปกรณ์ทั้งหมดแล้วนะคะ", isInternal: false, senderUserId: "u1", deliveryStatus: "SENT", deliveryError: null, createdAt: d(110) },
  { id: "m3", direction: "OUT", type: "TEXT", body: "ลูกค้ารายนี้เคยจองแล้วยกเลิกมาแล้ว 1 ครั้ง เก็บมัดจำก่อนนะ", isInternal: true, senderUserId: "u2", deliveryStatus: "SENT", deliveryError: null, createdAt: d(100) },
  { id: "m4", direction: "IN", type: "TEXT", body: "ขอบคุณค่ะ ขอจองไว้ 1 ที่นะคะ", isInternal: false, senderUserId: null, deliveryStatus: "SENT", deliveryError: null, createdAt: d(40) },
  { id: "m5", direction: "OUT", type: "TEXT", body: "รับทราบค่ะ เดี๋ยวส่งรายละเอียดการโอนให้นะคะ", isInternal: false, senderUserId: "u1", deliveryStatus: "FAILED", deliveryError: "TOKEN_EXPIRED", createdAt: d(5) },
];

const STUBS = {
  "@/lib/core/context": `export async function requireTenant(){return {user:{id:"u1"},active:{tenantId:"t1",unitAccess:["*"]}}}`,
  "@/lib/core/db": `export const prisma={appSystem:{findMany:async()=>[]}}`,
  "@/lib/env": `export const env={APP_URL:"https://shark.in.th"}`,
  "@/components/module-tabs": `import React from "react";export function ModuleTabs(){return null}`,
  "next/link": `import React from "react";export default function Link({href,children,...r}){return React.createElement("a",{href,...r},children)}`,
  "./actions": [
    "sendReplyAction", "setStatusAction", "assignAction", "markReadAction", "linkCustomerAction",
    "connectLineAction", "disableConnectionAction", "setMemberSystemAction", "setRetentionDaysAction",
  ].map((n) => `export async function ${n}(){}`).join("\n"),
  "./service": `
    export const DATA = globalThis.__QC_CHAT_DATA;
    export async function ensureWebchatConnection(){}
    export async function listConnections(){return [{id:"cn1",type:"LINE",status:"CONNECTED",displayName:"LINE OA ร้านของฉัน",lastInboundAt:new Date()}]}
    export async function listConversations(){return globalThis.__QC_CHAT_DATA.convs}
    export async function getThread({conversationId}){const c=globalThis.__QC_CHAT_DATA.convs.find(x=>x.id===conversationId);return c?{conversation:c,messages:globalThis.__QC_CHAT_DATA.messages}:null}
    export async function getSetting(){return {memberSystemId:"ms1",retentionDays:180}}
    export async function getLinkedMember(){return {name:"สมหญิง ศ.",memberCode:"M-0042"}}
    export async function listStaff(){return [{userId:"u1",name:"พี่แนน"},{userId:"u2",name:"ช่างโอ๊ต"}]}
    export function maskedConnection(c){return {...c,tokenPreview:"••••1234"}}
  `,
};

// alias "@" ของ esbuild ทำงาน "ก่อน" plugin → stub ที่ขึ้นต้น @/ ต้อง key ด้วย path เต็มหลัง alias
const STUB_BY_PATH = new Map();
for (const [k, v] of Object.entries(STUBS)) {
  STUB_BY_PATH.set(k, v);
  if (k.startsWith("@/")) STUB_BY_PATH.set(path.join(ROOT, "src", k.slice(2)), v);
}
const stubPlugin = {
  name: "qc-stubs",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (a) => (STUB_BY_PATH.has(a.path) ? { path: a.path, namespace: "qc-stub" } : undefined));
    build.onLoad({ filter: /.*/, namespace: "qc-stub" }, (a) => ({ contents: STUB_BY_PATH.get(a.path), loader: "js", resolveDir: ROOT }));
  },
};

const BUNDLE = path.join(ROOT, "scripts", ".qc-chat-bundle.mjs");
await esbuild.build({
  stdin: { contents: `export * from "@/lib/modules/chat/ui";`, resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "esm", platform: "node", jsx: "automatic", outfile: BUNDLE,
  external: ["react", "react/jsx-runtime", "react-dom", "react-dom/server", "@opentelemetry/api"],
  alias: { "@": path.join(ROOT, "src") },
  plugins: [stubPlugin],
  logLevel: "error",
});

globalThis.__QC_CHAT_DATA = { convs: CONVS, messages: MESSAGES };
const ui = await import(BUNDLE + `?t=${Date.now()}`);

// react-dom/server เรนเดอร์ async component ไม่ได้ → คลี่เองก่อน (server component = ฟังก์ชัน async ธรรมดา)
async function resolveAsync(node) {
  if (Array.isArray(node)) return Promise.all(node.map(resolveAsync));
  if (!node || typeof node !== "object" || !node.$$typeof) return node;
  const { type, props } = node;
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") {
    return resolveAsync(await type(props));
  }
  if (props && props.children !== undefined) {
    const kids = await resolveAsync(props.children);
    return React.cloneElement(node, undefined, ...(Array.isArray(kids) ? kids : [kids]));
  }
  return node;
}

// ─────────── CSS จริงของโปรเจกต์ (globals.css → tailwind v4) ───────────
const SHOTS_DIR = path.join(ROOT, "qc-shots-tmp");
mkdirSync(SHOTS_DIR, { recursive: true });

async function buildCss(htmlFiles) {
  for (const [name, body] of htmlFiles) writeFileSync(path.join(SHOTS_DIR, name), body);
  const cssEntry = path.join(SHOTS_DIR, "entry.css");
  writeFileSync(cssEntry, `@import "../src/app/globals.css";\n@source "./";\n`);
  const res = await postcss([tailwind()]).process(`@import "./entry.css";`, { from: cssEntry, to: cssEntry });
  return res.css;
}

// ─────────── เรนเดอร์ 2 สถานะ: ยังไม่เลือกห้อง / เลือกห้องแล้ว (?c=c1) ───────────
const STATES = [
  { key: "list", conversationId: undefined },
  { key: "thread", conversationId: "c1" },
  { key: "thread-unlinked", conversationId: "c4" }, // ยังไม่ผูกสมาชิก → มีช่องกรอกเบอร์ (กว้างสุดในหน้า)
];
const pages = [];
for (const s of STATES) {
  const el = await resolveAsync(
    React.createElement(ui.ChatInboxSection, { systemId: "sys1", tenantId: "t1", conversationId: s.conversationId }),
  );
  // ครอบด้วยโครงหน้าจริง: AppMain (px-4 pb-24 pt-… sm:px-6 lg:pl-[18rem+1.5rem]) + page.tsx (max-w-4xl)
  const inner = renderToStaticMarkup(el);
  pages.push([
    s.key,
    `<main class="px-4 pb-24 pt-[calc(3.5rem+1rem)] sm:px-6 lg:pl-[calc(18rem+1.5rem)]"><div class="flex max-w-4xl flex-col gap-4">${inner}</div></main>`,
  ]);
}
const css = await buildCss(pages.map(([k, b]) => [`${k}.html`, b]));
const htmlOf = (body) =>
  `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="min-h-full flex flex-col">${body}</body></html>`;

// ─────────── chromium ───────────
const puppeteer = (await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
mkdirSync("/tmp/xdg-chromium", { recursive: true, mode: 0o700 });
const UDD = "/root/snap/chromium/common/pptr-shared";
mkdirSync(UDD, { recursive: true });
for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) rmSync(path.join(UDD, f), { force: true });
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium-browser",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=${UDD}`],
  env: { ...process.env, XDG_RUNTIME_DIR: "/tmp/xdg-chromium" },
});
const page = await browser.newPage();
const results = [];
for (const [key, body] of pages) {
  for (const width of [390, 1280]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 900, deviceScaleFactor: 2 });
    await page.setContent(htmlOf(body), { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 300));
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const widest = [...document.querySelectorAll("body *")]
        .map((n) => ({ t: n.tagName + "." + (n.className || "").toString().slice(0, 60), r: n.getBoundingClientRect().right }))
        .sort((a, b) => b.r - a.r)[0];
      return {
        scrollWidth: de.scrollWidth, innerWidth: window.innerWidth,
        bodyScrollWidth: document.body.scrollWidth, widest,
      };
    });
    const file = `${OUT}/${TAG}-${key}-${width}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const overflow = m.scrollWidth > m.innerWidth;
    results.push({ state: key, width, ...m, overflow, file });
    console.log(
      `${overflow ? "❌ OVERFLOW" : "✅ ok"}  ${key} @${width}px  scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth} bodyScrollWidth=${m.bodyScrollWidth}  widest=${m.widest?.t}@${Math.round(m.widest?.r ?? 0)}  → ${file}`,
    );
  }
}
await browser.close();
rmSync(SHOTS_DIR, { recursive: true, force: true });
rmSync(BUNDLE, { force: true });
console.log(`\nสรุป [${TAG}]: overflow ${results.filter((r) => r.overflow).length}/${results.length} จอ`);
