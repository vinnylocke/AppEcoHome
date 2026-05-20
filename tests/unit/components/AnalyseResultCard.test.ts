import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import AnalyseResultCard from "../../../src/components/lens/AnalyseResultCard";
import type { AnalyseResult } from "../../../src/services/plantDoctorService";

// Stub TaskActionButtons — we just need to confirm it receives the tasks and
// renders. Its own behaviour is covered by the chat tests.
vi.mock("../../../src/components/TaskActionButtons", () => ({
  TaskActionButtons: ({ tasks }: { tasks: unknown[] }) =>
    React.createElement(
      "div",
      { "data-testid": "stub-task-action-buttons" },
      `${tasks.length} tasks`,
    ),
}));

const baseResult: AnalyseResult = {
  identification: {
    common_name: "Tomato",
    scientific_name: ["Solanum lycopersicum"],
    confidence: 87,
  },
  health: {
    state: "healthy",
    notes: "Leaves look vibrant.",
    sunlight_appears_appropriate: true,
    sunlight_notes: "Receiving good light.",
  },
  pruning: {
    method: "Tip-pinching",
    where_to_cut: "Above the third node down",
    how_to_cut: "Clean snip at 45°",
    tips: ["Use sharp shears", "Avoid wet weather"],
  },
  propagation: {
    method: "Softwood cuttings",
    when: "Late spring",
    steps: ["Take 10cm cutting", "Strip lower leaves", "Insert into damp compost"],
  },
  edibility: null,
  disease: null,
  pest: null,
  suggested_tasks: [
    {
      title: "Tip-pinch new growth",
      description: "Encourage bushier plant",
      task_type: "Maintenance",
      due_in_days: 0,
      is_recurring: false,
      frequency_days: null,
      end_offset_days: null,
      depends_on_index: null,
    },
  ],
};

describe("AnalyseResultCard", () => {
  test("renders all four core sections + Identification + Health open by default", () => {
    render(
      React.createElement(AnalyseResultCard, { result: baseResult, homeId: "home-1" }),
    );

    expect(screen.getByTestId("analyse-section-identification")).toBeTruthy();
    expect(screen.getByTestId("analyse-section-health")).toBeTruthy();
    expect(screen.getByTestId("analyse-section-pruning")).toBeTruthy();
    expect(screen.getByTestId("analyse-section-propagation")).toBeTruthy();

    // Identification + Health bodies are visible by default
    expect(screen.getByText("Tomato")).toBeTruthy();
    expect(screen.getByText("Solanum lycopersicum")).toBeTruthy();
    expect(screen.getByText("87% confident")).toBeTruthy();
    expect(screen.getByTestId("analyse-health-pill").textContent).toContain("Healthy");
    expect(screen.getByText("Leaves look vibrant.")).toBeTruthy();
  });

  test("hides edibility, disease, and pest sections when those fields are null", () => {
    render(
      React.createElement(AnalyseResultCard, { result: baseResult, homeId: "home-1" }),
    );

    expect(screen.queryByTestId("analyse-section-edibility")).toBeNull();
    expect(screen.queryByTestId("analyse-section-disease")).toBeNull();
    expect(screen.queryByTestId("analyse-section-pest")).toBeNull();
  });

  test("renders edibility section when plant is edible", () => {
    const withEdibility: AnalyseResult = {
      ...baseResult,
      edibility: {
        is_edible: true,
        ripeness: "near_ripe",
        estimated_days_until_ripe: 7,
        notes: "Wait for full red.",
      },
    };
    render(
      React.createElement(AnalyseResultCard, { result: withEdibility, homeId: "home-1" }),
    );

    const section = screen.getByTestId("analyse-section-edibility");
    expect(section).toBeTruthy();
    // Section is collapsed by default — expand to see content
    fireEvent.click(screen.getByTestId("analyse-section-edibility-toggle"));
    expect(screen.getByText("Nearly ripe")).toBeTruthy();
    expect(screen.getByText(/~7 days/)).toBeTruthy();
    expect(screen.getByText("Wait for full red.")).toBeTruthy();
  });

  test("renders disease section (open by default) when disease is present", () => {
    const withDisease: AnalyseResult = {
      ...baseResult,
      health: { ...baseResult.health, state: "diseased" },
      disease: {
        name: "Late Blight",
        cure_methods: ["Apply copper fungicide", "Remove affected leaves"],
        prevention_methods: ["Improve airflow", "Water at soil level"],
      },
    };
    render(
      React.createElement(AnalyseResultCard, { result: withDisease, homeId: "home-1" }),
    );

    expect(screen.getByText("Disease: Late Blight")).toBeTruthy();
    // Open by default — cure & prevention bullets visible
    expect(screen.getByText("Apply copper fungicide")).toBeTruthy();
    expect(screen.getByText("Improve airflow")).toBeTruthy();
    expect(screen.getByTestId("analyse-health-pill").textContent).toContain("Diseased");
  });

  test("renders pest section (open by default) when pest is present", () => {
    const withPest: AnalyseResult = {
      ...baseResult,
      health: { ...baseResult.health, state: "pest_damaged" },
      pest: {
        name: "Aphids",
        removal_methods: ["Spray with diluted neem oil"],
        prevention_methods: ["Encourage ladybirds"],
      },
    };
    render(
      React.createElement(AnalyseResultCard, { result: withPest, homeId: "home-1" }),
    );

    expect(screen.getByText("Pest: Aphids")).toBeTruthy();
    expect(screen.getByText("Spray with diluted neem oil")).toBeTruthy();
    expect(screen.getByText("Encourage ladybirds")).toBeTruthy();
    expect(screen.getByTestId("analyse-health-pill").textContent).toContain("Pest damage");
  });

  test("passes suggested_tasks through to TaskActionButtons", () => {
    render(
      React.createElement(AnalyseResultCard, { result: baseResult, homeId: "home-1" }),
    );
    expect(screen.getByTestId("stub-task-action-buttons").textContent).toBe("1 tasks");
  });

  test("shows 'nothing to schedule' empty state when suggested_tasks is empty", () => {
    const noTasks: AnalyseResult = { ...baseResult, suggested_tasks: [] };
    render(
      React.createElement(AnalyseResultCard, { result: noTasks, homeId: "home-1" }),
    );
    expect(screen.getByTestId("analyse-no-tasks")).toBeTruthy();
    expect(screen.queryByTestId("stub-task-action-buttons")).toBeNull();
  });

  test("pruning section toggles open on click", () => {
    render(
      React.createElement(AnalyseResultCard, { result: baseResult, homeId: "home-1" }),
    );
    // Closed by default
    expect(screen.queryByText("Tip-pinching")).toBeNull();
    fireEvent.click(screen.getByTestId("analyse-section-pruning-toggle"));
    expect(screen.getByText("Tip-pinching")).toBeTruthy();
    expect(screen.getByText("Above the third node down")).toBeTruthy();
  });
});
