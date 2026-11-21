import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Fabric } from '../api/types'
import { draftToFabricPayload, emptyFabricDraft, fabricToDraft, type FabricDraft } from '../lib/fabricDraft'
import { useLookups } from '../lib/useLookups'
import { Drawer } from './Drawer'
import { FabricFields } from './FabricFields'
import { Button, ErrorNotice, Loading } from './ui'

/**
 * Create a fabric without leaving the list, or edit one in place.
 * Creating opens its detail page once saved; editing just closes and refreshes.
 */
export function FabricDrawer({ fabric, onClose }: { fabric?: Fabric; onClose: () => void }) {
  const editing = Boolean(fabric)
  const lookups = useLookups()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<FabricDraft>(() => (fabric ? fabricToDraft(fabric) : emptyFabricDraft))
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    const { payload, errors } = draftToFabricPayload(draft)
    if (Object.keys(errors).length) {
      setProblem({ status: 422, message: 'Please fix the highlighted fields.', fields: errors })
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const result = fabric ? await api.updateFabric(fabric.id, payload) : await api.createFabric(payload)
      qc.setQueryData(['fabric', result.id], result)
      qc.invalidateQueries({ queryKey: ['fabrics'] })
      qc.invalidateQueries({ queryKey: ['rolls'] })
      onClose()
      if (!fabric) navigate(`/fabrics/${result.id}`)
    } catch (err) {
      setProblem(toProblem(err))
      setBusy(false)
    }
  }

  return (
    <Drawer
      onClose={onClose}
      title={editing ? `Edit ${fabric!.code}` : 'New fabric'}
      description={editing ? 'Changes apply straight away to this fabric everywhere it is used.' : 'Saved straight into the catalogue — you can add its first roll afterwards.'}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="fabric-form" busy={busy}>
            {editing ? 'Save changes' : 'Add fabric'}
          </Button>
        </>
      }
    >
      {lookups.isLoading ? (
        <Loading />
      ) : !lookups.data ? (
        <ErrorNotice problem={toProblem(lookups.error)} onRetry={() => lookups.refetch()} />
      ) : (
        <form id="fabric-form" onSubmit={save} noValidate className="grid gap-4">
          <FabricFields draft={draft} onChange={setDraft} lookups={lookups.data} errors={problem?.fields ?? {}} />
          <ErrorNotice problem={problem} />
        </form>
      )}
    </Drawer>
  )
}
