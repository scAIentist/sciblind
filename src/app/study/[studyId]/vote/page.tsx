'use client';

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

interface ItemData {
  id: string;
  imageUrl?: string;
  imageKey?: string;
  text?: string;
}

interface CategoryProgress {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  itemCount: number;
  completed: number;
  target: number;
  percentage: number;
  isComplete: boolean;
}

interface PairData {
  itemA: ItemData;
  itemB: ItemData;
  leftItemId: string;
  rightItemId: string;
  categoryId?: string;
  progress: {
    completed: number;
    target: number;
    percentage: number;
  };
}

// Translations
const translations = {
  sl: {
    selectImage: 'Izberite sliko, ki vam je bolj všeč.',
    loading: 'Nalaganje...',
    categoryComplete: 'Kategorija zaključena!',
    allComplete: 'Hvala za sodelovanje!',
    selectCategory: 'Izberite kategorijo',
    of: 'od',
    comparisons: 'primerjav',
    tapToSelect: 'Tapnite sliko za izbiro',
    keyboardHint: 'Tipki A/L ali puščici',
    error: 'Prišlo je do napake. Poskusite znova.',
    backToCategories: '← Kategorije',
    finishStudy: 'Zaključi',
    thankYou: 'Hvala!',
    resultsHidden: 'Rezultati bodo objavljeni po zaključku študije.',
    tryAgain: 'Poskusi znova',
  },
  en: {
    selectImage: 'Select the image you prefer.',
    loading: 'Loading...',
    categoryComplete: 'Category complete!',
    allComplete: 'Thank you for participating!',
    selectCategory: 'Select a category',
    of: 'of',
    comparisons: 'comparisons',
    tapToSelect: 'Tap an image to select',
    keyboardHint: 'Keys A/L or arrows',
    error: 'An error occurred. Please try again.',
    backToCategories: '← Categories',
    finishStudy: 'Finish',
    thankYou: 'Thank you!',
    resultsHidden: 'Results will be published after the study ends.',
    tryAgain: 'Try again',
  },
};

// Supabase storage base URL with image transformation
// Using render/image endpoint for on-the-fly resizing
const SUPABASE_STORAGE_URL = 'https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images';
const SUPABASE_RENDER_URL = 'https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/render/image/public/izvrs-images';

function VotingPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studyId = params.studyId as string;
  const token = searchParams.get('token');

  // State
  const [study, setStudy] = useState<any>(null);
  const [pair, setPair] = useState<PairData | null>(null);
  const [nextPair, setNextPair] = useState<PairData | null>(null); // Prefetched next pair
  const [categories, setCategories] = useState<CategoryProgress[]>([]);
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewState, setViewState] = useState<'loading' | 'categories' | 'voting' | 'complete'>('loading');
  const [isHydrated, setIsHydrated] = useState(false);

  // Mark as hydrated on mount
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Refs
  const startTimeRef = useRef<number>(Date.now());
  const abortControllerRef = useRef<AbortController | null>(null);
  const voteInProgressRef = useRef(false);

  // Memoized translations
  const lang = (study?.language || 'sl') as keyof typeof translations;
  const t = useMemo(() => translations[lang] || translations.sl, [lang]);

  // Detect if mobile for responsive image sizing
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Optimized image URL builder with Supabase image transformation
  const getImageUrl = useCallback((item: ItemData): string => {
    // Use smaller images on mobile for faster loading
    const width = isMobile ? 400 : 800;
    if (item.imageKey) {
      const parts = item.imageKey.split('/');
      if (parts[0] === 'izvrs' && parts.length === 3) {
        // Use Supabase's image transformation API for optimized loading
        // Resize to specified width, auto height, good quality
        return `${SUPABASE_RENDER_URL}/${parts[1]}/${parts[2]}?width=${width}&quality=80`;
      }
    }
    if (item.imageUrl) return item.imageUrl;
    return '/placeholder.png';
  }, [isMobile]);

  // Fetch study on mount - wait for hydration to check token
  useEffect(() => {
    // Don't do anything until hydrated (token might be null during SSR)
    if (!isHydrated) return;

    if (!token) {
      router.replace(`/study/${studyId}`);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function init() {
      try {
        // Fetch study info
        const studyRes = await fetch(`/api/studies/${studyId}`, { signal: controller.signal });
        if (!studyRes.ok) throw new Error('Study not found');
        const studyData = await studyRes.json();
        setStudy(studyData);

        // Fetch first pair
        await fetchNextPair(undefined, controller.signal);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(t.error);
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      controller.abort();
    };
  }, [studyId, token, isHydrated]);

  // Keyboard shortcuts
  useEffect(() => {
    if (viewState !== 'voting' || !pair || isVoting) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (voteInProgressRef.current) return;

      const key = e.key.toLowerCase();
      if (key === 'a' || key === 'arrowleft') {
        e.preventDefault();
        handleVote(pair!.leftItemId);
      } else if (key === 'l' || key === 'arrowright') {
        e.preventDefault();
        handleVote(pair!.rightItemId);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewState, pair, isVoting]);

  // Prefetch next pair after current pair loads
  useEffect(() => {
    if (pair && viewState === 'voting' && currentCategoryId) {
      prefetchNextPair(currentCategoryId);
    }
  }, [pair, currentCategoryId, viewState]);

  async function fetchNextPair(categoryId?: string, signal?: AbortSignal) {
    try {
      const url = new URL(`/api/participate/${studyId}/next-pair`, window.location.origin);
      url.searchParams.set('token', token!);
      if (categoryId) url.searchParams.set('categoryId', categoryId);

      const res = await fetch(url.toString(), { signal });
      const data = await res.json();

      if (!res.ok) {
        if (data.errorKey === 'INVALID_SESSION') {
          localStorage.removeItem(`sciblind-session-${studyId}`);
          router.replace(`/study/${studyId}`);
          return;
        }
        throw new Error(data.error);
      }

      // Handle different response types
      if (data.requiresCategorySelection) {
        setCategories(data.categories);
        setViewState('categories');
        setIsLoading(false);
        return;
      }

      if (data.complete || data.allCategoriesComplete) {
        setViewState('complete');
        setIsLoading(false);
        return;
      }

      if (data.categoryComplete) {
        // Refresh categories and show selection
        const catRes = await fetch(`/api/participate/${studyId}/next-pair?token=${token}`, { signal });
        const catData = await catRes.json();
        if (catData.requiresCategorySelection) {
          setCategories(catData.categories);
        }
        setViewState('categories');
        setIsLoading(false);
        return;
      }

      // Got a pair - set it and start timer
      setPair(data);
      setCurrentCategoryId(data.categoryId);
      startTimeRef.current = Date.now();
      setViewState('voting');
      setIsLoading(false);

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || t.error);
        setIsLoading(false);
      }
    }
  }

  async function prefetchNextPair(categoryId: string) {
    try {
      const url = new URL(`/api/participate/${studyId}/next-pair`, window.location.origin);
      url.searchParams.set('token', token!);
      url.searchParams.set('categoryId', categoryId);
      url.searchParams.set('prefetch', 'true');

      const res = await fetch(url.toString());
      const data = await res.json();

      if (res.ok && data.itemA && data.itemB) {
        setNextPair(data);
        // Preload images
        preloadImage(getImageUrl(data.itemA));
        preloadImage(getImageUrl(data.itemB));
      }
    } catch {
      // Silent fail for prefetch
    }
  }

  function preloadImage(src: string) {
    const img = new window.Image();
    img.src = src;
  }

  const handleVote = useCallback(async (winnerId: string) => {
    if (!pair || isVoting || voteInProgressRef.current) return;

    voteInProgressRef.current = true;
    setIsVoting(true);
    const responseTimeMs = Date.now() - startTimeRef.current;

    try {
      const res = await fetch(`/api/participate/${studyId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken: token,
          itemAId: pair.itemA.id,
          itemBId: pair.itemB.id,
          winnerId,
          leftItemId: pair.leftItemId,
          rightItemId: pair.rightItemId,
          categoryId: currentCategoryId,
          responseTimeMs,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      // Use prefetched pair if available, otherwise fetch new one
      if (nextPair && nextPair.categoryId === currentCategoryId) {
        setPair(nextPair);
        setNextPair(null);
        startTimeRef.current = Date.now();
        setIsVoting(false);
        voteInProgressRef.current = false;
      } else {
        await fetchNextPair(currentCategoryId || undefined);
        setIsVoting(false);
        voteInProgressRef.current = false;
      }

    } catch (err: any) {
      setError(err.message || t.error);
      setIsVoting(false);
      voteInProgressRef.current = false;
    }
  }, [pair, isVoting, token, studyId, currentCategoryId, nextPair, t.error]);

  function selectCategory(categoryId: string) {
    setCurrentCategoryId(categoryId);
    setIsLoading(true);
    fetchNextPair(categoryId);
  }

  function retryAfterError() {
    setError(null);
    setIsLoading(true);
    fetchNextPair(currentCategoryId || undefined);
  }

  // Get left and right items
  const leftItem = pair ? (pair.leftItemId === pair.itemA.id ? pair.itemA : pair.itemB) : null;
  const rightItem = pair ? (pair.rightItemId === pair.itemA.id ? pair.itemA : pair.itemB) : null;

  // ========== RENDER ==========

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500 text-sm">{t.loading}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-slate-700 dark:text-slate-300 mb-4">{error}</p>
          <button
            onClick={retryAfterError}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium active:scale-95 transition-transform"
          >
            {t.tryAgain}
          </button>
        </div>
      </div>
    );
  }

  // Complete state
  if (viewState === 'complete') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-6">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{t.thankYou}</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{t.allComplete}</p>
          <p className="text-sm text-slate-500">{t.resultsHidden}</p>
        </div>
      </div>
    );
  }

  // Category selection
  if (viewState === 'categories') {
    const allCategoriesComplete = categories.every(c => c.isComplete);

    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4 safe-area-inset">
        <div className="max-w-lg mx-auto pt-4">
          <h1 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-6">
            {allCategoriesComplete ? t.categoryComplete : t.selectCategory}
          </h1>

          <div className="space-y-3">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => !cat.isComplete && selectCategory(cat.id)}
                disabled={cat.isComplete}
                className={`w-full p-4 rounded-xl text-left transition-all active:scale-[0.98] ${
                  cat.isComplete
                    ? 'bg-slate-100 dark:bg-slate-800/50 opacity-60'
                    : 'bg-white dark:bg-slate-800 shadow-sm hover:shadow-md active:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{cat.name}</h3>
                  {cat.isComplete && (
                    <span className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{cat.completed} {t.of} {cat.target}</span>
                    <span>{cat.percentage}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {allCategoriesComplete && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setViewState('complete')}
                className="px-8 py-3 bg-green-600 text-white rounded-xl font-semibold active:scale-95 transition-transform shadow-lg shadow-green-600/25"
              >
                {t.finishStudy}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Voting interface - optimized for mobile
  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-100 dark:bg-slate-950 safe-area-inset">
      {/* Compact header */}
      <header className="flex-none px-4 py-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <button
            onClick={() => setViewState('categories')}
            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-1"
          >
            {t.backToCategories}
          </button>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {pair?.progress.completed}/{pair?.progress.target}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-slate-200 dark:bg-slate-800 rounded-full mt-2 max-w-2xl mx-auto overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{ width: `${pair?.progress.percentage || 0}%` }}
          />
        </div>
      </header>

      {/* Prompt - compact on mobile */}
      <div className="flex-none text-center py-3 px-4">
        <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white leading-tight">
          {study?.participantPrompt || t.selectImage}
        </h1>
        <p className="text-xs text-slate-400 mt-1 hidden sm:block">{t.keyboardHint}</p>
      </div>

      {/* Main voting area - fills remaining space */}
      <main className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        {pair && leftItem && rightItem && (
          <div className="w-full max-w-5xl grid grid-cols-2 gap-2 sm:gap-4">
            {/* Left image */}
            <button
              onClick={() => handleVote(pair.leftItemId)}
              disabled={isVoting}
              className={`relative aspect-[3/4] bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl overflow-hidden shadow-sm transition-all duration-150
                ${isVoting ? 'opacity-50 scale-[0.98]' : 'active:scale-[0.97] hover:shadow-lg'}
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getImageUrl(leftItem)}
                alt="Option A"
                className="absolute inset-0 w-full h-full object-contain p-1 sm:p-2"
              />
              {/* Touch feedback overlay */}
              <div className="absolute inset-0 bg-blue-600/0 active:bg-blue-600/10 transition-colors pointer-events-none" />
              {/* Label - visible on larger screens */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 text-white text-xs rounded-full opacity-0 sm:opacity-60 pointer-events-none">
                A
              </div>
            </button>

            {/* Right image */}
            <button
              onClick={() => handleVote(pair.rightItemId)}
              disabled={isVoting}
              className={`relative aspect-[3/4] bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl overflow-hidden shadow-sm transition-all duration-150
                ${isVoting ? 'opacity-50 scale-[0.98]' : 'active:scale-[0.97] hover:shadow-lg'}
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getImageUrl(rightItem)}
                alt="Option B"
                className="absolute inset-0 w-full h-full object-contain p-1 sm:p-2"
              />
              {/* Touch feedback overlay */}
              <div className="absolute inset-0 bg-blue-600/0 active:bg-blue-600/10 transition-colors pointer-events-none" />
              {/* Label */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 text-white text-xs rounded-full opacity-0 sm:opacity-60 pointer-events-none">
                L
              </div>
            </button>
          </div>
        )}
      </main>

      {/* Mobile tap hint */}
      <div className="flex-none text-center pb-3 sm:hidden">
        <p className="text-xs text-slate-400">{t.tapToSelect}</p>
      </div>
    </div>
  );
}

// Wrap with Suspense for useSearchParams
export default function VotingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500 text-sm">Nalaganje...</p>
        </div>
      </div>
    }>
      <VotingPageContent />
    </Suspense>
  );
}
