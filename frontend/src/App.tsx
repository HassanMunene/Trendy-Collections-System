import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useEffect, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router'
import { http, toProblem } from './api/client'
import type { Permissions } from './api/types'
import { ME_KEY, useMe } from './auth/useMe'
import { AppShell } from './components/AppShell'
import { ErrorNotice, Loading } from './components/ui'
import { AccountPage } from './pages/AccountPage'
import { AuditPage } from './pages/AuditPage'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { CustomersPage } from './pages/CustomersPage'
import { DayBookPage } from './pages/DayBookPage'
import { DashboardPage } from './pages/DashboardPage'
import { FabricFormPage } from './pages/FabricFormPage'
import { FabricsPage } from './pages/FabricsPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProductsPage } from './pages/ProductsPage'
import { RollDetailPage } from './pages/RollDetailPage'
import { RollsPage } from './pages/RollsPage'
import { SellPage } from './pages/SellPage'
import { SewingPage } from './pages/SewingPage'
import { StaffPage } from './pages/StaffPage'
import { StockPage } from './pages/StockPage'
import { SuppliersPage } from './pages/SuppliersPage'

/** Signed-in area. Sends guests to /login and temporary-password users to set their own. */
function RequireAuth({ children }: { children: ReactNode }) {
    const { data: me, isLoading, error, refetch } = useMe()
    const location = useLocation()
    if (isLoading) return <Loading label="Opening Trendy…" />
    if (error)
        return (
            <div className="mx-auto max-w-md p-6">
                <ErrorNotice problem={toProblem(error)} onRetry={() => refetch()} />
            </div>
        )
    if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    if (me.must_change_password && location.pathname !== '/set-password') return <Navigate to="/set-password" replace />
    return <>{children}</>
}

function RequirePermission({ permission, children }: { permission: keyof Permissions; children: ReactNode }) {
    const { data: me } = useMe()
    if (!me?.permissions[permission]) {
        return (
            <div className="pt-6">
                <ErrorNotice problem={{ status: 403, message: 'Your account is not allowed to open this page.', fields: {} }} />
            </div>
        )
    }
    return <>{children}</>
}

/** If the session expires (401) or a password change is demanded, refresh who we are. */
function SessionWatcher() {
    const qc = useQueryClient()
    useEffect(() => {
        const id = http.interceptors.response.use(undefined, (error) => {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status
                const code = (error.response?.data as { code?: string } | undefined)?.code
                const isAuthCall = /\/(login|me)$/.test(error.config?.url ?? '')
                if (status === 401 && !isAuthCall) qc.setQueryData(ME_KEY, null)
                if (code === 'password_change_required') qc.invalidateQueries({ queryKey: ME_KEY })
            }
            throw error
        })
        return () => http.interceptors.response.eject(id)
    }, [qc])
    return <Outlet />
}

const router = createBrowserRouter([
    {
        element: <SessionWatcher />,
        children: [
            { path: '/login', element: <LoginPage /> },
            {
                path: '/set-password',
                element: (
                    <RequireAuth>
                        <ChangePasswordPage />
                    </RequireAuth>
                ),
            },
            {
                element: ( <RequireAuth><AppShell /></RequireAuth>),
                children: [
                    { index: true, element: <DashboardPage /> },
                    {
                        path: 'sell',
                        element: (
                            <RequirePermission permission="sell">
                                <SellPage />
                            </RequirePermission>
                        ),
                    },
                    {
                        path: 'day-book',
                        element: (
                            <RequirePermission permission="sell">
                                <DayBookPage />
                            </RequirePermission>
                        ),
                    },
                    {
                        path: 'customers',
                        element: (
                            <RequirePermission permission="sell">
                                <CustomersPage />
                            </RequirePermission>
                        ),
                    },
                    { path: 'products', element: <ProductsPage /> },
                    { path: 'sewing', element: <SewingPage /> },
                    { path: 'rolls', element: <RollsPage /> },
                    {
                        // Receiving happens in a drawer on any page, opened with ?receive=1.
                        path: 'rolls/receive',
                        element: (
                            <RequirePermission permission="receive_stock">
                                <Navigate to="/rolls?receive=1" replace />
                            </RequirePermission>
                        ),
                    },
                    { path: 'rolls/:id', element: <RollDetailPage /> },
                    { path: 'stock', element: <StockPage /> },
                    {
                        path: 'suppliers',
                        element: (
                            <RequirePermission permission="manage_catalogue">
                                <SuppliersPage />
                            </RequirePermission>
                        ),
                    },
                    { path: 'fabrics', element: <FabricsPage /> },
                    {
                        // Creation happens in a drawer on the list page.
                        path: 'fabrics/new',
                        element: (
                            <RequirePermission permission="manage_catalogue">
                                <Navigate to="/fabrics?new=1" replace />
                            </RequirePermission>
                        ),
                    },
                    { path: 'fabrics/:id', element: <FabricFormPage /> },
                    {
                        path: 'staff',
                        element: (
                            <RequirePermission permission="manage_staff">
                                <StaffPage />
                            </RequirePermission>
                        ),
                    },
                    {
                        path: 'audit',
                        element: (
                            <RequirePermission permission="view_audit">
                                <AuditPage />
                            </RequirePermission>
                        ),
                    },
                    { path: 'account', element: <AccountPage /> },
                    { path: '*', element: <NotFoundPage /> },
                ],
            },
        ],
    },
])

export function App() {
    return <RouterProvider router={router} />
}
