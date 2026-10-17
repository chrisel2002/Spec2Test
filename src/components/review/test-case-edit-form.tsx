"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TestCaseTypeSchema } from "@/lib/agents/schemas";
import {
  type EditableTestCase,
  EditableTestCaseSchema,
} from "@/lib/review/transitions";
import type { TestCaseView } from "@/lib/runs/types";

type FieldErrors = Partial<Record<keyof EditableTestCase, string>>;

const TEXT_FIELDS = [
  { name: "given", label: "Given" },
  { name: "when", label: "When" },
  { name: "then", label: "Then" },
] as const;

// Inline editor for one test case. Validates with EditableTestCaseSchema
// — the same Zod schema the API route and the model's output use — so a
// value the form accepts is a value the server accepts.
export function TestCaseEditForm({
  testCase,
  saving,
  error,
  onSave,
  onCancel,
}: {
  testCase: TestCaseView;
  saving: boolean;
  error: string | null;
  onSave: (values: EditableTestCase) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<EditableTestCase>({
    title: testCase.title,
    type: testCase.type,
    given: testCase.given,
    when: testCase.when,
    then: testCase.then,
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  function update<K extends keyof EditableTestCase>(key: K, value: EditableTestCase[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = {
      ...values,
      title: values.title.trim(),
      given: values.given.trim(),
      when: values.when.trim(),
      then: values.then.trim(),
    };
    const parsed = EditableTestCaseSchema.safeParse(trimmed);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof EditableTestCase;
        fieldErrors[field] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSave(parsed.data);
  }

  const idPrefix = `edit-${testCase.id}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label={`Edit ${testCase.title}`} noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-title`} className="text-xs font-medium">
            Title
          </label>
          <Input
            id={`${idPrefix}-title`}
            value={values.title}
            onChange={(e) => update("title", e.target.value)}
            aria-invalid={errors.title ? true : undefined}
          />
          {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-type`} className="text-xs font-medium">
            Type
          </label>
          <select
            id={`${idPrefix}-type`}
            value={values.type}
            onChange={(e) => update("type", TestCaseTypeSchema.parse(e.target.value))}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {TestCaseTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>
      {TEXT_FIELDS.map(({ name, label }) => (
        <div key={name} className="space-y-1">
          <label htmlFor={`${idPrefix}-${name}`} className="text-xs font-medium">
            {label}
          </label>
          <Textarea
            id={`${idPrefix}-${name}`}
            value={values[name]}
            onChange={(e) => update(name, e.target.value)}
            rows={2}
            className="min-h-10"
            aria-invalid={errors[name] ? true : undefined}
          />
          {errors[name] && <p className="text-xs text-destructive">{errors[name]}</p>}
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save and approve"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
