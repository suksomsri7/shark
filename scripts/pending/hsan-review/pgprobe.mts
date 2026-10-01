// @ts-nocheck
// pgprobe.mts — Postgres ARE semantics of `\s` inside bracket expressions (in-memory PGlite)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PGlite } = await import(require.resolve("@electric-sql/pglite", { paths: [require.resolve("prisma/package.json")] }).replace(/\.cjs$/, ".js"));
const db = new PGlite();
for (const [s, re] of [[" ", "[\\s]"], ["\t", "[\\s]"], ["s", "^[^\\s]$"], [" ", "^[^\\s]$"], ["\\", "^[^\\s]$"], ["<img x", "<img[\\s/>]"], ["<img\tx", "<img[\\s/>]"], ["<img x", "<img[[:space:]/>]"], ["<a href=\"blob:https://x/1\">", "<[a-z][^\\s>/]*/"], ["x onload=1", "\\son[a-z]+\\s*="], ["<img src=\"java\tscript:x\">", "<(svg|img)[\\s/>]"]] as const) {
  const r = await db.query(`SELECT $1 ~* $2 AS m`, [s, re]);
  console.log(`${JSON.stringify(s).padEnd(32)} ~* ${re.padEnd(22)} → ${r.rows[0].m}`);
}
const v = await db.query(`SELECT version()`); console.log(v.rows[0].version);
const B = String.raw`<[a-z][^\s>/]*/|<[a-z][a-z0-9]*[-:]|<(svg|math|details|video|audio|body|iframe|object|embed|form|input|select|textarea|marquee|meta|base|link|style|script|img)[\s/>]|\son[a-z]+\s*=|javascript:|vbscript:|data:text`;
for (const s of [`<img src="java\tscript:alert(1)" alt=x>`, `<a href="blob:https://x/1">x</a>`, `<img src=x>`, `<img x`, `ximg `]) {
  const parts = B.split("|");
  const r = await db.query(`SELECT $1 ~* $2 AS full, $1 ~* '<(svg|img)[\\s/>]' AS sub, $1 ~* '<(svg|math|details|video|audio|body|iframe|object|embed|form|input|select|textarea|marquee|meta|base|link|style|script|img)[\\s/>]' AS sub2, $1 ~ '(?i)<(svg|img)[\\s/>]' AS sub3, $1 ~* '<(details|img)[\\s/>]' AS sub4`, [s, B]);
  console.log(JSON.stringify(s), r.rows[0], "JS:", new RegExp(B, "i").test(s));
}
