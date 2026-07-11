import { redirect } from "next/navigation";

// สมาชิกอยู่ภายใต้ "ระบบสมาชิก" แต่ละชุด — ดูจากหน้าระบบ
export default function MembersPage() {
  redirect("/app");
}
