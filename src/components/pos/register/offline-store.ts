// offline-store.ts — IndexedDB ของเครื่องขาย (POS P3.4U · มติผู้คุม 2 · R4 R13)
// POS P3.4U ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   ฐาน `shark-pos-off:<systemId>:<unitId>` · store: meta (snapshot · seq · salt · unlock) · queue (บิลรอซิงก์/รอผู้จัดการ · คีย์ = idempotencyKey) ·
//   synced (บิลที่ได้เลขจริงแล้ว — แสดง/พิมพ์ซ้ำ · เก็บ 24 ชม. สูงสุด 100 ใบ)
// 🔴 ทุกการเขียนผ่าน offlineStoreSafe (ไม่มี managerPin/pin/phoneLast4/cost/สมาชิก) · คิว append-only: ไม่มีทางลบ/แก้บิลในเครื่อง
//    ยกเว้นเซิร์ฟเวอร์ตอบ OK/DUPLICATE (ย้ายไป synced) หรือ REJECTED (สถานะ parked) · snapshot/ตัวตรวจ PIN ล้างได้ (ออกจากระบบ/โทเคนตาย)
// 🔴 ไฟล์ client ล้วน (ไม่มี directive · ไม่ import อะไรที่ถึง prisma) · ไม่มี service worker / Cache API (มติ 9 · W12)
// 🔴 เลข OFF: อ่าน seq + จอง + เพิ่มบิลใน transaction เดียว (สองแท็บพร้อมกันได้เลขไม่ซ้ำ)
import { nextOfflineSeq, offlineRef } from "@/lib/modules/pos/offline-shared";
import {
  offlineDbName,
  offlineStoreSafe,
  type OfflineQueueRecord,
  type OfflineSnapshotRecord,
  type OfflineSyncedRecord,
  type OfflineUnlockRecord,
} from "@/lib/modules/pos/offline-client-shared";

const VERSION = 1;
const META = "meta";
const QUEUE = "queue";
const SYNCED = "synced";
const SYNCED_KEEP_MS = 86_400_000;
const SYNCED_KEEP_MAX = 100;

export type OfflineDb = IDBDatabase;

const supported = () => typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });

/** มีฐานของสาขานี้อยู่แล้วไหม (ปิดธง = ไม่สร้างฐานใหม่ · ยังซิงก์คิวที่ค้างได้) — เบราว์เซอร์ไม่มี databases() = ถือว่ามี */
export async function offlineDbExists(systemId: string, unitId: string): Promise<boolean> {
  if (!supported()) return false;
  try {
    const list = typeof indexedDB.databases === "function" ? await indexedDB.databases() : null;
    return list === null ? true : list.some((d) => d.name === offlineDbName(systemId, unitId));
  } catch {
    return false;
  }
}
/** เปิด/สร้างฐาน — ไม่รองรับ/ถูกบล็อก = null (ขายออฟไลน์ไม่ได้ · จอเดิม) */
export async function openOfflineDb(systemId: string, unitId: string): Promise<OfflineDb | null> {
  if (!supported()) return null;
  try {
    const r = indexedDB.open(offlineDbName(systemId, unitId), VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "idempotencyKey" });
      if (!db.objectStoreNames.contains(SYNCED)) db.createObjectStore(SYNCED, { keyPath: "idempotencyKey" });
    };
    return await req(r);
  } catch {
    return null;
  }
}

async function metaGet<T>(db: OfflineDb, key: string): Promise<T | null> {
  const tx = db.transaction(META, "readonly");
  const v = (await req(tx.objectStore(META).get(key))) as T | undefined;
  return v ?? null;
}
async function metaPut(db: OfflineDb, key: string, value: unknown): Promise<void> {
  const tx = db.transaction(META, "readwrite");
  tx.objectStore(META).put(offlineStoreSafe(value), key);
  await done(tx);
}
async function metaDel(db: OfflineDb, key: string): Promise<void> {
  const tx = db.transaction(META, "readwrite");
  tx.objectStore(META).delete(key);
  await done(tx);
}

// ── snapshot ──
export const readSnapshot = (db: OfflineDb) => metaGet<OfflineSnapshotRecord>(db, "snapshot");
export const writeSnapshot = (db: OfflineDb, rec: OfflineSnapshotRecord) => metaPut(db, "snapshot", rec);
/** ล้าง snapshot (ออกจากระบบ/ผู้ใช้อื่น/STAFF_TOKEN_INVALID/ปิดธง) — คิวไม่ถูกแตะ */
export const wipeSnapshot = (db: OfflineDb) => metaDel(db, "snapshot");
export const readLocalSeq = async (db: OfflineDb) => (await metaGet<number>(db, "seq")) ?? 0;

// ── ตัวตรวจ PIN ออฟไลน์ (มติ 8) ──
/** เกลือต่อเครื่อง (สุ่มครั้งแรก · คงไว้ข้ามผู้ใช้) */
export async function deviceSalt(db: OfflineDb): Promise<Uint8Array> {
  const cur = await metaGet<number[]>(db, "salt");
  if (Array.isArray(cur) && cur.length === 16) return new Uint8Array(cur);
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  await metaPut(db, "salt", Array.from(s));
  return s;
}
export const readUnlock = (db: OfflineDb) => metaGet<OfflineUnlockRecord>(db, "unlock");
export const writeUnlock = (db: OfflineDb, rec: OfflineUnlockRecord) => metaPut(db, "unlock", rec);
export const wipeUnlock = (db: OfflineDb) => metaDel(db, "unlock");

// ── คิว ──
export async function listQueue(db: OfflineDb): Promise<OfflineQueueRecord[]> {
  const tx = db.transaction(QUEUE, "readonly");
  const rows = (await req(tx.objectStore(QUEUE).getAll())) as OfflineQueueRecord[];
  return rows.sort((a, b) => (a.soldAt < b.soldAt ? -1 : a.soldAt > b.soldAt ? 1 : a.offlineRef < b.offlineRef ? -1 : 1));
}
export async function listSynced(db: OfflineDb): Promise<OfflineSyncedRecord[]> {
  const tx = db.transaction(SYNCED, "readonly");
  const rows = (await req(tx.objectStore(SYNCED).getAll())) as OfflineSyncedRecord[];
  return rows.sort((a, b) => (a.soldAt > b.soldAt ? -1 : 1));
}
/**
 * จองเลข OFF + เพิ่มบิลใน transaction เดียว (R4): seq = nextOfflineSeq(ของเครื่อง, ของเซิร์ฟเวอร์ใน snapshot) · เลขผิดรูป = null (ไม่เขียน) ·
 * คีย์บิลซ้ำ (บิล unknown ที่ย้ายเข้าคิวแล้ว) = คืนระเบียนเดิม
 */
export function enqueueOffline(db: OfflineDb, code: string, serverSeq: number, build: (ref: string) => OfflineQueueRecord): Promise<OfflineQueueRecord | null> {
  return new Promise((resolve, reject) => {
    let out: OfflineQueueRecord | null = null;
    const tx = db.transaction([META, QUEUE], "readwrite");
    const meta = tx.objectStore(META);
    const queue = tx.objectStore(QUEUE);
    const g = meta.get("seq");
    g.onsuccess = () => {
      const local = typeof g.result === "number" ? g.result : 0;
      const seq = nextOfflineSeq(local, serverSeq);
      const ref = offlineRef(code, seq);
      if (!ref) {
        tx.abort();
        return;
      }
      const rec = offlineStoreSafe(build(ref));
      const prev = queue.get(rec.idempotencyKey);
      prev.onsuccess = () => {
        if (prev.result) {
          out = prev.result as OfflineQueueRecord;
          return;
        }
        meta.put(seq, "seq");
        queue.add(rec);
        out = rec;
      };
    };
    tx.oncomplete = () => resolve(out);
    tx.onabort = () => (out === null ? resolve(null) : reject(tx.error));
    tx.onerror = () => reject(tx.error);
  });
}
/** ผลซิงก์ต่อรายการ: remove = ย้ายไป synced (เลขจริง) · park = สถานะ parked + เหตุผล · keep = ไม่แตะ · seq ของเครื่องไม่ถอย */
export async function applySyncResults(
  db: OfflineDb,
  out: { idempotencyKey: string; action: "remove" | "park" | "keep"; saleId?: string | null; receiptNo?: string | null; reason?: string }[],
  nowIso: string,
): Promise<void> {
  const tx = db.transaction([QUEUE, SYNCED], "readwrite");
  const queue = tx.objectStore(QUEUE);
  const synced = tx.objectStore(SYNCED);
  for (const o of out) {
    if (o.action === "keep") continue;
    const g = queue.get(o.idempotencyKey);
    g.onsuccess = () => {
      const cur = g.result as OfflineQueueRecord | undefined;
      if (!cur) return;
      if (o.action === "park") {
        queue.put(offlineStoreSafe({ ...cur, status: "parked", ...(o.reason ? { reason: o.reason } : {}) }));
        return;
      }
      synced.put(offlineStoreSafe({ offlineRef: cur.offlineRef, idempotencyKey: cur.idempotencyKey, saleId: o.saleId ?? null, receiptNo: o.receiptNo ?? null, soldAt: cur.soldAt, syncedAt: nowIso, totalSatang: cur.totalSatang } satisfies OfflineSyncedRecord));
      queue.delete(cur.idempotencyKey);
    };
  }
  await done(tx);
}
/** ตัดบิลที่ซิงก์แล้วเก่ากว่า 24 ชม. / เกิน 100 ใบ (ไม่ใช่คิว) */
export async function pruneSynced(db: OfflineDb, nowMs: number): Promise<void> {
  const rows = await listSynced(db);
  const drop = rows.filter((r, i) => i >= SYNCED_KEEP_MAX || nowMs - Date.parse(r.syncedAt) > SYNCED_KEEP_MS);
  if (!drop.length) return;
  const tx = db.transaction(SYNCED, "readwrite");
  for (const r of drop) tx.objectStore(SYNCED).delete(r.idempotencyKey);
  await done(tx);
}
