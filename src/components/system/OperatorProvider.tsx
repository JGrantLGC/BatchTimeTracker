import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { setCurrentOperator, type Operator } from "@/lib/app-context";

interface OperatorContextValue {
  operator: Operator;
  changeOperator: () => void;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function OperatorProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState<Operator | null>(null);

  const value = useMemo<OperatorContextValue | null>(() => {
    if (!operator) return null;
    return {
      operator,
      changeOperator: () => setOperator(null),
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

function OperatorLoginScreen({
  onContinue,
}: {
  onContinue: (operator: Operator) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function continueAsOperator() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter your name to continue.");
      return;
    }
    onContinue({ name: trimmedName, email: "" });
  }

  return (
    <main
      className="min-h-svh grid place-items-center md:place-items-end bg-[#0d6579] bg-cover bg-center bg-no-repeat p-6 md:pr-[8vw]"
      style={{
        backgroundImage:
          'url("/LGC_D%26G_Teams_Backgrounds_dark_teal_left_logo_orientation.png")',
      }}
    >
      <section className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-8 shadow-2xl backdrop-blur-sm">
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
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") continueAsOperator();
              }}
              autoComplete="name"
              autoFocus
              className="flex h-11 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Your name"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-md bg-status-error/10 px-3 py-2 text-sm font-medium text-status-error">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={continueAsOperator}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Continue
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
