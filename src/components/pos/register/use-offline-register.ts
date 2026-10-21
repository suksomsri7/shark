// use-offline-register.ts — ชั้นออฟไลน์ของหน้าขาย (POS P3.4U · มติผู้คุม 2 3 5 7 8 · R11 · CD-P34U-2)
// POS P3.4U ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   • snapshot ของเครื่อง: POST /api/pos/sync/snapshot ตอนโหลด · ทุกขอบ priceValidUntil · ทุก 15 นาทีขณะออนไลน์ · RATE_LIMITED/5xx = ถอยเวลา
//     ผูกผู้ใช้ session (ผู้ใช้อื่นเปิดหน้า = ล้าง) · ปิดธง = ไม่ดึง (ฐานเดิมยังซิงก์คิวที่ค้างได้ — ไม่สร้างฐานใหม่)
//   • คิว: enqueue (เลข OFF ใน transaction เดียว) · วงซิงก์ = ผู้นำแท็บด้วย Web Locks (navigator.locks · ifAvailable) · ตัวกระตุ้น: เหตุการณ์ online /
//     kick() หลัง heartbeat ผ่าน / ทุก 30 วิ · offlineBatches → POST /api/pos/sync → classifyOfflineResult (remove = เลขจริง · park = รอผู้จัดการ
//     อ่านอย่างเดียว · keep) · เครือข่ายล้ม/5xx/BUSY = ถอยเวลา (30 วิ × 2^n เพดาน 5 นาที)
//   • ตัวตรวจ PIN ออฟไลน์ (มติ 7): remember (ปลดออนไลน์สำเร็จ) · tryUnlock (ออฟไลน์) · wipeSecrets (โทเคนตาย/ออกจากระบบ = ล้าง snapshot + ตัวตรวจ)
// 🔴 ไม่มี service worker / Cache API (มติ 9) · คิวไม่มีทางลบในเครื่อง · ป้าย "รอซิงก์ n" = คิว queued ในเครื่องเท่านั้น (pendingSyncCount ของเซิร์ฟเวอร์ = 0 เสมอ)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { classifyOfflineResult, offlineBatches, offlineSellGate, type OfflineSellGateReason, type OfflineSnapshot, type OfflineSyncResult } from "@/lib/modules/pos/offline-shared";
import {
  OFFLINE_EDGE_MIN_WAIT_MS,
  OFFLINE_SNAPSHOT_REFRESH_MS,
  OFFLINE_SYNC_INTERVAL_MS,
  offlineBackoffMs,
  offlineSyncItemOf,
  type OfflineQueueRecord,
  type OfflineSyncedRecord,
} from "@/lib/modules/pos/offline-client-shared";
import { applySyncResults, enqueueOffline, listQueue, listSynced, offlineDbExists, openOfflineDb, pruneSynced, readSnapshot, wipeSnapshot, writeSnapshot, type OfflineDb } from "./offline-store";
import { forgetOfflineUnlock, offlineUnlockHolder, rememberOfflineUnlock, tryOfflineUnlock, type OfflineUnlockResult } from "./offline-pin";

export type OfflineRegisterOpts = {
  systemId: string;
  unitId: string;
  /** ผู้ใช้ session */
  userId: string;
  /** settings.pos.offline.enabled (หน้าเพจส่งมา · posOfflineEnabled) */
  enabled: boolean;
  online: boolean;
  deviceId: string | undefined;
  /** เครื่อง ACTIVE ตามสถานะล่าสุดที่รู้ (registerStatus) */
  deviceActive: boolean;
  canSell: boolean;
};
export type OfflineRegister = {
  ready: boolean;
  snapshot: OfflineSnapshot | null;
  queue: OfflineQueueRecord[];
  synced: OfflineSyncedRecord[];
  queued: number;
  parked: number;
  gate: { ok: true } | { ok: false; reason: OfflineSellGateReason };
  lastRef: string | null;
  /** มีบิลที่เพิ่งได้เลขจริงภายใน 15 นาที (แถบ "ซิงก์แล้ว" ของหน้าขายตอนกลับมาออนไลน์) */
  recentSync: boolean;
  syncing: boolean;
  enqueue: (build: (ref: string) => OfflineQueueRecord) => Promise<OfflineQueueRecord | null>;
  kick: () => void;
  wipeSecrets: () => Promise<void>;
  rememberUnlock: (userId: string, secret: string) => void;
  tryUnlock: (userId: string, secret: string) => Promise<OfflineUnlockResult>;
  unlockHolder: { userId: string; locked: boolean } | null;
};

const SYNC_URL = "/api/pos/sync";
const SNAPSHOT_URL = "/api/pos/sync/snapshot";
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin", cache: "no-store" });

export function useOfflineRegister(o: OfflineRegisterOpts): OfflineRegister {
  const { systemId, unitId, userId, enabled, online, deviceId, deviceActive, canSell } = o;
  const [db, setDb] = useState<OfflineDb | null>(null);
  const dbRef = useRef<OfflineDb | null>(null);
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [queue, setQueue] = useState<OfflineQueueRecord[]>([]);
  const [synced, setSynced] = useState<OfflineSyncedRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [holder, setHolder] = useState<{ userId: string; locked: boolean } | null>(null);
  /** นาฬิกาของด่านขาย (อ่านหลัง mount เท่านั้น — ไม่อ่านเวลาในตอนวาด · HF-418) */
  const [nowMs, setNowMs] = useState(0);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  // ── เปิดฐาน: เปิดธง = เปิด/สร้าง · ปิดธง = เปิดเฉพาะเมื่อมีฐานอยู่แล้ว (ซิงก์คิวที่ค้าง) ──
  useEffect(() => {
    let live = true;
    void (async () => {
      const has = enabled || (await offlineDbExists(systemId, unitId));
      if (!has) return;
      const d = await openOfflineDb(systemId, unitId);
      if (!live || !d) return;
      dbRef.current = d;
      setDb(d);
    })();
    return () => {
      live = false;
    };
  }, [systemId, unitId, enabled]);

  const reload = useCallback(async () => {
    const d = dbRef.current;
    if (!d) return;
    try {
      const [snap, q, s] = await Promise.all([readSnapshot(d), listQueue(d), listSynced(d)]);
      // snapshot ผูกผู้ใช้ session + เครื่อง — ไม่ตรง/ปิดธง = ล้าง (คิวไม่แตะ) · ผู้ใช้ session เปลี่ยน (ออกจากระบบแล้วคนอื่นเข้า) = ล้างตัวตรวจ PIN ออฟไลน์ด้วย
      if (snap && (snap.userId !== userId || (deviceId && snap.deviceId !== deviceId) || !enabled)) {
        await wipeSnapshot(d);
        if (snap.userId !== userId) await forgetOfflineUnlock(d);
        setSnapshot(null);
      } else setSnapshot(snap?.snapshot ?? null);
      setQueue(q);
      setSynced(s);
      setHolder(await offlineUnlockHolder(d));
    } catch {
      /* อ่านไม่ได้ = คงค่าเดิม */
    }
  }, [userId, deviceId, enabled]);
  useEffect(() => {
    if (!db) return;
    void reload();
    const onVis = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [db, reload]);
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), OFFLINE_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [online, snapshot]);

  // ── snapshot (มติ 8 · CD-P34U-2) ──
  const snapFails = useRef(0);
  const snapNextAt = useRef(0);
  const snapBusy = useRef(false);
  const fetchSnapshot = useCallback(async () => {
    const d = dbRef.current;
    if (!d || !enabled || !deviceId || !canSell || !onlineRef.current || snapBusy.current) return;
    if (Date.now() < snapNextAt.current) return;
    snapBusy.current = true;
    try {
      const res = await post(SNAPSHOT_URL, { systemId, unitId, deviceId });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; code?: string; snapshot?: OfflineSnapshot } | null;
      if (res.ok && body?.ok === true && body.snapshot) {
        snapFails.current = 0;
        snapNextAt.current = 0;
        await writeSnapshot(d, { userId, deviceId, fetchedAt: new Date().toISOString(), snapshot: body.snapshot });
        setSnapshot(body.snapshot);
        return;
      }
      if (body?.code === "OFFLINE_DISABLED" || body?.code === "DEVICE_REVOKED" || body?.code === "DEVICE_NOT_FOUND") {
        await wipeSnapshot(d);
        setSnapshot(null);
      }
      snapFails.current += 1;
      snapNextAt.current = Date.now() + Math.max(offlineBackoffMs(snapFails.current), 60_000);
    } catch {
      snapFails.current += 1;
      snapNextAt.current = Date.now() + offlineBackoffMs(snapFails.current);
    } finally {
      snapBusy.current = false;
    }
  }, [enabled, deviceId, canSell, systemId, unitId, userId]);
  useEffect(() => {
    if (!db || !enabled || !online || !deviceId || !canSell) return;
    void fetchSnapshot();
    const id = setInterval(() => void fetchSnapshot(), OFFLINE_SNAPSHOT_REFRESH_MS);
    return () => clearInterval(id);
  }, [db, enabled, online, deviceId, canSell, fetchSnapshot]);
  // ขอบ priceValidUntil ของ snapshot = ดึงใหม่ (หน่วงอย่างน้อย 15 วิ)
  const pvu = snapshot?.priceValidUntil ?? null;
  useEffect(() => {
    if (!pvu || !enabled) return;
    const at = Date.parse(pvu);
    if (!Number.isFinite(at)) return;
    const h = setTimeout(() => void fetchSnapshot(), Math.min(Math.max(at - Date.now(), OFFLINE_EDGE_MIN_WAIT_MS), 3_600_000));
    return () => clearTimeout(h);
  }, [pvu, enabled, fetchSnapshot]);

  // ── วงซิงก์ (มติ 5) ──
  const syncFails = useRef(0);
  const syncNextAt = useRef(0);
  const runSync = useCallback(async () => {
    const d = dbRef.current;
    if (!d || !deviceId || !onlineRef.current) return;
    if (Date.now() < syncNextAt.current) return;
    const pending = (await listQueue(d)).filter((r) => r.status === "queued" && r.deviceId === deviceId);
    if (!pending.length) {
      await pruneSynced(d, Date.now()).catch(() => undefined);
      return;
    }
    setSyncing(true);
    try {
      for (const batch of offlineBatches(pending)) {
        const res = await post(SYNC_URL, { systemId, unitId, deviceId, items: batch.map(offlineSyncItemOf) });
        const body = (await res.json().catch(() => null)) as { ok?: boolean; code?: string; results?: OfflineSyncResult[] } | null;
        if (!res.ok || body?.ok !== true || !Array.isArray(body.results)) {
          // ทั้งชุด: เครือข่าย/5xx/BUSY/ปฏิเสธทั้งชุด = เก็บไว้ทั้งหมด แล้วถอยเวลา (ส่งใหม่ด้วยคีย์เดิม = ปลอดภัย)
          syncFails.current += 1;
          syncNextAt.current = Date.now() + offlineBackoffMs(syncFails.current);
          return;
        }
        const byRef = new Map(body.results.map((r) => [r.offlineRef, r]));
        await applySyncResults(
          d,
          batch.map((it) => {
            const r = byRef.get(it.offlineRef);
            return { idempotencyKey: it.idempotencyKey, action: classifyOfflineResult(r), saleId: r?.saleId ?? null, receiptNo: r?.receiptNo ?? null, ...(r?.reason ? { reason: r.reason } : {}) };
          }),
          new Date().toISOString(),
        );
      }
      syncFails.current = 0;
      syncNextAt.current = 0;
    } catch {
      syncFails.current += 1;
      syncNextAt.current = Date.now() + offlineBackoffMs(syncFails.current);
    } finally {
      setSyncing(false);
      await reload();
    }
  }, [deviceId, systemId, unitId, reload]);
  const lead = useCallback(() => {
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    // ผู้นำแท็บ: แท็บอื่นของสาขาเดียวกันกำลังซิงก์ = ข้าม (ifAvailable) · ไม่มี Web Locks = ทำเอง (แท็บเดียว)
    if (locks?.request) void locks.request(`shark-pos-off-sync:${systemId}:${unitId}`, { ifAvailable: true }, async (lock) => (lock ? runSync() : undefined)).catch(() => undefined);
    else void runSync();
  }, [systemId, unitId, runSync]);
  useEffect(() => {
    if (!db) return;
    const tick = () => {
      if (onlineRef.current) lead();
      else void reload();
    };
    tick();
    const id = setInterval(tick, OFFLINE_SYNC_INTERVAL_MS);
    const onOnline = () => {
      syncNextAt.current = 0;
      lead();
    };
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, [db, lead, reload]);

  // ── คิว / ตัวตรวจ ──
  const enqueue = useCallback(
    async (build: (ref: string) => OfflineQueueRecord) => {
      const d = dbRef.current;
      if (!d || !snapshot) return null;
      try {
        const rec = await enqueueOffline(d, snapshot.offlineCode, snapshot.offlineSeq, build);
        await reload();
        return rec;
      } catch {
        return null;
      }
    },
    [snapshot, reload],
  );
  const wipeSecrets = useCallback(async () => {
    const d = dbRef.current;
    if (!d) return;
    await wipeSnapshot(d).catch(() => undefined);
    await forgetOfflineUnlock(d);
    setSnapshot(null);
    setHolder(null);
  }, []);
  const rememberUnlock = useCallback(
    (uid: string, secret: string) => {
      const d = dbRef.current;
      if (!d || !enabled) return;
      void rememberOfflineUnlock(d, uid, secret).then(() => offlineUnlockHolder(d).then(setHolder));
    },
    [enabled],
  );
  const tryUnlock = useCallback(async (uid: string, secret: string): Promise<OfflineUnlockResult> => {
    const d = dbRef.current;
    if (!d) return { ok: false, code: "OFFLINE_UNLOCK_UNAVAILABLE" };
    const r = await tryOfflineUnlock(d, uid, secret);
    setHolder(await offlineUnlockHolder(d));
    return r;
  }, []);

  const queued = queue.filter((r) => r.status === "queued").length;
  const parked = queue.filter((r) => r.status === "parked").length;
  const gate = useMemo(
    () =>
      nowMs === 0
        ? ({ ok: false, reason: "NO_SNAPSHOT" } as const)
        : offlineSellGate({ enabled, deviceActive, snapshotIssuedAt: snapshot?.issuedAt ?? null, priceValidUntil: snapshot?.priceValidUntil ?? null, queueLength: queue.length, now: nowMs }),
    [enabled, deviceActive, snapshot, queue.length, nowMs],
  );
  const lastRef = queue.length ? queue[queue.length - 1]!.offlineRef : null;
  const recentSync = useMemo(() => nowMs > 0 && synced.some((x) => nowMs - Date.parse(x.syncedAt) < 900_000), [synced, nowMs]);
  return { ready: !!db, snapshot, queue, synced, queued, parked, gate, lastRef, recentSync, syncing, enqueue, kick: lead, wipeSecrets, rememberUnlock, tryUnlock, unlockHolder: holder };
}
