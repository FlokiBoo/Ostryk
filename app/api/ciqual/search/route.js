import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { rechercherCiqual } from '@/lib/ciqualRecherche'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const query = new URL(request.url).searchParams.get('query')?.trim()
  if (!query) return NextResponse.json({ error: 'query requis' }, { status: 400 })

  const results = rechercherCiqual(query)
    .map(({ id, name, protein, fat, carbs }) => ({ id, name, protein, fat, carbs }))

  return NextResponse.json({ results })
}
