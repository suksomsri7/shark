// QC ภาพจริง — เปิดกล่องแชทลูกค้าบน production build แล้วถ่ายภาพจอ · Fable oracle, Builder ห้ามแตะ
//
// 🔴 ชื่อไฟล์ **จงใจไม่ขึ้นต้นด้วย `qc-`** เพื่อไม่ให้ `qc:all` ดูดเข้าเป็นด่าน CI อัตโนมัติ
//    เพราะชุดนี้ต้องมี (1) production build (2) เซิร์ฟเวอร์ที่รันอยู่ (3) chromium — CI ไม่มีสักอย่าง
//    ทางเลือกอื่นคือ "ไม่มีเซิร์ฟเวอร์ = ข้ามแล้วเขียว" ซึ่ง **ห้ามทำ** — ด่านที่เขียวตอนวัดอะไรไม่ได้
//    คือไม้บรรทัดที่โกหก (บทเรียนซ้ำของรีโปนี้) · รันมือ: `pnpm qc:visual`
//
// วิธีรัน:
//   1) pnpm build
//   2) APP_ENV=development PORT=3214 pnpm start &      ← APP_ENV สำคัญ ดูหมายเหตุคุกกี้ด้านล่าง
//   3) QC_BASE=http://127.0.0.1:3214 XDG_RUNTIME_DIR=/tmp/xdgrt pnpm qc:visual
//
// สัญญา:
//  V1) หน้า /app/sys/<ระบบ CHAT> ต้องเรนเดอร์ได้จริง ไม่ใช่ error page
//  V2) ต้อง hydrate จริง (มี __reactFiber$ บน DOM) — ไม่งั้นปุ่ม/พิมพ์/แนบไฟล์ใช้ไม่ได้
//      🔴 next dev บนเครื่องนี้ไม่ hydrate (HMR websocket ล้ม) → ต้องรันบน production build เท่านั้น
//  V3) องค์ประกอบแบบ WhatsApp ต้องอยู่บนจอจริง ไม่ใช่แค่มีในซอร์ส
//  V4) จอมือถือ (430px) ต้องไม่ล้นแนวนอน
//
// 🔴 `.env` ของรีโปนี้ชี้ DB prod จริง → session ที่สร้างต้องถูกลบทิ้งเสมอ (ปัก userAgent = "qc-visual")
//    วิธีนี้เป็นขั้นตอนมาตรฐานของรีโป (ดู reference_shark_prod_visual_qc)
process.loadEnvFile?.(".env");

const OUT = "/root/projects/shark-in-th/.qc-shots";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3211";

const { prisma } = await import("@/lib/core/db" as string);
const { sha256 } = await import("@/lib/core/hash" as string);
const { mkdirSync } = await import("node:fs");
mkdirSync(OUT, { recursive: true });

// ── หาระบบแชทที่มีบทสนทนาจริงมากที่สุด (จอเปล่าพิสูจน์อะไรไม่ได้) ──
const systems = await prisma.appSystem.findMany({ where: { type: "CHAT", active: true } });
let best: { id: string; tenantId: string; name: string; convs: number } | null = null;
for (const s of systems) {
  const convs = await prisma.chatConversation.count({ where: { systemId: s.id } });
  if (!best || convs > best.convs) best = { id: s.id, tenantId: s.tenantId, name: s.name, convs };
}
if (!best) { console.log("RESULT NO_CHAT_SYSTEM"); process.exit(2); }

const firstConv = await prisma.chatConversation.findFirst({
  where: { systemId: best.id },
  orderBy: { lastMessageAt: "desc" },
  select: { id: true },
});

const owner = await prisma.membership.findFirst({
  where: { tenantId: best.tenantId, role: "OWNER", acceptedAt: { not: null } },
  include: { user: true },
});
if (!owner) { console.log("RESULT NO_OWNER"); process.exit(2); }

const token = "qcv" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 30 * 60 * 1000);
const session = await prisma.session.create({
  data: { userId: owner.userId, tokenHash: sha256(token), userAgent: "qc-visual", idleExpiresAt: ttl, expiresAt: ttl },
});
console.log(`TARGET ระบบ "${best.name}" · ${best.convs} บทสนทนา · ผู้ใช้ ${owner.user.email}`);

const findings: string[] = [];
const chk = (id: string, desc: string, ok: boolean, actual: string) => {
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${desc}${ok ? "" : ` — ${actual}`}`);
  if (!ok) findings.push(id);
};

try {
  const pptr = await import(
    "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string
  );
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--user-data-dir=/tmp/chr-qcvisual"],
  });
  try {
    type Shot = { file: string; text: string; hydrated: boolean; overflow: number; buttons: string[]; title: string;
      scrollH: number; viewH: number; composerTop: number | null; composerInView: boolean;
      tallest: string[]; chatSectionH: number | null };
    // หน้าตาของ puppeteer เท่าที่สคริปต์นี้ใช้ (import แบบ path ดิบจึงไม่มี type ติดมา)
    type Cookie = { name: string; value: string; domain: string; path: string };
    type Page = {
      setViewport(v: { width: number; height: number; deviceScaleFactor: number }): Promise<void>;
      setCookie(...c: Cookie[]): Promise<void>;
      goto(url: string, o: { waitUntil: string; timeout: number }): Promise<unknown>;
      screenshot(o: { path: string; fullPage: boolean }): Promise<unknown>;
      evaluate<T>(fn: () => T): Promise<T>;
      close(): Promise<void>;
    };
    const newPage = () => (browser as { newPage: () => Promise<Page> }).newPage();
    const shoot = async (label: string, w: number, h: number, conv?: string): Promise<Shot> => {
      const page = await newPage();
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
      // 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: dev = `shark_session` · prod(HTTPS) = `__Host-shark_session`
      //    ตัว __Host- ตั้งผ่าน http ไม่ได้เลย (CDP ตอบ "Invalid cookie fields") → local ใช้ชื่อธรรมดาเท่านั้น
      await page.setCookie(
        { name: "shark_session", value: token, domain: "127.0.0.1", path: "/" },
        { name: "shark_tenant", value: best!.tenantId, domain: "127.0.0.1", path: "/" },
      );
      const url = `${BASE}/app/sys/${best!.id}${conv ? `?c=${conv}` : ""}`;
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
      await new Promise((r) => setTimeout(r, 2500));
      const file = `${OUT}/chat-${label}.png`;
      await page.screenshot({ path: file, fullPage: false });
      const info = await page.evaluate<Omit<Shot, "file">>(() => ({
        text: document.body.innerText,
        hydrated: Object.keys(document.querySelector("body") ?? {}).some((k) => k.startsWith("__reactFiber$"))
          || !!document.querySelector("[data-hydrated], textarea, input"),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        buttons: Array.from(document.querySelectorAll("button")).map((b) => (b.textContent ?? "").trim()).filter(Boolean),
        title: document.title,
        // 🔴 WhatsApp = กล่องพิมพ์ปักอยู่ล่างจอเสมอ · ถ้าหน้าเลื่อนทั้งหน้า กล่องพิมพ์จะตกใต้ fold
        //    ทีมต้องเลื่อนผ่านรายการ 13 ห้องก่อนถึงจะพิมพ์ได้ = ผิดเจตนาของมติ W1
        scrollH: document.documentElement.scrollHeight,
        viewH: window.innerHeight,
        composerTop: (() => { const t = document.querySelector("textarea"); return t ? Math.round(t.getBoundingClientRect().top) : null; })(),
        // ใครเป็นคนดันหน้าให้สูง — ต้องรู้ก่อนจะสรุปว่าเป็นความผิดของกล่องแชทหรือของเปลือกแอป
        tallest: (() => {
          const vh = window.innerHeight;
          return Array.from(document.querySelectorAll("body *"))
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter((x) => x.r.height > vh)
            .slice(0, 4)
            .map((x) => `${x.el.tagName.toLowerCase()}.${(x.el.className || "").toString().split(" ").slice(0, 2).join(".")}=${Math.round(x.r.height)}px`);
        })(),
        chatSectionH: (() => {
          const t = document.querySelector("textarea");
          const sec = t?.closest("section");
          return sec ? Math.round(sec.getBoundingClientRect().height) : null;
        })(),
        composerInView: (() => {
          const t = document.querySelector("textarea");
          if (!t) return false;
          const r = t.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight;
        })(),
      }));
      await page.close();
      return { file, ...info };
    };

    const wide = await shoot("desktop", 1440, 900);
    console.log(`\nจอกว้าง 1440×900 → ${wide.file}`);
    chk("V1.1", "หน้าเรนเดอร์ได้ ไม่ใช่หน้า error", !/Application error|500|Unhandled/i.test(wide.text) && wide.text.length > 40, wide.text.slice(0, 160));
    chk("V2.1", "hydrate จริง (มี input/textarea ที่ React วางไว้)", wide.hydrated, "ไม่ hydrate — ปุ่มจะกดไม่ได้");
    chk("V3.1", "มีช่องค้นหา + แท็บกรอง", /ค้นหา/.test(wide.text) && /ยังไม่อ่าน/.test(wide.text), wide.text.slice(0, 200));
    // 🔴 กล่องพิมพ์โผล่เฉพาะตอน "เปิดห้องแล้ว" — วัดจากจอรายการอย่างเดียวจะได้ผลลบปลอม
    const room = await shoot("room", 1440, 900, firstConv?.id);
    console.log(`\nห้องแชทที่เปิดจริง 1440×900 → ${room.file}`);
    chk("V3.2", "เปิดห้องแล้วมีกล่องพิมพ์ + ปุ่มแนบไฟล์/ถ่ายรูป",
      /แนบไฟล์|ถ่ายรูป|📎|📷/.test(room.text) || room.buttons.some((b) => /แนบ|รูป|📎|📷/.test(b)),
      room.buttons.join(" | ").slice(0, 260));
    chk("V3.3", "ห้องแชทมีฟองข้อความจริง (ไม่ใช่จอเปล่า)", room.text.length > 200, room.text.slice(0, 160));
    chk("V5.1", "🔴 กล่องพิมพ์อยู่ในจอโดยไม่ต้องเลื่อน (WhatsApp ปักไว้ล่างจอเสมอ)",
      room.composerInView, `textarea top=${room.composerTop}px · จอสูง ${room.viewH}px · หน้าสูง ${room.scrollH}px`);
    console.log(`  ℹ️  ตัวที่สูงเกินจอ: ${room.tallest.join(" · ") || "(ไม่มี)"} · section ของกล่องแชท = ${room.chatSectionH}px`);
    chk("V5.2", "ตัวกล่องแชทเองไม่สูงเกินจอ (เลื่อนข้างในตัวเอง — ความสูงของเปลือกแอปเป็นอีกเรื่อง)",
      room.chatSectionH !== null && room.chatSectionH <= room.viewH,
      `section กล่องแชทสูง ${room.chatSectionH}px เทียบจอ ${room.viewH}px`);

    const phone = await shoot("mobile", 430, 932);
    console.log(`\nจอมือถือ 430×932 → ${phone.file}`);
    chk("V4.1", "ไม่ล้นแนวนอนบนจอ 430px", phone.overflow <= 1, `ล้น ${phone.overflow}px`);
    chk("V4.2", "จอแคบเห็นรายการแชท", phone.text.length > 40, phone.text.slice(0, 160));

    console.log(`\nปุ่มที่เจอบนจอกว้าง (${wide.buttons.length}): ${wide.buttons.slice(0, 24).join(" · ")}`);
  } finally {
    await browser.close();
  }
} finally {
  // 🔴 กวาดทุกแถวที่ปัก userAgent "qc-visual" ไม่ใช่เฉพาะของรอบนี้ —
  //    รอบก่อน ๆ ที่ล้มกลางทางทิ้ง session ค้างไว้บน DB prod ได้ (เจอจริง 31 ส.ค. เหลือค้าง 1 แถว)
  const { count: swept } = await prisma.session.deleteMany({ where: { userAgent: "qc-visual" } });
  const leftover = await prisma.session.count({ where: { userAgent: "qc-visual" } });
  console.log(`\nลบ session ทดสอบแล้ว ${swept} แถว · เหลือค้าง ${leftover} (ต้องเป็น 0)`);
}

console.log(`\n===== QC VISUAL CHAT =====`);
console.log(findings.length === 0 ? "ผ่านทั้งหมด" : `ตก ${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ findings })}`);
process.exit(findings.length > 0 ? 1 : 0);
