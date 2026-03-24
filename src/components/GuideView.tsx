import React, { useState, useEffect } from 'react';
import { BookOpen, ChevronRight, PlayCircle, Search, Tag, X, ArrowLeft, AlertTriangle, Send, Loader2, Database } from 'lucide-react';
import { Guide } from '../types';
import { GARDEN_GUIDES } from '../constants/guides';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { supabase } from '../lib/supabase';

interface GuideViewProps {
  initialGuideId?: string | null;
  onGuideSelected?: (id: string | null) => void;
}

export const GuideView: React.FC<GuideViewProps> = ({ initialGuideId, onGuideSelected }) => {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Fetch guides from Supabase
  useEffect(() => {
    const fetchGuides = async () => {
      const { data, error } = await supabase
        .from('guides')
        .select('*');
      
      if (error) {
        console.error('Error fetching guides:', error);
        setIsLoading(false);
        return;
      }
      
      setGuides(data as Guide[]);
      setIsLoading(false);
      
      // Handle initial guide selection if provided
      if (initialGuideId && !selectedGuide) {
        const guide = data.find(g => g.id === initialGuideId);
        if (guide) setSelectedGuide(guide as Guide);
      }
    };

    fetchGuides();
  }, [initialGuideId]);

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(user?.email === 'vinnylocke@gmail.com');
    });
  }, []);

  const handleSeedGuides = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email !== 'vinnylocke@gmail.com') return;
    setIsSeeding(true);
    try {
      for (const guide of GARDEN_GUIDES) {
        const { error } = await supabase
          .from('guides')
          .upsert([guide]);
        if (error) throw error;
      }
      alert('Guides seeded successfully!');
    } catch (error) {
      console.error('Error seeding guides:', error);
      alert('Failed to seed guides.');
    } finally {
      setIsSeeding(false);
    }
  };

  // Report Problem State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportDescription, setReportDescription] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const handleSelectGuide = (guide: Guide | null) => {
    setSelectedGuide(guide);
    if (onGuideSelected) {
      onGuideSelected(guide?.id || null);
    }
    // Reset report state when changing guides
    setIsReportModalOpen(false);
    setReportDescription('');
    setReportSuccess(false);
  };

  const handleReportSubmit = async () => {
    if (!selectedGuide || !reportDescription.trim()) return;
    
    setIsSubmittingReport(true);
    try {
      // 1. Save to Supabase directly from the client
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('reports')
        .insert([{
          guide_id: selectedGuide.id,
          guide_title: selectedGuide.title,
          description: reportDescription,
          user_email: user?.email || 'Anonymous',
          created_at: new Date().toISOString(),
          status: 'new'
        }]);
      if (error) throw error;

      // 2. Send email via backend API
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          guideId: selectedGuide.id,
          guideTitle: selectedGuide.title,
          description: reportDescription,
        }),
      });

      if (response.ok) {
        setReportSuccess(true);
        setTimeout(() => {
          setIsReportModalOpen(false);
          setReportSuccess(false);
          setReportDescription('');
        }, 2000);
      } else {
        alert('Failed to submit report. Please try again later.');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('An error occurred. Please try again later.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const categories = ['All', 'Propagation', 'Pruning', 'Planting', 'Harvesting', 'General'];

  const filteredGuides = guides.filter(guide => {
    const matchesSearch = guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         guide.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         guide.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || guide.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (selectedGuide) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="flex flex-col gap-8"
      >
        <button
          onClick={() => handleSelectGuide(null)}
          className="flex items-center gap-2 text-stone-500 hover:text-stone-900 transition-colors font-medium self-start"
        >
          <ArrowLeft size={20} />
          Back to Guides
        </button>

        <div className="bg-white rounded-[2.5rem] shadow-xl border border-stone-100 overflow-hidden">
          {selectedGuide.imageUrl && (
            <div className="h-64 w-full relative">
              <img
                src={selectedGuide.imageUrl}
                alt={selectedGuide.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
                <div className="flex flex-col gap-2">
                  <span className="px-3 py-1 bg-emerald-600 text-white rounded-full text-[10px] font-bold uppercase tracking-wider self-start">
                    {selectedGuide.category}
                  </span>
                  <h1 className="text-3xl font-bold text-white tracking-tight">
                    {selectedGuide.title}
                  </h1>
                </div>
              </div>
            </div>
          )}

          <div className="p-8 lg:p-12">
            <div className="flex flex-wrap gap-2 mb-8">
              {selectedGuide.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 px-3 py-1 bg-stone-100 text-stone-600 rounded-lg text-xs font-medium">
                  <Tag size={12} />
                  {tag}
                </span>
              ))}
            </div>

            {selectedGuide.videoUrl && (
              <div className="mb-10 aspect-video rounded-3xl overflow-hidden bg-stone-100 shadow-inner border border-stone-200">
                <iframe
                  width="100%"
                  height="100%"
                  src={selectedGuide.videoUrl}
                  title={selectedGuide.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            )}

            <div className="markdown-body prose prose-stone max-w-none">
              <Markdown>{selectedGuide.content}</Markdown>
            </div>

            <div className="mt-12 pt-8 border-t border-stone-100 flex justify-center">
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                <AlertTriangle size={16} />
                Report Problem with this Guide
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isReportModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
              >
                <div className="p-6 border-b border-stone-100 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-stone-900 flex items-center gap-2">
                    <AlertTriangle className="text-red-500" size={24} />
                    Report Problem
                  </h3>
                  <button
                    onClick={() => setIsReportModalOpen(false)}
                    className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-6">
                  {reportSuccess ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Send size={32} />
                      </div>
                      <h4 className="text-lg font-bold text-stone-900 mb-2">Report Sent!</h4>
                      <p className="text-stone-500">Thank you for helping us improve our guides.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-stone-600 mb-4">
                        Please describe the issue with the guide "{selectedGuide.title}". This will be sent to our team for review.
                      </p>
                      <textarea
                        value={reportDescription}
                        onChange={(e) => setReportDescription(e.target.value)}
                        placeholder="What's wrong with this guide? (e.g., inaccurate information, broken link, typo)"
                        className="w-full h-32 p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none mb-6"
                      />
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setIsReportModalOpen(false)}
                          className="px-6 py-3 text-stone-600 font-medium hover:bg-stone-100 rounded-xl transition-colors"
                          disabled={isSubmittingReport}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleReportSubmit}
                          disabled={!reportDescription.trim() || isSubmittingReport}
                          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmittingReport ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                              <Send size={18} />
                              Send Report
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
            <BookOpen size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">Garden Guides</h2>
            <p className="text-xs text-stone-500">Learn techniques to grow a better garden</p>
          </div>
          {isAdmin && guides.length === 0 && (
            <button
              onClick={handleSeedGuides}
              disabled={isSeeding}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-xl text-xs font-bold hover:bg-amber-200 transition-colors disabled:opacity-50"
            >
              {isSeeding ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
              Seed Initial Guides
            </button>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
            <input
              type="text"
              placeholder="Search guides..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                  selectedCategory === category
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                    : 'bg-white text-stone-600 border border-stone-200 hover:border-emerald-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-20 text-center">
            <Loader2 size={48} className="mx-auto text-emerald-500 animate-spin mb-4" />
            <p className="text-stone-400 font-medium">Loading guides...</p>
          </div>
        ) : filteredGuides.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-stone-50 rounded-[2.5rem] border border-stone-100">
            <BookOpen size={48} className="mx-auto text-stone-200 mb-4" />
            <p className="text-stone-400 font-medium">No guides found matching your search.</p>
          </div>
        ) : (
          filteredGuides.map((guide, idx) => (
            <motion.div
              key={guide.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              onClick={() => handleSelectGuide(guide)}
              className="group bg-white rounded-3xl border border-stone-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer overflow-hidden"
            >
              {guide.imageUrl && (
                <div className="h-40 w-full overflow-hidden">
                  <img
                    src={guide.imageUrl}
                    alt={guide.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 bg-stone-100 text-stone-500 rounded-md text-[10px] font-bold uppercase tracking-wider">
                    {guide.category}
                  </span>
                  {guide.videoUrl && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                      <PlayCircle size={12} />
                      Video
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-stone-900 mb-2 group-hover:text-emerald-600 transition-colors">
                  {guide.title}
                </h3>
                <p className="text-sm text-stone-500 line-clamp-2 mb-4">
                  {guide.description}
                </p>
                <div className="flex items-center justify-between pt-4 border-t border-stone-50">
                  <div className="flex gap-1">
                    {guide.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[10px] text-stone-400 font-medium">#{tag}</span>
                    ))}
                  </div>
                  <ChevronRight size={18} className="text-stone-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};
