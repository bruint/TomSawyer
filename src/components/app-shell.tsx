import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Bootstrap, Child } from "../../shared/types";
import { age } from "../lib/format";
import { navigation, type Page } from "../lib/navigation";
import { Boat } from "./brand";
import { PullToRefresh } from "./pull-to-refresh";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface AppShellProps {
  bootstrap: Bootstrap;
  child?: Child;
  page: Page;
  online: boolean;
  theme: string;
  onTheme: (theme: string) => void;
  onNavigate: (page: Page) => void;
  onSelectChild: (id: string) => void;
  onAddChild: () => void;
  onLogout: () => Promise<void>;
  onRefresh: () => Promise<void>;
  refreshDisabled?: boolean;
  children: ReactNode;
  quickActions?: ReactNode;
}

export function AppShell({
  bootstrap,
  child,
  page,
  online,
  theme,
  onTheme,
  onNavigate,
  onSelectChild,
  onAddChild,
  onLogout,
  onRefresh,
  refreshDisabled = false,
  children,
  quickActions,
}: AppShellProps) {
  const [mobileMenu, setMobileMenu] = useState(false);
  function navigateTo(next: Page) {
    setMobileMenu(false);
    onNavigate(next);
  }
  return (
    <div className={`app-shell ${quickActions ? "has-quick-actions" : ""}`}>
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <button className="brand" onClick={() => navigateTo("today")}>
          <Boat />
          <span>
            TomSawyer<span className="brand-dot">.</span>
          </span>
        </button>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => navigateTo(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === "strategy" && <span className="nav-sparkle">✧</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
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
              <DropdownMenuItem onSelect={() => navigateTo("settings")}>
                <Settings2 size={16} />
                Family settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onTheme(theme === "dark" ? "light" : "dark")}
              >
                <Moon size={16} />
                Toggle night mode
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void onLogout()}>
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
                  <strong>{child?.name || "Children"}</strong>
                  {child && <small>{age(child)}</small>}
                </span>
                <ChevronDown size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {bootstrap.children.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={() => onSelectChild(c.id)}
                >
                  <span className={`child-avatar small ${c.color}`}>
                    {c.name.charAt(0)}
                  </span>
                  {c.name}
                </DropdownMenuItem>
              ))}
              {bootstrap.user.role === "owner" && (
                <DropdownMenuItem onSelect={() => onAddChild()}>
                  <Plus size={17} />
                  Add a child
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="topbar-right">
            <span className="sync-label">
              <span className={`status-dot ${online ? "" : "off"}`} />
              {online ? "Synced" : "Saved on this device"}
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
              onClick={() => navigateTo("settings")}
            >
              <Bell />
            </Button>
          </div>
        </header>
        <PullToRefresh
          onRefresh={onRefresh}
          scope={`${bootstrap.user.id}:${child?.id || ""}:${page}`}
          disabled={refreshDisabled || mobileMenu}
        >
          <main className="main-content">{children}</main>
        </PullToRefresh>
      </div>
      <div
        className={`bottom-dock ${quickActions ? "with-quick-actions" : ""}`}
      >
        {quickActions}
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => navigateTo(n.id)}
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
      </div>
    </div>
  );
}
