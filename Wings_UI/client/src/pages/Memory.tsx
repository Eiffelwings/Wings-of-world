import { useEffect, useState } from "react";
import { api, type MemoryEntry } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHero, PageMetricCard } from "@/components/page-shell";
import { Brain, Database, Loader2, Pencil, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type MemoryDraft = {
  content: string;
  memoryType: MemoryEntry["memoryType"];
  source: string;
  importanceScore: number;
};

const EMPTY_DRAFT: MemoryDraft = {
  content: "",
  memoryType: "fact",
  source: "wings-of-world-ui",
  importanceScore: 0.7,
};

function normalizeImportance(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

export default function MemoryPage() {
  const [stats, setStats] = useState<{
    totalMemories: number;
    workflowSnapshots: number;
    avgImportance: number;
    byType: Record<string, number>;
  } | null>(null);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingNew, setSavingNew] = useState(false);
  const [draft, setDraft] = useState<MemoryDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MemoryDraft>(EMPTY_DRAFT);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const memoryTypes = stats?.byType ? Object.entries(stats.byType) : [];

  const load = async (search = query) => {
    setLoading(true);
    try {
      const [statsData, listData] = await Promise.all([
        api.getMemoryStats(),
        api.listMemories(search || undefined),
      ]);
      setStats(statsData);
      setEntries(listData.memories);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("");
  }, []);

  const addMemory = async () => {
    if (!draft.content.trim()) return;
    setSavingNew(true);
    try {
      await api.addMemory({
        content: draft.content.trim(),
        memoryType: draft.memoryType,
        source: draft.source.trim() || "wings-of-world-ui",
        importanceScore: normalizeImportance(draft.importanceScore),
      });
      setDraft(EMPTY_DRAFT);
      await load(query);
      toast.success("Memory saved");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingNew(false);
    }
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditingId(entry.id);
    setEditDraft({
      content: entry.content,
      memoryType: entry.memoryType,
      source: entry.source,
      importanceScore: entry.importanceScore,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft.content.trim()) return;
    setSavingEntryId(editingId);
    try {
      await api.updateMemory(editingId, {
        content: editDraft.content.trim(),
        memoryType: editDraft.memoryType,
        source: editDraft.source.trim() || "manual",
        importanceScore: normalizeImportance(editDraft.importanceScore),
      });
      cancelEdit();
      await load(query);
      toast.success("Memory updated");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingEntryId(null);
    }
  };

  const deleteEntry = async (entry: MemoryEntry) => {
    if (!window.confirm(`Delete this memory?\n\n${entry.content.slice(0, 180)}`)) {
      return;
    }
    setDeletingEntryId(entry.id);
    try {
      await api.deleteMemory(entry.id);
      if (editingId === entry.id) {
        cancelEdit();
      }
      await load(query);
      toast.success("Memory deleted");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingEntryId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHero
        eyebrow="Memory vault"
        title="Operational Memory"
        description="Capture durable facts, preferences, summaries, and context that Wings Of World can retrieve later during chat, workflow execution, and Telegram operations."
        status={{
          label: loading ? "syncing" : `${entries.length} loaded`,
          variant: loading ? "outline" : "secondary",
        }}
        actions={(
          <Button
            variant="secondary"
            className="rounded-full"
            onClick={() =>
              document.getElementById("memory-capture-card")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            Save new memory
          </Button>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PageMetricCard
            title="Memories"
            value={String(stats?.totalMemories ?? 0)}
            detail="Total entries stored in the shared retrieval layer."
            icon={Database}
          />
          <PageMetricCard
            title="Workflow snapshots"
            value={String(stats?.workflowSnapshots ?? 0)}
            detail="Workflow outputs already promoted into long-term memory."
            icon={Brain}
          />
          <PageMetricCard
            title="Average importance"
            value={Number(stats?.avgImportance ?? 0).toFixed(2)}
            detail="Higher values are more likely to be retrieved again."
            icon={Sparkles}
            tone={(stats?.avgImportance ?? 0) >= 0.7 ? "ready" : "neutral"}
          />
          <PageMetricCard
            title="Search query"
            value={query.trim() ? `"${query.trim()}"` : "All memory"}
            detail={query.trim() ? `${entries.length} matching entries` : "Browsing the full memory vault"}
            icon={Search}
            tone={query.trim() ? "warning" : "neutral"}
          />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-[380px,1fr]">
        <div className="space-y-4">
          <Card id="memory-capture-card" className="rounded-[1.75rem] shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-xl">Capture memory</CardTitle>
              <CardDescription>
                Save reusable context that Wings Of World can retrieve later. Keep each entry atomic and specific.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <MemoryEditor draft={draft} onChange={setDraft} />
              <Button onClick={addMemory} disabled={savingNew || !draft.content.trim()} className="rounded-full">
                {savingNew && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Memory
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-xl">Quality guide</CardTitle>
              <CardDescription>
                Good memory stays useful because it is scoped, attributable, and easy to retrieve.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
              <div className="rounded-2xl border bg-muted/20 p-4">
                Use one memory per fact or takeaway instead of pasting long mixed notes.
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                Set <span className="font-medium text-foreground">source</span> to something traceable like <code>chat:session-id</code> or <code>workflow:daily-ops</code>.
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                Keep importance high only for context you want Wings Of World to bias toward repeatedly.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[1.75rem] shadow-sm">
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-xl">Search and review</CardTitle>
                <CardDescription>Find, inspect, edit, and delete stored memory entries.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {memoryTypes.slice(0, 5).map(([type, count]) => (
                  <Badge key={type} variant="secondary" className="rounded-full px-3 py-1">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    load(e.currentTarget.value);
                  }
                }}
                placeholder="Search memory..."
              />
              <Button variant="secondary" onClick={() => load(query)} className="rounded-full">
                Search
              </Button>
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => {
                  setQuery("");
                  load("");
                }}
              >
                Reset
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <InlineMetric
                title="Visible now"
                value={String(entries.length)}
                detail={query.trim() ? "Matched the current search query" : "Total entries shown in the list"}
              />
              <InlineMetric
                title="Editing"
                value={editingId ? "1 active" : "Idle"}
                detail={editingId ? "An entry is open in edit mode" : "No in-place edit currently open"}
              />
              <InlineMetric
                title="Top type"
                value={memoryTypes.length ? String(memoryTypes[0][0]) : "No stats yet"}
                detail={memoryTypes.length ? `${memoryTypes[0][1]} entries in the leading memory type` : "Add a memory to start building distribution"}
              />
            </div>

            <div className="space-y-3">
              {loading && (
                <div className="flex items-center gap-2 rounded-2xl border p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading memory...
                </div>
              )}

              {!loading && entries.length === 0 && (
                <div className="rounded-[1.5rem] border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                  {query.trim()
                    ? "No memory entries matched this search. Try a broader phrase or clear the filter."
                    : "No memory entries yet. Save the first durable fact, summary, or preference from the capture panel."}
                </div>
              )}

              {!loading &&
                entries.map((entry) => {
                  const isEditing = editingId === entry.id;
                  return (
                    <div key={entry.id} className="space-y-3 rounded-[1.5rem] border bg-card/80 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="rounded-full px-3 py-1">
                              {entry.memoryType}
                            </Badge>
                            <span>{entry.source}</span>
                            <span>importance {entry.importanceScore.toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Updated {new Date(entry.updatedAt).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" className="rounded-full" onClick={() => startEdit(entry)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => deleteEntry(entry)}
                            disabled={deletingEntryId === entry.id}
                          >
                            {deletingEntryId === entry.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="space-y-4 rounded-[1.5rem] border bg-muted/30 p-4">
                          <MemoryEditor draft={editDraft} onChange={setEditDraft} />
                          <div className="flex gap-2">
                            <Button
                              onClick={saveEdit}
                              className="rounded-full"
                              disabled={savingEntryId === entry.id || !editDraft.content.trim()}
                            >
                              {savingEntryId === entry.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="mr-2 h-4 w-4" />
                              )}
                              Save Changes
                            </Button>
                            <Button variant="ghost" className="rounded-full" onClick={cancelEdit}>
                              <X className="mr-2 h-4 w-4" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-6">{entry.content}</div>
                      )}
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MemoryEditor({
  draft,
  onChange,
}: {
  draft: MemoryDraft;
  onChange: (next: MemoryDraft) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label>Type</Label>
        <Select
          value={draft.memoryType}
          onValueChange={(value) =>
            onChange({ ...draft, memoryType: value as MemoryEntry["memoryType"] })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fact">fact</SelectItem>
            <SelectItem value="preference">preference</SelectItem>
            <SelectItem value="context">context</SelectItem>
            <SelectItem value="summary">summary</SelectItem>
            <SelectItem value="insight">insight</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>Source</Label>
          <Input
            value={draft.source}
            onChange={(e) => onChange({ ...draft, source: e.target.value })}
            placeholder="chat:session-id"
          />
        </div>

        <div className="grid gap-2">
          <Label>Importance (0 to 1)</Label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={draft.importanceScore}
            onChange={(e) =>
              onChange({
                ...draft,
                importanceScore: normalizeImportance(Number(e.target.value)),
              })
            }
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Content</Label>
        <Textarea
          value={draft.content}
          onChange={(e) => onChange({ ...draft, content: e.target.value })}
          className="min-h-[180px]"
        />
      </div>
    </div>
  );
}

function InlineMetric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border bg-muted/15 p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}
