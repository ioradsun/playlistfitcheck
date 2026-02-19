import type { ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function PageLayout({ children, title, subtitle }: PageLayoutProps) {
  return (
    <>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-svh overflow-hidden">
        <header className="sticky top-0 z-40 flex items-center gap-3 h-12 border-b border-border bg-background/80 backdrop-blur-md px-3">
          <SidebarTrigger />
          {subtitle && (
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
              {subtitle}
            </span>
          )}
        </header>
        <div id="page-scroll-container" className="flex-1 flex flex-col overflow-y-auto" style={{ paddingBottom: 120 }}>
          {children}
        </div>
      </SidebarInset>
    </>
  );
}