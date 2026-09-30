#!/bin/bash
# ประกอบไฟล์ mockup: header + CSS ฐาน(จาก account-v2 ผ่าน design-kanban) + CSS ของ POS + body
set -e
cd "$(dirname "$0")"
b="$1"; t="$2"; out="${b%.body.html}.html"
{ printf '<!doctype html>\n<html lang="th"><head><meta charset="utf-8">\n<title>%s</title>\n' "$t"
  cat _base.part; cat _pos.part; cat "$b"; printf '\n</body></html>\n'; } > "$out"
echo "built $out"
