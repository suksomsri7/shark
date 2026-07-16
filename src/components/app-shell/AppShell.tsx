"use client";

import { useState } from "react";
import { Topbar } from "./Topbar";
import { NavDrawer, type NavItem, type SoonItem } from "./NavDrawer";
import { HelpSheet } from "./HelpSheet";
import { AiDock } from "./AiDock";

// โครงแอปฝั่ง client: จัดการสถานะเปิด/ปิด drawer + ศูนย์ช่วยเหลือ
// รับข้อมูลที่ดึงจาก DB มาจาก layout (server) เป็น props — ตัว shell ไม่แตะ DB เอง
export function AppShell({
  tenantName,
  userEmail,
  items,
  soon,
  addHref,
}: {
  tenantName: string;
  userEmail: string;
  items: NavItem[];
  soon: SoonItem[];
  addHref: string;
}) {
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);

  return (
    <>
      <Topbar tenantName={tenantName} onMenu={() => setDrawer(true)} onHelp={() => setHelp(true)} />
      <NavDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        tenantName={tenantName}
        userEmail={userEmail}
        items={items}
        soon={soon}
        addHref={addHref}
      />
      <HelpSheet open={help} onClose={() => setHelp(false)} />
      <AiDock />
    </>
  );
}
