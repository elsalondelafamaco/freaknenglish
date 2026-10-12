import { useEffect, useState } from "react";

/**
 * La zona horaria que reporta el navegador, leída DESPUÉS del primer pintado.
 *
 * No se puede leer durante el render: estas páginas se pintan primero en el
 * servidor, donde la zona del visitante no existe. Puesta directa, el servidor
 * escribiría Bogotá y el navegador otra cosa, y React descarta el pintado del
 * servidor por desajuste de hidratación. Así que se devuelve `undefined` en la
 * primera vuelta y la zona real en la segunda, que es lo que hace que la rejilla
 * aparezca primero en hora de Colombia y se corrija sola.
 *
 * Quien ya inició sesión no la necesita: su zona está guardada en su cuenta.
 * Esto es para el checkout, donde todavía no hay cuenta.
 */
export function useZonaDelNavegador(): string | undefined {
  const [zona, setZona] = useState<string | undefined>(undefined);
  useEffect(() => {
    try {
      // En modo privado algunos navegadores devuelven vacío o "UTC": se deja
      // en `undefined` y quien lo use cae a Bogotá, que es el comportamiento
      // de siempre.
      const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (z) setZona(z);
    } catch {
      /* sin Intl utilizable: se queda con la zona por defecto */
    }
  }, []);
  return zona;
}
