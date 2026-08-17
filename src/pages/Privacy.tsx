import { useEffect } from "react";
import { Card } from "../components/ui";

export default function Privacy() {
  useEffect(() => {
    document.title = "Privacy — Filesmith";
    return () => {
      document.title = "Filesmith — Every file tool. Free. In your browser.";
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6 sm:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Privacy
      </h1>
      <p className="mt-3 text-lg leading-relaxed text-muted">
        The short version: we don’t collect anything, because there’s nowhere for
        it to go.
      </p>

      <div className="mt-8 space-y-6">
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink">Your files</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Files you open in Filesmith are never uploaded. Every tool runs as code
            inside your own browser, working on the file in your computer’s memory.
            When you close the tab, it’s gone. We could not read your documents even
            if we wanted to — there is no server that ever receives them.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            You don’t have to trust that. Open your browser’s developer tools, go to
            the Network tab, and use any tool on this site. You’ll see the page and
            its code download once, and then nothing further.
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink">What we store</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            No accounts, so no names, emails or passwords. No analytics, no tracking
            pixels, no advertising networks, and no cookies for any of that — which
            is why you have never seen a cookie banner here.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Two small things are kept in your own browser and never sent anywhere:
            your light/dark theme preference, and a cache of the larger tool
            components so they don’t have to be downloaded again. Clearing your
            browser data removes both.
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink">Hosting</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The site is served as static files from Vercel. Like any web host, their
            servers see the ordinary request for the page itself — an IP address and
            a browser version — which is unavoidable for anything on the internet.
            That request contains the page, not your files.
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold text-ink">Checking for yourself</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Filesmith is open source. If any of the above stopped being true, the
            change would be visible in the code history for anyone to see.{" "}
            <a
              href="https://github.com/Soumoditya/filesmith"
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              The source is here
            </a>
            .
          </p>
        </Card>
      </div>
    </div>
  );
}
