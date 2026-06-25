import { useState } from "react";
import { Star, X } from "lucide-react";
import { submitSatisfaction } from "@/lib/domain/survey";

/**
 * Popup mensual NPS. Cierre = "responder después" (vuelve a aparecer).
 * @migration En Postgres: tabla `satisfaction_surveys` (ver data-model.md).
 */
export function SatisfactionDialog({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);

  function handleSubmit() {
    if (nps == null) return;
    submitSatisfaction({ userId, nps, comment: comment.trim() || undefined });
    setDone(true);
    setTimeout(onClose, 1400);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-ink/40 px-4 py-6 backdrop-blur-sm md:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-brand-line bg-white p-6 shadow-soft md:p-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-cream px-3 py-1 text-xs font-medium text-brand-ink">
              <Star className="size-3.5" /> Encuesta mensual
            </div>
            <h2 className="mt-3 text-xl font-bold text-brand-ink md:text-2xl">
              ¿Qué tan probable es que recomiendes Freakn'?
            </h2>
            <p className="mt-1 text-sm text-brand-ink/65">
              Tu respuesta nos ayuda a mejorar tu experiencia. Toma 20 segundos.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-brand-ink/50 hover:bg-brand-cream/50"
          >
            <X className="size-4" />
          </button>
        </div>

        {done ? (
          <div className="mt-8 rounded-2xl bg-brand-cream/60 p-6 text-center">
            <div className="text-3xl">🙌</div>
            <p className="mt-2 font-semibold text-brand-ink">¡Gracias por tu feedback!</p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setNps(i)}
                  className={`size-10 rounded-xl border text-sm font-semibold transition ${
                    nps === i
                      ? "border-brand-ink bg-brand-ink text-white"
                      : "border-brand-line bg-white text-brand-ink hover:bg-brand-cream/50"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-brand-ink/55">
              <span>Nada probable</span>
              <span>Muy probable</span>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="¿Qué podríamos mejorar? (opcional)"
              rows={3}
              className="mt-5 w-full rounded-2xl border border-brand-line bg-white px-4 py-3 text-sm text-brand-ink placeholder:text-brand-ink/40 focus:border-brand-ink focus:outline-none"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-full px-4 py-2 text-sm font-medium text-brand-ink/70 hover:bg-brand-cream/40"
              >
                Después
              </button>
              <button
                onClick={handleSubmit}
                disabled={nps == null}
                className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}