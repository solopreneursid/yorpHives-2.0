/**
 * Isolated YorpHives preview email sender.
 * Deployed without workers.dev or routes. Only Pages service bindings can invoke it.
 * Restrict EMAIL destination_address to the verified founder inbox.
 * No Cloudflare API token, no user-controlled recipients, no public URL.
 */
const FROM="security@approvals.yorphives.com";
const CODE_RE=/\b[0-9]{6}\b/;
export default {
  async fetch(request,env){
    if(request.method!=="POST" || new URL(request.url).pathname!=="/internal/founder-email")
      return new Response(null,{status:404});
    if(request.headers.get("content-type")!=="application/json")
      return Response.json({accepted:false},{status:415});
    if(Number(request.headers.get("content-length")||0)>1800)
      return Response.json({accepted:false},{status:413});
    let text;
    try{
      const raw=await request.text();
      if(new TextEncoder().encode(raw).length>1800)throw Error("length");
      const data=JSON.parse(raw);
      if(!data||typeof data!=="object"||Array.isArray(data) ||
        data.from!==FROM || data.to!==env.FOUNDER_DESTINATION ||
        data.subject!=="YorpHives Founder Control · one-time approval code" ||
        typeof data.text!=="string"||data.text.length>720||
        !data.text.startsWith("Your YorpHives approval code is ")||
        !CODE_RE.test(data.text))throw Error("invalid");
      text=data.text;
    }catch{return Response.json({accepted:false},{status:400});}
    if(!env.EMAIL||typeof env.EMAIL.send!=="function")
      return Response.json({accepted:false},{status:503});
    try{
      const result=await env.EMAIL.send({
        from:FROM,to:env.FOUNDER_DESTINATION,
        subject:"YorpHives Founder Control · one-time approval code",text
      });
      if(!result||result.success===false)throw Error("not-accepted");
      return Response.json({accepted:true},{headers:{"cache-control":"no-store"}});
    }catch{
      return Response.json({accepted:false},{status:503});
    }
  }
};
