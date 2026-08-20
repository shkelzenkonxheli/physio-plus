import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  CreditCard,
  FileText,
  Globe2,
  HelpCircle,
  LayoutDashboard,
  ListFilter,
  Loader2,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UserRoundCheck,
  UsersRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClinicContentManager } from "@/components/admin/ClinicContentManager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type View =
  | "dashboard"
  | "calendar"
  | "appointments"
  | "patients"
  | "team"
  | "services"
  | "locations"
  | "availability"
  | "notifications"
  | "website"
  | "reports"
  | "subscription"
  | "settings";

type ClinicRole = "CLINIC_ADMIN" | "PHYSIOTHERAPIST" | "RECEPTIONIST" | "SUPER_ADMIN";
type AppointmentStatus =
  "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
type Clinic = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  active: boolean;
  public_listing_enabled?: boolean;
  address: string | null;
  phone: string | null;
  email?: string | null;
  description: string | null;
  header_image_url?: string | null;
  website?: string | null;
  website_status?: string;
  services_visible?: boolean;
  team_visible?: boolean;
  locations_visible?: boolean;
  booking_cta_enabled?: boolean;
  session_history_enabled?: boolean;
  session_notes_enabled?: boolean;
};
type Membership = {
  clinic_id: string;
  user_id: string;
  role: Exclude<ClinicRole, "SUPER_ADMIN">;
  active: boolean;
};
type TeamMember = Membership & {
  membership_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  physiotherapist_id: string | null;
};
type ClinicInvitation = {
  id: string;
  email: string;
  role: Exclude<ClinicRole, "SUPER_ADMIN" | "CLINIC_ADMIN">;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
type Location = {
  id: string;
  clinic_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  is_default: boolean;
};
type Physio = {
  id: string;
  clinic_id: string | null;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  professional_title: string | null;
  status: string;
  user_id: string;
};
type Appointment = {
  id: string;
  clinic_id: string | null;
  location_id: string | null;
  patient_id: string | null;
  clinic_service_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  price: number;
  currency: string;
  service_name: string;
  client_first_name: string;
  client_last_name: string;
  client_phone: string;
  client_email: string;
  physiotherapist_id: string;
  client_id: string | null;
  created_at: string;
  source: string;
};
type ClinicPatient = {
  id: string;
  clinic_id: string;
  client_user_id: string | null;
  patient_key: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  keep_session_history: boolean;
  active: boolean;
  date_of_birth?: string | null;
  administrative_note?: string | null;
};
type SessionNote = {
  id: string;
  patient_id: string;
  appointment_id: string;
  physiotherapist_id: string;
  note: string | null;
  treatment_summary: string | null;
  patient_progress: string | null;
  next_session_plan: string | null;
  created_at: string;
};
type Subscription = {
  id: string;
  status: string;
  started_at: string;
  trial_ends_at: string | null;
  expires_at: string | null;
  plans: { code: string; name: string } | null;
};
type ClinicService = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  currency: string;
  active: boolean;
  category_id: string | null;
};
type Notification = {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const db = supabase as unknown as {
  // The generated client types predate the Phase 1/2 tables. Keep this cast
  // isolated until types are regenerated from the connected production schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args: Record<string, unknown>) => any;
};

const NAV: Array<{
  id: View;
  label: string;
  icon: ComponentType<{ className?: string }>;
  roles?: ClinicRole[];
}> = [
  { id: "dashboard", label: "Paneli", icon: LayoutDashboard },
  { id: "calendar", label: "Kalendari", icon: CalendarDays },
  { id: "appointments", label: "Terminet", icon: Clock3 },
  { id: "patients", label: "Pacientët", icon: UsersRound },
  {
    id: "team",
    label: "Ekipi",
    icon: UserRoundCheck,
    roles: ["CLINIC_ADMIN", "SUPER_ADMIN", "PHYSIOTHERAPIST"],
  },
  { id: "services", label: "Shërbimet", icon: Stethoscope },
  { id: "locations", label: "Lokacionet", icon: MapPin },
  {
    id: "availability",
    label: "Orari & disponueshmëria",
    icon: CalendarDays,
    roles: ["CLINIC_ADMIN", "SUPER_ADMIN", "PHYSIOTHERAPIST"],
  },
  { id: "notifications", label: "Njoftimet", icon: Bell },
  { id: "website", label: "Website", icon: Globe2, roles: ["CLINIC_ADMIN", "SUPER_ADMIN"] },
  {
    id: "reports",
    label: "Raportet",
    icon: ChartNoAxesCombined,
    roles: ["CLINIC_ADMIN", "SUPER_ADMIN"],
  },
  {
    id: "subscription",
    label: "Abonimi",
    icon: CreditCard,
    roles: ["CLINIC_ADMIN", "SUPER_ADMIN"],
  },
  { id: "settings", label: "Cilësimet", icon: Settings, roles: ["CLINIC_ADMIN", "SUPER_ADMIN"] },
];
const VIEW_IDS = new Set<View>(NAV.map((item) => item.id));

const TITLES: Record<View, string> = {
  dashboard: "Përmbledhja e klinikës",
  calendar: "Kalendari",
  appointments: "Terminet",
  patients: "Pacientët",
  team: "Ekipi",
  services: "Shërbimet",
  locations: "Lokacionet",
  availability: "Orari & disponueshmëria",
  notifications: "Njoftimet",
  website: "Website",
  reports: "Raportet",
  subscription: "Abonimi",
  settings: "Cilësimet",
};

const ROLE_LABEL: Record<ClinicRole, string> = {
  CLINIC_ADMIN: "Administrator klinike",
  PHYSIOTHERAPIST: "Fizioterapeut",
  RECEPTIONIST: "Recepsionist",
  SUPER_ADMIN: "Super administrator",
};

function localDay(value: string) {
  return new Date(value).toLocaleDateString("sq-AL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusTone(status: string) {
  if (["CONFIRMED", "COMPLETED", "APPROVED", "ACTIVE"].includes(status))
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["CANCELLED", "REJECTED", "SUSPENDED", "EXPIRED"].includes(status))
    return "border-red-200 bg-red-50 text-red-700";
  if (status === "NO_SHOW") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", statusTone(status))}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function EmptyState({
  icon: Icon = FileText,
  title,
  body,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed bg-white px-6 text-center">
      <div className="rounded-xl bg-slate-100 p-3">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{body}</p>
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ClinicWorkspace() {
  const { user, loading: authLoading, isAdmin, isSuperAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("dashboard");
  const [clinicId, setClinicId] = useState("");
  const [locationId, setLocationId] = useState("all");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) void navigate({ to: "/hyr", replace: true });
  }, [authLoading, navigate, user]);
  useEffect(() => {
    const syncView = () => {
      const candidate = window.location.hash.replace(/^#/, "") as View;
      if (VIEW_IDS.has(candidate)) setView(candidate);
    };
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  const { data: memberships = [], isLoading: membershipsLoading } = useQuery<Membership[]>({
    queryKey: ["clinic-workspace-memberships", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await db
        .from("clinic_memberships")
        .select("clinic_id,user_id,role,active")
        .eq("user_id", user!.id)
        .eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clinics = [], isLoading: clinicsLoading } = useQuery<Clinic[]>({
    queryKey: ["clinic-workspace-clinics", memberships.map((m) => m.clinic_id), isAdmin],
    enabled: Boolean(user) && (isAdmin || memberships.length > 0),
    queryFn: async () => {
      let query = db
        .from("clinics")
        .select(
          "id,name,slug,logo_url,header_image_url,website,active,public_listing_enabled,address,phone,email,description,session_history_enabled,session_notes_enabled,website_status,services_visible,team_visible,locations_visible,booking_cta_enabled",
        )
        .order("name");
      if (!isAdmin)
        query = query.in(
          "id",
          memberships.map((m) => m.clinic_id),
        );
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!clinicId && clinics[0]) setClinicId(clinics[0].id);
  }, [clinicId, clinics]);

  const clinic = clinics.find((item) => item.id === clinicId) ?? null;
  const membership = memberships.find((item) => item.clinic_id === clinicId);
  const role: ClinicRole =
    isSuperAdmin || (isAdmin && !membership)
      ? "SUPER_ADMIN"
      : (membership?.role ?? "PHYSIOTHERAPIST");
  const canManage = role === "CLINIC_ADMIN" || role === "SUPER_ADMIN";

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["clinic-workspace-locations", clinicId],
    enabled: Boolean(clinicId),
    queryFn: async () => {
      const { data, error } = await db
        .from("clinic_locations")
        .select("id,clinic_id,name,address,phone,active,is_default")
        .eq("clinic_id", clinicId)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: team = [] } = useQuery<Physio[]>({
    queryKey: ["clinic-workspace-team", clinicId],
    enabled: Boolean(clinicId),
    queryFn: async () => {
      const { data, error } = await db
        .from("physiotherapists")
        .select("id,clinic_id,first_name,last_name,photo_url,professional_title,status,user_id")
        .eq("clinic_id", clinicId)
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["clinic-workspace-appointments", clinicId, team.map((p) => p.id)],
    enabled: team.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("appointments")
        .select(
          "id,clinic_id,location_id,patient_id,clinic_service_id,start_at,end_at,status,price,currency,service_name,client_first_name,client_last_name,client_phone,client_email,client_id,physiotherapist_id,created_at,source",
        )
        .in(
          "physiotherapist_id",
          team.map((p) => p.id),
        )
        .order("start_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: services = [] } = useQuery<ClinicService[]>({
    queryKey: ["clinic-workspace-services", clinicId],
    enabled: Boolean(clinicId),
    queryFn: async () => {
      const { data, error } = await db
        .from("clinic_services")
        .select("id,name,duration_minutes,price,currency,active,category_id")
        .eq("clinic_id", clinicId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["clinic-workspace-notifications", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await db
        .from("notifications")
        .select("id,title,message,type,link,read_at,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: patients = [] } = useQuery<ClinicPatient[]>({
    queryKey: ["clinic-workspace-patients", clinicId],
    enabled: Boolean(clinicId),
    queryFn: async () => {
      const { data, error } = await db
        .from("clinic_patients")
        .select(
          "id,clinic_id,client_user_id,patient_key,first_name,last_name,email,phone,keep_session_history,active,date_of_birth,administrative_note",
        )
        .eq("clinic_id", clinicId)
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: sessionNotes = [] } = useQuery<SessionNote[]>({
    queryKey: ["clinic-workspace-session-notes", clinicId],
    enabled: Boolean(clinicId) && role !== "RECEPTIONIST",
    queryFn: async () => {
      const { data, error } = await db
        .from("patient_session_notes")
        .select(
          "id,patient_id,appointment_id,physiotherapist_id,note,treatment_summary,patient_progress,next_session_plan,created_at",
        )
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: subscription = null } = useQuery<Subscription | null>({
    queryKey: ["clinic-workspace-subscription", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await db
        .from("subscriptions")
        .select("id,status,started_at,trial_ends_at,expires_at,plans(code,name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(role));
  const todayKey = new Date().toDateString();
  const today = appointments.filter((item) => new Date(item.start_at).toDateString() === todayKey);
  const upcoming = appointments
    .filter((item) => new Date(item.start_at) >= new Date())
    .slice(0, 20);
  const physioById = new Map(team.map((item) => [item.id, item]));

  async function logout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    void navigate({ to: "/hyr", replace: true });
  }
  function chooseView(next: View) {
    setView(next);
    window.history.pushState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${next}`,
    );
    setMobileOpen(false);
  }
  function unsupported(message: string) {
    toast.info(message);
  }
  async function setAppointmentStatus(id: string, status: AppointmentStatus) {
    setUpdatingAppointmentId(id);
    const { error } = await db.from("appointments").update({ status }).eq("id", id);
    setUpdatingAppointmentId(null);

    if (error) {
      toast.error(`Statusi nuk u ndryshua: ${error.message}`);
      return;
    }

    const messages: Record<AppointmentStatus, string> = {
      PENDING: "Termini u kthye në pritje.",
      CONFIRMED: "Termini u konfirmua.",
      REJECTED: "Termini u refuzua.",
      CANCELLED: "Termini u anulua.",
      COMPLETED: "Termini u shënua si i përfunduar.",
      NO_SHOW: "Termini u shënua si mosparaqitje.",
    };
    toast.success(messages[status]);
    await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-appointments"] });
  }
  async function saveClinicHistorySettings(historyEnabled: boolean, notesEnabled: boolean) {
    const { error } = await db.rpc("set_clinic_session_history_settings", {
      target_clinic_id: clinicId,
      history_enabled: historyEnabled,
      notes_enabled: notesEnabled,
    });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-clinics"] });
  }
  async function setPatientHistory(patientId: string, enabled: boolean) {
    const { error } = await db.rpc("set_patient_session_history", {
      target_patient_id: patientId,
      keep_history: enabled,
    });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-patients"] });
  }
  async function saveSessionNote(
    patientId: string,
    appointmentId: string,
    values: Pick<SessionNote, "treatment_summary" | "patient_progress" | "next_session_plan">,
  ) {
    const author = team.find((member) => member.user_id === user!.id);
    if (!author)
      throw new Error("Ky përdorues nuk ka profil fizioterapeuti për të shkruar shënim.");
    const { error } = await db.from("patient_session_notes").insert({
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_id: appointmentId,
      physiotherapist_id: author.id,
      ...values,
    });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-session-notes"] });
  }
  async function markNotificationRead(id: string) {
    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-notifications"] });
  }

  if (authLoading || membershipsLoading || clinicsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-[70vh] w-full rounded-2xl" />
      </div>
    );
  }
  if (!user) return null;

  if (!clinic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
          <Building2 className="mx-auto h-9 w-9 text-slate-400" />
          <h1 className="mt-4 text-xl font-semibold">Nuk u gjet klinikë aktive</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Ky përdorues nuk ka clinic membership. Regjistrimet e reja të fizioterapeutëve kërkojnë
            ende provisioning të tenant-it pas krijimit të profilit.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/paneli">Kthehu te paneli personal</Link>
          </Button>
        </div>
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cyan-500 text-sm font-bold text-slate-950">
          {clinic.logo_url ? (
            <img src={clinic.logo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            clinic.name.slice(0, 2).toUpperCase()
          )}
        </div>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{clinic.name}</p>
            <p className="truncate text-xs text-slate-400">{ROLE_LABEL[role]}</p>
          </div>
        ) : null}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {visibleNav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => chooseView(id)}
            className={cn(
              "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition",
              view === id
                ? "bg-white/10 font-medium text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-white",
              collapsed && "justify-center px-0",
            )}
            title={collapsed ? label : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed ? <span className="truncate">{label}</span> : null}
          </button>
        ))}
      </nav>
      <div className="space-y-1 border-t border-white/10 p-2">
        <button
          className={cn(
            "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white",
            collapsed && "justify-center px-0",
          )}
          onClick={() => void navigate({ to: "/profili-profesional" })}
        >
          <UserRound className="h-4 w-4" />
          {!collapsed ? "Profili profesional" : null}
        </button>
        <button
          className={cn(
            "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white",
            collapsed && "justify-center px-0",
          )}
          onClick={() => unsupported("Qendra e ndihmës do të lidhet në një fazë të ardhshme.")}
        >
          <HelpCircle className="h-4 w-4" />
          {!collapsed ? "Ndihmë" : null}
        </button>
        <button
          className={cn(
            "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white",
            collapsed && "justify-center px-0",
          )}
          onClick={() => void logout()}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed ? "Dil" : null}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-slate-800 transition-[width] lg:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {sidebar}
      </aside>
      <div className={cn("transition-[padding]", collapsed ? "lg:pl-16" : "lg:pl-64")}>
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-0 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigimi</SheetTitle>
              </SheetHeader>
              {sidebar}
            </SheetContent>
          </Sheet>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={() => setCollapsed((value) => !value)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold md:text-lg">{TITLES[view]}</h1>
            <p className="hidden text-xs text-slate-500 sm:block">{clinic.name}</p>
          </div>
          <div className="relative hidden max-w-xs flex-1 xl:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Kërko pacient, termin..."
              className="h-9 bg-slate-50 pl-9"
            />
          </div>
          {clinics.length > 1 ? (
            <select
              value={clinicId}
              onChange={(event) => {
                setClinicId(event.target.value);
                setLocationId("all");
              }}
              className="hidden h-9 max-w-44 rounded-md border bg-white px-2 text-sm md:block"
            >
              {clinics.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : null}
          {locations.length > 1 ? (
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              className="hidden h-9 max-w-40 rounded-md border bg-white px-2 text-sm xl:block"
            >
              <option value="all">Të gjitha lokacionet</option>
              {locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button
            size="sm"
            onClick={() =>
              unsupported(
                "Krijimi manual i terminit kërkon API tenant-aware; booking-u ekzistues nuk u ndryshua.",
              )
            }
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Termin i ri</span>
          </Button>
          <button
            onClick={() => chooseView("notifications")}
            className="relative rounded-lg p-2 hover:bg-slate-100"
          >
            <Bell className="h-5 w-5" />
            {notifications.some((n) => !n.read_at) ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
            ) : null}
          </button>
          <button
            onClick={() => chooseView("settings")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
          >
            {(user.email ?? "U").slice(0, 2).toUpperCase()}
          </button>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 md:p-6">
          <WorkspaceView
            view={view}
            clinic={clinic}
            role={role}
            canManage={canManage}
            memberships={memberships.filter((item) => item.clinic_id === clinicId)}
            locations={locations}
            team={team}
            appointments={appointments}
            today={today}
            upcoming={upcoming}
            services={services}
            notifications={notifications}
            patients={patients}
            sessionNotes={sessionNotes}
            subscription={subscription}
            physioById={physioById}
            loading={appointmentsLoading}
            search={search}
            chooseView={chooseView}
            unsupported={unsupported}
            setAppointmentStatus={setAppointmentStatus}
            updatingAppointmentId={updatingAppointmentId}
            saveClinicHistorySettings={saveClinicHistorySettings}
            setPatientHistory={setPatientHistory}
            saveSessionNote={saveSessionNote}
            markNotificationRead={markNotificationRead}
          />
        </main>
      </div>
    </div>
  );
}

function WorkspaceView(props: {
  view: View;
  clinic: Clinic;
  role: ClinicRole;
  canManage: boolean;
  memberships: Membership[];
  locations: Location[];
  team: Physio[];
  appointments: Appointment[];
  today: Appointment[];
  upcoming: Appointment[];
  services: ClinicService[];
  notifications: Notification[];
  patients: ClinicPatient[];
  sessionNotes: SessionNote[];
  subscription: Subscription | null;
  physioById: Map<string, Physio>;
  loading: boolean;
  search: string;
  chooseView: (view: View) => void;
  unsupported: (message: string) => void;
  setAppointmentStatus: (id: string, status: AppointmentStatus) => Promise<void>;
  updatingAppointmentId: string | null;
  saveClinicHistorySettings: (historyEnabled: boolean, notesEnabled: boolean) => Promise<void>;
  setPatientHistory: (patientId: string, enabled: boolean) => Promise<void>;
  saveSessionNote: (
    patientId: string,
    appointmentId: string,
    values: Pick<SessionNote, "treatment_summary" | "patient_progress" | "next_session_plan">,
  ) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
}) {
  if (props.view === "dashboard") return <Dashboard {...props} />;
  if (props.view === "calendar") return <CalendarView {...props} />;
  if (props.view === "appointments") return <AppointmentsView {...props} />;
  if (props.view === "patients") return <PatientsView {...props} />;
  if (props.view === "team") return <TeamView {...props} />;
  if (props.view === "services") return <ServicesView {...props} />;
  if (props.view === "locations") return <LocationsView {...props} />;
  if (props.view === "availability") return <AvailabilityView {...props} />;
  if (props.view === "notifications") return <NotificationsView {...props} />;
  if (props.view === "website") return <WebsiteView {...props} />;
  if (props.view === "reports") return <ReportsView {...props} />;
  if (props.view === "subscription") return <SubscriptionView {...props} />;
  return <SettingsView {...props} />;
}

function Dashboard(props: Parameters<typeof WorkspaceView>[0]) {
  const completed = props.today.filter((a) => a.status === "COMPLETED").length;
  const cancelled = props.today.filter((a) => ["CANCELLED", "REJECTED"].includes(a.status)).length;
  const noShow = props.today.filter((a) => a.status === "NO_SHOW").length;
  const patients = new Set(props.today.map((a) => a.client_email || a.client_phone)).size;
  const revenue = props.today
    .filter((a) => !["CANCELLED", "REJECTED"].includes(a.status))
    .reduce((sum, a) => sum + Number(a.price), 0);
  const kpis = [
    ["Terminet sot", props.today.length, CalendarDays],
    ["Pacientët sot", patients, UsersRound],
    ["Të përfunduara", completed, CheckCircle2],
    ["Anulimet", cancelled, XCircle],
    ["Nuk u paraqitën", noShow, UserRound],
    ["Të ardhurat e pritshme", formatPrice(revenue), CircleDollarSign],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map(([label, value, Icon]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Section
          title="Orari i sotëm"
          description="Pamje e shpejtë e aktivitetit të klinikës"
          action={
            <Button variant="outline" size="sm" onClick={() => props.chooseView("calendar")}>
              Shiko kalendarin
            </Button>
          }
        >
          <AppointmentRows
            rows={props.today}
            physioById={props.physioById}
            empty="Nuk ka termine sot."
          />
        </Section>
        <div className="space-y-6">
          <Section title="Veprime të shpejta">
            <div className="grid grid-cols-2 gap-2">
              <Quick
                label="Termin i ri"
                icon={Plus}
                onClick={() => props.unsupported("Krijimi manual kërkon API tenant-aware.")}
              />
              <Quick
                label="Pacient i ri"
                icon={UserRound}
                onClick={() => props.unsupported("Tabela patients nuk ekziston ende.")}
              />
              <Quick
                label="Kopjo linkun"
                icon={Copy}
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${window.location.origin}/${props.clinic.slug}`,
                  );
                  toast.success("Linku u kopjua.");
                }}
              />
              <Quick
                label="Kalendari"
                icon={CalendarDays}
                onClick={() => props.chooseView("calendar")}
              />
            </div>
          </Section>
          <Section title="Njoftime të rëndësishme">
            <div className="space-y-3">
              {props.notifications.slice(0, 3).map((n) => (
                <div key={n.id} className="flex gap-3 text-sm">
                  <Bell className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="line-clamp-2 text-slate-500">{n.message}</p>
                  </div>
                </div>
              ))}
              {!props.notifications.length ? (
                <p className="text-sm text-slate-500">Nuk ka njoftime të reja.</p>
              ) : null}
            </div>
          </Section>
        </div>
      </div>
      <Section title="Rezervimet e fundit">
        <AppointmentRows
          rows={[...props.appointments]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 6)}
          physioById={props.physioById}
          empty="Ende nuk ka rezervime."
        />
      </Section>
    </div>
  );
}

function Quick({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-20 flex-col items-start justify-between rounded-lg border p-3 text-left text-sm font-medium hover:bg-slate-50"
    >
      <Icon className="h-4 w-4 text-cyan-700" />
      {label}
    </button>
  );
}

function AppointmentRows({
  rows,
  physioById,
  empty,
}: {
  rows: Appointment[];
  physioById: Map<string, Physio>;
  empty: string;
}) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="divide-y">
      {rows.slice(0, 10).map((a) => {
        const p = physioById.get(a.physiotherapist_id);
        return (
          <div
            key={a.id}
            className="grid gap-2 py-3 text-sm sm:grid-cols-[90px_1fr_1fr_auto] sm:items-center"
          >
            <span className="font-semibold">
              {new Date(a.start_at).toLocaleTimeString("sq-AL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <div>
              <p className="font-medium">
                {a.client_first_name} {a.client_last_name}
              </p>
              <p className="text-xs text-slate-500">{a.service_name}</p>
            </div>
            <span className="text-slate-500">
              {p ? `${p.first_name} ${p.last_name}` : "Fizioterapeut"}
            </span>
            <StatusBadge status={a.status} />
          </div>
        );
      })}
    </div>
  );
}

function CalendarView(props: Parameters<typeof WorkspaceView>[0]) {
  const [mode, setMode] = useState("day");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [physioId, setPhysioId] = useState("all");
  const start = new Date(anchorDate);
  start.setHours(0, 0, 0, 0);
  if (mode === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (mode === "month") start.setDate(1);
  const end = new Date(start);
  end.setDate(end.getDate() + (mode === "day" ? 1 : mode === "week" ? 7 : 32));
  if (mode === "month") end.setDate(1);
  const visibleAppointments = props.appointments.filter((appointment) => {
    const date = new Date(appointment.start_at);
    return (
      date >= start &&
      date < end &&
      (physioId === "all" || appointment.physiotherapist_id === physioId)
    );
  });

  function move(direction: number) {
    const next = new Date(anchorDate);
    if (mode === "day") next.setDate(next.getDate() + direction);
    if (mode === "week") next.setDate(next.getDate() + direction * 7);
    if (mode === "month") next.setMonth(next.getMonth() + direction);
    setAnchorDate(next);
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList>
            <TabsTrigger value="day">Ditë</TabsTrigger>
            <TabsTrigger value="week">Javë</TabsTrigger>
            <TabsTrigger value="month">Muaj</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <select
            className="h-9 rounded-md border bg-white px-2 text-sm"
            value={physioId}
            onChange={(event) => setPhysioId(event.target.value)}
          >
            <option value="all">Të gjithë fizioterapeutët</option>
            {props.team.map((member) => (
              <option key={member.id} value={member.id}>
                {member.first_name} {member.last_name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={() => props.unsupported("Manual booking kërkon API tenant-aware.")}
          >
            <Plus className="h-4 w-4" />
            Termin i ri
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border bg-white p-3">
        <Button variant="outline" size="icon" onClick={() => move(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button type="button" className="text-center" onClick={() => setAnchorDate(new Date())}>
          <p className="font-semibold">
            {start.toLocaleDateString("sq-AL", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-xs text-slate-500">Kliko për sot</p>
        </button>
        <Button variant="outline" size="icon" onClick={() => move(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <Section
        title={
          mode === "day" ? "Agjenda ditore" : mode === "week" ? "Agjenda javore" : "Agjenda mujore"
        }
        description="Në mobile paraqitet si timeline vertikal; booking engine mbetet i pandryshuar."
      >
        <div className="space-y-4">
          {visibleAppointments.length ? (
            visibleAppointments.map((a) => (
              <div key={a.id} className="flex gap-4 border-l-2 border-cyan-500 py-2 pl-4">
                <div className="w-24 shrink-0">
                  <p className="text-sm font-semibold">{localDay(a.start_at)}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(a.start_at).toLocaleTimeString("sq-AL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {a.client_first_name} {a.client_last_name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {a.service_name} ·{" "}
                    {props.physioById.get(a.physiotherapist_id)?.first_name ?? "Fizioterapeut"}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Kalendari është i lirë"
              body="Nuk ka termine të ardhshme në të dhënat ekzistuese."
            />
          )}
        </div>
      </Section>
    </div>
  );
}

function AppointmentsView(props: Parameters<typeof WorkspaceView>[0]) {
  const [editorAppointment, setEditorAppointment] = useState<Appointment | "new" | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [physioFilter, setPhysioFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const term = props.search.toLowerCase();
  const rows = props.appointments.filter((a) => {
    const matchesSearch =
      `${a.client_first_name} ${a.client_last_name} ${a.client_phone} ${a.client_email} ${a.service_name}`
        .toLowerCase()
        .includes(term);
    const appointmentDate = new Date(a.start_at);
    const now = new Date();
    const matchesDate =
      dateFilter === "all" ||
      (dateFilter === "today" && appointmentDate.toDateString() === now.toDateString()) ||
      (dateFilter === "upcoming" && appointmentDate >= now) ||
      (dateFilter === "past" && appointmentDate < now);
    return (
      matchesSearch &&
      matchesDate &&
      (statusFilter === "all" || a.status === statusFilter) &&
      (physioFilter === "all" || a.physiotherapist_id === physioFilter) &&
      (serviceFilter === "all" || a.service_name === serviceFilter)
    );
  });
  const services = [...new Set(props.appointments.map((a) => a.service_name))].sort();
  const canChangeStatus = [
    "CLINIC_ADMIN",
    "PHYSIOTHERAPIST",
    "RECEPTIONIST",
    "SUPER_ADMIN",
  ].includes(props.role);
  return (
    <Section
      title="Të gjitha terminet"
      description={`${rows.length} rezultate · Location dhe source nuk ekzistojnë ende në modelin aktual.`}
      action={
        <div className="flex gap-2">
          <Badge variant="secondary">
            <ListFilter className="mr-1 h-3 w-3" /> Filtra aktive
          </Badge>
          <Button size="sm" onClick={() => setEditorAppointment("new")}>
            <Plus className="h-4 w-4" /> Termin i ri
          </Button>
        </div>
      }
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <select
          className="h-9 rounded-md border bg-white px-3 text-sm"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        >
          <option value="all">Të gjitha datat</option>
          <option value="today">Sot</option>
          <option value="upcoming">Të ardhshme</option>
          <option value="past">Të kaluara</option>
        </select>
        <select
          className="h-9 rounded-md border bg-white px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Të gjitha statuset</option>
          {["PENDING", "CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED", "NO_SHOW"].map(
            (status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ),
          )}
        </select>
        <select
          className="h-9 rounded-md border bg-white px-3 text-sm"
          value={physioFilter}
          onChange={(e) => setPhysioFilter(e.target.value)}
        >
          <option value="all">Të gjithë fizioterapeutët</option>
          {props.team.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-white px-3 text-sm"
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
        >
          <option value="all">Të gjitha shërbimet</option>
          {services.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
      </div>
      {rows.length ? (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data / ora</TableHead>
                  <TableHead>Pacienti</TableHead>
                  <TableHead>Fizioterapeuti</TableHead>
                  <TableHead>Shërbimi</TableHead>
                  <TableHead>Çmimi</TableHead>
                  <TableHead>Statusi</TableHead>
                  {canChangeStatus ? <TableHead className="text-right">Veprimet</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{formatDateTime(a.start_at)}</TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {a.client_first_name} {a.client_last_name}
                      </p>
                      <p className="text-xs text-slate-500">{a.client_phone}</p>
                    </TableCell>
                    <TableCell>
                      {props.physioById.get(a.physiotherapist_id)?.first_name ?? "—"}
                    </TableCell>
                    <TableCell>{a.service_name}</TableCell>
                    <TableCell>{formatPrice(a.price, a.currency)}</TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    {canChangeStatus ? (
                      <TableCell>
                        <AppointmentActions appointment={a} {...props} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">
            {rows.map((a) => (
              <div key={a.id} className="rounded-lg border p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {a.client_first_name} {a.client_last_name}
                    </p>
                    <p className="text-sm text-slate-500">{formatDateTime(a.start_at)}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <p className="mt-3 text-sm">
                  {a.service_name} · {formatPrice(a.price, a.currency)}
                </p>
                {canChangeStatus ? <AppointmentActions appointment={a} {...props} /> : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          title="Nuk u gjetën termine"
          body="Ndrysho kërkimin ose prit rezervimin e parë."
        />
      )}
      <AppointmentEditor
        open={editorAppointment !== null}
        appointment={editorAppointment === "new" ? null : editorAppointment}
        props={props}
        onClose={() => setEditorAppointment(null)}
      />
    </Section>
  );
}

function AppointmentActions(
  allProps: Parameters<typeof WorkspaceView>[0] & { appointment: Appointment },
) {
  const { appointment, setAppointmentStatus, updatingAppointmentId } = allProps;
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  if (!["PENDING", "CONFIRMED"].includes(appointment.status)) return null;

  const loading = updatingAppointmentId === appointment.id;
  if (appointment.status === "CONFIRMED") {
    return (
      <div className="mt-3 flex flex-wrap justify-end gap-2 md:mt-0">
        <Button size="sm" variant="outline" onClick={() => setRescheduleOpen(true)}>
          Riplanifiko
        </Button>
        <Button
          size="sm"
          onClick={() => void setAppointmentStatus(appointment.id, "COMPLETED")}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Përfundo
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void setAppointmentStatus(appointment.id, "NO_SHOW")}
          disabled={loading}
        >
          Nuk erdhi
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void setAppointmentStatus(appointment.id, "CANCELLED")}
          disabled={loading}
        >
          Anulo
        </Button>
        <AppointmentEditor
          open={rescheduleOpen}
          appointment={appointment}
          props={allProps}
          onClose={() => setRescheduleOpen(false)}
        />
      </div>
    );
  }
  return (
    <div className="mt-3 flex justify-end gap-2 md:mt-0">
      <Button size="sm" variant="outline" onClick={() => setRescheduleOpen(true)}>
        Riplanifiko
      </Button>
      <Button
        size="sm"
        onClick={() => void setAppointmentStatus(appointment.id, "CONFIRMED")}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        Konfirmo
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void setAppointmentStatus(appointment.id, "REJECTED")}
        disabled={loading}
      >
        <XCircle className="h-4 w-4" />
        Refuzo
      </Button>
      <AppointmentEditor
        open={rescheduleOpen}
        appointment={appointment}
        props={allProps}
        onClose={() => setRescheduleOpen(false)}
      />
    </div>
  );
}

function AppointmentEditor({
  open,
  appointment,
  props,
  onClose,
}: {
  open: boolean;
  appointment: Appointment | null;
  props: Parameters<typeof WorkspaceView>[0];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [patientId, setPatientId] = useState(appointment?.patient_id ?? "");
  const [patientMode, setPatientMode] = useState<"existing" | "new">("existing");
  const [newPatient, setNewPatient] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });
  const [locationId, setLocationId] = useState(
    appointment?.location_id ?? props.locations[0]?.id ?? "",
  );
  const [physioId, setPhysioId] = useState(
    appointment?.physiotherapist_id ?? props.team[0]?.id ?? "",
  );
  const [serviceId, setServiceId] = useState(
    appointment?.clinic_service_id ?? props.services[0]?.id ?? "",
  );
  const [date, setDate] = useState(appointment?.start_at.slice(0, 10) ?? tomorrow);
  const [slot, setSlot] = useState(appointment?.start_at ?? "");
  const [time, setTime] = useState(
    appointment
      ? new Date(appointment.start_at).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "",
  );
  const [source, setSource] = useState("RECEPTION");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (!locationId && props.locations[0]) setLocationId(props.locations[0].id);
    if (!physioId && props.team[0]) setPhysioId(props.team[0].id);
    if (!serviceId && props.services[0]) setServiceId(props.services[0].id);
  }, [open, locationId, physioId, serviceId, props.locations, props.team, props.services]);
  const { data: slots = [], isLoading } = useQuery<string[]>({
    queryKey: [
      "clinic-operation-slots",
      props.clinic.id,
      locationId,
      physioId,
      serviceId,
      date,
      appointment?.id,
    ],
    enabled: open && Boolean(locationId && physioId && serviceId && date),
    queryFn: async () => {
      const { data, error } = await db.rpc("clinic_available_slots", {
        _clinic_id: props.clinic.id,
        _location_id: locationId,
        _physio_id: physioId,
        _clinic_service_id: serviceId,
        _date: date,
        _exclude_appointment_id: appointment?.id ?? null,
      });
      if (error) throw error;
      return (data ?? []).map((row: { slot: string }) => row.slot);
    },
  });
  async function save() {
    const selectedStart =
      slot || (date && time ? new Date(`${date}T${time}:00`).toISOString() : "");
    if (!selectedStart || !locationId || !physioId || !serviceId) return;
    if (!appointment && patientMode === "existing" && !patientId) return;
    if (
      !appointment &&
      patientMode === "new" &&
      (!newPatient.firstName.trim() ||
        !newPatient.lastName.trim() ||
        (!newPatient.phone.trim() && !newPatient.email.trim()))
    )
      return;
    setSaving(true);
    try {
      let targetPatientId = patientId;
      if (!appointment && patientMode === "new") {
        const { data: createdPatient, error: patientError } = await db.rpc(
          "create_clinic_patient",
          {
            _clinic_id: props.clinic.id,
            _first_name: newPatient.firstName.trim(),
            _last_name: newPatient.lastName.trim(),
            _phone: newPatient.phone.trim() || null,
            _email: newPatient.email.trim() || null,
            _date_of_birth: null,
            _administrative_note: null,
          },
        );
        if (patientError) throw patientError;
        targetPatientId = createdPatient.id;
      }
      const operation = appointment
        ? db.rpc("reschedule_clinic_appointment", {
            _appointment_id: appointment.id,
            _location_id: locationId,
            _physio_id: physioId,
            _clinic_service_id: serviceId,
            _start_at: selectedStart,
          })
        : db.rpc("create_clinic_appointment", {
            _clinic_id: props.clinic.id,
            _location_id: locationId,
            _patient_id: targetPatientId,
            _physio_id: physioId,
            _clinic_service_id: serviceId,
            _start_at: selectedStart,
            _notes: notes || null,
            _source: source,
          });
      const { error } = await operation;
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-patients"] });
      toast.success(appointment ? "Termini u riplanifikua." : "Termini u krijua.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veprimi dështoi.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{appointment ? "Riplanifiko terminin" : "Termin i ri"}</DialogTitle>
          <DialogDescription>
            Disponueshmëria kontrollohet përsëri në databazë para ruajtjes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!appointment ? (
            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="button"
                variant={patientMode === "existing" ? "default" : "outline"}
                onClick={() => setPatientMode("existing")}
              >
                Pacient ekzistues
              </Button>
              <Button
                type="button"
                variant={patientMode === "new" ? "default" : "outline"}
                onClick={() => setPatientMode("new")}
              >
                Pacient i ri
              </Button>
            </div>
          ) : null}
          {!appointment && patientMode === "existing" ? (
            <select
              className="h-10 rounded-md border px-3 sm:col-span-2"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">Zgjidh pacientin</option>
              {props.patients
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </option>
                ))}
            </select>
          ) : null}
          {!appointment && patientMode === "new" ? (
            <>
              <Input
                placeholder="Emri i pacientit"
                value={newPatient.firstName}
                onChange={(e) => setNewPatient((v) => ({ ...v, firstName: e.target.value }))}
              />
              <Input
                placeholder="Mbiemri"
                value={newPatient.lastName}
                onChange={(e) => setNewPatient((v) => ({ ...v, lastName: e.target.value }))}
              />
              <Input
                placeholder="Telefoni"
                value={newPatient.phone}
                onChange={(e) => setNewPatient((v) => ({ ...v, phone: e.target.value }))}
              />
              <Input
                type="email"
                placeholder="Emaili"
                value={newPatient.email}
                onChange={(e) => setNewPatient((v) => ({ ...v, email: e.target.value }))}
              />
            </>
          ) : null}
          <select
            className="h-10 rounded-md border px-3"
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setSlot("");
            }}
          >
            <option value="">Zgjidh lokacionin</option>
            {props.locations
              .filter((l) => l.active)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
          <select
            className="h-10 rounded-md border px-3"
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSlot("");
            }}
          >
            <option value="">Zgjidh shërbimin</option>
            {props.services
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <select
            className="h-10 rounded-md border px-3"
            value={physioId}
            onChange={(e) => {
              setPhysioId(e.target.value);
              setSlot("");
            }}
          >
            <option value="">Zgjidh fizioterapeutin</option>
            {props.team.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSlot("");
            }}
          />
          <Input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setSlot("");
            }}
          />
          {!appointment ? (
            <select
              className="h-10 rounded-md border px-3"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="RECEPTION">Recepsion</option>
              <option value="PHONE">Telefon</option>
              <option value="MANUAL">Manual</option>
            </select>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {isLoading ? (
            <Loader2 className="animate-spin" />
          ) : (
            slots.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={slot === value ? "default" : "outline"}
                onClick={() => {
                  setSlot(value);
                  setTime(
                    new Date(value).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    }),
                  );
                }}
              >
                {new Date(value).toLocaleTimeString("sq-AL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Button>
            ))
          )}
        </div>
        {!isLoading && locationId && physioId && serviceId && !slots.length ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Nuk ka slote të lira për këtë datë. Ndrysho datën, orarin ose kontrollo orarin e
            fizioterapeutit te Disponueshmëria.
          </p>
        ) : null}
        {!appointment ? (
          <Textarea
            placeholder="Shënim administrativ opsional"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anulo
          </Button>
          <Button
            onClick={() => void save()}
            disabled={
              saving ||
              !(slot || (date && time)) ||
              !locationId ||
              !physioId ||
              !serviceId ||
              (!appointment && patientMode === "existing" && !patientId) ||
              (!appointment &&
                patientMode === "new" &&
                (!newPatient.firstName.trim() ||
                  !newPatient.lastName.trim() ||
                  (!newPatient.phone.trim() && !newPatient.email.trim())))
            }
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ruaj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PatientsView(props: Parameters<typeof WorkspaceView>[0]) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [patientEditor, setPatientEditor] = useState<ClinicPatient | "new" | null>(null);
  const [savingPatient, setSavingPatient] = useState(false);
  const [noteAppointmentId, setNoteAppointmentId] = useState<string | null>(null);
  const [noteValues, setNoteValues] = useState({
    treatment_summary: "",
    patient_progress: "",
    next_session_plan: "",
  });
  const [savingNote, setSavingNote] = useState(false);
  const term = props.search.trim().toLowerCase();
  const patients = props.patients.filter((patient) =>
    `${patient.first_name} ${patient.last_name} ${patient.phone} ${patient.email}`
      .toLowerCase()
      .includes(term),
  );
  const selected = patients.find((patient) => patient.id === selectedId) ?? null;

  function patientAppointments(patient: ClinicPatient) {
    return props.appointments
      .filter((appointment) => {
        if (appointment.patient_id === patient.id) return true;
        if (patient.client_user_id && appointment.client_id === patient.client_user_id) return true;
        if (patient.email && appointment.client_email.toLowerCase() === patient.email.toLowerCase())
          return true;
        return Boolean(patient.phone && appointment.client_phone === patient.phone);
      })
      .sort((a, b) => b.start_at.localeCompare(a.start_at));
  }

  async function togglePatientHistory(patient: ClinicPatient, enabled: boolean) {
    if (!enabled) {
      const accepted = window.confirm(
        "Çaktivizimi ndalon ruajtjen e shënimeve të reja. Historia ekzistuese nuk do të fshihet.",
      );
      if (!accepted) return;
    }
    setSavingPatient(true);
    try {
      await props.setPatientHistory(patient.id, enabled);
      toast.success("Cilësimi i pacientit u ruajt.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cilësimi nuk u ruajt.");
    } finally {
      setSavingPatient(false);
    }
  }

  async function submitNote(patient: ClinicPatient) {
    if (!noteAppointmentId) return;
    setSavingNote(true);
    try {
      await props.saveSessionNote(patient.id, noteAppointmentId, noteValues);
      toast.success("Shënimi i seancës u ruajt.");
      setNoteAppointmentId(null);
      setNoteValues({ treatment_summary: "", patient_progress: "", next_session_plan: "" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shënimi nuk u ruajt.");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <Section
      title="Pacientët"
      description="Direktoria reale e pacientëve, e sinkronizuar nga rezervimet e klinikës."
      action={
        <Button size="sm" onClick={() => setPatientEditor("new")}>
          <Plus className="h-4 w-4" /> Pacient i ri
        </Button>
      }
    >
      {patients.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {patients.map((p) => {
            const appointments = patientAppointments(p);
            const past = appointments.filter((a) => new Date(a.start_at) < new Date());
            const next = [...appointments]
              .filter((a) => new Date(a.start_at) >= new Date())
              .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
            const latest = past[0] ?? appointments[0];
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="rounded-xl border p-4 text-left transition hover:border-cyan-300 hover:bg-cyan-50/30"
              >
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-semibold">
                      {`${p.first_name}${p.last_name}`.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="text-sm text-slate-500">{p.phone}</p>
                      <p className="text-xs text-slate-400">{p.email}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">{appointments.length} termine</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
                  <div>
                    <p className="text-slate-400">Vizita e fundit</p>
                    <p className="mt-1 font-medium">{latest ? localDay(latest.start_at) : "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Fizioterapeuti</p>
                    <p className="mt-1 font-medium">
                      {latest
                        ? (props.physioById.get(latest.physiotherapist_id)?.first_name ?? "—")
                        : "—"}
                    </p>
                  </div>
                </div>
                {next ? (
                  <p className="mt-3 text-xs text-cyan-700">
                    Termini tjetër: {formatDateTime(next.start_at)}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="Ende nuk ka pacientë"
          body="Pacientët do të shfaqen automatikisht nga rezervimet ekzistuese."
        />
      )}
      {selected ? (
        <PatientDetail
          patient={selected}
          appointments={patientAppointments(selected)}
          notes={props.sessionNotes.filter((note) => note.patient_id === selected.id)}
          props={props}
          savingPatient={savingPatient}
          togglePatientHistory={togglePatientHistory}
          noteAppointmentId={noteAppointmentId}
          setNoteAppointmentId={setNoteAppointmentId}
          noteValues={noteValues}
          setNoteValues={setNoteValues}
          savingNote={savingNote}
          submitNote={submitNote}
          edit={() => setPatientEditor(selected)}
          close={() => setSelectedId(null)}
        />
      ) : null}
      <PatientEditor
        open={patientEditor !== null}
        patient={patientEditor === "new" ? null : patientEditor}
        clinicId={props.clinic.id}
        onClose={() => setPatientEditor(null)}
      />
    </Section>
  );
}

function PatientEditor({
  open,
  patient,
  clinicId,
  onClose,
}: {
  open: boolean;
  patient: ClinicPatient | null;
  clinicId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState(patient?.first_name ?? "");
  const [lastName, setLastName] = useState(patient?.last_name ?? "");
  const [phone, setPhone] = useState(patient?.phone ?? "");
  const [email, setEmail] = useState(patient?.email ?? "");
  const [dob, setDob] = useState(patient?.date_of_birth ?? "");
  const [note, setNote] = useState(patient?.administrative_note ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setFirstName(patient?.first_name ?? "");
    setLastName(patient?.last_name ?? "");
    setPhone(patient?.phone ?? "");
    setEmail(patient?.email ?? "");
    setDob(patient?.date_of_birth ?? "");
    setNote(patient?.administrative_note ?? "");
  }, [patient, open]);
  async function save() {
    setSaving(true);
    try {
      const { error } = patient
        ? await db.rpc("update_clinic_patient", {
            _patient_id: patient.id,
            _first_name: firstName,
            _last_name: lastName,
            _phone: phone,
            _email: email,
            _date_of_birth: dob || null,
            _administrative_note: note || null,
            _active: patient.active,
          })
        : await db.rpc("create_clinic_patient", {
            _clinic_id: clinicId,
            _first_name: firstName,
            _last_name: lastName,
            _phone: phone,
            _email: email,
            _date_of_birth: dob || null,
            _administrative_note: note || null,
          });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-patients"] });
      toast.success("Pacienti u ruajt.");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pacienti nuk u ruajt.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{patient ? "Edito pacientin" : "Pacient i ri"}</DialogTitle>
          <DialogDescription>
            Të dhënat administrative nuk përfshijnë shënime klinike.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Emri"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            placeholder="Mbiemri"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          <Input placeholder="Telefoni" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </div>
        <Textarea
          placeholder="Shënim administrativ"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anulo
          </Button>
          <Button
            disabled={saving || firstName.trim().length < 2 || lastName.trim().length < 2}
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ruaj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PatientDetail({
  patient,
  appointments,
  notes,
  props,
  savingPatient,
  togglePatientHistory,
  noteAppointmentId,
  setNoteAppointmentId,
  noteValues,
  setNoteValues,
  savingNote,
  submitNote,
  edit,
  close,
}: {
  patient: ClinicPatient;
  appointments: Appointment[];
  notes: SessionNote[];
  props: Parameters<typeof WorkspaceView>[0];
  savingPatient: boolean;
  togglePatientHistory: (patient: ClinicPatient, enabled: boolean) => Promise<void>;
  noteAppointmentId: string | null;
  setNoteAppointmentId: (id: string | null) => void;
  noteValues: { treatment_summary: string; patient_progress: string; next_session_plan: string };
  setNoteValues: Dispatch<SetStateAction<typeof noteValues>>;
  savingNote: boolean;
  submitNote: (patient: ClinicPatient) => Promise<void>;
  edit: () => void;
  close: () => void;
}) {
  const historyAvailable = Boolean(props.clinic.session_history_enabled);
  const canWriteNotes =
    historyAvailable && Boolean(props.clinic.session_notes_enabled) && patient.keep_session_history;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"
      role="dialog"
      aria-modal="true"
    >
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Pacienti</p>
            <h2 className="mt-1 text-2xl font-semibold">
              {patient.first_name} {patient.last_name}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {patient.phone} · {patient.email}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={edit}>
              Edito
            </Button>
            <Button variant="ghost" size="icon" onClick={close}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="mt-6 rounded-xl border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Ruaj historinë e seancave për këtë pacient</p>
              <p className="mt-1 text-xs text-slate-500">
                {historyAvailable
                  ? "Appointment-et ruhen gjithmonë; ky opsion kontrollon vetëm shënimet."
                  : "Aktivizoje fillimisht në Cilësimet e klinikës."}
              </p>
            </div>
            <Switch
              checked={patient.keep_session_history}
              disabled={!historyAvailable || savingPatient || !props.canManage}
              onCheckedChange={(checked) => void togglePatientHistory(patient, checked)}
            />
          </div>
        </div>

        <div className="mt-6">
          <h3 className="font-semibold">Terminet</h3>
          <div className="mt-3 space-y-2">
            {appointments.map((appointment) => (
              <div key={appointment.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{appointment.service_name}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(appointment.start_at)}</p>
                  </div>
                  <StatusBadge status={appointment.status} />
                </div>
                {appointment.status === "COMPLETED" &&
                canWriteNotes &&
                !notes.some((n) => n.appointment_id === appointment.id) ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() => setNoteAppointmentId(appointment.id)}
                  >
                    <FileText className="h-4 w-4" /> Shto shënim të seancës
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {noteAppointmentId ? (
          <div className="mt-6 space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
            <h3 className="font-semibold">Shënimi i seancës</h3>
            <Textarea
              placeholder="Përmbledhja e trajtimit"
              value={noteValues.treatment_summary}
              onChange={(event) =>
                setNoteValues((v) => ({ ...v, treatment_summary: event.target.value }))
              }
            />
            <Textarea
              placeholder="Progresi i pacientit"
              value={noteValues.patient_progress}
              onChange={(event) =>
                setNoteValues((v) => ({ ...v, patient_progress: event.target.value }))
              }
            />
            <Textarea
              placeholder="Plani për seancën tjetër"
              value={noteValues.next_session_plan}
              onChange={(event) =>
                setNoteValues((v) => ({ ...v, next_session_plan: event.target.value }))
              }
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setNoteAppointmentId(null)}
                disabled={savingNote}
              >
                Anulo
              </Button>
              <Button
                onClick={() => void submitNote(patient)}
                disabled={savingNote || !Object.values(noteValues).some((value) => value.trim())}
              >
                {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ruaj
              </Button>
            </div>
          </div>
        ) : null}

        {historyAvailable && patient.keep_session_history && props.role !== "RECEPTIONIST" ? (
          <div className="mt-7">
            <h3 className="font-semibold">Historia e seancave</h3>
            {notes.length ? (
              <div className="mt-3 space-y-3">
                {notes.map((note) => {
                  const appointment = appointments.find((item) => item.id === note.appointment_id);
                  const physio = props.physioById.get(note.physiotherapist_id);
                  return (
                    <div key={note.id} className="rounded-xl border p-4">
                      <p className="text-sm font-semibold">
                        {appointment
                          ? formatDateTime(appointment.start_at)
                          : formatDateTime(note.created_at)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Fizioterapeut: {physio ? `${physio.first_name} ${physio.last_name}` : "—"} ·{" "}
                        {appointment?.service_name ?? "Seancë"}
                      </p>
                      {note.treatment_summary ? (
                        <p className="mt-3 text-sm">
                          <strong>Përmbledhja:</strong> {note.treatment_summary}
                        </p>
                      ) : null}
                      {note.patient_progress ? (
                        <p className="mt-2 text-sm">
                          <strong>Progresi:</strong> {note.patient_progress}
                        </p>
                      ) : null}
                      {note.next_session_plan ? (
                        <p className="mt-2 text-sm">
                          <strong>Plani:</strong> {note.next_session_plan}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Ende nuk ka shënime seancash.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TeamView(props: Parameters<typeof WorkspaceView>[0]) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: roster = [] } = useQuery<TeamMember[]>({
    queryKey: ["clinic-team-roster", props.clinic.id],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_clinic_team_members", {
        _clinic_id: props.clinic.id,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: invitations = [] } = useQuery<ClinicInvitation[]>({
    queryKey: ["clinic-team-invitations", props.clinic.id],
    enabled: props.canManage,
    queryFn: async () => {
      const { data, error } = await db
        .from("clinic_invitations")
        .select("id,email,role,expires_at,accepted_at,revoked_at")
        .eq("clinic_id", props.clinic.id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: assignments = [] } = useQuery<
    Array<{ physiotherapist_id: string; clinic_location_id: string; active: boolean }>
  >({
    queryKey: ["clinic-location-assignments", props.clinic.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("physiotherapist_locations")
        .select("physiotherapist_id,clinic_location_id,active")
        .eq("clinic_id", props.clinic.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  async function toggleAssignment(physioId: string, locationId: string, active: boolean) {
    const { error } = await db.rpc("set_physiotherapist_location_assignment", {
      _clinic_id: props.clinic.id,
      _physio_id: physioId,
      _location_id: locationId,
      _active: active,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["clinic-location-assignments"] });
    toast.success("Caktimi u ruajt.");
  }
  return (
    <Section
      title="Ekipi"
      description="Anëtarët dhe rolet e klinikës"
      action={
        props.canManage ? (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" />
            Shto anëtar
          </Button>
        ) : undefined
      }
    >
      {props.team.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {props.team.map((p) => (
            <div key={p.id} className="rounded-xl border p-4">
              <div className="flex gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-100">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="m-3 h-6 w-6 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {p.first_name} {p.last_name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {p.professional_title ?? "Fizioterapeut"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-cyan-700">
                    {props.memberships.find((membership) => membership.user_id === p.user_id)
                      ?.role ?? "PHYSIOTHERAPIST"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <StatusBadge status={p.status} />
                <span className="text-xs text-slate-500">
                  {
                    props.appointments.filter(
                      (a) =>
                        a.physiotherapist_id === p.id &&
                        new Date(a.start_at).toDateString() === new Date().toDateString(),
                    ).length
                  }{" "}
                  sot
                </span>
              </div>
              {props.canManage ? (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {props.locations
                    .filter((l) => l.active)
                    .map((l) => {
                      const active = assignments.some(
                        (a) =>
                          a.physiotherapist_id === p.id &&
                          a.clinic_location_id === l.id &&
                          a.active,
                      );
                      return (
                        <label key={l.id} className="flex items-center justify-between text-xs">
                          {l.name}
                          <Switch
                            checked={active}
                            onCheckedChange={(value) => void toggleAssignment(p.id, l.id, value)}
                          />
                        </label>
                      );
                    })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={UserRoundCheck}
          title="Ekipi është bosh"
          body="Nuk ka fizioterapeutë të lidhur me këtë klinikë."
        />
      )}
      {roster.filter((member) => !member.physiotherapist_id).length ? (
        <div className="mt-6">
          <h3 className="mb-3 font-semibold">Anëtarët tjerë aktivë</h3>
          <div className="divide-y rounded-xl border">
            {roster
              .filter((member) => !member.physiotherapist_id)
              .map((member) => (
                <div
                  key={member.membership_id}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div>
                    <p className="font-medium">
                      {[member.first_name, member.last_name].filter(Boolean).join(" ") ||
                        member.email ||
                        "Anëtar"}
                    </p>
                    <p className="text-sm text-slate-500">{member.email}</p>
                  </div>
                  <Badge>{member.role === "RECEPTIONIST" ? "Recepsionist" : member.role}</Badge>
                </div>
              ))}
          </div>
        </div>
      ) : null}
      {props.canManage && invitations.length ? (
        <div className="mt-6">
          <h3 className="mb-3 font-semibold">Ftesat në pritje</h3>
          <div className="divide-y rounded-xl border">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{invitation.email}</p>
                  <p className="text-xs text-slate-500">
                    Skadon: {formatDateTime(invitation.expires_at)}
                  </p>
                </div>
                <Badge variant="outline">Në pritje · {invitation.role}</Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <InviteEditor
        open={inviteOpen}
        clinicId={props.clinic.id}
        onCreated={() =>
          void queryClient.invalidateQueries({ queryKey: ["clinic-team-invitations"] })
        }
        onClose={() => setInviteOpen(false)}
      />
    </Section>
  );
}

function InviteEditor({
  open,
  clinicId,
  onCreated,
  onClose,
}: {
  open: boolean;
  clinicId: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("RECEPTIONIST");
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState("");
  async function invite() {
    setSaving(true);
    try {
      const { data, error } = await db.rpc("create_clinic_invitation", {
        _clinic_id: clinicId,
        _email: email,
        _role: role,
      });
      if (error) throw error;
      const raw = data?.[0]?.invite_token ?? "";
      setToken(raw);
      onCreated();
      toast.success("Ftesa u krijua. Kopjo linkun e sigurt.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ftesa dështoi.");
    } finally {
      setSaving(false);
    }
  }
  const link = token ? `${window.location.origin}/hyr?invite=${token}` : "";
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fto anëtar</DialogTitle>
          <DialogDescription>
            Roli ruhet në server dhe token-i ruhet vetëm si hash.
          </DialogDescription>
        </DialogHeader>
        <Input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className="h-10 rounded-md border px-3"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="RECEPTIONIST">Recepsionist</option>
          <option value="PHYSIOTHERAPIST">Fizioterapeut</option>
        </select>
        {link ? (
          <div className="rounded-lg bg-slate-50 p-3 text-xs break-all">
            {link}
            <Button
              className="mt-2"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(link)}
            >
              Kopjo
            </Button>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Mbyll
          </Button>
          <Button disabled={saving || !email.includes("@")} onClick={() => void invite()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Krijo ftesën
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServicesView(props: Parameters<typeof WorkspaceView>[0]) {
  if (props.canManage)
    return <ClinicContentManager clinicId={props.clinic.id} clinicName={props.clinic.name} />;
  return (
    <Section title="Shërbimet" description="Konfigurimi është vetëm për lexim për rolin tënd.">
      {props.services.length ? (
        <div className="divide-y">
          {props.services.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-slate-500">{s.duration_minutes} min</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatPrice(s.price, s.currency)}</p>
                <StatusBadge status={s.active ? "ACTIVE" : "INACTIVE"} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Stethoscope}
          title="Nuk ka shërbime"
          body="Administratori i klinikës nuk ka shtuar ende shërbime clinic-owned."
        />
      )}
    </Section>
  );
}

function LocationsView(props: Parameters<typeof WorkspaceView>[0]) {
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  return (
    <Section
      title="Lokacionet"
      description="Stafi caktohet në mënyrë eksplicite; nuk supozohet se punon në çdo lokacion."
      action={
        props.canManage ? (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Shto lokacion
          </Button>
        ) : undefined
      }
    >
      {props.locations.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.locations.map((l) => (
            <div key={l.id} className="rounded-xl border p-4">
              <div className="flex justify-between">
                <MapPin className="h-5 w-5 text-cyan-700" />
                {l.is_default ? <Badge>Default</Badge> : null}
              </div>
              <h3 className="mt-4 font-semibold">{l.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{l.address ?? "Adresë e pacaktuar"}</p>
              <p className="mt-1 text-sm text-slate-500">{l.phone ?? "Telefon i pacaktuar"}</p>
              <div className="mt-4 border-t pt-3">
                <StatusBadge status={l.active ? "ACTIVE" : "INACTIVE"} />
                {props.canManage ? (
                  <Button
                    className="ml-2"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(l)}
                  >
                    Edito
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={MapPin}
          title="Nuk ka lokacione"
          body="Klinika nuk ka lokacion aktiv në të dhënat aktuale."
        />
      )}
      <LocationEditor
        open={editing !== null}
        location={editing === "new" ? null : editing}
        clinicId={props.clinic.id}
        onClose={() => setEditing(null)}
      />
    </Section>
  );
}

function LocationEditor({
  open,
  location,
  clinicId,
  onClose,
}: {
  open: boolean;
  location: Location | null;
  clinicId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [phone, setPhone] = useState(location?.phone ?? "");
  const [timezone, setTimezone] = useState("Europe/Belgrade");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(location?.name ?? "");
    setAddress(location?.address ?? "");
    setPhone(location?.phone ?? "");
  }, [location, open]);
  async function call(fn: string, args: Record<string, unknown>, message: string) {
    setSaving(true);
    try {
      const { error } = await db.rpc(fn, args);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-locations"] });
      toast.success(message);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lokacioni nuk u ruajt.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{location ? "Edito lokacionin" : "Lokacion i ri"}</DialogTitle>
          <DialogDescription>
            Lokacionet me termine historike çaktivizohen, nuk fshihen.
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="Emri" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Adresa" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input placeholder="Telefoni" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input
          placeholder="Timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {location && !location.is_default ? (
            <Button
              variant="outline"
              onClick={() =>
                void call(
                  "set_default_clinic_location",
                  { _clinic_id: clinicId, _location_id: location.id },
                  "Lokacioni u bë default.",
                )
              }
            >
              Bëje default
            </Button>
          ) : null}
          {location && location.active ? (
            <Button
              variant="outline"
              onClick={() =>
                void call(
                  "deactivate_clinic_location",
                  { _clinic_id: clinicId, _location_id: location.id },
                  "Lokacioni u çaktivizua.",
                )
              }
            >
              Çaktivizo
            </Button>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anulo
          </Button>
          <Button
            disabled={saving || name.trim().length < 2}
            onClick={() =>
              void call(
                "save_clinic_location",
                {
                  _clinic_id: clinicId,
                  _location_id: location?.id ?? null,
                  _name: name,
                  _address: address || null,
                  _city_id: null,
                  _region_id: null,
                  _phone: phone || null,
                  _latitude: null,
                  _longitude: null,
                  _timezone: timezone,
                  _active: location?.active ?? true,
                },
                "Lokacioni u ruajt.",
              )
            }
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ruaj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvailabilityView(props: Parameters<typeof WorkspaceView>[0]) {
  const queryClient = useQueryClient();
  const [locationId, setScheduleLocation] = useState(props.locations[0]?.id ?? "");
  const [physioId, setSchedulePhysio] = useState(props.team[0]?.id ?? "");
  const [day, setScheduleDay] = useState("1");
  const [start, setScheduleStart] = useState("08:00");
  const [end, setScheduleEnd] = useState("16:00");
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!locationId && props.locations[0]) setScheduleLocation(props.locations[0].id);
    if (!physioId && props.team[0]) setSchedulePhysio(props.team[0].id);
  }, [locationId, physioId, props.locations, props.team]);
  const { data: schedules = [] } = useQuery<
    Array<{
      id: string;
      location_id: string;
      physiotherapist_id: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
    }>
  >({
    queryKey: ["location-schedules", props.clinic.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("physiotherapist_location_working_hours")
        .select("id,location_id,physiotherapist_id,day_of_week,start_time,end_time")
        .eq("clinic_id", props.clinic.id)
        .order("day_of_week");
      if (error) throw error;
      return data ?? [];
    },
  });
  async function addSchedule() {
    if (!locationId || !physioId) {
      toast.error("Zgjidh lokacionin dhe fizioterapeutin.");
      return;
    }
    setSaving(true);
    const { error } = await db.rpc("save_clinic_staff_schedule", {
      _clinic_id: props.clinic.id,
      _location_id: locationId,
      _physiotherapist_id: physioId,
      _day_of_week: Number(day),
      _enabled: enabled,
      _start_time: enabled ? start : null,
      _end_time: enabled ? end : null,
      _break_start: enabled && breakStart ? breakStart : null,
      _break_end: enabled && breakEnd ? breakEnd : null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["location-schedules"] });
    toast.success(enabled ? "Orari u ruajt." : "Dita u shënua pushim.");
  }
  async function removeSchedule(id: string) {
    const { error } = await db.from("physiotherapist_location_working_hours").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["location-schedules"] });
  }
  return (
    <div className="space-y-6">
      <Section
        title="Disponueshmëria e klinikës"
        description="Zgjidh fizioterapeutin, lokacionin dhe cakto vetë ditët, orarin dhe pauzën."
      >
        {props.canManage ? (
          <div className="space-y-4">
            <div className="grid gap-2 md:grid-cols-3">
              <select
                className="h-10 rounded-md border px-2"
                value={locationId}
                onChange={(e) => setScheduleLocation(e.target.value)}
              >
                {props.locations
                  .filter((l) => l.active)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
              <select
                className="h-10 rounded-md border px-2"
                value={physioId}
                onChange={(e) => setSchedulePhysio(e.target.value)}
              >
                {props.team.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-md border px-2"
                value={day}
                onChange={(e) => setScheduleDay(e.target.value)}
              >
                {["Diel", "Hënë", "Martë", "Mërkurë", "Enjte", "Premte", "Shtunë"].map((x, i) => (
                  <option key={x} value={i}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border p-4">
              <label className="flex items-center gap-3 font-medium">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                {enabled ? "Punon këtë ditë" : "Pushim këtë ditë"}
              </label>
              {enabled ? (
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <label className="text-xs text-slate-500">
                    Fillimi
                    <Input
                      className="mt-1"
                      type="time"
                      value={start}
                      onChange={(e) => setScheduleStart(e.target.value)}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Mbarimi
                    <Input
                      className="mt-1"
                      type="time"
                      value={end}
                      onChange={(e) => setScheduleEnd(e.target.value)}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Pauza nga
                    <Input
                      className="mt-1"
                      type="time"
                      value={breakStart}
                      onChange={(e) => setBreakStart(e.target.value)}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Pauza deri
                    <Input
                      className="mt-1"
                      type="time"
                      value={breakEnd}
                      onChange={(e) => setBreakEnd(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </div>
            <Button
              disabled={saving || !locationId || !physioId}
              onClick={() => void addSchedule()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ruaj këtë ditë
            </Button>
            <p className="text-xs text-slate-500">
              Fizioterapeuti duhet të jetë i caktuar në lokacion te seksioni Ekipi.
            </p>
            <div className="divide-y">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3 text-sm">
                  <span>
                    {props.locations.find((l) => l.id === s.location_id)?.name} ·{" "}
                    {props.physioById.get(s.physiotherapist_id)?.first_name} · dita {s.day_of_week}{" "}
                    · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setScheduleLocation(s.location_id);
                        setSchedulePhysio(s.physiotherapist_id);
                        setScheduleDay(String(s.day_of_week));
                        setScheduleStart(s.start_time.slice(0, 5));
                        setScheduleEnd(s.end_time.slice(0, 5));
                        setEnabled(true);
                      }}
                    >
                      Ndrysho
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void removeSchedule(s.id)}>
                      Hiq
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Vetëm për lexim"
            body="Ndryshimet e orarit të klinikës lejohen vetëm për administratorin."
          />
        )}
      </Section>
    </div>
  );
}

function NotificationsView(props: Parameters<typeof WorkspaceView>[0]) {
  const [markingId, setMarkingId] = useState<string | null>(null);
  async function openNotification(notification: Notification) {
    if (!notification.read_at) {
      setMarkingId(notification.id);
      try {
        await props.markNotificationRead(notification.id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Njoftimi nuk u përditësua.");
      } finally {
        setMarkingId(null);
      }
    }
    if (notification.link?.includes("terminet")) props.chooseView("appointments");
  }
  return (
    <Section
      title="Qendra e njoftimeve"
      description={`${props.notifications.filter((n) => !n.read_at).length} të palexuara`}
    >
      {props.notifications.length ? (
        <div className="divide-y">
          {props.notifications.map((n) => (
            <button
              type="button"
              key={n.id}
              onClick={() => void openNotification(n)}
              disabled={markingId === n.id}
              className="flex w-full gap-3 py-4 text-left hover:bg-slate-50 disabled:opacity-60"
            >
              <div
                className={cn(
                  "mt-1 h-2.5 w-2.5 rounded-full",
                  n.read_at ? "bg-slate-200" : "bg-cyan-500",
                )}
              />
              <div>
                <p className="font-medium">{n.title}</p>
                <p className="mt-1 text-sm text-slate-500">{n.message}</p>
                <p className="mt-2 text-xs text-slate-400">{formatDateTime(n.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="Nuk ka njoftime"
          body="Rezervimet dhe ndryshimet e statusit do të shfaqen këtu."
        />
      )}
    </Section>
  );
}

function WebsiteView(props: Parameters<typeof WorkspaceView>[0]) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(props.clinic.name);
  const [description, setDescription] = useState(props.clinic.description ?? "");
  const [phone, setPhone] = useState(props.clinic.phone ?? "");
  const [email, setEmail] = useState(props.clinic.email ?? "");
  const [address, setAddress] = useState(props.clinic.address ?? "");
  const [listing, setListing] = useState(Boolean(props.clinic.public_listing_enabled));
  const [servicesVisible, setServicesVisible] = useState(props.clinic.services_visible ?? true);
  const [teamVisible, setTeamVisible] = useState(props.clinic.team_visible ?? true);
  const [locationsVisible, setLocationsVisible] = useState(props.clinic.locations_visible ?? true);
  const [cta, setCta] = useState(props.clinic.booking_cta_enabled ?? true);
  const [saving, setSaving] = useState(false);
  async function save(publish: boolean) {
    setSaving(true);
    try {
      const { error } = await db.rpc("update_clinic_website", {
        _clinic_id: props.clinic.id,
        _name: name,
        _description: description,
        _phone: phone,
        _email: email,
        _address: address,
        _logo_url: props.clinic.logo_url,
        _header_image_url: props.clinic.header_image_url ?? null,
        _website: props.clinic.website ?? null,
        _social_links: {},
        _services_visible: servicesVisible,
        _team_visible: teamVisible,
        _locations_visible: locationsVisible,
        _booking_cta_enabled: cta,
        _public_listing_enabled: listing,
        _publish: publish,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-clinics"] });
      toast.success(publish ? "Website u publikua." : "Drafti u ruajt.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Website nuk u ruajt.");
    } finally {
      setSaving(false);
    }
  }
  const live =
    props.clinic.active && Boolean(props.clinic.public_listing_enabled ?? props.clinic.active);
  return (
    <div className="space-y-6">
      <Section
        title="Website i klinikës"
        description={`/${props.clinic.slug}`}
        action={<StatusBadge status={live ? "LIVE" : "DRAFT"} />}
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`/${props.clinic.slug}`} target="_blank" rel="noreferrer">
              <Globe2 className="h-4 w-4" />
              Shiko website
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/${props.clinic.slug}`);
              toast.success("Linku u kopjua.");
            }}
          >
            <Copy className="h-4 w-4" />
            Kopjo linkun
          </Button>
        </div>
      </Section>
      <Section title="Përmbajtja" description="Ruaj draftin ose publiko kur klinika është gati.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emri" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefoni" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Adresa"
          />
        </div>
        <Textarea
          className="mt-3"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Rreth klinikës"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border p-3">
            Listimi publik <Switch checked={listing} onCheckedChange={setListing} />
          </label>
          <label className="flex items-center justify-between rounded-lg border p-3">
            Shërbimet <Switch checked={servicesVisible} onCheckedChange={setServicesVisible} />
          </label>
          <label className="flex items-center justify-between rounded-lg border p-3">
            Ekipi <Switch checked={teamVisible} onCheckedChange={setTeamVisible} />
          </label>
          <label className="flex items-center justify-between rounded-lg border p-3">
            Lokacionet <Switch checked={locationsVisible} onCheckedChange={setLocationsVisible} />
          </label>
          <label className="flex items-center justify-between rounded-lg border p-3">
            Booking CTA <Switch checked={cta} onCheckedChange={setCta} />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => void save(false)}>
            Ruaj draftin
          </Button>
          <Button disabled={saving || !name.trim()} onClick={() => void save(true)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Publiko
          </Button>
        </div>
      </Section>
    </div>
  );
}

function ReportsView(props: Parameters<typeof WorkspaceView>[0]) {
  const completed = props.appointments.filter((a) => a.status === "COMPLETED");
  const cancelled = props.appointments.filter((a) => ["CANCELLED", "REJECTED"].includes(a.status));
  const noShows = props.appointments.filter((a) => a.status === "NO_SHOW");
  const revenue = completed.reduce((s, a) => s + Number(a.price), 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Terminet", props.appointments.length],
          ["Të përfunduara", completed.length],
          ["Anulime / no-show", cancelled.length + noShows.length],
          ["Të ardhurat", formatPrice(revenue)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border bg-white p-4">
            <p className="text-xs text-slate-500">{k}</p>
            <p className="mt-2 text-2xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <Section title="Aktiviteti sipas fizioterapeutit">
        {props.team.length ? (
          <div className="space-y-4">
            {props.team.map((p) => {
              const count = props.appointments.filter((a) => a.physiotherapist_id === p.id).length;
              const pct = props.appointments.length ? (count / props.appointments.length) * 100 : 0;
              return (
                <div key={p.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>
                      {p.first_name} {p.last_name}
                    </span>
                    <span>{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-cyan-600" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="Pa të dhëna"
            body="Raportet plotësohen kur klinika ka termine."
          />
        )}
      </Section>
    </div>
  );
}

function SubscriptionView(props: Parameters<typeof WorkspaceView>[0]) {
  return (
    <Section
      title="Abonimi"
      description="Plani i administratorit pronar sipas modelit ekzistues user-owned."
    >
      {props.subscription ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border p-4">
            <p className="text-xs text-slate-500">Plani</p>
            <p className="mt-2 font-semibold">
              {props.subscription.plans?.name ?? "Plan i pacaktuar"}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-slate-500">Statusi</p>
            <div className="mt-2">
              <StatusBadge status={props.subscription.status} />
            </div>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-slate-500">Fundi i provës</p>
            <p className="mt-2 font-semibold">
              {props.subscription.trial_ends_at ? localDay(props.subscription.trial_ends_at) : "—"}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-slate-500">Skadimi</p>
            <p className="mt-2 font-semibold">
              {props.subscription.expires_at ? localDay(props.subscription.expires_at) : "—"}
            </p>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={CreditCard}
          title="Nuk ka abonim aktiv"
          body="Nuk u gjet abonim për administratorin aktual të klinikës."
        />
      )}
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Billing mbetet user-owned. Kalimi në clinic-owned billing kërkon fazë të veçantë; pagesa
        online nuk u shtua.
      </div>
    </Section>
  );
}

function SettingsView(props: Parameters<typeof WorkspaceView>[0]) {
  const [historyEnabled, setHistoryEnabled] = useState(
    Boolean(props.clinic.session_history_enabled),
  );
  const [notesEnabled, setNotesEnabled] = useState(Boolean(props.clinic.session_notes_enabled));
  const [saving, setSaving] = useState(false);

  async function saveHistorySettings() {
    setSaving(true);
    try {
      await props.saveClinicHistorySettings(historyEnabled, historyEnabled && notesEnabled);
      toast.success("Cilësimet e historisë së seancave u ruajtën.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cilësimet nuk u ruajtën.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="Pacientët / Historia e seancave"
        description="Funksion opsional për shënime të lehta të trajtimit; appointment-et ruhen pavarësisht këtyre opsioneve."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
            <div>
              <p className="font-medium">Ruaj historinë e seancave</p>
              <p className="mt-1 text-xs text-slate-500">
                Lejon aktivizimin individual për pacientët.
              </p>
            </div>
            <Switch
              checked={historyEnabled}
              disabled={!props.canManage || saving}
              onCheckedChange={(checked) => {
                setHistoryEnabled(checked);
                if (!checked) setNotesEnabled(false);
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
            <div>
              <p className="font-medium">Lejo shënime për seancat</p>
              <p className="mt-1 text-xs text-slate-500">
                Shënimet lejohen vetëm për appointment-e të përfunduara.
              </p>
            </div>
            <Switch
              checked={notesEnabled}
              disabled={!props.canManage || !historyEnabled || saving}
              onCheckedChange={setNotesEnabled}
            />
          </div>
          {props.canManage ? (
            <div className="flex justify-end">
              <Button onClick={() => void saveHistorySettings()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ruaj cilësimet
              </Button>
            </div>
          ) : null}
          {!historyEnabled && props.sessionNotes.length ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Çaktivizimi ndalon shënimet e reja. {props.sessionNotes.length} shënime ekzistuese nuk
              fshihen.
            </p>
          ) : null}
        </div>
      </Section>
      <Section title="Cilësimet" description="Seksionet e tjera sipas përgjegjësisë">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            ["Profili i klinikës", Building2],
            ["Lokacionet", MapPin],
            ["Ekipi & permissions", ShieldCheck],
            ["Booking", CalendarDays],
            ["Njoftimet", Bell],
            ["Website", Globe2],
            ["Gjuha", Globe2],
            ["Abonimi", CreditCard],
            ["Siguria", ShieldCheck],
          ].map(([label, Icon]) => {
            const I = Icon as ComponentType<{ className?: string }>;
            return (
              <button
                key={label as string}
                onClick={() =>
                  props.unsupported(
                    "Ky seksion do të lidhet vetëm me API/RLS ekzistuese të sigurta.",
                  )
                }
                className="flex items-center gap-3 rounded-xl border p-4 text-left hover:bg-slate-50"
              >
                <I className="h-5 w-5 text-slate-500" />
                <span className="font-medium">{label as string}</span>
                <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
