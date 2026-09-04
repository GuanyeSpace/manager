"use client";

import { useState } from "react";
import { useActionState } from "react";
import { renameBranchAction, type BranchFormState } from "@/modules/branches/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BranchRenameDialog({
  branchId,
  currentName,
}: {
  branchId: string;
  currentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<BranchFormState, FormData>(
    renameBranchAction,
    undefined
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          重命名
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名分公司</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="branchId" value={branchId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`rename-${branchId}`}>名称</Label>
            <Input id={`rename-${branchId}`} name="name" defaultValue={currentName} />
            {state?.fieldErrors?.name && (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            )}
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
