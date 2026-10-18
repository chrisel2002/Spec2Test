"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Demo mode on the client. The server decides whether this visitor is
// locked (lib/access.ts) and passes a boolean; gated buttons stay visible
// but open the access-code dialog instead of sending a request that would
// only come back 401. The server still checks every gated request: this
// is for a friendly UI, not for security.

type AccessContextValue = {
  locked: boolean;
  // Runs `action` if the visitor has access; otherwise opens the dialog.
  // Returns whether it ran.
  guard: (action?: () => void) => boolean;
};

const AccessContext = createContext<AccessContextValue>({
  locked: false,
  guard: (action) => {
    action?.();
    return true;
  },
});

export function useAccess() {
  return useContext(AccessContext);
}

export function AccessProvider({
  initialLocked,
  message,
  children,
}: {
  initialLocked: boolean;
  message: string;
  children: React.ReactNode;
}) {
  const [locked, setLocked] = useState(initialLocked);
  const [open, setOpen] = useState(false);

  function guard(action?: () => void) {
    if (locked) {
      setOpen(true);
      return false;
    }
    action?.();
    return true;
  }

  return (
    <AccessContext.Provider value={{ locked, guard }}>
      {children}
      <AccessDialog
        open={open}
        message={message}
        onClose={() => setOpen(false)}
        onGranted={() => {
          setLocked(false);
          setOpen(false);
        }}
      />
    </AccessContext.Provider>
  );
}

// The header's "Demo" marker, with a way in for visitors who have a code.
export function AccessBadge() {
  const { locked, guard } = useAccess();
  if (!locked) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => guard()}>
      <KeyRound aria-hidden />
      Demo · Enter access code
    </Button>
  );
}

function AccessDialog({
  open,
  message,
  onClose,
  onGranted,
}: {
  open: boolean;
  message: string;
  onClose: () => void;
  onGranted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // showModal() rather than the `open` attribute: it traps focus, closes
  // on Escape, and puts the dialog above everything else.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        setError(body.error ?? "Couldn't check the code");
        return;
      }
      setCode("");
      onGranted();
    } finally {
      setChecking(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="access-title"
      className="m-auto w-full max-w-md rounded-lg border bg-background p-6 text-foreground shadow-lg backdrop:bg-black/40"
    >
      <h2 id="access-title" className="flex items-center gap-2 text-lg font-semibold">
        <KeyRound className="size-5" aria-hidden />
        Access code needed
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Everything on this demo is shared: specs uploaded with a code are visible to every
        visitor, so only upload synthetic or public documents.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label htmlFor="access-code" className="text-sm font-medium">
          Access code
        </label>
        <Input
          id="access-code"
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={200}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Keep browsing
          </Button>
          <Button type="submit" disabled={checking || !code.trim()}>
            {checking && <Loader2 className="animate-spin" aria-hidden />}
            Unlock
          </Button>
        </div>
      </form>
    </dialog>
  );
}
