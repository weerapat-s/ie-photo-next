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

echo "=== ส่ง migrations + hooks + Dockerfile + ตัวส่ง push ==="
tar -C "$HERE" -czf - Dockerfile pb_migrations pb_hooks push \
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

# ค่าที่ hook ต้องใช้ — เก็บเป็นไฟล์บน NAS (อ่านได้แค่ root) ไม่ใส่ในคำสั่ง docker run
# FIREBASE_WEB_API_KEY: คีย์สาธารณะของเว็บเดิม ใช้ตรวจรหัสผ่านเดิมตอนล็อกอินครั้งแรก (pb_hooks/ie_auth.js)
FB_KEY="$(grep -E '^NEXT_PUBLIC_FIREBASE_API_KEY=' "$ROOT/.env.local" | head -1 | cut -d= -f2- | tr -d '"\r')"
[[ -n "$FB_KEY" ]] || { echo "ไม่พบ NEXT_PUBLIC_FIREBASE_API_KEY ใน .env.local"; exit 1; }
printf 'FIREBASE_WEB_API_KEY=%s\n' "$FB_KEY" \
  | ssh "$NAS" "sudo -n install -m 600 /dev/stdin $REMOTE/pb.env"

# คีย์ VAPID ของ Web Push (ชุดเดิมจาก .env.local — เครื่องที่เคยกดรับแจ้งเตือนไว้ยังใช้ได้ต่อ)
# ให้เฉพาะ container iephoto-push ซึ่งไม่เปิดพอร์ตออกนอกเครื่อง
env_of() { grep -E "^$1=" "$ROOT/.env.local" | head -1 | cut -d= -f2- | tr -d '"\r'; }
VAPID_PUB="$(env_of NEXT_PUBLIC_VAPID_PUBLIC_KEY)"
VAPID_PRIV="$(env_of VAPID_PRIVATE_KEY)"
if [[ -n "$VAPID_PUB" && -n "$VAPID_PRIV" ]]; then
  printf 'VAPID_PUBLIC_KEY=%s\nVAPID_PRIVATE_KEY=%s\n' "$VAPID_PUB" "$VAPID_PRIV" \
    | ssh "$NAS" "sudo -n install -m 600 /dev/stdin $REMOTE/push.env"
else
  echo "(ไม่มีคีย์ VAPID ใน .env.local — ข้ามตัวส่ง push)"
fi

ssh "$NAS" "set -e
  cd $REMOTE
  sudo -n mkdir -p pb_data pb_public
  # migrations/hooks ต้องเป็นชุดเดียวกับใน repo เป๊ะ — ลบของเก่าที่ไม่มีแล้วด้วย
  sudo -n rm -rf pb_migrations pb_hooks
  sudo -n cp -r build/pb_migrations build/pb_hooks .
  sudo -n docker build -q -t $IMAGE build >/dev/null
  # เครือข่ายภายในให้ PocketBase คุยกับตัวส่ง push (ไม่มีพอร์ตไหนเปิดออกเครื่อง)
  sudo -n docker network inspect iephoto >/dev/null 2>&1 || sudo -n docker network create iephoto >/dev/null
  if [ -f $REMOTE/push.env ]; then
    sudo -n docker build -q -t iephoto-push build/push >/dev/null
    sudo -n docker rm -f iephoto-push >/dev/null 2>&1 || true
    sudo -n docker run -d --name iephoto-push --restart unless-stopped --network iephoto \
      --env-file $REMOTE/push.env iephoto-push >/dev/null
  fi
  sudo -n docker rm -f iephoto-pb >/dev/null 2>&1 || true
  # 127.0.0.1 = ให้ cloudflared บนเครื่องเข้า · IP Tailscale = ให้ทีมเข้าหน้าแอดมินได้โดยไม่เปิดสู่เน็ตสาธารณะ
  # ห้าม bind 0.0.0.0 — NAS มี IP สาธารณะของมหาลัย
  sudo -n docker run -d --name iephoto-pb --restart unless-stopped \
    -p 127.0.0.1:8096:8090 -p 100.116.118.109:8096:8090 \
    --env-file $REMOTE/pb.env --network iephoto \
    -v $REMOTE/pb_data:/pb/pb_data \
    -v $REMOTE/pb_migrations:/pb/pb_migrations:ro \
    -v $REMOTE/pb_hooks:/pb/pb_hooks:ro \
    -v $REMOTE/pb_public:/pb/pb_public:ro \
    $IMAGE >/dev/null
  sleep 3
  curl -sf http://127.0.0.1:8096/api/health >/dev/null && echo 'สุขภาพ: ปกติ' || { echo 'สุขภาพ: ไม่ตอบ'; sudo -n docker logs --tail 30 iephoto-pb; exit 1; }
"
echo "=== เสร็จ ==="
