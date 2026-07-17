"use client";

import { useActionState } from "react";
import { installTemplateAction, type InstallState } from "@/lib/marketplace/actions";

export type TemplateCard = { key: string; label: string; description: string; icon: string };

const initial: InstallState = { status: "idle" };

// ปุ่มติดตั้งของแต่ละเทมเพลต — error แสดง inline (ไม่ใช้ alert)
function InstallForm({ tplKey, disabled }: { tplKey: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(installTemplateAction, initial);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="key" value={tplKey} />
      <button type="submit" disabled={disabled || pending} className="btn btn-primary w-full text-sm">
        {pending ? "กำลังติดตั้ง..." : "ติดตั้ง"}
      </button>
      {state.status === "error" && (
        <p className="text-xs text-[color:var(--color-danger)]">{state.message}</p>
      )}
    </form>
  );
}

export function MarketplaceGrid({
  templates,
  installedKeys,
  hasDna,
}: {
  templates: TemplateCard[];
  installedKeys: string[];
  hasDna: boolean;
}) {
  const installed = new Set(installedKeys);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {templates.map((t) => {
        const isInstalled = installed.has(t.key);
        // ร้านที่ตั้งค่าธุรกิจไว้แล้ว (มี DNA) แต่ยังไม่ใช่เทมเพลตนี้ → ติดตั้งทับไม่ได้
        const blockedByDna = hasDna && !isInstalled;
        return (
          <div key={t.key} className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>
                {t.icon}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t.label}</div>
                <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">{t.description}</p>
              </div>
            </div>

            {isInstalled ? (
              <span className="inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-[color:var(--color-muted)]">
                ✓ ติดตั้งแล้ว
              </span>
            ) : blockedByDna ? (
              <div className="flex flex-col gap-1.5">
                <button type="button" disabled className="btn btn-primary w-full cursor-not-allowed text-sm opacity-45">
                  ติดตั้ง
                </button>
                <p className="text-xs text-[color:var(--color-muted)]">
                  ร้านนี้ตั้งค่าธุรกิจไว้แล้ว จึงติดตั้งเทมเพลตทับไม่ได้
                </p>
              </div>
            ) : (
              <InstallForm tplKey={t.key} disabled={false} />
            )}
          </div>
        );
      })}
    </div>
  );
}
