import React, { useState, useRef } from 'react';
import { X, Camera, MessageSquare, Clock, Droplets, Sun, Shovel, Calendar, CheckCircle2, Scissors, Wheat, RefreshCw, Loader2, BookOpen, PlayCircle, Trash2 } from 'lucide-react';
import { InventoryItem, Plant, GardenTask, PlantLog, Guide, HarvestRecord, YieldData, WeatherData } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { getPlantDisplayName } from '../utils/plantUtils';
import { getPlantCareGuideCombined } from '../services/plantService';
import { predictYield, analyseYieldGap } from '../services/yieldService';
import { useEffect } from 'react';

interface PlantDetailsModalProps {
  userId: string;
  item: InventoryItem;
  plant: Plant | undefined;
  tasks: GardenTask[];
  weather?: WeatherData;
  onClose: () => void;
}

export const PlantDetailsModal: React.FC<PlantDetailsModalProps> = ({ userId, item, plant, tasks, weather, onClose }) => {
  const [activeTab, setActiveTab] = useState<'care' | 'history' | 'logs' | 'guides' | 'yield'>('care');
  const [newComment, setNewComment] = useState('');
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [isUpdatingCare, setIsUpdatingCare] = useState(false);
  const [isPredictingYield, setIsPredictingYield] = useState(false);
  const [isAnalysingYield, setIsAnalysingYield] = useState(false);
  const [yieldAnalysis, setYieldAnalysis] = useState<string | null>(null);
  const [harvestAmount, setHarvestAmount] = useState('');
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().split('T')[0]);
  const [harvestUnit, setHarvestUnit] = useState('kg');
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loadingGuides, setLoadingGuides] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchGuides = async () => {
      const { data, error } = await supabase
        .from('guides')
        .select('*');
      
      if (error) {
        console.error('Error fetching guides:', error);
      } else {
        setGuides(data.map(g => ({
          id: g.id,
          title: g.title,
          description: g.description,
          content: g.content,
          imageUrl: g.image_url,
          videoUrl: g.video_url,
          category: g.category,
          tags: g.tags,
          createdAt: g.created_at
        })));
      }
      setLoadingGuides(false);
    };

    fetchGuides();
  }, []);

  const relevantGuides = guides.filter(guide => {
    const plantName = (item.plantName || '').toLowerCase();
    const displayName = getPlantDisplayName(item, false).toLowerCase();
    return (guide.tags || []).some(tag => 
      plantName.includes(tag.toLowerCase()) || 
      displayName.includes(tag.toLowerCase())
    ) || (guide.category || '').toLowerCase().includes(plantName);
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const itemTasks = tasks.filter(t => {
    if (t.inventoryItemId !== item.id) return false;
    
    const taskDate = new Date(t.dueDate);
    const taskDay = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());

    if (t.status === 'Completed') {
      if (!t.completedAt) return true;
      const diffMs = now.getTime() - new Date(t.completedAt).getTime();
      return diffMs < 24 * 60 * 60 * 1000;
    }

    // Show if due today or overdue
    return taskDay <= today;
  });

  // Deduplicate tasks for the same plant and type
  const deduplicatedTasks = itemTasks.reduce((acc: GardenTask[], current) => {
    if (current.status === 'Completed') {
      const currentDay = new Date(current.dueDate).toDateString();
      const isDuplicate = acc.some(item => 
        item.inventoryItemId === current.inventoryItemId && 
        item.type === current.type && 
        new Date(item.dueDate).toDateString() === currentDay &&
        item.status === current.status
      );
      if (!isDuplicate) {
        acc.push(current);
      }
    } else {
      // For pending tasks, only keep the oldest one for this plant and type
      const existingPendingIndex = acc.findIndex(item => 
        item.inventoryItemId === current.inventoryItemId && 
        item.type === current.type && 
        item.status !== 'Completed'
      );
      
      if (existingPendingIndex >= 0) {
        const existing = acc[existingPendingIndex];
        if (new Date(current.dueDate).getTime() < new Date(existing.dueDate).getTime()) {
          acc[existingPendingIndex] = current;
        }
      } else {
        acc.push(current);
      }
    }
    return acc;
  }, []);

  const sortedTasks = [...deduplicatedTasks].sort((a, b) => {
    if (a.status === 'Pending' && b.status !== 'Pending') return -1;
    if (a.status !== 'Pending' && b.status === 'Pending') return 1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
  const logs = item.logs || [];

  const getTaskIcon = (type: GardenTask['type']) => {
    switch (type) {
      case 'Watering': return <Droplets size={18} />;
      case 'Pruning': return <Scissors size={18} />;
      case 'Feeding': return <Shovel size={18} />;
      case 'Harvesting': return <Wheat size={18} />;
      default: return <CheckCircle2 size={18} />;
    }
  };

  const handleUpdateCareGuide = async () => {
    setIsUpdatingCare(true);
    const plantName = plant?.name || item.plantName || "Plant";
    try {
      const newGuide = await getPlantCareGuideCombined(plantName);
      if (newGuide.careGuide) {
        let plantId = plant?.id;
        
        if (!plantId) {
          // Check if a plant with this name already exists in the global collection
          const { data: existingPlants, error: fetchError } = await supabase
            .from('plants')
            .select('id')
            .or(`name.eq."${newGuide.name || plantName}",scientific_name.eq."${newGuide.scientificName || ''}"`)
            .limit(1);
          
          if (!fetchError && existingPlants && existingPlants.length > 0) {
            plantId = existingPlants[0].id;
          }

          if (!plantId) {
            // Create a new plant document if it doesn't exist
            const { data: newPlant, error: insertError } = await supabase
              .from('plants')
              .insert([{
                name: newGuide.name || plantName,
                scientific_name: newGuide.scientificName || "",
                care_guide: newGuide.careGuide,
                is_global: true
              }])
              .select()
              .single();
            
            if (insertError) throw insertError;
            plantId = newPlant.id;
          }
          
          // Link the new plant to the inventory item
          const { error: updateItemError } = await supabase
            .from('inventory_items')
            .update({ plant_id: plantId })
            .eq('id', item.id);
          
          if (updateItemError) throw updateItemError;
        } else {
          // Update existing plant
          const { error: updatePlantError } = await supabase
            .from('plants')
            .update({
              care_guide: newGuide.careGuide,
              scientific_name: newGuide.scientificName || plant.scientificName
            })
            .eq('id', plantId);
          
          if (updatePlantError) throw updatePlantError;
        }
      }
    } catch (error) {
      console.error('Error updating care guide:', error);
    } finally {
      setIsUpdatingCare(false);
    }
  };

  const handlePredictYield = async () => {
    if (!plant) return;
    setIsPredictingYield(true);
    try {
      const prediction = await predictYield(item, plant, weather);
      const yieldData: YieldData = {
        ...item.yieldData,
        predictedYield: prediction.predictedYield,
        predictedUnit: prediction.predictedUnit,
        predictionReasoning: prediction.reasoning,
        lastPredictionDate: new Date().toISOString()
      };
      
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ yield_data: yieldData })
        .eq('id', item.id);
      
      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error predicting yield:', error);
    } finally {
      setIsPredictingYield(false);
    }
  };

  const handleSaveHarvest = async () => {
    if (!harvestAmount) return;
    try {
      const newHarvest: HarvestRecord = {
        id: Math.random().toString(36).substr(2, 9),
        date: harvestDate,
        amount: parseFloat(harvestAmount),
        unit: harvestUnit
      };
      const yieldData: YieldData = {
        ...item.yieldData,
        harvests: [...(item.yieldData?.harvests || []), newHarvest]
      };
      
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ yield_data: yieldData })
        .eq('id', item.id);
      
      if (updateError) throw updateError;
      setHarvestAmount('');
    } catch (error) {
      console.error('Error saving harvest:', error);
    }
  };

  const handleAnalyseYield = async () => {
    if (!plant || !item.yieldData?.predictedYield) return;
    setIsAnalysingYield(true);
    const totalActual = (item.yieldData.harvests || []).reduce((sum, h) => sum + h.amount, 0);
    try {
      const analysis = await analyseYieldGap(item, plant, item.yieldData.predictedYield, totalActual, weather);
      setYieldAnalysis(analysis);
    } catch (error) {
      console.error('Error analysing yield:', error);
    } finally {
      setIsAnalysingYield(false);
    }
  };

  const handleDelete = async () => {
    try {
      // 1. Delete the inventory item
      const { error: deleteItemError } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', item.id);
      
      if (deleteItemError) throw deleteItemError;
      
      // 2. Delete associated tasks
      const { error: deleteTasksError } = await supabase
        .from('tasks')
        .delete()
        .eq('inventory_item_id', item.id);
      
      if (deleteTasksError) throw deleteTasksError;
      
      onClose();
    } catch (error) {
      console.error('Error deleting plant and tasks:', error);
    }
  };

  const handleAddLog = async (type: 'comment' | 'picture', content: string) => {
    setIsAddingLog(true);
    try {
      const newLog: PlantLog = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        content,
        createdAt: new Date().toISOString(),
      };
      
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({
          logs: [...logs, newLog]
        })
        .eq('id', item.id);
      
      if (updateError) throw updateError;
      setNewComment('');
    } catch (error) {
      console.error('Error adding log:', error);
    } finally {
      setIsAddingLog(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        handleAddLog('picture', dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">{getPlantDisplayName(item)}</h2>
            <p className="text-sm text-stone-500">Planted {item.plantedAt ? new Date(item.plantedAt).toLocaleDateString() : 'Unknown'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all">
              <Trash2 size={24} />
            </button>
            <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded-full transition-all">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex border-b border-stone-100 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('care')}
            className={`flex-1 min-w-[100px] py-4 text-[10px] sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'care' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-stone-400 hover:text-stone-600'}`}
          >
            Care Guide
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex-1 min-w-[100px] py-4 text-[10px] sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'logs' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-stone-400 hover:text-stone-600'}`}
          >
            Logs & Photos
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 min-w-[100px] py-4 text-[10px] sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'history' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-stone-400 hover:text-stone-600'}`}
          >
            Tasks
          </button>
          {(item.status === 'Planted' || plant?.careGuide?.harvestMonth) && (
            <button
              onClick={() => setActiveTab('yield')}
              className={`flex-1 min-w-[100px] py-4 text-[10px] sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'yield' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-stone-400 hover:text-stone-600'}`}
            >
              Yield
            </button>
          )}
          <button
            onClick={() => setActiveTab('guides')}
            className={`flex-1 min-w-[100px] py-4 text-[10px] sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'guides' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-stone-400 hover:text-stone-600'}`}
          >
            Guides {relevantGuides.length > 0 && `(${relevantGuides.length})`}
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-stone-50/50">
          {activeTab === 'care' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-stone-900">Care Guide</h3>
                <button
                  onClick={handleUpdateCareGuide}
                  disabled={isUpdatingCare}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
                >
                  {isUpdatingCare ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {plant ? 'Update with AI' : 'Link with AI'}
                </button>
              </div>
              {plant?.careGuide ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 bg-amber-50 rounded-2xl flex flex-col gap-2">
                    <Sun className="text-amber-500" size={20} />
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">Sun</span>
                    <p className="text-sm text-amber-800">{plant.careGuide.sun}</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-2xl flex flex-col gap-2">
                    <Droplets className="text-blue-500" size={20} />
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">Water</span>
                    <p className="text-sm text-blue-800">{plant.careGuide.water}</p>
                  </div>
                  <div className="p-4 bg-stone-100 rounded-2xl flex flex-col gap-2">
                    <Shovel className="text-stone-500" size={20} />
                    <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">Soil</span>
                    <p className="text-sm text-stone-800">{plant.careGuide.soil}</p>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-2xl flex flex-col gap-2">
                    <Calendar className="text-emerald-500" size={20} />
                    <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Planting</span>
                    <p className="text-sm text-emerald-800">{plant.careGuide.plantingMonth}</p>
                  </div>
                  {plant.careGuide.harvestMonth && (
                    <div className="p-4 bg-orange-50 rounded-2xl flex flex-col gap-2 col-span-2 sm:col-span-4">
                      <Wheat className="text-orange-500" size={20} />
                      <span className="text-xs font-bold text-orange-900 uppercase tracking-wider">Harvesting</span>
                      <p className="text-sm text-orange-800">{plant.careGuide.harvestMonth}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-stone-500 text-center py-8">No care guide available for this plant.</p>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="flex flex-col gap-6">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={() => handleAddLog('comment', newComment)}
                  disabled={!newComment.trim() || isAddingLog}
                  className="px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all"
                >
                  Post
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAddingLog}
                  className="px-4 py-3 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-all"
                  title="Attach Photo"
                >
                  <Camera size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {logs.length === 0 ? (
                  <p className="text-stone-400 text-center py-8">No logs or photos yet.</p>
                ) : (
                  [...logs].reverse().map(log => (
                    <div key={log.id} className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                      <div className="flex items-center gap-2 text-xs text-stone-400 mb-3">
                        <Clock size={12} />
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                      {log.type === 'comment' ? (
                        <p className="text-stone-700">{log.content}</p>
                      ) : (
                        <img src={log.content} alt="Plant log" className="rounded-xl max-h-64 object-cover" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="flex flex-col gap-4">
              {sortedTasks.length === 0 ? (
                <p className="text-stone-400 text-center py-8">No tasks recorded for this plant.</p>
              ) : (
                sortedTasks.map(task => (
                  <div key={task.id} className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${task.status === 'Completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-50 text-stone-400'}`}>
                        {getTaskIcon(task.type)}
                      </div>
                      <div>
                        <h4 className={`font-bold ${task.status === 'Completed' ? 'text-stone-900' : 'text-stone-500'}`}>
                          {`${task.type} ${getPlantDisplayName(item)}`}
                        </h4>
                        <p className="text-xs text-stone-400">Due: {new Date(task.dueDate).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-lg ${task.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                      {task.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'yield' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-stone-900">Yield Prediction</h3>
                <button
                  onClick={handlePredictYield}
                  disabled={isPredictingYield}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-50"
                >
                  {isPredictingYield ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Predict with AI
                </button>
              </div>

              {item.yieldData?.lastPredictionDate ? (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Predicted Yield</span>
                    <span className="text-xs text-emerald-600 font-medium">Updated {new Date(item.yieldData.lastPredictionDate).toLocaleDateString()}</span>
                  </div>
                  <div className="text-3xl font-bold text-emerald-900 mb-2">
                    {item.yieldData.predictedYield} <span className="text-lg font-medium">{item.yieldData.predictedUnit}</span>
                  </div>
                  <p className="text-sm text-emerald-800 italic">"{item.yieldData.predictionReasoning}"</p>
                </div>
              ) : (
                <div className="p-8 bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-center">
                  <p className="text-stone-500 mb-4">No prediction yet. Use AI to estimate your harvest.</p>
                </div>
              )}

              <div className="pt-6 border-t border-stone-100">
                <h3 className="text-lg font-bold text-stone-900 mb-4">Record Harvest</h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="number"
                    value={harvestAmount}
                    onChange={(e) => setHarvestAmount(e.target.value)}
                    placeholder="Amount"
                    className="flex-1 px-4 py-2 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <select
                    value={harvestUnit}
                    onChange={(e) => setHarvestUnit(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="items">items</option>
                    <option value="lbs">lbs</option>
                  </select>
                  <input
                    type="date"
                    value={harvestDate}
                    onChange={(e) => setHarvestDate(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  />
                  <button
                    onClick={handleSaveHarvest}
                    disabled={!harvestAmount}
                    className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all"
                  >
                    Save
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {(item.yieldData?.harvests || []).length > 0 ? (
                    [...(item.yieldData?.harvests || [])].reverse().map(h => (
                      <div key={h.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-stone-100 shadow-sm">
                        <div className="flex items-center gap-3">
                          <Wheat size={16} className="text-amber-500" />
                          <span className="font-bold text-stone-900">{h.amount} {h.unit}</span>
                        </div>
                        <span className="text-xs text-stone-400">{new Date(h.date).toLocaleDateString()}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-stone-400 text-center py-4">No harvests recorded yet.</p>
                  )}
                </div>
              </div>

              {item.yieldData?.predictedYield && (item.yieldData.harvests || []).length > 0 && (
                <div className="pt-6 border-t border-stone-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-stone-900">Yield Analysis</h3>
                    <button
                      onClick={handleAnalyseYield}
                      disabled={isAnalysingYield}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
                    >
                      {isAnalysingYield ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                      Analyse with AI
                    </button>
                  </div>

                  {yieldAnalysis && (
                    <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                      <p className="text-sm text-blue-800 leading-relaxed">{yieldAnalysis}</p>
                    </div>
                  )}
                  
                  {!yieldAnalysis && (item.yieldData.harvests || []).reduce((sum, h) => sum + h.amount, 0) < item.yieldData.predictedYield && (
                    <p className="text-xs text-stone-500 italic">
                      Your actual yield is lower than predicted. Use AI to understand why.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'guides' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-stone-900">Recommended Guides</h3>
                <BookOpen size={20} className="text-stone-400" />
              </div>
              
              {loadingGuides ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="animate-spin text-emerald-600 mb-4" size={32} />
                  <p className="text-stone-500 font-medium">Loading guides...</p>
                </div>
              ) : relevantGuides.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {relevantGuides.map(guide => (
                    <div 
                      key={guide.id}
                      className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm flex gap-4 hover:border-emerald-200 transition-all cursor-pointer group"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('navigate-to-guide', { detail: guide.id }));
                        onClose();
                      }}
                    >
                      <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 bg-stone-100 relative">
                        <img 
                          src={guide.imageUrl} 
                          alt={guide.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                        />
                        {guide.videoUrl && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <PlayCircle size={24} className="text-white drop-shadow-md" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">{guide.category}</span>
                        <h4 className="font-bold text-stone-900 group-hover:text-emerald-600 transition-colors">{guide.title}</h4>
                        <p className="text-xs text-stone-500 line-clamp-2 mt-1">{guide.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-stone-50 rounded-3xl border border-dashed border-stone-200">
                  <BookOpen size={48} className="text-stone-200 mx-auto mb-4" />
                  <p className="text-stone-500 font-medium">No specific guides for this plant yet.</p>
                  <button 
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('navigate-to-tab', { detail: 'guides' }));
                      onClose();
                    }}
                    className="mt-4 text-emerald-600 font-bold text-sm hover:underline"
                  >
                    Browse all guides
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
