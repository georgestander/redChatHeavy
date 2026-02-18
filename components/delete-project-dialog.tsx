"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePathname, useRouter } from "@/hooks/use-navigation";
import { projectKeys } from "@/lib/query-keys";
import { remove } from "@/server/actions/project";

type DeleteProjectDialogProps = {
  deleteId: string | null;
  showDeleteDialog: boolean;
  setShowDeleteDialog: (show: boolean) => void;
};

export function DeleteProjectDialog({
  deleteId,
  showDeleteDialog,
  setShowDeleteDialog,
}: DeleteProjectDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.list,
      });
      toast.success("Project deleted");
    },
    onError: () => {
      toast.error("Failed to delete project");
    },
  });

  const handleDelete = useCallback(async () => {
    if (!deleteId) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
    } catch {
      // error surfaced via onError above
    }

    setShowDeleteDialog(false);

    // If we are inside this project's route, navigate home
    const inProjectRoute =
      typeof pathname === "string" &&
      (pathname === `/project/${deleteId}` ||
        pathname.startsWith(`/project/${deleteId}/`));
    if (inProjectRoute) {
      router.push("/");
    }
  }, [deleteId, deleteMutation, pathname, router, setShowDeleteDialog]);

  return (
    <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this project?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            project and its associations.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
