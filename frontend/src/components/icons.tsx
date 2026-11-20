// Minimal inline icons (24px, stroke). Decorative: pair each with visible text.
const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const HomeIcon = () => (<svg {...base}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>)
export const RollIcon = () => (<svg {...base}><ellipse cx="7" cy="12" rx="4" ry="8" /><path d="M7 4h11a4 8 0 0 1 0 16H7" /><circle cx="7" cy="12" r="1.3" /></svg>)
export const PlusIcon = () => (<svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>)
export const SwatchIcon = () => (<svg {...base}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>)
export const UserIcon = () => (<svg {...base}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>)
export const TeamIcon = () => (<svg {...base}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></svg>)
export const SearchIcon = () => (<svg {...base} width={18} height={18}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>)
