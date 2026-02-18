const YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

// Route for updating selected-model cookie because setting in an action causes a refresh
export async function handleChatModelRequest(request: Request) {
  try {
    const { model } = await request.json();

    if (!model || typeof model !== "string") {
      return Response.json({ error: "Invalid model parameter" }, { status: 400 });
    }

    const encodedModel = encodeURIComponent(model);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const setCookie = `chat-model=${encodedModel}; Path=/; Max-Age=${YEAR_IN_SECONDS}; SameSite=Lax${secure}`;

    return Response.json(
      { success: true },
      { headers: { "Set-Cookie": setCookie } }
    );
  } catch (_error) {
    return Response.json({ error: "Failed to set cookie" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return await handleChatModelRequest(request);
}
