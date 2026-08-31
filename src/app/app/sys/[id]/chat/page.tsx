import { notFound, redirect } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { canReadChat } from "@/lib/modules/chat/guard";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * /app/sys/<id>/chat — ลิงก์เก่าที่ **ยังมีชีวิตอยู่บนเครื่องลูกค้าจริง**
 *
 * 🔴 push (`data.url`) และ `AppNotification` ที่ส่งออกไปแล้วชี้มาที่ `/app/sys/<id>/chat?c=<id>`
 *    ⇒ ไฟล์นี้ห้ามหาย และ redirect **ต้องพา `?c=` ไปด้วย** ไม่งั้นแตะแจ้งเตือนแล้วเปิดมาเจอ
 *    รายการเปล่า (บั๊กชนิด "ถึงระบบแล้วแต่ใช้งานไม่ได้")
 *    `?err=` ก็ต้องพาไปด้วย เพราะ server action ของแชท redirect กลับมาที่ path นี้พร้อมข้อความผิดพลาด
 *
 * กล่องแชทตัวจริงย้ายไปอยู่หน้าภาพรวม `/app/sys/<id>` แล้ว (คำสั่งข้อ 1 ของเจ้าของ)
 */
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string; err?: string }>;
}) {
  const { id } = await params;
  const { c, err } = await searchParams;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;

  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId } });
  if (!sys || sys.type !== "CHAT") notFound();

  // 🔴 คนที่ไม่มีสิทธิ์อ่านแชทต้องได้คำอธิบาย ไม่ใช่ถูกเด้งไปหน้าที่เปิดไม่ได้แล้วเจอ error ดิบ
  //    (ทางเข้าหลักของหน้านี้คือ "แตะแจ้งเตือน" — คนที่เพิ่งถูกถอดสิทธิ์จะมาถึงที่นี่ได้จริง)
  if (!canReadChat(auth)) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <PageHeader title={sys.name} back={{ href: "/app", label: "หน้าแรก" }} />
        <p className="card text-sm text-[color:var(--color-muted)]">
          บัญชีของคุณยังไม่มีสิทธิ์ดูกล่องแชทลูกค้า — ขอสิทธิ์ “ดูกล่องแชทลูกค้า”
          จากผู้ดูแลร้านได้ที่หน้าผู้ใช้งาน แล้วเปิดลิงก์นี้ใหม่อีกครั้ง
        </p>
      </div>
    );
  }

  const tail = c
    ? `?c=${encodeURIComponent(c)}${err ? `&err=${encodeURIComponent(err)}` : ""}`
    : err
      ? `?err=${encodeURIComponent(err)}`
      : "";
  redirect(`/app/sys/${id}${tail}`);
}
