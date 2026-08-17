import { FileQuestion, Infinity as InfinityIcon, ShieldCheck, X, Zap } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DropZone } from "../components/DropZone";
import { ToolCard } from "../components/ToolCard";
import { Button, Card } from "../components/ui";
import { extensionOf, formatBytes, kindOf } from "../lib/files";
import { stageFiles } from "../lib/handoff";
import { HUBS, toolsForKind, toolsInHub, type FileKind, type ToolDef } from "../lib/registry";

interface Dropped {
  file: File;
  kind: FileKind | null;
  matches: ToolDef[];
}

const PROMISES = [
  {
    icon: ShieldCheck,
    title: "Your files stay yours",
    body: "Everything happens inside your browser. Nothing is uploaded to a server, so there is nothing for anyone to leak or read.",
  },
  {
    icon: InfinityIcon,
    title: "No limits, no counting",
    body: "No “2 tasks a day”, no file size caps, no watermarks on the way out. Work through a hundred files if you need to.",
  },
  {
    icon: Zap,
    title: "No account, no payment",
    body: "Nothing to sign up for and nothing to cancel. There is no paid tier hiding behind the useful buttons.",
  },
];

function DroppedPanel({ dropped, onClear }: { dropped: Dropped; onClear: () => void }) {
  const navigate = useNavigate();
  const { file, matches } = dropped;

  const open = (tool: ToolDef) => {
    stageFiles([file]);
    navigate(`/t/${tool.slug}`);
  };

  const ready = matches.filter((t) => t.status === "ready");
  const soon = matches.filter((t) => t.status !== "ready");

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{file.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {formatBytes(file.size)}
            {dropped.kind ? ` · ${dropped.kind}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear file">
          <X className="size-4" />
        </Button>
      </div>

      {matches.length === 0 ? (
        <div className="mt-5 flex items-start gap-2.5 text-sm text-muted">
          <FileQuestion className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
          <p>
            Filesmith doesn’t have a tool for this kind of file yet. Have a look
            through the categories below in case something fits.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-5 text-sm font-medium text-ink">What you can do with it</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {ready.map((tool) => (
              <button
                key={tool.slug}
                type="button"
                onClick={() => open(tool)}
                className="group rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:border-accent hover:bg-accent-wash"
              >
                <span className="block text-sm font-semibold text-ink">{tool.name}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  {tool.blurb}
                </span>
              </button>
            ))}
          </div>

          {soon.length > 0 && (
            <p className="mt-4 text-xs leading-relaxed text-faint">
              Coming soon for this file: {soon.map((t) => t.name).join(", ")}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export default function Home() {
  const [dropped, setDropped] = useState<Dropped | null>(null);

  const handleFiles = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const kind = kindOf(file);
    setDropped({
      file,
      kind,
      matches: kind ? toolsForKind(kind, extensionOf(file.name)) : [],
    });
  };

  return (
    <>
      {/* ------------------------------------------------------------- Hero */}
      <section className="mx-auto max-w-3xl px-4 pt-14 pb-4 text-center sm:px-6 sm:pt-20">
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-ink sm:text-5xl">
          Every file tool. Free. In your browser.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
          Edit, convert, create and clean up your documents, pictures and media —
          without paywalls, sign-ups, or handing your files to a stranger’s server.
        </p>

        <DropZone
          className="mt-9 text-left"
          onFiles={handleFiles}
          title="Drop a file to see what you can do with it"
          hint="Or press Ctrl K to search every tool. Nothing leaves your device."
        />

        {dropped && (
          <div className="text-left">
            <DroppedPanel dropped={dropped} onClear={() => setDropped(null)} />
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- Promises */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-3">
          {PROMISES.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="size-5 text-accent" aria-hidden />
              <h2 className="mt-3 text-[0.9375rem] font-semibold text-ink">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- Hubs */}
      <div className="mx-auto mt-20 max-w-6xl space-y-14 px-4 sm:px-6">
        {HUBS.map((hub) => {
          const tools = toolsInHub(hub.id);
          if (tools.length === 0) return null;
          return (
            <section key={hub.id}>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-ink">
                    <Link to={`/${hub.id}`} className="transition-colors hover:text-accent">
                      {hub.name}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">{hub.blurb}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <ToolCard key={tool.slug} tool={tool} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* ------------------------------------------------------- Why it's free */}
      <section className="mx-auto mt-20 max-w-3xl px-4 sm:px-6">
        <Card className="p-6 sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            Why this is free, and how it stays free
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
            <p>
              Most file websites are expensive to run because your file travels to
              their servers, gets processed on their computers, and travels back.
              That costs them money on every single file, which is why the useful
              buttons eventually ask for a subscription.
            </p>
            <p>
              Filesmith works the other way round. The tools are downloaded to your
              browser and run on your own computer, so processing a file costs
              nothing to run. That is what makes “free with no limits” an honest
              promise rather than a trial offer — and it means your bank statements,
              contracts and photos never leave the machine you’re sitting at.
            </p>
            <p>
              The whole thing is open source, so you don’t have to take our word for
              any of it.{" "}
              <a
                href="https://github.com/Soumoditya/filesmith"
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                Read the code
              </a>
              , or open your browser’s network tab while you use a tool and watch
              nothing get sent.
            </p>
          </div>
        </Card>
      </section>
    </>
  );
}
