import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sun,
  Moon,
  Route,
  CalendarDays,
  ChartNoAxesCombined,
  Settings2,
  ChevronDown,
  Plus,
  LogOut,
  WifiOff,
  RefreshCw,
  ArrowRight,
  Heart,
  Menu,
  X,
  Download,
  Bell,
} from "lucide-react";
import { Button } from "./components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./components/ui/dropdown-menu";
import { Boat, RiverScene } from "./components/brand";
import { AuthScreen } from "./components/auth-screen";
import { ChildDialog, SettingsView } from "./components/settings";
import { LogDialog } from "./components/log-dialog";
import { Dashboard, StrategyView } from "./components/dashboard";
import { HistoryView, ReportsView } from "./components/reports";
import { ApiError, api, post, put, remove } from "./lib/api";
import { age } from "./lib/format";
import type {
  Bootstrap,
  Activity,
  ActivityKind,
  Strategy,
} from "../shared/types";

const nav = [
  { id: "today", label: "Today", icon: Sun },
  { id: "strategy", label: "Your strategy", icon: Route },
  { id: "history", label: "Journal", icon: CalendarDays },
  { id: "reports", label: "Patterns", icon: ChartNoAxesCombined },
  { id: "settings", label: "Your family", icon: Settings2 },
];
type Pending = { userId: string; childId: string; body: any };
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export default function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [status, setStatus] = useState({
    needsSetup: false,
    setupKeyRequired: false,
  });
  const [failure, setFailure] = useState("");
  const params = new URLSearchParams(location.search);
  const [childId, setChildId] = useState(
    params.get("child") || localStorage.getItem("ts:child") || "",
  );
  const [page, setPage] = useState(
    nav.some((n) => n.id === params.get("view"))
      ? params.get("view")!
      : "today",
  );
  const [events, setEvents] = useState<Activity[]>([]);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [dataFor, setDataFor] = useState("");
  const [compare, setCompare] = useState<number | null>(null);
  const [log, setLog] = useState<{
    kind: ActivityKind;
    entry?: Activity;
  } | null>(null);
  const [childDialog, setChildDialog] = useState<"new" | "edit" | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<Pending[]>(stored("ts:queue", []));
  const syncing = useRef(false);
  const queueRef = useRef(queue);
  const bootstrapRef = useRef(bootstrap);
  const requestGeneration = useRef(0);
  const [theme, setTheme] = useState(
    localStorage.getItem("ts:theme") || "system",
  );
  const [mobileMenu, setMobileMenu] = useState(false);
  const [, tick] = useState(0);
  const child =
    bootstrap?.children.find((c) => c.id === childId) || bootstrap?.children[0];
  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);
  useEffect(() => {
    queueRef.current = queue;
    saveLocal("ts:queue", queue);
  }, [queue]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches),
      );
    update();
    localStorage.setItem("ts:theme", theme);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  const refresh = useCallback(async () => {
    try {
      const data = await api<Bootstrap>("/bootstrap");
      setBootstrap(data);
      saveLocal("ts:bootstrap", data);
      setFailure("");
      setOnline(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setBootstrap(null);
        setStatus(await api("/status"));
        localStorage.removeItem("ts:bootstrap");
      } else {
        const cached = stored<Bootstrap | null>("ts:bootstrap", null);
        if (cached) {
          setBootstrap(cached);
          setOnline(false);
        } else
          setFailure(
            "We couldn’t reach your server. Check your connection and try again.",
          );
      }
    } finally {
      setInitializing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (child) {
      setChildId(child.id);
      localStorage.setItem("ts:child", child.id);
    }
  }, [child?.id]);
  const loadChild = useCallback(async () => {
    if (!child || !bootstrap) return;
    const generation = ++requestGeneration.current;
    const id = child.id;
    try {
      const [logs, plan] = await Promise.all([
        api<Activity[]>(`/children/${id}/activities?days=90`),
        api<Strategy>(
          `/children/${id}/strategy${compare !== null ? `?naps=${compare}` : ""}`,
        ),
      ]);
      if (generation !== requestGeneration.current) return;
      const pending = queueRef.current
        .filter((q) => q.userId === bootstrap.user.id && q.childId === id)
        .map(
          (q) =>
            ({
              ...q.body,
              childId: id,
              createdBy: bootstrap.user.id,
              authorName: bootstrap.user.name,
              version: 1,
              pausedAt: null,
              pausedMs: 0,
              createdAt: q.body.startedAt,
              updatedAt: q.body.startedAt,
            }) as Activity,
        );
      const unique = [
        ...logs,
        ...pending.filter((p) => !logs.some((a) => a.id === p.id)),
      ].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      setEvents(unique);
      setStrategy(plan);
      setDataFor(id);
      setOnline(true);
      if (compare === null)
        saveLocal(`ts:cache:${bootstrap.user.id}:${id}`, {
          events: logs,
          strategy: plan,
        });
    } catch (e) {
      if (generation !== requestGeneration.current) return;
      if (e instanceof ApiError && e.status === 401) {
        void refresh();
        return;
      }
      setOnline(false);
      const cache = stored<any>(`ts:cache:${bootstrap.user.id}:${id}`, null);
      if (cache) {
        const pending = queueRef.current
          .filter((q) => q.userId === bootstrap.user.id && q.childId === id)
          .map((q) => ({
            ...q.body,
            childId: id,
            createdBy: bootstrap.user.id,
            authorName: bootstrap.user.name,
            version: 1,
            pausedAt: null,
            pausedMs: 0,
            createdAt: q.body.startedAt,
            updatedAt: q.body.startedAt,
          }));
        setEvents(
          [
            ...cache.events,
            ...pending.filter(
              (p) => !cache.events.some((a: Activity) => a.id === p.id),
            ),
          ].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
        );
        setStrategy(cache.strategy);
        setDataFor(id);
      }
    }
  }, [child?.id, bootstrap?.user.id, compare, refresh]);
  useEffect(() => {
    setDataFor("");
    void loadChild();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadChild();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void loadChild();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      requestGeneration.current++;
    };
  }, [loadChild]);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const online = () => {
      setOnline(true);
      void refresh();
    };
    const offline = () => setOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [refresh]);
  useEffect(() => {
    const pop = () => {
      const p = new URLSearchParams(location.search);
      setPage(p.get("view") || "today");
      if (p.get("child")) setChildId(p.get("child")!);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const syncQueue = useCallback(async () => {
    if (syncing.current || !bootstrapRef.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      const uid = bootstrapRef.current.user.id;
      for (const item of [...queueRef.current].filter(
        (q) => q.userId === uid,
      )) {
        try {
          await post(`/children/${item.childId}/activities`, item.body);
          queueRef.current = queueRef.current.filter(
            (q) => q.body.id !== item.body.id,
          );
          setQueue(queueRef.current);
          saveLocal("ts:queue", queueRef.current);
        } catch (e) {
          if (e instanceof ApiError) {
            toast.error(`An offline entry needs review: ${e.message}`);
          }
          break;
        }
      }
    } finally {
      syncing.current = false;
    }
  }, []);
  useEffect(() => {
    if (online && bootstrap && queue.length) void syncQueue();
  }, [online, bootstrap?.user.id, queue.length, syncQueue]);
  function navigate(next: string) {
    setPage(next);
    setMobileMenu(false);
    setCompare(null);
    const p = new URLSearchParams();
    if (child) p.set("child", child.id);
    if (next !== "today") p.set("view", next);
    history.pushState(null, "", `/?${p}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function onSaved() {
    await refresh();
    await loadChild();
  }
  async function saveActivity(body: any, id?: string) {
    if (!child || !bootstrap) return;
    try {
      if (id) await put(`/activities/${id}`, body);
      else await post(`/children/${child.id}/activities`, body);
      toast.success(
        id
          ? "Entry updated for your family."
          : body.state === "active"
            ? "Timer started. Your family can see it too."
            : "A little moment, remembered.",
      );
      await loadChild();
    } catch (e) {
      if (!id && body.state === "complete" && !(e instanceof ApiError)) {
        const item = { userId: bootstrap.user.id, childId: child.id, body };
        queueRef.current = [...queueRef.current, item];
        setQueue(queueRef.current);
        saveLocal("ts:queue", queueRef.current);
        setOnline(false);
        setEvents((old) => [
          {
            ...body,
            childId: child.id,
            authorName: bootstrap.user.name,
            createdBy: bootstrap.user.id,
            version: 1,
            pausedAt: null,
            pausedMs: 0,
            createdAt: body.startedAt,
            updatedAt: body.startedAt,
          },
          ...old,
        ]);
        toast.success(
          "Saved on this device. We’ll sync it when the connection returns.",
        );
      } else throw e;
    }
  }
  async function timer(a: Activity, action: "pause" | "resume" | "stop") {
    try {
      await post(`/activities/${a.id}/timer`, { action, version: a.version });
      await loadChild();
      toast.success(
        action === "stop"
          ? "Session saved. Your plan is up to date."
          : action === "pause"
            ? "Timer paused"
            : "Timer resumed",
      );
    } catch (e) {
      toast.error((e as Error).message);
      await loadChild();
    }
  }
  function edit(a: Activity) {
    if (queue.some((q) => q.body.id === a.id)) {
      toast.info(
        "This entry is waiting to sync. Connect to the server before editing.",
      );
      return;
    }
    if (a.state !== "complete") {
      navigate("today");
      toast.info("Use the running timer to pause or finish this session.");
      return;
    }
    setLog({ kind: a.kind, entry: a });
  }
  async function logout() {
    if (queue.some((q) => q.userId === bootstrap?.user.id)) {
      toast.error(
        "Sync or download and discard your pending entries before signing out.",
      );
      return;
    }
    try {
      let endpoint: string | undefined;
      let sub: PushSubscription | null = null;
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        sub = (await reg?.pushManager?.getSubscription()) || null;
        endpoint = sub?.endpoint;
      }
      await post("/auth/logout", { endpoint });
      await sub?.unsubscribe().catch(() => {});
      for (const key of Object.keys(localStorage))
        if (key.startsWith("ts:") && key !== "ts:theme")
          localStorage.removeItem(key);
      setBootstrap(null);
      setEvents([]);
      setStrategy(null);
      setDataFor("");
      setQueue([]);
      setStatus(await api("/status"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const pending = queue.filter((q) => q.userId === bootstrap?.user.id);
  if (initializing)
    return (
      <div className="app-loading">
        <Boat size={47} />
        <h2>A little moment…</h2>
        <div className="loading-line" />
      </div>
    );
  if (!bootstrap && failure)
    return (
      <div className="app-loading">
        <WifiOff size={32} />
        <h2>Let’s reconnect.</h2>
        <p>{failure}</p>
        <Button onClick={() => refresh()}>
          <RefreshCw />
          Try again
        </Button>
      </div>
    );
  if (!bootstrap)
    return (
      <AuthScreen
        needsSetup={status.needsSetup}
        keyRequired={status.setupKeyRequired}
        invite={params.get("invite")}
        onSuccess={refresh}
      />
    );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <button className="brand" onClick={() => navigate("today")}>
          <Boat />
          <span>
            TomSawyer<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="sidebar-kicker">A LITTLE MORE REST</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === "strategy" && <span className="nav-sparkle">✧</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Boat size={28} />
            <p>
              Some days follow a plan.
              <br />
              Some days need a new one.
            </p>
            <small>We’re here for both.</small>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="sidebar-user">
                <span className="member-avatar">
                  {bootstrap.user.name.charAt(0)}
                </span>
                <span>
                  <strong>{bootstrap.user.name}</strong>
                  <small>{bootstrap.family.name}</small>
                </span>
                <ChevronDown size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => navigate("settings")}>
                <Settings2 size={16} />
                Family settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                <Moon size={16} />
                Toggle night mode
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void logout()}>
                <LogOut size={16} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Close menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu-toggle"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Open menu"
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="child-switcher">
                <span className={`child-avatar ${child?.color || "sage"}`}>
                  {child?.name.charAt(0) || "+"}
                </span>
                <span>
                  <strong>{child?.name || "Your little ones"}</strong>
                  <small>{child ? age(child) : "A new chapter"}</small>
                </span>
                <ChevronDown size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {bootstrap.children.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={() => {
                    setChildId(c.id);
                    setCompare(null);
                    setDataFor("");
                    setLog(null);
                  }}
                >
                  <span className={`child-avatar small ${c.color}`}>
                    {c.name.charAt(0)}
                  </span>
                  {c.name}
                </DropdownMenuItem>
              ))}
              {bootstrap.user.role === "owner" && (
                <DropdownMenuItem onSelect={() => setChildDialog("new")}>
                  <Plus size={17} />
                  Add a child
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="topbar-right">
            <span className="sync-label">
              <span className={`status-dot ${online ? "" : "off"}`} />
              {online ? "Together, up to date" : "Saved on this device"}
            </span>
            <div
              className="crew-avatars"
              title={bootstrap.members.map((m) => m.name).join(", ")}
            >
              {bootstrap.members.slice(0, 3).map((m) => (
                <span key={m.id}>{m.name.charAt(0)}</span>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Family and notification settings"
              onClick={() => navigate("settings")}
            >
              <Bell />
            </Button>
          </div>
        </header>
        <main className="main-content">
          {!online && (
            <div className="connection-banner">
              <WifiOff size={17} />
              <span>
                You’re offline. Showing saved information; the sleep plan may be
                out of date. Completed entries can be queued.
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void refresh();
                  void loadChild();
                }}
              >
                Retry
              </Button>
            </div>
          )}
          {pending.length > 0 && (
            <div className="pending-banner">
              <strong>
                {pending.length} {pending.length === 1 ? "entry" : "entries"}{" "}
                waiting to sync
              </strong>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await syncQueue();
                  await loadChild();
                }}
              >
                Retry sync
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const blob = new Blob(
                    [
                      JSON.stringify(
                        { activities: pending.map((q) => q.body) },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "tomsawyer-unsynced.json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                <Download />
                Download
              </Button>
              <button
                className="text-button danger-text"
                onClick={() => {
                  if (
                    confirm(
                      "Discard these unsynced entries from this device? Download a copy first.",
                    )
                  )
                    setQueue(
                      queue.filter((q) => q.userId !== bootstrap.user.id),
                    );
                }}
              >
                Discard
              </button>
            </div>
          )}
          {!child ? (
            <section className="onboarding-card">
              <Boat size={48} />
              <span className="eyebrow">
                WELCOME ABOARD, {bootstrap.user.name.toUpperCase()}
              </span>
              <h1>
                Every little adventure
                <br />
                starts somewhere.
              </h1>
              <p>
                Add your child to start remembering the little moments—and
                finding a rhythm for the rest of the day.
              </p>
              {bootstrap.user.role === "owner" ? (
                <Button size="lg" onClick={() => setChildDialog("new")}>
                  Add your little one
                  <ArrowRight />
                </Button>
              ) : (
                <p>Your family owner can add the first child profile.</p>
              )}
              <RiverScene />
              <div className="onboarding-steps">
                <span>01 · Meet your little one</span>
                <span>02 · Log a moment</span>
                <span>03 · Find your rhythm</span>
              </div>
            </section>
          ) : dataFor !== child.id ? (
            <div className="app-loading inline">
              <Boat />
              <p>
                {online
                  ? "Gathering the little details…"
                  : "No saved data for this child yet. Reconnect to your server."}
              </p>
              {!online && (
                <Button onClick={() => loadChild()}>Try again</Button>
              )}
            </div>
          ) : (
            <>
              {page === "today" && (
                <Dashboard
                  child={child}
                  events={events}
                  strategy={strategy}
                  onLog={(kind) => setLog({ kind })}
                  onEdit={edit}
                  onNavigate={navigate}
                  onTimer={timer}
                />
              )}
              {page === "strategy" && (
                <StrategyView
                  child={child}
                  strategy={strategy}
                  onLog={(kind) => setLog({ kind })}
                  compare={compare}
                  setCompare={setCompare}
                />
              )}
              {page === "history" && (
                <HistoryView
                  child={child}
                  events={events}
                  onEdit={edit}
                  onLog={() => setLog({ kind: "sleep" })}
                />
              )}
              {page === "reports" && (
                <ReportsView child={child} events={events} />
              )}
              {page === "settings" && (
                <SettingsView
                  key={child.id}
                  child={child}
                  bootstrap={bootstrap}
                  onRefresh={onSaved}
                  onEditChild={() => setChildDialog("edit")}
                  onAddChild={() => setChildDialog("new")}
                  theme={theme}
                  onTheme={setTheme}
                />
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            <Heart size={12} />
            For your very own little crew.
          </span>
          <span>TomSawyer · Self-hosted & yours</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
            aria-current={page === n.id ? "page" : undefined}
          >
            <n.icon size={21} />
            <span>
              {n.id === "strategy"
                ? "Strategy"
                : n.id === "settings"
                  ? "Family"
                  : n.label}
            </span>
          </button>
        ))}
      </nav>
      {child && page !== "settings" && !log && (
        <button
          className="mobile-log-fab"
          aria-label="Log a moment"
          onClick={() => setLog({ kind: "sleep" })}
        >
          <Plus size={22} />
          <span>Log</span>
        </button>
      )}
      {log && child && (
        <LogDialog
          key={log.entry?.id || log.kind}
          child={child}
          initialKind={log.kind}
          entry={log.entry}
          onClose={() => setLog(null)}
          onSave={saveActivity}
          onDelete={async (a) => {
            await remove(`/activities/${a.id}`, { version: a.version });
            await loadChild();
            toast.success("Entry deleted");
          }}
        />
      )}
      {childDialog && (
        <ChildDialog
          child={childDialog === "edit" ? child : undefined}
          onClose={() => setChildDialog(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
