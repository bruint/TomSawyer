import { useEffect, useState } from "react";
import type { Child } from "../../shared/types";
import { parsePage, type Page } from "../lib/navigation";

export function useNavigation(children: Child[]) {
  const [childId, setChildId] = useState(
    () =>
      new URLSearchParams(location.search).get("child") ||
      localStorage.getItem("ts:child") ||
      "",
  );
  const [page, setPage] = useState(() =>
    parsePage(new URLSearchParams(location.search).get("view")),
  );
  const child = children.find((child) => child.id === childId) || children[0];

  useEffect(() => {
    if (child) {
      setChildId(child.id);
      localStorage.setItem("ts:child", child.id);
    }
  }, [child?.id]);

  useEffect(() => {
    const restoreLocation = () => {
      const params = new URLSearchParams(location.search);
      setPage(parsePage(params.get("view")));
      if (params.get("child")) setChildId(params.get("child")!);
    };
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, []);

  function updateLocation(nextPage: Page, nextChildId?: string) {
    const params = new URLSearchParams();
    if (nextChildId) params.set("child", nextChildId);
    if (nextPage !== "today") params.set("view", nextPage);
    history.pushState(null, "", `/?${params}`);
  }

  function navigate(nextPage: Page) {
    setPage(nextPage);
    updateLocation(nextPage, child?.id);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function selectChild(id: string) {
    setChildId(id);
    updateLocation(page, id);
  }

  return { child, page, navigate, selectChild };
}
