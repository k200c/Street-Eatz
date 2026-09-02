import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


export type BroadcastChannel = 'sms' | 'email';
export type BroadcastType = 'promotional' | 'weekly' | 'community_vote' | 'announcement';

/**
 * revenue_generated and open_rate are deliberately absent. revenue_generated
 * was Math.random() output — €6,706 claimed against a measured uplift of
 * −€1,234 — and open_rate has no meaning for SMS. Measured performance lives
 * in v_broadcast_summary (useBroadcastSummary). Never select either column.
 */
export interface Broadcast {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  sent_at: string;
  recipients_count: number;
  created_at: string;
  metrics_verified?: boolean;
  metrics_source?: string;
  accepted_recipients?: number;
  delivered_recipients?: number;
  failed_recipients?: number;
  delivery_status?: string;
  channels?: BroadcastChannel[] | null;
  broadcast_type?: BroadcastType | null;
  email_subject?: string | null;
  sent_sms_count?: number | null;
  sent_email_count?: number | null;
}

/** Explicit column list so the fabricated metrics can never be read by accident. */
export const BROADCAST_SELECT =
  'id, title, message, image_url, sent_at, recipients_count, created_at, metrics_verified, metrics_source, accepted_recipients, delivered_recipients, failed_recipients, delivery_status, channels, broadcast_type, email_subject, sent_sms_count, sent_email_count';

export interface CommunityVote {
  id: string;
  title: string;
  option_a: string;
  option_b: string;
  votes_a: number;
  votes_b: number;
  closing_date: string;
  is_active: boolean;
  winner: string | null;
  created_at: string;
}

// Broadcast webhook is now routed through authenticated Edge Function

export function useBroadcasts() {
  return useQuery({
    queryKey: ["broadcasts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broadcasts")
        .select(BROADCAST_SELECT)
        .order("sent_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      // types.ts predates metrics_verified and the channel columns; regenerate to drop the cast.
      return data as unknown as Broadcast[];
    },
  });
}

export function useSendBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (broadcast: {
      title: string;
      message: string;
      image_url?: string;
      channels: BroadcastChannel[];
      broadcast_type: BroadcastType;
      email_subject?: string;
    }) => {
      if (broadcast.channels.length === 0) throw new Error('Choose at least one channel.');

      let smsRecipients = 0;

      if (broadcast.channels.includes('sms')) {
        // SMS goes through the authenticated edge function, never direct to n8n.
        const { data, error: fnError } = await supabase.functions.invoke('send-broadcast', {
          body: {
            title: broadcast.title,
            message: broadcast.message,
            image_url: broadcast.image_url || null,
          },
        });
        if (fnError) throw new Error('Failed to send broadcast');
        smsRecipients = Number.isInteger(data?.recipients_count) ? data.recipients_count : 0;
      }

      // Email: no sending path is connected yet. The choice is recorded so the
      // history is honest, and sent_email_count stays 0 rather than pretending.
      const { error } = await supabase.from("broadcasts").insert({
        title: broadcast.title,
        message: broadcast.message,
        image_url: broadcast.image_url || null,
        recipients_count: smsRecipients,
        channels: broadcast.channels,
        broadcast_type: broadcast.broadcast_type,
        email_subject: broadcast.channels.includes('email') ? broadcast.email_subject?.trim() || null : null,
        sent_sms_count: smsRecipients,
        sent_email_count: 0,
        // Legacy columns are written as 0 so the row is valid; they are never read.
        open_rate: 0,
        revenue_generated: 0,
      });

      if (error) throw error;
      return { smsRecipients, emailSent: 0 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast recorded");
    },
    onError: (error) => {
      toast.error("Failed to send broadcast");
      console.error(error);
    },
  });
}

export function useCommunityVotes() {
  return useQuery({
    queryKey: ["community-votes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_votes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as CommunityVote[];
    },
  });
}

export function useCreateVote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vote: { title: string; option_a: string; option_b: string; closing_date: string }) => {
      const { error } = await supabase.from("community_votes").insert({
        title: vote.title,
        option_a: vote.option_a,
        option_b: vote.option_b,
        closing_date: vote.closing_date,
        is_active: true,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-votes"] });
      toast.success("🗳️ Community vote created!");
    },
    onError: () => {
      toast.error("Failed to create vote");
    },
  });
}
