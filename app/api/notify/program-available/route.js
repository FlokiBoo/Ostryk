import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function POST(request) {
  const { programId } = await request.json()
  if (!programId) return NextResponse.json({ error: 'programId requis.' }, { status: 400 })

  const { data: program } = await supabaseAdmin.from('programs').select('title').eq('id', programId).single()
  if (!program) return NextResponse.json({ error: 'Programme introuvable.' }, { status: 404 })

  const { data: sessions } = await supabaseAdmin.from('program_sessions')
    .select('session_type, coach_notes').eq('program_id', programId).eq('visible_client', true)
  const sessionCount = (sessions || []).length
  const explication = (sessions || []).find(s => s.session_type === 'explication')?.coach_notes?.trim()

  const { data: athletes } = await supabaseAdmin.from('athletes').select('email, name').neq('archived', true)

  await Promise.all((athletes || []).filter(a => a.email).map(a => sendEmail({
    to: a.email,
    subject: 'Nouveau programme en ligne !',
    html: `<p>Bonjour ${a.name?.split(' ')[0] || ''},</p>`
      + `<p>Un nouveau programme est disponible : <strong>${program.title}</strong>`
      + ` (${sessionCount} séance${sessionCount > 1 ? 's' : ''}).</p>`
      + (explication ? `<p>${explication.replace(/\n/g, '<br/>')}</p>` : '')
      + `<p>Connecte-toi à ton espace pour le découvrir.</p>`,
  })))

  return NextResponse.json({ success: true })
}
