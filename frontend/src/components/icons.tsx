// Minimal inline icons (24px viewBox, stroke). Decorative: pair each with visible text or an aria-label on the parent.
// Every icon accepts `className` and `size`; defaults match the previous fixed sizes.
import type { ReactNode } from 'react'

export interface IconProps {
    className?: string
    size?: number
}

function Svg({ size = 22, className, strokeWidth = 1.9, children }: IconProps & { strokeWidth?: number; children: ReactNode }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={className}
        >
            {children}
        </svg>
    )
}

export const HomeIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
    </Svg>
)

export const RollIcon = (p: IconProps) => (
    <Svg {...p}>
        <ellipse cx="7" cy="12" rx="4" ry="8" />
        <path d="M7 4h11a4 8 0 0 1 0 16H7" />
        <circle cx="7" cy="12" r="1.3" />
    </Svg>
)

/** Circled plus, for nav items. For filled buttons use PlusGlyphIcon. */
export const PlusIcon = (p: IconProps) => (
    <Svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
    </Svg>
)

/** Bare plus, for use inside a filled button. */
export const PlusGlyphIcon = ({ size = 20, ...p }: IconProps) => (
    <Svg size={size} strokeWidth={2.4} {...p}>
        <path d="M12 5v14M5 12h14" />
    </Svg>
)

export const BoxIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
        <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </Svg>
)

export const SwatchIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </Svg>
)

export const UserIcon = (p: IconProps) => (
    <Svg {...p}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
)

export const TeamIcon = (p: IconProps) => (
    <Svg {...p}>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
    </Svg>
)

export const SearchIcon = ({ size = 18, ...p }: IconProps) => (
    <Svg size={size} {...p}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
    </Svg>
)

export const XMarkIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
)

export const InboxIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M4 13h4l1.5 3h5L16 13h4" />
        <path d="M4 13V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
        <path d="M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </Svg>
)

export const ChevronLeftIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m15 5-7 7 7 7" />
    </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m9 5 7 7-7 7" />
    </Svg>
)

export const ChevronDoubleLeftIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m11 5-7 7 7 7" />
        <path d="m19 5-7 7 7 7" />
    </Svg>
)

export const ChevronDoubleRightIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m13 5 7 7-7 7" />
        <path d="m5 5 7 7-7 7" />
    </Svg>
)

export const EyeIcon = ({ size = 20, ...p }: IconProps) => (
    <Svg size={size} {...p}>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="3" />
    </Svg>
)

export const EyeOffIcon = ({ size = 20, ...p }: IconProps) => (
    <Svg size={size} {...p}>
        <path d="M3 3l18 18" />
        <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.4 3.2M6.4 8.2A17 17 0 0 0 2.5 12S6 18 12 18a9.4 9.4 0 0 0 3.7-.7" />
        <path d="M9.9 10a3 3 0 0 0 4.2 4.2" />
    </Svg>
)

export const CameraIcon = ({ size = 18, ...p }: IconProps) => (
    <Svg size={size} {...p}>
        <path d="M4 8h2.5L8 5.5h8L17.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
        <circle cx="12" cy="13" r="3.2" />
    </Svg>
)

export const TrashIcon = ({ size = 18, ...p }: IconProps) => (
    <Svg size={size} {...p}>
        <path d="M4 7h16M9 7V4.5h6V7" />
        <path d="M6 7l1 12.5h10L18 7" />
        <path d="M10.5 11v5M13.5 11v5" />
    </Svg>
)

export const AuditIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15L12 17l-6.5 3V5A1.5 1.5 0 0 1 7 3.5Z" />
        <path d="M9.5 8h5M9.5 11.5h5" />
    </Svg>
)

export const TruckIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M3 6h10v10H3z" />
        <path d="M13 9h4l4 4v3h-8z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17.5" cy="18" r="2" />
    </Svg>
)

export const BanknoteIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6 9.5v5M18 9.5v5" />
    </Svg>
)

export const ChartIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M4 20h16" />
        <path d="M7 16v-5" />
        <path d="M12 16V6" />
        <path d="M17 16v-8" />
    </Svg>
)

export const TrendingUpIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="m3 16 5-5 4 4 7-8" />
        <path d="M14 7h5v5" />
    </Svg>
)

export const CheckCircleIcon = (p: IconProps) => (
    <Svg {...p}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.8 2.8L16.5 9" />
    </Svg>
)

export const AlertTriangleIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M12 3.5 2.8 20h18.4z" />
        <path d="M12 9.5v5M12 17.4v.1" />
    </Svg>
)

export const LogoutIcon = ({ size = 18, ...p }: IconProps) => (
    <Svg size={size} {...p}>
        <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
        <path d="M10 8l-4 4 4 4M6 12h10" />
    </Svg>
)
export const CartIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" />
        <circle cx="9.5" cy="20" r="1.2" />
        <circle cx="17.5" cy="20" r="1.2" />
    </Svg>
)

export const BookIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
        <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
        <path d="M8.5 7.5h7M8.5 11h5" />
    </Svg>
)

export const TagIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M3 12.2V4a1 1 0 0 1 1-1h8.2a1 1 0 0 1 .7.3l8.1 8.1a1 1 0 0 1 0 1.4l-8.2 8.2a1 1 0 0 1-1.4 0l-8.1-8.1a1 1 0 0 1-.3-.7z" />
        <circle cx="8" cy="8" r="1.4" />
    </Svg>
)

export const NeedleIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M20.5 3.5 6 18" />
        <path d="M18 3.2a2.2 2.2 0 0 1 3 3l-1 1" />
        <path d="M6 18l-2.5 2.5" />
        <path d="M14 4c-6 1-9 4-9.5 8s2.5 5.5 5 4.5" />
    </Svg>
)

export const PeopleIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M4 21v-1.5a4.5 4.5 0 0 1 4.5-4.5h3a4.5 4.5 0 0 1 4.5 4.5V21" />
        <circle cx="10" cy="8" r="3.5" />
        <path d="M17 4.5a3.5 3.5 0 0 1 0 7M20 21v-1.5a4.5 4.5 0 0 0-2.5-4" />
    </Svg>
)

export const DotsIcon = (p: IconProps) => (
    <Svg {...p}>
        <circle cx="5" cy="12" r="1.3" />
        <circle cx="12" cy="12" r="1.3" />
        <circle cx="19" cy="12" r="1.3" />
    </Svg>
)

export const MinusIcon = ({ size = 20, ...p }: IconProps) => (
    <Svg size={size} {...p}>
        <path d="M5 12h14" />
    </Svg>
)

export const HandoverIcon = (p: IconProps) => (
    <Svg {...p}>
        <path d="M4 8h12l-3-3M20 16H8l3 3" />
    </Svg>
)

export const ClipboardIcon = (p: IconProps) => (
    <Svg {...p}>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3" />
    </Svg>
)
