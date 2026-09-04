"use client";

import { useActionState } from "react";
import {
  resignUserAction,
  reactivateUserAction,
  type UserFormState,
} from "@/modules/users/actions";
import { Button } from "@/components/ui/button";

export function EmploymentStatusForm({
  userId,
  currentStatus,
}: {
  userId: string;
  currentStatus: "ACTIVE" | "RESIGNED";
}) {
  const [resignState, resignAction, resignPending] = useActionState<UserFormState, FormData>(
    resignUserAction,
    undefined
  );
  const [reactivateState, reactivateAction, reactivatePending] =
    useActionState<UserFormState, FormData>(reactivateUserAction, undefined);

  return (
    <div className="flex flex-col gap-2">
      {currentStatus === "ACTIVE" ? (
        <form action={resignAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" variant="destructive" disabled={resignPending}>
            {resignPending ? "处理中…" : "设为离职（立即失效其所有会话）"}
          </Button>
          {resignState?.error && (
            <p className="mt-2 text-sm text-destructive">{resignState.error}</p>
          )}
        </form>
      ) : (
        <form action={reactivateAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" disabled={reactivatePending}>
            {reactivatePending ? "处理中…" : "设为在职（复职）"}
          </Button>
          {reactivateState?.error && (
            <p className="mt-2 text-sm text-destructive">{reactivateState.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
