import { readFileSync, existsSync } from "node:fs"; import { join, dirname, posix } from "node:path";
const ROOT = process.argv[2]; const extra = JSON.parse(process.argv[3]||"{}");
const rel = (f) => { const src = readFileSync(join(ROOT,f),"utf8"); const out=[]; for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](\.{1,2}\/[^"']+|@\/lib\/modules\/hr\/[^"']+)["']/gm)) { const s=m[1]; const b = s.startsWith("@/")?join("src",s.slice(2)):join(dirname(f),s); for (const c of [`${b}.ts`,`${b}.tsx`,join(b,"index.ts")]) if (existsSync(join(ROOT,c))) {out.push(posix.normalize(c));break;} } return [...out, ...(extra[f]||[])]; };
// reach sets
const reach=(s)=>{const seen=new Set();const st=[s];while(st.length){const f=st.pop();for(const n of rel(f)) if(!seen.has(n)){seen.add(n);st.push(n);}}return seen;};
const P="src/lib/modules/hr/privacy.ts"; const fromP=reach(P); const scc=[...fromP].filter(f=>f!==P && reach(f).has(P)).sort();
console.log("SCC with privacy:", scc);
// paths for stock-charge
console.log("stock-charge reaches privacy:", reach("src/lib/modules/hr/stock-charge.ts").has(P));
console.log("nav reaches privacy:", reach("src/lib/modules/hr/nav.ts").has(P), "privacy reaches nav:", fromP.has("src/lib/modules/hr/nav.ts"));
