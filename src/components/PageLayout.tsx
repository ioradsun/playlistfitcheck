import type { ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

export interface PageLayoutProps {
  children?: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
}

export function PageLayout({ children, title, subtitle, headerRight }: PageLayoutProps) {
  return (
    <>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-svh overflow-hidden">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-background/80 backdrop-blur-md px-3" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)', minHeight: 'calc(3rem + max(env(safe-area-inset-top, 0px), 0px))', paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)' }}>
          <SidebarTrigger className="md:hidden" />
          {subtitle && (
            <span className="font-mono text-[11px] tracking-widest text-primary">
              {subtitle}
            </span>
          )}
          {headerRight && <div className="ml-auto flex items-center gap-3">{headerRight}</div>}
        </header>
        <div id="page-scroll-container" className="flex-1 flex flex-col overflow-y-auto" style={{ paddingBottom: 120 }}>
          {children}
        </div>
      </SidebarInset>
    </>
  );
}