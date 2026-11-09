#!/usr/bin/env python3
"""S3b.2 — ร่างข้อความหน้าร้าน 2.0 → listing-2.0.json (รูปเดียวกับ COPY ใน scripts/asc-listing.py)

ไม่ยิง API · ไม่อ่านกุญแจ — แค่เขียนไฟล์และตรวจความยาวตามเพดานของ Apple
ใช้: python3 ledger/store-2.0/make-listing.py
asc-listing.py อ่านไฟล์นี้เมื่อตั้ง ASC_COPY_FILE=ledger/store-2.0/listing-2.0.json (ใช้ตอน S3b.3 หลังเจ้าของอนุมัติเท่านั้น)

🔴 SMS: เกตเวย์ SMS ยังไม่เปิดบน production (สมัคร/เข้าระบบด้วยเบอร์ใช้ได้เฉพาะเบอร์ทดสอบ · เชิญพนักงานด้วยเบอร์ถูกบล็อก
   sms_unavailable) ⇒ ข้อความหลักด้านล่าง "ไม่" สัญญาเรื่อง SMS · บรรทัดสำหรับเติมเมื่อเปิดเกตเวย์แล้วอยู่ใน OPTIONAL_SMS
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "listing-2.0.json"

EN_DESC = """SHARK HUB is an all-in-one business system for small businesses in Thailand — now with Shark, your AI secretary.

NEW IN 2.0: SHARK, YOUR AI SECRETARY
• Give tasks in plain language, e.g. "Make a quotation for customer A and send it on LINE". Shark opens a task room, works in the background and lets you know when it's done.
• Nothing happens without you. Anything that changes data or reaches a customer waits for your approval — edit it first, send it back with a note, or undo within 24 hours.
• One list of pending approvals across all your businesses.
• Recurring tasks: a daily sales summary, weekly follow-ups for quiet customers, booking confirmations a day ahead.
• Add teammates to a task room. Name your secretary, pick its tone and choose which systems it may use.

CUSTOMER CHAT IN ONE INBOX
• All connected customer chat channels in one place. Pick up, assign, hand over and see customer details on the go.
• Shark drafts replies for you. Translate messages from customers in other languages, or translate your reply before sending.
• Optional: let Shark answer general questions after hours — customers are always told it is an AI assistant.

RUN YOUR WHOLE SHOP
Turn on only the systems you need. Everything shares one customer list, one product catalog and one set of books.
• Point of sale — bills, cash, transfer or PromptPay, receipts, end-of-day
• Bookings and appointments — customers book from your shop link
• Queue tickets with a queue screen
• Members, points, rewards and coupons
• Products, services and stock with low-stock alerts
• Staff — roster, PIN clock-in, leave and payroll
• Accounting — income and expenses recorded from sales, VAT and reports
• Hotel, restaurant, rental, school and clinic modules

HOW IT WORKS
Sign in with your email — we send a one-time code, so there is no password to forget. Use the same account on the phone and on the web. Works in light and dark mode.

Shark uses an AI model from Anthropic. It never changes anything on its own: it prepares the action and shows you exactly what will happen; nothing is saved or sent until you approve.

Support: support@shark.in.th
Privacy policy: https://shark.in.th/privacy
Delete your account: https://shark.in.th/account-deletion"""

TH_DESC = """SHARK HUB คือระบบจัดการร้านครบวงจรสำหรับธุรกิจขนาดเล็กในไทย — เวอร์ชันนี้มาพร้อม "Shark" เลขา AI ของร้านคุณ

ใหม่ในเวอร์ชัน 2.0: เลขา AI "Shark"
• สั่งงานด้วยข้อความธรรมดา เช่น "ทำใบเสนอราคาให้ลูกค้า A แล้วส่งทาง LINE" — เลขาเปิดเป็นห้องงาน ทำเบื้องหลัง แล้วแจ้งเมื่อเสร็จ
• ไม่มีอะไรเกิดขึ้นโดยคุณไม่รู้ งานที่เปลี่ยนข้อมูลหรือส่งถึงลูกค้าต้องรอคุณอนุมัติก่อนเสมอ — แก้ก่อนอนุมัติ ตีกลับพร้อมสอน หรือย้อนกลับได้ภายใน 24 ชม.
• รวมงานรออนุมัติจากทุกกิจการไว้ที่เดียว
• งานประจำ: สรุปยอดขายทุกเช้า ตามลูกค้าที่เงียบทุกสัปดาห์ ยืนยันคิวล่วงหน้า 1 วัน
• ชวนเพื่อนร่วมทีมเข้าห้องงาน · ตั้งชื่อเลขา น้ำเสียง และเลือกว่าเลขาใช้ระบบไหนได้บ้าง

แชทลูกค้าทุกช่องทางในที่เดียว
• รวมแชทลูกค้าทุกช่องทางที่ร้านเชื่อมไว้ รับเรื่อง มอบหมาย ส่งต่อ และดูข้อมูลลูกค้าได้ในแอป
• Shark ร่างคำตอบให้ · ปุ่มแปลข้อความลูกค้าต่างภาษา และ "แปลแล้วส่ง"
• (ตัวเลือก) ให้ Shark ตอบคำถามทั่วไปนอกเวลาทำการ โดยบอกลูกค้าชัดเจนว่าเป็นผู้ช่วย AI

ระบบร้านครบในแอปเดียว
เปิดใช้เฉพาะระบบที่ร้านต้องใช้ ทุกระบบใช้ฐานลูกค้า รายการสินค้า และบัญชีชุดเดียวกัน
• ขายหน้าร้าน — เปิดบิล รับเงินสด โอน หรือพร้อมเพย์ ออกใบเสร็จ ปิดยอดรายวัน
• จองคิว / นัดหมาย — ลูกค้าจองเองผ่านลิงก์ร้าน
• บัตรคิวหน้าร้าน พร้อมจอแสดงคิว
• สมาชิก แต้ม ของรางวัล และคูปอง
• สินค้า/บริการ และสต็อก แจ้งเตือนของใกล้หมด
• พนักงาน — ตารางเข้างาน ลงเวลาด้วย PIN ใบลา และเงินเดือน
• บัญชี — บันทึกรายรับรายจ่ายจากการขาย ภาษีมูลค่าเพิ่ม และรายงานงบ
• โรงแรม ร้านอาหาร เช่าสินทรัพย์ โรงเรียน และคลินิก

การใช้งาน
เข้าระบบด้วยอีเมล เราส่งรหัสใช้ครั้งเดียวให้ ไม่ต้องจำรหัสผ่าน ใช้บนมือถือและบนเว็บด้วยบัญชีเดียวกัน · รองรับโหมดมืด

Shark ใช้โมเดล AI ของ Anthropic และไม่แก้ข้อมูลเองตามลำพัง — เลขาเตรียมรายการแล้วแสดงให้ดูก่อนว่าจะเกิดอะไรขึ้น ยังไม่บันทึกหรือส่งจนกว่าคุณจะกดอนุมัติ

ติดต่อ: support@shark.in.th
นโยบายความเป็นส่วนตัว: https://shark.in.th/privacy
ลบบัญชี: https://shark.in.th/account-deletion"""

COPY = {
    "en-US": {
        "subtitle": "AI secretary for your shop",
        "keywords": "AI assistant,secretary,POS,booking,inventory,staff,accounting,chat,inbox,restaurant,hotel",
        "promotionalText": "New: Shark, your AI secretary. Give tasks in chat and approve before anything happens. Customer chats in one inbox, with translation.",
        "description": EN_DESC,
        # What's New — ปรับจาก apps/mobile/RELEASE-NOTES-2.0.md (ตัด "SMS sign-in" และ "by phone" ออกจนกว่าเกตเวย์ SMS จะเปิด · ดู OPTIONAL_SMS)
        "whatsNew": "New: Shark, your AI secretary — give tasks in chat, approve before anything happens. Customer chats in one inbox with translation. Invite your team. Dark mode.",
    },
    "th": {
        "subtitle": "เลขา AI + ระบบร้านในแอปเดียว",
        "keywords": "เลขา AI,ผู้ช่วย AI,ระบบร้าน,POS,จองคิว,สต็อก,บัญชี,พนักงาน,แชทลูกค้า,ร้านอาหาร,โรงแรม",
        "promotionalText": "ใหม่! เลขา AI \"Shark\" สั่งงานในแชท อนุมัติก่อนทำทุกครั้ง · รวมแชทลูกค้าทุกช่องทางไว้ที่เดียว พร้อมแปลภาษา",
        "description": TH_DESC,
        "whatsNew": "ใหม่! เลขา AI \"Shark\" สั่งงานในแชท อนุมัติก่อนทำทุกครั้ง · รวมแชทลูกค้าทุกช่องทางในแอป พร้อมแปลภาษา · ชวนทีมเข้าห้องงาน · โหมดมืด",
    },
}

# เติมเมื่อเปิดเกตเวย์ SMS บน production แล้วเท่านั้น (เจ้าของตัดสิน — ดู README ข้อค้าง Q1)
OPTIONAL_SMS = {
    "en-US": {
        "description_how_it_works": "Sign in with your email or phone number — we send a one-time code, so there is no password to forget.",
        "whatsNew": "New: Shark, your AI secretary — give tasks in chat, approve before anything happens. Customer chats in one inbox with translation. Invite staff by phone. SMS sign-in.",
    },
    "th": {
        "description_how_it_works": "เข้าระบบด้วยอีเมลหรือเบอร์โทร เราส่งรหัสใช้ครั้งเดียวให้ ไม่ต้องจำรหัสผ่าน",
        "whatsNew": "ใหม่! เลขา AI \"Shark\" สั่งงานในแชท อนุมัติก่อนทำทุกครั้ง · รวมแชทลูกค้าทุกช่องทางในแอป พร้อมแปลภาษา · เชิญทีมด้วยเบอร์โทร · เข้าสู่ระบบด้วย SMS",
    },
}

LIMITS = {"subtitle": 30, "keywords": 100, "promotionalText": 170, "description": 4000, "whatsNew": 170}


def main():
    for loc, c in COPY.items():
        for k, lim in LIMITS.items():
            n = len(c[k])
            assert n <= lim, f"{loc}.{k} ยาว {n} > {lim}"
            print(f"  {loc:6} {k:16} {n:5}/{lim}")
        assert "SMS" not in c["description"] and "SMS" not in c["whatsNew"], f"{loc}: ข้อความหลักห้ามสัญญา SMS"
    for loc, c in OPTIONAL_SMS.items():
        assert len(c["whatsNew"]) <= 170, f"{loc} whatsNew(SMS) ยาว {len(c['whatsNew'])}"
    OUT.write_text(json.dumps({
        "_about": "S3b.2 ร่างข้อความหน้าร้าน SHARK HUB 2.0 — ยังไม่ส่งเข้า ASC · รอเจ้าของอนุมัติ (S3b.3)",
        "targetVersion": "2.0.0",
        "copy": COPY,
        "optionalSms": OPTIONAL_SMS,
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"✅ {OUT.relative_to(OUT.parents[2])}")


if __name__ == "__main__":
    main()
