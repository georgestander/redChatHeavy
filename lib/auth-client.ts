import { createAuthClient } from "better-auth/react";

// baseURL is optional when the auth server is on the same origin.
// Provide baseURL if the frontend and auth server are on different domains.
const authClient = createAuthClient();

export default authClient;
