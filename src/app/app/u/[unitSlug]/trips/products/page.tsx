import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { loadProductEditorVM, loadProductListVM, tripsPageGate } from "@/lib/modules/trips";
import TripsForbidden from "@/components/trips/TripsForbidden";
import ProductsScreen from "@/components/trips/ProductsScreen";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

// TRIPS T1.1 ▸ จอสินค้าทัวร์ฝั่งร้าน (ภาพ 16 · ใบสั่ง T1.1 §4) — หน้าบาง: ด่าน → ตัวโหลด → คอมโพเนนต์
//   ผู้กระทำ/ร้าน/สิทธิ์มาจาก session · URL เลือกได้แค่ตัวกรอง/สินค้า/รอบตัวอย่าง (?type= &q= &archived=1 &p= &ex=) — ของหน่วยอื่น ⇒ notFound
export default async function TripsProductsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  const ctx = { tenantId: auth.active.tenantId, actorUserId: auth.user.id };
  const g = await tripsPageGate(ctx, { unitId: unit.id, page: "products" });
  if (!g.ok) {
    if (g.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  const typeRaw = one(sp.type);
  const type = typeRaw === "TOUR" || typeRaw === "LIVEABOARD" ? typeRaw : null;
  const q = (one(sp.q) ?? "").slice(0, 100);
  const archived = one(sp.archived) === "1";
  const list = await loadProductListVM(ctx, { unitId: unit.id, ...(type ? { type } : {}), ...(q ? { q } : {}), ...(archived ? { includeArchived: true } : {}) });
  if (!list.ok) {
    if (list.code === "FORBIDDEN") return <TripsForbidden />;
    notFound();
  }
  const productId = one(sp.p) ?? list.vm.items[0]?.id ?? null;
  let editor = null;
  if (productId) {
    const ex = one(sp.ex);
    const r = await loadProductEditorVM(ctx, { unitId: unit.id, productId, ...(ex ? { exampleDepartureId: ex } : {}) });
    if (!r.ok) {
      if (r.code === "FORBIDDEN") return <TripsForbidden />;
      notFound();
    }
    editor = r.vm;
  }
  return <ProductsScreen unitSlug={unitSlug} list={list.vm} editor={editor} filters={{ type, q, archived, productId }} />;
}
