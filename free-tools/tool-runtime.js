const root=document.querySelector("#tool-app");
if(root){
const id=root.dataset.tool;
const definitions={
"word-counter":[["text","Your text","textarea"]],
"character-counter":[["text","Your text","textarea"]],
"case-converter":[["text","Your text","textarea"]],
"duplicate-line-remover":[["text","Enter lines","textarea"]],
"text-diff-checker":[["before","Original text","textarea"],["after","Changed text","textarea"]],
"lorem-ipsum-generator":[["count","Paragraphs","number",3]],
"json-formatter":[["text","JSON input","textarea"]],
"json-validator":[["text","JSON input","textarea"]],
"json-minifier":[["text","JSON input","textarea"]],
"base64-encoder-decoder":[["text","Text or Base64","textarea"]],
"url-encoder-decoder":[["text","Text or URL-encoded value","textarea"]],
"uuid-generator":[["count","How many UUIDs?","number",5]],
"password-generator":[["length","Password length","number",20],["symbols","Include symbols","checkbox",true]],
"sha256-generator":[["text","Text to hash","textarea"]],
"jwt-decoder":[["token","JWT token","textarea"]],
"timestamp-converter":[["value","Unix timestamp or date","text"]],
"regex-tester":[["pattern","Regular expression","text"],["sample","Test text","textarea"],["flags","Flags","text","g"]],
"html-entity-encoder":[["text","Text or HTML entities","textarea"]],
"age-calculator":[["dob","Date of birth","date"]],
"date-difference-calculator":[["start","Start date","date"],["end","End date","date"]],
"percentage-calculator":[["a","Value","number",100],["b","Percentage / second value","number",20]],
"discount-calculator":[["price","Original price","number",1000],["discount","Discount (%)","number",10]],
"tip-calculator":[["bill","Bill amount","number",1000],["tip","Tip (%)","number",10],["people","People","number",2]],
"emi-calculator":[["principal","Loan amount (₹)","number",100000],["rate","Annual interest rate (%)","number",10],["years","Tenure (years)","number",5]],
"gst-calculator":[["amount","Amount (₹)","number",1000],["rate","GST rate (%)","number",18],["mode","GST operation: add or remove","select","add"]],
"bmi-calculator":[["weight","Weight (kg)","number",70],["height","Height (cm)","number",170]],
"unit-converter":[["value","Value","number",1],["from","From unit (m, km, cm, kg, g, lb, l, ml)","text","km"],["to","To unit","text","m"]],
"temperature-converter":[["value","Temperature","number",25],["from","From (C, F, K)","select","C"],["to","To","select","F"]],
"random-number-generator":[["min","Minimum","number",1],["max","Maximum","number",100],["count","How many?","number",1]],
"pomodoro-timer":[["minutes","Focus duration (minutes)","number",25]],
"color-converter":[["hex","HEX color","text","#c5f36b"]]
};
const fields=definitions[id]||[];
const make=(tag,attrs={},textValue)=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==="class")el.className=v;else if(k==="type"||k==="id"||k==="name"||k==="placeholder"||k==="min"||k==="max"||k==="step")el.setAttribute(k,v);}if(textValue!==undefined)el.textContent=textValue;return el;};
const form=make("div",{class:"tool-form"});const values={};
for(const [key,label,type,defaultValue] of fields){
 const wrap=make("label",{class:"tool-field"});wrap.append(make("span",{},label));
 let input;
 if(type==="textarea"){input=make("textarea",{class:"tool-textarea",name:key,placeholder:label});}
 else if(type==="select"){input=make("select",{class:"tool-input",name:key});for(const val of (key==="mode"?["add","remove"]:["C","F","K"])){const op=make("option",{},val);op.value=val;input.append(op);}}
 else {input=make("input",{class:"tool-input",type:type==="checkbox"?"checkbox":type,name:key,placeholder:label});if(type==="number"){input.min="0";input.step="any";}if(defaultValue!==undefined){if(type==="checkbox")input.checked=defaultValue;else input.value=defaultValue;}}
 values[key]=input;wrap.append(input);form.append(wrap);
}
const actions=make("div",{class:"page-actions"});const run=make("button",{class:"button button-primary",type:"button"},"Run tool ↗");const copy=make("button",{class:"button button-secondary",type:"button"},"Copy result");actions.append(run,copy);const output=make("pre",{class:"tool-output",id:"tool-result"},"Your result will appear here.");const status=make("p",{class:"tool-status"},"Runs locally in your browser. No sign-up required.");form.append(actions,status,output);root.replaceChildren(form);
const v=k=>values[k]?.type==="checkbox"?values[k].checked:values[k]?.value??"";
const num=k=>{const n=Number(v(k));if(!Number.isFinite(n))throw Error("Enter valid numbers in all numeric fields.");return n;};
const fmt=n=>Number(n.toFixed(6)).toLocaleString();
const calc=async()=>{
 switch(id){
 case"word-counter":case"character-counter":{const t=v("text"),words=t.trim()?t.trim().split(/\s+/u).length:0;return `Words: ${words}\nCharacters: ${t.length}\nCharacters (no spaces): ${t.replace(/\s/g,"").length}\nSentences: ${(t.match(/[.!?]+(?=\s|$)/gu)||[]).length}\nParagraphs: ${t.trim()?t.trim().split(/\n\s*\n/u).length:0}\nEstimated reading time: ${words?Math.max(1,Math.ceil(words/200)):0} min`;}
 case"case-converter":{const t=v("text");return `UPPERCASE\n${t.toUpperCase()}\n\nlowercase\n${t.toLowerCase()}\n\nTitle Case\n${t.toLowerCase().replace(/\b\p{L}/gu,c=>c.toUpperCase())}\n\nSentence case\n${t.toLowerCase().replace(/(^|[.!?]\s+)\p{L}/gu,c=>c.toUpperCase())}`;}
 case"duplicate-line-remover":{const lines=v("text").split(/\r?\n/),out=[...new Set(lines)];return `Removed ${lines.length-out.length} duplicate lines.\n\n${out.join("\n")}`;}
 case"text-diff-checker":{const a=v("before").split(/\r?\n/),b=v("after").split(/\r?\n/),set=new Set(b);return a.filter(x=>!set.has(x)).map(x=>"- "+x).concat(b.filter(x=>!a.includes(x)).map(x=>"+ "+x)).join("\n")||"No line-level changes detected.";}
 case"lorem-ipsum-generator":{const n=Math.max(1,Math.min(30,Math.floor(num("count")))),s="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer vitae justo sed neque tempor consequat. Donec at risus sed erat facilisis tincidunt. Sed posuere, massa non gravida luctus, sapien arcu consequat lectus, vitae tincidunt nibh nulla a lorem.";return Array.from({length:n},()=>s).join("\n\n");}
 case"json-formatter":case"json-validator":case"json-minifier":{const data=JSON.parse(v("text"));return id==="json-minifier"?JSON.stringify(data):JSON.stringify(data,null,2);}
 case"base64-encoder-decoder":{const t=v("text");try{return "Decoded:\n"+decodeURIComponent(escape(atob(t.trim())));}catch{return "Encoded:\n"+btoa(unescape(encodeURIComponent(t)));}}
 case"url-encoder-decoder":{const t=v("text");try{return "Decoded:\n"+decodeURIComponent(t);}catch{return "Encoded:\n"+encodeURIComponent(t);}}
 case"uuid-generator":{const n=Math.max(1,Math.min(100,Math.floor(num("count"))));return Array.from({length:n},()=>crypto.randomUUID()).join("\n");}
 case"password-generator":{const n=Math.max(8,Math.min(128,Math.floor(num("length")))),chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"+(v("symbols")?"!@#$%^&*()-_=+[]{}?":"");const bytes=crypto.getRandomValues(new Uint8Array(n));return Array.from(bytes,b=>chars[b%chars.length]).join("");}
 case"sha256-generator":{const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v("text")));return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");}
 case"jwt-decoder":{const parts=v("token").trim().split(".");if(parts.length!==3)throw Error("A JWT must contain three dot-separated parts.");const dec=s=>JSON.stringify(JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g,"+").replace(/_/g,"/"))))),null,2);return "HEADER\n"+dec(parts[0])+"\n\nPAYLOAD\n"+dec(parts[1])+"\n\nSignature is not verified.";}
 case"timestamp-converter":{const x=v("value").trim(),d=/^-?\d+$/.test(x)?new Date(Number(x)*(x.length<=10?1000:1)):new Date(x);if(Number.isNaN(d.getTime()))throw Error("Enter a valid Unix timestamp or date.");return `UTC: ${d.toISOString()}\nLocal: ${d.toString()}\nUnix seconds: ${Math.floor(d.getTime()/1000)}\nUnix milliseconds: ${d.getTime()}`;}
 case"regex-tester":{const re=new RegExp(v("pattern"),v("flags"));return [...v("sample").matchAll(re)].map(m=>`Match: ${m[0]} · index ${m.index}`).join("\n")||"No matches found.";}
 case"html-entity-encoder":{const t=v("text");if(t.includes("&")||t.includes("&lt;")||t.includes("&gt;")){const el=document.createElement("textarea");el.innerHTML=t;return el.value;}return t.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
 case"age-calculator":{const d=new Date(v("dob")+"T00:00:00"),now=new Date();if(!v("dob")||d>now)throw Error("Enter a valid date of birth in the past.");let y=now.getFullYear()-d.getFullYear(),m=now.getMonth()-d.getMonth(),day=now.getDate()-d.getDate();if(day<0){m--;day+=new Date(now.getFullYear(),now.getMonth(),0).getDate();}if(m<0){y--;m+=12;}return `Age: ${y} years, ${m} months and ${day} days`;}
 case"date-difference-calculator":{const a=new Date(v("start")+"T00:00:00"),b=new Date(v("end")+"T00:00:00");if(Number.isNaN(+a)||Number.isNaN(+b))throw Error("Choose both dates.");const days=Math.round(Math.abs(b-a)/86400000);return `Difference: ${days.toLocaleString()} days\nWeeks: ${fmt(days/7)}\nDirection: ${a<=b?"Start is before end":"Start is after end"}`;}
 case"percentage-calculator":return `${fmt(num("a")*num("b")/100)} is ${fmt(num("b"))}% of ${fmt(num("a"))}.\n${fmt(num("b"))} is ${fmt(num("a")?num("b")/num("a")*100:0)}% of ${fmt(num("a"))}.`;
 case"discount-calculator":{const p=num("price"),d=num("discount");return `You save: ${fmt(p*d/100)}\nFinal price: ${fmt(p*(1-d/100))}`;}
 case"tip-calculator":{const b=num("bill"),t=num("tip"),p=Math.max(1,Math.floor(num("people")));return `Tip: ${fmt(b*t/100)}\nTotal: ${fmt(b*(1+t/100))}\nPer person: ${fmt(b*(1+t/100)/p)}`;}
 case"emi-calculator":{const p=num("principal"),r=num("rate")/1200,n=num("years")*12;if(p<0||n<=0)throw Error("Loan amount must be positive and tenure greater than zero.");const emi=r===0?p/n:p*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);return `Monthly EMI: ₹${fmt(emi)}\nTotal payment: ₹${fmt(emi*n)}\nTotal interest: ₹${fmt(emi*n-p)}`;}
 case"gst-calculator":{const a=num("amount"),r=num("rate")/100;if(v("mode")==="remove"){const base=a/(1+r);return `Taxable value: ₹${fmt(base)}\nGST component: ₹${fmt(a-base)}\nTotal: ₹${fmt(a)}`;}return `Taxable value: ₹${fmt(a)}\nGST: ₹${fmt(a*r)}\nTotal: ₹${fmt(a*(1+r))}`;}
 case"bmi-calculator":{const h=num("height")/100,w=num("weight");if(h<=0||w<=0)throw Error("Height and weight must be positive.");const bmi=w/(h*h);return `BMI: ${fmt(bmi)}\nAdult reference category: ${bmi<18.5?"Below 18.5":bmi<25?"18.5–24.9":bmi<30?"25–29.9":"30 or above"}\nThis screening calculation is not a diagnosis.`;}
 case"unit-converter":{const factors={m:1,km:1000,cm:.01,mm:.001,kg:1,g:.001,lb:.45359237,l:1,ml:.001};const a=v("from").toLowerCase(),b=v("to").toLowerCase();if(!(a in factors)||!(b in factors))throw Error("Supported units: m, km, cm, mm, kg, g, lb, l, ml. Convert within the same unit family.");return `${fmt(num("value")*factors[a]/factors[b])} ${b}`;}
 case"temperature-converter":{const x=num("value"),from=v("from"),to=v("to");const c=from==="C"?x:from==="F"?(x-32)*5/9:x-273.15;const result=to==="C"?c:to==="F"?c*9/5+32:c+273.15;return `${fmt(result)} °${to}`;}
 case"random-number-generator":{const min=Math.ceil(num("min")),max=Math.floor(num("max")),n=Math.max(1,Math.min(100,Math.floor(num("count"))));if(max<min)throw Error("Maximum must be greater than or equal to minimum.");const range=max-min+1;if(range>2**32)throw Error("Range must be smaller than 2^32.");const a=new Uint32Array(n);crypto.getRandomValues(a);return [...a].map(x=>min+(x%range)).join("\n");}
 case"pomodoro-timer":{const mins=Math.max(1,Math.min(180,Math.floor(num("minutes"))));let left=mins*60;output.textContent=mins+":00";run.disabled=true;const timer=setInterval(()=>{left--;output.textContent=Math.floor(left/60)+":"+String(left%60).padStart(2,"0");if(left<=0){clearInterval(timer);status.textContent="Focus session complete. Take a short break.";run.disabled=false;}},1000);return "Focus session running. Keep this tab open.";}
 case"color-converter":{let hex=v("hex").replace("#","");if(!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(hex))throw Error("Enter a valid 3- or 6-digit HEX color.");if(hex.length===3)hex=[...hex].map(c=>c+c).join("");const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16),mx=Math.max(r,g,b)/255,mn=Math.min(r,g,b)/255,d=mx-mn;let h=0,s=0,l=(mx+mn)/2;if(d){s=d/(1-Math.abs(2*l-1));switch(mx){case r/255:h=((g-b)/255/d)%6;break;case g/255:h=(b-r)/255/d+2;break;default:h=(r-g)/255/d+4;}h*=60;if(h<0)h+=360;}return `HEX: #${hex.toUpperCase()}\nRGB: rgb(${r}, ${g}, ${b})\nHSL: hsl(${Math.round(h)}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`;}
 default:throw Error("This tool is not available yet.");
 }
};
run.addEventListener("click",async()=>{try{output.textContent=String(await calc());status.textContent="Completed locally in your browser.";status.dataset.state="success";}catch(e){output.textContent="";status.textContent=e.message;status.dataset.state="error";}});
copy.addEventListener("click",async()=>{if(output.textContent)try{await navigator.clipboard.writeText(output.textContent);status.textContent="Copied to clipboard.";}catch{status.textContent="Clipboard access is unavailable in this browser.";}});
}