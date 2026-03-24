import React, { useState } from 'react';
import { motion } from 'motion/react';
import { UserProfile, UserMode } from '../types';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { BookOpen, GraduationCap, Leaf } from 'lucide-react';

interface OnboardingProps {
  user: SupabaseUser;
  onComplete: (profile: UserProfile) => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ user, onComplete }) => {
  const [mode, setMode] = useState<UserMode | null>(null);
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    if (!mode) return;
    setLoading(true);
    try {
      const profile: UserProfile = {
        uid: user.id,
        email: user.email || '',
        displayName: user.user_metadata?.full_name || 'Gardener',
        mode,
        onboarded: true,
        notificationIntervalHours: 8,
      };
      
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          uid: profile.uid,
          email: profile.email,
          display_name: profile.displayName,
          mode: profile.mode,
          onboarded: profile.onboarded
        });

      if (error) throw error;
      onComplete(profile);
    } catch (error) {
      console.error('Error during onboarding:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-8 rounded-3xl shadow-xl border border-stone-100"
      >
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Leaf size={32} />
        </div>
        <h1 className="text-3xl font-bold text-emerald-900 mb-2">Welcome to EcoHome</h1>
        <p className="text-stone-600 mb-8">Let's personalize your gardening experience.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => setMode('Novice')}
            className={`p-6 rounded-2xl border-2 transition-all text-left flex flex-col gap-3 ${
              mode === 'Novice'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-stone-100 hover:border-emerald-200 bg-white'
            }`}
          >
            <BookOpen className={mode === 'Novice' ? 'text-emerald-600' : 'text-stone-400'} size={24} />
            <div>
              <h3 className="font-semibold text-stone-900">Novice</h3>
              <p className="text-sm text-stone-500">Simple tips, easy-to-follow guides, and common names.</p>
            </div>
          </button>

          <button
            onClick={() => setMode('Expert')}
            className={`p-6 rounded-2xl border-2 transition-all text-left flex flex-col gap-3 ${
              mode === 'Expert'
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-stone-100 hover:border-emerald-200 bg-white'
            }`}
          >
            <GraduationCap className={mode === 'Expert' ? 'text-emerald-600' : 'text-stone-400'} size={24} />
            <div>
              <h3 className="font-semibold text-stone-900">Expert</h3>
              <p className="text-sm text-stone-500">Scientific names, data-heavy insights, and technical care.</p>
            </div>
          </button>
        </div>

        <button
          onClick={handleComplete}
          disabled={!mode || loading}
          className="w-full py-4 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? 'Setting up...' : 'Start Gardening'}
        </button>
      </motion.div>
    </div>
  );
};
