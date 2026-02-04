'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

interface RankedItem {
  id: string;
  externalId: string | null;
  imageUrl: string | null;
  eloRating: number;
  artistRank: number | null;
  artistEloBoost: number;
  winCount: number;
  lossCount: number;
  comparisonCount: number;
  leftCount: number;
  rightCount: number;
  rank: number;
  winRate: number;
  positionBias: number;
}

interface CategoryRanking {
  category: {
    id: string;
    name: string;
    slug: string;
  };
  items: RankedItem[];
}

interface Session {
  id: string;
  createdAt: string;
  isCompleted: boolean;
  isFlagged: boolean;
  flagReason: string | null;
  comparisonCount: number;
  avgResponseTimeMs: number | null;
}

interface AccessCode {
  id: string;
  code: string;
  label: string | null;
  usedAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface StudyDetail {
  study: {
    id: string;
    title: string;
    description: string | null;
    isActive: boolean;
    language: string;
    createdAt: string;
    requireAccessCode: boolean;
    hasCategorySeparation: boolean;
  };
  accessCodes: AccessCode[];
  sessions: Session[];
  rankings: CategoryRanking[];
  stats: {
    totalComparisons: number;
    flaggedCount: number;
    flaggedPercentage: number;
    avgResponseTimeMs: number;
  };
}

export default function StudyDetailPage() {
  const params = useParams();
  const studyId = params.studyId as string;

  const [data, setData] = useState<StudyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'rankings' | 'sessions' | 'codes'>('rankings');

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/admin/studies/${studyId}`);
        if (!res.ok) throw new Error('Failed to fetch study data');
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    if (studyId) fetchData();
  }, [studyId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading study details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-destructive/10 border border-destructive rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-destructive mb-2">Error</h2>
            <p className="text-muted-foreground">{error || 'Study not found'}</p>
            <Link href="/admin" className="mt-4 inline-block text-primary hover:underline">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { study, rankings, sessions, accessCodes, stats } = data;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
            ← Back to Dashboard
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-3 h-3 rounded-full ${study.isActive ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                <h1 className="text-3xl font-bold">{study.title}</h1>
              </div>
              <p className="text-muted-foreground">
                {study.language === 'sl' ? '🇸🇮 Slovenian' : '🇬🇧 English'} •
                Created {new Date(study.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Link
              href={`/study/${study.id}`}
              target="_blank"
              className="px-4 py-2 border rounded-lg text-sm hover:bg-accent"
            >
              Open Participant View ↗
            </Link>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-8">
          <div className="border rounded-lg p-4 bg-background">
            <p className="text-xs text-muted-foreground uppercase">Total Comparisons</p>
            <p className="text-2xl font-bold">{stats.totalComparisons.toLocaleString()}</p>
          </div>
          <div className="border rounded-lg p-4 bg-background">
            <p className="text-xs text-muted-foreground uppercase">Sessions</p>
            <p className="text-2xl font-bold">{sessions.length}</p>
            <p className="text-xs text-green-600">{sessions.filter(s => s.isCompleted).length} completed</p>
          </div>
          <div className="border rounded-lg p-4 bg-background">
            <p className="text-xs text-muted-foreground uppercase">Avg Response</p>
            <p className="text-2xl font-bold">
              {stats.avgResponseTimeMs > 0 ? `${(stats.avgResponseTimeMs / 1000).toFixed(1)}s` : 'N/A'}
            </p>
          </div>
          <div className={`border rounded-lg p-4 ${stats.flaggedCount > 0 ? 'bg-red-500/10' : 'bg-background'}`}>
            <p className="text-xs text-muted-foreground uppercase">Flagged</p>
            <p className={`text-2xl font-bold ${stats.flaggedCount > 0 ? 'text-red-600' : ''}`}>
              {stats.flaggedCount} ({stats.flaggedPercentage}%)
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b mb-6">
          <div className="flex gap-4">
            {(['rankings', 'sessions', 'codes'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'rankings' && 'Rankings'}
                {tab === 'sessions' && `Sessions (${sessions.length})`}
                {tab === 'codes' && `Access Codes (${accessCodes.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'rankings' && (
          <div className="space-y-8">
            {rankings.map((ranking) => (
              <div key={ranking.category.id} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-3 border-b">
                  <h3 className="font-semibold">{ranking.category.name}</h3>
                  <p className="text-sm text-muted-foreground">{ranking.items.length} items</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Rank</th>
                        <th className="px-4 py-2 text-left font-medium">Item</th>
                        <th className="px-4 py-2 text-left font-medium">ELO</th>
                        <th className="px-4 py-2 text-left font-medium">Artist Rank</th>
                        <th className="px-4 py-2 text-left font-medium">W/L</th>
                        <th className="px-4 py-2 text-left font-medium">Win Rate</th>
                        <th className="px-4 py-2 text-left font-medium">Position Bias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.items.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={`border-t ${idx < 4 ? 'bg-primary/5' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                idx === 0
                                  ? 'bg-yellow-500 text-white'
                                  : idx === 1
                                    ? 'bg-gray-400 text-white'
                                    : idx === 2
                                      ? 'bg-amber-700 text-white'
                                      : idx === 3
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {item.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {item.imageUrl && (
                                <div className="w-10 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                                  <Image
                                    src={item.imageUrl}
                                    alt={`Item ${item.externalId || item.id}`}
                                    width={40}
                                    height={40}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <span className="font-mono text-xs">
                                #{item.externalId || item.id.slice(-8)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold">{item.eloRating}</td>
                          <td className="px-4 py-3">
                            {item.artistRank ? (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                #{item.artistRank} (+{item.artistEloBoost})
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-green-600">{item.winCount}</span>
                            {' / '}
                            <span className="text-red-600">{item.lossCount}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary"
                                  style={{ width: `${item.winRate}%` }}
                                />
                              </div>
                              <span className="text-xs">{item.winRate}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs">L:{item.leftCount}</span>
                              <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${Math.abs(item.positionBias - 50) > 10 ? 'bg-orange-500' : 'bg-green-500'}`}
                                  style={{ width: `${item.positionBias}%` }}
                                />
                              </div>
                              <span className="text-xs">R:{item.rightCount}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Session ID</th>
                  <th className="px-4 py-2 text-left font-medium">Started</th>
                  <th className="px-4 py-2 text-left font-medium">Comparisons</th>
                  <th className="px-4 py-2 text-left font-medium">Avg Time</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-t">
                    <td className="px-4 py-3 font-mono text-xs">{session.id.slice(-12)}</td>
                    <td className="px-4 py-3">{new Date(session.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{session.comparisonCount}</td>
                    <td className="px-4 py-3">
                      {session.avgResponseTimeMs
                        ? `${(session.avgResponseTimeMs / 1000).toFixed(1)}s`
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {session.isCompleted ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            Completed
                          </span>
                        ) : (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            In Progress
                          </span>
                        )}
                        {session.isFlagged && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                            Flagged: {session.flagReason}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'codes' && (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Code</th>
                  <th className="px-4 py-2 text-left font-medium">Label</th>
                  <th className="px-4 py-2 text-left font-medium">Created</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {accessCodes.map((code) => (
                  <tr key={code.id} className="border-t">
                    <td className="px-4 py-3 font-mono">{code.code}</td>
                    <td className="px-4 py-3">{code.label || '-'}</td>
                    <td className="px-4 py-3">{new Date(code.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {code.usedAt ? (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                          Used {new Date(code.usedAt).toLocaleDateString()}
                        </span>
                      ) : code.isActive ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          Available
                        </span>
                      ) : (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                          Deactivated
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
