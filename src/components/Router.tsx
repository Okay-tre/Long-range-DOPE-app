import { useState, useEffect, ReactNode } from 'react';

type Route = {
  path: string;
  component: ReactNode;
};

type RouterProps = {
  routes: Route[];
  defaultPath?: string;
};

export function Router({ routes, defaultPath = '/equipment' }: RouterProps) {
  const [currentPath, setCurrentPath] = useState(() => {
    // Get initial path from hash or use default
    const hash = window.location.hash.slice(1);
    return hash || defaultPath;
  });

  useEffect(() => {
    // Update path when hash changes
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      setCurrentPath(hash || defaultPath);
    };

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    // Clean up listener
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [defaultPath]);

  // Find matching route
  const currentRoute = routes.find(route => route.path === currentPath);
  
  // If no route matches, show the default route
  const routeToRender = currentRoute || routes.find(route => route.path === defaultPath);

  return <>{routeToRender?.component}</>;
}

// Helper function for navigation
export function navigate(path: string) {
  window.location.hash = path;
}
