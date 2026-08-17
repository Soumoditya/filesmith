import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import Home from "./pages/Home";

// The homepage ships in the main bundle; everything else splits out.
const Hub = lazy(() => import("./pages/Hub"));
const ToolRoute = lazy(() => import("./pages/ToolRoute"));
const Privacy = lazy(() => import("./pages/Privacy"));

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">
        Nothing here
      </h1>
      <p className="mt-2 text-sm text-muted">
        That page doesn’t exist. It may have moved.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
      >
        Back to all tools
      </Link>
    </div>
  );
}

const RouteFallback = (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Spinner />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route
            path="t/:slug"
            element={<Suspense fallback={RouteFallback}><ToolRoute /></Suspense>}
          />
          <Route
            path="privacy"
            element={<Suspense fallback={RouteFallback}><Privacy /></Suspense>}
          />
          <Route
            path=":hubId"
            element={<Suspense fallback={RouteFallback}><Hub /></Suspense>}
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
