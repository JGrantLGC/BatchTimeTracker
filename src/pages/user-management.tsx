import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ShieldCheck,
  Shield,
  KeyRound,
  CheckCircle2,
  Circle,
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
  syncAuthorizedOperatorNames,
  syncAuthorizedUsersFromOperators,
  type Department,
} from "@/lib/app-context";
import {
  grantAdminByEmail,
  listAdminUsers,
  revokeAdminByEmail,
  useAdminAccess,
} from "@/components/system/AdminAccess";
import { getSupabaseOrNull } from "@/lib/supabase-client";
import { reportDbError } from "@/lib/safe-error";

interface OperatorRecord {
  id: string;
  name: string;
  email: string | null;
  department: string;
  is_admin: boolean;
  is_authorized: boolean;
}

export default function UserManagementPage() {
  const { session, refreshAdminStatus } = useAdminAccess();
  const [operators, setOperators] = useState<OperatorRecord[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDept, setNewDept] = useState<Department>("filling");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<OperatorRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Edit operator dialog
  const [editTarget, setEditTarget] = useState<OperatorRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editDept, setEditDept] = useState<Department>("filling");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Password prompt for creating an auth account when granting admin
  const [pwTarget, setPwTarget] = useState<OperatorRecord | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const currentUserId = session?.user?.id;

  async function loadOperators() {
    const sb = getSupabaseOrNull();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from("operators")
      .select("id, name, email, department, is_admin, is_authorized")
      .order("name", { ascending: true });
    if (error) {
      setMessage("Unable to load operators.");
      setLoading(false);
      return;
    }
    let records = (data ?? []) as OperatorRecord[];

    // Administrator access lives in admin_users, not in the operators column.
    // The column is only a cached copy, so the screen must never trust it on its
    // own: reading it alone shows a revoked account as still an administrator,
    // or a granted one as not.
    try {
      const admins = await listAdminUsers();
      const adminEmails = new Set(
        admins.map((a) => (a.email ?? "").trim().toLowerCase()).filter(Boolean),
      );
      records = records.map((o) => ({
        ...o,
        is_admin: Boolean(o.email && adminEmails.has(o.email.trim().toLowerCase())),
      }));
      await Promise.all(
        records
          .filter((o) => o.is_admin !== ((data ?? []) as OperatorRecord[]).find((d) => d.id === o.id)?.is_admin)
          .map((o) => markOperatorAdminColumn(o.id, o.is_admin)),
      );
    } catch {
      setMessage("Administrator status could not be confirmed and may be out of date.");
    }

    setOperators(records);
    syncAuthorizedOperators(records);
    setLoading(false);
  }

  function syncAuthorizedOperators(records: OperatorRecord[]) {
    const authorized = records.filter((o) => o.is_authorized);
    syncAuthorizedUsersFromOperators(
      authorized.filter((o) => o.email).map((o) => o.email!),
    );
    syncAuthorizedOperatorNames(authorized.map((o) => o.name));
  }

  /** Keeps the cached operators.is_admin column in step with admin_users. */
  async function markOperatorAdminColumn(id: string, isAdmin: boolean) {
    const sb = getSupabaseOrNull();
    if (!sb) return;
    await sb
      .from("operators")
      .update({ is_admin: isAdmin, updated_at: new Date().toISOString() })
      .eq("id", id);
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

  async function createAuthAccount(email: string, password: string, displayName: string): Promise<boolean> {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-signup`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? "Unable to create the account.");
    }
    return true;
  }

  async function toggleAuthorized(op: OperatorRecord) {
    const sb = getSupabaseOrNull();
    if (!sb) return;
    const { error } = await sb
      .from("operators")
      .update({ is_authorized: !op.is_authorized, updated_at: new Date().toISOString() })
      .eq("id", op.id);
    if (error) {
      setMessage(`Failed to update authorized status for ${op.name}.`);
      return;
    }
    setOperators((prev) => {
      const updated = prev.map((o) =>
        o.id === op.id ? { ...o, is_authorized: !op.is_authorized } : o,
      );
      syncAuthorizedOperators(updated);
      return updated;
    });
  }

  async function toggleAdmin(op: OperatorRecord) {
    setMessage(null);
    try {
      if (op.is_admin) {
        const revokeEmail = op.email?.trim();
        if (!revokeEmail) {
          setMessage(
            `${op.name} has no email address, so their administrator access cannot be matched. Add their email first.`,
          );
          return;
        }
        await revokeAdminByEmail(revokeEmail);
        await markOperatorAdminColumn(op.id, false);
        await refreshAdminStatus();
        setOperators((prev) =>
          prev.map((o) => (o.id === op.id ? { ...o, is_admin: false } : o)),
        );
        setMessage(`Removed administrator access from ${op.name}.`);
      } else {
        const email = op.email?.trim();
        if (!email) {
          setMessage(
            `${op.name} has no email address. Add one before granting admin access.`,
          );
          return;
        }
        try {
          await grantAdminByEmail(email);
          setOperators((prev) =>
            prev.map((o) => (o.id === op.id ? { ...o, is_admin: true } : o)),
          );
          await markOperatorAdminColumn(op.id, true);
          setMessage(`Granted administrator access to ${op.name}.`);
        } catch {
          // Account doesn't exist yet — prompt for password to create it
          setPwTarget(op);
          setPwValue("");
          setPwError(null);
        }
      }
    } catch {
      setMessage(
        op.is_admin
          ? `Could not remove administrator access from ${op.name}.`
          : `Could not grant administrator access to ${op.name}.`,
      );
    }
  }

  async function handlePwConfirm() {
    if (!pwTarget) return;
    setPwError(null);
    const email = pwTarget.email?.trim();
    if (!email) {
      setPwError("This operator has no email address.");
      return;
    }
    if (
      pwValue.length < 8 ||
      !/[A-Za-z]/.test(pwValue) ||
      !/[0-9]/.test(pwValue) ||
      !/[^A-Za-z0-9]/.test(pwValue)
    ) {
      setPwError("Use at least 8 characters with a letter, a number, and a special character.");
      return;
    }
    setPwBusy(true);
    try {
      await createAuthAccount(email, pwValue, pwTarget.name);
      await grantAdminByEmail(email);
      setOperators((prev) =>
        prev.map((o) => (o.id === pwTarget.id ? { ...o, is_admin: true } : o)),
      );
      await markOperatorAdminColumn(pwTarget.id, true);
      setMessage(`Created an account for ${pwTarget.name} and granted administrator access.`);
      setPwTarget(null);
      setPwValue("");
    } catch (cause: unknown) {
      setPwError(cause instanceof Error ? cause.message : "Unable to create the account.");
    } finally {
      setPwBusy(false);
    }
  }

  function openEditDialog(op: OperatorRecord) {
    setEditTarget(op);
    setEditName(op.name);
    setEditEmail(op.email ?? "");
    setEditDept(op.department as Department);
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editTarget) return;
    setEditError(null);
    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim().toLowerCase();
    if (!trimmedName) {
      setEditError("Enter an operator name.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setEditError("Enter a valid email address.");
      return;
    }
    const sb = getSupabaseOrNull();
    if (!sb) {
      setEditError("Database is not available.");
      return;
    }
    setEditBusy(true);
    const { data, error } = await sb
      .from("operators")
      .update({ name: trimmedName, email: trimmedEmail, department: editDept, updated_at: new Date().toISOString() })
      .eq("id", editTarget.id)
      .select("id, name, email, department, is_admin, is_authorized")
      .single();
    if (error) {
      setEditError(reportDbError("Failed to update operator", error));
      setEditBusy(false);
      return;
    }
    setOperators((prev) =>
      [...prev.filter((o) => o.id !== editTarget.id), data as OperatorRecord].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setMessage(`Updated ${trimmedName}.`);
    setEditTarget(null);
    setEditBusy(false);
  }

  async function handleAdd() {
    setAddError(null);
    const trimmed = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmed) {
      setAddError("Enter an operator name.");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setAddError("Enter a valid email address.");
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
      .insert({ name: trimmed, email: trimmedEmail, department: newDept })
      .select("id, name, email, department, is_admin, is_authorized")
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
    setNewEmail("");
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
      const revokeEmail = deleteTarget.email?.trim();
      if (!revokeEmail) {
        setMessage(
          `${deleteTarget.name} still holds administrator access and has no email address to match it to. Add their email, remove their administrator access, then delete them.`,
        );
        setDeleteBusy(false);
        return;
      }
      try {
        await revokeAdminByEmail(revokeEmail);
        await refreshAdminStatus();
      } catch {
        // Deleting the operator row would leave the administrator grant in place
        // with no screen able to remove it, so stop here instead.
        setMessage(
          `Could not remove administrator access from ${deleteTarget.name}, so they were not deleted.`,
        );
        setDeleteBusy(false);
        return;
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
          Add, edit, and delete operators. Toggle administrator and authorized
          user access with the radio buttons.
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
              <th className="text-left px-4 py-3 font-semibold">Email</th>
              <th className="text-left px-4 py-3 font-semibold">Department</th>
              <th className="text-center px-4 py-3 font-semibold">Admin</th>
              <th className="text-center px-4 py-3 font-semibold">Authorized</th>
              <th className="text-right px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((op) => (
              <tr key={op.id} className="border-t">
                <td className="px-4 py-3 font-medium">{op.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {op.email ?? "—"}
                </td>
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
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`auth-${op.id}`}
                        checked={op.is_authorized}
                        onChange={() => void toggleAuthorized(op)}
                        className="h-4 w-4 accent-brand-lead"
                      />
                      <CheckCircle2 className="h-4 w-4 text-brand-lead" />
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={`auth-${op.id}`}
                        checked={!op.is_authorized}
                        onChange={() => void toggleAuthorized(op)}
                        className="h-4 w-4"
                      />
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    </label>
                  </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    title="Edit operator"
                    onClick={() => openEditDialog(op)}
                    className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
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
                  colSpan={6}
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
              <Label htmlFor="new-op-email">Email Address</Label>
              <Input
                id="new-op-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="jane.doe@lgcgroup.com"
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
            <Button onClick={() => void handleAdd()} disabled={addBusy || !newName.trim() || !newEmail.trim()}>
              {addBusy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Add Operator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Operator Dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Operator
            </DialogTitle>
            <DialogDescription>
              Update the operator's name, email, or department.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-op-name">Operator Name</Label>
              <Input
                id="edit-op-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Jane Doe"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-op-email">Email Address</Label>
              <Input
                id="edit-op-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="jane.doe@lgcgroup.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-op-dept">Department</Label>
              <select
                id="edit-op-dept"
                value={editDept}
                onChange={(e) => setEditDept(e.target.value as Department)}
                className="border rounded-md h-10 px-2 w-full bg-transparent"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {editError && (
              <p className="text-sm text-status-error font-medium">{editError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editBusy}>
              Cancel
            </Button>
            <Button onClick={() => void handleEditSave()} disabled={editBusy || !editName.trim() || !editEmail.trim()}>
              {editBusy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save Changes
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

      {/* Password Prompt Dialog — create auth account when granting admin */}
      <Dialog open={pwTarget !== null} onOpenChange={(o) => { if (!o) { setPwTarget(null); setPwValue(""); setPwError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-brand-lead" />
              Set Administrator Password
            </DialogTitle>
            <DialogDescription>
              {pwTarget?.name} ({pwTarget?.email}) doesn't have a sign-in account yet.
              Enter a password to create their account and grant administrator access.
              They can change it after signing in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw-input">New Password</Label>
              <Input
                id="pw-input"
                type="password"
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
                placeholder="At least 8 characters"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") void handlePwConfirm(); }}
              />
              <p className="text-xs text-muted-foreground">
                Must include a letter, a number, and a special character.
              </p>
            </div>
            {pwError && (
              <p className="text-sm text-status-error font-medium">{pwError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPwTarget(null); setPwValue(""); setPwError(null); }} disabled={pwBusy}>
              Cancel
            </Button>
            <Button onClick={() => void handlePwConfirm()} disabled={pwBusy || pwValue.length < 8}>
              {pwBusy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Create Account & Grant Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
