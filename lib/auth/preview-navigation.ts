import { verifiedPreviewContext } from "@/lib/auth/preview-context";
import "server-only";
import { headers } from "next/headers";
import {  PREVIEW_HEADER,allowedPreviewPath } from "./preview-path";
export async function previewHref(href:string){const preview=verifiedPreviewContext((await headers()).get(PREVIEW_HEADER));return preview&&allowedPreviewPath(href.split(/[?#]/)[0])?preview.prefix+href:href;}
