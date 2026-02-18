"use server";

import { requestInfo } from "rwsdk/worker";
import { auth } from "@/lib/auth";
import {
  createProject,
  deleteProject,
  getProjectById,
  getProjectsByUserId,
  updateProject,
} from "@/lib/db/queries";
import {
  projectCreateInputSchema,
  projectGetByIdInputSchema,
  projectRemoveInputSchema,
  projectSetInstructionsInputSchema,
  projectUpdateInputSchema,
} from "@/lib/schemas/project";
import { generateUUID } from "@/lib/utils";

type ProjectRecord = NonNullable<Awaited<ReturnType<typeof getProjectById>>>;

function serializeProject(project: ProjectRecord) {
  return {
    ...project,
    createdAt:
      project.createdAt instanceof Date
        ? project.createdAt.toISOString()
        : project.createdAt,
    updatedAt:
      project.updatedAt instanceof Date
        ? project.updatedAt.toISOString()
        : project.updatedAt,
  };
}

async function requireUserId() {
  const session = await auth.api.getSession({
    headers: requestInfo.request.headers,
  });
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}

export async function list() {
  const userId = await requireUserId();
  const projects = await getProjectsByUserId({ userId });
  return projects.map((project) => serializeProject(project));
}

export async function create(rawInput: unknown) {
  const input = projectCreateInputSchema.parse(rawInput);
  const userId = await requireUserId();
  const id = generateUUID();
  await createProject({
    id,
    userId,
    name: input.name,
    instructions: input.instructions,
    icon: input.icon,
    iconColor: input.iconColor,
  });
  return { id };
}

export async function getById(rawInput: unknown) {
  const input = projectGetByIdInputSchema.parse(rawInput);
  const userId = await requireUserId();
  const project = await getProjectById({ id: input.id });
  if (!project) {
    throw new Error("Project not found");
  }
  if (project.userId !== userId) {
    throw new Error("Project not found");
  }
  return serializeProject(project);
}

export async function update(rawInput: unknown) {
  const input = projectUpdateInputSchema.parse(rawInput);
  const userId = await requireUserId();
  const project = await getProjectById({ id: input.id });
  if (!project) {
    throw new Error("Project not found");
  }
  if (project.userId !== userId) {
    throw new Error("Project not found");
  }
  await updateProject({ id: input.id, updates: input.updates });
  return { success: true };
}

export async function setInstructions(rawInput: unknown) {
  const input = projectSetInstructionsInputSchema.parse(rawInput);
  const userId = await requireUserId();
  const project = await getProjectById({ id: input.id });
  if (!project) {
    throw new Error("Project not found");
  }
  if (project.userId !== userId) {
    throw new Error("Project not found");
  }
  await updateProject({
    id: input.id,
    updates: { instructions: input.instructions },
  });
  return { success: true };
}

export async function remove(rawInput: unknown) {
  const input = projectRemoveInputSchema.parse(rawInput);
  const userId = await requireUserId();
  const project = await getProjectById({ id: input.id });
  if (!project) {
    throw new Error("Project not found");
  }
  if (project.userId !== userId) {
    throw new Error("Project not found");
  }
  await deleteProject({ id: input.id });
  return { success: true };
}
