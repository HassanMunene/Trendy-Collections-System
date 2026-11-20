import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import { useCan } from '../auth/useMe'
import { FabricFields } from '../components/FabricFields'
import { draftToFabricPayload, emptyFabricDraft, fabricToDraft, type FabricDraft } from '../lib/fabricDraft'
import { Button, ButtonLink, Card, DetailList, ErrorNotice, Loading, Notice, PageHeader } from '../components/ui'
import { formatKes, formatMetres } from '../lib/units'
import { useLookups } from '../lib/useLookups'

/** /fabrics/new and /fabrics/:id (view for everyone, edit for owner/manager). */
export function FabricFormPage() {
  const params = useParams()
  const isNew = !params.id
  const id = Number(params.id)
  const canManage = useCan('manage_catalogue')
  const canReceive = useCan('receive_stock')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const lookups = useLookups()
  const fabric = useQuery({ queryKey: ['fabric', id], queryFn: () => api.fabric(id), enabled: !isNew })
  const [draft, setDraft] = useState<FabricDraft>(emptyFabricDraft)
  const [editing, setEditing] = useState(isNew)
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  if (lookups.isLoading || fabric.isLoading) return <Loading />
  if (!lookups.data || (!isNew && !fabric.data))
    return (
      <div className="pt-6">
        <ErrorNotice problem={toProblem(lookups.error ?? fabric.error)} onRetry={() => { lookups.refetch(); fabric.refetch() }} />
      </div>
    )

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
      const result = isNew ? await api.createFabric(payload) : await api.updateFabric(id, payload)
      qc.invalidateQueries({ queryKey: ['fabrics'] })
      qc.setQueryData(['fabric', result.id], result)
      qc.invalidateQueries({ queryKey: ['rolls'] })
      if (isNew) navigate(`/fabrics/${result.id}`, { replace: true })
      setEditing(false)
      setSaved(true)
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  async function setActive(active: boolean) {
    setBusy(true)
    try {
      const { payload } = draftToFabricPayload(fabricToDraft(fabric.data!))
      const result = await api.updateFabric(id, { ...payload, active })
      qc.setQueryData(['fabric', id], result)
      qc.invalidateQueries({ queryKey: ['fabrics'] })
    } catch (err) {
      setProblem(toProblem(err))
    } finally {
      setBusy(false)
    }
  }

  const f = fabric.data

  if (!editing && f) {
    return (
      <>
        <PageHeader
          back={{ to: '/fabrics', label: 'Fabrics' }}
          title={f.display_name}
          subtitle={`${f.code} · ${f.category?.name ?? ''}${f.active ? '' : ' · no longer sold'}`}
          action={
            <>
              {canReceive && f.active && <ButtonLink to={`/rolls/receive?fabric_id=${f.id}`}>Receive a roll</ButtonLink>}
              <ButtonLink to={`/rolls?fabric_id=${f.id}`} variant="secondary">
                See its rolls
              </ButtonLink>
            </>
          }
        />
        {saved && (
          <div className="mb-4">
            <Notice tone="success">Saved.</Notice>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Details">
            <DetailList
              items={[
                ['Material', f.material_type?.name],
                ['Texture / finish', f.texture?.name],
                ['Colour', f.colour?.name],
                ['Design', f.design],
                ['Light', { '': '', sheer: 'Sheer', light_filtering: 'Light filtering', dim_out: 'Dim-out', blackout: 'Blackout' }[f.opacity]],
                ['Width', f.width_cm ? `${f.width_cm} cm` : ''],
                ['Weight', f.weight_gsm ? `${f.weight_gsm} gsm` : ''],
                ['Shade code', f.shade_code],
                ['Selling price', f.retail_price_cents_per_m != null ? `${formatKes(f.retail_price_cents_per_m)} / m` : ''],
                ['Low-stock warning', f.reorder_threshold_cm != null ? formatMetres(f.reorder_threshold_cm) : ''],
                ['Care', f.care_instructions],
              ]}
            />
          </Card>
          {canManage && (
            <Card title="Manage">
              <div className="grid gap-2">
                <Button variant="secondary" onClick={() => { setDraft(fabricToDraft(f)); setEditing(true); setSaved(false) }}>
                  Edit details
                </Button>
                <Button variant="ghost" busy={busy} onClick={() => setActive(!f.active)}>
                  {f.active ? 'Mark as no longer sold' : 'Mark as sold again'}
                </Button>
                <p className="text-xs text-ink-muted">Fabrics are never deleted, because rolls and history refer to them. Hide ones you no longer sell.</p>
                {problem && <ErrorNotice problem={problem} />}
              </div>
            </Card>
          )}
        </div>
      </>
    )
  }

  if (!canManage) return <ErrorNotice problem={{ status: 403, message: 'Your account is not allowed to edit fabrics.', fields: {} }} />

  return (
    <>
      <PageHeader back={isNew ? { to: '/fabrics', label: 'Fabrics' } : undefined} title={isNew ? 'New fabric' : `Edit ${f?.code}`} />
      <form onSubmit={save} className="grid gap-4 lg:max-w-3xl" noValidate>
        <Card>
          <FabricFields draft={draft} onChange={setDraft} lookups={lookups.data} errors={problem?.fields ?? {}} />
        </Card>
        {problem && <ErrorNotice problem={problem} />}
        <div className="flex gap-2">
          <Button type="submit" busy={busy}>
            {isNew ? 'Add fabric' : 'Save changes'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => (isNew ? navigate('/fabrics') : (setEditing(false), setProblem(null)))}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  )
}
