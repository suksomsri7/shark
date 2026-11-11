"use client";

// ScanCameraDialog.tsx — แผ่นสแกนด้วยกล้อง (POS P1.4 B3 · O22 = ใช่)
//   1) ขอกล้องหลังด้วย getUserMedia — ไม่อนุญาต ⇒ scan.cameraDenied · ไม่มีกล้อง/เปิดไม่ได้/ไม่ใช่ https ⇒ scan.cameraNone (ข้อความไทยชัด ไม่ใช่ error ดิบ)
//   2) ตัวถอดรหัส: BarcodeDetector ของเบราว์เซอร์ก่อน (Chrome/Android) · ไม่มี/ไม่รองรับรูปแบบที่ต้องการ ⇒ โหลดตัวสำรอง
//      ด้วย import() ตอนเปิดแผ่นนี้เท่านั้น (iPhone/Safari) — ห้าม import แบบ static ที่ใดใน src (ข้อสอบ C2)
//   3) อ่านได้ 1 ครั้ง ⇒ หยุดกล้อง + onCode(code) (ผู้เรียกปิดแผ่นแล้วส่งเข้าทางสแกนเดียวกับเครื่องสแกน) · โหมดสแกนต่อเนื่อง = ยังไม่มี (ปริยายปิด)
//   ปิดแผ่น/ถอดคอมโพเนนต์ ⇒ หยุดทุก track ของกล้องเสมอ (StrictMode เรียก effect ซ้ำได้ — ตัวแปร stopped กันไว้)

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SCAN_CAMERA_FORMATS } from "@/lib/modules/pos/scan-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "./RegisterDialog";

type Phase = "starting" | "scanning" | "denied" | "none";
type NativeDetector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string; format: string }[]> };
type NativeDetectorCtor = { new (opts: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> };

/** BarcodeDetector ของเบราว์เซอร์ (ตรวจว่ามีก่อนใช้เสมอ) · ไม่มี หรือไม่รองรับรูปแบบที่ต้องการเลย = null ⇒ ใช้ตัวสำรอง */
async function nativeDetector(): Promise<NativeDetector | null> {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
  try {
    const Ctor = (window as unknown as { BarcodeDetector: NativeDetectorCtor }).BarcodeDetector;
    const supported = Ctor.getSupportedFormats ? await Ctor.getSupportedFormats() : [...SCAN_CAMERA_FORMATS];
    const formats = SCAN_CAMERA_FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new Ctor({ formats }) : null;
  } catch {
    return null;
  }
}

/** ตัวสำรอง (O22): โหลดแพ็กเกจตอนนี้เท่านั้น · รับเฉพาะ 5 รูปแบบของ B3 · คืนตัวหยุด */
async function startFallback(stream: MediaStream, video: HTMLVideoElement, onRead: (code: string) => void): Promise<() => void> {
  const zx = await import("@zxing/browser");
  const F = zx.BarcodeFormat;
  const allowed = new Set([F.EAN_13, F.EAN_8, F.UPC_A, F.CODE_128, F.QR_CODE]);
  const reader = new zx.BrowserMultiFormatReader();
  const controls = await reader.decodeFromStream(stream, video, (res) => {
    if (res && allowed.has(res.getBarcodeFormat())) onRead(res.getText());
  });
  return () => controls.stop();
}

export function ScanCameraDialog({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const t = useTranslations("pos.register");
  const tc = useTranslations("common");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let stopFallback: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const release = () => {
      if (timer) clearTimeout(timer);
      try {
        stopFallback?.();
      } catch {
        /* หยุดแล้ว */
      }
      stream?.getTracks().forEach((tr) => tr.stop());
      stream = null;
    };
    const fail = (p: Phase) => {
      if (stopped) return;
      release();
      setPhase(p);
    };
    const finish = (raw: string) => {
      const code = raw.trim();
      if (stopped || !code) return;
      stopped = true; // อ่านได้ครั้งเดียว — ผลถัดไปของเฟรมเดียวกันไม่ถึงผู้เรียก
      release();
      onCodeRef.current(code);
    };
    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return fail("none");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        const name = (e as { name?: unknown } | null)?.name;
        return fail(name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError" ? "denied" : "none");
      }
      if (stopped) return release();
      const video = videoRef.current;
      if (!video) return fail("none");
      const det = await nativeDetector();
      if (stopped) return release();
      if (det) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        if (stopped) return release();
        setPhase("scanning");
        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            try {
              const hit = (await det.detect(video)).find((b) => b.rawValue);
              if (hit) return finish(hit.rawValue);
            } catch {
              /* เฟรมนี้อ่านไม่ได้ — ลองเฟรมถัดไป */
            }
          }
          if (!stopped) timer = setTimeout(() => void tick(), 120);
        };
        void tick();
        return;
      }
      const stop = await startFallback(stream, video, finish);
      if (stopped) {
        stop();
        return release();
      }
      stopFallback = stop;
      setPhase("scanning");
    })().catch(() => fail("none"));
    return () => {
      stopped = true;
      release();
    };
  }, []);

  const problem = phase === "denied" ? t("scan.cameraDenied") : phase === "none" ? t("scan.cameraNone") : null;
  return (
    <RegisterDialog onDismiss={onClose}>
      <div data-testid="pos-reg-scan-sheet" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("scan.cameraTitle")}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("scan.cameraTitle")}</h2>
        {problem ? (
          <p data-testid="pos-reg-scan-camera-error" className="rounded-[13px] bg-[color:var(--color-surface-2)] px-4 py-3 text-[14.5px] leading-[1.6] text-[color:var(--color-danger)]" role="alert">
            {problem}
          </p>
        ) : (
          <>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[13px] bg-[color:var(--color-ink)]">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay aria-hidden />
              <span aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[38%] -translate-y-1/2 rounded-[10px] border-2 border-[color:var(--color-surface)]" />
            </div>
            <p className="text-[14px] leading-[1.6] text-[color:var(--color-ink-soft)]" role="status">
              {phase === "starting" ? tc("loading") : t("scan.cameraHint")}
            </p>
          </>
        )}
        <button data-testid="pos-reg-scan-sheet-close" className="btn btn-ghost h-12 rounded-[13px] text-[15px]" type="button" autoFocus onClick={onClose}>
          {tc("cancel")}
        </button>
      </div>
    </RegisterDialog>
  );
}
