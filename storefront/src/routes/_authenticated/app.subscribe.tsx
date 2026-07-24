import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/subscribe")({
  head: () => ({ meta: [{ title: "Elige tu plan — Freakn English" }] }),
  component: SubscribeRedirect,
});

// La selección de plan vive en /checkout (UI de compra completa). Esta ruta
// interna solo redirige allí para mantener una sola experiencia de compra.
function SubscribeRedirect() {
  const nav = useNavigate();
  useEffect(() => {
    nav({ to: "/checkout", replace: true });
  }, [nav]);
  return null;
}
