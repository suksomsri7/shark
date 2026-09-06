// probe (ไม่ใช่ด่าน CI · K1.5) — พิสูจน์ "ลากเข้าคอลัมน์ที่เต็ม → การ์ดเด้งกลับ + toast ไทย"
//
// ทำไมต้องมี: ชุดข้อมูล QC ไม่มีคอลัมน์ไหนตั้ง WIP limit ไว้เลย ⇒ เส้นทาง rollback ของ K1.5
// ไม่มีทางเห็นด้วยตาจาก `visual-kanban.mts 1.5` · โพรบนี้ตั้ง wipLimit ชั่วคราวบน **บอร์ดซ่อมบำรุง**
// (ไม่ใช่บอร์ดป่าตองที่ harness ถ่าย) ลากจริง แล้ว **คืนค่า wipLimit = null เสมอใน finally**
// การย้ายที่ถูกปฏิเสธไม่เขียนอะไรลง DB ⇒ ข้อมูล seed ไม่เปลี่ยนสักแถว
//
// ใช้: bash scripts/acc-v2-serve.sh → pnpm exec tsx scripts/pending/probe-kanban-k1.5-wip.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { readFileSync } from "node:fs";
const accEnv = (await import("../acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const kq = (await import("../kanban-qc-env.mts" as string)) as { KQC: Any };
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const E = JSON.parse(readFileSync(kq.KQC.expectedPath, "utf8"));
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const OUT = ".qc-shots/kanban/1.5";
const boardId: string = E.boards.maint.id;
const fullColumnId: string = E.boards.maint.columns["กำลังซ่อม"];

const user = await prisma.user.findUnique({ where: { email: kq.KQC.ownerEmail }, select: { id: true } });
if (!user) throw new Error("ไม่พบ owner");
const UA = "qc-visual-kanban-probe";
const token = "kb" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });

const before = await prisma.kanbanColumn.findUniqueOrThrow({ where: { id: fullColumnId }, select: { wipLimit: true, name: true } });
const cards = await prisma.kanbanCard.count({ where: { columnId: fullColumnId, status: "ACTIVE" } });
console.log(`คอลัมน์ "${before.name}" มี ${cards} การ์ด · wipLimit เดิม = ${before.wipLimit}`);

try {
  await prisma.kanbanColumn.update({ where: { id: fullColumnId }, data: { wipLimit: cards } }); // ตั้งให้ "เต็มพอดี"
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-kanban-probe-${process.pid}`],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    const host = new URL(BASE).hostname;
    await page.setCookie(
      { name: "shark_session", value: token, domain: host, path: "/" },
      { name: "shark_tenant", value: E.tenantId, domain: host, path: "/" },
    );
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message.slice(0, 160)));
    page.on("console", (m: Any) => { if (m.type() === "error") errors.push(String(m.text()).slice(0, 160)); });
    await page.goto(`${BASE}/app/sys/${E.systemId}/kanban/b/${boardId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid=card]", { timeout: 15_000 });
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/probe-wip-full-desktop.png`, fullPage: true });

    // ลากการ์ดใบแรกของคอลัมน์ 1 → คอลัมน์ 2 (ที่เต็มแล้ว)
    const from = await page.$("[data-testid=column]:nth-of-type(1) [data-testid=card]:nth-of-type(1)");
    const to = await page.$("[data-testid=column]:nth-of-type(2) [data-testid=card]:nth-of-type(1)");
    if (!from || !to) throw new Error("ไม่พบการ์ดสำหรับลาก");
    const a = (await from.boundingBox())!;
    const b = (await to.boundingBox())!;
    const sx = a.x + a.width / 2, sy = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + 8;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 350));
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(sx + ((tx - sx) * i) / 12, sy + ((ty - sy) * i) / 12);
      await new Promise((r) => setTimeout(r, 30));
    }
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `${OUT}/probe-wip-rejected-desktop.png`, fullPage: true });
    const toastText = await page.$eval("[data-testid=board-toast]", (el: Any) => String(el.textContent)).catch(() => "(ไม่พบ toast)");
    const firstOfCol1 = await page.$eval("[data-testid=column]:nth-of-type(1) [data-testid=card]:nth-of-type(1)", (el: Any) => String(el.textContent).slice(0, 40));
    console.log("toast:", toastText);
    console.log("การ์ดใบแรกของคอลัมน์ 1 หลังถูกปฏิเสธ:", firstOfCol1);
    console.log("console errors:", errors.length, errors[0] ?? "");
  } finally {
    await browser.close();
  }
} finally {
  await prisma.kanbanColumn.update({ where: { id: fullColumnId }, data: { wipLimit: before.wipLimit } });
  const check = await prisma.kanbanColumn.findUniqueOrThrow({ where: { id: fullColumnId }, select: { wipLimit: true } });
  const { count } = await prisma.session.deleteMany({ where: { userAgent: UA } });
  console.log(`คืนค่า wipLimit = ${check.wipLimit} · ลบ session ${count}`);
  await prisma.$disconnect();
}
