"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  confirmPlanAction,
  confirmProposalAction,
  listPendingProposalsAction,
  loadAiChatAction,
  loadPlansAction,
  rejectPlanAction,
  rejectProposalAction,
  sendAiMessageAction,
  type AiChatState,
  type PendingPlan,
  type PendingProposal,
} from "@/lib/ai/actions";

// แชทผู้ช่วย AI ใน sheet ของ AiDock — โหลดบทสนทนาล่าสุด + ส่งข้อความ (optimistic)
// Phase 3.5: การ์ดยืนยันใต้แชท — AI "เสนอ" การกระทำ user กด "ยืนยันทำเลย" หรือ "ยกเลิก"
// สถานะยังไม่เปิดใช้ (ไม่มี key) = แจ้งสุภาพ ไม่พัง

type ClarifyOption = { label: string; value: string };
type Msg = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  images?: string[];
  clarify?: { question: string; options: ClarifyOption[] };
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // ~2MB ต่อรูป (base64 dataURL)

export function AiChat() {
  const [state, setState] = useState<AiChatState | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [plans, setPlans] = useState<PendingPlan[]>([]);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // การ์ด destructive ที่ถูก "arm" ไว้ (กดยืนยันชั้นแรกแล้ว รอกดชั้นสอง)
  const [armedId, setArmedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // อ่านไฟล์รูปเป็น base64 dataURL (cap ~2MB) — ข้ามไฟล์ที่ใหญ่/ไม่ใช่รูป
  function onPickImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const list = Array.from(files);
    for (const file of list) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        setError("รูปต้องมีขนาดไม่เกิน 2MB ต่อรูป");
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = typeof reader.result === "string" ? reader.result : "";
        if (url) setImages((imgs) => [...imgs, url]);
      };
      reader.readAsDataURL(file);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeImage(idx: number) {
    setImages((imgs) => imgs.filter((_, i) => i !== idx));
  }

  useEffect(() => {
    loadAiChatAction()
      .then((s) => {
        setState(s);
        setMessages(s.messages);
        setProposals(s.pendingProposals);
        setPlans(s.pendingPlans);
      })
      .catch(() => {
        // โหลดพลาด/ช้า → เปิดแชทเปล่าให้ใช้งานได้เลย (ไม่ค้าง "กำลังโหลด" ตลอด)
        setState({ enabled: true, conversationId: null, messages: [], pendingProposals: [], pendingPlans: [] });
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, proposals, plans, pending]);

  // override = ส่งข้อความสำเร็จรูป (กดปุ่มตัวเลือกจาก ask_clarify) — ไม่มีรูปแนบ
  function send(override?: string) {
    const t = (override ?? text).trim();
    const imgs = override ? [] : images;
    // ส่งได้เมื่อมีข้อความหรือมีรูปแนบ — แนบรูปอย่างเดียว ใช้ข้อความเริ่มต้นให้ AI ช่วยอ่าน
    if ((!t && imgs.length === 0) || pending) return;
    const sendText = t || "ช่วยอ่านรูป/ใบเสร็จนี้ให้หน่อย";
    if (!override) {
      setText("");
      setImages([]);
    }
    setError(null);
    setNotice(null);
    setMessages((m) => [
      ...m,
      { id: `tmp-${m.length}`, role: "USER", content: sendText, images: imgs.length ? imgs : undefined },
    ]);
    startTransition(async () => {
      const res = await sendAiMessageAction({
        conversationId: state?.conversationId ?? undefined,
        text: sendText,
        ...(imgs.length ? { imageUrls: imgs } : {}),
      });
      if (res.ok) {
        setState((s) => (s ? { ...s, conversationId: res.conversationId } : s));
        setMessages((m) => [
          ...m,
          { id: `a-${m.length}`, role: "ASSISTANT", content: res.reply, clarify: res.clarify },
        ]);
        // LLM อาจเสนอ proposal/แผนใหม่ระหว่างตอบ → refresh การ์ดยืนยันเสมอ
        const [fresh, freshPlans] = await Promise.all([
          listPendingProposalsAction(res.conversationId),
          loadPlansAction(res.conversationId),
        ]);
        setProposals(fresh);
        setPlans(freshPlans);
      } else {
        setError(res.message);
      }
    });
  }

  // กดปุ่มยืนยันบนการ์ด — destructive ต้อง 2 จังหวะ (arm ก่อน แล้วกดซ้ำจึงทำจริง)
  function onConfirm(p: PendingProposal) {
    if (busyId) return;
    if (p.risk === "DESTRUCTIVE" && armedId !== p.id) {
      // จังหวะแรก — arm ไว้ (ยังไม่ยิง server) เปลี่ยนปุ่มเป็น "แน่ใจนะ? ลบถาวร"
      setArmedId(p.id);
      setError(null);
      setNotice(null);
      return;
    }
    doConfirm(p.id, p.risk === "DESTRUCTIVE");
  }

  function doConfirm(id: string, confirm2x: boolean) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await confirmProposalAction(id, confirm2x ? { confirm2x: true } : undefined);
      // server ยังกันชั้นสอง (เผื่อ risk ฝั่ง client ไม่ตรง) → arm ไว้ ไม่ลบการ์ด
      if (res.needsSecondConfirm) {
        setArmedId(id);
        setBusyId(null);
        return;
      }
      setProposals((ps) => ps.filter((p) => p.id !== id));
      setArmedId((a) => (a === id ? null : a));
      if (res.ok) setNotice(res.note);
      else setError(res.note);
      setBusyId(null);
    });
  }

  function reject(id: string) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await rejectProposalAction(id);
      setProposals((ps) => ps.filter((p) => p.id !== id));
      setArmedId((a) => (a === id ? null : a));
      setNotice(res.note);
      setBusyId(null);
    });
  }

  // กดปุ่ม "ทำทั้งหมด" บนการ์ดแผน — hasDestructive ต้อง 2 จังหวะ (arm ก่อน กดซ้ำจึงทำจริง)
  function onConfirmPlan(p: PendingPlan) {
    if (busyId) return;
    if (p.hasDestructive && armedId !== p.id) {
      setArmedId(p.id);
      setError(null);
      setNotice(null);
      return;
    }
    doConfirmPlan(p.id, p.hasDestructive);
  }

  function doConfirmPlan(id: string, confirm2x: boolean) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await confirmPlanAction(id, confirm2x ? { confirm2x: true } : undefined);
      // server ยังกันชั้นสอง (เผื่อ flag ฝั่ง client ไม่ตรง) → arm ไว้ ไม่ลบการ์ด
      if (res.needsSecondConfirm) {
        setArmedId(id);
        setBusyId(null);
        return;
      }
      setPlans((ps) => ps.filter((p) => p.id !== id));
      setArmedId((a) => (a === id ? null : a));
      if (res.ok) setNotice(res.note);
      else setError(res.note);
      setBusyId(null);
    });
  }

  function rejectPlanCard(id: string) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await rejectPlanAction(id);
      setPlans((ps) => ps.filter((p) => p.id !== id));
      setArmedId((a) => (a === id ? null : a));
      setNotice(res.note);
      setBusyId(null);
    });
  }

  if (!state) {
    return <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">กำลังโหลด…</p>;
  }

  if (!state.enabled) {
    return (
      <div className="card text-center">
        <div className="text-sm font-medium">เร็ว ๆ นี้</div>
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">
          ผู้ช่วย AI จะช่วยตอบคำถามและแนะนำระบบให้คุณ กำลังจะเปิดให้ใช้เร็ว ๆ นี้
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-[50vh] min-h-40 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">
            สวัสดีครับ ถามเรื่องการใช้งาน ให้ช่วยคิดเรื่องธุรกิจ หรือสั่งให้ช่วยทำรายการแทนได้เลย
          </p>
        )}
        {messages.map((m, idx) => (
          <div key={m.id} className="flex flex-col gap-1">
            <div
              className={
                m.role === "USER"
                  ? "ml-8 self-end rounded-2xl rounded-br-sm bg-[color:var(--color-ink)] px-3 py-2 text-sm text-[color:var(--color-surface)]"
                  : "mr-8 self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-[color:var(--color-surface-2)] px-3 py-2 text-sm"
              }
            >
              {m.images && m.images.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1">
                  {m.images.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt={`รูปแนบ ${i + 1}`}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
              {m.content}
            </div>
            {/* ตัวเลือกจาก ask_clarify — แสดงเฉพาะข้อความล่าสุด · กด = ส่ง value เป็นข้อความถัดไป */}
            {m.clarify && m.clarify.options.length > 0 && idx === messages.length - 1 && (
              <div className="mr-8 flex flex-wrap gap-2">
                {m.clarify.options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => send(opt.value)}
                    disabled={pending}
                    className="btn btn-ghost min-h-[40px] border border-[color:var(--color-ink)] disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {pending && !busyId && (
          <div className="mr-8 self-start rounded-2xl rounded-bl-sm bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-muted)]">
            กำลังคิด…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* การ์ดยืนยัน — AI เสนอ user ตัดสินใจ · DESTRUCTIVE = ยืนยัน 2 จังหวะ */}
      {proposals.map((p) => {
        const destructive = p.risk === "DESTRUCTIVE";
        const armed = armedId === p.id;
        const confirmLabel =
          busyId === p.id
            ? "กำลังทำ…"
            : destructive
              ? armed
                ? "แน่ใจนะ? ลบถาวร กดอีกครั้ง"
                : "ยืนยันลบ/ยกเลิก"
              : "ยืนยันทำเลย";
        return (
          <div
            key={p.id}
            className="rounded-xl border bg-[color:var(--color-surface-2)] p-3"
            style={destructive ? { borderColor: "var(--color-danger)" } : { borderColor: "var(--color-ink)" }}
          >
            <div
              className="text-xs font-medium"
              style={destructive ? { color: "var(--color-danger)" } : { color: "var(--color-muted)" }}
            >
              {destructive ? "ผู้ช่วยขอยืนยันการลบ/ยกเลิกถาวร" : "ผู้ช่วยขอยืนยันก่อนทำ"}
            </div>
            <p className="mt-1 text-sm">{p.summary}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onConfirm(p)}
                disabled={busyId === p.id}
                className={`btn min-h-[44px] flex-1 disabled:opacity-50 ${destructive ? "" : "btn-primary"}`}
                style={
                  destructive && armed
                    ? { background: "var(--color-danger)", color: "var(--color-surface)" }
                    : destructive
                      ? { borderColor: "var(--color-danger)", color: "var(--color-danger)" }
                      : undefined
                }
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                onClick={() => reject(p.id)}
                disabled={busyId === p.id}
                className="btn btn-ghost min-h-[44px] disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        );
      })}

      {/* การ์ดแผนหลายขั้น — แสดง title + ทุกขั้น + ปุ่มยืนยันครั้งเดียว "ทำทั้งหมด" · hasDestructive = 2 จังหวะแดง */}
      {plans.map((pl) => {
        const destructive = pl.hasDestructive;
        const armed = armedId === pl.id;
        const confirmLabel =
          busyId === pl.id
            ? "กำลังทำ…"
            : destructive
              ? armed
                ? "แน่ใจนะ? มีลบถาวร กดอีกครั้ง"
                : "ทำทั้งหมด (มีลบ/ยกเลิก)"
              : "ทำทั้งหมด";
        return (
          <div
            key={pl.id}
            className="rounded-xl border bg-[color:var(--color-surface-2)] p-3"
            style={destructive ? { borderColor: "var(--color-danger)" } : { borderColor: "var(--color-ink)" }}
          >
            <div
              className="text-xs font-medium"
              style={destructive ? { color: "var(--color-danger)" } : { color: "var(--color-muted)" }}
            >
              {destructive ? "ผู้ช่วยขอยืนยันแผน (มีรายการลบ/ยกเลิกถาวร)" : "ผู้ช่วยเสนอแผนงาน — ยืนยันครั้งเดียว ทำต่อเนื่อง"}
            </div>
            <p className="mt-1 text-sm font-medium">{pl.title}</p>
            <ol className="mt-2 flex flex-col gap-1">
              {pl.steps.map((st, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-[color:var(--color-muted)]">{i + 1}.</span>
                  <span>{st.summary}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => onConfirmPlan(pl)}
                disabled={busyId === pl.id}
                className={`btn min-h-[44px] flex-1 disabled:opacity-50 ${destructive ? "" : "btn-primary"}`}
                style={
                  destructive && armed
                    ? { background: "var(--color-danger)", color: "var(--color-surface)" }
                    : destructive
                      ? { borderColor: "var(--color-danger)", color: "var(--color-danger)" }
                      : undefined
                }
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                onClick={() => rejectPlanCard(pl.id)}
                disabled={busyId === pl.id}
                className="btn btn-ghost min-h-[44px] disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        );
      })}

      {notice && (
        <p className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-ink)]">
          {notice}
        </p>
      )}
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}

      {/* รูปที่แนบไว้ (รอส่ง) — แตะกากบาทเพื่อลบ */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`แนบ ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label="ลบรูป"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-ink)] text-xs text-[color:var(--color-surface)]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onPickImages(e.target.files)}
      />

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="แนบรูป"
          className="btn btn-ghost min-h-[44px] px-3"
        >
          รูป
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="พิมพ์ข้อความ…"
          className="min-h-[44px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-base"
        />
        <button
          type="submit"
          disabled={pending || (!text.trim() && images.length === 0)}
          className="btn btn-primary min-h-[44px] disabled:opacity-50"
        >
          ส่ง
        </button>
      </form>
    </div>
  );
}
