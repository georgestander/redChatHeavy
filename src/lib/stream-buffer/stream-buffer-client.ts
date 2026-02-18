const STREAM_BUFFER_ORIGIN = "https://stream-buffer";

type DurableObjectStubLike = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type DurableObjectNamespaceLike = {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
};

export type StreamBufferBindings = {
  STREAM_BUFFER_DO: DurableObjectNamespaceLike;
};

export type StreamBufferAppendEvent = {
  id: string;
  block: string;
};

function getStreamBufferStub(env: StreamBufferBindings, streamId: string) {
  const objectId = env.STREAM_BUFFER_DO.idFromName(streamId);
  return env.STREAM_BUFFER_DO.get(objectId);
}

export async function appendStreamBufferEvents({
  env,
  streamId,
  events,
}: {
  env: StreamBufferBindings;
  streamId: string;
  events: StreamBufferAppendEvent[];
}): Promise<void> {
  const stub = getStreamBufferStub(env, streamId);
  const response = await stub.fetch(`${STREAM_BUFFER_ORIGIN}/append`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to append stream events (${response.status}): ${body}`
    );
  }
}

export async function finalizeStreamBuffer({
  env,
  streamId,
}: {
  env: StreamBufferBindings;
  streamId: string;
}): Promise<void> {
  const stub = getStreamBufferStub(env, streamId);
  const response = await stub.fetch(`${STREAM_BUFFER_ORIGIN}/finalize`, {
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to finalize stream buffer (${response.status}): ${body}`
    );
  }
}

export async function resumeStreamBuffer({
  env,
  streamId,
  lastEventId,
}: {
  env: StreamBufferBindings;
  streamId: string;
  lastEventId?: string | null;
}): Promise<Response> {
  const stub = getStreamBufferStub(env, streamId);
  const headers = new Headers();
  if (lastEventId) {
    headers.set("Last-Event-ID", lastEventId);
  }

  return await stub.fetch(`${STREAM_BUFFER_ORIGIN}/resume`, {
    method: "GET",
    headers,
  });
}
