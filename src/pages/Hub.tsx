import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ToolCard } from "../components/ToolCard";
import { HUBS, toolsInHub, type HubId } from "../lib/registry";

export default function Hub() {
  const { hubId } = useParams<{ hubId: string }>();
  const hub = HUBS.find((h) => h.id === hubId);

  useEffect(() => {
    if (hub) document.title = `${hub.name} tools — Filesmith`;
    return () => {
      document.title = "Filesmith — Every file tool. Free. In your browser.";
    };
  }, [hub]);

  if (!hub) return <Navigate to="/" replace />;

  const tools = toolsInHub(hub.id as HubId);
  const ready = tools.filter((t) => t.status === "ready");

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          {hub.name}
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted">{hub.blurb}</p>
        <p className="mt-3 text-sm text-faint">
          {ready.length} of {tools.length} tools ready — the rest are on the way.
        </p>
      </header>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <ToolCard key={tool.slug} tool={tool} />
        ))}
      </div>
    </div>
  );
}
