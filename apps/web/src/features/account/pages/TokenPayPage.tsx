import React, { useState, useEffect } from 'react';
import { TokenPayPageContent } from '../components/TokenPayPageContent';
import { useSearchParams } from 'react-router-dom';

export function TokenPayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = Number(searchParams.get('page')) || 1;
  const [currentPage, setCurrentPage] = useState(initialPage);

  // Sync page to URL
  useEffect(() => {
    if (currentPage > 1) {
      setSearchParams((prev) => {
        prev.set('page', currentPage.toString());
        return prev;
      }, { replace: true });
    } else {
      setSearchParams((prev) => {
        prev.delete('page');
        return prev;
      }, { replace: true });
    }
  }, [currentPage, setSearchParams]);

  // Sync URL to page (for back/forward navigation)
  useEffect(() => {
    const pageFromUrl = Number(searchParams.get('page')) || 1;
    if (pageFromUrl !== currentPage) {
      setCurrentPage(pageFromUrl);
    }
  }, [searchParams, currentPage]);

  return (
    <TokenPayPageContent 
      currentPage={currentPage}
      onPageChange={setCurrentPage}
    />
  );
}
