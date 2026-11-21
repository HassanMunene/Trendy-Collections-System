import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api/endpoints'
import { useCurrentUser, useSetMe } from '../auth/useMe'
import { Avatar } from './Avatar'
import { ConfirmDialog, Modal } from './Dialog'
import { ChevronRightIcon, LogoutIcon, UserIcon } from './icons'
import { Button } from './ui'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose'

/**
 * Small account menu opened from the sidebar user block or the header avatar.
 * Offers a route to the profile and a sign-out flow with its own confirmation step.
 */
export function UserMenuDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const me = useCurrentUser()
    const setMe = useSetMe()
    const navigate = useNavigate()
    const [confirming, setConfirming] = useState(false)
    const [busy, setBusy] = useState(false)

    function goToProfile() {
        onClose()
        navigate('/account')
    }

    function askToSignOut() {
        onClose()
        setConfirming(true)
    }

    async function signOut() {
        setBusy(true)
        try {
            await api.logout()
        } catch {
            // The session may already have expired on the server; sign out locally either way.
        } finally {
            setBusy(false)
            setMe(null)
            navigate('/login', { replace: true })
        }
    }

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                title="Your account"
                size="sm"
                footer={
                    <Button variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                }
            >
                <div className="grid gap-5">
                    <div className="flex items-center gap-3">
                        <Avatar name={me.name} url={me.avatar_url} size="md" />
                        <div className="min-w-0">
                            <p className="truncate font-display text-xl leading-tight text-plum">{me.name}</p>
                            <p className="truncate text-sm text-ink-muted">@{me.username}</p>
                            <p className="mt-0.5 truncate text-xs font-semibold text-rose-dark">
                                {me.is_superadmin ? 'Superadmin' : me.role_label}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-1 border-t border-line-soft pt-3">
                        <button
                            type="button"
                            onClick={goToProfile}
                            className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold text-plum transition hover:bg-blush-100 ${focusRing}`}
                        >
                            <UserIcon />
                            <span className="flex-1">View profile</span>
                            <ChevronRightIcon className="size-5 text-ink-faint" />
                        </button>
                        <button
                            type="button"
                            onClick={askToSignOut}
                            className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold text-danger transition hover:bg-danger-soft ${focusRing}`}
                        >
                            <LogoutIcon />
                            <span className="flex-1">Sign out</span>
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                open={confirming}
                onClose={() => setConfirming(false)}
                onConfirm={signOut}
                title="Sign out?"
                description="You will need to sign in again to use the shop system."
                confirmLabel="Sign out"
                tone="danger"
                busy={busy}
            />
        </>
    )
}
