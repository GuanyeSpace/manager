// 故障注入子进程：由 test-auth-overlap-fault.ts 启动，验证主流程抛异常时仍能清理并非零退出。
import "dotenv/config";
import { hash } from "bcryptjs";
import { Role } from "../../app/generated/prisma/enums";
import { runTestLifecycle } from "./test-db";
import { runOverlap } from "./overlap-harness";
import { createLoginSession } from "../../modules/auth/auth-service";

async function main(): Promise<void> {
  const mode = process.env.FAULT_MODE ?? "main_throw";
  await runTestLifecycle(3, async ({ admin, extras, marker }) => {
    const [left, right, observer] = extras;
    const branch = await admin.branch.create({ data: { name: `${marker}-branch` } });
    const pw = await hash("OldPass1234", 10);
    const u = await admin.user.create({
      data: {
        username: `${marker}-u`,
        name: "u",
        passwordHash: pw,
        role: Role.CONTROLLER,
        branchId: branch.id,
        mustChangePassword: false,
      },
    });

    if (mode === "main_throw") {
      throw new Error("injected main throw");
    }

    if (mode === "first_tx_error") {
      await runOverlap(
        left,
        right,
        observer,
        async () => {
          throw new Error("first body error");
        },
        (tx) => createLoginSession(tx, { userId: u.id, verifiedHash: pw, ip: null })
      );
      return;
    }

    if (mode === "wait_block_error") {
      await observer.$disconnect();
      const outcome = await runOverlap(
        left,
        right,
        observer,
        (tx, { afterLock }) => createLoginSession(tx, { userId: u.id, verifiedHash: pw, ip: null }, { afterUserLock: afterLock }),
        (tx) => createLoginSession(tx, { userId: u.id, verifiedHash: pw, ip: null })
      );
      if (outcome.observedBlocking) throw new Error("unexpected blocking observed");
      throw new Error("wait_block_error: 观察失败但未观察到阻塞");
    }

    throw new Error(`unknown FAULT_MODE: ${mode}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("CHILD_FAIL:", e);
    process.exit(1);
  });
