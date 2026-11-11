import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { getImport, listImports, type ImportView } from "@/lib/modules/dorm";
import ImportScreen from "@/components/dorm/ImportScreen";
import { createImportAction, guessColumnsAction, previewImportAction, undoImportAction, uploadImportAction } from "./actions";

// SVC D.4 ▸ หอ 12 "นำเข้าข้อมูลหอ" — ภาพ ledger/design-dorm/12-import-excel.png · ข้อมูลผ่าน facade `@/lib/modules/dorm` เท่านั้น (ไม่แตะ prisma)
//   ด่าน: requireUnit · หน่วยต้องเป็น "DORM" · สิทธิ์ dorm.import (evaluate ด้วย membership ของ session) ไม่ผ่าน ⇒ 404
//   ?batch=<id> (ไม่มี = ชุดล่าสุดที่ไม่ใช่ UNDONE ของหน่วย · ไม่มีชุด = ขั้นอัปโหลด)
//   หน้านี้อ่านอย่างเดียว (getImport ⇒ ผลตรวจ/แผนของพรีวิวล่าสุดที่เก็บไว้) — การตรวจใหม่ทำผ่านปุ่ม (previewImportAction) ไม่เขียนข้อมูลตอนเปิดหน้า
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function DormImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!evaluate(membership, { module: "dorm", action: "dorm.import", unitId: unit.id })) notFound();

  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.active.userId };
  const asked = (one(sp.batch) ?? "").trim().slice(0, 64);
  let view: ImportView | null = null;
  if (asked) view = await getImport(ctx, { unitId: unit.id, batchId: asked });
  else {
    const latest = (await listImports(ctx, { unitId: unit.id })).find((b) => b.status !== "UNDONE");
    if (latest) view = await getImport(ctx, { unitId: unit.id, batchId: latest.batchId });
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <p className="text-xs text-[color:var(--color-muted)]">{unit.name}</p>
      <ImportScreen
        unitSlug={unitSlug}
        view={view}
        preview={null}
        actions={{
          upload: uploadImportAction.bind(null, unitSlug),
          guess: guessColumnsAction.bind(null, unitSlug),
          preview: previewImportAction.bind(null, unitSlug),
          create: createImportAction.bind(null, unitSlug),
          undo: undoImportAction.bind(null, unitSlug),
        }}
      />
    </div>
  );
}
