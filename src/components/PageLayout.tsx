import type { ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
}

export function PageLayout({ children, title }: PageLayoutProps) {
  return (
    <>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-40 flex items-center gap-2 h-12 border-b border-border bg-background/80 backdrop-blur-md px-3">
          <SidebarTrigger />
          {title && (
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          )}
        </header>
        <div className="flex-1">
          {children}
        </div>
      </SidebarInset>
    </>
  );
}
