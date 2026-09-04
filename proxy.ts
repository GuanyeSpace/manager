// 路由粗拦截层（第一道防线）。
// 只做一件事：没有「签名有效的会话 cookie」的请求，跳去登录页。
// 它不查数据库、不做权限判断——真正的身份与岗位校验在页面、server action
// 和查询函数里各自完成（见 lib/auth/session.ts 与 lib/auth/permissions.ts）。
// 这样设计的原因：cookie 可以被伪造，只有数据库里的会话记录才代表真实登录状态。
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session-token";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 登录页总是放行；已登录用户由登录页自己判断并送回工作台
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  const token = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!token) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE_NAME); // 顺手清掉无效 cookie
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // 除静态资源外的所有页面路由都经过本层
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
