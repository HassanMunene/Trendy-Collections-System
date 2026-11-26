import { useState, type FormEvent, type ReactNode } from 'react'
import { toProblem, type ApiProblem } from '../api/client'
import { Drawer } from './Drawer'
import { Button, ErrorNotice, Field, Notice, Textarea } from './ui'

/** "Void this …?" with a required reason. The record stays, crossed out. */
export function VoidDrawer({
  title,
  description,
  explanation,
  onVoid,
  onClose,
}: {
  title: string
  description?: ReactNode
  explanation: ReactNode
  onVoid: (reason: string) => Promise<unknown>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) {
      setProblem({ status: 422, message: 'Give a reason.', fields: { reason: 'Say why this is being voided.' } })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await onVoid(reason.trim())
    } catch (err) {
      setProblem(toProblem(err))
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <Button type="submit" form="void-drawer-form" variant="danger" busy={busy}>
          Void
        </Button>
      }
    >
      <form id="void-drawer-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Notice>{explanation}</Notice>
        <Field label="Reason" error={problem?.fields.reason}>
          {(a) => <Textarea {...a} rows={2} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" />}
        </Field>
        {problem && !problem.fields.reason && <ErrorNotice problem={problem} />}
      </form>
    </Drawer>
  )
}
