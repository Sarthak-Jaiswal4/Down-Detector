'use client';

import React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Zap,
  Globe,
  Bell,
  Shield,
  Server,
  Clock,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

function PulseRing() {
  return (
    <span className="absolute inset-0 -z-10">
      <span className="absolute inset-[-8px] rounded-2xl border border-emerald-500/20 animate-ping [animation-duration:3s]" />
      <span className="absolute inset-[-18px] rounded-3xl border border-emerald-500/10 animate-ping [animation-duration:4s] [animation-delay:0.5s]" />
    </span>
  );
}

/* ────────────────────────────────────────────
   Feature card
   ──────────────────────────────────────────── */
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative rounded-2xl border border-neutral-800/80 bg-neutral-900/40 backdrop-blur-md p-6 transition-all duration-300 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5 hover:-translate-y-1">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 transition-colors group-hover:bg-emerald-500/20">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm leading-relaxed text-neutral-400">{description}</p>
    </div>
  );
}

/* ────────────────────────────────────────────
   Step card (how it works)
   ──────────────────────────────────────────── */
function StepCard({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex flex-col items-center text-center px-4">
      <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-lg mb-4">
        {step}
      </div>
      <h4 className="text-white font-semibold mb-2">{title}</h4>
      <p className="text-sm text-neutral-400 max-w-[260px]">{description}</p>
    </div>
  );
}

/* ────────────────────────────────────────────
   Live status demo bar
   ──────────────────────────────────────────── */
function StatusBar() {
  const ticks = Array.from({ length: 30 });
  return (
    <div className="flex items-center gap-[3px]">
      {ticks.map((_, i) => (
        <div
          key={i}
          className={`h-7 w-[6px] rounded-sm transition-all ${
            i === 22
              ? 'bg-rose-500/80'
              : i === 23
                ? 'bg-amber-500/70'
                : 'bg-emerald-500/70'
          }`}
          style={{
            opacity: 0.5 + Math.random() * 0.5,
            animationDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────
   Main Landing Page
   ──────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white overflow-hidden">
      {/* ── Ambient background glows ── */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-[-20%] left-[10%] h-[600px] w-[600px] rounded-full bg-emerald-500/[0.07] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[5%] h-[500px] w-[500px] rounded-full bg-violet-500/[0.05] blur-[120px]" />
        <div className="absolute top-[40%] right-[20%] h-[300px] w-[300px] rounded-full bg-emerald-500/[0.04] blur-[100px]" />
      </div>

      {/* ═══════════════════════════════════════════
          NAV
          ═══════════════════════════════════════════ */}
      <nav className="sticky top-0 z-50 border-b border-neutral-800/60 bg-neutral-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 shadow ring-1 ring-white/10">
              <Activity className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Down<span className="text-emerald-400">Detector</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/auth">
              <Button
                variant="ghost"
                className="text-neutral-300 hover:text-white hover:bg-neutral-800/60 text-sm"
              >
                Sign in
              </Button>
            </Link>
            <Link href="/auth">
              <Button className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 text-sm gap-1.5">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════
          HERO
          ═══════════════════════════════════════════ */}
      <section className="relative mx-auto max-w-5xl px-6 pt-24 pb-20 md:pt-32 md:pb-28 text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-xs font-medium text-emerald-400">
          <Zap className="h-3.5 w-3.5" />
          Real-time uptime monitoring
        </div>

        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl md:text-6xl">
          Know the moment
          <br />
          <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent">
            your site goes down
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-400">
          Monitor websites and TCP ports around the clock. Get instant alerts,
          track response times, and share beautiful status pages — all in one
          place.
        </p>

        {/* CTA buttons */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link href="/auth">
            <Button
              size="lg"
              className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/25 text-base px-8 h-12 gap-2"
            >
              Start Monitoring — Free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="#features">
            <Button
              size="lg"
              variant="outline"
              className="border-neutral-700 text-neutral-300 hover:bg-neutral-800/60 hover:text-white text-base px-8 h-12"
            >
              See Features
            </Button>
          </Link>
        </div>

        {/* ── Hero demo card ── */}
        <div className="relative mx-auto mt-16 max-w-2xl">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 backdrop-blur-xl p-6 shadow-2xl">
            {/* Header row */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-neutral-800 border border-neutral-700/60 flex items-center justify-center relative">
                  <Activity className="h-4 w-4 text-emerald-400" />
                  <PulseRing />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">
                    api.myapp.com
                  </p>
                  <p className="text-xs text-neutral-500">HTTPS · Every 30s</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Operational
              </span>
            </div>

            {/* Status ticks */}
            <div className="flex justify-center">
              <StatusBar />
            </div>

            {/* Stats row */}
            <div className="mt-5 grid grid-cols-3 gap-4">
              {[
                { label: 'Uptime', value: '99.98%', color: 'text-emerald-400' },
                { label: 'Avg Latency', value: '42ms', color: 'text-white' },
                { label: 'Checks Today', value: '2,880', color: 'text-white' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg bg-neutral-800/50 border border-neutral-800 px-3 py-2.5 text-center"
                >
                  <p className={`text-lg font-bold ${stat.color}`}>
                    {stat.value}
                  </p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Glow beneath the card */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 h-32 w-[80%] bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FEATURES
          ═══════════════════════════════════════════ */}
      <section id="features" className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-emerald-400 uppercase tracking-widest mb-3">
            Features
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to stay online
          </h2>
          <p className="mt-4 mx-auto max-w-lg text-neutral-400">
            Powerful monitoring tools built for developers and teams who can't
            afford downtime.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={Globe}
            title="HTTP & HTTPS Monitoring"
            description="Check any URL at intervals as low as 30 seconds and get notified the instant it stops responding."
          />
          <FeatureCard
            icon={Server}
            title="TCP Port Monitoring"
            description="Monitor databases, caches, mail servers — any service reachable via a TCP port, including SSH, Redis, and Postgres."
          />
          <FeatureCard
            icon={Bell}
            title="Instant Alerts"
            description="Receive real-time notifications when a monitor goes down so you can respond before your users notice."
          />
          <FeatureCard
            icon={Clock}
            title="Uptime History & Logs"
            description="Browse historical checks, response times, and incident timelines with a detailed, paginated log view."
          />
          <FeatureCard
            icon={Shield}
            title="Public Status Pages"
            description="Share a beautiful, auto-generated status page with your users so they always know what's up."
          />
          <FeatureCard
            icon={Zap}
            title="Maintenance Windows"
            description="Schedule planned downtime to suppress false alerts and show a maintenance notice on your status page."
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          HOW IT WORKS
          ═══════════════════════════════════════════ */}
      <section className="relative mx-auto max-w-5xl px-6 py-24">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-emerald-400 uppercase tracking-widest mb-3">
            How It Works
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Up and running in minutes
          </h2>
        </div>

        <div className="grid gap-10 sm:grid-cols-3">
          <StepCard
            step={1}
            title="Add a Monitor"
            description="Enter a URL or host + port and choose your check interval."
          />
          <StepCard
            step={2}
            title="We Check 24/7"
            description="Our workers ping your endpoint around the clock from multiple locations."
          />
          <StepCard
            step={3}
            title="Get Notified"
            description="The moment something is wrong, you'll know — with full incident details."
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          CTA BANNER
          ═══════════════════════════════════════════ */}
      <section className="mx-auto max-w-4xl px-6 py-24">
        <div className="relative rounded-3xl border border-neutral-800 bg-neutral-900/50 backdrop-blur-xl overflow-hidden">
          {/* Inner glow */}
          <div className="absolute top-[-40%] left-[20%] h-[300px] w-[300px] rounded-full bg-emerald-500/10 blur-[80px] pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center text-center py-16 px-8">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              Ready to keep your services online?
            </h2>
            <p className="text-neutral-400 max-w-md mb-8">
              Start monitoring in under a minute. No credit card required.
            </p>
            <Link href="/auth">
              <Button
                size="lg"
                className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/25 text-base px-10 h-12 gap-2"
              >
                Get Started for Free
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>

            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-neutral-500">
              {['No credit card', 'Free tier available', 'Setup in 60 seconds'].map(
                (item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/70" />
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════ */}
      <footer className="border-t border-neutral-800/60">
        <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 text-neutral-500 text-sm">
            <Activity className="h-4 w-4 text-emerald-500/60" />
            <span>
              © {new Date().getFullYear()} DownDetector. All rights reserved.
            </span>
          </div>
          <div className="flex gap-6 text-sm text-neutral-500">
            <Link href="/auth" className="hover:text-white transition-colors">
              Dashboard
            </Link>
            <Link href="/auth" className="hover:text-white transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
