'use client';
import React, { useState, useEffect, use } from 'react';
import { Activity, ArrowLeft, Clock, CheckCircle2, XCircle, Zap, Globe, Server, Copy, Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { io } from 'socket.io-client';

interface DataPoint {
  time: string;
  latency: number;
  status: 1 | 0;
  incident?: any;
}

export default function TrackPage({ params }: { params: Promise<{ url: string[] }> }) {
  const unwrappedParams = use(params);
  const monitorId = unwrappedParams.url ? unwrappedParams.url[0] : '';
  const searchParams = useSearchParams();
  const monitorName = searchParams.get('name') || 'Monitor Details';
  const monitorType = (searchParams.get('type') || 'HTTP') as 'HTTP' | 'PORT';
  const monitorPort = searchParams.get('port');
  const monitorSlug = searchParams.get('slug');

  const [data, setData] = useState<DataPoint[]>([]);
  const [logs, setLogs] = useState<DataPoint[]>([]);
  const [page, setPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const LOGS_PER_PAGE = 10;
  
  const [currentLatency, setCurrentLatency] = useState(0);
  const [isUp, setIsUp] = useState(true);
  const [copied, setCopied] = useState(false);

  // Computed stats from check data
  const uptimePercent = data.length > 0
    ? Math.round((data.filter(d => d.status === 1).length / data.length) * 1000) / 10
    : 0;
  const avgLatency = (() => {
    const okChecks = data.filter(d => d.status === 1 && d.latency > 0);
    return okChecks.length > 0
      ? Math.round(okChecks.reduce((sum, d) => sum + d.latency, 0) / okChecks.length)
      : 0;
  })();

  const handleCopyPublicUrl = async () => {
    if (!monitorSlug) return;
    const publicUrl = `${window.location.origin}/statusPage/${monitorSlug}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const fetchChecks = async () => {
    if (!monitorId) return;
    try {
      const response = await axios.get(`http://localhost:3001/monitor/${monitorId}/checks?limit=60`);
      if (response.data.checks) {
        const checks = response.data.checks.reverse().map((c: any) => ({
          time: new Date(c.checkedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          date: new Date(c.checkedAt).toLocaleDateString(),
          latency: c.latency,
          status: c.status >= 200 && c.status < 300 ? 1 : 0,
          incident: c.incident
        }));
        setData(checks);
        if (checks.length > 0) {
            const latest = checks[checks.length - 1];
            setCurrentLatency(latest.latency);
            setIsUp(latest.status === 1);
        }
      }
    } catch (e) {
      console.error("Failed to fetch checks", e);
    }
  };

  useEffect(() => {
    fetchChecks();
    
    if (!monitorId) return;

    const socket = io('http://localhost:3003');
    
    socket.on(`monitor-${monitorId}`, (newCheck: any) => {
      const formattedCheck: DataPoint = {
        time: new Date(newCheck.checkedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        latency: newCheck.latency,
        status: (newCheck.status >= 200 && newCheck.status < 300 ? 1 : 0) as 1 | 0,
        incident: newCheck.incident
      };
      
      setData((prevData) => {
        const updatedData = [...prevData, formattedCheck];
        if (updatedData.length > 60) {
          return updatedData.slice(updatedData.length - 60);
        }
        return updatedData;
      });
      
      setCurrentLatency(formattedCheck.latency);
      setIsUp(formattedCheck.status === 1);
      
      // Update logs if on page 1
      setLogs((prevLogs) => {
        if (page === 1) {
          const newLogs = [formattedCheck, ...prevLogs];
          return newLogs.slice(0, LOGS_PER_PAGE);
        }
        return prevLogs;
      });
      setTotalLogs((prev) => prev + 1);

    });

    return () => {
      socket.disconnect();
    };
  }, [monitorId, page]);

  const fetchLogs = async (currentPage: number) => {
    if (!monitorId) return;
    try {
      const response = await axios.get(`http://localhost:3001/monitor/${monitorId}/checks?page=${currentPage}&limit=${LOGS_PER_PAGE}`);
      if (response.data.checks) {
        const checks = response.data.checks.map((c: any) => ({
          time: new Date(c.checkedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          date: new Date(c.checkedAt).toLocaleDateString(),
          latency: c.latency,
          status: c.status >= 200 && c.status < 300 ? 1 : 0,
          incident: c.incident
        }));
        setLogs(checks); // Backend already provides descending order
        setTotalLogs(response.data.total || 0);
      }
    } catch(e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchLogs(page);
  }, [monitorId, page]);

  const chartConfig = {
    latency: {
      label: "Latency (ms)",
      color: "#10b981",
    },
    status: {
      label: "Status",
      color: "#10b981",
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 p-6 md:p-12 relative overflow-hidden text-white">
      {/* Background ambient glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-8">
          <Link href="/dashboard">
            <Button variant="ghost" className="mb-4 text-neutral-400 hover:text-white hover:bg-neutral-900 border border-neutral-800/50">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
            </Button>
          </Link>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-center shadow-lg ring-1 ring-white/10">
                <Activity className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{monitorName}</h1>
                <div className="flex items-center gap-2 mt-1 text-sm text-neutral-400">
                  {/* Monitor type badge */}
                  <span className="flex items-center gap-1">
                    {monitorType === 'PORT'
                      ? <Server className="w-3.5 h-3.5 text-violet-400" />
                      : <Globe className="w-3.5 h-3.5 text-neutral-500" />}
                    <span className={monitorType === 'PORT' ? 'text-violet-400' : 'text-neutral-500'}>
                      {monitorType === 'PORT' ? `TCP Port${monitorPort ? ` · :${monitorPort}` : ''}` : 'HTTP Monitor'}
                    </span>
                  </span>
                  <span className="opacity-40">·</span>
                  <span className="flex items-center gap-1">
                    {isUp ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-500" />}
                    {isUp ? 'Operational' : 'Down'}
                  </span>
                  <span className="opacity-50">•</span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-4 h-4 text-amber-400" />
                    {currentLatency > 0 ? `${currentLatency} ms` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              {monitorSlug && (
                <button
                  onClick={handleCopyPublicUrl}
                  className={`
                    relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    transition-all duration-300 ease-out cursor-pointer
                    ${copied
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_-4px_rgba(16,185,129,0.3)]'
                      : 'bg-neutral-900 border border-emerald-500/20 text-neutral-300 hover:border-emerald-500/40 hover:text-emerald-300 hover:shadow-[0_0_20px_-4px_rgba(16,185,129,0.15)] hover:bg-emerald-500/5'
                    }
                  `}
                >
                  <span className={`transition-transform duration-300 ${copied ? 'scale-110' : ''}`}>
                    {copied
                      ? <Check className="w-4 h-4" />
                      : <ExternalLink className="w-4 h-4 text-emerald-400/70" />
                    }
                  </span>
                  {copied ? 'Copied!' : 'Copy Public URL'}
                </button>
              )}
              <div className="bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-lg text-center shadow-md">
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Uptime</div>
                <div className={`text-xl font-bold ${uptimePercent >= 99 ? 'text-emerald-400' : uptimePercent >= 90 ? 'text-amber-400' : 'text-rose-400'}`}>{uptimePercent}%</div>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-lg text-center shadow-md">
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Avg Latency</div>
                <div className="text-xl font-bold text-white">{avgLatency > 0 ? `${avgLatency} ms` : 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Latency Chart */}
          <Card className="border-neutral-800 bg-neutral-900/50 backdrop-blur-sm shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg text-white font-medium flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                Response Time (Last 60 seconds)
              </CardTitle>
              <CardDescription className="text-neutral-400">Live latency metrics recorded every second.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full mt-4">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
                    <XAxis 
                      dataKey="time" 
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#737373', fontSize: 12 }}
                      minTickGap={30}
                    />
                    <YAxis 
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#737373', fontSize: 12 }}
                      tickFormatter={(value) => `${value}ms`}
                    />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Area 
                      type="monotone" 
                      dataKey="latency" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorLatency)" 
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          {/* Uptime Chart */}
          <Card className="border-neutral-800 bg-neutral-900/50 backdrop-blur-sm shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg text-white font-medium flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-400" />
                Availability Check (Last 60 seconds)
              </CardTitle>
              <CardDescription className="text-neutral-400">Status pings over time.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[150px] w-full mt-4">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} barGap={0}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#262626" />
                    <XAxis 
                      dataKey="time" 
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#737373', fontSize: 12 }}
                      minTickGap={30}
                    />
                    <YAxis 
                      domain={[0, 1]}
                      ticks={[0, 1]}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#737373', fontSize: 12 }}
                      tickFormatter={(value) => value === 1 ? 'Up' : 'Down'}
                    />
                    <ChartTooltip 
                        cursor={{ fill: '#262626', opacity: 0.4 }}
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const isUp = payload[0]?.value === 1;
                            return (
                              <div className="bg-neutral-900 border border-neutral-800 p-2 rounded-lg shadow-xl text-xs z-50">
                                <div className="text-neutral-400 mb-1">{label}</div>
                                <div className="flex items-center gap-2">
                                  {isUp ? <CheckCircle2 className="w-3 h-3 text-emerald-400"/> : <XCircle className="w-3 h-3 text-rose-500"/>}
                                  <span className={isUp ? "text-emerald-400" : "text-rose-500 font-bold"}>
                                    {isUp ? "Operational" : "Downtime Detected"}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }} 
                    />
                    <Bar 
                      dataKey="status" 
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={false}
                      shape={(props: any) => {
                        const { x, y, width, height, payload } = props;
                        // Manual exact color definition based on payload status
                        const fillColor = payload.status === 1 ? '#10b981' : '#f43f5e';
                        return <path d={`M${x},${y} h${width} v${height} h-${width} Z`} fill={fillColor} />;
                      }}
                    />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>
          {/* Logs Section */}
          <Card className="border-neutral-800 bg-neutral-900/50 backdrop-blur-sm shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg text-white font-medium flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Recent Ping Logs
              </CardTitle>
              <CardDescription className="text-neutral-400">Detailed records of recent health checks.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-400 text-sm">
                      <th className="py-3 px-4 font-semibold">Time</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Latency</th>
                      <th className="py-3 px-4 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, index) => (
                      <tr key={index} className="border-b border-neutral-800/50 hover:bg-neutral-800/20 transition-colors">
                        <td className="py-3 px-4 text-sm text-neutral-300">{log.time}</td>
                        <td className="py-3 px-4 text-sm">
                          {log.status === 1 ? (
                            <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> OK</span>
                          ) : (
                            <span className="text-rose-500 font-medium flex items-center gap-1"><XCircle className="w-3 h-3"/> Error</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-neutral-300">
                          {log.latency > 0 ? `${log.latency} ms` : '-'}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {log.status === 0 && log.incident ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 text-xs border-rose-500 hover:bg-rose-500/10 text-rose-500 hover:text-rose-400">
                                  View Details
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="w-[190vw] bg-neutral-950/95 backdrop-blur-xl border-neutral-800 shadow-[0_0_50px_-12px_rgba(225,29,72,0.15)] p-0 overflow-hidden text-white">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 via-rose-400 to-rose-600" />
                                <div className="p-6">
                                  <DialogHeader className="mb-6">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                                        <XCircle className="w-5 h-5 text-rose-500" />
                                      </div>
                                      <div>
                                        <DialogTitle className="text-xl font-semibold text-white">
                                          Incident Diagnostic
                                        </DialogTitle>
                                        <DialogDescription className="text-neutral-400 text-sm mt-1">
                                          Automated error capture at <span className="text-neutral-300 font-medium">{log.time}</span>
                                        </DialogDescription>
                                      </div>
                                    </div>
                                  </DialogHeader>
                                  
                                  <div className="space-y-4">
                                    {log.incident.rawError && (
                                      <div className="bg-rose-950/20 rounded-xl border border-rose-900/30 overflow-hidden">
                                        <div className="bg-rose-950/40 px-4 py-2 border-b border-rose-900/30 text-xs font-semibold uppercase tracking-wider text-rose-300/80 flex items-center gap-2">
                                          <Server className="w-3.5 h-3.5" /> Raw Exception
                                        </div>
                                        <div className="p-4 text-sm font-mono text-rose-300/90 whitespace-pre-wrap leading-relaxed">
                                          {log.incident.rawError}
                                        </div>
                                      </div>
                                    )}
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {log.incident.pingLatency !== null && log.incident.pingLatency !== undefined && (
                                        <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/80 flex flex-col justify-center">
                                          <div className="text-xs text-neutral-500 mb-1.5 font-medium uppercase tracking-wider flex items-center gap-2">
                                            <Zap className="w-3.5 h-3.5" /> Ping Latency
                                          </div>
                                          <div className="text-2xl font-bold text-white flex items-baseline gap-1">
                                            {log.incident.pingLatency} <span className="text-sm font-medium text-neutral-500">ms</span>
                                          </div>
                                        </div>
                                      )}
                                      
                                      {log.incident.sslDays !== null && log.incident.sslDays !== undefined && (
                                        <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/80 flex flex-col justify-center">
                                          <div className="text-xs text-neutral-500 mb-1.5 font-medium uppercase tracking-wider flex items-center gap-2">
                                            <Activity className="w-3.5 h-3.5" /> SSL Certificate
                                          </div>
                                          <div className="text-2xl font-bold text-white flex items-baseline gap-1">
                                            {log.incident.sslDays} <span className="text-sm font-medium text-neutral-500">days left</span>
                                          </div>
                                        </div>
                                      )}

                                      {log.incident.failureHop && (
                                        <div className="bg-neutral-900/50 p-4 rounded-xl border border-rose-900/50 flex flex-col justify-center">
                                          <div className="text-xs text-rose-500/80 mb-1.5 font-medium uppercase tracking-wider flex items-center gap-2">
                                            <Server className="w-3.5 h-3.5" /> Last Responding Hop
                                          </div>
                                          <div className="text-lg font-bold text-rose-300 break-all leading-tight">
                                            {log.incident.failureHop}
                                          </div>
                                        </div>
                                      )}

                                      {log.incident.failureLocation && (
                                        <div className="bg-neutral-900/50 p-4 rounded-xl border border-rose-900/50 flex flex-col justify-center">
                                          <div className="text-xs text-rose-500/80 mb-1.5 font-medium uppercase tracking-wider flex items-center gap-2">
                                            <Globe className="w-3.5 h-3.5" /> Failure Geolocation
                                          </div>
                                          <div className="text-lg font-bold text-rose-300 break-words leading-tight">
                                            {log.incident.failureLocation.replace('undefined', '').trim() || 'Unknown'}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {log.incident.dns && (
                                        <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800/80 col-span-1 md:col-span-2">
                                          <div className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wider flex items-center gap-2">
                                            <Globe className="w-3.5 h-3.5" /> DNS Resolution
                                          </div>
                                          <div className="text-sm text-neutral-300 font-mono bg-neutral-950 p-3 rounded-lg border border-neutral-800/50 break-all leading-relaxed">
                                            {log.incident.dns}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {log.incident.hops && (
                                      <div className="bg-neutral-900/50 rounded-xl border border-neutral-800/80 overflow-hidden flex flex-col max-h-[300px]">
                                        <div className="px-4 py-3 border-b border-neutral-800/80 text-xs font-semibold uppercase tracking-wider text-neutral-400 bg-neutral-900/80 flex items-center gap-2 z-10 sticky top-0">
                                          <Server className="w-3.5 h-3.5" /> Network Trace Route
                                        </div>
                                        <div className="p-4 overflow-y-auto text-xs font-mono text-neutral-300 custom-scrollbar bg-neutral-950/50">
                                          <pre className="text-neutral-400">{JSON.stringify(log.incident.hops, null, 2)}</pre>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <span className="text-neutral-600 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalLogs > LOGS_PER_PAGE && (
                <div className="flex items-center justify-between border-t border-neutral-800 pt-4 mt-4 text-sm">
                  <div className="text-neutral-500">
                    Showing <span className="font-medium text-white">{((page - 1) * LOGS_PER_PAGE) + 1}</span> to <span className="font-medium text-white">{Math.min(page * LOGS_PER_PAGE, totalLogs)}</span> of <span className="font-medium text-white">{totalLogs}</span> entries
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-50"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center justify-center min-w-[32px] font-medium">
                      {page}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setPage(p => p + 1)}
                      disabled={page * LOGS_PER_PAGE >= totalLogs}
                      className="border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-50"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
