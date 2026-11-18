import { readFileSync, existsSync } from "node:fs"; import { join, dirname, posix } from "node:path";
const ROOT=process.argv[2], A=process.argv[3], B=process.argv[4];
const rel=(f)=>{const src=readFileSync(join(ROOT,f),"utf8");const out=[];for(const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](\.{1,2}\/[^"']+|@\/lib\/modules\/hr\/[^"']+)["']/gm)){const s=m[1];const b=s.startsWith("@/")?join("src",s.slice(2)):join(dirname(f),s);for(const c of [`${b}.ts`,`${b}.tsx`,join(b,"index.ts")]) if(existsSync(join(ROOT,c))){out.push(posix.normalize(c));break;}}return out;};
const prev=new Map([[A,null]]);const q=[A];while(q.length){const f=q.shift();for(const n of rel(f)) if(!prev.has(n)){prev.set(n,f);q.push(n);}}
const p=[];let c=B;while(c){p.unshift(c.split("/").pop());c=prev.get(c);}console.log(p.join(" → "));
