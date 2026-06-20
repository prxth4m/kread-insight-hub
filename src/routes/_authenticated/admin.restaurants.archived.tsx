import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Archive, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/restaurants/archived")({
  component: ArchivedPage,
});

function ArchivedPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["archived-restaurants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*, profiles!restaurants_archived_by_fkey(full_name, email)")
        .eq("is_archived", true)
        .order("archived_at", { ascending: false });
      return data ?? [];
    },
  });

  const handleRestore = async (id: string) => {
    const { error } = await supabase.from("restaurants").update({
      is_archived: false, archived_at: null, archived_by: null, archive_reason: null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    await logAudit("restaurant_restored", "restaurant", id);
    toast.success("Restaurant restored");
    qc.invalidateQueries({ queryKey: ["archived-restaurants"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Archived restaurants</CardTitle>
      </CardHeader>
      <CardContent>
        {(data ?? []).length === 0 ? (
          <EmptyState icon={Archive} title="No archived restaurants" description="Archive a restaurant from Manage Restaurants to see it here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restaurant</TableHead>
                <TableHead>Archived</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Archived by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.display_name}</TableCell>
                  <TableCell className="text-xs">{r.archived_at ? formatDateTime(r.archived_at) : "—"}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{r.archive_reason ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.profiles?.full_name ?? r.profiles?.email ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => handleRestore(r.id)}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore</Button>
                    <DeleteDialog restaurant={r} onDeleted={() => qc.invalidateQueries({ queryKey: ["archived-restaurants"] })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteDialog({ restaurant, onDeleted }: { restaurant: any; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const matches = typed === restaurant.display_name;

  const handle = async () => {
    setLoading(true);
    const { error } = await supabase.from("restaurants").delete().eq("id", restaurant.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    await logAudit("restaurant_deleted", "restaurant", restaurant.id, { name: restaurant.display_name });
    toast.success("Restaurant deleted");
    setOpen(false);
    onDeleted();
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="mr-1 h-3.5 w-3.5" /> Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete {restaurant.display_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. All associated metrics, raw imports, and alerts will be lost. Type the restaurant name to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={restaurant.display_name} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); handle(); }} disabled={!matches || loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete forever
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}