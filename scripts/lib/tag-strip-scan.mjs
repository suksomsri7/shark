// tag-strip-scan.mjs — ตัวสแกนของ fitness F16 (CRM C5.5-fix5 · รีวิว C5.5-fix4 RV-1 / RV-2 / RV-9)
// หา regex literal (และ `new RegExp("…")`) ที่ "ตัดแท็ก/แกะวงเล็บมุม" ด้วยรูป `<` [+ ชื่อแท็ก | `(`] + `[^>]*` · `[^>]+` · `.*` · `.+` ·
// `[\s\S]*` … — รูปพวกนี้ย้อนรอยกำลังสองใน V8 เมื่อข้อความมี `<` เยอะแต่ไม่มี `>` (`<` 40,000 ตัว = 1.5 วินาที · 1 MB ≈ 16 นาที)
// ทางที่ถูก: ตัวเชิงเส้นของ `src/lib/core/linear-text.ts` (stripTags · replaceOpenTagCi …) / `src/lib/core/inbound-address.ts`
// (trailingAngleAddr · firstAngleAddr · angleIds) หรือ `htmlToText` ของ engine กลาง
// 🔴 ใช้ตัวแยกไวยากรณ์ของ TypeScript (ไม่ใช่ regex บนข้อความ) ⇒ คอมเมนต์/สตริงที่ "เล่าถึง" รูปเดิมไม่ถูกนับ · `[^<>]*` (หยุดที่ `<` ถัดไป
//    = เชิงเส้น) ไม่ถูกนับ
import ts from "typescript";

/** แหล่งของ regex (ไม่รวม `/` และ flag) เป็นรูปต้องห้ามไหม */
export const FORBIDDEN_TAG_STRIP = /<(?:[A-Za-z][A-Za-z0-9]*|\()?(?:\\s[*+?]?)?(?:\[\^>\]|\.|\[\\s\\S\]|\[\\S\\s\]|\[\\w\\W\]|\[\\W\\w\]|\[\\d\\D\]|\[\\D\\d\])[*+]/;

/** ทุก regex ต้องห้ามในไฟล์ 1 ไฟล์ → [{ line, text }] (text = literal ตามที่เขียน) */
export function findTagStripRegex(src, fileName = "x.ts") {
  if (!/\[\^>\]|<[A-Za-z(]*\.|\[\\[sSwWdD]\\[sSwWdD]\]/.test(src)) return []; // กรองเร็ว — ไฟล์ส่วนใหญ่ไม่มีอะไรใกล้เคียง
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, /x$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const text = node.getText(sf);
      if (FORBIDDEN_TAG_STRIP.test(text.slice(1, text.lastIndexOf("/")))) out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text });
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "RegExp" && node.arguments?.length) {
      const a0 = node.arguments[0];
      if (a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0)) && FORBIDDEN_TAG_STRIP.test(a0.text)) {
        out.push({ line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: `new RegExp(${JSON.stringify(a0.text)})` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** ตัวสแกนต้องจับครบทุกรูป และไม่จับของที่ไม่ใช่ (คอมเมนต์ · สตริง · `[^<>]` · แท็กตายตัว) */
export const F16_SELF_TEST = {
  mustHit: {
    stripStar: "const t = html.replace(/<[^>]*>/g, '');",
    stripPlus: "const t = html.replace(/<[^>]+>/g, ' ');",
    openTag: "const t = h.replace(/<li[^>]*>/gi, '- ');",
    imgAttr: "const RE = /<img[^>]+src=\"https?:/i;",
    angleGroup: "const m = s.match(/<([^>]*)>\\s*$/);",
    angleGroupPlus: "for (const m of s.matchAll(/<([^>]+)>/g)) f(m);",
    lazyDot: "const t = s.replace(/<.*?>/g, '');",
    anyClass: "const t = s.replace(/<[\\s\\S]*?>/g, '');",
    displayName: "const m = s.match(/^\\s*(.*?)\\s*<[^>]*>\\s*$/);",
    ctor: "const re = new RegExp(\"<[^>]+>\", \"g\");",
    tagSpace: "const m = h.match(/<a\\s+[^>]*href/i);",
  },
  mustNotHit: {
    comment: "// เดิมใช้ /<[^>]*>/g ซึ่งเป็น n²\nconst x = 1;",
    blockComment: "/* s.replace(/<[^>]+>/g, '') */ const y = 2;",
    string: "const doc = 'replace(/<[^>]*>/g)';",
    template: "const doc = `use /<[^>]+>/ never`;",
    stopsAtLt: "const parts = html.split(/(<[^<>]*>)/);",
    fixedTag: "const t = h.replace(/<br\\s*\\/?>/gi, '\\n').replace(/<\\/(p|div|li)>/gi, '\\n');",
    closingFixed: "const ok = /<\\/a>/i.test(x);",
    noAngle: "const s2 = s.replace(/[^>]*$/, '');",
  },
};
