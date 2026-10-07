import { Copy, Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Bootstrap, Child, User } from "../../../shared/types";
import { post, remove } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function FamilySettings({
  child,
  bootstrap,
  onRefresh,
  onEditChild,
  onAddChild,
}: {
  child: Child;
  bootstrap: Bootstrap;
  onRefresh: () => Promise<void>;
  onEditChild: () => void;
  onAddChild: () => void;
}) {
  const [invite, setInvite] = useState("");
  const owner = bootstrap.user.role === "owner";
  async function removeCaregiver(member: User) {
    if (
      !confirm(
        `Remove ${member.name}’s access? Their historical entries will stay.`,
      )
    )
      return;
    try {
      await remove(`/family/members/${member.id}`);
      await onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function createInvitation() {
    try {
      const invitation = await post<{ url: string }>("/family/invites", {});
      setInvite(invitation.url);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  return (
    <div className="settings-grid">
      <section className="card">
        <div className="section-heading">
          <h2>Children</h2>
          {owner && (
            <Button size="sm" variant="outline" onClick={onAddChild}>
              <Plus />
              Add child
            </Button>
          )}
        </div>
        {bootstrap.children.map((c) => (
          <div className="family-row" key={c.id}>
            <span className={`child-avatar ${c.color}`}>
              {c.name.charAt(0)}
            </span>
            <span>
              <strong>{c.name}</strong>
              <small>
                {c.birthDate} · {c.timezone}
              </small>
            </span>
            {owner && c.id === child.id && (
              <Button size="sm" variant="ghost" onClick={onEditChild}>
                Edit
              </Button>
            )}
          </div>
        ))}
        <p className="form-hint">
          Switch between children using their name at the top of the app.
        </p>
      </section>
      <section className="card">
        <div className="section-heading">
          <h2>Caregivers</h2>
          <UserPlus size={19} />
        </div>
        {bootstrap.members.map((m) => (
          <div className="family-row" key={m.id}>
            <span className="member-avatar">{m.name.charAt(0)}</span>
            <span>
              <strong>
                {m.name}
                {m.id === bootstrap.user.id ? " (you)" : ""}
              </strong>
              <small>
                {m.email} · {m.role}
              </small>
            </span>
            {owner && m.role === "caregiver" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${m.name}`}
                onClick={() => removeCaregiver(m)}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        {owner && (
          <>
            <Button
              variant="outline"
              className="full-width"
              onClick={createInvitation}
            >
              <Plus />
              Create an invitation
            </Button>
            {invite && (
              <div className="invite-result">
                <Input aria-label="Invitation link" readOnly value={invite} />
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Copy invitation"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(invite)
                      .then(() => toast.success("Invitation copied"))
                      .catch(() =>
                        toast.error("Select and copy the invitation link."),
                      )
                  }
                >
                  <Copy />
                </Button>
                <small>
                  One use · expires in 7 days. Share it directly with your
                  caregiver.
                </small>
              </div>
            )}
          </>
        )}
        <p className="form-hint">
          Every caregiver has a separate login. Everyone can log and correct
          entries; the owner manages profiles and access.
        </p>
      </section>
    </div>
  );
}
