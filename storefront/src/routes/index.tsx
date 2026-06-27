import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Testimonials } from "@/components/site/Testimonials";
import { Pricing } from "@/components/site/Pricing";
import { Faq } from "@/components/site/Faq";
import { Footer } from "@/components/site/Footer";

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
