"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Bot,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  short?: string;
};

const NAV: NavItem[] = [
  {
    href: "/",
    label: "factory floor",
    icon: Home,
    match: (p) => p === "/",
  },
  {
    href: "/robot/robot_01",
    label: "robot 01",
    icon: Bot,
    match: (p) => p.startsWith("/robot/robot_01"),
    short: "01",
  },
  {
    href: "/robot/robot_02",
    label: "robot 02",
    icon: Bot,
    match: (p) => p.startsWith("/robot/robot_02"),
    short: "02",
  },
  {
    href: "/robot/robot_03",
    label: "robot 03",
    icon: Bot,
    match: (p) => p.startsWith("/robot/robot_03"),
    short: "03",
  },
  {
    href: "/aura",
    label: "aura",
    icon: MessageSquare,
    match: (p) => p.startsWith("/aura"),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="primary"
      className="flex w-14 flex-col border-r border-border bg-surface-1"
    >
      <div className="flex h-14 items-center justify-center border-b border-border">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground">
          AU
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 px-1.5 py-2">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="relative">
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-x-1.5 -translate-y-1/2 bg-foreground"
                />
              )}
              <Link
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-10 items-center justify-center rounded-sm transition-colors",
                  active
                    ? "bg-surface-3 text-foreground"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2 : 1.5} />
                {item.short && (
                  <span className="sr-only">{item.short}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border px-1.5 py-2 text-center">
        <span className="font-mono text-[9px] uppercase tracking-widest text-subtle">
          v0.1
        </span>
      </div>
    </nav>
  );
}
