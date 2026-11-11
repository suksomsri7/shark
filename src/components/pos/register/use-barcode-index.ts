// use-barcode-index.ts — ดัชนีบาร์โค้ดของหน้าขายในหน่วยความจำ (POS P5.3 fix1 · CD-P53-O14 · W-next-6 "barcode < 100 ms บนทาง client")
// POS P5.3 fix1 ▸ ไฟล์ใหม่ทั้งไฟล์ ◂ · POS P5.3 fix1b ▸ CD-P53-O14b loading() ◂ · POS P5.3 fix1c ▸ CD-P53-O15 (F1–F7) ◂
//   • Map<บาร์โค้ด, RegisterProduct> ใน ref ต่อ {systemId, unitId} — ไม่มี IndexedDB / storage / service worker · เปลี่ยนสาขา = ล้างแล้วดึงใหม่
//   • fix1c F1: ดึงผ่าน GET REGISTER_BARCODE_INDEX_PATH (fetch · cache "no-store" · If-None-Match "<version>" → 304) — ไม่ใช่ server action
//     (Next ส่ง action ทีละคำขอต่อ client · route วิ่งขนานกับ quote/submit) · ไม่เริ่มดึงระหว่างกล่องชำระ/จบการขายเปิด (paused()) — เลื่อนไปทำหลังปิด
//   • ดึงหลัง mount เป็นงานเบื้องหลัง (setTimeout 0 หลังกริดแรกวาดแล้ว — ไม่ขวาง TTI) · ทุก 15 นาทีขณะออนไลน์ (REGISTER_BARCODE_INDEX_TTL_MS) ·
//     window focus เมื่อเก่ากว่า 60 วิ · กลับมาออนไลน์/ออนไลน์แต่ยังไม่มีชุด (F4) · เซิร์ฟเวอร์ตอบ one ที่ฟิลด์ตัดสินต่างจากในชุด / รหัสที่ชุดไม่มี ⇒ ดึงใหม่ครั้งเดียว (หน่วง) ·
//     รหัสใน excluded หรือที่ดึงใหม่แล้วยังไม่อยู่ = "ทางเซิร์ฟเวอร์เท่านั้น" ตลอดสาขานี้ (F2) · ขอบ priceValidUntil เทียบนาฬิกาเซิร์ฟเวอร์ (serverNow · F3) ⇒ ดึงชุดเต็ม ·
//     quote ปฏิเสธบรรทัดสินค้า ⇒ invalidate() (F7) · 429 = ลองใหม่ตาม Retry-After
//   • lookup คืนสินค้าเฉพาะเมื่อ: ออนไลน์ · มีชุดแล้ว · ไม่ truncated · ยังไม่ถึงขอบราคา (เวลาเซิร์ฟเวอร์) · อายุ ≤ 2×TTL — นอกนั้น null (จอใช้ทางเซิร์ฟเวอร์เดิม)
// 🔴 ไม่ import โมดูลฝั่งเซิร์ฟเวอร์ (register-shared = ชนิด/ค่าคงที่ล้วน)
import { useCallback, useEffect, useRef } from "react";
import { REGISTER_BARCODE_INDEX_PATH, REGISTER_BARCODE_INDEX_TTL_MS, type RegisterBarcodeIndexResult, type RegisterProduct } from "@/lib/modules/pos/register-shared";

export type BarcodeIndexOpts = {
  systemId: string;
  unitId: string;
  online: boolean;
  /** POS P5.3 fix1c ▸ F1: true = กล่องชำระ/จบการขายเปิดอยู่ — ไม่เริ่มดึง (เลื่อนไปหลังปิด) ◂ */
  paused: () => boolean;
};
export type BarcodeIndex = {
  /** สินค้าของรหัสนี้จากดัชนี (ตัดช่องว่างหัวท้ายแบบ registerScan) · ใช้ไม่ได้/ไม่มี = null */
  lookup: (code: string) => RegisterProduct | null;
  /** ผลสแกนทางเซิร์ฟเวอร์เป็น one (ไม่ใช่ป้ายชั่ง) — ดัชนีไม่มีรหัสนี้หรือฟิลด์ตัดสินไม่ตรง ⇒ ดัชนีเก่า ดึงใหม่ครั้งเดียว (หน่วง) */
  noteServerOne: (code: string, product: RegisterProduct) => void;
  /** POS P5.3 fix1b ▸ CD-P53-O14b: ยังไม่มีชุดที่ใช้ได้และกำลังดึงอยู่ = promise ของคำขอนั้น (resolve เมื่อจบ · ไม่ reject · ไม่มีตัวจับเวลาเพิ่ม) ·
   *  ไม่ได้ดึง / มีชุดแล้ว (รวม truncated) / ออฟไลน์ / ดึงล้มไปแล้ว = null ⇒ ผู้เรียกไปต่อทันที ◂ */
  loading: () => Promise<void> | null;
  /** POS P5.3 fix1c ▸ F7: ข้อมูลในชุดน่าจะเก่า (quote ปฏิเสธบรรทัดสินค้า) — ดึงใหม่ครั้งเดียว (หน่วง) ◂ */
  invalidate: () => void;
};

const FOCUS_STALE_MS = 60_000;
const MAX_AGE_MS = 2 * REGISTER_BARCODE_INDEX_TTL_MS;
const STALE_DEBOUNCE_MS = 1_500;
const EDGE_MIN_WAIT_MS = 15_000;
const EDGE_MAX_WAIT_MS = 3_600_000;
const PAUSE_POLL_MS = 2_000;
const RETRY_DEFAULT_MS = 10_000;
const KICK_GAP_MS = 10_000;

type IndexState = { scope: string; map: Map<string, RegisterProduct>; version: string | null; fetchedAt: number; truncated: boolean; edgeMs: number | null };
const emptyState = (scope: string): IndexState => ({ scope, map: new Map(), version: null, fetchedAt: 0, truncated: false, edgeMs: null });
/** POS P5.3 fix1c ▸ F2: ฟิลด์ที่จอใช้ตัดสินสแกน/pick เท่านั้น (ไม่รวม stockLeft/ชื่อ/รูป) ◂ */
const sameDecision = (a: RegisterProduct, b: RegisterProduct): boolean =>
  a.id === b.id &&
  a.soldOutReason === b.soldOutReason &&
  (a.notSold ?? false) === (b.notSold ?? false) &&
  a.priceSatang === b.priceSatang &&
  a.optionGroupCount === b.optionGroupCount &&
  a.requiredOptionGroupCount === b.requiredOptionGroupCount &&
  a.variantCount === b.variantCount &&
  a.kind === b.kind &&
  a.soldByWeight === b.soldByWeight;

export function useBarcodeIndex(o: BarcodeIndexOpts): BarcodeIndex {
  const { systemId, unitId, online } = o;
  const scope = `${systemId}:${unitId}`;
  const st = useRef<IndexState>(emptyState(scope));
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const idsRef = useRef({ systemId, unitId });
  idsRef.current = { systemId, unitId };
  const pausedRef = useRef(o.paused);
  pausedRef.current = o.paused;
  const onlineRef = useRef(online);
  onlineRef.current = online;
  /** F5: false หลัง cleanup — คำตอบที่มาช้าไม่ตั้งเวลา/ไม่เขียนสถานะ/ไม่รันคิว */
  const alive = useRef(true);
  const inflight = useRef(false);
  const inflightP = useRef<Promise<void> | null>(null); // POS P5.3 fix1b ▸ คำขอที่กำลังวิ่ง (loading) ◂
  /** มีคำขอซ้อนระหว่างดึง/ถูกเลื่อนเพราะกล่องชำระ: "full" = ต้องชุดเต็ม · "check" = ส่ง version · null = ไม่มี */
  const queued = useRef<"full" | "check" | null>(null);
  const deferred = useRef<"full" | "check" | null>(null);
  /** F3: นาฬิกาเซิร์ฟเวอร์ − นาฬิกาเครื่อง (ms) */
  const offsetMs = useRef(0);
  /** F2: รหัสที่ยืนยันแล้วว่าเป็นทางเซิร์ฟเวอร์ (excluded ของเซิร์ฟเวอร์ + ดึงใหม่แล้วยังไม่อยู่) — อยู่ข้ามชุด ล้างเมื่อเปลี่ยนสาขาเท่านั้น */
  const serverOnly = useRef(new Set<string>());
  /** รหัสที่สั่งดึงใหม่ไปแล้วในชุดนี้ · รหัสที่รอผลของคำขอถัดไป */
  const staleTried = useRef(new Set<string>());
  const pendingStale = useRef(new Set<string>());
  const lastAttemptAt = useRef(0);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (full: boolean): Promise<void> => {
    if (!alive.current) return;
    if (inflight.current) {
      queued.current = full || queued.current === "full" ? "full" : "check";
      return;
    }
    // F1: กล่องชำระ/จบการขายเปิด = ไม่เริ่ม · ตรวจซ้ำทุก 2 วิ แล้วทำหลังปิด
    if (pausedRef.current()) {
      deferred.current = full || deferred.current === "full" ? "full" : "check";
      if (!deferTimer.current) {
        const poll = () => {
          deferTimer.current = null;
          if (!alive.current) return;
          if (pausedRef.current()) {
            deferTimer.current = setTimeout(poll, PAUSE_POLL_MS);
            return;
          }
          const d = deferred.current;
          deferred.current = null;
          if (d && onlineRef.current) void refresh(d === "full");
        };
        deferTimer.current = setTimeout(poll, PAUSE_POLL_MS);
      }
      return;
    }
    inflight.current = true;
    lastAttemptAt.current = Date.now();
    let release: () => void = () => undefined; // POS P5.3 fix1b ▸ ◂
    inflightP.current = new Promise<void>((res) => (release = res));
    const mine = st.current.scope;
    const known = full ? null : st.current.version;
    const sent = new Set(pendingStale.current);
    pendingStale.current.clear();
    const confirmAbsent = () => {
      for (const k of sent) if (!st.current.map.has(k)) serverOnly.current.add(k);
    };
    try {
      const { systemId: sys, unitId: unit } = idsRef.current;
      const res = await fetch(`${REGISTER_BARCODE_INDEX_PATH}?systemId=${encodeURIComponent(sys)}&unitId=${encodeURIComponent(unit)}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: known ? { "if-none-match": `"${known}"` } : {},
      });
      if (!alive.current || st.current.scope !== mine) return; // เปลี่ยนสาขา/ออกจากหน้าระหว่างรอ = ทิ้ง
      const sn = Date.parse(res.headers.get("x-pos-server-now") ?? "");
      if (Number.isFinite(sn)) offsetMs.current = sn - Date.now();
      if (res.status === 304) {
        st.current = { ...st.current, fetchedAt: Date.now() };
        confirmAbsent();
        return;
      }
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after"));
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          if (alive.current && onlineRef.current) void refresh(full);
        }, Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60_000) : RETRY_DEFAULT_MS);
        return;
      }
      if (res.status >= 500) return; // เซิร์ฟเวอร์ล้ม — คงชุดเดิม รอรอบถัดไป
      const r = (await res.json()) as RegisterBarcodeIndexResult;
      if (!alive.current || st.current.scope !== mine) return;
      if (!r.ok) {
        st.current = { ...emptyState(mine), fetchedAt: Date.now() }; // ปฏิเสธ (สิทธิ์/ขอบเขต) = ไม่ใช้ดัชนี — ทางเซิร์ฟเวอร์ตัดสินเอง
        return;
      }
      const serverNow = Date.parse(r.serverNow);
      if (Number.isFinite(serverNow)) offsetMs.current = serverNow - Date.now();
      if (r.unchanged === true) {
        if (r.version === st.current.version) st.current = { ...st.current, fetchedAt: Date.now() };
        confirmAbsent();
        return;
      }
      const map = new Map<string, RegisterProduct>();
      if (!r.truncated) for (const it of r.items) map.set(it.barcode, it.product);
      for (const k of r.excluded) serverOnly.current.add(k);
      // F3: ขอบที่ผ่านไปแล้วตามนาฬิกาเซิร์ฟเวอร์ = ไม่ใช้ (กลับไปใช้ TTL ปกติ ไม่ดึงซ้ำรัว)
      const edge = r.priceValidUntil ? Date.parse(r.priceValidUntil) : NaN;
      const edgeMs = Number.isFinite(edge) && Number.isFinite(serverNow) && edge > serverNow ? edge : null;
      st.current = { scope: mine, map, version: r.version, fetchedAt: Date.now(), truncated: r.truncated, edgeMs };
      staleTried.current.clear();
      confirmAbsent();
      if (edgeTimer.current) clearTimeout(edgeTimer.current);
      edgeTimer.current =
        edgeMs !== null
          ? setTimeout(() => {
              edgeTimer.current = null;
              if (alive.current) void refresh(true);
            }, Math.min(Math.max(edgeMs - serverNow, EDGE_MIN_WAIT_MS), EDGE_MAX_WAIT_MS))
          : null;
    } catch {
      /* เครือข่ายล้ม — คงชุดเดิม (lookup ยังคุมอายุ/ขอบราคา) รอรอบถัดไป */
    } finally {
      inflight.current = false;
      inflightP.current = null; // POS P5.3 fix1b ▸ ปล่อยผู้รอก่อนเริ่มคำขอที่ซ้อนไว้ ◂
      release();
      const next = queued.current;
      queued.current = null;
      if (next && alive.current && st.current.scope === scopeRef.current) void refresh(next === "full");
    }
  }, []);

  // ── เปลี่ยนสาขา/เปิดหน้า: ล้าง แล้วดึงชุดเต็มเป็นงานเบื้องหลังหลังวาดแรก · รอบ 15 นาที · focus ──
  useEffect(() => {
    alive.current = true;
    st.current = emptyState(scope);
    serverOnly.current = new Set();
    staleTried.current.clear();
    pendingStale.current.clear();
    const first = setTimeout(() => {
      if (onlineRef.current) void refresh(true);
    }, 0);
    const tick = setInterval(() => {
      if (onlineRef.current) void refresh(!st.current.version);
    }, REGISTER_BARCODE_INDEX_TTL_MS);
    const onFocus = () => {
      if (onlineRef.current && !inflight.current && Date.now() - st.current.fetchedAt > FOCUS_STALE_MS) void refresh(!st.current.version);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      alive.current = false; // F5
      clearTimeout(first);
      clearInterval(tick);
      window.removeEventListener("focus", onFocus);
      for (const t of [edgeTimer, staleTimer, retryTimer, deferTimer]) {
        if (t.current) clearTimeout(t.current);
        t.current = null;
      }
      queued.current = null;
      deferred.current = null;
    };
  }, [scope, refresh]);

  // ── F4: เปลี่ยนเป็นออนไลน์ (รวมเปิดหน้าตอนออฟไลน์ แล้วเน็ตมา) — ยังไม่มีชุด หรือเก่ากว่า TTL = ดึง ──
  const wasOnline = useRef(online);
  useEffect(() => {
    const was = wasOnline.current;
    wasOnline.current = online;
    if (!online || was) return;
    if (!inflight.current && (!st.current.version || Date.now() - st.current.fetchedAt > REGISTER_BARCODE_INDEX_TTL_MS)) void refresh(!st.current.version);
  }, [online, refresh]);

  const lookup = useCallback(
    (code: string): RegisterProduct | null => {
      const s = st.current;
      if (!onlineRef.current || s.scope !== scopeRef.current) return null;
      if (!s.version) {
        // F4: ออนไลน์แต่ยังไม่มีชุด (ดึงครั้งแรกล้ม) — เริ่มดึง (ห่างกันอย่างน้อย 10 วิ · ไม่ซ้อนคำขอที่วิ่ง/รอลองใหม่)
        if (!inflight.current && !retryTimer.current && Date.now() - lastAttemptAt.current > KICK_GAP_MS) void refresh(true);
        return null;
      }
      if (s.truncated) return null;
      const now = Date.now();
      if (s.edgeMs !== null && now + offsetMs.current >= s.edgeMs) {
        if (!inflight.current) void refresh(true); // F6 · ถึงขอบหน้าต่างโปร (เวลาเซิร์ฟเวอร์) — ราคาในชุดอาจไม่ใช่ราคาตอนนี้
        return null;
      }
      if (now - s.fetchedAt > MAX_AGE_MS) {
        if (!inflight.current) void refresh(false); // F6
        return null;
      }
      return s.map.get(code.trim()) ?? null;
    },
    [refresh],
  );

  const scheduleStale = useCallback(() => {
    if (staleTimer.current) clearTimeout(staleTimer.current);
    staleTimer.current = setTimeout(() => {
      staleTimer.current = null;
      if (alive.current && onlineRef.current) void refresh(false);
    }, STALE_DEBOUNCE_MS);
  }, [refresh]);

  const noteServerOne = useCallback(
    (code: string, product: RegisterProduct) => {
      const s = st.current;
      if (!s.version || s.truncated || s.scope !== scopeRef.current) return;
      const key = code.trim();
      if (serverOnly.current.has(key)) return; // F2: ตั้งใจไม่อยู่ในดัชนี
      const cached = s.map.get(key);
      if (cached && sameDecision(cached, product)) return; // F2: เทียบเฉพาะฟิลด์ตัดสิน
      if (staleTried.current.has(key)) return;
      staleTried.current.add(key);
      pendingStale.current.add(key);
      scheduleStale();
    },
    [scheduleStale],
  );

  const invalidate = useCallback(() => {
    if (st.current.version) scheduleStale(); // F7
  }, [scheduleStale]);

  // POS P5.3 fix1b ▸ CD-P53-O14b ◂
  const loading = useCallback((): Promise<void> | null => {
    const s = st.current;
    if (!onlineRef.current || s.version || s.scope !== scopeRef.current) return null;
    return inflightP.current;
  }, []);

  return { lookup, noteServerOne, loading, invalidate };
}
