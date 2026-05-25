import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Blocks,
  Bot,
  ChevronRight,
  Code,
  MessageSquare,
  Package,
  Search,
  Sparkles,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { api, type SkillDefinition, type PromptTemplateDefinition } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHero } from "@/components/page-shell";
import { toast } from "sonner";

type View = "skills" | "prompts";

const SKILL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  code: Code,
  bot: Bot,
  ai: Sparkles,
  tool: Wrench,
  message: MessageSquare,
  block: Blocks,
  auto: Zap,
};

function skillIcon(title: string): React.ComponentType<{ className?: string }> {
  const lower = title.toLowerCase();
  for (const [key, icon] of Object.entries(SKILL_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return Package;
}

function SkillCard({ skill }: { skill: SkillDefinition }) {
  const Icon = skillIcon(skill.title);
  return (
    <div className="group flex items-start gap-3 rounded-xl border bg-card/80 px-4 py-3.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-card">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{skill.title}</span>
          {skill.telegramEnabled && (
            <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
              Telegram
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {skill.summary}
        </p>
        {skill.whenToUse && (
          <p className="mt-1.5 text-[11px] text-muted-foreground/70 line-clamp-1">
            <span className="font-medium">Use when:</span> {skill.whenToUse}
          </p>
        )}
      </div>
    </div>
  );
}

function PromptCard({ prompt }: { prompt: PromptTemplateDefinition }) {
  return (
    <div className="group flex items-start gap-3 rounded-xl border bg-card/80 px-4 py-3.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-card">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10">
        <Sparkles className="h-4 w-4 text-violet-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{prompt.title}</span>
          {prompt.telegramEnabled && (
            <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
              Telegram
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {prompt.description}
        </p>
        {prompt.suggestedSkills && prompt.suggestedSkills.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {prompt.suggestedSkills.map((s) => (
              <Badge key={s} variant="outline" className="rounded-full px-2 py-0 text-[10px] font-normal">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SkillsManagerPage() {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplateDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("skills");

  useEffect(() => {
    Promise.all([api.listSkills(), api.listPrompts()])
      .then(([s, p]) => {
        setSkills(s.skills);
        setPrompts(p.prompts);
      })
      .catch(() => toast.error("Failed to load skills"))
      .finally(() => setLoading(false));
  }, []);

  const lowerSearch = search.toLowerCase();

  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills;
    return skills.filter(
      (s) =>
        s.title.toLowerCase().includes(lowerSearch) ||
        s.summary.toLowerCase().includes(lowerSearch) ||
        s.whenToUse.toLowerCase().includes(lowerSearch),
    );
  }, [skills, lowerSearch, search]);

  const filteredPrompts = useMemo(() => {
    if (!search.trim()) return prompts;
    return prompts.filter(
      (p) =>
        p.title.toLowerCase().includes(lowerSearch) ||
        p.description.toLowerCase().includes(lowerSearch),
    );
  }, [prompts, lowerSearch, search]);

  const telegramSkills = useMemo(() => skills.filter((s) => s.telegramEnabled), [skills]);
  const telegramPrompts = useMemo(() => prompts.filter((p) => p.telegramEnabled), [prompts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHero
        eyebrow="Wings Of World Skills"
        title="Skills & Prompts"
        description={`${skills.length} skills and ${prompts.length} prompt templates available - ${telegramSkills.length} skills and ${telegramPrompts.length} prompts are Telegram-enabled.`}
        actions={
          <Link href="/chat">
            <Button variant="outline" size="sm" className="rounded-full gap-2">
              <MessageSquare className="h-4 w-4" />
              Use in Chat
            </Button>
          </Link>
        }
      />

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* View toggle */}
        <div className="flex items-center rounded-full border bg-muted/40 p-1 gap-1">
          <button
            type="button"
            onClick={() => setView("skills")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors cursor-pointer ${
              view === "skills"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            Skills ({skills.length})
          </button>
          <button
            type="button"
            onClick={() => setView("prompts")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors cursor-pointer ${
              view === "prompts"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Prompts ({prompts.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 text-xs"
            placeholder={`Search ${view}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Skill stats strip */}
      {view === "skills" && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full gap-1 px-3">
            <Package className="h-3 w-3" />
            {skills.length} total
          </Badge>
          <Badge variant="secondary" className="rounded-full gap-1 px-3">
            <MessageSquare className="h-3 w-3" />
            {telegramSkills.length} Telegram-ready
          </Badge>
          {search && (
            <Badge variant="outline" className="rounded-full gap-1 px-3">
              <Search className="h-3 w-3" />
              {filteredSkills.length} match
            </Badge>
          )}
        </div>
      )}

      {/* Content */}
      {view === "skills" && (
        <>
          {filteredSkills.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {skills.length === 0
                  ? "No skills configured. Add SKILL.md files to the skills/ folder."
                  : "No skills match your search."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSkills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          )}
        </>
      )}

      {view === "prompts" && (
        <>
          {/* Prompt stats */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full gap-1 px-3">
              <Sparkles className="h-3 w-3" />
              {prompts.length} total
            </Badge>
            <Badge variant="secondary" className="rounded-full gap-1 px-3">
              <MessageSquare className="h-3 w-3" />
              {telegramPrompts.length} Telegram-ready
            </Badge>
            {search && (
              <Badge variant="outline" className="rounded-full gap-1 px-3">
                <Search className="h-3 w-3" />
                {filteredPrompts.length} match
              </Badge>
            )}
          </div>

          {filteredPrompts.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {prompts.length === 0
                  ? "No prompt templates configured."
                  : "No prompts match your search."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPrompts.map((prompt) => (
                <PromptCard key={prompt.id} prompt={prompt} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Quick nav */}
      <Card className="border-dashed">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted-foreground">Quick links:</span>
            <Link href="/chat">
              <span className="flex items-center gap-1 text-primary hover:underline cursor-pointer">
                <MessageSquare className="h-3.5 w-3.5" />
                Chat with skills
              </span>
            </Link>
            <Link href="/workflow-builder">
              <span className="flex items-center gap-1 text-primary hover:underline cursor-pointer">
                <Blocks className="h-3.5 w-3.5" />
                Use in workflow
              </span>
            </Link>
            <Link href="/telegram">
              <span className="flex items-center gap-1 text-primary hover:underline cursor-pointer">
                <Bot className="h-3.5 w-3.5" />
                Telegram bridge
              </span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
