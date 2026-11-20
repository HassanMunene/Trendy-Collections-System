import { ButtonLink, EmptyState } from '../components/ui'

export function NotFoundPage() {
  return (
    <div className="pt-8">
      <EmptyState title="Page not found" action={<ButtonLink to="/">Go home</ButtonLink>}>
        The link may be old or mistyped.
      </EmptyState>
    </div>
  )
}
