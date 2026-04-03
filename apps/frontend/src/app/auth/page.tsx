'use client'
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Mail, Lock, User, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import axios from 'axios';
import Cookies from 'js-cookie';
import { BACKEND_URL } from '@/lib/constants';

export default function AuthPage() {
  const router = useRouter();
  const [isSignIn, setIsSignIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const endpoint = isSignIn ? `${BACKEND_URL}/signin` : `${BACKEND_URL}/signup`;
      const payload = isSignIn 
        ? { email: formData.email, password: formData.password }
        : { name: formData.name, email: formData.email, password: formData.password };
      console.log(endpoint,payload)
      const response = await axios.post(endpoint, payload);
      
      if (response.data.token) {
        Cookies.set('token', response.data.token, { expires: 7, secure: true, sameSite: 'strict' });
        if (response.data.userId) {
          Cookies.set('userId', response.data.userId, { expires: 7 });
        }
        router.push('/dashboard');
      } else {
        setError(response.data.message || 'Something went wrong');
      }
    } catch (err: any) {
      if (err.response && err.response.data && err.response.data.message) {
        setError(err.response.data.message);
      } else if (err.response && err.response.data && err.response.data.error) {
        // Handle Zod validation errors if returned as array
        const errorData = err.response.data.error;
        if (Array.isArray(errorData)) {
            setError(errorData[0]?.message || 'Validation failed');
        } else {
            setError('Validation error');
        }
      } else {
        setError('Failed to connect to the server');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="w-12 h-12 bg-neutral-900 border border-neutral-800 rounded-2xl flex items-center justify-center shadow-lg ring-1 ring-white/10 mb-4">
            <Activity className="w-6 h-6 text-emerald-400" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-white tracking-tight">
          {isSignIn ? 'Welcome back' : 'Create an account'}
        </h2>
        <p className="mt-2 text-center text-sm text-neutral-400">
          {isSignIn ? 'Enter your details to access your monitors' : 'Start tracking your website downtime in seconds'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <Card className="bg-neutral-900/60 backdrop-blur-xl border-neutral-800 shadow-2xl">
          <CardHeader className="space-y-1">
            <div className="flex bg-neutral-950/50 p-1 rounded-lg border border-neutral-800/50 mb-4">
              <button
                type="button"
                onClick={() => { setIsSignIn(true); setError(''); }}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${isSignIn ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsSignIn(false); setError(''); }}
                className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${!isSignIn ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                Sign Up
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isSignIn && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-neutral-200">Full Name</Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-neutral-500" />
                    </div>
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      required={!isSignIn}
                      value={formData.name}
                      onChange={handleChange}
                      className="pl-10 bg-neutral-950 border-neutral-800 text-white focus-visible:ring-emerald-500"
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-neutral-200">Email address</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-neutral-500" />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10 bg-neutral-950 border-neutral-800 text-white focus-visible:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-neutral-200">Password</Label>
                  {isSignIn && (
                    <a href="#" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                      Forgot password?
                    </a>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-neutral-500" />
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-10 bg-neutral-950 border-neutral-800 text-white focus-visible:ring-emerald-500"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 mt-6 h-11"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    {isSignIn ? 'Sign in to account' : 'Create account'}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
