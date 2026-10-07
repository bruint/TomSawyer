export interface PullToRefreshState {
  phase: "idle" | "pulling" | "ready" | "refreshing";
  offset: number;
}

interface TouchPoint {
  identifier: number;
  clientX: number;
  clientY: number;
}

export const idlePullToRefresh: PullToRefreshState = {
  phase: "idle",
  offset: 0,
};

const directionThreshold = 8;
const refreshThreshold = 100;

// Keep gesture decisions separate from DOM events so scrolling and cancellation
// behave the same in a browser tab and an installed app.
export class PullToRefreshGesture {
  private origin: TouchPoint | null = null;
  private locked = false;
  private disposed = false;
  private state = idlePullToRefresh;

  constructor(
    private onChange: (state: PullToRefreshState) => void,
    private onRefresh: () => Promise<void>,
  ) {}

  get isPulling() {
    return this.locked;
  }

  start(touches: readonly TouchPoint[], atTop: boolean) {
    if (this.disposed || this.state.phase === "refreshing") return;
    this.cancel();
    if (atTop && touches.length === 1) {
      const { identifier, clientX, clientY } = touches[0];
      this.origin = { identifier, clientX, clientY };
    }
  }

  // Return true only when the gesture should prevent native scrolling.
  move(touches: readonly TouchPoint[], atTop: boolean): boolean {
    if (!this.origin || this.disposed) return false;
    const point = touches[0];
    if (
      !atTop ||
      touches.length !== 1 ||
      point.identifier !== this.origin.identifier
    ) {
      this.cancel();
      return false;
    }

    const vertical = point.clientY - this.origin.clientY;
    const horizontal = Math.abs(point.clientX - this.origin.clientX);
    if (!this.locked) {
      if (Math.max(Math.abs(vertical), horizontal) < directionThreshold)
        return false;
      if (vertical <= 0 || horizontal >= vertical) {
        this.cancel();
        return false;
      }
      this.locked = true;
    }

    this.update({
      phase: vertical >= refreshThreshold ? "ready" : "pulling",
      offset: Math.min(80, Math.max(0, vertical) / 2),
    });
    return true;
  }

  async release() {
    this.origin = null;
    this.locked = false;
    if (this.disposed || this.state.phase === "refreshing") return;
    if (this.state.phase !== "ready") {
      this.update(idlePullToRefresh);
      return;
    }

    this.update({ phase: "refreshing", offset: 56 });
    try {
      await this.onRefresh();
    } finally {
      if (!this.disposed) this.update(idlePullToRefresh);
    }
  }

  cancel() {
    this.origin = null;
    this.locked = false;
    if (!this.disposed && this.state.phase !== "refreshing")
      this.update(idlePullToRefresh);
  }

  dispose() {
    this.disposed = true;
    this.origin = null;
  }

  private update(state: PullToRefreshState) {
    this.state = state;
    this.onChange(state);
  }
}
