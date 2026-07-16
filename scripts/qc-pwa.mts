// QC — PWA polish (WO-0068) · Fable oracle, Builder ห้ามแตะ
// สัญญา: app/manifest.ts (Next 16 metadata route — อ่าน docs ก่อน) + icons (Fable วางไว้แล้วใน public/) + meta ใน layout
//   src/app/manifest.ts: export default → { name/short_name ไทย, start_url "/app", display "standalone",
//     background_color, theme_color, icons: [192, 512 (purpose any+maskable ได้)] ชี้ /icon-192.png /icon-512.png }
//   src/app/layout.tsx: metadata/viewport มี themeColor + appleWebApp (title/capable) + icons apple → /apple-touch-icon.png
try { process.loadEnvFile(".env"); } catch {}
const { readFileSync, existsSync } = await import("node:fs");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
try {
  const mf = (await import("@/app/manifest" as string).catch(() => null)) as { default: () => Record<string, unknown> } | null;
  if (!mf) { chk("PW-0", "มี src/app/manifest.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const m = mf.default();
    const icons = (m.icons ?? []) as { src: string; sizes: string }[];
    chk("PW-1.1", "manifest: name ไทย + standalone + start_url /app", /[ก-๙]/.test(String(m.name)) && m.display === "standalone" && String(m.start_url).startsWith("/app"), "ครบ", JSON.stringify({ n: m.name, d: m.display }));
    chk("PW-1.2", "icons 192+512 ชี้ไฟล์ที่มีจริง", icons.some((i) => i.sizes === "192x192") && icons.some((i) => i.sizes === "512x512") && icons.every((i) => existsSync(`public${i.src}`)), "ครบ", JSON.stringify(icons.map((i) => i.src)));
    chk("PW-1.3", "theme_color + background_color เป็น hex", /^#[0-9a-fA-F]{6}$/.test(String(m.theme_color)) && /^#[0-9a-fA-F]{6}$/.test(String(m.background_color)), "hex", "?");
    const magic = (p: string) => existsSync(p) && readFileSync(p).subarray(0, 4).toString("hex") === "89504e47";
    chk("PW-2.1", "ไฟล์ icon เป็น PNG จริงทั้ง 3", magic("public/icon-192.png") && magic("public/icon-512.png") && magic("public/apple-touch-icon.png"), "PNG", "?");
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    chk("PW-3.1", "layout: themeColor + appleWebApp + apple-touch-icon", /themeColor/.test(layout) && /appleWebApp/.test(layout) && /apple-touch-icon/.test(layout), "ครบ", "?", "MAJOR");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC PWA =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
