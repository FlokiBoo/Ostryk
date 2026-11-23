import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { estVisibleClient } from '@/lib/visibiliteClient'

// Décale une séance de N séances plus tard dans la file des séances restantes (ni validées, ni
// déjà sautées) du même programme. Les séances déjà traitées entre-temps ne bougent pas.
export async function POST(request, { params }) {
  const { token } = await params
  const { sessionId, offset } = await request.json()
  if (!sessionId || ![1, 2, 3].includes(offset)) return NextResponse.json({ error: 'paramètres invalides' }, { status: 400 })

  const { data: athlete } = await supabaseAdmin.from('athletes').select('id, auth_user_id').eq('token', token).single()
  if (!athlete) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || athlete.auth_user_id !== user.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: target } = await supabaseAdmin.from('program_sessions').select('id, program_id').eq('id', sessionId).single()
  if (!target) return NextResponse.json({ error: 'séance introuvable' }, { status: 404 })

  const { data: program } = await supabaseAdmin.from('programs').select('id, athlete_id').eq('id', target.program_id).single()
  if (!program || program.athlete_id !== athlete.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data: sessions } = await supabaseAdmin.from('program_sessions')
    .select('id, order_index, visible_client').eq('program_id', target.program_id).order('order_index')
  const { data: completions } = await supabaseAdmin.from('program_completions')
    .select('program_session_id').eq('athlete_id', athlete.id).in('program_session_id', sessions.map(s => s.id))
  const processedIds = new Set((completions || []).map(c => c.program_session_id))

  const idx = sessions.findIndex(s => s.id === sessionId)
  if (idx === -1 || !estVisibleClient(sessions[idx])) return NextResponse.json({ error: 'séance introuvable' }, { status: 404 })

  const arr = [...sessions]
  const [item] = arr.splice(idx, 1)
  let count = 0, insertAt = arr.length
  for (let i = idx; i < arr.length; i++) {
    if (!processedIds.has(arr[i].id) && estVisibleClient(arr[i])) {
      count++
      if (count === offset) { insertAt = i + 1; break }
    }
  }
  arr.splice(insertAt, 0, item)

  const updated = arr.map((s, i) => ({ id: s.id, order_index: i }))
  for (const s of updated) {
    await supabaseAdmin.from('program_sessions').update({ order_index: s.order_index }).eq('id', s.id)
  }

  return NextResponse.json({ order: updated })
}
