#!/usr/bin/env python3
"""เตรียมข้อมูลหน้าร้านบน App Store Connect ให้ครบก่อนยื่น

ทำไมต้องเป็นสคริปต์ ไม่ใช่กดในเว็บ: ช่องพวกนี้มีสิบกว่าช่อง กระจายอยู่คนละหน้า
กดมือแล้วตกหล่นง่าย · เขียนเป็นสคริปต์ = ตรวจซ้ำได้ ยื่นเวอร์ชันหน้าก็รันใหม่ได้

ใช้:
  python3 scripts/asc-listing.py show     → อ่านสถานะปัจจุบันทุกช่อง (ไม่แก้อะไร)
  python3 scripts/asc-listing.py apply    → ใส่ค่าตาม COPY ด้านล่าง

🔴 ไม่กด Submit ให้ — การส่งเข้า review ต้องเป็นมือเจ้าของเสมอ
🔴 App Privacy (แบบสอบถามข้อมูลส่วนบุคคล) Apple ไม่เปิดให้ API ตอบ ต้องกดในเว็บ
"""
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import jwt  # PyJWT

ROOT = Path(__file__).resolve().parent.parent
KEY_ID = "U9DGP7TVFK"
ISSUER = "40d5244e-97b6-47a8-9487-0ffa8db07dc4"
APP_ID = "6793749205"
KEY_PATH = ROOT / "apps/mobile/credentials/AuthKey_U9DGP7TVFK.p8"

# เวอร์ชันที่ build อัปมา (CFBundleShortVersionString) — เลขในสโตร์ต้องตรงกับตัวนี้ ไม่งั้นผูก build ไม่ได้
TARGET_VERSION = "1.0.0"

# ── ข้อความหน้าร้าน ────────────────────────────────────────────────────────────
# 🔴 กติกา: เขียนได้เฉพาะความสามารถที่ "มีจริงและใช้ได้แล้ว" (App Review 2.3 Accurate Metadata
#    + คำสั่งเจ้าของ: ห้ามแต่งข้อมูลที่ไม่มีจริง) · ทุกบรรทัดด้านล่างเทียบกับ SYSTEM_DEFS ได้
COPY = {
    "en-US": {
        "subtitle": "Run your whole shop in one app",   # ≤30
        "keywords": "POS,booking,queue,inventory,staff,accounting,restaurant,hotel,clinic,shop",  # ≤100
        "description": """SHARK HUB is an all-in-one business system for small businesses in Thailand.

Turn on only the systems you need — add more later, or turn them off. Everything shares one customer list, one product catalog and one set of books.

WHAT YOU CAN RUN
• Point of sale — open a bill, take cash, transfer or PromptPay, print a receipt, close the day
• Bookings and appointments — customers book from your shop link, choosing service, staff and a time that is genuinely free
• Queue tickets — issue tickets, call the next number, show a queue screen at the counter
• Members, points, rewards and coupons — points accrue automatically from sales
• Products, services and stock — stock is deducted when you sell, with low-stock alerts
• Staff (HR) — roster, PIN clock-in, leave requests and payroll
• Accounting — income and expenses recorded automatically from sales, VAT and financial reports
• Hotel, restaurant, rental, school and clinic modules
• AI assistant — ask about sales, get a summary of your business, or have it prepare an action for you to confirm

HOW IT WORKS
Sign in with your email — we send a one-time code, so there is no password to forget. Use it on the phone and on the web with the same account.

The AI assistant never changes anything on its own. It prepares the action and shows you exactly what will happen; nothing is saved until you confirm.

Free to use during this period.

Support: support@shark.in.th
Privacy policy: https://shark.in.th/privacy
Delete your account: https://shark.in.th/account-deletion""",
        "promotionalText": "Free during this period. Turn on only the systems your shop needs.",  # ≤170
    },
    "th": {
        "subtitle": "จัดการร้านครบในแอปเดียว",
        "keywords": "ระบบร้าน,ขายหน้าร้าน,POS,จองคิว,บัตรคิว,สต็อก,บัญชี,พนักงาน,ร้านอาหาร,โรงแรม",
        "description": """SHARK HUB คือระบบจัดการร้านครบวงจรสำหรับธุรกิจขนาดเล็กในไทย

เปิดใช้เฉพาะระบบที่ร้านคุณต้องใช้ เพิ่มทีหลังหรือปิดก็ได้ ทุกระบบใช้ฐานลูกค้าเดียวกัน รายการสินค้าชุดเดียวกัน และลงบัญชีชุดเดียวกัน

ระบบที่เปิดใช้ได้
• ขายหน้าร้าน — เปิดบิล รับเงินสด โอน หรือพร้อมเพย์ ออกใบเสร็จ ปิดยอดรายวัน
• จองคิว / นัดหมาย — ลูกค้าจองเองผ่านลิงก์ร้าน เลือกบริการ ช่าง และเวลาที่ว่างจริง
• บัตรคิวหน้าร้าน — ออกบัตร เรียกคิว พร้อมจอแสดงคิว
• สมาชิก แต้ม ของรางวัล และคูปอง — สะสมแต้มอัตโนมัติจากยอดขาย
• สินค้า/บริการ และสต็อก — ตัดสต็อกอัตโนมัติเมื่อขาย แจ้งเตือนของใกล้หมด
• พนักงาน — ตารางเข้างาน ลงเวลาด้วย PIN ใบลา และเงินเดือน
• บัญชี — บันทึกรายรับรายจ่ายอัตโนมัติจากการขาย ภาษีมูลค่าเพิ่ม และรายงานงบ
• โรงแรม ร้านอาหาร เช่าสินทรัพย์ โรงเรียน และคลินิก
• ผู้ช่วย AI — ถามยอดขาย ขอสรุปธุรกิจ หรือให้ช่วยทำรายการแทน

การใช้งาน
เข้าระบบด้วยอีเมล เราส่งรหัสใช้ครั้งเดียวให้ ไม่ต้องจำรหัสผ่าน ใช้บนมือถือและบนเว็บด้วยบัญชีเดียวกัน

ผู้ช่วย AI ไม่แก้ข้อมูลเองตามลำพัง มันจะเตรียมรายการแล้วแสดงให้ดูก่อนว่าจะเกิดอะไรขึ้น ยังไม่บันทึกจนกว่าคุณจะกดยืนยัน

ช่วงนี้ใช้ฟรี

ติดต่อ: support@shark.in.th
นโยบายความเป็นส่วนตัว: https://shark.in.th/privacy
ลบบัญชี: https://shark.in.th/account-deletion""",
        "promotionalText": "ช่วงนี้ใช้ฟรี — เปิดใช้เฉพาะระบบที่ร้านคุณต้องใช้",
    },
}

URLS = {
    "supportUrl": "https://shark.in.th/support",
    "marketingUrl": "https://shark.in.th",
}
PRIVACY_URL = "https://shark.in.th/privacy"

# หมายเหตุถึงผู้ตรวจ — เขียนให้เดินตามได้จริงโดยไม่ต้องเดา
REVIEW_NOTES = """Sign in uses a one-time code sent by email. The demo account below is on an
allowlist that receives a fixed code, so no mailbox access is needed.

  Email: appreview@shark.in.th
  Code : 577638

After signing in you land on a demo shop ("ร้านตัวอย่าง (App Review)") that already contains
products, staff, appointments and sales, so every screen has real data to look at.

Most business screens are rendered from https://shark.in.th/app inside the app. The native
screens are sign-in, the AI assistant chat and the setup wizard.

ACCOUNT DELETION (guideline 5.1.1(v)):
  Menu (top-left) -> ตั้งค่า (Settings) -> ความเป็นส่วนตัว (Privacy) -> ลบบัญชีของฉัน (Delete my account)
  Web equivalent: https://shark.in.th/account-deletion

The interface is Thai because the app targets small businesses in Thailand."""

REVIEW_CONTACT = {
    "contactFirstName": "Suksomsri",
    "contactLastName": "Team",
    "contactEmail": "support@shark.in.th",
    "contactPhone": "+66800000000",
    "demoAccountName": "appreview@shark.in.th",
    "demoAccountPassword": "577638",
    "demoAccountRequired": True,
    "notes": REVIEW_NOTES,
}

BASE = "https://api.appstoreconnect.apple.com/v1/"


def token() -> str:
    return jwt.encode(
        {"iss": ISSUER, "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"},
        KEY_PATH.read_text(),
        algorithm="ES256",
        headers={"kid": KEY_ID, "typ": "JWT"},
    )


TOK = token()


def api(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"},
    )
    try:
        raw = urllib.request.urlopen(req).read()
        return json.loads(raw) if raw else {"ok": True}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            errs = json.loads(raw).get("errors", [])
            detail = " | ".join(f"{x.get('title')}: {x.get('detail')}" for x in errs)
        except Exception:
            detail = raw[:300]
        return {"ERR": e.code, "detail": detail}


def version_id() -> str:
    d = api("GET", f"apps/{APP_ID}/appStoreVersions?limit=1")
    return d["data"][0]["id"]


def info_id() -> str:
    d = api("GET", f"apps/{APP_ID}/appInfos?limit=1")
    return d["data"][0]["id"]


def show():
    vid, iid = version_id(), info_id()
    v = api("GET", f"appStoreVersions/{vid}")["data"]["attributes"]
    print(f"เวอร์ชัน {v['versionString']} · สถานะ {v['appStoreState']}")

    b = api("GET", f"appStoreVersions/{vid}/build")
    bd = b.get("data")
    print("build ที่ผูก:", bd["attributes"]["version"] if bd else "❌ ยังไม่ผูก")

    inf = api("GET", f"appInfos/{iid}?include=primaryCategory,secondaryCategory")
    cats = [c["id"] for c in inf.get("included", [])]
    print("หมวดหมู่:", ", ".join(cats) if cats else "❌ ยังไม่เลือก")

    for loc in api("GET", f"appInfos/{iid}/appInfoLocalizations").get("data", []):
        a = loc["attributes"]
        print(f"  [{a['locale']}] ชื่อ={a.get('name')!r} subtitle={a.get('subtitle') or '❌'} privacy={a.get('privacyPolicyUrl') or '❌'}")

    for loc in api("GET", f"appStoreVersions/{vid}/appStoreVersionLocalizations").get("data", []):
        a = loc["attributes"]
        n = len(a.get("description") or "")
        shots = api("GET", f"appStoreVersionLocalizations/{loc['id']}/appScreenshotSets")
        print(f"  [{a['locale']}] คำบรรยาย={n} ตัวอักษร keywords={a.get('keywords') or '❌'} "
              f"support={'✅' if a.get('supportUrl') else '❌'} รูป={len(shots.get('data', []))} ชุด")

    rd = api("GET", f"appStoreVersions/{vid}/appStoreReviewDetail").get("data")
    print("ข้อมูลผู้ตรวจ:", "✅ demo " + (rd["attributes"].get("demoAccountName") or "-") if rd else "❌ ยังไม่กรอก")


def upsert_version_localization(vid: str, locale: str, copy: dict):
    existing = {l["attributes"]["locale"]: l["id"]
                for l in api("GET", f"appStoreVersions/{vid}/appStoreVersionLocalizations").get("data", [])}
    attrs = {
        "description": copy["description"],
        "keywords": copy["keywords"],
        "promotionalText": copy["promotionalText"],
        **URLS,
    }
    if locale in existing:
        r = api("PATCH", f"appStoreVersionLocalizations/{existing[locale]}",
                {"data": {"type": "appStoreVersionLocalizations", "id": existing[locale], "attributes": attrs}})
        return locale, "แก้ไข", r
    r = api("POST", "appStoreVersionLocalizations", {"data": {
        "type": "appStoreVersionLocalizations",
        "attributes": {"locale": locale, **attrs},
        "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}},
    }})
    return locale, "สร้างใหม่", r


def upsert_info_localization(iid: str, locale: str, copy: dict):
    existing = {l["attributes"]["locale"]: l["id"]
                for l in api("GET", f"appInfos/{iid}/appInfoLocalizations").get("data", [])}
    attrs = {"subtitle": copy["subtitle"], "privacyPolicyUrl": PRIVACY_URL}
    if locale in existing:
        r = api("PATCH", f"appInfoLocalizations/{existing[locale]}",
                {"data": {"type": "appInfoLocalizations", "id": existing[locale], "attributes": attrs}})
        return locale, "แก้ไข", r
    r = api("POST", "appInfoLocalizations", {"data": {
        "type": "appInfoLocalizations",
        "attributes": {"locale": locale, "name": "SHARK HUB", **attrs},
        "relationships": {"appInfo": {"data": {"type": "appInfos", "id": iid}}},
    }})
    return locale, "สร้างใหม่", r


def apply():
    # ตรวจความยาวก่อนยิง — Apple ตัดสินตามจำนวนตัวอักษร ไม่ใช่ "ดูแล้วน่าจะพอ"
    for loc, c in COPY.items():
        assert len(c["subtitle"]) <= 30, f"{loc} subtitle ยาว {len(c['subtitle'])} (เกิน 30)"
        assert len(c["keywords"]) <= 100, f"{loc} keywords ยาว {len(c['keywords'])} (เกิน 100)"
        assert len(c["promotionalText"]) <= 170, f"{loc} promo ยาว {len(c['promotionalText'])} (เกิน 170)"
        assert len(c["description"]) <= 4000, f"{loc} description ยาว {len(c['description'])} (เกิน 4000)"
    print("✅ ความยาวทุกช่องอยู่ในเกณฑ์\n")

    vid, iid = version_id(), info_id()

    # 1. เลขเวอร์ชันต้องตรงกับ build ก่อน ไม่งั้นผูกไม่ได้
    cur = api("GET", f"appStoreVersions/{vid}")["data"]["attributes"]["versionString"]
    if cur != TARGET_VERSION:
        r = api("PATCH", f"appStoreVersions/{vid}",
                {"data": {"type": "appStoreVersions", "id": vid, "attributes": {"versionString": TARGET_VERSION}}})
        print(f"เลขเวอร์ชัน {cur} → {TARGET_VERSION}:", "❌ " + r["detail"] if "ERR" in r else "✅")

    # 2. ผูก build ล่าสุดที่ยังไม่หมดอายุ
    builds = [b for b in api("GET", f"apps/{APP_ID}/builds?limit=20").get("data", [])
              if not b["attributes"]["expired"]]
    builds.sort(key=lambda b: int(b["attributes"]["version"]), reverse=True)
    if builds:
        b = builds[0]
        r = api("PATCH", f"appStoreVersions/{vid}/relationships/build",
                {"data": {"type": "builds", "id": b["id"]}})
        print(f"ผูก build #{b['attributes']['version']}:", "❌ " + r["detail"] if "ERR" in r else "✅")

    # 3. หมวดหมู่
    r = api("PATCH", f"appInfos/{iid}", {"data": {"type": "appInfos", "id": iid, "relationships": {
        "primaryCategory": {"data": {"type": "appCategories", "id": "BUSINESS"}},
        "secondaryCategory": {"data": {"type": "appCategories", "id": "PRODUCTIVITY"}},
    }}})
    print("หมวดหมู่ Business + Productivity:", "❌ " + r["detail"] if "ERR" in r else "✅")

    # 4. ข้อความรายภาษา
    for locale, c in COPY.items():
        for fn in (upsert_info_localization, upsert_version_localization):
            loc, act, r = fn(iid if fn is upsert_info_localization else vid, locale, c)
            label = "ชื่อ/subtitle/privacy" if fn is upsert_info_localization else "คำบรรยาย/keywords/URL"
            print(f"[{loc}] {label} ({act}):", "❌ " + r["detail"] if "ERR" in r else "✅")

    # 5. ข้อมูลผู้ตรวจ + บัญชี demo
    rd = api("GET", f"appStoreVersions/{vid}/appStoreReviewDetail").get("data")
    if rd:
        r = api("PATCH", f"appStoreReviewDetails/{rd['id']}",
                {"data": {"type": "appStoreReviewDetails", "id": rd["id"], "attributes": REVIEW_CONTACT}})
    else:
        r = api("POST", "appStoreReviewDetails", {"data": {
            "type": "appStoreReviewDetails", "attributes": REVIEW_CONTACT,
            "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}},
        }})
    print("ข้อมูลผู้ตรวจ + บัญชี demo:", "❌ " + r["detail"] if "ERR" in r else "✅")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "show"
    if cmd == "apply":
        apply()
        print("\n── อ่านกลับมายืนยัน ──")
        show()
    else:
        show()
