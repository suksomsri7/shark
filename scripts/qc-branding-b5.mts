// QC — ธีมกิจการ WO B5: แอป SHARK HUB รับธีมจาก /api/mobile/me (branding ต่อ membership) → hook useBrand → จอ native ใช้สีแบรนด์/โลโก้
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/BRANDING-RUN.md §B5
// static ล้วน (อ่านไฟล์ apps/mobile) — ไม่ต่อ DB · ไม่ต้อง build แอป
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { existsSync, readFileSync } from "node:fs";
const M = "apps/mobile";
const HOOK = `${M}/src/lib/brand.tsx`;
if (!existsSync(HOOK)) {
  console.log(`⚠️  SKIPPED — WO ยังไม่สร้าง (${HOOK})`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
void ((x: Any) => x);
const auth = read(`${M}/src/lib/auth-context.tsx`);
const hook = read(HOOK);
const sessions = read(`${M}/app/(app)/sessions.tsx`);
const chat = read(`${M}/app/(app)/chat/[id].tsx`);
const dna = read(`${M}/app/dna.tsx`);
const index = read(`${M}/app/(app)/index.tsx`);
const layout = read(`${M}/app/(app)/_layout.tsx`);
chk("B5-S1.1", "auth-context: TenantRow มี branding?: {displayName, logoUrl, accent, accentFg, navTone} | null (ตรงกับ /api/mobile/me) และ context เปิด activeBranding", /branding\??:\s*\{[^}]*accent[^}]*accentFg[^}]*\}\s*\|\s*null/.test(auth) && /activeBranding/.test(auth), "มี", "ขาด");
chk("B5-S1.2", "brand.tsx: useBrand() → { accent, accentFg, soft, logoUrl, displayName } ค่าปริยาย = C.blue/#fff เมื่อไม่มีธีม · แคชล่าสุดใน AsyncStorage/SecureStore กันกะพริบตอนเปิดแอป", /export function useBrand/.test(hook) && /accentFg/.test(hook) && /C\.blue/.test(hook) && /AsyncStorage|SecureStore/.test(hook), "hook + แคช", "ขาด");
const hardBlue = (src: string) => (src.match(/C\.blue\b|C\.blueHi\b/g) ?? []).length;
chk("B5-S1.3", "sessions/chat/dna ไม่ hard-code C.blue อีก (ใช้ useBrand) — ปุ่มหลัก · ปุ่มส่ง · จุด unread · แถบโควตา", hardBlue(sessions) + hardBlue(chat) + hardBlue(dna) === 0 && /useBrand/.test(sessions) && /useBrand/.test(chat), "0 hard-code", `sessions ${hardBlue(sessions)} · chat ${hardBlue(chat)} · dna ${hardBlue(dna)}`);
chk("B5-S1.4", "หัวรายการแชท (sessions) แสดงโลโก้กิจการ (ถ้ามี) + ชื่อที่แสดง แทนข้อความคงที่", /logoUrl/.test(sessions) && /displayName/.test(sessions), "โลโก้+ชื่อ", "ขาด", "MAJOR");
chk("B5-S1.5", "index.tsx (แดชบอร์ด WebView): ไม่แตะ — ธีมมาจากเว็บเอง (B3) · ยังรับ open-ai · swipeEnabled ของ Drawer ยังปิด (ท่าปัดเป็นของเว็บ SwipeEdge)", /open-ai/.test(index) && /swipeEnabled: false/.test(layout), "คงเดิม", "เปลี่ยน", "MAJOR");
chk("B5-S1.6", "ไม่แก้ app.json (ไม่ต้องบิลด์ใหม่ — ส่งเป็น OTA) และไม่เพิ่ม native module ใหม่ใน package.json", !/\"expo-.*\": \"\^/.test(read(`${M}/package.json`).split("react-native-safe-area-context")[1] ?? "") , "OTA ได้", "มี dependency ใหม่?", "MINOR");
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Branding B5 (static) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
