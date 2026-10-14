import { ListenButton } from "@/components/listen-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type TestCaseRow = {
  id: string;
  title: string;
  type: "positive" | "negative" | "boundary";
  given: string;
  when: string;
  then: string;
  basedOnAssumption: boolean;
};

export type RequirementRow = {
  id: string;
  code: string;
  title: string;
  text: string;
  isAmbiguous: boolean;
  ambiguityReason: string | null;
  suggestedRewrite: string | null;
  testCases: TestCaseRow[];
};

function TestCaseItem({ testCase }: { testCase: TestCaseRow }) {
  return (
    <li className="rounded border p-2 text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium">{testCase.title}</span>
        <Badge variant="outline">{testCase.type}</Badge>
        {testCase.basedOnAssumption && (
          <Badge variant="secondary">based on assumption</Badge>
        )}
      </div>
      <p>
        <span className="font-medium">Given</span> {testCase.given}
      </p>
      <p>
        <span className="font-medium">When</span> {testCase.when}
      </p>
      <p>
        <span className="font-medium">Then</span> {testCase.then}
      </p>
    </li>
  );
}

function RequirementItem({ requirement }: { requirement: RequirementRow }) {
  return (
    <li className="rounded border p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          {requirement.code}
        </span>
        <span className="font-medium">{requirement.title}</span>
        {requirement.isAmbiguous && (
          <Badge variant="destructive">ambiguous</Badge>
        )}
      </div>
      <p className="mb-2 text-sm text-muted-foreground">{requirement.text}</p>
      {requirement.isAmbiguous && (
        <div className="mb-2 rounded bg-muted/50 p-2 text-xs">
          <p>
            <span className="font-medium">Why:</span>{" "}
            {requirement.ambiguityReason}
          </p>
          <p>
            <span className="font-medium">Suggested rewrite:</span>{" "}
            {requirement.suggestedRewrite}
          </p>
        </div>
      )}
      {requirement.testCases.length > 0 && (
        <ul className="space-y-2">
          {requirement.testCases.map((tc) => (
            <TestCaseItem key={tc.id} testCase={tc} />
          ))}
        </ul>
      )}
    </li>
  );
}

async function fetchRunSummary(documentId: string): Promise<string> {
  const response = await fetch(`/api/documents/${documentId}/summary`);
  if (!response.ok) throw new Error("Couldn't load the run summary");
  const body: { summary: string } = await response.json();
  return body.summary;
}

export function RequirementsPanel({
  documentId,
  requirements,
  generating,
  error,
  onGenerate,
  voiceEnabled,
}: {
  documentId: string | null;
  requirements: RequirementRow[];
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
  voiceEnabled: boolean;
}) {
  if (!documentId) {
    return (
      <p className="text-sm text-muted-foreground">
        Upload a spec to get started.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Button onClick={onGenerate} disabled={generating}>
          {generating ? "Generating…" : "Generate tests"}
        </Button>
        {voiceEnabled && requirements.length > 0 && !generating && (
          <ListenButton
            label="Listen to summary"
            getText={() => fetchRunSummary(documentId)}
          />
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      {requirements.length === 0 && !generating && (
        <p className="text-sm text-muted-foreground">
          No requirements yet. Click &ldquo;Generate tests&rdquo; to extract
          them from this document.
        </p>
      )}
      <ul className="space-y-3">
        {requirements.map((requirement) => (
          <RequirementItem key={requirement.id} requirement={requirement} />
        ))}
      </ul>
    </div>
  );
}
