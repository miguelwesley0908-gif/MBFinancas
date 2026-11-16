import { readFileSync } from 'node:fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(Boolean).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}))
const base=env.VITE_SUPABASE_URL;const key=env.VITE_SUPABASE_PUBLISHABLE_KEY
const headers={apikey:key,'Content-Type':'application/json'}
const settings=await fetch(base+'/auth/v1/settings',{headers})
if(!settings.ok)throw Error('Auth settings unavailable: '+settings.status)
const s=await settings.json()
console.log(JSON.stringify({authAvailable:true,emailEnabled:s.external?.email,emailAutoconfirm:s.mailer_autoconfirm}))
for(const [name,path,options] of [
 ['anonymous table access','/rest/v1/households?select=id',{headers}],
 ['anonymous privileged RPC','/rest/v1/rpc/bootstrap_household',{method:'POST',headers,body:JSON.stringify({p_initial:{schema:1,entries:[]}})}],
 ['unauthenticated invitation','/functions/v1/invite-member',{method:'POST',headers,body:'{}'}]
]){
 const r=await fetch(base+path,options)
 if(![401,403].includes(r.status))throw Error(name+' unexpectedly returned '+r.status)
 console.log(name+': correctly blocked ('+r.status+')')
}