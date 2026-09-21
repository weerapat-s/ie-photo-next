// lib/db/firestore.ts — API หน้าตาแบบ firebase/firestore แต่ข้างในคุยกับ PocketBase บน NAS
//
// ═══ ทำไมทำแบบนี้ ═══════════════════════════════════════════════
//
// โค้ดทั้งแอป (~60 ไฟล์) เขียนด้วย collection/query/where/onSnapshot/writeBatch ของ Firestore
// ถ้ารื้อเขียนใหม่ทีละไฟล์จะพังจุดเล็กจุดน้อยเต็มไปหมด ไฟล์นี้จึงเลียน API ชุดที่แอปใช้จริง
// ให้ครบ แล้วเปลี่ยนแค่บรรทัด import — ตรรกะของแต่ละหน้าไม่ต้องแตะ
//
// ═══ แปลงค่าไป-กลับ ═════════════════════════════════════════════
//
// PocketBase ไม่มี null สำหรับ text/number/date (ว่าง = "" / 0) และวันที่เป็นสตริง
// ใช้ lib/db/schema.ts บอกว่าช่องไหนเป็นวันที่ (คืนเป็น Timestamp ที่มี .toMillis())
// และช่องไหน "ว่างได้" (คืน "" เป็น null ให้โค้ดเดิมที่เช็ค === null ทำงานเหมือนเดิม)
//
// ═══ realtime ═══════════════════════════════════════════════════
//
// onSnapshot = ดึงครั้งแรก + ฟัง realtime ของ PocketBase (SSE) ต่อ collection ละหนึ่งสาย
// event ที่เข้ามาถูกกรองด้วยเงื่อนไขของ query ฝั่งเครื่องเอง (ไม่ดึงใหม่ทั้งก้อน)
// query เหมือนกันเป๊ะใช้ผลร่วมกัน และเก็บไว้อีก 5 นาทีหลังเลิกใช้ — เปลี่ยนหน้าไปมาแล้ว
// ข้อมูลขึ้นทันทีเหมือน cache ของ Firestore
//
// ═══ ที่ไม่รองรับ (แอปไม่ได้ใช้) ══════════════════════════════════
//   runTransaction · collectionGroup · startAfter/endBefore · ชื่อช่องแบบ "a.b"
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ClientResponseError, type RecordModel } from "pocketbase";
import { pb, db, type Firestore } from "./client";
import { SCHEMA, isCollection, type CollectionName, type FieldDef } from "./schema";

export type { Firestore };
export { db };

/**
 * แทน serverTimestamp() — hook บน NAS เห็นวันที่นี้แล้วแทนด้วยเวลาเซิร์ฟเวอร์
 * ต้องตรงกับ SERVER_TIME_MARK ใน nas/pb_hooks/ie_lib.js
 */
export const SERVER_TIME_MARK = "1111-11-11T11:11:11.111Z";

export type DocumentData = { [field: string]: any };

// ══ Timestamp ═══════════════════════════════════════════════════

export class Timestamp {
  constructor(
    readonly seconds: number,
    readonly nanoseconds: number
  ) {}
  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }
  static fromDate(d: Date): Timestamp {
    return Timestamp.fromMillis(d.getTime());
  }
  static fromMillis(ms: number): Timestamp {
    const s = Math.floor(ms / 1000);
    return new Timestamp(s, Math.round((ms - s * 1000) * 1e6));
  }
  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate(): Date {
    return new Date(this.toMillis());
  }
  isEqual(other: Timestamp): boolean {
    return other instanceof Timestamp && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds;
  }
  /** เรียงลำดับด้วย < > ได้เหมือน Timestamp ของ Firestore */
  valueOf(): string {
    return String(this.seconds + 1e12).padStart(15, "0") + "." + String(this.nanoseconds).padStart(9, "0");
  }
  toJSON(): { seconds: number; nanoseconds: number } {
    return { seconds: this.seconds, nanoseconds: this.nanoseconds };
  }
}

// ══ ค่าพิเศษตอนเขียน ═════════════════════════════════════════════

type FieldValueKind = "serverTimestamp" | "arrayUnion" | "arrayRemove" | "increment" | "deleteField";

export class FieldValue {
  constructor(
    readonly kind: FieldValueKind,
    readonly args: unknown[]
  ) {}
}
export const serverTimestamp = (): any => new FieldValue("serverTimestamp", []);
export const arrayUnion = (...items: unknown[]): any => new FieldValue("arrayUnion", items);
export const arrayRemove = (...items: unknown[]): any => new FieldValue("arrayRemove", items);
export const increment = (n: number): any => new FieldValue("increment", [n]);
export const deleteField = (): any => new FieldValue("deleteField", []);

// ══ error แบบ Firestore (มี .code) ═══════════════════════════════

export class FirestoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0
  ) {
    super(message);
    this.name = "FirestoreError";
  }
}

/**
 * แปลง error ของ PocketBase เป็น code ชุดเดียวกับ Firestore — lib/errors.ts ใช้ต่อได้เลย
 * 400 ที่ไม่มีรายละเอียดรายช่อง = hook กติกาปฏิเสธ (เท่ากับ permission-denied ของ rules เดิม)
 */
export function toFirestoreError(e: unknown): FirestoreError {
  if (e instanceof FirestoreError) return e;
  if (e instanceof ClientResponseError) {
    const s = e.status;
    const msg = (e.response?.message as string) || e.message;
    const fieldErrors = e.response?.data && Object.keys(e.response.data).length > 0;
    let code = "unknown";
    if (e.isAbort || s === 0) code = "unavailable";
    else if (s === 400) code = fieldErrors ? "invalid-argument" : "permission-denied";
    else if (s === 401 || s === 403) code = "permission-denied";
    else if (s === 404) code = "not-found";
    else if (s === 429) code = "resource-exhausted";
    else if (s >= 500) code = "internal";
    // batch ล้ม: เหตุผลจริงซ้อนอยู่ใน data.requests[ลำดับ].response — ดึงออกมาให้เห็น
    const reqs = (e.response?.data as { requests?: Record<string, { response?: { status?: number; message?: string; data?: unknown } }> })
      ?.requests;
    if (reqs && typeof reqs === "object") {
      const first = Object.entries(reqs)[0];
      const inner = first?.[1]?.response;
      if (inner) {
        const innerStatus = inner.status ?? 400;
        const innerFields = inner.data && typeof inner.data === "object" && Object.keys(inner.data).length > 0;
        const innerCode =
          innerStatus === 404 ? "not-found"
          : innerStatus === 400 && innerFields ? "invalid-argument"
          : "permission-denied";
        const fields = innerFields
          ? " " + Object.entries(inner.data as Record<string, { message?: string }>).map(([k, v]) => `${k}: ${v?.message ?? ""}`).join("; ")
          : "";
        return new FirestoreError(innerCode, `${inner.message ?? msg}${fields} (รายการที่ ${Number(first[0]) + 1} ในชุด)`, innerStatus);
      }
    }
    const detail = fieldErrors
      ? " " + Object.entries(e.response.data as Record<string, { message?: string }>)
          .map(([k, v]) => `${k}: ${v?.message ?? ""}`)
          .join("; ")
      : "";
    return new FirestoreError(code, msg + detail, s);
  }
  return new FirestoreError("unknown", e instanceof Error ? e.message : String(e));
}

// ══ อ้างอิง collection / doc / query ════════════════════════════

type Op = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in" | "array-contains" | "array-contains-any";

interface Filter {
  field: string;
  op: Op;
  value: unknown;
}
interface Order {
  field: string;
  dir: "asc" | "desc";
}

export type QueryConstraint =
  | { kind: "where"; filter: Filter }
  | { kind: "orderBy"; order: Order }
  | { kind: "limit"; n: number };

export class Query<T = DocumentData> {
  readonly type: "query" | "collection" = "query";
  constructor(
    readonly collectionName: CollectionName,
    readonly filters: readonly Filter[] = [],
    readonly orders: readonly Order[] = [],
    readonly lim: number | null = null
  ) {}
  /** ชื่อ collection — ใช้เขียน log */
  get path(): string {
    return this.collectionName;
  }
  /** ไว้ให้ type ของ T ติดไปกับ query (แบบ Firestore) — ไม่มีค่าจริง */
  declare readonly __t?: T;
}

export class CollectionReference<T = DocumentData> extends Query<T> {
  override readonly type = "collection" as const;
  constructor(name: CollectionName) {
    super(name);
  }
  get id(): string {
    return this.collectionName;
  }
}

export class DocumentReference<T = DocumentData> {
  readonly type = "document" as const;
  constructor(
    readonly parent: CollectionReference<T>,
    readonly id: string
  ) {}
  get path(): string {
    return `${this.parent.collectionName}/${this.id}`;
  }
}

function collectionName(name: string): CollectionName {
  if (!isCollection(name)) throw new FirestoreError("invalid-argument", `ไม่รู้จัก collection "${name}"`);
  return name;
}

export function collection(_db: Firestore, path: string): CollectionReference {
  return new CollectionReference(collectionName(path));
}

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** id สุ่ม 20 ตัวแบบเดียวกับ Firestore (ผ่าน pattern ของ id ในทุกตาราง) */
function newId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ID_CHARS[b % ID_CHARS.length];
  return s;
}

export function doc(parent: Firestore | CollectionReference, path?: string, ...rest: string[]): DocumentReference {
  if (parent instanceof CollectionReference) {
    return new DocumentReference(parent, path ?? newId());
  }
  const segs = [path ?? "", ...rest].join("/").split("/").filter(Boolean);
  if (segs.length !== 2) throw new FirestoreError("invalid-argument", `ที่อยู่เอกสารไม่ถูกต้อง: ${segs.join("/")}`);
  return new DocumentReference(new CollectionReference(collectionName(segs[0])), segs[1]);
}

export function where(field: string, op: Op, value: unknown): QueryConstraint {
  return { kind: "where", filter: { field, op, value } };
}
export function orderBy(field: string, dir: "asc" | "desc" = "asc"): QueryConstraint {
  return { kind: "orderBy", order: { field, dir } };
}
export function limit(n: number): QueryConstraint {
  return { kind: "limit", n };
}

export function query<T>(q: Query<T>, ...constraints: QueryConstraint[]): Query<T> {
  const filters = [...q.filters];
  const orders = [...q.orders];
  let lim = q.lim;
  for (const c of constraints) {
    if (c.kind === "where") filters.push(c.filter);
    else if (c.kind === "orderBy") orders.push(c.order);
    else lim = c.n;
  }
  return new Query<T>(q.collectionName, filters, orders, lim);
}

// ══ แปลงค่าไป-กลับ ═══════════════════════════════════════════════

/** ช่องระบบของ PocketBase ที่ไม่ใช่ข้อมูลของแอป */
const SYSTEM_FIELDS = new Set([
  "collectionId",
  "collectionName",
  "expand",
  "emailVisibility",
  "verified",
  "password",
  "tokenKey",
]);

function fieldDef(c: CollectionName, f: string): FieldDef | undefined {
  return (SCHEMA[c] as Record<string, FieldDef>)[f];
}

function parsePbDate(v: string): number {
  return Date.parse(v.includes("T") ? v : v.replace(" ", "T"));
}

/** record ของ PocketBase → ข้อมูลหน้าตาแบบเอกสาร Firestore */
function fromPb(c: CollectionName, rec: RecordModel): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === "id" || SYSTEM_FIELDS.has(k)) continue;
    const def = fieldDef(c, k);
    if (!def) {
      out[k] = v;
      continue;
    }
    switch (def.kind) {
      case "date": {
        const t = typeof v === "string" && v ? parsePbDate(v) : NaN;
        out[k] = isNaN(t) ? null : Timestamp.fromMillis(t);
        break;
      }
      case "text":
      case "longtext":
        out[k] = def.nullable && v === "" ? null : v;
        break;
      case "number":
        out[k] = def.nullable && v === 0 ? null : v;
        break;
      default:
        out[k] = v;
    }
  }
  return out;
}

function toIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

function emptyFor(def: FieldDef | undefined): unknown {
  switch (def?.kind) {
    case "text":
    case "longtext":
    case "date":
      return "";
    case "number":
      return 0;
    case "bool":
      return false;
    default:
      return null;
  }
}

/** Timestamp/Date ที่ซ้อนอยู่ใน json → สตริง ISO (PocketBase เก็บ json ตามตัว) */
function plainJson(v: unknown): unknown {
  const iso = toIso(v);
  if (iso) return iso;
  if (Array.isArray(v)) return v.map(plainJson);
  if (v && typeof v === "object" && !(v instanceof FieldValue)) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = plainJson(x);
    return o;
  }
  return v;
}

interface ArrayOp {
  field: string;
  kind: "arrayUnion" | "arrayRemove";
  items: unknown[];
}

/**
 * ข้อมูลที่จะเขียน → body ของ PocketBase
 * arrayUnion/arrayRemove ต้องรู้ค่าเดิมก่อน — แยกออกมาให้ผู้เรียกอ่าน record แล้วคำนวณ
 */
function toPb(c: CollectionName, data: DocumentData, mode: "create" | "update"): { body: DocumentData; arrayOps: ArrayOp[] } {
  const body: DocumentData = {};
  const arrayOps: ArrayOp[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (k === "id") continue;
    if (v === undefined) {
      // พฤติกรรมเดียวกับ Firestore — lib/errors.ts จับข้อความนี้อยู่
      throw new FirestoreError("invalid-argument", `Unsupported field value: undefined (found in field ${k})`);
    }
    if (k.includes(".")) throw new FirestoreError("invalid-argument", `ยังไม่รองรับชื่อช่องแบบ a.b (${k})`);
    const def = fieldDef(c, k);
    if (!def && !(c === "users" && k === "email")) {
      // PocketBase ทิ้งช่องที่ไม่รู้จักเงียบ ๆ — เตือนให้เห็นตอนพัฒนา แทนข้อมูลหายแบบไม่รู้ตัว
      console.warn(`[db] ${c}.${k} ไม่มีใน lib/db/schema.ts — ค่านี้จะไม่ถูกบันทึก`);
      continue;
    }
    if (v instanceof FieldValue) {
      switch (v.kind) {
        case "serverTimestamp":
          body[k] = def?.kind === "date" ? SERVER_TIME_MARK : new Date().toISOString();
          break;
        case "increment":
          if (mode === "update") body[`${k}+`] = v.args[0];
          else body[k] = v.args[0];
          break;
        case "deleteField":
          body[k] = emptyFor(def);
          break;
        default:
          arrayOps.push({ field: k, kind: v.kind, items: v.args });
      }
      continue;
    }
    if (v === null) {
      body[k] = emptyFor(def);
      continue;
    }
    const iso = toIso(v);
    if (iso) body[k] = iso;
    else if (def?.kind === "json") body[k] = plainJson(v);
    else body[k] = v;
  }
  return { body, arrayOps };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(plainJson(a)) === JSON.stringify(plainJson(b));

/** คำนวณ arrayUnion/arrayRemove จากค่าเดิมของ record */
function applyArrayOps(rec: RecordModel | null, ops: ArrayOp[], body: DocumentData): void {
  for (const op of ops) {
    const cur: unknown[] = Array.isArray(body[op.field])
      ? body[op.field]
      : Array.isArray(rec?.[op.field])
        ? [...rec![op.field]]
        : [];
    if (op.kind === "arrayUnion") {
      for (const it of op.items) if (!cur.some((x) => sameValue(x, it))) cur.push(plainJson(it));
      body[op.field] = cur;
    } else {
      body[op.field] = cur.filter((x) => !op.items.some((it) => sameValue(x, it)));
    }
  }
}

// ══ query → filter ของ PocketBase ════════════════════════════════

function filterValue(c: CollectionName, field: string, v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate();
  if (v === null) return emptyFor(fieldDef(c, field));
  return v;
}

function lit(c: CollectionName, field: string, v: unknown): string {
  return pb.filter("{:v}", { v: filterValue(c, field, v) as any });
}

function filterExpr(c: CollectionName, f: Filter): string {
  const F = f.field;
  const list = (v: unknown) => (Array.isArray(v) ? v : [v]);
  switch (f.op) {
    case "==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=": {
      const op = f.op === "==" ? "=" : f.op;
      return `${F} ${op} ${lit(c, F, f.value)}`;
    }
    case "in": {
      const vs = list(f.value);
      if (!vs.length) return `id = "__none__"`;
      return "(" + vs.map((v) => `${F} = ${lit(c, F, v)}`).join(" || ") + ")";
    }
    case "not-in":
      return "(" + list(f.value).map((v) => `${F} != ${lit(c, F, v)}`).join(" && ") + ")";
    case "array-contains":
      // json เก็บเป็นข้อความ — หาแบบมีเครื่องหมายคำพูดครอบจึงตรงทั้งตัว ไม่ใช่แค่บางส่วน
      // (ผลถูกกรองซ้ำฝั่งเครื่องด้วย matches() อีกชั้น)
      return `${F} ~ ${pb.filter("{:v}", { v: JSON.stringify(f.value) })}`;
    case "array-contains-any": {
      const vs = list(f.value);
      if (!vs.length) return `id = "__none__"`;
      return "(" + vs.map((v) => `${F} ~ ${pb.filter("{:v}", { v: JSON.stringify(v) })}`).join(" || ") + ")";
    }
  }
}

function pbListOptions(q: Query<any>): { filter?: string; sort?: string } {
  const filter = q.filters.map((f) => filterExpr(q.collectionName, f)).join(" && ");
  const sort = q.orders.map((o) => (o.dir === "desc" ? "-" : "") + o.field).join(",");
  return { ...(filter ? { filter } : {}), ...(sort ? { sort } : {}) };
}

// ── ตรวจเงื่อนไขฝั่งเครื่อง (ใช้กับ event realtime และกรอง array-contains ซ้ำ) ──

function norm(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (v === "") return null;
  return v ?? null;
}

function matchOne(data: DocumentData, f: Filter): boolean {
  const a = norm(data[f.field]);
  const b = norm(f.value);
  switch (f.op) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      return a !== null && b !== null && (a as number) < (b as number);
    case "<=":
      return a !== null && b !== null && (a as number) <= (b as number);
    case ">":
      return a !== null && b !== null && (a as number) > (b as number);
    case ">=":
      return a !== null && b !== null && (a as number) >= (b as number);
    case "in":
      return (f.value as unknown[]).some((x) => norm(x) === a);
    case "not-in":
      return !(f.value as unknown[]).some((x) => norm(x) === a);
    case "array-contains":
      return Array.isArray(data[f.field]) && (data[f.field] as unknown[]).some((x) => norm(x) === b);
    case "array-contains-any":
      return (
        Array.isArray(data[f.field]) &&
        (data[f.field] as unknown[]).some((x) => (f.value as unknown[]).some((y) => norm(y) === norm(x)))
      );
  }
}

function matches(q: Query<any>, data: DocumentData): boolean {
  return q.filters.every((f) => matchOne(data, f));
}

function compareDocs(q: Query<any>) {
  return (x: Row, y: Row): number => {
    for (const o of q.orders) {
      const a = norm(x.data[o.field]);
      const b = norm(y.data[o.field]);
      if (a === b) continue;
      // null ขึ้นก่อนเสมอ (แบบ Firestore)
      const r = a === null ? -1 : b === null ? 1 : (a as number) < (b as number) ? -1 : 1;
      return o.dir === "desc" ? -r : r;
    }
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  };
}

// ══ snapshot ═════════════════════════════════════════════════════

interface Row {
  id: string;
  data: DocumentData;
}

const META = { fromCache: false, hasPendingWrites: false } as const;

export class DocumentSnapshot<T = DocumentData> {
  readonly metadata = META;
  constructor(
    readonly ref: DocumentReference<T>,
    private readonly _data: DocumentData | null
  ) {}
  get id(): string {
    return this.ref.id;
  }
  exists(): boolean {
    return this._data !== null;
  }
  data(): T {
    return (this._data ? { ...this._data } : undefined) as T;
  }
  get(field: string): any {
    return this._data?.[field];
  }
}

export class QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {}

export class QuerySnapshot<T = DocumentData> {
  readonly metadata = META;
  constructor(
    readonly query: Query<T>,
    readonly docs: QueryDocumentSnapshot<T>[]
  ) {}
  get size(): number {
    return this.docs.length;
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
  forEach(cb: (d: QueryDocumentSnapshot<T>) => void): void {
    this.docs.forEach(cb);
  }
}

function querySnapshot(q: Query<any>, rows: Row[]): QuerySnapshot<any> {
  const col = new CollectionReference(q.collectionName);
  return new QuerySnapshot(
    q,
    rows.map((r) => new QueryDocumentSnapshot(new DocumentReference(col, r.id), r.data))
  );
}

// ══ อ่านครั้งเดียว ═══════════════════════════════════════════════

async function fetchRows(q: Query<any>): Promise<Row[]> {
  const opts = pbListOptions(q);
  const col = pb.collection(q.collectionName);
  const recs = q.lim
    ? (await col.getList(1, q.lim, { ...opts, skipTotal: true })).items
    : await col.getFullList({ ...opts, batch: 1000 });
  return recs
    .map((r) => ({ id: r.id, data: fromPb(q.collectionName, r) }))
    .filter((r) => matches(q, r.data));
}

async function fetchDoc(ref: DocumentReference<any>): Promise<DocumentData | null> {
  try {
    // getList แทน getOne — ไม่มีเอกสาร (เช่น banned/{uid} ของคนที่ไม่ได้ถูกระงับ) ได้ผลว่าง
    // แทน 404 ที่เบราว์เซอร์พ่นลง console ทุกครั้ง (list กับ view ใช้กติกาเดียวกันทุกตาราง)
    const res = await pb
      .collection(ref.parent.collectionName)
      .getList(1, 1, { filter: pb.filter("id = {:id}", { id: ref.id }), skipTotal: true });
    const rec = res.items[0];
    return rec ? fromPb(ref.parent.collectionName, rec) : null;
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 404) return null;
    throw toFirestoreError(e);
  }
}

export async function getDocs<T>(q: Query<T>): Promise<QuerySnapshot<T>> {
  try {
    return querySnapshot(q, await fetchRows(q));
  } catch (e) {
    throw toFirestoreError(e);
  }
}

export async function getDoc<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  return new DocumentSnapshot(ref, await fetchDoc(ref));
}

// ══ realtime ═════════════════════════════════════════════════════

interface Listener {
  next: (snap: any) => void;
  error?: (e: FirestoreError) => void;
}

interface Entry {
  key: string;
  collection: CollectionName;
  /** query ปกติ หรือ doc เดี่ยว (docId) */
  q: Query<any> | null;
  docId: string | null;
  listeners: Set<Listener>;
  rows: Row[];
  /** doc เดี่ยว: ข้อมูลหรือ null (ไม่มีเอกสาร) */
  docData: DocumentData | null;
  ready: boolean;
  error: FirestoreError | null;
  loading: boolean;
  /** มี event เข้ามาระหว่างดึง — ดึงใหม่อีกรอบให้ชัวร์ว่าไม่ตกหล่น */
  dirtyWhileLoading: boolean;
  lingerTimer: ReturnType<typeof setTimeout> | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

/** เลิกใช้แล้วเก็บผลไว้อีกนานเท่านี้ — เปลี่ยนหน้าไปกลับได้ข้อมูลทันที */
const LINGER_MS = 5 * 60 * 1000;

const entries = new Map<string, Entry>();
/** subscription realtime ต่อ collection (หนึ่งสายต่อ collection ใช้ร่วมทุก query) */
const collectionSubs = new Map<CollectionName, Promise<() => Promise<void>>>();

function queryKey(q: Query<any>): string {
  const vals = (v: unknown): unknown => (v instanceof Timestamp ? { __ts: v.toMillis() } : v);
  return JSON.stringify([
    q.collectionName,
    q.filters.map((f) => [f.field, f.op, Array.isArray(f.value) ? f.value.map(vals) : vals(f.value)]),
    q.orders.map((o) => [o.field, o.dir]),
    q.lim,
  ]);
}

function emit(entry: Entry): void {
  if (entry.flushTimer) return;
  // รวบ event ที่มาติด ๆ กัน (เช่น batch 10 รายการ) ให้ render ครั้งเดียว
  entry.flushTimer = setTimeout(() => {
    entry.flushTimer = null;
    if (!entry.ready) return;
    const snap = entry.q
      ? querySnapshot(entry.q, entry.rows)
      : new DocumentSnapshot(
          new DocumentReference(new CollectionReference(entry.collection), entry.docId!),
          entry.docData
        );
    for (const l of [...entry.listeners]) {
      try {
        l.next(snap);
      } catch (e) {
        console.error("[db] onSnapshot callback error", e);
      }
    }
  }, 10);
}

function emitError(entry: Entry, err: FirestoreError): void {
  for (const l of [...entry.listeners]) l.error?.(err);
}

async function load(entry: Entry): Promise<void> {
  if (entry.loading) {
    entry.dirtyWhileLoading = true;
    return;
  }
  entry.loading = true;
  entry.dirtyWhileLoading = false;
  try {
    await ensureCollectionSub(entry.collection);
    if (entry.q) entry.rows = await fetchRows(entry.q);
    else entry.docData = await fetchDoc(new DocumentReference(new CollectionReference(entry.collection), entry.docId!));
    entry.ready = true;
    entry.error = null;
    emit(entry);
  } catch (e) {
    const err = toFirestoreError(e);
    entry.error = err;
    console.error(`[db] โหลด ${entry.collection} ไม่สำเร็จ:`, err.code, err.message);
    emitError(entry, err);
  } finally {
    entry.loading = false;
  }
  if (entry.dirtyWhileLoading && entries.has(entry.key)) void load(entry);
}

function applyEvent(entry: Entry, action: string, rec: RecordModel): void {
  if (entry.loading) {
    entry.dirtyWhileLoading = true;
    return;
  }
  if (!entry.ready) return;

  if (!entry.q) {
    if (rec.id !== entry.docId) return;
    entry.docData = action === "delete" ? null : fromPb(entry.collection, rec);
    emit(entry);
    return;
  }

  const q = entry.q;
  const idx = entry.rows.findIndex((r) => r.id === rec.id);
  const data = action === "delete" ? null : fromPb(entry.collection, rec);
  const keep = data !== null && matches(q, data);

  if (!keep) {
    if (idx < 0) return;
    const wasFull = q.lim !== null && entry.rows.length >= q.lim;
    entry.rows = entry.rows.filter((r) => r.id !== rec.id);
    // query ที่มี limit: เอาออกหนึ่งแล้วอาจมีตัวถัดไปที่ต้องเลื่อนขึ้นมา — ดึงใหม่
    if (wasFull) void load(entry);
    else emit(entry);
    return;
  }

  const row = { id: rec.id, data };
  const rows = idx >= 0 ? entry.rows.map((r, i) => (i === idx ? row : r)) : [...entry.rows, row];
  if (q.orders.length) rows.sort(compareDocs(q));
  entry.rows = q.lim !== null ? rows.slice(0, q.lim) : rows;
  emit(entry);
}

function ensureCollectionSub(c: CollectionName): Promise<unknown> {
  let sub = collectionSubs.get(c);
  if (!sub) {
    sub = pb.collection(c).subscribe("*", (ev: { action: string; record: RecordModel }) => {
      for (const entry of entries.values()) {
        if (entry.collection === c) applyEvent(entry, ev.action, ev.record);
      }
    });
    // ต่อไม่ติดก็ไม่เป็นไร — ข้อมูลครั้งแรกยังดึงได้ แค่ไม่อัปเดตสด (ลองใหม่รอบหน้า)
    sub.catch((e) => {
      console.warn(`[db] realtime ${c} ไม่ทำงาน:`, e?.message ?? e);
      collectionSubs.delete(c);
    });
    collectionSubs.set(c, sub);
  }
  return sub.catch(() => undefined);
}

function dropEntry(entry: Entry): void {
  if (entry.lingerTimer) clearTimeout(entry.lingerTimer);
  if (entry.flushTimer) clearTimeout(entry.flushTimer);
  entries.delete(entry.key);
}

function listen(key: string, make: () => Entry, listener: Listener): () => void {
  let entry = entries.get(key);
  if (!entry) {
    entry = make();
    entries.set(key, entry);
    void load(entry);
  } else {
    if (entry.lingerTimer) {
      clearTimeout(entry.lingerTimer);
      entry.lingerTimer = null;
    }
    // มีผลอยู่แล้ว (จาก query เดียวกันที่อื่นหรือที่เก็บไว้) — ส่งให้ทันที
    const e = entry;
    if (e.ready) queueMicrotask(() => e.listeners.has(listener) && emitTo(e, listener));
    else if (e.error) queueMicrotask(() => listener.error?.(e.error!));
  }
  entry.listeners.add(listener);

  const e = entry;
  return () => {
    e.listeners.delete(listener);
    if (e.listeners.size === 0 && entries.get(e.key) === e) {
      e.lingerTimer = setTimeout(() => dropEntry(e), LINGER_MS);
    }
  };
}

function emitTo(entry: Entry, l: Listener): void {
  const snap = entry.q
    ? querySnapshot(entry.q, entry.rows)
    : new DocumentSnapshot(new DocumentReference(new CollectionReference(entry.collection), entry.docId!), entry.docData);
  l.next(snap);
}

function newEntry(key: string, c: CollectionName, q: Query<any> | null, docId: string | null): Entry {
  return {
    key,
    collection: c,
    q,
    docId,
    listeners: new Set(),
    rows: [],
    docData: null,
    ready: false,
    error: null,
    loading: false,
    dirtyWhileLoading: false,
    lingerTimer: null,
    flushTimer: null,
  };
}

export type Unsubscribe = () => void;

export function onSnapshot<T>(
  target: DocumentReference<T>,
  next: (snap: DocumentSnapshot<T>) => void,
  error?: (e: FirestoreError) => void
): Unsubscribe;
export function onSnapshot<T>(
  target: Query<T>,
  next: (snap: QuerySnapshot<T>) => void,
  error?: (e: FirestoreError) => void
): Unsubscribe;
export function onSnapshot(
  target: DocumentReference<any> | Query<any>,
  next: (snap: any) => void,
  error?: (e: FirestoreError) => void
): Unsubscribe {
  const listener: Listener = { next, error };
  if (target instanceof DocumentReference) {
    const c = target.parent.collectionName;
    const key = `doc|${c}|${target.id}`;
    return listen(key, () => newEntry(key, c, null, target.id), listener);
  }
  const key = queryKey(target);
  return listen(key, () => newEntry(key, target.collectionName, target, null), listener);
}

// ── เปลี่ยนบัญชี / สายหลุด / กลับมาที่แท็บ ─────────────────────────

function reloadAll(): void {
  for (const entry of entries.values()) void load(entry);
}

async function resubscribeAll(): Promise<void> {
  const cols = [...collectionSubs.keys()];
  collectionSubs.clear();
  await pb.realtime.unsubscribe().catch(() => undefined);
  watchReconnect();
  await Promise.all(cols.map((c) => ensureCollectionSub(c)));
}

let connectCount = 0;
function watchReconnect(): void {
  connectCount = 0;
  void pb.realtime
    .subscribe("PB_CONNECT", () => {
      // ครั้งแรกคือเชื่อมต่อปกติ — ครั้งต่อ ๆ ไปคือต่อใหม่หลังสายหลุด อาจพลาด event ไประหว่างนั้น
      if (++connectCount > 1) reloadAll();
    })
    .catch(() => undefined);
}

if (typeof window !== "undefined") {
  watchReconnect();

  let lastUid = pb.authStore.record?.id ?? "";
  pb.authStore.onChange((_token, record) => {
    const uid = record?.id ?? "";
    if (uid === lastUid) return; // แค่ต่ออายุ token
    lastUid = uid;
    // ผลที่เก็บไว้เป็นของบัญชีก่อน — ทิ้งตัวที่ไม่มีใครใช้ ตัวที่ใช้อยู่ดึงใหม่ด้วยสิทธิ์ใหม่
    for (const entry of [...entries.values()]) {
      if (entry.listeners.size === 0) dropEntry(entry);
      else entry.ready = false;
    }
    void resubscribeAll().then(reloadAll);
  });

  // แท็บที่พับไว้นาน ๆ เบราว์เซอร์อาจตัดสาย realtime — กลับมาแล้วดึงใหม่ให้ชัวร์
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) reloadAll();
  });
}

// ══ เขียน ════════════════════════════════════════════════════════

export async function addDoc<T>(ref: CollectionReference<T>, data: DocumentData): Promise<DocumentReference<T>> {
  const id = newId();
  const { body, arrayOps } = toPb(ref.collectionName, data, "create");
  applyArrayOps(null, arrayOps, body);
  try {
    await pb.collection(ref.collectionName).create({ id, ...body });
  } catch (e) {
    throw toFirestoreError(e);
  }
  return new DocumentReference(ref, id);
}

/**
 * setDoc — มีอยู่แล้วแก้ ไม่มีสร้างใหม่
 * ต่างจาก Firestore เล็กน้อยตอนไม่ใส่ merge: ช่องที่ไม่ได้ส่งมาจะคงค่าเดิมไว้ ไม่ถูกล้าง
 * (ทุกจุดในแอปที่ set ทับของเดิมส่งมาครบทุกช่องอยู่แล้ว)
 */
export async function setDoc<T>(ref: DocumentReference<T>, data: DocumentData, _opts?: { merge?: boolean }): Promise<void> {
  const c = ref.parent.collectionName;
  const col = pb.collection(c);
  const { body, arrayOps } = toPb(c, data, "update");
  try {
    let existing: RecordModel | null = null;
    if (arrayOps.length) existing = await col.getOne(ref.id).catch(() => null);
    applyArrayOps(existing, arrayOps, body);
    try {
      await col.update(ref.id, body);
    } catch (e) {
      if (!(e instanceof ClientResponseError && e.status === 404)) throw e;
      const created = toPb(c, data, "create");
      applyArrayOps(null, created.arrayOps, created.body);
      await col.create({ id: ref.id, ...created.body });
    }
  } catch (e) {
    throw toFirestoreError(e);
  }
}

export async function updateDoc<T>(ref: DocumentReference<T>, data: DocumentData): Promise<void> {
  const c = ref.parent.collectionName;
  const col = pb.collection(c);
  const { body, arrayOps } = toPb(c, data, "update");
  try {
    if (arrayOps.length) applyArrayOps(await col.getOne(ref.id), arrayOps, body);
    await col.update(ref.id, body);
  } catch (e) {
    throw toFirestoreError(e);
  }
}

export async function deleteDoc<T>(ref: DocumentReference<T>): Promise<void> {
  try {
    await pb.collection(ref.parent.collectionName).delete(ref.id);
  } catch (e) {
    // Firestore ลบของที่ไม่มีอยู่แล้วถือว่าสำเร็จ
    if (e instanceof ClientResponseError && e.status === 404) return;
    throw toFirestoreError(e);
  }
}

// ── writeBatch → batch API ของ PocketBase (ทั้งก้อนสำเร็จหรือไม่ก็ไม่มีอะไรเกิดเลย) ──

type BatchOp =
  | { kind: "set"; ref: DocumentReference<any>; data: DocumentData }
  | { kind: "update"; ref: DocumentReference<any>; data: DocumentData }
  | { kind: "delete"; ref: DocumentReference<any> };

/** ตรงกับ batch.maxRequests ใน nas/pb_migrations/1758480000_settings.js */
const BATCH_MAX = 100;

export class WriteBatch {
  private ops: BatchOp[] = [];
  set(ref: DocumentReference<any>, data: DocumentData, _opts?: { merge?: boolean }): WriteBatch {
    this.ops.push({ kind: "set", ref, data });
    return this;
  }
  update(ref: DocumentReference<any>, data: DocumentData): WriteBatch {
    this.ops.push({ kind: "update", ref, data });
    return this;
  }
  delete(ref: DocumentReference<any>): WriteBatch {
    this.ops.push({ kind: "delete", ref });
    return this;
  }
  async commit(): Promise<void> {
    if (!this.ops.length) return;
    try {
      // เตรียม body ทั้งหมดก่อน (arrayUnion ต้องอ่านค่าเดิม)
      const prepared = await Promise.all(
        this.ops.map(async (op) => {
          const c = op.ref.parent.collectionName;
          if (op.kind === "delete") return { op, c, body: null };
          const { body, arrayOps } = toPb(c, op.data, op.kind === "set" ? "create" : "update");
          if (arrayOps.length) {
            const rec = await pb.collection(c).getOne(op.ref.id).catch(() => null);
            applyArrayOps(rec, arrayOps, body);
          }
          return { op, c, body };
        })
      );
      for (let i = 0; i < prepared.length; i += BATCH_MAX) {
        const batch = pb.createBatch();
        for (const { op, c, body } of prepared.slice(i, i + BATCH_MAX)) {
          const col = batch.collection(c);
          if (op.kind === "delete") col.delete(op.ref.id);
          else if (op.kind === "update") col.update(op.ref.id, body!);
          else col.upsert({ id: op.ref.id, ...body! });
        }
        await batch.send();
      }
    } catch (e) {
      throw toFirestoreError(e);
    }
  }
}

export function writeBatch(_db: Firestore): WriteBatch {
  return new WriteBatch();
}
