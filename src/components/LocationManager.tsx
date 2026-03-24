import React, { useState } from 'react';
import { MapPin, Plus, Loader2, X, Trash2, Edit2, Globe, Home, Sun } from 'lucide-react';
import { Location, Area } from '../types';
import { supabase } from '../lib/supabase';
import { geocodeAddress } from '../services/weather';
import { motion, AnimatePresence } from 'motion/react';

interface LocationManagerProps {
  userId: string;
  homeId: string;
  locations: Location[];
}

export const LocationManager: React.FC<LocationManagerProps> = ({ userId, homeId, locations }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaType, setNewAreaType] = useState<'inside' | 'outside'>('outside');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddArea = () => {
    if (!newAreaName.trim()) return;
    const newArea: Area = {
      id: Math.random().toString(36).substr(2, 9),
      name: newAreaName.trim(),
      type: newAreaType,
    };
    setAreas([...areas, newArea]);
    setNewAreaName('');
  };

  const handleRemoveArea = (id: string) => {
    setAreas(areas.filter(a => a.id !== id));
  };

  const handleSave = async () => {
    if (!name || !address) return;
    setLoading(true);
    setError(null);
    try {
      const coords = await geocodeAddress(address);
      if (!coords) {
        setError('Could not find address. Please be more specific.');
        setLoading(false);
        return;
      }

      const locationData = {
        name,
        address,
        lat: coords.lat,
        lng: coords.lon,
        areas,
        home_id: homeId,
      };

      if (editingLocation) {
        const { error: updateError } = await supabase
          .from('locations')
          .update(locationData)
          .eq('id', editingLocation.id);
        
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('locations')
          .insert([locationData]);
        
        if (insertError) throw insertError;
      }
      resetForm();
    } catch (err: any) {
      console.error('Error saving location:', err);
      setError(err.message || 'Failed to save location.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('locations')
        .delete()
        .eq('id', id);
      
      if (deleteError) throw deleteError;
      setDeletingId(null);
    } catch (err: any) {
      console.error('Error deleting location:', err);
      setError(err.message || 'Failed to delete location.');
    }
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingLocation(null);
    setName('');
    setAddress('');
    setAreas([]);
    setNewAreaName('');
    setError(null);
  };

  const startEdit = (loc: Location) => {
    setEditingLocation(loc);
    setName(loc.name);
    setAddress(loc.address);
    setAreas(loc.areas || []);
    setIsAdding(true);
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-100">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <MapPin size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">My Locations</h2>
            <p className="text-xs text-stone-500">Manage your growing spaces</p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {locations.length === 0 ? (
          <div className="py-8 text-center bg-stone-50 rounded-2xl border border-stone-100">
            <p className="text-sm text-stone-400">No locations added yet.</p>
          </div>
        ) : (
          locations.map(loc => (
            <motion.div
              key={loc.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-between group"
            >
              <div className="flex flex-col">
                <span className="text-sm font-bold text-stone-900">{loc.name}</span>
                <span className="text-[10px] text-stone-400 uppercase tracking-widest truncate max-w-[150px]">
                  {loc.address}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => startEdit(loc)}
                  className="p-2 text-stone-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => setDeletingId(loc.id)}
                  className="p-2 text-stone-400 hover:text-red-600 hover:bg-white rounded-lg transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {deletingId && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-stone-900 mb-2">Delete Location?</h3>
              <p className="text-sm text-stone-500 mb-8">
                This will permanently remove this location and all its settings. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-bold hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deletingId)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isAdding && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-stone-900">
                  {editingLocation ? 'Edit Location' : 'Add Location'}
                </h3>
                <button onClick={resetForm} className="p-2 hover:bg-stone-100 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider ml-1">Location Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Back Garden, Allotment Plot 4"
                    className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider ml-1">Address</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. 123 Garden St, London"
                      className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1 ml-1 italic">Used for accurate weather forecasts.</p>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider ml-1">Areas</label>
                  <div className="flex flex-col gap-2">
                    {areas.map(area => (
                      <div key={area.id} className="flex items-center justify-between p-2 bg-stone-50 border border-stone-100 rounded-lg">
                        <div className="flex items-center gap-2">
                          {area.type === 'inside' ? (
                            <div className="flex items-center gap-1.5">
                              <Home size={14} className="text-blue-500" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Inside</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Sun size={14} className="text-orange-500" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">Outside</span>
                            </div>
                          )}
                          <span className="text-sm font-medium text-stone-700">{area.name}</span>
                        </div>
                        <button onClick={() => handleRemoveArea(area.id)} className="text-stone-400 hover:text-red-500 p-1 transition-colors">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      value={newAreaName}
                      onChange={(e) => setNewAreaName(e.target.value)}
                      placeholder="e.g. Greenhouse"
                      className="flex-1 p-2 bg-stone-50 border border-stone-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
                    />
                    <div className="flex bg-stone-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setNewAreaType('outside')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${newAreaType === 'outside' ? 'bg-white text-orange-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                      >
                        Outside
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewAreaType('inside')}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${newAreaType === 'inside' ? 'bg-white text-blue-600 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                      >
                        Inside
                      </button>
                    </div>
                    <button
                      onClick={handleAddArea}
                      disabled={!newAreaName.trim()}
                      className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={!name || !address || loading}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Save Location'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
