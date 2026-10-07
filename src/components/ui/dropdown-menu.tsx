import * as D from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
export const DropdownMenu = D.Root;
export const DropdownMenuTrigger = D.Trigger;
export function DropdownMenuContent(props: ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Content sideOffset={8} className="dropdown-content" {...props} />
    </D.Portal>
  );
}
export function DropdownMenuItem(props: ComponentProps<typeof D.Item>) {
  return <D.Item className="dropdown-item" {...props} />;
}
