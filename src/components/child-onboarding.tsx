import { Plus } from "lucide-react";
import { Boat } from "./brand";
import { Button } from "./ui/button";

export function ChildOnboarding({
  owner,
  onAddChild,
}: {
  owner: boolean;
  onAddChild: () => void;
}) {
  return (
    <section className="onboarding-card">
      <Boat size={48} />
      <h1>Add your first child</h1>
      {owner ? (
        <Button size="lg" onClick={onAddChild}>
          <Plus />
          Add child
        </Button>
      ) : (
        <p>Your family owner can add the first child profile.</p>
      )}
    </section>
  );
}
