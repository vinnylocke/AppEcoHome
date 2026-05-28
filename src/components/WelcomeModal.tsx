import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Sprout, MapPin, Repeat, X, Leaf } from "lucide-react";
import { IconAI } from "../constants/icons";
import { supabase } from "../lib/supabase";
import type { OnboardingState } from "../onboarding/types";
import { useFocusTrap } from "../hooks/useFocusTrap";
import type { UserProfile } from "../types";

interface Props {
  userId: string;
  onboardingState: OnboardingState;
  onStateChange: (state: OnboardingState) => void;
  onClose: () => void;
  /** Optional callback fired after persona + welcomed_at are saved.
   *  Lets the parent refresh its local profile copy without a full
   *  reload. */
  onPersonaSaved?: (persona: UserProfile["persona"]) => void;
}

const WELCOME_KEY = "welcome_modal";

interface Slide {
  title: string;
  body: React.ReactNode;
  icon: React.ReactNode;
  illustration?: React.ReactNode;
}

const HierarchyDiagram = () => (
  <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-4 text-rhozly-on-surface/80">
    <div className="flex flex-col items-center gap-1 bg-white border border-rhozly-outline/30 rounded-2xl px-3 py-2 shadow-sm">
      <MapPin size={18} className="text-emerald-600" />
      <span className="text-[10px] font-black uppercase tracking-widest">Location</span>
      <span className="text-[10px] text-rhozly-on-surface/50">Back Garden</span>
    </div>
    <ChevronRight size={14} className="text-rhozly-on-surface/30 shrink-0" />
    <div className="flex flex-col items-center gap-1 bg-white border border-rhozly-outline/30 rounded-2xl px-3 py-2 shadow-sm">
      <div className="w-[18px] h-[18px] rounded-md bg-teal-100 border border-teal-300" />
      <span className="text-[10px] font-black uppercase tracking-widest">Area</span>
      <span className="text-[10px] text-rhozly-on-surface/50">Veg Bed</span>
    </div>
    <ChevronRight size={14} className="text-rhozly-on-surface/30 shrink-0" />
    <div className="flex flex-col items-center gap-1 bg-white border border-rhozly-outline/30 rounded-2xl px-3 py-2 shadow-sm">
      <Sprout size={18} className="text-rhozly-primary" />
      <span className="text-[10px] font-black uppercase tracking-widest">Plant</span>
      <span className="text-[10px] text-rhozly-on-surface/50">Tomato</span>
    </div>
  </div>
);

const TaskFlowDiagram = () => (
  <div className="flex items-center justify-center gap-3 mt-4">
    <div className="flex flex-col items-center gap-1">
      <div className="bg-rhozly-primary/10 p-2.5 rounded-xl">
        <Repeat size={20} className="text-rhozly-primary" />
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/60">Set Once</span>
    </div>
    <ChevronRight size={14} className="text-rhozly-on-surface/30" />
    <div className="flex gap-1.5 items-center">
      {["💧", "✂️", "🌿"].map((emoji, i) => (
        <div
          key={i}
          className="bg-white border border-rhozly-outline/30 rounded-xl px-2.5 py-1.5 text-base shadow-sm"
        >
          {emoji}
        </div>
      ))}
    </div>
  </div>
);

const SLIDES: Slide[] = [
  {
    title: "Welcome to Rhozly",
    body: "A personal gardening assistant that helps you set up your garden, look after your plants, and keep them thriving — all in one place.",
    icon: <Sprout size={32} className="text-rhozly-primary" />,
  },
  {
    title: "Your garden, organised",
    body: "Group your plants by where they grow: each Location holds Areas, and each Area holds Plants.",
    icon: <MapPin size={32} className="text-emerald-600" />,
    illustration: <HierarchyDiagram />,
  },
  {
    title: "Tasks that run themselves",
    body: "Set up a Task Schedule once — watering, pruning, harvesting — and Rhozly reminds you exactly when each plant needs attention.",
    icon: <Repeat size={32} className="text-indigo-600" />,
    illustration: <TaskFlowDiagram />,
  },
  // Slide 4: persona capture. Body is rendered by the modal itself
  // when slideIdx === 3 so it can hold interactive state — `body`
  // here is a placeholder hidden by the persona-slide branch.
  {
    title: "Quick question first",
    body: "We'll tune the app to suit you. Are you new to gardening, or already experienced?",
    icon: <Leaf size={32} className="text-rhozly-primary" />,
  },
  {
    title: "Let's get started",
    body: "The Garden Quiz takes about two minutes and helps Rhozly tailor plant suggestions and reminders to your garden, time, and experience.",
    icon: <IconAI size={32} className="text-amber-500" />,
  },
];

export default function WelcomeModal({ userId, onboardingState, onStateChange, onClose, onPersonaSaved }: Props) {
  const navigate = useNavigate();
  const [slideIdx, setSlideIdx] = useState(0);
  const [persona, setPersona] = useState<UserProfile["persona"]>(null);
  const slide = SLIDES[slideIdx];
  const isLast = slideIdx === SLIDES.length - 1;
  // Slide 3 (zero-indexed) is the persona-capture slide; it renders a
  // dedicated UI rather than the generic body+illustration shape.
  const isPersonaSlide = slideIdx === 3;
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  const recordCompletion = async (status: "completed" | "dismissed") => {
    const next: OnboardingState = { ...onboardingState, [WELCOME_KEY]: status };
    onStateChange(next);
    // Persist alongside the persona + welcomed_at timestamp in a
    // single update so we never end up with partially-applied state.
    await supabase
      .from("user_profiles")
      .update({
        onboarding_state: next,
        welcomed_at: new Date().toISOString(),
        persona,
      })
      .eq("uid", userId);
    onPersonaSaved?.(persona);
  };

  const handleStartQuiz = async () => {
    await recordCompletion("completed");
    onClose();
    navigate("/profile");
  };

  const handleSkip = async () => {
    await recordCompletion("dismissed");
    onClose();
  };

  return (
    <div
      data-testid="welcome-modal"
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300"
    >
      <div
        ref={trapRef}
        className="bg-rhozly-bg rounded-3xl w-full max-w-md shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in zoom-in-95 duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
      >
        {/* Close button */}
        <button
          data-testid="welcome-modal-close"
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface/70 hover:bg-rhozly-surface-low transition-colors"
          aria-label="Close welcome"
        >
          <X size={18} />
        </button>

        {/* Slide content */}
        <div
          key={slideIdx}
          className="px-6 sm:px-10 pt-12 pb-8 flex flex-col items-center text-center min-h-[380px] animate-in fade-in slide-in-from-right-2 duration-300"
        >
          <div className="bg-white border border-rhozly-outline/15 p-4 rounded-3xl shadow-sm">
            {slide.icon}
          </div>
          <h2
            id="welcome-modal-title"
            className="font-display font-black text-2xl text-rhozly-on-surface mt-6"
          >
            {slide.title}
          </h2>
          <p className="text-sm text-rhozly-on-surface/65 mt-3 leading-relaxed max-w-sm">
            {slide.body}
          </p>
          {slide.illustration && <div className="w-full">{slide.illustration}</div>}
          {isPersonaSlide && (
            <div className="w-full grid grid-cols-2 gap-3 mt-5">
              <PersonaCard
                value="new"
                active={persona === "new"}
                onSelect={() => setPersona("new")}
                icon={<Sprout size={22} />}
                title="New to gardening"
                subtitle="More tips, less jargon"
              />
              <PersonaCard
                value="experienced"
                active={persona === "experienced"}
                onSelect={() => setPersona("experienced")}
                icon={<Leaf size={22} />}
                title="Experienced"
                subtitle="Terser copy, fewer tooltips"
              />
              <p className="col-span-2 text-[10px] font-bold uppercase tracking-widest text-rhozly-on-surface/35 text-center mt-1">
                You can change this anytime in your profile.
              </p>
            </div>
          )}
        </div>

        {/* Dots + controls */}
        <div className="px-6 sm:px-10 pb-6">
          <div className="flex items-center justify-center gap-1.5 mb-5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                data-testid={`welcome-dot-${i}`}
                onClick={() => setSlideIdx(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === slideIdx
                    ? "bg-rhozly-primary w-6"
                    : "bg-rhozly-on-surface/15 w-1.5 hover:bg-rhozly-on-surface/30"
                }`}
              />
            ))}
          </div>

          {!isLast ? (
            <div className="flex items-center justify-between gap-2">
              <button
                data-testid="welcome-prev"
                onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
                disabled={slideIdx === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-2xl text-sm font-bold text-rhozly-on-surface/60 hover:text-rhozly-primary hover:bg-rhozly-surface-low disabled:opacity-0 disabled:pointer-events-none transition"
              >
                <ChevronLeft size={16} />
                Back
              </button>
              <button
                data-testid="welcome-next"
                onClick={() => setSlideIdx((i) => Math.min(SLIDES.length - 1, i + 1))}
                className="flex items-center gap-1.5 bg-rhozly-primary text-white px-5 py-2.5 min-h-[44px] rounded-2xl text-sm font-black hover:opacity-90 transition shadow-sm"
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                data-testid="welcome-start-quiz"
                onClick={handleStartQuiz}
                className="bg-rhozly-primary text-white px-5 py-3 min-h-[48px] rounded-2xl text-sm font-black hover:opacity-90 transition shadow-sm"
              >
                Take the Garden Quiz (2 min)
              </button>
              <button
                data-testid="welcome-skip"
                onClick={handleSkip}
                className="text-rhozly-on-surface/50 hover:text-rhozly-on-surface px-5 py-2.5 min-h-[44px] rounded-2xl text-sm font-bold transition"
              >
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonaCard({
  value,
  active,
  onSelect,
  icon,
  title,
  subtitle,
}: {
  value: "new" | "experienced";
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`welcome-persona-${value}`}
      className={`p-4 rounded-2xl border-2 text-left transition-all ${
        active
          ? "bg-rhozly-primary/10 border-rhozly-primary shadow-md scale-[1.02]"
          : "bg-white border-rhozly-outline/15 hover:border-rhozly-primary/30 hover:shadow-sm"
      }`}
    >
      <div
        className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-2 ${
          active ? "bg-rhozly-primary text-white" : "bg-rhozly-surface-low text-rhozly-primary"
        }`}
      >
        {icon}
      </div>
      <p className="font-black text-sm text-rhozly-on-surface leading-tight">{title}</p>
      <p className="text-[11px] text-rhozly-on-surface/55 leading-snug mt-1">{subtitle}</p>
    </button>
  );
}
