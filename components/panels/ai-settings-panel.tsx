"use client";
// components/panels/ai-settings-panel.tsx — ตั้งค่าผู้ช่วย AI
//
// คีย์เก็บที่ secrets/ai ซึ่ง firestore.rules ให้อ่านได้เฉพาะกรรมการ
// **ห้ามเอาคีย์ไปไว้ใน .env** เพราะ Next export ฝังค่าลงไฟล์ JS ที่ใครก็เปิดดูได้
// ทางที่ปลอดภัยกว่านั้นอีกคือให้ proxy ถือคีย์เอง แล้วเว้นช่องคีย์ตรงนี้ไว้ว่าง
import { useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useCollection, useDocument } from "@/lib/hooks";
import { collection, orderBy, query, limit } from "firebase/firestore";
import { useSettings } from "@/lib/settings-context";
import { Badge } from "@/components/ui";
import type { MailDoc } from "@/lib/types";
import { chat, AiError, DEFAULT_BASE_URL, modelChain } from "@/lib/ai/client";
import { ALL_MODELS, DEFAULT_CHAIN, PROVIDER_OF } from "@/lib/ai/models";
import { Card, Section, Field, inputClass, Button, Alert, Switch, Spinner, useToast } from "@/components/ui";
import type { AiConfigDoc } from "@/lib/types";

const DEFAULTS: AiConfigDoc = {
  baseUrl: "",
  apiKey: "",
  model: DEFAULT_CHAIN[0],
  models: [],
  enabled: true,
};

export default function AiSettingsPanel() {
  const { data: saved, loading } = useDocument<AiConfigDoc>(() => doc(db, "secrets", "ai"), []);
  const { show, node: toastNode } = useToast();
  const { settings } = useSettings();

  // settings-context อ่านอย่างเดียว — เขียนกลับที่ settings/app ตรง ๆ
  // (merge เพื่อไม่ให้ทับค่าอื่นที่หน้าตั้งค่าระบบดูแลอยู่)
  const saveSettings = (patch: Record<string, unknown>) =>
    setDoc(doc(db, "settings", "app"), patch, { merge: true }).catch(() =>
      setErr("บันทึกการแจ้งเตือนไม่สำเร็จ")
    );

  // คิวอีเมลล่าสุด — ให้เห็นว่ามีอะไรค้างส่งอยู่ไหม แทนที่จะเงียบหาย
  const { data: mails } = useCollection<MailDoc>(
    () => query(collection(db, "mailQueue"), orderBy("createdAt", "desc"), limit(10)),
    []
  );

  const [draft, setDraft] = useState<AiConfigDoc | null>(null);
  const cfg = draft ?? saved ?? DEFAULTS;
  const set = <K extends keyof AiConfigDoc>(k: K, v: AiConfigDoc[K]) =>
    setDraft({ ...cfg, [k]: v });

  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState("");
  const [testResult, setTestResult] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await setDoc(
        doc(db, "secrets", "ai"),
        {
          baseUrl: cfg.baseUrl.trim(),
          apiKey: cfg.apiKey.trim(),
          model: cfg.model.trim() || DEFAULTS.model,
          models: (cfg.models ?? []).map((m) => m.trim()).filter(Boolean),
          enabled: cfg.enabled !== false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDraft(null);
      show("บันทึกแล้ว");
    } catch {
      setErr("บันทึกไม่สำเร็จ — ต้องเป็นกรรมการเท่านั้น");
    } finally {
      setBusy(false);
    }
  }

  // ทดสอบจากเบราว์เซอร์จริง เพราะปัญหาที่เจอบ่อยสุดคือ CORS
  // ซึ่ง curl จากเครื่องอื่นไม่มีวันเจอ
  async function test() {
    setTesting(true);
    setErr("");
    setTestResult("");
    try {
      const r = await chat({ ...cfg }, [{ role: "user", content: "ตอบกลับสั้น ๆ ว่า พร้อมใช้งาน" }]);
      setTestResult(
        `${r.text.slice(0, 120)} — ตอบโดย ${r.model} (${r.provider})` +
          (r.quotaLeft !== null ? ` · โควตาค่ายนี้เหลือ ${r.quotaLeft.toLocaleString("th-TH")} token` : "") +
          (r.skipped.length ? ` · ข้าม ${r.skipped.join(", ")} เพราะโควตาหมด` : "")
      );
    } catch (e) {
      setErr(e instanceof AiError ? e.message : "ทดสอบไม่สำเร็จ");
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      {err && <Alert onClose={() => setErr("")}>{err}</Alert>}
      {testResult && (
        <Alert tone="info" onClose={() => setTestResult("")}>
          เชื่อมต่อได้ · AI ตอบว่า “{testResult}”
        </Alert>
      )}

      <Section title="ผู้ช่วย AI">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="t-label text-[var(--ink)]">เปิดใช้ผู้ช่วย</p>
              <p className="t-caption">ปิดแล้วปุ่มผู้ช่วยจะหายจากทุกหน้า</p>
            </div>
            <Switch checked={cfg.enabled !== false} onChange={(v) => set("enabled", v)} />
          </div>

          <Field
            label="ที่อยู่ปลายทาง (base URL)"
            help="ต้องเป็นปลายทางที่ส่งหัว CORS กลับมา — gen.ai.kku.ac.th เรียกตรงจากเบราว์เซอร์ไม่ได้ ต้องผ่าน proxy"
          >
            <input
              value={cfg.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value)}
              className={inputClass}
              placeholder={DEFAULT_BASE_URL}
              maxLength={300}
            />
            <p className="t-caption mt-1.5">
              เว้นว่างไว้ได้ — ระบบจะใช้ proxy ที่เตรียมไว้ให้อยู่แล้ว
            </p>
          </Field>

          <Field
            label="API key"
            help="เว้นว่างไว้ได้ — Worker ถือคีย์ไว้ให้แล้ว ใส่ตรงนี้เฉพาะตอนอยากใช้คีย์อื่นชั่วคราว"
          >
            <input
              type="password"
              value={cfg.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              className={inputClass}
              placeholder="sk_…"
              maxLength={200}
              autoComplete="off"
            />
          </Field>

          <Field label="โมเดลหลัก" help="ตัวที่ใช้ก่อนเสมอ">
            <select value={cfg.model} onChange={(e) => set("model", e.target.value)} className={inputClass}>
              {ALL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.provider} · {m.id}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="ลำดับสำรองเมื่อโควตาหมด (บรรทัดละ 1 โมเดล)"
            help="โควตาแยกตามค่าย — สลับข้ามค่ายแล้วได้โควตาก้อนใหม่ · เว้นว่าง = ใช้ลำดับมาตรฐาน"
          >
            <textarea
              rows={5}
              value={(cfg.models ?? []).join("\n")}
              onChange={(e) => set("models", e.target.value.split("\n"))}
              className={inputClass}
              placeholder={DEFAULT_CHAIN.join("\n")}
            />
          </Field>

          <div className="surface-sunken mt-1 rounded-2xl p-3">
            <p className="t-caption mb-1.5 font-semibold">ลำดับที่ระบบจะไล่ใช้จริง</p>
            <ol className="space-y-1">
              {modelChain(cfg).map((m, i) => (
                <li key={m} className="t-caption flex items-center gap-2">
                  <span className="t-num w-4 text-right">{i + 1}.</span>
                  <span className="text-[var(--ink)]">{m}</span>
                  <span>· {PROVIDER_OF.get(m) ?? "ไม่รู้จักโมเดลนี้"}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={save} loading={busy} icon="approved">
              บันทึก
            </Button>
            <Button variant="outline" onClick={test} loading={testing}>
              ทดสอบการเชื่อมต่อ
            </Button>
          </div>
        </Card>
      </Section>

      <Section title="แจ้งเตือนทางอีเมล">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="t-label text-[var(--ink)]">ส่งอีเมลเมื่อมอบหมายงาน</p>
              <p className="t-caption">คนที่ถูกมอบหมายจะได้เมลทันทีที่กดยืนยันแผน</p>
            </div>
            <Switch
              checked={settings.notifyEmail !== false}
              onChange={(v) => void saveSettings({ notifyEmail: v })}
            />
          </div>

          <Field label="อีเมลกลางของชุมนุม" help="ใช้เป็นผู้รับสำเนาและที่อยู่ติดต่อกลับ">
            <input
              type="email"
              defaultValue={settings.notifyEmailAddress}
              onBlur={(e) => void saveSettings({ notifyEmailAddress: e.target.value.trim() })}
              className={inputClass}
              maxLength={200}
            />
          </Field>

          <p className="t-caption mt-2">
            ตัวส่งจริงคือ Cloudflare Worker ตัวเดียวกับ AI ซึ่งถือคีย์ผู้ให้บริการไว้ฝั่งเซิร์ฟเวอร์แล้ว
            สถานะทุกฉบับดูได้ด้านล่าง — ล้มเหลวก็จะบอกเหตุผล ไม่หายเงียบ
          </p>

          {mails.length > 0 && (
            <div className="surface-sunken mt-3 rounded-2xl p-3">
              <p className="t-caption mb-1.5 font-semibold">อีเมลล่าสุด</p>
              <ul className="space-y-1.5">
                {mails.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <Badge
                      className={
                        m.status === "sent" ? "tone-ok" : m.status === "failed" ? "tone-bad" : "tone-warn"
                      }
                    >
                      {m.status === "sent" ? "ส่งแล้ว" : m.status === "failed" ? "ล้มเหลว" : "รอส่ง"}
                    </Badge>
                    <span className="t-caption min-w-0 flex-1 truncate">
                      {m.to} · {m.subject}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </Section>

      <Section title="ทำไมต้องมี proxy">
        <Card>
          <p className="text-sm leading-relaxed text-[var(--ink)]/85">
            ปลายทางของ OKMD ไม่ส่งหัว CORS กลับมา เบราว์เซอร์จึงเรียกตรงจากเว็บนี้ไม่ได้
            ต้องผ่านตัวกลางที่เติมหัวให้ — โค้ดอยู่ที่{" "}
            <code className="t-num">workers/okmd-proxy.js</code> และเผยแพร่ไว้ให้แล้ว
          </p>
          <p className="t-caption mt-3">
            ติดตั้งครบแล้ว: Worker อยู่ใต้บัญชี Cloudflare ของชุมนุม ถือทั้งคีย์ AI และคีย์อีเมล
            ไว้เป็น Secret ฝั่งเซิร์ฟเวอร์ คีย์จึงไม่เคยเดินทางผ่านเบราว์เซอร์
            แก้โค้ดแล้วเผยแพร่ใหม่ด้วย <code className="t-num">npm run worker:deploy</code>
          </p>
        </Card>
      </Section>

      {toastNode}
    </div>
  );
}
