'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';

interface Study {
  id: string;
  title: string;
  description: string;
  language: string;
  logoUrls: string[];
  requireAccessCode: boolean;
}

// Slovenian translations
const translations = {
  sl: {
    enterCode: 'Vnesite svojo kodo za dostop',
    codePlaceholder: 'npr. IzVRS-ocenjevalec12345',
    submit: 'Nadaljuj',
    loading: 'Nalaganje...',
    verifying: 'Preverjanje...',
    invalidCode: 'Neveljavna koda za dostop',
    codeUsed: 'Ta koda je bila že uporabljena',
    codeExpired: 'Koda je potekla',
    codeInactive: 'Koda je bila deaktivirana',
    error: 'Prišlo je do napake',
    studyNotFound: 'Študija ni bila najdena',
    studyInactive: 'Študija ni aktivna',
    welcome: 'Dobrodošli',
    poweredBy: 'Poganja',
  },
  en: {
    enterCode: 'Enter your access code',
    codePlaceholder: 'e.g., IzVRS-ocenjevalec12345',
    submit: 'Continue',
    loading: 'Loading...',
    verifying: 'Verifying...',
    invalidCode: 'Invalid access code',
    codeUsed: 'This code has already been used',
    codeExpired: 'Code has expired',
    codeInactive: 'Code has been deactivated',
    error: 'An error occurred',
    studyNotFound: 'Study not found',
    studyInactive: 'Study is not active',
    welcome: 'Welcome',
    poweredBy: 'Powered by',
  },
};

export default function StudyEntryPage() {
  const params = useParams();
  const router = useRouter();
  const studyId = params.studyId as string;

  const [study, setStudy] = useState<Study | null>(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lang = (study?.language || 'en') as keyof typeof translations;
  const t = translations[lang] || translations.en;

  useEffect(() => {
    // Check for existing session
    const sessionToken = localStorage.getItem(`sciblind-session-${studyId}`);
    if (sessionToken) {
      router.push(`/study/${studyId}/vote?token=${sessionToken}`);
      return;
    }

    // Fetch study info
    fetchStudy();
  }, [studyId]);

  async function fetchStudy() {
    try {
      const res = await fetch(`/api/studies/${studyId}`);
      if (!res.ok) {
        setError(t.studyNotFound);
        setIsLoading(false);
        return;
      }
      const data = await res.json();
      setStudy(data);
      setIsLoading(false);
    } catch (err) {
      setError(t.error);
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/participate/${studyId}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMessages: Record<string, string> = {
          INVALID_CODE: t.invalidCode,
          CODE_USED: t.codeUsed,
          CODE_EXPIRED: t.codeExpired,
          CODE_INACTIVE: t.codeInactive,
          STUDY_NOT_FOUND: t.studyNotFound,
          STUDY_INACTIVE: t.studyInactive,
        };
        setError(errorMessages[data.errorKey] || data.error || t.error);
        setIsSubmitting(false);
        return;
      }

      // Store session token
      localStorage.setItem(`sciblind-session-${studyId}`, data.sessionToken);

      // Redirect to voting
      router.push(`/study/${studyId}/vote?token=${data.sessionToken}`);
    } catch (err) {
      setError(t.error);
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-500">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!study) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">{error || t.studyNotFound}</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header with logos */}
      <header className="p-6">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-6 flex-wrap">
          {study.logoUrls?.map((logo, idx) => (
            <div key={idx} className="relative h-16 w-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/logos/${logo}`}
                alt="Logo"
                className="h-16 w-auto object-contain"
              />
            </div>
          ))}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-lg">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">{study.title}</h1>
              <p className="text-slate-600">{study.description}</p>
            </div>

            {study.requireAccessCode ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    {t.enterCode}
                  </label>
                  <input
                    type="text"
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t.codePlaceholder}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center font-mono text-lg bg-white text-slate-900"
                    disabled={isSubmitting}
                    autoComplete="off"
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm text-center">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !code.trim()}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? t.verifying : t.submit}
                </button>
              </form>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? t.verifying : t.submit}
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-sm text-slate-500">
        {t.poweredBy}{' '}
        <a
          href="https://scaientist.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          ScAIentist
        </a>
      </footer>
    </div>
  );
}
