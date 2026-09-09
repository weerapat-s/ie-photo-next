"use client";
// app/(member)/profile/page.tsx — แก้ไขข้อมูลส่วนตัว + รูปโปรไฟล์ + การแจ้งเตือน
import { Suspense, useState } from "react";
import MemberQrCard from "@/components/member-qr-card";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { compressImageToDataUrl } from "@/lib/image";
import { useAuth } from "@/lib/firebase/auth-context";
import { useSettings } from "@/lib/settings-context";
import NotificationToggle from "@/components/notification-toggle";
import { ROLE_LABEL } from "@/lib/roles";
import { useDevMode } from "@/lib/hooks";
import { DEV_BADGE } from "@/lib/dev-mode";
import DevGear from "@/components/dev-gear";
import {
  PageHeader,
  Card,
  Button,
  Field,
  inputClass,
  Alert,
  Spinner,
  Row,
  useToast,
} from "@/components/ui";

export default function ProfilePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ProfileInner />
    </Suspense>
  );
}

function ProfileInner() {
  const { user, profile, role, signOut } = useAuth();
  const { settings } = useSettings();
  const router = useRouter();
  const params = useSearchParams();
  const firstLogin = params.get("first_login") === "1";
  const { show, node: toastNode } = useToast();

  // เก็บเฉพาะช่องที่ผู้ใช้แก้ — ช่องที่ยังไม่แตะอ่านจาก profile สด ๆ
  // (ไม่ต้อง sync ด้วย effect ซึ่งทำให้ค่าที่กำลังพิมพ์โดนเขียนทับตอน snapshot มา)
  const [edits, setEdits] = useState<{
    firstName?: string;
    lastName?: string;
    nickname?: string;
    phone?: string;
    skills?: string;
  }>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const firstName = edits.firstName ?? profile?.firstName ?? "";
  const lastName = edits.lastName ?? profile?.lastName ?? "";
  const nickname = edits.nickname ?? profile?.nickname ?? "";
  const phone = edits.phone ?? profile?.phone ?? "";
  const skills = edits.skills ?? (profile?.skills ?? []).join(", ");
  const preview = localPreview ?? profile?.profileImageUrl ?? null;

  const setFirstName = (v: string) => setEdits((e) => ({ ...e, firstName: v }));
  const setLastName = (v: string) => setEdits((e) => ({ ...e, lastName: v }));
  const setNickname = (v: string) => setEdits((p) => ({ ...p, nickname: v }));
  const setSkills = (v: string) => setEdits((p) => ({ ...p, skills: v }));
  const setPhone = (v: string) => setEdits((e) => ({ ...e, phone: v }));

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setImageFile(f);
      setLocalPreview(URL.createObjectURL(f));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setErr("");
    if (!firstName.trim()) return setErr("กรุณากรอกชื่อจริง");
    // ชื่อเล่นบังคับเหมือนตอนสมัคร — ระบบใช้เรียกกันในตารางงานและปฏิทิน
    if (!nickname.trim()) return setErr("กรุณากรอกชื่อเล่น");
    setSaving(true);
    try {
      let imageUrl = profile?.profileImageUrl ?? null;
      if (imageFile) {
        // ย่อ+บีบอัดเป็น data URL เล็ก ๆ เก็บใน Firestore — อัปทันที ไม่ต้องใช้ Storage
        imageUrl = await compressImageToDataUrl(imageFile);
      }
      await updateDoc(doc(db, "users", user.uid), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim(),
        phone: phone.trim(),
        skills: skills
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 12),
        profileImageUrl: imageUrl,
        profileCompleted: true,
      });
      setEdits({});
      show("บันทึกข้อมูลเรียบร้อย");
      if (firstLogin) router.push("/feed");
    } catch {
      setErr(describeWriteError(e, "บันทึกข้อมูล"));
    } finally {
      setSaving(false);
    }
  }

  const devOn = useDevMode();
  // เปิดโหมด dev แล้วยศตัวเองแสดงเป็น </> — คนอื่นที่เห็นจอเราจะเดาไม่ออกว่าเป็นยศอะไร
  const roleLabel = devOn ? DEV_BADGE : role ? ROLE_LABEL[role] : "สมาชิก";

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader eyebrow="บัญชี" title="ข้อมูลส่วนตัว" subtitle="จัดการข้อมูลและรูปโปรไฟล์ของคุณ" />

      {firstLogin && (
        <Alert tone="info">ยินดีต้อนรับ! กรุณาตั้งค่าโปรไฟล์ก่อนเริ่มใช้งาน</Alert>
      )}
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

      <form onSubmit={handleSave}>
        <Card className="mb-4">
          <div className="mb-5 flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                preview ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.email || "U")}&background=EF3961&color=fff&size=160`
              }
              alt="รูปโปรไฟล์"
              className="h-24 w-24 rounded-3xl border-2 border-white object-cover shadow-[0_10px_30px_rgba(0,0,0,.14)]"
            />
            <label className="press mt-3 cursor-pointer rounded-full bg-black/5 px-4 py-2 text-sm font-semibold text-[var(--ink)]">
              เปลี่ยนรูป
              <input type="file" accept="image/*" onChange={onPickImage} className="hidden" />
            </label>
          </div>

          <div className="mb-4 rounded-2xl bg-black/[0.03] px-4 py-1">
            <Row label="อีเมล">{user?.email}</Row>
            <Row label="สิทธิ์">{roleLabel}</Row>
          </div>

          <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
            <Field label="ชื่อจริง" required>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="สมชาย" className={inputClass} maxLength={60} />
            </Field>
            <Field label="นามสกุล">
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="ใจดี" className={inputClass} maxLength={60} />
            </Field>
          </div>

          <Field label="ชื่อเล่น" required help="ชื่อที่เพื่อนในชุมนุมเรียก — แสดงในตารางงานและปฏิทิน">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="เช่น ต้น"
              className={inputClass}
              maxLength={30}
            />
          </Field>

          <Field label="เบอร์โทรศัพท์" help="ใช้ติดต่อเวลาอนุมัติ/ส่งงาน">
            <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0XXXXXXXXX" className={inputClass} maxLength={20} />
          </Field>

          <Field label="ความถนัด" help="คั่นด้วยจุลภาค — กรรมการใช้จับคู่คนกับงานที่ถนัด">
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="Portrait, Event, ตัดต่อวิดีโอ"
              className={inputClass}
              maxLength={200}
            />
          </Field>

          <Button type="submit" loading={saving} fullWidth size="lg" className="mt-2">
            บันทึกข้อมูล
          </Button>
        </Card>
      </form>

      <NotificationToggle />

      <Card className="mt-4">
        <p className="mb-3 text-sm font-bold text-[var(--ink)]">ติดต่อชุมนุม</p>
        <Row label="โทร">
          <a href={`tel:${settings.contactPhone.replace(/-/g, "")}`} className="text-[var(--faculty)]">
            {settings.contactPhone}
          </a>
        </Row>
        <Row label="อีเมล">
          <a href={`mailto:${settings.contactEmail}`} className="text-[var(--faculty)]">
            {settings.contactEmail}
          </a>
        </Row>
      </Card>

      <Button
        variant="outline"
        fullWidth
        size="lg"
        className="mt-4"
        onClick={async () => {
          await signOut();
          router.push("/login");
        }}
      >
        ออกจากระบบ
      </Button>

      <div className="mt-4">
        <MemberQrCard />
      </div>

      {/* ปุ่มลับ — มุมล่างขวา ดูเหมือนของประดับ กดรัว 6 ทีเพื่อสลับโหมด */}
      <div className="mt-8 flex justify-end pr-1">
        <DevGear />
      </div>

      {toastNode}
    </div>
  );
}
