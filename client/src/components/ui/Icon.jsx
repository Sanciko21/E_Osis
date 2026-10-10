import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  ChartPie,
  Check,
  ChevronDown,
  CircleCheckBig,
  CircleHelp,
  Clock,
  Eye,
  EyeOff,
  Hourglass,
  House,
  IdCard,
  Info,
  List,
  ListChecks,
  Lock,
  LogOut,
  Megaphone,
  Menu,
  MousePointerClick,
  Pause,
  Plus,
  RefreshCw,
  School,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Star,
  Trash2,
  TriangleAlert,
  Trophy,
  Upload,
  UserCheck,
  Users,
  Vote,
  X,
} from 'lucide-react';

/**
 * Ikon garis Lucide (https://lucide.dev, lisensi ISC) dengan nama pendek proyek.
 * Dekoratif (aria-hidden): teks di sampingnya yang membawa makna. Hanya ikon yang
 * tercantum di sini yang ikut ter-bundle (tree-shaking).
 */
const ICONS = {
  alert: TriangleAlert,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  ballot: Vote,
  book: BookOpenText,
  calendar: CalendarDays,
  calendarCheck: CalendarCheck,
  chart: ChartColumn,
  chartPie: ChartPie,
  check: Check,
  checkCircle: CircleCheckBig,
  chevronDown: ChevronDown,
  clock: Clock,
  edit: SquarePen,
  eye: Eye,
  eyeOff: EyeOff,
  help: CircleHelp,
  home: House,
  hourglass: Hourglass,
  idCard: IdCard,
  info: Info,
  list: List,
  listChecks: ListChecks,
  lock: Lock,
  logout: LogOut,
  megaphone: Megaphone,
  menu: Menu,
  pause: Pause,
  plus: Plus,
  pointer: MousePointerClick,
  refresh: RefreshCw,
  school: School,
  shield: ShieldCheck,
  sparkle: Sparkles,
  star: Star,
  trash: Trash2,
  trophy: Trophy,
  upload: Upload,
  userCheck: UserCheck,
  users: Users,
  x: X,
};

export default function Icon({ name, size = 20, className = '', strokeWidth = 2 }) {
  // Titik status (mis. "Sedang Berlangsung") bukan ikon garis.
  if (name === 'dot') {
    return (
      <svg className={`icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="5" fill="currentColor" />
      </svg>
    );
  }
  const LucideIcon = ICONS[name] ?? Info;
  return (
    <LucideIcon
      className={`icon ${className}`.trim()}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
    />
  );
}
