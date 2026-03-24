import React, { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, Stethoscope, AlertCircle, Search, Calendar, CheckCircle2 } from 'lucide-react';
import { diagnosePlant, identifyPlant, DiagnosisResult } from '../services/gemini';
import { UserMode, InventoryItem, GardenTask } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { getPlantDisplayName } from '../utils/plantUtils';
import { supabase } from '../lib/supabase';

interface DoctorHistoryItem {
  id: string;
  timestamp: string;
  type: 'identify' | 'diagnose';
  plantName: string;
  scientificName?: string;
  result: string;
  images: string[];
  inventoryItemId?: string;
}

interface PlantDoctorProps {
  mode: UserMode;
  homeId: string;
  inventory: InventoryItem[];
}

export const PlantDoctor: React.FC<PlantDoctorProps> = ({ mode, homeId, inventory }) => {
  const [activeTab, setActiveTab] = useState<'doctor' | 'history'>('doctor');
  const [history, setHistory] = useState<DoctorHistoryItem[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [plantName, setPlantName] = useState('');
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>('');
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [loadingType, setLoadingType] = useState<'diagnose' | 'identify' | 'scheduling' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!homeId) return;
    
    const fetchHistory = async () => {
      const { data, error } = await supabase
        .from('doctor_history')
        .select('*')
        .eq('home_id', homeId)
        .order('timestamp', { ascending: false });

      if (error) {
        console.error('Error fetching history:', error);
        setError('Failed to load history.');
      } else {
        setHistory(data as DoctorHistoryItem[]);
      }
    };

    fetchHistory();
  }, [homeId]);

  const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    });
  };

  const saveToHistory = async (type: 'identify' | 'diagnose', plantName: string, result: string, currentImage: string, scientificName?: string) => {
    try {
      // Compress image for storage to avoid Firestore 1MB limit
      const compressedImage = await compressImage(currentImage);
      
      // Check for existing record with same plantName and type to link them
      const existing = history.find(h => 
        h.plantName.toLowerCase() === plantName.toLowerCase() && 
        h.type === type
      );
      
      if (existing) {
        // Update existing record with new image if not already present
        if (!existing.images.includes(compressedImage)) {
          const updatedImages = [...existing.images, compressedImage].slice(-5); // Keep last 5 images to save space
          const { error } = await supabase
            .from('doctor_history')
            .update({
              images: updatedImages,
              timestamp: new Date().toISOString()
            })
            .eq('id', existing.id);
          if (error) throw error;
        }
      } else {
        // Create new record
        const id = `${type}-${Date.now()}`;
        const newItem: any = {
          id,
          home_id: homeId,
          timestamp: new Date().toISOString(),
          type,
          plantName,
          result,
          images: [compressedImage],
        };
        
        if (scientificName) newItem.scientificName = scientificName;
        if (selectedInventoryId) newItem.inventoryItemId = selectedInventoryId;
        
        const { error } = await supabase
          .from('doctor_history')
          .insert([newItem]);
        if (error) throw error;
      }
    } catch (err) {
      console.error("Failed to save to history:", err);
      setError("Failed to save to history.");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDiagnose = async () => {
    if (!image) return;
    setLoadingType('diagnose');
    setError(null);
    setSuccessMessage(null);
    
    let effectivePlantName = plantName;
    if (selectedInventoryId) {
      const item = inventory.find(i => i.id === selectedInventoryId);
      if (item) effectivePlantName = item.plantName;
    }

    try {
      const result = await diagnosePlant(image, 'image/png', effectivePlantName, mode);
      setDiagnosis(result);
      // Extract plant name from diagnosis if not provided
      const finalName = effectivePlantName || result.diagnosis.split('\n')[0].replace(/#/g, '').trim() || 'Unknown Plant';
      await saveToHistory('diagnose', finalName, result.diagnosis, image);
    } catch (err) {
      setError('Failed to analyze image. Please try again.');
      console.error(err);
    } finally {
      setLoadingType(null);
    }
  };

  const handleIdentify = async () => {
    if (!image) return;
    setLoadingType('identify');
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await identifyPlant(image, 'image/png', mode);
      setDiagnosis({ diagnosis: result || 'Could not identify the plant.', tasks: [] });
      
      // Extract plant name from identification result
      // Usually the first line is the name
      const plantNameFromAI = result.split('\n')[0].replace(/#/g, '').trim() || 'Identified Plant';
      await saveToHistory('identify', plantNameFromAI, result, image);
    } catch (err) {
      setError('Failed to identify image. Please try again.');
      console.error(err);
    } finally {
      setLoadingType(null);
    }
  };

  const handleScheduleTasks = async () => {
    if (loadingType || !diagnosis || diagnosis.tasks.length === 0) return;
    setLoadingType('scheduling');
    setError(null);
    
    const item = inventory.find(i => i.id === selectedInventoryId);

    try {
      const seenTasks = new Set<string>();
      let scheduledCount = 0;

      for (const taskData of diagnosis.tasks) {
        const daysFromNow = Math.floor(taskData.daysFromNow || 0);
        
        // Normalize task type to match GardenTask['type']
        let taskType: GardenTask['type'] = 'Watering';
        const rawType = (taskData.type || 'Watering').toLowerCase();
        if (rawType.includes('feed')) taskType = 'Feeding';
        else if (rawType.includes('prun')) taskType = 'Pruning';
        else if (rawType.includes('harvest')) taskType = 'Harvesting';
        else taskType = 'Watering';
        
        const taskKey = `${taskType}-${daysFromNow}`;
        
        if (seenTasks.has(taskKey)) continue;
        seenTasks.add(taskKey);
        scheduledCount++;
        
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + daysFromNow);
        dueDate.setHours(9, 0, 0, 0); // Set to a consistent time (9 AM)
        
        const taskId = `${selectedInventoryId}-recovery-${taskType.toLowerCase()}-${daysFromNow}`;
        
        const { error } = await supabase
          .from('tasks')
          .upsert([{
            id: taskId,
            home_id: homeId,
            title: taskData.title || 'Recovery Task',
            description: taskData.description || '',
            status: 'Pending',
            dueDate: dueDate.toISOString(),
            type: taskType,
            inventoryItemId: selectedInventoryId || undefined,
            plantId: item?.plantId || undefined,
          }]);
        if (error) throw error;
      }
      setSuccessMessage(`Successfully scheduled ${scheduledCount} recovery tasks!`);
      setDiagnosis(prev => prev ? { ...prev, tasks: [] } : null);
    } catch (err) {
      setError('Failed to schedule tasks. Please try again.');
      console.error(err);
    } finally {
      setLoadingType(null);
    }
  };

  const reset = () => {
    setImage(null);
    setPlantName('');
    setSelectedInventoryId('');
    setDiagnosis(null);
    setError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
            <Stethoscope size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">AI Plant Doctor</h2>
            <p className="text-xs text-stone-500">Upload a photo to diagnose issues</p>
          </div>
        </div>
        
        <div className="flex bg-stone-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('doctor')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'doctor' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            Doctor
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'history' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            History ({history.length})
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'doctor' ? (
          <motion.div
            key="doctor-tab"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            {!diagnosis ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-4"
              >
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative aspect-video rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-2 overflow-hidden ${
                    image ? 'border-emerald-500' : 'border-stone-200 hover:border-emerald-300 hover:bg-emerald-50/30'
                  }`}
                >
                  {image ? (
                    <>
                      <img src={image} alt="Plant" className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setImage(null);
                        }}
                        className="absolute top-2 right-2 p-1 bg-white/80 backdrop-blur rounded-full shadow-sm hover:bg-white"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 bg-stone-50 text-stone-400 rounded-full flex items-center justify-center">
                        <Camera size={24} />
                      </div>
                      <span className="text-sm text-stone-500 font-medium">Click to upload plant photo</span>
                      <span className="text-[10px] text-stone-400 uppercase tracking-widest">JPG, PNG up to 5MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider ml-1">Link to My Plant (Optional)</label>
                    <select
                      value={selectedInventoryId}
                      onChange={(e) => {
                        setSelectedInventoryId(e.target.value);
                        if (e.target.value) setPlantName('');
                      }}
                      className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    >
                      <option value="">-- Select a plant from your garden --</option>
                      {inventory.map(item => (
                        <option key={item.id} value={item.id}>
                          {getPlantDisplayName(item)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!selectedInventoryId && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider ml-1">Or Enter Plant Name</label>
                      <input
                        type="text"
                        value={plantName}
                        onChange={(e) => setPlantName(e.target.value)}
                        placeholder="e.g. Tomato, Rose, Monstera..."
                        className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      />
                    </div>
                  )}
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-xs">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleIdentify}
                    disabled={!image || loadingType !== null}
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {loadingType === 'identify' ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Identifying...
                      </>
                    ) : (
                      <>
                        <Search size={20} />
                        Identify
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDiagnose}
                    disabled={!image || loadingType !== null}
                    className="flex-1 py-4 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {loadingType === 'diagnose' ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Stethoscope size={20} />
                        Diagnose
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4"
              >
                <div className="p-5 bg-emerald-50/50 border border-emerald-100 rounded-2xl prose prose-sm max-w-none prose-emerald">
                  <ReactMarkdown>{diagnosis.diagnosis}</ReactMarkdown>
                </div>

                {diagnosis.tasks.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <Calendar size={16} className="text-emerald-600" />
                      Recommended Recovery Tasks
                    </h3>
                    <div className="flex flex-col gap-2">
                      {diagnosis.tasks.map((task, idx) => (
                        <div key={idx} className="p-3 bg-white border border-stone-100 rounded-xl text-xs">
                          <div className="font-bold text-stone-800">{task.title}</div>
                          <div className="text-stone-500 mt-1">{task.description}</div>
                          <div className="text-[10px] text-emerald-600 font-bold uppercase mt-1">
                            {task.type} • {task.daysFromNow === 0 ? 'Today' : `In ${task.daysFromNow} days`}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleScheduleTasks}
                      disabled={loadingType === 'scheduling'}
                      className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold shadow-md hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                    >
                      {loadingType === 'scheduling' ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Scheduling...
                        </>
                      ) : (
                        <>
                          <Calendar size={18} />
                          Schedule Remedy Tasks
                        </>
                      )}
                    </button>
                  </div>
                )}

                {successMessage && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium">
                    <CheckCircle2 size={14} />
                    {successMessage}
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-xs">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                <button
                  onClick={reset}
                  className="w-full py-3 bg-stone-100 text-stone-600 rounded-xl font-semibold hover:bg-stone-200 transition-all"
                >
                  New Diagnosis
                </button>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="history-tab"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="flex flex-col gap-4"
          >
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-stone-400 gap-3">
                <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center">
                  <Stethoscope size={32} />
                </div>
                <p className="text-sm">No identification history yet</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2">
                {history.map((item) => (
                  <div key={item.id} className="bg-stone-50 border border-stone-100 rounded-2xl overflow-hidden">
                    <div className="flex gap-4 p-4">
                      <div className="flex -space-x-4 overflow-hidden">
                        {item.images.slice(0, 3).map((img, i) => (
                          <img 
                            key={i} 
                            src={img} 
                            alt="Plant" 
                            className="w-20 h-20 object-cover rounded-xl border-2 border-white shadow-sm flex-shrink-0" 
                          />
                        ))}
                        {item.images.length > 3 && (
                          <div className="w-20 h-20 bg-stone-200 rounded-xl border-2 border-white shadow-sm flex items-center justify-center text-stone-600 text-xs font-bold">
                            +{item.images.length - 3}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            item.type === 'identify' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                          }`}>
                            {item.type}
                          </span>
                          <span className="text-[10px] text-stone-400">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-stone-900 truncate">{item.plantName}</h4>
                        {item.scientificName && <p className="text-[10px] text-stone-500 italic truncate">{item.scientificName}</p>}
                        <div className="mt-2 line-clamp-2 text-xs text-stone-600">
                          <ReactMarkdown>{item.result}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setDiagnosis({ diagnosis: item.result, tasks: [] });
                        setActiveTab('doctor');
                      }}
                      className="w-full py-2 bg-stone-100 text-stone-600 text-[10px] font-bold uppercase tracking-widest hover:bg-stone-200 transition-all border-t border-stone-100"
                    >
                      View Full Report
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
