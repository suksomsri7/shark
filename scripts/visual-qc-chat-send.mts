// QC ปลายทาง — "กดส่งจริงแล้วข้อความลงระบบไหม" · Fable oracle, Builder ห้ามแตะ
//
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้นด้วย `qc-` (ต้องมีเซิร์ฟเวอร์ + chromium ซึ่ง CI ไม่มี) · รันมือ: pnpm qc:send
//
// เหตุที่ต้องมี: เจ้าของรายงาน 1 ก.ย. ว่า "รับข้อความได้ แต่ส่งข้อความไม่ออก"
// ข้อสอบ 402 ข้อ + qc:visual วัดได้แค่ว่า **กล่องพิมพ์แสดงผลถูก** ไม่มีข้อไหนกดปุ่มส่งจริงเลย
// ⇒ บทเรียนซ้ำของรีโปนี้: "ข้อความไปถึงระบบแล้ว" ≠ "ใช้งานได้" ต้องเดินครบวงกลม
//
// 🔴 ส่งเป็น **โน้ตภายใน** เท่านั้น — ห้ามยิงข้อความจริงถึงลูกค้าของร้านระหว่างตรวจระบบ
//    (isInternal = ไม่ส่งออกช่องทาง · ลูกค้าไม่เห็น) แล้วลบแถวทิ้งเมื่อจบ
process.loadEnvFile?.(".env");

const OUT = "/root/projects/shark-in-th/.qc-shots";
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3214";

const { prisma } = await import("@/lib/core/db" as string);
const { sha256 } = await import("@/lib/core/hash" as string);
const { mkdirSync } = await import("node:fs");
mkdirSync(OUT, { recursive: true });

const findings: string[] = [];
const chk = (id: string, desc: string, ok: boolean, actual: string) => {
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${desc}${ok ? "" : ` — ${actual}`}`);
  if (!ok) findings.push(id);
};

// เลือกระบบแชทที่ "มีห้องจริง" — ร้านหนึ่งเปิดระบบแชทได้หลายชุด และชุดแรกอาจว่างเปล่า
const allSys = await prisma.appSystem.findMany({ where: { type: "CHAT", active: true } });
let sys: (typeof allSys)[number] | null = null;
let conv: Awaited<ReturnType<typeof prisma.chatConversation.findFirst>> = null;
const WANT = process.env.QC_CONV;
for (const s of allSys) {
  const c = WANT
    ? await prisma.chatConversation.findFirst({ where: { systemId: s.id, id: WANT } })
    : await prisma.chatConversation.findFirst({ where: { systemId: s.id }, orderBy: { lastMessageAt: "desc" } });
  if (c) { sys = s; conv = c; break; }
}
if (!sys || !conv) { console.log("RESULT NO_CONVERSATION"); process.exit(2); }
const owner = await prisma.membership.findFirst({
  where: { tenantId: sys.tenantId, role: "OWNER", acceptedAt: { not: null } },
});
if (!owner) { console.log("RESULT NO_OWNER"); process.exit(2); }

const MARK = `qc-send-${Date.now()}`;
const before = await prisma.chatMessage.count({ where: { conversationId: conv.id } });

const token = "qcs" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 30 * 60 * 1000);
const session = await prisma.session.create({
  data: { userId: owner.userId, tokenHash: sha256(token), userAgent: "qc-visual", idleExpiresAt: ttl, expiresAt: ttl },
});
console.log(`TARGET ห้อง ${conv.id} · ข้อความเดิม ${before} · เครื่องหมาย ${MARK}`);

type Cookie = { name: string; value: string; path: string; domain?: string; url?: string; secure?: boolean };
type Page = {
  setViewport(v: { width: number; height: number; deviceScaleFactor: number }): Promise<void>;
  setCookie(...c: Cookie[]): Promise<void>;
  goto(url: string, o: { waitUntil: string; timeout: number }): Promise<unknown>;
  screenshot(o: { path: string; fullPage: boolean }): Promise<unknown>;
  evaluate<T>(fn: (a: string) => T, arg?: string): Promise<T>;
  type(sel: string, text: string, o?: { delay: number }): Promise<void>;
  click(sel: string): Promise<void>;
  close(): Promise<void>;
};

let consoleErrors: string[] = [];
try {
  const pptr = await import(
    "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string
  );
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--user-data-dir=/tmp/chr-qcsend"],
  });
  try {
    const page = (await browser.newPage()) as Page;
    // 🔴 เก็บ error ฝั่งเบราว์เซอร์ไว้ด้วย — "กดแล้วไม่เกิดอะไร" มักมีเหตุอยู่ในคอนโซล
    (page as unknown as { on: (e: string, f: (m: { type?: () => string; text?: () => string; message?: string }) => void) => void })
      .on("console", (m) => { if (m.type?.() === "error") consoleErrors.push(String(m.text?.()).slice(0, 300)); });
    (page as unknown as { on: (e: string, f: (m: { message?: string }) => void) => void })
      .on("pageerror", (m) => consoleErrors.push("pageerror: " + String(m.message).slice(0, 300)));

    // QC_W/QC_H = ทดสอบจอมือถือได้ด้วย — เจ้าของใช้มือถือเป็นหลัก และเลย์เอาต์คนละทางกับจอกว้าง
    const VW = Number(process.env.QC_W ?? 1440);
    const VH = Number(process.env.QC_H ?? 900);
    await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 2 });
    const https = BASE.startsWith("https:");
    const host = new URL(BASE).hostname;
    await page.setCookie(
      ...(https
        ? [
            { name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true },
            { name: "shark_tenant", value: sys.tenantId, url: BASE, path: "/", secure: true },
          ]
        : [
            { name: "shark_session", value: token, domain: host, path: "/" },
            { name: "shark_tenant", value: sys.tenantId, domain: host, path: "/" },
          ]),
    );
    await page.goto(`${BASE}/app/sys/${sys.id}?c=${conv.id}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 2500));

    // ติ๊ก "โน้ตภายใน" ก่อน — ห้ามยิงถึงลูกค้าจริง
    // QC_INTERNAL=0 = ทดสอบเส้นทาง "ตอบลูกค้าจริง" (ใช้เฉพาะกับเธรดทดสอบของเราเองเท่านั้น)
    const wantInternal = process.env.QC_INTERNAL !== "0";
    const ticked = !wantInternal ? true : await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll("input[type=checkbox]"));
      const el = boxes.find((b) => (b.closest("label")?.textContent ?? "").includes("โน้ตภายใน")) as HTMLInputElement | undefined;
      if (!el) return false;
      if (!el.checked) el.click();
      return el.checked;
    });
    chk("S0.1", wantInternal ? "🔴 ติ๊ก 'โน้ตภายใน' ได้ (กันข้อความทดสอบหลุดถึงลูกค้าจริง)" : "โหมดตอบลูกค้าจริง (เธรดทดสอบของเราเอง)", ticked, "หาช่องติ๊กไม่เจอ — หยุดทันที");
    if (!ticked) throw new Error("ไม่ติ๊กโน้ตภายใน = ไม่ทดสอบต่อ");

    await page.type("textarea", MARK, { delay: 12 });
    const typed = await page.evaluate(() => (document.querySelector("textarea") as HTMLTextAreaElement | null)?.value ?? "");
    chk("S1.1", "พิมพ์ลงกล่องข้อความได้ (React รับค่าจริง)", typed.includes("qc-send-"), `ค่าในช่อง = "${typed}"`);

    const clicked = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent ?? "").trim() === "ส่ง");
      if (!b) return "ไม่เจอปุ่มส่ง";
      if ((b as HTMLButtonElement).disabled) return "ปุ่มส่งถูกปิดอยู่";
      (b as HTMLButtonElement).click();
      return "ok";
    });
    chk("S1.2", "ปุ่ม 'ส่ง' กดได้จริง", clicked === "ok", clicked);

    await new Promise((r) => setTimeout(r, 6000));
    await page.screenshot({ path: `${OUT}/chat-send-${VW}${https ? "-prod" : ""}.png`, fullPage: false });

    const after = await page.evaluate(() => ({
      text: document.body.innerText,
      draft: (document.querySelector("textarea") as HTMLTextAreaElement | null)?.value ?? "",
    }));

    const row = await prisma.chatMessage.findFirst({ where: { conversationId: conv.id, body: MARK } });
    chk("S2.1", "🔴 ข้อความลงฐานข้อมูลจริง (ปลายทางที่แท้จริงของการกดส่ง)", !!row,
      `นับก่อน ${before} · หลัง ${await prisma.chatMessage.count({ where: { conversationId: conv.id } })} · หาแถวที่มี ${MARK} ไม่เจอ`);
    chk("S2.2", "ข้อความโผล่บนจอหลังส่ง (ไม่ต้องรีเฟรชเอง)", after.text.includes(MARK), "ไม่เห็นบนจอ");
    chk("S2.3", "กล่องพิมพ์ถูกล้างหลังส่งสำเร็จ", after.draft.trim() === "" , `ยังค้าง "${after.draft.slice(0, 60)}"`);
    chk("S2.4", "ไม่ขึ้นข้อความผิดพลาดให้ผู้ใช้", !/ส่งข้อความไม่สำเร็จ|ผิดพลาด|error/i.test(after.text),
      (after.text.match(/.{0,80}(ส่งข้อความไม่สำเร็จ|ผิดพลาด).{0,80}/) ?? [""])[0]);
    chk("S3.1", "ไม่มี error ในคอนโซลเบราว์เซอร์", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));

    if (row) {
      console.log(`\nแถวที่ได้: direction=${row.direction} · isInternal=${row.isInternal} · deliveryStatus=${row.deliveryStatus} · deliveryError=${row.deliveryError ?? "-"}`);
      if (wantInternal) chk("S2.5", "🔴 บันทึกเป็นโน้ตภายในจริง (ไม่ถูกยิงออกช่องทางถึงลูกค้า)", row.isInternal === true, `isInternal=${row.isInternal}`);
    }
    await page.close();
  } finally {
    await browser.close();
  }
} finally {
  // ลบข้อความทดสอบ + session ทดสอบทุกกรณี
  const { count: msgs } = await prisma.chatMessage.deleteMany({ where: { body: MARK } });
  const { count: sess } = await prisma.session.deleteMany({ where: { userAgent: "qc-visual" } });
  console.log(`\nเก็บกวาด: ลบข้อความทดสอบ ${msgs} แถว · session ${sess} แถว`);
}

console.log(`\n===== QC SEND =====`);
console.log(findings.length === 0 ? "ผ่านทั้งหมด" : `ตก ${findings.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ findings, consoleErrors: consoleErrors.slice(0, 5) })}`);
process.exit(findings.length > 0 ? 1 : 0);
