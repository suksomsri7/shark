// use-barcode-index.ts — ดัชนีบาร์โค้ดของหน้าขายในหน่วยความจำ (POS P5.3 fix1 · CD-P53-O14 · W-next-6 "barcode < 100 ms บนทาง client")
// POS P5.3 fix1 ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   • Map<บาร์โค้ด, RegisterProduct> ใน ref ต่อ {systemId, unitId} — ไม่มี IndexedDB / storage / service worker · เปลี่ยนสาขา = ล้างแล้วดึงใหม่
//   • ดึงหลัง mount เป็นงานเบื้องหลัง (setTimeout 0 หลังกริดแรกวาดแล้ว — ไม่ขวาง TTI) · ทุก 15 นาทีขณะออนไลน์ (REGISTER_BARCODE_INDEX_TTL_MS) ·
//     window focus เมื่อเก่ากว่า 60 วิ · กลับมาออนไลน์เมื่อเก่ากว่า TTL · เซิร์ฟเวอร์ตอบ one ให้รหัสที่ดัชนีไม่มี/ไม่ตรง ⇒ ดึงใหม่ครั้งเดียว (หน่วง) ·
//     ขอบ priceValidUntil ⇒ ดึงชุดเต็ม (ไม่ส่ง knownVersion) · ส่ง knownVersion เสมอในรอบปกติ (ไม่เปลี่ยน = ไม่มี payload)
//   • lookup คืนสินค้าเฉพาะเมื่อ: ออนไลน์ · มีชุดแล้ว · ไม่ truncated · ยังไม่ถึงขอบราคา · อายุ ≤ 2×TTL — นอกนั้น null (จอใช้ทางเซิร์ฟเวอร์เดิม)
// 🔴 ไม่ import โมดูลฝั่งเซิร์ฟเวอร์: ผู้เรียกส่งตัวดึง (load) มาเอง (RegisterScreen → registerBarcodeIndexAction)
// ⚠️ server action ของ Next ส่งทีละคำขอต่อ client — ระหว่างดึงชุดเต็ม สแกนที่ไม่เจอในดัชนี (ทางเซิร์ฟเวอร์) รอคิวหลังคำขอนี้
import { useCallback, useEffect, useRef } from "react";
import { REGISTER_BARCODE_INDEX_TTL_MS, type RegisterBarcodeIndexResult, type RegisterProduct } from "@/lib/modules/pos/register-shared";

export type BarcodeIndexOpts = {
  systemId: string;
  unitId: string;
  online: boolean;
  /** ตัวดึงดัชนี (server action) — knownVersion null = ขอชุดเต็ม */
  load: (knownVersion: string | null) => Promise<RegisterBarcodeIndexResult>;
};
export type BarcodeIndex = {
  /** สินค้าของรหัสนี้จากดัชนี (ตัดช่องว่างหัวท้ายแบบ registerScan) · ใช้ไม่ได้/ไม่มี = null */
  lookup: (code: string) => RegisterProduct | null;
  /** ผลสแกนทางเซิร์ฟเวอร์เป็น one (ไม่ใช่ป้ายชั่ง) — ดัชนีไม่มีรหัสนี้หรือสินค้าไม่ตรง ⇒ ดัชนีเก่า ดึงใหม่ครั้งเดียว (หน่วง) */
  noteServerOne: (code: string, product: RegisterProduct) => void;
};

const FOCUS_STALE_MS = 60_000;
const MAX_AGE_MS = 2 * REGISTER_BARCODE_INDEX_TTL_MS;
const STALE_DEBOUNCE_MS = 1_500;
const EDGE_MIN_WAIT_MS = 15_000;
const EDGE_MAX_WAIT_MS = 3_600_000;

type IndexState = { scope: string; map: Map<string, RegisterProduct>; version: string | null; fetchedAt: number; truncated: boolean; edgeMs: number | null };
const emptyState = (scope: string): IndexState => ({ scope, map: new Map(), version: null, fetchedAt: 0, truncated: false, edgeMs: null });

export function useBarcodeIndex(o: BarcodeIndexOpts): BarcodeIndex {
  const { systemId, unitId, online } = o;
  const scope = `${systemId}:${unitId}`;
  const st = useRef<IndexState>(emptyState(scope));
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const loadRef = useRef(o.load);
  loadRef.current = o.load;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const inflight = useRef(false);
  /** มีคำขอซ้อนระหว่างดึง: "full" = ต้องชุดเต็ม · "check" = ส่ง knownVersion · null = ไม่มี */
  const queued = useRef<"full" | "check" | null>(null);
  /** รหัสที่สั่งดึงใหม่ไปแล้วในชุดนี้ (กันวนเมื่อเซิร์ฟเวอร์ตอบ one ให้รหัสที่ตั้งใจไม่อยู่ในดัชนี เช่นแม่+ลูกใช้รหัสเดียวกัน) */
  const staleTried = useRef(new Set<string>());
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (full: boolean) => {
    if (inflight.current) {
      queued.current = full || queued.current === "full" ? "full" : "check";
      return;
    }
    inflight.current = true;
    const mine = st.current.scope;
    try {
      const r = await loadRef.current(full ? null : st.current.version);
      if (st.current.scope !== mine) return; // เปลี่ยนสาขาระหว่างรอ = ทิ้ง
      if (!r.ok) {
        st.current = { ...emptyState(mine), fetchedAt: Date.now() }; // ปฏิเสธ (สิทธิ์/ขอบเขต) = ไม่ใช้ดัชนี — ทางเซิร์ฟเวอร์ตัดสินเอง
        return;
      }
      if (r.unchanged === true) {
        if (r.version === st.current.version) st.current = { ...st.current, fetchedAt: Date.now() };
        return;
      }
      const map = new Map<string, RegisterProduct>();
      if (!r.truncated) for (const it of r.items) map.set(it.barcode, it.product);
      const edge = r.priceValidUntil ? Date.parse(r.priceValidUntil) : NaN;
      st.current = { scope: mine, map, version: r.version, fetchedAt: Date.now(), truncated: r.truncated, edgeMs: Number.isFinite(edge) ? edge : null };
      staleTried.current.clear();
      if (edgeTimer.current) clearTimeout(edgeTimer.current);
      edgeTimer.current = Number.isFinite(edge)
        ? setTimeout(() => void refresh(true), Math.min(Math.max(edge - Date.now(), EDGE_MIN_WAIT_MS), EDGE_MAX_WAIT_MS))
        : null;
    } catch {
      /* เครือข่าย/เซิร์ฟเวอร์ล้ม — คงชุดเดิม (lookup ยังคุมอายุ/ขอบราคา) รอรอบถัดไป */
    } finally {
      inflight.current = false;
      const next = queued.current;
      queued.current = null;
      if (next && st.current.scope === scopeRef.current) void refresh(next === "full");
    }
  }, []);

  // ── เปลี่ยนสาขา/เปิดหน้า: ล้าง แล้วดึงชุดเต็มเป็นงานเบื้องหลังหลังวาดแรก · รอบ 15 นาที · focus ──
  useEffect(() => {
    st.current = emptyState(scope);
    staleTried.current.clear();
    const first = setTimeout(() => {
      if (onlineRef.current) void refresh(true);
    }, 0);
    const tick = setInterval(() => {
      if (onlineRef.current) void refresh(false);
    }, REGISTER_BARCODE_INDEX_TTL_MS);
    const onFocus = () => {
      if (onlineRef.current && Date.now() - st.current.fetchedAt > FOCUS_STALE_MS) void refresh(!st.current.version);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      window.removeEventListener("focus", onFocus);
      if (edgeTimer.current) clearTimeout(edgeTimer.current);
      if (staleTimer.current) clearTimeout(staleTimer.current);
      edgeTimer.current = null;
      staleTimer.current = null;
    };
  }, [scope, refresh]);

  // ── กลับมาออนไลน์: ยังไม่มีชุด หรือเก่ากว่า TTL = ดึง ──
  useEffect(() => {
    if (!online || st.current.fetchedAt === 0) return; // ครั้งแรกเป็นของ effect ด้านบน
    if (!st.current.version || Date.now() - st.current.fetchedAt > REGISTER_BARCODE_INDEX_TTL_MS) void refresh(!st.current.version);
  }, [online, refresh]);

  const lookup = useCallback(
    (code: string): RegisterProduct | null => {
      const s = st.current;
      if (!onlineRef.current || !s.version || s.truncated || s.scope !== scopeRef.current) return null;
      const now = Date.now();
      if (s.edgeMs !== null && now >= s.edgeMs) {
        void refresh(true); // ถึงขอบหน้าต่างโปรแล้ว — ราคาในชุดอาจไม่ใช่ราคาตอนนี้
        return null;
      }
      if (now - s.fetchedAt > MAX_AGE_MS) {
        void refresh(false);
        return null;
      }
      return s.map.get(code.trim()) ?? null;
    },
    [refresh],
  );

  const noteServerOne = useCallback(
    (code: string, product: RegisterProduct) => {
      const s = st.current;
      if (!s.version || s.truncated || s.scope !== scopeRef.current) return;
      const key = code.trim();
      const cached = s.map.get(key);
      if (cached && JSON.stringify(cached) === JSON.stringify(product)) return;
      if (staleTried.current.has(key)) return;
      staleTried.current.add(key);
      if (staleTimer.current) clearTimeout(staleTimer.current);
      staleTimer.current = setTimeout(() => {
        staleTimer.current = null;
        if (onlineRef.current) void refresh(false);
      }, STALE_DEBOUNCE_MS);
    },
    [refresh],
  );

  return { lookup, noteServerOne };
}
