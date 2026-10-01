// ci-equals-scan.mjs — ตัวสแกนของ fitness F15 (CRM C5.5-fix2 · รีวิว RV2-6)
// หา "วัตถุ Prisma ที่มี mode = insensitive แต่ไม่ใช่การค้นหา (contains/startsWith/endsWith)" — คือ equals แบบ ILIKE ที่ wildcard รั่ว
// (`somchai_k@` "เท่ากับ" `somchai.k@`) ไม่ว่าจะเขียนรูปไหน: shorthand `{ equals, mode }` · สลับลำดับ · เครื่องหมายคำพูดเดี่ยว ·
// มี comma ในค่า · key ในเครื่องหมายคำพูด · `Prisma.QueryMode.insensitive` · วัตถุในตัวแปร · spread (`{ mode: "insensitive" }`
// ที่ไม่มี contains = ผิดตั้งแต่ตัวนิยาม) · `//` ในสตริงบนบรรทัดเดียวกัน · หลายบรรทัด · ตัวแปรที่ถือค่า insensitive (เห็นได้ในไฟล์)
// ทางที่ถูก: `ciEquals()` ของ src/lib/core/ci-equals.ts
// 🔴 ไม่ใช่ regex บรรทัดเดียว: ตัดคอมเมนต์ด้วยตัวอ่านที่รู้จักสตริง (คอมเมนต์ → ช่องว่าง · ขึ้นบรรทัดคงเดิม ⇒ เลขบรรทัดตรง)
//    แล้วหาวัตถุที่ครอบ `mode:` ด้วยการนับวงเล็บ (ข้ามสตริง)

/** ตัดคอมเมนต์ (สตริง/เทมเพลตคงไว้) · คืน { code, inStr } — inStr[i] = ตำแหน่งนี้อยู่ในสตริงไหม */
export function stripComments(src) {
  const out = src.split("");
  const inStr = new Uint8Array(src.length);
  let i = 0;
  const tmplDepth = []; // ระดับ `${` ที่เปิดค้างในเทมเพลต
  let brace = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (c === "/" && n === "*") {
      out[i] = out[i + 1] = " ";
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      if (i < src.length) out[i] = out[i + 1] = " ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr[i] = 1;
      i++;
      while (i < src.length && src[i] !== c && src[i] !== "\n") {
        inStr[i] = 1;
        if (src[i] === "\\") { inStr[i + 1] = 1; i++; }
        i++;
      }
      if (i < src.length) inStr[i] = 1;
      i++;
      continue;
    }
    if (c === "`" || (c === "}" && tmplDepth.length && tmplDepth[tmplDepth.length - 1] === brace)) {
      if (c === "}") tmplDepth.pop();
      inStr[i] = 1;
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { inStr[i] = inStr[i + 1] = 1; i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") { tmplDepth.push(brace); i += 2; break; }
        inStr[i++] = 1;
      }
      if (src[i] === "`") { inStr[i] = 1; i++; }
      continue;
    }
    if (c === "{") brace++;
    else if (c === "}") brace--;
    i++;
  }
  return { code: out.join(""), inStr };
}

const INSENSITIVE_VALUE = /^\s*(?:(["'`])insensitive\1|(?:Prisma\s*\.\s*)?QueryMode\s*\.\s*insensitive\b)/;
const SEARCH_KEY = /(?:^|[{,\s])["']?(contains|startsWith|endsWith|search)["']?\s*:/;

/** ตัวแปรในไฟล์ที่ถือค่า insensitive (`const m = "insensitive"` · `= Prisma.QueryMode.insensitive` · `as const` ได้) */
function insensitiveIdents(code) {
  const out = new Set();
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*((["'])insensitive\3|(?:Prisma\s*\.\s*)?QueryMode\s*\.\s*insensitive\b)/g)) out.add(m[1]);
  return out;
}

/** วัตถุ `{ … }` ที่ครอบตำแหน่ง `at` (นับวงเล็บ ข้ามสตริง) → [start, end] หรือ null */
function enclosingObject(code, inStr, at) {
  let depth = 0;
  let start = -1;
  for (let i = at; i >= 0; i--) {
    if (inStr[i]) continue;
    const c = code[i];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) { start = i; break; }
      depth--;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < code.length; i++) {
    if (inStr[i]) continue;
    const c = code[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return [start, i];
    }
  }
  return null;
}

/** เนื้อของวัตถุเฉพาะระดับบนสุด (วัตถุ/อาร์เรย์ซ้อนข้างในถูกแทนด้วย `{}`) */
function topLevel(code, inStr, s, e) {
  let depth = 0;
  let out = "";
  for (let i = s + 1; i < e; i++) {
    const c = code[i];
    if (!inStr[i] && (c === "{" || c === "[" || c === "(")) { if (depth === 0) out += "{}"; depth++; continue; }
    if (!inStr[i] && (c === "}" || c === "]" || c === ")")) { depth--; continue; }
    if (depth === 0) out += c;
  }
  return out;
}

/**
 * หาไซต์ที่ผิดในซอร์สหนึ่งไฟล์ → [{ line, snippet, field }]
 * ไซต์ = `mode:` ที่ค่าเป็น insensitive (สตริง/QueryMode/ตัวแปรที่เห็นในไฟล์) ซึ่งวัตถุที่ครอบไม่มี key ค้นหา (contains/startsWith/endsWith/search)
 */
export function findRawInsensitive(src) {
  const { code, inStr } = stripComments(src);
  const idents = insensitiveIdents(code);
  const lines = src.split("\n");
  const hits = [];
  for (const m of code.matchAll(/(["']?)\bmode\1\s*:/g)) {
    const at = m.index;
    if (inStr[at] && !m[1]) continue;
    if (m[1] && !inStr[at]) continue;
    const rest = code.slice(at + m[0].length, at + m[0].length + 80);
    const id = rest.match(/^\s*([A-Za-z_$][\w$]*)\s*[,}\s]/)?.[1];
    const isIns = INSENSITIVE_VALUE.test(rest) || (!!id && idents.has(id));
    if (!isIns) continue;
    const obj = enclosingObject(code, inStr, at);
    if (!obj) continue;
    const top = topLevel(code, inStr, obj[0], obj[1]);
    if (SEARCH_KEY.test(top)) continue;
    // ชนิดข้อมูล (`{ equals: string; mode: "insensitive" }`) ไม่ใช่คำค้นจริง — ตัวคั่นเป็น `;` ไม่ใช่ `,`
    if (/;\s*$/.test(top.trim()) || /:\s*string\s*;/.test(top)) continue;
    const line = src.slice(0, at).split("\n").length;
    const field = code.slice(0, obj[0]).match(/["']?([\w$]+)["']?\s*:\s*$/)?.[1] ?? "(value)";
    hits.push({ line, snippet: (lines[line - 1] ?? "").trim(), field });
  }
  return hits;
}

/** ตัวอย่างที่ต้องจับได้ (รีวิว RV2-6 · 9 รูป + 2 ตัวควบคุม) และที่ต้องไม่จับ — fitness F15.0 รันชุดนี้ทุกครั้ง */
export const F15_SELF_TEST = {
  mustHit: {
    control: `const w = { email: { equals: keys.email.trim(), mode: "insensitive" } };`,
    multiLine: `const w = {\n  email: {\n    equals: x,\n    mode: "insensitive",\n  },\n};`,
    shorthand: `const equals = v; const w = { email: { equals, mode: "insensitive" } };`,
    swapped: `const w = { email: { mode: "insensitive", equals: v } };`,
    singleQuote: `const w = { email: { equals: v, mode: 'insensitive' } };`,
    commaInValue: `const w = { email: { equals: v.slice(0, 40), mode: "insensitive" } };`,
    quotedKey: `const w = { "email": { "equals": v, "mode": "insensitive" } };`,
    queryModeEnum: `const w = { email: { equals: v, mode: Prisma.QueryMode.insensitive } };`,
    variableObject: `const f = { equals: v, mode: "insensitive" as const }; const w = { email: f };`,
    spread: `const ci = { mode: "insensitive" as const }; const w = { email: { ...ci, equals: v } };`,
    urlOnSameLine: `const u = "a//b"; const w = { email: { equals: v, mode: "insensitive" } };`,
    modeVariable: `const M = "insensitive" as const; const w = { email: { equals: v, mode: M } };`,
  },
  mustNotHit: {
    contains: `const w = { name: { contains: q, mode: "insensitive" } };`,
    containsAsConst: `const w = { title: { contains: t, mode: "insensitive" as const } };`,
    helper: `const w = { email: ciEquals(x) };`,
    comment: `// { email: { equals: v, mode: "insensitive" } }\nconst a = 1;`,
    blockComment: `/* { equals: v, mode: "insensitive" } */ const a = 1;`,
    inString: `const s = "{ equals: v, mode: \\"insensitive\\" }";`,
    typeLiteral: `type T = { email?: { equals: string; mode: "insensitive" } };`,
    defaultMode: `const w = { email: { equals: v, mode: "default" } };`,
  },
};
