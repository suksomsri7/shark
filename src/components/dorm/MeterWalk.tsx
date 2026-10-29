"use client";
// SVC D.6 ▸ จอจดมิเตอร์มือถือ (ไล่ทีละห้อง · ออฟไลน์ได้ · ตรวจค่าผิดปกติ) — สัญญา ledger/svc-briefs/svc-brief-d.6.md §6 §7 · ภาพ ledger/design-dorm/03-meter-mobile.png
//   • import โมดูล server ไม่ได้ — ได้แค่ `import type` + คิว pure (`dorm/meter-queue`) · action รับทาง prop (submit/confirm/replace) ไม่ import actions
//   • ไม่ใช้ hook ของ Next (render ด้วย renderToStaticMarkup ได้) · ที่เก็บคิวฝั่งเบราว์เซอร์ใช้ใน effect เท่านั้น (ฝั่ง server ไม่แตะ)
//   • ไม่มีเงิน/คำนวณยอด (กล่องประมาณเงินเป็นของ D.7) · ไม่มีชื่อผู้เช่า (D.5/D.13 เติม) · ห้องผิดปกติ = "พักบิลรอตรวจ" เท่านั้น
//   • 390px ไม่ล้นแนวนอน · ปุ่ม/ช่องกรอกสูง ≥ 44px · สถานะสื่อด้วยข้อความ ไม่พึ่งสีอย่างเดียว
import { useCallback, useEffect, useRef, useState } from "react";
import type { MeterEstimate, MeterFlagRow, MeterWalk as MeterWalkData } from "@/lib/modules/dorm";
import { enqueueReading, nextBatch, settleBatch, type QueuedReading } from "@/lib/modules/dorm/meter-queue";

type SubmitInput = {
  periodKey: string;
  items: { meterId: string; value: number; readAt?: string; clientKey?: string; photo?: { dataUrl: string; contentType: string } | null }[];
};
type ConfirmInput = { readingId: string; action: "ACCEPT" | "REREAD"; value?: number; note?: string | null };
type ReplaceInput = { meterId: string; oldFinalReading: number; newStartReading: number; readingId?: string | null };

export type MeterWalkProps = {
  unitId: string;
  periodKey: string;
  walk: MeterWalkData;
  flags?: MeterFlagRow[];
  submit: (input: SubmitInput) => Promise<unknown>;
  confirm?: (input: ConfirmInput) => Promise<unknown>;
  replace?: (input: ReplaceInput) => Promise<unknown>;
  initialFloor?: string;
  initialRoomId?: string;
  initialView?: "walk" | "flags";
  /** SVC D.8 ▸ กล่อง "ประมาณค่าน้ำไฟเดือนนี้" ต่อห้อง (meterEstimates · เฉพาะผู้มีสิทธิ์ดูเงิน) — ไม่ส่ง = ไม่มีกล่อง ◂ */
  estimates?: Record<string, MeterEstimate> | null;
};

type Room = MeterWalkData["floors"][number]["rooms"][number];
type Meter = Room["meters"][number];
type Flag = NonNullable<Room["flag"]>;

const KIND_LABEL: Record<"ELEC" | "WATER", string> = { ELEC: "ไฟ", WATER: "น้ำ" };
const KIND_FULL: Record<"ELEC" | "WATER", string> = { ELEC: "ไฟฟ้า", WATER: "น้ำประปา" };
const FLAG_TEXT: Record<Flag, string> = { HIGH: "สูงกว่าปกติ", LOW: "ต่ำกว่าปกติ", BACKWARDS: "เลขถอยหลัง", VACANT_USAGE: "ห้องว่างมีการใช้" };
const REJECT_TEXT: Record<string, string> = {
  NOT_FOUND: "ไม่พบมิเตอร์",
  METER_REMOVED: "มิเตอร์ถูกเปลี่ยนไปแล้ว",
  INVALID_VALUE: "เลขไม่ถูกต้อง",
  LOCKED: "เลขนี้ยืนยันแล้ว แก้ไม่ได้",
};

const fmt = (n: number | null): string => (n === null ? "-" : n.toLocaleString("en-US"));
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const parseNum = (s: string): number | null => {
  const t = s.replace(/[,\s]/g, "");
  if (!/^\d{1,12}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
};
const newKey = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const storageKeyOf = (unitId: string) => `dorm-meter-queue:${unitId}`;

/** ผลของ action → ok/ข้อความ (รูปร่างไม่รู้จัก = ถือว่าไม่ผ่าน) */
function outcomeOf(res: unknown): { ok: boolean; reason: string; results: unknown[] } {
  if (!isRec(res)) return { ok: false, reason: "ส่งไม่สำเร็จ ลองอีกครั้ง", results: [] };
  if (res.ok === true) return { ok: true, reason: "", results: Array.isArray(res.results) ? res.results : [] };
  return { ok: false, reason: typeof res.reason === "string" && res.reason ? res.reason : "ส่งไม่สำเร็จ ลองอีกครั้ง", results: [] };
}

const sanitizeQueue = (raw: unknown): QueuedReading[] => {
  if (!Array.isArray(raw)) return [];
  const out: QueuedReading[] = [];
  for (const x of raw) {
    if (!isRec(x)) continue;
    if (typeof x.meterId !== "string" || typeof x.periodKey !== "string" || typeof x.value !== "number" || typeof x.readAt !== "string" || typeof x.clientKey !== "string") continue;
    const p = isRec(x.photo) && typeof x.photo.dataUrl === "string" && typeof x.photo.contentType === "string" ? { dataUrl: x.photo.dataUrl, contentType: x.photo.contentType } : null;
    out.push({ meterId: x.meterId, periodKey: x.periodKey, value: x.value, readAt: x.readAt, clientKey: x.clientKey, photo: p });
  }
  return out;
};

/** ย่อรูปในเบราว์เซอร์ก่อนส่ง (ด้านยาว ≤ 1280 · JPEG) — เล็กพอส่งผ่านสัญญาณมือถือและเก็บในคิวออฟไลน์ */
async function shrinkPhoto(file: File): Promise<{ dataUrl: string; contentType: string } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const g = canvas.getContext("2d");
    if (!g) return null;
    g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.72), contentType: "image/jpeg" };
  } catch {
    return null;
  }
}

const btnBase = "inline-flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-semibold";
const btnGhost = `${btnBase} border-[color:var(--color-line)] bg-[color:var(--color-surface)]`;
const btnPrimary = `${btnBase} border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]`;
const chip = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold";

// ───────────────────────── การ์ดตรวจค่าผิดปกติ (ภาพ ค) ─────────────────────────
function FlagCard(props: {
  f: MeterFlagRow;
  periodKey: string;
  submit: MeterWalkProps["submit"];
  confirm?: MeterWalkProps["confirm"];
  replace?: MeterWalkProps["replace"];
}) {
  const { f } = props;
  const [mode, setMode] = useState<"idle" | "reread" | "replace">("idle");
  const [val, setVal] = useState("");
  const [oldFinal, setOldFinal] = useState("");
  const [newStart, setNewStart] = useState("0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [taskMade, setTaskMade] = useState(false);

  const place = f.roomNumber ? `${f.roomNumber}` : "มิเตอร์หลัก";
  const kind = KIND_LABEL[f.kind];
  const title =
    f.flag === "BACKWARDS" ? `${place} · ${kind} เลขถอยหลัง` : f.flag === "VACANT_USAGE" ? `${place} · ห้องว่าง ใช้${kind} ${fmt(f.units)} หน่วย` : `${place} · ${kind} ${fmt(f.units)} หน่วย`;
  const tag =
    f.flag === "HIGH" ? (f.avg3 && f.units !== null && f.avg3 > 0 ? `สูง ${(f.units / f.avg3).toFixed(1)} เท่า` : "สูงกว่าปกติ")
    : f.flag === "LOW" ? "ต่ำกว่าปกติ"
    : f.flag === "BACKWARDS" ? `${fmt(f.prevValue)} → ${fmt(f.value)}`
    : "ไม่มีผู้เช่า";
  const body =
    f.flag === "BACKWARDS" ? "เปลี่ยนมิเตอร์ใหม่หรือเปล่า? ถ้าใช่ ใส่เลขมิเตอร์เก่าตอนถอด + เลขเริ่มของตัวใหม่ ระบบคิดหน่วยรวมให้ · ถ้าจดผิด ให้จดใหม่"
    : f.flag === "VACANT_USAGE" ? "ไม่ออกบิลให้ใคร — ค่าไฟนี้เป็นต้นทุนหอ · สร้างงานตรวจ (เช็กตู้เย็น/ปลั๊ก/ท่อ) ในบอร์ดงานได้"
    : `เฉลี่ย 3 เดือน ${f.avg3 === null ? "-" : fmt(Math.round(f.avg3))} หน่วย · ตรวจว่าเลขตรงกับหน้าปัดมิเตอร์จริงหรือไม่ · บิลห้องนี้พักไว้รอตรวจ`;

  async function run(job: () => Promise<unknown> | undefined, okText: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await job();
      const o = outcomeOf(res);
      setMsg(o.ok ? okText : o.reason);
      if (o.ok) setMode("idle");
    } catch {
      setMsg("ส่งไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  const accept = () => run(() => props.confirm?.({ readingId: f.readingId, action: "ACCEPT" }), "ยืนยันแล้ว");
  const reread = () => {
    const n = parseNum(val);
    if (n === null) return setMsg("ใส่เลขมิเตอร์เป็นตัวเลข");
    return run(() => props.confirm?.({ readingId: f.readingId, action: "REREAD", value: n }), "บันทึกเลขใหม่แล้ว");
  };
  const replaceNow = () => {
    const a = parseNum(oldFinal);
    const b = parseNum(newStart);
    if (a === null || b === null) return setMsg("ใส่เลขทั้งสองช่องเป็นตัวเลข");
    return run(() => props.replace?.({ meterId: f.meterId, oldFinalReading: a, newStartReading: b, readingId: f.readingId }), "เปลี่ยนมิเตอร์แล้ว");
  };
  async function makeTask() {
    setBusy(true);
    setMsg("");
    try {
      const o = outcomeOf(await props.submit({ periodKey: props.periodKey, items: [{ meterId: f.meterId, value: f.value, clientKey: newKey() }] }));
      const first = o.results[0];
      const cardId = o.ok && isRec(first) && typeof first.cardId === "string" ? first.cardId : null;
      if (cardId) setTaskMade(true);
      setMsg(cardId ? "สร้างงานตรวจในบอร์ดงานแล้ว" : o.ok ? "ยังไม่มีบอร์ดงานให้สร้างงานตรวจ — ตั้งบอร์ดซ่อมก่อน" : o.reason);
    } catch {
      setMsg("ส่งไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article data-flag-reading={f.readingId} data-flag={f.flag} className="flex min-w-0 flex-col gap-2 rounded-2xl border-[1.5px] border-[color:var(--color-danger)] p-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 flex-1 break-words text-[15px] font-bold">{title}</h3>
        <span className={`${chip} shrink-0 border-[color:var(--color-danger)] text-[color:var(--color-danger)]`}>{tag}</span>
      </div>
      <p className="text-[13px] leading-relaxed text-[color:var(--color-ink-soft)]">{body}</p>

      {mode === "reread" ? (
        <div className="flex gap-2">
          <input inputMode="numeric" pattern="[0-9]*" aria-label="เลขมิเตอร์ที่จดใหม่" value={val} onChange={(e) => setVal(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-lg tabular-nums" />
          <button type="button" disabled={busy} onClick={reread} className={btnPrimary}>
            บันทึก
          </button>
        </div>
      ) : null}
      {mode === "replace" ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เลขมิเตอร์เก่าตอนถอด
            <input inputMode="numeric" pattern="[0-9]*" value={oldFinal} onChange={(e) => setOldFinal(e.target.value)} className="min-h-11 rounded-xl border px-3 text-lg tabular-nums text-[color:var(--color-ink)]" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            เลขเริ่มของมิเตอร์ตัวใหม่
            <input inputMode="numeric" pattern="[0-9]*" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="min-h-11 rounded-xl border px-3 text-lg tabular-nums text-[color:var(--color-ink)]" />
          </label>
          <button type="button" disabled={busy} onClick={replaceNow} className={btnPrimary}>
            ยืนยันเปลี่ยนมิเตอร์
          </button>
        </div>
      ) : null}

      <div className="flex gap-2">
        {f.flag === "BACKWARDS" ? (
          <>
            <button type="button" disabled={busy} onClick={() => setMode(mode === "reread" ? "idle" : "reread")} className={`${btnGhost} flex-1`}>
              จดผิด แก้
            </button>
            <button type="button" disabled={busy} onClick={() => setMode(mode === "replace" ? "idle" : "replace")} className={`${btnPrimary} flex-1`}>
              เปลี่ยนมิเตอร์
            </button>
          </>
        ) : f.flag === "VACANT_USAGE" ? (
          <>
            <button type="button" disabled={busy} onClick={accept} className={`${btnGhost} flex-1`}>
              ข้าม
            </button>
            <button type="button" disabled={busy || taskMade} onClick={makeTask} className={`${btnPrimary} flex-1`}>
              {taskMade ? "ดูงานตรวจ" : "สร้างงานตรวจ"}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => setMode(mode === "reread" ? "idle" : "reread")} className={`${btnGhost} flex-1`}>
              จดใหม่
            </button>
            <button type="button" disabled={busy} onClick={accept} className={`${btnPrimary} flex-1`}>
              ยืนยันค่านี้
            </button>
          </>
        )}
      </div>
      {msg ? (
        <p role="status" className="text-[13px] text-[color:var(--color-ink-soft)]">
          {msg}
        </p>
      ) : null}
    </article>
  );
}

// SVC D.8 ▸ กล่องประมาณค่าน้ำไฟของห้อง (ยอดจาก D.7 ผ่าน meterEstimates — จอไม่คำนวณเงินเอง) ◂
const estMoney = (satang: number): string => `${Math.trunc(satang / 100).toLocaleString("en-US")}.${String(Math.abs(satang % 100)).padStart(2, "0")}`;
function EstimateBox({ roomId, e }: { roomId: string; e: MeterEstimate }) {
  const part = (label: string, x: MeterEstimate["elec"]) =>
    x ? `${label} ${fmt(x.units)}${x.rateSatangPerUnit !== null ? ` × ฿${estMoney(x.rateSatangPerUnit)}` : " หน่วย"}` : null;
  const parts = [part("ไฟ", e.elec), part("น้ำ", e.water)].filter((x): x is string => !!x);
  return (
    <div data-meter-estimate={roomId} className="flex flex-col gap-0.5 rounded-2xl bg-[color:var(--color-surface-2)] p-3.5 text-[13px]">
      <p>
        ประมาณค่าน้ำไฟเดือนนี้ <b className="tabular-nums">{`฿${estMoney(e.totalSatang)}`}</b>
      </p>
      {parts.length ? <p className="text-[color:var(--color-muted)]">{parts.join(" · ")}</p> : null}
    </div>
  );
}

// ───────────────────────── จอหลัก ─────────────────────────
export default function MeterWalk(props: MeterWalkProps) {
  const { unitId, periodKey, walk, flags = [], submit } = props;
  const floors = walk.floors;
  const roomsAll = floors.flatMap((f) => f.rooms);

  const defaultFloor = (): string => {
    if (props.initialFloor && floors.some((f) => f.key === props.initialFloor)) return props.initialFloor;
    if (props.initialRoomId) {
      const hit = floors.find((f) => f.rooms.some((r) => r.roomId === props.initialRoomId));
      if (hit) return hit.key;
    }
    return (floors.find((f) => f.rooms.some((r) => !r.done)) ?? floors[0])?.key ?? "";
  };
  const [view, setView] = useState<"walk" | "flags">(props.initialView === "flags" ? "flags" : "walk");
  const [floorKey, setFloorKey] = useState<string>(defaultFloor);
  const [roomId, setRoomId] = useState<string | null>(props.initialRoomId && roomsAll.some((r) => r.roomId === props.initialRoomId) ? props.initialRoomId : null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, { dataUrl: string; contentType: string }>>({});
  const [note, setNote] = useState("");
  const [rejected, setRejected] = useState<{ meterId: string; code: string | null }[]>([]);
  const [queue, setQueueState] = useState<QueuedReading[]>([]);
  const queueRef = useRef<QueuedReading[]>([]);
  const sendingRef = useRef(false);
  const loadedRef = useRef(false);
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  const setQueue = useCallback(
    (q: QueuedReading[]) => {
      queueRef.current = q;
      setQueueState(q);
      try {
        window.localStorage.setItem(storageKeyOf(unitId), JSON.stringify(q));
      } catch {
        /* ที่เก็บเต็ม/ปิดอยู่ — คิวยังอยู่ในหน่วยความจำของหน้านี้ */
      }
    },
    [unitId],
  );

  const flush = useCallback(async () => {
    if (sendingRef.current || !loadedRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    sendingRef.current = true;
    try {
      for (let guard = 0; guard < 20; guard++) {
        const batch = nextBatch(queueRef.current);
        if (!batch) break;
        let res: unknown;
        try {
          res = await submitRef.current({
            periodKey: batch.periodKey,
            items: batch.items.map((q) => ({ meterId: q.meterId, value: q.value, readAt: q.readAt, clientKey: q.clientKey, photo: q.photo ?? null })),
          });
        } catch {
          setNote("ยังส่งไม่ได้ — เก็บไว้ในเครื่อง จะส่งให้เมื่อมีสัญญาณ");
          break;
        }
        const o = outcomeOf(res);
        if (!o.ok) {
          setNote(o.reason);
          break;
        }
        const results = o.results.filter(isRec).map((r) => ({ meterId: String(r.meterId ?? ""), status: String(r.status ?? ""), ...(typeof r.code === "string" ? { code: r.code } : {}) }));
        const before = queueRef.current.length;
        const out = settleBatch(queueRef.current, batch.items, results);
        setQueue(out.queue);
        if (out.rejected.length) setRejected((prev) => [...prev, ...out.rejected]);
        setNote("");
        if (out.queue.length >= before) break; // เซิร์ฟเวอร์ไม่ตอบรายการไหนเลย — รอรอบหน้า ไม่วนซ้ำถี่
      }
    } finally {
      sendingRef.current = false;
    }
  }, [setQueue]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKeyOf(unitId));
      const q = raw ? sanitizeQueue(JSON.parse(raw)) : [];
      queueRef.current = q;
      setQueueState(q);
    } catch {
      /* ไม่มีคิวเดิม */
    }
    loadedRef.current = true;
    void flush();
  }, [unitId, flush]);

  useEffect(() => {
    const go = () => void flush();
    window.addEventListener("online", go);
    const t = window.setInterval(go, 20_000);
    return () => {
      window.removeEventListener("online", go);
      window.clearInterval(t);
    };
  }, [flush]);

  const floor = floors.find((f) => f.key === floorKey) ?? floors[0];
  const room = roomId ? roomsAll.find((r) => r.roomId === roomId) ?? null : null;
  const pct = walk.progress.rooms > 0 ? Math.round((walk.progress.done / walk.progress.rooms) * 100) : 0;

  const openRoom = (r: Room) => {
    const d: Record<string, string> = {};
    for (const m of r.meters) d[m.meterId] = m.value === null ? "" : String(m.value);
    setDraft(d);
    setPhotos({});
    setNote("");
    setRoomId(r.roomId);
  };

  async function saveRoom() {
    if (!room) return;
    const rf = floors.find((f) => f.rooms.some((r) => r.roomId === room.roomId)) ?? floor;
    if (!rf) return;
    const picked: { m: Meter; n: number }[] = [];
    for (const m of room.meters) {
      const t = (draft[m.meterId] ?? "").trim();
      if (t === "") continue;
      const n = parseNum(t);
      if (n === null) return setNote("เลขมิเตอร์ต้องเป็นตัวเลข");
      picked.push({ m, n });
    }
    if (picked.length === 0) return setNote("กรอกเลขอย่างน้อย 1 ช่อง");
    let q = queueRef.current;
    const at = new Date().toISOString();
    for (const { m, n } of picked) q = enqueueReading(q, { meterId: m.meterId, periodKey, value: n, readAt: at, clientKey: newKey(), photo: photos[m.meterId] ?? null });
    setQueue(q);
    setNote("");
    const list = rf.rooms;
    const idx = list.findIndex((r) => r.roomId === room.roomId);
    const next = list.slice(idx + 1).find((r) => !r.done) ?? list.slice(idx + 1)[0] ?? null;
    if (next) openRoom(next);
    else setRoomId(null);
    void flush();
  }

  async function pickPhoto(meterId: string, file: File | undefined) {
    if (!file) return;
    const p = await shrinkPhoto(file);
    if (p) setPhotos((prev) => ({ ...prev, [meterId]: p }));
    else setNote("อ่านรูปไม่ได้ — บันทึกเลขต่อได้ ไม่ต้องแนบรูป");
  }

  const rejectedBanner = rejected.length ? (
    <div role="status" className="rounded-xl border border-[color:var(--color-note-line)] bg-[color:var(--color-note)] p-3 text-[13px] text-[color:var(--color-note-ink)]">
      <p className="font-semibold">มี {rejected.length} รายการที่ระบบไม่รับ</p>
      <ul className="mt-1 list-disc pl-5">
        {rejected.map((r, i) => {
          const rm = roomsAll.find((x) => x.meters.some((m) => m.meterId === r.meterId));
          return (
            <li key={`${r.meterId}-${i}`}>
              {rm ? `ห้อง ${rm.number}` : "มิเตอร์"} — {REJECT_TEXT[r.code ?? ""] ?? "ตรวจเลขแล้วจดใหม่"}
            </li>
          );
        })}
      </ul>
      <button type="button" className="mt-2 min-h-11 text-sm font-semibold underline" onClick={() => setRejected([])}>
        รับทราบ
      </button>
    </div>
  ) : null;

  // ── มุมมอง: รายการตรวจค่าผิดปกติ ──
  if (view === "flags") {
    return (
      <div data-meter-walk="" data-period={periodKey} className="mx-auto flex w-full min-w-0 max-w-md flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="กลับไปหน้าจด" onClick={() => setView("walk")} className={`${btnGhost} w-11 shrink-0 px-0`}>
            ‹
          </button>
          <h2 className="text-xl font-bold">ตรวจค่าผิดปกติ</h2>
          <span className="ml-auto text-[13px] text-[color:var(--color-muted)]">{`ออฟไลน์ได้ · รอส่ง ${queue.length}`}</span>
        </div>
        {rejectedBanner}
        {flags.length === 0 ? (
          <p className="rounded-2xl border p-4 text-sm text-[color:var(--color-muted)]">ไม่มีรายการผิดปกติค้างตรวจ</p>
        ) : (
          flags.map((f) => <FlagCard key={f.readingId} f={f} periodKey={periodKey} submit={submit} confirm={props.confirm} replace={props.replace} />)
        )}
        <div className="rounded-2xl bg-[color:var(--color-accent-soft)] p-3.5 text-[13px] text-[color:var(--color-ink-soft)]">
          <p className="font-semibold text-[color:var(--color-accent)]">✓ จดครบทุกห้องแล้วค่อยออกบิล</p>
          <p>ห้องที่ยังผิดปกติจะถูกพักบิลรอตรวจ — ไม่ส่งบิลจนกว่าจะตรวจเสร็จ</p>
        </div>
      </div>
    );
  }

  // ── มุมมอง: แผงห้อง (ภาพ ข) ──
  const roomFloor = room ? (floors.find((f) => f.rooms.some((r) => r.roomId === room.roomId)) ?? floor) : floor;
  if (room && roomFloor) {
    const idx = roomFloor.rooms.findIndex((r) => r.roomId === room.roomId);
    const nextRoom = roomFloor.rooms.slice(idx + 1)[0] ?? null;
    return (
      <div data-meter-walk="" data-period={periodKey} className="mx-auto flex w-full min-w-0 max-w-md flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="กลับไปรายการห้อง" onClick={() => setRoomId(null)} className={`${btnGhost} w-11 shrink-0 px-0`}>
            ‹
          </button>
          <div className="min-w-0">
            <p className="text-xs text-[color:var(--color-muted)]">{roomFloor.label}</p>
            <h2 className="text-xl font-bold">ห้อง {room.number}</h2>
          </div>
          <span className={`${chip} ml-auto shrink-0 text-[color:var(--color-muted)]`}>{`${idx + 1} / ${roomFloor.rooms.length}`}</span>
        </div>
        {room.vacant ? <p className="text-[13px] text-[color:var(--color-muted)]">ห้องว่าง — จดไว้ด้วย ช่วยจับไฟรั่ว/น้ำรั่ว</p> : null}
        {room.meters.map((m) => {
          const raw = draft[m.meterId] ?? (m.value === null ? "" : String(m.value));
          const n = parseNum(raw);
          const prev = m.prevValue;
          const units = n !== null && prev !== null && n >= prev ? n - prev : null;
          const back = n !== null && prev !== null && n < prev;
          return (
            <div key={m.meterId} className="flex min-w-0 flex-col gap-2 rounded-2xl border p-3.5">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-[color:var(--color-ink-soft)]">
                <span>{KIND_FULL[m.kind]}</span>
                {m.value !== null ? <span className="ml-auto text-xs font-normal text-[color:var(--color-muted)]">{m.held ? "รอตรวจ" : "บันทึกแล้ว"}</span> : null}
              </div>
              <div className="flex items-baseline gap-2.5 tabular-nums">
                <span className="text-[15px] text-[color:var(--color-muted)]">{`${fmt(prev)} →`}</span>
                <input
                  data-meter-input={m.meterId}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  aria-label={`เลข${KIND_FULL[m.kind]}ที่จด`}
                  value={raw}
                  onChange={(e) => setDraft((d) => ({ ...d, [m.meterId]: e.target.value }))}
                  className="min-h-12 min-w-0 flex-1 rounded-xl border px-3 text-2xl font-bold tracking-wide"
                />
              </div>
              <p className="text-[13px] text-[color:var(--color-ink-soft)]">
                {back ? "เลขน้อยกว่าครั้งก่อน — ถ้าเปลี่ยนมิเตอร์ให้แจ้งในหน้า “ตรวจค่าผิดปกติ”" : units !== null ? `${fmt(units)} หน่วย` : m.units !== null ? `${fmt(m.units)} หน่วย` : "ใส่เลขแล้วระบบคิดหน่วยให้"}
              </p>
              <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 text-[13px] text-[color:var(--color-muted)]">
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void pickPhoto(m.meterId, e.target.files?.[0])} />
                {photos[m.meterId] ? "แนบรูปแล้ว · เปลี่ยนรูป" : m.photo ? "มีรูปแล้ว · ถ่ายใหม่" : `ถ่ายรูปมิเตอร์${KIND_LABEL[m.kind]} (ไม่บังคับ)`}
              </label>
            </div>
          );
        })}
        {props.estimates && props.estimates[room.roomId] ? <EstimateBox roomId={room.roomId} e={props.estimates[room.roomId]} /> : null}
        {note ? (
          <p role="status" className="text-[13px] text-[color:var(--color-danger)]">
            {note}
          </p>
        ) : null}
        <button type="button" onClick={() => void saveRoom()} className={`${btnPrimary} min-h-14 text-base`}>
          {nextRoom ? `บันทึก · ไปห้อง ${nextRoom.number} ›` : "บันทึก"}
        </button>
      </div>
    );
  }

  // ── มุมมอง: ไล่ทีละห้อง (ภาพ ก) ──
  return (
    <div data-meter-walk="" data-period={periodKey} className="mx-auto flex w-full min-w-0 max-w-md flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-2xl border p-3.5">
        <div className="flex items-center gap-2">
          <b className="text-[15px]">{`จดแล้ว ${walk.progress.done} / ${walk.progress.rooms} ห้อง`}</b>
          {walk.progress.flagged > 0 ? (
            <button type="button" onClick={() => setView("flags")} className={`${chip} ml-auto min-h-8 border-[color:var(--color-danger)] text-[color:var(--color-danger)]`}>
              {`ผิดปกติ ${walk.progress.flagged}`}
            </button>
          ) : null}
        </div>
        <div className="h-2 overflow-hidden rounded bg-[color:var(--color-surface-2)]" aria-hidden="true">
          <div className="h-full bg-[color:var(--color-ink)]" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[color:var(--color-muted)]">
          <span>ห้องว่างก็จด (จับไฟรั่ว)</span>
          <span className="ml-auto">{`ออฟไลน์ได้ · รอส่ง ${queue.length}`}</span>
        </div>
      </div>
      {rejectedBanner}
      {note ? (
        <p role="status" className="text-[13px] text-[color:var(--color-muted)]">
          {note}
        </p>
      ) : null}

      {floors.length === 0 ? (
        <p className="rounded-2xl border p-4 text-sm text-[color:var(--color-muted)]">ยังไม่มีมิเตอร์ในหอนี้ — เพิ่มมิเตอร์ของแต่ละห้องก่อนเริ่มจด</p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
            {floors.map((f) => {
              const doneN = f.rooms.filter((r) => r.done).length;
              const on = f.key === floor?.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-floor-tab={f.key}
                  onClick={() => setFloorKey(f.key)}
                  className={`${btnBase} shrink-0 whitespace-nowrap ${on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "border-[color:var(--color-line)]"}`}
                >
                  {f.label}
                  {doneN === f.rooms.length ? " ✓" : ` · ${doneN}/${f.rooms.length}`}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col">
            {floor?.rooms.map((r) => {
              const bad = r.flag !== null;
              const text = r.done
                ? `${r.meters.map((m) => `${KIND_LABEL[m.kind]} ${fmt(m.units)}`).join(" · ")} หน่วย`
                : `ครั้งก่อน ${r.meters.map((m) => `${KIND_LABEL[m.kind]} ${fmt(m.prevValue)}`).join(" · ")}`;
              return (
                <button
                  key={r.roomId}
                  type="button"
                  data-room-id={r.roomId}
                  data-room-number={r.number}
                  data-vacant={String(r.vacant)}
                  data-done={String(r.done)}
                  data-flag={r.flag ?? undefined}
                  onClick={() => openRoom(r)}
                  className={`flex min-h-14 w-full min-w-0 items-center gap-2.5 border-t px-1 py-2.5 text-left first:border-t-0 ${r.done ? "" : "text-[color:var(--color-ink)]"}`}
                >
                  <span className={`w-12 shrink-0 text-base font-bold tabular-nums ${r.done ? "" : "text-[color:var(--color-muted)]"}`}>{r.number}</span>
                  <span className="min-w-0 flex-1 break-words text-sm">
                    {r.vacant ? <b>ห้องว่าง</b> : null}
                    <small className="block text-[12.5px] text-[color:var(--color-muted)]">{text}</small>
                    {bad && r.flag ? <small className="block text-[12.5px] font-semibold text-[color:var(--color-danger)]">{`${FLAG_TEXT[r.flag]} · พักบิลรอตรวจ`}</small> : null}
                  </span>
                  <span className={`shrink-0 text-right text-sm font-bold ${bad ? "text-[color:var(--color-danger)]" : r.done ? "" : "text-[color:var(--color-muted)]"}`}>{bad ? "ตรวจ" : r.done ? "✓" : "จด ›"}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {walk.main.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-2xl border p-3 text-[13px] text-[color:var(--color-ink-soft)]">
          <p className="font-semibold">มิเตอร์หลักของอาคาร</p>
          {walk.main.map((m) => (
            <p key={m.meterId}>
              {`${KIND_FULL[m.kind]} · ครั้งก่อน ${fmt(m.prevValue)}`}
              {m.value !== null ? ` → ${fmt(m.value)} (${fmt(m.units)} หน่วย)` : " · ยังไม่จด"}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
