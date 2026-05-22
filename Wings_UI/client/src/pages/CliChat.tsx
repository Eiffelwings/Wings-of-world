import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  api,
  type ChatMessage,
  type ChatCascadeResponse,
  type ChatResponse,
  type OpenRouterModelCatalogEntry,
  type ProviderMeta,
  type PublicSettings,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHero } from "@/components/page-shell";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Loader2, RefreshCcw, Send, Sparkles, TerminalSquare } from "lucide-react";
import { toast } from "sonner";

type CliMode = "chat" | "agent" | "cascade";

type CliLine = {
  role: ChatMessage["role"];
  content: string;
};

function formatProviderMeta(meta?: ProviderMeta | null) {
  if (!meta) return "-";
  return `${meta.provider} / ${meta.model} / ${meta.apiMode}${meta.usedFallback ? " / fallback" : ""}`;
}

function formatCascadeResult(result?: ChatCascadeResponse | null) {
  if (!result) return "-";
  if (!result.finalTarget) return "cascade disabled";
  return `${result.finalTarget.provider} / ${result.finalTarget.model}`;
}

export default function CliChatPage() {
  const storageKey = "wings-of-world.cli-chat.v1";
  const endRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModelCatalogEntry[]>([]);
  const [cascadeConfig, setCascadeConfig] = useState<{ mode: string; escalationThreshold: number } | null>(null);
  const [mode, setMode] = useState<CliMode>("chat");
  const [cascadeMode, setCascadeMode] = useState("balanced");
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<CliLine[]>([
    { role: "system", content: "You are a helpful assistant." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [providerMeta, setProviderMeta] = useState<ProviderMeta | null>(null);
  const [traceLines, setTraceLines] = useState<string[]>([]);
  const [lastChat, setLastChat] = useState<ChatResponse | null>(null);
  const [lastCascade, setLastCascade] = useState<ChatCascadeResponse | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.mode === "string" && (parsed.mode === "chat" || parsed.mode === "agent" || parsed.mode === "cascade")) {
        setMode(parsed.mode);
      }
      if (parsed && typeof parsed.cascadeMode === "string") {
        setCascadeMode(parsed.cascadeMode);
      }
      if (parsed && typeof parsed.model === "string") {
        setModel(parsed.model);
      }
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ mode, cascadeMode, model }));
  }, [mode, cascadeMode, model]);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {});
    api.getOpenRouterModels().then((data) => setOpenrouterModels(data.models || [])).catch(() => {});
    api.getCascadeConfig().then((data) => {
      setCascadeConfig({ mode: data.mode, escalationThreshold: data.escalationThreshold });
      setCascadeMode(data.mode || "balanced");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!model.trim() && settings?.model) {
      setModel(settings.model);
    }
  }, [model, settings?.model]);

  const quickModels = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const add = (value?: string) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      list.push(value);
    };

    add(settings?.model);
    add(settings?.fallback?.model);
    openrouterModels
      .filter((entry) => entry.input.includes("text"))
      .sort((a, b) => {
        const aScore =
          (a.capabilities?.includes("image_generation") ? 3 : 0) +
          (a.capabilities?.includes("vision") ? 2 : 0) +
          (a.reasoning ? 1 : 0);
        const bScore =
          (b.capabilities?.includes("image_generation") ? 3 : 0) +
          (b.capabilities?.includes("vision") ? 2 : 0) +
          (b.reasoning ? 1 : 0);
        return bScore - aScore || a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id);
      })
      .slice(0, 48)
      .forEach((entry) => add(entry.id));
    return list.slice(0, 48);
  }, [openrouterModels, settings]);

  const resetTranscript = () => {
    setMessages([{ role: "system", content: "You are a helpful assistant." }]);
    setInput("");
    setSessionId(null);
    setProviderMeta(null);
    setTraceLines([]);
    setLastChat(null);
    setLastCascade(null);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const modelOverride = model.trim() || undefined;
      if (mode === "chat") {
        const response = await api.chatWithSession(nextMessages, sessionId || undefined, modelOverride);
        const nextSessionId = response.sessionId;
        setSessionId(nextSessionId);
        setProviderMeta(response.providerMeta || null);
        setLastChat(response);
        setLastCascade(null);
        setTraceLines([
          `provider: ${response.providerMeta ? formatProviderMeta(response.providerMeta) : "-"}`,
          `tokens: ${response.tokenUsage?.totalTokens || 0}`,
          `cost: $${Number(response.runCostEstimateUsd || 0).toFixed(6)}`,
        ]);
        setMessages([...nextMessages, { role: "assistant", content: response.content }]);
        return;
      }

      if (mode === "agent") {
        const response = await api.chatAgent(nextMessages, modelOverride);
        setSessionId(null);
        setProviderMeta(response.providerMeta || null);
        setLastChat(null);
        setLastCascade(null);
        setTraceLines((response.trace || []).map((step) => (typeof step === "string" ? step : JSON.stringify(step))));
        setMessages([...nextMessages, { role: "assistant", content: response.content }]);
        return;
      }

      const response = await api.chatCascade(nextMessages, {
        mode: cascadeMode,
        escalationThreshold: cascadeConfig?.escalationThreshold,
        model: modelOverride,
      });
      setSessionId(null);
      setProviderMeta(null);
      setLastChat(null);
      setLastCascade(response);
      setTraceLines([
        `cascade: ${response.cascade?.fallback ? "fallback" : "routed"}`,
        `target: ${formatCascadeResult(response)}`,
        `trace: ${response.traceId || "-"}`,
      ]);
      setMessages([...nextMessages, { role: "assistant", content: response.content }]);
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setMessages(nextMessages);
    } finally {
      setLoading(false);
    }
  };

  const promptLabel = mode === "chat" ? "chat" : mode === "agent" ? "agent" : "cascade";
  const activeProvider = settings ? `${settings.provider} / ${settings.model}` : "loading";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHero
        eyebrow="CLI surface"
        title="CLI Chat"
        description="Terminal-style chat over the live Wings Of World runtime."
        status={{
          label: loading ? "busy" : mode,
          variant: loading ? "outline" : "secondary",
        }}
        actions={
          <>
            <Link href="/chat">
              <Button variant="secondary" className="rounded-full">
                Chat
              </Button>
            </Link>
            <Link href="/console">
              <Button variant="secondary" className="rounded-full">
                Console
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="secondary" className="rounded-full">
                Settings
              </Button>
            </Link>
            <Button variant="ghost" className="rounded-full" onClick={resetTranscript} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric title="Runtime" value={activeProvider} detail="Active provider / model from Settings" icon={<Sparkles className="h-4 w-4" />} />
          <Metric title="Engine" value={mode} detail={mode === "chat" ? "session-backed chat" : mode === "agent" ? "agentic loop" : "cascade routing"} icon={<TerminalSquare className="h-4 w-4" />} />
          <Metric title="Session" value={sessionId ? "active" : "ephemeral"} detail={sessionId || "no saved chat session"} icon={<Bot className="h-4 w-4" />} />
          <Metric title="Provider meta" value={providerMeta ? "available" : "idle"} detail={formatProviderMeta(providerMeta)} icon={<Sparkles className="h-4 w-4" />} />
        </div>
      </PageHero>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="rounded-[1.5rem] border-slate-800 bg-slate-950 text-slate-100 shadow-sm">
          <CardHeader className="border-b border-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl text-slate-100">Transcript</CardTitle>
                <CardDescription className="text-slate-400">
                  {promptLabel} prompt stream with session and provider output.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="rounded-full bg-slate-800 text-slate-100">
                {messages.length - 1} lines
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="max-h-[60vh] space-y-3 overflow-y-auto rounded-2xl border border-slate-800 bg-black/60 p-4 font-mono text-sm leading-6">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className="flex gap-3">
                  <div className="w-24 shrink-0 text-xs uppercase tracking-[0.14em] text-slate-500">
                    {message.role === "user" ? "you" : message.role === "assistant" ? "wings-of-world" : "system"}
                  </div>
                  <div className={`min-w-0 flex-1 whitespace-pre-wrap ${message.role === "user" ? "text-emerald-300" : message.role === "assistant" ? "text-slate-100" : "text-slate-400"}`}>
                    {message.role === "user" ? `> ${message.content}` : message.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 text-slate-300">
                  <div className="w-24 shrink-0 text-xs uppercase tracking-[0.14em] text-slate-500">system</div>
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    running...
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="rounded-2xl border bg-background/95 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Command</div>
                  <div className="text-xs text-muted-foreground">Press Ctrl/Cmd+Enter to run.</div>
                </div>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {input.trim().length} chars
                </Badge>
              </div>
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Type a prompt..."
                className="min-h-[130px] rounded-2xl font-mono"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={send} disabled={loading || !input.trim()} className="rounded-full">
                  <Send className="mr-2 h-4 w-4" />
                  Run
                </Button>
                <Button variant="secondary" className="rounded-full" onClick={resetTranscript} disabled={loading}>
                  Clear
                </Button>
                <Button variant="ghost" className="rounded-full" onClick={() => setInput("à¸Šà¹ˆà¸§à¸¢à¸ªà¸£à¸¸à¸›à¸ªà¸–à¸²à¸™à¸°à¸£à¸°à¸šà¸šà¸•à¸­à¸™à¸™à¸µà¹‰")} disabled={loading}>
                  Example
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-[1.5rem] shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Execution</CardTitle>
              <CardDescription>Route, model, and live control surface.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Mode</div>
                <div className="grid grid-cols-3 gap-2">
                  {(["chat", "agent", "cascade"] as const).map((item) => (
                    <Button
                      key={item}
                      type="button"
                      variant={mode === item ? "default" : "secondary"}
                      className="rounded-full"
                      onClick={() => setMode(item)}
                    >
                      {item}
                    </Button>
                  ))}
                </div>
              </div>

              {mode === "cascade" && (
                <div className="grid gap-2">
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Cascade mode</div>
                  <Input value={cascadeMode} onChange={(event) => setCascadeMode(event.target.value)} />
                </div>
              )}

              <div className="grid gap-2">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Model</div>
                <Input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="gpt-4o-mini / gpt-5.4 / openrouter model id"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Quick picks</div>
                <div className="flex flex-wrap gap-2">
                  {quickModels.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No suggestions loaded yet.</div>
                  ) : (
                    quickModels.map((item) => (
                      <Button
                        key={item}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setModel(item)}
                      >
                        {item}
                      </Button>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.5rem] shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Runtime trace</CardTitle>
              <CardDescription>Latest engine metadata and step trace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl border bg-muted/15 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Provider</div>
                <div className="mt-1 break-all font-medium">{formatProviderMeta(providerMeta)}</div>
              </div>
              <div className="rounded-2xl border bg-muted/15 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Cascade</div>
                <div className="mt-1 break-all font-medium">{formatCascadeResult(lastCascade)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {cascadeConfig ? `mode ${cascadeConfig.mode} / threshold ${cascadeConfig.escalationThreshold}` : "loading"}
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/15 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Trace</div>
                <div className="mt-2 space-y-1 font-mono text-xs leading-5 text-muted-foreground">
                  {traceLines.length === 0 ? (
                    <div>No trace yet.</div>
                  ) : (
                    traceLines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)
                  )}
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
                {lastChat ? `last chat cost $${Number(lastChat.runCostEstimateUsd || 0).toFixed(6)} / ${lastChat.tokenUsage?.totalTokens || 0} tokens` : "No chat run yet."}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border bg-card/85 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
      <div className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 line-clamp-2 text-lg font-semibold text-balance">{value}</div>
      <div className="mt-2 break-all text-sm leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}
