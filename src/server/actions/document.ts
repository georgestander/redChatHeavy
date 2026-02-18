"use server";

import { requestInfo } from "rwsdk/worker";
import type { z } from "zod";
import { auth } from "@/lib/auth";
import {
  getDocumentById,
  getDocumentsById,
  getPublicDocumentsById,
  saveDocument as saveDocumentQuery,
} from "@/lib/db/queries";
import {
  documentIdInputSchema,
  saveDocumentInputSchema,
} from "@/lib/schemas/document";

type DocumentIdInput = z.infer<typeof documentIdInputSchema>;
type SaveDocumentInput = z.infer<typeof saveDocumentInputSchema>;

async function requireUser() {
  const session = await auth.api.getSession({
    headers: requestInfo.request.headers,
  });

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  const { id, ...rest } = session.user;
  if (!id) {
    console.error("User ID missing in session callback");
    throw new Error("UNAUTHORIZED");
  }

  return { id, ...rest };
}

export async function getDocuments(input: DocumentIdInput) {
  const user = await requireUser();
  const parsed = documentIdInputSchema.parse(input);
  const documents = await getDocumentsById({
    id: parsed.id,
    userId: user.id,
  });

  if (documents.length === 0) {
    throw new Error("Document not found");
  }

  return documents;
}

export async function getPublicDocuments(input: DocumentIdInput) {
  const parsed = documentIdInputSchema.parse(input);
  const documents = await getPublicDocumentsById({ id: parsed.id });

  if (documents.length === 0) {
    throw new Error("Public document not found");
  }

  return documents;
}

export async function saveDocument(input: SaveDocumentInput) {
  const user = await requireUser();
  const parsed = saveDocumentInputSchema.parse(input);
  const lastDocument = await getDocumentById({ id: parsed.id });

  if (!lastDocument) {
    throw new Error("Document not found");
  }

  await saveDocumentQuery({
    id: parsed.id,
    content: parsed.content,
    title: parsed.title,
    kind: parsed.kind,
    userId: user.id,
    messageId: lastDocument.messageId,
  });

  return { success: true };
}
