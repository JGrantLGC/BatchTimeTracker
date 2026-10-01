import { Outlet, NavLink } from "react-router-dom";
import { ScanLine, ShieldCheck, BarChart3, UserCircle2, FlaskConical, LogOut } from "lucide-react";
import { getCurrentOperator, getLastSAPRefresh } from "@/lib/app-context";
import { formatDate } from "@/lib/time-utils";
import { LGCLogo, BrandHexPattern } from "@/components/system/LGCLogo";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ensurePlant1200MaterialMasterSeeded } from "@/lib/material-master-autoseed";
import { useAuth } from "@/components/system/AuthProvider";

export default function Layout() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const operator = getCurrentOperator();

  useEffect(() => {
    ensurePlant1200MaterialMasterSeeded().then(() => {
      queryClient.invalidateQueries({ queryKey: ["materialCatalog"] });
    });
  }, [queryClient]);

  const lastRefresh = getLastSAPRefresh();
  const navItems = [
    { to: "/", label: "Operator", icon: ScanLine },
    { to: "/admin", label: "Administration", icon: ShieldCheck },
    { to: "/reports", label: "Reports", icon: BarChart3 },
    { to: "/diagnostics", label: "Diagnostics", icon: FlaskConical },
  ];

  return (
    <div className="bg-background text-foreground flex flex-col min-h-svh">
      <header className="border-b sticky top-0 z-40 bg-primary text-primary-foreground shadow-sm relative overflow-hidden">
        <BrandHexPattern className="absolute inset-y-0 right-0 h-full w-1/2 text-white" />
        <div className="relative mx-auto w-full max-w-7xl px-4 md:px-8 h-20 flex items-center gap-4">
          <div className="flex items-center gap-4">
            <LGCLogo variant="reversed" className="h-11 md:h-12 w-auto" />
            <div className="hidden md:block h-10 w-px bg-primary-foreground/25" aria-hidden="true" />
            <div className="hidden md:flex flex-col leading-tight">
              <span className="text-xs uppercase tracking-widest text-primary-foreground/70 font-semibold">
                Cumberland Manufacturing
              </span>
              <span className="text-base md:text-lg font-bold tracking-tight">
                Material-Batch Time Tracker
              </span>
            </div>
          </div>
          <nav className="ml-6 hidden lg:flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-white text-primary"
                      : "text-primary-foreground/85 hover:bg-primary-foreground/10"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs md:text-sm">
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="opacity-80">Last SAP Refresh</span>
              <span className="font-medium">{formatDate(lastRefresh)}</span>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-primary-foreground/15 px-3 py-1.5">
              <UserCircle2 className="h-5 w-5" />
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] opacity-80">Operator</span>
                <span className="font-semibold">{operator.name}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-primary-foreground/85 transition-colors hover:bg-primary-foreground/10"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Sign out</span>
            </button>
          </div>
        </div>
        <div className="lg:hidden border-t border-primary-foreground/20 relative">
          <div className="mx-auto max-w-7xl px-2 flex">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex-1 inline-flex flex-col items-center justify-center gap-0.5 py-2 text-xs ${
                    isActive ? "font-bold bg-primary-foreground/15" : "opacity-85"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </header>
      <main className="flex-1 w-full mx-auto max-w-7xl px-4 md:px-8 py-6">
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-3 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Cumberland Manufacturing &bull; Operational time capture. Not payroll, attendance, or performance data.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Powered by</span>
            <LGCLogo variant="masterbrand" className="h-5 w-auto" />
          </div>
        </div>
      </footer>
    </div>
  );
}
