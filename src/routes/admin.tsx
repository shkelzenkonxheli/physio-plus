import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, LogOut, Pencil, Trash2 } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClinicForm, type ClinicRow } from "@/components/admin/ClinicForm";
import { ClinicContentManager } from "@/components/admin/ClinicContentManager";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PROFILE_STATUS_SQ, translateError, type ProfileStatus } from "@/lib/labels";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Paneli i administratorit | PhysioPlus" },
      { name: "description", content: "Aprovo profilet e fizioterapeutëve dhe menaxho platformën." },
      { property: "og:title", content: "Paneli i administratorit | PhysioPlus" },
      { property: "og:description", content: "Menaxho profilet dhe platformën PhysioPlus." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPanel,
});

const PLAN_SQ: Record<string, string> = { FREE: "Falas", PRO: "Pro", CLINIC: "Klinikë" };
const SUB_STATUS_SQ: Record<string, string> = {
  ACTIVE: "Aktiv",
  TRIALING: "Provë",
  PAST_DUE: "Vonesë pagese",
  CANCELLED: "Anuluar",
  EXPIRED: "Skaduar",
};

function AdminPanel() {
  const { user, loading, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const [editingClinic, setEditingClinic] = useState<ClinicRow | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) void navigate({ to: "/hyr", replace: true });
    else if (!isAdmin) void navigate({ to: "/", replace: true });
  }, [user, isAdmin, loading, navigate]);

  const { data: physios, isLoading } = useQuery({
    queryKey: ["admin-physios"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physiotherapists")
        .select("id, user_id, first_name, last_name, slug, status, created_at, clinic_id, cities(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clinics } = useQuery({
    queryKey: ["admin-clinics"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("id, name, slug, description, address, phone, phone2, whatsapp, email, website, logo_url, header_image_url, active, city_id, cities(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cities } = useQuery({
    queryKey: ["cities-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cities").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subs } = useQuery({
    queryKey: ["admin-subs"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, user_id, status, expires_at, plans(code, name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin-physios"] });
    void qc.invalidateQueries({ queryKey: ["admin-clinics"] });
    void qc.invalidateQueries({ queryKey: ["admin-subs"] });
  }

  async function setStatus(id: string, status: ProfileStatus) {
    const { error } = await supabase.from("physiotherapists").update({ status }).eq("id", id);
    if (error) {
      toast.error(translateError(error));
      return;
    }
    toast.success("Statusi u përditësua.");
    refresh();
  }

  async function deletePhysio(id: string) {
    if (!confirm("Të fshihet ky fizioterapeut përfundimisht?")) return;
    const { error } = await supabase.rpc("admin_delete_physio", { _id: id });
    if (error) {
      toast.error(translateError(error));
      return;
    }
    toast.success("Fizioterapeuti u fshi.");
    refresh();
  }

  async function deleteClinic(id: string) {
    if (!confirm("Të fshihet kjo klinikë?")) return;
    const { error } = await supabase.rpc("admin_delete_clinic", { _id: id });
    if (error) {
      toast.error(translateError(error));
      return;
    }
    toast.success("Klinika u fshi.");
    setEditingClinic(null);
    refresh();
  }

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    void navigate({ to: "/hyr", replace: true });
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => router.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Kthehu
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Dil
          </Button>
        </div>

        <h1 className="mt-6 text-3xl font-bold">Paneli i administratorit</h1>
        <p className="mt-2 text-muted-foreground">
          Menaxho fizioterapeutët, klinikat dhe abonimet e platformës.
        </p>

        <Tabs defaultValue="physios" className="mt-8">
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
            <TabsTrigger value="physios" className="shrink-0 whitespace-nowrap">Fizioterapeutët</TabsTrigger>
            <TabsTrigger value="clinics" className="shrink-0 whitespace-nowrap">Klinikat</TabsTrigger>
            <TabsTrigger value="subs" className="shrink-0 whitespace-nowrap">Abonimet</TabsTrigger>
          </TabsList>

          <TabsContent value="physios" className="mt-6 space-y-6">
            <AddPhysioForm
              cities={cities ?? []}
              clinics={clinics ?? []}
              onDone={refresh}
            />
            {isLoading ? (
              <Skeleton className="h-24 rounded-2xl" />
            ) : physios && physios.length ? (
              <div className="space-y-3">
                {physios.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {p.first_name} {p.last_name}
                      </p>
                      <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">
                        {PROFILE_STATUS_SQ[p.status as ProfileStatus]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      /{p.slug}
                      {p.cities?.name ? ` · ${p.cities.name}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void setStatus(p.id, "APPROVED")}>
                        Aprovo
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void setStatus(p.id, "REJECTED")}>
                        Refuzo
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void setStatus(p.id, "SUSPENDED")}>
                        Suspendo
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void deletePhysio(p.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Fshij
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                Nuk ka profile për shqyrtim.
              </p>
            )}
          </TabsContent>

          <TabsContent value="clinics" className="mt-6 space-y-6">
            {editingClinic ? (
              <>
                <ClinicForm
                  cities={cities ?? []}
                  clinic={editingClinic}
                  onDone={refresh}
                  onCancel={() => setEditingClinic(null)}
                />
                <ClinicContentManager clinicId={editingClinic.id} clinicName={editingClinic.name} />
              </>
            ) : (
              <ClinicForm cities={cities ?? []} onDone={refresh} />
            )}
            {clinics && clinics.length ? (
              <div className="space-y-3">
                {clinics.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{c.name}</p>
                      <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">
                        {c.active ? "Aktive" : "Joaktive"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      /{c.slug}
                      {c.cities?.name ? ` · ${c.cities.name}` : ""}
                      {c.address ? ` · ${c.address}` : ""}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingClinic(editingClinic?.id === c.id ? null : (c as ClinicRow));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        {editingClinic?.id === c.id ? "Mbyll" : "Menaxho"}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void deleteClinic(c.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Fshij
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                Nuk ka klinika të regjistruara.
              </p>
            )}
          </TabsContent>

          <TabsContent value="subs" className="mt-6 space-y-3">
            {physios && physios.length ? (
              physios.map((p) => (
                <SubscriptionRow
                  key={p.id}
                  physioId={p.id}
                  name={`${p.first_name} ${p.last_name}`}
                  current={subs?.find((s) => s.user_id === p.user_id) ?? null}
                  onDone={refresh}
                />
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                Nuk ka fizioterapeutë.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </SiteLayout>
  );
}

function AddPhysioForm({
  cities,
  clinics,
  onDone,
}: {
  cities: { id: string; name: string }[];
  clinics: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [clinicId, setClinicId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { error } = await supabase.rpc("admin_create_physio", {
      _email: email,
      _first_name: first,
      _last_name: last,
      _city_id: cityId || null,
      _clinic_id: clinicId || null,
      _phone: phone || null,
    } as never);
    setBusy(false);
    if (error) {
      const msg = error.message.includes("USER_NOT_FOUND")
        ? "Nuk u gjet përdorues me këtë email. Ai duhet të regjistrohet së pari."
        : error.message.includes("PHYSIO_EXISTS")
          ? "Ky përdorues ka tashmë një profil fizioterapeuti."
          : translateError(error);
      toast.error(msg);
      return;
    }
    toast.success("Fizioterapeuti u shtua.");
    setEmail("");
    setFirst("");
    setLast("");
    setPhone("");
    onDone();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="font-semibold">Shto fizioterapeut</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Përdoruesi duhet të jetë regjistruar më parë me këtë email.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="p-email">Email i përdoruesit</Label>
          <Input id="p-email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="p-phone">Telefoni</Label>
          <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="p-first">Emri</Label>
          <Input id="p-first" value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="p-last">Mbiemri</Label>
          <Input id="p-last" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
        <div>
          <Label>Qyteti</Label>
          <Select value={cityId} onValueChange={setCityId}>
            <SelectTrigger>
              <SelectValue placeholder="Zgjidh qytetin" />
            </SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Klinika (opsionale)</Label>
          <Select value={clinicId} onValueChange={setClinicId}>
            <SelectTrigger>
              <SelectValue placeholder="Pa klinikë" />
            </SelectTrigger>
            <SelectContent>
              {clinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button className="mt-4" disabled={busy || !email || !first || !last} onClick={() => void submit()}>
        Shto fizioterapeutin
      </Button>
    </div>
  );
}

function SubscriptionRow({
  physioId,
  name,
  current,
  onDone,
}: {
  physioId: string;
  name: string;
  current: { status: string; expires_at: string | null; plans: { code: string; name: string } | null } | null;
  onDone: () => void;
}) {
  const [plan, setPlan] = useState(current?.plans?.code ?? "FREE");
  const [status, setStatus] = useState(current?.status ?? "ACTIVE");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_subscription", {
      _physio_id: physioId,
      _plan_code: plan,
      _status: status as "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "EXPIRED",
      _expires_at: null,
    } as never);
    setBusy(false);
    if (error) {
      toast.error(translateError(error));
      return;
    }
    toast.success("Abonimi u ruajt.");
    onDone();
  }

  async function remove() {
    if (!confirm("Të fshihet abonimi i këtij fizioterapeuti?")) return;
    const { error } = await supabase.rpc("admin_delete_subscription", { _physio_id: physioId });
    if (error) {
      toast.error(translateError(error));
      return;
    }
    toast.success("Abonimi u fshi.");
    onDone();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{name}</p>
        <span className="text-sm text-muted-foreground">
          {current
            ? `${PLAN_SQ[current.plans?.code ?? ""] ?? current.plans?.name} · ${SUB_STATUS_SQ[current.status] ?? current.status}`
            : "Pa abonim"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Label>Plani</Label>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PLAN_SQ).map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Label>Statusi</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SUB_STATUS_SQ).map(([code, label]) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          Ruaj abonimin
        </Button>
        {current ? (
          <Button size="sm" variant="destructive" onClick={() => void remove()}>
            <Trash2 className="mr-2 h-4 w-4" /> Fshij abonimin
          </Button>
        ) : null}
      </div>
    </div>
  );
}
