// /developers/kanban — หน้าคู่มือสาธารณะของ API "บอร์ดงาน" (K1.15)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": ทุก operation/scope/จำนวนในหน้านี้มาจาก `buildOpenApi(KANBAN_OPS)`
//    ซึ่งเป็นฟังก์ชันตัวเดียวกับที่ route `/api/v1/kanban/openapi.json` และ
//    `scripts/gen-kanban-api-docs.mts` เรียก — ไม่มีรายชื่อ endpoint ที่พิมพ์มือในไฟล์นี้เลย
//    (ต่างจากหน้า `/developers` ของแพลตฟอร์มที่ยังพิมพ์มืออยู่ จึงล้าสมัยง่าย)
//
// Server component ล้วน · ไม่มี client JS · **ไม่ต้องใช้คีย์** — นักพัฒนา (หรือผู้ช่วย AI)
// ต้องอ่านหน้านี้ได้ก่อนมีคีย์ เพราะหน้านี้ไม่มีข้อมูลของร้านใดเลย
import { Fragment } from "react";
import type { Metadata } from "next";
import { API_SCOPE_BUNDLES, DEFAULT_KEY_TTL_DAYS, type ApiScopeBundle } from "@/lib/api-keys/scopes";
import type { ApiOp, ApiOpKind } from "@/lib/api/op";
import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api/respond";
import { boardRoleForScopes } from "@/lib/modules/kanban/api/actor";
import { buildOpenApi } from "@/lib/modules/kanban/api/openapi";
import { KANBAN_OPS } from "@/lib/modules/kanban/api/registry";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";

export const metadata: Metadata = {
  title: "SHARK Task Board API for developers",
  description:
    "REST API ของบอร์ดงาน (Kanban) ใน SHARK: บอร์ด คอลัมน์ การ์ด ป้าย เช็คลิสต์ ความเห็น ไฟล์แนบ ค้นหาข้ามบอร์ด และ webhook",
};

const BASE_URL = "https://shark.in.th/api/v1/kanban";

const codeBox = "block overflow-x-auto whitespace-pre rounded-lg bg-neutral-900 p-3 text-xs text-neutral-100";
const section = "flex flex-col gap-3 border-t pt-8 first:border-t-0 first:pt-0";
const h2 = "text-xl font-bold";
const h3 = "text-base font-semibold";
const table = "w-full border-collapse text-sm";
const th = "border-b py-1.5 pr-3 text-left font-semibold text-neutral-600";
const td = "border-b border-neutral-100 py-1.5 pr-3 align-top";
const badge = "ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800";

/**
 * คำอธิบายไทยของรหัสข้อผิดพลาด — รายการรหัสเป็นของกลางทั้งแพลตฟอร์ม (ใช้ร่วมกับโมดูลบัญชี)
 * จึงมีบางรหัสที่บอร์ดงานไม่มีวันคืน และกำกับไว้ให้ชัด (ตารางเต็มพร้อมสถานะ HTTP อยู่ในคู่มือฉบับ generate)
 */
const ERROR_CODE_TH: Record<ApiErrorCode, string> = {
  unauthorized: "ไม่ได้แนบคีย์ หรือคีย์ถูกเพิกถอนแล้ว",
  key_expired: "คีย์หมดอายุ — หมุนคีย์ใหม่ที่หน้าบอร์ดงาน › ตั้งค่า › API",
  system_required: "คีย์ไม่ได้ผูกระบบบอร์ดงาน และไม่ได้ส่งส่วนหัว X-Shark-System",
  system_mismatch: "X-Shark-System ไม่ตรงกับระบบที่คีย์ผูกไว้",
  scope_missing: "คีย์ไม่มี scope ที่ operation นี้ต้องการ (ดูชื่อ scope ใน hint)",
  invalid_json: "เนื้อคำขอไม่ใช่ JSON ที่ถูกต้อง",
  validation: "ข้อมูลไม่ผ่านการตรวจ schema — ดูรายละเอียดใน details[]",
  idempotency_required: "คำสั่งเขียนที่ไม่ได้แนบส่วนหัว Idempotency-Key",
  idempotency_conflict: "ใช้ Idempotency-Key เดิมกับเนื้อคำขอที่ต่างออกไป",
  idempotency_in_progress: "คำขอที่ใช้คีย์กันซ้ำใบนี้ยังทำงานค้างอยู่",
  confirm_required: "คำสั่งอันตรายที่ไม่ได้ส่ง confirm: true มาด้วย",
  not_found: "ไม่มี operation นี้ หรือบอร์ด/การ์ดนั้นไม่ได้อยู่ในระบบที่คีย์ผูกไว้",
  method_not_allowed: "path มีอยู่จริง แต่ไม่รองรับ HTTP method นี้ (ดูส่วนหัว Allow)",
  rate_limited: "เรียกถี่เกินเพดานของคีย์ — รอตามส่วนหัว Retry-After",
  period_locked: "ของโมดูลบัญชีเท่านั้น (งวดบัญชีถูกปิด) — API บอร์ดงานไม่คืนรหัสนี้",
  state_conflict: "สถานะปัจจุบันทำแบบนั้นไม่ได้ (การ์ดถูกเก็บไปแล้ว · คอลัมน์ปลายทางเต็มเพดาน WIP · คอลัมน์คนละบอร์ด · บอร์ดไม่มีคอลัมน์ 'เสร็จ')",
  duplicate: "มีของที่ชนกันอยู่แล้ว (เช่น ชื่อป้ายซ้ำในบอร์ดเดียวกัน)",
  forbidden: "กติกาทางธุรกิจปฏิเสธ ไม่ใช่เรื่อง scope (บทบาทบนบอร์ดต่ำไป · คีย์ไม่ผูกกับผู้ใช้คนใด · ขอดูกล่องงานของคนอื่น)",
  unprocessable: "เข้าใจคำขอ แต่ทำตามที่ขอไม่ได้ (เช่น เก็บคอลัมน์ที่ยังมีการ์ดค้างอยู่)",
  upstream_unavailable: "บริการภายนอกที่ operation นั้นต้องพึ่งพา ยังไม่ได้ตั้งค่าหรือติดต่อไม่ได้",
};

const KIND_LABEL: Record<ApiOpKind, string> = { read: "Read — อ่านอย่างเดียว", write: "Write — เปลี่ยนข้อมูล", danger: "Danger — ย้อนกลับยาก" };
const KIND_BLURB: Record<ApiOpKind, string> = {
  read: "เรียกเมื่อไหร่ก็ได้ ไม่ต้องมี Idempotency-Key ไม่เขียนอะไรลงฐานข้อมูล",
  write: "เปลี่ยนข้อมูลจริง ต้องมีส่วนหัว Idempotency-Key ทุกครั้ง และทุกครั้งที่สำเร็จจะถูกบันทึกลงประวัติ",
  danger: "กู้คืนยาก ต้องมีทั้ง Idempotency-Key, confirm: true และ reason ยาวอย่างน้อย 5 ตัวอักษร (เก็บลงประวัติ)",
};

/** ป้ายไทยของกลุ่ม operation (กลุ่มมาจาก prefix ของ id ในทะเบียน เช่น `cards.move` → `cards`) */
const DOMAIN_TH: Record<string, string> = {
  core: "ทั่วไป · ค้นหา · งานของฉัน",
  boards: "บอร์ด",
  columns: "คอลัมน์",
  cards: "การ์ดงาน",
  labels: "ป้ายกำกับ",
  checklists: "เช็คลิสต์",
  "checklist-items": "ข้อในเช็คลิสต์",
  comments: "ความเห็น",
  attachments: "ไฟล์แนบ",
  templates: "เทมเพลตบอร์ด",
};

const DOMAIN_ORDER = ["core", "boards", "columns", "cards", "labels", "checklists", "checklist-items", "comments", "attachments", "templates"];

/** กลุ่มของ op — id ที่ไม่มีจุด (`ping` / `search` / `my-tasks`) ถือเป็นกลุ่ม `core` */
function domainOf(op: ApiOp): string {
  const head = op.id.split(".")[0] ?? op.id;
  return head === op.id ? "core" : head;
}

function domainLabel(domain: string): string {
  return DOMAIN_TH[domain] ?? domain;
}

function groupByKindThenDomain(ops: readonly ApiOp[]): Map<ApiOpKind, Map<string, ApiOp[]>> {
  const byKind = new Map<ApiOpKind, Map<string, ApiOp[]>>();
  for (const kind of ["read", "write", "danger"] as const) byKind.set(kind, new Map());
  for (const op of ops) {
    const byDomain = byKind.get(op.kind)!;
    const domain = domainOf(op);
    const list = byDomain.get(domain) ?? [];
    list.push(op);
    byDomain.set(domain, list);
  }
  return byKind;
}

function sortDomains(domains: string[]): string[] {
  return [...domains].sort((a, b) => {
    const ia = DOMAIN_ORDER.indexOf(a);
    const ib = DOMAIN_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/** ป้ายไทยสั้น ๆ ของชุดสิทธิ์ (ข้อความเดียวกับที่เจ้าของร้านเห็นในหน้าตั้งค่า) */
const BUNDLE_TH: Record<string, string> = {
  "kanban-read": "อ่านบอร์ดงานทุกบอร์ดของระบบที่ผูกไว้ ไม่มีสิทธิ์เขียนใด ๆ",
  "kanban-edit": "ทำได้ทุกอย่างในชุดอ่านอย่างเดียว บวกสร้าง/แก้/ย้ายการ์ด คอลัมน์ ป้าย ความเห็น และไฟล์แนบ",
  "kanban-admin": "ทำได้ทุกอย่างในชุดทำงานกับการ์ด บวกจัดการสมาชิกบอร์ด เก็บบอร์ด/คอลัมน์ เทมเพลต และกฎอัตโนมัติ",
};

type Recipe = { title: string; scopes: string; opIds: string[]; steps: { comment: string; curl: string }[] };

/** ทุก path/ฟิลด์/scope ในสูตรด้านล่างมีอยู่จริงในทะเบียน (ดู opIds กำกับใต้หัวข้อของแต่ละสูตร) */
const RECIPES: Recipe[] = [
  {
    title: "เปิดบอร์ดใหม่ แล้วใส่งานใบแรก",
    scopes: "kanban-edit",
    opIds: ["boards.create", "columns.create", "cards.create"],
    steps: [
      {
        comment: "สร้างบอร์ด (visibility TENANT = ทุกคนในร้านอ่านได้ · ไม่ระบุ = PRIVATE)",
        curl: `curl -sS -X POST "${BASE_URL}/boards" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"งานหน้าร้าน","visibility":"TENANT"}'`,
      },
      {
        comment: "เพิ่มคอลัมน์ต่อท้ายบอร์ด แล้วอ่าน columnId กลับมาด้วย GET /boards/{id}/columns",
        curl: `curl -sS -X POST "${BASE_URL}/boards/brd_123/columns" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" -d '{"name":"กำลังทำ"}'`,
      },
      {
        comment: "สร้างการ์ดในคอลัมน์นั้น (ป้ายที่ยังไม่มีในบอร์ด ระบบสร้างให้เอง)",
        curl: `curl -sS -X POST "${BASE_URL}/boards/brd_123/cards" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"columnId":"col_456","title":"เติมถังอากาศ 20 ใบ","dueAt":"2026-09-10T10:00:00.000Z","labels":["ด่วน"]}'`,
      },
    ],
  },
  {
    title: "ย้ายการ์ดโดยบอก 'เพื่อนบ้าน' ไม่ใช่ตัวเลขลำดับ",
    scopes: "kanban-edit",
    opIds: ["cards.move", "columns.move", "columns.move-all"],
    steps: [
      {
        comment: "วางการ์ดต่อจาก card_aaa ในคอลัมน์ปลายทาง — คำตอบคืน position (fractional index) ที่เซิร์ฟเวอร์คำนวณให้",
        curl: `curl -sS -X POST "${BASE_URL}/cards/card_123/move" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"toColumnId":"col_doing","afterCardId":"card_aaa"}'`,
      },
      {
        comment: "คอลัมน์ปลายทางเต็มเพดาน WIP จะได้ 409 state_conflict — คีย์ระดับ ADMIN ข้ามได้ด้วย force: true",
        curl: `curl -sS -X POST "${BASE_URL}/cards/card_123/move" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"toColumnId":"col_doing","beforeCardId":"card_bbb","force":true}'`,
      },
    ],
  },
  {
    title: "มอบหมายงาน ติดป้าย และแตกเป็นเช็คลิสต์",
    scopes: "kanban-edit",
    opIds: ["cards.assignees.set", "cards.labels.set", "checklists.create", "checklist-items.create"],
    steps: [
      {
        comment: "userIds / labelIds เป็น 'รายชื่อทั้งหมดหลังแก้' (แทนที่ของเดิมทั้งชุด ไม่ใช่การเพิ่มทีละตัว)",
        curl: `curl -sS -X PUT "${BASE_URL}/cards/card_123/assignees" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" -d '{"userIds":["usr_1","usr_2"]}'`,
      },
      {
        comment: "ป้ายต้องเป็น labelId ของบอร์ดนั้น (อ่านจาก GET /boards/{id}/labels)",
        curl: `curl -sS -X PUT "${BASE_URL}/cards/card_123/labels" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" -d '{"labelIds":["lbl_urgent"]}'`,
      },
      {
        comment: "เพิ่มเช็คลิสต์ในการ์ด แล้วค่อยเติมข้อทีละข้อที่ POST /checklists/{id}/items",
        curl: `curl -sS -X POST "${BASE_URL}/cards/card_123/checklists" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" -d '{"title":"ขั้นตอนก่อนส่งงาน"}'`,
      },
    ],
  },
  {
    title: "ตามงาน: กล่องงานของฉัน · ค้นหาที่เลยกำหนด · ดึงเป็น CSV",
    scopes: "kanban-read",
    opIds: ["my-tasks", "search", "cards.list"],
    steps: [
      {
        comment: "กล่องงานของผู้ใช้ที่เป็นเจ้าของคีย์ (คีย์ชุด kanban-admin ส่ง ?userId= ถามแทนคนอื่นได้)",
        curl: `curl -sS "${BASE_URL}/my-tasks" -H "Authorization: Bearer $SHARK_API_KEY"`,
      },
      {
        comment: "ค้นหาการ์ดข้ามทุกบอร์ดที่คีย์เห็น — ตัวกรองชุดเดียวกับหน้าจอในแอป",
        curl: `curl -sS "${BASE_URL}/search?due=overdue&status=open&take=50" -H "Authorization: Bearer $SHARK_API_KEY"`,
      },
      {
        comment: "รายการการ์ดของบอร์ดเป็นไฟล์ CSV (เปิดใน Excel ได้ตรง ๆ · มี BOM ให้แล้ว)",
        curl: `curl -sS "${BASE_URL}/boards/brd_123/cards?status=all" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Accept: text/csv" -o cards.csv`,
      },
    ],
  },
  {
    title: "ปิดงาน แล้วเก็บการ์ดเข้าคลัง (คำสั่งอันตราย)",
    scopes: "kanban-edit",
    opIds: ["cards.complete", "cards.archive", "cards.restore"],
    steps: [
      {
        comment: "ทำเครื่องหมายว่าเสร็จ — ระบบย้ายเข้าคอลัมน์ที่ตั้งธง 'เสร็จ' ให้เอง (บอร์ดที่ไม่มีคอลัมน์นั้นได้ 409)",
        curl: `curl -sS -X POST "${BASE_URL}/cards/card_123/complete" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)"`,
      },
      {
        comment: "เก็บเข้าคลัง = danger ⇒ ต้องมี confirm: true และ reason (กู้คืนได้ที่ POST /cards/{id}/restore)",
        curl: `curl -sS -X DELETE "${BASE_URL}/cards/card_123" \\\n  -H "Authorization: Bearer $SHARK_API_KEY" -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{"confirm":true,"reason":"ลูกค้ายกเลิกงานนี้แล้ว"}'`,
      },
    ],
  },
];

const GLOSSARY: [string, string, string][] = [
  ["ระบบบอร์ดงาน", "task board system", "X-Shark-System / AppSystem type KANBAN"],
  ["บอร์ด", "board", "boardId"],
  ["คอลัมน์", "column / list", "columnId"],
  ["การ์ดงาน", "card / task", "cardId · cardNo"],
  ["ลำดับในคอลัมน์", "fractional index", "position · beforeCardId / afterCardId"],
  ["ผู้รับผิดชอบ", "assignee", "assigneeUserId · userIds[]"],
  ["ป้ายกำกับ", "label", "labelId"],
  ["เช็คลิสต์", "checklist", "checklistId"],
  ["กำหนดส่ง", "due date", "dueAt"],
  ["เก็บเข้าคลัง", "archive", "danger operation · DELETE"],
  ["เพดานงานค้างในคอลัมน์", "WIP limit", "wipLimit · 409 state_conflict"],
  ["คอลัมน์ 'เสร็จ'", "done column", "isDoneColumn"],
  ["บทบาทบนบอร์ด", "board role", "VIEWER / EDITOR / ADMIN"],
];

export default function KanbanApiDevPage() {
  const spec = buildOpenApi(KANBAN_OPS);
  const grouped = groupByKindThenDomain(KANBAN_OPS);
  const kanbanEvents = WEBHOOK_EVENTS.filter((e) => e.value.startsWith("kanban."));
  const bundles: ApiScopeBundle[] = API_SCOPE_BUNDLES.filter((b) => b.id.startsWith("kanban-"));
  const withTool = KANBAN_OPS.filter((o) => o.tool);
  const withCsv = KANBAN_OPS.filter((o) => o.csv);
  const pathCount = Object.keys(spec.paths).length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">SHARK Developers</p>
        <h1 className="text-2xl font-bold">SHARK Task Board API — API บอร์ดงาน</h1>
        <p className="text-sm text-neutral-700">
          REST API ของโมดูล <strong>บอร์ดงาน</strong> (Kanban) ในร้านของคุณ: อ่านและแก้บอร์ด คอลัมน์ การ์ดงาน
          ป้ายกำกับ เช็คลิสต์ ความเห็น ไฟล์แนบ ค้นหาการ์ดข้ามบอร์ด เปิดกล่อง &quot;งานของฉัน&quot; ของพนักงาน
          ไปจนถึงรับ webhook เมื่อการ์ดถูกสร้าง ย้าย มอบหมาย หรือเลยกำหนดส่ง — เอาไปต่อกับระบบภายใน
          n8n/Zapier หรือให้ผู้ช่วย AI สั่งงานแทนได้
        </p>
        <p className="text-sm text-neutral-700">
          ทุก operation ทุก scope และทุกตัวเลขในหน้านี้ generate ตรงจากทะเบียนที่ API จริงใช้อยู่ (
          <code>buildOpenApi(KANBAN_OPS)</code>) — ไม่มีรายการที่พิมพ์ด้วยมือ จึงไม่มีทางล้าสมัยกว่า API
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a className="font-medium text-emerald-700 underline" href="/api/v1/kanban/openapi.json">
            /api/v1/kanban/openapi.json
          </a>
          <span className="text-neutral-400">·</span>
          <a className="font-medium text-emerald-700 underline" href="/developers/kanban.md">
            /developers/kanban.md
          </a>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-600">
            OpenAPI {spec.openapi} · {KANBAN_OPS.length} operations · {pathCount} paths · version {spec.info.version}
          </span>
        </p>
      </header>

      <section className={section}>
        <h2 className={h2}>ขอคีย์อย่างไร</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-700">
          <li>
            เจ้าของร้านสร้างคีย์ได้ที่ <strong>บอร์ดงาน › ตั้งค่า › API</strong> (Task boards &gt; Settings &gt; API)
            ตัวคีย์จริงแสดงให้เห็น <strong>ครั้งเดียว</strong> ตอนสร้าง — ทำหายให้เพิกถอนแล้วออกใบใหม่
            อายุคีย์ปริยาย {DEFAULT_KEY_TTL_DAYS} วัน
          </li>
          <li>
            แนบคีย์ทุกคำขอเป็น <code>Authorization: Bearer &lt;api key&gt;</code>
          </li>
          <li>
            คีย์ 1 ใบผูกกับ <strong>ระบบบอร์ดงาน 1 ระบบ</strong> (AppSystem ชนิด <code>KANBAN</code>) และเห็น
            <strong>ทุกบอร์ดของระบบนั้น</strong> รวมบอร์ด <code>PRIVATE</code> ด้วย — เพราะเจ้าของร้านเป็นคนออกคีย์
            และเลือกชุดสิทธิ์เอง
          </li>
          <li>
            คีย์ที่ยังไม่ผูกระบบ ต้องส่ง <code>X-Shark-System: &lt;systemId&gt;</code> ทุกครั้ง · ถ้าผูกไว้แล้วแต่ส่ง
            ส่วนหัวมาไม่ตรง จะได้ 403 <code>system_mismatch</code>
          </li>
        </ul>
        <pre className={codeBox}>
          <code>{`curl -sS "${BASE_URL}/ping" \\\n  -H "Authorization: Bearer shark_xxxxxxxxxxxxxxxx"`}</code>
        </pre>
      </section>

      <section className={section}>
        <h2 className={h2}>ชุดสิทธิ์ (scope bundles)</h2>
        <p className="text-sm text-neutral-700">
          scope ของคีย์คือ <strong>permission key ชุดเดียวกับที่คนในร้านใช้</strong> — คีย์จึงทำได้ไม่เกินสิ่งที่คนทำได้
          เลือกเป็นชุดสำเร็จรูปได้ 3 ชุด (ยังติ๊กเพิ่ม/ลดรายตัวได้) ซ้อนกันเป็นชั้น: read ⊂ edit ⊂ admin
        </p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>ชุด</th>
              <th className={th}>ทำอะไรได้</th>
              <th className={th}>บทบาทบนบอร์ด</th>
              <th className={th}>Scopes</th>
            </tr>
          </thead>
          <tbody>
            {bundles.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <code>{b.id}</code>
                  <div className="text-xs text-neutral-500">{b.label}</div>
                </td>
                <td className={td}>{BUNDLE_TH[b.id] ?? b.summary}</td>
                <td className={td}>
                  <code>{boardRoleForScopes(b.scopes)}</code>
                </td>
                <td className={`${td} font-mono text-xs`}>{b.scopes.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm text-neutral-700">
          <strong>บทบาทบนบอร์ดของคีย์มาจาก scope ล้วน ๆ</strong> ไม่ใช่จากการเป็นสมาชิกบอร์ด (คีย์ไม่มีชื่ออยู่ใน
          สมาชิกบอร์ดไหนเลย): มี <code>kanban.board.member.manage</code> → <code>ADMIN</code> ทุกบอร์ด · มี scope
          เขียนตัวใดตัวหนึ่ง → <code>EDITOR</code> · มีแต่สิทธิ์อ่าน → <code>VIEWER</code> ·
          เรียก operation ที่คีย์ไม่มี scope จะได้ 403 <code>scope_missing</code> พร้อมชื่อ scope ที่ขาดใน{" "}
          <code>hint</code> · เรียก <code>GET /ping</code> ครั้งเดียวตอนเริ่มระบบ จะรู้เลยว่าคีย์ใบนี้ได้บทบาทไหน
          ไม่ต้องเดาจาก 403
        </p>
      </section>

      <section className={section}>
        <h2 className={h2}>กติกาที่ใช้กับทุก endpoint</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-neutral-700">
          <li>
            <strong>ลำดับการ์ด/คอลัมน์เป็น fractional index.</strong> ฟิลด์ <code>position</code> เป็นสตริง
            <strong> ห้ามคำนวณเอง</strong> — ย้ายด้วยการบอกเพื่อนบ้าน (<code>beforeCardId</code> /{" "}
            <code>afterCardId</code>) แล้วเซิร์ฟเวอร์คืน <code>position</code> ใหม่มาให้
          </li>
          <li>
            <strong>
              <code>Idempotency-Key</code>
            </strong>{" "}
            บังคับกับทุกคำสั่งเขียน (POST, PATCH, PUT, DELETE) ใช้ค่าไม่ซ้ำต่อ 1 ความตั้งใจ · ยิงซ้ำด้วยคีย์เดิม
            และเนื้อเดิมจะได้คำตอบเดิมกลับมา (<code>Idempotent-Replayed: true</code>) · เนื้อต่างจะได้ 409{" "}
            <code>idempotency_conflict</code>
          </li>
          <li>
            <strong>คำสั่งอันตราย (danger)</strong> ต้องส่ง <code>confirm: true</code> (ค่าตรรกะจริง ไม่ใช่ข้อความ)
            และ <code>reason</code> ยาวอย่างน้อย 5 ตัวอักษร ซึ่งจะถูกเก็บลงประวัติ (audit log)
          </li>
          <li>
            <strong>บอร์ดที่คีย์มองไม่เห็น ตอบ 404 <code>not_found</code> เสมอ ไม่ใช่ 403</strong> — API
            ไม่ยืนยันว่าบอร์ดส่วนตัวใบนั้นมีอยู่จริงหรือไม่
          </li>
          <li>
            <strong>วันเวลาเป็น ISO-8601 UTC</strong> (<code>dueAt</code>, <code>createdAt</code>,{" "}
            <code>completedAt</code>) · กำหนดส่งที่ไม่ระบุเวลา หมายถึงสิ้นวันตามปฏิทินไทยตามที่แอปเก็บไว้
          </li>
          <li>
            <strong>ซองคำตอบ.</strong> สำเร็จ = <code>{"{ data, page?, requestId }"}</code> · ล้มเหลว ={" "}
            <code>{"{ error: { code, message_th, message_en, hint?, details? }, requestId }"}</code> ·{" "}
            <code>requestId</code> อยู่ในส่วนหัว <code>X-Request-Id</code> ด้วย ยกไปแปะตอนแจ้งปัญหาได้เลย
          </li>
          <li>
            <strong>เพดานการเรียก</strong> แยกตามชนิดต่อคีย์: อ่าน 300 ครั้ง/นาที · เขียน 60 ครั้ง/นาที · เกินได้ 429
            พร้อม <code>Retry-After</code> · คำตอบที่สำเร็จมี <code>X-RateLimit-Remaining</code>
          </li>
          <li>
            <strong>CSV.</strong> {withCsv.length} operation ที่มีป้าย <span className={badge}>CSV</span> ในตารางด้านล่าง
            รองรับ <code>Accept: text/csv</code> — ได้ไฟล์ <code>text/csv; charset=utf-8</code> พร้อม BOM แทนซอง JSON
            (ทุกช่องกัน CSV injection แล้ว)
          </li>
          <li>
            <strong>ส่งไม่ตรง method</strong> ที่ path นั้นรองรับ จะได้ 405 <code>method_not_allowed</code> พร้อม
            ส่วนหัว <code>Allow</code> บอกว่ารองรับอะไรบ้าง
          </li>
        </ul>
      </section>

      <section className={section}>
        <h2 className={h2}>รหัสข้อผิดพลาด</h2>
        <p className="text-sm text-neutral-700">
          แตกเงื่อนไขจาก <code>error.code</code> เสมอ อย่าอ่านจากข้อความ (ข้อความเปลี่ยนได้ รหัสไม่เปลี่ยน) ·
          รายการรหัสนี้ใช้ร่วมกันทั้งแพลตฟอร์ม จึงมีบางรหัสที่มาจากโมดูลอื่นเท่านั้นและกำกับไว้แล้ว
        </p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Code</th>
              <th className={th}>หมายความว่า</th>
            </tr>
          </thead>
          <tbody>
            {API_ERROR_CODES.map((code) => (
              <tr key={code}>
                <td className={td}>
                  <code>{code}</code>
                </td>
                <td className={td}>{ERROR_CODE_TH[code]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={section}>
        <h2 className={h2}>รายการ operation ทั้งหมด ({KANBAN_OPS.length})</h2>
        <p className="text-sm text-neutral-700">
          แบ่งตามชนิด (read / write / danger) แล้วแบ่งตามกลุ่มงาน · path ทุกเส้นต่อท้าย <code>{BASE_URL}</code> ·
          คอลัมน์ Scope คือ permission key ที่คีย์ต้องมี · ทุกแถวมาจากทะเบียนชุดเดียวกับ{" "}
          <code>/api/v1/kanban/openapi.json</code>
        </p>
        {(["read", "write", "danger"] as const).map((kind) => {
          const byDomain = grouped.get(kind)!;
          const domains = sortDomains([...byDomain.keys()]);
          const count = domains.reduce((n, d) => n + byDomain.get(d)!.length, 0);
          return (
            <div key={kind} className="flex flex-col gap-2 rounded-lg border p-4">
              <h3 className={h3}>
                {KIND_LABEL[kind]} ({count})
              </h3>
              <p className="text-xs text-neutral-500">{KIND_BLURB[kind]}</p>
              <table className={table}>
                <thead>
                  <tr>
                    <th className={th}>Operation</th>
                    <th className={th}>ทำอะไร</th>
                    <th className={th}>Method + path</th>
                    <th className={th}>Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {domains.map((domain) => (
                    <Fragment key={domain}>
                      <tr>
                        <th colSpan={4} className="border-b bg-neutral-50 py-1 pr-3 text-left text-xs font-semibold text-neutral-600">
                          {domainLabel(domain)} ({byDomain.get(domain)!.length})
                        </th>
                      </tr>
                      {byDomain.get(domain)!.map((op) => (
                        <tr key={op.id}>
                          <td className={td}>
                            <code>{op.id}</code>
                            {op.tool ? <span className={badge}>AI tool</span> : null}
                            {op.csv ? <span className={badge}>CSV</span> : null}
                          </td>
                          <td className={td}>{op.label}</td>
                          <td className={`${td} font-mono text-xs`}>
                            {op.method} {op.path}
                          </td>
                          <td className={`${td} font-mono text-xs`}>{op.action}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      <section className={section}>
        <h2 className={h2}>ตัวอย่างการเรียกจริง</h2>
        <p className="text-sm text-neutral-700">
          {RECIPES.length} สูตรที่ครอบงานที่ร้านใช้จริง ทุก path และทุกฟิลด์ด้านล่างมีอยู่จริงในทะเบียน —
          เปลี่ยน id ตัวอย่างเป็นค่าที่ได้จากคำขอก่อนหน้าของคุณ
        </p>
        {RECIPES.map((recipe, i) => (
          <div key={recipe.title} className="flex flex-col gap-2 rounded-lg border p-4">
            <h3 className={h3}>
              สูตรที่ {i + 1}: {recipe.title}
            </h3>
            <p className="text-xs text-neutral-500">
              ชุดสิทธิ์ที่พอ: <code>{recipe.scopes}</code> · Operations: <code>{recipe.opIds.join(", ")}</code>
            </p>
            {recipe.steps.map((step) => (
              <div key={step.comment} className="flex flex-col gap-1">
                <p className="text-sm text-neutral-700">{step.comment}</p>
                <pre className={codeBox}>
                  <code>{step.curl}</code>
                </pre>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className={section}>
        <h2 className={h2}>ผู้ช่วย AI</h2>
        <p className="text-sm text-neutral-700">
          {withTool.length} operation ที่มีป้าย <span className={badge}>AI tool</span> ในตารางด้านบน ถูกเผยแพร่เป็น
          manifest ของสกิล <code>tasks</code> ที่ <code>/api/v1/ai/skills/tasks</code> ด้วย — ผู้ช่วยภายนอก
          (Claude, GPT, Gemini หรือโฟลว์ n8n) จึงสั่งงานบอร์ดด้วยคีย์ของร้านได้ · เครื่องมือฝั่ง <strong>อ่าน</strong>{" "}
          ทำงานทันที ส่วน <strong>เขียน/อันตราย</strong> จะสร้างเป็น <strong>ข้อเสนอ</strong> ให้เจ้าของร้าน
          กดยืนยันในแอป SHARK ก่อน ถึงจะเปลี่ยนข้อมูลจริง · รูปแบบ manifest และวิธีเรียกอยู่ในคู่มือฉบับเต็ม{" "}
          <a className="underline" href="/developers/kanban.md">
            /developers/kanban.md
          </a>{" "}
          หัวข้อ &quot;AI agents&quot;
        </p>
      </section>

      <section className={section}>
        <h2 className={h2}>Webhooks</h2>
        <p className="text-sm text-neutral-700">
          เจ้าของร้านสมัคร URL ปลายทางให้ event ใดก็ได้ในตารางนี้ · แต่ละครั้งส่งเป็น <code>POST</code> พร้อมส่วนหัว{" "}
          <code>X-Shark-Event</code> และ <code>X-Shark-Signature</code> = HMAC-SHA256 ของ <strong>ไบต์ดิบ</strong>{" "}
          ทั้งก้อนด้วย secret ของปลายทาง (hex ตัวพิมพ์เล็ก) เนื้อคำขอเป็น <code>{"{ type, payload, sentAt }"}</code> ·
          ต้องตรวจลายเซ็นจากไบต์ดิบ <strong>ก่อน</strong> แปลง JSON · การส่งเป็นแบบ at-least-once (ลองซ้ำได้ 5 ครั้ง)
          ตัวรับจึงต้องทนของซ้ำ
        </p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Event</th>
              <th className={th}>ยิงเมื่อไหร่</th>
            </tr>
          </thead>
          <tbody>
            {kanbanEvents.map((e) => (
              <tr key={e.value}>
                <td className={td}>
                  <code>{e.value}</code>
                </td>
                <td className={td}>{e.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={section}>
        <h2 className={h2}>ศัพท์ไทย / อังกฤษ</h2>
        <p className="text-sm text-neutral-700">คำที่เจ้าของร้านใช้ เทียบกับชื่อฟิลด์ในสัญญา API (ภาษาอังกฤษ)</p>
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>ไทย</th>
              <th className={th}>English</th>
              <th className={th}>In the API</th>
            </tr>
          </thead>
          <tbody>
            {GLOSSARY.map(([thai, en, field]) => (
              <tr key={thai}>
                <td className={td}>{thai}</td>
                <td className={td}>{en}</td>
                <td className={`${td} font-mono text-xs`}>{field}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="border-t pt-4 text-xs text-neutral-500">
        หน้านี้ generate จากทะเบียน operation ของบอร์ดงาน · คู่มือฉบับเต็ม (ข้อความล้วน):{" "}
        <a className="underline" href="/developers/kanban.md">
          /developers/kanban.md
        </a>{" "}
        · สัญญาแบบเครื่องอ่าน:{" "}
        <a className="underline" href="/api/v1/kanban/openapi.json">
          /api/v1/kanban/openapi.json
        </a>{" "}
        · API บัญชี:{" "}
        <a className="underline" href="/developers/account">
          /developers/account
        </a>
      </footer>
    </main>
  );
}
