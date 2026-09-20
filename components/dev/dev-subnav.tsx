"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dev", label: "Usuários" },
  { href: "/dev/spaces", label: "Spaces" },
];

export function DevSubnav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active = tab.href === "/dev" ? pathname === "/dev" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
