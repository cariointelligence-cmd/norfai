import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const button = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-quick disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-ink hover:bg-ink",
        secondary: "border border-line bg-panel-2 text-ink hover:border-line-strong",
        ghost: "text-mute hover:text-ink hover:bg-panel-2",
        danger: "border border-bad/40 text-bad hover:bg-bad/10",
      },
      size: {
        sm: "h-10 min-h-10 px-3 text-xs rounded-[var(--radius-xs)]",
        md: "h-11 min-h-11 px-4 text-sm rounded-[var(--radius-sm)]",
        lg: "h-12 min-h-12 px-5 text-sm rounded-[var(--radius-sm)]",
        icon: "size-11 rounded-[var(--radius-sm)]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
