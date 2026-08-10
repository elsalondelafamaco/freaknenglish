import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Input de teléfono con selector de país (bandera + prefijo, buscable).
 * Valor emitido: `+<prefijo><numero>` (ej. +573012646770).
 */
export type Country = { code: string; name: string; dial: string; flag: string; min: number; max: number };

export const COUNTRIES: Country[] = [
  { code: "CO", name: "Colombia", dial: "57", flag: "🇨🇴", min: 10, max: 10 },
  { code: "MX", name: "México", dial: "52", flag: "🇲🇽", min: 10, max: 10 },
  { code: "AR", name: "Argentina", dial: "54", flag: "🇦🇷", min: 10, max: 11 },
  { code: "PE", name: "Perú", dial: "51", flag: "🇵🇪", min: 9, max: 9 },
  { code: "CL", name: "Chile", dial: "56", flag: "🇨🇱", min: 9, max: 9 },
  { code: "EC", name: "Ecuador", dial: "593", flag: "🇪🇨", min: 9, max: 9 },
  { code: "VE", name: "Venezuela", dial: "58", flag: "🇻🇪", min: 10, max: 10 },
  { code: "BO", name: "Bolivia", dial: "591", flag: "🇧🇴", min: 8, max: 8 },
  { code: "PY", name: "Paraguay", dial: "595", flag: "🇵🇾", min: 9, max: 9 },
  { code: "UY", name: "Uruguay", dial: "598", flag: "🇺🇾", min: 8, max: 9 },
  { code: "BR", name: "Brasil", dial: "55", flag: "🇧🇷", min: 10, max: 11 },
  { code: "PA", name: "Panamá", dial: "507", flag: "🇵🇦", min: 8, max: 8 },
  { code: "CR", name: "Costa Rica", dial: "506", flag: "🇨🇷", min: 8, max: 8 },
  { code: "GT", name: "Guatemala", dial: "502", flag: "🇬🇹", min: 8, max: 8 },
  { code: "HN", name: "Honduras", dial: "504", flag: "🇭🇳", min: 8, max: 8 },
  { code: "SV", name: "El Salvador", dial: "503", flag: "🇸🇻", min: 8, max: 8 },
  { code: "NI", name: "Nicaragua", dial: "505", flag: "🇳🇮", min: 8, max: 8 },
  { code: "DO", name: "Rep. Dominicana", dial: "1809", flag: "🇩🇴", min: 7, max: 7 },
  { code: "PR", name: "Puerto Rico", dial: "1787", flag: "🇵🇷", min: 7, max: 7 },
  { code: "CU", name: "Cuba", dial: "53", flag: "🇨🇺", min: 8, max: 8 },
  { code: "US", name: "Estados Unidos", dial: "1", flag: "🇺🇸", min: 10, max: 10 },
  { code: "CA", name: "Canadá", dial: "1", flag: "🇨🇦", min: 10, max: 10 },
  { code: "ES", name: "España", dial: "34", flag: "🇪🇸", min: 9, max: 9 },
  { code: "GB", name: "Reino Unido", dial: "44", flag: "🇬🇧", min: 10, max: 10 },
  { code: "DE", name: "Alemania", dial: "49", flag: "🇩🇪", min: 10, max: 11 },
  { code: "FR", name: "Francia", dial: "33", flag: "🇫🇷", min: 9, max: 9 },
  { code: "IT", name: "Italia", dial: "39", flag: "🇮🇹", min: 9, max: 10 },
  { code: "PT", name: "Portugal", dial: "351", flag: "🇵🇹", min: 9, max: 9 },
  { code: "AU", name: "Australia", dial: "61", flag: "🇦🇺", min: 9, max: 9 },
];

/** Minúsculas y sin tildes: la gente busca "mexico", "peru", "espana". */
const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Separa un valor tipo +573001234567 en país + número local. */
export function parsePhone(value: string | undefined | null): { country: Country; local: string } {
  const v = (value ?? "").replace(/[^\d+]/g, "");
  if (v.startsWith("+")) {
    const digits = v.slice(1);
    // El prefijo más largo que matchee (1787 antes que 1).
    const match = [...COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => digits.startsWith(c.dial));
    if (match) return { country: match, local: digits.slice(match.dial.length) };
  }
  return { country: COUNTRIES[0], local: v.replace(/\D/g, "") };
}

export function validatePhone(value: string | undefined | null): string | null {
  const { country, local } = parsePhone(value);
  if (!local) return "Ingresa tu número de teléfono";
  if (local.length < country.min || local.length > country.max) {
    return country.min === country.max
      ? `El número de ${country.name} debe tener ${country.min} dígitos`
      : `El número de ${country.name} debe tener entre ${country.min} y ${country.max} dígitos`;
  }
  return null;
}

/**
 * Bandera como imagen (flagcdn) — los emoji de bandera no se renderizan en
 * Windows/Chrome. Fallback al emoji si la imagen no carga.
 */
function Flag({ country }: { country: Country }) {
  const [failed, setFailed] = useState(false);
  // DO/PR usan prefijos compuestos (1809/1787): el código ISO va en minúscula.
  const iso = country.code.toLowerCase();
  if (failed) return <span className="text-base leading-none">{country.flag}</span>;
  return (
    <img
      src={`https://flagcdn.com/w20/${iso}.png`}
      srcSet={`https://flagcdn.com/w40/${iso}.png 2x`}
      width={20}
      height={14}
      alt={country.name}
      className="rounded-[2px]"
      onError={() => setFailed(true)}
    />
  );
}

export function PhoneInput({
  value,
  onChange,
  id,
  required,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const parsed = useMemo(() => parsePhone(value), [value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // El país vive acá y no sólo dentro de `value`. Con el número vacío emitimos
  // "" para que el formulario lo tome como incompleto, y ese "" no puede
  // cargar ningún prefijo: si el país se dedujera únicamente de `value`,
  // elegirlo antes de escribir el número lo devolvía siempre a Colombia. Y ése
  // es justo el orden en que la gente lo usa — primero el indicativo, después
  // el número — así que de afuera parecía que el selector no dejaba cambiarlo.
  const [country, setCountry] = useState<Country>(parsed.country);

  // Cuando el número entra ya con prefijo desde afuera (perfil guardado,
  // checkout precargado) mandamos ése. Comparamos por `dial` y no por `code`
  // para no pisar la elección entre países que comparten prefijo: US y CA son
  // los dos +1, y `parsePhone` siempre devuelve el primero.
  useEffect(() => {
    if (parsed.local && parsed.country.dial !== country.dial) setCountry(parsed.country);
  }, [parsed.local, parsed.country, country.dial]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const texto = plano(query.trim());
  const digitos = query.replace(/\D/g, "");
  const filtered = COUNTRIES.filter(
    (c) =>
      plano(c.name).includes(texto) ||
      // El prefijo sólo cuenta si escribieron números. Antes iba sin esta
      // guarda y `dial.includes("")` daba true para todos los países: al
      // buscar por nombre la lista nunca se filtraba y quedaba entera.
      (digitos !== "" && c.dial.includes(digitos)),
  );

  const emit = (country: Country, local: string) => {
    onChange(local ? `+${country.dial}${local}` : "");
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className={cn(
        "flex overflow-hidden rounded-xl border border-brand-line bg-white focus-within:border-brand-ink",
        disabled ? "opacity-60" : "",
      )}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setOpen((v) => !v); setQuery(""); }}
          className="flex shrink-0 items-center gap-1.5 border-r border-brand-line bg-brand-cream/40 px-3 py-2.5 text-sm transition hover:bg-brand-cream"
          aria-label="Seleccionar país"
        >
          <Flag country={country} />
          <span className="text-xs font-semibold text-brand-ink/70">+{country.dial}</span>
          <ChevronDown className="size-3.5 text-brand-ink/50" />
        </button>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
          disabled={disabled}
          value={parsed.local}
          onChange={(e) => emit(country, e.target.value.replace(/\D/g, "").slice(0, country.max))}
          placeholder={"3001234567".slice(0, country.max)}
          className="w-full px-3 py-2.5 text-sm text-brand-ink outline-none"
        />
      </div>

      {open ? (
        <div className="absolute z-50 mt-1 w-72 rounded-2xl border border-brand-line bg-white p-2 shadow-lg">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-brand-ink/40" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar país o prefijo…"
              className="w-full rounded-xl border border-brand-line py-2 pl-8 pr-3 text-xs focus:border-brand-ink focus:outline-none"
            />
          </div>
          <ul className="mt-1 max-h-56 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => { setCountry(c); emit(c, parsed.local); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-brand-cream/50",
                    c.code === country.code ? "bg-brand-cream/70 font-semibold" : "",
                  )}
                >
                  <Flag country={c} />
                  <span className="flex-1 truncate text-brand-ink">{c.name}</span>
                  <span className="text-xs text-brand-ink/55">+{c.dial}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-2.5 py-3 text-center text-xs text-brand-ink/50">Sin resultados</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
