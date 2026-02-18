const STREAM_EVENTS_KEY = "events";
const STREAM_META_KEY = "meta";
const STREAM_RETENTION_MS = 10 * 60 * 1000;

const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

type StreamEvent = {
  id: string;
  block: string;
  createdAt: number;
};

type StreamMeta = {
  finalized: boolean;
  expiresAt: number;
  updatedAt: number;
};

type ResumeListener = {
  writer: WritableStreamDefaultWriter<string>;
  cursor: number;
};

type AppendPayload = {
  events: Array<{
    id: string;
    block: string;
  }>;
};

type DurableObjectStorageLike = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAll(): Promise<void>;
};

type DurableObjectStateLike = {
  storage: DurableObjectStorageLike;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
};

type AppendEventCandidate = {
  id: string;
  block: string;
};

function isAppendEventCandidate(value: unknown): value is AppendEventCandidate {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "block" in value &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.block === "string" &&
    value.block.length > 0
  );
}

export class StreamBufferDO {
  private readonly state: DurableObjectStateLike;
  private readonly listeners = new Set<ResumeListener>();

  constructor(state: DurableObjectStateLike) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    try {
      if (request.method === "POST" && pathname === "/append") {
        return await this.handleAppend(request);
      }

      if (request.method === "POST" && pathname === "/finalize") {
        return await this.handleFinalize();
      }

      if (request.method === "GET" && pathname === "/resume") {
        return await this.handleResume(request);
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("[TRACE] StreamBufferDO request failed", {
        pathname,
        error,
      });
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  async alarm(): Promise<void> {
    const meta = await this.getMeta();
    if (!meta) {
      return;
    }

    if (meta.expiresAt > Date.now()) {
      await this.state.storage.setAlarm(meta.expiresAt);
      return;
    }

    await this.state.storage.deleteAll();
    await this.closeAllListeners();
  }

  private async handleAppend(request: Request): Promise<Response> {
    const payload = await this.parseAppendPayload(request);
    if (!payload) {
      return new Response("Invalid append payload", { status: 400 });
    }

    const startedAt = Date.now();
    const result = await this.state.blockConcurrencyWhile(async () => {
      const [events, currentMeta] = await this.readState();

      if (currentMeta.finalized) {
        return {
          status: 409,
          message: "Stream already finalized",
          events,
          meta: currentMeta,
        };
      }

      const knownEventIds = new Set(events.map((event) => event.id));
      const now = Date.now();
      const nextEvents = [...events];

      for (const event of payload.events) {
        if (knownEventIds.has(event.id)) {
          continue;
        }

        knownEventIds.add(event.id);
        nextEvents.push({
          id: event.id,
          block: event.block,
          createdAt: now,
        });
      }

      const nextMeta: StreamMeta = {
        finalized: false,
        expiresAt: now + STREAM_RETENTION_MS,
        updatedAt: now,
      };

      await this.writeState(nextEvents, nextMeta);
      return { status: 200, message: "ok", events: nextEvents, meta: nextMeta };
    });

    await this.flushListeners(result.events, result.meta.finalized);

    const elapsed = Date.now() - startedAt;
    if (elapsed > 80) {
      console.warn("[TRACE] StreamBufferDO append slow", {
        elapsed,
        eventCount: result.events.length,
      });
    }

    return Response.json(
      {
        ok: result.status === 200,
        message: result.message,
      },
      { status: result.status }
    );
  }

  private async handleFinalize(): Promise<Response> {
    const startedAt = Date.now();
    const result = await this.state.blockConcurrencyWhile(async () => {
      const [events, currentMeta] = await this.readState();
      if (currentMeta.finalized) {
        return { events, meta: currentMeta };
      }

      const now = Date.now();
      const nextMeta: StreamMeta = {
        finalized: true,
        expiresAt: now + STREAM_RETENTION_MS,
        updatedAt: now,
      };

      await this.writeState(events, nextMeta);
      return { events, meta: nextMeta };
    });

    await this.flushListeners(result.events, result.meta.finalized);

    const elapsed = Date.now() - startedAt;
    if (elapsed > 80) {
      console.warn("[TRACE] StreamBufferDO finalize slow", { elapsed });
    }

    return Response.json({ ok: true });
  }

  private async handleResume(request: Request): Promise<Response> {
    const lastEventId = request.headers.get("Last-Event-ID");

    const [events, meta] = await this.readState();
    const cursor = this.resolveResumeCursor(events, lastEventId);

    const stream = new TransformStream<string, string>();
    const writer = stream.writable.getWriter();
    const listener: ResumeListener = { writer, cursor };

    for (let index = listener.cursor; index < events.length; index++) {
      await listener.writer.write(events[index].block);
      listener.cursor = index + 1;
    }

    if (meta.finalized) {
      await listener.writer.close();
      return new Response(
        stream.readable.pipeThrough(new TextEncoderStream()),
        {
          headers: SSE_HEADERS,
        }
      );
    }

    this.listeners.add(listener);

    request.signal.addEventListener(
      "abort",
      () => {
        this.removeListener(listener, true).catch(() => undefined);
      },
      { once: true }
    );

    return new Response(stream.readable.pipeThrough(new TextEncoderStream()), {
      headers: SSE_HEADERS,
    });
  }

  private async readState(): Promise<[StreamEvent[], StreamMeta]> {
    const storedEvents =
      await this.state.storage.get<StreamEvent[]>(STREAM_EVENTS_KEY);
    const storedMeta = await this.getMeta();

    const now = Date.now();
    const events = storedEvents ?? [];
    const meta = storedMeta ?? {
      finalized: false,
      expiresAt: now + STREAM_RETENTION_MS,
      updatedAt: now,
    };

    return [events, meta];
  }

  private async writeState(
    events: StreamEvent[],
    meta: StreamMeta
  ): Promise<void> {
    await this.state.storage.put(STREAM_EVENTS_KEY, events);
    await this.state.storage.put(STREAM_META_KEY, meta);
    await this.state.storage.setAlarm(meta.expiresAt);
  }

  private async getMeta(): Promise<StreamMeta | null> {
    return (await this.state.storage.get<StreamMeta>(STREAM_META_KEY)) ?? null;
  }

  private resolveResumeCursor(
    events: StreamEvent[],
    lastEventId: string | null
  ): number {
    if (!lastEventId) {
      return 0;
    }

    const resumeIndex = events.findIndex((event) => event.id === lastEventId);
    if (resumeIndex < 0) {
      return 0;
    }

    return resumeIndex + 1;
  }

  private async parseAppendPayload(
    request: Request
  ): Promise<AppendPayload | null> {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("events" in body)) {
      return null;
    }

    const source = body.events;
    if (!Array.isArray(source)) {
      return null;
    }

    const events = source.filter(isAppendEventCandidate);
    if (events.length === 0) {
      return null;
    }

    return { events };
  }

  private async flushListeners(
    events: StreamEvent[],
    finalized: boolean
  ): Promise<void> {
    for (const listener of [...this.listeners]) {
      try {
        for (let index = listener.cursor; index < events.length; index++) {
          await listener.writer.write(events[index].block);
          listener.cursor = index + 1;
        }

        if (finalized) {
          await this.removeListener(listener, true);
        }
      } catch (error) {
        console.error("[TRACE] StreamBufferDO listener write failed", {
          error,
        });
        await this.removeListener(listener, false);
      }
    }
  }

  private async removeListener(
    listener: ResumeListener,
    closeWriter: boolean
  ): Promise<void> {
    if (!this.listeners.has(listener)) {
      return;
    }

    this.listeners.delete(listener);
    if (!closeWriter) {
      return;
    }

    await listener.writer.close().catch(() => undefined);
  }

  private async closeAllListeners(): Promise<void> {
    for (const listener of [...this.listeners]) {
      await this.removeListener(listener, true);
    }
  }
}
