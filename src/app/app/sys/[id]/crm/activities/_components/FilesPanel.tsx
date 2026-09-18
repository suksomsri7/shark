"use client";

// บล็อก "ไฟล์แนบ" ของหน้า 360 (ผู้ติดต่อ · บริษัท · ดีล — CRM v2 · ใบ C1.6 · มติ C19 · ไฟล์ส่วนตัว C0.4)
// ตัวห่อฝั่งเซิร์ฟเวอร์อยู่ที่ `src/components/crm/files/CrmFilesBlock.tsx`
// 🔴 ลิงก์ในรายการ = ลิงก์ส่วนตัวที่ผูกกับผู้ดูและหมดอายุ (`/api/files/…?exp&sig`) — ไม่มี URL CDN ถาวร (X10)
//    รีเฟรชหน้าแล้วลิงก์ใหม่ถูกออกให้เอง
// 🔴 ไฟล์ client: import ได้เฉพาะ activities-shared (บริสุทธิ์) + server actions · ข้อผิดพลาดแสดงในกล่อง ไม่ใช้ alert()

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CRM_FILE_MAX_BYTES, CRM_FILE_MIME_ALLOWLIST, fileSizeLabel, thaiDateLabel, type CrmFileEntityType, type FileLinkDto } from "@/lib/modules/crm/activities-shared";
import { attachFileAction, removeFileAction } from "./actions";

export function FilesPanel({
  systemId,
  entityType,
  entityId,
  items,
  currentUserId,
  canManage,
  canAttach,
}: {
  systemId: string;
  entityType: CrmFileEntityType;
  entityId: string;
  items: FileLinkDto[];
  currentUserId: string;
  canManage: boolean;
  canAttach: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > CRM_FILE_MAX_BYTES) {
      setError(`ไฟล์ใหญ่เกิน ${Math.round(CRM_FILE_MAX_BYTES / (1024 * 1024))} MB — ย่อขนาดหรือแบ่งไฟล์ก่อนแนบ`);
      return;
    }
    if (file.type && !CRM_FILE_MIME_ALLOWLIST.includes(file.type.toLowerCase())) {
      setError("ชนิดไฟล์นี้แนบใน CRM ไม่ได้ — รองรับ PDF · รูปภาพ · Word · Excel · ข้อความ (.txt)");
      return;
    }
    const fd = new FormData();
    fd.set("entityType", entityType);
    fd.set("entityId", entityId);
    fd.set("file", file);
    start(async () => {
      const r = await attachFileAction(systemId, fd);
      if (input.current) input.current.value = "";
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="card flex min-w-0 flex-col gap-2 p-4" data-testid="crm-files-block">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">ไฟล์แนบ</h2>
        {canAttach && (
          <label className="btn btn-ghost cursor-pointer text-sm">
            {pending ? "กำลังอัปโหลด…" : "+ แนบไฟล์"}
            <input
              ref={input}
              type="file"
              className="sr-only"
              accept={CRM_FILE_MIME_ALLOWLIST.join(",")}
              disabled={pending}
              onChange={(ev) => upload(ev.target.files?.[0])}
              aria-label="เลือกไฟล์ที่จะแนบ"
              data-testid="crm-files-input"
            />
          </label>
        )}
      </div>
      <p className="text-xs text-[color:var(--color-muted)]">ไฟล์เป็นความลับของร้าน — ลิงก์เปิดได้เฉพาะคนในทีมที่ล็อกอิน และหมดอายุเองใน 15 นาที</p>
      {error && (
        <p className="rounded-lg border px-3 py-2 text-sm" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }} role="alert" data-testid="crm-files-error">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีไฟล์แนบ</p>
      ) : (
        <ul className="flex flex-col divide-y text-sm">
          {items.map((f) => {
            const canRemove = canManage || f.uploadedById === currentUserId;
            return (
              <li key={f.id} className="flex flex-col gap-1 py-2" data-testid="crm-files-row">
                <div className="flex items-center justify-between gap-2">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all underline" data-testid="crm-files-open">
                    {f.name}
                  </a>
                  {canRemove && (
                    <button type="button" className="btn btn-ghost shrink-0 text-xs" disabled={pending} onClick={() => setConfirmId(confirmId === f.id ? null : f.id)} data-testid="crm-files-remove" aria-label={`ลบไฟล์ ${f.name}`}>
                      ลบ
                    </button>
                  )}
                </div>
                <span className="text-xs text-[color:var(--color-muted)]">
                  {fileSizeLabel(f.size)} · {thaiDateLabel(Date.parse(f.createdAt), true)}
                </span>
                {confirmId === f.id && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span>ลบไฟล์นี้ออกจากที่เก็บถาวร?</span>
                    <button
                      type="button"
                      className="btn btn-ghost text-xs"
                      style={{ color: "var(--color-danger)" }}
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          setError(null);
                          const r = await removeFileAction(systemId, f.id);
                          if (!r.ok) {
                            setError(r.error);
                            return;
                          }
                          setConfirmId(null);
                          router.refresh();
                        })
                      }
                      data-testid="crm-files-remove-confirm"
                    >
                      ยืนยันลบ
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
