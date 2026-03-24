import React, { useState } from 'react';
import { MOCK_SCENARIOS, MockScenario } from '../config/mockScenarios';
import { motion, AnimatePresence } from 'motion/react';
import { FlaskConical, X, Check, AlertCircle, Info, Bell, Trash2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { GardenTask, WeatherAlert } from '../types';

interface TestingPanelProps {
  userId?: string;
  tasks?: GardenTask[];
  weatherAlerts?: WeatherAlert[];
}

export const TestingPanel: React.FC<TestingPanelProps> = ({ userId, tasks = [], weatherAlerts = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [scenarios, setScenarios] = useState<MockScenario[]>(MOCK_SCENARIOS);
  const [isSending, setIsSending] = useState(false);

  const sendTestNotifications = async () => {
    if (!userId) return;
    setIsSending(true);

    try {
      // 1. Daily Tasks Notification
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayTasks = tasks.filter(t => {
        const dueDate = new Date(t.dueDate);
        return t.status === 'Pending' && dueDate >= today && dueDate < tomorrow;
      });

      if (todayTasks.length > 0) {
        await fetch('/api/notifications/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            title: "EcoHome: Daily Tasks",
            body: `You have ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} to complete today! 🌿`
          }),
        });
      }

      // 2. Weather Alerts Today
      const todayStr = new Date().toISOString().split('T')[0];
      const todayAlerts = weatherAlerts.filter(a => a.date === todayStr);
      if (todayAlerts.length > 0) {
        await fetch('/api/notifications/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            title: "EcoHome: Weather Alerts Today",
            body: todayAlerts.map(a => `⚠️ ${a.message}`).join('\n')
          }),
        });
      }

      // 3. Weather Alerts Tomorrow
      const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const tomorrowAlerts = weatherAlerts.filter(a => a.date === tomorrowStr);
      if (tomorrowAlerts.length > 0) {
        await fetch('/api/notifications/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            title: "EcoHome: Weather Alerts Tomorrow",
            body: tomorrowAlerts.map(a => `⚠️ ${a.message}`).join('\n')
          }),
        });
      }

      if (todayTasks.length === 0 && todayAlerts.length === 0 && tomorrowAlerts.length === 0) {
        // Send a generic one if nothing else
        await fetch('/api/notifications/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      }

    } catch (error) {
      console.error('Error sending test notifications:', error);
    } finally {
      setIsSending(false);
    }
  };

  const toggleScenario = (id: string) => {
    const updated = scenarios.map(s => {
      if (s.id === id) {
        const newStatus = !s.enabled;
        // Update the global MOCK_SCENARIOS as well so App.tsx sees it
        const original = MOCK_SCENARIOS.find(ms => ms.id === id);
        if (original) {
          original.enabled = newStatus;
        }
        return { ...s, enabled: newStatus };
      }
      return s;
    });
    setScenarios(updated);
    
    // Trigger a re-render in App by dispatching a custom event
    window.dispatchEvent(new CustomEvent('mock-scenarios-updated'));
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-stone-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95"
        title="Testing & Debug Panel"
      >
        <FlaskConical size={24} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              {/* Header */}
              <div className="px-8 py-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
                <div>
                  <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
                    <FlaskConical size={20} className="text-stone-600" />
                    Testing Lab
                  </h2>
                  <p className="text-sm text-stone-500">Simulate garden scenarios and edge cases</p>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-10 h-10 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                  <Info size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 leading-relaxed">
                    These scenarios inject mock data into your session. They won't affect your real database unless you perform actions (like completing a mock task).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={sendTestNotifications}
                    disabled={isSending || !userId}
                    className={cn(
                      "flex items-center justify-center gap-2 p-3 rounded-2xl border transition-all font-bold text-xs",
                      isSending || !userId
                        ? "bg-stone-50 text-stone-400 border-stone-100 cursor-not-allowed"
                        : "bg-stone-900 text-white border-stone-900 hover:scale-105 active:scale-95 shadow-lg shadow-stone-900/20"
                    )}
                  >
                    {isSending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Bell size={16} />
                    )}
                    Send Notifications
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem('lastTaskNotification');
                      Object.keys(localStorage).forEach(key => {
                        if (key.startsWith('weatherAlert-')) {
                          localStorage.removeItem(key);
                        }
                      });
                      window.dispatchEvent(new CustomEvent('mock-scenarios-updated'));
                    }}
                    className="flex items-center justify-center gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100 hover:bg-emerald-100 transition-colors font-bold text-xs"
                  >
                    <Bell size={16} />
                    Reset Timestamps
                  </button>
                  <button
                    onClick={() => {
                      scenarios.forEach(s => {
                        const original = MOCK_SCENARIOS.find(ms => ms.id === s.id);
                        if (original) original.enabled = false;
                      });
                      setScenarios(scenarios.map(s => ({ ...s, enabled: false })));
                      window.dispatchEvent(new CustomEvent('mock-scenarios-updated'));
                    }}
                    className="flex items-center justify-center gap-2 p-3 bg-stone-50 text-stone-700 rounded-2xl border border-stone-100 hover:bg-stone-100 transition-colors font-bold text-xs"
                  >
                    <Trash2 size={16} />
                    Clear Mocks
                  </button>
                </div>

                <div className="space-y-4">
                  {scenarios.map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => toggleScenario(scenario.id)}
                      className={cn(
                        "w-full text-left p-5 rounded-2xl border-2 transition-all flex items-start gap-4 group",
                        scenario.enabled 
                          ? "bg-stone-900 border-stone-900 text-white shadow-lg" 
                          : "bg-white border-stone-100 text-stone-900 hover:border-stone-200"
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                        scenario.enabled ? "bg-white/10 text-white" : "bg-stone-50 text-stone-400 group-hover:bg-stone-100"
                      )}>
                        {scenario.enabled ? <Check size={24} /> : <AlertCircle size={24} />}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-bold truncate">{scenario.name}</h3>
                          <span className={cn(
                            "text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full",
                            scenario.enabled ? "bg-emerald-500 text-white" : "bg-stone-100 text-stone-400"
                          )}>
                            {scenario.enabled ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className={cn(
                          "text-sm leading-relaxed",
                          scenario.enabled ? "text-stone-300" : "text-stone-500"
                        )}>
                          {scenario.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-6 bg-stone-50/50 border-t border-stone-100 flex justify-end">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-6 py-2.5 bg-stone-900 text-white rounded-2xl font-bold text-sm shadow-lg shadow-stone-900/20 hover:scale-105 transition-transform active:scale-95"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
