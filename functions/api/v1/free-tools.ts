export interface FreeToolDescriptor { slug: string; title: string; category: string; description: string; url: string; processing: "browser" | "library" | "network" | "planned"; agent_execution: "not_available"; }
export interface FreeToolsResponse { data: FreeToolDescriptor[]; count: number; processing: "browser" | "library" | "network" | "planned"; authentication: "none"; agent_execution: "not_available"; }
interface Context { request: Request; next(input?: Request): Promise<Response> }
export async function onRequestGet({request,next}:Context):Promise<Response>{
 const assetUrl=new URL("/free-tools/manifest.json",request.url);
 const asset=await next(new Request(assetUrl,{headers:{accept:"application/json"}}));
 if(!asset.ok)return new Response("Tool manifest unavailable.",{status:503});
 const data=await asset.json() as FreeToolDescriptor[];
 const response:FreeToolsResponse={data,count:data.length,processing:"browser",authentication:"none",agent_execution:"not_available"};
 const wantsMarkdown=request.headers.get("accept")?.includes("text/markdown")||new URL(request.url).searchParams.get("format")==="markdown";
 if(wantsMarkdown){const lines=["# YorpHives Free Tools","","> Browser-based utilities. No sign-up. Inputs stay on the user's device.","",...data.map(tool=>`## ${tool.title}\n\n- Category: ${tool.category}\n- URL: ${tool.url}\n- Description: ${tool.description}\n- Processing: ${tool.processing}\n- Human execution: browser only\n- Agent execution: not available\n- Authentication: none\n`)];return new Response(lines.join("\n"),{headers:{"content-type":"text/markdown; charset=utf-8","cache-control":"public, max-age=300"}});}
 return Response.json(response,{headers:{"cache-control":"public, max-age=300","x-content-type-options":"nosniff"}});
}