import { NavLinks } from "./nav-links";

interface SidebarProps {
  role: string | null;
}

export function Sidebar({ role }: SidebarProps) {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-[#FFCC00] flex items-center justify-center">
            <span className="text-xs font-black text-[#D40511]">DHL</span>
          </div>
          <div>
            <span className="font-semibold text-sm block leading-tight">Knowledge Base</span>
            <span className="text-[10px] text-muted-foreground leading-tight">Logistics Operations</span>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <NavLinks role={role} />
      </div>
      <div className="border-t p-4">
        <p className="text-[10px] text-muted-foreground text-center">
          AI-Powered KB Automation v1.0
        </p>
      </div>
    </aside>
  );
}
