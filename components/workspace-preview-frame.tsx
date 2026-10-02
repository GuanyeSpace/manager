"use client";
import { useEffect } from "react";
import { allowedPreviewPath } from "@/lib/auth/preview-path";
// 复用员工原页面。只有 GET 筛选可提交，业务表单只读；服务端另有预览写保护。
export function WorkspacePreviewFrame({prefix,name,label}:{prefix:string;name:string;label:string}){
 useEffect(()=>{
  function decorate(){
   for(const form of document.querySelectorAll<HTMLFormElement>("form")){
    if(form.method.toLowerCase()!=="get"||!form.hasAttribute("method")){
     for(const control of form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|HTMLButtonElement>("input,select,textarea,button"))if(!control.disabled){control.disabled=true;control.title="只读预览不能修改";}
    }
   }
   for(const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")){
    const url=new URL(link.href,location.href);if(url.origin===location.origin&&allowedPreviewPath(url.pathname))link.href=prefix+url.pathname+url.search+url.hash;
   }
   for(const img of document.querySelectorAll<HTMLImageElement>('img[src^="/workbench/"]'))img.src=prefix+img.getAttribute("src");
  }
  function click(event:MouseEvent){const link=(event.target as Element).closest<HTMLAnchorElement>("a[href]");if(!link)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;
   if(url.pathname.startsWith(prefix+"/")||link.dataset.previewExit!==undefined){event.preventDefault();event.stopImmediatePropagation();location.assign(url.href);}
  }
  function submit(event:SubmitEvent){const form=event.target as HTMLFormElement;event.preventDefault();event.stopImmediatePropagation();if(form.method.toLowerCase()!=="get"||!form.hasAttribute("method"))return;
   const url=new URL(form.action||location.href,location.href);if(url.origin!==location.origin)return;if(allowedPreviewPath(url.pathname))url.pathname=prefix+url.pathname;if(!url.pathname.startsWith(prefix+"/"))return;
   url.search=new URLSearchParams([...new FormData(form)].filter((e):e is [string,string]=>typeof e[1]==="string")).toString();location.assign(url.href);
  }
  decorate();const observer=new MutationObserver(decorate);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["disabled","href","src"]});document.addEventListener("click",click,true);document.addEventListener("submit",submit,true);
  return()=>{observer.disconnect();document.removeEventListener("click",click,true);document.removeEventListener("submit",submit,true);};
 },[prefix]);
 return <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-6 py-3 text-sm text-amber-950"><strong>正在只读预览：{name}／{label}</strong><span>所有修改、上传操作已禁用</span><a data-preview-exit href="/boss" className="font-semibold underline">退出预览</a></div>;
}
