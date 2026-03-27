'use client';
import React, { useState, useEffect, use } from 'react';
import { Activity, ArrowLeft, Clock, CheckCircle2, XCircle, Zap, Globe, Server } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { io } from 'socket.io-client';

interface DataPoint {
  time: string;
  latency: number;
  status: 1 | 0;
}

export default function TrackPage({ params }: { params: Promise<{ url: string[] }> }) {
  const unwrappedParams = use(params);
  const monitorId = unwrappedParams.url ? unwrappedParams.url[0] : '';
  const searchParams = useSearchParams();
  const monitorName = searchParams.get('name') || 'Monitor Details';
  const monitorType = (searchParams.get('type') || 'HTTP') as 'HTTP' | 'PORT';
  const monitorPort = searchParams.get('port');

  const [data, setData] = useState<DataPoint[]>([]);
  const [currentLatency, setCurrentLatency] = useState(0);
  const [isUp, setIsUp] = useState(true);

  const fetchChecks = async () => {
    if (!monitorId) return;
    try {
      const response = await axios.get(`http://localhost:3001/monitor/${monitorId}/checks`);
      if (response.data.checks) {
        const checks = response.data.checks.reverse().map((c: any) => ({
          time: new Date(c.checkedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          latency: c.latency,
          status: c.status >= 200 && c.status < 300 ? 1 : 0
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

    const socket = io('http://localhost:3002');
    
    socket.on(`monitor-${monitorId}`, (newCheck: any) => {
      const formattedCheck: DataPoint = {
        time: new Date(newCheck.checkedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        latency: newCheck.latency,
        status: (newCheck.status >= 200 && newCheck.status < 300 ? 1 : 0) as 1 | 0
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
    });

    return () => {
      socket.disconnect();
    };
  }, [monitorId]);

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
            <div className="flex gap-2">
              <div className="bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-lg text-center shadow-md">
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Uptime (24h)</div>
                <div className="text-xl font-bold text-emerald-400">99.8%</div>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-lg text-center shadow-md">
                <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Avg Latency</div>
                <div className="text-xl font-bold text-white">45 ms</div>
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
                            const isUp = payload[0].value === 1;
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
        </div>
      </div>
    </div>
  );
}
