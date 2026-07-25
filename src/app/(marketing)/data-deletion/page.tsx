// วิธีลบข้อมูลผู้ใช้ (public) — Facebook บังคับมี Data Deletion Instructions URL
export const metadata = { title: "การลบข้อมูลผู้ใช้ — SHARK" };

export default function DataDeletionPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">การลบข้อมูลผู้ใช้</h1>
      <p className="text-sm text-[color:var(--color-muted)]">SHARK (shark.in.th)</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">ลบด้วยตัวเอง (แนะนำ)</h2>
        <ol className="list-decimal pl-6 text-sm leading-6">
          <li>เข้าสู่ระบบที่ shark.in.th หรือในแอป SHARK AI</li>
          <li>เปิดเมนู → <strong>ตั้งค่า → ความเป็นส่วนตัว (PDPA)</strong></li>
          <li>กด <strong>"ลบร้านถาวร"</strong> — ระบบพักข้อมูล 30 วัน (ยกเลิกได้) จากนั้นลบถาวรทั้งหมด</li>
          <li>ก่อนลบ สามารถกด "ดาวน์โหลดข้อมูล" เก็บสำเนาไว้ได้</li>
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">ขอให้เราลบให้</h2>
        <p className="text-sm leading-6">
          ส่งอีเมลจากที่อยู่อีเมลที่ใช้สมัครมาที่ <strong>support@shark.in.th</strong> หัวข้อ
          "ขอลบข้อมูล" — เราจะดำเนินการและยืนยันกลับภายใน 30 วัน
        </p>
        <p className="text-sm leading-6">
          กรณีเข้าสู่ระบบผ่าน Facebook/Google/LINE/Apple: การลบบัญชี SHARK จะลบข้อมูลทั้งหมดที่เราได้รับ
          จากผู้ให้บริการนั้น (อีเมลและชื่อ) ออกจากระบบเราด้วย
        </p>
      </section>
    </main>
  );
}
