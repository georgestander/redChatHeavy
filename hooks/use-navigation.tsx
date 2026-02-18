"use client";

import { useEffect, useMemo, useState } from "react";
import { navigate } from "rwsdk/client";

const NAVIGATION_EVENT = "rw:navigation";

function notifyNavigation() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

function getPathname() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.pathname;
}

function getSearch() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.search;
}

export function usePathname() {
  const [pathname, setPathname] = useState(getPathname);

  useEffect(() => {
    const handleChange = () => setPathname(getPathname());
    window.addEventListener("popstate", handleChange);
    window.addEventListener(NAVIGATION_EVENT, handleChange);
    return () => {
      window.removeEventListener("popstate", handleChange);
      window.removeEventListener(NAVIGATION_EVENT, handleChange);
    };
  }, []);

  return pathname;
}

export function useSearchParams() {
  const [search, setSearch] = useState(getSearch);

  useEffect(() => {
    const handleChange = () => setSearch(getSearch());
    window.addEventListener("popstate", handleChange);
    window.addEventListener(NAVIGATION_EVENT, handleChange);
    return () => {
      window.removeEventListener("popstate", handleChange);
      window.removeEventListener(NAVIGATION_EVENT, handleChange);
    };
  }, []);

  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useRouter() {
  return {
    push: (href: string) => {
      navigate(href, { history: "push" }).then(
        notifyNavigation,
        () => undefined
      );
    },
    replace: (href: string) => {
      navigate(href, { history: "replace" }).then(
        notifyNavigation,
        () => undefined
      );
    },
    back: () => {
      if (typeof window !== "undefined") {
        window.history.back();
      }
    },
    refresh: () => {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    },
    prefetch: () => undefined,
  };
}

export function updateSearchParams(
  params: URLSearchParams,
  options: { history?: "push" | "replace" } = { history: "replace" }
) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const nextSearch = params.toString();
  url.search = nextSearch ? `?${nextSearch}` : "";

  if (options.history === "push") {
    window.history.pushState(null, "", url.toString());
  } else {
    window.history.replaceState(null, "", url.toString());
  }

  notifyNavigation();
}
