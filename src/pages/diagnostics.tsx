import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { runAllStateTransitionTests, type TestSuiteResult, type TestResult } from "@/lib/state-transition-tests";
export default function DiagnosticsPage() {
  const [running, setRunning] = useState(false);
  const [suite, setSuite] = useState<TestSuiteResult | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  async function runAll() {
    setRunning(true);
    setSuite(null);
    try {
      const result = await runAllStateTransitionTests();
      setSuite(result);
    } finally {
      setRunning(false);
    }
  }
  const passed = suite ? suite.tests.filter((t) => t.passed).length : 0;
  const failed = suite ? suite.tests.filter((t) => !t.passed).length : 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <FlaskConical className="h-6 w-6" />
          Diagnostics
        </h1>
        <p className="text-muted-foreground text-sm">
          Automated state-transition test suite. Exercises Start / Stop / End
          against the live data services with isolated TEST-* JobKeys. Proves
          the sum-of-sessions invariant and no-double-count guarantee.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runAll} disabled={running}>
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <FlaskConical className="h-4 w-4 mr-1" />
              Run all tests
            </>
          )}
        </Button>
        {suite && (
          <div className="text-sm">
            <span className="font-semibold text-status-running">{passed} passed</span>
            {failed > 0 && (
              <>
                {" "}·{" "}
                <span className="font-semibold text-status-error">{failed} failed</span>
              </>
            )}
            <span className="text-muted-foreground"> · {Math.round(suite.elapsedMs)}ms total</span>
          </div>
        )}
      </div>
      {suite && (
        <div className="space-y-2">
          {suite.tests.map((t) => (
            <TestRow
              key={t.name}
              test={t}
              expanded={!!expanded[t.name]}
              onToggle={() => setExpanded((e) => ({ ...e, [t.name]: !e[t.name] }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
function TestRow({
  test,
  expanded,
  onToggle,
}: {
  test: TestResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const failedAssertions = test.assertions.filter((a) => !a.passed).length;
  return (
    <div className="rounded-md border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${
          test.passed ? "bg-status-running/10" : "bg-status-error/10"
        }`}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {test.passed ? (
          <CheckCircle2 className="h-4 w-4 text-status-running" />
        ) : (
          <XCircle className="h-4 w-4 text-status-error" />
        )}
        <span className="font-semibold">{test.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {test.assertions.length} assertions
          {failedAssertions > 0 && (
            <span className="ml-2 text-status-error font-semibold">
              · {failedAssertions} failed
            </span>
          )}
          {typeof test.elapsedMs === "number" && (
            <span className="ml-2">· {Math.round(test.elapsedMs)}ms</span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t bg-card">
          {test.error && (
            <div className="px-3 py-2 text-sm bg-status-error/10 text-status-error">
              {test.error}
            </div>
          )}
          <ul className="divide-y">
            {test.assertions.map((a, idx) => (
              <li
                key={idx}
                className={`px-3 py-1.5 text-xs md:text-sm flex items-start gap-2 ${
                  a.passed ? "" : "bg-status-error/5"
                }`}
              >
                {a.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-status-running mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-status-error mt-0.5 flex-shrink-0" />
                )}
                <span className={a.passed ? "" : "text-status-error font-semibold"}>
                  {a.label}
                  {a.detail && (
                    <span className="text-muted-foreground font-mono ml-2">
                      ({a.detail})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
