import assert from "node:assert/strict";
import test from "node:test";
import {
  idlePullToRefresh,
  PullToRefreshGesture,
  type PullToRefreshState,
} from "../src/lib/pull-to-refresh";

const finger = (y: number, x = 40, identifier = 1) => ({
  identifier,
  clientX: x,
  clientY: y,
});

function setup(onRefresh: () => Promise<void> = async () => {}) {
  let state: PullToRefreshState = idlePullToRefresh;
  let calls = 0;
  const gesture = new PullToRefreshGesture(
    (next) => {
      state = next;
    },
    async () => {
      calls++;
      await onRefresh();
    },
  );
  return {
    gesture,
    get state() {
      return state;
    },
    get calls() {
      return calls;
    },
  };
}

test("taps and short pulls do not refresh", async () => {
  const app = setup();
  app.gesture.start([finger(200)], true);
  assert.equal(app.gesture.move([finger(204)], true), false);
  assert.equal(app.gesture.isPulling, false);
  await app.gesture.release();
  assert.equal(app.calls, 0);

  app.gesture.start([finger(200)], true);
  assert.equal(app.gesture.move([finger(260)], true), true);
  assert.equal(app.gesture.isPulling, true);
  assert.equal(app.state.phase, "pulling");
  await app.gesture.release();
  assert.equal(app.gesture.isPulling, false);
  assert.equal(app.calls, 0);
  assert.deepEqual(app.state, idlePullToRefresh);
});

test("a deliberate pull refreshes on release, once, and waits for the request", async () => {
  let finish!: () => void;
  const app = setup(() => new Promise<void>((resolve) => (finish = resolve)));
  app.gesture.start([finger(200)], true);
  assert.equal(app.gesture.move([finger(320)], true), true);
  assert.equal(app.state.phase, "ready");
  assert.equal(app.calls, 0);

  const refreshing = app.gesture.release();
  assert.equal(app.state.phase, "refreshing");
  assert.equal(app.calls, 1);
  await app.gesture.release();
  app.gesture.start([finger(200)], true);
  assert.equal(app.gesture.move([finger(400)], true), false);
  app.gesture.cancel();
  assert.equal(app.state.phase, "refreshing");
  assert.equal(app.calls, 1);

  finish();
  await refreshing;
  assert.deepEqual(app.state, idlePullToRefresh);
});

test("scrolling to the top during a gesture does not start a refresh", async () => {
  const app = setup();
  app.gesture.start([finger(200)], false);
  assert.equal(app.gesture.move([finger(350)], true), false);
  await app.gesture.release();
  assert.equal(app.calls, 0);
});

test("ordinary upward and horizontal scrolling is left to the browser", async () => {
  const app = setup();
  app.gesture.start([finger(200)], true);
  assert.equal(app.gesture.move([finger(180)], true), false);
  assert.equal(app.gesture.move([finger(350)], true), false);
  await app.gesture.release();

  app.gesture.start([finger(200)], true);
  assert.equal(app.gesture.move([finger(215, 110)], true), false);
  assert.equal(app.gesture.move([finger(350)], true), false);
  await app.gesture.release();
  assert.equal(app.calls, 0);
});

test("backing off before release cancels a ready refresh", async () => {
  const app = setup();
  app.gesture.start([finger(200)], true);
  app.gesture.move([finger(350)], true);
  assert.equal(app.state.phase, "ready");
  app.gesture.move([finger(230)], true);
  assert.equal(app.state.phase, "pulling");
  await app.gesture.release();
  assert.equal(app.calls, 0);
});

test("pinching, additional fingers, and losing the original finger cancel the pull", async () => {
  const app = setup();
  app.gesture.start([finger(200), finger(200, 100, 2)], true);
  assert.equal(app.gesture.move([finger(350)], true), false);
  await app.gesture.release();

  app.gesture.start([finger(200)], true);
  app.gesture.move([finger(350)], true);
  assert.equal(
    app.gesture.move([finger(350), finger(350, 100, 2)], true),
    false,
  );
  await app.gesture.release();

  app.gesture.start([finger(200)], true);
  app.gesture.move([finger(350)], true);
  assert.equal(app.gesture.move([finger(350, 40, 2)], true), false);
  await app.gesture.release();
  assert.equal(app.calls, 0);
  assert.deepEqual(app.state, idlePullToRefresh);
});

test("touch cancellation or leaving the top does not refresh, and the next pull works", async () => {
  const app = setup();
  app.gesture.start([finger(200)], true);
  app.gesture.move([finger(350)], true);
  app.gesture.cancel();
  await app.gesture.release();
  assert.equal(app.calls, 0);

  app.gesture.start([finger(200)], true);
  app.gesture.move([finger(350)], true);
  assert.equal(app.gesture.move([finger(360)], false), false);
  await app.gesture.release();
  assert.equal(app.calls, 0);

  app.gesture.start([finger(200)], true);
  app.gesture.move([finger(350)], true);
  await app.gesture.release();
  assert.equal(app.calls, 1);
});

test("a failed request resets the indicator and allows another attempt", async () => {
  const app = setup(async () => {
    if (app.calls === 1) throw new Error("Server unavailable");
  });
  app.gesture.start([finger(200)], true);
  app.gesture.move([finger(350)], true);
  await assert.rejects(app.gesture.release(), /Server unavailable/);
  assert.deepEqual(app.state, idlePullToRefresh);

  app.gesture.start([finger(200)], true);
  app.gesture.move([finger(350)], true);
  await app.gesture.release();
  assert.equal(app.calls, 2);
  assert.deepEqual(app.state, idlePullToRefresh);
});

test("a refresh completing after navigation does not update the old view", async () => {
  let finish!: () => void;
  const app = setup(() => new Promise<void>((resolve) => (finish = resolve)));
  app.gesture.start([finger(200)], true);
  app.gesture.move([finger(350)], true);
  const refreshing = app.gesture.release();
  app.gesture.dispose();
  const oldState = app.state;
  finish();
  await refreshing;
  assert.equal(app.state, oldState);
  app.gesture.start([finger(200)], true);
  assert.equal(app.gesture.move([finger(350)], true), false);
  await app.gesture.release();
  assert.equal(app.calls, 1);
});
