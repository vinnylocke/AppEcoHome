import Shepherd from "shepherd.js";
import type { FlowDef } from "./types";

// Four panels that together cover everything EXCEPT the target spotlight.
// Using separate divs instead of a single clip-path polygon avoids browser
// inconsistencies where backdrop-filter + clip-path interact unexpectedly.
const PANEL_IDS = [
  "rhozly-blur-top",
  "rhozly-blur-bottom",
  "rhozly-blur-left",
  "rhozly-blur-right",
] as const;

const PAD = 14;
const BLUR = "blur(4px) brightness(0.82)";

function createPanels() {
  PANEL_IDS.forEach((id) => {
    if (document.getElementById(id)) return;
    const el = document.createElement("div");
    el.id = id;
    Object.assign(el.style, {
      position: "fixed",
      zIndex: "9990",
      backdropFilter: BLUR,
      WebkitBackdropFilter: BLUR,
      pointerEvents: "none",
      transition: "left 0.25s ease, top 0.25s ease, width 0.25s ease, height 0.25s ease",
    });
    document.body.appendChild(el);
  });
}

function removePanels() {
  PANEL_IDS.forEach((id) => document.getElementById(id)?.remove());
}

function positionPanel(el: HTMLElement, x: number, y: number, w: number, h: number) {
  el.style.display = w > 0 && h > 0 ? "block" : "none";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
}

function updateSpotlight(selector: string | null) {
  const panels = PANEL_IDS.map((id) => document.getElementById(id) as HTMLElement | null);
  if (panels.some((p) => !p)) return;
  const [top, bottom, left, right] = panels as HTMLElement[];

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const targetEl = selector ? document.querySelector(selector) : null;
  const rect = targetEl?.getBoundingClientRect();

  if (!rect || rect.width === 0) {
    // No visible target — single top panel covers the full viewport
    positionPanel(top, 0, 0, vw, vh);
    positionPanel(bottom, 0, 0, 0, 0);
    positionPanel(left, 0, 0, 0, 0);
    positionPanel(right, 0, 0, 0, 0);
    return;
  }

  const ex1 = Math.max(0, rect.left - PAD);
  const ey1 = Math.max(0, rect.top - PAD);
  const ex2 = Math.min(vw, rect.right + PAD);
  const ey2 = Math.min(vh, rect.bottom + PAD);

  positionPanel(top,    0,   0,       vw,        ey1);
  positionPanel(bottom, 0,   ey2,     vw,        vh - ey2);
  positionPanel(left,   0,   ey1,     ex1,       ey2 - ey1);
  positionPanel(right,  ex2, ey1,     vw - ex2,  ey2 - ey1);
}

export function buildTour(
  flowDef: FlowDef,
  onComplete: () => void,
  onCancel: () => void,
): Shepherd.Tour {
  const isMobile = window.innerWidth < 640;

  const tour = new Shepherd.Tour({
    useModalOverlay: false,
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      // On mobile don't scroll — the popup should stay within the visible viewport
      scrollTo: isMobile ? false : { behavior: "smooth", block: "center" },
      classes: "rhozly-tour-step",
      floatingUIOptions: {
        middleware: [],
      },
      popperOptions: {
        modifiers: [
          {
            name: "preventOverflow",
            options: {
              boundary: "viewport",
              padding: 16,
              altAxis: true,
              tether: false,
            },
          },
          {
            name: "flip",
            options: {
              boundary: "viewport",
              padding: 16,
              fallbackPlacements: ["top", "bottom", "left", "right"],
            },
          },
          {
            name: "offset",
            options: {
              offset: [0, 12],
            },
          },
        ],
      },
    },
  });

  const total = flowDef.steps.length;

  flowDef.steps.forEach((step, index) => {
    const isFirst = index === 0;
    const isLast = index === total - 1;

    const buttons: Shepherd.Step.StepOptionsButton[] = [];

    if (!isFirst) {
      buttons.push({
        text: "← Back",
        action: tour.back,
        classes: "shepherd-button-secondary",
      });
    }

    if (isFirst) {
      buttons.push({
        text: "",
        action: () => {},
        classes: "shepherd-button-spacer",
        disabled: true,
      });
    }

    // For interactive steps, label the button "Skip →" so it's clear the
    // intended action is clicking the highlighted element, not this button.
    const nextLabel = isLast ? "Done ✓" : step.advanceOn ? "Skip →" : "Next →";
    buttons.push({
      text: nextLabel,
      action: isLast ? () => { tour.complete(); } : tour.next,
      classes: "shepherd-button-primary",
    });

    const progressDots = Array.from({ length: total }, (_, i) =>
      `<span class="shepherd-progress-dot${i === index ? " active" : ""}"></span>`
    ).join("");

    const imageHtml = step.image
      ? `<img src="${step.image}" alt="" class="shepherd-step-image" />`
      : "";

    // Per-step cleanup ref for the native advanceOn listener
    let advanceCleanup: (() => void) | null = null;

    tour.addStep({
      id: `${flowDef.id}-step-${index}`,
      title: step.title,
      text: `${imageHtml}<p>${step.body}</p>`,
      attachTo: step.attachTo.element && step.attachTo.on
        ? { element: step.attachTo.element, on: step.attachTo.on }
        : undefined,
      buttons,
      when: {
        show() {
          // Progress dots
          const footer = document.querySelector(
            `[data-shepherd-step-id="${flowDef.id}-step-${index}"] .shepherd-footer`,
          );
          if (footer && !footer.querySelector(".shepherd-progress")) {
            const dotsEl = document.createElement("div");
            dotsEl.className = "shepherd-progress";
            dotsEl.innerHTML = progressDots;
            footer.prepend(dotsEl);
          }

          if (step.noSpotlight) {
            // Hide all panels — used for steps inside modals where blur panels
            // would sit above the modal content and create a visual conflict.
            PANEL_IDS.forEach((id) => {
              const el = document.getElementById(id);
              if (el) el.style.display = "none";
            });
          } else {
            // Immediate spotlight update (works for elements already in the DOM)
            updateSpotlight(step.attachTo.element);

            // Delayed second pass handles elements rendered asynchronously
            // (e.g. a modal or sheet that opens in response to the previous step)
            setTimeout(() => updateSpotlight(step.attachTo.element), 350);
          }

          // Manual advanceOn via native listener — avoids Shepherd's built-in
          // advanceOn which can conflict with React's synthetic event handling.
          if (step.advanceOn) {
            const { selector, event } = step.advanceOn;
            setTimeout(() => {
              if (advanceCleanup) return; // already attached (guard against double show)
              const target = document.querySelector(selector);
              if (target) {
                const handler = () => tour.next();
                target.addEventListener(event, handler, { once: true });
                advanceCleanup = () => target.removeEventListener(event, handler);
              }
            }, 150);
          }
        },
        hide() {
          advanceCleanup?.();
          advanceCleanup = null;
        },
      },
    });
  });

  tour.on("start", createPanels);
  tour.on("complete", () => { removePanels(); onComplete(); });
  tour.on("cancel", () => { removePanels(); onCancel(); });

  return tour;
}
