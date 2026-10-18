"use client";

import { BarChart3, FileUp, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { AccessBadge, useAccess } from "@/components/access-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AppHeader({
  onUpload,
  uploading,
  reviewer,
  onReviewerChange,
}: {
  onUpload: (file: File) => void;
  uploading: boolean;
  reviewer: string;
  onReviewerChange: (name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { guard } = useAccess();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
      <span className="flex items-center gap-2 font-semibold">
        <FlaskConical className="size-5 text-emerald-600" aria-hidden />
        Spec2Test
      </span>
      <Link
        href="/insights"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <BarChart3 className="size-4" aria-hidden />
        Insights
      </Link>
      <div className="ml-auto flex items-center gap-2 text-sm">
        <AccessBadge />
        <label htmlFor="reviewer-name" className="text-muted-foreground">
          Reviewing as
        </label>
        <Input
          id="reviewer-name"
          value={reviewer}
          onChange={(e) => onReviewerChange(e.target.value)}
          className="w-36"
          maxLength={60}
        />
      </div>
      <input
        ref={inputRef}
        id="spec-upload"
        type="file"
        accept=".md,.pdf"
        className="hidden"
        // Every way of opening the file picker (this header's button, the
        // empty state's label) ends in a click on this input, so it's the
        // one place to stop a locked visitor before the picker opens.
        onClick={(e) => {
          if (!guard()) e.preventDefault();
        }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <Button disabled={uploading} onClick={() => inputRef.current?.click()}>
        <FileUp aria-hidden />
        {uploading ? "Uploading…" : "Upload spec"}
      </Button>
    </header>
  );
}
