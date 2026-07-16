"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DnaFacts } from "@/lib/dna/schema";
import { QUESTIONS, nextQuestion } from "@/lib/dna/questions";
import { answerQuestion, interviewEnabledAction, interviewTurnAction } from "@/lib/dna/actions";
import type { InterviewTurn } from "@/lib/ai/interview";

// บทสัมภาษณ์ DNA — 2 โหมด สลับได้ตลอด:
//   1) โหมดคำถามตายตัว (tree จาก questions.ts) — ถามทีละข้อ
//   2) โหมดเล่าธุรกิจเอง (พิมพ์อิสระ) — LLM สัมภาษณ์แล้วสกัด DnaFacts (M4 · WO-0016)
//      ซ่อนโหมดนี้ถ้ายังไม่ได้เปิดชั้น AI (enabled:false)
// ทั้งสองโหมด: ตอบครบ → บันทึกข้อเท็จจริง → ไปหน้าพิมพ์เขียว

type Answers = Partial<DnaFacts>;

// แปลงคำตอบเป็นข้อความไทยสั้น ๆ สำหรับโชว์ในบทสนทนา
function answerLabel(qid: keyof DnaFacts, value: unknown): string {
  const q = QUESTIONS.find((x) => x.id === qid);
  if (q?.kind === "choice") {
    return q.choices?.find((c) => c.value === value)?.label ?? String(value);
  }
  if (q?.kind === "bool") return value ? "ใช่" : "ไม่";
  return String(value);
}

export function DnaWizard() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({});
  const [numDraft, setNumDraft] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ── โหมดเล่าธุรกิจเอง (พิมพ์อิสระ) ──
  const [mode, setMode] = useState<"fixed" | "free">("fixed");
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null); // null = ยังไม่รู้
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [chatDraft, setChatDraft] = useState<string>("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatPending, startChat] = useTransition();
  const probed = useRef(false);

  // เช็คตอนโหลดว่าชั้น AI เปิดไหม (เบา ๆ ไม่ยิง LLM) — คำถามเปิดบทสนทนาค่อยดึงตอน user เข้าโหมดจริง
  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    interviewEnabledAction()
      .then(setAiEnabled)
      .catch(() => setAiEnabled(false)); // ขัดข้อง = ซ่อนโหมดพิมพ์อิสระ ใช้โหมดคำถามตายตัวได้ปกติ
  }, []);

  // เข้าโหมดเล่าธุรกิจเองครั้งแรก → ค่อยขอคำถามเปิดบทสนทนา (จ่ายค่า LLM เฉพาะคนที่ใช้จริง)
  function enterFreeMode() {
    setMode("free");
    if (turns.length > 0 || chatPending) return;
    startChat(async () => {
      try {
        const res = await interviewTurnAction([]);
        if (!res.enabled) {
          setAiEnabled(false);
          setMode("fixed");
          return;
        }
        if (!res.done) setTurns([{ role: "assistant", content: res.question }]);
      } catch {
        setChatError("ขออภัย ระบบผู้ช่วยขัดข้องชั่วคราว ลองใหม่อีกครั้งนะครับ");
      }
    });
  }

  function sendChat() {
    const text = chatDraft.trim();
    if (!text || chatPending) return;
    const next: InterviewTurn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setChatDraft("");
    setChatError(null);
    startChat(async () => {
      try {
        const res = await interviewTurnAction(next);
        if (!res.enabled) {
          setAiEnabled(false);
          return;
        }
        if (res.done) {
          router.push("/app/dna/blueprint");
          return;
        }
        setTurns((prev) => [...prev, { role: "assistant", content: res.question }]);
      } catch {
        setChatError("ขออภัย ระบบผู้ช่วยขัดข้องชั่วคราว ลองส่งใหม่อีกครั้งนะครับ");
      }
    });
  }

  const current = useMemo(() => nextQuestion(answers), [answers]);
  const answeredOrder = QUESTIONS.filter((q) => answers[q.id] !== undefined);
  const answeredCount = answeredOrder.length;
  const total = QUESTIONS.length;

  function commit(next: Answers) {
    setError(null);
    setNumDraft("");
    const q = nextQuestion(next);
    if (q) {
      setAnswers(next);
      return;
    }
    // ครบแล้ว → บันทึก
    setAnswers(next);
    startTransition(async () => {
      const res = await answerQuestion(next);
      if (res.status === "saved") {
        router.push("/app/dna/blueprint");
      } else if (res.status === "error") {
        setError(res.message);
      }
    });
  }

  function pick(id: keyof DnaFacts, value: DnaFacts[keyof DnaFacts]) {
    commit({ ...answers, [id]: value });
  }

  function submitNumber() {
    if (!current || current.kind !== "number") return;
    const n = Number(numDraft);
    const min = current.min ?? 0;
    const max = current.max ?? Number.MAX_SAFE_INTEGER;
    if (!Number.isInteger(n) || n < min || n > max) {
      setError(`กรุณาใส่ตัวเลข ${min}–${max}`);
      return;
    }
    pick(current.id, n as DnaFacts[keyof DnaFacts]);
  }

  const done = !current;

  return (
    <div className="flex flex-col gap-6">
      {/* สลับโหมด — โชว์เฉพาะเมื่อชั้น AI เปิดใช้ */}
      {aiEnabled === true && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("fixed")}
            className={`btn min-h-[44px] flex-1 text-sm ${mode === "fixed" ? "btn-primary" : "btn-ghost"}`}
          >
            ตอบคำถามทีละข้อ
          </button>
          <button
            type="button"
            onClick={enterFreeMode}
            className={`btn min-h-[44px] flex-1 text-sm ${mode === "free" ? "btn-primary" : "btn-ghost"}`}
          >
            เล่าธุรกิจเอง
          </button>
        </div>
      )}

      {/* ── โหมดเล่าธุรกิจเอง (พิมพ์อิสระ) ── */}
      {mode === "free" && aiEnabled === true && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            {turns.map((t, i) =>
              t.role === "assistant" ? (
                <div
                  key={i}
                  className="max-w-[85%] self-start rounded-2xl rounded-tl-sm border bg-[color:var(--color-surface)] px-4 py-2.5 text-sm"
                >
                  {t.content}
                </div>
              ) : (
                <div
                  key={i}
                  className="max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-[color:var(--color-ink)] px-4 py-2.5 text-sm text-[color:var(--color-surface)]"
                >
                  {t.content}
                </div>
              ),
            )}
            {chatPending && (
              <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm border bg-[color:var(--color-surface)] px-4 py-2.5 text-sm text-[color:var(--color-muted)]">
                กำลังคิด…
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendChat();
              }}
              disabled={chatPending}
              placeholder="เล่าเรื่องกิจการของคุณ…"
              className="input min-h-[48px] flex-1 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={chatPending || chatDraft.trim() === ""}
              onClick={sendChat}
              className="btn btn-primary min-h-[48px] text-sm disabled:opacity-50"
            >
              ส่ง
            </button>
          </div>

          {chatError && <p className="text-sm text-[color:var(--color-danger)]">{chatError}</p>}
        </div>
      )}

      {/* ── โหมดคำถามตายตัว ── */}
      {mode === "fixed" && (
        <>
      {/* ความคืบหน้า */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
          <div
            className="h-full rounded-full bg-[color:var(--color-ink)] transition-all"
            style={{ width: `${Math.round((answeredCount / total) * 100)}%` }}
          />
        </div>
        <span className="text-xs text-[color:var(--color-muted)]">
          {answeredCount}/{total}
        </span>
      </div>

      {/* บทสนทนาที่ตอบแล้ว */}
      <div className="flex flex-col gap-4">
        {answeredOrder.map((q) => (
          <div key={q.id} className="flex flex-col gap-2">
            <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm border bg-[color:var(--color-surface)] px-4 py-2.5 text-sm">
              {q.ask}
            </div>
            <div className="max-w-[85%] self-end rounded-2xl rounded-tr-sm bg-[color:var(--color-ink)] px-4 py-2.5 text-sm text-[color:var(--color-surface)]">
              {answerLabel(q.id, answers[q.id])}
            </div>
          </div>
        ))}

        {/* คำถามปัจจุบัน */}
        {current && (
          <div className="flex flex-col gap-3">
            <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm border bg-[color:var(--color-surface)] px-4 py-2.5 text-sm">
              {current.ask}
            </div>

            {current.kind === "choice" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {current.choices?.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    disabled={pending}
                    onClick={() => pick(current.id, c.value as DnaFacts[keyof DnaFacts])}
                    className="min-h-[48px] rounded-xl border px-4 py-3 text-left text-sm hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {current.kind === "bool" && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pick(current.id, true as DnaFacts[keyof DnaFacts])}
                  className="min-h-[48px] flex-1 rounded-xl border px-4 py-3 text-sm hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
                >
                  ใช่
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pick(current.id, false as DnaFacts[keyof DnaFacts])}
                  className="min-h-[48px] flex-1 rounded-xl border px-4 py-3 text-sm hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
                >
                  ไม่
                </button>
              </div>
            )}

            {current.kind === "number" && (
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={current.min}
                  max={current.max}
                  value={numDraft}
                  autoFocus
                  onChange={(e) => setNumDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNumber();
                  }}
                  className="input min-h-[48px] flex-1"
                  placeholder={`${current.min ?? 0}–${current.max ?? ""}`}
                />
                <button
                  type="button"
                  disabled={pending || numDraft === ""}
                  onClick={submitNumber}
                  className="btn btn-primary min-h-[48px] text-sm disabled:opacity-50"
                >
                  ถัดไป
                </button>
              </div>
            )}
          </div>
        )}

        {done && (
          <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm border bg-[color:var(--color-surface)] px-4 py-2.5 text-sm">
            เยี่ยมเลยครับ 🎉 กำลังออกแบบพิมพ์เขียวระบบให้คุณ…
          </div>
        )}
      </div>

      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
        </>
      )}

      <div className="flex justify-center pt-2">
        <Link href="/app" className="text-sm text-[color:var(--color-muted)] underline">
          ข้ามไปหน้าหลัก
        </Link>
      </div>
    </div>
  );
}

export default DnaWizard;
