import { Check, Download, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Child, ImportPreview, ImportResult } from "../../../shared/types";
import { post, remove } from "../../lib/api";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Input } from "../ui/input";

interface ImportFile {
  content: string;
  format: "csv" | "json";
  name: string;
}

export function DataSettings({
  child,
  owner,
  onRefresh,
}: {
  child: Child;
  owner: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [importFile, setImportFile] = useState<ImportFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  async function commitImport() {
    if (!importFile) return;
    setImportBusy(true);
    try {
      const result = await post<ImportResult>(`/children/${child.id}/import`, {
        ...importFile,
        commit: true,
      });
      toast.success(
        `${result.imported} entries imported, ${result.duplicates} duplicates skipped.`,
      );
      setPreview(null);
      setImportFile(null);
      await onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setImportBusy(false);
    }
  }
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    try {
      await post("/account/password", Object.fromEntries(new FormData(form)));
      form.reset();
      toast.success("Password updated. Other sessions have been signed out.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function deleteChild() {
    try {
      await remove(`/children/${child.id}`, { confirmName: deleteName });
      await onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function readImport(file?: File) {
    if (!file) return;
    setImportBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a file smaller than 5 MB");
      const content = await file.text();
      const format = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
      const f: ImportFile = { content, format, name: file.name };
      setImportFile(f);
      setPreview(await post<ImportPreview>(`/children/${child.id}/import`, f));
    } catch (e) {
      toast.error((e as Error).message);
      setPreview(null);
    } finally {
      setImportBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <div>
        <section className="card">
          <h2>Export history</h2>
          <div className="button-row">
            <Button variant="outline" asChild>
              <a href={`/api/children/${child.id}/export?format=csv`}>
                <Download />
                CSV spreadsheet
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/children/${child.id}/export?format=json`}>
                <Download />
                JSON archive
              </a>
            </Button>
          </div>
          <p className="form-hint">
            Exports include logs and notes. Photo files, account access, and
            reminder settings are preserved in a server database backup.
          </p>
        </section>
        <section className="card">
          <h2>Import history</h2>
          <p className="muted">
            Import a TomSawyer JSON or CSV export. Generic CSVs need kind/type,
            start, and end columns; timestamps without offsets use{" "}
            {child.timezone}.
          </p>
          <label className="file-drop">
            <Upload size={23} />
            <strong>
              {importBusy
                ? "Reading your file…"
                : importFile?.name || "Choose a CSV or JSON file"}
            </strong>
            <span>Up to 5 MB · preview before importing</span>
            <input
              type="file"
              accept=".csv,.json"
              onChange={(e) => readImport(e.target.files?.[0])}
              disabled={importBusy}
            />
          </label>
          {preview && (
            <div className="import-preview">
              <strong>
                {preview.valid} of {preview.total} entries are valid
              </strong>
              {preview.errors.length > 0 ? (
                <div className="notice error">
                  {preview.errors.slice(0, 4).map((e) => (
                    <p key={e.row}>
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                  <p>
                    Fix errors in the source file and try again. Nothing has
                    been imported.
                  </p>
                </div>
              ) : (
                <>
                  <p>
                    Repeated IDs are skipped. Unmapped CSV fields are kept in
                    notes. Review your file before continuing.
                  </p>
                  <Button disabled={importBusy} onClick={commitImport}>
                    <Check />
                    Import {preview.valid} entries
                  </Button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
      <div>
        <section className="card">
          <h2>Change your password</h2>
          <form className="form-stack" onSubmit={changePassword}>
            <Field label="Current password">
              <Input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password">
              <Input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
              />
            </Field>
            <Button variant="outline" disabled={saving}>
              <ShieldCheck />
              Update password
            </Button>
          </form>
        </section>
        {owner && (
          <section className="card danger-card">
            <h2>Delete child profile</h2>
            <p>
              This permanently removes {child.name}’s logs and reminders for
              everyone in the family. Export a copy first.
            </p>
            <Field label={`Type ${child.name} to confirm`}>
              <Input
                value={deleteName}
                onChange={(e) => setDeleteName(e.target.value)}
              />
            </Field>
            <Button
              variant="destructive"
              disabled={deleteName !== child.name}
              onClick={deleteChild}
            >
              <Trash2 />
              Delete {child.name}’s profile
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
