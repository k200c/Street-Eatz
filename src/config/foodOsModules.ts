export type FoodOSDomain =
  | 'customer'
  | 'operations'
  | 'money'
  | 'growth'
  | 'intelligence'
  | 'platform';

export type FoodOSStatus = 'live' | 'hardening' | 'building' | 'planned' | 'parked';
export type FoodOSPriority = 'Now' | 'Next' | 'Later' | 'Optional';

export interface FoodOSModule {
  id: number;
  name: string;
  domain: FoodOSDomain;
  status: FoodOSStatus;
  priority: FoodOSPriority;
  description: string;
  defaultVisible: boolean;
  icon: FoodOSIconName;
}

export type FoodOSIconName =
  | 'orders'
  | 'voice'
  | 'qr'
  | 'mobile'
  | 'calendar'
  | 'reviews'
  | 'loyalty'
  | 'discounts'
  | 'allergens'
  | 'kitchen'
  | 'printer'
  | 'pos'
  | 'menu'
  | 'clock'
  | 'inventory'
  | 'staff'
  | 'safety'
  | 'suppliers'
  | 'payments'
  | 'refunds'
  | 'invoices'
  | 'cash'
  | 'tips'
  | 'customers'
  | 'broadcast'
  | 'content'
  | 'ads'
  | 'phone'
  | 'location'
  | 'email'
  | 'analytics'
  | 'reports'
  | 'assistant'
  | 'settings'
  | 'tenants'
  | 'automation'
  | 'security'
  | 'monitoring'
  | 'billing'
  | 'export'
  | 'import'
  | 'devices'
  | 'notifications'
  | 'api'
  | 'docs'
  | 'qa'
  | 'backup';

export const foodOsDomains: Array<{ id: FoodOSDomain; label: string; shortLabel: string }> = [
  { id: 'customer', label: 'Customer & Revenue', shortLabel: 'Customer' },
  { id: 'operations', label: 'Operations', shortLabel: 'Operations' },
  { id: 'money', label: 'Money & Reconciliation', shortLabel: 'Money' },
  { id: 'growth', label: 'Marketing & Growth', shortLabel: 'Growth' },
  { id: 'intelligence', label: 'Intelligence & AI', shortLabel: 'Intelligence' },
  { id: 'platform', label: 'Platform & Reuse', shortLabel: 'Platform' },
];

export const foodOsModules: FoodOSModule[] = [
  { id: 1, name: 'Web Ordering', domain: 'customer', status: 'hardening', priority: 'Now', description: 'Menu, cart, checkout and collection ordering.', defaultVisible: true, icon: 'orders' },
  { id: 2, name: 'Voice Ordering', domain: 'customer', status: 'hardening', priority: 'Now', description: 'AI phone ordering, menu lookup, wait time and escalation.', defaultVisible: true, icon: 'voice' },
  { id: 3, name: 'QR Ordering', domain: 'customer', status: 'hardening', priority: 'Now', description: 'Tracked table, venue and campaign ordering links plus direct Google Review QR codes.', defaultVisible: true, icon: 'qr' },
  { id: 4, name: 'PWA & Mobile App', domain: 'customer', status: 'hardening', priority: 'Next', description: 'Installable customer and staff experiences.', defaultVisible: true, icon: 'mobile' },
  { id: 5, name: 'Scheduled Pre-orders', domain: 'customer', status: 'building', priority: 'Now', description: 'Future pickup windows with capacity protection.', defaultVisible: true, icon: 'calendar' },
  { id: 6, name: 'Review Engine', domain: 'customer', status: 'building', priority: 'Now', description: 'Post-order feedback, service recovery and review requests.', defaultVisible: true, icon: 'reviews' },
  { id: 7, name: 'Loyalty', domain: 'customer', status: 'hardening', priority: 'Next', description: 'Earn, redeem and measure repeat-customer rewards.', defaultVisible: true, icon: 'loyalty' },
  { id: 8, name: 'Coupons & Discounts', domain: 'customer', status: 'hardening', priority: 'Later', description: 'Governed offers with redemption and margin controls.', defaultVisible: false, icon: 'discounts' },
  { id: 9, name: 'Allergen Display', domain: 'customer', status: 'hardening', priority: 'Now', description: 'Named allergens presented before purchase.', defaultVisible: true, icon: 'allergens' },
  { id: 10, name: 'Community Votes', domain: 'customer', status: 'parked', priority: 'Optional', description: 'Optional customer voting and product feedback.', defaultVisible: false, icon: 'reviews' },

  { id: 11, name: 'Kitchen Display', domain: 'operations', status: 'live', priority: 'Now', description: 'Paid-order kitchen queue and fulfilment workflow.', defaultVisible: true, icon: 'kitchen' },
  { id: 12, name: 'Printing & Receipts', domain: 'operations', status: 'hardening', priority: 'Now', description: 'Consistent kitchen and customer receipt output.', defaultVisible: true, icon: 'printer' },
  { id: 13, name: 'Staff POS', domain: 'operations', status: 'hardening', priority: 'Now', description: 'Counter ordering, cash and terminal checkout.', defaultVisible: true, icon: 'pos' },
  { id: 14, name: 'Order Tracking', domain: 'operations', status: 'hardening', priority: 'Now', description: 'Order states, pickup readiness and customer status.', defaultVisible: true, icon: 'orders' },
  { id: 15, name: 'Menu Management', domain: 'operations', status: 'hardening', priority: 'Now', description: 'Products, prices, modifiers and availability.', defaultVisible: true, icon: 'menu' },
  { id: 16, name: 'Availability & Sold-out', domain: 'operations', status: 'hardening', priority: 'Now', description: 'One availability rule across every channel.', defaultVisible: true, icon: 'menu' },
  { id: 17, name: 'Wait Time', domain: 'operations', status: 'live', priority: 'Now', description: 'One wait-time source for web, staff and voice.', defaultVisible: true, icon: 'clock' },
  { id: 18, name: 'Inventory & Stock', domain: 'operations', status: 'planned', priority: 'Next', description: 'Sales-led depletion, low-stock alerts and waste.', defaultVisible: true, icon: 'inventory' },
  { id: 19, name: 'Rostering & Scheduling', domain: 'operations', status: 'planned', priority: 'Later', description: 'Shifts, availability, labour coverage and handover.', defaultVisible: true, icon: 'staff' },
  { id: 20, name: 'HACCP & Food Safety', domain: 'operations', status: 'planned', priority: 'Next', description: 'Temperature, cleaning and corrective-action logs.', defaultVisible: true, icon: 'safety' },
  { id: 21, name: 'Procurement & Suppliers', domain: 'operations', status: 'planned', priority: 'Later', description: 'Supplier catalogue, purchase orders and receiving.', defaultVisible: true, icon: 'suppliers' },

  { id: 22, name: 'Online Payments', domain: 'money', status: 'hardening', priority: 'Now', description: 'Provider-confirmed card payment and reconciliation.', defaultVisible: true, icon: 'payments' },
  { id: 23, name: 'Terminal Payments', domain: 'money', status: 'hardening', priority: 'Now', description: 'Confirmed in-person card payment workflow.', defaultVisible: true, icon: 'pos' },
  { id: 24, name: 'Refunds', domain: 'money', status: 'planned', priority: 'Later', description: 'Audited refund requests and provider handoff.', defaultVisible: false, icon: 'refunds' },
  { id: 25, name: 'Invoicing & Accounting', domain: 'money', status: 'planned', priority: 'Later', description: 'Accounting integration and invoice status.', defaultVisible: true, icon: 'invoices' },
  { id: 26, name: 'Cash Reconciliation', domain: 'money', status: 'planned', priority: 'Next', description: 'Till counts, variances and end-of-day close.', defaultVisible: true, icon: 'cash' },
  { id: 27, name: 'Tips', domain: 'money', status: 'planned', priority: 'Later', description: 'Tips capture, allocation and reporting.', defaultVisible: true, icon: 'tips' },

  { id: 28, name: 'Customer CRM', domain: 'growth', status: 'hardening', priority: 'Now', description: 'Customers, paid-order value, consent and segments.', defaultVisible: true, icon: 'customers' },
  { id: 29, name: 'SMS Broadcast', domain: 'growth', status: 'hardening', priority: 'Now', description: 'Consent-safe campaigns with provider-sourced metrics.', defaultVisible: true, icon: 'broadcast' },
  { id: 30, name: 'Content Engine', domain: 'growth', status: 'building', priority: 'Next', description: 'Brand-led content planning, creation and approval.', defaultVisible: true, icon: 'content' },
  { id: 31, name: 'Ads Management', domain: 'growth', status: 'planned', priority: 'Later', description: 'Campaign orchestration, spend and outcome reporting.', defaultVisible: false, icon: 'ads' },
  { id: 32, name: 'Missed-call Text-back', domain: 'growth', status: 'planned', priority: 'Next', description: 'AI call handling, customer follow-up and owner alert.', defaultVisible: true, icon: 'phone' },
  { id: 33, name: 'Location Broadcast', domain: 'growth', status: 'parked', priority: 'Optional', description: 'Food-truck location and event announcements.', defaultVisible: false, icon: 'location' },
  { id: 34, name: 'Email Marketing', domain: 'growth', status: 'planned', priority: 'Next', description: 'Consent-led email campaigns and lifecycle messages.', defaultVisible: true, icon: 'email' },

  { id: 35, name: 'Business Intelligence', domain: 'intelligence', status: 'building', priority: 'Now', description: 'Trusted paid sales, product, channel, service and data-health insights.', defaultVisible: true, icon: 'analytics' },
  { id: 36, name: 'Owner Reporting', domain: 'intelligence', status: 'building', priority: 'Now', description: 'On-demand owner reporting is live in the console; scheduled digests remain in build.', defaultVisible: true, icon: 'reports' },
  { id: 37, name: 'AI Management Assistant', domain: 'intelligence', status: 'building', priority: 'Now', description: 'Admin-only menu and BI assistant with preview, confirmation, rate limits and an immutable change audit.', defaultVisible: true, icon: 'assistant' },

  { id: 38, name: 'Client Configuration', domain: 'platform', status: 'planned', priority: 'Now', description: 'Brand, location, integrations and feature configuration.', defaultVisible: true, icon: 'settings' },
  { id: 39, name: 'Tenant & Location Model', domain: 'platform', status: 'planned', priority: 'Next', description: 'Isolated reusable data model for every client.', defaultVisible: true, icon: 'tenants' },
  { id: 40, name: 'Provisioning Engine', domain: 'platform', status: 'planned', priority: 'Later', description: 'Idempotent, resumable client provisioning.', defaultVisible: false, icon: 'automation' },
  { id: 41, name: 'Secrets Management', domain: 'platform', status: 'planned', priority: 'Now', description: 'Scoped secret references outside code and workflows.', defaultVisible: true, icon: 'security' },
  { id: 42, name: 'Fleet Observability', domain: 'platform', status: 'building', priority: 'Now', description: 'Workflow, printer, credit and provider health.', defaultVisible: true, icon: 'monitoring' },
  { id: 43, name: 'Billing & Entitlements', domain: 'platform', status: 'planned', priority: 'Later', description: 'Packages, entitlements, dunning and safe degradation.', defaultVisible: false, icon: 'billing' },
  { id: 44, name: 'Usage Metering', domain: 'platform', status: 'planned', priority: 'Later', description: 'Per-client channel usage and provider cost.', defaultVisible: false, icon: 'analytics' },
  { id: 45, name: 'Offboarding & Data Export', domain: 'platform', status: 'planned', priority: 'Later', description: 'Portable client-owned data and clean offboarding.', defaultVisible: false, icon: 'export' },
  { id: 46, name: 'Menu Import Agent', domain: 'platform', status: 'planned', priority: 'Next', description: 'Photo, PDF or URL to reviewed menu candidates.', defaultVisible: true, icon: 'import' },
  { id: 47, name: 'Edge Kit', domain: 'platform', status: 'building', priority: 'Later', description: 'Repeatable printer and on-site hardware image.', defaultVisible: false, icon: 'devices' },
  { id: 48, name: 'Authentication & Roles', domain: 'platform', status: 'hardening', priority: 'Now', description: 'Least-privilege owner, manager and staff access.', defaultVisible: true, icon: 'security' },
  { id: 49, name: 'Notification Service', domain: 'platform', status: 'building', priority: 'Next', description: 'Central transactional and marketing communications.', defaultVisible: true, icon: 'notifications' },
  { id: 50, name: 'API & Webhook Security', domain: 'platform', status: 'hardening', priority: 'Now', description: 'Signed, deduplicated and observable inbound events.', defaultVisible: true, icon: 'api' },
  { id: 51, name: 'Documentation & Runbooks', domain: 'platform', status: 'building', priority: 'Now', description: 'Operator, incident, integration and recovery guidance.', defaultVisible: true, icon: 'docs' },
  { id: 52, name: 'QA & Release Evidence', domain: 'platform', status: 'building', priority: 'Now', description: 'Automated journeys, manual checks and release gates.', defaultVisible: true, icon: 'qa' },
  { id: 53, name: 'Backup & Disaster Recovery', domain: 'platform', status: 'planned', priority: 'Now', description: 'Versioned exports, restore tests and accountable recovery.', defaultVisible: true, icon: 'backup' },
];
