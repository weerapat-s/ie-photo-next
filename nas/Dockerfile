# nas/Dockerfile — PocketBase สำหรับ IE-Photo (ฐานข้อมูล + ล็อกอิน + ไฟล์ + หน้าเว็บ ในตัวเดียว)
# build เองจาก binary ทางการของ PocketBase ไม่พึ่ง image ของบุคคลที่สาม
FROM alpine:3.20
ARG PB_VERSION=0.40.4
RUN apk add --no-cache ca-certificates unzip wget tzdata \
 && wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip -O /tmp/pb.zip \
 && unzip -q /tmp/pb.zip -d /pb && rm /tmp/pb.zip && chmod +x /pb/pocketbase
ENV TZ=Asia/Bangkok
EXPOSE 8090
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks", "--publicDir=/pb/pb_public"]
