/**
 * Tiny concurrency-cap helper for edge functions.
 *
 * Usage:
 *   const limit = pLimit(10);
 *   const results = await Promise.all(
 *     userIds.map((u) => limit(() => processUser(u))),
 *   );
 *
 * Equivalent to the `p-limit` npm package but bundle-free and Deno-friendly.
 */

export type LimitedFn = <T>(fn: () => Promise<T>) => Promise<T>;

export function pLimit(concurrency: number): LimitedFn {
  if (concurrency < 1) throw new Error("concurrency must be >= 1");

  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active -= 1;
    const resume = queue.shift();
    if (resume) resume();
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        active += 1;
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          next();
        }
      };

      if (active < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}
