#!/bin/bash
# ใช้: ./render_airy.sh <ชุด> [สูง]  เช่น a | d | e 1620 | dark-a  → shark-ai-team-airy-<ชุด>.png
set -e; cd /root/design/chat-glass
D=$(mktemp -d /tmp/chr-XXXX)
XDG_RUNTIME_DIR=/tmp chromium-browser --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --user-data-dir="$D" --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=5000 --window-size=2760,${2:-2920} --screenshot=/root/design/chat-glass/shark-ai-team-airy-$1.png "file:///root/design/chat-glass/ai-team-airy-$1.html" 2>&1 | grep -i "written" || echo "RENDER FAILED"
rm -rf "$D"
