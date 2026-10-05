"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";

export function AppHeader({
  onUpload,
  uploading,
}: {
  onUpload: (file: File) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <span className="font-semibold">Spec2Test</span>
      <input
        ref={inputRef}
        type="file"
        accept=".md,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <Button disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? "Uploading…" : "Upload spec"}
      </Button>
    </header>
  );
}
