const API = 'https://api.apify.com/v2';
const COOLDOWN = new Map();
let cursor = 0;
function tokens(){
  const env = Object.entries(process.env)
    .filter(([k,v]) => /^APIFY_TOKEN_\d+$/.test(k) && String(v||'').trim())
    .sort((a,b)=>Number(a[0].match(/\d+/)[0])-Number(b[0].match(/\d+/)[0]))
    .map(([,v])=>String(v).trim());
  if (process.env.APIFY_API_TOKEN) env.push(String(process.env.APIFY_API_TOKEN).trim());
  return [...new Set(env.filter(Boolean))];
}
function actorPath(id){ return encodeURIComponent(String(id).replace('/', '~')); }
function isBillingExhausted(status, text=''){
  return status===402 || /not-enough-usage-to-run-paid-actor|not enough usage|insufficient (?:usage|balance|funds|credits)|payment required|remaining usage.{0,100}isn.t enough/i.test(String(text||''));
}
function retryable(status, text=''){
  if (isBillingExhausted(status, text)) return false;
  return status===401 || status===403 || status===408 || status===409 || status===429 || status>=500 || /quota|limit|credit|rate/i.test(text);
}
export function apifyTokenCount(){ return tokens().length; }
export async function runActor(actorId,input,{timeoutSecs=120}={}){
  const list=tokens();
  if(!list.length) throw new Error('No Apify tokens configured. Add APIFY_TOKEN_1 ... APIFY_TOKEN_10 to .env.');
  let last='';
  for(let attempt=0; attempt<list.length; attempt++){
    const idx=(cursor+attempt)%list.length, token=list[idx];
    if((COOLDOWN.get(idx)||0)>Date.now()) continue;
    const url=`${API}/acts/${actorPath(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&clean=true&format=json&timeout=${timeoutSecs}`;
    try{
      const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(input||{}),signal:AbortSignal.timeout((timeoutSecs+20)*1000)});
      const raw=await res.text();
      if(!res.ok){
        last=`Apify HTTP ${res.status}: ${raw.slice(0,240)}`;
        if(isBillingExhausted(res.status, raw)){
          const error = new Error('APIFY_BILLING_EXHAUSTED: Apify refused this paid actor run because the account has insufficient remaining usage. Token rotation will not fix an account-level billing limit; use the direct scraper or add Apify usage/credit.');
          error.code = 'APIFY_BILLING_EXHAUSTED';
          error.details = last;
          throw error;
        }
        if(retryable(res.status,raw)){ COOLDOWN.set(idx,Date.now()+(res.status===401||res.status===403?30*60_000:5*60_000)); continue; }
        throw new Error(last);
      }
      let data; try{ data=JSON.parse(raw); }catch{ throw new Error(`Apify returned non-JSON (${res.status}).`); }
      cursor=(idx+1)%list.length;
      return {items:Array.isArray(data)?data:(Array.isArray(data?.items)?data.items:[]),tokenSlot:idx+1};
    }catch(e){
      last=e?.message||String(e);
      if(e?.code==='APIFY_BILLING_EXHAUSTED' || /APIFY_BILLING_EXHAUSTED/.test(last)) throw e;
      if(/No Apify tokens/.test(last)) throw e;
      COOLDOWN.set(idx,Date.now()+60_000);
    }
  }
  throw new Error(`All configured Apify tokens failed or are cooling down. Last error: ${last||'unknown'}`);
}
