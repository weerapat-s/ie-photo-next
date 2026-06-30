"use client";
// app/(member)/profile/page.tsx — แก้ไขข้อมูลส่วนตัว + รูปโปรไฟล์
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { compressImageToDataUrl } from "@/lib/image";
import { useAuth } from "@/lib/firebase/auth-context";

export default function ProfilePage() {
  const { user, profile, refresh } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const firstLogin = params.get("first_login") === "1";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || "");
      setLastName(profile.lastName || "");
      setPhone(profile.phone || "");
      setPreview(profile.profileImageUrl || null);
    }
  }, [profile]);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setImageFile(f);
      setPreview(URL.createObjectURL(f));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setErr("");
    setMsg("");
    if (!firstName.trim()) return setErr("กรุณากรอกชื่อจริง");
    setSaving(true);
    try {
      let imageUrl = profile?.profileImageUrl ?? null;
      if (imageFile) {
        // ย่อ+บีบอัดเป็น data URL เล็กๆ เก็บใน Firestore — อัปทันที ไม่ต้องใช้ Storage
        imageUrl = await compressImageToDataUrl(imageFile);
      }
      await updateDoc(doc(db, "users", user.uid), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        profileImageUrl: imageUrl,
        profileCompleted: true,
      });
      await refresh();
      setMsg("บันทึกข้อมูลเรียบร้อย");
      if (firstLogin) router.push("/feed");
    } catch {
      setErr("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-semibold">ข้อมูลส่วนตัว</h1>
      <p className="mb-6 text-sm text-neutral-500">จัดการข้อมูลและรูปโปรไฟล์ของคุณ</p>

      {firstLogin && (
        <div className="mb-4 rounded-lg bg-orange-50 px-4 py-3 text-sm text-orange-700">
          🎉 ยินดีต้อนรับ! กรุณาตั้งค่าโปรไฟล์ก่อนเริ่มใช้งาน
        </div>
      )}
      {msg && <div className="mb-4 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700">✅ {msg}</div>}
      {err && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">⚠️ {err}</div>}

      <form onSubmit={handleSave} className="glass-card rounded-3xl p-6">
        <div className="mb-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.email || "U")}&background=F2531C&color=fff&size=128`}
            alt="avatar"
            className="mx-auto h-24 w-24 rounded-2xl object-cover"
          />
          <label className="mt-2 inline-block cursor-pointer text-sm text-orange-600">
            เปลี่ยนรูป
            <input type="file" accept="image/*" onChange={onPickImage} className="hidden" />
          </label>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium">อีเมล</label>
          <div className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-500">{user?.email}</div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">ชื่อจริง *</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="สมชาย"
              className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">นามสกุล</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="ใจดี"
              className="glass-input w-full rounded-xl px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="mb-1 block text-sm font-medium">เบอร์โทรศัพท์</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0XXXXXXXXX"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-grad w-full rounded-full py-3 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
        </button>
      </form>
    </div>
  );
}
