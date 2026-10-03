import { signPreviewContext, verifiedPreviewContext } from "@/lib/auth/preview-context";
import { allowedPreviewPath, PREVIEW_HEADER, previewRoute } from "@/lib/auth/preview-path";
// 路由粗拦截层（第一道防线）。
// 只做一件事：没有「签名有效的会话 cookie」的请求，跳去登录页。
// 它不查数据库、不做权限判断——真正的身份与岗位校验在页面、server action
// 和查询函数里各自完成（见 lib/auth/session.ts 与 lib/auth/permissions.ts）。
// 这样设计的原因：cookie 可以被伪造，只有数据库里的会话记录才代表真实登录状态。
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session-token";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const inherited = verifiedPreviewContext(request.headers.get(PREVIEW_HEADER));
  if(inherited && inherited.path === pathname){
    if(!["GET","HEAD"].includes(request.method))return new NextResponse("只读预览不能执行修改操作",{status:403});
    return NextResponse.next();
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(PREVIEW_HEADER); // 绝不信任浏览器自行提交的预览身份。
  const preview=previewRoute(pathname);
  let referrerPreview:ReturnType<typeof previewRoute>=null;
  try {const ref=new URL(request.headers.get("referer")??"");if(ref.origin===request.nextUrl.origin)referrerPreview=previewRoute(ref.pathname);}catch{}
  if((preview||referrerPreview)&&!["GET","HEAD"].includes(request.method))return new NextResponse("只读预览不能执行修改操作",{status:403});
  if(preview){
    if(!allowedPreviewPath(preview.path))return new NextResponse("预览路径不可用",{status:404});
    requestHeaders.set(PREVIEW_HEADER,signPreviewContext(pathname));
    // 必须使用原始URL；nextUrl会把127.0.0.1规范化为localhost，导致反代下误走外部HTTPS代理。
    const url=new URL(request.url);url.pathname=preview.path;
    return NextResponse.rewrite(url,{request:{headers:requestHeaders}});
  }
  // 普通链接、预取和截图请求也保持预览上下文；退出老板页不在可预览路径内。
  if(referrerPreview&&allowedPreviewPath(pathname)){
    const url=request.nextUrl.clone();url.pathname=referrerPreview.prefix+pathname;
    return NextResponse.redirect(url);
  }

  // 登录页总是放行；已登录用户由登录页自己判断并送回工作台
  if (pathname.startsWith("/login")) {
    return NextResponse.next({request:{headers:requestHeaders}});
  }

  const token = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!token) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE_NAME); // 顺手清掉无效 cookie
    return response;
  }

  return NextResponse.next({request:{headers:requestHeaders}});
}

export const config = {
  // 除静态资源外的所有页面路由都经过本层
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
