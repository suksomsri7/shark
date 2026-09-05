// /developers/account.md — plaintext mirror of `docs/api/ACCOUNT-API.md` (WO F1)
//
// Some AI agents and CLIs fetch a `.md` URL instead of parsing HTML. This route answers
// with the exact same bytes as the generated reference doc — the one canonical file both
// this route and `/developers/account` (the HTML page) are built from — so there is only
// ever one source of truth to keep in sync (`scripts/gen-account-api-docs.mts`).
//
// 🔴 folder name `account.md` is a static path segment (the dot is a plain character, not
//    Next's `[...]` / `(...)` / `@...` syntax) — same trick as `openapi.json/route.ts`
//    (`node_modules/next/dist/docs/.../07-api-routes.md` §Caveats: static beats dynamic).
// **ไม่ต้องใช้คีย์**: เอกสารนี้ไม่มีข้อมูลของร้านใดเลย
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DOC_PATH = resolve(process.cwd(), "docs/api/ACCOUNT-API.md");
const CACHE_SECONDS = 300;

export async function GET(): Promise<Response> {
  const body = await readFile(DOC_PATH, "utf8");
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}
