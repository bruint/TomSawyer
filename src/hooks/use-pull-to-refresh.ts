import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  idlePullToRefresh,
  PullToRefreshGesture,
} from "../lib/pull-to-refresh";

const interactiveElements =
  'a, input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="dialog"], [data-pull-refresh-ignore]';

function canStartPull(target: EventTarget | null, container: HTMLElement) {
  if (!(target instanceof Element) || target.closest(interactiveElements))
    return false;

  // Let inner lists and other scrollable controls handle their own gestures.
  for (
    let element: Element | null = target;
    element;
    element = element.parentElement
  ) {
    if (
      element.scrollHeight > element.clientHeight + 1 &&
      /^(auto|scroll|overlay)$/.test(getComputedStyle(element).overflowY)
    )
      return false;
    if (element === container) break;
  }
  return true;
}

export function usePullToRefresh({
  onRefresh,
  scope,
  disabled,
}: {
  onRefresh: () => Promise<void>;
  scope: string;
  disabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef(onRefresh);
  const [state, setState] = useState(idlePullToRefresh);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    setState(idlePullToRefresh);
    const element = containerRef.current;
    if (!element || disabled) return;
    const container = element;
    const ownerDocument = container.ownerDocument;
    const view = ownerDocument.defaultView;
    if (!view) return;
    let active = true;
    const gesture = new PullToRefreshGesture(setState, () =>
      refreshRef.current(),
    );
    const atTop = () =>
      view.scrollY <= 0 &&
      (ownerDocument.scrollingElement?.scrollTop || 0) <= 0;

    function touchStart(event: TouchEvent) {
      if (event.defaultPrevented || !canStartPull(event.target, container)) {
        gesture.cancel();
        return;
      }
      gesture.start(Array.from(event.touches), atTop());
    }
    function touchMove(event: TouchEvent) {
      if (event.defaultPrevented || !event.cancelable) {
        gesture.cancel();
        return;
      }
      if (gesture.move(Array.from(event.touches), atTop()))
        event.preventDefault();
    }
    function touchEnd(event: TouchEvent) {
      // A pull may start on a Journal row or another button. Suppress its tap
      // after dragging, while leaving ordinary taps untouched.
      if (gesture.isPulling && event.cancelable) event.preventDefault();
      if (event.touches.length) {
        gesture.cancel();
        return;
      }
      void gesture.release().catch(() => {
        if (active) toast.error("Couldn’t refresh. Try again.");
      });
    }
    const cancel = () => gesture.cancel();
    const visibilityChange = () => {
      if (ownerDocument.hidden) cancel();
    };

    container.addEventListener("touchstart", touchStart, { passive: true });
    // React's touch listeners can be passive; use a native listener to stop the
    // browser's own refresh only after a downward pull has been recognised.
    container.addEventListener("touchmove", touchMove, { passive: false });
    container.addEventListener("touchend", touchEnd, { passive: false });
    container.addEventListener("touchcancel", cancel, { passive: true });
    view.addEventListener("blur", cancel);
    ownerDocument.addEventListener("visibilitychange", visibilityChange);

    return () => {
      active = false;
      gesture.dispose();
      container.removeEventListener("touchstart", touchStart);
      container.removeEventListener("touchmove", touchMove);
      container.removeEventListener("touchend", touchEnd);
      container.removeEventListener("touchcancel", cancel);
      view.removeEventListener("blur", cancel);
      ownerDocument.removeEventListener("visibilitychange", visibilityChange);
    };
  }, [scope, disabled]);

  return { containerRef, ...state };
}
