'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Activity, Plus, Globe, CheckCircle2, XCircle, Clock, Server, Wifi, Wrench, MoreVertical, Edit2, Trash2, PauseCircle, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import axios from 'axios';
import Cookies from 'js-cookie';

type MonitorStatus = 'up' | 'down' | 'pending' | 'paused';
type MonitorType = 'HTTP' | 'PORT';

interface Monitor {
  id: string;
  url: string;
  port?: number | null;
  type: MonitorType;
  status: MonitorStatus;
  interval: number;
  createdAt: Date;
  uptime?: number; // percent
  active: boolean;
  title?: string;
  maintenanceStart?: string;
  maintenanceEnd?: string;
}

const INTERVAL_OPTIONS = [
  { label: '30 seconds', value: 30 },
  { label: '1 minute',   value: 60 },
  { label: '5 minutes',  value: 300 },
  { label: '10 minutes', value: 600 },
];

export default function Dashboard() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [monitorType, setMonitorType] = useState<MonitorType>('HTTP');
  const [newUrl, setNewUrl] = useState('');
  const [newPort, setNewPort] = useState('');
  const [newInterval, setNewInterval] = useState(60);
  const [newTitle, setNewTitle] = useState('');
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceStart, setMaintenanceStart] = useState('');
  const [maintenanceEnd, setMaintenanceEnd] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'up' | 'down'>('all');
  const [editingMonitorId, setEditingMonitorId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const filteredMonitors = monitors.filter((m) => {
    if (filter === 'up') return m.status === 'up';
    if (filter === 'down') return m.status === 'down';
    return true;
  });

  const getMonitor = async () => {
    try {
      const token = Cookies.get('token');
      if (!token) return;
      const response = await axios.get(`http://localhost:3001/user/monitors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.monitors) {
        const mappedMonitors = response.data.monitors.map((m: any) => {
          const latestCheck = m.checks && m.checks.length > 0 ? m.checks[0] : null;
          const totalChecks = m.checks?.length ?? 0;
          const okChecks = m.checks?.filter((c: any) => c.ok).length ?? 0;
          const uptime = totalChecks > 0 ? Math.round((okChecks / totalChecks) * 100) : null;
          return {
            id: m.id,
            url: m.url,
            port: m.port ?? null,
            type: (m.type as MonitorType) ?? 'HTTP',
            status: m.active === false
              ? 'paused'
              : latestCheck
                ? latestCheck.ok ? 'up' : 'down'
                : 'pending',
            interval: m.interval ?? 60,
            createdAt: new Date(m.createdAt),
            uptime,
            slug: m.slug,
            active: m.active ?? true,
            title: m.title ?? '',
            maintenanceStart: m.maintenanceStart ?? '',
            maintenanceEnd: m.maintenanceEnd ?? '',
          };
        });
        setMonitors(
          mappedMonitors.sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
        );
      }
    } catch (error) {
      console.error('Failed to fetch monitors', error);
    }
  };

  useEffect(() => {
    getMonitor();
    const interval = setInterval(getMonitor, 10000);
    return () => clearInterval(interval);
  }, []);

  const resetForm = () => {
    setNewUrl('');
    setNewPort('');
    setNewInterval(60);
    setNewTitle('');
    setMaintenanceEnabled(false);
    setMaintenanceStart('');
    setMaintenanceEnd('');
    setMonitorType('HTTP');
  };

  const handleAddMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;
    if (monitorType === 'PORT' && !newPort) return;

    setIsSubmitting(true);
    try {
      const token = Cookies.get('token');
      if (!token) return;

      const base = {
        ...(newTitle.trim() ? { title: newTitle.trim() } : {}),
        ...(maintenanceEnabled && maintenanceStart ? { maintenanceStart } : {}),
        ...(maintenanceEnabled && maintenanceEnd ? { maintenanceEnd } : {}),
      };

      const payload =
        monitorType === 'HTTP'
          ? { type: 'HTTP' as const, url: newUrl.startsWith('http') ? newUrl : `https://${newUrl}`, interval: newInterval, ...base }
          : { type: 'PORT' as const, url: newUrl, port: Number(newPort), interval: newInterval, ...base };

      if (editingMonitorId) {
        await axios.put(`http://localhost:3001/update/monitor/${editingMonitorId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post('http://localhost:3001/create/monitor', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      resetForm();
      setIsDialogOpen(false);
      setEditingMonitorId(null);
      getMonitor();
    } catch (error) {
      console.error('Failed to save monitor', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (m: Monitor) => {
    setEditingMonitorId(m.id);
    setMonitorType(m.type);
    setNewUrl(m.url);
    setNewPort(m.port ? m.port.toString() : '');
    setNewInterval(m.interval);
    setNewTitle(m.title || '');
    if (m.maintenanceStart || m.maintenanceEnd) {
      setMaintenanceEnabled(true);
      setMaintenanceStart(m.maintenanceStart || '');
      setMaintenanceEnd(m.maintenanceEnd || '');
    } else {
      setMaintenanceEnabled(false);
    }
    setIsDialogOpen(true);
    setActiveMenuId(null);
  };

  const togglePause = async (m: Monitor) => {
    setActiveMenuId(null);
    try {
      const token = Cookies.get('token');
      if (!token) return;
      await axios.patch(`http://localhost:3001/monitor/${m.id}/pause`, { active: !m.active }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      getMonitor();
    } catch (err) {
      console.error('Failed to toggle pause status', err);
    }
  };

  const handleDelete = async (m: Monitor) => {
    setActiveMenuId(null);
    const confirmed = window.confirm(`Are you sure you want to completely delete the monitor for ${m.url}? All historical data will be lost forever.`);
    if (!confirmed) return;
    try {
      const token = Cookies.get('token');
      if (!token) return;
      await axios.delete(`http://localhost:3001/monitor/${m.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      getMonitor();
    } catch (err) {
      console.error('Failed to delete monitor', err);
    }
  };


  const getStatusIcon = (status: MonitorStatus) => {
    switch (status) {
      case 'up':      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'down':    return <XCircle className="w-5 h-5 text-rose-500" />;
      case 'pending': return <Clock className="w-5 h-5 text-amber-400 animate-pulse" />;
      case 'paused':  return <PauseCircle className="w-5 h-5 text-neutral-500" />;
    }
  };

  const getStatusBadge = (status: MonitorStatus) => {
    switch (status) {
      case 'up':      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'down':    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'pending': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'paused':  return 'text-neutral-400 bg-neutral-500/10 border-neutral-500/20';
    }
  };

  const getStatusLabel = (status: MonitorStatus) => {
    switch (status) {
      case 'up':      return 'Operational';
      case 'down':    return 'Down';
      case 'pending': return 'Checking…';
      case 'paused':  return 'Paused';
    }
  };

  const formatInterval = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    return `${secs / 60}m`;
  };

  const displayAddress = (m: Monitor) =>
    m.type === 'PORT'
      ? `${m.url}:${m.port ?? '?'}`
      : m.url.replace(/^https?:\/\//, '');

  const isFormValid =
    newUrl.trim().length > 0 &&
    (monitorType === 'HTTP' || (newPort.trim().length > 0 && !isNaN(Number(newPort))));

  return (
    <div className="min-h-screen bg-neutral-950 p-6 md:p-12 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-violet-500/4 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-center shadow-lg ring-1 ring-white/10">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Monitors</h1>
              <p className="text-neutral-400 text-sm">Track uptime for websites &amp; ports in real-time</p>
            </div>
          </div>

          {/* Stats strip */}
          {monitors.length > 0 && (
            <div className="flex gap-3 text-sm">
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-center">
                <span className="text-emerald-400 font-semibold">{monitors.filter(m => m.status === 'up').length}</span>
                <span className="text-neutral-500 ml-1">up</span>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-center">
                <span className="text-rose-400 font-semibold">{monitors.filter(m => m.status === 'down').length}</span>
                <span className="text-neutral-500 ml-1">down</span>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-center">
                <span className="text-neutral-300 font-semibold">{monitors.length}</span>
                <span className="text-neutral-500 ml-1">total</span>
              </div>
            </div>
          )}

          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { resetForm(); setEditingMonitorId(null); } }}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 gap-2">
                <Plus className="w-4 h-4" />
                Add Monitor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[460px] bg-neutral-900 border-neutral-800 text-white">
              <form onSubmit={handleAddMonitor}>
                <DialogHeader>
                  <DialogTitle>{editingMonitorId ? 'Edit Configuration' : 'Add a new monitor'}</DialogTitle>
                  <DialogDescription className="text-neutral-400">
                    {editingMonitorId ? 'Update your endpoint configuration.' : 'Monitor an HTTP endpoint or a TCP port for uptime.'}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-5 py-6 max-h-[60vh] overflow-y-auto pr-1">
                  {/* Type toggle */}
                  <div className="flex flex-col gap-2">
                    <Label className="text-neutral-200">Monitor Type</Label>
                    <div className="flex rounded-lg overflow-hidden border border-neutral-800 w-full">
                      <button
                        type="button"
                        onClick={() => { setMonitorType('HTTP'); setNewUrl(''); setNewPort(''); }}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                          monitorType === 'HTTP'
                            ? 'bg-emerald-500/20 text-emerald-300 border-r border-neutral-800'
                            : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 border-r border-neutral-800'
                        }`}
                      >
                        <Globe className="w-4 h-4" />
                        HTTP / HTTPS
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMonitorType('PORT'); setNewUrl(''); setNewPort(''); }}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                          monitorType === 'PORT'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                        }`}
                      >
                        <Server className="w-4 h-4" />
                        TCP Port
                      </button>
                    </div>
                  </div>

                  {/* Title input */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="title" className="text-neutral-200">
                      Display Name <span className="text-neutral-600 font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="title"
                      placeholder="e.g., Production API, Main Website"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="bg-neutral-950 border-neutral-800 text-white focus-visible:ring-emerald-500"
                      autoComplete="off"
                    />
                  </div>

                  {/* URL / Host input */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="url" className="text-neutral-200">
                      {monitorType === 'HTTP' ? 'Website URL' : 'Host / IP Address'}
                    </Label>
                    <Input
                      id="url"
                      placeholder={monitorType === 'HTTP' ? 'e.g., mywebsite.com' : 'e.g., 192.168.1.1 or db.example.com'}
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      className="bg-neutral-950 border-neutral-800 text-white focus-visible:ring-emerald-500"
                      autoComplete="off"
                    />
                  </div>

                  {/* Port input — only for PORT type */}
                  {monitorType === 'PORT' && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="port" className="text-neutral-200">Port Number</Label>
                      <Input
                        id="port"
                        type="number"
                        min={1}
                        max={65535}
                        placeholder="e.g., 5432, 3306, 6379"
                        value={newPort}
                        onChange={(e) => setNewPort(e.target.value)}
                        className="bg-neutral-950 border-neutral-800 text-white focus-visible:ring-emerald-500"
                        autoComplete="off"
                      />
                      <p className="text-xs text-neutral-500">Common ports: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3306 (MySQL), 5432 (Postgres), 6379 (Redis)</p>
                    </div>
                  )}

                  {/* Interval dropdown */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="interval" className="text-neutral-200">Check Interval</Label>
                    <select
                      id="interval"
                      value={newInterval}
                      onChange={(e) => setNewInterval(Number(e.target.value))}
                      className="w-full bg-neutral-950 border border-neutral-800 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                    >
                      {INTERVAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-neutral-900">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Maintenance Window */}
                  <div className="border-t border-neutral-800 pt-4">
                    <button
                      type="button"
                      onClick={() => setMaintenanceEnabled(!maintenanceEnabled)}
                      className="w-full flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-neutral-500" />
                        <span className="text-sm font-medium text-neutral-200">Maintenance Window</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 uppercase tracking-wider font-semibold">Optional</span>
                      </div>
                      <div className={`
                        w-9 h-5 rounded-full transition-colors duration-200 relative
                        ${maintenanceEnabled ? 'bg-emerald-500' : 'bg-neutral-700'}
                      `}>
                        <div className={`
                          absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200
                          ${maintenanceEnabled ? 'translate-x-4' : 'translate-x-0.5'}
                        `} />
                      </div>
                    </button>

                    {maintenanceEnabled && (
                      <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                        <p className="text-xs text-neutral-500">
                          During maintenance, alerts will be paused and the status page will show a maintenance notice.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="maint-start" className="text-neutral-300 text-xs">Start Time</Label>
                            <Input
                              id="maint-start"
                              type="datetime-local"
                              value={maintenanceStart}
                              onChange={(e) => setMaintenanceStart(e.target.value)}
                              className="bg-neutral-950 border-neutral-800 text-white text-xs focus-visible:ring-emerald-500 [&::-webkit-calendar-picker-indicator]:invert"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="maint-end" className="text-neutral-300 text-xs">End Time</Label>
                            <Input
                              id="maint-end"
                              type="datetime-local"
                              value={maintenanceEnd}
                              onChange={(e) => setMaintenanceEnd(e.target.value)}
                              className="bg-neutral-950 border-neutral-800 text-white text-xs focus-visible:ring-emerald-500 [&::-webkit-calendar-picker-indicator]:invert"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="border-t border-neutral-800 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-neutral-300 hover:text-white hover:bg-neutral-800">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!isFormValid || isSubmitting}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                  >
                    {isSubmitting ? (editingMonitorId ? 'Saving…' : 'Adding…') : (editingMonitorId ? 'Save Changes' : 'Start Monitoring')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        {monitors.length > 0 && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full sm:w-[450px]">
               <TabsList className="bg-neutral-900 border border-neutral-800 h-auto p-1.5 flex gap-2">
                 <TabsTrigger value="all" className="flex-1 py-2 text-neutral-400 font-medium hover:text-white data-[state=active]:bg-neutral-800 data-[state=active]:text-white transition-colors">All Checks</TabsTrigger>
                 <TabsTrigger value="up" className="flex-1 py-2 text-neutral-400 font-medium hover:text-emerald-300 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 transition-colors">Up</TabsTrigger>
                 <TabsTrigger value="down" className="flex-1 py-2 text-neutral-400 font-medium hover:text-rose-300 data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-400 transition-colors">Down</TabsTrigger>
               </TabsList>
            </Tabs>
          </div>
        )}

        {/* Monitors Grid */}
        {monitors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-4 text-center border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20">
            <div className="w-16 h-16 mb-5 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center">
              <Wifi className="w-8 h-8 text-neutral-600" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No monitors yet</h3>
            <p className="text-neutral-400 max-w-sm mb-6 text-sm">
              Start tracking websites by URL or any server by TCP port — get alerted the moment something goes down.
            </p>
            <Button
              onClick={() => setIsDialogOpen(true)}
              variant="outline"
              className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add your first monitor
            </Button>
          </div>
        ) : filteredMonitors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-4 text-center border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/20">
            <h3 className="text-lg font-semibold text-white mb-2">No monitors found</h3>
            <p className="text-neutral-400 max-w-sm mb-6 text-sm">
              No monitors match the current "{filter}" filter.
            </p>
            <Button
              onClick={() => setFilter('all')}
              variant="outline"
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white"
            >
              Clear filter
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredMonitors.map((monitor) => (
              <Link
                href={`/track/${monitor.id}?name=${encodeURIComponent(displayAddress(monitor))}&type=${monitor.type}&port=${monitor.port ?? ''}&slug=${monitor.slug ?? ''}`}
                key={monitor.id}
              >
                <Card className="border-neutral-800 bg-neutral-900/50 backdrop-blur-sm hover:border-neutral-700 transition-all h-full cursor-pointer hover:shadow-xl hover:-translate-y-0.5 hover:shadow-emerald-500/5 active:scale-[0.98] duration-200 group">
                  <CardHeader className="flex flex-row items-start justify-between pb-3 space-y-0">
                    <div className="flex flex-col gap-1 min-w-0 pr-3">
                      {/* Type badge */}
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {monitor.type === 'HTTP' ? (
                          <Globe className="w-3 h-3 text-neutral-500 flex-shrink-0" />
                        ) : (
                          <Server className="w-3 h-3 text-violet-400 flex-shrink-0" />
                        )}
                        <span className={`text-[10px] font-semibold uppercase tracking-widest ${monitor.type === 'PORT' ? 'text-violet-400' : 'text-neutral-500'}`}>
                          {monitor.type === 'PORT' ? `TCP · Port ${monitor.port}` : 'HTTP'}
                        </span>
                      </div>
                      <CardTitle className="text-sm font-semibold text-white truncate leading-tight">
                        {displayAddress(monitor)}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(monitor.status)}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveMenuId(activeMenuId === monitor.id ? null : monitor.id); }}
                          className="p-1 px-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {activeMenuId === monitor.id && (
                          <div 
                            className="absolute right-0 top-full mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-30 py-1.5 overflow-hidden"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          >
                            <button className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2 transition-colors" onClick={() => handleEditClick(monitor)}>
                              <Edit2 className="w-4 h-4 text-neutral-400" /> Edit Configuration
                            </button>
                            <button className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2 transition-colors" onClick={() => togglePause(monitor)}>
                              {monitor.active ? <PauseCircle className="w-4 h-4 text-amber-400" /> : <PlayCircle className="w-4 h-4 text-emerald-400" />}
                              {monitor.active ? 'Pause Monitor' : 'Resume Monitor'}
                            </button>
                            <div className="border-t border-neutral-800 my-1.5" />
                            <button className="w-full text-left px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 flex items-center gap-2 transition-colors" onClick={() => handleDelete(monitor)}>
                              <Trash2 className="w-4 h-4" /> Delete Monitor
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    {/* Status badge */}
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${getStatusBadge(monitor.status)}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${monitor.status === 'up' ? 'bg-emerald-400' : monitor.status === 'down' ? 'bg-rose-500' : 'bg-amber-400 animate-pulse'}`} />
                      {getStatusLabel(monitor.status)}
                    </span>

                    {/* Meta row */}
                    <div className="flex items-center justify-between mt-4 text-xs text-neutral-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Every {formatInterval(monitor.interval)}</span>
                      </div>
                      {monitor.uptime !== null && monitor.uptime !== undefined && (
                        <span className={`font-medium ${monitor.uptime >= 99 ? 'text-emerald-400' : monitor.uptime >= 90 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {monitor.uptime}% uptime
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
