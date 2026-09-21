#!/usr/bin/env bash
# nas/deploy.sh — ส่งไฟล์ตั้งค่า PocketBase ขึ้น NAS แล้วสร้าง container ใหม่
#
# รัน (Git Bash จากโฟลเดอร์โปรเจกต์):  bash nas/deploy.sh
#   --site   ส่งหน้าเว็บ (out/ จาก npm run build) ไปด้วย
#
# ต้องมี: SSH เข้า NAS ผ่าน Tailscale ได้ และ sudo ไม่ต้องใส่รหัส (ดู nas/README.md)
#
# ข้อมูลจริงอยู่ที่ /srv/iephoto-pb/pb_data บน NAS — สคริปต์นี้ไม่แตะโฟลเดอร์นั้นเลย
# สร้าง container ใหม่กี่รอบข้อมูลก็ไม่หาย
set -euo pipefail

NAS="nas@100.116.118.109"
REMOTE="/srv/iephoto-pb"
IMAGE="iephoto-pb:0.40.4"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

WITH_SITE=0
[[ "${1:-}" == "--site" ]] && WITH_SITE=1

echo "=== ส่ง migrations + hooks + Dockerfile ==="
tar -C "$HERE" -czf - Dockerfile pb_migrations pb_hooks \
  | ssh "$NAS" "sudo -n mkdir -p $REMOTE/build && sudo -n tar -C $REMOTE/build -xzf -"

if [[ $WITH_SITE == 1 ]]; then
  [[ -d "$ROOT/out" ]] || { echo "ไม่มี out/ — รัน npm run build ก่อน"; exit 1; }
  echo "=== ส่งหน้าเว็บ ($(du -sh "$ROOT/out" | cut -f1)) ==="
  tar -C "$ROOT/out" -czf - . \
    | ssh "$NAS" "sudo -n rm -rf $REMOTE/pb_public.new && sudo -n mkdir -p $REMOTE/pb_public.new \
      && sudo -n tar -C $REMOTE/pb_public.new -xzf - \
      && sudo -n rm -rf $REMOTE/pb_public.old \
      && { [ -d $REMOTE/pb_public ] && sudo -n mv $REMOTE/pb_public $REMOTE/pb_public.old || true; } \
      && sudo -n mv $REMOTE/pb_public.new $REMOTE/pb_public"
fi

ssh "$NAS" "set -e
  cd $REMOTE
  sudo -n mkdir -p pb_data pb_public
  # migrations/hooks ต้องเป็นชุดเดียวกับใน repo เป๊ะ — ลบของเก่าที่ไม่มีแล้วด้วย
  sudo -n rm -rf pb_migrations pb_hooks
  sudo -n cp -r build/pb_migrations build/pb_hooks .
  sudo -n docker build -q -t $IMAGE build >/dev/null
  sudo -n docker rm -f iephoto-pb >/dev/null 2>&1 || true
  # 127.0.0.1 = ให้ cloudflared บนเครื่องเข้า · IP Tailscale = ให้ทีมเข้าหน้าแอดมินได้โดยไม่เปิดสู่เน็ตสาธารณะ
  # ห้าม bind 0.0.0.0 — NAS มี IP สาธารณะของมหาลัย
  sudo -n docker run -d --name iephoto-pb --restart unless-stopped \
    -p 127.0.0.1:8096:8090 -p 100.116.118.109:8096:8090 \
    -v $REMOTE/pb_data:/pb/pb_data \
    -v $REMOTE/pb_migrations:/pb/pb_migrations:ro \
    -v $REMOTE/pb_hooks:/pb/pb_hooks:ro \
    -v $REMOTE/pb_public:/pb/pb_public:ro \
    $IMAGE >/dev/null
  sleep 3
  curl -sf http://127.0.0.1:8096/api/health >/dev/null && echo 'สุขภาพ: ปกติ' || { echo 'สุขภาพ: ไม่ตอบ'; sudo -n docker logs --tail 30 iephoto-pb; exit 1; }
"
echo "=== เสร็จ ==="
