// CardLinks.tsx — บล็อก "เชื่อมข้อมูล SHARK" ในหลังการ์ด (K3.1 · ภาพ `ledger/design-kanban/03-card-back.png`
//                 บล็อกเหนือ "รายละเอียด" · พิมพ์เขียว §3.3/§9.1)
//
// แถวละ 1 การเชื่อม: ไอคอนชนิด · ชื่อ/คำอธิบายรอง · ชิปสถานะ · ลิงก์เปิดของจริงในโมดูลนั้น
// 🔴 แถวที่ผู้ดู **ไม่มีสิทธิ์** เข้าโมดูลปลายทาง ยังโชว์อยู่ (ให้รู้ว่ามีของผูกอยู่) แต่เป็นตัวเทา
//    "(ไม่มีสิทธิ์เข้าถึง)" และไม่มีลิงก์ — ฝั่ง server เป็นคนตัดข้อมูลทิ้งตั้งแต่ต้น (`listCardLinks`)
//    คอมโพเนนต์นี้จึงไม่มีทางเรนเดอร์ชื่อลูกค้า/ยอดเงินของคนที่ไม่มีสิทธิ์ แม้เขียนพลาด
// ⚠️ ห้ามใช้อีโมจิ — ไอคอนทุกตัวมาจาก <KanbanIcon>
"use client";

import { useEffect, useState } from "react";
import { KanbanIcon } from "./KanbanIcon";
import {
  addCardLinkAction,
  removeCardLinkAction,
  searchPartyForLinkAction,
} from "@/lib/modules/kanban/actions";
import type { CardLinkDto } from "@/lib/modules/kanban/types";

export function CardLinks({
  systemId,
  cardId,
  editable,
  links,
  openAddNonce,
  onChange,
  onToast,
}: {
  systemId: string;
  cardId: string;
  editable: boolean;
  links: CardLinkDto[];
  /** เพิ่มค่าทีละ 1 เมื่อกดชิป "เชื่อมข้อมูล SHARK" ในเมนู "เพิ่ม:" ของหัวการ์ด — 0 = ไม่เคยกด */
  openAddNonce?: number;
  onChange: (links: CardLinkDto[]) => void;
  onToast: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // ชิปในเมนู "เพิ่ม:" ของหัวการ์ดกดแล้วต้องกางป๊อปอัปเดียวกับปุ่ม "เพิ่มการเชื่อม" ในบล็อกนี้
  useEffect(() => {
    if (openAddNonce) setAdding(true);
  }, [openAddNonce]);

  const remove = (linkRowId: string) => {
    setConfirmId(null);
    setBusy(true);
    removeCardLinkAction({ systemId, cardId, linkRowId }).then((res) => {
      setBusy(false);
      if (!res.ok) {
        onToast(res.message || "ถอดการเชื่อมไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      onChange(res.links);
    });
  };

  return (
    <div data-testid="card-links" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <KanbanIcon name="link" size="sm" className="text-[color:var(--color-muted)]" />
        <span style={{ fontSize: 13, fontWeight: 700 }}>เชื่อมข้อมูล SHARK</span>
        <span className="flex-1" />
        {editable && (
          <button
            type="button"
            data-testid="card-link-add"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center rounded-lg border px-2 py-1"
            style={{ gap: 4, fontSize: 11.5, borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }}
          >
            <KanbanIcon name="plus" size="xs" />
            เพิ่มการเชื่อม
          </button>
        )}
      </div>

      {links.length === 0 && !adding && (
        <p style={{ fontSize: 11.5, color: "var(--color-muted)" }}>
          ยังไม่ได้เชื่อมกับข้อมูลอื่นในระบบ{editable ? " — กด “เพิ่มการเชื่อม” เพื่อผูกลูกค้าหรือลิงก์" : ""}
        </p>
      )}

      {links.map((l) => (
        <div
          key={l.id}
          data-testid="card-link-row"
          title={
            l.canView
              ? l.title
              : "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้ — ขอสิทธิ์ของโมดูลปลายทางจากเจ้าของร้านก่อนจึงจะเห็นรายละเอียด"
          }
          className="flex items-center rounded-lg border px-2 py-1.5"
          style={{ gap: 8, borderColor: "var(--color-line)", background: l.canView ? "var(--color-surface)" : "var(--color-surface-2)" }}
        >
          <KanbanIcon
            name={l.icon}
            size="sm"
            className={l.canView ? "text-[color:var(--color-muted)]" : "text-[color:var(--color-muted)] opacity-60"}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span
              className="truncate"
              style={{ fontSize: 12.5, fontWeight: 500, color: l.canView ? "var(--color-ink)" : "var(--color-muted)" }}
            >
              {l.title}
            </span>
            <span className="truncate" style={{ fontSize: 11, color: "var(--color-muted)" }}>
              {l.typeLabel}
              {l.subtitle ? ` · ${l.subtitle}` : ""}
            </span>
            {/* K3.4 — บอกล่วงหน้าว่าปิดงานแล้วจะมีอะไรไปโผล่ในห้องแชท (ไม่ใช่ให้ทีมเซอร์ไพรส์ทีหลัง) */}
            {l.linkType === "CHAT_CONVERSATION" && (
              <span style={{ fontSize: 10.5, color: "var(--color-muted)" }}>
                เมื่อปิดงาน ระบบจะแปะบันทึกในบทสนทนานี้ให้
              </span>
            )}
          </div>
          {l.status && (
            <span
              className="whitespace-nowrap"
              style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 5, color: "var(--color-accent)", background: "var(--color-out)" }}
            >
              {l.status}
            </span>
          )}
          {l.href && (
            <a
              href={l.href}
              target={l.linkType === "URL" ? "_blank" : undefined}
              rel={l.linkType === "URL" ? "noopener noreferrer" : undefined}
              className="inline-flex items-center"
              style={{ gap: 3, fontSize: 11.5, color: "var(--color-accent)" }}
            >
              เปิด
              <KanbanIcon name="ar" size="xs" />
            </a>
          )}
          {editable &&
            (confirmId === l.id ? (
              <span className="inline-flex items-center" style={{ gap: 5, fontSize: 11 }}>
                <button
                  type="button"
                  data-testid="card-link-remove-confirm"
                  onClick={() => remove(l.id)}
                  disabled={busy}
                  style={{ color: "var(--color-danger)" }}
                >
                  ถอดออก
                </button>
                <button type="button" onClick={() => setConfirmId(null)} style={{ color: "var(--color-muted)" }}>
                  ยกเลิก
                </button>
              </span>
            ) : (
              <button
                type="button"
                data-testid="card-link-remove"
                aria-label="ถอดการเชื่อมนี้"
                onClick={() => setConfirmId(l.id)}
                style={{ color: "var(--color-muted)" }}
              >
                <KanbanIcon name="x" size="xs" />
              </button>
            ))}
        </div>
      ))}

      {adding && editable && (
        <AddLinkPanel
          systemId={systemId}
          cardId={cardId}
          onDone={(next) => {
            setAdding(false);
            onChange(next);
          }}
          onCancel={() => setAdding(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

/**
 * ป๊อปอัป "เพิ่มการเชื่อม" — วันนี้เปิดให้เลือกเองได้ 2 ชนิด (สัญญา §K3.1):
 *   · **ลิงก์ภายนอก** (URL + ป้าย)  · **ผู้ติดต่อ** (ค้นจากชื่อ)
 * ชนิดที่เหลือเกิดจากการเชื่อมต่อ/กฎอัตโนมัติ (สร้างงานจากแชท · การ์ดจากฟอร์ม/อนุมัติ) ไม่ใช่คนพิมพ์เอง
 */
function AddLinkPanel({
  systemId,
  cardId,
  onDone,
  onCancel,
  onToast,
}: {
  systemId: string;
  cardId: string;
  onDone: (links: CardLinkDto[]) => void;
  onCancel: () => void;
  onToast: (message: string) => void;
}) {
  const [tab, setTab] = useState<"URL" | "PARTY">("URL");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = (linkType: "URL" | "PARTY", linkId: string, caption?: string) => {
    if (!linkId.trim()) return;
    setBusy(true);
    addCardLinkAction({ systemId, cardId, linkType, linkId: linkId.trim(), label: caption?.trim() || undefined }).then((res) => {
      setBusy(false);
      if (!res.ok) {
        onToast(res.message || "เชื่อมข้อมูลไม่สำเร็จ");
        return;
      }
      onDone(res.links);
    });
  };

  const search = (value: string) => {
    setQ(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    searchPartyForLinkAction({ systemId, q: value }).then((res) => {
      if (res.ok) setResults(res.results);
    });
  };

  return (
    <div
      data-testid="card-link-add-panel"
      className="flex flex-col gap-2 rounded-lg border p-2"
      style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}
    >
      <div className="flex items-center" style={{ gap: 6 }}>
        {(["URL", "PARTY"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="rounded-md px-2 py-1"
            style={{
              fontSize: 11.5,
              color: tab === t ? "var(--color-accent)" : "var(--color-muted)",
              background: tab === t ? "var(--color-out)" : "transparent",
            }}
          >
            {t === "URL" ? "ลิงก์ภายนอก" : "ผู้ติดต่อ"}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={onCancel} aria-label="ปิด" style={{ color: "var(--color-muted)" }}>
          <KanbanIcon name="x" size="xs" />
        </button>
      </div>

      {tab === "URL" ? (
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus
            data-testid="card-link-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-md border px-2 py-1"
            style={{ fontSize: 12.5, borderColor: "var(--color-line)" }}
          />
          <input
            data-testid="card-link-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ป้ายกำกับ (ไม่ใส่ก็ได้)"
            maxLength={120}
            className="w-full rounded-md border px-2 py-1"
            style={{ fontSize: 12.5, borderColor: "var(--color-line)" }}
          />
          <button
            type="button"
            data-testid="card-link-submit"
            disabled={busy || !url.trim()}
            onClick={() => submit("URL", url, label)}
            className="self-start rounded-md px-3 py-1"
            style={{ fontSize: 12, color: "#fff", background: "var(--color-accent)", opacity: busy || !url.trim() ? 0.5 : 1 }}
          >
            เชื่อมลิงก์
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus
            data-testid="card-link-party-search"
            value={q}
            onChange={(e) => search(e.target.value)}
            placeholder="พิมพ์ชื่อผู้ติดต่อ…"
            className="w-full rounded-md border px-2 py-1"
            style={{ fontSize: 12.5, borderColor: "var(--color-line)" }}
          />
          {q.trim().length >= 2 && results.length === 0 && (
            <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>ไม่พบผู้ติดต่อชื่อนี้ในร้าน</span>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={busy}
              onClick={() => submit("PARTY", r.id, r.name)}
              className="rounded-md border px-2 py-1 text-left"
              style={{ fontSize: 12.5, borderColor: "var(--color-line)", background: "var(--color-surface)" }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default CardLinks;
