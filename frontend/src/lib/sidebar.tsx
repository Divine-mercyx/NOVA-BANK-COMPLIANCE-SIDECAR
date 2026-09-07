import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface SidebarContextValue {
  expanded: boolean;
  toggle: () => void;
  width: number;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "nova-sidebar-expanded";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? stored === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(expanded));
  }, [expanded]);

  const toggle = () => setExpanded((v) => !v);
  const width = expanded ? 240 : 72;

  return (
    <SidebarContext.Provider value={{ expanded, toggle, width }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
