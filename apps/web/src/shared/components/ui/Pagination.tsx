import React, { useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationToken = number | "ellipsis-left" | "ellipsis-right";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * When true, keeps pagination controls in view after changing pages.
   * This prevents the common "jump to top" effect when parent components reset scroll on data refresh.
   */
  scrollToNavigation?: boolean;
}

interface BuildPaginationModelInput {
  currentPage: number;
  totalPages: number;
  siblingCount?: number;
}

export function buildPaginationModel({
  currentPage,
  totalPages,
  siblingCount = 1,
}: BuildPaginationModelInput): PaginationToken[] {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const safeSiblingCount = Math.max(0, siblingCount);
  const totalVisibleSlots = safeSiblingCount * 2 + 5;

  if (safeTotalPages <= totalVisibleSlots) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
  }

  const leftSibling = Math.max(safeCurrentPage - safeSiblingCount, 2);
  const rightSibling = Math.min(safeCurrentPage + safeSiblingCount, safeTotalPages - 1);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < safeTotalPages - 1;

  if (!showLeftEllipsis) {
    const leftRangeEnd = Math.min(1 + 2 + safeSiblingCount * 2, safeTotalPages - 1);
    const model: PaginationToken[] = [];

    for (let page = 1; page <= leftRangeEnd; page += 1) {
      model.push(page);
    }

    model.push("ellipsis-right", safeTotalPages);
    return model;
  }

  if (!showRightEllipsis) {
    const rightRangeStart = Math.max(safeTotalPages - (2 + safeSiblingCount * 2), 2);
    const model: PaginationToken[] = [1, "ellipsis-left"];

    for (let page = rightRangeStart; page <= safeTotalPages; page += 1) {
      model.push(page);
    }

    return model;
  }

  const middleRange: PaginationToken[] = [1, "ellipsis-left"];
  for (let page = leftSibling; page <= rightSibling; page += 1) {
    middleRange.push(page);
  }
  middleRange.push("ellipsis-right", safeTotalPages);
  return middleRange;
}

/**
 * Pagination component.
 *
 * Key behavior: switching pages should **not** force the viewport to the top of the page.
 * If `scrollToNavigation` is enabled, we also try to keep the pagination controls visible.
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  loading = false,
  disabled = false,
  className = "",
  ariaLabel = "Pagination",
  scrollToNavigation = true,
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(Math.max(1, currentPage), safeTotalPages);
  const controlGroupRef = useRef<HTMLDivElement | null>(null);

  const tokens = useMemo(
    () => buildPaginationModel({ currentPage: safeCurrentPage, totalPages: safeTotalPages, siblingCount }),
    [safeCurrentPage, safeTotalPages, siblingCount],
  );

  const isInteractive = !loading && !disabled;

  if (safeTotalPages <= 1 && !loading) {
    return null;
  }

  /**
   * Attempt to preserve scroll position after a page change, and optionally keep the pagination
   * controls in view. This guards against parent-level scroll resets triggered by route/query
   * updates or data refreshes.
   */
  const preserveScrollAndMaybeFocusNav = (previousScrollY: number) => {
    if (typeof window === "undefined") return;

    // Restore the user's previous viewport (avoid "jump to top").
    window.scrollTo({ top: previousScrollY });

    // Optionally ensure the pagination controls remain visible (without forcing top/bottom).
    if (scrollToNavigation) {
      controlGroupRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  };

  const handleMove = (nextPage: number) => {
    if (!isInteractive || nextPage === safeCurrentPage || nextPage < 1 || nextPage > safeTotalPages) {
      return;
    }

    const previousScrollY = typeof window === "undefined" ? 0 : window.scrollY;
    onPageChange(nextPage);

    // Defer until after React state updates / parent re-renders complete.
    setTimeout(() => preserveScrollAndMaybeFocusNav(previousScrollY), 0);
  };

  const handleArrowNavigation = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!controlGroupRef.current) return;

    const controls = Array.from(
      controlGroupRef.current.querySelectorAll<HTMLButtonElement>('[data-pagination-control="true"]'),
    );
    const currentIndex = controls.indexOf(event.currentTarget);

    if (currentIndex === -1) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      controls[Math.min(currentIndex + 1, controls.length - 1)]?.focus();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      controls[Math.max(currentIndex - 1, 0)]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      controls[0]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      controls[controls.length - 1]?.focus();
    }
  };

  return (
    <nav
      aria-label={ariaLabel}
      aria-busy={loading}
      aria-disabled={disabled}
      className={["flex w-full justify-center select-none text-sm text-gray-600", className].join(" ").trim()}
    >
      <div
        ref={controlGroupRef}
        className="flex flex-wrap items-center justify-center gap-1 sm:gap-2"
      >
        <PaginationActionButton
          label="Prev"
          ariaLabel="Go to previous page"
          disabled={!isInteractive || safeCurrentPage <= 1}
          onClick={() => handleMove(safeCurrentPage - 1)}
          onKeyDown={handleArrowNavigation}
        >
          <ChevronLeft className="h-4 w-4" />
        </PaginationActionButton>

        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
          {tokens.map((token, index) =>
            typeof token === 'number' ? (
              <PaginationPageButton
                key={`${token}-${index}`}
                page={token}
                active={token === safeCurrentPage}
                disabled={!isInteractive}
                onClick={() => handleMove(token)}
                onKeyDown={handleArrowNavigation}
              />
            ) : (
              <span
                key={`${token}-${index}`}
                aria-hidden="true"
                className="inline-flex h-8 w-6 sm:h-9 sm:w-9 items-center justify-center text-sm font-medium text-gray-400"
              >
                ...
              </span>
            ),
          )}
        </div>

        <PaginationActionButton
          label="Next"
          ariaLabel="Go to next page"
          disabled={!isInteractive || safeCurrentPage >= safeTotalPages}
          onClick={() => handleMove(safeCurrentPage + 1)}
          onKeyDown={handleArrowNavigation}
        >
          <ChevronRight className="h-4 w-4" />
        </PaginationActionButton>

      </div>
    </nav>
  );
}

function PaginationActionButton({
  label,
  ariaLabel,
  disabled,
  onClick,
  onKeyDown,
  children,
  className = "",
}: {
  label: string;
  ariaLabel: string;
  disabled: boolean;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      data-pagination-control="true"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
      whileHover={disabled ? undefined : { y: -2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={`inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 sm:px-3 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:hover:border-gray-200 disabled:hover:bg-gray-50 disabled:hover:text-gray-300 ${className}`.trim()}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </motion.button>
  );
}

function PaginationPageButton({
  page,
  active,
  disabled,
  onClick,
  onKeyDown,
}: {
  page: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <motion.button
      type="button"
      data-pagination-control="true"
      aria-label={`Go to page ${page}`}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
      whileHover={disabled ? undefined : { y: -2 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={`relative inline-flex h-8 min-w-8 sm:h-9 sm:min-w-9 items-center justify-center rounded-lg border px-2 sm:px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
        active
          ? "border-transparent text-white shadow-sm"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
      } disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:hover:border-gray-200 disabled:hover:bg-gray-50 disabled:hover:text-gray-300`}
    >
      {active ? (
        <motion.span
          layoutId="pagination-editorial-active"
          className="absolute -inset-px rounded-lg bg-primary-600"
          transition={{ duration: 0.22, ease: "easeOut" }}
        />
      ) : null}
      <span className="relative z-10">{page}</span>
    </motion.button>
  );
}
