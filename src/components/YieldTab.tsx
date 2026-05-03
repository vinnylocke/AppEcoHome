import React, { useState, useEffect } from "react";
import { Plus, Loader2, Trash2, Lock, Calendar, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  fetchYieldRecords,
  insertYieldRecord,
  deleteYieldRecord,
  updateExpectedHarvestDate,
  validateYieldValue,
} from "../services/yieldService";
import YieldPredictionCard from "./YieldPredictionCard";
import type { YieldRecord, YieldPrediction } from "../types";
import toast from "react-hot-toast";

const UNIT_OPTIONS = ["g", "kg", "lbs", "oz", "items", "bunches", "Other…"] as const;

interface YieldTabProps {
  instanceId: string;
  homeId: string;
  plantedAt: string | null;
  aiEnabled: boolean;
  instance: any;
}

export default function YieldTab({
  instanceId,
  homeId,
  aiEnabled,
  instance,
}: YieldTabProps) {
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("kg");
  const [customUnit, setCustomUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [valueError, setValueError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [records, setRecords] = useState<YieldRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);

  const [expectedHarvestDate, setExpectedHarvestDate] = useState<string>(
    instance.expected_harvest_date ?? "",
  );
  const [savingHarvestDate, setSavingHarvestDate] = useState(false);

  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<YieldPrediction | null>(null);

  const resolvedUnit = unit === "Other…" ? customUnit : unit;

  // Load history on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingRecords(true);
    fetchYieldRecords(instanceId)
      .then((data) => { if (!cancelled) setRecords(data); })
      .catch(() => { if (!cancelled) toast.error("Failed to load yield history."); })
      .finally(() => { if (!cancelled) setLoadingRecords(false); });
    return () => { cancelled = true; };
  }, [instanceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateYieldValue(value);
    if (err) { setValueError(err); return; }
    if (unit === "Other…" && !customUnit.trim()) {
      toast.error("Please enter a unit.");
      return;
    }
    setValueError(null);
    setSubmitting(true);
    try {
      const record = await insertYieldRecord({
        home_id: homeId,
        instance_id: instanceId,
        value: parseFloat(value),
        unit: resolvedUnit,
        notes: notes.trim() || null,
      });
      setRecords((prev) => [record, ...prev]);
      setValue("");
      setNotes("");
      toast.success("Yield logged.");
    } catch {
      toast.error("Failed to log yield.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteYieldRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast.error("Failed to delete record.");
    }
  };

  const handleHarvestDateBlur = async () => {
    setSavingHarvestDate(true);
    try {
      await updateExpectedHarvestDate(instanceId, expectedHarvestDate || null);
    } catch {
      toast.error("Failed to save harvest date.");
    } finally {
      setSavingHarvestDate(false);
    }
  };

  const handlePredict = async () => {
    setPredicting(true);
    setPrediction(null);
    try {
      const { data, error } = await supabase.functions.invoke("predict-yield", {
        body: { instance_id: instanceId, home_id: homeId },
      });
      if (error) throw error;
      setPrediction(data as YieldPrediction);
    } catch (err: any) {
      console.error("[predict-yield] error:", err?.message ?? err);
      toast.error("Failed to get yield prediction. Please try again.");
    } finally {
      setPredicting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* ── Add Yield Form ───────────────────────────────────── */}
      <section>
        <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest mb-4">
          Log a Harvest
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-3">
            {/* Value */}
            <div className="flex-1">
              <label className="text-xs font-black text-rhozly-on-surface/60 uppercase tracking-widest block mb-1.5">
                Amount
              </label>
              <input
                data-testid="yield-value-input"
                type="number"
                min="0.001"
                step="any"
                placeholder="e.g. 0.5"
                value={value}
                onChange={(e) => { setValue(e.target.value); setValueError(null); }}
                className="w-full bg-rhozly-surface rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface placeholder-rhozly-on-surface/30 border border-rhozly-outline/20 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40"
              />
              {valueError && (
                <p data-testid="yield-value-error" className="text-xs font-bold text-red-500 mt-1">
                  {valueError}
                </p>
              )}
            </div>
            {/* Unit */}
            <div className="w-36">
              <label className="text-xs font-black text-rhozly-on-surface/60 uppercase tracking-widest block mb-1.5">
                Unit
              </label>
              <select
                data-testid="yield-unit-select"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-rhozly-surface rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {unit === "Other…" && (
            <input
              data-testid="yield-custom-unit-input"
              type="text"
              placeholder="Enter unit (e.g. trays)"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              className="w-full bg-rhozly-surface rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface placeholder-rhozly-on-surface/30 border border-rhozly-outline/20 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40"
            />
          )}

          <div>
            <label className="text-xs font-black text-rhozly-on-surface/60 uppercase tracking-widest block mb-1.5">
              Notes <span className="font-bold normal-case tracking-normal text-rhozly-on-surface/30">(optional)</span>
            </label>
            <textarea
              data-testid="yield-notes-input"
              rows={2}
              placeholder="Any observations about this harvest…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-rhozly-surface rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface placeholder-rhozly-on-surface/30 border border-rhozly-outline/20 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40 resize-none"
            />
          </div>

          <button
            data-testid="yield-log-button"
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-3 min-h-[44px] bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Log Yield
          </button>
        </form>
      </section>

      {/* ── Yield History ────────────────────────────────────── */}
      <section>
        <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-3">
          Harvest History
        </p>

        {loadingRecords ? (
          <div className="flex items-center gap-2 text-rhozly-on-surface/40 py-4">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs font-bold">Loading history…</span>
          </div>
        ) : records.length === 0 ? (
          <p
            data-testid="yield-empty-history"
            className="text-xs font-bold text-rhozly-on-surface/30 py-4"
          >
            No harvests logged yet.
          </p>
        ) : (
          <ul data-testid="yield-history-list" className="space-y-2">
            {records.map((record) => (
              <li
                key={record.id}
                data-testid={`yield-record-${record.id}`}
                className="flex items-start justify-between gap-3 bg-rhozly-surface rounded-2xl px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-rhozly-on-surface">
                    <span data-testid="yield-record-value">{record.value}</span>{" "}
                    <span data-testid="yield-record-unit">{record.unit}</span>
                  </p>
                  {record.notes && (
                    <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-snug">
                      {record.notes}
                    </p>
                  )}
                  <p
                    data-testid="yield-record-date"
                    className="text-[10px] font-bold text-rhozly-on-surface/30 mt-1"
                  >
                    {new Date(record.harvested_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <button
                  data-testid={`yield-delete-${record.id}`}
                  onClick={() => handleDelete(record.id)}
                  aria-label="Delete yield record"
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-rhozly-on-surface/30 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Yield Predictor ──────────────────────────────────── */}
      <section>
        <div className="border-t border-rhozly-outline/20 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={14} className="text-rhozly-primary" />
            <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest">
              Yield Predictor
            </p>
          </div>

          {!aiEnabled ? (
            <div
              data-testid="yield-predictor-paywall"
              className="bg-rhozly-surface rounded-3xl border border-rhozly-outline/20 p-6 text-center"
            >
              <div className="w-10 h-10 bg-rhozly-on-surface/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Lock size={18} className="text-rhozly-on-surface/30" />
              </div>
              <p className="font-black text-rhozly-on-surface text-sm mb-1">
                AI Tier Required
              </p>
              <p className="text-xs font-bold text-rhozly-on-surface/50 leading-relaxed">
                Upgrade to AI tier to unlock yield predictions powered by weather
                data, planting history, and past harvests.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Expected harvest date */}
              <div>
                <label className="text-xs font-black text-rhozly-on-surface/60 uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
                  <Calendar size={12} />
                  Expected Harvest Date
                  {savingHarvestDate && (
                    <Loader2 size={11} className="animate-spin text-rhozly-primary ml-1" />
                  )}
                </label>
                <input
                  data-testid="yield-harvest-date-input"
                  type="date"
                  value={expectedHarvestDate}
                  onChange={(e) => setExpectedHarvestDate(e.target.value)}
                  onBlur={handleHarvestDateBlur}
                  className="w-full bg-rhozly-surface rounded-2xl px-4 py-3 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/40"
                />
              </div>

              {/* Predict button */}
              <button
                data-testid="yield-predict-button"
                onClick={handlePredict}
                disabled={predicting}
                className="flex items-center gap-2 px-5 py-3 min-h-[44px] bg-gradient-to-r from-rhozly-primary to-violet-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {predicting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Predicting…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Predict Yield
                  </>
                )}
              </button>

              {/* Prediction result */}
              {prediction && (
                <YieldPredictionCard
                  prediction={prediction}
                  onDismiss={() => setPrediction(null)}
                />
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
