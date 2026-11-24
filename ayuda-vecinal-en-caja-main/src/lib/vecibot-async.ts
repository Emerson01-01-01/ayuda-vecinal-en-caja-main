/** Bound optional browser work so it cannot leave the conversation processing forever. */
export function withVecibotDeadline<T>(work: Promise<T>, timeout: number, message: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error?: unknown, value?: T) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener("abort", aborted);
      if (error !== undefined) reject(error); else resolve(value as T);
    };
    const aborted = () => finish(new DOMException("Envío cancelado", "AbortError"));
    const timer = setTimeout(() => finish(new Error(message)), timeout);
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
    work.then(value => finish(undefined, value), error => finish(error));
  });
}
