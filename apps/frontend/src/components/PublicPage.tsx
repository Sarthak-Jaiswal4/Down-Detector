'use client';
import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  Server,
  Zap,
  Shield,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

interface MonitorInfo {
  id: string;
  url: string;
  type: 'HTTP' | 'PORT';
  port?: number | null;
  status: 'UP' | 'DOWN' | 'PENDING';
  slug: string;
  createdAt: string;
  interval: number;
}

interface Stats {
  uptimePercent: number;
  avgLatency: number;
  totalChecks: number;
  okChecks: number;
}

interface DailyUptimeEntry {
  date: string;
  uptime: number;
  total: number;
  ok: number;
}

interface CheckEntry {
  id: string;
  status: number;
  latency: number;
  ok: boolean;
  checkedAt: string;
  incident?: any;
}

interface IncidentEntry {
  time: string;
  rawError?: string;
  failureHop?: string;
  failureLocation?: string;
  dns?: string;
  pingLatency?: number;
}

interface StatusPageData {
  monitor: MonitorInfo;
  stats: Stats;
  dailyUptime: DailyUptimeEntry[];
  recentChecks: CheckEntry[];
  recentIncidents: IncidentEntry[];
}

function getUptimeBarColor(uptime: number): string {
  if (uptime >= 99.5) return 'bg-emerald-500';
  if (uptime >= 95) return 'bg-emerald-400';
  if (uptime >= 90) return 'bg-amber-400';
  if (uptime >= 80) return 'bg-amber-500';
  return 'bg-rose-500';
}

function getUptimeBarHoverColor(uptime: number): string {
  if (uptime >= 99.5) return 'hover:bg-emerald-400';
  if (uptime >= 95) return 'hover:bg-emerald-300';
  if (uptime >= 90) return 'hover:bg-amber-300';
  if (uptime >= 80) return 'hover:bg-amber-400';
  return 'hover:bg-rose-400';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function PublicPage({ data }: { data: StatusPageData }) {
  const { monitor, stats, dailyUptime, recentChecks, recentIncidents } = data;
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [incidentsExpanded, setIncidentsExpanded] = useState(false);

  const isUp = monitor.status === 'UP';
  const isPending = monitor.status === 'PENDING';

  const displayUrl =
    monitor.type === 'PORT'
      ? `${monitor.url}:${monitor.port ?? '?'}`
      : monitor.url.replace(/^https?:\/\//, '');

  // Fill missing days to get 90 bars
  const filledUptime = (() => {
    const map = new Map(dailyUptime.map((d) => [d.date, d]));
    const result: DailyUptimeEntry[] = [];
    const today = new Date();
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0]!;
      result.push(
        map.get(key) || { date: key, uptime: 100, total: 0, ok: 0 }
      );
    }
    return result;
  })();

  return (
    <div className="min-h-screen bg-neutral-950 relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute top-[-25%] left-[-15%] w-[55%] h-[55%] rounded-full blur-[120px] pointer-events-none"
        style={{ background: isUp ? 'rgba(16, 185, 129, 0.04)' : 'rgba(244, 63, 94, 0.04)' }}
      />
      <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full blur-[120px] pointer-events-none"
        style={{ background: 'rgba(139, 92, 246, 0.03)' }}
      />

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-16 relative z-10">

        {/* ── Header / Hero ────────────────────────── */}
        <div className="text-center mb-12">
          {/* Branding pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-neutral-900/80 border border-neutral-800 mb-8 backdrop-blur-sm">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-neutral-300 tracking-wider uppercase">
              Service Status
            </span>
          </div>

          {/* Status hero */}
          <div className={`
            inline-flex items-center gap-3 px-6 py-3 rounded-2xl border mb-6
            transition-all duration-500
            ${isUp
              ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_40px_-10px_rgba(16,185,129,0.15)]'
              : isPending
                ? 'bg-amber-500/5 border-amber-500/20 shadow-[0_0_40px_-10px_rgba(245,158,11,0.15)]'
                : 'bg-rose-500/5 border-rose-500/20 shadow-[0_0_40px_-10px_rgba(244,63,94,0.15)]'
            }
          `}>
            <div className="relative">
              <div className={`
                w-3 h-3 rounded-full
                ${isUp ? 'bg-emerald-400' : isPending ? 'bg-amber-400' : 'bg-rose-500'}
              `} />
              <div className={`
                absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-75
                ${isUp ? 'bg-emerald-400' : isPending ? 'bg-amber-400' : 'bg-rose-500'}
              `} />
            </div>
            <span className={`
              text-lg font-semibold tracking-tight
              ${isUp ? 'text-emerald-400' : isPending ? 'text-amber-400' : 'text-rose-400'}
            `}>
              {isUp ? 'All Systems Operational' : isPending ? 'Checking Status…' : 'Service Disruption Detected'}
            </span>
          </div>

          {/* URL */}
          <div className="flex items-center justify-center gap-2 text-neutral-400">
            {monitor.type === 'PORT' ? (
              <Server className="w-4 h-4 text-violet-400" />
            ) : (
              <Globe className="w-4 h-4 text-neutral-500" />
            )}
            <span className="text-sm font-medium">{displayUrl}</span>
            {monitor.type === 'HTTP' && (
              <a
                href={monitor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-600 hover:text-neutral-300 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* ── Stats Cards ─────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {/* Uptime */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 backdrop-blur-sm hover:border-neutral-700 transition-colors">
            <div className="flex items-center gap-1.5 mb-2">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Uptime</span>
            </div>
            <div className={`text-2xl font-bold tracking-tight ${stats.uptimePercent >= 99 ? 'text-emerald-400' : stats.uptimePercent >= 95 ? 'text-amber-400' : 'text-rose-400'}`}>
              {stats.uptimePercent}%
            </div>
          </div>

          {/* Avg Latency */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 backdrop-blur-sm hover:border-neutral-700 transition-colors">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Avg Latency</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {stats.avgLatency}<span className="text-sm font-medium text-neutral-500 ml-1">ms</span>
            </div>
          </div>

          {/* Total Checks */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 backdrop-blur-sm hover:border-neutral-700 transition-colors">
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Checks</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {stats.totalChecks.toLocaleString()}
            </div>
          </div>

          {/* Check Interval */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 backdrop-blur-sm hover:border-neutral-700 transition-colors">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Interval</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {monitor.interval < 60 ? `${monitor.interval}s` : `${monitor.interval / 60}m`}
            </div>
          </div>
        </div>

        {/* ── Uptime Bar Chart (90 days) ──────────── */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Uptime History</h2>
                <p className="text-xs text-neutral-500">Last 90 days</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-emerald-500" />
                100%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-amber-400" />
                Degraded
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-rose-500" />
                Down
              </span>
            </div>
          </div>

          {/* Bars */}
          <div className="relative">
            <div className="flex gap-[2px] items-stretch h-10">
              {filledUptime.map((day, i) => (
                <div key={day.date} className="relative flex-1 h-full group">
                  <div
                    className={`
                      w-full h-full rounded-sm cursor-pointer transition-all duration-150
                      ${day.total === 0
                        ? 'bg-neutral-800'
                        : `${getUptimeBarColor(day.uptime)} ${getUptimeBarHoverColor(day.uptime)}`
                      }
                      ${hoveredBar === i ? 'opacity-100 scale-y-110 origin-bottom' : 'opacity-80 hover:opacity-100'}
                    `}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  />
                  {/* Tooltip */}
                  {hoveredBar === i && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap">
                      <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 shadow-xl text-xs">
                        <div className="text-neutral-300 font-medium mb-1">{formatDate(day.date)}</div>
                        <div className={`font-bold ${day.uptime >= 99 ? 'text-emerald-400' : day.uptime >= 90 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {day.total === 0 ? 'No data' : `${day.uptime}% uptime`}
                        </div>
                        {day.total > 0 && (
                          <div className="text-neutral-500 mt-0.5">
                            {day.ok}/{day.total} checks OK
                          </div>
                        )}
                      </div>
                      <div className="w-2 h-2 bg-neutral-900 border-b border-r border-neutral-700 rotate-45 mx-auto -mt-1" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Date labels */}
            <div className="flex justify-between mt-2 text-[10px] text-neutral-600">
              <span>{formatDate(filledUptime[0]?.date || '')}</span>
              <span>Today</span>
            </div>
          </div>
        </div>

        {/* ── Recent Checks ──────────────────────── */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-6 mb-6 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 bg-neutral-800 border border-neutral-700 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Recent Checks</h2>
              <p className="text-xs text-neutral-500">Latest health check results</p>
            </div>
          </div>

          {recentChecks.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">No checks recorded yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentChecks.map((check) => (
                <div
                  key={check.id}
                  className={`
                    flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors
                    ${check.ok
                      ? 'hover:bg-neutral-800/30'
                      : 'bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    {check.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                    )}
                    <div>
                      <span className={`text-sm font-medium ${check.ok ? 'text-neutral-200' : 'text-rose-300'}`}>
                        {check.ok ? 'OK' : `Error ${check.status}`}
                      </span>
                      <span className="text-xs text-neutral-600 ml-2">
                        {timeAgo(check.checkedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {check.ok && check.latency > 0 && (
                      <span className="text-xs text-neutral-400 font-mono">
                        {check.latency}<span className="text-neutral-600">ms</span>
                      </span>
                    )}
                    <span className="text-xs text-neutral-600 font-mono">
                      {formatTime(check.checkedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent Incidents ───────────────────── */}
        {recentIncidents.length > 0 && (
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden mb-6 backdrop-blur-sm">
            {/* Header toggle */}
            <button
              onClick={() => setIncidentsExpanded(!incidentsExpanded)}
              className="w-full flex items-center justify-between p-6 hover:bg-neutral-800/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-left">
                  <h2 className="text-sm font-semibold text-white">Recent Incidents</h2>
                  <p className="text-xs text-neutral-500">{recentIncidents.length} incident{recentIncidents.length > 1 ? 's' : ''} recorded</p>
                </div>
              </div>
              {incidentsExpanded ? (
                <ChevronUp className="w-4 h-4 text-neutral-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-neutral-500" />
              )}
            </button>

            {/* Incident list */}
            {incidentsExpanded && (
              <div className="border-t border-neutral-800 divide-y divide-neutral-800/50">
                {recentIncidents.map((incident, i) => (
                  <div key={i} className="p-5 hover:bg-neutral-800/10 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-rose-300">
                          Downtime Detected
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500 font-mono">
                        {formatDate(incident.time)} · {formatTime(incident.time)}
                      </span>
                    </div>

                    {incident.rawError && (
                      <div className="bg-rose-950/20 border border-rose-900/20 rounded-lg p-3 mb-3">
                        <p className="text-xs font-mono text-rose-300/80 whitespace-pre-wrap leading-relaxed">
                          {incident.rawError}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-xs">
                      {incident.pingLatency !== null && incident.pingLatency !== undefined && (
                        <span className="px-2.5 py-1 rounded-md bg-neutral-800/60 border border-neutral-700/50 text-neutral-300">
                          <Zap className="w-3 h-3 text-amber-400 inline mr-1" />
                          Ping: {incident.pingLatency}ms
                        </span>
                      )}
                      {incident.failureHop && (
                        <span className="px-2.5 py-1 rounded-md bg-neutral-800/60 border border-neutral-700/50 text-neutral-300">
                          <Server className="w-3 h-3 text-rose-400 inline mr-1" />
                          Hop: {incident.failureHop}
                        </span>
                      )}
                      {incident.failureLocation && (
                        <span className="px-2.5 py-1 rounded-md bg-neutral-800/60 border border-neutral-700/50 text-neutral-300">
                          <Globe className="w-3 h-3 text-sky-400 inline mr-1" />
                          {incident.failureLocation.replace('undefined', '').trim() || 'Unknown'}
                        </span>
                      )}
                      {incident.dns && (
                        <span className="px-2.5 py-1 rounded-md bg-neutral-800/60 border border-neutral-700/50 text-neutral-300 font-mono">
                          DNS: {incident.dns}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Footer ─────────────────────────────── */}
        <div className="text-center pt-8 border-t border-neutral-800/50">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-semibold text-neutral-400 tracking-wider uppercase">
              Powered by Downtime Monitor
            </span>
          </div>
          <p className="text-xs text-neutral-600">
            Monitoring since {formatDate(monitor.createdAt)} · Updated every {monitor.interval < 60 ? `${monitor.interval}s` : `${monitor.interval / 60}m`}
          </p>
        </div>
      </div>
    </div>
  );
}