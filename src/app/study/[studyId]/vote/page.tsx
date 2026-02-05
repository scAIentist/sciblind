'use client';

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ThumbsUp, Check, ChevronRight } from 'lucide-react';

// ========== Types ==========

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

interface UIConfig {
  themeColor: string;
  logoPosition: 'top-center' | 'top-left' | 'hidden';
  progressStyle: 'dots' | 'bar' | 'hidden';
  showCounts: boolean;
  voteAnimation: 'thumbs-up' | 'checkmark' | 'border-only' | 'none';
  categoryStyle: 'gallery' | 'list' | 'cards';
}

// ========== Translations ==========

const translations = {
  sl: {
    selectImage: 'Izberite sliko, ki se vam zdi bolj primerna.',
    loading: 'Nalaganje...',
    categoryComplete: 'Kategorija zaključena!',
    allComplete: 'Hvala za sodelovanje!',
    selectCategory: 'Izberite kategorijo',
    of: 'od',
    comparisons: 'primerjave',
    tapToSelect: 'Za izbor pritisnite na željeno sliko',
    keyboardHint: 'Tipki A/B ali puščici ←/→',
    error: 'Prišlo je do napake. Poskusite znova.',
    backToCategories: '← Kategorije',
    finishStudy: 'Zaključi',
    thankYou: 'Hvala!',
    resultsHidden: 'Rezultati bodo objavljeni po zaključku študije.',
    tryAgain: 'Poskusi znova',
    thresholdSufficient: 'Rezultati so dovolj zanesljivi. Lahko nadaljujete za boljšo natančnost ali preidete na naslednjo kategorijo.',
    thresholdInsufficient: 'Vaše primerjave so zelo pomembne za zanesljivost rezultatov. Nadaljujte za boljšo natančnost.',
    continueVoting: 'Nadaljuj primerjanje',
    nextCategory: 'Naslednja kategorija',
    // New checkpoint + UI translations
    checkpoint25: 'Odlično! Četrtina opravljenih.',
    checkpoint50: 'Polovica! Vaši odgovori so zelo dragoceni.',
    checkpoint75: 'Skoraj! Še nekaj primerjav.',
    checkpoint100: 'Kategorija zaključena! Rezultati so zanesljivi.',
    chooseCategory: 'Izberite kategorijo',
    start: 'Začni',
    completed: 'Zaključeno',
    yourProgress: 'Vaš napredek',
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
    keyboardHint: 'Keys A/B or arrows ←/→',
    error: 'An error occurred. Please try again.',
    backToCategories: '← Categories',
    finishStudy: 'Finish',
    thankYou: 'Thank you!',
    resultsHidden: 'Results will be published after the study ends.',
    tryAgain: 'Try again',
    thresholdSufficient: 'Results are sufficiently reliable. You may continue for improved accuracy or proceed to the next category.',
    thresholdInsufficient: 'Your comparisons are valuable for result reliability. Continue for improved accuracy.',
    continueVoting: 'Continue comparing',
    nextCategory: 'Next category',
    // New checkpoint + UI translations
    checkpoint25: 'Great! Quarter done.',
    checkpoint50: 'Halfway! Your responses are very valuable.',
    checkpoint75: 'Almost there! Just a few more.',
    checkpoint100: 'Category complete! Results are reliable.',
    chooseCategory: 'Choose a category',
    start: 'Start',
    completed: 'Completed',
    yourProgress: 'Your progress',
  },
};

// ========== Constants ==========

const SUPABASE_STORAGE_URL = 'https://rdsozrebfjjoknqonvbk.supabase.co/storage/v1/object/public/izvrs-images';
const VOTE_ANIMATION_DURATION = 500; // ms before transitioning to next pair
const CHECKPOINT_PERCENTAGES = [25, 50, 75, 100];

// Default UI config (IzVRS-style)
const DEFAULT_UI_CONFIG: UIConfig = {
  themeColor: '#2563EB',
  logoPosition: 'top-center',
  progressStyle: 'dots',
  showCounts: false,
  voteAnimation: 'thumbs-up',
  categoryStyle: 'gallery',
};

// ========== Progress Dots Component ==========

function ProgressDots({
  completed,
  target,
  themeColor,
}: {
  completed: number;
  target: number;
  themeColor: string;
}) {
  // For large targets, use a segmented bar with milestone markers
  if (target > 20) {
    const percentage = Math.min(100, Math.round((completed / target) * 100));
    return (
      <div className="w-full max-w-xs mx-auto px-4">
        {/* Milestone markers */}
        <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-visible">
          {/* Fill bar */}
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentage}%`, backgroundColor: themeColor }}
          />
          {/* Milestone dots at 25%, 50%, 75%, 100% */}
          {[25, 50, 75, 100].map((milestone) => (
            <div
              key={milestone}
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                percentage >= milestone
                  ? 'border-white scale-110'
                  : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800'
              }`}
              style={{
                left: `${milestone}%`,
                transform: `translateX(-50%) translateY(-50%)`,
                backgroundColor: percentage >= milestone ? themeColor : undefined,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // For small targets (<=20), show individual dots
  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-xs mx-auto px-4">
      {Array.from({ length: target }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            i < completed ? '' : 'bg-slate-300 dark:bg-slate-600'
          } ${i === completed ? 'animate-dot-pulse' : ''}`}
          style={{
            backgroundColor: i < completed ? themeColor : undefined,
          }}
        />
      ))}
    </div>
  );
}

// ========== Checkpoint Toast Component ==========

function CheckpointToast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-slide-up-toast">
      <div className="bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 px-6 py-3 rounded-full text-sm font-medium shadow-xl backdrop-blur-sm whitespace-nowrap">
        {message}
      </div>
    </div>
  );
}

// ========== Confetti Component ==========

function ConfettiCelebration({ themeColor }: { themeColor: string }) {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 2}s`,
      duration: `${2 + Math.random() * 2}s`,
      size: `${4 + Math.random() * 8}px`,
      opacity: 0.3 + Math.random() * 0.7,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-40">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            top: '-20px',
            width: p.size,
            height: p.size,
            backgroundColor: themeColor,
            opacity: p.opacity,
            animation: `confetti-fall ${p.duration} ${p.delay} ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ========== Category Thumbnail Grid Component ==========

function ThumbnailGrid({
  imageKeys,
  isComplete,
}: {
  imageKeys: string[];
  isComplete: boolean;
}) {
  return (
    <div className={`grid grid-cols-3 gap-1 rounded-lg overflow-hidden ${isComplete ? 'opacity-50 grayscale' : ''}`}>
      {imageKeys.slice(0, 6).map((key, i) => {
        const parts = key.split('/');
        const url =
          parts[0] === 'izvrs' && parts.length === 3
            ? `${SUPABASE_STORAGE_URL}/${parts[1]}/${parts[2]}`
            : key;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            loading="lazy"
            className="w-full aspect-square object-cover"
          />
        );
      })}
      {/* Fill remaining slots with placeholder */}
      {imageKeys.length < 6 &&
        Array.from({ length: 6 - imageKeys.length }).map((_, i) => (
          <div key={`placeholder-${i}`} className="w-full aspect-square bg-slate-700" />
        ))}
    </div>
  );
}

// ========== Main Voting Page Content ==========

function VotingPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studyId = params.studyId as string;
  const token = searchParams.get('token');

  // State
  const [study, setStudy] = useState<any>(null);
  const [pair, setPair] = useState<PairData | null>(null);
  const [categories, setCategories] = useState<CategoryProgress[]>([]);
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewState, setViewState] = useState<'loading' | 'categories' | 'voting' | 'categoryDone' | 'complete'>('loading');
  const [categoryDoneInfo, setCategoryDoneInfo] = useState<{
    categoryId: string;
    thresholdMet: boolean;
    allowContinuedVoting: boolean;
  } | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // New animation/UI state
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);
  const [showVoteAnimation, setShowVoteAnimation] = useState(false);
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(null);
  const [categoryThumbnails, setCategoryThumbnails] = useState<Record<string, string[]>>({});
  const [lastCheckpoint, setLastCheckpoint] = useState<number>(0);

  // Mark as hydrated on mount
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Refs
  const startTimeRef = useRef<number>(Date.now());
  const abortControllerRef = useRef<AbortController | null>(null);
  const voteInProgressRef = useRef(false);
  const prefetchedPairRef = useRef<PairData | null>(null);
  const prefetchingRef = useRef(false);

  // UI config derived from study
  const uiConfig = useMemo<UIConfig>(() => {
    if (!study) return DEFAULT_UI_CONFIG;
    return {
      themeColor: study.uiThemeColor || DEFAULT_UI_CONFIG.themeColor,
      logoPosition: (study.uiLogoPosition || DEFAULT_UI_CONFIG.logoPosition) as UIConfig['logoPosition'],
      progressStyle: (study.uiProgressStyle || DEFAULT_UI_CONFIG.progressStyle) as UIConfig['progressStyle'],
      showCounts: study.uiShowCounts ?? DEFAULT_UI_CONFIG.showCounts,
      voteAnimation: (study.uiVoteAnimation || DEFAULT_UI_CONFIG.voteAnimation) as UIConfig['voteAnimation'],
      categoryStyle: (study.uiCategoryStyle || DEFAULT_UI_CONFIG.categoryStyle) as UIConfig['categoryStyle'],
    };
  }, [study]);

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

  // Image URL builder
  const getImageUrl = useCallback((item: ItemData): string => {
    if (item.imageKey) {
      const parts = item.imageKey.split('/');
      if (parts[0] === 'izvrs' && parts.length === 3) {
        return `${SUPABASE_STORAGE_URL}/${parts[1]}/${parts[2]}`;
      }
    }
    if (item.imageUrl) return item.imageUrl;
    return '/placeholder.webp';
  }, []);

  // Preload images — returns a promise that resolves when both are loaded (or after timeout)
  const preloadImage = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Don't block on error
      img.src = url;
      // Don't wait forever — resolve after 3s max
      setTimeout(resolve, 3000);
    });
  }, []);

  const preloadPairImages = useCallback((pairData: PairData): Promise<void> => {
    return Promise.all([
      preloadImage(getImageUrl(pairData.itemA)),
      preloadImage(getImageUrl(pairData.itemB)),
    ]).then(() => {});
  }, [getImageUrl, preloadImage]);

  // Fetch category thumbnails
  const fetchThumbnails = useCallback(async () => {
    try {
      const res = await fetch(`/api/participate/${studyId}/category-thumbnails`);
      if (res.ok) {
        const data = await res.json();
        setCategoryThumbnails(data.categories || {});
      }
    } catch {
      // Non-critical, thumbnails are just for UI
    }
  }, [studyId]);

  // Check for checkpoint messages
  const checkForCheckpoint = useCallback((completed: number, target: number) => {
    if (target <= 0) return;
    const pct = Math.round((completed / target) * 100);

    for (const cp of CHECKPOINT_PERCENTAGES) {
      if (pct >= cp && lastCheckpoint < cp) {
        const key = `checkpoint${cp}` as keyof typeof translations.sl;
        setCheckpointMessage(t[key] || '');
        setLastCheckpoint(cp);

        // Auto-dismiss after animation completes (3s)
        setTimeout(() => setCheckpointMessage(null), 3200);
        break;
      }
    }
  }, [lastCheckpoint, t]);

  // Fetch study on mount
  useEffect(() => {
    if (!isHydrated) return;

    if (!token) {
      router.replace(`/study/${studyId}`);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    async function init() {
      try {
        const studyRes = await fetch(`/api/studies/${studyId}`, { signal: controller.signal });
        if (!studyRes.ok) throw new Error('Study not found');
        const studyData = await studyRes.json();
        setStudy(studyData);
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

  // Fetch thumbnails when entering category selection
  useEffect(() => {
    if (viewState === 'categories' && Object.keys(categoryThumbnails).length === 0) {
      fetchThumbnails();
    }
  }, [viewState, categoryThumbnails, fetchThumbnails]);

  // Keyboard shortcuts
  useEffect(() => {
    if (viewState !== 'voting' || !pair || isVoting || showVoteAnimation) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (voteInProgressRef.current) return;

      const key = e.key.toLowerCase();
      if (key === 'a' || key === 'arrowleft') {
        e.preventDefault();
        handleVote(pair!.leftItemId);
      } else if (key === 'b' || key === 'arrowright') {
        e.preventDefault();
        handleVote(pair!.rightItemId);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewState, pair, isVoting, showVoteAnimation]);

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
        if (data.allowContinuedVoting) {
          setCategoryDoneInfo({
            categoryId: data.categoryId,
            thresholdMet: data.thresholdMet || false,
            allowContinuedVoting: true,
          });
          setViewState('categoryDone');
          setIsLoading(false);
          return;
        }

        const catRes = await fetch(`/api/participate/${studyId}/next-pair?token=${token}`, { signal });
        const catData = await catRes.json();
        if (catData.requiresCategorySelection) {
          setCategories(catData.categories);
        }
        setViewState('categories');
        setIsLoading(false);
        return;
      }

      // Preload images immediately
      preloadPairImages(data);
      setPair(data);
      setCurrentCategoryId(data.categoryId);
      startTimeRef.current = Date.now();
      setViewState('voting');
      setIsLoading(false);

      // Check for checkpoints
      checkForCheckpoint(data.progress.completed, data.progress.target);

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || t.error);
        setIsLoading(false);
      }
    }
  }

  const handleVote = useCallback(async (winnerId: string) => {
    if (!pair || isVoting || voteInProgressRef.current || showVoteAnimation) return;

    voteInProgressRef.current = true;
    setSelectedWinnerId(winnerId);
    setShowVoteAnimation(true);
    setIsVoting(true);
    const responseTimeMs = Date.now() - startTimeRef.current;

    // Pipeline: animation + vote + prefetch all overlap
    // 1. Start animation timer
    const animationDone = new Promise(resolve => setTimeout(resolve, VOTE_ANIMATION_DURATION));

    // 2. Fire vote submission immediately (runs during animation)
    const votePromise = fetch(`/api/participate/${studyId}/vote`, {
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

    try {
      // 3. As soon as vote succeeds, fire next-pair fetch (still during animation)
      const voteRes = await votePromise;
      if (!voteRes.ok) {
        const data = await voteRes.json();
        throw new Error(data.error);
      }

      // 4. Start fetching next pair immediately (don't wait for animation)
      const nextPairUrl = new URL(`/api/participate/${studyId}/next-pair`, window.location.origin);
      nextPairUrl.searchParams.set('token', token!);
      if (currentCategoryId) nextPairUrl.searchParams.set('categoryId', currentCategoryId);
      const nextPairPromise = fetch(nextPairUrl.toString()).then(r => r.json());

      // 5. Wait for BOTH animation and next-pair data
      const [, nextData] = await Promise.all([animationDone, nextPairPromise]);

      // Reset animation
      setSelectedWinnerId(null);
      setShowVoteAnimation(false);

      // Process the prefetched next-pair response
      if (nextData.error) {
        if (nextData.errorKey === 'INVALID_SESSION') {
          localStorage.removeItem(`sciblind-session-${studyId}`);
          router.replace(`/study/${studyId}`);
          return;
        }
        throw new Error(nextData.error);
      }

      if (nextData.requiresCategorySelection) {
        setCategories(nextData.categories);
        setViewState('categories');
        return;
      }

      if (nextData.complete || nextData.allCategoriesComplete) {
        setViewState('complete');
        return;
      }

      if (nextData.categoryComplete) {
        if (nextData.allowContinuedVoting) {
          setCategoryDoneInfo({
            categoryId: nextData.categoryId,
            thresholdMet: nextData.thresholdMet || false,
            allowContinuedVoting: true,
          });
          setViewState('categoryDone');
          return;
        }
        // Need to re-fetch for category selection
        const catRes = await fetch(`/api/participate/${studyId}/next-pair?token=${token}`);
        const catData = await catRes.json();
        if (catData.requiresCategorySelection) {
          setCategories(catData.categories);
        }
        setViewState('categories');
        return;
      }

      // 6. Preload images for the next pair (should be near-instant if cached)
      await preloadPairImages(nextData);

      // 7. Swap to next pair — images are already in browser cache, so instant
      setPair(nextData);
      setCurrentCategoryId(nextData.categoryId);
      startTimeRef.current = Date.now();
      setViewState('voting');

      // Check for checkpoints
      checkForCheckpoint(nextData.progress.completed, nextData.progress.target);

    } catch (err: any) {
      setSelectedWinnerId(null);
      setShowVoteAnimation(false);
      if (err.name !== 'AbortError') {
        setError(err.message || t.error);
      }
    } finally {
      setIsVoting(false);
      voteInProgressRef.current = false;
    }
  }, [pair, isVoting, showVoteAnimation, token, studyId, currentCategoryId, t.error, router, preloadPairImages, checkForCheckpoint]);

  function selectCategory(categoryId: string) {
    setCurrentCategoryId(categoryId);
    setLastCheckpoint(0); // Reset checkpoints for new category
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

  // Get study logos — use Izvrstna logo as primary display logo
  const displayLogoUrl = useMemo(() => {
    if (!study?.logoUrls?.length) return null;
    // Prefer Izvrstna logo if available
    const izvrstna = study.logoUrls.find((l: string) => l.toLowerCase().includes('izvrstna'));
    return `/logos/${izvrstna || study.logoUrls[0]}`;
  }, [study]);

  // ========== RENDER ==========

  // Logo component (reused across views)
  const LogoHeader = useMemo(() => {
    if (uiConfig.logoPosition === 'hidden' || !displayLogoUrl) return null;
    return (
      <div className={`flex-none pt-4 pb-2 ${uiConfig.logoPosition === 'top-center' ? 'text-center' : 'text-left px-4'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayLogoUrl}
          alt="Logo"
          className="h-12 sm:h-14 w-auto object-contain inline-block"
        />
      </div>
    );
  }, [uiConfig.logoPosition, displayLogoUrl]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-50">
        <div className="text-center">
          {displayLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayLogoUrl} alt="Logo" className="h-14 w-auto object-contain mx-auto mb-6 animate-pulse" />
          )}
          <div
            className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin mx-auto"
            style={{ borderColor: uiConfig.themeColor, borderTopColor: 'transparent' }}
          />
          <p className="mt-4 text-slate-400 text-sm">{t.loading}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-slate-600 mb-4">{error}</p>
          <button
            onClick={retryAfterError}
            className="px-6 py-2.5 text-white rounded-full font-medium active:scale-95 transition-transform"
            style={{ backgroundColor: uiConfig.themeColor }}
          >
            {t.tryAgain}
          </button>
        </div>
      </div>
    );
  }

  // ========== COMPLETE STATE ==========
  if (viewState === 'complete') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-900 p-6 relative overflow-hidden">
        <ConfettiCelebration themeColor={uiConfig.themeColor} />
        <div className="text-center max-w-sm relative z-10 animate-fade-in">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 animate-check-scale-in"
            style={{ backgroundColor: `${uiConfig.themeColor}20` }}
          >
            <Check className="w-10 h-10" style={{ color: uiConfig.themeColor }} strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">{t.thankYou}</h1>
          <p className="text-slate-400 mb-8">{t.allComplete}</p>
          <p className="text-sm text-slate-500 mb-8">{t.resultsHidden}</p>
          {displayLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayLogoUrl} alt="Logo" className="h-10 w-auto object-contain mx-auto opacity-50" />
          )}
        </div>
      </div>
    );
  }

  // ========== CATEGORY SELECTION ==========
  if (viewState === 'categories') {
    const allCategoriesComplete = categories.every(c => c.isComplete);
    const useGallery = uiConfig.categoryStyle === 'gallery';

    return (
      <div className="min-h-[100dvh] bg-slate-900 p-4 pb-8 safe-area-inset">
        <div className="max-w-lg mx-auto">
          {/* Logo */}
          {displayLogoUrl && (
            <div className="pt-4 pb-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={displayLogoUrl} alt="Logo" className="h-12 sm:h-14 w-auto object-contain inline-block opacity-90" />
            </div>
          )}

          {/* Title */}
          <div className="text-center mt-4 mb-6">
            <h1 className="text-lg font-semibold text-white uppercase tracking-wider">
              {allCategoriesComplete ? t.categoryComplete : t.chooseCategory}
            </h1>
            <div className="w-12 h-0.5 mx-auto mt-2 rounded-full" style={{ backgroundColor: uiConfig.themeColor }} />
          </div>

          {/* Category Cards */}
          <div className="space-y-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`rounded-xl overflow-hidden transition-all ${
                  cat.isComplete ? 'opacity-60' : 'shadow-lg shadow-black/20'
                }`}
              >
                {/* Thumbnail Grid (gallery mode) */}
                {useGallery && categoryThumbnails[cat.id]?.length > 0 && (
                  <ThumbnailGrid
                    imageKeys={categoryThumbnails[cat.id]}
                    isComplete={cat.isComplete}
                  />
                )}

                {/* Card Body */}
                <div className="bg-slate-800 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-white text-base">{cat.name}</h3>
                    {cat.isComplete && (
                      <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                        <Check className="w-4 h-4" />
                        {t.completed}
                      </span>
                    )}
                  </div>

                  {/* Mini progress */}
                  {!cat.isComplete && cat.completed > 0 && (
                    <div className="mb-3">
                      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${cat.percentage}%`, backgroundColor: uiConfig.themeColor }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Start button */}
                  {!cat.isComplete && (
                    <button
                      onClick={() => selectCategory(cat.id)}
                      className="w-full mt-1 py-2.5 text-white rounded-lg font-semibold text-sm uppercase tracking-wide active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      style={{ backgroundColor: uiConfig.themeColor }}
                    >
                      {cat.completed > 0 ? t.continueVoting : t.start}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Finish button when all complete */}
          {allCategoriesComplete && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setViewState('complete')}
                className="px-10 py-3.5 bg-green-500 text-white rounded-full font-semibold text-lg active:scale-95 transition-transform shadow-lg shadow-green-500/25"
              >
                {t.finishStudy}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== CATEGORY DONE ==========
  if (viewState === 'categoryDone' && categoryDoneInfo) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-900 p-6">
        <div className="text-center max-w-sm animate-fade-in">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 animate-check-scale-in"
            style={{ backgroundColor: `${uiConfig.themeColor}20` }}
          >
            <Check className="w-10 h-10" style={{ color: uiConfig.themeColor }} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">
            {t.categoryComplete}
          </h2>
          <p className="text-sm text-slate-400 mb-8 leading-relaxed">
            {categoryDoneInfo.thresholdMet ? t.thresholdSufficient : t.thresholdInsufficient}
          </p>
          <div className="space-y-3">
            {categoryDoneInfo.allowContinuedVoting && (
              <button
                onClick={() => {
                  setCategoryDoneInfo(null);
                  setIsLoading(true);
                  fetchNextPair(categoryDoneInfo.categoryId);
                }}
                className="w-full px-6 py-3 text-white rounded-full font-semibold active:scale-95 transition-transform"
                style={{ backgroundColor: uiConfig.themeColor }}
              >
                {t.continueVoting}
              </button>
            )}
            <button
              onClick={async () => {
                setCategoryDoneInfo(null);
                setLastCheckpoint(0);
                setIsLoading(true);
                const catRes = await fetch(`/api/participate/${studyId}/next-pair?token=${token}`);
                const catData = await catRes.json();
                if (catData.requiresCategorySelection) {
                  setCategories(catData.categories);
                }
                setViewState('categories');
                setIsLoading(false);
              }}
              className={`w-full px-6 py-3 rounded-full font-semibold active:scale-95 transition-transform ${
                categoryDoneInfo.allowContinuedVoting
                  ? 'bg-slate-700 text-slate-300'
                  : 'text-white shadow-lg'
              }`}
              style={
                !categoryDoneInfo.allowContinuedVoting
                  ? { backgroundColor: uiConfig.themeColor }
                  : undefined
              }
            >
              {t.nextCategory}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== VOTING INTERFACE ==========
  return (
    <div className="h-[100dvh] flex flex-col bg-slate-100 overflow-hidden">
      {/* Logo at top */}
      {LogoHeader}

      {/* Main voting area */}
      <main className="flex-1 min-h-0 px-3 sm:px-6 pb-2 overflow-hidden">
        {pair && leftItem && rightItem ? (
          <div className="w-full h-full flex flex-col">
            {/* Images container */}
            <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              {/* Left / Top image */}
              <button
                onClick={() => handleVote(pair.leftItemId)}
                disabled={isVoting || showVoteAnimation}
                className={`relative bg-white rounded-xl shadow-sm transition-all duration-300 p-2 flex items-center justify-center overflow-hidden
                  ${showVoteAnimation && selectedWinnerId === pair.leftItemId ? 'ring-4 animate-selection-ring' : ''}
                  ${showVoteAnimation && selectedWinnerId !== pair.leftItemId ? 'animate-fade-out-half' : ''}
                  ${isVoting || showVoteAnimation ? 'pointer-events-none' : 'active:scale-[0.99] hover:shadow-lg cursor-pointer'}
                  focus:outline-none`}
                style={
                  showVoteAnimation && selectedWinnerId === pair.leftItemId
                    ? { boxShadow: `0 0 0 4px ${uiConfig.themeColor}` }
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getImageUrl(leftItem)}
                  alt=""
                  loading="eager"
                  decoding="async"
                  // @ts-expect-error fetchpriority is a valid HTML attribute
                  fetchpriority="high"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
                {/* Thumbs-up animation overlay */}
                {showVoteAnimation && selectedWinnerId === pair.leftItemId && uiConfig.voteAnimation === 'thumbs-up' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-xl">
                    <div className="animate-thumbs-up bg-white/90 p-3 rounded-full shadow-xl">
                      <ThumbsUp className="w-8 h-8" style={{ color: uiConfig.themeColor }} fill={uiConfig.themeColor} />
                    </div>
                  </div>
                )}
                {showVoteAnimation && selectedWinnerId === pair.leftItemId && uiConfig.voteAnimation === 'checkmark' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-xl">
                    <div className="animate-thumbs-up bg-white/90 p-3 rounded-full shadow-xl">
                      <Check className="w-8 h-8" style={{ color: uiConfig.themeColor }} strokeWidth={3} />
                    </div>
                  </div>
                )}
              </button>

              {/* Right / Bottom image */}
              <button
                onClick={() => handleVote(pair.rightItemId)}
                disabled={isVoting || showVoteAnimation}
                className={`relative bg-white rounded-xl shadow-sm transition-all duration-300 p-2 flex items-center justify-center overflow-hidden
                  ${showVoteAnimation && selectedWinnerId === pair.rightItemId ? 'ring-4 animate-selection-ring' : ''}
                  ${showVoteAnimation && selectedWinnerId !== pair.rightItemId ? 'animate-fade-out-half' : ''}
                  ${isVoting || showVoteAnimation ? 'pointer-events-none' : 'active:scale-[0.99] hover:shadow-lg cursor-pointer'}
                  focus:outline-none`}
                style={
                  showVoteAnimation && selectedWinnerId === pair.rightItemId
                    ? { boxShadow: `0 0 0 4px ${uiConfig.themeColor}` }
                    : undefined
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getImageUrl(rightItem)}
                  alt=""
                  loading="eager"
                  decoding="async"
                  // @ts-expect-error fetchpriority is a valid HTML attribute
                  fetchpriority="high"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
                {/* Thumbs-up animation overlay */}
                {showVoteAnimation && selectedWinnerId === pair.rightItemId && uiConfig.voteAnimation === 'thumbs-up' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-xl">
                    <div className="animate-thumbs-up bg-white/90 p-3 rounded-full shadow-xl">
                      <ThumbsUp className="w-8 h-8" style={{ color: uiConfig.themeColor }} fill={uiConfig.themeColor} />
                    </div>
                  </div>
                )}
                {showVoteAnimation && selectedWinnerId === pair.rightItemId && uiConfig.voteAnimation === 'checkmark' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-xl">
                    <div className="animate-thumbs-up bg-white/90 p-3 rounded-full shadow-xl">
                      <Check className="w-8 h-8" style={{ color: uiConfig.themeColor }} strokeWidth={3} />
                    </div>
                  </div>
                )}
              </button>
            </div>

            {/* Prompt text */}
            <div className="flex-none text-center py-2">
              <p className="text-sm text-slate-500">
                {study?.participantPrompt || t.selectImage}
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: uiConfig.themeColor, borderTopColor: 'transparent' }}
            />
          </div>
        )}
      </main>

      {/* Bottom progress bar */}
      {pair && uiConfig.progressStyle !== 'hidden' && (
        <footer className="flex-none py-3 sm:py-4 bg-white/80 backdrop-blur-sm border-t border-slate-200/50">
          {uiConfig.progressStyle === 'dots' ? (
            <ProgressDots
              completed={pair.progress.completed}
              target={pair.progress.target}
              themeColor={uiConfig.themeColor}
            />
          ) : (
            <div className="w-full max-w-xs mx-auto px-4">
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${pair.progress.percentage}%`,
                    backgroundColor: uiConfig.themeColor,
                  }}
                />
              </div>
            </div>
          )}
          {uiConfig.showCounts && (
            <p className="text-center text-xs text-slate-400 mt-1">
              {pair.progress.completed} {t.of} {pair.progress.target}
            </p>
          )}
        </footer>
      )}

      {/* Checkpoint toast */}
      {checkpointMessage && <CheckpointToast message={checkpointMessage} />}
    </div>
  );
}

// Wrap with Suspense for useSearchParams
export default function VotingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-400 text-sm">Nalaganje...</p>
        </div>
      </div>
    }>
      <VotingPageContent />
    </Suspense>
  );
}
