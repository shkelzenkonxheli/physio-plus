import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
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
import { Skeleton } from "@/components/ui/skeleton";
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
  description: string | null;
};
type Membership = {
  clinic_id: string;
  user_id: string;
  role: Exclude<ClinicRole, "SUPER_ADMIN">;
  active: boolean;
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
  created_at: string;
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
  read_at: string | null;
  created_at: string;
};

const db = supabase as unknown as {
  // The generated client types predate the Phase 1/2 tables. Keep this cast
  // isolated until types are regenerated from the connected production schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
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
        .select("id,name,slug,logo_url,active,public_listing_enabled,address,phone,description")
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
          "id,start_at,end_at,status,price,currency,service_name,client_first_name,client_last_name,client_phone,client_email,physiotherapist_id,created_at",
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
        .select("id,title,message,type,read_at,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
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

    toast.success(status === "CONFIRMED" ? "Termini u konfirmua." : "Termini u refuzua.");
    await queryClient.invalidateQueries({ queryKey: ["clinic-workspace-appointments"] });
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
            locations={locations}
            team={team}
            appointments={appointments}
            today={today}
            upcoming={upcoming}
            services={services}
            notifications={notifications}
            physioById={physioById}
            loading={appointmentsLoading}
            search={search}
            chooseView={chooseView}
            unsupported={unsupported}
            setAppointmentStatus={setAppointmentStatus}
            updatingAppointmentId={updatingAppointmentId}
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
  locations: Location[];
  team: Physio[];
  appointments: Appointment[];
  today: Appointment[];
  upcoming: Appointment[];
  services: ClinicService[];
  notifications: Notification[];
  physioById: Map<string, Physio>;
  loading: boolean;
  search: string;
  chooseView: (view: View) => void;
  unsupported: (message: string) => void;
  setAppointmentStatus: (id: string, status: AppointmentStatus) => Promise<void>;
  updatingAppointmentId: string | null;
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
  if (props.view === "subscription") return <SubscriptionView />;
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
          <Button variant="outline" size="sm">
            <ListFilter className="h-4 w-4" />
            Filtrat
          </Button>
          <Button
            size="sm"
            onClick={() => props.unsupported("Manual booking kërkon API tenant-aware.")}
          >
            <Plus className="h-4 w-4" />
            Termin i ri
          </Button>
        </div>
      </div>
      <Section
        title={
          mode === "day" ? "Agjenda ditore" : mode === "week" ? "Agjenda javore" : "Agjenda mujore"
        }
        description="Në mobile paraqitet si timeline vertikal; booking engine mbetet i pandryshuar."
      >
        <div className="space-y-4">
          {props.upcoming.length ? (
            props.upcoming.slice(0, mode === "day" ? 8 : 24).map((a) => (
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
  const term = props.search.toLowerCase();
  const rows = props.appointments.filter((a) =>
    `${a.client_first_name} ${a.client_last_name} ${a.client_phone} ${a.client_email} ${a.service_name}`
      .toLowerCase()
      .includes(term),
  );
  return (
    <Section
      title="Të gjitha terminet"
      description={`${rows.length} rezultate · Location dhe source nuk ekzistojnë ende në modelin aktual.`}
      action={
        <Button variant="outline" size="sm">
          <ListFilter className="h-4 w-4" />
          Filtro
        </Button>
      }
    >
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
                  {props.canManage ? <TableHead className="text-right">Veprimet</TableHead> : null}
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
                    {props.canManage ? (
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
                {props.canManage ? <AppointmentActions appointment={a} {...props} /> : null}
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
    </Section>
  );
}

function AppointmentActions({
  appointment,
  setAppointmentStatus,
  updatingAppointmentId,
}: Parameters<typeof WorkspaceView>[0] & { appointment: Appointment }) {
  if (appointment.status !== "PENDING") return null;

  const loading = updatingAppointmentId === appointment.id;
  return (
    <div className="mt-3 flex justify-end gap-2 md:mt-0">
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
    </div>
  );
}

function PatientsView(props: Parameters<typeof WorkspaceView>[0]) {
  const patients = useMemo(() => {
    const map = new Map<
      string,
      { name: string; phone: string; email: string; appointments: Appointment[] }
    >();
    for (const a of props.appointments) {
      const key = a.client_email || a.client_phone;
      const item = map.get(key) ?? {
        name: `${a.client_first_name} ${a.client_last_name}`,
        phone: a.client_phone,
        email: a.client_email,
        appointments: [],
      };
      item.appointments.push(a);
      map.set(key, item);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [props.appointments]);
  return (
    <Section
      title="Pacientët"
      description="Pamje e deduktuar nga appointment-et; nuk krijohet model paralel patients."
    >
      {patients.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {patients.map((p) => {
            const sorted = [...p.appointments].sort((a, b) => b.start_at.localeCompare(a.start_at));
            const latest = sorted[0]!;
            return (
              <div key={p.email || p.phone} className="rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-semibold">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-slate-500">{p.phone}</p>
                      <p className="text-xs text-slate-400">{p.email}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">{p.appointments.length} termine</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
                  <div>
                    <p className="text-slate-400">Vizita e fundit</p>
                    <p className="mt-1 font-medium">{localDay(latest.start_at)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Fizioterapeuti</p>
                    <p className="mt-1 font-medium">
                      {props.physioById.get(latest.physiotherapist_id)?.first_name ?? "—"}
                    </p>
                  </div>
                </div>
              </div>
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
    </Section>
  );
}

function TeamView(props: Parameters<typeof WorkspaceView>[0]) {
  return (
    <Section
      title="Ekipi"
      description="Anëtarët dhe rolet e klinikës"
      action={
        props.canManage ? (
          <Button
            size="sm"
            onClick={() =>
              props.unsupported(
                "Ftesat e ekipit kërkojnë workflow server-side që nuk ekziston ende.",
              )
            }
          >
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
    </Section>
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
  return (
    <Section
      title="Lokacionet"
      description="Stafi caktohet në mënyrë eksplicite; nuk supozohet se punon në çdo lokacion."
      action={
        props.canManage ? (
          <Button
            size="sm"
            onClick={() =>
              props.unsupported(
                "Forma e lokacionit kërkon validim city/region dhe do të shtohet veçmas.",
              )
            }
          >
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
    </Section>
  );
}

function AvailabilityView(props: Parameters<typeof WorkspaceView>[0]) {
  return (
    <div className="space-y-6">
      <Section
        title="Disponueshmëria e klinikës"
        description="Orari clinic-owned mund të menaxhohet nga administratori; booking-u vazhdon të përdorë orarin legacy të fizioterapeutit."
      >
        {props.canManage ? (
          <ClinicContentManager clinicId={props.clinic.id} clinicName={props.clinic.name} />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Vetëm për lexim"
            body="Ndryshimet e orarit të klinikës lejohen vetëm për administratorin."
          />
        )}
      </Section>
      <Section title="Kufizim i njohur">
        <p className="text-sm leading-6 text-slate-600">
          Breaks, blocked times, vacation dhe schedule sipas lokacionit nuk janë ende të lidhura me
          clinic tenant model. Nuk u krijua UI që shkruan në tabela të pasigurta.
        </p>
      </Section>
    </div>
  );
}

function NotificationsView(props: Parameters<typeof WorkspaceView>[0]) {
  return (
    <Section
      title="Qendra e njoftimeve"
      description={`${props.notifications.filter((n) => !n.read_at).length} të palexuara`}
    >
      {props.notifications.length ? (
        <div className="divide-y">
          {props.notifications.map((n) => (
            <div key={n.id} className="flex gap-3 py-4">
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
            </div>
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
      <Section title="Përmbajtja">
        <div className="grid gap-4 md:grid-cols-3">
          {["Përmbajtja & SEO", "Fotot & identiteti", "Ekipi, shërbimet & lokacionet"].map((x) => (
            <button
              key={x}
              onClick={() =>
                props.unsupported("Editimi tenant-aware i website-it kërkon RPC/formë të dedikuar.")
              }
              className="flex items-center justify-between rounded-xl border p-4 text-left font-medium hover:bg-slate-50"
            >
              {x}
              <ChevronRight className="h-4 w-4" />
            </button>
          ))}
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

function SubscriptionView() {
  return (
    <Section title="Abonimi" description="Billing aktual është user-owned, jo clinic-owned.">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Abonimi nuk mund të paraqitet saktë në nivel klinike pa migrimin e billing ownership. Nuk u
        implementua pagesë online ose model paralel.
      </div>
    </Section>
  );
}

function SettingsView(props: Parameters<typeof WorkspaceView>[0]) {
  return (
    <Section title="Cilësimet" description="Të organizuara sipas përgjegjësisë">
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
                props.unsupported("Ky seksion do të lidhet vetëm me API/RLS ekzistuese të sigurta.")
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
  );
}
