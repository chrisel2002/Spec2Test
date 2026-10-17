export function chunkArray<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

// How far a batched node has got, for "Generating tests 5/12" progress.
export type BatchProgress = { done: number; total: number };
