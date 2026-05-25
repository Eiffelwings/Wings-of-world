import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { api, type ChatMessage, type ExecutionRecord, type MemoryEntry, type PromptTemplateDefinition, type ResourceContent, type ResourceDefinition, type SkillDefinition, type TokenUsage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Clock3,
  History,
  Layers3,
  Loader2,
  MessageSquareText,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

export default function ChatPage() {
  const formatTokenUsage = (usage?: TokenUsage | null) => {
    if (!usage || !usage.totalTokens) return "0 tokens";
    return `${usage.totalTokens} tokens`;
  };
  const formatCost = (value?: number | null) => `$${Number(value || 0).toFixed(6)}`;

  const [location] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", content: "You are a helpful assistant." },
  ]);
  const [sessions, setSessions] = useState<
    Array<{ id: string; title: string; updatedAt: string; messageCount: number; tokenUsage?: TokenUsage; costEstimateUsd?: number }>
  >([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [memoryContext, setMemoryContext] = useState<MemoryEntry[]>([]);
  const [executionHistory, setExecutionHistory] = useState<ExecutionRecord[]>([]);
  const [replayRunId, setReplayRunId] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateDefinition[]>([]);
  const [resources, setResources] = useState<ResourceDefinition[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [selectedResourceUris, setSelectedResourceUris] = useState<string[]>([]);
  const [appliedSkills, setAppliedSkills] = useState<SkillDefinition[]>([]);
  const [appliedResources, setAppliedResources] = useState<ResourceContent[]>([]);
  const [lastRunUsage, setLastRunUsage] = useState<TokenUsage | null>(null);
  const [sessionTokenUsage, setSessionTokenUsage] = useState<TokenUsage | null>(null);
  const [lastRunCost, setLastRunCost] = useState(0);
  const [sessionCost, setSessionCost] = useState(0);
  const [sessionRailOpen, setSessionRailOpen] = useState(false);
  const [historyRailOpen, setHistoryRailOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "Unknown";
    return new Date(value).toLocaleString();
  };

  const refreshSessions = () => {
    api.listChatSessions().then((data) => setSessions(data.sessions)).catch(() => {});
  };

  const refreshHistory = (sessionId?: string | null) => {
    api.listExecutions({
      kind: "chat",
      targetId: sessionId || undefined,
      limit: 12,
    }).then((data) => setExecutionHistory(data.entries)).catch(() => {});
  };

  useEffect(() => {
    refreshSessions();
    refreshHistory(null);
    api.listSkills().then((data) => setSkills(data.skills || [])).catch(() => {});
    api.listPrompts().then((data) => setPromptTemplates(data.prompts || [])).catch(() => {});
    api.listResources().then((data) => setResources(data.resources || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prompt = params.get("prompt");
    const sessionId = params.get("sessionId");
    const replay = params.get("replay");
    if (prompt) {
      setInput(prompt);
    }
    if (sessionId) {
      loadSession(sessionId);
    }
    setReplayRunId(replay);
  }, [location]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadSession = async (sessionId: string) => {
    try {
      const data = await api.getChatSession(sessionId);
      setActiveSessionId(sessionId);
      setRenameTitle(data.session.title);
      setMessages(data.session.messages);
      setMemoryContext([]);
      setAppliedSkills([]);
      setAppliedResources([]);
      setLastRunUsage(null);
      setSessionTokenUsage(data.session.tokenUsage || null);
      setLastRunCost(0);
      setSessionCost(data.session.costEstimateUsd || 0);
      refreshHistory(sessionId);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const startNewSession = () => {
    setActiveSessionId(null);
    setRenameTitle("");
    setSessionSearch("");
    setMemoryContext([]);
    setAppliedSkills([]);
    setAppliedResources([]);
    setLastRunUsage(null);
    setSessionTokenUsage(null);
    setLastRunCost(0);
    setSessionCost(0);
    setMessages([{ role: "system", content: "You are a helpful assistant." }]);
    refreshHistory(null);
  };

  const renameSession = async () => {
    if (!activeSessionId || !renameTitle.trim()) return;
    setSavingTitle(true);
    try {
      await api.renameChatSession(activeSessionId, renameTitle.trim());
      refreshSessions();
      toast.success("Session renamed");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingTitle(false);
    }
  };

  const deleteSession = async () => {
    if (!activeSessionId) return;
    setDeletingSession(true);
    try {
      await api.deleteChatSession(activeSessionId);
      startNewSession();
      refreshSessions();
      toast.success("Session deleted");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeletingSession(false);
    }
  };

  const saveLatestReplyToMemory = async () => {
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (!latestAssistant) return;
    setSavingMemory(true);
    try {
      await api.addMemory({
        content: latestAssistant.content,
        memoryType: "summary",
        source: activeSessionId ? `chat:${activeSessionId}` : "chat",
        importanceScore: 0.75,
      });
      toast.success("Latest reply saved to memory");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingMemory(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const response = await api.chatWithSession(
        next,
        activeSessionId || undefined,
        undefined,
        selectedSkillIds,
        selectedResourceUris,
      );
      setActiveSessionId(response.sessionId);
      if (!activeSessionId) {
        setRenameTitle(text.slice(0, 60));
      }
      setMemoryContext(response.memoryContext || []);
      setAppliedSkills(response.appliedSkills || []);
      setAppliedResources(response.appliedResources || []);
      setLastRunUsage(response.tokenUsage || null);
      setSessionTokenUsage(response.sessionTokenUsage || null);
      setLastRunCost(response.runCostEstimateUsd || 0);
      setSessionCost(response.sessionCostEstimateUsd || 0);
      setMessages([...next, { role: "assistant", content: response.content }]);
      refreshSessions();
      refreshHistory(response.sessionId);
    } catch (e: any) {
      toast.error(e.message);
      setMessages(next);
      refreshHistory(activeSessionId);
    } finally {
      setLoading(false);
    }
  };

  const visibleSessions = useMemo(
    () =>
      sessions.filter((session) => {
        if (!sessionSearch.trim()) return true;
        return session.title.toLowerCase().includes(sessionSearch.trim().toLowerCase());
      }),
    [sessions, sessionSearch],
  );

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );

  const nonSystemMessages = useMemo(
    () => messages.filter((message) => message.role !== "system"),
    [messages],
  );

  const contextAttachmentsCount = selectedSkillIds.length + selectedResourceUris.length;
  const defaultContextTab = skills.length > 0 ? "skills" : promptTemplates.length > 0 ? "prompts" : "resources";

  const toggleSkill = (skillId: string) => {
    setSelectedSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId],
    );
  };

  const toggleResource = (uri: string) => {
    setSelectedResourceUris((current) =>
      current.includes(uri)
        ? current.filter((value) => value !== uri)
        : [...current, uri],
    );
  };

  const usePromptTemplate = async (template: PromptTemplateDefinition) => {
    try {
      const response = await api.renderPrompt(template.id, input.trim());
      setInput(response.prompt.rendered);
      if (response.prompt.suggestedSkills?.length) {
        setSelectedSkillIds(response.prompt.suggestedSkills);
      }
      toast.success(`Loaded prompt: ${template.title}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const clearSelectedSkills = () => setSelectedSkillIds([]);
  const clearSelectedResources = () => setSelectedResourceUris([]);
  const clearAllContext = () => {
    setSelectedSkillIds([]);
    setSelectedResourceUris([]);
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-6 xl:grid-cols-[320px,1fr,320px]">
      <Card className="order-2 overflow-hidden rounded-[1.75rem] shadow-sm xl:order-1 xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)]">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Sessions</CardTitle>
              <CardDescription>Persistent chats, renamed and replayable.</CardDescription>
            </div>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={startNewSession}>
              New
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="xl:hidden">
            <Button
              variant="outline"
              className="w-full justify-between rounded-full"
              onClick={() => setSessionRailOpen((current) => !current)}
            >
              <span>{sessionRailOpen ? "Hide sessions" : "Show sessions"}</span>
              {sessionRailOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>

          <div className={`${sessionRailOpen ? "block" : "hidden"} space-y-4 xl:block`}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Search sessions..."
                className="pl-9"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <SessionRailMetric
                title="Visible"
                value={String(visibleSessions.length)}
                detail={sessionSearch.trim() ? "Filtered by search" : "All saved sessions"}
              />
              <SessionRailMetric
                title="Messages"
                value={String(activeSession?.messageCount || nonSystemMessages.length)}
                detail={activeSession ? "In current session" : "In current draft"}
              />
            </div>

            {activeSessionId ? (
              <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Current session</div>
                    <div className="text-xs text-muted-foreground">
                      Last updated {formatDateTime(activeSession?.updatedAt)}
                    </div>
                  </div>
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    live
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  <Input
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    placeholder="Session title"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      onClick={renameSession}
                      disabled={savingTitle || !renameTitle.trim()}
                    >
                      {savingTitle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Rename
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={deleteSession}
                      disabled={deletingSession}
                    >
                      {deletingSession ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                Start a new prompt to create a persistent session. Once the first reply lands, Wings Of World will save and track it automatically.
              </div>
            )}

            <div className="space-y-2 overflow-y-auto xl:max-h-[calc(100vh-26rem)]">
              {visibleSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => loadSession(session.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm ${
                    activeSessionId === session.id ? "border-primary bg-primary/5 shadow-sm" : "bg-card/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{session.title || "Untitled chat"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {session.messageCount} messages
                      </div>
                    </div>
                    <Badge variant={activeSessionId === session.id ? "default" : "secondary"} className="rounded-full">
                      {activeSessionId === session.id ? "active" : "saved"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2 xl:grid-cols-1">
                    <div>{formatDateTime(session.updatedAt)}</div>
                    <div>{formatTokenUsage(session.tokenUsage)}</div>
                    <div>{formatCost(session.costEstimateUsd)}</div>
                  </div>
                </button>
              ))}
              {visibleSessions.length === 0 && (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  No matching sessions.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="order-1 flex min-h-0 flex-col gap-6 xl:order-2">
        <section className="rounded-[2rem] border bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(29,78,216,0.08),rgba(8,145,178,0.08))] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Chat workspace
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Chat Playground</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Build a reply with the right skills, prompt template, and resource context before sending. Sessions, memory retrieval, and execution tracking stay attached to the same workspace.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={saveLatestReplyToMemory}
              disabled={savingMemory}
            >
              {savingMemory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Save Reply To Memory
            </Button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetric
              title="Conversation"
              value={activeSession ? activeSession.title || "Saved session" : "Draft"}
              detail={activeSessionId ? activeSessionId : "Not saved yet"}
              icon={<MessageSquareText className="h-4 w-4" />}
            />
            <WorkspaceMetric
              title="Latest run"
              value={formatTokenUsage(lastRunUsage)}
              detail={`Cost ${formatCost(lastRunCost)}`}
              icon={<Sparkles className="h-4 w-4" />}
            />
            <WorkspaceMetric
              title="Session total"
              value={formatTokenUsage(sessionTokenUsage)}
              detail={`Cost ${formatCost(sessionCost)}`}
              icon={<Layers3 className="h-4 w-4" />}
            />
            <WorkspaceMetric
              title="Context attached"
              value={String(contextAttachmentsCount)}
              detail={`${selectedSkillIds.length} skills | ${selectedResourceUris.length} resources`}
              icon={<Brain className="h-4 w-4" />}
            />
          </div>
        </section>

        <Card className="rounded-[1.75rem] shadow-sm">
          <CardHeader className="border-b">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">Prepare the next reply</CardTitle>
                <CardDescription>
                  Keep the next request focused before you send it. Prompt templates overwrite the composer on purpose.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedSkillIds.length ? (
                  <Button variant="outline" size="sm" className="rounded-full" onClick={clearSelectedSkills}>
                    <X className="mr-2 h-3.5 w-3.5" />
                    Clear skills
                  </Button>
                ) : null}
                {selectedResourceUris.length ? (
                  <Button variant="outline" size="sm" className="rounded-full" onClick={clearSelectedResources}>
                    <X className="mr-2 h-3.5 w-3.5" />
                    Clear resources
                  </Button>
                ) : null}
                {contextAttachmentsCount > 0 ? (
                  <Button variant="secondary" size="sm" className="rounded-full" onClick={clearAllContext}>
                    Reset context
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {selectedSkillIds.map((skillId) => {
                const skill = skills.find((entry) => entry.id === skillId);
                return (
                  <Badge key={skillId} variant="secondary" className="rounded-full px-3 py-1">
                    skill: {skill?.title || skillId}
                  </Badge>
                );
              })}
              {selectedResourceUris.map((uri) => (
                <Badge key={uri} variant="secondary" className="rounded-full px-3 py-1">
                  resource: {resources.find((entry) => entry.uri === uri)?.name || uri}
                </Badge>
              ))}
              {contextAttachmentsCount === 0 ? (
                <div className="rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground">
                  No extra context selected yet
                </div>
              ) : null}
            </div>

            <Tabs defaultValue={defaultContextTab} className="gap-4">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl bg-muted/40 p-2">
                {skills.length > 0 ? (
                  <TabsTrigger value="skills" className="flex-none rounded-xl px-4 py-2">
                    Skills
                  </TabsTrigger>
                ) : null}
                {promptTemplates.length > 0 ? (
                  <TabsTrigger value="prompts" className="flex-none rounded-xl px-4 py-2">
                    Prompt Library
                  </TabsTrigger>
                ) : null}
                {resources.length > 0 ? (
                  <TabsTrigger value="resources" className="flex-none rounded-xl px-4 py-2">
                    Resource Context
                  </TabsTrigger>
                ) : null}
              </TabsList>

              {skills.length > 0 ? (
                <TabsContent value="skills">
                  <ContextPanel
                    title="Skills"
                    description="Guide how Wings Of World should frame the next response."
                    icon={<WandSparkles className="h-4 w-4" />}
                    footer="Skill selection only affects future replies."
                  >
                    <div className="flex flex-wrap gap-2">
                      {skills.map((skill) => {
                        const selected = selectedSkillIds.includes(skill.id);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => toggleSkill(skill.id)}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "bg-background hover:border-primary/40"
                            }`}
                            title={skill.whenToUse}
                          >
                            {skill.title}
                          </button>
                        );
                      })}
                    </div>
                  </ContextPanel>
                </TabsContent>
              ) : null}

              {promptTemplates.length > 0 ? (
                <TabsContent value="prompts">
                  <ContextPanel
                    title="Prompt Library"
                    description="Start from reusable prompts instead of rewriting the same framing."
                    icon={<Sparkles className="h-4 w-4" />}
                    footer="Templates can pre-select recommended skills."
                  >
                    <div className="space-y-2">
                      {promptTemplates.map((prompt) => (
                        <button
                          key={prompt.id}
                          type="button"
                          onClick={() => usePromptTemplate(prompt)}
                          className="w-full rounded-2xl border bg-background p-3 text-left transition hover:border-primary/40 hover:shadow-sm"
                        >
                          <div className="text-sm font-semibold">{prompt.title}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            {prompt.description}
                          </div>
                          {prompt.suggestedSkills?.length ? (
                            <div className="mt-2 text-[11px] text-muted-foreground">
                              Suggested skills: {prompt.suggestedSkills.join(", ")}
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </ContextPanel>
                </TabsContent>
              ) : null}

              {resources.length > 0 ? (
                <TabsContent value="resources">
                  <ContextPanel
                    title="Resource Context"
                    description="Attach live system context, recent memory, or other readable resources."
                    icon={<Layers3 className="h-4 w-4" />}
                    footer="Resources selected here are attached to the next chat request."
                  >
                    <div className="space-y-2">
                      {resources.map((resource) => {
                        const selected = selectedResourceUris.includes(resource.uri);
                        return (
                          <button
                            key={resource.uri}
                            type="button"
                            onClick={() => toggleResource(resource.uri)}
                            className={`w-full rounded-2xl border p-3 text-left transition ${
                              selected
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "bg-background hover:border-primary/40"
                            }`}
                          >
                            <div className="text-sm font-semibold">{resource.name}</div>
                            <div className="mt-1 text-xs leading-5 text-muted-foreground">
                              {resource.description}
                            </div>
                            <div className="mt-2 text-[11px] text-muted-foreground">{resource.uri}</div>
                          </button>
                        );
                      })}
                    </div>
                  </ContextPanel>
                </TabsContent>
              ) : null}
            </Tabs>
          </CardContent>
        </Card>

        <Card className="flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-[1.75rem] shadow-sm">
          <CardHeader className="border-b">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">Conversation</CardTitle>
                <CardDescription>
                  {activeSessionId ? "Replying inside the selected saved session." : "Draft mode until the first successful response is saved."}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {replayRunId ? (
                  <Badge className="rounded-full px-3 py-1">Replay ready</Badge>
                ) : null}
                {selectedSkillIds.length ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {selectedSkillIds.length} skills
                  </Badge>
                ) : null}
                {selectedResourceUris.length ? (
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {selectedResourceUris.length} resources
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 p-5">
            {replayRunId && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-950">
                Loaded from History run <code>{replayRunId}</code>. Review the restored prompt, then send when ready.
              </div>
            )}

            {(appliedSkills.length > 0 || memoryContext.length > 0 || appliedResources.length > 0) && (
              <div className="grid gap-3 xl:grid-cols-3">
                {appliedSkills.length > 0 ? (
                  <EvidencePanel
                    title="Applied skills"
                    tone="emerald"
                    items={appliedSkills.map((skill) => `${skill.title}: ${skill.summary}`)}
                  />
                ) : null}
                {memoryContext.length > 0 ? (
                  <EvidencePanel
                    title="Memory context"
                    tone="amber"
                    items={memoryContext.map((entry) => `[${entry.memoryType}] ${entry.content}`)}
                  />
                ) : null}
                {appliedResources.length > 0 ? (
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-50/70 p-4 text-sm">
                    <div className="font-semibold text-violet-900">Attached resources</div>
                    <div className="mt-3 space-y-2">
                      {appliedResources.map((resource) => (
                        <div key={resource.uri} className="rounded-xl border bg-white/80 p-3">
                          <div className="text-xs font-medium text-violet-950">{resource.uri}</div>
                          <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-violet-950">
                            {resource.text.slice(0, 260)}
                            {resource.text.length > 260 ? "..." : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-[1.5rem] border bg-muted/15 p-4">
              {nonSystemMessages.length === 0 ? (
                <div className="flex h-full min-h-[20rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed bg-background/70 px-6 text-center">
                  <MessageSquareText className="h-10 w-10 text-muted-foreground" />
                  <div className="mt-4 text-lg font-semibold">No messages yet</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Compose a prompt below. Use a prompt template if you want faster framing, or attach system resources when the next answer needs live operational context.
                  </div>
                </div>
              ) : (
                nonSystemMessages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-[1.5rem] px-4 py-3 text-sm leading-6 shadow-sm ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "border bg-background"
                      }`}
                    >
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] opacity-70">
                        {message.role === "user" ? "You" : "Wings Of World"}
                      </div>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  </div>
                ))
              )}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-[1.5rem] border bg-background px-4 py-3 text-sm shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Wings Of World is preparing the next reply...
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="sticky bottom-0 z-10 rounded-[1.5rem] border bg-background/95 p-4 shadow-sm backdrop-blur">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Composer</div>
                  <div className="text-xs text-muted-foreground">
                    Press <code>Ctrl/Cmd + Enter</code> to send quickly.
                  </div>
                </div>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {input.trim().length} chars
                </Badge>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Type a message... (Ctrl/Cmd+Enter to send)"
                  className="min-h-[120px] rounded-2xl"
                />
                <div className="flex flex-col gap-2 lg:w-48">
                  <Button onClick={send} disabled={loading || !input.trim()} className="h-11 rounded-full">
                    <Send className="mr-2 h-4 w-4" />
                    Send
                  </Button>
                  <div className="rounded-2xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                    The next request uses the selected skills, attached resources, and the current session state.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="order-3 rounded-[1.75rem] shadow-sm xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)]">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Run History</CardTitle>
              <CardDescription>
                {activeSessionId ? "Recent runs for this session." : "Recent chat runs across Wings Of World."}
              </CardDescription>
            </div>
            <History className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="xl:hidden">
            <Button
              variant="outline"
              className="w-full justify-between rounded-full"
              onClick={() => setHistoryRailOpen((current) => !current)}
            >
              <span>{historyRailOpen ? "Hide run history" : "Show run history"}</span>
              {historyRailOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>

          <div className={`${historyRailOpen ? "block" : "hidden"} space-y-4 xl:block`}>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <SessionRailMetric
                title="Visible runs"
                value={String(executionHistory.length)}
                detail={activeSessionId ? "Scoped to session" : "Global chat history"}
              />
              <SessionRailMetric
                title="Latest latency"
                value={executionHistory[0]?.durationMs ? `${executionHistory[0].durationMs} ms` : "-"}
                detail="Most recent chat execution"
              />
              <SessionRailMetric
                title="Latest cost"
                value={formatCost(executionHistory[0]?.costEstimateUsd)}
                detail="Most recent run estimate"
              />
            </div>

            <div className="space-y-3 overflow-y-auto xl:max-h-[calc(100vh-22rem)]">
              {executionHistory.length === 0 && (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  No chat runs yet.
                </div>
              )}
              {executionHistory.map((entry) => (
                <div key={entry.id} className="rounded-2xl border bg-card/80 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{entry.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</div>
                    </div>
                    <Badge
                      variant={entry.status === "success" ? "secondary" : "destructive"}
                      className="rounded-full px-3 py-1 capitalize"
                    >
                      {entry.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2 xl:grid-cols-1">
                    <div>{formatTokenUsage(entry.tokenUsage)}</div>
                    <div>{formatCost(entry.costEstimateUsd)}</div>
                    <div>{entry.durationMs ? `${entry.durationMs} ms` : "No latency captured"}</div>
                  </div>
                  <div className="mt-3 text-xs leading-5 text-muted-foreground">{entry.summary}</div>
                  {entry.inputPreview && (
                    <div className="mt-3 rounded-xl bg-muted/35 p-3 text-xs">
                      <div className="font-medium">Prompt</div>
                      <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{entry.inputPreview}</div>
                    </div>
                  )}
                  {entry.outputPreview && (
                    <div className="mt-2 rounded-xl bg-muted/20 p-3 text-xs">
                      <div className="font-medium">Reply</div>
                      <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{entry.outputPreview}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkspaceMetric({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border bg-card/85 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <Clock3 className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 line-clamp-2 text-lg font-semibold text-balance">{value}</div>
      <div className="mt-2 break-all text-sm leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}

function ContextPanel({
  title,
  description,
  icon,
  footer,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  footer: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border bg-muted/15 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
      </div>
      <div className="mt-4">{children}</div>
      <div className="mt-4 text-[11px] leading-5 text-muted-foreground">{footer}</div>
    </div>
  );
}

function EvidencePanel({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "amber";
}) {
  const toneClasses =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-50/70 text-emerald-950"
      : "border-amber-500/20 bg-amber-50/70 text-amber-950";
  const headingClasses = tone === "emerald" ? "text-emerald-900" : "text-amber-900";

  return (
    <div className={`rounded-2xl border p-4 text-sm ${toneClasses}`}>
      <div className={`font-semibold ${headingClasses}`}>{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-black/5 bg-white/70 p-3 text-xs leading-5">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionRailMetric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border bg-muted/15 p-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}
