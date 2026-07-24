import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Testimonials } from "@/components/site/Testimonials";
import { Pricing } from "@/components/site/Pricing";
import { Faq } from "@/components/site/Faq";
import { Footer } from "@/components/site/Footer";

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "¿Puedo elegir mi propio horario de clases?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sí. Al inscribirte seleccionas los horarios fijos que mejor se ajusten a tu rutina. Puedes reprogramar desde la plataforma con al menos 12 horas de anticipación.",
      },
    },
    {
      "@type": "Question",
      name: "¿Necesito experiencia previa en inglés?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Ofrecemos niveles desde principiante hasta avanzado y una prueba de nivelación al inscribirte.",
      },
    },
    {
      "@type": "Question",
      name: "¿Las clases son en vivo o grabadas?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Todas las clases son 1 a 1 y completamente en vivo con un profesor real, además de módulos para reforzar.",
      },
    },
    {
      "@type": "Question",
      name: "¿Qué necesito para empezar?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Un computador o celular con internet, audífonos y ganas de hablar inglés desde la primera clase.",
      },
    },
  ],
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Freakn English — Habla inglés con confianza, 1 a 1 en vivo" },
      {
        name: "description",
        content:
          "Clases 1 a 1 en vivo con profesores reales. Conversaciones prácticas y feedback personalizado para que hables inglés desde el día 1.",
      },
      { property: "og:title", content: "Freakn English — Habla inglés con confianza" },
      {
        property: "og:description",
        content:
          "Clases 1 a 1 en vivo con profesores reales. Habla, no traduzcas. Planes desde $155/mes.",
      },
    ],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(FAQ_JSONLD) },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <Faq />
      <Footer />
    </main>
  );
}
