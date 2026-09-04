"use client";

// ChartPanel — หน้าผังบัญชี V2 (WO 6.1 · DESIGN-SPEC-V2 §11.1)
// เฟรมอ้างอิง: docs/design/account-v2/f8-chart-of-accounts.png (+ f8-chart-of-accounts-menu.png = เมนูบัญชีของ shell)
// checklist ไล่ทีละองค์ประกอบอยู่ใน ledger/wo-notes/6.1.md
//
// โครงตาม f8: หัวหน้า (ชื่อ + จำนวนบัญชี + 4 ปุ่ม) · ซ้าย = การ์ด "รายการบัญชี" (ค้นหา + ต้นไม้ 3 ระดับ)
//              ขวา = การ์ดรายละเอียด + การ์ด "เคลื่อนไหวล่าสุด" (ส่งเข้ามาเป็น prop จาก server component)
// มือถือ 390 (แบบ f13): เห็นทีละอย่าง — ยังไม่เลือก = ต้นไม้เต็มจอ · เลือกแล้ว = แผ่นรายละเอียดเต็มจอ + ปุ่มย้อนกลับ

import { useMemo, useState } from "react";
import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { RowActions } from "./RowActions";
import type { ChartTree, ChartGroupNode, ChartAccountNode } from "@/lib/modules/account/coa-v2";

function matches(a: ChartAccountNode, needle: string): boolean {
  if (!needle) return true;
  return (
    a.code.toLowerCase().includes(needle) ||
    a.name.toLowerCase().includes(needle) ||
    (a.nameEn ?? "").toLowerCase().includes(needle)
  );
}

/** กรองต้นไม้ตามคำค้นฝั่งเบราว์เซอร์ (ผังบัญชีทั้งร้าน ≈ 50 แถว — ค้นแล้วเห็นผลทันทีไม่ต้องโหลดหน้าใหม่) */
function filterTree(tree: ChartTree, q: string): { nodes: ChartGroupNode[]; total: number } {
  const needle = q.trim().toLowerCase();
  if (!needle) return { nodes: tree.nodes, total: tree.total };
  let total = 0;
  const nodes: ChartGroupNode[] = [];
  for (const g1 of tree.nodes) {
    const l2: ChartGroupNode[] = [];
    for (const g2 of g1.children as ChartGroupNode[]) {
      const l3: ChartGroupNode[] = [];
      for (const g3 of g2.children as ChartGroupNode[]) {
        const accounts = (g3.children as ChartAccountNode[]).filter((a) => matches(a, needle));
        if (accounts.length) l3.push({ ...g3, children: accounts, count: accounts.length });
      }
      if (l3.length) l2.push({ ...g2, children: l3, count: l3.reduce((n, g) => n + g.count, 0) });
    }
    if (l2.length) {
      nodes.push({ ...g1, children: l2, count: l2.reduce((n, g) => n + g.count, 0) });
      total += l2.reduce((n, g) => n + g.count, 0);
    }
  }
  return { nodes, total };
}

/** คีย์ของกิ่งทั้งหมด (ใช้ตอน "ขยายทั้งหมด" / ค้นหา) */
function allGroupKeys(nodes: ChartGroupNode[]): string[] {
  const out: string[] = [];
  for (const g1 of nodes) {
    out.push(g1.key);
    for (const g2 of g1.children as ChartGroupNode[]) {
      out.push(g2.key);
      for (const g3 of g2.children as ChartGroupNode[]) out.push(g3.key);
    }
  }
  return out;
}

/** กิ่งที่ต้องกางเพื่อให้เห็นบัญชีที่เลือกอยู่ (f8: กางเฉพาะสายของบัญชีที่เลือก ที่เหลือหุบ) */
function pathToSelected(nodes: ChartGroupNode[], selectedId: string | null): string[] {
  if (!selectedId) return [];
  for (const g1 of nodes) {
    for (const g2 of g1.children as ChartGroupNode[]) {
      for (const g3 of g2.children as ChartGroupNode[]) {
        if ((g3.children as ChartAccountNode[]).some((a) => a.id === selectedId)) return [g1.key, g2.key, g3.key];
      }
    }
  }
  return [];
}

export function ChartPanel({
  tree,
  selectedId,
  explicitSelection,
  accountHrefPrefix,
  listHref,
  createHref,
  financeHref,
  importHref,
  printHref,
  initialQ,
  canManage,
  detail,
}: {
  tree: ChartTree;
  selectedId: string | null;
  /** ผู้ใช้กดเลือกเอง (มี ?a= ใน URL) — บนมือถือถึงจะสลับไปหน้ารายละเอียด */
  explicitSelection: boolean;
  /** คำนำหน้าลิงก์ของแต่ละบัญชี — ต่อ id ท้ายสุด (ส่งเป็นสตริงเพราะ prop ข้าม server→client ต้อง serialize ได้) */
  accountHrefPrefix: string;
  /** ลิงก์กลับไปหน้ารายการ (ไม่มีบัญชีที่เลือก) — ใช้บนมือถือ */
  listHref: string;
  createHref: string;
  financeHref: string;
  importHref: string;
  printHref: string;
  initialQ: string;
  canManage: boolean;
  detail: React.ReactNode;
}) {
  const [q, setQ] = useState(initialQ);
  const [manual, setManual] = useState<Set<string> | null>(null);

  const view = useMemo(() => filterTree(tree, q), [tree, q]);
  const searching = q.trim().length > 0;

  const expanded = useMemo(() => {
    if (searching) return new Set(allGroupKeys(view.nodes)); // ค้นหา = กางให้เห็นผลทุกอัน
    if (manual) return manual;
    return new Set(pathToSelected(tree.nodes, selectedId));
  }, [searching, view.nodes, manual, tree.nodes, selectedId]);

  const allKeys = useMemo(() => allGroupKeys(tree.nodes), [tree.nodes]);
  const allExpanded = expanded.size >= allKeys.length && allKeys.length > 0;

  function toggle(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setManual(next);
  }

  function toggleAll() {
    setManual(allExpanded ? new Set<string>() : new Set(allKeys));
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      {/* ── หัวหน้า (f8): "ผังบัญชี" + จำนวนบัญชีบรรทัดเดียวกัน + ปุ่ม 4 ตัวชิดขวา ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">ผังบัญชี</h1>
          <span className="text-sm text-[color:var(--color-muted)]" data-testid="coa-total">
            {tree.grandTotal} บัญชี
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* เดสก์ท็อป: ปุ่มครบ 4 ตัวตาม f8 · มือถือ (f13): เหลือปุ่มดำ + เมนู "⋯" เหมือนหน้าอื่นของ V2 */}
          <Link href={importHref} className="btn-sm hidden items-center gap-1.5 md:inline-flex" data-testid="coa-import-btn">
            <AccountIcon name="import" className="h-4 w-4" /> นำเข้าผังบัญชี
          </Link>
          <Link href={printHref} className="btn-sm hidden items-center gap-1.5 md:inline-flex" data-testid="coa-print-btn">
            <AccountIcon name="printer" className="h-4 w-4" /> พิมพ์
          </Link>
          <Link href={financeHref} className="btn-sm hidden items-center gap-1.5 md:inline-flex" data-testid="coa-add-finance-btn">
            <AccountIcon name="plus" className="h-4 w-4" /> เพิ่มบัญชีเงิน
          </Link>
          {canManage && (
            <Link href={createHref} className="btn btn-primary inline-flex items-center gap-1.5" data-testid="coa-create-btn">
              <AccountIcon name="plus" className="h-4 w-4" /> เพิ่มบัญชี
            </Link>
          )}
          <span className="md:hidden">
            <RowActions
              label="เพิ่มเติม"
              testId="coa-mobile-overflow"
              items={[
                { label: "นำเข้าผังบัญชี", icon: "import", href: importHref },
                { label: "พิมพ์", icon: "printer", href: printHref },
                { label: "เพิ่มบัญชีเงิน", icon: "plus", href: financeHref },
              ]}
            />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        {/* ── ซ้าย: การ์ด "รายการบัญชี" ── */}
        <section
          className={`card flex flex-col gap-3 self-start ${explicitSelection ? "hidden md:flex" : "flex"}`}
          data-testid="coa-tree-card"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">รายการบัญชี</h2>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm text-[color:var(--color-accent)] hover:underline"
              data-testid="coa-toggle-all"
            >
              ย่อ/ขยายทั้งหมด
            </button>
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-muted)]">
              <AccountIcon name="search" className="h-4 w-4" />
            </span>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setManual(null);
              }}
              placeholder="ค้นหาชื่อหรือเลขที่บัญชี"
              aria-label="ค้นหาชื่อหรือเลขที่บัญชี"
              className="input pl-9"
              data-testid="coa-search"
            />
          </div>

          {view.nodes.length === 0 ? (
            <p className="py-6 text-center text-sm text-[color:var(--color-muted)]" data-testid="coa-empty">
              ไม่พบบัญชีที่ตรงกับ “{q}”
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-sm" data-testid="coa-tree">
              {view.nodes.map((g1) => (
                <TreeGroup
                  key={g1.key}
                  node={g1}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggle}
                  selectedId={selectedId}
                  accountHrefPrefix={accountHrefPrefix}
                />
              ))}
            </ul>
          )}
          {searching && (
            <p className="text-xs text-[color:var(--color-muted)]" data-testid="coa-search-count">
              พบ {view.total} บัญชี
            </p>
          )}
        </section>

        {/* ── ขวา: รายละเอียดบัญชีที่เลือก (server component ส่งเข้ามา) ── */}
        <div className={`flex flex-col gap-4 ${explicitSelection ? "flex" : "hidden md:flex"}`} data-testid="coa-detail-col">
          {explicitSelection && (
            <Link href={listHref} className="text-sm text-[color:var(--color-muted)] md:hidden">
              ← กลับไปรายการบัญชี
            </Link>
          )}
          {detail}
        </div>
      </div>
    </div>
  );
}

function TreeGroup({
  node,
  depth,
  expanded,
  onToggle,
  selectedId,
  accountHrefPrefix,
}: {
  node: ChartGroupNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  selectedId: string | null;
  accountHrefPrefix: string;
}) {
  const open = expanded.has(node.key);
  // f8: ระดับ 1–2 โชว์รหัสในวงเล็บ ("สินทรัพย์ (1)") · ระดับ 3 (หมวดย่อย) โชว์ชื่ออย่างเดียว
  const label = node.level === 3 ? node.name : `${node.name} (${node.code})`;
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(node.key)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[color:var(--color-surface-2)]"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
        data-testid={`coa-group-${node.code}`}
      >
        <span
          aria-hidden
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border text-[color:var(--color-muted)]"
          style={{ borderColor: "var(--color-line)" }}
        >
          <AccountIcon name={open ? "minus" : "plus"} className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-xs text-[color:var(--color-muted)]" data-testid={`coa-count-${node.code}`}>
          {node.count}
        </span>
      </button>
      {open && (
        <ul className="flex flex-col gap-0.5">
          {node.level === 3
            ? (node.children as ChartAccountNode[]).map((a) => (
                <li key={a.key}>
                  <Link
                    href={`${accountHrefPrefix}${a.id}`}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[color:var(--color-surface-2)] ${
                      a.id === selectedId ? "bg-[color:var(--color-surface-2)] font-semibold" : ""
                    }`}
                    style={{ paddingLeft: `${8 + (depth + 1) * 20 + 24}px` }}
                    data-testid={`coa-account-${a.code}`}
                    aria-current={a.id === selectedId ? "true" : undefined}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {a.code} · {a.name}
                    </span>
                    {a.archived && (
                      <span className="shrink-0 text-xs text-[color:var(--color-muted)]">ปิดใช้งาน</span>
                    )}
                  </Link>
                </li>
              ))
            : (node.children as ChartGroupNode[]).map((child) => (
                <TreeGroup
                  key={child.key}
                  node={child}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  selectedId={selectedId}
                  accountHrefPrefix={accountHrefPrefix}
                />
              ))}
        </ul>
      )}
    </li>
  );
}

export default ChartPanel;
