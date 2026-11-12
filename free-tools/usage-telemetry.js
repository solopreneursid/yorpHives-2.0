// Anonymous aggregate usage only. Never transmit tool inputs, outputs,
// file details, host identifiers, sessions, timestamps, or generated text.
const ELIGIBLE=new Set(["word-counter","json-formatter","json-validator",
 "json-minifier","uuid-generator","sha256-generator","html-to-markdown","csv-to-markdown"]);
export function reportToolSuccess(slug){
 if(!ELIGIBLE.has(slug))return;
 if(navigator.webdriver===true||navigator.globalPrivacyControl===true||navigator.doNotTrack==="1")return;
 if(location.protocol!=="https:"&&!["localhost","127.0.0.1"].includes(location.hostname))return;
 const key="hq-usage-v1:"+slug;
 try{
  const value=Number(sessionStorage.getItem(key)||"0");
  if(!Number.isSafeInteger(value)||value>=3)return;
  sessionStorage.setItem(key,String(value+1));
 }catch{return;}
 fetch("/api/v1/tool-activity",{
  method:"POST",credentials:"omit",mode:"same-origin",cache:"no-store",keepalive:true,
  headers:{"content-type":"application/json"},
  body:JSON.stringify({slug,event:"completed"})
 }).catch(()=>{});
}
