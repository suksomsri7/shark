"use client";

// MemberAssistant.tsx — "ผู้ช่วย AI — สมาชิก" (M3.10 · ภาพ ledger/design-member/27-ai-panel-api.png ครึ่งซ้าย)
//
// จากบนลงล่างตามภาพ 27 ซ้าย:
//   หัว "ผู้ช่วย AI — สมาชิก" → บทสนทนา (คำถามขวา · คำตอบซ้ายพร้อมตารางผลค้นหา) → กล่อง "ข้อเสนอ (ยังไม่ทำ)"
//   (การกระทำ · ต้นทุนรวม · ยืนยัน / แก้ไข / ยกเลิก) → บรรทัด "เครื่องมือที่ใช้" → ช่องพิมพ์ + ส่ง
//
// 🔴 ไฟล์นี้เป็น client component: import ได้เฉพาะไฟล์บริสุทธิ์ (`assistant-shared.ts`) + server action
//    (ห้ามลากถึง prisma/facade — next build พัง · บทเรียน M3.1)
// 🔴 ข้อเสนอ "ยังไม่ทำ" จริง ๆ จนกว่าจะกดยืนยัน — ยืนยันด้วยสิทธิ์ของคนกด (ai/proposals · K3.5)
//    รายการที่ลบถาวร (DESTRUCTIVE) ต้องกดยืนยันซ้ำอีกครั้ง
// 🔴 ตารางในคำตอบมาจากตาราง markdown ที่ผู้ช่วยเขียน — แยกเป็นตารางจริง ไม่ render HTML ดิบ

import { useRef, useState, useTransition } from "react";
import { MemberIcon } from "@/components/member/MemberIcon";
import {
  cancelMemberProposalAction,
  confirmMemberProposalAction,
  sendMemberAssistantAction,
} from "@/lib/modules/member/assistant-actions";
import {
  parseAssistantContent,
  splitProposalSummary,
  tableWithNames,
  type AssistantBlock,
  type AssistantMessageDto,
  type AssistantProposalDto,
  type AssistantStateDto,
  type AssistantToolRef,
} from "@/lib/modules/member/assistant-shared";

type Props = {
  systemId: string;
  initial: AssistantStateDto;
  /** ร้านนี้มีผู้ให้บริการ AI ไหม (ไม่มี = แสดงข้อความแจ้ง · ยังพิมพ์ได้แต่จะได้คำตอบว่ายังไม่เปิดใช้) */
  enabled: boolean;
};

/** ตัวอย่างคำถาม (ปุ่มลัดเติมช่องพิมพ์ — ไม่ใช่ข้อมูลของร้าน) */
const SUGGESTIONS = [
  "ลูกค้า Gold ที่ไม่มา 60 วัน มีใครบ้าง",
  "สรุปรีวิวเดือนนี้ให้หน่อย",
  "ภาพรวมสมาชิกเดือนนี้เป็นอย่างไร",
  "ใครแนะนำเพื่อนมาได้มากที่สุด",
];

const muted = "text-[color:var(--color-muted)]";

function ToolsLine({ tools }: { tools: AssistantToolRef[] }) {
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1.5 text-xs ${muted}`} data-testid="member-assistant-tools">
      <MemberIcon name="gear" size="xs" />
      <span>เครื่องมือที่ใช้:</span>
      {tools.map((t) => (
        <code key={t.name} className="max-w-full break-all rounded-md border px-1.5 py-0.5 font-mono">
          {t.name}
          {t.pending ? " (รอยืนยัน)" : ""}
        </code>
      ))}
    </div>
  );
}

function ResultTable({ block, names }: { block: Extract<AssistantBlock, { type: "table" }>; names: Record<string, string> }) {
  // รหัสสมาชิก → "ชื่อ" คอลัมน์แรก (ชื่อ resolve ฝั่ง server ด้วยสิทธิ์ของคนเปิดหน้า · รหัสเป็นบรรทัดรอง)
  const t = tableWithNames(block, names);
  return (
    <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border" data-testid="member-assistant-result-table">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b" style={{ background: "var(--color-surface-2, var(--color-surface))" }}>
            {t.headers.map((h, i) => (
              <th key={i} className={`px-2 py-2 text-left text-xs font-medium sm:whitespace-nowrap sm:px-3 ${muted}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, r) => (
            <tr key={r} className="border-b last:border-b-0">
              {t.headers.map((_, c) => (
                <td key={c} className={`px-2 py-2 align-top sm:px-3 ${c === 0 ? "min-w-[5.5rem] break-words" : "sm:whitespace-nowrap"}`}>
                  {row.cells[c] ?? ""}
                  {c === 0 && row.sub ? <span className={`block font-mono text-xs ${muted}`}>{row.sub}</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssistantBubble({ blocks, names }: { blocks: AssistantBlock[]; names: Record<string, string> }) {
  const body = blocks.filter((b) => b.type !== "tools");
  if (body.length === 0) return null;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="mt-1 hidden h-7 w-7 shrink-0 place-items-center rounded-lg border sm:grid" aria-hidden>
        <MemberIcon name="sparkle" size="sm" />
      </span>
      <div className="card flex min-w-0 max-w-full flex-1 flex-col gap-3 p-3 sm:max-w-[85%]">
        {body.map((b, i) =>
          b.type === "text" ? (
            <p key={i} className="whitespace-pre-wrap break-words text-sm">
              {b.text}
            </p>
          ) : b.type === "table" ? (
            <ResultTable key={i} block={b} names={names} />
          ) : null,
        )}
      </div>
    </div>
  );
}

function UserBubble({ m }: { m: AssistantMessageDto }) {
  return (
    <div className="flex min-w-0 justify-end">
      <p
        className="max-w-full whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-sm sm:max-w-[80%]"
        style={{ background: "var(--color-accent-soft)", borderColor: "var(--color-accent-soft)" }}
      >
        {m.content}
      </p>
    </div>
  );
}

function ProposalBox({
  p,
  pending,
  confirmAgain,
  onConfirm,
  onEdit,
  onCancel,
}: {
  p: AssistantProposalDto;
  pending: boolean;
  confirmAgain: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const { action, cost } = splitProposalSummary(p.summary);
  return (
    <div
      className="flex min-w-0 flex-col gap-3 rounded-xl border p-4"
      style={{ background: "var(--color-accent-soft)", borderColor: "var(--color-accent)" }}
      data-testid="member-assistant-proposal"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--color-accent)" }}>
        <MemberIcon name="warn" size="sm" />
        ข้อเสนอ (ยังไม่ทำ)
      </div>
      <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1.5 text-sm md:grid-cols-[auto_minmax(0,1fr)]">
        <dt className={muted}>การกระทำ</dt>
        <dd className="min-w-0 break-words md:text-right">{action || p.summary}</dd>
        <dt className={muted}>ต้นทุนรวม</dt>
        <dd className="min-w-0 break-words font-medium md:text-right">{cost ?? "—"}</dd>
      </dl>
      {p.risk === "DESTRUCTIVE" && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }}>
          รายการนี้ย้อนกลับไม่ได้ — ระบบจะถามยืนยันซ้ำอีกครั้งก่อนลงมือ
        </p>
      )}
      {confirmAgain && (
        <p className="text-xs" style={{ color: "var(--color-danger)" }}>
          กด &quot;ยืนยันอีกครั้ง&quot; เพื่อทำรายการที่ย้อนกลับไม่ได้นี้
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={onConfirm} data-testid="member-assistant-confirm">
          {confirmAgain ? "ยืนยันอีกครั้ง" : "ยืนยัน"}
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onEdit} data-testid="member-assistant-edit">
          แก้ไข
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel} data-testid="member-assistant-cancel">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

export function MemberAssistant({ systemId, initial, enabled }: Props) {
  const [state, setState] = useState<AssistantStateDto>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [again, setAgain] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const lastAssistant = [...state.messages].reverse().find((m) => m.role === "ASSISTANT")?.id ?? null;
  const lastUserText = [...state.messages].reverse().find((m) => m.role === "USER")?.content ?? "";

  const remember = (next: AssistantStateDto) => {
    setState(next);
    if (next.conversationId && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("conversation") !== next.conversationId) {
        url.searchParams.set("conversation", next.conversationId);
        window.history.replaceState(null, "", url.toString());
      }
    }
  };

  const send = (value: string) => {
    const body = value.trim();
    if (!body) {
      setError("พิมพ์คำถามก่อนกดส่ง");
      return;
    }
    setError(null);
    setNote(null);
    start(async () => {
      const res = await sendMemberAssistantAction(systemId, state.conversationId, body);
      if (res.ok) {
        remember(res.data);
        setText("");
      } else setError(res.reason);
    });
  };

  const confirm = (p: AssistantProposalDto) => {
    if (!state.conversationId) return;
    const conversationId = state.conversationId;
    setNote(null);
    start(async () => {
      const res = await confirmMemberProposalAction(systemId, conversationId, p.id, again === p.id);
      if (res.needsSecondConfirm) {
        setAgain(p.id);
        return;
      }
      setAgain(null);
      if (res.state.conversationId) remember(res.state);
      setNote({ ok: res.ok, text: res.note });
    });
  };

  const cancel = (p: AssistantProposalDto, thenEdit: boolean) => {
    if (!state.conversationId) return;
    const conversationId = state.conversationId;
    setNote(null);
    start(async () => {
      const res = await cancelMemberProposalAction(systemId, conversationId, p.id);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      remember(res.data);
      setAgain(null);
      if (thenEdit) {
        setText(lastUserText);
        inputRef.current?.focus();
        setNote({ ok: true, text: "ยกเลิกข้อเสนอเดิมแล้ว — แก้คำสั่งในช่องด้านล่างแล้วกดส่งใหม่ได้เลย" });
      } else setNote({ ok: true, text: "ยกเลิกข้อเสนอแล้ว — ไม่มีอะไรเปลี่ยนแปลงในข้อมูลของร้าน" });
    });
  };

  return (
    <section className="card flex min-w-0 flex-col" data-testid="member-assistant">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <MemberIcon name="sparkle" size="sm" />
        <h2 className="text-sm font-medium">ผู้ช่วย AI — สมาชิก</h2>
      </div>

      <div className="flex min-w-0 flex-col gap-4 p-4" data-testid="member-assistant-messages">
        {!enabled && (
          <p className={`rounded-lg border p-3 text-sm ${muted}`}>
            ร้านนี้ยังไม่ได้เปิดผู้ช่วย AI — ติดต่อผู้ดูแลระบบเพื่อเปิดใช้งาน แล้วกลับมาถามเรื่องสมาชิกได้ที่หน้านี้
          </p>
        )}
        {state.messages.length === 0 && (
          <div className="flex min-w-0 flex-col gap-2">
            <p className={`text-sm ${muted}`}>
              ถามเรื่องสมาชิกได้เลย เช่น หาลูกค้าตามเงื่อนไข สรุปลูกค้าคนหนึ่ง ดูรีวิว หรือร่างแคมเปญ —
              ถ้าต้องเปลี่ยนข้อมูล ผู้ช่วยจะเสนอให้คุณกดยืนยันก่อนเสมอ
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="btn btn-ghost btn-sm max-w-full whitespace-normal text-left" onClick={() => setText(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {state.messages.map((m) => {
          if (m.role === "USER") return <UserBubble key={m.id} m={m} />;
          const blocks = parseAssistantContent(m.content);
          const tools = blocks.flatMap((b) => (b.type === "tools" ? b.tools : []));
          const isLast = m.id === lastAssistant;
          return (
            <div key={m.id} className="flex min-w-0 flex-col gap-3">
              <AssistantBubble blocks={blocks} names={state.memberNames} />
              {isLast &&
                state.proposals.map((p) => (
                  <ProposalBox
                    key={p.id}
                    p={p}
                    pending={pending}
                    confirmAgain={again === p.id}
                    onConfirm={() => confirm(p)}
                    onEdit={() => cancel(p, true)}
                    onCancel={() => cancel(p, false)}
                  />
                ))}
              {tools.length > 0 && <ToolsLine tools={tools} />}
            </div>
          );
        })}
        {lastAssistant === null &&
          state.proposals.map((p) => (
            <ProposalBox
              key={p.id}
              p={p}
              pending={pending}
              confirmAgain={again === p.id}
              onConfirm={() => confirm(p)}
              onEdit={() => cancel(p, true)}
              onCancel={() => cancel(p, false)}
            />
          ))}
        {note && (
          <p className="break-words text-sm" style={{ color: note.ok ? "var(--color-ink)" : "var(--color-danger)" }}>
            {note.text}
          </p>
        )}
        {pending && <p className={`text-sm ${muted}`}>กำลังทำงาน…</p>}
      </div>

      <form
        className="flex min-w-0 items-center gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          ref={inputRef}
          className="input min-w-0 flex-1"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder="ถามผู้ช่วย AI เกี่ยวกับสมาชิก..."
          aria-label="คำถามถึงผู้ช่วย AI"
          data-testid="member-assistant-input"
        />
        <button type="submit" className="btn btn-primary shrink-0" disabled={pending} data-testid="member-assistant-send">
          ส่ง
        </button>
      </form>
      {error && (
        <p className="px-3 pb-3 text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
