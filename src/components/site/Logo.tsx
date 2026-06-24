import logo from "@/assets/freakn-logo.svg.asset.json";

export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return <img src={logo.url} alt="Freakn English" className={className} />;
}