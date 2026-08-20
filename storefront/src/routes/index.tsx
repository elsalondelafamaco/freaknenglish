import { createFileRoute } from "@tanstack/react-router";
import { Preloader } from "@/components/site/Preloader";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Testimonials } from "@/components/site/Testimonials";
import { Pricing } from "@/components/site/Pricing";
import { Faq } from "@/components/site/Faq";
import { CtaFinal } from "@/components/site/CtaFinal";
import { Footer } from "@/components/site/Footer";

import { DEFAULT_FAQS } from "@/lib/site-content";

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: DEFAULT_FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FreaknEnglish — Habla inglés con confianza, 1 a 1 en vivo" },
      {
        name: "description",
        content:
          "Clases 1 a 1 en vivo con profesores reales. Conversaciones prácticas y feedback personalizado para que hables inglés desde el día 1.",
      },
      { property: "og:title", content: "FreaknEnglish — Habla inglés con confianza" },
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
      <Preloader />
      <Navbar />
      <Hero />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <Faq />
      <CtaFinal />
      <Footer />
    </main>
  );
}
