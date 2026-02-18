import { ProjectPage } from "./project-page";

export default async function ProjectPageRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <ProjectPage projectId={projectId} />;
}
