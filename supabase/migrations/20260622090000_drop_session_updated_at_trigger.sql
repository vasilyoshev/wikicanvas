-- Fix (final-review CRITICAL): the client is the authoritative session-level LWW
-- clock — it sets session.updated_at on every local mutation and pushes that
-- edit-time value. The BEFORE UPDATE trigger set_session_updated_at overwrote
-- that client clock with server push-time on every re-upsert (the ON CONFLICT
-- DO UPDATE branch), so mergeSessions then compared a local EDIT-time clock
-- against a remote PUSH-time clock and could silently destroy a genuinely-newer
-- offline edit via wholesale bundle replace. Drop the trigger (and its now-unused
-- function) so remote.updated_at is exactly the client value that was pushed.

drop trigger if exists set_session_updated_at on public.session;
drop function if exists public.set_current_timestamp_updated_at();
