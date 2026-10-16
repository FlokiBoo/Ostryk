'use client'

import { use } from 'react'
import SessionBlockEditor from '@/app/components/SessionBlockEditor'

export default function SessionEditorPageWrapper({ params }) {
  const { athleteId, programId, sessionId } = use(params)
  return <SessionBlockEditor sessionId={sessionId} backHref={`/programs/${athleteId}/${programId}`} athleteId={athleteId} />
}
