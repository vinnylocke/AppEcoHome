import Shepherd from "shepherd.js";
import type { FlowDef } from "./types";

const OVERLAY_ID = "rhozly-blur-overlay";
const PAD = 14; // px padding around the highlighted element

function createOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;
  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  Object.assign(el.style, {
    position: "fixed",
    inset: "0",
    zIndex: "9990",
    backdropFilter: "blur(4px) brightness(0.82)",
    WebkitBackdropFilter: "blur(4px) brightness(0.82)",
    transition: "clip-path 0.25s ease",
    pointerEvents: "none",
  });
  document.body.appendChild(el);
}

function removeOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function updateOverlayCutout(selector: string | null) {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  if (!selector) {
    overlay.style.clipPath = "none";
    return;
  }

  const targetEl = document.querySelector(selector);
  if (!targetEl) {
    overlay.style.clipPath = "none";
    return;
  }

  const { left, top, right, bottom } = targetEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x1 = Math.max(0, left - PAD);
  const y1 = Math.max(0, top - PAD);
  const x2 = Math.min(vw, right + PAD);
  const y2 = Math.min(vh, bottom + PAD);

  // A polygon that covers the whole viewport but has a rectangular hole
  // cut out for the target. Uses the "bridge" technique — the outer path
  // goes clockwise and the inner path counter-clockwise, so the interior
  // of the inner path has zero winding and becomes transparent.
  overlay.style.clipPath = [
    `0px 0px`,
    `${vw}px 0px`,
    `${vw}px ${vh}px`,
    `0px ${vh}px`,
    `0px 0px`,
    `${x1}px ${y1}px`,
    `${x1}px ${y2}px`,
    `${x2}px ${y2}px`,
    `${x2}px ${y1}px`,
    `${x1}px ${y1}px`,
  ]
    .map((p, i) => (i === 0 ? `polygon(${p}` : i === 9 ? `${p})` : p))
    .join(", ");
}

export function buildTour(
  flowDef: FlowDef,
  onComplete: () => void,
  onCancel: () => void,
): Shepherd.Tour {
  const tour = new Shepherd.Tour({
    useModalOverlay: false,
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      scrollTo: { behavior: "smooth", block: "center" },
      classes: "rhozly-tour-step",
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

    buttons.push({
      text: isLast ? "Done ✓" : "Next →",
      action: isLast ? () => { tour.complete(); } : tour.next,
      classes: "shepherd-button-primary",
    });

    const progressDots = Array.from({ length: total }, (_, i) =>
      `<span class="shepherd-progress-dot${i === index ? " active" : ""}"></span>`
    ).join("");

    const imageHtml = step.image
      ? `<img src="${step.image}" alt="" class="shepherd-step-image" />`
      : "";

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

          // Cut a hole in the blur overlay for the target element
          updateOverlayCutout(step.attachTo.element);
        },
      },
    });
  });

  tour.on("start", createOverlay);
  tour.on("complete", () => { removeOverlay(); onComplete(); });
  tour.on("cancel", () => { removeOverlay(); onCancel(); });

  return tour;
}
