"use client";

// voice.tsx — อัดข้อความเสียงในกล่องพิมพ์ (WO-CV8 · PLAN-CHAT-V2 §3)
//
// 🔴 ทำไมเป็น "กดเริ่ม → กดหยุด" ไม่ใช่ "กดค้าง" (แบบร่างเขียนว่ากดค้างที่ไมค์)
//    · เดสก์ท็อป: กดค้างแล้วเมาส์ขยับออกนอกปุ่ม เบราว์เซอร์ไม่ส่ง `mouseup` มาที่ปุ่มอีก
//      ⇒ การอัดค้างอยู่โดยที่ผู้ใช้คิดว่าปล่อยแล้ว (เคยเป็นบั๊กคลาสสิกของ push-to-talk บนเว็บ)
//    · คนที่ใช้คีย์บอร์ด/โปรแกรมอ่านหน้าจอ "กดค้าง" ไม่ได้เลย = ฟีเจอร์นี้จะใช้ไม่ได้ทั้งกลุ่ม
//    · ข้อความเสียงในงานบริการมักยาว 10–60 วิ — ถือค้างนานขนาดนั้นบนมือถือคือการทรมานนิ้ว
//    ⇒ แตะครั้งแรก = เริ่ม · แตะปุ่มหยุด = ได้คลิป · ปุ่มยกเลิกอยู่ข้าง ๆ เสมอ (ทั้งเมาส์และนิ้วใช้ได้)
//
// 🔴 ห้ามขอสิทธิ์ไมโครโฟนตอนเปิดหน้า — ขอตอนผู้ใช้กดไมค์เท่านั้น
//    (เบราว์เซอร์จำการปฏิเสธไว้ถาวรต่อโดเมน · เด้งขอทั้งที่ยังไม่มีใครจะอัด = โดนปฏิเสธฟรี ๆ
//     แล้วทีมจะอัดเสียงไม่ได้อีกเลยจนกว่าจะไปแก้ค่าในเบราว์เซอร์เอง)

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { formatDuration } from "./list-filters";
import { sendVoiceReplyAction, voiceCapabilityAction } from "./actions";

/**
 * เพดานความยาวคลิปฝั่งหน้าจอ
 * 🔴 ตัวตัดสินจริงคือ `MAX_VOICE_MS` ใน `chat/service.ts` (ฝั่งเซิร์ฟเวอร์) — ค่านี้มีไว้ให้
 *    "หยุดให้เองก่อนถึงเพดาน" เท่านั้น ค่าที่หน้าจอส่งมาปลอมได้เสมอ จึงห้ามถือว่าเป็นด่าน
 *    เปลี่ยนค่าเมื่อไหร่ต้องเปลี่ยนทั้งสองที่ (คนละรันไทม์ — client import service.ts ไม่ได้
 *    เพราะไฟล์นั้นลาก prisma เข้ามาทั้งก้อน)
 */
export const VOICE_MAX_MS = 120_000;

/**
 * ชนิดไฟล์ที่จะลองอัด เรียงตามลำดับที่อยากได้
 * 🔴 ต้องมีทางลงให้ Safari/iOS — เบราว์เซอร์นั้นอัด webm ไม่ได้เลย (`isTypeSupported` คืน false ทุกตัว)
 *    ถ้าล็อก webm อย่างเดียว ทีมที่ใช้ iPhone/iPad จะกดไมค์แล้วไม่มีอะไรเกิดขึ้น
 * 🔴 ทุกชนิดในลิสต์นี้ต้องมีอยู่ใน `ALLOWED_UPLOAD_TYPES` ของ storage ด้วย (พร้อมนามสกุลที่ถูก)
 *    ไม่งั้นอัดได้แต่อัปไม่ขึ้น = เสียงหายหลังกดส่ง
 */
/*
 * 🔴 เรียงใหม่ 2 ก.ย. 2026 (เจ้าของเทสจริงแล้วเจอ): เดิม webm มาก่อน ⇒ Chrome เดสก์ท็อปอัดเป็น webm
 * ซึ่ง **iPhone/iPad เล่นไม่ได้โดยสิ้นเชิง** (ทั้ง <audio>, QuickTime, WebAudio) — ทีมอัดจากคอม
 * ลูกค้าครึ่งประเทศกดเล่นแล้วเงียบ ⇒ ชนิดที่เลือกต้องตัดสินจาก "ทุกเครื่อง**เล่น**ได้" ไม่ใช่ "เครื่องนี้**อัด**ได้"
 * · `audio/mp4` (m4a/AAC) เล่นได้ทุกเบราว์เซอร์+iOS+Android และเป็นชนิดเดียวที่ LINE รับ
 * · เบราว์เซอร์ที่อัด m4a ไม่ได้ (Firefox) ตกไปอัด **WAV ผ่าน Web Audio** (ดู recordWav ด้านล่าง)
 *   — ไฟล์ใหญ่กว่าแต่เล่นได้ทุกเครื่องแน่นอน · ห้ามผลิต webm/ogg อีก (D29)
 */
const CANDIDATE_TYPES = [
  "audio/mp4", // m4a — Safari/iOS ทุกรุ่น · Chrome/Edge รุ่นปัจจุบัน
  "audio/aac",
] as const;

/** mime → นามสกุลสำหรับ "ชื่อไฟล์ที่คนอ่าน" (นามสกุลจริงบน CDN เซิร์ฟเวอร์เป็นคนตั้งจากตารางเดียว) */
const EXT_OF: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/** ชนิดแรกที่เบราว์เซอร์นี้อัดได้จริง · null = อัดไม่ได้เลย */
export function pickRecordingType(
  isSupported: (t: string) => boolean = (t) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
): string | null {
  for (const t of CANDIDATE_TYPES) {
    try {
      if (isSupported(t)) return t;
    } catch {
      // เบราว์เซอร์บางรุ่นโยน error แทนที่จะตอบ false — ถือว่าชนิดนั้นใช้ไม่ได้แล้วลองตัวถัดไป
    }
  }
  return null;
}

const baseMime = (t: string) => t.split(";")[0]!.trim().toLowerCase();

/** Float32 หลายก้อน → ไฟล์ WAV 16kHz โมโน 16-bit (ลดจาก sample rate จริงด้วยการหยิบทุก n ตัว —
 *  เสียงพูดไม่ต้องละเอียดกว่านี้ และคุมขนาด 120 วิ ≈ 3.8MB) */
function encodeWav(chunks: Float32Array[], inputRate: number): Blob {
  const TARGET_RATE = 16_000;
  const step = Math.max(1, Math.round(inputRate / TARGET_RATE));
  const rate = Math.round(inputRate / step);
  let total = 0;
  for (const c of chunks) total += Math.ceil(c.length / step);
  const pcm = new Int16Array(total);
  let w = 0;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i += step) {
      const v = Math.max(-1, Math.min(1, c[i]!));
      pcm[w++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
  }
  const header = new ArrayBuffer(44);
  const dv = new DataView(header);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); dv.setUint32(4, 36 + pcm.byteLength, true); str(8, "WAVE");
  str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, "data"); dv.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm.buffer as ArrayBuffer], { type: "audio/wav" });
}

export type VoicePhase = "idle" | "asking" | "recording" | "sending";

/**
 * สมองของการอัดเสียง — แยกจากปุ่มเพื่อให้กล่องพิมพ์ยังเป็นเจ้าของหน้าตาแถบตามแบบร่าง
 * (ปุ่มไมค์ต้องอยู่ในแถบตำแหน่งเดิมตามมติ D13 · ที่นี่ดูแลเฉพาะ "อัด/หยุด/ส่ง")
 */
export function useVoiceRecorder(args: {
  systemId: string;
  conversationId: string;
  isInternal: boolean;
  /** ส่งสำเร็จแล้ว — ให้ห้องแชทไปดึงข้อความใหม่ */
  onSent?: () => void;
}) {
  const { systemId, conversationId, isInternal, onSent } = args;
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  // null = ยังไม่รู้ (กำลังถามเซิร์ฟเวอร์) — ต่างจาก false ที่แปลว่า "ถามแล้ว ช่องทางนี้ส่งไม่ได้"
  const [canSendAudio, setCanSendAudio] = useState<boolean | null>(null);
  const [capabilityReason, setCapabilityReason] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ยกเลิกแล้ว = ตอน `onstop` ทำงานต้องทิ้งคลิป ไม่ใช่ส่ง (onstop ถูกเรียกทั้งสองเส้นทาง)
  const cancelledRef = useRef(false);

  // เบราว์เซอร์นี้อัดได้ไหม — เช็คหลัง mount เพราะ `MediaRecorder` เป็นของฝั่งเบราว์เซอร์เท่านั้น
  const [recorderType, setRecorderType] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setRecorderType(pickRecordingType());
  }, []);

  // ช่องทางของห้องนี้ส่งเสียงได้ไหม — ความจริงอยู่ที่ adapter ฝั่งเซิร์ฟเวอร์ (VO-3/VO-4 ก)
  useEffect(() => {
    let alive = true;
    setCanSendAudio(null);
    setCapabilityReason(null);
    if (!conversationId) return;
    void voiceCapabilityAction(systemId, conversationId)
      .then((res) => {
        if (!alive) return;
        setCanSendAudio(res.canSendAudio);
        setCapabilityReason(res.reason ?? null);
      })
      .catch(() => {
        if (!alive) return;
        // ถามไม่ได้ = ไม่รู้ → ปิดไว้ก่อนและบอกตรง ๆ ดีกว่าปล่อยให้อัดแล้วเสียงหาย
        setCanSendAudio(false);
        setCapabilityReason("ยังตรวจไม่ได้ว่าช่องทางนี้ส่งข้อความเสียงได้ไหม — ลองเปิดห้องนี้ใหม่อีกครั้ง");
      });
    return () => {
      alive = false;
    };
  }, [systemId, conversationId]);

  const wavStopRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    // 🔴 ต้องปิดสตรีมทุกเส้นทาง ไม่งั้นไฟไมค์ของเครื่องยังติดค้างหลังอัดเสร็จ
    //    (ผู้ใช้เห็นจุดแดง "กำลังใช้ไมโครโฟน" ค้างทั้งวัน = เรื่องความเป็นส่วนตัว ไม่ใช่แค่บั๊ก UI)
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const send = useCallback(
    async (blob: Blob, durationMs: number) => {
      const type = baseMime(blob.type || recorderType || "audio/mp4");
      const ext = EXT_OF[type] ?? "m4a";
      const fd = new FormData();
      fd.set("systemId", systemId);
      fd.set("conversationId", conversationId);
      fd.set("durationMs", String(durationMs));
      if (isInternal) fd.set("isInternal", "on");
      // ชื่อไฟล์ไม่มีวันที่ฮาร์ดโค้ด — ใช้เวลาจริงตอนอัด
      fd.set("file", new File([blob], `voice-${Date.now()}.${ext}`, { type }));
      const res = await sendVoiceReplyAction(fd);
      if (res.ok) {
        setErr(null);
        onSent?.();
      } else {
        setErr(res.reason ?? "ส่งข้อความเสียงไม่สำเร็จ — กดส่งอีกครั้งได้เลย");
      }
      setPhase("idle");
      setElapsedMs(0);
    },
    [systemId, conversationId, isInternal, onSent, recorderType],
  );

  /** อัดเป็น WAV ผ่าน Web Audio — ทางลงของเบราว์เซอร์ที่อัด m4a ไม่ได้ (เล่นได้ทุกเครื่องแน่นอน · D29)
   *  ใช้ ScriptProcessorNode (deprecated แต่ทุกเบราว์เซอร์ยังรองรับ) เพราะ AudioWorklet ต้องมีไฟล์ worker แยก
   *  ซึ่งเพิ่ม moving part ให้เส้นทางสำรองที่นาน ๆ ใช้ที — แลกไม่คุ้ม */
  const startWav = useCallback(
    (stream: MediaStream) => {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      proc.onaudioprocess = (ev) => chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
      src.connect(proc);
      proc.connect(ctx.destination);
      cancelledRef.current = false;
      startedAtRef.current = performance.now();
      setPhase("recording");
      setElapsedMs(0);
      const stopWav = () => {
        const ms = Math.round(performance.now() - startedAtRef.current);
        proc.disconnect();
        src.disconnect();
        void ctx.close();
        stream.getTracks().forEach((t) => t.stop());
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = null;
        wavStopRef.current = null;
        streamRef.current = null;
        if (cancelledRef.current) {
          setPhase("idle");
          setElapsedMs(0);
          return;
        }
        if (ms < 700 || chunks.length === 0) {
          setPhase("idle");
          setElapsedMs(0);
          setErr("คลิปสั้นเกินไป — กดไมค์แล้วพูดอย่างน้อย 1 วินาที");
          return;
        }
        setPhase("sending");
        void send(encodeWav(chunks, ctx.sampleRate), Math.min(ms, VOICE_MAX_MS));
      };
      wavStopRef.current = stopWav;
      streamRef.current = stream;
      tickRef.current = setInterval(() => {
        const ms = performance.now() - startedAtRef.current;
        setElapsedMs(ms);
        if (ms >= VOICE_MAX_MS) stopWav();
      }, 200);
    },
    [send],
  );

  const start = useCallback(async () => {
    setErr(null);
    // recorderType === null = ไม่มี m4a/aac ⇒ ใช้เส้นทาง WAV (Web Audio) แทน — ไม่ใช่อัดไม่ได้
    if (recorderType === null && typeof AudioContext === "undefined") {
      setErr("เบราว์เซอร์รุ่นนี้ยังอัดเสียงไม่ได้ — พิมพ์ข้อความหรือแนบไฟล์เสียงแทนได้เลย");
      return;
    }
    if (canSendAudio === false) {
      setErr(capabilityReason ?? "ช่องทางนี้ยังส่งข้อความเสียงไม่ได้");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("หน้านี้เข้าถึงไมโครโฟนไม่ได้ (ต้องเปิดผ่าน https) — แจ้งผู้ดูแลระบบได้เลย");
      return;
    }
    setPhase("asking");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setPhase("idle");
      const name = e instanceof Error ? e.name : "";
      // 🔴 ข้อความห้ามโทษผู้ใช้ — บอกว่า "ต้องทำอะไรต่อ" ไม่ใช่ "คุณทำผิด"
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErr("เบราว์เซอร์ยังไม่ได้อนุญาตให้ใช้ไมโครโฟนกับเว็บนี้ — เปิดสิทธิ์ไมโครโฟนแล้วกดไมค์อีกครั้ง");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setErr("ไม่พบไมโครโฟนบนเครื่องนี้ — เสียบไมค์แล้วลองใหม่ หรือพิมพ์ข้อความแทนได้เลย");
      } else if (name === "NotReadableError") {
        setErr("มีโปรแกรมอื่นใช้ไมโครโฟนอยู่ — ปิดโปรแกรมนั้นแล้วกดไมค์อีกครั้ง");
      } else {
        setErr("เปิดไมโครโฟนไม่สำเร็จ — กดไมค์อีกครั้งได้เลย");
      }
      return;
    }

    if (recorderType === null) {
      // ── เส้นทาง WAV (Firefox ฯลฯ ที่อัด m4a ไม่ได้) — PCM 16kHz โมโน ⇒ 120 วิ ≈ 3.8MB (< เพดาน 10MB)
      startWav(stream);
      return;
    }

    try {
      const rec = new MediaRecorder(stream, recorderType ? { mimeType: recorderType } : undefined);
      streamRef.current = stream;
      recRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        // ความยาวจริง = เวลาที่อัดจริง (ไม่ใช่ค่าที่เดาจากขนาดไฟล์ และไม่ต้องรอ metadata ของ blob
        // ซึ่ง webm ที่ MediaRecorder ปล่อยออกมามักไม่มี duration เขียนไว้เลย)
        const ms = Math.round(performance.now() - startedAtRef.current);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || recorderType || "audio/mp4" });
        const cancelled = cancelledRef.current;
        cleanup();
        if (cancelled) {
          setPhase("idle");
          setElapsedMs(0);
          return;
        }
        if (ms < 700 || blob.size === 0) {
          setPhase("idle");
          setElapsedMs(0);
          setErr("คลิปสั้นเกินไป — กดไมค์แล้วพูดอย่างน้อย 1 วินาที");
          return;
        }
        setPhase("sending");
        void send(blob, Math.min(ms, VOICE_MAX_MS));
      };
      startedAtRef.current = performance.now();
      rec.start(250); // แบ่งก้อนทุก 250ms — ปิดแท็บกลางคันแล้วยังได้ท่อนที่อัดไปแล้ว
      setPhase("recording");
      setElapsedMs(0);
      tickRef.current = setInterval(() => {
        const ms = performance.now() - startedAtRef.current;
        setElapsedMs(ms);
        // ถึงเพดานแล้วหยุดให้เอง — ไม่ปล่อยให้อัดยาวจนเซิร์ฟเวอร์ปฏิเสธทีหลัง (เสียเวลาผู้ใช้ฟรี ๆ)
        if (ms >= VOICE_MAX_MS && recRef.current?.state === "recording") recRef.current.stop();
      }, 200);
    } catch {
      cleanup();
      setPhase("idle");
      setErr("เริ่มอัดเสียงไม่สำเร็จ — กดไมค์อีกครั้งได้เลย");
    }
  }, [recorderType, canSendAudio, capabilityReason, cleanup, send]);

  const stop = useCallback(() => {
    cancelledRef.current = false;
    if (wavStopRef.current) { wavStopRef.current(); return; } // เส้นทาง WAV มีตัวหยุดของตัวเอง
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (wavStopRef.current) { wavStopRef.current(); return; }
    if (recRef.current?.state === "recording") recRef.current.stop();
    else {
      cleanup();
      setPhase("idle");
      setElapsedMs(0);
    }
  }, [cleanup]);

  return {
    phase,
    elapsedMs,
    err,
    clearErr: () => setErr(null),
    /** อัดได้ไหมในทางเทคนิค — m4a/aac ผ่าน MediaRecorder หรือ WAV ผ่าน Web Audio ก็นับว่าพร้อม */
    recorderReady: recorderType !== null || typeof AudioContext !== "undefined",
    canSendAudio,
    capabilityReason,
    start,
    stop,
    cancel,
  };
}

/**
 * แถบสถานะ "กำลังอัด" — โผล่เหนือกล่องพิมพ์ระหว่างอัด/กำลังส่ง
 * ⚠️ ทะเบียนไอคอนยังไม่มี `pause`/`stop` — ปุ่มหยุดจึงใช้ `send` (หยุด = ส่งเลย ซึ่งตรงกับสิ่งที่ทำจริง)
 *    และสถานะ "กำลังอัด" บอกด้วยจุดเต้น + ตัวเลขเวลา (รายงานขอไอคอนไว้แล้ว)
 */
export function VoiceRecordingBar({
  phase,
  elapsedMs,
  onStop,
  onCancel,
}: {
  phase: VoicePhase;
  elapsedMs: number;
  onStop: () => void;
  onCancel: () => void;
}) {
  if (phase === "idle") return null;
  const recording = phase === "recording";
  const left = Math.max(0, VOICE_MAX_MS - elapsedMs);
  return (
    <div
      data-qc="voice-recording"
      role="status"
      className="mb-1.5 flex items-center gap-2.5 rounded-[11px] border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-2.5 py-1.5"
    >
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full bg-[color:var(--color-danger)] ${recording ? "animate-pulse" : "opacity-40"}`}
      />
      <span className="text-[12.5px] font-semibold tabular-nums text-[color:var(--color-ink)]">
        {phase === "asking"
          ? "กำลังขอสิทธิ์ใช้ไมโครโฟน…"
          : phase === "sending"
            ? "กำลังส่งข้อความเสียง…"
            : formatDuration(elapsedMs)}
      </span>
      {recording && (
        <span className="text-[11px] text-[color:var(--color-muted)]">
          เหลือ {formatDuration(left)}
        </span>
      )}
      <span className="flex-1" />
      {recording && (
        <>
          <button
            type="button"
            data-qc="voice-cancel"
            onClick={onCancel}
            className="flex items-center gap-1 rounded-lg bg-[color:var(--color-surface)] px-2 py-1 text-[12px] text-[#4b5563]"
          >
            <Icon name="x" size="sm" />
            ยกเลิก
          </button>
          <button
            type="button"
            data-qc="voice-stop"
            onClick={onStop}
            className="flex items-center gap-1 rounded-lg bg-[color:var(--color-accent)] px-2.5 py-1 text-[12px] font-semibold text-white"
          >
            <Icon name="send" size="sm" />
            หยุดแล้วส่ง
          </button>
        </>
      )}
    </div>
  );
}
