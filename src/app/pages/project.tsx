import { Suspense } from "react";
import { ProjectPage } from "@/app/(chat)/project/[projectId]/project-page";

export default function ProjectRoutePage({ projectId }: { projectId: string }) {
  return (
    <>
      <title>Project</title>
      <Suspense>
        <ProjectPage projectId={projectId} />
      </Suspense>
    </>
  );
}
