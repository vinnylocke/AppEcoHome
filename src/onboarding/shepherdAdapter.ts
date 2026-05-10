import Shepherd from "shepherd.js";
import type { FlowDef } from "./types";

export function buildTour(
  flowDef: FlowDef,
  onComplete: () => void,
  onCancel: () => void,
): Shepherd.Tour {
  const tour = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      cancelIcon: { enabled: true },
      scrollTo: { behavior: "smooth", block: "center" },
      classes: "rhozly-tour-step",
      modalOverlayOpeningPadding: 8,
      modalOverlayOpeningRadius: 12,
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

    // Spacer to push Next/Done to the right when there's no Back button
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
          // Inject progress dots into footer
          const footer = document.querySelector(
            `[data-shepherd-step-id="${flowDef.id}-step-${index}"] .shepherd-footer`,
          );
          if (footer) {
            const existing = footer.querySelector(".shepherd-progress");
            if (!existing) {
              const dotsEl = document.createElement("div");
              dotsEl.className = "shepherd-progress";
              dotsEl.innerHTML = progressDots;
              footer.prepend(dotsEl);
            }
          }
        },
      },
    });
  });

  tour.on("complete", onComplete);
  tour.on("cancel", onCancel);

  return tour;
}
