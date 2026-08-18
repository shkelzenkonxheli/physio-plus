import {
  AssessIcon,
  BrainIcon,
  FootIcon,
  HandIcon,
  HipIcon,
  KneeIcon,
  LungsIcon,
  MassageIcon,
  MuscleIcon,
  NeckIcon,
  NerveIcon,
  RehabIcon,
  ShoulderIcon,
  SpineIcon,
  StretchIcon,
  ThermoIcon,
  WaterIcon,
  type AnatomyIcon,
} from "@/components/icons/anatomy";

type Rule = { keys: string[]; icon: AnatomyIcon };

/** Keyword -> anatomical icon rules (Albanian service names, diacritics-insensitive). */
const RULES: Rule[] = [
  { keys: ["qaf", "cervik", "koke", "migren"], icon: NeckIcon },
  { keys: ["shpin", "kurriz", "lumb", "disk", "skolioz", "hernie"], icon: SpineIcon },
  { keys: ["gjur", "menisk", "ligament"], icon: KneeIcon },
  { keys: ["shpatull", "krah", "bërryl", "berryl"], icon: ShoulderIcon },
  { keys: ["dor", "kyc i dores", "gishta", "karpal"], icon: HandIcon },
  { keys: ["ije", "kofsh", "legen", "hip"], icon: HipIcon },
  { keys: ["ecje", "kemb", "shput", "themb", "kyc i kembes"], icon: FootIcon },
  { keys: ["operacion", "postoperator", "rehabilitim", "rikuperim", "fraktur"], icon: RehabIcon },
  { keys: ["masazh", "relaks", "terapi manuale", "manual", "limf", "drenazh"], icon: MassageIcon },
  { keys: ["sport", "atlet", "fitnes", "stervit", "ushtrim", "forcim", "muskul"], icon: MuscleIcon },
  { keys: ["neuro", "insult", "parkinson", "skleroz", "tru", "nerv"], icon: BrainIcon },
  { keys: ["elektro", "tens", "magnet", "shock", "vale goditese", "laser"], icon: NerveIcon },
  { keys: ["ultra", "hidro", "uje", "not"], icon: WaterIcon },
  { keys: ["krioterapi", "ftoht", "nxeht", "termo", "parafin"], icon: ThermoIcon },
  { keys: ["kardio", "respirator", "mushkri", "frym"], icon: LungsIcon },
  { keys: ["gjimnastik", "levizshm", "mobiliz", "stretch", "zgjatje", "postur"], icon: StretchIcon },
  { keys: ["konsult", "vlersim", "vleresim", "diagnoz", "kontroll"], icon: AssessIcon },
];

function normalize(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function serviceIcon(name: string, description?: string | null): AnatomyIcon {
  const haystack = normalize(`${name} ${description ?? ""}`);
  for (const rule of RULES) {
    if (rule.keys.some((k) => haystack.includes(normalize(k)))) return rule.icon;
  }
  return StretchIcon;
}
