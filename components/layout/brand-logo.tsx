import { outfit } from "@/components/shared/outfit";

export function BrandLogo({
  className,
  name,
}: {
  className?: string;
  name: string;
}) {
  return (
    <span className={`${outfit.className} font-semibold tracking-[-0.05em] ${className}`}>
      {name}
    </span>
  );
}
