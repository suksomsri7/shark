// SVC B.13 — ด่านทรัพยากร "สูตรเดียว" (pure · ไม่อ่าน DB/นาฬิกา) · ใบสั่ง ledger/svc-briefs/svc-brief-b.13.md §4
// ใช้ร่วม: planner.ts (ตัววางคิว) · service.ts (findSlots/bookAppointment/ทางเดิม/เลื่อน/ปลุก) · queue-line.ts (walk-in/เริ่มงาน/ร้านเลื่อน) ·
//          resources.ts (IN_USE) — ห้ามมีสูตรที่สอง
//
// กติกา (§4):
//   1 ช่วงถือของงานบนทรัพยากร r = [start, ปลายบริการ + r.cleanupMin) · ครึ่งเปิด (ชนพอดีขอบ = ไม่ชน)
//   2 ความจุ: ทุกจุดเวลา จำนวนงานที่ถือ r ≤ r.capacity
//   3 ปิดซ่อม: ช่วงถือห้ามทับ block (รวมเวลาเก็บ)
//   4 เลือกชิ้น: ต่อชนิดตามลำดับที่บริการประกาศ · ชิ้นแรกตามลำดับ (rank ?? sortOrder, id) ที่ว่าง · หนึ่งชิ้นต่อชนิด · ชิ้นต่างกัน
// เวลาเป็น epoch ms ทั้งหมด

const MIN = 60_000;
/** ปลายช่วงปิดซ่อมแบบ "จนกว่าจะปลด" (endAt null) */
export const OPEN_END = Number.MAX_SAFE_INTEGER;

export type ResBlock = { startAt: number; endAt: number };
/** ทรัพยากรในมุมด่าน — rank = ลำดับจากฐาน (sortOrder, createdAt, id) ถ้ามี · ไม่มี ⇒ (sortOrder, id) */
export type GateResource = {
  id: string;
  kind: string;
  sortOrder: number;
  capacity: number;
  cleanupMin: number;
  blocks: readonly ResBlock[];
  rank?: number;
};
/** ช่วงที่งานหนึ่งถือทรัพยากรหนึ่ง (s..e รวมเวลาเก็บแล้ว) */
export type ResSpan = { jobId: string; s: number; e: number };

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** เรียงทรัพยากรตามลำดับเลือกชิ้น (คืนสำเนา · ไม่แก้ input) */
export function sortResources<R extends GateResource>(rs: readonly R[]): R[] {
  const ranked = rs.length > 0 && rs.every((r) => typeof r.rank === "number");
  return [...rs].sort((a, b) => (ranked ? (a.rank as number) - (b.rank as number) : 0) || a.sortOrder - b.sortOrder || cmpStr(a.id, b.id));
}

/** ชนิดที่บริการประกาศ (ไม่ซ้ำ · ลำดับเดิม) */
export function uniqKinds(kinds: readonly string[] | undefined | null): string[] {
  const out: string[] = [];
  for (const k of kinds ?? []) if (typeof k === "string" && k && !out.includes(k)) out.push(k);
  return out;
}

/**
 * สมุดการใช้ทรัพยากร (occupancy) — ช่วงถือต่อชิ้น เรียง s เสมอ
 * ตัวตรวจ "ว่างไหม" = ไม่ทับ block และจำนวนที่ซ้อนสูงสุดภายในช่วง < ความจุ
 */
export class ResBook {
  readonly list: GateResource[];
  private readonly byId = new Map<string, GateResource>();
  private readonly occ = new Map<string, ResSpan[]>();
  private readonly byKind = new Map<string, GateResource[]>();

  constructor(resources: readonly GateResource[]) {
    this.list = sortResources(resources).map((r) => ({ ...r, blocks: [...r.blocks].sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt) }));
    for (const r of this.list) {
      this.byId.set(r.id, r);
      this.occ.set(r.id, []);
      const xs = this.byKind.get(r.kind);
      if (xs) xs.push(r);
      else this.byKind.set(r.kind, [r]);
    }
  }

  get(id: string): GateResource | undefined {
    return this.byId.get(id);
  }
  ofKind(kind: string): readonly GateResource[] {
    return this.byKind.get(kind) ?? [];
  }
  hasKind(kind: string): boolean {
    return (this.byKind.get(kind)?.length ?? 0) > 0;
  }
  spans(id: string): readonly ResSpan[] {
    return this.occ.get(id) ?? [];
  }

  /** ช่วงถือของงานบน r: [start, endService + cleanup) */
  spanOf(r: GateResource, start: number, endService: number): { s: number; e: number } {
    return { s: start, e: endService + r.cleanupMin * MIN };
  }

  /** r ว่างสำหรับงาน [start, endService) (+ เวลาเก็บของ r) ไหม · ignore = jobId ที่ไม่นับ (เลื่อน/เริ่มตัวเอง) */
  free(r: GateResource, start: number, endService: number, ignore?: string | ((jobId: string) => boolean)): boolean {
    const skip = typeof ignore === "function" ? ignore : (j: string) => j === ignore;
    const { s, e } = this.spanOf(r, start, endService);
    for (const b of r.blocks) {
      if (b.startAt >= e) break;
      if (b.endAt > s) return false;
    }
    const xs = this.occ.get(r.id) ?? [];
    const hit: ResSpan[] = [];
    for (const u of xs) {
      if (u.s >= e) break;
      if (u.e > s && !skip(u.jobId)) hit.push(u);
    }
    if (hit.length < r.capacity) return true;
    if (r.capacity <= 1) return false;
    // จุดสูงสุดของการซ้อนอยู่ที่ s หรือจุดเริ่มของช่วงที่ซ้อนภายใน (s, e)
    const pts = [s];
    for (const u of hit) if (u.s > s) pts.push(u.s);
    for (const t of pts) {
      let n = 0;
      for (const u of hit) if (u.s <= t && u.e > t) n++;
      if (n >= r.capacity) return false;
    }
    return true;
  }

  /**
   * เลือกชิ้นครบทุกชนิด (กติกา 4) สำหรับงาน [start, endService) · fixed = ชิ้นที่ต้องใช้ต่อชนิด (ข้อเท็จจริงของนัด) — ไม่ว่าง ⇒ null
   * คืน id ตามลำดับชนิด · ชนิดใดไม่มีชิ้นว่าง ⇒ null
   */
  pick(kinds: readonly string[], start: number, endService: number, opts?: { ignore?: string | ((jobId: string) => boolean); fixed?: ReadonlyMap<string, string>; prefer?: readonly string[] }): string[] | null {
    const out: string[] = [];
    for (const kind of kinds) {
      const want = opts?.fixed?.get(kind);
      if (want !== undefined) {
        const r = this.byId.get(want);
        if (!r || out.includes(r.id) || !this.free(r, start, endService, opts?.ignore)) return null;
        out.push(r.id);
        continue;
      }
      const pref = opts?.prefer?.map((id) => this.byId.get(id)).find((r) => !!r && r.kind === kind && !out.includes(r.id) && this.free(r, start, endService, opts?.ignore));
      const r = pref ?? this.ofKind(kind).find((x) => !out.includes(x.id) && this.free(x, start, endService, opts?.ignore));
      if (!r) return null;
      out.push(r.id);
    }
    return out;
  }

  /** ลงช่วงถือ (ไม่ตรวจ — ข้อเท็จจริงลงได้แม้ล้น) */
  add(id: string, jobId: string, start: number, endService: number): void {
    const r = this.byId.get(id);
    const xs = this.occ.get(id);
    if (!r || !xs) return;
    const { s, e } = this.spanOf(r, start, endService);
    let k = xs.length;
    while (k > 0 && (xs[k - 1].s > s || (xs[k - 1].s === s && cmpStr(xs[k - 1].jobId, jobId) > 0))) k--;
    xs.splice(k, 0, { jobId, s, e });
  }

  /** เอาช่วงถือของงานออก (ทุกชิ้น) */
  remove(jobId: string): void {
    for (const xs of this.occ.values()) {
      for (let k = xs.length - 1; k >= 0; k--) if (xs[k].jobId === jobId) xs.splice(k, 1);
    }
  }

  /** จุดที่ทรัพยากรของชนิดเหล่านี้ "เพิ่งว่าง" (ปลายช่วงถือ · ปลาย block) หลัง lower — จุดผู้สมัครของการค้นต่อเนื่อง (§4 ข้อ 5ค) */
  releasePoints(kinds: readonly string[], lower: number): number[] {
    const pts: number[] = [];
    for (const kind of kinds) {
      for (const r of this.ofKind(kind)) {
        for (const u of this.occ.get(r.id) ?? []) if (u.e > lower) pts.push(u.e);
        for (const b of r.blocks) if (b.endAt > lower && b.endAt < OPEN_END) pts.push(b.endAt);
      }
    }
    pts.sort((a, b) => a - b);
    const out: number[] = [];
    for (const t of pts) if (out[out.length - 1] !== t) out.push(t);
    return out;
  }
}

/** ชิ้นที่ให้มา (ข้อเท็จจริง) ที่ใช้ได้ต่อชนิด: มีจริง · ชนิดตรง · ไม่ซ้ำ — คืน Map ชนิด → id */
export function factsByKind(book: ResBook, kinds: readonly string[], ids: readonly string[] | undefined | null): Map<string, string> {
  const m = new Map<string, string>();
  const used = new Set<string>();
  for (const kind of kinds) {
    const id = (ids ?? []).find((x) => !used.has(x) && book.get(x)?.kind === kind);
    if (id !== undefined) {
      m.set(kind, id);
      used.add(id);
    }
  }
  return m;
}
