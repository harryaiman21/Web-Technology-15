"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import type { Profile } from "@/types/database";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  profile: Profile | null;
}

export function Header({ profile }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 md:hidden">
          <div className="h-8 w-8 rounded bg-[#FFCC00] flex items-center justify-center">
            <span className="text-xs font-black text-[#D40511]">DHL</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {profile && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium">{profile.full_name}</p>
              <Badge variant="secondary" className="text-xs capitalize">
                {profile.role}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
