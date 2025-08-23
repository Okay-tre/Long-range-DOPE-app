// src/components/Router.tsx
import React, { useEffect, useMemo, useState, ReactNode } from "react";

export type Route = {
  path: string;        // e.g. "/calc"
  component: ReactNode;
};

type RouterProps = {
  routes: Route[];
  defaultPath?: string; // fallback when hash is empty or unknown
};

const normalize = (p: string) => (p.startsWith("/") ? p : `/${p}`);

export function Router({ routes, defaultPath = "/calc" }: RouterProps) {
  const getPath = () => {
    const hash = window.location.hash.slice(1);
    return normalize(hash || defaultPath);
  };

  const [currentPath, setCurrentPath] = useState<string>(getPath);

  useEffect(() => {
    const onHashChange = () => {
      const next = getPath();
      setCurrentPath(next);
      // scroll to top on "route change"
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPath]);

  // Exact match only
  const routeToRender = useMemo(
    () => routes.find((r) => normalize(r.path) === currentPath) ??
          routes.find((r) => normalize(r.path) === normalize(defaultPath)) ??
          routes[0],
    [routes, currentPath, defaultPath]
  );

  return <>{routeToRender?.component}</>;
}

// Programmatic navigation helper
export function navigate(path: string) {
  window.location.hash = normalize(path);
}
