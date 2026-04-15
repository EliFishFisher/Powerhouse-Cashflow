"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FxTicker } from "@/components/fx-ticker";
import { cn } from "@/lib/utils";

const NAV_TABS = [
  { label: "Cashflow",     href: "/cashflow"     },
  { label: "Transactions", href: "/transactions" },
  { label: "Forecast",     href: "/forecast"     },
  { label: "Rules",        href: "/rules"        },
  { label: "Reconcile",    href: "/reconcile"    },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center border-b border-slate-800 bg-slate-950 px-5">

      {/* Logo */}
      <div className="flex items-center gap-2 mr-6">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-blue-500 to-blue-700 text-xs font-black text-white">
          P
        </div>
        <span className="text-sm font-bold tracking-tight text-white">
          Powerhouse <span className="text-blue-400">CashFlow</span>
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex h-full items-center gap-0">
        {NAV_TABS.map(tab => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex h-full items-center px-4 text-xs font-medium transition-colors",
                "border-b-2 hover:text-white",
                active
                  ? "border-blue-400 text-blue-400"
                  : "border-transparent text-slate-400 hover:border-slate-600"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-3">
        <FxTicker />

        {/* Reporting currency badge */}
        <div className="flex items-center gap-1.5 rounded border border-blue-500/25 bg-blue-500/10 px-2.5 py-1">
          <span className="text-[10px] font-bold text-blue-300">USD</span>
          <span className="text-[9px] text-slate-500">Reporting</span>
        </div>

        {/* Server status — fetched client-side */}
        <ServerStatus />
      </div>
    </header>
  );
}

/** Pings the data server and shows a green/red dot */
function ServerStatus() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        await fetch("/api/data", { cache: "no-store" });
        setOk(true);
      } catch {
        setOk(false);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  if (ok === null) return null;

  return (
    <div className={cn(
      "rounded px-2 py-1 text-[9px] font-semibold border",
      ok
        ? "bg-green-500/15 text-green-400 border-green-500/30"
        : "bg-red-500/15 text-red-400 border-red-500/30"
    )}>
      {ok ? "● Server connected" : "● Server offline"}
    </div>
  );
}

// useState and useEffect are imported at the top of this file
