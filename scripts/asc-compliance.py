#!/usr/bin/env python3
"""ตั้งช่องบังคับที่เหลือของการยื่นสโตร์ผ่าน ASC API — Age Rating · ราคา/ประเทศ · Content Rights

ทำไมต้องมี: `asc-listing.py` ดูแลเฉพาะ "หน้าร้าน" (ข้อความ/รูป/ผู้ตรวจ) แต่ ASC ยังบล็อกการยื่น
ถ้าไม่ตอบอีก 3 ชุดนี้ — และมันอยู่คนละหน้ากันในเว็บ กดมือแล้วลืมง่าย (22 ส.ค. ตรวจแล้วพบว่าไม่ได้ตอบเลยสักชุด)

ใช้:
  python3 scripts/asc-compliance.py show     → อ่านสถานะ (ไม่แก้อะไร)
  python3 scripts/asc-compliance.py apply    → ตั้งค่าตามคำตอบด้านล่าง

🔴 App Privacy (แบบสอบถามข้อมูลส่วนบุคคล) ไม่ได้อยู่ในสคริปต์นี้ — Apple ไม่เปิดให้ API ตอบ
   คำตอบทุกช่องอยู่ใน ledger/SUBMIT-STEPS.md ข้อ 2 (กดในเว็บเท่านั้น)
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("ascl", ROOT / "scripts/asc-listing.py")
_ascl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ascl)
api, APP_ID = _ascl.api, _ascl.APP_ID

# ── คำตอบ Age Rating (เจ้าของเคาะ 22 ส.ค. 2026) ────────────────────────────────
# แอปบริหารร้าน — ไม่มีเนื้อหาโหด/เพศ/ยา/พนัน/โฆษณาเลย → ตัวชี้วัดเนื้อหาทั้งหมด = NONE
# 2 ข้อที่เป็นดุลพินิจ (ไม่ใช่ข้อเท็จจริง) เจ้าของตัดสินแล้ว:
#   · messagingAndChat = True  — มีแชทร้าน↔ลูกค้า และแชทกับผู้ช่วย AI จริง ตอบตามจริง
#   · userGeneratedContent = False — เนื้อหาที่ผู้ใช้สร้างอยู่ในร้านตัวเอง ไม่ถูกเผยแพร่สู่สาธารณะ
#     (ตอบ True จะเข้ากติกา 1.2 ของ Apple: ต้องมีปุ่มรายงาน/บล็อก/กรองเนื้อหา ซึ่งเราไม่มีและไม่ต้องมี)
#   · unrestrictedWebAccess = False — WebView เปิดระบบของเราเอง ไม่ใช่เบราว์เซอร์ให้พิมพ์ URL อะไรก็ได้
AGE_RATING = {
    # ตัวชี้วัดเนื้อหา (NONE | INFREQUENT_OR_MILD | FREQUENT_OR_INTENSE)
    "alcoholTobaccoOrDrugUseOrReferences": "NONE",
    "contests": "NONE",
    "gamblingSimulated": "NONE",
    "gunsOrOtherWeapons": "NONE",
    "medicalOrTreatmentInformation": "NONE",
    "profanityOrCrudeHumor": "NONE",
    "sexualContentGraphicAndNudity": "NONE",
    "sexualContentOrNudity": "NONE",
    "horrorOrFearThemes": "NONE",
    "matureOrSuggestiveThemes": "NONE",
    "violenceCartoonOrFantasy": "NONE",
    "violenceRealistic": "NONE",
    "violenceRealisticProlongedGraphicOrSadistic": "NONE",
    # ความสามารถของแอป (BOOLEAN)
    "advertising": False,
    "gambling": False,
    "healthOrWellnessTopics": False,
    "lootBox": False,
    "messagingAndChat": True,
    "parentalControls": False,
    "ageAssurance": False,
    "socialMedia": False,
    "socialMediaAgeRestricted": False,
    "unrestrictedWebAccess": False,
    "userGeneratedContent": False,
}

BASE_TERRITORY = "USA"  # สกุลเงินฐานที่ Apple ใช้คำนวณราคาประเทศอื่น (แอปฟรี ไม่มีผลกับผู้ใช้)
CONTENT_RIGHTS = "DOES_NOT_USE_THIRD_PARTY_CONTENT"  # ไม่มีเนื้อหาของบุคคลที่สาม

# ช่อง Copyright ของเวอร์ชัน — **ASC บล็อกการยื่นถ้าเว้นว่าง** (24 ส.ค. ปุ่ม Add for Review ฟ้องข้อนี้ข้อเดียว)
# รูปแบบที่ Apple กำหนด: "<ปี> <ชื่อเจ้าของสิทธิ์>" — ใช้ชื่อนิติบุคคลเดียวกับบัญชี Apple Developer
COPYRIGHT = "2026 SIAM DIVE CENTER COMPANY LIMITED"


def age_rating() -> dict:
    """อ่านผ่าน relationship ของ appInfo — `GET ageRatingDeclarations/{id}` ตรง ๆ ไม่มีใน API"""
    return api("GET", f"appInfos/{_ascl.info_id()}/ageRatingDeclaration")["data"]


def age_rating_id() -> str:
    return age_rating()["id"]


def free_price_point() -> str | None:
    """price point ราคา 0 ของ territory ฐาน — id เป็น token ที่ Apple ออกให้ ต่างกันรายแอป"""
    r = api("GET", f"apps/{APP_ID}/appPricePoints?filter[territory]={BASE_TERRITORY}&limit=200")
    for d in r.get("data", []):
        if float(d["attributes"].get("customerPrice", "1") or 1) == 0.0:
            return d["id"]
    return None


def api_v2(method: str, path: str, body=None):
    """appAvailabilities อยู่บน /v2 — helper ใน asc-listing.py ตรึงไว้ที่ /v1"""
    import urllib.error
    import urllib.request
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        "https://api.appstoreconnect.apple.com/v2/" + path, data=data, method=method,
        headers={"Authorization": f"Bearer {_ascl.TOK}", "Content-Type": "application/json"})
    try:
        raw = urllib.request.urlopen(req).read()
        return json.loads(raw) if raw else {"ok": True}
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()
        try:
            errs = json.loads(body_txt).get("errors", [])
            detail = " | ".join(f"{x.get('title')}: {x.get('detail')}" for x in errs)
        except Exception:
            detail = body_txt[:300]
        return {"ERR": e.code, "detail": detail}


def set_availability() -> None:
    """วางขายทุกประเทศ + เปิดรับประเทศใหม่อัตโนมัติ (แอปฟรี ไม่มีเหตุต้องกันประเทศไหน)"""
    if "ERR" not in api_v2("GET", f"appAvailabilities/{APP_ID}"):
        print("ประเทศที่วางขาย: ✅ มีอยู่แล้ว ไม่แตะซ้ำ")
        return
    terrs = [d["id"] for d in api("GET", "territories?limit=200").get("data", [])]
    if not terrs:
        print("ประเทศที่วางขาย: ❌ ดึงรายชื่อ territory ไม่ได้")
        return
    r = api_v2("POST", "appAvailabilities", {
        "data": {"type": "appAvailabilities",
                 "attributes": {"availableInNewTerritories": True},
                 "relationships": {
                     "app": {"data": {"type": "apps", "id": APP_ID}},
                     "territoryAvailabilities": {
                         "data": [{"type": "territoryAvailabilities", "id": f"${{t{t}}}"} for t in terrs]}}},
        "included": [{"type": "territoryAvailabilities", "id": f"${{t{t}}}",
                      "attributes": {"available": True},
                      "relationships": {"territory": {"data": {"type": "territories", "id": t}}}}
                     for t in terrs]})
    print(f"ประเทศที่วางขาย ({len(terrs)} ประเทศ):", "❌ " + r["detail"] if "ERR" in r else "✅")


def show() -> None:
    ar = age_rating()["attributes"]
    answered = [k for k, v in ar.items() if v is not None and k not in ("ageRatingOverride", "ageRatingOverrideV2", "koreaAgeRatingOverride")]
    print(f"Age Rating: {'✅ ตอบแล้ว ' + str(len(answered)) + ' ช่อง' if answered else '❌ ยังไม่ตอบเลยสักช่อง'}")
    if answered:
        on = {k: ar[k] for k in answered if ar[k] not in ("NONE", False)}
        print("   ช่องที่ไม่ใช่ค่าปลอดภัย:", json.dumps(on, ensure_ascii=False) if on else "— ไม่มี (NONE/False ทั้งหมด)")

    info = api("GET", f"appInfos/{_ascl.info_id()}")["data"]["attributes"]
    print("   เรตที่ Apple คำนวณให้:", info.get("appStoreAgeRating") or "❌ ยังไม่ออก (= ยังตอบไม่ครบ)")

    sched = api("GET", f"appPriceSchedules/{APP_ID}?include=manualPrices&limit[manualPrices]=5")
    inc = sched.get("included", []) if "ERR" not in sched else []
    print(f"ราคา: {'✅ ตั้งแล้ว ' + str(len(inc)) + ' รายการ' if inc else '❌ ยังไม่ได้ตั้งราคา (ยื่นไม่ได้)'}")

    # 🔴 limit สูงสุดของ territoryAvailabilities คือ 50 — ใส่ 200 แล้ว API ตอบ error
    #    ถ้าเหมาว่า error = "ยังไม่ได้ตั้ง" จะได้ผลลบปลอม (เจอมาแล้ว 22 ส.ค. ตอนตั้งสำเร็จแต่จอบอกว่ายังไม่ตั้ง)
    #    → นับจาก meta.paging.total ไม่ใช่นับ included · error อื่นให้พิมพ์ออกมาตรง ๆ
    av = api_v2("GET", f"appAvailabilities/{APP_ID}?include=territoryAvailabilities&limit[territoryAvailabilities]=50")
    if av.get("ERR") == 404:
        print("ประเทศที่วางขาย: ❌ ยังไม่ได้ตั้ง")
    elif "ERR" in av:
        print("ประเทศที่วางขาย: ⚠️ อ่านไม่ได้ —", av["detail"][:120])
    else:
        total = av["data"]["relationships"]["territoryAvailabilities"]["meta"]["paging"]["total"]
        print(f"ประเทศที่วางขาย: ✅ {total} ประเทศ · รับประเทศใหม่อัตโนมัติ =",
              av["data"]["attributes"].get("availableInNewTerritories"))

    app = api("GET", f"apps/{APP_ID}")["data"]["attributes"]
    print("Content Rights:", app.get("contentRightsDeclaration") or "❌ ยังไม่ตอบ")

    v = api("GET", f"appStoreVersions/{_ascl.version_id()}")["data"]["attributes"]
    print("Copyright:", v.get("copyright") or "❌ ยังไม่กรอก (ASC บล็อกการยื่น)")


def apply() -> None:
    vid = _ascl.version_id()
    r = api("PATCH", f"appStoreVersions/{vid}",
            {"data": {"type": "appStoreVersions", "id": vid, "attributes": {"copyright": COPYRIGHT}}})
    print("Copyright:", "❌ " + r["detail"] if "ERR" in r else "✅ " + COPYRIGHT)

    arid = age_rating_id()
    r = api("PATCH", f"ageRatingDeclarations/{arid}",
            {"data": {"type": "ageRatingDeclarations", "id": arid, "attributes": AGE_RATING}})
    print("Age Rating:", "❌ " + r["detail"] if "ERR" in r else "✅")

    app_r = api("PATCH", f"apps/{APP_ID}",
                {"data": {"type": "apps", "id": APP_ID, "attributes": {"contentRightsDeclaration": CONTENT_RIGHTS}}})
    print("Content Rights:", "❌ " + app_r["detail"] if "ERR" in app_r else "✅ " + CONTENT_RIGHTS)

    # ราคา: แอปฟรี = ตาราง 1 แถวชี้ price point ราคา 0 · ต้องส่งเป็น included (Apple ไม่รับ id ลอย ๆ)
    if api("GET", f"appPriceSchedules/{APP_ID}?include=manualPrices&limit[manualPrices]=1").get("included"):
        print("ราคา: ✅ มีอยู่แล้ว ไม่แตะซ้ำ")
        set_availability()
        return
    pp = free_price_point()
    if not pp:
        print("ราคา: ❌ หา price point ราคา 0 ไม่เจอ")
        set_availability()
        return
    body = {"data": {"type": "appPriceSchedules",
                     "relationships": {
                         "app": {"data": {"type": "apps", "id": APP_ID}},
                         "baseTerritory": {"data": {"type": "territories", "id": BASE_TERRITORY}},
                         "manualPrices": {"data": [{"type": "appPrices", "id": "${free}"}]}}},
            "included": [{"type": "appPrices", "id": "${free}", "attributes": {"startDate": None},
                          "relationships": {"appPricePoint": {"data": {"type": "appPricePoints", "id": pp}}}}]}
    r = api("POST", "appPriceSchedules", body)
    print("ราคา (ฟรี):", "❌ " + r["detail"] if "ERR" in r else "✅")
    set_availability()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "show"
    if cmd == "apply":
        apply()
        print("\n── อ่านกลับมายืนยัน ──")
        show()
    else:
        show()
