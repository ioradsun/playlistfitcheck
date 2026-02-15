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
      <SidebarInset className="flex flex-col min-h-svh">
        <header className="sticky top-0 z-40 flex items-center gap-3 h-12 border-b border-border bg-background/80 backdrop-blur-md px-3">
          <SidebarTrigger />
          {title && (
            <span className="text-sm font-semibold text-foreground">{title}</span>
          )}
          {subtitle && (
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {subtitle}
            </span>
          )}
        </header>
        <div className="flex-1 flex flex-col">
          {children}
        </div>
      </SidebarInset>
    </>
  );
}