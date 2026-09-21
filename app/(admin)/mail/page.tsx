"use client";
// app/(admin)/mail/page.tsx — เขียนข้อความส่งเข้าอีเมลสมาชิก
//
// ต่างจากอีเมลอัตโนมัติ (เตือนของใกล้ครบกำหนด ฯลฯ) ตรงที่อันนี้กรรมการพิมพ์เอง
// ใช้ท่อเดิมทั้งหมด: mailQueue เก็บประวัติ แล้ว Worker /send เป็นคนยิงออกจริง
//
// ข้อควรระวังที่สะท้อนอยู่ใน UI:
//   • ส่งแล้วเรียกคืนไม่ได้ จึงต้องกดยืนยันอีกชั้นพร้อมเห็นจำนวนผู้รับ
//   • ส่งทีละฉบับแบบเรียงคิว ไม่ยิงพร้อมกัน — ผู้ให้บริการจำกัดอัตราการส่ง
//     และถ้าล้มกลางทางจะได้รู้ว่าใครได้แล้วใครยังไม่ได้
import { useMemo, useState } from "react";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection } from "@/lib/hooks";
import { useSettings } from "@/lib/settings-context";
import { resolveMailSender } from "@/lib/mail-sender";
import { sendMail } from "@/lib/mail";
import { displayName, isAdminRole } from "@/lib/roles";
import { fmtDateTime } from "@/lib/format";
import {
  PageHeader, Card, Badge, Spinner, Button, Field, inputClass,
  Alert, EmptyState, ChipBar, Modal,
} from "@/components/ui";
import type { MailDoc, UserDoc } from "@/lib/types";
import { allUsersQuery } from "@/lib/queries";

type Audience = "all" | "admins" | "members" | "pick";

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "ทุกคน",
  admins: "เฉพาะกรรมการ",
  members: "เฉพาะสมาชิก",
  pick: "เลือกเอง",
};

/** ผลการส่งรายคน — เก็บไว้โชว์หลังส่งเสร็จ ว่าใครไม่ถึงบ้าง */
interface Outcome {
  name: string;
  email: string;
  ok: boolean;
}

export default function MailPage() {
  const { settings } = useSettings();

  const { data: users, loading } = useCollection<UserDoc>(() => allUsersQuery(), []);
  const sender = useMemo(
    () => resolveMailSender(users, settings.mailSenderStudentId, settings.siteName, displayName),
    [users, settings.mailSenderStudentId, settings.siteName]
  );
  const { data: history } = useCollection<MailDoc>(
    () => query(collection(db, "mailQueue"), orderBy("createdAt", "desc"), limit(15)),
    []
  );

  const [audience, setAudience] = useState<Audience>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Outcome[] | null>(null);
  const [err, setErr] = useState("");

  /** คนที่มีอีเมลใช้ได้จริงเท่านั้น — บัญชีที่ถูกระงับไม่ต้องได้รับ */
  const reachable = useMemo(
    () => users.filter((u) => !u.disabled && (u.email || "").includes("@")),
    [users]
  );

  const recipients = useMemo(() => {
    if (audience === "pick") return reachable.filter((u) => picked.has(u.id));
    if (audience === "admins") return reachable.filter((u) => isAdminRole(u.role));
    if (audience === "members") return reachable.filter((u) => !isAdminRole(u.role));
    return reachable;
  }, [audience, picked, reachable]);

  const noEmailCount = users.filter((u) => !u.disabled && !(u.email || "").includes("@")).length;

  const canSend =
    !sending && subject.trim().length > 0 && body.trim().length > 0 && recipients.length > 0;

  function toggle(id: string) {
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function doSend() {
    setConfirming(false);
    setSending(true);
    setErr("");
    setResults(null);
    setProgress(0);

    const outcomes: Outcome[] = [];
    try {
      for (const u of recipients) {
        // เรียงคิวทีละฉบับ ไม่ใช่ Promise.all — ผู้ให้บริการจำกัดอัตราการส่ง
        // และถ้าล้มกลางทาง จะได้รู้ชัดว่าหยุดตรงไหน
        const ok = await sendMail({
          to: u.email,
          subject: subject.trim(),
          body: body.trim(),
          kind: "broadcast",
          replyTo: sender.replyTo,
          fromName: sender.fromName,
        });
        outcomes.push({ name: displayName(u), email: u.email, ok });
        setProgress(outcomes.length);
      }
      setResults(outcomes);
      if (outcomes.every((o) => o.ok)) {
        setSubject("");
        setBody("");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ส่งไม่สำเร็จ");
      setResults(outcomes);
    } finally {
      setSending(false);
    }
  }

  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="กรรมการ"
        title="ส่งข้อความเข้าอีเมล"
        subtitle="เขียนครั้งเดียว ส่งถึงสมาชิกที่เลือก"
      />

      {/* ตัวตนผู้ส่ง — ต้องบอกให้ชัดว่าอะไรเปลี่ยนได้ อะไรเปลี่ยนไม่ได้ */}
      <Card className="mb-4">
        <p className="text-sm font-semibold text-foreground">ผู้รับจะเห็นว่าใครส่ง</p>
        {sender.resolved ? (
          <>
            <p className="mt-1 text-sm text-foreground">{sender.fromName}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              กดตอบกลับแล้วเข้ากล่องของ {sender.replyTo}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-amber-700">
            หาบัญชีรหัส {sender.studentId || "(ยังไม่ได้ตั้ง)"} ไม่เจอ — จะส่งในนาม{" "}
            {settings.siteName} แทน ตั้งรหัสผู้ส่งได้ที่หน้าตั้งค่า
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          ที่อยู่ผู้ส่งเปลี่ยนไม่ได้ ต้องเป็นโดเมนที่ยืนยันกับผู้ให้บริการแล้ว ไม่งั้นใครก็ปลอมเป็นใครก็ได้
          — เปลี่ยนได้แค่ชื่อที่แสดงกับปลายทางของการกดตอบกลับ
        </p>
      </Card>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Card className="mb-4">
            <Field label="ส่งถึงใคร" required>
              <ChipBar
                value={audience}
                onChange={(v) => setAudience(v)}
                options={[
                  { key: "all", label: AUDIENCE_LABEL.all, count: reachable.length },
                  { key: "admins", label: AUDIENCE_LABEL.admins, count: reachable.filter((u) => isAdminRole(u.role)).length },
                  { key: "members", label: AUDIENCE_LABEL.members, count: reachable.filter((u) => !isAdminRole(u.role)).length },
                  { key: "pick", label: AUDIENCE_LABEL.pick, count: picked.size },
                ]}
              />
            </Field>

            {audience === "pick" && (
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-2xl border border-border p-2">
                {reachable.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(u.id)}
                      onChange={() => toggle(u.id)}
                      className="h-4 w-4 flex-shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {displayName(u)}
                      <span className="text-muted-foreground"> · {u.email}</span>
                    </span>
                    {isAdminRole(u.role) && (
                      <Badge className="bg-blue-100 text-blue-700">กรรมการ</Badge>
                    )}
                  </label>
                ))}
              </div>
            )}

            {noEmailCount > 0 && (
              <p className="mt-2 text-sm text-amber-700">
                อีก {noEmailCount} คนไม่มีอีเมลในระบบ จะไม่ได้รับ
              </p>
            )}
          </Card>

          <Card className="mb-4">
            <Field label="หัวข้อ" required>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={inputClass}
                maxLength={200}
                placeholder="เช่น ประชุมชุมนุม ศุกร์นี้ 17:00"
              />
            </Field>
            <Field
              label="ข้อความ"
              required
              help="ข้อความล้วน ไม่รองรับ HTML — กันการฝังลิงก์หลอกในนามชุมนุม"
            >
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className={inputClass}
                maxLength={4000}
                placeholder="พิมพ์ข้อความที่จะส่ง"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {body.length}/4000
              </p>
            </Field>
          </Card>

          {err && <Alert onClose={() => setErr("")}>{err}</Alert>}

          {sending && (
            <Card className="mb-4">
              <p className="text-sm font-medium text-foreground">
                กำลังส่ง {progress}/{recipients.length}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">อย่าปิดหน้านี้จนกว่าจะเสร็จ</p>
            </Card>
          )}

          {results && (
            <Card className={`mb-4 ${failed.length ? "border-red-300" : ""}`}>
              <p className="text-sm font-semibold text-foreground">
                ส่งสำเร็จ {results.length - failed.length}/{results.length} ฉบับ
              </p>
              {failed.length > 0 && (
                <>
                  <p className="mt-1 text-sm text-red-700">ไม่ถึงปลายทาง {failed.length} คน:</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                    {failed.map((f) => (
                      <li key={f.email}>
                        {f.name} · {f.email}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-muted-foreground">
                    ดูสาเหตุรายฉบับได้ในประวัติด้านล่าง
                  </p>
                </>
              )}
            </Card>
          )}

          <Button
            onClick={() => setConfirming(true)}
            disabled={!canSend}
            loading={sending}
            fullWidth
            size="lg"
          >
            ส่งถึง {recipients.length} คน
          </Button>

          {/* ประวัติ — ให้เห็นว่ามีอะไรค้างหรือล้มบ้าง แทนที่จะเงียบหาย */}
          <section className="mt-6">
            <h2 className="mb-2 text-base font-semibold text-foreground">ส่งไปล่าสุด</h2>
            {history.length === 0 ? (
              <EmptyState text="ยังไม่เคยส่งอีเมล" />
            ) : (
              <div className="space-y-2">
                {history.map((m) => (
                  <Card key={m.id} className={m.status === "failed" ? "border-red-300" : ""}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {m.subject}
                      </span>
                      {/* "ถึงผู้รับแล้ว" เฉพาะเมื่อ Worker ยืนยันว่าไม่ได้ส่งต่อ (forwarded === false)
                          Worker รุ่นเก่าไม่รายงานเลย (null) — ห้ามเดาว่าถึง เพราะตอนโดเมน
                          ยังไม่ยืนยัน เมลทุกฉบับถูกส่งต่อเข้ากล่องกลางจริง ๆ */}
                      <Badge
                        className={
                          m.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : m.forwarded === true
                              ? "bg-amber-100 text-amber-700"
                              : m.status === "sent" && m.forwarded === false
                                ? "bg-green-100 text-green-700"
                                : m.status === "sent"
                                  ? "bg-gray-100 text-gray-700"
                                  : "bg-amber-100 text-amber-700"
                        }
                      >
                        {m.status === "failed"
                          ? "ล้มเหลว"
                          : m.forwarded === true
                            ? "เข้ากล่องกลาง"
                            : m.status === "sent" && m.forwarded === false
                              ? "ถึงผู้รับแล้ว"
                              : m.status === "sent"
                                ? "ส่งออกแล้ว"
                                : "รอส่ง"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      ถึง {m.to}
                      {m.createdAt ? ` · ${fmtDateTime(m.createdAt)}` : ""}
                    </p>
                    {m.forwarded && (
                      <p className="mt-1 text-sm text-amber-700">
                        ส่งตรงถึงเจ้าตัวไม่ได้ ไปโผล่กล่องกลางของชุมนุมแทน — ต้องยืนยันโดเมนกับผู้ให้บริการอีเมลก่อน
                      </p>
                    )}
                    {m.error && <p className="mt-1 text-sm text-red-700">{m.error}</p>}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* ส่งแล้วเรียกคืนไม่ได้ — ต้องเห็นจำนวนผู้รับกับหัวข้อก่อนกดจริง */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="ยืนยันการส่ง"
        maxWidth="max-w-md"
      >
        <p className="text-sm text-foreground">
          กำลังจะส่งถึง <strong>{recipients.length} คน</strong> ({AUDIENCE_LABEL[audience]})
        </p>
        <p className="mt-2 text-sm text-muted-foreground">หัวข้อ: {subject}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          ในนาม {sender.fromName}
          {sender.replyTo ? ` · ตอบกลับไปที่ ${sender.replyTo}` : ""}
        </p>
        <p className="mt-3 text-sm text-red-700">ส่งออกไปแล้วเรียกคืนไม่ได้</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={() => setConfirming(false)} fullWidth>
            ยกเลิก
          </Button>
          <Button onClick={doSend} fullWidth>
            ส่งเลย
          </Button>
        </div>
      </Modal>
    </div>
  );
}
