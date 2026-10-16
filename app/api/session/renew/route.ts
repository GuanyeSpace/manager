import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session-token";
import { PREVIEW_HEADER, previewRoute } from "@/lib/auth/preview-path";
import { renewLoginSession, SessionRevokedError } from "@/modules/auth/auth-service";

export async function POST(request: NextRequest) {
  const respond = (status: number) => new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
  // Nginx覆盖Host/协议；不接受跨源请求或预览页面的写入。
  const host = request.headers.get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : request.nextUrl.protocol.slice(0, -1);
  if (request.headers.get("origin") !== `${protocol}://${host}` || request.headers.get("x-session-renew") !== "1" || request.headers.has(PREVIEW_HEADER)) return respond(403);
  try { if (previewRoute(new URL(request.headers.get("referer") ?? "").pathname)) return respond(403); } catch { /* Referer may be omitted. */ }
  const token = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!token) return respond(401);
  try {
    const expiresAt = await prisma.$transaction(tx => renewLoginSession(tx, token));
    if (expiresAt) await setSessionCookie(token, expiresAt);
    return respond(204);
  } catch (error) {
    if (error instanceof SessionRevokedError) return respond(401);
    console.error("会话续期失败");
    return respond(503);
  }
}
