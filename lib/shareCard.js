// Capture un bloc de la page en image et ouvre le partage natif (réseaux sociaux, messages…).
// Fallback : partage texte seul si le navigateur ne supporte pas le partage de fichiers,
// ou téléchargement de l'image si l'API Web Share n'est pas disponible (desktop).
export async function shareCardImage(node, { filename = 'partage.png', title = '', text = '', backgroundColor = '#ffffff' } = {}) {
  if (!node) return false
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(node, { backgroundColor, scale: node.dataset.scale ? Number(node.dataset.scale) : 2 })
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return false

  const file = new File([blob], filename, { type: 'image/png' })

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text })
      return true
    } catch (e) {
      if (e?.name === 'AbortError') return false
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return true
    } catch (e) {
      if (e?.name === 'AbortError') return false
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return true
}
