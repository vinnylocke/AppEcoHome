# Plan — Pre-fill Garden AI chat when opened from a Shed plant's AI button

## Context

The Shed plant tile's "Ask Rhozly AI" button already sets `pageContext` with the plant's details (id, common name, scientific name, source, sunlight, cycle, edible) and opens the chat:

```ts
setPageContext({
  action: "Asking about a plant in the Shed",
  plant: { id, common_name, scientific_name, source, sunlight, cycle, edible },
});
setIsOpen(true);
```

The context is sent to the AI on each turn so it knows what plant the conversation is about, but the user sees no visible indication that the chat is plant-scoped. Their question floats in a generic input box with the placeholder "Ask about your garden…", which feels like a fresh general chat rather than "we're talking about your Cherry Tomato right now."

## Approach

Two small additions to [`PlantDoctorChat.tsx`](../../src/components/PlantDoctorChat.tsx):

### 1. Pre-fill the input with a plant-scoped starter

On the transition from `isOpen: false → true`, if `pageContext?.plant?.common_name` is set and the input is empty, pre-fill it with:

```
About my <Common Name>: 
```

The trailing space + colon makes the prompt clearly a stem the user finishes ("…how often should I water it?"). They can send as-is for a general "tell me about this plant" answer, or type their actual question on the same line.

Guards:
- Only fire on the open transition (not on every render while open).
- Skip when the user has already typed anything (`input.trim().length > 0`).
- Track the last-pre-filled plant id so re-opening with the same plant doesn't clobber a draft.

### 2. Show a small "Talking about" chip above the input

When `pageContext?.plant?.common_name` is set, render a small dismissable chip just above the input bar:

```
[ 🌿 Talking about: Cherry Tomato                       × ]
```

- Tap × → clears the chip AND the `pageContext.plant` field (the AI then treats subsequent turns as general garden chat). Useful for the case where the user opens the chat from the Shed button but actually wants to ask about something else.
- The chip stays visible even if the user clears the pre-filled input text, so the scoping is always evident.

That's it — both changes are non-invasive and additive. No backend or context changes needed beyond the existing `pageContext` shape.

## Files modified

| File | Change |
|------|--------|
| [`src/components/PlantDoctorChat.tsx`](../../src/components/PlantDoctorChat.tsx) | New `useEffect` to pre-fill on open; render the "Talking about" chip above the input; chip's × handler clears the plant from pageContext |

## Tests

Visual only — testIds added (`chat-plant-context-chip`, `chat-plant-context-clear`) so any future Playwright case can target them.

## Deploy

Frontend-only. Minor bump → **22.0010**.

## Risks

- **Input overwrite**: guarded by the "input is empty" + "isOpen transition" + "plant id changed" trio so we never trample a draft.
- **Chip persistence**: if the chip's × is tapped, we clear the plant from `pageContext` but keep `action`/other fields. The AI loses the plant scope but the chat session continues normally.
