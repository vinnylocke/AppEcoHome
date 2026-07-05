# Voice in Chat

Rhozly's [Plant Lens](./08-plant-doctor.md) chat (and the Garden AI overlay) supports **voice in** — tap a mic to talk — and **voice out** — tap a speaker to listen. Useful when your hands are muddy or your phone is propped up on a potting bench.

Voice was introduced in Wave 22.0001 and works everywhere the chat panel appears.

---

## Talking to the AI (Voice In)

![The chat input row with the microphone button on the right](/doc-images/18-voice-in-chat-01-voice-in.webp)

In any chat surface:

1. Tap the **🎙️ microphone** button next to the input field.
2. Speak your question — "what's wrong with these tomato leaves?" / "remind me to repot the basil next weekend".
3. Tap the mic again to stop, or pause naturally — Rhozly auto-stops after a short silence.
4. The transcript appears in the input field. Edit if needed, then tap **Send**.

The microphone uses your device's native speech recognition. **No audio is uploaded to Rhozly** — only the transcribed text is sent through.

### First-time permission

The first time you tap the mic, your browser or device will ask for microphone access. Approve it once and you're set. If you deny, you can re-grant it under your device's privacy settings; the mic button will show a small warning until you do.

---

## Listening to Replies (Voice Out)

Every AI reply has a small **🔊 speaker** icon at the top right of the message bubble.

![An AI chat reply with the speaker (read-aloud) icon, thumbs up/down and regenerate controls beneath the message](/doc-images/18-voice-in-chat-02-voice-out.webp)

| Action | What happens |
|--------|-------------|
| **Tap the speaker** | The reply reads aloud once |
| **Tap again while reading** | Pauses; tap once more to resume |
| **Long-press** | Skips to the end |

You can also turn on **auto-read** so every new reply plays automatically — toggle it under **Profile → Voice → Voice replies**.

---

## Picking Your Voice

Under **Profile → Voice**, you can choose:

| Setting | Effect |
|---------|--------|
| **Voice** | Pick from the system voices available on your device (different accents, genders, languages) |
| **Speed** | Slow / Normal / Fast |
| **Voice replies** | Auto-read every AI reply (toggle) |

The available voices depend on your device — Apple devices typically have richer voices; Android shows whatever Google TTS has installed; desktop browsers vary.

---

## Tips

- **Use voice for shopping-style questions.** "What companion plants for tomato?" reads aloud well; long step-by-step treatment plans are usually easier to read.
- **Speak naturally.** The recognition handles pauses, "ums", and corrections. No need for robot speech.
- **Set a comfortable speed.** Many devices default to "fast" — try **Normal** first, then bump down if you want time to think.

---

## Common Questions

**Why no voice in regular text input fields (note titles, task titles)?** Voice is currently scoped to chat — those are the longer, more freeform inputs where speaking saves the most typing.

**Does voice work offline?** Voice in (transcription) does, on most devices. Voice out (reading aloud) does too. The AI reply itself still needs the network.

**Is voice available on every tier?** Yes — voice in and voice out are free across all tiers.

---

## Related guides

- [Plant Lens](./08-plant-doctor.md) — the main chat surface that uses voice
- [Profile & Preferences](./14-profile-preferences.md#voice-in-chat-wave-220001) — where the voice settings live
