import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { toProblem, type ApiProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { Roll } from '../api/types'
import { useCan } from '../auth/useMe'
import { MovementRow } from '../components/MovementRow'
import { Button, Card, DetailList, ErrorNotice, Field, Loading, Notice, PageHeader, Pill, Swatch, Textarea, UnitInput } from '../components/ui'
import { cmToMetreInput, formatDate, formatKes, formatMetres, formatPhone, metresToCm } from '../lib/units'

export function RollDetailPage() {
  const id = Number(useParams().id)
  const canAdjust = useCan('adjust_stock')
  const canSeeCosts = useCan('view_costs')
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['roll', id], queryFn: () => api.roll(id), enabled: Number.isFinite(id) })

  if (isLoading) return <Loading />
  if (error || !data)
    return (
      <div className="pt-6">
        <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />
      </div>
    )

  const roll = data.data
  const f = roll.fabric
  const difference = roll.stated_cm !== null ? roll.received_cm - roll.stated_cm : null
  const costPerMetre = roll.cost_cents !== undefined && roll.received_cm > 0 ? Math.round((roll.cost_cents * 100) / roll.received_cm) : null

  return (
    <>
      <PageHeader
        back={{ to: '/rolls', label: 'Rolls' }}
        title={roll.tag}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Swatch name={f?.colour?.name} /> {f?.display_name}
            {roll.is_low && <Pill tone="warn">Running low</Pill>}
            {roll.status !== 'active' && <Pill tone="muted">{roll.status === 'finished' ? 'Finished' : 'Written off'}</Pill>}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <p className="text-sm font-semibold text-ink-muted">Left on this roll</p>
            <p className="tabular mt-1 font-display text-5xl text-plum">{formatMetres(roll.balance_cm)}</p>
            <p className="mt-1 text-sm text-ink-muted">Received {formatMetres(roll.received_cm)} on {formatDate(roll.created_at)}</p>
          </Card>

          {canAdjust && <AdjustCard roll={roll} />}

          <Card title="Fabric">
            <DetailList
              items={[
                ['Code', f?.code],
                ['Category', f?.category?.name],
                ['Material', f?.material_type?.name],
                ['Texture / finish', f?.texture?.name],
                ['Colour', f?.colour?.name],
                ['Design', f?.design],
                ['Width', f?.width_cm ? `${f.width_cm} cm` : ''],
                ['Selling price', f?.retail_price_cents_per_m != null ? `${formatKes(f.retail_price_cents_per_m)} / m` : ''],
              ]}
            />
          </Card>

          <Card title="Roll details">
            <DetailList
              items={[
                ['Supplier said', roll.stated_cm !== null ? formatMetres(roll.stated_cm) : ''],
                ['Measured at receiving', formatMetres(roll.received_cm)],
                ...(difference !== null && difference !== 0
                  ? ([['Difference', <span key="diff" className={difference < 0 ? 'text-danger' : 'text-success'}>{difference > 0 ? '+' : '−'}{formatMetres(Math.abs(difference))}</span>]] as [string, React.ReactNode][])
                  : []),
                ['Dye lot', roll.dye_lot],
                ['Location', roll.location],
                ['Low alert at', roll.remnant_alert_cm ? formatMetres(roll.remnant_alert_cm) : ''],
                ['Purchase date', roll.purchase_date ? formatDate(roll.purchase_date) : ''],
                ['Received by', roll.received_by?.name],
                ...(canSeeCosts
                  ? ([
                      ['Cost', formatKes(roll.cost_cents)],
                      ['Cost per metre', costPerMetre !== null ? formatKes(costPerMetre) : ''],
                      ['Supplier', roll.supplier ? [roll.supplier.name, roll.supplier.building, roll.supplier.stall].filter(Boolean).join(', ') : ''],
                      ['Supplier phone', formatPhone(roll.supplier?.phone)],
                      ['Receipt / invoice', roll.invoice_ref],
                    ] as [string, React.ReactNode][])
                  : []),
                ['Included services', roll.included_services],
                ['Notes', roll.notes],
              ]}
            />
          </Card>
        </div>

        <Card title="History" className="content-start self-start">
          <p className="-mt-1 mb-2 text-sm text-ink-muted">Every change to this roll, newest first. History cannot be edited or deleted.</p>
          <ul className="divide-y divide-line-soft">
            {data.movements.map((m) => (
              <MovementRow key={m.id} movement={m} />
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}

function AdjustCard({ roll }: { roll: Roll }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [counted, setCounted] = useState(cmToMetreInput(roll.balance_cm))
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<ApiProblem | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const countedCm = metresToCm(counted)
  const diff = countedCm !== null ? countedCm - roll.balance_cm : null

  const mutation = useMutation({
    mutationFn: (body: { counted_cm: number; reason: string }) => api.adjustRoll(roll.id, body),
    onSuccess: (a) => {
      setDone(`Corrected from ${formatMetres(a.before_cm)} to ${formatMetres(a.after_cm)}.`)
      setOpen(false)
      setReason('')
      qc.invalidateQueries({ queryKey: ['roll', roll.id] })
      qc.invalidateQueries({ queryKey: ['rolls'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['fabrics'] })
    },
    onError: (e) => setProblem(toProblem(e)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    if (countedCm === null) {
      setProblem({ status: 422, message: '', fields: { counted_cm: 'Enter the measured length in metres, e.g. 42.5' } })
      return
    }
    mutation.mutate({ counted_cm: countedCm, reason })
  }

  if (!open) {
    return (
      <div className="grid gap-2">
        {done && <Notice tone="success">{done}</Notice>}
        <Button variant="secondary" onClick={() => { setOpen(true); setDone(null); setCounted(cmToMetreInput(roll.balance_cm)) }}>
          Correct the count
        </Button>
      </div>
    )
  }

  return (
    <Card title="Correct the count">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <p className="text-sm text-ink-muted">
          Measure what is really on the roll. The old figure, the new one, your name and the reason are kept permanently.
        </p>
        <Field
          label="Measured length now"
          error={problem?.fields.counted_cm}
          hint={
            diff !== null && diff !== 0 ? (
              <span className={diff < 0 ? 'font-semibold text-danger' : 'font-semibold text-success'}>
                {diff > 0 ? '+' : '−'}
                {formatMetres(Math.abs(diff))} compared with the system ({formatMetres(roll.balance_cm)})
              </span>
            ) : (
              `System says ${formatMetres(roll.balance_cm)}`
            )
          }
        >
          {(a) => <UnitInput {...a} unit="m" value={counted} onChange={(e) => setCounted(e.target.value)} />}
        </Field>
        <Field label="Reason" error={problem?.fields.reason}>
          {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Measured at month-end stocktake" rows={2} />}
        </Field>
        {problem && Object.keys(problem.fields).length === 0 && <ErrorNotice problem={problem} />}
        <div className="flex gap-2">
          <Button type="submit" busy={mutation.isPending} disabled={!reason.trim() || diff === 0 || countedCm === null}>
            Save correction
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setOpen(false); setProblem(null) }}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
