#!/usr/bin/env python3
"""S3b.2 — สร้าง fixture ภาพสโตร์ 2.0 (ไทย/อังกฤษ) จาก fixture QC ของจอเลขาที่ผ่านข้อสอบแล้ว

ข้อมูลจำลองล้วน (ไม่แตะฐานข้อมูล · ไม่มี token) — แค่:
  th: ลบป้าย "QC" ที่มองเห็นได้ (ชื่อ/อีเมลทดสอบ)
  en: แปลทุกข้อความที่มองเห็นเป็นอังกฤษ + ตั้งภาษาเลขา = en (จอเลขาเปลี่ยนภาษาตาม languages[0])
      ห้องแชทลูกค้า: ทีมภาษาอังกฤษ · ลูกค้าญี่ปุ่น → แสดงคำแปลอังกฤษ
ใช้: python3 ledger/store-2.0/make-fixtures.py   → ledger/store-2.0/fixtures/<th|en>/<src>.json
"""
import copy
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/mobile/qc/fixtures/secretary"
OUT = ROOT / "ledger/store-2.0/fixtures"
SOURCES = ["s2.4", "s2.20", "s2.5", "s3a6", "s2.7"]

TH = {
    "คุณสุข (QC)": "คุณสุข",
    "ใบเสนอราคา Q-0012 ฿12,500 · คุณลูกค้า QC · เครื่องชง 2 ชุด ลด 5% · ส่งทาง LINE":
        "ใบเสนอราคา Q-0012 ฿12,500 · คุณสมชาย ร้านดอยช้าง · เครื่องชง 2 ชุด ลด 5% · ส่งทาง LINE",
    "owner@qc.invalid": "owner@example.com",
}

EN = {
    "คุณสุข (QC)": "Suk",
    "owner@qc.invalid": "owner@example.com",
    "บลูเฮาส์ หอพัก": "Blue House Residence",
    "ครับ": "",
    "สรุปยอดขายเมื่อวาน": "Yesterday's sales summary",
    "ใบเสนอราคา ร้านตัวอย่าง": "Quotation for a sample shop",
    "ใบเสนอราคา ร้านดอยช้าง": "Quotation · Doi Chang Coffee",
    "สมใจ": "Somjai",
    "เตรียมใบเสนอราคา Q-0012": "Preparing quotation Q-0012",
    "ค้นหาลูกค้า \"สมชาย ดอยช้าง\" · พบ 1 ราย · เครดิต 30 วัน": "Looked up customer \"Somchai, Doi Chang\" · 1 found · 30-day credit",
    "ร่างใบเสนอราคา Q-0012 · ฿12,500": "Drafted quotation Q-0012 · ฿12,500",
    "ส่ง LINE ถึงคุณสมชาย — รออนุมัติ": "LINE message to Somchai — awaiting approval",
    "ทำใบเสนอราคาให้คุณสมชาย ร้านดอยช้าง เครื่องชง 2 ชุด ลด 5% แล้วส่ง LINE ให้เลย":
        "Make a quotation for Somchai at Doi Chang Coffee: 2 espresso machines, 5% off, then send it on LINE",
    "รับทราบครับ ขอเช็กข้อมูลในระบบก่อนนะครับ": "Got it. Let me check the details first.",
    "🔔 คุณสุข เพิ่ม สมใจ เข้าห้องงานนี้": "🔔 Suk added Somjai to this task room",
    "ร่างเสร็จแล้วครับ ขออนุมัติก่อนส่งถึงลูกค้า": "The draft is ready. Please approve before it goes to the customer.",
    "ส่งข้อความถึง คุณสมชาย (LINE):\nสวัสดีครับคุณสมชาย ทางร้าน The Bean Café ส่งใบเสนอราคา Q-0012 เครื่องชง Espresso M2 2 ชุด ส่วนลด 5% ยอดสุทธิ ฿12,500 เครดิต 30 วัน สอบถามเพิ่มเติมได้เลยครับ":
        "Message to Somchai (LINE):\nHello Somchai, The Bean Café is sending quotation Q-0012 for 2 Espresso M2 machines, 5% off, net ฿12,500, 30-day credit. Let us know if you have any questions.",
    "ส่งข้อความถึงลูกค้า — ต้องมีคนอนุมัติเสมอ": "Messages to customers always need approval",
    "สร้างการ์ด \"ติดตามดอยช้าง\" บนบอร์ดขาย · ครบกำหนด 8 พ.ย.": "Create card \"Follow up Doi Chang\" on the sales board · due 8 Nov",
    "ติดตามดอยช้าง": "Follow up Doi Chang",
    "โทรถามผลใบเสนอราคา Q-0012": "Call about quotation Q-0012",
    "เขียนข้อมูลลงบอร์ดงาน — รุ่นแรกทุกงานที่เขียนข้อมูลต้องมีคนอนุมัติ": "Writes to the task board — every write needs approval",
    "ย้ายดีล \"ดอยช้าง · เครื่องชง 2 ชุด\" เข้าขั้นเสนอราคา": "Move deal \"Doi Chang · 2 machines\" to Quoted",
    "ส่งข้อความถึงคุณสมชายแล้ว": "Message sent to Somchai",
    "สร้างการ์ดแล้ว": "Card created",
    "ติดตามดอยช้าง (โทร)": "Follow up Doi Chang (call)",
    "ย้อนกลับแล้ว — ดีลกลับไปขั้นเดิม": "Undone — the deal is back in its previous stage",
    "ข้อความนี้ตอบโดย Shark ผู้ช่วย AI ของร้าน — ทีมงานจะติดต่อกลับในเวลาทำการ": "This reply is from Shark, the shop's AI assistant. Our team will get back to you during opening hours.",
    "ตอบโดย Shark ผู้ช่วย AI ของร้าน": "Answered by Shark, the shop's AI assistant",
    "แชทหน้าร้าน": "Shop chat",
    "เว็บแชท": "Web chat",
    "แชทหอพัก": "Residence chat",
    "คุณสมชาย · ร้านดอยช้าง": "Somchai · Doi Chang Coffee",
    "น้ำ": "Nam",
    "ได้รับใบเสนอราคาแล้วค่ะ ขอเครดิต 45 วันได้ไหม": "Got the quotation. Could we have 45-day credit?",
    "ดีล": "Deal",
    "คุณมานี": "Manee",
    "สนใจคอร์สชงกาแฟวันเสาร์ค่ะ ยังมีที่ไหม": "Is there still a seat in Saturday's barista class?",
    "ใหม่": "New",
    "ป้าแดง": "Auntie Daeng",
    "ก้อง": "Kong",
    "[สติกเกอร์]": "[Sticker]",
    "คุณเก่ง · บลูเฮาส์": "Keng · Blue House",
    "คุณ: ส่งสลิปค่าเช่าแล้วนะครับ ขอบคุณครับ": "You: Rent slip received, thank you!",
    "หอพัก": "Residence",
    "ผู้เยี่ยมชม #4821": "Visitor #4821",
    "ร้านเปิดกี่โมงคะ · Shark ตอบแล้วนอกเวลาทำการ": "What time do you open? · Shark replied after hours",
    "รอคน": "Needs a person",
    "คุณวิไล": "Wilai",
    "ได้รับของแล้วค่ะ ขอบคุณมาก": "Got my order, thank you!",
    "สวัสดีค่ะ ได้รับใบเสนอราคาแล้วค่ะ ขอเครดิต 45 วันได้ไหมคะ": "Hi, I got the quotation. Could we have 45-day credit?",
    "🙋 น้ำ เรียก ก้อง มาช่วย: ลูกค้าถามเรื่องห้องพักด้วย": "🙋 Nam asked Kong to help: the customer is also asking about rooms",
    "ลูกค้าเก่า จ่ายตรงทุกครั้ง ให้ได้ค่ะ @ก้อง ช่วยดูเรื่องห้องพักที": "Long-time customer, always pays on time — OK. @Kong can you check the rooms?",
    "ได้เลยค่ะ เดี๋ยวแก้ใบเสนอราคาให้นะคะ": "Sure, I'll update the quotation.",
    "⏰ ยังไม่มีคนตอบลูกค้าเกิน 15 นาที — เตือนผู้ดูแลแล้ว": "⏰ No reply for over 15 minutes — the manager has been notified",
    "ระบบแชท": "Chat system",
    "แก้ใบเสนอราคา Q-0012 เป็นเครดิต 45 วันแล้วค่ะ แนบไฟล์ใหม่มาให้นะคะ\n— ข้อความนี้ส่งโดย Shark ผู้ช่วย AI ของร้าน":
        "Quotation Q-0012 is updated to 45-day credit — new file attached.\n— Sent by Shark, the shop's AI assistant",
    "ขอบคุณค่ะ ขอดูห้องพักวันเสาร์ด้วยได้ไหมคะ": "Thanks! Could I also see a room for Saturday?",
    "คุณสมชาย": "Somchai",
    "ลูกค้าถามเรื่องห้องพักด้วย": "Customer is also asking about rooms",
    "สวัสดีค่ะคุณสมชาย เครดิต 45 วันได้ค่ะ เดี๋ยวทางร้านแก้ใบเสนอราคาและส่งให้ใหม่ภายในวันนี้นะคะ":
        "Hi Somchai, 45-day credit is fine. We'll send the updated quotation today.",
    "ขอบคุณค่ะ 🙏": "Thank you 🙏",
    "ที่อยู่ร้าน": "Address",
    "ร้านอยู่ที่ {shop.address} ค่ะ": "We're at {shop.address}.",
    "เวลาเปิด": "Opening hours",
    "ร้านเปิด 09:00–18:00 ทุกวันค่ะ": "We're open 09:00–18:00 every day.",
    "โอนแล้วแจ้งได้เลย": "Payment slip",
    "โอนแล้วส่งสลิปในแชทนี้ได้เลยค่ะ": "After transferring, just send the slip in this chat.",
    "เมนูวันนี้": "Today's menu",
    "เมนูวันนี้ค่ะ": "Here's today's menu.",
    "ร้านอยู่ที่ 12 ถนนนิมมาน เชียงใหม่ ค่ะ": "We're at 12 Nimman Road, Chiang Mai.",
    "คุณสมศรี": "Somsri",
    "ยิ่ง": "Ying",
    "บอย": "Boy",
    "ตามลูกค้าที่เงียบเกิน 14 วัน": "Follow up customers quiet for 14+ days",
    "สรุปยอดขายเมื่อวาน + ของใกล้หมด": "Yesterday's sales + low stock",
    "ปิดบิลค้างห้อง 204 · คืนมัดจำ": "Close room 204 bill · refund deposit",
    "เช็กคิวพรุ่งนี้และร่างข้อความยืนยัน": "Check tomorrow's bookings and draft confirmations",
    "ทำใบเสนอราคาให้คุณสมชาย ร้านดอยช้าง เครื่องชง 2 ชุด ลด 5%": "Quotation for Somchai, Doi Chang: 2 machines, 5% off",
    "🔔 คุณสุข เพิ่ม สมใจ (พนักงาน) เข้าห้องงานนี้": "🔔 Suk added Somjai (staff) to this task room",
    "ลูกค้าขอเครดิต 45 วันค่ะ Shark ช่วยแก้ให้หน่อย": "The customer asked for 45-day credit. Shark, can you update it?",
    "แก้เป็น 45 วันแล้วครับ รอคุณสุขอนุมัติ เพราะคุณสมใจไม่มีสิทธิ์อนุมัติเอกสารเงิน":
        "Changed to 45 days. Waiting for Suk to approve, since Somjai can't approve financial documents.",
    "ใบเสนอราคา Q-0012 · ฿12,500\nคุณสมชาย · ร้านดอยช้าง · เครดิต 45 วัน": "Quotation Q-0012 · ฿12,500\nSomchai · Doi Chang Coffee · 45-day credit",
    "เอกสารเงิน — ต้องให้เจ้าของหรือผู้จัดการอนุมัติ": "Financial document — owner or manager must approve",
    "ใบเสนอราคา Q-0012": "Quotation Q-0012",
    "เครดิต 45 วัน": "45-day credit",
    "ออกใบเสนอราคา Q-0012 แล้ว": "Quotation Q-0012 issued",
    "เครดิต 45 วัน (โทรยืนยัน)": "45-day credit (confirm by phone)",
    "มีดีล 3 รายการเงียบเกิน 14 วัน": "3 deals have been quiet for 14+ days",
    "ช่วยร่างข้อความตามลูกค้า 3 รายที่เงียบเกิน 14 วัน แล้วเสนอให้ผมดูก่อนส่ง": "Draft follow-ups for the 3 customers quiet for 14+ days and show me before sending",
    "เมล็ดกาแฟเอธิโอเปียเหลือ 2 กก.": "Only 2 kg of Ethiopian beans left",
    "ช่วยร่างใบสั่งซื้อเมล็ดกาแฟถึงซัพพลายเออร์เดิม ให้ผมตรวจก่อนส่ง": "Draft a purchase order for beans to our usual supplier for me to check",
    "ใบเสนอราคา": "Quotation",
    "ตามลูกค้าเงียบ": "Quiet customers",
    "เช็กคิวพรุ่งนี้": "Tomorrow's bookings",
    "ค้างชำระหอพัก": "Unpaid rent",
    "โพสต์โปรเดือนนี้": "This month's promo post",
    "สวัสดีครับ มีอะไรให้ช่วยไหม": "Hi! How can I help?",
    "ใบเสนอราคา Q-0012 ฿12,500 · คุณลูกค้า QC · เครื่องชง 2 ชุด ลด 5% · ส่งทาง LINE":
        "Quotation Q-0012 ฿12,500 · Somchai, Doi Chang · 2 machines, 5% off · send on LINE",
    "เงิน + ส่งถึงลูกค้า": "money + sent to customer",
    "คืนเงินมัดจำห้อง 204 ฿2,400 · ยกเลิกก่อน 7 วันตามนโยบาย · โอนเข้าบัญชีเดิม": "Refund room 204 deposit ฿2,400 · cancelled 7+ days ahead per policy · to the original account",
    "คืนเงิน = ต้องอนุมัติเสมอ": "Refunds always need approval",
    "ตอบรีวิว 1 ดาวบน Facebook: \"ขออภัยค่ะ กาแฟรอนานเกินไป ครั้งหน้า…\" (ลงชื่อว่าเป็นผู้ช่วย AI)":
        "Reply to a 1-star Facebook review: \"We're sorry the wait was so long. Next time…\" (signed as AI assistant)",
    "ส่งถึงลูกค้าสาธารณะ": "public reply to a customer",
    "ลบการ์ดงานซ้ำ 3 ใบ ในบอร์ดหน้าร้าน": "Delete 3 duplicate cards on the shop board",
    "ลบถาวร ย้อนไม่ได้": "permanent delete, can't be undone",
    "เตือนค่าหอค้างชำระ 12 ห้อง + บันทึกยอดค้าง": "Remind 12 rooms about unpaid rent + record balances",
    "ทุกวัน": "Every day",
    "ตามดีลที่เงียบเกิน 14 วัน แล้วร่างข้อความรออนุมัติ": "Follow up deals quiet for 14+ days and draft messages for approval",
    "ทุกสัปดาห์ (วันจันทร์)": "Weekly (Monday)",
    "ยืนยันคิวล่วงหน้า 1 วัน": "Confirm bookings 1 day ahead",
    "ออกใบเสนอราคาแล้ว": "Quotation issued",
    "Sweet Studio · จองคิว": "Sweet Studio · Booking",
    "สวัสดีครับ Sharkพร้อมช่วยงานแล้วครับ วันนี้มีอะไรให้ช่วยดูแลบ้างครับ": "Hi, Shark here and ready to help. What can I take care of today?",
    "ค่ะ": "",
    "จองคิว": "Booking",
    "สมาชิก": "Members",
    "บัญชี": "Accounting",
    "บอร์ดงาน": "Task board",
    "แชท": "Chat",
    "คุณนัท": "Nat",
    "มิ้นท์": "Mint",
    "ส่ง LINE ใบเสนอราคา Q-0012 → ลูกค้า A": "LINE quotation Q-0012 → customer A",
    "ย้ายดีล \"ร้านกาแฟ B\" → ขั้นเสนอราคา": "Move deal \"Café B\" → Quoted",
    "สร้างใบเสนอราคา Q-0012 ฿12,500": "Created quotation Q-0012 ฿12,500",
    "อ่านราคา + สต็อก Espresso M2": "Read price + stock of Espresso M2",
    "ค้นหาลูกค้าที่เงียบเกิน 30 วัน": "Found customers quiet for 30+ days",
    "สร้างการ์ดติดตามลูกค้า 6 ใบ": "Created 6 follow-up cards",
    "สรุปยอดขาย 4 พ.ย.": "Sales summary 4 Nov",
    "ย้อนกลับแล้ว ดีลกลับไปขั้นเดิม": "Undone, the deal is back in its previous stage",
    "ใบเสนอราคาต้องมีเลขผู้เสียภาษีของลูกค้า": "Quotations must include the customer's tax ID",
    "ส่งใบเสนอราคาทาง LINE ก่อนโทรตามเสมอ": "Always send the quotation on LINE before calling",
    "บทเรียนที่ไม่รับแล้ว": "Retired lesson",
    "ส่วนลดสูงสุด 10% · ลูกค้าประจำ 15% ต้องให้เจ้าของอนุมัติ": "Max discount 10% · 15% for regulars needs owner approval",
    "เปิด จ.–ส. 7:30–18:00 · หยุดวันนักขัตฤกษ์": "Open Mon–Sat 7:30–18:00 · closed on public holidays",
    # ห้องแชทลูกค้า x9 (en: ทีมภาษาอังกฤษ ลูกค้าญี่ปุ่น)
    "สวัสดีค่ะ วันเสาร์หน้าจองโต๊ะสำหรับ 4 คนได้ไหมคะ": "Hello, can I book a table for 4 next Saturday?",
}

# x9 ฉบับอังกฤษ: ข้อความลูกค้าเป็นญี่ปุ่นทั้งห้อง · ทีมใช้อังกฤษ
X9_EN = {
    "m91": {"body": "こんにちは！エスプレッソM2の在庫はありますか？来週チェンマイに2台届けてほしいです。"},
    "m92": {"body": "こんにちは、在庫あります。配送日を確認しますね。"},
}
X9_EN_SUGGEST_BODY = "はい、来週の水曜日にエスプレッソM2を2台チェンマイへお届けできます。お見積もりをお送りしましょうか？"
X9_EN_SUGGEST_GLOSS = "Yes, we can deliver 2 Espresso M2 units to Chiang Mai next Wednesday. Shall I send you a quotation?"
X9_EN_M91_TR = "Hi! Do you have the Espresso M2 in stock? I'd like 2 units delivered to Chiang Mai next week."
X9_EN_DRAFT_TR = "はい、水曜日にお届けできます。本日お見積もりをお送りします。"

THAI = re.compile("[\u0e00-\u0e3e\u0e40-\u0e7f]")  # ไม่นับ ฿ (U+0E3F)


def sub(o, table):
    if isinstance(o, dict):
        return {k: sub(v, table) for k, v in o.items()}
    if isinstance(o, list):
        return [sub(v, table) for v in o]
    if isinstance(o, str) and o in table:
        return table[o]
    return o


def thai_left(o, path="", out=None):
    out = [] if out is None else out
    if isinstance(o, dict):
        for k, v in o.items():
            thai_left(v, f"{path}.{k}", out)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            thai_left(v, f"{path}[{i}]", out)
    elif isinstance(o, str) and THAI.search(o):
        out.append((path, o))
    return out


def en_fix(name, d):
    ep = d["endpoints"]
    for k, v in ep.items():
        if k.endswith("/secretary/me") and isinstance(v, dict) and "languages" in v:
            v["languages"] = ["en"]
            v["suffix"] = ""
        if k.endswith("/secretary/secretary") and isinstance(v, dict) and "languages" in v:
            v["languages"] = ["en"]
            v["suffix"] = ""
    if name == "s3a6":
        conv = ep["GET /api/mobile/inbox/conversations/x9"]["conversation"]
        conv["staffLang"], conv["contactLang"] = "en", "ja"
        conv["lastMessagePreview"] = "こんにちは、来週の土曜日に4名で予約できますか？"
        for m in ep["GET /api/mobile/inbox/conversations/x9"]["messages"]:
            m.update(X9_EN.get(m["id"], {}))
            if m.get("translatedLang") == "th":
                m["translatedLang"] = "en"
        sg = ep["POST /api/mobile/inbox/conversations/x9/ai-suggest"]
        sg["replyLang"] = "ja"
        sg["options"][0]["body"] = X9_EN_SUGGEST_BODY
        sg["options"][0]["gloss"] = X9_EN_SUGGEST_GLOSS
        tr = ep["POST /api/mobile/inbox/conversations/x9/messages/m91/translate"]
        tr["text"], tr["lang"] = X9_EN_M91_TR, "en"
        ep["POST /api/mobile/inbox/conversations/x9/translate-draft"]["text"] = X9_EN_DRAFT_TR
    return d


def main():
    for loc in ("th", "en"):
        (OUT / loc).mkdir(parents=True, exist_ok=True)
    for name in SOURCES:
        src = json.loads((SRC / f"{name}.json").read_text())
        th = sub(copy.deepcopy(src), TH)
        th["_about"] = f"S3b.2 ภาพสโตร์ 2.0 (ไทย) จาก {name}.json — ข้อมูลจำลองล้วน"
        th["locale"] = "th-TH"
        en = en_fix(name, sub(copy.deepcopy(src), EN))
        en["_about"] = f"S3b.2 store shots 2.0 (English) from {name}.json — demo data only"
        en["locale"] = "en-US"
        left = thai_left(en["endpoints"])
        if left:
            print(f"⚠️ {name} en: ยังมีภาษาไทย {len(left)} จุด")
            for p, s in left:
                print("   ", p, s[:80])
        for loc, d in (("th", th), ("en", en)):
            (OUT / loc / f"{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
        print(f"✅ {name}")


if __name__ == "__main__":
    main()
