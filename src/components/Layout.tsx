import clsx from "clsx";
import { Monitor, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { HUBS } from "../lib/registry";
import { useTheme } from "../lib/theme";
import { Logo } from "./Logo";
import { SearchPalette } from "./SearchPalette";

const REPO_URL = "https://github.com/Soumoditya/filesmith";

/** Lucide dropped its brand icons, so the GitHub mark lives here. */
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function ThemeToggle() {
  const { pref, cycle } = useTheme();
  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  const label =
    pref === "light" ? "Light theme" : pref === "dark" ? "Dark theme" : "System theme";

  return (
    <button
      type="button"
      onClick={cycle}
      title={`${label} — click to change`}
      aria-label={`${label}. Click to change.`}
      className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink touch:size-11"
    >
      <Icon className="size-[1.125rem]" />
    </button>
  );
}

/**
 * Category navigation for phones. The header's inline nav is hidden below
 * `lg`, which previously left touch users with no way to browse categories
 * at all — only search or the footer.
 */
function MobileHubBar() {
  return (
    <nav
      aria-label="Tool categories"
      className="scroll-x border-b border-line bg-canvas/85 backdrop-blur-md lg:hidden"
    >
      <ul className="flex w-max gap-1.5 px-4 py-2 sm:px-6">
        {HUBS.map((hub) => (
          <li key={hub.id}>
            <NavLink
              to={`/${hub.id}`}
              className={({ isActive }) =>
                clsx(
                  "flex h-9 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors touch:h-11",
                  isActive
                    ? "border-accent bg-accent-wash text-accent"
                    : "border-line text-muted hover:text-ink",
                )
              }
            >
              {hub.name}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Header({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center rounded touch:h-11" aria-label="Filesmith home">
          <Logo />
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
          {HUBS.map((hub) => (
            <NavLink
              key={hub.id}
              to={`/${hub.id}`}
              className={({ isActive }) =>
                clsx(
                  "rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  isActive ? "bg-sunken text-ink" : "text-muted hover:text-ink",
                )
              }
            >
              {hub.name}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1 lg:flex-none">
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex h-9 touch:h-11 items-center gap-2 rounded-lg border border-line px-2.5 touch:px-3.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-ink sm:pr-2"
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden sm:inline">Search tools</span>
            <kbd className="ml-1 hidden rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[0.6875rem] text-faint md:inline">
              Ctrl K
            </kbd>
          </button>

          <ThemeToggle />

          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Source code on GitHub"
            className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink touch:size-11"
          >
            <GithubMark className="size-[1.0625rem]" />
          </a>
        </div>
      </div>

      <MobileHubBar />
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
              Free tools for everyday files. Everything runs on your own device.
            </p>
          </div>

          <nav className="lg:col-span-2">
            <h2 className="text-xs font-semibold tracking-wide text-faint uppercase">
              Tools
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
              {HUBS.map((hub) => (
                <li key={hub.id}>
                  <Link
                    to={`/${hub.id}`}
                    className="inline-flex items-center text-sm text-muted transition-colors hover:text-ink touch:min-h-11"
                  >
                    {hub.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav>
            <h2 className="text-xs font-semibold tracking-wide text-faint uppercase">
              About
            </h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  to="/privacy"
                  className="inline-flex items-center text-sm text-muted transition-colors hover:text-ink touch:min-h-11"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center text-sm text-muted transition-colors hover:text-ink touch:min-h-11"
                >
                  Source code
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <p className="mt-10 border-t border-line pt-6 text-xs text-faint">
          Filesmith is free and open source. No accounts, no adverts, no tracking,
          and no file ever leaves your device.
        </p>
      </div>
    </footer>
  );
}

export function Layout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();

  // Ctrl/Cmd-K from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Navigating to a new tool should start at the top, not wherever the
  // previous page was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:text-accent-ink"
      >
        Skip to content
      </a>

      <Header onOpenSearch={() => setSearchOpen(true)} />

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <Footer />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
