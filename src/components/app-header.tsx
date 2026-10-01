import { Button } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
      <span className="font-semibold">Spec2Test</span>
      <Button disabled title="Coming soon">
        Upload spec
      </Button>
    </header>
  );
}
