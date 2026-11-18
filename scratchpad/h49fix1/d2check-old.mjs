// replicates qc-pos-p6.2 facadeOf + judgeD2 "word" rule (export ของ facade) — read-only
import { readFileSync } from "node:fs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const src = strip(readFileSync("src/lib/modules/pos/index.ts", "utf8"));
const names = new Set();
for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) for (const part of m[1].split(",")) { const p = part.trim().replace(/^type\s+/, ""); if (!p) continue; const b = p.split(/\s+as\s+/); const nm = (b[1] ?? b[0]).trim(); if (/^\w+$/.test(nm)) names.add(nm); }
for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|type|interface|enum)\s+(\w+)/g)) names.add(m[1]);
const doc = readFileSync("scratchpad/h49fix1/pos-old.md", "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (w) => new RegExp(`(^|[^\\w])${esc(w)}(?![\\w])`).test(doc);
const miss = [...names].filter((n) => !word(n));
console.log(`facade names ${names.size} · missing ${miss.length}: ${miss.join(",")}`);
