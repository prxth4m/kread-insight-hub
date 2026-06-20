import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Archive, Loader2 } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { Store } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/restaurants/")({
  component: AdminRestaurants,
});

const schema = z.object({
  name: z.string().min(2, "Min 2 chars").max(100),
  display_name: z.string().min(2).max(100),
  platform: z.enum(["zomato", "swiggy"]),
});
type Form = z.infer<typeof schema>;

function AdminRestaurants() {
  const qc = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: restaurants } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("is_archived", false).order("display_name");
      return data ?? [];
    },
  });

  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { name: "", display_name: "", platform: "zomato" } });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", display_name: "", platform: "zomato" });
    setSheetOpen(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    form.reset({ name: r.name, display_name: r.display_name, platform: r.platform });
    setSheetOpen(true);
  };

  const onSubmit = async (vals: Form) => {
    if (editing) {
      const { error } = await supabase.from("restaurants").update(vals).eq("id", editing.id);
      if (error) return toast.error(error.message);
      await logAudit("restaurant_edited", "restaurant", editing.id, vals);
      toast.success("Restaurant updated");
    } else {
      const { data, error } = await supabase.from("restaurants").insert(vals).select().single();
      if (error) return toast.error(error.message);
      if (data) await logAudit("restaurant_created", "restaurant", data.id, vals);
      toast.success("Restaurant created");
    }
    setSheetOpen(false);
    qc.invalidateQueries({ queryKey: ["admin-restaurants"] });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Active restaurants ({restaurants?.length ?? 0})</CardTitle>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild><Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> Add restaurant</Button></SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{editing ? "Edit restaurant" : "Add restaurant"}</SheetTitle>
              <SheetDescription>Restaurants must exist here before CSV uploads can match rows to them.</SheetDescription>
            </SheetHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="name">CSV name</Label>
                <Input id="name" {...form.register("name")} placeholder="Must match the Restaurant column in CSV" />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="display_name">Display name</Label>
                <Input id="display_name" {...form.register("display_name")} />
                {form.formState.errors.display_name && <p className="text-xs text-destructive">{form.formState.errors.display_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select value={form.watch("platform")} onValueChange={(v) => form.setValue("platform", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zomato">Zomato</SelectItem>
                    <SelectItem value="swiggy">Swiggy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <SheetFooter>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? "Save changes" : "Create"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </CardHeader>
      <CardContent>
        {(restaurants ?? []).length === 0 ? (
          <EmptyState icon={Store} title="No restaurants yet" description="Add your first restaurant to start collecting analytics." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display name</TableHead>
                <TableHead>CSV name</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(restaurants ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.display_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.name}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{r.platform}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <ArchiveDialog restaurant={r} onArchived={() => qc.invalidateQueries({ queryKey: ["admin-restaurants"] })} />
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

function ArchiveDialog({ restaurant, onArchived }: { restaurant: any; onArchived: () => void }) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handle = async () => {
    if (reason.trim().length < 3) return toast.error("Please enter a reason");
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("restaurants").update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: u.user?.id,
      archive_reason: reason,
    }).eq("id", restaurant.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    await logAudit("restaurant_archived", "restaurant", restaurant.id, { reason });
    toast.success("Restaurant archived");
    setOpen(false);
    onArchived();
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost"><Archive className="h-3.5 w-3.5" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {restaurant.display_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Archived restaurants are hidden from dashboards, rankings, and reports. Historical data is preserved and restorable.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this restaurant being archived?" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); handle(); }} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}