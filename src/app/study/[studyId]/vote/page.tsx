'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

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

// Slovenian translations
const translations = {
  sl: {
    selectImage: 'Izberite sliko, ki vam je bolj všeč.',
    loading: 'Nalaganje...',
    submitting: 'Shranjevanje...',
    categoryComplete: 'Kategorija zaključena!',
    allComplete: 'Hvala za sodelovanje!',
    selectCategory: 'Izberite kategorijo',
    continueVoting: 'Nadaljuj z glasovanjem',
    progress: 'Napredek',
    of: 'od',
    comparisons: 'primerjav',
    keyboardHint: 'Uporabite tipki A (levo) ali L (desno) za hitrejše glasovanje',
    error: 'Prišlo je do napake',
    sessionExpired: 'Seja je potekla',
    backToCategories: 'Nazaj na kategorije',
    finishStudy: 'Zaključi',
    thankYou: 'Hvala!',
    resultsHidden: 'Rezultati bodo objavljeni po zaključku študije.',
  },
  en: {
    selectImage: 'Select the image you prefer.',
    loading: 'Loading...',
    submitting: 'Saving...',
    categoryComplete: 'Category complete!',
    allComplete: 'Thank you for participating!',
    selectCategory: 'Select a category',
    continueVoting: 'Continue voting',
    progress: 'Progress',
    of: 'of',
    comparisons: 'comparisons',
    keyboardHint: 'Use A (left) or L (right) keys for faster voting',
    error: 'An error occurred',
    sessionExpired: 'Session expired',
    backToCategories: 'Back to categories',
    finishStudy: 'Finish',
    thankYou: 'Thank you!',
    resultsHidden: 'Results will be published after the study ends.',
  },
};

export default function VotingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const studyId = params.studyId as string;
  const token = searchParams.get('token');

  const [study, setStudy] = useState<any>(null);
  const [pair, setPair] = useState<PairData | null>(null);
  const [categories, setCategories] = useState<CategoryProgress[]>([]);
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryComplete, setCategoryComplete] = useState(false);
  const [allComplete, setAllComplete] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  const startTimeRef = useRef<number>(0);
  const preloadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const lang = (study?.language || 'sl') as keyof typeof translations;
  const t = translations[lang] || translations.sl;

  // Fetch study info
  useEffect(() => {
    if (!token) {
      router.push(`/study/${studyId}`);
      return;
    }
    fetchStudy();
  }, [studyId, token]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isSubmitting || !pair || categoryComplete || allComplete) return;

      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        handleVote(pair.leftItemId);
      } else if (e.key === 'l' || e.key === 'L' || e.key === 'ArrowRight') {
        handleVote(pair.rightItemId);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pair, isSubmitting, categoryComplete, allComplete]);

  async function fetchStudy() {
    try {
      const res = await fetch(`/api/studies/${studyId}`);
      if (!res.ok) throw new Error('Study not found');
      const data = await res.json();
      setStudy(data);
      fetchNextPair();
    } catch (err) {
      setError(t.error);
      setIsLoading(false);
    }
  }

  async function fetchNextPair(categoryId?: string) {
    setIsLoading(true);
    setError(null);
    setCategoryComplete(false);

    try {
      const url = new URL(`/api/participate/${studyId}/next-pair`, window.location.origin);
      url.searchParams.set('token', token!);
      if (categoryId) {
        url.searchParams.set('categoryId', categoryId);
      }

      const res = await fetch(url.toString());
      const data = await res.json();

      if (!res.ok) {
        if (data.errorKey === 'INVALID_SESSION') {
          localStorage.removeItem(`sciblind-session-${studyId}`);
          router.push(`/study/${studyId}`);
          return;
        }
        throw new Error(data.error);
      }

      // Handle category selection required
      if (data.requiresCategorySelection) {
        setCategories(data.categories);
        setShowCategories(true);
        setIsLoading(false);
        return;
      }

      // Handle all complete
      if (data.complete || data.allCategoriesComplete) {
        setAllComplete(true);
        setIsLoading(false);
        return;
      }

      // Handle category complete
      if (data.categoryComplete) {
        setCategoryComplete(true);
        setCurrentCategoryId(data.categoryId);
        setIsLoading(false);
        // Refresh categories
        fetchCategories();
        return;
      }

      // Got a pair
      setPair(data);
      setCurrentCategoryId(data.categoryId);
      startTimeRef.current = Date.now();
      setIsLoading(false);

      // Preload images
      preloadImages(data);
    } catch (err: any) {
      setError(err.message || t.error);
      setIsLoading(false);
    }
  }

  async function fetchCategories() {
    try {
      const url = new URL(`/api/participate/${studyId}/next-pair`, window.location.origin);
      url.searchParams.set('token', token!);

      const res = await fetch(url.toString());
      const data = await res.json();

      if (data.requiresCategorySelection) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to fetch categories', err);
    }
  }

  function preloadImages(pairData: PairData) {
    const imageKeys = [pairData.itemA.imageKey, pairData.itemB.imageKey].filter(Boolean);
    imageKeys.forEach((key) => {
      if (key && !preloadedImagesRef.current.has(key)) {
        const img = new window.Image();
        img.src = `/api/studies/${studyId}/items/${key.split('/').pop()}/image`;
        preloadedImagesRef.current.set(key, img);
      }
    });
  }

  const handleVote = useCallback(
    async (winnerId: string) => {
      if (!pair || isSubmitting) return;

      setIsSubmitting(true);
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

        // Fetch next pair
        fetchNextPair(currentCategoryId || undefined);
      } catch (err: any) {
        setError(err.message || t.error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [pair, isSubmitting, token, studyId, currentCategoryId]
  );

  function selectCategory(categoryId: string) {
    setShowCategories(false);
    setCurrentCategoryId(categoryId);
    fetchNextPair(categoryId);
  }

  function getImageUrl(item: ItemData): string {
    if (item.imageKey) {
      // Extract just the filename for the image proxy
      const parts = item.imageKey.split('/');
      const filename = parts[parts.length - 1];
      return `/uploads/${item.imageKey}`;
    }
    return item.imageUrl || '/placeholder.png';
  }

  // Loading state
  if (isLoading && !showCategories) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t.loading}</p>
        </div>
      </div>
    );
  }

  // All complete
  if (allComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-green-600 dark:text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-4">{t.thankYou}</h1>
          <p className="text-muted-foreground mb-8">{t.allComplete}</p>
          <p className="text-sm text-muted-foreground">{t.resultsHidden}</p>
        </div>
      </div>
    );
  }

  // Category selection
  if (showCategories || categoryComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2">
              {categoryComplete ? t.categoryComplete : t.selectCategory}
            </h1>
          </div>

          {/* Categories */}
          <div className="space-y-4">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => !cat.isComplete && selectCategory(cat.id)}
                disabled={cat.isComplete}
                className={`w-full p-6 rounded-xl border text-left transition-all ${
                  cat.isComplete
                    ? 'bg-muted/50 border-muted cursor-not-allowed opacity-60'
                    : 'bg-card border-border hover:border-primary hover:shadow-md cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">{cat.name}</h3>
                  {cat.isComplete && (
                    <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-sm rounded-full">
                      ✓
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>
                      {cat.completed} {t.of} {cat.target} {t.comparisons}
                    </span>
                    <span>{cat.percentage}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${cat.percentage}%` }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Check if all complete */}
          {categories.every((c) => c.isComplete) && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setAllComplete(true)}
                className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                {t.finishStudy}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Voting interface
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted">
      {/* Header with progress */}
      <header className="p-4 border-b bg-card/50 backdrop-blur">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setShowCategories(true)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← {t.backToCategories}
            </button>
            <span className="text-sm text-muted-foreground">
              {pair?.progress.completed} / {pair?.progress.target} {t.comparisons}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pair?.progress.percentage || 0}%` }}
            />
          </div>
        </div>
      </header>

      {/* Prompt */}
      <div className="text-center py-6 px-4">
        <h1 className="text-xl md:text-2xl font-semibold">{study?.participantPrompt || t.selectImage}</h1>
        <p className="text-sm text-muted-foreground mt-2">{t.keyboardHint}</p>
      </div>

      {/* Main voting area */}
      <main className="flex-1 flex items-center justify-center p-4">
        {error ? (
          <div className="text-center text-destructive">
            <p>{error}</p>
          </div>
        ) : pair ? (
          <div className="w-full max-w-6xl grid grid-cols-2 gap-4 md:gap-8">
            {/* Left image */}
            <button
              onClick={() => handleVote(pair.leftItemId)}
              disabled={isSubmitting}
              className="group relative aspect-square bg-card border-2 border-transparent hover:border-primary rounded-2xl overflow-hidden transition-all hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-primary/50 disabled:opacity-50"
            >
              <Image
                src={getImageUrl(
                  pair.leftItemId === pair.itemA.id ? pair.itemA : pair.itemB
                )}
                alt="Left option"
                fill
                className="object-contain p-2"
                priority
              />
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors" />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/50 text-white rounded-full text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                A
              </div>
            </button>

            {/* Right image */}
            <button
              onClick={() => handleVote(pair.rightItemId)}
              disabled={isSubmitting}
              className="group relative aspect-square bg-card border-2 border-transparent hover:border-primary rounded-2xl overflow-hidden transition-all hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-primary/50 disabled:opacity-50"
            >
              <Image
                src={getImageUrl(
                  pair.rightItemId === pair.itemA.id ? pair.itemA : pair.itemB
                )}
                alt="Right option"
                fill
                className="object-contain p-2"
                priority
              />
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors" />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/50 text-white rounded-full text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                L
              </div>
            </button>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur flex items-center justify-center z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-sm text-muted-foreground">{t.submitting}</p>
          </div>
        </div>
      )}
    </div>
  );
}
