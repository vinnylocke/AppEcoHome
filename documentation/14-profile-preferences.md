# Profile & Preferences

The **Profile** section is where you train Rhozly's AI to understand your gardening style, preferences, and conditions. The more information you provide, the more personalised your task order, plant suggestions, and care advice become.

Access: sidebar → **Profile** (or `/profile`).

> 📸 Screenshot: The Profile page showing two tabs — Habit Quiz and Plant Preferences — with the quiz progress shown

---

## Why It Matters

Rhozly uses your profile data to:
- **Reorder tasks** — tasks involving your favourite plants bubble to the top of the list
- **Mark preferred dates** — days with tasks for your favourite plants get a ✨ sparkle on the calendar
- **Personalise AI suggestions** — Garden Plans and Plant Doctor results factor in your experience level and goals
- **Improve plan generation** — your climate zone, experience, and preferences shape AI-generated garden plans

---

## Habit Quiz

The Habit Quiz is a short one-time questionnaire that establishes your baseline gardening profile. It takes about 2 minutes to complete.

> 📸 Screenshot: The Habit Quiz showing a progress indicator at the top and a question card with multiple-choice options

### Questions Covered

| Question | Why it's asked |
|----------|----------------|
| **Experience level** | Beginner / Intermediate / Advanced — calibrates the complexity of advice |
| **Time available** | Hours per week — helps Rhozly suggest realistic task frequencies |
| **Climate zone** | Temperate / Mediterranean / Tropical / Arid / Continental — affects seasonal advice |
| **Growing conditions** | Mostly indoor / Mostly outdoor / Mixed — affects plant recommendations |
| **Goals** | Multi-select: pest-free, edible harvest, ornamental, low-water, organic, wildlife-friendly |

### Completing the Quiz

Tap through each question screen, selecting your answers. Tap **Finish** on the last screen.

When complete:
- A **green checkmark** and completion date appear on the Profile page
- The "Set up your Home Profile" card on the Dashboard is dismissed
- The app immediately starts using your profile for personalisation

> 📸 Screenshot: The completed quiz status showing a green tick and the completion date

### Retaking the Quiz

Tap **Retake Quiz** at the bottom of the Profile page to go through it again. Your previous answers are pre-filled so you only need to change what's different.

---

## Plant Preferences (Swipe Deck)

The **Plant Preferences** tab shows you a deck of plant cards. Swipe to tell Rhozly which plants you like and which you don't.

> 📸 Screenshot: The swipe deck showing a plant card centred on screen with ✓ and ✗ icons on either side, and a stack of cards behind it

### How to Swipe

- **Swipe right (or tap ✓)** — you like this plant; give it positive preference
- **Swipe left (or tap ✗)** — you don't want this plant; give it negative preference
- Swipe as many or as few cards as you like — the deck refreshes with new suggestions as you go

### What Swiping Affects

Every swipe records a **preference** with the plant name and a sentiment (positive/negative). These preferences:
- **Boost tasks** — watering your favourite tomatoes floats to the top of today's list
- **Highlight calendar days** — days with care tasks for liked plants get a ✨ sparkle on the monthly calendar
- **Improve plan suggestions** — AI-generated garden plans lean toward plants you've indicated you want

---

## Viewing and Managing Your Preferences

> 📸 Screenshot: The preferences panel showing positive preferences as green badges and negative as red badges, with source labels

Tap **"Show all preferences"** (or scroll down) to see every preference Rhozly has learned:

| Badge colour | Meaning |
|-------------|---------|
| **Green** | Positive — you like this plant |
| **Red** | Negative — you don't want this plant |

Each preference shows:
- Plant name
- Sentiment (positive/negative)
- **Source** — how it was learned: Quiz / Swipe / Chat (Plant Doctor AI conversation)

### Removing a Preference

Tap the **× delete** icon on any preference badge to remove it. The AI immediately stops factoring that preference into its decisions.

### Resetting All Preferences

Tap **Reset all preferences** (requires a double-tap to confirm).

> 📸 Screenshot: The reset confirmation prompt requiring a second tap to confirm

This:
- Clears every preference record
- Clears your quiz completion status
- Resets the app to a blank personalisation state

You'll be prompted to retake the quiz and start swiping again.

---

## Preference Sources

Rhozly learns your preferences from multiple places:

| Source | How |
|--------|-----|
| **Quiz** | Answers to the Habit Quiz questions set initial preferences |
| **Swipe** | Every swipe in the Plant Preferences deck |
| **Chat** | When you discuss plants with the Plant Doctor AI, it picks up on positive and negative mentions |
| **Actions** | Completing a Planting task positively reinforces that plant; archiving a plant early may negatively signal it |

---

## Profile Page Stats

The top of the Profile page shows a summary of your current personalisation state:

> 📸 Screenshot: The profile stats area showing "Quiz: Completed", "Preferences: 12 learned", and the subscription tier badge

| Stat | Description |
|------|-------------|
| **Quiz status** | Completed (with date) or Not started |
| **Preferences learned** | Count of total preference records |
| **Subscription tier** | Your current plan (shown for reference) |

---

## Voice in Chat (Wave 22.0001)

Rhozly's Plant Lens chat supports both **voice in** and **voice out** — tap to talk, tap to listen.

Settings live under **Profile → Voice**:

| Setting | Effect |
|---------|--------|
| **Voice replies** | Toggle: when on, every AI reply in chat is read aloud automatically. When off, you tap the speaker icon per message to hear it. |
| **Voice** | Pick the read-aloud voice — your device's available system voices are listed |
| **Speed** | Slow / Normal / Fast |

Inside any chat surface (Plant Lens chat, Garden AI overlay):
- The **microphone** button next to the input field captures your spoken message — tap to start, tap again to stop and send
- The **speaker** icon on each AI message plays just that one reply aloud

The microphone uses your device's native speech recognition. No audio is uploaded to Rhozly; only the transcribed text is sent.

See the full guide: [Voice in Chat](./18-voice-in-chat.md).

---

## Persona Settings

Under **Profile → Persona**, pick how Rhozly speaks to you across the whole app:

| Persona | Tone |
|---------|------|
| **Plain** | Clear, no extras — the default |
| **Cheerful** | Warmer, encouraging, more emoji |
| **Expert** | Direct and technical, assumes confidence |
| **Mentor** | Patient and explanatory, frames every decision |

The persona affects the AI's reply tone in chat, the wording of notifications, and the Today Focus card's framing. It does **not** affect facts — only voice.

---

## Quick Launcher Customisation

The **Quick Launcher** is the round + button in the header (and the home tiles on the [Quick Access Home](./15-navigation-quick-add.md#quick-access-home-mobile)). It opens a sheet of shortcuts — by default the most-used 8.

Under **Profile → Quick Launcher**, pick which tiles appear:

- **Drag-to-reorder** the tile catalogue (Today Focus, Add Plant, Plant Lens, Notes, Weekly Overview, Add Task, Shopping List, Watering, Walk, Nursery, Garden AI, Areas, Plans, Visualiser, Sun Tracker, Guides — 16 total)
- **Toggle on/off** each tile
- **Reset to defaults** restores the original eight

Changes apply instantly — no save button needed.

---

## AI Usage

The **AI Usage** panel (visible on the Account tab of your Profile page) shows your Gemini AI token consumption for the current billing period:

- **Requests used** — how many AI calls you've made
- **Token usage** — total tokens consumed, broken down by feature
- **Rate limit** — your current per-user allowance

If you regularly reach your limit, contact your home owner or a Rhozly admin — admins can grant higher rate limits to individual users.
