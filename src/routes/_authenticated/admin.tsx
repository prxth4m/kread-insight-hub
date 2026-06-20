import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Archive, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin");
    if (!roles || roles.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
  head: () => ({ meta: [{ title: "Admin — Kread Insights" }] }),
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabs = [
    { to: "/admin/restaurants", label: "Restaurants", icon: ShieldCheck },
    { to: "/admin/restaurants/archived", label: "Archived", icon: Archive },
    { to: "/admin/audit-log", label: "Audit log", icon: ScrollText },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="text-sm text-muted-foreground">Manage restaurants, archives, and review activity.</p>
      </div>
      <Card className="p-1">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => {
            const active = pathname === t.to || (t.to !== "/admin/restaurants" && pathname.startsWith(t.to)) || (t.to === "/admin/restaurants" && pathname === "/admin/restaurants");
            return (
              <Button asChild key={t.to} variant={active ? "secondary" : "ghost"} size="sm" className={cn("gap-2")}>
                <Link to={t.to}><t.icon className="h-4 w-4" />{t.label}</Link>
              </Button>
            );
          })}
        </div>
      </Card>
      <Outlet />
    </div>
  );
}