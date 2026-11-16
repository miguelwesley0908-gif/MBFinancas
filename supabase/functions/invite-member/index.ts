import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
const origin = Deno.env.get('APP_URL') ?? ''
const headers = { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  const reply = (body: object, status=200) => new Response(JSON.stringify(body), { status, headers })
  if (req.method !== 'POST') return reply({error:'Método inválido'},405)
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SUPABASE_SECRET_KEYS') ? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')!)['default'] : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), {auth:{persistSession:false,autoRefreshToken:false}})
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer /,'')??''
    const {data:{user},error:authError} = await admin.auth.getUser(bearer)
    if(authError || !user) return reply({error:'Autenticação necessária'},401)
    if (!origin || !Deno.env.get('RESEND_API_KEY') || !Deno.env.get('EMAIL_FROM')) return reply({error:'O envio de convites ainda não está configurado. Configure APP_URL, RESEND_API_KEY e EMAIL_FROM na função.'},503)
    const {email, householdId} = await req.json()
    if(typeof email!=='string'||email.length>254||!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)||typeof householdId!=='string') return reply({error:'Dados inválidos'},400)
    const {data:house,error:houseError}=await admin.from('households').select('owner_id').eq('id',householdId).single()
    if(houseError||house?.owner_id!==user.id)return reply({error:'Somente o criador da casa pode convidar'},403)
    if(email.toLowerCase()===user.email?.toLowerCase())return reply({error:'Use o e-mail do segundo membro'},400)
    const {count,error:membersError}=await admin.from('household_members').select('*',{count:'exact',head:true}).eq('household_id',householdId)
    if(membersError)throw membersError
    if((count??0)>=2)return reply({error:'A casa já tem dois membros'},409)
    const {count:recent,error:rateError}=await admin.from('household_invitations').select('*',{count:'exact',head:true}).eq('household_id',householdId).gt('created_at',new Date(Date.now()-3600000).toISOString())
    if(rateError)throw rateError
    if((recent??0)>=3)return reply({error:'Aguarde uma hora antes de enviar mais convites'},429)
    const token=crypto.randomUUID()+crypto.randomUUID()
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))
    const token_hash=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')
    const {error}=await admin.from('household_invitations').insert({token_hash,household_id:householdId,email:email.toLowerCase()})
    if(error)throw error
    const link=new URL(origin);link.searchParams.set('invite',token)
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+Deno.env.get('RESEND_API_KEY'),'Content-Type':'application/json'},body:JSON.stringify({from:Deno.env.get('EMAIL_FROM'),to:[email],subject:'Convite para a casa no MB Finanças',text:'Você recebeu um convite para compartilhar as finanças da casa. Entre ou crie sua conta com este e-mail: '+link.toString()+'\\nO convite é válido por 7 dias.'})})
    if(!response.ok){await admin.from('household_invitations').delete().eq('token_hash',token_hash);return reply({error:'O serviço de e-mail não aceitou o envio. Verifique a configuração.'},502)}
    return reply({sent:true})
  }catch {return reply({error:'Não foi possível enviar o convite. Confira a configuração do serviço.'},500)}
})
