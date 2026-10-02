import { signSessionToken,verifySessionToken } from "./session-token";
import { previewRoute } from "./preview-path";
// Next.js 在内部 rewrite 后再次经过 proxy。只保留服务器签名的上下文，拒绝伪造请求头。
export function signPreviewContext(path:string){return signSessionToken(path);}
export function verifiedPreviewContext(value:string|null){const path=verifySessionToken(value??undefined);return path?previewRoute(path):null;}
