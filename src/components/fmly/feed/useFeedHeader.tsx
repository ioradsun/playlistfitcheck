import { useCallback, useRef, useState } from "react";
import type { FeedState } from "@/components/fmly/useFeedPosts";

interface UseFeedHeaderParams {
  reelsMode: boolean;
  feed: FeedState;
}

export function useFeedHeader({ reelsMode, feed }: UseFeedHeaderParams) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const hasSearchQuery = feed.searchTerm.trim().length > 0;
  const searchUiVisible = reelsMode
    ? searchOpen || searchFocused || hasSearchQuery
    : searchFocused || hasSearchQuery;

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    focusSearchInput();
  }, [focusSearchInput]);

  const clearSearch = useCallback(() => {
    feed.setSearchTerm("");
    setSearchFocused(false);
    if (reelsMode) setSearchOpen(false);
    window.requestAnimationFrame(() => searchInputRef.current?.blur());
  }, [feed, reelsMode]);

  return {
    plusOpen,
    setPlusOpen,
    searchFocused,
    setSearchFocused,
    searchOpen,
    setSearchOpen,
    searchInputRef,
    hasSearchQuery,
    searchUiVisible,
    openSearch,
    clearSearch,
  };
}
