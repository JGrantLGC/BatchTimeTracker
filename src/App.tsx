import { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import Layout from "./pages/_layout";
import { queryClient } from "./lib/query-client";
import { AppProviders } from "@/components/system/AppProviders";
import HomePage from "./pages/index";
import AdminPage from "./pages/admin";
import { AdminGate } from "./components/system/AdminAccess";
import ReportsPage from "./pages/reports";
import DiagnosticsPage from "./pages/diagnostics";
import NotFoundPage from "./pages/not-found";
import { AppErrorBoundary } from "./components/system/AppErrorBoundary";
const isDevMode = import.meta.env.DEV;
function getBase(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length ? `/${parts[0]}/` : "/";
}
let appNameBase: string | undefined = undefined;
if (!isDevMode) {
  appNameBase = getBase(window.location.pathname);
}
function App() {
  return (
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <Router basename={appNameBase}>
          <AppErrorBoundary>
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="admin" element={<AdminGate><AdminPage /></AdminGate>} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="diagnostics" element={<DiagnosticsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </AppErrorBoundary>
        </Router>
      </QueryClientProvider>
    </AppProviders>
  );
}
export default App;
