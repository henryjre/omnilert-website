# Account Right Sidebar Design

**Date:** 2026-04-12

## Context

The left sidebar contains a "My Account" section (schedule, payslip, authorization requests, cash requests, audit results, notifications, profile, settings) alongside management, analytics, store ops, and admin sections. This mixes personal account pages with operational/management pages in one navigation column.

The goal is to move all "My Account" links — plus the user name/email and Sign Out button — into a dedicated right-side sidebar that slides in when the user clicks their avatar in the topbar. This gives account pages their own dedicated space, keeps the left sidebar focused on operational navigation, and makes the avatar button a clear entry point to personal account actions.

## Approach

Approach A: state lifted into `DashboardLayout`. Parallel to the existing left mobile sidebar, `DashboardLayout` owns `accountSidebarOpen` state and passes an `onOpenAccountSidebar` callback to `TopBar`. No new store or context needed.

## Components

### New: `AccountSidebar`
**Path:** `apps/web/src/features/dashboard/components/AccountSidebar.tsx`

Structure (top to bottom):
1. **Header strip** — "My Account" label + X close button (always rendered; close button calls `onClose` prop)
2. **Nav section** — all links currently in the "My Account" section of `Sidebar`, using the same `AnimatedNavLink`, `linkClass`, and `categoryLabel` helpers and the same permission guards (`hasPermission`, `PERMISSIONS.*`)
3. **Footer** — user name + email block + Sign Out motion button (moved from `Sidebar` footer)

Props: `className?: string`, `onClose: () => void`

Reuses: `AnimatedNavLink`, `linkClass`, `categoryLabel` — extract these to a shared file or keep them local and duplicate (duplicate is fine since `AccountSidebar` is a sibling file).

### Modified: `Sidebar`
**Path:** `apps/web/src/features/dashboard/components/Sidebar.tsx`

Remove:
- The entire "My Account" `categoryLabel` + all nav links under it
- The `mt-auto border-t` footer block (user name/email + Sign Out button)

The nav section starts directly with the separator + first non-account category. No other changes.

### Modified: `DashboardLayout`
**Path:** `apps/web/src/features/dashboard/components/DashboardLayout.tsx`

Add:
- `const [accountSidebarOpen, setAccountSidebarOpen] = useState(false)`
- Mutual exclusion: opening one sidebar closes the other
- Escape key closes account sidebar (same `useEffect` pattern as left sidebar)
- Body scroll lock while account sidebar is open (same `useEffect` pattern)
- Close on route change (same `useEffect` on `location.pathname`)
- Right overlay rendered inside `AnimatePresence`:
  - Backdrop: `motion.button` `fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]` — click closes
  - Panel: `motion.div` `absolute inset-y-0 right-0 h-[100dvh] w-72 max-w-[85vw] bg-white shadow-2xl`
  - Animation: `initial={{ x: '100%' }}` → `animate={{ x: 0 }}` → `exit={{ x: '100%' }}`
  - Transition: `type: 'spring', damping: 25, stiffness: 200` (same as left sidebar)
  - Swipe-right-to-close: `onPanEnd` — if `info.offset.x > 60` close
  - ChevronRight handle on left edge of panel (mirrors ChevronLeft on right edge of left panel)
- Pass `onOpenAccountSidebar={() => { setMobileSidebarOpen(false); setAccountSidebarOpen(true); }}` to `TopBar`
- Pass `accountSidebarOpen` boolean to `TopBar`

### Modified: `TopBar`
**Path:** `apps/web/src/features/dashboard/components/TopBar.tsx`

Add props:
- `onOpenAccountSidebar?: () => void`
- `accountSidebarOpen?: boolean`

Avatar element changes:
- Wrap in `motion.button` (replace the plain `<div>` wrapper)
- `onClick`: calls `onOpenAccountSidebar()`
- `cursor-pointer`, `rounded-full`, `transition-shadow`
- `whileHover={{ scale: 1.05 }}` + `whileTap={{ scale: 0.95 }}`
- Ring: `ring-2 ring-primary-300` on hover (via Tailwind `hover:ring-2 hover:ring-primary-300`)
- Ring active state: `ring-2 ring-primary-500` when `accountSidebarOpen === true`

## Animation Details

| Property | Left sidebar | Right sidebar |
|---|---|---|
| Slide direction | `x: '-100%'` → `x: 0` | `x: '100%'` → `x: 0` |
| Spring | damping 25, stiffness 200 | damping 25, stiffness 200 |
| Width | `w-72 max-w-[85vw]` | `w-72 max-w-[85vw]` |
| z-index | 50 | 50 |
| Backdrop | `bg-black/40 backdrop-blur-[2px]` | same |
| Handle | ChevronLeft on right edge | ChevronRight on left edge |
| Swipe to close | swipe left (offset.x < -60) | swipe right (offset.x > 60) |

On desktop (`lg:` and above) the right sidebar behaves identically — it overlays the content, does not push it. There is no separate desktop-only variant.

## Mutual Exclusion

In `DashboardLayout`:
- `openAccountSidebar()` → `setMobileSidebarOpen(false)`, `setAccountSidebarOpen(true)`
- `openMobileSidebar()` → `setAccountSidebarOpen(false)`, `setMobileSidebarOpen(true)`

## Files Changed

| File | Type |
|---|---|
| `apps/web/src/features/dashboard/components/AccountSidebar.tsx` | New |
| `apps/web/src/features/dashboard/components/Sidebar.tsx` | Modified |
| `apps/web/src/features/dashboard/components/DashboardLayout.tsx` | Modified |
| `apps/web/src/features/dashboard/components/TopBar.tsx` | Modified |

No route changes. No store changes. No new dependencies.

## Verification

1. Start dev server (`pnpm dev` from root)
2. Log in — confirm left sidebar no longer shows "My Account" section or user footer
3. Click avatar in topbar — confirm right sidebar slides in from right with spring animation
4. Confirm all "My Account" links are present in right sidebar with correct permission guards
5. Confirm user name/email and Sign Out button appear in right sidebar footer
6. Click backdrop — confirm sidebar closes
7. Press Escape — confirm sidebar closes
8. Navigate to any account page via right sidebar — confirm sidebar closes on route change
9. On mobile: open left sidebar, then open right sidebar — confirm left closes when right opens and vice versa
10. Swipe right on the open right panel — confirm it closes
11. Confirm avatar shows hover ring and scale animation; active ring when sidebar is open
