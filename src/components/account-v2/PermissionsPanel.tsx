"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AccountIcon } from "./AccountIcon";
import { RowActions } from "./RowActions";
import { useSetBreadcrumbTail } from "./breadcrumb-tail";
import {
  MATRIX_COLUMNS,
  MATRIX_GROUPS,
  ROLE_PRESETS,
  cellOf,
  type AccountRole,
  type MatrixCells,
  type MatrixColKey,
  type MatrixGroupKey,
} from "@/lib/modules/account/permissions-matrix";

// ─────────────────────────────────────────────────────────────
// หน้า "ตั้งค่า › สิทธิ์ผู้ใช้งาน" (SPEC §9.4 · เฟรม g13-settings-permissions.png)
//   ?s=users  → ตารางผู้ใช้งาน (กรองเฉพาะคนที่มีสิทธิ์บัญชี) + ปุ่มเชิญผู้ใช้
//   ?s=matrix → ตารางสิทธิ์ต่อบทบาท (8 หมวด × 7 คอลัมน์) + เพดานอนุมัติ (ตรงเฟรม g13)
//
// เซลล์ที่หมวดนั้นไม่มี = "—" · เซลล์ที่ยังติ๊กไม่ได้เพราะไม่มีสิทธิ์ "ดู" = "—" + tooltip ดำ
// (เฟรม g13 โชว์ทั้ง 2 แบบเป็นขีดเหมือนกัน — ต่างกันที่มี tooltip เมื่อชี้)
// ─────────────────────────────────────────────────────────────

export type UserRow = {
  membershipId: string;
  name: string;
  email: string;
  roleLabel: string;
  accountRoleKey: string;
  accountRoleName: string;
  summary: string;
  capText: string;
  editable: boolean;
  active: boolean;
};

export type PermissionsPanelProps = {
  systemId: string;
  base: string;
  sub: string;
  subLabel: string;
  users: UserRow[];
  roles: AccountRole[];
  /** บทบาทที่กำลังแก้อยู่ (?r=) */
  activeRoleKey: string;
  staffHref: string;
  saveRole: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  addRole: (fd: FormData) => Promise<{ ok: true; key: string } | { ok: false; reason: string }>;
  assignRole: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  setCap: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  revoke: (fd: FormData) => Promise<{ ok: true } | { ok: false; reason: string }>;
  nav: React.ReactNode;
  mobileNav: React.ReactNode;
  showMobileNavOnly: boolean;
};

const helpCls = "text-xs text-[color:var(--color-muted)]";

/** บาท → ข้อความในช่องกรอก ("50000" → "50,000.00") */
function capInputValue(capSatang: number | null): string {
  if (capSatang === null) return "";
  return (capSatang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** id ของฟอร์มตารางสิทธิ์ — ปุ่มบันทึกอยู่ระดับหน้า (นอกฟอร์ม) จึงต้องผูกด้วย `form=` ตามเฟรม g13 */
const MATRIX_FORM_ID = "account-matrix-form";

export function PermissionsPanel(p: PermissionsPanelProps) {
  useSetBreadcrumbTail(p.subLabel);
  const isMatrix = p.sub === "matrix";
  const activeRole = p.roles.find((r) => r.key === p.activeRoleKey) ?? p.roles.find((r) => !r.system) ?? p.roles[0];
  const readOnly = !!activeRole?.system;
  return (
    <div className="flex flex-col gap-4">
      {/* เฟรม g13: หัวเรื่อง "ตั้งค่า" + ปุ่ม [ยกเลิก][✓ บันทึก] อยู่ระดับหน้า (เหนือทั้งเมนูซ้ายและการ์ด) */}
      <div className="sticky top-0 z-20 -mx-1 flex items-center justify-between gap-3 bg-[color:var(--color-surface)] px-1 py-2">
        <h1 className="text-2xl font-semibold">ตั้งค่า</h1>
        {isMatrix && (
          <div className="hidden items-center gap-2 md:flex">
            <Link
              href={`${p.base}/settings/permissions?s=matrix&r=${activeRole?.key ?? ""}`}
              className="btn btn-ghost btn-sm"
            >
              ยกเลิก
            </Link>
            <button
              type="submit"
              form={MATRIX_FORM_ID}
              disabled={readOnly}
              data-testid="matrix-save-top"
              className="btn btn-sm inline-flex items-center gap-1.5 bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
            >
              <AccountIcon name="check" className="h-4 w-4" />
              บันทึก
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="hidden md:block">{p.nav}</div>
        {p.showMobileNavOnly && <div className="md:hidden">{p.mobileNav}</div>}
        <div className={`min-w-0 flex-1 ${p.showMobileNavOnly ? "hidden md:block" : ""}`}>
          <Link
            href={`${p.base}/settings/permissions`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[color:var(--color-muted)] md:hidden"
          >
            ← หัวข้อตั้งค่า
          </Link>
          {isMatrix ? <MatrixCard {...p} /> : <UsersCard {...p} />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── ผู้ใช้งาน (?s=users) ───────────────────────────

function UsersCard(p: PermissionsPanelProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [capFor, setCapFor] = useState<UserRow | null>(null);
  const [roleFor, setRoleFor] = useState<UserRow | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; reason?: string }>) =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.reason ?? "ทำรายการไม่สำเร็จ" });
      if (res.ok) {
        setCapFor(null);
        setRoleFor(null);
      }
    });

  const custom = p.roles.filter((r) => !r.system);

  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="permissions-users">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">ผู้ใช้งาน</h2>
          <p className={`mt-1 ${helpCls}`}>คนที่เข้าถึงระบบบัญชีของร้านนี้ได้ — เจ้าของและผู้จัดการมีสิทธิ์ทุกอย่างเสมอ</p>
        </div>
        <Link href={p.staffHref} className="btn btn-ghost btn-sm shrink-0 inline-flex items-center gap-1.5">
          <AccountIcon name="plus" className="h-4 w-4" />
          เชิญผู้ใช้
        </Link>
      </div>

      {msg && (
        <p
          data-testid="permissions-msg"
          className={`text-sm ${msg.ok ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}`}
        >
          {msg.ok ? "บันทึกแล้ว ✓" : msg.text}
        </p>
      )}

      {/* เดสก์ท็อป = ตาราง · มือถือ (390) = การ์ด (§13) */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm" data-testid="permissions-user-table">
          <thead>
            <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
              <th className="py-2 pr-3 font-normal">ชื่อ</th>
              <th className="py-2 pr-3 font-normal">อีเมล</th>
              <th className="py-2 pr-3 font-normal">บทบาท</th>
              <th className="py-2 pr-3 font-normal">สิทธิ์บัญชี (สรุป)</th>
              <th className="py-2 pr-3 font-normal">เพดานอนุมัติ</th>
              <th className="py-2 font-normal">ทำรายการ</th>
            </tr>
          </thead>
          <tbody>
            {p.users.map((u) => (
              <tr key={u.membershipId} className="border-b last:border-b-0" data-testid={`user-row-${u.membershipId}`}>
                <td className="py-2.5 pr-3 font-medium">{u.name}</td>
                <td className="py-2.5 pr-3 text-[color:var(--color-ink-soft)]">{u.email}</td>
                <td className="py-2.5 pr-3">
                  {u.roleLabel}
                  {u.accountRoleName && u.editable ? ` · ${u.accountRoleName}` : ""}
                </td>
                <td className="py-2.5 pr-3 text-[color:var(--color-ink-soft)]">{u.summary}</td>
                <td className="py-2.5 pr-3" data-testid={`user-cap-${u.membershipId}`}>
                  {u.capText}
                </td>
                <td className="py-2.5">
                  <RowMenu
                    user={u}
                    roles={custom}
                    onEditRole={() => setRoleFor(u)}
                    onEditCap={() => setCapFor(u)}
                    onRevoke={() =>
                      run(async () => {
                        const fd = new FormData();
                        fd.set("systemId", p.systemId);
                        fd.set("membershipId", u.membershipId);
                        return p.revoke(fd);
                      })
                    }
                    matrixHref={`${p.base}/settings/permissions?s=matrix&r=${encodeURIComponent(u.accountRoleKey)}`}
                  />
                </td>
              </tr>
            ))}
            {p.users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-[color:var(--color-muted)]">
                  ยังไม่มีใครได้รับสิทธิ์บัญชี — กด “เชิญผู้ใช้” เพื่อเพิ่มคนแรก
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {p.users.map((u) => (
          <div key={u.membershipId} className="rounded-lg border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{u.name}</span>
              <span className={helpCls}>{u.roleLabel}</span>
            </div>
            <div className={helpCls}>{u.email}</div>
            <div className="mt-1">{u.summary}</div>
            <div className={`mt-1 ${helpCls}`}>เพดานอนุมัติ {u.capText}</div>
            {u.editable && (
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoleFor(u)}>
                  แก้สิทธิ์
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCapFor(u)}>
                  ตั้งเพดาน
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {roleFor && (
        <MiniDialog title={`บทบาทบัญชีของ ${roleFor.name}`} onClose={() => setRoleFor(null)}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("systemId", p.systemId);
              fd.set("membershipId", roleFor.membershipId);
              run(() => p.assignRole(fd));
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              เลือกบทบาท
              <select name="roleKey" defaultValue={roleFor.accountRoleKey} className="input" data-testid="assign-role-select">
                {custom.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <p className={helpCls}>กดบันทึกแล้วสิทธิ์ของคนนี้จะถูกตั้งตามตารางของบทบาทนั้นทันที</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoleFor(null)}>
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={pending}
                className="btn btn-sm bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
              >
                บันทึก
              </button>
            </div>
          </form>
        </MiniDialog>
      )}

      {capFor && (
        <MiniDialog title={`เพดานอนุมัติของ ${capFor.name}`} onClose={() => setCapFor(null)}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("systemId", p.systemId);
              fd.set("membershipId", capFor.membershipId);
              run(() => p.setCap(fd));
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              อนุมัติเอกสารได้ไม่เกิน (บาทต่อรายการ)
              <input
                name="capBaht"
                defaultValue={capFor.capText === "ไม่จำกัด" ? "" : capFor.capText.replace("฿", "")}
                placeholder="เว้นว่าง = ไม่จำกัด"
                className="input"
                data-testid="cap-input"
                inputMode="decimal"
              />
            </label>
            <p className={helpCls}>เกินเพดานจะอนุมัติเองไม่ได้ ระบบจะส่งให้ผู้มีอำนาจสูงกว่าอนุมัติแทน</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCapFor(null)}>
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={pending}
                className="btn btn-sm bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
              >
                บันทึก
              </button>
            </div>
          </form>
        </MiniDialog>
      )}
    </section>
  );
}

function RowMenu({
  user,
  roles,
  onEditRole,
  onEditCap,
  onRevoke,
  matrixHref,
}: {
  user: UserRow;
  roles: AccountRole[];
  onEditRole: () => void;
  onEditCap: () => void;
  onRevoke: () => void;
  matrixHref: string;
}) {
  if (!user.editable)
    return <span className={helpCls}>แก้ที่หน้าผู้ใช้งานของร้าน</span>;
  return (
    <RowActions
      testId={`user-menu-${user.membershipId}`}
      items={[
        { label: "แก้สิทธิ์", icon: "edit", onClick: onEditRole, disabled: roles.length === 0, hint: roles.length === 0 ? "ยังไม่มีบทบาทบัญชีให้เลือก" : undefined },
        { label: "ตั้งเพดาน", icon: "cash", onClick: onEditCap },
        { label: "ดูตารางสิทธิ์", icon: "grid", href: matrixHref },
        { label: "ถอดสิทธิ์บัญชี", icon: "trash", onClick: onRevoke, danger: true, sepBefore: true },
      ]}
    />
  );
}

function MiniDialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal>
      <div className="card w-full max-w-sm p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{title}</h3>
          <button type="button" onClick={onClose} aria-label="ปิด" className="btn btn-ghost btn-sm">
            <AccountIcon name="x" className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────── สิทธิ์การใช้งาน (?s=matrix · เฟรม g13) ───────────────────────────

function MatrixCard(p: PermissionsPanelProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const active = useMemo(
    () => p.roles.find((r) => r.key === p.activeRoleKey) ?? p.roles.find((r) => !r.system) ?? p.roles[0],
    [p.roles, p.activeRoleKey],
  );
  const readOnly = !!active?.system;
  const [cells, setCells] = useState<MatrixCells>(active?.cells ?? {});
  const [capBaht, setCapBaht] = useState(capInputValue(active?.capSatang ?? null));

  const viewOnOf = (g: MatrixGroupKey): boolean => {
    if (g === "revenue" || g === "expense") return cells.revenue?.view === true || cells.expense?.view === true;
    return cells[g]?.view === true;
  };

  const toggle = (g: MatrixGroupKey, c: MatrixColKey) => {
    if (readOnly) return;
    setCells((prev) => {
      const row = { ...(prev[g] ?? {}) };
      const on = row[c] === true;
      if (on) delete row[c];
      else row[c] = true;
      const next: MatrixCells = { ...prev, [g]: row };
      // ปิด "ดู" = ปิดทั้งแถว (กติกาเดียวกับ resolveCells ฝั่ง server)
      if (c === "view" && on) next[g] = {};
      if (c === "view" && on && (g === "revenue" || g === "expense")) {
        next.revenue = {};
        next.expense = {};
      }
      if (c === "view" && !on && (g === "revenue" || g === "expense")) {
        next.revenue = { ...(next.revenue ?? {}), view: true };
        next.expense = { ...(next.expense ?? {}), view: true };
      }
      return next;
    });
  };

  const applyPreset = (key: string) => {
    const preset = ROLE_PRESETS.find((x) => x.key === key);
    if (!preset || readOnly) return;
    setCells(preset.cells);
    setCapBaht(capInputValue(preset.capSatang));
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await p.saveRole(fd);
      setMsg(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.reason });
    });
  }

  return (
    <form id={MATRIX_FORM_ID} onSubmit={submit} className="flex flex-col gap-4" data-testid="permissions-matrix">
      <input type="hidden" name="systemId" value={p.systemId} />
      <input type="hidden" name="roleKey" value={active?.key ?? ""} />
      <input type="hidden" name="roleName" value={active?.name ?? ""} />

      <section className="card flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-sm font-medium">สิทธิ์การใช้งาน</h2>
          <p className={`mt-1 ${helpCls}`}>กำหนดสิทธิ์แต่ละบทบาทต่อหมวดงาน — เปลี่ยนแล้วมีผลทันทีเมื่อกด &ldquo;บันทึก&rdquo;</p>
        </div>

        {/* แถวบทบาท (pill) — เฟรม g13 */}
        <div className="flex flex-wrap items-center gap-2">
          {p.roles.map((r) => (
            <Link
              key={r.key}
              href={`${p.base}/settings/permissions?s=matrix&r=${encodeURIComponent(r.key)}`}
              data-testid={`role-pill-${r.key}`}
              aria-current={r.key === active?.key ? "true" : undefined}
              className={`btn btn-sm ${
                r.key === active?.key ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "btn-ghost"
              }`}
            >
              {r.name}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setAdding(true)}
            data-testid="role-add"
            className="btn btn-sm border border-dashed text-[color:var(--color-ink-soft)]"
          >
            + เพิ่มบทบาท
          </button>
          <span className={`ml-auto inline-flex items-center gap-1.5 ${helpCls}`}>
            <AccountIcon name="warn" className="h-4 w-4" />
            บทบาทระบบ (เจ้าของ) แก้ไม่ได้
          </span>
        </div>

        {/* ปุ่มแม่แบบ (§9.4 — ตั้งค่าเร็วสำหรับบทบาทที่ร้านสร้างเอง) */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={helpCls}>ตั้งจากแม่แบบ:</span>
            {ROLE_PRESETS.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => applyPreset(x.key)}
                data-testid={`preset-${x.key}`}
                className="btn btn-ghost btn-sm"
              >
                {x.name}
              </button>
            ))}
          </div>
        )}

        {msg && (
          <p
            data-testid="permissions-msg"
            className={`text-sm ${msg.ok ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-danger)]"}`}
          >
            {msg.ok ? "บันทึกแล้ว ✓" : msg.text}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="matrix-table">
            <thead>
              <tr className="border-b text-xs text-[color:var(--color-muted)]">
                <th className="py-3 pr-3 text-left font-normal">หมวด</th>
                {MATRIX_COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-3 text-center font-normal">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX_GROUPS.map((g) => {
                const viewOn = viewOnOf(g.key);
                return (
                  <tr key={g.key} className="border-b last:border-b-0">
                    <th scope="row" className="py-3 pr-3 text-left text-sm font-medium">
                      {g.label}
                    </th>
                    {MATRIX_COLUMNS.map((c) => {
                      const def = cellOf(g.key, c.key);
                      const locked = !!def && c.key !== "view" && !viewOn;
                      const on = cells[g.key]?.[c.key] === true;
                      if (!def)
                        return (
                          <td key={c.key} className="px-2 py-3 text-center text-[color:var(--color-muted)]">
                            —
                          </td>
                        );
                      if (locked)
                        return (
                          <td
                            key={c.key}
                            className="group relative px-2 py-3 text-center text-[color:var(--color-muted)]"
                            data-testid={`cell-${g.key}-${c.key}`}
                          >
                            —
                            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[color:var(--color-ink)] px-3 py-1.5 text-xs text-[color:var(--color-surface)] group-hover:block">
                              ต้องมีสิทธิ์ &quot;ดู&quot; ก่อน
                            </span>
                          </td>
                        );
                      return (
                        <td key={c.key} className="px-2 py-3 text-center">
                          <label className="inline-flex" title={def.sharedWith ? `ใช้สิทธิ์ชุดเดียวกับ ${def.sharedWith}` : undefined}>
                            <span className="sr-only">{`${g.label} ${c.label}`}</span>
                            <input
                              type="checkbox"
                              name={`cell:${g.key}:${c.key}`}
                              checked={on}
                              disabled={readOnly}
                              onChange={() => toggle(g.key, c.key)}
                              data-testid={`cell-${g.key}-${c.key}`}
                              className="h-4 w-4 accent-[color:var(--color-ink)]"
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="border-t bg-[color:var(--color-surface-2)]">
                <th scope="row" className="py-3 pr-3 text-left text-sm font-medium">
                  เพดานอนุมัติ
                </th>
                <td colSpan={MATRIX_COLUMNS.length} className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={helpCls}>อนุมัติเอกสารได้ไม่เกิน</span>
                    <span className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5">
                      <span className="text-[color:var(--color-muted)]">฿</span>
                      <input
                        name="capBaht"
                        value={capBaht}
                        onChange={(e) => setCapBaht(e.target.value)}
                        disabled={readOnly}
                        inputMode="decimal"
                        data-testid="matrix-cap"
                        className="w-28 bg-transparent outline-none"
                      />
                    </span>
                    <span className={helpCls}>ต่อรายการ (เว้นว่าง = ไม่จำกัด)</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <Link href={`${p.base}/settings/permissions?s=matrix&r=${active?.key ?? ""}`} className="btn btn-ghost btn-sm">
            ยกเลิก
          </Link>
          <button
            type="submit"
            disabled={pending || readOnly}
            data-testid="matrix-save-bottom"
            className="btn btn-sm inline-flex items-center gap-1.5 bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
          >
            <AccountIcon name="check" className="h-4 w-4" />
            บันทึก
          </button>
        </div>
      </section>

      {adding && (
        <MiniDialog title="เพิ่มบทบาท" onClose={() => setAdding(false)}>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              ชื่อบทบาท
              <input name="newRoleName" id="newRoleName" className="input" data-testid="new-role-name" placeholder="เช่น ผู้อนุมัติ" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={pending}
                className="btn btn-sm bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
                onClick={() => {
                  const el = document.getElementById("newRoleName") as HTMLInputElement | null;
                  const fd = new FormData();
                  fd.set("systemId", p.systemId);
                  fd.set("roleName", el?.value ?? "");
                  start(async () => {
                    const res = await p.addRole(fd);
                    if (res.ok) {
                      setAdding(false);
                      window.location.href = `${p.base}/settings/permissions?s=matrix&r=${encodeURIComponent(res.key)}`;
                    } else setMsg({ ok: false, text: res.reason });
                  });
                }}
              >
                เพิ่ม
              </button>
            </div>
          </div>
        </MiniDialog>
      )}
    </form>
  );
}

export default PermissionsPanel;
