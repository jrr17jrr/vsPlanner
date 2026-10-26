"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer h-5 w-5 shrink-0 rounded-[5px] border-[1.5px] border-[#708096] bg-[#151b26] outline-none transition-colors hover:border-[#00E1FF]",
        "data-[state=checked]:bg-[#00E1FF] data-[state=checked]:border-[#00E1FF] data-[state=checked]:text-[#07141A]",
        "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="h-4 w-4 stroke-[3]" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
