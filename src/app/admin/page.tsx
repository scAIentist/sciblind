'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface CategoryStat {
  id: string;
  name: string;
  slug: string;
  itemCount: number;
  comparisonsInCategory: number;
  topItems: Array<{
    id: string;
    externalId: string | null;
    eloRating: number;
    artistRank: number | null;
    winCount: number;
    lossCount: number;
    comparisonCount: number;
  }>;
}

interface StudyStat {
  id: string;
  title: string;
  isActive: boolean;
  createdAt: string;
  language: string;
  totalItems: number;
  totalComparisons: number;
  totalSessions: number;
  categoryStats: CategoryStat[];
  accessCodeStats: {
    total: number;
    used: number;
    available: number;
  };
  sessionStats: {
    total: number;
    completed: number;
    inProgress: number;
    flagged: number;
  };
  avgResponseTime: number;
  recentActivity: number;
}

interface ActivityLogEntry {
  id: string;
  createdAt: string;
  action: string;
  detail: string | null;
  studyId: string | null;
  sessionId: string | null;
  ipHash: string | null;
  metadata: Record<string, unknown> | null;
}

interface DashboardData {
  globalStats: {
    totalStudies: number;
    activeStudies: number;
    totalComparisons: number;
    totalSessions: number;
    completedSessions: number;
    flaggedComparisons: number;
  };
  studies: StudyStat[];
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStudy, setExpandedStudy] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/admin/activity-log?limit=50');
      if (res.ok) {
        const json = await res.json();
        setActivityLogs(json.logs || []);
      }
    } catch {
      // Non-critical — silently fail
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/admin/dashboard');
        if (!res.ok) throw new Error('Failed to fetch dashboard data');
        const json = await res.json();
        setData(json);
        // Auto-expand first study
        if (json.studies.length > 0) {
          setExpandedStudy(json.studies[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-destructive/10 border border-destructive rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Dashboard</h2>
            <p className="text-muted-foreground">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = data?.globalStats;
  const studies = data?.studies || [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold">SciBLIND Admin</h1>
              <p className="text-muted-foreground">Monitor and manage your studies</p>
            </div>
          </div>
        </div>

        {/* Global Stats */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-8">
          <StatCard title="Studies" value={stats?.totalStudies || 0} subtitle="total" />
          <StatCard title="Active" value={stats?.activeStudies || 0} subtitle="running now" color="green" />
          <StatCard title="Sessions" value={stats?.totalSessions || 0} subtitle="participants" />
          <StatCard title="Completed" value={stats?.completedSessions || 0} subtitle="finished" color="blue" />
          <StatCard title="Comparisons" value={stats?.totalComparisons || 0} subtitle="votes cast" />
          <StatCard
            title="Flagged"
            value={stats?.flaggedComparisons || 0}
            subtitle="suspicious"
            color={stats?.flaggedComparisons ? 'red' : 'gray'}
          />
        </div>

        {/* Studies List */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Studies</h2>
            <Link
              href="/admin/studies/new"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
            >
              + New Study
            </Link>
          </div>

          {studies.length === 0 ? (
            <div className="border rounded-lg p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-muted-foreground mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="text-lg font-medium mb-2">No studies yet</h3>
              <p className="text-muted-foreground mb-4">Create your first blind comparison study</p>
            </div>
          ) : (
            studies.map((study) => (
              <StudyCard
                key={study.id}
                study={study}
                expanded={expandedStudy === study.id}
                onToggle={() => setExpandedStudy(expandedStudy === study.id ? null : study.id)}
              />
            ))
          )}
        </div>

        {/* Activity Log Section */}
        <div className="mt-8 pt-8 border-t">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Activity Log</h2>
            <button
              onClick={() => {
                if (!showLogs) fetchLogs();
                setShowLogs(!showLogs);
              }}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-accent transition-colors"
            >
              {showLogs ? 'Hide Logs' : 'Show Logs'}
            </button>
          </div>

          {showLogs && (
            <div className="border rounded-lg overflow-hidden">
              {logsLoading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading logs...</p>
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No activity logs yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium text-muted-foreground">Time</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Detail</th>
                        <th className="text-left p-3 font-medium text-muted-foreground">Session</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {activityLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-accent/30">
                          <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString('sl-SI', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              log.action.includes('FAIL') || log.action.includes('RATE_LIMITED')
                                ? 'bg-red-100 text-red-700'
                                : log.action.includes('FLAGGED')
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : log.action.includes('COMPLETED')
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-blue-100 text-blue-700'
                            }`}>
                              {log.action.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-3 text-xs max-w-md truncate">{log.detail || '—'}</td>
                          <td className="p-3 text-xs text-muted-foreground font-mono">
                            {log.sessionId ? log.sessionId.slice(-8) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {activityLogs.length > 0 && (
                <div className="p-3 border-t bg-muted/30 flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Showing last {activityLogs.length} entries
                  </span>
                  <button
                    onClick={fetchLogs}
                    className="text-xs text-primary hover:underline"
                  >
                    Refresh
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="mt-8 pt-8 border-t">
          <div className="flex flex-wrap gap-4">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Home
            </Link>
            <span className="text-muted-foreground">•</span>
            <span className="text-sm text-muted-foreground opacity-50">
              Keycloak Auth (coming soon)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  color = 'default',
}: {
  title: string;
  value: number;
  subtitle: string;
  color?: 'default' | 'green' | 'blue' | 'red' | 'gray';
}) {
  const colorClasses = {
    default: 'bg-background',
    green: 'bg-green-500/10',
    blue: 'bg-blue-500/10',
    red: 'bg-red-500/10',
    gray: 'bg-muted',
  };

  const textClasses = {
    default: 'text-foreground',
    green: 'text-green-600',
    blue: 'text-blue-600',
    red: 'text-red-600',
    gray: 'text-muted-foreground',
  };

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      <p className={`text-2xl font-bold ${textClasses[color]}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function StudyCard({
  study,
  expanded,
  onToggle,
}: {
  study: StudyStat;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full p-4 md:p-6 flex items-center justify-between hover:bg-accent/50 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-3 h-3 rounded-full ${study.isActive ? 'bg-green-500' : 'bg-muted-foreground'}`}
          />
          <div>
            <h3 className="font-semibold text-lg">{study.title}</h3>
            <p className="text-sm text-muted-foreground">
              {study.language === 'sl' ? '🇸🇮' : '🇬🇧'} {study.totalItems} items •{' '}
              {study.categoryStats.length} categories
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block">
            <p className="text-2xl font-bold">{study.totalComparisons}</p>
            <p className="text-xs text-muted-foreground">comparisons</p>
          </div>
          <svg
            className={`w-5 h-5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t p-4 md:p-6 bg-muted/30">
          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-background rounded-lg p-3 border">
              <p className="text-xs text-muted-foreground">Access Codes</p>
              <p className="text-lg font-semibold">
                {study.accessCodeStats.used}/{study.accessCodeStats.total}
              </p>
              <p className="text-xs text-green-600">
                {study.accessCodeStats.available} available
              </p>
            </div>
            <div className="bg-background rounded-lg p-3 border">
              <p className="text-xs text-muted-foreground">Sessions</p>
              <p className="text-lg font-semibold">{study.sessionStats.total}</p>
              <p className="text-xs text-blue-600">
                {study.sessionStats.completed} completed
              </p>
            </div>
            <div className="bg-background rounded-lg p-3 border">
              <p className="text-xs text-muted-foreground">Avg Response</p>
              <p className="text-lg font-semibold">
                {study.avgResponseTime > 0
                  ? `${(study.avgResponseTime / 1000).toFixed(1)}s`
                  : 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground">per vote</p>
            </div>
            <div className="bg-background rounded-lg p-3 border">
              <p className="text-xs text-muted-foreground">Flagged</p>
              <p className={`text-lg font-semibold ${study.sessionStats.flagged > 0 ? 'text-red-600' : ''}`}>
                {study.sessionStats.flagged}
              </p>
              <p className="text-xs text-muted-foreground">suspicious</p>
            </div>
          </div>

          {/* Categories with Rankings */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              Category Rankings (Top 5)
            </h4>
            <div className="grid gap-4 md:grid-cols-3">
              {study.categoryStats.map((cat) => (
                <div key={cat.id} className="bg-background rounded-lg p-4 border">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h5 className="font-medium">{cat.name}</h5>
                      <p className="text-xs text-muted-foreground">
                        {cat.itemCount} items • {cat.comparisonsInCategory} votes
                      </p>
                    </div>
                  </div>
                  {cat.topItems.length > 0 ? (
                    <div className="space-y-2">
                      {cat.topItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 text-sm ${idx < 4 ? 'font-medium' : 'text-muted-foreground'}`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                              idx === 0
                                ? 'bg-yellow-500 text-white'
                                : idx === 1
                                  ? 'bg-gray-400 text-white'
                                  : idx === 2
                                    ? 'bg-amber-700 text-white'
                                    : idx === 3
                                      ? 'bg-primary/20 text-primary'
                                      : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="truncate flex-1">
                            #{item.externalId || item.id.slice(-6)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.eloRating}
                          </span>
                          {item.artistRank && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                              A{item.artistRank}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No votes yet</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* UI Customization */}
          <UICustomizationPanel studyId={study.id} />

          {/* Actions */}
          <div className="mt-6 pt-4 border-t flex flex-wrap gap-3">
            <Link
              href={`/admin/studies/${study.id}`}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
            >
              View Full Details
            </Link>
            <Link
              href={`/study/${study.id}`}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-accent"
              target="_blank"
            >
              Open Participant View ↗
            </Link>
            <Link
              href={`/api/studies/${study.id}/rankings`}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-accent"
              target="_blank"
            >
              Export Rankings (JSON) ↗
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UICustomizationPanel({ studyId }: { studyId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState({
    uiThemeColor: '#2563EB',
    uiLogoPosition: 'top-center',
    uiProgressStyle: 'dots',
    uiShowCounts: false,
    uiVoteAnimation: 'thumbs-up',
    uiCategoryStyle: 'gallery',
    allowContinuedVoting: true,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isOpen && !loaded) {
      fetch(`/api/studies/${studyId}`)
        .then((r) => r.json())
        .then((data) => {
          setConfig({
            uiThemeColor: data.uiThemeColor || '#2563EB',
            uiLogoPosition: data.uiLogoPosition || 'top-center',
            uiProgressStyle: data.uiProgressStyle || 'dots',
            uiShowCounts: data.uiShowCounts ?? false,
            uiVoteAnimation: data.uiVoteAnimation || 'thumbs-up',
            uiCategoryStyle: data.uiCategoryStyle || 'gallery',
            allowContinuedVoting: data.allowContinuedVoting ?? true,
          });
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    }
  }, [isOpen, loaded, studyId]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/studies/${studyId}/ui-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 pt-4 border-t">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Study Settings
        <span className="text-xs text-muted-foreground font-normal">(UI & behavior customization)</span>
      </button>

      {isOpen && (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 bg-background rounded-lg p-4 border">
          {/* Theme Color */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Theme Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={config.uiThemeColor}
                onChange={(e) => setConfig({ ...config, uiThemeColor: e.target.value })}
                className="w-8 h-8 rounded border cursor-pointer"
              />
              <input
                type="text"
                value={config.uiThemeColor}
                onChange={(e) => setConfig({ ...config, uiThemeColor: e.target.value })}
                className="flex-1 px-2 py-1.5 border rounded text-sm font-mono bg-background"
                placeholder="#2563EB"
              />
            </div>
          </div>

          {/* Logo Position */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Logo Position</label>
            <select
              value={config.uiLogoPosition}
              onChange={(e) => setConfig({ ...config, uiLogoPosition: e.target.value })}
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
            >
              <option value="top-center">Top Center</option>
              <option value="top-left">Top Left</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          {/* Progress Style */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Progress Style</label>
            <select
              value={config.uiProgressStyle}
              onChange={(e) => setConfig({ ...config, uiProgressStyle: e.target.value })}
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
            >
              <option value="dots">Dots / Milestones</option>
              <option value="bar">Simple Bar</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          {/* Vote Animation */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Vote Animation</label>
            <select
              value={config.uiVoteAnimation}
              onChange={(e) => setConfig({ ...config, uiVoteAnimation: e.target.value })}
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
            >
              <option value="thumbs-up">Thumbs Up</option>
              <option value="checkmark">Checkmark</option>
              <option value="border-only">Border Only</option>
              <option value="none">None</option>
            </select>
          </div>

          {/* Category Style */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Category Style</label>
            <select
              value={config.uiCategoryStyle}
              onChange={(e) => setConfig({ ...config, uiCategoryStyle: e.target.value })}
              className="w-full px-2 py-1.5 border rounded text-sm bg-background"
            >
              <option value="gallery">Gallery (Thumbnails)</option>
              <option value="list">List</option>
              <option value="cards">Cards</option>
            </select>
          </div>

          {/* Show Counts */}
          <div className="flex items-center gap-2 self-end pb-1">
            <input
              type="checkbox"
              id={`showCounts-${studyId}`}
              checked={config.uiShowCounts}
              onChange={(e) => setConfig({ ...config, uiShowCounts: e.target.checked })}
              className="rounded border"
            />
            <label htmlFor={`showCounts-${studyId}`} className="text-sm text-muted-foreground">
              Show numeric counts (X/Y)
            </label>
          </div>

          {/* Allow Continued Voting */}
          <div className="md:col-span-2 lg:col-span-3 flex items-center gap-2 pt-2 border-t">
            <input
              type="checkbox"
              id={`allowContinued-${studyId}`}
              checked={config.allowContinuedVoting}
              onChange={(e) => setConfig({ ...config, allowContinuedVoting: e.target.checked })}
              className="rounded border"
            />
            <label htmlFor={`allowContinued-${studyId}`} className="text-sm text-muted-foreground">
              Allow continued voting past scientific threshold
            </label>
            <span className="text-xs text-muted-foreground/60 ml-1">
              (when disabled, voting stops once minimum comparisons are met)
            </span>
          </div>

          {/* Save button */}
          <div className="md:col-span-2 lg:col-span-3 flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save UI Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
