type AsyncIter<T> = AsyncIterator<T> | AsyncIterable<T>;

type Mode = "iters-noclose" | "iters-close-nowait" | "iters-close-wait";

interface MergeOptions {
  mode?: Mode;
  /**
   * Maximum number of concurrent iterators to read from. Unset or 0 means Infinity. Default is 0.
   */
  concurrency?: number;
}

function isAsyncIteratorOrIterable<T>(value: unknown): value is AsyncIter<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Symbol.asyncIterator in value || Symbol.iterator in value)
  );
}

export default function merge<TArray extends Array<AsyncIter<any>>>(
  mode: Mode,
  ...iters: TArray
): AsyncIterableIterator<TArray extends Array<AsyncIter<infer T>> ? T : never>;

export default function merge<TArray extends Array<AsyncIter<any>>>(
  options: MergeOptions,
  ...iters: TArray
): AsyncIterableIterator<TArray extends Array<AsyncIter<infer T>> ? T : never>;

export default function merge<TArray extends Array<AsyncIter<any>>>(
  ...iters: TArray
): AsyncIterableIterator<TArray extends Array<AsyncIter<infer T>> ? T : never>;

export default async function* merge(...args: any[]) {
  if (args.length === 0) {
    return;
  }
  const optionsOrMode = isAsyncIteratorOrIterable(args[0]) ? {} : args.shift();
  const options =
    typeof optionsOrMode === "string" ? { mode: optionsOrMode } : optionsOrMode;
  const { mode = "iters-close-nowait", concurrency = 0 } = options;
  const iters = args.map<AsyncIterator<any>>((iter) =>
    Symbol.asyncIterator in iter ? (iter as any)[Symbol.asyncIterator]() : iter
  );
  const active =
    concurrency && concurrency > 0 ? iters.slice(0, concurrency) : iters;
  const queued = concurrency && concurrency > 0 ? iters.slice(concurrency) : [];
  const promises = new Map(
    active.map((iterator) => [iterator, next(iterator)])
  );

  try {
    while (promises.size > 0) {
      const reply = await Promise.race(promises.values());

      if (reply.length === 3) {
        const [, iterator, err] = reply;
        // Since this iterator threw, it's already ended, so we remove it.
        promises.delete(iterator);
        throw err;
      }

      const [res, iterator] = reply;
      if (res.done) {
        promises.delete(iterator);
        const nextIterator = queued.shift();
        if (nextIterator) {
          promises.set(nextIterator, next(nextIterator));
        }
      } else {
        yield res.value;
        promises.set(iterator, next(iterator));
      }
    }
  } finally {
    switch (mode) {
      case "iters-noclose":
        // Let inner iterables continue running in nowhere until they reach
        // the next yield and block on it, then garbage collected (since
        // no-one will read the result of those yields).
        break;
      case "iters-close-nowait":
        promises.forEach((_, iterator) => void iterator.return?.());
        break;
      case "iters-close-wait":
        await Promise.all(
          [...promises.keys()].map((iterator) => iterator.return?.())
        );
        (await Promise.all(promises.values())).forEach((reply) => {
          if (reply.length === 3) {
            const [, , err] = reply;
            throw err;
          }
        });
        break;
    }
  }
}

async function next<T>(iterator: AsyncIterator<T>) {
  return iterator
    .next()
    .then((res) => [res, iterator] as const)
    .catch((err) => [undefined, iterator, err] as const);
}
