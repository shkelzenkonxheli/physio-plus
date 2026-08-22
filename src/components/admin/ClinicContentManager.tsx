import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";
import { translateError } from "@/lib/labels";

const db = supabase as unknown as {
  // Generated types will include these RPCs after the production migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, args: Record<string, unknown>) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  duration_minutes: number;
  category_id: string | null;
  active: boolean;
  public_visible: boolean;
};
type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};

export function ClinicContentManager({
  clinicId,
  currentPhysioId,
}: {
  clinicId: string;
  currentPhysioId: string | null;
}) {
  const queryClient = useQueryClient();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState(0);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryActive, setCategoryActive] = useState(true);
  const [service, setService] = useState({
    name: "",
    description: "",
    price: "",
    duration: "45",
    categoryId: "",
    currency: "EUR",
    active: true,
    publicVisible: true,
  });
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useQuery<CategoryRow[]>({
    queryKey: ["clinic", "categories", clinicId],
    queryFn: async () => {
      const { data, error } = await db
        .from("clinic_service_categories")
        .select("id,name,description,sort_order,active")
        .eq("clinic_id", clinicId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    data: services = [],
    isLoading: servicesLoading,
    error: servicesError,
  } = useQuery<ServiceRow[]>({
    queryKey: ["clinic", "services", clinicId],
    queryFn: async () => {
      const { data, error } = await db
        .from("clinic_services")
        .select(
          "id,name,description,price,currency,duration_minutes,category_id,active,public_visible",
        )
        .eq("clinic_id", clinicId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["clinic", "categories", clinicId] }),
      queryClient.invalidateQueries({ queryKey: ["clinic", "services", clinicId] }),
      queryClient.invalidateQueries({ queryKey: ["clinic-workspace-services", clinicId] }),
      queryClient.invalidateQueries({ queryKey: ["clinic-bookable-assignments", clinicId] }),
    ]);
  }

  async function addCategory() {
    if (categoryName.trim().length < 2) return;
    setBusy(true);
    const wasEditing = Boolean(editingCategoryId);
    let error: { message?: string } | null = null;
    if (editingCategoryId) {
      ({ error } = await db.rpc("update_my_clinic_service_category", {
        _clinic_id: clinicId,
        _category_id: editingCategoryId,
        _name: categoryName.trim(),
        _description: categoryDescription,
        _sort_order: categorySortOrder,
        _active: categoryActive,
      }));
    } else {
      const created = await db.rpc("create_my_clinic_service_category", {
        _clinic_id: clinicId,
        _name: categoryName.trim(),
      });
      error = created.error;
      if (!error && created.data && categoryDescription.trim()) {
        ({ error } = await db.rpc("update_my_clinic_service_category", {
          _clinic_id: clinicId,
          _category_id: created.data,
          _name: categoryName.trim(),
          _description: categoryDescription,
          _sort_order: categorySortOrder,
          _active: true,
        }));
      }
    }
    setBusy(false);
    if (error) {
      toast.error(translateError(error));
      return;
    }
    setCategoryName("");
    setCategoryDescription("");
    setCategorySortOrder(0);
    setEditingCategoryId(null);
    setCategoryActive(true);
    setCategoryOpen(false);
    await refresh();
    toast.success(wasEditing ? "Kategoria u përditësua." : "Kategoria u shtua.");
  }

  async function addService() {
    const duration = Number(service.duration);
    const price = Number(service.price);
    if (
      service.name.trim().length < 2 ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(duration) ||
      duration < 5 ||
      duration > 480
    ) {
      toast.error("Kontrollo emrin, çmimin dhe kohëzgjatjen e shërbimit.");
      return;
    }
    setBusy(true);
    const wasEditing = Boolean(editingServiceId);
    let error: { message?: string } | null = null;
    if (editingServiceId) {
      ({ error } = await db.rpc("update_my_clinic_service", {
        _clinic_id: clinicId,
        _service_id: editingServiceId,
        _category_id: service.categoryId || null,
        _name: service.name.trim(),
        _description: service.description,
        _price: price,
        _currency: service.currency,
        _duration_minutes: duration,
        _active: service.active,
        _public_visible: service.publicVisible,
      }));
    } else {
      const created = await db.rpc("create_my_clinic_service", {
        _clinic_id: clinicId,
        _clinic_category_id: service.categoryId || null,
        _name: service.name.trim(),
        _price: price,
        _duration_minutes: duration,
      });
      error = created.error;
      if (!error && created.data) {
        ({ error } = await db.rpc("update_my_clinic_service", {
          _clinic_id: clinicId,
          _service_id: created.data,
          _category_id: service.categoryId || null,
          _name: service.name.trim(),
          _description: service.description,
          _price: price,
          _currency: service.currency,
          _duration_minutes: duration,
          _active: service.active,
          _public_visible: service.publicVisible,
        }));
      }
    }
    setBusy(false);
    if (error) {
      toast.error(translateError(error));
      return;
    }
    setService({
      name: "",
      description: "",
      price: "",
      duration: "45",
      categoryId: "",
      currency: "EUR",
      active: true,
      publicVisible: true,
    });
    setEditingServiceId(null);
    setServiceOpen(false);
    await refresh();
    toast.success(
      wasEditing ? "Shërbimi u përditësua." : `Shërbimi u shtua me kohëzgjatje ${duration} minuta.`,
    );
  }

  async function setServiceActive(serviceId: string, active: boolean) {
    setBusy(true);
    const { error } = await db.rpc("set_my_clinic_service_active", {
      _clinic_id: clinicId,
      _clinic_service_id: serviceId,
      _active: active,
    });
    setBusy(false);
    if (error) {
      toast.error(translateError(error));
      return;
    }
    await refresh();
    toast.success(active ? "Shërbimi u aktivizua." : "Shërbimi u çaktivizua.");
  }

  return (
    <div className="space-y-5">
      {categoriesError || servicesError ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          Shërbimet nuk u ngarkuan plotësisht nga databaza.
        </p>
      ) : null}
      {!currentPhysioId ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Për të krijuar një shërbim të rezervueshëm, administratori duhet të ketë profil
          fizioterapeuti në këtë klinikë.
        </p>
      ) : null}

      <section className="rounded-2xl border bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-semibold">Kategoritë</h3>
            <p className="text-sm text-muted-foreground">{categories.length} kategori</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!currentPhysioId}
            onClick={() => {
              setEditingCategoryId(null);
              setCategoryName("");
              setCategoryDescription("");
              setCategorySortOrder(categories.length);
              setCategoryActive(true);
              setCategoryOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Shto kategori
          </Button>
        </div>
        <div className="divide-y">
          {categoriesLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Duke ngarkuar…</p>
          ) : categories.length ? (
            categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {services.filter((item) => item.category_id === category.id).length} shërbime
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={category.active ? "secondary" : "outline"}>
                    {category.active ? "Aktive" : "Joaktive"}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditingCategoryId(category.id);
                      setCategoryName(category.name);
                      setCategoryDescription(category.description ?? "");
                      setCategorySortOrder(category.sort_order);
                      setCategoryActive(category.active);
                      setCategoryOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Ndrysho kategorinë</span>
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Ende nuk ka kategori.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h3 className="font-semibold">Shërbimet</h3>
            <p className="text-sm text-muted-foreground">
              Çmimi dhe kohëzgjatja që përdoren në rezervim
            </p>
          </div>
          <Button
            size="sm"
            disabled={!currentPhysioId}
            onClick={() => {
              setEditingServiceId(null);
              setService({
                name: "",
                description: "",
                price: "",
                duration: "45",
                categoryId: "",
                currency: "EUR",
                active: true,
                publicVisible: true,
              });
              setServiceOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Shto shërbim
          </Button>
        </div>
        {servicesLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Duke ngarkuar…</p>
        ) : services.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[900px] table-fixed">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Shërbimi</TableHead>
                  <TableHead>Kategoria</TableHead>
                  <TableHead>Çmimi</TableHead>
                  <TableHead>Kohëzgjatja</TableHead>
                  <TableHead>Statusi</TableHead>
                  <TableHead className="text-center">Veprime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((item) => (
                  <TableRow key={item.id} className={!item.active ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      {categories.find((category) => category.id === item.category_id)?.name ??
                        "Pa kategori"}
                    </TableCell>
                    <TableCell>{formatPrice(Number(item.price))}</TableCell>
                    <TableCell>{item.duration_minutes} min</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={item.active}
                          disabled={busy || !currentPhysioId}
                          onCheckedChange={(active) => void setServiceActive(item.id, active)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {item.active ? "Aktiv" : "Joaktiv"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditingServiceId(item.id);
                          setService({
                            name: item.name,
                            description: item.description ?? "",
                            price: String(item.price),
                            duration: String(item.duration_minutes),
                            categoryId: item.category_id ?? "",
                            currency: item.currency,
                            active: item.active,
                            publicVisible: item.public_visible,
                          });
                          setServiceOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Ndrysho shërbimin</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Ende nuk ka shërbime.</p>
        )}
      </section>

      <Dialog
        open={categoryOpen}
        onOpenChange={(open) => {
          setCategoryOpen(open);
          if (!open) setEditingCategoryId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategoryId ? "Ndrysho kategorinë" : "Shto kategori"}</DialogTitle>
            <DialogDescription>Kategoritë përdoren për organizimin e shërbimeve.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="clinic-category-name">Emri i kategorisë</Label>
            <Input
              id="clinic-category-name"
              autoFocus
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addCategory();
              }}
            />
          </div>
          <div>
            <Label htmlFor="clinic-category-description">Përshkrimi</Label>
            <Input
              id="clinic-category-description"
              value={categoryDescription}
              onChange={(event) => setCategoryDescription(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="clinic-category-sort">Renditja</Label>
            <Input
              id="clinic-category-sort"
              type="number"
              min="0"
              value={categorySortOrder}
              onChange={(event) => setCategorySortOrder(Number(event.target.value) || 0)}
            />
          </div>
          {editingCategoryId ? (
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
              Kategoria aktive
              <Switch checked={categoryActive} onCheckedChange={setCategoryActive} />
            </label>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryOpen(false)}>
              Anulo
            </Button>
            <Button
              disabled={busy || categoryName.trim().length < 2}
              onClick={() => void addCategory()}
            >
              {editingCategoryId ? "Ruaj ndryshimet" : "Shto kategorinë"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={serviceOpen}
        onOpenChange={(open) => {
          setServiceOpen(open);
          if (!open) setEditingServiceId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingServiceId ? "Ndrysho shërbimin" : "Shto shërbim"}</DialogTitle>
            <DialogDescription>
              Kohëzgjatja përcakton automatikisht fundin e terminit dhe slotet e lira për klientin.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="clinic-service-name">Emri</Label>
              <Input
                id="clinic-service-name"
                autoFocus
                value={service.name}
                onChange={(event) => setService({ ...service, name: event.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="clinic-service-description">Përshkrimi</Label>
              <Input
                id="clinic-service-description"
                value={service.description}
                onChange={(event) => setService({ ...service, description: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="clinic-service-price">Çmimi (EUR)</Label>
              <Input
                id="clinic-service-price"
                type="number"
                min="0"
                step="0.01"
                value={service.price}
                onChange={(event) => setService({ ...service, price: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="clinic-service-currency">Valuta</Label>
              <Input
                id="clinic-service-currency"
                maxLength={3}
                value={service.currency}
                onChange={(event) =>
                  setService({ ...service, currency: event.target.value.toUpperCase() })
                }
              />
            </div>
            <div>
              <Label htmlFor="clinic-service-duration">Kohëzgjatja (minuta)</Label>
              <Input
                id="clinic-service-duration"
                type="number"
                min="5"
                max="480"
                step="5"
                value={service.duration}
                onChange={(event) => setService({ ...service, duration: event.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Shembull: 45 minuta = termini përfundon 45 minuta pas fillimit.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label>Kategoria</Label>
              <Select
                value={service.categoryId || "__none"}
                onValueChange={(value) =>
                  setService({ ...service, categoryId: value === "__none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Pa kategori</SelectItem>
                  {categories
                    .filter((category) => category.active)
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
              Aktiv për klinikën
              <Switch
                checked={service.active}
                onCheckedChange={(active) => setService({ ...service, active })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
              I dukshëm për rezervim publik
              <Switch
                checked={service.publicVisible}
                onCheckedChange={(publicVisible) => setService({ ...service, publicVisible })}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceOpen(false)}>
              Anulo
            </Button>
            <Button
              disabled={
                busy ||
                service.name.trim().length < 2 ||
                service.price === "" ||
                service.duration === ""
              }
              onClick={() => void addService()}
            >
              {editingServiceId ? "Ruaj ndryshimet" : "Shto shërbimin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
