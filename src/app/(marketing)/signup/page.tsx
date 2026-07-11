import { AuthForm } from "@/components/auth-form";

// passwordless: สมัคร = เข้าสู่ระบบ (ใส่อีเมลครั้งแรก = สร้างบัญชี)
export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <AuthForm heading="สมัครใช้งานฟรี" />
    </main>
  );
}
