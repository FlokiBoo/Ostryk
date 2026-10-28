import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { getAnthropic } from '@/lib/anthropic'
import { accesAthlete } from '@/lib/athleteAcces'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'nutrition-etiquettes'

const SYSTEM = `Tu lis des étiquettes de produits alimentaires vendus en France pour une app de suivi nutritionnel.
On te donne deux photos prises au téléphone par un sportif : la première montre le nom du produit (face avant de l'emballage), la seconde le tableau des valeurs nutritionnelles.

Règles :
- Recopie le nom commercial du produit tel qu'il est écrit, sans la marque, avec une majuscule initiale (ex. « Skyr nature 0 % »). La marque va dans son propre champ.
- Les valeurs demandées sont POUR 100 g (ou 100 ml). Si le tableau ne donne que des valeurs par portion et que le poids de la portion est lisible, convertis pour 100 g. Sinon, laisse la valeur à null.
- Énergie : la valeur en kcal, jamais en kJ.
- « dont sucres » va dans sucres_100g, « fibres alimentaires » dans fibres_100g, « sel » dans sel_100g (en g).
- portion_g : le poids d'une portion s'il est indiqué, sinon null.
- N'invente rien. Une valeur illisible, masquée ou absente reste à null.
- lisible = false si les photos ne montrent pas une étiquette alimentaire exploitable. Dans ce cas, mets toutes les valeurs à null.
- remarque : une phrase courte en français pour le sportif s'il doit vérifier quelque chose (valeur floue, conversion depuis une portion, photo coupée), sinon null.`

const nombreOuNull = { anyOf: [{ type: 'number' }, { type: 'null' }] }
const texteOuNull = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const SCHEMA = {
  type: 'object',
  properties: {
    lisible: { type: 'boolean' },
    nom: texteOuNull,
    marque: texteOuNull,
    portion_g: nombreOuNull,
    kcal_100g: nombreOuNull,
    proteines_100g: nombreOuNull,
    glucides_100g: nombreOuNull,
    sucres_100g: nombreOuNull,
    lipides_100g: nombreOuNull,
    fibres_100g: nombreOuNull,
    sel_100g: nombreOuNull,
    remarque: texteOuNull,
  },
  required: ['lisible', 'nom', 'marque', 'portion_g', 'kcal_100g', 'proteines_100g', 'glucides_100g', 'sucres_100g', 'lipides_100g', 'fibres_100g', 'sel_100g', 'remarque'],
  additionalProperties: false,
}

// Les photos arrivent déjà réduites par le navigateur (JPEG ~1600 px, voir NutritionTab) : la
// limite protège seulement d'un envoi anormal. 3 Mo de base64 ≈ 2,2 Mo d'image.
const MAX_BASE64 = 3_000_000
const base64Valide = s => typeof s === 'string' && s.length > 100 && s.length < MAX_BASE64 && /^[A-Za-z0-9+/=]+$/.test(s)

// Lit les deux photos avec Claude et les garde dans le bucket privé, pour que le coach puisse
// vérifier l'aliment plus tard. Ne crée pas l'aliment : le sportif relit et corrige d'abord
// (route ../aliments).
export async function POST(request, { params }) {
  const { token } = await params
  const { athlete, reponse } = await accesAthlete(token)
  if (reponse) return reponse

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Lecture des étiquettes indisponible pour le moment.' }, { status: 503 })
  }

  const { photoNom, photoValeurs } = await request.json()
  if (!base64Valide(photoNom) || !base64Valide(photoValeurs)) {
    return NextResponse.json({ error: 'Photos manquantes ou trop lourdes.' }, { status: 400 })
  }

  const base = `${athlete.id}/${randomUUID()}`
  const chemins = { nom: `${base}-nom.jpg`, valeurs: `${base}-valeurs.jpg` }
  const envois = await Promise.all([
    supabaseAdmin.storage.from(BUCKET).upload(chemins.nom, Buffer.from(photoNom, 'base64'), { contentType: 'image/jpeg' }),
    supabaseAdmin.storage.from(BUCKET).upload(chemins.valeurs, Buffer.from(photoValeurs, 'base64'), { contentType: 'image/jpeg' }),
  ])
  // Sans les photos, le coach n'aurait rien pour vérifier : on n'analyse pas.
  const echec = envois.find(e => e.error)
  if (echec) return NextResponse.json({ error: 'Envoi des photos impossible : ' + echec.error.message }, { status: 502 })

  let message
  try {
    message = await getAnthropic().beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Photo 1 : le nom du produit.' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoNom } },
          { type: 'text', text: 'Photo 2 : les valeurs nutritionnelles.' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photoValeurs } },
        ],
      }],
    })
  } catch (err) {
    const status = err instanceof Anthropic.RateLimitError ? 429 : 502
    return NextResponse.json({ error: 'Lecture des photos impossible, réessaie dans un instant.', detail: err.message }, { status })
  }

  if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
    return NextResponse.json({ error: 'Lecture des photos impossible. Tu peux saisir les valeurs à la main.', photos: chemins }, { status: 422 })
  }
  const texte = message.content.find(b => b.type === 'text')?.text
  let extraction
  try {
    extraction = JSON.parse(texte)
  } catch {
    return NextResponse.json({ error: 'Lecture des photos impossible. Tu peux saisir les valeurs à la main.', photos: chemins }, { status: 422 })
  }

  return NextResponse.json({ extraction, photos: chemins })
}
