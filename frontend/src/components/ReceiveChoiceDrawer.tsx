import { Drawer } from './Drawer'
import { BoxIcon, ChevronRightIcon, RollIcon } from './icons'

/** First step of receiving: a fabric roll (metres) or other shop stock (pieces, kilos...). */
export function ReceiveChoiceDrawer({ onClose, onChoose }: { onClose: () => void; onChoose: (kind: 'roll' | 'item') => void }) {
  return (
    <Drawer onClose={onClose} title="Receive stock" description="What came in?">
      <div className="grid gap-3">
        <Choice
          onClick={() => onChoose('roll')}
          icon={<RollIcon />}
          title="Fabric roll"
          body="Fabric measured in metres, tagged and tracked as a roll."
        />
        <Choice
          onClick={() => onChoose('item')}
          icon={<BoxIcon />}
          title="Other stock"
          body="Hangers, trims, lining, buttons — counted in pieces, kilos or packs."
        />
      </div>
    </Drawer>
  )
}

function Choice({ onClick, icon, title, body }: { onClick: () => void; icon: React.ReactNode; title: string; body: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-line-soft bg-white p-4 text-left shadow-card transition hover:border-plum-300 hover:bg-blush-50"
    >
      <span className="grid size-11 flex-none place-items-center rounded-xl bg-blush-200 text-rose-dark">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-plum">{title}</span>
        <span className="block text-sm text-ink-muted">{body}</span>
      </span>
      <ChevronRightIcon className="size-5 flex-none text-ink-faint" />
    </button>
  )
}
