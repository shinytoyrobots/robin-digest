/**
 * Run `fn` over `items` with at most `concurrency` in-flight at once.
 * Results are returned in the same order as items.
 */
export async function concurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const queue = items.map((item, index) => ({ item, index }));

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const entry = queue.shift()!;
      results[entry.index] = await fn(entry.item);
    }
  });

  await Promise.allSettled(workers);
  return results;
}
