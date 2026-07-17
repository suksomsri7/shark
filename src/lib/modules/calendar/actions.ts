"use server";

import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import * as calendar from "./service";
import type { CalEvent } from "./service";

// อ่านปฏิทินกลางของร้าน (READ-ONLY) — ผูก session ctx เอง ไม่รับ tenantId จากผู้เรียก
// รับช่วงเวลาเป็น ISO string (serializable ข้าม server↔client) คืน CalEvent[]
export async function getCalendarEventsAction(input: {
  from: string;
  to: string;
}): Promise<CalEvent[]> {
  const auth = await requireTenant();
  const membership = {
    role: auth.active.role,
    unitAccess: auth.active.unitAccess as string[],
    permissions: auth.active.permissions as Record<string, unknown>,
  };
  assertCan(membership, { module: "calendar", action: "calendar.event.read" });
  const from = new Date(input.from);
  const to = new Date(input.to);
  return calendar.getCalendarEvents(
    { tenantId: auth.active.tenantId, membership },
    { from, to },
  );
}
