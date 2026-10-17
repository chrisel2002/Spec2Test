"use client";

import { useSyncExternalStore } from "react";

// There are no user accounts, so "who changed what" in the review history
// is the name the reviewer types in the header. It's remembered per
// browser in localStorage. That's an honest label, not authentication:
// with real users this would come from the session instead.

const STORAGE_KEY = "spec2test.reviewer";
const DEFAULT_NAME = "Reviewer";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// useSyncExternalStore rather than useState + useEffect: it reads
// localStorage during render without a flash of the default name, and the
// server snapshot keeps hydration consistent.
export function useReviewerName(): [string, (name: string) => void] {
  const name = useSyncExternalStore(subscribe, read, () => DEFAULT_NAME);

  function setName(next: string) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode): the name just won't persist.
    }
    listeners.forEach((listener) => listener());
  }

  return [name, setName];
}
