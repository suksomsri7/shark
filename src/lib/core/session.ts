import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { sha256, randomToken } from "./hash";
import { secureCookies } from "@/lib/env";

// dev (http://localhost) ใช้ชื่อธรรมดา; preview/prod (HTTPS) ใช้ __Host- (Secure+Path=/+no Domain)
const COOKIE = secureCookies ? "__Host-shark_session" : "shark_session";
const IDLE_MS = 1000 * 60 * 60 * 8; // 8 ชม. idle
const ABS_MS = 1000 * 60 * 60 * 24 * 30; // 30 วัน absolute

export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<void> {
  const token = randomToken();
  const now = Date.now();
  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      idleExpiresAt: new Date(now + IDLE_MS),
      expiresAt: new Date(now + ABS_MS),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    expires: new Date(now + ABS_MS),
  });
}

// อ่าน session ปัจจุบัน + ต่ออายุ idle (sliding)
export async function getSessionUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  const now = new Date();
  if (!s || s.revokedAt || s.expiresAt < now || s.idleExpiresAt < now) return null;
  // ต่อ idle window แบบไม่ถี่เกิน (เขียนเมื่อเหลือ < ครึ่ง)
  if (s.idleExpiresAt.getTime() - now.getTime() < IDLE_MS / 2) {
    await prisma.session.update({
      where: { id: s.id },
      data: { idleExpiresAt: new Date(now.getTime() + IDLE_MS) },
    });
  }
  return s.user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token) },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(COOKIE);
}
