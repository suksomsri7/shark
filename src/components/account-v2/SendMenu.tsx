"use client";

// SendMenu — ACCOUNT-FIX B1 · เมนู "ส่ง ▾" ของหัวเอกสาร (รวมปุ่มแชร์ลิงก์ + ลิงก์ชำระเงิน ที่เคยเป็นปุ่มแยก)
//   รายการที่ใช้ไม่ได้ยังอยู่ในเมนูพร้อมเหตุผลจริง (ไม่ใช่ "เร็ว ๆ นี้") · ไม่มีรายการใดรองรับชนิดเอกสารนี้เลย = ไม่วาดเมนู (ผู้เรียกตัดสิน)
//   ส่งเอกสารทางอีเมลยังไม่มีระบบ ⇒ ไม่อยู่ในเมนู (ledger ACCOUNT-FIX-RUN "ค้าง")
import { useRef, useState, useTransition } from "react";
import { getOrCreatePublicLinkAction } from "@/lib/modules/account/actions";
import { PortalMenu } from "./PortalMenu";
import { AccountIcon } from "./AccountIcon";
import { PayLinkButton, type PayLinkView } from "./PayLinkButton";

export function SendMenu({
  systemId,
  docId,
  docNo,
  shareBlockReason,
  payLinkBlockReason,
  currentPayLink,
}: {
  systemId: string;
  docId: string;
  docNo: string | null;
  /** null = แชร์ลิงก์ได้ · ข้อความ = เหตุผลที่ทำไม่ได้ */
  shareBlockReason: string | null;
  payLinkBlockReason: string | null;
  currentPayLink: PayLinkView | null;
}) {
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const anchorRef = useRef<HTMLDivElement>(null);
  const itemCls = "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]";

  const share = () =>
    start(async () => {
      setOpen(false);
      setMsg("");
      const res = await getOrCreatePublicLinkAction(systemId, docId);
      if (!res.ok) {
        setMsg(res.reason);
        return;
      }
      const url = `${window.location.origin}/r/${res.token}`;
      try {
        await navigator.clipboard.writeText(url);
        setMsg("คัดลอกลิงก์เอกสารแล้ว");
      } catch {
        setMsg(url);
      }
      window.setTimeout(() => setMsg(""), 4000);
    });

  const Item = ({ label, reason, onClick, icon, testId }: { label: string; reason: string | null; onClick: () => void; icon: string; testId: string }) =>
    reason ? (
      <div className={`${itemCls} cursor-not-allowed opacity-60`} role="menuitem" aria-disabled title={reason} data-testid={testId}>
        <AccountIcon name={icon} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="block">{label}</span>
          <span className="block text-xs text-[color:var(--color-muted)]">{reason}</span>
        </span>
      </div>
    ) : (
      <button type="button" role="menuitem" className={itemCls} onClick={onClick} data-testid={testId}>
        <AccountIcon name={icon} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{label}</span>
      </button>
    );

  return (
    <div className="relative inline-block" ref={anchorRef} data-testid="doc-send-menu">
      <button
        type="button"
        className="btn btn-ghost text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        data-testid="doc-send-menu-btn"
      >
        {pending ? "กำลังสร้างลิงก์…" : "ส่ง ▾"}
      </button>
      <PortalMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} testId="doc-send-menu-items" className="min-w-[260px] rounded-lg border bg-[color:var(--color-surface)] py-1 shadow-[0_8px_24px_rgba(10,10,10,.08)]">
        <Item label="คัดลอกลิงก์เอกสาร" reason={shareBlockReason} onClick={share} icon="link" testId="btn-share-link" />
        <Item
          label="ลิงก์ชำระเงิน / QR พร้อมเพย์"
          reason={payLinkBlockReason}
          onClick={() => {
            setOpen(false);
            setPayOpen(true);
          }}
          icon="qr"
          testId="btn-pay-link"
        />
      </PortalMenu>
      {msg && (
        <span
          role="status"
          className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-lg border bg-[color:var(--color-surface)] px-2 py-1 text-xs shadow-[0_8px_24px_rgba(10,10,10,.08)]"
          data-testid="share-link-msg"
        >
          {msg}
        </span>
      )}
      {payLinkBlockReason === null && (
        <PayLinkButton systemId={systemId} docId={docId} docNo={docNo} current={currentPayLink} open={payOpen} onOpenChange={setPayOpen} hideTrigger />
      )}
    </div>
  );
}

export default SendMenu;
