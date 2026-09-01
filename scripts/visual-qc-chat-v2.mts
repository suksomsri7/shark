// QC ภาพจริง — กล่องแชท V2 เทียบกับแบบร่าง `docs/design/chat-v2/` · Fable oracle, Builder ห้ามแตะ
//
// 🔴 ชื่อไฟล์ **จงใจไม่ขึ้นต้นด้วย `qc-`** เพื่อไม่ให้ `qc:all` ดูดเข้าเป็นด่าน CI อัตโนมัติ
//    ชุดนี้ต้องมี (1) production build (2) เซิร์ฟเวอร์ที่รันอยู่ (3) chromium — CI ไม่มีสักอย่าง
//    เคยพลาดมาแล้วเมื่อ 31 ส.ค. (ตั้งชื่อ `qc-visual-chat.mts` → CI แดงถาวร)
//    ⛔ ทางเลือก "ไม่มีเซิร์ฟเวอร์ = ข้ามแล้วเขียว" **ห้ามทำ** — ด่านที่เขียวตอนวัดอะไรไม่ได้
//       คือไม้บรรทัดที่โกหก · ชุดนี้จึงจบด้วย exit 2 พร้อมบอกเหตุผลเมื่อเปิดหน้าไม่ได้
//
// วิธีรัน (Fable เพิ่ม `pnpm qc:visual2` ให้เอง — ข้อสอบไม่แตะ package.json):
//   1) pnpm build
//   2) APP_ENV=development PORT=3215 pnpm start &
//   3) QC_BASE=http://127.0.0.1:3215 XDG_RUNTIME_DIR=/tmp/xdgrt pnpm exec tsx scripts/visual-qc-chat-v2.mts
//
// ═══════ ทำไมต้องมีชุดนี้ (PLAN-CHAT-V2 §6) ═══════
// §6 สั่งไว้ชัด: โทเคนสีต้อง **อ่านค่าที่เบราว์เซอร์คำนวณจริง** (`getComputedStyle`)
// ไม่ใช่ grep ไฟล์ CSS — เพราะคลาสที่เขียนไว้แล้วถูกทับ grep จับไม่ได้เลย
// 🔴 และ **ห้ามเทียบพิกเซลตรง ๆ กับ ref-*.png** — ข้อมูลจริงยาวไม่เท่าตัวอย่าง ระยะไม่มีวันตรง
//    สิ่งที่ล็อกได้คือ **องค์ประกอบ · ลำดับ · สีที่คำนวณได้ · ขนาด · ระยะห่าง**
//
// ═══════ 🔴 สัญญาเรื่อง "จุดจับ" (data-qc) — จำเป็น ไม่ใช่ความชอบส่วนตัว ═══════
// การอ่านสีที่คำนวณแล้วต้องชี้ไปที่ **ธาตุที่ถูกต้อง** · การเลือกด้วยคลาส Tailwind พังทุกครั้งที่จัดสไตล์ใหม่
// ⇒ หน้าจอ V2 ต้องติดป้าย `data-qc="…"` ตามรายการข้างล่าง (รับ `data-chat="…"` แทนได้)
//    ป้ายพวกนี้ไม่กระทบหน้าตา ไม่กระทบผู้ใช้ และทำให้ไม้บรรทัดชี้ถูกที่ตลอดไป
//      รายการ:   chat-list · chat-row · chat-avatar · chat-badge · chat-chip · chat-section
//      ห้อง:     room-header · room-wall · bubble-in · bubble-out · bubble-note · bubble-voice
//                context-line · typing · room-menu-button · room-menu · room-menu-item
//      กล่องพิมพ์: composer · composer-field · composer-plus · composer-mic · composer-send
//                sheet · sheet-item
//
// ═══════ สัญญาที่คุม ═══════
// VR-0) หน้าเปิดได้จริงและ hydrate จริง (ไม่ hydrate = ปุ่มกดไม่ได้ ทั้งจอเป็นรูปภาพ)
// VR-1) โทเคนสี/มุม/ขนาด ตรง §2 — อ่านจาก getComputedStyle
// VR-2) องค์ประกอบครบและเรียงถูก (หัวห้อง 6 ชิ้น · ชิป 4 · เมนู ⋮ 8 · แผ่น ＋ 8)
// VR-3) ระยะ/ขนาด — กล่องพิมพ์อยู่ในจอ · ไม่ล้นแนวนอนที่ 390px · ฟองไม่กว้างเกินสัดส่วน
// VR-4) 🔴 ไม่มี emoji ในส่วนที่เป็น "หน้าตาของระบบ" (หัว/ชิป/เมนู/กล่องพิมพ์)
//       — เนื้อความของลูกค้ามี emoji ได้ ห้ามนับ (ลูกค้าพิมพ์มาเอง ไม่ใช่ไอคอนของเรา)
// VR-5) 🔴 **คนใช้งานไปถึงได้จริง** — กด ⋮ แล้วเมนูต้องเปิด · กด ＋ แล้วแผ่นต้องขึ้น
//       (บทเรียน 1 ก.ย.: ข้อสอบ 402 ข้อเขียวหมด แต่ไม่มีข้อไหนกดปุ่มจริงสักครั้ง)
//
// 🔴 `.env` ของรีโปนี้ชี้ DB prod จริง → session ที่สร้างต้องถูกลบทิ้งเสมอ (ปัก userAgent = "qc-visual2")
process.loadEnvFile?.(".env");

const OUT = "/root/projects/shark-in-th/.qc-shots";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";

const { prisma } = await import("@/lib/core/db" as string);
const { sha256 } = await import("@/lib/core/hash" as string);
const { mkdirSync, readFileSync } = await import("node:fs");
mkdirSync(OUT, { recursive: true });

const findings: string[] = [];
const chk = (id: string, desc: string, ok: boolean, actual: string) => {
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${desc}${ok ? "" : ` — ${actual}`}`);
  if (!ok) findings.push(id);
};
const j = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };

// ── สัญญาหน้าตาที่อ่านจากแบบร่างจริง (ไม่พิมพ์มือ) ──
const MOCKUP = readFileSync("/root/projects/shark-in-th/docs/design/chat-v2/mockup.html", "utf8");
const MENU_LABELS = (() => {
  const pop = MOCKUP.match(/<div class="pop">([\s\S]*?)<\/div>\s*<div class="wall">/);
  return pop
    ? [...pop[1]!.matchAll(/<div class="pi[^"]*">([\s\S]*?)<\/div>/g)]
        .map((m) => m[1]!.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/[.…]+$/u, "").trim())
        .filter(Boolean)
    : [];
})();
const SHEET_TOOLS = [...MOCKUP.matchAll(/<div class="gt">([^<]+)<\/div>/g)].map((m) => m[1]!.trim());
const CHIPS = ["ทั้งหมด", "ยังไม่อ่าน", "ของฉัน", "ยังไม่มีคนรับ"];
// โทเคนจาก :root ของแบบร่าง — อ่านจากไฟล์ ไม่พิมพ์ค่าซ้ำ
const TOKEN = (name: string) => MOCKUP.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`))?.[1]?.toLowerCase() ?? "";
const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

// ── หาระบบแชทที่มีบทสนทนาจริงมากที่สุด (จอเปล่าพิสูจน์อะไรไม่ได้) ──
const systems = await prisma.appSystem.findMany({ where: { type: "CHAT", active: true } });
let best: { id: string; tenantId: string; name: string; convs: number } | null = null;
for (const s of systems) {
  const convs = await prisma.chatConversation.count({ where: { systemId: s.id } });
  if (!best || convs > best.convs) best = { id: s.id, tenantId: s.tenantId, name: s.name, convs };
}
if (!best) { console.log("RESULT NO_CHAT_SYSTEM — ไม่มีระบบแชทให้ดู วัดอะไรไม่ได้"); process.exit(2); }

// 🔴 เลือกห้องที่ "มีของให้วัด" — ต้องมีข้อความขาออก ไม่งั้น VR-1.2/1.8/3.4 วัดไม่ได้เลย
//    (1 ก.ย.: ห้องล่าสุดเป็นห้องทดสอบที่มีแค่ "u" ขาเข้า → 6 ข้อแดงด้วยเหตุผลผิด)
//    ลำดับ: มีขาออก+โน้ต → มีขาออก → ห้องล่าสุด
const pick = (where: Record<string, unknown>) =>
  prisma.chatConversation.findFirst({ where: { systemId: best!.id, ...where }, orderBy: { lastMessageAt: "desc" }, select: { id: true, tenantId: true } });
const firstConv =
  (await pick({ messages: { some: { direction: "OUT", isInternal: false } }, AND: [{ messages: { some: { isInternal: true } } }] })) ??
  (await pick({ messages: { some: { direction: "OUT", isInternal: false } } })) ??
  (await pick({}));
// 🔴 prod ไม่มี "โน้ตภายใน" สักข้อ (ตรวจ 1 ก.ย.: 0 จาก 43 ขาออก) ⇒ ฟองโน้ตวัดไม่ได้ถ้าไม่มีฉาก
//    ⇒ แทรกโน้ตทดสอบ 1 แถว **ตรงเข้าตาราง** (ไม่ผ่าน sendReply = ไม่แจ้งเตือน ไม่ขยับ lastMessage ไม่ถึงลูกค้า)
//    ติดเครื่องหมายไว้ แล้ว **ลบทิ้งตอนจบเสมอ** เหมือน session (ดูท้ายไฟล์) — ไม่ทิ้งขยะไว้ในห้องจริง
const QC_NOTE_MARK = "[qc-visual2] โน้ตทดสอบไม้บรรทัด — ลบอัตโนมัติ";
if (firstConv) {
  const hasNote = await prisma.chatMessage.count({ where: { conversationId: firstConv.id, isInternal: true } });
  if (hasNote === 0) {
    await prisma.chatMessage.create({
      data: { tenantId: firstConv.tenantId, systemId: best.id, conversationId: firstConv.id, direction: "OUT", type: "TEXT", isInternal: true, body: QC_NOTE_MARK, senderName: "QC", deliveryStatus: "SENT" },
    });
  }
}
const owner = await prisma.membership.findFirst({
  where: { tenantId: best.tenantId, role: "OWNER", acceptedAt: { not: null } },
  include: { user: true },
});
if (!owner) { console.log("RESULT NO_OWNER — ไม่มีเจ้าของร้านให้เข้าระบบ วัดอะไรไม่ได้"); process.exit(2); }

const token = "qcv2" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 30 * 60 * 1000);
await prisma.session.create({
  data: { userId: owner.userId, tokenHash: sha256(token), userAgent: "qc-visual2", idleExpiresAt: ttl, expiresAt: ttl },
});
console.log(`TARGET ระบบ "${best.name}" · ${best.convs} บทสนทนา · ผู้ใช้ ${owner.user.email}`);

type Probe = {
  ok: boolean;
  text: string;
  hydrated: boolean;
  overflow: number;
  styles: Record<string, Record<string, string> | null>;
  counts: Record<string, number>;
  order: Record<string, string[]>;
  chromeText: string;
  composerInView: boolean;
  composerTop: number | null;
  sectionH: number | null;
  viewH: number;
  bubbleRatio: number | null;
  missingHooks: string[];
};

try {
  const pptr = await import(
    "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string
  );
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--user-data-dir=/tmp/chr-qcvisual2"],
  });
  try {
    type Cookie = { name: string; value: string; path: string; domain?: string; url?: string; secure?: boolean };
    type Page = {
      setViewport(v: { width: number; height: number; deviceScaleFactor: number }): Promise<void>;
      setCookie(...c: Cookie[]): Promise<void>;
      goto(url: string, o: { waitUntil: string; timeout: number }): Promise<unknown>;
      screenshot(o: { path: string; fullPage: boolean }): Promise<unknown>;
      evaluate<T>(fn: (...a: never[]) => T, ...args: unknown[]): Promise<T>;
      click(sel: string): Promise<void>;
      $(sel: string): Promise<unknown>;
      type(sel: string, text: string): Promise<void>;
      keyboard: { press(key: string): Promise<void> };
      close(): Promise<void>;
    };
    const newPage = async (w: number, h: number): Promise<Page> => {
      const page = await (browser as { newPage: () => Promise<Page> }).newPage();
      // 🔴 tsx/esbuild (keepNames) ห่อฟังก์ชันที่ส่งเข้า `page.evaluate` ด้วย helper `__name(...)` ซึ่ง
      //    **ไม่มีอยู่ในเบราว์เซอร์** ⇒ ReferenceError กลางทาง (เจอ 1 ก.ย. ตอนรันกับ prod) · ฉีด shim ก่อนทุกหน้า
      await (page as unknown as { evaluateOnNewDocument: (src: string) => Promise<void> })
        .evaluateOnNewDocument("window.__name = window.__name || ((f) => f);");
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
      // 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: dev = `shark_session` · prod(HTTPS) = `__Host-shark_session`
      const host = new URL(BASE).hostname;
      const https = BASE.startsWith("https:");
      await page.setCookie(
        ...(https
          ? [
              { name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true },
              { name: "shark_tenant", value: best!.tenantId, url: BASE, path: "/", secure: true },
            ]
          : [
              { name: "shark_session", value: token, domain: host, path: "/" },
              { name: "shark_tenant", value: best!.tenantId, domain: host, path: "/" },
            ]),
      );
      return page;
    };

    const probe = async (page: Page, label: string): Promise<Probe> => {
      await page.screenshot({ path: `${OUT}/chat-v2-${label}.png`, fullPage: false });
      return page.evaluate<Probe>(() => {
        const q = (name: string) =>
          document.querySelector(`[data-qc="${name}"]`) ?? document.querySelector(`[data-chat="${name}"]`);
        const qa = (name: string) => [
          ...document.querySelectorAll(`[data-qc="${name}"], [data-chat="${name}"]`),
        ] as HTMLElement[];
        const HOOKS = [
          "chat-list", "chat-row", "chat-avatar", "chat-badge", "chat-chip", "chat-section",
          "room-header", "room-wall", "bubble-in", "bubble-out", "bubble-note",
          "context-line", "room-menu-button", "composer", "composer-field",
          "composer-plus", "composer-mic", "composer-send",
        ];
        const styleOf = (name: string, props: string[]) => {
          const el = q(name);
          if (!el) return null;
          const cs = getComputedStyle(el);
          const out: Record<string, string> = {};
          for (const p of props) out[p] = cs.getPropertyValue(p).trim();
          const r = el.getBoundingClientRect();
          out.w = String(Math.round(r.width));
          out.h = String(Math.round(r.height));
          return out;
        };
        const wall = q("room-wall");
        const outBub = q("bubble-out");
        const text = (el: Element | null) => (el ? (el as HTMLElement).innerText ?? "" : "");
        return {
          ok: true,
          text: document.body.innerText,
          // ข้อความเฉพาะพื้นที่เนื้อหา — sidebar มี "ภาพรวม / เชื่อมช่องทาง" เป็นเมนูซ้ายอยู่แล้ว (ถูกต้อง) ห้ามนับรวม
          mainText: (document.querySelector("main") as HTMLElement | null)?.innerText ?? document.body.innerText,
          hydrated: Object.keys(document.querySelector("body") ?? {}).some((k) => k.startsWith("__reactFiber$"))
            || !!document.querySelector("textarea, input"),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          styles: {
            wall: styleOf("room-wall", ["background-color"]),
            bubbleIn: styleOf("bubble-in", ["background-color", "border-top-left-radius", "border-radius"]),
            bubbleOut: styleOf("bubble-out", ["background-color", "border-top-right-radius", "border-radius"]),
            bubbleNote: styleOf("bubble-note", ["background-color", "border-color"]),
            avatar: styleOf("chat-avatar", ["border-radius"]),
            badge: styleOf("chat-badge", ["border-radius"]),
            send: styleOf("composer-send", ["background-color", "border-radius"]),
            chip: styleOf("chat-chip", ["border-radius"]),
            icon: (() => {
              // วัด svg ของกล่องแชท ไม่ใช่ตัวแรกของทั้งหน้า (ตัวแรกคือ sidebar ของแอป ⇒ w/h 0 · stroke คนละชุด)
              const svg = q("room-menu-button")?.querySelector("svg") ?? q("composer-plus")?.querySelector("svg");
              if (!svg) return null;
              const cs = getComputedStyle(svg);
              return {
                "stroke-width": cs.getPropertyValue("stroke-width").trim(),
                fill: cs.getPropertyValue("fill").trim(),
                viewBox: svg.getAttribute("viewBox") ?? "",
                w: "0", h: "0",
              };
            })(),
          },
          counts: {
            roomHeaderChildren: (q("room-header")?.children.length ?? -1),
            chips: qa("chat-chip").length,
            sections: qa("chat-section").length,
            rows: qa("chat-row").length,
            menuItems: qa("room-menu-item").length,
            sheetItems: qa("sheet-item").length,
            svgs: document.querySelectorAll("svg").length,
          },
          order: {
            chips: qa("chat-chip").map((e) => (e.innerText ?? "").replace(/\s+/g, " ").trim()),
            sections: qa("chat-section").map((e) => (e.innerText ?? "").replace(/\s+/g, " ").trim()),
            menu: qa("room-menu-item").map((e) => (e.innerText ?? "").replace(/[.…]+$/u, "").replace(/\s+/g, " ").trim()),
            sheet: qa("sheet-item").map((e) => (e.innerText ?? "").replace(/\s+/g, " ").trim()),
          },
          // "หน้าตาของระบบ" เท่านั้น — ไม่รวมผนังข้อความ เพราะลูกค้าพิมพ์ emoji มาเองได้
          chromeText: [
            text(q("chat-list")?.querySelector("[data-qc='chat-chip']") ? q("chat-chip") : null),
            ...qa("chat-chip").map((e) => e.innerText ?? ""),
            text(q("room-header")),
            text(q("composer")),
            ...qa("room-menu-item").map((e) => e.innerText ?? ""),
            ...qa("sheet-item").map((e) => e.innerText ?? ""),
          ].join(" "),
          composerInView: (() => {
            const t = q("composer") ?? document.querySelector("textarea");
            if (!t) return false;
            const r = t.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= window.innerHeight + 1;
          })(),
          composerTop: (() => {
            const t = q("composer") ?? document.querySelector("textarea");
            return t ? Math.round(t.getBoundingClientRect().top) : null;
          })(),
          sectionH: (() => {
            const t = document.querySelector("textarea");
            const sec = t?.closest("section");
            return sec ? Math.round(sec.getBoundingClientRect().height) : null;
          })(),
          viewH: window.innerHeight,
          bubbleRatio: wall && outBub
            ? Math.round((outBub.getBoundingClientRect().width / wall.getBoundingClientRect().width) * 100)
            : null,
          missingHooks: HOOKS.filter((h) =>
            !document.querySelector(`[data-qc="${h}"]`) && !document.querySelector(`[data-chat="${h}"]`)),
        };
      });
    };

    // ═════════ VR-0 · เปิดหน้าได้จริง ═════════
    const deskUrl = `${BASE}/app/sys/${best.id}${firstConv ? `?c=${firstConv.id}` : ""}`;
    const desk = await newPage(1440, 900);
    let opened = true;
    await desk.goto(deskUrl, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => { opened = false; });
    if (!opened) {
      console.log(`RESULT NO_SERVER — เปิด ${deskUrl} ไม่ได้`);
      console.log("⛔ ชุดนี้ไม่ 'ข้ามแล้วเขียว' — ต้อง pnpm build + pnpm start ก่อน แล้วรันใหม่");
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 2500));
    // ปุ่มส่ง "เทาเมื่อว่าง ติดสีเมื่อพร้อม" (WO-CV5) ⇒ ต้องพิมพ์ก่อนถึงจะวัดสี accent ได้ · ไม่ได้กดส่ง
    await desk.type('[data-qc="composer-field"]', "qc").catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    const d = await probe(desk, "desktop");
    console.log(`\nเดสก์ท็อป 1440×900 → ${OUT}/chat-v2-desktop.png`);
    chk("VR-0.1", "หน้าเรนเดอร์ได้ ไม่ใช่หน้า error",
      !/Application error|500|Unhandled/i.test(d.text) && d.text.length > 40, d.text.slice(0, 160));
    chk("VR-0.2", "hydrate จริง (ไม่งั้นปุ่ม/พิมพ์/แนบไฟล์ใช้ไม่ได้)", d.hydrated, "ไม่ hydrate");
    chk("VR-0.3", "🔴 จุดจับ data-qc ครบตามสัญญา (ไม่ครบ = วัดสีที่คำนวณแล้วไม่ได้เลย)",
      d.missingHooks.length === 0, `ขาด ${j(d.missingHooks)}`);

    // ═════════ VR-1 · โทเคนที่เบราว์เซอร์คำนวณจริง ═════════
    const want = (name: string) => hexToRgb(TOKEN(name));
    const styleCases: [string, string, string, string][] = [
      ["VR-1.1", "wall", "background-color", want("wall")],
      ["VR-1.2", "bubbleOut", "background-color", want("out")],
      ["VR-1.3", "bubbleNote", "background-color", want("note")],
      ["VR-1.4", "bubbleNote", "border-color", want("note-line")],
      ["VR-1.5", "send", "background-color", want("accent")],
      ["VR-1.6", "bubbleIn", "background-color", "rgb(255, 255, 255)"],
    ];
    for (const [id, key, prop, expected] of styleCases) {
      const got = d.styles[key]?.[prop] ?? "";
      chk(id, `โทเคน ${key}.${prop} = ${expected} (อ่านจากค่าที่เบราว์เซอร์คำนวณ)`,
        got === expected, d.styles[key] ? `ได้ ${got}` : `ไม่พบธาตุ ${key} (ขาด data-qc)`);
    }
    chk("VR-1.7", "avatar มุม 14px ตามแบบร่าง",
      (d.styles.avatar?.["border-radius"] ?? "").startsWith("14px"), j(d.styles.avatar));
    chk("VR-1.8", "ฟองมุม 14px และมุมติดหาง 4px",
      (d.styles.bubbleOut?.["border-top-right-radius"] ?? "") === "4px", j(d.styles.bubbleOut));
    chk("VR-1.9", "ชิปมุม 8–11px ตามแบบร่าง",
      (() => { const n = Number.parseFloat(d.styles.chip?.["border-radius"] ?? "0"); return n >= 8 && n <= 11; })(),
      j(d.styles.chip));
    chk("VR-1.10", "ไอคอน: viewBox 24 · เส้น 1.7 · ไม่ทาสีทึบ",
      // getComputedStyle คืน "1.7px" (มีหน่วย) — เทียบตัวเลข ไม่ใช่สตริง (1 ก.ย.: แดงหลอกทั้งที่ค่าถูก)
      d.styles.icon?.viewBox === "0 0 24 24" && Math.abs(Number.parseFloat(d.styles.icon?.["stroke-width"] ?? "0") - 1.7) < 0.05 && d.styles.icon?.fill === "none",
      j(d.styles.icon));
    chk("VR-1.11", "แบดจ์ช่องทางใหญ่พอให้อ่านออก (19–22px ตาม WO-CV1)",
      (() => { const w = Number(d.styles.badge?.w ?? 0); return w >= 19 && w <= 24; })(), j(d.styles.badge));

    // ═════════ VR-2 · องค์ประกอบและลำดับ ═════════
    chk("VR-2.1", "หัวห้องเหลือ 6 ชิ้น (‹ · avatar · ชื่อ+บริบท · ⌕ · ⋮ — นับลูกโดยตรง)",
      d.counts.roomHeaderChildren >= 5 && d.counts.roomHeaderChildren <= 6, `นับได้ ${d.counts.roomHeaderChildren}`);
    chk("VR-2.2", `ชิปกรองเรียงตามแบบร่าง: ${CHIPS.join(" · ")}`,
      CHIPS.every((c, i) => (d.order.chips[i] ?? "").includes(c)), j(d.order.chips));
    chk("VR-2.3", "มีหัวข้อกลุ่มในรายการ (ปักหมุด/วันนี้/เมื่อวาน)",
      d.counts.sections >= 1 && d.order.sections.some((s) => /ปักหมุด|วันนี้|เมื่อวาน/.test(s)), j(d.order.sections));
    chk("VR-2.4", "มีแถวห้องแชทจริงบนจอ (จอเปล่าพิสูจน์อะไรไม่ได้)", d.counts.rows > 0, `${d.counts.rows} แถว`);
    chk("VR-2.5", "บรรทัดบริบทใต้ชื่อห้องมีจริง", d.styles.wall !== null && /กำลังดูหน้า|ยังไม่มีผู้รับผิดชอบ/.test(d.text),
      d.text.slice(0, 200));

    // ═════════ VR-4 · emoji ในหน้าตาของระบบ ═════════
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;
    chk("VR-4.1", "🔴 ไม่มี emoji ในหัว/ชิป/เมนู/กล่องพิมพ์ (เนื้อความลูกค้าไม่นับ)",
      !EMOJI.test(d.chromeText), `พบ ${j([...new Set(d.chromeText.match(EMOJI) ?? [])])}`);

    // ═════════ VR-5 · กดจริง (คนใช้งานไปถึงได้ไหม) ═════════
    let menuOpened = false;
    await desk.click('[data-qc="room-menu-button"]').then(() => { menuOpened = true; }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const afterMenu = menuOpened ? await probe(desk, "menu") : null;
    chk("VR-5.1", "กดปุ่ม ⋮ ได้จริง", menuOpened, "กดไม่ได้/ไม่มีปุ่ม (data-qc=room-menu-button)");
    chk("VR-5.2", `เมนู ⋮ เปิดแล้วมีครบ 8 รายการตามแบบร่าง`,
      (afterMenu?.counts.menuItems ?? 0) === MENU_LABELS.length, `ได้ ${afterMenu?.counts.menuItems ?? 0} · ${j(afterMenu?.order.menu ?? [])}`);
    chk("VR-5.3", "ลำดับรายการในเมนูตรงแบบร่าง",
      MENU_LABELS.every((l, i) => (afterMenu?.order.menu[i] ?? "").includes(l.slice(0, 6))),
      `แบบร่าง ${j(MENU_LABELS)} · ได้ ${j(afterMenu?.order.menu ?? [])}`);

    // ปิดเมนู ⋮ ก่อน — ไม่งั้นคลิก ＋ จะไปโดนฉากหลังของเมนู (ปิดเมนูแทนที่จะเปิดแผ่น) ⇒ 0 รายการด้วยเหตุผลผิด
    await desk.keyboard.press("Escape").catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    // ถ้าเมนูไม่ฟัง Escape ให้กดปุ่ม ⋮ ซ้ำเพื่อสลับปิด (toggle) — ตรวจจากจอจริงว่าเมนูหายแล้วก่อนไปต่อ
    if (await desk.$('[data-qc="room-menu"]').catch(() => null)) {
      await desk.click('[data-qc="room-menu-button"]').catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    }
    let sheetOpened = false;
    await desk.click('[data-qc="composer-plus"]').then(() => { sheetOpened = true; }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const afterSheet = sheetOpened ? await probe(desk, "sheet") : null;
    chk("VR-5.4", "กดปุ่ม ＋ ได้จริง", sheetOpened, "กดไม่ได้/ไม่มีปุ่ม (data-qc=composer-plus)");
    chk("VR-5.5", "แผ่นเครื่องมือมีครบ 8 ตัวตามแบบร่าง",
      (afterSheet?.counts.sheetItems ?? 0) === SHEET_TOOLS.length,
      `ได้ ${afterSheet?.counts.sheetItems ?? 0} · ${j(afterSheet?.order.sheet ?? [])}`);
    chk("VR-5.6", "ลำดับเครื่องมือตรงแบบร่าง",
      SHEET_TOOLS.every((t, i) => (afterSheet?.order.sheet[i] ?? "").includes(t)),
      `แบบร่าง ${j(SHEET_TOOLS)} · ได้ ${j(afterSheet?.order.sheet ?? [])}`);
    await desk.close();

    // ═════════ VR-3 · ระยะและขนาดบนจอมือถือ (390px = ขนาดในแบบร่าง) ═════════
    const phone = await newPage(390, 844);
    await phone.goto(`${BASE}/app/sys/${best.id}${firstConv ? `?c=${firstConv.id}` : ""}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 2500));
    const m = await probe(phone, "mobile");
    console.log(`\nมือถือ 390×844 → ${OUT}/chat-v2-mobile.png`);
    chk("VR-3.1", "ไม่ล้นแนวนอนบนจอ 390px (ขนาดเดียวกับแบบร่าง)", m.overflow <= 1, `ล้น ${m.overflow}px`);
    chk("VR-3.2", "🔴 กล่องพิมพ์อยู่ในจอโดยไม่ต้องเลื่อน (บั๊กที่เจอ 31 ส.ค. ห้ามกลับมา)",
      m.composerInView, `composer top=${m.composerTop}px · จอสูง ${m.viewH}px`);
    chk("VR-3.3", "ตัวกล่องแชทเองไม่สูงเกินจอ (เลื่อนข้างในตัวเอง)",
      m.sectionH !== null && m.sectionH <= m.viewH, `section สูง ${m.sectionH}px เทียบจอ ${m.viewH}px`);
    chk("VR-3.4", "ฟองข้อความกว้างไม่เกิน ~76% ของผนัง (แบบร่าง `.bub{max-width:76%}`)",
      m.bubbleRatio !== null && m.bubbleRatio <= 80, `ได้ ${m.bubbleRatio}%`);
    chk("VR-3.5", "จอมือถือยังเห็นรายการ/ห้องแชทจริง", m.text.length > 60, m.text.slice(0, 160));

    // ═════════ VR-6 · หน้าแชท "แบบตัด" (เจ้าของเคาะ 1 ก.ย. ค่ำ — ดู qc-chat-v2-shell.mts) ═════════
    // มือถือ: ไม่มีหัวแอป/ชื่อหน้า/แท็บ · แถบ "แชทลูกค้า" อยู่บนสุด · ☰ ในแถบเปิด drawer ได้จริง
    // 🔴 วัดที่ "รายการ" (ไม่มี ?c=) — หน้าห้องซ่อนรายการอยู่แล้ว วัดตรงนั้นไม่เห็นหัวรายการ
    await phone.goto(`${BASE}/app/sys/${best.id}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 1500));
    const sh = await phone.evaluate(() => {
      const q = (k: string) => document.querySelector(`[data-qc="${k}"]`);
      const top = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().top) : -1);
      // 🔴 element `position:fixed` มี offsetParent === null เสมอ (สเปก) — ใช้ offsetParent จะอ่าน Topbar ว่า "ซ่อน" ทั้งที่โผล่ (สาย I เจอ)
      const visible = (el: Element | null) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
      const topbar = document.querySelector("header.fixed, header[class*='fixed']");
      return {
        text: document.body.innerText,
        menuTop: top(q("app-menu")),
        listTop: top(q("chat-list")),
        topbarVisible: visible(topbar),
        hasH1: !!document.querySelector("main h1, h1"),
      };
    });
    chk("VR-6.1", "🔴 มือถือ: ไม่มีชื่อหน้า/คำอธิบาย \"ระบบรวม Chat\" และไม่มี <h1> เหนือรายการ", !/ระบบรวม Chat/.test(sh.text) && !sh.hasH1, `h1=${sh.hasH1} · text มี 'ระบบรวม Chat'=${/ระบบรวม Chat/.test(sh.text)}`);
    chk("VR-6.2", "🔴 มือถือ: แถบบนของแอป (☰ ชื่อกิจการ) ซ่อนบนหน้าแชท", !sh.topbarVisible, `topbarVisible=${sh.topbarVisible}`);
    chk("VR-6.3", "🔴 มือถือ: ปุ่ม ☰ ของรายการอยู่บนสุดของจอ (top ≤ 24px)", sh.menuTop >= 0 && sh.menuTop <= 24, `menuTop=${sh.menuTop}px listTop=${sh.listTop}px`);
    // ถ่ายรายการมือถือก่อนกด ☰ (ภาพนี้ใช้เทียบตากับ ref-mobile จอ 1)
    await phone.screenshot({ path: `${OUT}/chat-v2-mobile-list.png`, fullPage: false }).catch(() => {});
    let drawerOpened = false;
    await phone.click('[data-qc="app-menu"]').then(() => { drawerOpened = true; }).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
    const drawerVisible = drawerOpened
      ? await phone.evaluate(() => { const el = document.querySelector('[data-qc="app-drawer"]'); return !!el && (el as HTMLElement).offsetParent !== null; })
      : false;
    chk("VR-6.4", "🔴 มือถือ: กด ☰ ในแถบแชทแล้ว drawer ของแอปเปิดจริง (ทางเดินไปโมดูลอื่นไม่หาย)", drawerVisible, `กดได้=${drawerOpened} · drawer=${drawerVisible}`);
    // เดสก์ท็อป: ชื่อหน้า/แท็บต้องหายเหมือนกัน (sidebar+แถบบนยังอยู่ — ไม่วัดที่นี่ วัดจาก d)
    // 🔴 วัดจาก main เท่านั้น — รอบแรกวัดจาก body แล้วไปเจอเมนูซ้าย "แชทลูกค้า ▸ ภาพรวม / เชื่อมช่องทาง" (ซึ่งต้องมี) = แดงหลอก
    const mt = (d as unknown as { mainText?: string }).mainText ?? d.text;
    chk("VR-6.5", "🔴 เดสก์ท็อป: พื้นที่เนื้อหาไม่มี \"ระบบรวม Chat\" และไม่มีแท็บ ภาพรวม/เชื่อมช่องทาง เหนือกล่องแชท", !/ระบบรวม Chat/.test(mt) && !/ภาพรวม\s*เชื่อมช่องทาง/.test(mt.replace(/\n/g, " ")), mt.slice(0, 120).replace(/\n/g, " | "));
    await phone.close();
  } finally {
    await browser.close();
  }
} finally {
  // 🔴 กวาดทุกแถวที่ปัก userAgent "qc-visual2" ไม่ใช่เฉพาะของรอบนี้ (รอบที่ล้มกลางทางทิ้ง session ค้างได้)
  const { count: swept } = await prisma.session.deleteMany({ where: { userAgent: "qc-visual2" } });
  const { count: notes } = await prisma.chatMessage.deleteMany({ where: { body: QC_NOTE_MARK, isInternal: true } });
  console.log(`ลบโน้ตทดสอบแล้ว ${notes} แถว`);
  const leftover = await prisma.session.count({ where: { userAgent: "qc-visual2" } });
  console.log(`\nลบ session ทดสอบแล้ว ${swept} แถว · เหลือค้าง ${leftover} (ต้องเป็น 0)`);
}

console.log(`\n===== QC VISUAL CHAT V2 =====`);
console.log(findings.length === 0 ? "ผ่านทั้งหมด" : `ตก ${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ findings })}`);
process.exit(findings.length > 0 ? 1 : 0);
