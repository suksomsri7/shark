"use client";

// composer.tsx — กล่องพิมพ์ของห้องแชท (WO-CV5 · แบบร่างจอ 2/3/4 + `.dcol2` ล่าง)
//
// 🔴 แยกออกจาก `inbox-client.tsx` เพราะไฟล์นั้นแตะ 1,400 บรรทัดแล้ว และกล่องพิมพ์เป็นก้อนที่
//    มี state ของตัวเองครบ (แผ่น ＋ · เมนู `/` · โหมดโน้ต) ⇒ อ่าน/แก้ทีละเรื่องได้โดยไม่ต้องเลื่อนหา
//    แต่ **ร่างข้อความไม่ได้อยู่ที่นี่** — ร่างต้องรอดตอนสลับห้อง จึงเก็บเป็น `drafts[conversationId]`
//    ที่ตัวแม่ (กติกาเดิมของรอบ WhatsApp ห้ามถอยหลัง)
//
// 🔴 มติที่ไฟล์นี้ต้องเคารพ
//    · V2 ห้ามมี emoji — ทุกไอคอนมาจากทะเบียน `<Icon name="…"/>`
//    · D4 ไมค์อยู่ในแถบ **เฉพาะมือถือ** · เดสก์ท็อปอัดเสียงผ่านแผ่น ＋ (แถบเดสก์ท็อปในแบบร่างไม่มีไมค์)
//    · โหมดโน้ตภายใน = **เปลี่ยนสีทั้งกล่อง + แถบเตือน** ไม่ใช่ช่องติ๊กเล็ก ๆ แบบเดิม
//      (ของเดิมเป็น checkbox ⇒ พลาดง่าย · โน้ตหลุดถึงลูกค้าคือความเสียหายที่กู้ไม่ได้)

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { searchQuickRepliesAction, applyQuickReplyAction } from "./quick-reply-actions";
import { shopLocationAction } from "./room-actions";
import { useVoiceRecorder, VoiceRecordingBar } from "./voice";

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** คำใบ้ใต้กล่องพิมพ์ — ยกจากแบบร่าง `.hint` ตรงตัว (ทางลัดที่ไม่มีใครบอก = ทางลัดที่ไม่มีใครใช้) */
const HINT = "Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่ · พิมพ์ / เพื่อเรียกคำตอบสำเร็จรูป";

export type ChatComposerProps = {
  systemId: string;
  conversationId: string;
  /** ร่างของห้องนี้ (ตัวแม่ถือไว้ — สลับห้องแล้วต้องยังอยู่) */
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  busy: boolean;
  files: File[];
  onPickFiles: (picked: FileList | null) => void;
  onRemoveFile: (index: number) => void;
  maxAttachmentBytes: number;
  acceptTypes: string;
  fileErr: string | null;
  formErr: string | null;
  isInternal: boolean;
  onToggleInternal: (on: boolean) => void;
  canSuggest: boolean;
  canTranslate: boolean;
  onSuggest: () => void;
  onTranslate: () => void;
  /**
   * ผู้เรียกอยากรู้ว่ามีการเริ่มอัดเสียง (เช่น ปิดแผ่นอื่นที่เปิดค้าง) — ไม่จำเป็นต้องส่ง
   * 🔴 ตัวอัดจริงอยู่ในกล่องพิมพ์เองแล้ว (WO-CV8) ไม่ได้พึ่ง prop นี้อีกต่อไป
   *    ของเดิม "ไม่ส่ง prop = ปุ่มกดไม่ได้" ถูกถอดทิ้ง เพราะตอนนี้เงื่อนไขที่แท้จริงคือ
   *    "ช่องทางนี้ส่งเสียงได้ไหม" ซึ่งถามจากเซิร์ฟเวอร์ ไม่ใช่จากผู้เรียกฝั่งจอ
   */
  onRecordStart?: () => void;
};

export function ChatComposer(props: ChatComposerProps) {
  const {
    systemId,
    conversationId,
    draft,
    onDraftChange,
    onSend,
    sending,
    busy,
    files,
    onPickFiles,
    onRemoveFile,
    maxAttachmentBytes,
    acceptTypes,
    fileErr,
    formErr,
    isInternal,
    onToggleInternal,
    canSuggest,
    canTranslate,
    onSuggest,
    onTranslate,
    onRecordStart,
  } = props;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [toolErr, setToolErr] = useState<string | null>(null);
  const [qrRows, setQrRows] = useState<
    { id: string; shortcut: string; title: string; body: string; usageCount: number }[]
  >([]);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const ready = draft.trim() !== "" || files.length > 0;

  // ── อัดข้อความเสียง (WO-CV8) ──
  // 🔴 ส่งเสร็จแล้วไม่ต้องบอกตัวแม่ให้ดึงใหม่: `sendVoiceReplyAction` ทั้ง revalidate และ
  //    ยิงสัญญาณ realtime ให้แล้ว (และห้องยัง poll อยู่) ⇒ ฟองเสียงขึ้นเองโดยไม่ต้องเพิ่ม prop
  const voice = useVoiceRecorder({ systemId, conversationId, isInternal });
  const recording = voice.phase === "recording";
  const micBlocked = voice.canSendAudio === false || !voice.recorderReady;
  const micReason = !voice.recorderReady
    ? "เบราว์เซอร์รุ่นนี้ยังอัดเสียงไม่ได้ — พิมพ์ข้อความหรือแนบไฟล์เสียงแทนได้เลย"
    : (voice.capabilityReason ?? undefined);

  /**
   * ชนิดไฟล์ของปุ่ม "รูปภาพ" / "ถ่ายรูป" — คัดเฉพาะรูป **จากทะเบียนเดียวกับที่เซิร์ฟเวอร์ตรวจ**
   * 🔴 ไม่ใช้การเหมารวมทุกชนิดรูป เพราะช่องเลือกจะยอมให้หยิบไฟล์ที่เซิร์ฟเวอร์ปฏิเสธ (TIFF/BMP)
   *    แล้วผู้ใช้จะรู้ว่าไฟล์ไม่ผ่าน **หลัง** อัปเสร็จ — บั๊กชนิดเดียวกับที่กติกา "ตรวจก่อนอัป" ห้ามไว้
   */
  const imageAccept = useMemo(() => {
    const onlyImages = acceptTypes
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.startsWith("image/"));
    return onlyImages.length > 0 ? onlyImages.join(",") : acceptTypes;
  }, [acceptTypes]);

  // ── เมนูคำตอบสำเร็จรูป: เปิดเมื่อร่างขึ้นต้นด้วย `/` (คลังอยู่ที่สาย D ทำไว้แล้ว) ──
  // 🔴 หน่วง 200ms กันยิงทุกตัวอักษร · ปิดทันทีที่ผู้ใช้ลบ `/` ทิ้ง (ไม่ค้างบังจอ)
  const slashOpen = draft.startsWith("/");
  useEffect(() => {
    if (!slashOpen || !conversationId) {
      setQrRows([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void searchQuickRepliesAction(systemId, conversationId, draft)
        .then((rows) => {
          if (alive) setQrRows(rows);
        })
        .catch(() => {
          if (alive) setQrRows([]);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [slashOpen, draft, systemId, conversationId]);

  // ตัวอย่างไฟล์: สร้าง object URL ครั้งเดียวต่อไฟล์ แล้วคืนหน่วยความจำเมื่อเปลี่ยน
  // (สร้างตอน render = รั่วรอบละใบทุก 5 วิ ตามจังหวะ poll ของตัวแม่)
  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => {
    return () => {
      for (const u of previews) if (u) URL.revokeObjectURL(u);
    };
  }, [previews]);

  const pickQuickReply = (id: string) => {
    setQrRows([]);
    void applyQuickReplyAction(systemId, conversationId, id)
      .then((res) => {
        if (res.ok && res.body !== undefined) {
          onDraftChange(res.body);
          taRef.current?.focus();
        } else {
          setToolErr(res.reason ?? "หยิบคำตอบสำเร็จรูปไม่สำเร็จ — ลองอีกครั้งได้เลย");
        }
      })
      .catch(() =>
        setToolErr("เครือข่ายขัดข้องระหว่างหยิบคำตอบสำเร็จรูป — กดอีกครั้งได้เลย"),
      );
  };

  const insertShopMap = () => {
    setSheetOpen(false);
    setToolErr(null);
    void shopLocationAction(systemId, conversationId)
      .then((res) => {
        if (res.ok && res.text) {
          onDraftChange(draft.trim() === "" ? res.text : `${draft}\n${res.text}`);
          taRef.current?.focus();
        } else {
          setToolErr(res.reason ?? "ยังส่งแผนที่ร้านไม่ได้ในตอนนี้");
        }
      })
      .catch(() => setToolErr("เครือข่ายขัดข้องระหว่างดึงแผนที่ร้าน — กดอีกครั้งได้เลย"));
  };

  const openQuickReplyMenu = () => {
    setSheetOpen(false);
    // ทางเดียวกับที่พิมพ์ `/` เอง — เมนูมีทางเข้าเดียว ไม่ใช่สองระบบที่ทำงานคนละแบบ
    onDraftChange(draft.startsWith("/") ? draft : "/");
    taRef.current?.focus();
  };

  const runTool = (fn: () => void) => {
    setSheetOpen(false);
    setToolErr(null);
    fn();
  };

  /** ปุ่มหนึ่งช่องในแผ่น ＋ (แบบร่าง `.gi` / `.gic` / `.gt`) */
  const Tool = ({
    icon,
    label,
    hot = false,
    onClick,
    disabled = false,
    className = "",
    title,
  }: {
    icon: Parameters<typeof Icon>[0]["name"];
    label: string;
    hot?: boolean;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    title?: string;
  }) => (
    <button
      type="button"
      data-qc="sheet-item"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex flex-col items-center gap-[7px] px-0.5 py-1.5 disabled:opacity-45 ${className}`}
    >
      <span
        className={`grid size-[50px] place-items-center rounded-[15px] ${
          hot
            ? "bg-[#eaf0fe] text-[color:var(--color-accent)]"
            : "bg-[color:var(--color-surface-2)] text-[#3f4652]"
        }`}
      >
        <Icon name={icon} size="lg" />
      </span>
      <span className="text-center text-[11px] leading-[1.25] text-[#4b5563]">{label}</span>
    </button>
  );

  return (
    <div
      data-qc="composer"
      className={`relative border-t p-2 ${
        isInternal
          ? "border-t-[color:var(--color-note-line)] bg-[color:var(--color-note)]"
          : "border-t-[color:var(--color-line)] bg-[color:var(--color-surface)]"
      }`}
    >
      {/* ── แผ่นเครื่องมือ ＋ (แบบร่างจอ 4) ── */}
      {sheetOpen && (
        <>
          <button
            type="button"
            aria-label="ปิดแผ่นเครื่องมือ"
            onClick={() => setSheetOpen(false)}
            className="fixed inset-0 z-20 cursor-default bg-[rgba(15,23,42,0.3)]"
          />
          <div
            data-qc="sheet"
            className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl bg-[color:var(--color-surface)] px-2.5 pb-4 pt-2 shadow-[0_-6px_26px_rgba(0,0,0,0.17)]">
            <span aria-hidden className="mx-auto mb-3.5 mt-0.5 block h-1 w-9 rounded-sm bg-[#dfe2e7]" />
            <div className="grid grid-cols-4 gap-x-1 gap-y-2">
              <Tool icon="image" label="รูปภาพ" onClick={() => runTool(() => imageRef.current?.click())} />
              <Tool icon="camera" label="ถ่ายรูป" onClick={() => runTool(() => cameraRef.current?.click())} />
              <Tool icon="clip" label="ไฟล์" onClick={() => runTool(() => fileRef.current?.click())} />
              <Tool icon="pin" label="แผนที่ร้าน" onClick={insertShopMap} />
              <Tool
                icon="sparkle"
                label="AI ช่วยร่าง"
                hot
                disabled={!canSuggest || busy}
                title={canSuggest ? undefined : "เปิดใช้ AI ช่วยร่างได้ที่หน้า “เชื่อมช่องทาง”"}
                onClick={() => runTool(onSuggest)}
              />
              <Tool
                icon="globe"
                label="แปลก่อนส่ง"
                hot
                disabled={!canTranslate || busy || draft.trim() === ""}
                title={canTranslate ? undefined : "เปิดใช้การแปลได้ที่หน้า “เชื่อมช่องทาง”"}
                onClick={() => runTool(onTranslate)}
              />
              <Tool icon="quick" label="คำตอบสำเร็จรูป" onClick={openQuickReplyMenu} />
              <Tool
                icon="lock"
                label="โน้ตภายใน"
                onClick={() => runTool(() => onToggleInternal(!isInternal))}
              />
              {/* 🔴 **ข้อขัดแย้งที่ต้องให้ Fable ตัดสิน** (เขียนไว้ในรายงานส่งมอบด้วย)
                  มติ D4 บอกว่าเดสก์ท็อปต้องอัดเสียงได้ผ่านแผ่นนี้ แต่แบบร่าง + ข้อสอบ
                  (CM-0.2 · VR-5.5) ล็อกไว้ว่าแผ่นนี้มี **8 ช่องพอดี**
                  ⇒ ใส่ช่องที่ 9 = ด่านแดงทันที · ตัดออก = เดสก์ท็อปยังอัดเสียงไม่ได้
                  รอบนี้ยังไม่มีตัวอัดจริง (WO-CV8 รอบ 4) จึงทำตามแบบร่างไว้ก่อน ไม่มีใครเสียของ */}
            </div>
          </div>
        </>
      )}

      {/* ── แถบเตือนโหมดโน้ตภายใน (แบบร่าง `.noteflag`) ── */}
      {isInternal && (
        <div className="mb-[7px] flex items-center gap-1.5 text-[11.5px] font-semibold text-[color:var(--color-note-ink)]">
          <Icon name="lock" size="sm" strokeWidth={2.1} className="size-3.5" />
          โหมดโน้ตภายใน — ลูกค้าจะไม่เห็นข้อความนี้
          <button
            type="button"
            onClick={() => onToggleInternal(false)}
            className="ml-auto underline font-normal"
          >
            ออกจากโหมด
          </button>
        </div>
      )}

      {formErr && (
        <p className="mb-1.5 text-xs text-[color:var(--color-danger)]" role="alert">
          {formErr}
        </p>
      )}
      {toolErr && (
        <p className="mb-1.5 text-xs text-[color:var(--color-danger)]" role="alert">
          {toolErr}
        </p>
      )}
      {/* ข้อผิดพลาดของการอัดเสียง — inline ใต้กล่องเดียวกัน ไม่ใช่ Alert เด้ง */}
      {voice.err && (
        <p className="mb-1.5 text-xs text-[color:var(--color-danger)]" role="alert">
          {voice.err}
        </p>
      )}

      {/* ── เมนูคำตอบสำเร็จรูปจากการพิมพ์ `/` ── */}
      {slashOpen && (
        <div className="mb-1.5 max-h-52 overflow-y-auto rounded-[11px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-1 shadow-lg">
          {qrRows.length === 0 ? (
            <p className="px-2 py-1.5 text-[11.5px] text-[color:var(--color-muted)]">
              พิมพ์ต่อเพื่อค้นคำตอบสำเร็จรูป — ยังไม่มีรายการที่ตรง (เพิ่มคลังได้ที่แท็บ “เชื่อมช่องทาง”)
            </p>
          ) : (
            qrRows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pickQuickReply(r.id)}
                className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-[color:var(--color-surface-2)]"
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">
                  <Icon name="quick" size="sm" className="shrink-0" />/{r.shortcut}
                  <span className="min-w-0 truncate font-normal text-[color:var(--color-muted)]">
                    {r.title}
                  </span>
                </span>
                <span className="line-clamp-2 text-[11.5px] text-[color:var(--color-muted)]">
                  {r.body}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── ตัวอย่างไฟล์ที่เลือกไว้ (ลบออกได้ก่อนส่ง) ── */}
      {files.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="flex items-center gap-1 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-1.5 py-1 text-[11px]"
            >
              {previews[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[i]!} alt={f.name} className="size-10 rounded object-cover" />
              ) : (
                <Icon name="clip" size="sm" />
              )}
              <span className="max-w-[9rem] truncate">{f.name}</span>
              <span className="text-[color:var(--color-muted)]">{mb(f.size)}</span>
              <button
                type="button"
                onClick={() => onRemoveFile(i)}
                aria-label={`เอาไฟล์ ${f.name} ออก`}
                className="text-[color:var(--color-danger)]"
              >
                <Icon name="x" size="sm" />
              </button>
            </span>
          ))}
        </div>
      )}
      {fileErr && (
        <p className="mb-1.5 text-xs text-[color:var(--color-danger)]" role="alert">
          {fileErr}
        </p>
      )}

      {/* ── ชิปทางลัดของเดสก์ท็อป (แบบร่าง `.dcol2 .comp .chips`) — มือถือใช้แผ่น ＋ แทน ── */}
      <div className="mb-2 hidden flex-wrap gap-1.5 lg:flex">
        {/* แบบร่างมี 4 ชิปเสมอ — ยังไม่เปิดใช้ = ปุ่มปิด + บอกที่เปิด (กติกาเดียวกับแผ่น ＋) ไม่ซ่อนจนไม่รู้ว่ามีฟีเจอร์ */}
        <button
          type="button"
          onClick={onSuggest}
          disabled={!canSuggest || busy}
          title={canSuggest ? undefined : "เปิดใช้ AI ช่วยร่างได้ที่หน้า “เชื่อมช่องทาง”"}
          className="flex items-center gap-1.5 rounded-lg bg-[#eaf0fe] px-2.5 py-1 text-[12.5px] font-semibold text-[color:var(--color-accent)] disabled:opacity-50"
        >
          <Icon name="sparkle" size="sm" />
          AI ร่างคำตอบ
        </button>
        <button
          type="button"
          onClick={openQuickReplyMenu}
          className="flex items-center gap-1.5 rounded-lg bg-[color:var(--color-surface-2)] px-2.5 py-1 text-[12.5px] text-[#4b5563]"
        >
          <Icon name="quick" size="sm" />
          คำตอบสำเร็จรูป
        </button>
        <button
          type="button"
          onClick={onTranslate}
          disabled={!canTranslate || busy || draft.trim() === ""}
          title={canTranslate ? undefined : "เปิดใช้การแปลได้ที่หน้า “เชื่อมช่องทาง”"}
          className="flex items-center gap-1.5 rounded-lg bg-[color:var(--color-surface-2)] px-2.5 py-1 text-[12.5px] text-[#4b5563] disabled:opacity-50"
        >
            <Icon name="globe" size="sm" />
            แปลก่อนส่ง
          </button>
        <button
          type="button"
          onClick={() => onToggleInternal(!isInternal)}
          aria-pressed={isInternal}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] ${
            isInternal
              ? "bg-[color:var(--color-note-line)] font-semibold text-[color:var(--color-note-ink)]"
              : "bg-[color:var(--color-surface-2)] text-[#4b5563]"
          }`}
        >
          <Icon name="lock" size="sm" />
          โน้ตภายใน
        </button>
      </div>

      {/* ── ช่องเลือกไฟล์ (ซ่อนไว้ · ตรวจขนาด/ชนิดก่อนอัปที่ตัวแม่) ── */}
      <input
        ref={imageRef}
        type="file"
        name="files"
        multiple
        accept={imageAccept}
        onChange={(e) => {
          onPickFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />
      {/* 🔴 `capture="environment"` = มือถือเปิดกล้องหลังจริง · เดสก์ท็อปตกเป็นเลือกไฟล์เอง */}
      <input
        ref={cameraRef}
        type="file"
        name="files"
        accept={imageAccept}
        capture="environment"
        onChange={(e) => {
          onPickFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />
      <input
        ref={fileRef}
        type="file"
        name="files"
        multiple
        accept={acceptTypes}
        onChange={(e) => {
          onPickFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />

      <VoiceRecordingBar
        phase={voice.phase}
        elapsedMs={voice.elapsedMs}
        onStop={voice.stop}
        onCancel={voice.cancel}
      />

      {/* ── แถบกล่องพิมพ์ (แบบร่าง `.cbar`) ── */}
      <div className="flex items-end gap-[7px]">
        <button
          type="button"
          data-qc="composer-plus"
          onClick={() => setSheetOpen((o) => !o)}
          aria-expanded={sheetOpen}
          aria-label="เครื่องมือเพิ่มเติม"
          className={`grid size-9 shrink-0 place-items-center rounded-[11px] ${
            isInternal
              ? "bg-[#fff5df] text-[color:var(--color-note-ink)]"
              : "bg-[color:var(--color-surface-2)] text-[#4b5563]"
          }`}
        >
          <Icon name="plus" />
        </button>

        <textarea
          ref={taRef}
          data-qc="composer-field"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่ (แบบร่าง `.hint`)
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={
            isInternal ? "เขียนโน้ตภายใน (ลูกค้าไม่เห็น)…" : "พิมพ์ข้อความ…"
          }
          aria-label={isInternal ? "โน้ตภายในของทีม" : "ข้อความตอบลูกค้า"}
          className={`max-h-32 min-h-9 flex-1 resize-y rounded-[11px] px-3 py-2 text-[14.5px] outline-none ${
            isInternal
              ? "bg-[#fff5df] text-[color:var(--color-note-ink)] placeholder:text-[color:var(--color-note-ink)]/60"
              : "bg-[color:var(--color-surface-2)] placeholder:text-[#9ca2ac]"
          }`}
        />

        {/* มติ D13 (1 ก.ย.): ไมค์อยู่ในแถบ **ทุกจอ** (แบบร่างเดสก์ท็อปเรนเดอร์ใหม่แล้ว) — ไม่มีช่องที่ 9 ในแผ่น ＋
            🔴 แตะ = เริ่มอัด · แตะซ้ำ = หยุดแล้วส่ง (เหตุผลที่ไม่ใช้ "กดค้าง" อยู่หัวไฟล์ voice.tsx)
            🔴 ปิดปุ่มเมื่อช่องทางส่งเสียงไม่ได้ **พร้อมบอกเหตุผล** — ปุ่มที่กดได้แต่ส่งไม่ออก = เสียงหายเงียบ ๆ */}
        <button
          type="button"
          data-qc="composer-mic"
          onClick={() => {
            if (recording) {
              voice.stop();
              return;
            }
            onRecordStart?.();
            void voice.start();
          }}
          // 🔴 ช่องทางที่ส่งเสียงไม่ได้: ทำให้ปุ่มจางลง + `aria-disabled` แต่ **ยังกดได้**
          //    เพราะปุ่มที่ `disabled` จริงจะกลืนการกดทิ้ง ⇒ บนมือถือ (ไม่มี hover ให้เห็น title)
          //    ผู้ใช้จะกดแล้วไม่มีอะไรเกิดขึ้นและไม่มีทางรู้เหตุผลเลย · กดแล้วต้องได้คำอธิบายเสมอ
          //    (`start()` เป็นคนตัดสินและตั้งข้อความอธิบายให้เอง — ไม่มีเงื่อนไขซ้ำสองที่)
          disabled={voice.phase === "asking" || voice.phase === "sending"}
          aria-disabled={micBlocked || undefined}
          aria-pressed={recording}
          aria-label={recording ? "หยุดอัดแล้วส่งข้อความเสียง" : "อัดข้อความเสียง"}
          title={micBlocked ? micReason : undefined}
          className={`grid size-9 shrink-0 place-items-center rounded-[11px] disabled:opacity-45 ${micBlocked ? "opacity-45" : ""} ${
            recording
              ? "bg-[color:var(--color-danger)] text-white"
              : isInternal
                ? "bg-[#fff5df] text-[color:var(--color-note-ink)]"
                : "bg-[color:var(--color-surface-2)] text-[#4b5563]"
          }`}
        >
          <Icon name="mic" />
        </button>

        {/* ปุ่มส่ง: เทาเมื่อไม่มีอะไรจะส่ง ติดสีเมื่อพร้อม (ปุ่มที่กดได้ตลอดแต่ไม่ทำอะไร = โกหกผู้ใช้) */}
        <button
          type="button"
          data-qc="composer-send"
          onClick={onSend}
          disabled={sending || busy || !ready}
          aria-label={sending ? "กำลังส่ง" : "ส่งข้อความ"}
          className={`grid size-9 shrink-0 place-items-center rounded-[11px] ${
            ready && !sending && !busy
              ? "bg-[color:var(--color-accent)] text-white shadow-[0_2px_8px_rgba(29,78,216,0.3)]"
              : "bg-[#e4e6ea] text-[#a9aeb7]"
          }`}
        >
          <Icon name="send" />
        </button>
      </div>

      {/* แบบร่างมือถือไม่มีบรรทัดนี้ — "Enter = ส่ง" ไม่มีความหมายกับคีย์บอร์ดมือถือ ⇒ โชว์ตั้งแต่ sm ขึ้นไป */}
      <p className="mt-1.5 hidden text-[11px] text-[color:var(--color-muted)] sm:block">{HINT}</p>
      <p className="sr-only">แนบไฟล์ได้ไม่เกิน {mb(maxAttachmentBytes)} ต่อไฟล์</p>
    </div>
  );
}

export default ChatComposer;
