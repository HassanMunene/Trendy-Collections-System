import { useNavigate } from 'react-router'
import { api } from '../api/endpoints'
import { useCan, useCurrentUser, useSetMe } from '../auth/useMe'
import { Button, ButtonLink, Card, DetailList, PageHeader } from '../components/ui'
import { formatPhone } from '../lib/units'
import { ChangePasswordForm } from './ChangePasswordPage'

export function AccountPage() {
  const me = useCurrentUser()
  const setMe = useSetMe()
  const navigate = useNavigate()
  const canManageStaff = useCan('manage_staff')

  async function signOut() {
    try {
      await api.logout()
    } finally {
      setMe(null)
      navigate('/login', { replace: true })
    }
  }

  return (
    <>
      <PageHeader title="My account" subtitle="Sign out when you hand this phone to someone else." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Card title={me.name}>
            <DetailList
              items={[
                ['Username', me.username],
                ['Phone', formatPhone(me.phone)],
                ['Role', <span key="role" className="capitalize">{me.is_superadmin ? 'Owner (superadmin)' : me.role}</span>],
              ]}
            />
            <div className="mt-4 grid gap-2 sm:flex">
              {canManageStaff && (
                <ButtonLink to="/staff" variant="secondary" className="md:hidden">
                  Manage staff
                </ButtonLink>
              )}
              <Button variant="danger" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </Card>
        </div>
        <Card title="Change password">
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  )
}
