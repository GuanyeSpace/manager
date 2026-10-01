import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PrismaClient, Prisma } from "@/app/generated/prisma/client";
import { UserActionError } from "@/modules/users/boss-guard";
import { readWorkSession, runWorkCommand } from "./service";
import { requireAccountActor, historicalAccountScope } from "@/modules/accounts/service";

export type Screenshot = { id: string; contentType: string; size: number };
export const screenshotDirectory = () => process.env.WORK_SCREENSHOT_DIR || path.join(process.cwd(), ".data", "work-screenshots");
export function screenshotType(bytes: Buffer): string | null {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString("ascii", 12, 16) === "IHDR") return "image/png";
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return "image/jpeg";
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// 先鉴权再写私有文件；文件全部落盘后才提交业务事务。失败不留下可访问的附件。
export async function submitWorkCommand(db: PrismaClient, token: string, form: FormData, ip: string) {
  const files = form.getAll("screenshots").filter(v => typeof v !== "string" && v.size > 0) as File[];
  if (files.length > 6 || files.some(f => f.size > 5 * 1024 * 1024) || files.reduce((n, f) => n + f.size, 0) > 20 * 1024 * 1024) throw new UserActionError("每次最多 6 张截图，单张不超过 5MB，合计不超过 20MB");
  const uploads: Screenshot[] = [];
  if (files.length) {
    const command = form.get("command");
    const correction = command === "correct" && ["violation", "wrap", "evidence", "unstarted"].includes(String(form.get("kind")));
    if (!(correction || command === "complete" && form.get("incident") === "yes" || command === "unstarted" || command === "end" && form.get("endKind") === "interrupted" || command === "violation" && form.get("violation") === "yes")) throw new UserActionError("此操作不需要上传截图");
    const session = await db.$transaction(tx => readWorkSession(tx, token, String(form.get("id"))));
    if (!session?.editable || (correction ? !["COMPLETE", "CANCELLED"].includes(session.session.phase) : ["COMPLETE", "CANCELLED"].includes(session.session.phase))) throw new UserActionError("场次不存在或无执行权限");
  }
  try {
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer()), contentType = screenshotType(bytes);
      if (!contentType) throw new UserActionError("截图只支持 PNG、JPG、WebP 图片，请勿上传其他文件");
      await mkdir(screenshotDirectory(), { recursive: true, mode: 0o700 });
      const upload = { id: randomUUID(), contentType, size: bytes.length };
      uploads.push(upload);
      await writeFile(path.join(screenshotDirectory(), upload.id), bytes, { flag: "wx", mode: 0o600 });
    }
    return await db.$transaction(tx => runWorkCommand(tx, token, Object.fromEntries(form), ip, uploads));
  } catch (error) {
    // 若提交结果不确定，保留可能已被数据库引用的文件，避免误删有效截图。
    for (const upload of uploads) {
      try { if (!await db.workScreenshot.findUnique({ where: { id: upload.id } })) await unlink(path.join(screenshotDirectory(), upload.id)).catch(() => {}); } catch { /* 数据库不可用时留待核对。 */ }
    }
    const code = (error as NodeJS.ErrnoException)?.code;
    if (["EACCES", "EPERM", "ENOSPC", "EROFS"].includes(code ?? "")) { console.error("截图存储失败", { code }); throw new UserActionError("截图暂时无法保存，请联系管理员；已填写内容请保留后重试"); }
    throw error;
  }
}

export async function readScreenshot(tx: Prisma.TransactionClient, token: string, id: string) {
  const actor = await requireAccountActor(tx, token);
  return tx.workScreenshot.findFirst({ where: { id, session: { sourceRecord: historicalAccountScope(actor) } }, select: { id: true, contentType: true, size: true } });
}
export async function screenshotBytes(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new UserActionError("截图不存在");
  return readFile(path.join(screenshotDirectory(), id));
}
