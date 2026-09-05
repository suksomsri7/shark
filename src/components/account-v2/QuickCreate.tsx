"use client";

// QuickCreate.tsx — แผง "สร้างด่วน / ค้นหา" (⌘K) ของ shell บัญชี V2 (WO 9.4 §0.3 ข้อ 3)
//
// เปิดได้ 3 ทาง: (1) ⌘K / Ctrl+K จากทุกหน้าในโมดูลบัญชี (2) ปุ่ม "+ สร้างเอกสาร" เดิม (DashCreateMenu) เป็น
// ทางเข้ารอง — เดสก์ท็อป: ลิงก์ท้าย dropdown เดิม · มือถือ: ปุ่มเต็มความกว้างเปิดแผงนี้ตรง ๆ แทนป็อปอัปเดิม
// (3) event `window.dispatchEvent(new Event(QUICK_CREATE_OPEN_EVENT))` จากที่ไหนก็ได้ (ใช้จากหน้า /account/help)
//
// พิมพ์ข้อความอิสระ → แปลด้วย quick-create-parse.ts (pure, ทดสอบแยกได้) → ถ้าตรงคำชนิดเอกสาร แสดงแถว
// "สร้าง<ชนิด>" + (ถ้ามีชื่อผู้ติดต่อ) ค้นหาแบบ fuzzy จริงผ่าน searchContactsAction (เดิมมีอยู่แล้วจาก WO 1.3/7.2)
// ไม่ตรงคำชนิดเอกสาร → fuzzy match กับเมนู nav.ts (ผู้ติดต่อ/กระทบยอด/ตั้งค่าฯลฯ) · ว่างเปล่า → เอกสารล่าสุด 5 ใบ
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { AccountIcon } from "./AccountIcon";
import { ACCOUNT_NAV, type AccountNavGroup } from "@/lib/modules/account/nav";
import { parseQuickCreateQuery, type QuickCreateDocTypeDef } from "@/lib/modules/account/quick-create-parse";
import { searchContactsAction } from "@/lib/modules/account/editor-actions";
import { quickCreateRecentDocsAction, type QuickCreateRecentDoc } from "@/lib/modules/account/quick-create-actions";
import type { ContactOption } from "./doc-editor-types";
import { formatBaht } from "@/lib/ui/money";

/** ทริกเกอร์เปิดแผงจากที่อื่น (ปุ่ม "+" มือถือ · หน้า /account/help) — ไม่ต้องส่ง props ข้าม tree */
export const QUICK_CREATE_OPEN_EVENT = "acc:quickcreate-open";
export function openQuickCreate() {
  window.dispatchEvent(new Event(QUICK_CREATE_OPEN_EVENT));
}

type NavHit = { kind: "nav"; label: string; sub?: string; href: string };
type CreateHit = { kind: "create"; label: string; sub?: string; href: string };
type ContactHit = { kind: "contact"; label: string; sub?: string; href: string };
type RecentHit = { kind: "recent"; label: string; sub?: string; href: string };
type Hit = NavHit | CreateHit | ContactHit | RecentHit;

function flattenNav(groups: AccountNavGroup[], base: string): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [{ label: "วิธีใช้งาน / คู่มือเริ่มต้น", href: `${base}/help` }];
  for (const g of groups) {
    for (const item of g.items) {
      if (item.status !== "ready") continue;
      out.push({ label: `${g.label} · ${item.label}`, href: item.href });
      for (const f of item.flyout ?? []) {
        if (f.label.startsWith("+ ")) continue; // ทางลัดสร้างเอกสาร — ผู้ใช้ควรพิมพ์คำสั่งสร้างแทน ไม่ใช่เดินเมนู
        out.push({ label: `${g.label} · ${item.label} · ${f.label}`, href: f.href });
      }
    }
  }
  return out;
}

function fuzzyMatch(query: string, haystack: string): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const h = haystack.toLowerCase();
  return tokens.every((t) => h.includes(t));
}

export function QuickCreate({
  base,
  systemId,
  vatRegistered,
  createDocTypes,
}: {
  base: string;
  systemId: string;
  vatRegistered: boolean;
  /** ชนิดเอกสารที่สร้างตรงได้ (canCreateDirect && ไม่ใช่เอกสารกลุ่ม) — คำนวณฝั่ง server จาก doc-editor-config.ts */
  createDocTypes: QuickCreateDocTypeDef[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [contactMatches, setContactMatches] = useState<ContactOption[]>([]);
  const [recentDocs, setRecentDocs] = useState<QuickCreateRecentDoc[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navGroups = useMemo(() => ACCOUNT_NAV(base, vatRegistered), [base, vatRegistered]);
  const navFlat = useMemo(() => flattenNav(navGroups, base), [navGroups, base]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setContactMatches([]);
  };

  // ⌘K / Ctrl+K — ทำงานได้ทุกที่ในโมดูลบัญชี (แม้กำลังพิมพ์อยู่ในช่องอื่น เหมือน command palette ทั่วไป)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(QUICK_CREATE_OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(QUICK_CREATE_OPEN_EVENT, onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // เอกสารล่าสุด — โหลดครั้งเดียวตอนเปิดแผง (ไม่กระทบงบ query ของหน้าอื่น)
  useEffect(() => {
    if (open && recentDocs === null) {
      quickCreateRecentDocsAction(systemId)
        .then(setRecentDocs)
        .catch(() => setRecentDocs([]));
    }
  }, [open, recentDocs, systemId]);

  const parsed = useMemo(() => parseQuickCreateQuery(query, createDocTypes), [query, createDocTypes]);

  // ค้นหาผู้ติดต่อแบบ fuzzy จริง — debounce 250ms เฉพาะตอนพาร์สได้ชนิดเอกสาร + มีข้อความชื่อให้ค้น
  useEffect(() => {
    if (!parsed || !parsed.contactQuery) {
      setContactMatches([]);
      return;
    }
    const q = parsed.contactQuery;
    const t = setTimeout(() => {
      searchContactsAction(systemId, q)
        .then((rows) => setContactMatches(rows.slice(0, 5)))
        .catch(() => setContactMatches([]));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parsed เปลี่ยนทุกตัวอักษร ใช้แค่ contactQuery/docType
  }, [parsed?.contactQuery, parsed?.def.docType, systemId]);

  const createHref = (contactId?: string): string => {
    if (!parsed) return "#";
    const p = new URLSearchParams();
    p.set("docType", parsed.def.docType);
    if (contactId) p.set("contactId", contactId);
    if (parsed.amountSatang != null) p.set("amount", (parsed.amountSatang / 100).toString());
    return `${base}/${parsed.def.route}/new?${p.toString()}`;
  };

  const hits: Hit[] = useMemo(() => {
    const out: Hit[] = [];
    if (parsed) {
      const amountText = parsed.amountSatang != null ? ` · ${formatBaht(parsed.amountSatang, { decimals: true })}` : "";
      out.push({
        kind: "create",
        label: `+ สร้าง${parsed.def.label}${parsed.contactQuery ? ` — ${parsed.contactQuery}` : ""}`,
        sub: amountText ? amountText.replace(" · ", "") : "ยังไม่ระบุจำนวนเงิน",
        href: createHref(),
      });
      for (const c of contactMatches) {
        out.push({ kind: "contact", label: `→ ${c.name}`, sub: c.sub, href: createHref(c.id) });
      }
    } else if (query.trim()) {
      for (const n of navFlat) {
        if (fuzzyMatch(query, n.label)) out.push({ kind: "nav", label: n.label, href: n.href });
      }
    } else {
      for (const n of navFlat.slice(0, 6)) out.push({ kind: "nav", label: n.label, href: n.href });
      for (const d of recentDocs ?? []) {
        out.push({
          kind: "recent",
          label: `${d.docTypeLabel} ${d.docNo ?? "(ร่าง)"}`,
          sub: `${d.contactName} · ${formatBaht(d.grandTotal, { decimals: true })} · ${d.statusLabel}`,
          href: `${base}/docs/${d.docType}/${d.id}`,
        });
      }
    }
    return out.slice(0, 12);
  }, [parsed, contactMatches, query, navFlat, recentDocs, base]);

  useEffect(() => setActiveIndex(0), [query, contactMatches.length]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) go(hit.href);
    }
  };

  return (
    <Modal open={open} onClose={close} title="สร้างด่วน / ค้นหา" size="lg" sheetOnMobile testId="quickcreate-modal">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <AccountIcon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-muted)]"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='พิมพ์เช่น "ใบแจ้งหนี้ ณัฐพล 24900" หรือชื่อหน้าที่ต้องการ (TH/EN)'
            className="w-full rounded-lg border px-9 py-2.5 text-sm outline-none"
            style={{ borderColor: "var(--color-line)" }}
            data-testid="quickcreate-input"
            aria-label="สร้างด่วน / ค้นหา"
          />
        </div>

        {hits.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-[color:var(--color-muted)]" data-testid="quickcreate-empty">
            {query.trim() ? "ไม่พบคำสั่ง/หน้าที่ตรงกัน — ลองพิมพ์ชนิดเอกสารเช่น \"ใบแจ้งหนี้\" หรือชื่อหน้า" : "พิมพ์เพื่อค้นหา หรือเลือกจากรายการด้านล่าง"}
          </p>
        ) : (
          <ul role="listbox" className="flex flex-col gap-0.5" data-testid="quickcreate-results">
            {hits.map((hit, i) => (
              <li key={`${hit.kind}-${hit.href}-${i}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => go(hit.href)}
                  data-testid={`quickcreate-hit-${i}`}
                  className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm"
                  style={i === activeIndex ? { background: "var(--color-surface-2)" } : undefined}
                >
                  <span className="font-medium">{hit.label}</span>
                  {hit.sub && <span className="text-xs text-[color:var(--color-muted)]">{hit.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="px-1 text-xs text-[color:var(--color-muted)]">
          ↑↓ เลือก · Enter ไปที่รายการ · Esc ปิด · เปิดแผงนี้ได้ทุกที่ด้วย ⌘K (Ctrl+K บน Windows)
        </p>
      </div>
    </Modal>
  );
}

export default QuickCreate;
