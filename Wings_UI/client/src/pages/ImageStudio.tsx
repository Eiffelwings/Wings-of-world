import { useEffect, useMemo, useState } from "react";
import { api, type GeneratedImageRecord } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHero, PageMetricCard } from "@/components/page-shell";
import { Download, Image as ImageIcon, Loader2, RefreshCw, Sparkles, WandSparkles } from "lucide-react";
import { toast } from "sonner";

const SIZE_OPTIONS = ["1024x1024", "1024x1536", "1536x1024"] as const;
const QUALITY_OPTIONS = ["auto", "low", "medium", "high"] as const;

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImagePreview({
  image,
  prominent = false,
  showDownload = true,
}: {
  image: GeneratedImageRecord;
  prominent?: boolean;
  showDownload?: boolean;
}) {
  const [objectUrl, setObjectUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let localUrl = "";
    setObjectUrl("");
    setError("");

    api.fetchGeneratedImage(image.filename)
      .then((blob) => {
        if (!active) return;
        localUrl = URL.createObjectURL(blob);
        setObjectUrl(localUrl);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });

    return () => {
      active = false;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [image.filename]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className={`relative bg-muted ${prominent ? "aspect-[4/3]" : "aspect-square"}`}>
        {objectUrl ? (
          <img
            src={objectUrl}
            alt={image.prompt}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {error ? "Image unavailable" : "Loading image..."}
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full">{image.model}</Badge>
          <Badge variant="outline" className="rounded-full">{image.size}</Badge>
          <Badge variant="outline" className="rounded-full">{image.quality}</Badge>
        </div>
        <p className="line-clamp-3 text-sm text-muted-foreground">{image.prompt}</p>
        {image.revisedPrompt ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">Revised: {image.revisedPrompt}</p>
        ) : null}
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{formatBytes(image.bytes)}</span>
          {showDownload && objectUrl ? (
            <Button asChild variant="outline" size="sm" className="h-8 rounded-md">
              <a href={objectUrl} download={image.filename}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ImageStudioPage() {
  const [prompt, setPrompt] = useState(
    "A premium SaaS operations command center for AI workflows, realistic product UI, crisp lighting, high detail",
  );
  const [model, setModel] = useState("gpt-image-1");
  const [size, setSize] = useState<(typeof SIZE_OPTIONS)[number]>("1024x1024");
  const [quality, setQuality] = useState<(typeof QUALITY_OPTIONS)[number]>("auto");
  const [images, setImages] = useState<GeneratedImageRecord[]>([]);
  const [currentImage, setCurrentImage] = useState<GeneratedImageRecord | null>(null);
  const [loadingImages, setLoadingImages] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const latestImages = useMemo(() => images.slice(0, 12), [images]);
  const providerLabel = currentImage?.model || model || "gpt-image-1";

  const refreshImages = async () => {
    setLoadingImages(true);
    try {
      const data = await api.listGeneratedImages();
      setImages(data.images);
      setCurrentImage((current) => current || data.images[0] || null);
    } catch (err: any) {
      toast.error(err?.message || String(err));
    } finally {
      setLoadingImages(false);
    }
  };

  useEffect(() => {
    void refreshImages();
  }, []);

  const generate = async () => {
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 3) {
      setError("Prompt must be at least 3 characters.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const result = await api.generateImage({
        prompt: trimmedPrompt,
        model: model.trim() || "gpt-image-1",
        size,
        quality,
      });
      setCurrentImage(result.image);
      setImages((list) => [result.image, ...list.filter((item) => item.id !== result.image.id)]);
      toast.success("Image generated");
    } catch (err: any) {
      const message = err?.message || String(err);
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHero
        eyebrow="Image generation"
        title="Image Studio"
        description="Create product visuals, workflow diagrams, thumbnails, concept art, and campaign assets from a prompt while keeping generated files inside the local Wings Of World data directory."
        status={{ label: providerLabel, variant: currentImage ? "default" : "secondary" }}
        actions={(
          <Button variant="secondary" className="rounded-md" onClick={() => void refreshImages()} disabled={loadingImages}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        )}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <PageMetricCard
            title="Generated"
            value={String(images.length)}
            detail="Images stored in the local data directory."
            icon={ImageIcon}
            tone={images.length ? "ready" : "neutral"}
          />
          <PageMetricCard
            title="Size"
            value={size}
            detail="Current output dimensions."
            icon={WandSparkles}
          />
          <PageMetricCard
            title="Quality"
            value={quality}
            detail="Provider-side rendering quality."
            icon={Sparkles}
            tone={quality === "high" ? "warning" : "neutral"}
          />
        </div>
      </PageHero>

      <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="border-b">
            <CardTitle>Prompt</CardTitle>
            <CardDescription>OpenAI Images API compatible generation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div className="space-y-2">
              <Label htmlFor="image-prompt">Prompt</Label>
              <Textarea
                id="image-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={8}
                className="resize-none"
              />
            </div>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="image-model">Model</Label>
                <Input
                  id="image-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="gpt-image-1"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="image-size">Size</Label>
                  <select
                    id="image-size"
                    value={size}
                    onChange={(event) => setSize(event.target.value as typeof size)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image-quality">Quality</Label>
                  <select
                    id="image-quality"
                    value={quality}
                    onChange={(event) => setQuality(event.target.value as typeof quality)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {QUALITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <Button className="w-full rounded-md" onClick={() => void generate()} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generate Image
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {currentImage ? (
            <ImagePreview image={currentImage} prominent />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
              {loadingImages ? "Loading image history..." : "No generated images yet."}
            </div>
          )}

          <Card className="rounded-lg shadow-sm">
            <CardHeader className="border-b">
              <CardTitle>Recent Images</CardTitle>
              <CardDescription>Local generation history.</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {latestImages.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {latestImages.map((image) => (
                    <button
                      key={image.id}
                      type="button"
                      className="text-left"
                      onClick={() => setCurrentImage(image)}
                  >
                      <ImagePreview image={image} showDownload={false} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
                  {loadingImages ? "Loading..." : "Generated images will appear here."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
