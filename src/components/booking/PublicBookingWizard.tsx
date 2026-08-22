import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatLongDate, formatPrice, formatTime, toDateKey } from "@/lib/format";
import { serviceIcon } from "@/lib/service-icons";

type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  currency: string;
};
type Group = { id: string; name: string; items: Service[] };
type Practitioner = {
  id: string;
  first_name: string;
  last_name: string;
  professional_title: string | null;
  photo_url: string | null;
};
type Location = { id: string; name: string; address: string | null };
type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
};
type Confirmation = {
  start: string;
  serviceName: string;
  practitionerName: string;
  locationName: string;
};

export function PublicBookingWizard(props: {
  groups: Group[];
  catalogLoading: boolean;
  service: Service | null;
  selectService: (id: string) => void;
  practitioners: Practitioner[];
  practitionersLoading: boolean;
  practitionerChoice: string | "any" | null;
  selectPractitioner: (id: string | "any") => void;
  locations: Location[];
  locationsLoading: boolean;
  locationId: string | null;
  selectLocation: (id: string) => void;
  workingDays: number[];
  closedDates: string[];
  date: string;
  selectDate: (date: string) => void;
  slots: string[];
  slotsLoading: boolean;
  slot: string | null;
  selectSlot: (slot: string) => void;
  form: FormData;
  setForm: (form: FormData) => void;
  errors: Record<string, string>;
  submitting: boolean;
  submit: (event: React.FormEvent) => void;
  confirmed: Confirmation | null;
}) {
  const [step, setStep] = useState(1);
  const hasLocationStep = props.locations.length > 1;
  const dateStep = hasLocationStep ? 4 : 3;
  const detailsStep = hasLocationStep ? 5 : 4;
  const totalSteps = hasLocationStep ? 5 : 4;
  const dates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const value = new Date();
        value.setHours(12, 0, 0, 0);
        value.setDate(value.getDate() + index);
        return value;
      }),
    [],
  );

  if (props.confirmed)
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto flex max-w-lg flex-col items-center px-5 pt-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-600 text-white">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-7 text-2xl font-bold">Rezervimi u konfirmua!</h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
            Kërkesa u pranua. {props.confirmed.practitionerName} do t'ju presë më{" "}
            {formatLongDate(props.confirmed.start)} në {formatTime(props.confirmed.start)}.
          </p>
          <div className="mt-7 w-full rounded-xl bg-white p-4 text-left text-sm shadow-sm">
            <Summary label="Shërbimi" value={props.confirmed.serviceName} />
            <Summary label="Profesionisti" value={props.confirmed.practitionerName} />
            <Summary label="Lokacioni" value={props.confirmed.locationName} />
          </div>
          <Button asChild variant="outline" className="mt-7 w-full">
            <a href="/">Kthehu në ballinë</a>
          </Button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-xl flex-col px-5 py-8">
        <div className="mx-auto flex w-full max-w-sm gap-3">
          {Array.from({ length: totalSteps }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-1 flex-1 rounded-full",
                index < step ? "bg-teal-700" : "bg-slate-200",
              )}
            />
          ))}
        </div>
        <div className="mt-5 flex-1">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((value) => Math.max(1, value - 1))}
              className="mb-4 flex items-center gap-1 text-sm font-medium"
            >
              <ChevronLeft className="h-4 w-4" />
              Kthehu
            </button>
          ) : null}

          {step === 1 ? (
            <Step title="Zgjidh shërbimin">
              {props.catalogLoading ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : (
                props.groups.map((group) => (
                  <div key={group.id} className="mb-5">
                    {props.groups.length > 1 ? (
                      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                        {group.name}
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      {group.items.map((item) => {
                        const Icon = serviceIcon(item.name, item.description);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => props.selectService(item.id)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm",
                              props.service?.id === item.id &&
                                "border-teal-700 ring-1 ring-teal-700",
                            )}
                          >
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">{item.name}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {item.duration_minutes} min
                                {item.description ? ` · ${item.description}` : ""}
                              </span>
                            </span>
                            <span className="text-sm font-semibold">
                              {formatPrice(item.price, item.currency)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </Step>
          ) : null}

          {step === 2 ? (
            <Step title="Zgjidh profesionistin">
              {props.practitionersLoading ? (
                <Skeleton className="h-36 rounded-xl" />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {props.practitioners.length > 1 ? (
                    <PractitionerCard
                      selected={props.practitionerChoice === "any"}
                      name="Cilido i lirë"
                      onClick={() => props.selectPractitioner("any")}
                    />
                  ) : null}
                  {props.practitioners.map((item) => (
                    <PractitionerCard
                      key={item.id}
                      selected={props.practitionerChoice === item.id}
                      name={`${item.first_name} ${item.last_name}`}
                      image={item.photo_url}
                      onClick={() => props.selectPractitioner(item.id)}
                    />
                  ))}
                </div>
              )}
            </Step>
          ) : null}

          {step === 3 && hasLocationStep ? (
            <Step title="Zgjidh lokacionin">
              <div className="space-y-2">
                {props.locations.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => props.selectLocation(location.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border bg-white p-4 text-left",
                      props.locationId === location.id && "border-teal-700 ring-1 ring-teal-700",
                    )}
                  >
                    <MapPin className="h-5 w-5 text-teal-700" />
                    <span>
                      <span className="block font-semibold">{location.name}</span>
                      <span className="text-sm text-slate-500">{location.address}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Step>
          ) : null}

          {step === dateStep ? (
            <Step title="Zgjidh datën dhe orën">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                Datat e ardhshme
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {dates.map((choice) => {
                  const key = toDateKey(choice);
                  const enabled =
                    props.workingDays.includes(choice.getDay()) && !props.closedDates.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!enabled}
                      onClick={() => props.selectDate(key)}
                      className={cn(
                        "rounded-xl border bg-white px-1 py-2 text-center disabled:opacity-35",
                        props.date === key && "border-teal-700 bg-teal-700 text-white",
                      )}
                    >
                      <span className="block text-[10px]">
                        {choice.toLocaleDateString("sq-AL", { weekday: "short" })}
                      </span>
                      <span className="block text-base font-bold">{choice.getDate()}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mb-2 mt-6 text-xs font-semibold uppercase text-slate-500">
                Orët e lira
              </p>
              {props.slotsLoading ? (
                <Skeleton className="h-24 rounded-xl" />
              ) : props.slots.length ? (
                <div className="grid grid-cols-3 gap-2">
                  {props.slots.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => props.selectSlot(item)}
                      className={cn(
                        "rounded-lg border bg-white py-2 text-sm font-medium",
                        props.slot === item && "border-teal-700 bg-teal-700 text-white",
                      )}
                    >
                      {formatTime(item)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-5 text-sm text-slate-500">
                  Nuk ka orare të lira për këtë datë.
                </p>
              )}
            </Step>
          ) : null}

          {step === detailsStep && props.service && props.slot ? (
            <Step title="Të dhënat tuaja">
              <div className="mb-5 rounded-xl bg-white p-4 text-sm shadow-sm">
                <p className="font-semibold">Përmbledhja e terminit</p>
                <p className="mt-1 text-slate-500">
                  {props.service.name} · {formatLongDate(props.slot)} në {formatTime(props.slot)}
                </p>
              </div>
              <form id="patient-booking-form" onSubmit={props.submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="firstName"
                    label="Emri"
                    value={props.form.firstName}
                    error={props.errors["firstName"]}
                    onChange={(value) => props.setForm({ ...props.form, firstName: value })}
                  />
                  <Field
                    id="lastName"
                    label="Mbiemri"
                    value={props.form.lastName}
                    error={props.errors["lastName"]}
                    onChange={(value) => props.setForm({ ...props.form, lastName: value })}
                  />
                </div>
                <Field
                  id="phone"
                  label="Telefoni (WhatsApp)"
                  value={props.form.phone}
                  error={props.errors["phone"]}
                  onChange={(value) => props.setForm({ ...props.form, phone: value })}
                />
                <Field
                  id="email"
                  label="Email"
                  type="email"
                  value={props.form.email}
                  error={props.errors["email"]}
                  onChange={(value) => props.setForm({ ...props.form, email: value })}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="message">Shënim i shkurtër (opsional)</Label>
                  <Textarea
                    id="message"
                    value={props.form.message}
                    onChange={(event) =>
                      props.setForm({ ...props.form, message: event.target.value })
                    }
                    placeholder="Arsyeja e vizitës..."
                    className="min-h-24"
                  />
                </div>
              </form>
            </Step>
          ) : null}
        </div>

        <div className="sticky bottom-0 mt-6 bg-slate-50 py-3">
          {step < detailsStep ? (
            <Button
              className="w-full bg-teal-700 hover:bg-teal-800"
              disabled={
                (step === 1 && !props.service) ||
                (step === 2 && !props.practitionerChoice) ||
                (step === 3 && hasLocationStep && !props.locationId) ||
                (step === dateStep && !props.slot) ||
                props.locationsLoading
              }
              onClick={() => setStep((value) => value + 1)}
            >
              Vazhdo <span className="ml-2">→</span>
            </Button>
          ) : (
            <Button
              form="patient-booking-form"
              type="submit"
              className="w-full bg-teal-700 hover:bg-teal-800"
              disabled={props.submitting}
            >
              {props.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Konfirmo
              rezervimin
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="mb-5 text-xl font-bold">{title}</h1>
      {children}
    </section>
  );
}
function PractitionerCard({
  selected,
  name,
  image,
  onClick,
}: {
  selected: boolean;
  name: string;
  image?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-28 flex-col items-center justify-center rounded-xl border bg-white p-3 text-center shadow-sm",
        selected && "border-teal-700 ring-1 ring-teal-700",
      )}
    >
      <span className="mb-2 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-teal-50 text-teal-700">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <CalendarDays className="h-5 w-5" />
        )}
      </span>
      <span className="text-sm font-semibold">{name}</span>
    </button>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
