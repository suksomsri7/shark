"use client";

import { useState, useEffect } from "react";
import { Topbar } from "./Topbar";
import { NavDrawer, type NavItem, type SoonItem } from "./NavDrawer";
import { HelpSheet } from "./HelpSheet";
import { AiDock } from "./AiDock";
import { loadNavBadgesAction } from "@/lib/support/actions";

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
  // perf A: โหลด badge หลังหน้าโผล่ (ไม่บล็อกการเปลี่ยนหน้า) · refresh เมื่อปิดศูนย์ช่วยเหลือ (อ่านแล้วเคลียร์)
  const [helpUnread, setHelpUnread] = useState(0);
  const [aiUnread, setAiUnread] = useState(0);
  // เปิดจากแอปมือถือ (WebView ส่ง UA "SharkApp") → ซ่อน orb เว็บ (แอปมีปุ่ม AI native ของตัวเอง — กัน orb ซ้อน)
  // เช็คใน effect กัน hydration mismatch (SSR ไม่รู้ UA client)
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    if (navigator.userAgent.includes("SharkApp")) setInApp(true);
  }, []);
  useEffect(() => {
    let alive = true;
    loadNavBadgesAction()
      .then((b) => { if (alive) { setHelpUnread(b.helpUnread); setAiUnread(b.aiUnread); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [help]);

  return (
    <>
      <Topbar
        tenantName={tenantName}
        onMenu={() => setDrawer(true)}
        onHelp={() => setHelp(true)}
        helpUnread={helpUnread}
      />
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
      {!inApp && <AiDock aiUnread={aiUnread} />}
    </>
  );
}
