#!/usr/bin/env python3
"""ดึงลายนิ้วมือ SHA-1 / SHA-256 ของคีย์ที่เซ็นไฟล์ APK

ทำไมต้องเขียนเอง: Google Sign-In บน Android ใช้ไม่ได้จนกว่าจะเอา SHA-1 ของคีย์ที่เซ็นแอป
ไปลงทะเบียนเป็น Android OAuth client · ปกติดูด้วย `keytool`/`apksigner` แต่เครื่องนี้ไม่มี JDK
และ APK ที่ EAS บิลด์ **เซ็นแบบ v2/v3 อย่างเดียว** (ไม่มี `META-INF/*.RSA` ให้ดึงด้วย openssl)
→ อ่านใบรับรองจาก APK Signing Block ตรง ๆ

ใช้: python3 scripts/android-sha1.py <ไฟล์.apk>
"""
import hashlib
import struct
import sys
from pathlib import Path

MAGIC = b"APK Sig Block 42"
SCHEME_V2 = 0x7109871A
SCHEME_V3 = 0xF05368C0


def find_signing_block(data: bytes) -> bytes:
    # หา End of Central Directory (ท้ายไฟล์) เพื่อรู้ตำแหน่ง central directory
    eocd = data.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise SystemExit("ไม่ใช่ไฟล์ zip/apk (ไม่เจอ EOCD)")
    cd_offset = struct.unpack_from("<I", data, eocd + 16)[0]
    if data[cd_offset - 16:cd_offset] != MAGIC:
        raise SystemExit("ไม่เจอ APK Signing Block (ไฟล์นี้อาจเซ็นแบบ v1 เท่านั้น)")
    size_end = struct.unpack_from("<Q", data, cd_offset - 24)[0]
    start = cd_offset - size_end - 8
    return data[start + 8:cd_offset - 24]  # เนื้อในบล็อก (ตัด size หัว/ท้าย + magic)


def pairs(block: bytes):
    off = 0
    while off + 12 <= len(block):
        length = struct.unpack_from("<Q", block, off)[0]
        pair_id = struct.unpack_from("<I", block, off + 8)[0]
        yield pair_id, block[off + 12:off + 8 + length]
        off += 8 + length


def lenprefixed(buf: bytes):
    """ลำดับของก้อนที่นำหน้าด้วยความยาว 4 ไบต์ (little-endian) — โครงสร้างมาตรฐานของสเปกนี้"""
    off = 0
    while off + 4 <= len(buf):
        n = struct.unpack_from("<I", buf, off)[0]
        yield buf[off + 4:off + 4 + n]
        off += 4 + n


def first(buf: bytes) -> bytes:
    """ก้อนแรกของลำดับ length-prefixed"""
    for chunk in lenprefixed(buf):
        return chunk
    raise SystemExit("ก้อนข้อมูลว่าง")


def first_certificate(value: bytes) -> bytes:
    """
    โครงสร้าง v2/v3 (แต่ละชั้นนำหน้าด้วยความยาว 4 ไบต์ — พลาดชั้นเดียวได้ไบต์มั่วที่ยัง hash ได้เฉย ๆ
    จึงต้องพิสูจน์ด้วย openssl ว่าที่ได้เป็นใบรับรองจริง ไม่ใช่เชื่อว่าไม่ error):
      value → ลำดับผู้เซ็น → signer → signed data → [0]=digests [1]=certificates → cert แรก
    """
    signers = first(value)                 # ทั้งลำดับผู้เซ็น
    signer = first(signers)                # ผู้เซ็นคนแรก
    signed_data = first(signer)            # ก้อนแรกของ signer = signed data
    sections = list(lenprefixed(signed_data))
    if len(sections) < 2:
        raise SystemExit("ไม่เจอส่วน certificates ใน signed data")
    return first(sections[1])


def assert_is_certificate(cert: bytes) -> None:
    """
    🔴 ด่านกันตอบผิดแบบเงียบ: ถ้าอ่านผิดชั้นไปหนึ่งชั้น จะได้ "ไบต์อะไรก็ได้" ซึ่ง hash ออกมาสวยงาม
    แต่ไม่ใช่ใบรับรอง — เคยเกิดจริงรอบแรก (ได้ SHA-1 ที่ถ้าเอาไปลงทะเบียนก็จะ login ไม่ติดโดยไม่รู้สาเหตุ)
    → ตรวจว่าเป็น DER SEQUENCE ที่ความยาวตรงกับก้อนจริง และถ้าเครื่องมี openssl ให้มันยืนยันอีกชั้น
    """
    if not cert or cert[0] != 0x30:
        raise SystemExit("ที่อ่านได้ไม่ใช่ DER SEQUENCE — โครงสร้างเพี้ยน")
    n = cert[1]
    header = 2 if n < 0x80 else 2 + (n & 0x7F)
    body = n if n < 0x80 else int.from_bytes(cert[2:header], "big")
    if header + body != len(cert):
        raise SystemExit("ความยาว DER ไม่ตรงกับก้อนที่อ่านได้ — โครงสร้างเพี้ยน")
    import shutil
    import subprocess
    if shutil.which("openssl"):
        r = subprocess.run(["openssl", "x509", "-inform", "DER", "-noout", "-subject"],
                           input=cert, capture_output=True)
        if r.returncode != 0:
            raise SystemExit("openssl อ่านเป็นใบรับรองไม่ได้ — อย่าเชื่อค่า hash นี้")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("ใช้: python3 scripts/android-sha1.py <ไฟล์.apk>")
    data = Path(sys.argv[1]).read_bytes()
    block = find_signing_block(data)
    found = {pid: val for pid, val in pairs(block) if pid in (SCHEME_V2, SCHEME_V3)}
    if not found:
        raise SystemExit("ไม่เจอลายเซ็น v2/v3 ในไฟล์นี้")
    cert = first_certificate(found.get(SCHEME_V2) or found[SCHEME_V3])
    assert_is_certificate(cert)
    for algo in ("sha1", "sha256"):
        digest = hashlib.new(algo, cert).hexdigest().upper()
        print(f"{algo.upper():7s} {':'.join(digest[i:i + 2] for i in range(0, len(digest), 2))}")
    print(f"\nสเปกที่เจอในไฟล์: {'v2 ' if SCHEME_V2 in found else ''}{'v3' if SCHEME_V3 in found else ''}")


if __name__ == "__main__":
    main()
