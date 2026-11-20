import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const productionAppUrl = 'https://mbfinancas.raazevedoreservas.workers.dev'
const localAppOrigin = 'http://localhost:5173'

function getConfiguredAppUrl() {
  const configured = Deno.env.get('APP_URL')?.trim()
  try {
    return new URL(configured || productionAppUrl)
  } catch {
    return new URL(productionAppUrl)
  }
}

function getRequestAppOrigin(req: Request) {
  const appUrl = getConfiguredAppUrl()
  const requestOrigin = req.headers.get('Origin') ?? ''
  return requestOrigin === appUrl.origin || requestOrigin === localAppOrigin
    ? requestOrigin
    : appUrl.origin
}

function getHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getRequestAppOrigin(req),
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  }
}

function isExistingUserError(error: { code?: string; message?: string }) {
  return (
    error.code === 'email_exists' ||
    /already (?:been )?(?:registered|exists)/i.test(error.message ?? '')
  )
}

Deno.serve(async (req) => {
  const headers = getHeaders(req)
  const reply = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers })

  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply({ error: 'Método inválido' }, 405)

  let cleanupPendingInvitation: (() => Promise<void>) | undefined

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
    const serviceKey = secretKeys
      ? JSON.parse(secretKeys)['default']
      : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceKey) {
      return reply(
        { error: 'A função de convites não está configurada corretamente.' },
        503,
      )
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(bearer)

    if (authError || !user) {
      return reply({ error: 'Autenticação necessária' }, 401)
    }

    const { email, householdId } = await req.json()
    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) ||
      typeof householdId !== 'string'
    ) {
      return reply({ error: 'Dados inválidos' }, 400)
    }

    const normalizedEmail = email.toLowerCase()
    const { data: house, error: houseError } = await admin
      .from('households')
      .select('owner_id')
      .eq('id', householdId)
      .single()

    if (houseError || house?.owner_id !== user.id) {
      return reply({ error: 'Somente o criador da casa pode convidar' }, 403)
    }
    if (normalizedEmail === user.email?.toLowerCase()) {
      return reply({ error: 'Use o e-mail do segundo membro' }, 400)
    }

    const { count, error: membersError } = await admin
      .from('household_members')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', householdId)

    if (membersError) throw membersError
    if ((count ?? 0) >= 2) {
      return reply({ error: 'A casa já tem dois membros' }, 409)
    }

    const { count: recent, error: rateError } = await admin
      .from('household_invitations')
      .select('*', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .gt('created_at', new Date(Date.now() - 3600000).toISOString())

    if (rateError) throw rateError
    if ((recent ?? 0) >= 3) {
      return reply({ error: 'Aguarde uma hora antes de enviar mais convites' }, 429)
    }

    const token = crypto.randomUUID() + crypto.randomUUID()
    const bytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(token),
    )
    const token_hash = Array.from(new Uint8Array(bytes), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('')

    const { error: insertError } = await admin
      .from('household_invitations')
      .insert({ token_hash, household_id: householdId, email: normalizedEmail })

    if (insertError) throw insertError

    cleanupPendingInvitation = async () => {
      await admin
        .from('household_invitations')
        .delete()
        .eq('token_hash', token_hash)
    }

    const link = new URL(getRequestAppOrigin(req))
    link.searchParams.set('invite', token)
    const redirectTo = link.toString()

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { redirectTo },
    )

    if (inviteError && isExistingUserError(inviteError)) {
      const { error: signInError } = await admin.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      })

      if (signInError) {
        await cleanupPendingInvitation()
        cleanupPendingInvitation = undefined
        return reply(
          {
            error:
              'O SMTP do Supabase não aceitou o envio do convite. Confira as configurações de e-mail e tente novamente.',
          },
          502,
        )
      }
    } else if (inviteError) {
      await cleanupPendingInvitation()
      cleanupPendingInvitation = undefined
      return reply(
        {
          error:
            'O SMTP do Supabase não aceitou o envio do convite. Confira as configurações de e-mail e tente novamente.',
        },
        502,
      )
    }

    cleanupPendingInvitation = undefined
    return reply({ sent: true })
  } catch {
    if (cleanupPendingInvitation) {
      try {
        await cleanupPendingInvitation()
      } catch {
        // Keep the original failure as the user-facing result.
      }
    }
    return reply(
      { error: 'Não foi possível preparar o convite. Tente novamente.' },
      500,
    )
  }
})
