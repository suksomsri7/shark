// ตัวแบ่งข้อความของจอทีม AI เป็นช่วงตามฟอนต์ — ฟังก์ชันบริสุทธิ์ (ไม่ import อะไร · ทดสอบได้ตรง ๆ)
// mockup ใช้ `font-family: Inter, 'IBM Plex Sans Thai'` = เบราว์เซอร์เลือกฟอนต์ "ทีละตัวอักษร": ตัวที่ Inter มี (ละติน ตัวเลข วรรคตอน ช่องว่าง · ฯลฯ) ใช้ Inter
// ตัวที่ Inter ไม่มี (อักษรไทย U+0E00–U+0E7F ยกเว้น ฿) ตกไป IBM Plex Sans Thai · RN บนเครื่องจริงไม่มี fallback รายตัวอักษรไปฟอนต์ที่ฝังมา → ต้องแบ่งช่วงเอง
export type TeamTextScript = "latin" | "thai";
export type TeamTextRun = { text: string; script: TeamTextScript };

// ฿ (U+0E3F) อยู่ในบล็อกไทยแต่ Inter มี glyph นี้ → นับเป็นช่วง Inter
const isThai = (code: number) => code >= 0x0e00 && code <= 0x0e7f && code !== 0x0e3f;

/** แบ่ง text เป็นช่วงต่อเนื่องของ "ไทย" กับ "ที่เหลือ" (ละติน/ตัวเลข/วรรคตอน/ช่องว่าง) — ต่อทุกช่วงกลับ = ข้อความเดิมเป๊ะ · ข้อความว่าง = [] */
export function splitRuns(text: string): TeamTextRun[] {
  const runs: TeamTextRun[] = [];
  let start = 0;
  let current: TeamTextScript | null = null;
  for (let i = 0; i < text.length; i++) {
    const script: TeamTextScript = isThai(text.charCodeAt(i)) ? "thai" : "latin";
    if (current === null) current = script;
    else if (script !== current) {
      runs.push({ text: text.slice(start, i), script: current });
      start = i;
      current = script;
    }
  }
  if (current !== null) runs.push({ text: text.slice(start), script: current });
  return runs;
}

/** น้ำหนักตัวอักษร → ชื่อหน้าฟอนต์ที่โหลดไว้ใน src/lib/fonts.ts (ชื่อ = key ของ useFonts) */
export function fontFor(script: TeamTextScript, weight?: string | number | null): string {
  const s = String(weight ?? "400");
  const n = s === "bold" ? 700 : s === "normal" ? 400 : Number(s) || 400;
  if (script === "thai") {
    if (n >= 700) return "IBMPlexSansThai_700Bold";
    if (n >= 600) return "IBMPlexSansThai_600SemiBold";
    if (n >= 500) return "IBMPlexSansThai_500Medium";
    return "IBMPlexSansThai_400Regular";
  }
  if (n >= 700) return "Inter_700Bold";
  if (n >= 600) return "Inter_600SemiBold";
  if (n >= 500) return "Inter_500Medium";
  if (n >= 400) return "Inter_400Regular";
  return "Inter_300Light";
}
