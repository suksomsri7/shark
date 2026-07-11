import { redirect } from "next/navigation";

// รวมการเพิ่มกิจการเข้าหน้า "เพิ่มระบบ" แล้ว
export default function NewUnitPage() {
  redirect("/app/settings/systems");
}
