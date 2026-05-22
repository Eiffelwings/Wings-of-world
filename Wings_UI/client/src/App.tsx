import { lazy, Suspense, useMemo, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Link, Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Lock, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

const Home = lazy(() => import("./pages/Home"));
const Console = lazy(() => import("./pages/Console"));
const History = lazy(() => import("./pages/History"));
const Logs = lazy(() => import("./pages/Logs"));
const Telegram = lazy(() => import("./pages/Telegram"));
const WorkflowLibrary = lazy(() => import("./pages/WorkflowLibrary"));
const WorkflowBuilder = lazy(() => import("./pages/Workflow"));
const Tools = lazy(() => import("./pages/Tools"));
const Memory = lazy(() => import("./pages/Memory"));
const Agents = lazy(() => import("./pages/Agents"));
const System = lazy(() => import("./pages/System"));
const Chat = lazy(() => import("./pages/Chat"));
const CliChat = lazy(() => import("./pages/CliChat"));
const ImageStudio = lazy(() => import("./pages/ImageStudio"));
const Settings = lazy(() => import("./pages/Settings"));
const HumanActions = lazy(() => import("./pages/HumanActions"));
const CronJobs = lazy(() => import("./pages/CronJobs"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Optimization = lazy(() => import("./pages/Optimization"));
const SkillsManager = lazy(() => import("./pages/SkillsManager"));
const NotFound = lazy(() => import("./pages/NotFound"));

function NavBar() {
  const [loc] = useLocation();
  const { status, logout } = useAuth();
  const sections = useMemo(
    () => [
      [
        ["/", "Home"],
        ["/console", "Console"],
        ["/history", "History"],
        ["/logs", "Logs"],
        ["/analytics", "Analytics"],
        ["/optimization", "Optimization"],
      ],
      [
        ["/chat", "Chat"],
        ["/cli-chat", "CLI Chat"],
        ["/images", "Images"],
        ["/workflow", "Workflows"],
        ["/workflow-builder", "Builder"],
        ["/skills", "Skills"],
        ["/tools", "Tools"],
        ["/memory", "Memory"],
      ],
      [
        ["/telegram", "Telegram"],
        ["/cron", "Cron"],
        ["/human-actions", "Commands"],
        ["/agents", "Agents"],
        ["/system", "System"],
        ["/settings", "Settings"],
      ],
    ],
    [],
  );
  const isActive = (href: string) =>
    href === "/"
      ? loc === "/"
      : loc === href || loc.startsWith(`${href}/`) || loc.startsWith(`${href}?`);
  const item = (href: string, label: string) => (
    <Link href={href}>
      <span
        className={`px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors ${
          isActive(href)
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-background hover:text-foreground"
        }`}
      >
        {label}
      </span>
    </Link>
  );

  return (
    <div className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/">
          <span className="inline-flex rounded-full border bg-card px-3 py-1.5 shadow-sm transition-colors hover:border-primary/40">
            <BrandLogo size="sm" />
          </span>
        </Link>
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {sections.map((group, index) => (
            <div key={index} className="flex flex-wrap items-center gap-1 rounded-full border bg-muted/40 p-1">
              {group.map(([href, label]) => (
                <span key={href}>{item(href, label)}</span>
              ))}
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={status?.enabled ? "default" : "secondary"} className="rounded-full px-3 py-1">
            {status?.enabled ? (
              <>
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                Protected
              </>
            ) : (
              <>
                <AlertCircle className="mr-1 h-3.5 w-3.5" />
                Open
              </>
            )}
          </Badge>
          {status?.enabled && status.authenticated ? (
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => void logout()}>
              <Lock className="mr-2 h-4 w-4" />
              Lock
            </Button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/console" component={Console} />
        <Route path="/history" component={History} />
        <Route path="/logs" component={Logs} />
        <Route path="/telegram" component={Telegram} />
        <Route path="/workflow" component={WorkflowLibrary} />
        <Route path="/workflow-builder" component={WorkflowBuilder} />
        <Route path="/tools" component={Tools} />
        <Route path="/memory" component={Memory} />
        <Route path="/cron" component={CronJobs} />
        <Route path="/human-actions" component={HumanActions} />
        <Route path="/agents" component={Agents} />
        <Route path="/system" component={System} />
        <Route path="/chat" component={Chat} />
        <Route path="/cli-chat" component={CliChat} />
        <Route path="/images" component={ImageStudio} />
        <Route path="/settings" component={Settings} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/optimization" component={Optimization} />
        <Route path="/skills" component={SkillsManager} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AuthGate() {
  const { status, loading, login, bootstrap } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (loading || !status) {
    return <div className="p-6 text-sm text-muted-foreground">Loading security context...</div>;
  }

  if (!status.enabled || status.authenticated) {
    return (
      <>
        <NavBar />
        <Router />
      </>
    );
  }

  const bootstrapMode = status.canBootstrap;

  const submit = async () => {
    setError("");
    if (!password.trim()) {
      setError("Password is required.");
      return;
    }
    if (bootstrapMode && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      if (bootstrapMode) {
        await bootstrap(password);
      } else {
        await login(password);
      }
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(29,78,216,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.12),_transparent_28%)] p-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Local-first AI operations workspace
          </Badge>
          <div className="space-y-3">
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance">
              {bootstrapMode ? "Secure the Wings Of World workspace before anyone else opens it." : "Unlock Wings Of World and continue exactly where you left off."}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              {bootstrapMode
                ? "This password protects the local web UI and sensitive API routes on this machine. It is the last missing layer between your tools, memory, Telegram bridge, and anyone who can open the browser."
                : "Your sessions, tools, memory, and Telegram control surface are ready. Enter the local app password to restore access."}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-card/80 p-4 shadow-sm">
              <div className="text-sm font-medium">Why this matters</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Settings, exports, workflow changes, and write-capable tools stay behind one local control point.
              </div>
            </div>
            <div className="rounded-2xl border bg-card/80 p-4 shadow-sm">
              <div className="text-sm font-medium">Operator flow</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Set once, unlock fast, and rotate the password later from Settings without touching files by hand.
              </div>
            </div>
          </div>
        </div>
        <Card className="w-full max-w-md justify-self-end border-border/70 bg-card/92 shadow-xl">
        <CardHeader>
          <CardTitle>{bootstrapMode ? "Secure Wings Of World" : "Unlock Wings Of World"}</CardTitle>
          <CardDescription>
            {bootstrapMode
              ? "Set a local app password to lock the Wings Of World web UI and API on this machine."
              : "Enter the local app password to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {bootstrapMode ? "Create password" : "Password"}
            </div>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={bootstrapMode ? "Create a strong password" : "Password"}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submit();
                }
              }}
            />
          </div>
          {bootstrapMode ? (
            <div className="grid gap-2">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Confirm password
              </div>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void submit();
                  }
                }}
              />
            </div>
          ) : null}
          {bootstrapMode ? (
            <div className="rounded-xl border bg-muted/50 p-3 text-xs leading-6 text-muted-foreground">
              Use at least 10 characters. Avoid reusing a password from another service.
            </div>
          ) : null}
          {error ? <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
          <Button className="w-full rounded-xl" onClick={() => void submit()} disabled={submitting}>
            {bootstrapMode ? "Enable app password" : "Unlock"}
          </Button>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AuthGate />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
