"use client";
// components/profile-gate.tsx — บังคับกรอกข้อมูลส่วนตัวให้ครบก่อนใช้ระบบ
//
// ทำไมต้องบังคับ: ระบบมอบหมายงานตัดสินใจจากชื่อเล่น เบอร์ติดต่อ และความถนัด
// ถ้าข้อมูลว่าง กรรมการจะเห็นแค่รหัสนักศึกษาแล้วจ่ายงานผิดคน
// จึงขึ้นหน้านี้ทับทุกอย่างจนกว่าจะกรอกครบ — ปิดไม่ได้ ข้ามไม่ได้
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { describeWriteError } from "@/lib/errors";
import { useAuth } from "@/lib/firebase/auth-context";
import { Button, Field, inputClass, Alert, ImagePicker } from "@/components/ui";
import { compressImageToDataUrl } from "@/lib/image";
import Icon from "@/components/icon";
import type { UserDoc, WithId } from "@/lib/types";

/** ช่องที่ต้องมีค่าถึงจะถือว่าโปรไฟล์ครบ */
export function missingFields(p: WithId<UserDoc> | null): string[] {
  if (!p) return [];
  const miss: string[] = [];
  if (!p.firstName?.trim()) miss.push("ชื่อจริง");
  if (!p.lastName?.trim()) miss.push("นามสกุล");
  if (!p.nickname?.trim()) miss.push("ชื่อเล่น");
  if (!p.phone?.trim()) miss.push("เบอร์โทร");
  return miss;
}

export default function ProfileGate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();

  // ยังไม่รู้ว่าใคร หรือยังโหลด doc ไม่เสร็จ — ปล่อยผ่านไปก่อน
  // (RequireAuth จัดการเรื่อง login อยู่แล้ว ไม่ต้องซ้อนหน้าโหลดอีกชั้น)
  if (loading || !user || !profile) return <>{children}</>;
  if (missingFields(profile).length === 0) return <>{children}</>;

  return <OnboardingForm profile={profile} />;
}

function OnboardingForm({ profile }: { profile: WithId<UserDoc> }) {
  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [skills, setSkills] = useState((profile.skills ?? []).join(", "));
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(profile.profileImageUrl);
  /** ขั้นตอน: 1 = ข้อมูลที่บังคับ · 2 = รูปโปรไฟล์ (ข้ามได้) */
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const ready =
    firstName.trim() !== "" && lastName.trim() !== "" && nickname.trim() !== "" && phone.trim().length >= 9;

  /** บันทึกข้อมูลบังคับแล้วไปขั้นรูป — ยังไม่ตั้ง profileCompleted จนกว่าจะจบขั้น 2 */
  async function saveBasics() {
    if (!ready || busy) return;
    setBusy(true);
    setErr("");
    try {
      await updateDoc(doc(db, "users", profile.id), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim(),
        phone: phone.trim(),
        skills: skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 12),
      });
      setStep(2);
    } catch (e) {
      setErr(describeWriteError(e, "บันทึกข้อมูล"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * จบขั้นตอน — รูปไม่บังคับ กด "ข้ามไปก่อน" ได้
   * พอ profileCompleted เป็น true และช่องบังคับครบ gate จะปล่อยผ่านเอง
   * (ไม่ต้อง redirect — auth-context ฟัง doc อยู่แล้ว)
   */
  async function finish(withPhoto: boolean) {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const patch: Record<string, unknown> = { profileCompleted: true };
      if (withPhoto && photo) patch.profileImageUrl = await compressImageToDataUrl(photo, 600, 0.8);
      await updateDoc(doc(db, "users", profile.id), patch);
    } catch (e) {
      setErr(
        e instanceof Error && e.message === "IMAGE_TOO_LARGE"
          ? "รูปใหญ่เกินไป เลือกรูปที่เล็กลง หรือกดข้ามไปก่อน"
          : "บันทึกไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองใหม่"
      );
      setBusy(false);
    }
  }

  const first = !profile.profileCompleted;

  if (step === 2) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-8">
        <div className="mb-5 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--faculty)] text-white">
            <Icon name="gallery" size={28} />
          </span>
          <h1 className="t-title text-[var(--ink)]">ใส่รูปโปรไฟล์</h1>
          <p className="t-caption mx-auto mt-1.5 max-w-sm">
            ช่วยให้เพื่อนในชุมนุมจำได้ตอนดูตารางงาน — ไม่ใส่ตอนนี้ก็ได้ ใส่ทีหลังที่หน้าโปรไฟล์
          </p>
        </div>

        <div className="surface-raised rounded-3xl p-5">
          {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
          <ImagePicker
            file={photo}
            preview={preview}
            onPick={(f) => {
              setPhoto(f);
              setPreview(f ? URL.createObjectURL(f) : null);
            }}
            hint="รูปหน้าตรงชัด ๆ พอ"
          />
          <Button
            onClick={() => void finish(true)}
            loading={busy}
            disabled={!photo}
            fullWidth
            size="lg"
            className="mt-4"
          >
            บันทึกรูปแล้วเริ่มใช้งาน
          </Button>
          <Button onClick={() => void finish(false)} variant="ghost" fullWidth className="mt-2">
            ข้ามไปก่อน
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-8">
      <div className="mb-5 text-center">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--faculty)] text-white">
          <Icon name="user" size={28} />
        </span>
        <h1 className="t-title text-[var(--ink)]">{first ? "ตั้งค่าข้อมูลส่วนตัว" : "ข้อมูลยังไม่ครบ"}</h1>
        <p className="t-caption mx-auto mt-1.5 max-w-sm">
          {first
            ? "กรอกครั้งเดียว ใช้ตลอด — ทีมงานใช้ข้อมูลนี้ติดต่อและจัดคนเข้างาน"
            : `ยังขาด: ${missingFields(profile).join(" · ")}`}
        </p>
      </div>

      <div className="surface-raised rounded-3xl p-5">
        {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

        <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
          <Field label="ชื่อจริง" required>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} maxLength={60} />
          </Field>
          <Field label="นามสกุล" required>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} maxLength={60} />
          </Field>
        </div>

        <Field label="ชื่อเล่น" required help="ชื่อที่เพื่อนในชุมนุมเรียก — ใช้แสดงในตารางงานและปฏิทิน">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className={inputClass}
            maxLength={30}
            placeholder="เช่น ต้น"
          />
        </Field>

        <Field label="เบอร์โทรศัพท์" required help="ใช้ติดต่อตอนมีงานด่วน">
          <input
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            maxLength={20}
            placeholder="0XXXXXXXXX"
          />
        </Field>

        <Field label="ความถนัด" help="คั่นด้วยจุลภาค — ไม่บังคับ แต่ช่วยให้ได้งานที่ถนัด">
          <input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            className={inputClass}
            maxLength={200}
            placeholder="Portrait, Event, ตัดต่อวิดีโอ"
          />
        </Field>

        <Button onClick={saveBasics} loading={busy} disabled={!ready} fullWidth size="lg" className="mt-2">
          ถัดไป · ใส่รูปโปรไฟล์
        </Button>
        {!ready && <p className="t-caption mt-2 text-center">กรอกช่องที่มีดอกจันให้ครบก่อน</p>}
      </div>
    </div>
  );
}
