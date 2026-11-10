export interface FreeToolDescriptor { slug: string; title: string; category: string; description: string; url: string; processing: "browser"; }
export interface FreeToolsResponse { data: FreeToolDescriptor[]; count: number; processing: "browser"; authentication: "none"; }
interface Env { ASSETS?: { fetch(request: Request): Promise<Response> } }
interface Context { request: Request; env: Env }
export async function onRequestGet({request,env}:Context):Promise<Response>{
 if(!env.ASSETS)return new Response("Static asset binding unavailable.",{status:503});
 const assetUrl=new URL("/free-tools/manifest.json",request.url);
 const asset=await env.ASSETS.fetch(new Request(assetUrl,{headers:{accept:"application/json"}}));
 if(!asset.ok)return new Response("Tool manifest unavailable.",{status:503});
 const data=await asset.json() as FreeToolDescriptor[];
 const response:FreeToolsResponse={data,count:data.length,processing:"browser",authentication:"none"};
 const wantsMarkdown=request.headers.get("accept")?.includes("text/markdown")||new URL(request.url).searchParams.get("format")==="markdown";
 if(wantsMarkdown){const lines=["# YorpHives Free Tools","","> Browser-based utilities. No sign-up. Inputs stay on the user's device.","",...data.map(tool=>`## ${tool.title}\n\n- Category: ${tool.category}\n- URL: ${tool.url}\n- Description: ${tool.description}\n- Processing: ${tool.processing}\n- Authentication: none\n`)];return new Response(lines.join("\n"),{headers:{"content-type":"text/markdown; charset=utf-8","cache-control":"public, max-age=300"}});}
 return Response.json(response,{headers:{"cache-control":"public, max-age=300","x-content-type-options":"nosniff"}});
}