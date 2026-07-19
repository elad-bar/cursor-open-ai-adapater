/** Invisible keepalive for OpenAI `delta.content` during long SDK tool gaps. */
export const STREAM_IDLE_HEARTBEAT_CHAR = "\u200b";

export function sleep(ms: number, delay: (ms: number) => Promise<void> = defaultSleep): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return delay(ms);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface IdleHeartbeatOptions<T> {
  intervalMs: number;
  onHeartbeat: () => string;
  onEvent?: (event: T) => string | undefined;
  /** Injectable for tests. */
  delay?: (ms: number) => Promise<void>;
}

/**
 * Yields assistant text from events and periodic heartbeats when the source is idle.
 */
export async function* withIdleHeartbeats<T>(
  events: AsyncIterable<T>,
  options: IdleHeartbeatOptions<T>,
): AsyncGenerator<string, void> {
  const { intervalMs, onHeartbeat, onEvent, delay = defaultSleep } = options;
  if (intervalMs <= 0) {
    for await (const event of events) {
      const text = onEvent?.(event);
      if (text) {
        yield text;
      }
    }
    return;
  }

  const iterator = events[Symbol.asyncIterator]();
  let pending = iterator.next();
  let lastActivityMs = Date.now();

  while (true) {
    const elapsed = Date.now() - lastActivityMs;
    const remainingMs = Math.max(0, intervalMs - elapsed);

    const raced = await Promise.race([
      pending.then((result) => ({ kind: "event" as const, result })),
      sleep(remainingMs, delay).then(() => ({ kind: "timeout" as const })),
    ]);

    if (raced.kind === "timeout") {
      yield onHeartbeat();
      lastActivityMs = Date.now();
      continue;
    }

    const { result } = raced;
    if (result.done) {
      break;
    }

    lastActivityMs = Date.now();
    const text = onEvent?.(result.value);
    if (text) {
      yield text;
    }
    pending = iterator.next();
  }
}
