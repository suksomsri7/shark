// /u/<token> — หน้ายืนยัน "ยกเลิกรับอีเมล" ที่ลิงก์ในเนื้อจดหมายของ CRM ชี้มา (ใบ C2.5 · R-C.7)
//
// 🔴 **เปิดหน้านี้ไม่ยกเลิกอะไร**: ตัวสแกนลิงก์ของผู้ให้บริการอีเมลยิง GET ทุกลิงก์ในจดหมาย ⇒ ถ้าเปิดแล้วยกเลิกเลย
//    ลูกค้าที่ไม่เคยกดจะหลุดจากรายชื่อเงียบ ๆ · การยกเลิกเกิดจากการ **กดปุ่ม** (form POST ไปที่ `/u/<token>/one-click`)
// 🔴 AUDIT-CLASS X7: หน้านี้แสดงเหมือนกันทุก token — ไม่บอกว่า token ใช้ได้จริงไหม ไม่แสดงอีเมล ชื่อ หรือชื่อร้าน
//    (ใครก็เปิดลิงก์นี้ได้ ⇒ อะไรที่แสดงบนหน้านี้คือข้อมูลที่หลุดออกไปให้คนนอก)
// 🔴 ไม่มี session ไม่มีฐานข้อมูลถูกอ่านที่นี่เลย (หน้านี้เป็น static ล้วน + token ที่อยู่ใน URL)

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const action = `/u/${encodeURIComponent(String(token ?? ""))}/one-click`;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">ยกเลิกรับอีเมลข่าวสาร</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          กดปุ่มด้านล่างเพื่อยืนยันว่าไม่ต้องการรับอีเมลข่าวสารจากร้านนี้อีก
          หลังจากนี้เรายังอาจส่งเอกสารที่คุณขอไว้ เช่น ใบเสนอราคาหรือใบเสร็จ ตามที่กฎหมายกำหนด
        </p>
        <form method="post" action={action} className="mt-6">
          <button
            type="submit"
            data-testid="crm-unsub-confirm"
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
          >
            ยืนยันยกเลิกรับอีเมล
          </button>
        </form>
      </div>
      <p className="text-center text-xs text-slate-400">ถ้าคุณเปิดหน้านี้โดยไม่ได้ตั้งใจ ปิดหน้านี้ได้เลย — ยังไม่มีอะไรเปลี่ยน</p>
    </main>
  );
}
