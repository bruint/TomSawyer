import { RefreshCw, WifiOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type {
  Activity,
  ActivityInput,
  ActivityKind,
  TimerAction,
} from "../shared/types";
import { AppShell } from "./components/app-shell";
import { AuthScreen } from "./components/auth-screen";
import { Boat } from "./components/brand";
import { ChildOnboarding } from "./components/child-onboarding";
import { Dashboard } from "./components/dashboard";
import { DeviceOnboarding } from "./components/device-onboarding";
import { HistoryView } from "./components/history-view";
import { LogDialog } from "./components/log-dialog";
import { QuickActionToolbar } from "./components/quick-action-toolbar";
import { QuickActionSheet } from "./components/quick-action-sheet";
import { useQuickActions } from "./hooks/use-quick-actions";
import { ReportsView } from "./components/reports";
import { SettingsView } from "./components/settings";
import { ChildDialog } from "./components/settings/child-dialog";
import { StrategyView } from "./components/strategy-view";
import { SyncStatus } from "./components/sync-status";
import { Button } from "./components/ui/button";
import { useChildData } from "./hooks/use-child-data";
import { useAppInstall } from "./hooks/use-app-install";
import { useFamilySession } from "./hooks/use-family-session";
import { useNavigation } from "./hooks/use-navigation";
import { useOfflineQueue } from "./hooks/use-offline-queue";
import { usePushNotifications } from "./hooks/use-push-notifications";
import { useTheme } from "./hooks/use-theme";
import { ApiError, post, put, remove } from "./lib/api";
import type { Page } from "./lib/navigation";

export default function App() {
  const session = useFamilySession();
  const { bootstrap, online, refresh, setOnline } = session;
  const installation = useAppInstall();
  const push = usePushNotifications(
    bootstrap?.push.publicKey,
    bootstrap?.user.id,
    installation,
  );
  const navigation = useNavigation(bootstrap?.children || []);
  const { child, page } = navigation;
  const { theme, setTheme } = useTheme();
  const queue = useOfflineQueue(bootstrap?.user.id, online);
  const [compare, setCompare] = useState<number | null>(null);
  const [log, setLog] = useState<{
    kind: ActivityKind;
    entry?: Activity;
  } | null>(null);
  const [childDialog, setChildDialog] = useState<"new" | "edit" | null>(null);
  const data = useChildData({
    child,
    user: bootstrap?.user,
    napCount: compare,
    pendingRef: queue.itemsRef,
    setOnline,
    refreshSession: refresh,
  });

  const quickActions = useQuickActions({
    child,
    events: data.loadedChildId === child?.id ? data.events : [],
    strategy:
      compare === null && data.loadedChildId === child?.id
        ? data.strategy
        : null,
    online,
    onRecord: (input, message) => saveActivity(input, undefined, message),
    onTimer: controlTimer,
    onDetails: (kind) => setLog({ kind }),
  });

  function navigate(next: Page) {
    setCompare(null);
    navigation.navigate(next);
  }
  function selectChild(id: string) {
    setCompare(null);
    setLog(null);
    quickActions.setSheet(null);
    navigation.selectChild(id);
  }
  async function refreshFamily() {
    await refresh();
    await data.refresh();
  }
  async function saveActivity(
    body: ActivityInput,
    id?: string,
    quickMessage?: string,
  ) {
    if (!child || !bootstrap) return;
    try {
      let created: Activity | undefined;
      if (id) await put(`/activities/${id}`, body);
      else
        created = await post<Activity>(
          `/children/${child.id}/activities`,
          body,
        );
      toast.success(
        quickMessage ||
          (id
            ? "Entry updated"
            : body.state === "active"
              ? "Timer started"
              : "Entry saved"),
        quickMessage && created
          ? {
              duration: 7000,
              action: {
                label: "Undo",
                onClick: () => void undoQuickEntry(created!),
              },
            }
          : undefined,
      );
      await data.refresh();
    } catch (error) {
      if (id || body.state !== "complete" || error instanceof ApiError) {
        await data.refresh();
        throw error;
      }
      queue.enqueue({ userId: bootstrap.user.id, childId: child.id, body });
      setOnline(false);
      data.showPending();
      toast.success("Saved on this device. It will sync when you reconnect.");
    }
  }
  async function undoQuickEntry(activity: Activity) {
    try {
      await deleteActivity(activity);
    } catch (error) {
      toast.error((error as Error).message);
      await data.refresh();
    }
  }
  async function controlTimer(activity: Activity, action: TimerAction) {
    try {
      await post(`/activities/${activity.id}/timer`, {
        action,
        version: activity.version,
      });
      toast.success(
        {
          stop: "Session saved",
          pause: "Timer paused",
          resume: "Timer resumed",
        }[action],
      );
    } catch (error) {
      toast.error((error as Error).message);
    }
    await data.refresh();
  }
  function editActivity(activity: Activity) {
    if (queue.pending.some((item) => item.body.id === activity.id)) {
      toast.info(
        "This entry is waiting to sync. Connect to the server before editing.",
      );
      return;
    }
    if (activity.state !== "complete" && activity.kind !== "sleep") {
      navigate("today");
      toast.info("Use the running timer to pause or finish this session.");
      return;
    }
    setLog({ kind: activity.kind, entry: activity });
  }
  async function deleteActivity(activity: Activity) {
    await remove(`/activities/${activity.id}`, { version: activity.version });
    await data.refresh();
    toast.success("Entry deleted");
  }
  async function signOut() {
    if (queue.pending.length) {
      toast.error(
        "Sync or download and discard your pending entries before signing out.",
      );
      return;
    }
    if (await session.signOut()) {
      queue.clear();
      setLog(null);
      setChildDialog(null);
    }
  }

  if (session.initializing)
    return (
      <div className="app-loading">
        <Boat size={47} />
        <h2>Loading…</h2>
        <div className="loading-line" />
      </div>
    );
  if (!bootstrap && session.failure)
    return (
      <div className="app-loading">
        <WifiOff size={32} />
        <h2>Server unavailable</h2>
        <p>{session.failure}</p>
        <Button onClick={refresh}>
          <RefreshCw />
          Try again
        </Button>
      </div>
    );
  if (!bootstrap)
    return (
      <AuthScreen
        needsSetup={session.status.needsSetup}
        keyRequired={session.status.setupKeyRequired}
        invite={new URLSearchParams(location.search).get("invite")}
        onSuccess={refresh}
      />
    );

  return (
    <>
      <AppShell
        bootstrap={bootstrap}
        child={child}
        page={page}
        online={online}
        theme={theme}
        onTheme={setTheme}
        onNavigate={navigate}
        onSelectChild={selectChild}
        onAddChild={() => setChildDialog("new")}
        onLogout={signOut}
        quickActions={
          child && data.loadedChildId === child.id ? (
            <QuickActionToolbar actions={quickActions} />
          ) : undefined
        }
      >
        <SyncStatus
          online={online}
          pending={queue.pending}
          onRetry={() => {
            void refreshFamily();
          }}
          onSync={async () => {
            await queue.sync();
            await data.refresh();
          }}
          onDiscard={queue.discard}
        />
        {!child ? (
          <ChildOnboarding
            owner={bootstrap.user.role === "owner"}
            onAddChild={() => setChildDialog("new")}
          />
        ) : data.loadedChildId !== child.id ? (
          <div className="app-loading inline">
            <Boat />
            <p>
              {online
                ? "Loading…"
                : "No saved data for this child. Reconnect to your server."}
            </p>
            {!online && <Button onClick={data.refresh}>Try again</Button>}
          </div>
        ) : (
          <>
            {page === "today" && (
              <Dashboard
                child={child}
                events={data.events}
                strategy={data.strategy}
                onLog={quickActions.activate}
                onEdit={editActivity}
                onNavigate={navigate}
                onTimer={controlTimer}
                quickLabel={quickActions.label}
                quickBusy={quickActions.busy}
              />
            )}
            {page === "strategy" && (
              <StrategyView
                child={child}
                strategy={data.strategy}
                onLog={quickActions.activate}
                quickBusy={quickActions.busy}
                compare={compare}
                setCompare={setCompare}
              />
            )}
            {page === "history" && (
              <HistoryView
                key={child.id}
                child={child}
                events={data.events}
                onEdit={editActivity}
                onLog={() => setLog({ kind: "sleep" })}
              />
            )}
            {page === "reports" && (
              <ReportsView child={child} events={data.events} />
            )}
            {page === "settings" && (
              <SettingsView
                key={child.id}
                child={child}
                bootstrap={bootstrap}
                onRefresh={refreshFamily}
                onEditChild={() => setChildDialog("edit")}
                onAddChild={() => setChildDialog("new")}
                theme={theme}
                onTheme={setTheme}
                installation={installation}
                push={push}
              />
            )}
          </>
        )}
      </AppShell>
      {child && data.loadedChildId === child.id && (
        <QuickActionSheet key={child.id} child={child} actions={quickActions} />
      )}
      {log && child && (
        <LogDialog
          key={log.entry?.id || log.kind}
          child={child}
          initialKind={log.kind}
          entry={log.entry}
          onClose={() => setLog(null)}
          onSave={saveActivity}
          onDelete={deleteActivity}
        />
      )}
      {childDialog && (
        <ChildDialog
          child={childDialog === "edit" ? child : undefined}
          onClose={() => setChildDialog(null)}
          onSaved={refreshFamily}
        />
      )}
      {child && online && !childDialog && !log && !quickActions.sheet && (
        <DeviceOnboarding
          key={`${bootstrap.user.id}:${installation.standalone}`}
          userId={bootstrap.user.id}
          installation={installation}
          push={push}
        />
      )}
    </>
  );
}
