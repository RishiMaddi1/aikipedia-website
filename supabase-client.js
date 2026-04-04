/**
 * Supabase Realtime Client for Aikipedia Group Chat
 * Handles real-time subscriptions for:
 * - Lock status updates
 * - New messages
 * - Typing indicators
 * - Group member changes
 */

// Supabase configuration - REPLACE WITH YOUR VALUES
const SUPABASE_URL = 'https://xafjwlnacwbghwjeibwc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhZmp3bG5hY3diZ2h3amVpYndjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwODQ1MDcsImV4cCI6MjA2MTY2MDUwN30.mKJCQ2WR3YHSYRvOawjCeSVSv4OYIpV06OsSa1bJ6UA';

// Initialize Supabase client
let supabaseClient = null;

// Store active channels for cleanup
const activeChannels = new Map();

// Typing timeout tracker
const typingTimeouts = new Map();

/**
 * Initialize Supabase client
 * Must be called before other functions
 */
function initSupabaseClient() {
  if (typeof supabase === 'undefined') {
    console.error('Supabase library not loaded. Include: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized');
  }

  return supabaseClient;
}

/**
 * Subscribe to a group conversation for real-time updates
 * @param {string} conversationId - The group conversation ID
 * @param {object} callbacks - Event handlers
 * @returns {object} - The subscription channel
 */
function subscribeToGroupChat(conversationId, callbacks = {}) {
  const supabase = initSupabaseClient();
  if (!supabase) return null;

  // Unsubscribe existing channel for this conversation
  unsubscribeFromConversation(conversationId);

  const channelName = `conversation-${conversationId}`;
  const channel = supabase.channel(channelName, {
    config: {
      presence: { key: getCurrentUserId() }
    }
  });

  // Subscribe to conversation updates (lock status, pot balance)
  channel.on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'conversations',
    filter: `id=eq.${conversationId}`
  }, (payload) => {
    const { new: newRecord, old: oldRecord } = payload;

    // Lock status changed
    if (newRecord.is_awaiting_ai !== oldRecord.is_awaiting_ai) {
      if (callbacks.onLockStatusChange) {
        callbacks.onLockStatusChange({
          isLocked: newRecord.is_awaiting_ai,
          lockedBy: newRecord.locked_by_username,
          lockedAt: newRecord.locked_at
        });
      }
    }

    // Pot balance changed
    if (newRecord.group_pot_balance !== oldRecord.group_pot_balance) {
      if (callbacks.onPotBalanceChange) {
        callbacks.onPotBalanceChange(newRecord.group_pot_balance);
      }
    }

    // Member count changed (triggered by title update or other changes)
    if (callbacks.onConversationUpdate) {
      callbacks.onConversationUpdate(newRecord);
    }
  });

  // Subscribe to new messages
  channel.on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `conversation_id=eq.${conversationId}`
  }, (payload) => {
    if (callbacks.onNewMessage) {
      callbacks.onNewMessage(payload.new);
    }
  });

  // Subscribe to member changes
  channel.on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'group_members',
    filter: `conversation_id=eq.${conversationId}`
  }, (payload) => {
    if (callbacks.onMemberChange) {
      callbacks.onMemberChange({
        event: payload.event,
        record: payload.new || payload.old
      });
    }
  });

  // Subscribe to typing indicators (broadcast)
  channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
    if (callbacks.onTyping) {
      callbacks.onTyping(payload);
    }
  });

  // Presence tracking
  channel.on('presence', { event: 'sync' }, () => {
    if (callbacks.onPresenceSync) {
      const state = channel.presenceState();
      callbacks.onPresenceSync(state);
    }
  });

  channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
    if (callbacks.onUserJoin) {
      callbacks.onUserJoin(key, newPresences);
    }
  });

  channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    if (callbacks.onUserLeave) {
      callbacks.onUserLeave(key, leftPresences);
    }
  });

  // Subscribe to the channel
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      console.log(`Subscribed to group chat: ${conversationId}`);

      // Track own presence
      const userId = getCurrentUserId();
      const username = getCurrentUsername();

      if (userId) {
        await channel.track({
          user_id: userId,
          username: username,
          online_at: new Date().toISOString()
        });
      }

      if (callbacks.onSubscribed) {
        callbacks.onSubscribed();
      }
    } else if (status === 'CHANNEL_ERROR') {
      console.error(`Channel error for: ${conversationId}`);
      if (callbacks.onError) {
        callbacks.onError(status);
      }
    }
  });

  // Store channel for cleanup
  activeChannels.set(conversationId, channel);

  return channel;
}

/**
 * Unsubscribe from a conversation
 * @param {string} conversationId - The conversation ID
 */
function unsubscribeFromConversation(conversationId) {
  const existingChannel = activeChannels.get(conversationId);
  if (existingChannel) {
    supabaseClient?.removeChannel(existingChannel);
    activeChannels.delete(conversationId);
    console.log(`Unsubscribed from: ${conversationId}`);
  }
}

/**
 * Unsubscribe from all conversations
 */
function unsubscribeAll() {
  activeChannels.forEach((channel, conversationId) => {
    supabaseClient?.removeChannel(channel);
  });
  activeChannels.clear();
}

/**
 * Broadcast typing indicator to group
 * @param {string} conversationId - The group conversation ID
 * @param {boolean} isTyping - Whether user is typing
 */
async function broadcastTyping(conversationId, isTyping) {
  const channel = activeChannels.get(conversationId);
  if (!channel) {
    console.warn('No active channel for conversation:', conversationId);
    return;
  }

  const userId = getCurrentUserId();
  const username = getCurrentUsername();

  // Clear existing timeout
  if (typingTimeouts.has(conversationId)) {
    clearTimeout(typingTimeouts.get(conversationId));
  }

  // Send typing start
  if (isTyping) {
    await channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: userId,
        username: username,
        typing: true
      }
    });

    // Auto-clear after 3 seconds
    const timeout = setTimeout(() => {
      broadcastTyping(conversationId, false);
    }, 3000);

    typingTimeouts.set(conversationId, timeout);
  } else {
    // Send typing stop
    await channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: userId,
        typing: false
      }
    });

    typingTimeouts.delete(conversationId);
  }
}

/**
 * Get current user ID from localStorage
 * @returns {string|null}
 */
function getCurrentUserId() {
  return localStorage.getItem('aikipediaUserId') || null;
}

/**
 * Get current username from localStorage
 * @returns {string|null}
 */
function getCurrentUsername() {
  return localStorage.getItem('aikipediaUser') || null;
}

/**
 * Fetch group members for a conversation
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Array>}
 */
async function getGroupMembers(conversationId) {
  const supabase = initSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('group_members')
      .select(`
        id,
        user_id,
        role,
        joined_at,
        users!inner (
          username,
          id
        )
      `)
      .eq('conversation_id', conversationId);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching group members:', err);
    return [];
  }
}

/**
 * Fetch group pot contributions history
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Array>}
 */
async function getGroupContributions(conversationId) {
  const supabase = initSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('group_pot_contributions')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching contributions:', err);
    return [];
  }
}

/**
 * Fetch conversation details including pot balance
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object|null>}
 */
async function getConversationDetails(conversationId) {
  const supabase = initSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error fetching conversation details:', err);
    return null;
  }
}

// Export functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initSupabaseClient,
    subscribeToGroupChat,
    unsubscribeFromConversation,
    unsubscribeAll,
    broadcastTyping,
    getCurrentUserId,
    getCurrentUsername,
    getGroupMembers,
    getGroupContributions,
    getConversationDetails
  };
}
