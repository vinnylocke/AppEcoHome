-- AI Agent Chat — persist the confirm-card preview text.
--
-- The confirm card needs the human-readable preview ("Create task X due Y")
-- to render. Until now it was only returned in the live agent-chat response
-- and lived in client state — so a page reload orphaned pending cards and
-- lost the done-card summary. Storing it lets the chat hydrate tool calls
-- from chat_tool_calls on load (Item B) and lets the Audit page show a
-- readable description (Item C).

ALTER TABLE public.chat_tool_calls
  ADD COLUMN IF NOT EXISTS preview text;
