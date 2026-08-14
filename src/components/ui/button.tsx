import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // New: border + glow variants
        "border-glow": "border border-primary/50 bg-transparent text-primary hover:bg-primary/10 hover:border-primary shadow-glow-subtle hover:shadow-glow transition-all duration-base",
        "border-glow-destructive": "border border-destructive/50 bg-transparent text-destructive hover:bg-destructive/10 hover:border-destructive shadow-destructive/20 hover:shadow-destructive/40 transition-all duration-base",
        "border-glow-success": "border border-success/50 bg-transparent text-success hover:bg-success/10 hover:border-success shadow-success/20 hover:shadow-success/40 transition-all duration-base",
        "border-glow-warning": "border border-warning/50 bg-transparent text-warning hover:bg-warning/10 hover:border-warning shadow-warning/20 hover:shadow-warning/40 transition-all duration-base",
        // Subtle border only (no glow)
        "border-subtle": "border border-border bg-background text-foreground hover:bg-secondary hover:border-primary/50 transition-all duration-base",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
