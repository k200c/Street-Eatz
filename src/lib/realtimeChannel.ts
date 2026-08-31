let channelSequence = 0;

/**
 * Supabase Realtime topics must be unique per active hook instance. Reusing a
 * joined topic can make a later hook try to register callbacks after subscribe.
 */
export function createRealtimeChannelName(scope: string): string {
  channelSequence += 1;
  return `${scope}:${Date.now()}:${channelSequence}`;
}
