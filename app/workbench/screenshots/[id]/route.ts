import { getCurrentSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { readScreenshot, screenshotBytes } from "@/modules/workbench/screenshots";
import { UserActionError } from "@/modules/users/boss-guard";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = await getCurrentSessionToken();
  if (!token) return new Response("请先登录", { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const { id } = await params;
    const file = await prisma.$transaction(tx => readScreenshot(tx, token, id));
    if (!file) return new Response("截图不存在或无权查看", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(await screenshotBytes(file.id)), { headers: { "Content-Type": file.contentType, "Content-Length": String(file.size), "Content-Disposition": 'inline; filename="screenshot"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) {
    if (error instanceof UserActionError) return new Response("无权查看截图", { status: 404, headers: { "Cache-Control": "no-store" } });
    if ((error as { code?: string }).code === "ENOENT") return new Response("截图文件暂不可用，请联系负责人", { status: 404, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
}
