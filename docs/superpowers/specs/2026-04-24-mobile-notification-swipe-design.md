# Mobile Notification Swipe Actions Design

## Summary

Add mobile-only swipe actions to the notifications feed in `EmployeeNotificationsTab.tsx`.

- Swipe left commits delete on release past the threshold.
- Swipe right commits read or unread toggle on release past the threshold.
- Small `Mark read` and `Delete` text actions are hidden on mobile.
- Desktop behavior stays unchanged.

The interaction should feel native-mail-like: the card itself slides, the action lane is revealed underneath, and the action fires immediately once the user releases beyond the commit distance.

## Goals

- Make single-notification actions faster on mobile.
- Preserve normal vertical scrolling and CTA button taps.
- Keep notification count and bell state synchronized with swipe actions.
- Reuse existing visual language and current notification card layout.

## Interaction Design

### Scope

- Apply swipe behavior only on mobile widths.
- Keep desktop on the current button-and-link interaction model.
- Keep existing primary CTA buttons visible on mobile, including actions such as `View Reply`, `View Shift`, `Open Profile`, and similar route-specific buttons.

### Swipe Surface

- The whole notification card is the swipe surface.
- If the gesture begins on an interactive CTA button or link, treat it as a normal tap, not as a swipe.
- Lock horizontal dragging only after a small movement threshold and only when horizontal intent is stronger than vertical movement.
- If vertical intent wins, allow normal scrolling and cancel swipe behavior for that gesture.

### Left Swipe: Delete

- Dragging left reveals a danger background behind the card.
- The revealed lane shows a trash icon anchored behind the card.
- Releasing beyond the commit threshold deletes immediately.
- On successful delete, animate the card out to the left and then remove it from the list.
- On failure, animate the card back to rest and show the existing error toast.

### Right Swipe: Read / Unread Toggle

- Dragging right reveals a subtle primary-tinted background behind the card.
- The revealed lane shows:
  - a double-check icon when the notification is currently unread and the action will mark it read
  - an unread-state icon when the notification is currently read and the action will mark it unread
- Releasing beyond the commit threshold commits immediately.
- On success, update the notification read state and animate the card back to rest instead of removing it.
- On failure, animate the card back to rest and show the existing error toast.

### Mobile Button Visibility

- Hide the small `Mark read` and `Delete` text actions on mobile.
- Keep those text actions available on desktop.
- Keep the existing `Delete all read` header action unchanged.

## Behavior and Data Flow

### Frontend

- Introduce a small swipeable notification card wrapper scoped to the notifications tab.
- Use `framer-motion` for drag state, release handling, and spring-back / slide-out animation.
- Prevent duplicate commits while an action is already in flight for that card.
- Maintain current pagination clamping when deletions reduce the number of pages.
- Continue listening for `notification:deleted` socket events so other deletion sources still update the feed live.

### Read State Updates

- Right swipe on unread notification:
  - call mark-read API
  - update local card to read
  - decrement unread count
- Right swipe on read notification:
  - call new mark-unread API
  - update local card to unread
  - increment unread count
- Left swipe on unread notification:
  - call delete API
  - remove card
  - decrement unread count through the same deletion metadata logic already used for deletes
- Left swipe on read notification:
  - call delete API
  - remove card

### Backend

- Add an account endpoint to mark a notification unread again.
- Backend must persist `is_read = false` for the current user and notification.
- Keep the current delete endpoint for swipe-left deletion.

## Implementation Notes

- Prefer a local, tightly scoped swipe wrapper near `EmployeeNotificationsTab.tsx` instead of scattering touch logic across the tab.
- Keep swipe behavior mobile-only by guarding with viewport/media-query logic in rendering and interaction.
- The swipe affordance should not interfere with route-specific CTA buttons inside each notification card.
- The right-swipe action lane should use a softer primary treatment than the destructive left-swipe lane.
- Desktop styling and behavior should remain visually unchanged.

## Failure Handling

- If release does not pass the commit threshold, the card springs back to rest and no API call is made.
- If delete fails, restore the card to rest and show the existing error toast.
- If mark-read or mark-unread fails, restore the card to rest and show the existing error toast.
- While a swipe action is pending for a card, ignore additional swipe commits on that card.

## Tests

### Backend

- Add coverage for the new mark-unread path.
- Verify read-state persistence flips back to `false`.
- Verify unread-count assumptions remain correct for:
  - mark read
  - mark unread
  - delete unread
  - delete read

### Frontend

- Verify mobile swipe affordances exist for:
  - left delete with danger lane and trash icon
  - right read/unread toggle with primary lane and state-aware icon
- Verify mobile hides the small `Mark read` and `Delete` text actions.
- Verify unread cards right-swipe into read behavior.
- Verify read cards right-swipe into unread behavior.
- Verify non-committed swipes snap back without side effects.
- Verify CTA taps still work normally and do not unintentionally trigger swipe commits.

## Acceptance Criteria

- On mobile, swiping left past the threshold deletes a notification on release.
- On mobile, swiping right past the threshold toggles read state on release.
- On mobile, swiping right on a read notification marks it unread.
- On mobile, the action lane is visible behind the card during the gesture.
- On mobile, the small `Mark read` and `Delete` text actions are hidden.
- On desktop, existing notification interactions remain available and unchanged.
