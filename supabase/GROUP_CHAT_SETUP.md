# Group Chat Setup Instructions

## Quick Start

### 1. Run the SQL Script

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `xafjwlnacwbghwjeibwc`
3. Navigate to: **SQL Editor** (in left sidebar)
4. Click **New Query**
5. Copy contents of `group_chat.sql`
6. Paste into SQL Editor
7. Click **Run** (or press `Ctrl+Enter`)
8. Verify success - should see "Success. No rows returned" with checkmarks

### 2. Enable Realtime

1. In Supabase Dashboard, go to: **Database** → **Replication**
2. Find **Realtime** section
3. Click **Select tables to broadcast changes**
4. Enable these tables:
   - ✅ `conversations`
   - ✅ `messages`
   - ✅ `group_members`
5. Click **Confirm**

### 3. Verify Tables Created

Run this in SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('conversations', 'group_members', 'group_pot_contributions');
```

Expected output:
```
table_name
──────────────────────────────
conversations
group_members
group_pot_contributions
```

### 4. Verify Columns Added

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'conversations' 
  AND column_name IN ('is_group', 'is_awaiting_ai', 'group_pot_balance');
```

Expected output:
```
column_name         │ data_type
────────────────────┼──────────
is_group            │ boolean
is_awaiting_ai      │ boolean
group_pot_balance   │ numeric
```

---

## What Gets Created

### New Tables

| Table | Purpose |
|-------|---------|
| `group_members` | Links users to group conversations |
| `group_pot_contributions` | Tracks who added credits to group pot |

### Modified Tables

| Table | New Columns |
|-------|-------------|
| `conversations` | `is_group`, `is_awaiting_ai`, `locked_by_user_id`, `locked_by_username`, `locked_at`, `group_pot_balance`, `max_members` |

---

## Realtime Channels (For Developers)

The frontend will subscribe to these channels:

```
conversation-{id}  - Lock status, pot balance updates
messages           - New messages
typing             - Typing indicators (broadcast)
```

---

## Helper Functions Available

```sql
-- Get member count of a group
SELECT get_group_member_count('conversation-uuid');

-- Check if user is admin
SELECT is_group_admin('conversation-uuid', 'user-uuid');

-- Release stale locks (run periodically via cron or manually)
SELECT release_stale_locks();
```

---

## Troubleshooting

### Error: "relation public.conversations does not exist"
- Make sure you ran `chat_threads.sql` first (from original setup)

### Error: "column does not exist"
- Check if `chat_threads.sql` was run before `group_chat.sql`

### Realtime not working
- Verify tables are enabled in Database → Replication
- Check browser console for connection errors
- Verify `anon` key is correct in frontend

### Lock not releasing
- Run `SELECT release_stale_locks();` in SQL Editor
- This releases locks older than 5 minutes

---

## Testing the Setup

### 1. Create a test group (via API or after frontend is ready)

```sql
-- This will be done via API, but for testing:
INSERT INTO conversations (user_id, title, is_group, group_pot_balance)
VALUES ('your-user-id', 'Test Group', true, 100.00);
```

### 2. Add members

```sql
INSERT INTO group_members (conversation_id, user_id, role)
VALUES ('conversation-uuid', 'user-uuid', 'admin');
```

### 3. Verify in frontend

After code changes are deployed, you should see:
- "Create Group" button on index.html
- Groups appear in sidebar on chat.html
- Lock status when someone sends a message

---

## Rollback (If Needed)

To undo changes:
```sql
DROP TABLE IF EXISTS public.group_pot_contributions CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP VIEW IF EXISTS public.group_overview CASCADE;

ALTER TABLE public.conversations
  DROP COLUMN IF EXISTS is_group,
  DROP COLUMN IF EXISTS is_awaiting_ai,
  DROP COLUMN IF EXISTS locked_by_user_id,
  DROP COLUMN IF EXISTS locked_by_username,
  DROP COLUMN IF EXISTS locked_at,
  DROP COLUMN IF EXISTS group_pot_balance,
  DROP COLUMN IF EXISTS max_members;
```
