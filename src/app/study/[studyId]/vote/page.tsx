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
const VOTE_ANIMATION_DURATION = 400; // ms — keep short, next pair is already ready
const CHECKPOINT_PERCENTAGES = [25, 50, 75, 100];

const DEFAULT_UI_CONFIG: UIConfig = {
  themeColor: '#2563EB',
  logoPosition: 'top-center',
  progressStyle: 'dots',
  showCounts: false,
  voteAnimation: 'thumbs-up',
  categoryStyle: 'gallery',
};

// ========== Image URL helper (static, no hook needed) ==========

function buildImageUrl(item: ItemData): string {
  if (item.imageKey) {
    const parts = item.imageKey.split('/');
    if (parts[0] === 'izvrs' && parts.length === 3) {
      return `${SUPABASE_STORAGE_URL}/${parts[1]}/${parts[2]}`;
    }
  }
  if (item.imageUrl) return item.imageUrl;
  return '/placeholder.webp';
}

/** Preload a single image into browser cache, resolves when loaded or after 4s */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
    setTimeout(resolve, 4000);
  });
}

/** Preload both images for a pair */
function preloadPairImages(pairData: PairData): Promise<void> {
  return Promise.all([
    preloadImage(buildImageUrl(pairData.itemA)),
    preloadImage(buildImageUrl(pairData.itemB)),
  ]).then(() => {});
}

// ========== Progress Dots Component ==========

function ProgressDots({ completed, target, themeColor }: { completed: number; target: number; themeColor: string }) {
  if (target > 20) {
    const percentage = Math.min(100, Math.round((completed / target) * 100));
    return (
      <div className="w-full max-w-xs mx-auto px-4">
        <div className="relative h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-visible">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentage}%`, backgroundColor: themeColor }}
          />
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

  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap max-w-xs mx-auto px-4">
      {Array.from({ length: target }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            i < completed ? '' : 'bg-slate-300 dark:bg-slate-600'
          } ${i === completed ? 'animate-dot-pulse' : ''}`}
          style={{ backgroundColor: i < completed ? themeColor : undefined }}
        />
      ))}
    </div>
  );
}

// ========== Checkpoint Toast ==========

function CheckpointToast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-slide-up-toast">
      <div className="bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 px-6 py-3 rounded-full text-sm font-medium shadow-xl backdrop-blur-sm whitespace-nowrap">
        {message}
      </div>
    </div>
  );
}

// ========== Confetti ==========

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

// ========== Category Thumbnail Grid — with skeleton loading ==========

function ThumbnailGrid({ imageKeys, isComplete }: { imageKeys: string[]; isComplete: boolean }) {
  const [loadedCount, setLoadedCount] = useState(0);
  const totalImages = Math.min(6, imageKeys.length);
  const allLoaded = loadedCount >= totalImages;

  return (
    <div className={`grid grid-cols-3 gap-1 rounded-lg overflow-hidden ${isComplete ? 'opacity-50 grayscale' : ''}`}>
      {imageKeys.slice(0, 6).map((key, i) => {
        const parts = key.split('/');
        const url =
          parts[0] === 'izvrs' && parts.length === 3
            ? `${SUPABASE_STORAGE_URL}/${parts[1]}/${parts[2]}`
            : key;
        return (
          <div key={i} className="relative w-full aspect-square bg-slate-700">
            {/* Skeleton shimmer underneath */}
            {!allLoaded && (
              <div className="absolute inset-0 bg-slate-700 animate-pulse" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              loading="eager"
              onLoad={() => setLoadedCount(c => c + 1)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${allLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </div>
        );
      })}
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

  // Animation/UI state
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);
  const [showVoteAnimation, setShowVoteAnimation] = useState(false);
  const [checkpointMessage, setCheckpointMessage] = useState<string | null>(null);
  const [categoryThumbnails, setCategoryThumbnails] = useState<Record<string, string[]>>({});
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false);
  const [lastCheckpoint, setLastCheckpoint] = useState<number>(0);
  // Image transition: 0 = faded out, 1 = visible
  const [imagesReady, setImagesReady] = useState(false);

  useEffect(() => { setIsHydrated(true); }, []);

  // Refs
  const startTimeRef = useRef<number>(Date.now());
  const voteInProgressRef = useRef(false);

  // UI config
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

  const lang = (study?.language || 'sl') as keyof typeof translations;
  const t = useMemo(() => translations[lang] || translations.sl, [lang]);

  // Check for checkpoint messages
  const checkForCheckpoint = useCallback((completed: number, target: number) => {
    if (target <= 0) return;
    const pct = Math.round((completed / target) * 100);
    for (const cp of CHECKPOINT_PERCENTAGES) {
      if (pct >= cp && lastCheckpoint < cp) {
        const key = `checkpoint${cp}` as keyof typeof translations.sl;
        setCheckpointMessage(t[key] || '');
        setLastCheckpoint(cp);
        setTimeout(() => setCheckpointMessage(null), 3200);
        break;
      }
    }
  }, [lastCheckpoint, t]);

  // Fetch thumbnails
  const fetchThumbnails = useCallback(async () => {
    setThumbnailsLoading(true);
    try {
      const res = await fetch(`/api/participate/${studyId}/category-thumbnails`);
      if (res.ok) {
        const data = await res.json();
        setCategoryThumbnails(data.categories || {});
      }
    } catch { /* non-critical */ }
    setThumbnailsLoading(false);
  }, [studyId]);

  // ===== fetchNextPair — used for initial load and category selection =====
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

      // Preload images before showing
      await preloadPairImages(data);
      setPair(data);
      setImagesReady(true);
      setCurrentCategoryId(data.categoryId);
      startTimeRef.current = Date.now();
      setViewState('voting');
      setIsLoading(false);
      checkForCheckpoint(data.progress.completed, data.progress.target);

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || t.error);
        setIsLoading(false);
      }
    }
  }

  // ===== Init: fetch study + thumbnails + first pair =====
  useEffect(() => {
    if (!isHydrated) return;
    if (!token) { router.replace(`/study/${studyId}`); return; }

    const controller = new AbortController();

    async function init() {
      try {
        // Fetch study data and thumbnails in parallel
        const [studyRes] = await Promise.all([
          fetch(`/api/studies/${studyId}`, { signal: controller.signal }),
          fetchThumbnails(), // fire thumbnails fetch early
        ]);
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
    return () => { controller.abort(); };
  }, [studyId, token, isHydrated]);

  // Keyboard shortcuts
  useEffect(() => {
    if (viewState !== 'voting' || !pair || isVoting || showVoteAnimation) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (voteInProgressRef.current) return;
      const key = e.key.toLowerCase();
      if (key === 'a' || key === 'arrowleft') { e.preventDefault(); handleVote(pair!.leftItemId); }
      else if (key === 'b' || key === 'arrowright') { e.preventDefault(); handleVote(pair!.rightItemId); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewState, pair, isVoting, showVoteAnimation]);

  // ===== handleVote — fire-and-forget vote, fetch next pair in parallel =====
  const handleVote = useCallback(async (winnerId: string) => {
    if (!pair || isVoting || voteInProgressRef.current || showVoteAnimation) return;

    voteInProgressRef.current = true;
    setSelectedWinnerId(winnerId);
    setShowVoteAnimation(true);
    setIsVoting(true);
    const responseTimeMs = Date.now() - startTimeRef.current;

    // 1. Fire vote (fire-and-forget — don't block on response)
    fetch(`/api/participate/${studyId}/vote`, {
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
    }).catch(() => {}); // silently ignore — vote errors are non-fatal for UX

    // 2. Start animation + next-pair fetch simultaneously
    const animationDone = new Promise(resolve => setTimeout(resolve, VOTE_ANIMATION_DURATION));
    const nextPairUrl = new URL(`/api/participate/${studyId}/next-pair`, window.location.origin);
    nextPairUrl.searchParams.set('token', token!);
    if (currentCategoryId) nextPairUrl.searchParams.set('categoryId', currentCategoryId);
    const nextPairPromise = fetch(nextPairUrl.toString()).then(r => r.json());

    try {
      // 3. Wait for both animation and next-pair data
      const [, nextData] = await Promise.all([animationDone, nextPairPromise]);

      // Fade out current images
      setImagesReady(false);

      // Brief pause for fade-out transition
      await new Promise(resolve => setTimeout(resolve, 120));

      // Reset animation state
      setSelectedWinnerId(null);
      setShowVoteAnimation(false);

      // Process response
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
        const catRes = await fetch(`/api/participate/${studyId}/next-pair?token=${token}`);
        const catData = await catRes.json();
        if (catData.requiresCategorySelection) {
          setCategories(catData.categories);
        }
        setViewState('categories');
        return;
      }

      // Preload next pair images then show
      await preloadPairImages(nextData);
      setPair(nextData);
      setImagesReady(true);
      setCurrentCategoryId(nextData.categoryId);
      startTimeRef.current = Date.now();
      setViewState('voting');
      checkForCheckpoint(nextData.progress.completed, nextData.progress.target);

    } catch (err: any) {
      setSelectedWinnerId(null);
      setShowVoteAnimation(false);
      setImagesReady(true);
      if (err.name !== 'AbortError') {
        setError(err.message || t.error);
      }
    } finally {
      setIsVoting(false);
      voteInProgressRef.current = false;
    }
  }, [pair, isVoting, showVoteAnimation, token, studyId, currentCategoryId, t.error, router, checkForCheckpoint]);

  function selectCategory(categoryId: string) {
    setCurrentCategoryId(categoryId);
    setLastCheckpoint(0);
    setIsLoading(true);
    fetchNextPair(categoryId);
  }

  function retryAfterError() {
    setError(null);
    setIsLoading(true);
    fetchNextPair(currentCategoryId || undefined);
  }

  // Derived
  const leftItem = pair ? (pair.leftItemId === pair.itemA.id ? pair.itemA : pair.itemB) : null;
  const rightItem = pair ? (pair.rightItemId === pair.itemA.id ? pair.itemA : pair.itemB) : null;

  const displayLogoUrl = useMemo(() => {
    if (!study?.logoUrls?.length) return null;
    const izvrstna = study.logoUrls.find((l: string) => l.toLowerCase().includes('izvrstna'));
    return `/logos/${izvrstna || study.logoUrls[0]}`;
  }, [study]);

  const LogoHeader = useMemo(() => {
    if (uiConfig.logoPosition === 'hidden' || !displayLogoUrl) return null;
    return (
      <div className={`flex-none pt-4 pb-2 ${uiConfig.logoPosition === 'top-center' ? 'text-center' : 'text-left px-4'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={displayLogoUrl} alt="Logo" className="h-12 sm:h-14 w-auto object-contain inline-block" />
      </div>
    );
  }, [uiConfig.logoPosition, displayLogoUrl]);

  // ========== RENDER ==========

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
          <button onClick={retryAfterError} className="px-6 py-2.5 text-white rounded-full font-medium active:scale-95 transition-transform" style={{ backgroundColor: uiConfig.themeColor }}>
            {t.tryAgain}
          </button>
        </div>
      </div>
    );
  }

  // ========== COMPLETE ==========
  if (viewState === 'complete') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-900 p-6 relative overflow-hidden">
        <ConfettiCelebration themeColor={uiConfig.themeColor} />
        <div className="text-center max-w-sm relative z-10 animate-fade-in">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 animate-check-scale-in" style={{ backgroundColor: `${uiConfig.themeColor}20` }}>
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
    const hasThumbnails = Object.keys(categoryThumbnails).length > 0;

    return (
      <div className="min-h-[100dvh] bg-slate-900 p-4 pb-8 safe-area-inset">
        <div className="max-w-lg mx-auto">
          {displayLogoUrl && (
            <div className="pt-4 pb-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={displayLogoUrl} alt="Logo" className="h-12 sm:h-14 w-auto object-contain inline-block opacity-90" />
            </div>
          )}

          <div className="text-center mt-4 mb-6">
            <h1 className="text-lg font-semibold text-white uppercase tracking-wider">
              {allCategoriesComplete ? t.categoryComplete : t.chooseCategory}
            </h1>
            <div className="w-12 h-0.5 mx-auto mt-2 rounded-full" style={{ backgroundColor: uiConfig.themeColor }} />
          </div>

          <div className="space-y-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`rounded-xl overflow-hidden transition-all ${cat.isComplete ? 'opacity-60' : 'shadow-lg shadow-black/20'}`}
              >
                {/* Thumbnail grid or skeleton */}
                {useGallery && (
                  hasThumbnails && categoryThumbnails[cat.id]?.length > 0 ? (
                    <ThumbnailGrid imageKeys={categoryThumbnails[cat.id]} isComplete={cat.isComplete} />
                  ) : (
                    /* Skeleton grid while thumbnails load */
                    <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="w-full aspect-square bg-slate-700 animate-pulse" />
                      ))}
                    </div>
                  )
                )}

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

                  {!cat.isComplete && cat.completed > 0 && (
                    <div className="mb-3">
                      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${cat.percentage}%`, backgroundColor: uiConfig.themeColor }} />
                      </div>
                    </div>
                  )}

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
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 animate-check-scale-in" style={{ backgroundColor: `${uiConfig.themeColor}20` }}>
            <Check className="w-10 h-10" style={{ color: uiConfig.themeColor }} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">{t.categoryComplete}</h2>
          <p className="text-sm text-slate-400 mb-8 leading-relaxed">
            {categoryDoneInfo.thresholdMet ? t.thresholdSufficient : t.thresholdInsufficient}
          </p>
          <div className="space-y-3">
            {categoryDoneInfo.allowContinuedVoting && (
              <button
                onClick={() => { setCategoryDoneInfo(null); setIsLoading(true); fetchNextPair(categoryDoneInfo.categoryId); }}
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
                if (catData.requiresCategorySelection) setCategories(catData.categories);
                setViewState('categories');
                setIsLoading(false);
              }}
              className={`w-full px-6 py-3 rounded-full font-semibold active:scale-95 transition-transform ${
                categoryDoneInfo.allowContinuedVoting ? 'bg-slate-700 text-slate-300' : 'text-white shadow-lg'
              }`}
              style={!categoryDoneInfo.allowContinuedVoting ? { backgroundColor: uiConfig.themeColor } : undefined}
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
      {LogoHeader}

      <main className="flex-1 min-h-0 px-3 sm:px-6 pb-2 overflow-hidden">
        {pair && leftItem && rightItem ? (
          <div className="w-full h-full flex flex-col">
            {/* Images — fade transition between pairs */}
            <div
              className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 transition-opacity duration-150"
              style={{ opacity: imagesReady ? 1 : 0 }}
            >
              {/* Left / Top image */}
              <button
                onClick={() => handleVote(pair.leftItemId)}
                disabled={isVoting || showVoteAnimation}
                className={`relative bg-white rounded-xl shadow-sm transition-all duration-200 p-2 flex items-center justify-center overflow-hidden
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
                  src={buildImageUrl(leftItem)}
                  alt=""
                  loading="eager"
                  decoding="async"
                  // @ts-expect-error fetchpriority is a valid HTML attribute
                  fetchpriority="high"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
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
                className={`relative bg-white rounded-xl shadow-sm transition-all duration-200 p-2 flex items-center justify-center overflow-hidden
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
                  src={buildImageUrl(rightItem)}
                  alt=""
                  loading="eager"
                  decoding="async"
                  // @ts-expect-error fetchpriority is a valid HTML attribute
                  fetchpriority="high"
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
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

            <div className="flex-none text-center py-2">
              <p className="text-sm text-slate-500">{study?.participantPrompt || t.selectImage}</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: uiConfig.themeColor, borderTopColor: 'transparent' }} />
          </div>
        )}
      </main>

      {pair && uiConfig.progressStyle !== 'hidden' && (
        <footer className="flex-none py-3 sm:py-4 bg-white/80 backdrop-blur-sm border-t border-slate-200/50">
          {uiConfig.progressStyle === 'dots' ? (
            <ProgressDots completed={pair.progress.completed} target={pair.progress.target} themeColor={uiConfig.themeColor} />
          ) : (
            <div className="w-full max-w-xs mx-auto px-4">
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pair.progress.percentage}%`, backgroundColor: uiConfig.themeColor }} />
              </div>
            </div>
          )}
          {uiConfig.showCounts && (
            <p className="text-center text-xs text-slate-400 mt-1">{pair.progress.completed} {t.of} {pair.progress.target}</p>
          )}
        </footer>
      )}

      {checkpointMessage && <CheckpointToast message={checkpointMessage} />}
    </div>
  );
}

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
