import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Route, Switch } from "wouter";

import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const AIAssistant = lazy(() => import("./pages/AIAssistant"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Schedules = lazy(() => import("./pages/Schedules"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Evaluations = lazy(() => import("./pages/Evaluations"));
const Home = lazy(() => import("./pages/Home"));
const Incentives = lazy(() => import("./pages/Incentives"));
const Login = lazy(() => import("./pages/Login"));
const Payroll = lazy(() => import("./pages/Payroll"));
const Reports = lazy(() => import("./pages/Reports"));
const Requests = lazy(() => import("./pages/Requests"));
const Overtime = lazy(() => import("./pages/Overtime"));
const Settings = lazy(() => import("./pages/Settings"));
const WorkerHub = lazy(() => import("./pages/WorkerHub"));
const Workers = lazy(() => import("./pages/Workers"));
const NotFound = lazy(() => import("./pages/NotFound"));

function PageLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center gap-3 bg-background text-muted-foreground"
    >
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
      <span>جارٍ تحميل الصفحة…</span>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />

      <Route path="/login" component={Login} />

      <Route path="/dashboard" component={Dashboard} />

      <Route path="/workers/:id" component={WorkerHub} />

      <Route path="/workers" component={Workers} />

      <Route path="/attendance" component={Attendance} />

      <Route path="/schedules" component={Schedules} />

      <Route path="/evaluations" component={Evaluations} />

      <Route path="/incentives" component={Incentives} />

      <Route path="/requests" component={Requests} />

      <Route path="/overtime" component={Overtime} />

      <Route path="/payroll" component={Payroll} />

      <Route path="/reports" component={Reports} />

      <Route path="/analytics" component={Analytics} />

      <Route path="/ai-assistant" component={AIAssistant} />

      <Route path="/worker-hub" component={WorkerHub} />

      <Route path="/settings" component={Settings} />

      <Route path="/admin-dashboard" component={Dashboard} />

      <Route path="/hr-dashboard" component={Dashboard} />

      <Route path="/supervisor-dashboard" component={Dashboard} />

      <Route path="/finance-dashboard" component={Dashboard} />

      <Route path="/404" component={NotFound} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster position="top-left" richColors closeButton />

          <Suspense fallback={<PageLoading />}>
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
