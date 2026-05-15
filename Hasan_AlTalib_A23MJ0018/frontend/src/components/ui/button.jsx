import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[4px] border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(212,5,17,0.45)] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]",
        destructive:
          "border-transparent bg-[var(--accent-red)] text-white hover:bg-[#d93c3c]",
        outline:
          "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-1)] hover:bg-[var(--surface-3)]",
        secondary:
          "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-1)] hover:bg-[rgb(51,56,74)]",
        ghost:
          "border-transparent bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]",
        link: "border-transparent bg-transparent p-0 text-[var(--text-2)] underline-offset-4 hover:text-[var(--text-1)] hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
