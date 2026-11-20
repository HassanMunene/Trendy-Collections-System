import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toProblem } from '../api/client'
import { api } from '../api/endpoints'
import type { LookupType, Term } from '../api/types'
import { useCan } from '../auth/useMe'
import { LOOKUPS_KEY } from '../lib/useLookups'
import { Button, Field, Input, Select } from './ui'

const ADD = '__add__'

/** Pick a category/material/texture/colour, or add a new one without leaving the form. */
export function TermSelect({
  type,
  label,
  terms,
  value,
  onChange,
  error,
}: {
  type: LookupType
  label: string
  terms: Term[]
  value: string
  onChange: (id: string) => void
  error?: string
}) {
  const qc = useQueryClient()
  const canAdd = useCan('manage_catalogue')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [addError, setAddError] = useState<string>()

  async function add() {
    setBusy(true)
    setAddError(undefined)
    try {
      const term = await api.addLookup(type, name)
      await qc.invalidateQueries({ queryKey: LOOKUPS_KEY })
      onChange(String(term.id))
      setAdding(false)
      setName('')
    } catch (e) {
      const p = toProblem(e)
      setAddError(p.fields.name ?? p.message)
    } finally {
      setBusy(false)
    }
  }

  if (adding) {
    return (
      <Field label={`New ${label.toLowerCase()}`} error={addError} hint="Check the list first so the same name isn't added twice.">
        {(a) => (
          <div className="flex gap-2">
            <Input
              {...a}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (name.trim()) add()
                }
              }}
            />
            <Button type="button" busy={busy} disabled={!name.trim()} onClick={add}>
              Add
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Field>
    )
  }

  return (
    <Field label={label} error={error}>
      {(a) => (
        <Select
          {...a}
          value={value}
          onChange={(e) => (e.target.value === ADD ? setAdding(true) : onChange(e.target.value))}
        >
          <option value="">Choose…</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          {canAdd && <option value={ADD}>+ Add a new one…</option>}
        </Select>
      )}
    </Field>
  )
}
