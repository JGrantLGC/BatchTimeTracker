import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEPARTMENTS,
  type Department,
} from "@/lib/app-context";
import {
  grantAdminByEmail,
  revokeAdmin,
  useAdminAccess,
} from "@/components/system/AdminAccess";
import { getSupabaseOrNull } from "@/lib/supabase-client";
import { reportDbError } from "@/lib/safe-error";

interface OperatorRecord {
  id: string;
  name: string;
  department: string;
  is_admin: boolean;
}

export default function UserManagementPage() {
  const { session, refreshAdminStatus } = useAdminAccess();
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState<Department>("filling");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<OperatorRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const currentUserId = session?.user?.id;

  async function loadOperators() {
    const sb = getSupabaseOrNull();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from("operators")
      .select("id, name, department, is_admin")
      .order("name", { ascending: true });
    if (error) {
      setMessage("Unable to load operators.");
      setLoading(false);
      return;
    }
    setOperators((data ?? []) as OperatorRecord[]);
    setLoading(false);
    setMessage(null);
  }

  useEffect(() => {
    void loadOperators();
  }, []);

  async function updateDepartment(op: OperatorRecord, newDept: Department) {
    const sb = getSupabaseOrNull();
    if (!sb) return;
    const { error } = await sb
      .from("operators")
      .update({ department: newDept, updated_at: new Date().toISOString() })
      .eq("id", op.id);
    if (error) {
      setMessage(`Failed to update ${op.name}'s department.`);
      return;
    }
    setOperators((prev) =>
      prev.map((o) => (o.id === op.id ? { ...o, department: newDept } : o)),
    );
  }

  async function toggleAdmin(op: OperatorRecord) {
    setMessage(null);
    try {
      if (op.is_admin) {
        await revokeAdmin(op.id);
        await refreshAdminStatus();
        setOperators((prev) =>
          prev.map((o) => (o.id === op.id ? { ...o, is_admin: false } : o)),
        );
        setMessage(`Removed administrator access from ${op.name}.`);
      } else {
        await grantAdminByEmail(op.name);
        setOperators((prev) =>
          prev.map((o) => (o.id === op.id ? { ...o, is_admin: true } : o)),
        );
        setMessage(`Granted administrator access to ${op.name}.`);
      }
    } catch {
      setMessage(
        op.is_admin
          ? `Could not remove administrator access from ${op.name}.`
          : `Could not grant administrator access to ${op.name}. Make sure they have signed up first.`,
      );
    }
  }

  async function handleAdd() {
    setAddError(null);
    const trimmed = newName.trim();
    if (!trimmed) {
      setAddError("Enter an operator name.");
      return;
    }
    const sb = getSupabaseOrNull();
    if (!sb) {
      setAddError("Database is not available.");
      return;
    }
    setAddBusy(true);
    const { data, error } = await sb
      .from("operators")
      .insert({ name: trimmed, department: newDept })
      .select("id, name, department, is_admin")
      .single();
    if (error) {
      setAddError(reportDbError("Failed to add operator", error));
      setAddBusy(false);
      return;
    }
    setOperators((prev) =>
      [...prev, data as OperatorRecord].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    setNewName("");
    setNewDept("filling");
    setAddOpen(false);
    setMessage(`Added operator ${trimmed}.`);
    setAddBusy(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const sb = getSupabaseOrNull();
    if (!sb) return;
    setDeleteBusy(true);
    if (deleteTarget.is_admin) {
      try {
        await revokeAdmin(deleteTarget.id);
        await refreshAdminStatus();
      } catch {
        // Non-fatal — proceed to delete the operator row
      }
    }
    const { error } = await sb
      .from("operators")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      setMessage(`Failed to delete ${deleteTarget.name}.`);
      setDeleteBusy(false);
      return;
    }
    setOperators((prev) => prev.filter((o) => o.id !== deleteTarget.id));
    setMessage(`Deleted operator ${deleteTarget.name}.`);
    setDeleteTarget(null);
    setDeleteBusy(false);
  }

  const filtered = operators.filter((op) =>
    op.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading operators…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Administration
        </Link>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          User Management
        </h1>
        <p className="text-muted-foreground text-sm">
          Add, edit, and delete operators. Toggle administrator access with the
          radio buttons.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search operator name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={() => setAddOpen(true)} className="ml-auto">
          <Plus className="mr-1 h-4 w-4" />
          Add Operator
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Department</th>
              <th className="text-center px-4 py-3 font-semibold">Admin</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((op) => (
              <tr key={op.id} className="border-t">
                <td className="px-4 py-3 font-medium">{op.name}</td>
                <td className="px-4 py-3">
                  <select
                    value={op.department}
                    onChange={(e) =>
                      void updateDepartment(op, e.target.value as Department)
                    }
                    className="border rounded-md h-9 px-2 text-sm bg-transparent"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`admin-${op.id}`}
                        checked={op.is_admin}
                        onChange={() => void toggleAdmin(op)}
                        className="h-4 w-4 accent-brand-lead"
                      />
                      <ShieldCheck className="h-4 w-4 text-brand-lead" />
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`admin-${op.id}`}
                        checked={!op.is_admin}
                        onChange={() => void toggleAdmin(op)}
                        className="h-4 w-4"
                      />
                      <Shield className="h-4 w-4 text-muted-foreground" />
                    </label>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    title="Delete operator"
                    onClick={() => setDeleteTarget(op)}
                    disabled={op.id === currentUserId}
                    className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-status-error hover:bg-status-error/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="text-center px-4 py-8 text-muted-foreground"
                >
                  {search.trim() ? "No matches." : "No operators yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}

      {/* Add Operator Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Operator
            </DialogTitle>
            <DialogDescription>
              Create a new operator record. You can grant administrator access
              after adding them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-op-name">Operator Name</Label>
              <Input
                id="new-op-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jane Doe"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-op-dept">Department</Label>
              <select
                id="new-op-dept"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value as Department)}
                className="border rounded-md h-10 px-2 w-full bg-transparent"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {addError && (
              <p className="text-sm text-status-error font-medium">{addError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBusy}>
              Cancel
            </Button>
            <Button onClick={() => void handleAdd()} disabled={addBusy || !newName.trim()}>
              {addBusy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Add Operator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Operator Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-status-error" />
              Delete Operator
            </DialogTitle>
            <DialogDescription>
              Permanently delete {deleteTarget?.name} from the operator list.
              {deleteTarget?.is_admin && " Their administrator access will also be removed."}
              {" "}This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleDelete()}
              disabled={deleteBusy}
              className="bg-status-error hover:bg-status-error/90 text-white"
            >
              {deleteBusy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Delete Operator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
