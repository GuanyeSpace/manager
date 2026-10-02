export const previewRoles = { controller: { role: "CONTROLLER", label: "直播中控", path: "/controller" }, leads: { role: "LEAD_SPECIALIST", label: "导粉专员", path: "/leads" }, anchor: { role: "ANCHOR", label: "主播", path: "/anchor" } } as const;
export type PreviewRole = keyof typeof previewRoles;
export function previewRoute(path:string) {
 const match=/^\/boss\/preview\/(controller|leads|anchor)\/([a-zA-Z0-9_-]+)\/view(\/.*)$/.exec(path);
 if(!match)return null;
 return {role:match[1] as PreviewRole,userId:match[2],path:match[3],prefix:`/boss/preview/${match[1]}/${match[2]}/view`};
}
export function allowedPreviewPath(path:string) { return /^\/(controller|leads|anchor|workbench|resources|accounts|live-reports|change-password)(\/|$)/.test(path) && !path.includes("\\") && !path.includes(".."); }
export const PREVIEW_HEADER="x-manager-workspace-preview";
