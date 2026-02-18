"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type ProjectDetailsData,
  ProjectDetailsDialog,
} from "@/components/project-details-dialog";
import { SidebarProjectItem } from "@/components/sidebar-project-item";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePathname, useRouter } from "@/hooks/use-navigation";
import type { Project } from "@/lib/db/schema";
import { projectKeys } from "@/lib/query-keys";
import { parseChatIdFromPathname } from "@/providers/parse-chat-id-from-pathname";
import { create, list } from "@/server/actions/project";

export function SidebarProjects() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setOpenMobile } = useSidebar();
  const { data: projects, isLoading } = useQuery({
    queryKey: projectKeys.list,
    queryFn: () => list(),
    select: (data): Project[] =>
      data.map((project) => ({
        ...project,
        createdAt: new Date(project.createdAt),
        updatedAt: new Date(project.updatedAt),
      })),
  });
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);

  // Auto-expand project if we're on a project route
  const currentProjectId = useMemo(
    () => parseChatIdFromPathname(pathname).projectId,
    [pathname]
  );

  const createProjectMutation = useMutation({
    mutationFn: create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.list,
      });
      setNewProjectDialogOpen(false);
      setOpenMobile(false);
      router.push(`/project/${data.id}`);
    },
  });

  const handleCreateProject = (data: ProjectDetailsData) => {
    createProjectMutation.mutate({
      name: data.name,
      icon: data.icon,
      iconColor: data.color,
    });
  };

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          className="cursor-pointer"
          onClick={() => setNewProjectDialogOpen(true)}
        >
          <FolderPlus className="size-4" />
          <span>New project</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {!isLoading &&
        projects?.map((project) => {
          const isActive = currentProjectId === project.id;
          return (
            <SidebarProjectItem
              isActive={isActive}
              key={project.id}
              project={project}
              setOpenMobile={setOpenMobile}
            />
          );
        })}

      <ProjectDetailsDialog
        isLoading={createProjectMutation.isPending}
        mode="create"
        onOpenChange={setNewProjectDialogOpen}
        onSubmit={handleCreateProject}
        open={newProjectDialogOpen}
      />
    </>
  );
}
