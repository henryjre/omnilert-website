# Feature Design: My Token Pay Page (Wallet Layout)

## Overview
A new "My Token Pay" page under the "My Account" section. The page acts as a digital wallet view designed with premium aesthetics. 

## Context & Requirements
- **Frontend First**: The backend does not exist yet. Mock data will be used to simulate state and pagination.
- **Aesthetic**: Premium, avoiding generic UI. It must harmonize with the existing application design.
- **Header**: Needs to match the structure of `AuditResultsPage`.
- **Card**: Needs to match the animated blue gradient logic of `EpiHeroCard` but showcase Token Pay Balance.
- **Feed**: A paginated "Consumer Wallet" style feed for transaction history beneath the hero card.

## Architecture & Components

### 1. `TokenPayPage`
- **Path**: `apps/web/src/features/account/pages/TokenPayPage.tsx`
- **Responsibility**: Top-level page component handling the layout. Maintains state for pagination and passes mock data down to children.

### 2. `TokenPayPageContent`
- **Path**: `apps/web/src/features/account/components/TokenPayPageContent.tsx`
- **Responsibility**: Contains the layout structure.
- **Header**: Features a wallet-related Lucide icon, a distinct "My Token Pay" title, and a subtitle explaining the context (matching `AuditResultsPageContent`).

### 3. `TokenBalanceCard`
- **Path**: `apps/web/src/features/account/components/TokenBalanceCard.tsx`
- **Responsibility**: Visual hero component showing the user's available token balance.
- **Design Specifications**: 
  - Will adapt the `AnimatedBackground` (from `EpiHeroCard`) and the specific blue linear gradient.
  - Generous padding, displaying the balance in a large, prominent font.
  - Distinct typography matching high-end fintech aesthetics.

### 4. `TokenTransactionFeed`
- **Path**: `apps/web/src/features/account/components/TokenTransactionFeed.tsx`
- **Responsibility**: Displays a list of paginated transactions. Uses the existing `Pagination` component for page controls.
- **Design Specifications**: 
  - Consumer Wallet style (Feed / List). 
  - Each row presents:
    - Left: Icon indicating transaction type (e.g., received, spent).
    - Middle: Title/Description and localized timestamp.
    - Right: Amount formatted with color-coding (e.g., green for positive, gray for negative/expenditure).

## Data Flow (Mock Implementation)
- A custom hook `useMockTokenTransactions` will be created to generate realistic token transactions (credits and debits) and handle local client-side pagination since the backend is pending.

## Aesthetics Note
- Implementation must follow `@frontend-design` principles: unexpected spatial composition inside the feed, bold typography for the balance, polished micro-interactions (like hover effects on transaction rows), and meticulous spacing.
