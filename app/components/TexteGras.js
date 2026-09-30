import { segmentsGras } from '@/lib/sectionsTexte'

// Texte avec **gras** (format décrit dans lib/sectionsTexte.js) rendu en <strong>.
export default function TexteGras({ texte }) {
  return (
    <>
      {segmentsGras(texte).map((s, i) => (s.gras ? <strong key={i} style={{ fontWeight: 700 }}>{s.texte}</strong> : s.texte))}
    </>
  )
}
