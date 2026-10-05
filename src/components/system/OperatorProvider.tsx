import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { setCurrentOperator, DEPARTMENTS, type Department, type Operator } from "@/lib/app-context";
import { getSupabaseOrNull, isSupabaseConfigured } from "@/lib/supabase-client";

interface OperatorContextValue {
  operator: Operator;
  changeOperator: () => void;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

interface OperatorRecord {
  id: string;
  name: string;
  department: string;
}

async function lookupOperatorByName(name: string): Promise<OperatorRecord | null> {
  const sb = getSupabaseOrNull();
  if (!sb) return null;
  const { data, error } = await sb
    .from("operators")
    .select("id, name, department")
    .ilike("name", name.trim())
    .maybeSingle();
  if (error || !data) return null;
  return data as OperatorRecord;
}

async function saveOperatorDepartment(name: string, department: Department): Promise<void> {
  const sb = getSupabaseOrNull();
  if (!sb) return;
  const { error } = await sb
    .from("operators")
    .upsert({ name: name.trim(), department }, { onConflict: "name" });
  if (error) throw new Error(`Failed to save operator department: ${error.message}`);
}

export function OperatorProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState<Operator | null>(null);

  const value = useMemo<OperatorContextValue | null>(() => {
    if (!operator) return null;
    return {
      operator,
      changeOperator: () => {
        const sb = getSupabaseOrNull();
        if (sb) {
          void sb.auth.signOut();
        }
        setOperator(null);
      },
    };
  }, [operator]);

  if (!operator || !value) {
    return (
      <OperatorLoginScreen
        onContinue={(nextOperator) => {
          setCurrentOperator(nextOperator);
          setOperator(nextOperator);
        }}
      />
    );
  }

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
}

interface NameCheckResult {
  isKnown: boolean;
  department: Department | null;
}

function OperatorLoginScreen({
  onContinue,
}: {
  onContinue: (operator: Operator) => void;
}) {
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<Department | "">("");
  const [showDepartment, setShowDepartment] = useState(false);
  const [checkingName, setCheckingName] = useState(false);
  const [knownDepartment, setKnownDepartment] = useState<Department | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dbReady = isSupabaseConfigured();

  async function checkName(value: string): Promise<NameCheckResult> {
    const trimmed = value.trim();
    if (!trimmed || !dbReady) {
      setShowDepartment(true);
      setKnownDepartment(null);
      return { isKnown: false, department: null };
    }
    setCheckingName(true);
    try {
      const existing = await lookupOperatorByName(trimmed);
      if (existing) {
        const dept = existing.department as Department;
        setKnownDepartment(dept);
        setDepartment(dept);
        setShowDepartment(false);
        return { isKnown: true, department: dept };
      } else {
        setKnownDepartment(null);
        setDepartment("");
        setShowDepartment(true);
        return { isKnown: false, department: null };
      }
    } catch {
      setShowDepartment(true);
      return { isKnown: false, department: null };
    } finally {
      setCheckingName(false);
    }
  }

  function continueAsOperator(checkResult?: NameCheckResult) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter your name to continue.");
      return;
    }

    const isKnown = checkResult?.isKnown ?? knownDepartment != null;
    const resolvedDept = checkResult?.department ?? knownDepartment;

    if (!isKnown && !resolvedDept) {
      const selectedDept = department as Department | "";
      if (!selectedDept) {
        setError("Select your department to continue.");
        return;
      }
      onContinue({ name: trimmedName, email: "", department: selectedDept });
      if (dbReady) {
        void saveOperatorDepartment(trimmedName, selectedDept).catch(() => {});
      }
    } else if (resolvedDept) {
      onContinue({ name: trimmedName, email: "", department: resolvedDept });
    } else {
      setError("Select your department to continue.");
    }
  }

  async function handleSubmit() {
    setError(null);
    const result = await checkName(name);
    continueAsOperator(result);
  }

  return (
    <main className="relative min-h-svh grid place-items-center bg-[#0d6579] p-6">
      <img
        src="/LGC_D%26G_Teams_Backgrounds_dark_teal_left_logo_orientation.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-contain object-center pointer-events-none select-none"
      />
      <section className="relative z-10 w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Cumberland Manufacturing</p>
          <h1 className="text-2xl font-bold tracking-tight">Operator sign-in</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Enter your name to identify the operator for this session. No company account or external sign-in is required.
          </p>
        </div>
        <div className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="operator-name">
            Name
            <input
              id="operator-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onBlur={(event) => void checkName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              autoComplete="name"
              autoFocus
              className="flex h-11 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Your name"
            />
          </label>
          {showDepartment && (
            <label className="block space-y-1.5 text-sm font-medium" htmlFor="operator-department">
              Department
              <select
                id="operator-department"
                value={department}
                onChange={(event) => {
                  setDepartment(event.target.value as Department);
                  setError(null);
                }}
                className="flex h-11 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select your department…</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {knownDepartment && (
            <p className="rounded-md bg-status-running/10 px-3 py-2 text-sm font-medium text-status-running">
              Welcome back — your department is set to {knownDepartment}.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-status-error/10 px-3 py-2 text-sm font-medium text-status-error">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={checkingName}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {checkingName ? "Checking…" : "Continue"}
          </button>
        </div>
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          The name entered here is not verified by an identity provider.
        </p>
      </section>
    </main>
  );
}

export function useOperator(): OperatorContextValue {
  const context = useContext(OperatorContext);
  if (!context) throw new Error("useOperator must be used inside OperatorProvider.");
  return context;
}
