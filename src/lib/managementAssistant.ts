export const ASSISTANT_MAX_MESSAGES = 12;
export const ASSISTANT_MAX_MESSAGE_LENGTH = 4_000;

export type AssistantMessageRole = 'user' | 'assistant';

export interface AssistantMessage {
  role: AssistantMessageRole;
  content: string;
}

export type AssistantChangeValue = string | number | boolean | null;

export interface AssistantChangeProposal {
  id: string;
  proposal_type: 'product' | 'setting';
  target_name: string;
  product_id?: string;
  setting_key?: 'current_wait_time' | 'is_store_open';
  before: Record<string, AssistantChangeValue>;
  changes: Record<string, AssistantChangeValue>;
  expires_at: string;
  status: 'pending' | 'applied' | 'cancelled' | 'expired';
}

export interface ManagementAssistantResponse {
  message: string;
  proposals?: AssistantChangeProposal[];
  requestId?: string;
}

export const productChangeLabels: Record<string, string> = {
  name: 'Name',
  description: 'Description',
  price: 'Price',
  category: 'Category',
  is_available: 'Ordering enabled',
  is_sold_out: 'Sold out',
  is_visible: 'Visible on menu',
  current_wait_time: 'Current wait time',
  is_store_open: 'Store open',
};

export function sanitizeAssistantMessages(input: unknown): AssistantMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((message): message is { role: string; content: string } => (
      typeof message === 'object'
      && message !== null
      && 'role' in message
      && 'content' in message
      && (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
    ))
    .map((message) => ({
      role: message.role as AssistantMessageRole,
      content: message.content.trim().slice(0, ASSISTANT_MAX_MESSAGE_LENGTH),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-ASSISTANT_MAX_MESSAGES);
}

export function formatAssistantValue(field: string, value: AssistantChangeValue): string {
  if (field === 'price' && typeof value === 'number') return `€${value.toFixed(2)}`;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value === null || value === '') return 'Not set';
  return String(value);
}

export function isAssistantProposal(value: unknown): value is AssistantChangeProposal {
  if (!value || typeof value !== 'object') return false;
  const proposal = value as Partial<AssistantChangeProposal>;
  return typeof proposal.id === 'string'
    && (proposal.proposal_type === 'product' || proposal.proposal_type === 'setting')
    && typeof proposal.target_name === 'string'
    && typeof proposal.before === 'object'
    && proposal.before !== null
    && typeof proposal.changes === 'object'
    && proposal.changes !== null
    && typeof proposal.expires_at === 'string'
    && proposal.status === 'pending';
}
