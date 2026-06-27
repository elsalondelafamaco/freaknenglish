import { Bookmark, Mic, TrendingUp, Video } from "lucide-react";
import heroStudent from "@/assets/hero-student.jpg";
import teacherAvatar from "@/assets/avatar-teacher.jpg";
import { DarkPillLink } from "./DarkPillButton";

const WAVE_HEIGHTS = [
  8, 14, 17, 11, 7, 15, 18, 12, 9, 16, 13, 8, 11, 17, 14, 10, 7, 12, 18, 15, 11, 8,
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-cream pt-28 lg:pt-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:px-8 lg:pb-24">
        {/* Copy */}
        <div className="flex flex-col justify-center text-center lg:text-left">
          <p className="text-sm font-medium tracking-wide text-brand-ink/70">
            <span className="font-semibold text-brand-ink">Real</span> English.{" "}
            <span className="font-semibold text-brand-ink">Real</span> Results.
          </p>
          <h1 className="mt-3 text-balance text-[40px] font-bold leading-[1.05] tracking-tight text-brand-ink sm:text-5xl lg:text-[64px]">
            Speak English with Confidence, in{" "}
            <span className="marker-highlight">Real</span> Conversations.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-brand-ink/75 lg:mx-0 lg:text-base">
            Clases <strong className="font-semibold text-brand-ink">1 a 1 en Vivo</strong> con
            profesores reales, conversaciones prácticas y feedback personalizado para que hables
            inglés con fluidez.
          </p>
          <div className="mt-7 flex justify-center lg:justify-start">
            <DarkPillLink to="/checkout/4-dias" size="lg">
              Comienza Hoy Tu Aprendizaje
            </DarkPillLink>
          </div>
        </div>

        {/* Hero composite */}
        <div className="relative mx-auto w-full max-w-[560px]">
          <div className="relative overflow-hidden rounded-[28px] shadow-soft">
            <img
              src={heroStudent}
              alt="Estudiante en clase de inglés en vivo"
              width={1280}
              height={1280}
              className="h-full w-full object-cover"
            />
          </div>

          {/* Progress card */}
          <div className="absolute -top-4 left-3 sm:left-6 w-[180px] rounded-2xl bg-white p-3 shadow-soft">
            <div className="flex items-center justify-between text-[11px] font-medium text-brand-ink/70">
              <span>Progreso de Habla</span>
              <TrendingUp className="size-3.5 text-brand-success" />
            </div>
            <div className="mt-1 text-2xl font-bold text-brand-ink">82%</div>
            <div className="text-[10px] text-brand-ink/60">Nivel de Fluidez</div>
            <div className="mt-2 h-10 w-full">
              <svg viewBox="0 0 100 30" className="h-full w-full">
                <path
                  d="M0,25 C15,22 25,18 35,15 C45,12 55,18 65,12 C75,8 85,10 100,4"
                  fill="none"
                  stroke="oklch(0.7 0.16 145)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="text-[10px] font-medium text-brand-success">+12% esta semana</div>
          </div>

          {/* Live class card */}
          <div className="absolute -right-2 top-10 sm:-right-6 w-[180px] rounded-2xl bg-white p-3 shadow-soft">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-brand-ink/70">
              <span className="size-2 rounded-full bg-red-500 animate-pulse" />
              Clase en Vivo
            </div>
            <div className="mt-1.5 text-[12px] font-semibold text-brand-ink">
              Tema: Travel & Adventures
            </div>
            <div className="text-[10px] text-brand-ink/60">8:00 PM – 9:00 PM</div>
            <div className="mt-2 flex -space-x-1.5">
              {[teacherAvatar, teacherAvatar, teacherAvatar].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="size-6 rounded-full border-2 border-white object-cover"
                />
              ))}
              <span className="ml-2 flex size-6 items-center justify-center rounded-full border-2 border-white bg-brand-yellow text-[10px] font-bold text-brand-ink">
                +1
              </span>
            </div>
          </div>

          {/* Vocabulary card */}
          <div className="absolute -right-2 bottom-20 sm:-right-6 w-[180px] rounded-2xl bg-white p-3 shadow-soft">
            <div className="flex items-center justify-between text-[11px] font-medium text-brand-ink/70">
              <span>Nuevo Vocabulario</span>
              <Bookmark className="size-3.5" />
            </div>
            <div className="mt-1.5 text-[14px] font-bold text-brand-ink">Adventure</div>
            <div className="text-[10px] italic text-brand-ink/60">/əd&apos;ven.tʃər/</div>
            <div className="mt-1 text-[10px] text-brand-ink/70">A fun or exciting experience.</div>
          </div>

          {/* Teacher feedback */}
          <div className="absolute -bottom-2 left-2 sm:left-6 w-[210px] rounded-2xl bg-white p-3 shadow-soft">
            <div className="flex items-start gap-2">
              <img
                src={teacherAvatar}
                alt="Teacher"
                className="size-7 rounded-full object-cover"
              />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-brand-ink">Teacher</div>
                <div className="text-[10px] leading-snug text-brand-ink/70">
                  Great job! Your pronunciation is getting much better.
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-brand-success/90">
                <Mic className="size-3 text-white" />
              </span>
              <div className="flex-1 flex items-center gap-0.5">
                {WAVE_HEIGHTS.map((h, i) => (
                  <span
                    key={i}
                    className="w-0.5 rounded-full bg-brand-success/70"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-brand-ink/60">0:18</span>
            </div>
          </div>

          {/* Small video pill */}
          <div className="absolute right-6 -top-2 hidden sm:flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 shadow-soft">
            <Video className="size-3.5 text-brand-ink" />
            <span className="text-[10px] font-medium text-brand-ink">Live</span>
          </div>
        </div>
      </div>

      {/* Social proof bar */}
      <SocialProofBar />
    </section>
  );
}

function SocialProofBar() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 lg:px-8 lg:pb-16">
      <div className="rounded-2xl bg-white/60 backdrop-blur-sm border border-white p-5 shadow-soft lg:p-6">
        <div className="grid gap-5 sm:grid-cols-3 sm:divide-x sm:divide-brand-line">
          <div className="flex items-center gap-3 sm:px-2">
            <div className="flex -space-x-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className="size-8 rounded-full border-2 border-white bg-gradient-to-br from-amber-200 to-amber-400"
                />
              ))}
            </div>
            <div>
              <div className="flex items-center gap-1 text-amber-500">
                {"★★★★★".split("").map((s, i) => (
                  <span key={i} className="text-sm">
                    {s}
                  </span>
                ))}
                <span className="ml-1.5 text-xs font-semibold text-brand-ink">
                  +2000 Estudiantes
                </span>
              </div>
              <p className="text-[11px] italic text-brand-ink/60">
                "Dejé de traducir, ahora simplemente hablo!"
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:px-5">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-cream">
              <svg className="size-5 text-brand-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
              </svg>
            </span>
            <div>
              <div className="text-lg font-bold text-brand-ink">+20</div>
              <div className="text-xs text-brand-ink/60">Países</div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:px-5">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-cream">
              <svg className="size-5 text-brand-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <div>
              <div className="text-lg font-bold text-brand-ink">1 a 1</div>
              <div className="text-xs text-brand-ink/60">Clases Personalizadas</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}