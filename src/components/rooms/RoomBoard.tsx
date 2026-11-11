"use client";
// SVC R0.9 ▸ ผังห้องร่วม (หอ/โรงแรม) — สัญญา ledger/svc-briefs/svc-brief-r0.9.md §4 · ภาพ ledger/design-dorm/01-floorplan.png (ส่วนผัง)
//   • ข้อมูลมาจาก roomBoard (แกนห้อง) ผ่านผู้เรียก — ไฟล์นี้ import จาก rooms ได้เฉพาะ type (ไม่ลาก prisma/โมดูลฝั่ง server)
//   • ไม่ใช้ hook ของ Next (render นอก router ได้) · ลิงก์ใช้ <a> ธรรมดา · ตัวกรอง/มุมมองเป็น state ภายใน
//   • ผังไม่รู้เรื่องเงิน: ป้ายการเงินเป็นข้อความที่ผู้เรียกส่งมา (finance[roomId].text) — ไม่คำนวณ/จัดรูปเงินเอง
//   • สถานะสื่อด้วย "รูปทรง + ข้อความ" (data-shape + ป้าย) ไม่พึ่งสีอย่างเดียว · ปุ่ม/ช่องกรอก ≥44px · มือถือไม่ล้นแนวนอน
//   • ไม่มีปุ่ม/ข้อความบังคับผู้เช่าใด ๆ (ข้อห้าม สคบ.) — ผังมีไว้ดูสถานะและเปิดหน้าห้องเท่านั้น
import { useMemo, useState } from "react";
import type { RoomBoardCell } from "@/lib/modules/rooms";

export type RoomStatus = "VACANT" | "LEASED" | "GUEST" | "HOLD" | "BOOKED" | "REPAIR";
export type RoomBoardFinance = { tone: "overdue" | "pending" | "unpaid" | "paid"; text: string };
type FinanceTone = RoomBoardFinance["tone"];
type Shape = "dashed" | "solid" | "filled" | "double" | "tinted" | "hatched";

export type RoomBoardProps = {
  cells: RoomBoardCell[];
  /** วันของผัง "YYYY-MM-DD" (วันไทย) */
  date: string;
  /** ลำดับกลุ่มอาคาร */
  buildings?: { id: string; name: string }[];
  /** roomId → ชื่อผู้เช่า/แขก (ผู้เรียกเติม) */
  occupantLabels?: Record<string, string>;
  /** roomId → ป้ายการเงิน (ผู้เรียกเติม) */
  finance?: Record<string, RoomBoardFinance>;
  /** "…/{roomId}" ⇒ ช่องเป็นลิงก์ */
  hrefTemplate?: string;
  initialView?: "floor" | "list";
  initialFilter?: { status?: RoomStatus | "ALL"; q?: string; finance?: FinanceTone };
  /** ห้องว่างที่มีผู้เข้าภายในกี่วัน ⇒ "จอง" (ค่าปริยาย 31) */
  bookedWithinDays?: number;
  /** คำในหัวกลุ่ม (ค่าปริยาย "มีผู้เช่า") */
  occupiedLabel?: string;
};

// ───────────────────────── สัญญาสถานะ (ป้าย + รูปทรง · ตายตัว) ─────────────────────────
const STATUS_ORDER: RoomStatus[] = ["LEASED", "GUEST", "HOLD", "BOOKED", "VACANT", "REPAIR"];
const STATUS: Record<RoomStatus, { label: string; shape: Shape }> = {
  LEASED: { label: "มีผู้เช่า", shape: "solid" },
  GUEST: { label: "มีแขก", shape: "filled" },
  HOLD: { label: "ถือไว้", shape: "double" },
  BOOKED: { label: "จอง", shape: "tinted" },
  VACANT: { label: "ว่าง", shape: "dashed" },
  REPAIR: { label: "ปิดซ่อม", shape: "hatched" },
};
const HK_TEXT: Record<string, string> = { DIRTY: "รอทำ", INSPECTED: "ตรวจแล้ว", OUT_OF_ORDER: "ปิดซ่อม" };
const FIN_ORDER: FinanceTone[] = ["overdue", "pending", "unpaid", "paid"];
const FIN_LABEL: Record<FinanceTone, string> = { overdue: "ค้างจ่ายเกินกำหนด", pending: "สลิปรอตรวจ", unpaid: "ยังไม่จ่าย", paid: "จ่ายแล้ว" };
const BOOKABLE_NEXT = ["LEASE", "STAY", "HOLD", "CHANNEL_HOLD"];

// รูปทรงของกรอบ — ต่างกันที่เส้น/พื้น/ลาย (อ่านออกแม้ไม่เห็นสี)
const SHAPE_STYLE: Record<Shape, React.CSSProperties> = {
  solid: { border: "1.5px solid var(--color-ink)", background: "var(--color-surface)" },
  filled: { border: "1.5px solid var(--color-ink)", background: "var(--color-wall)" },
  double: { border: "4px double var(--color-ink)", background: "var(--color-surface)" },
  tinted: { border: "1.5px solid var(--color-accent)", background: "var(--color-accent-soft)" },
  dashed: { border: "1.5px dashed var(--color-line)", background: "var(--color-surface)", color: "var(--color-muted)" },
  hatched: {
    border: "1.5px solid var(--color-line)",
    color: "var(--color-muted)",
    background: "repeating-linear-gradient(135deg, var(--color-surface) 0 7px, var(--color-surface-2, #f4f4f5) 7px 14px)",
  },
};
const ALERT_STYLE: React.CSSProperties = { borderColor: "var(--color-danger)", boxShadow: "0 0 0 2px var(--color-surface), 0 0 0 3.5px var(--color-danger)" };

// ───────────────────────── วันที่ (จากสตริง YYYY-MM-DD เท่านั้น) ─────────────────────────
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
function thShort(ymd: string): string {
  const m = YMD.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] ?? ""}`.trim();
}
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? Number.POSITIVE_INFINITY : Math.round((b - a) / 86_400_000);
}

// ───────────────────────── สถานะที่แสดง ─────────────────────────
type View = {
  cell: RoomBoardCell;
  status: RoomStatus;
  detail: string; // "เข้า 15 พ.ย." ของห้องจอง
  hkText: string; // ข้อความแม่บ้าน (เมื่อไม่ใช่ CLEAN และไม่ใช่ปิดซ่อม)
  name: string;
  fin: RoomBoardFinance | null;
};

function statusOf(c: RoomBoardCell, date: string, within: number): { status: RoomStatus; detail: string } {
  if (c.use === "LEASED") return { status: "LEASED", detail: "" };
  if (c.use === "GUEST") return { status: "GUEST", detail: "" };
  if (c.use === "HOLD") return { status: "HOLD", detail: "" };
  if (c.use === "BLOCKED") return { status: "REPAIR", detail: "" };
  // ว่างวันนี้ — hkStatus เป็นแหล่งความจริงของสภาพห้อง (ไม่ใช้ status เดิม)
  if (c.hkStatus === "OUT_OF_ORDER") return { status: "REPAIR", detail: "" };
  const n = c.next;
  if (n && BOOKABLE_NEXT.includes(n.kind)) {
    const d = daysBetween(date, n.startDate);
    if (d > 0 && d <= within) return { status: "BOOKED", detail: `เข้า ${thShort(n.startDate)}` };
  }
  return { status: "VACANT", detail: "" };
}

const byNumber = (a: View, b: View) => a.cell.number.localeCompare(b.cell.number, "th", { numeric: true });

type Group = { key: string; title: string; views: View[]; occupied: number; total: number };

function groupViews(all: View[], shown: View[], buildings: { id: string; name: string }[]): Group[] {
  const bIndex = new Map(buildings.map((b, i) => [b.id, i]));
  const bName = new Map(buildings.map((b) => [b.id, b.name]));
  const ids = new Set(all.map((v) => v.cell.buildingId).filter((x): x is string => !!x));
  const multi = ids.size > 1 || buildings.length > 1;
  const keyOf = (c: RoomBoardCell) => `${c.buildingId ?? "-"}|${c.floorNo ?? "-"}`;
  const meta = new Map<string, { rank: [number, string, number]; title: string }>();
  for (const v of all) {
    const c = v.cell;
    const k = keyOf(c);
    if (meta.has(k)) continue;
    if (!c.buildingId && c.floorNo === null) {
      meta.set(k, { rank: [Number.MAX_SAFE_INTEGER, "", 0], title: "ไม่ระบุ" });
      continue;
    }
    const bi = c.buildingId ? (bIndex.get(c.buildingId) ?? buildings.length) : buildings.length + 1;
    const bn = c.buildingId ? (bName.get(c.buildingId) ?? "อาคาร") : "";
    const floor = c.floorNo === null ? "ไม่ระบุชั้น" : `ชั้น ${c.floorNo}`;
    meta.set(k, { rank: [bi, bn, c.floorNo ?? Number.MAX_SAFE_INTEGER], title: multi && bn ? `${bn} · ${floor}` : floor });
  }
  const groups = new Map<string, Group>();
  for (const v of all) {
    const k = keyOf(v.cell);
    const g = groups.get(k) ?? { key: k, title: meta.get(k)?.title ?? "ไม่ระบุ", views: [], occupied: 0, total: 0 };
    g.total++;
    if (v.status === "LEASED" || v.status === "GUEST") g.occupied++;
    groups.set(k, g);
  }
  const shownSet = new Set(shown.map((v) => v.cell.roomId));
  for (const v of all) if (shownSet.has(v.cell.roomId)) groups.get(keyOf(v.cell))?.views.push(v);
  const rank = (k: string) => meta.get(k)?.rank ?? [Number.MAX_SAFE_INTEGER, "", 0];
  return [...groups.values()]
    .filter((g) => g.views.length > 0)
    .map((g) => ({ ...g, views: g.views.sort(byNumber) }))
    .sort((a, b) => {
      const ra = rank(a.key);
      const rb = rank(b.key);
      if (ra[0] !== rb[0]) return ra[0] - rb[0];
      if (ra[1] !== rb[1]) return ra[1].localeCompare(rb[1], "th");
      return ra[2] - rb[2];
    });
}

// ───────────────────────── คอมโพเนนต์ ─────────────────────────
export function RoomBoard({
  cells,
  date,
  buildings = [],
  occupantLabels,
  finance,
  hrefTemplate,
  initialView = "floor",
  initialFilter,
  bookedWithinDays = 31,
  occupiedLabel = "มีผู้เช่า",
}: RoomBoardProps) {
  const [view, setView] = useState<"floor" | "list">(initialView === "list" ? "list" : "floor");
  const [status, setStatus] = useState<RoomStatus | "ALL">(initialFilter?.status ?? "ALL");
  const [q, setQ] = useState(initialFilter?.q ?? "");
  const [finTone, setFinTone] = useState<FinanceTone | "ALL">(initialFilter?.finance ?? "ALL");

  const views = useMemo<View[]>(
    () =>
      cells.map((cell) => {
        const s = statusOf(cell, date, bookedWithinDays);
        const hk = s.status !== "REPAIR" ? (HK_TEXT[cell.hkStatus] ?? "") : "";
        return { cell, status: s.status, detail: s.detail, hkText: hk, name: occupantLabels?.[cell.roomId] ?? "", fin: finance?.[cell.roomId] ?? null };
      }),
    [cells, date, bookedWithinDays, occupantLabels, finance],
  );

  const counts = useMemo(() => {
    const c: Record<RoomStatus, number> = { VACANT: 0, LEASED: 0, GUEST: 0, HOLD: 0, BOOKED: 0, REPAIR: 0 };
    for (const v of views) c[v.status]++;
    return c;
  }, [views]);

  const needle = q.trim().toLowerCase();
  const shown = views.filter(
    (v) =>
      (status === "ALL" || v.status === status) &&
      (finTone === "ALL" || v.fin?.tone === finTone) &&
      (!needle || v.cell.number.toLowerCase().includes(needle) || v.name.toLowerCase().includes(needle)),
  );
  const hasFinance = !!finance && Object.keys(finance).length > 0;
  const hrefOf = (roomId: string) => (hrefTemplate ? hrefTemplate.split("{roomId}").join(encodeURIComponent(roomId)) : undefined);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* ตัวควบคุม: มุมมอง · ค้นหา · ตัวกรอง */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border p-1" role="group" aria-label="มุมมองผังห้อง" style={{ background: "var(--color-surface-2, #f4f4f5)" }}>
          {(
            [
              ["floor", "ตามชั้น"],
              ["list", "รายการ"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={view === k}
              onClick={() => setView(k)}
              className="min-h-[44px] rounded-lg px-4 text-sm"
              style={view === k ? { background: "var(--color-surface)", fontWeight: 600, boxShadow: "0 1px 2px rgb(0 0 0 / 0.08)" } : { color: "var(--color-muted)" }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นห้อง / ชื่อ"
          aria-label="ค้นห้องหรือชื่อ"
          className="input min-h-[44px] w-full min-w-0 sm:w-56"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as RoomStatus | "ALL")}
          aria-label="กรองตามสถานะห้อง"
          className="input min-h-[44px] w-auto"
        >
          <option value="ALL">ทุกสถานะ ({views.length})</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label} ({counts[s]})
            </option>
          ))}
        </select>
        {hasFinance && (
          <select value={finTone} onChange={(e) => setFinTone(e.target.value as FinanceTone | "ALL")} aria-label="กรองตามการเงิน" className="input min-h-[44px] w-auto">
            <option value="ALL">การเงินทั้งหมด</option>
            {FIN_ORDER.map((t) => (
              <option key={t} value={t}>
                {FIN_LABEL[t]}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* คำอธิบายสัญลักษณ์ — รูปทรง + คำ */}
      <div data-legend="true" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" style={{ color: "var(--color-ink-soft)" }}>
        {STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3.5 w-5 rounded" style={{ ...SHAPE_STYLE[STATUS[s].shape], borderWidth: STATUS[s].shape === "double" ? 3 : 1.5 }} />
            {STATUS[s].label}
          </span>
        ))}
        {hasFinance && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3.5 w-5 rounded" style={{ border: "1.5px solid var(--color-danger)", ...ALERT_STYLE }} />
            {FIN_LABEL.overdue}
          </span>
        )}
      </div>

      <div data-view={view} className="flex min-w-0 flex-col gap-5">
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ color: "var(--color-muted)" }}>
            ไม่พบห้อง
          </p>
        ) : view === "floor" ? (
          groupViews(views, shown, buildings).map((g) => (
            <section key={g.key} data-floor-group={g.key} className="flex min-w-0 flex-col gap-2">
              <h3 className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-semibold">{g.title}</span>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {`${occupiedLabel} ${g.occupied}/${g.total}`}
                </span>
              </h3>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(96px, 100%), 1fr))" }}>
                {g.views.map((v) => (
                  <Cell key={v.cell.roomId} v={v} href={hrefOf(v.cell.roomId)} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border">
            {[...shown].sort(byNumber).map((v) => (
              <Row key={v.cell.roomId} v={v} href={hrefOf(v.cell.roomId)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function dataAttrs(v: View) {
  return {
    "data-room-id": v.cell.roomId,
    "data-room-number": v.cell.number,
    "data-status": v.status,
    "data-shape": STATUS[v.status].shape,
    "data-hk": v.cell.hkStatus,
    ...(v.fin ? { "data-finance": v.fin.tone } : {}),
    ...(v.fin?.tone === "overdue" ? { "data-alert": "true" } : {}),
  };
}

function statusLine(v: View): string {
  return [STATUS[v.status].label, v.detail, v.hkText].filter(Boolean).join(" · ");
}

function finColor(t: FinanceTone): string {
  return t === "overdue" ? "var(--color-danger)" : t === "pending" ? "var(--color-accent)" : t === "paid" ? "var(--color-ink)" : "var(--color-muted)";
}

function Cell({ v, href }: { v: View; href?: string }) {
  const style: React.CSSProperties = { ...SHAPE_STYLE[STATUS[v.status].shape], ...(v.fin?.tone === "overdue" ? ALERT_STYLE : {}) };
  const body = (
    <>
      <span className="flex items-start justify-between gap-1">
        <span className="text-base font-bold leading-tight" style={{ color: v.status === "VACANT" || v.status === "REPAIR" ? "var(--color-muted)" : "var(--color-ink)" }}>
          {v.cell.number}
        </span>
        {(v.fin?.tone === "overdue" || v.fin?.tone === "pending") && (
          <span aria-hidden="true" className="mt-1 inline-block h-2 w-2 rounded-full" style={{ background: finColor(v.fin.tone) }} />
        )}
      </span>
      {v.name && <span className="truncate text-xs" style={{ color: "var(--color-ink-soft)" }}>{v.name}</span>}
      <span className="mt-auto flex flex-col gap-0.5 text-[11px] leading-snug">
        <span style={{ color: v.status === "BOOKED" ? "var(--color-accent)" : "var(--color-muted)", fontWeight: v.status === "BOOKED" ? 600 : 400 }}>{statusLine(v)}</span>
        {v.fin && (
          <span className="font-semibold" style={{ color: finColor(v.fin.tone) }}>
            {v.fin.text}
          </span>
        )}
      </span>
    </>
  );
  const cls = "flex min-h-[96px] min-w-0 flex-col gap-1 rounded-xl p-2.5 text-left";
  const label = `ห้อง ${v.cell.number} · ${statusLine(v)}`;
  return href ? (
    <a {...dataAttrs(v)} href={href} className={`${cls} hover:opacity-90`} style={style} aria-label={label}>
      {body}
    </a>
  ) : (
    <div {...dataAttrs(v)} className={cls} style={style} aria-label={label}>
      {body}
    </div>
  );
}

function Row({ v, href }: { v: View; href?: string }) {
  const shape = SHAPE_STYLE[STATUS[v.status].shape];
  const body = (
    <>
      <span aria-hidden="true" className="inline-block h-5 w-5 shrink-0 rounded" style={{ ...shape, borderWidth: STATUS[v.status].shape === "double" ? 3 : 1.5 }} />
      <span className="w-14 shrink-0 font-bold">{v.cell.number}</span>
      <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--color-ink-soft)" }}>
        {v.name || "—"}
      </span>
      <span className="shrink-0 text-xs" style={{ color: v.status === "BOOKED" ? "var(--color-accent)" : "var(--color-muted)" }}>
        {statusLine(v)}
      </span>
      {v.fin && (
        <span className="shrink-0 text-xs font-semibold" style={{ color: finColor(v.fin.tone), ...(v.fin.tone === "overdue" ? { border: "1.5px solid var(--color-danger)", borderRadius: 6, padding: "1px 6px" } : {}) }}>
          {v.fin.text}
        </span>
      )}
    </>
  );
  const cls = "flex min-h-[48px] min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0";
  return href ? (
    <a {...dataAttrs(v)} href={href} className={`${cls} hover:opacity-90`}>
      {body}
    </a>
  ) : (
    <div {...dataAttrs(v)} className={cls}>
      {body}
    </div>
  );
}

export default RoomBoard;
