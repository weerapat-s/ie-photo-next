// components/icon.tsx — ไอคอนชุดเดียวของทั้งระบบ (lucide)
//
// ทำไมต้องมีชั้นกลางนี้ แทนที่จะ import lucide ตรง ๆ ในแต่ละหน้า:
//   1. โมดูลข้อมูลอย่าง lib/nav.ts เก็บได้แค่ "ชื่อไอคอน" เป็น string — ไม่ต้องกลายเป็นไฟล์ React
//   2. ขนาด/ความหนาเส้นคุมจากที่เดียว ทั้งเว็บจึงดูเป็นชุดเดียวกันจริง
//   3. เปลี่ยนไอคอนของความหมายหนึ่ง ๆ ได้ที่เดียว ไม่ต้องไล่แก้ทุกหน้า
//
// (ก่อนหน้านี้ใช้ emoji 156 จุด — เรนเดอร์ไม่เหมือนกันทุกเครื่อง คุมขนาด/น้ำหนัก/สีไม่ได้)
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Ban,
  Bell,
  CalendarDays,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Flame,
  FolderOpen,
  Gauge,
  Heart,
  Home,
  Image as ImageIcon,
  Inbox,
  Info,
  KanbanSquare,
  Link2,
  Mail,
  Menu,
  Package,
  PartyPopper,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  User,
  UserCog,
  UserCheck,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

/** ชื่อเชิงความหมาย — ตั้งตามสิ่งที่มันสื่อ ไม่ใช่ตามรูปร่างไอคอน */
export const ICONS = {
  // ── โดเมนของชุมนุม ──
  equipment: Camera,
  studio: Clapperboard,
  photographer: UserCog,
  delivery: FolderOpen,
  inventory: Package,
  task: ClipboardList,
  form: FileText,
  responses: Inbox,
  gallery: ImageIcon,
  feed: Home,
  calendar: CalendarDays,
  availability: CalendarClock,
  assign: UserCheck,
  booking: CheckCircle2,
  overview: TrendingUp,
  workflow: KanbanSquare,
  dashboard: Gauge,
  members: Users,
  settings: Settings,
  maintenance: Wrench,

  // ── สถานะ / ผลลัพธ์ ──
  pending: Clock,
  approved: Check,
  overdue: Flame,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  celebrate: PartyPopper,
  empty: Sparkles,

  // ── คน / สิทธิ์ ──
  user: User,
  president: Star,
  admin: Shield,
  member: User,

  // ── การกระทำ ──
  add: Plus,
  edit: Pencil,
  remove: Trash2,
  search: Search,
  close: X,
  menu: Menu,
  copy: Copy,
  link: Link2,
  upload: Upload,
  download: Download,
  send: Send,
  reset: RotateCcw,
  show: Eye,
  hide: EyeOff,
  like: Heart,
  ban: Ban,
  notify: Bell,

  // ── ทิศทาง ──
  next: ArrowRight,
  up: ArrowUp,
  down: ArrowDown,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,

  // ── ติดต่อ ──
  phone: Phone,
  mail: Mail,
  time: Clock,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** ขนาดเป็น px — ยึดสเกล 14 / 16 / 18 / 20 / 24 เท่านั้น อย่าใส่ค่าอื่น */
  size?: 14 | 16 | 18 | 20 | 24 | 28 | 32;
  className?: string;
  /** เส้นหนาขึ้นเมื่อไอคอนเล็ก เพื่อให้น้ำหนักสายตาเท่ากัน */
  strokeWidth?: number;
}

export default function Icon({ name, size = 18, className = "", strokeWidth }: IconProps) {
  const Cmp = ICONS[name];
  // ไอคอนเล็กเส้นต้องหนาขึ้นนิด ไม่งั้นดูจางกว่าตัวใหญ่
  const stroke = strokeWidth ?? (size <= 16 ? 2.1 : size >= 28 ? 1.6 : 1.9);
  return <Cmp size={size} strokeWidth={stroke} className={`shrink-0 ${className}`} aria-hidden focusable="false" />;
}

/** ไอคอนในกรอบกลม/มน ใช้เป็นหัวการ์ดหรือ avatar ของหมวดหมู่ */
export function IconTile({
  name,
  size = 20,
  className = "",
  tone = "brand",
}: {
  name: IconName;
  size?: IconProps["size"];
  className?: string;
  tone?: "brand" | "neutral" | "amber" | "sky" | "violet" | "emerald" | "red";
}) {
  const tones: Record<string, string> = {
    brand: "bg-[var(--faculty)]/10 text-[var(--faculty)]",
    neutral: "bg-black/5 text-[var(--ink)]/70",
    amber: "bg-[var(--tone-warn-bg)] text-[var(--tone-warn-ink)]",
    sky: "bg-[var(--tone-info-bg)] text-[var(--tone-info-ink)]",
    violet: "bg-violet-100 text-violet-700",
    emerald: "bg-[var(--tone-ok-bg)] text-[var(--tone-ok-ink)]",
    red: "bg-[var(--tone-bad-bg)] text-[var(--tone-bad-ink)]",
  };
  const box = size <= 16 ? "h-8 w-8" : size <= 20 ? "h-10 w-10" : "h-12 w-12";
  return (
    <span className={`grid ${box} shrink-0 place-items-center rounded-2xl ${tones[tone]} ${className}`}>
      <Icon name={name} size={size} />
    </span>
  );
}
