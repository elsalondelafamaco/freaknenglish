import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { promosApi } from "@/lib/api/endpoints";
import { capturarAtribucion, leerAtribucion, type Atribucion } from "@/lib/atribucion";

/**
 * Promos vigentes para quien visita, según el enlace con el que llegó.
 *
 * La atribución vive en localStorage, que en el servidor no existe: se lee
 * DESPUÉS de montar para que el HTML del servidor y el primer render del
 * cliente coincidan (sin promos), y luego la consulta ya lleva el enlace.
 */
export function usePromos() {
  const [atribucion, setAtribucion] = useState<Atribucion | null>(null);
  const [listo, setListo] = useState(false);
  useEffect(() => {
    // Los efectos de los hijos corren antes que los del layout raíz: sin esto,
    // quien aterriza con ?promo= leería el almacenamiento antes de que se guarde.
    capturarAtribucion();
    setAtribucion(leerAtribucion());
    setListo(true);
  }, []);
  const q = useQuery({
    queryKey: ["promos", atribucion],
    queryFn: () => promosApi.publicas(atribucion),
    enabled: listo,
    staleTime: 60_000,
    // Las promos son un extra: si falla la consulta, el sitio sigue con precio de lista.
    retry: 1,
  });
  // `cargado`: ya se sabe si hay promos (o la consulta falló). Sirve para no
  // medir en el píxel un valor que aún no incluye el descuento.
  return { promos: q.data, atribucion, cargado: q.isSuccess || q.isError };
}
