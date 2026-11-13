# Dealpin Daily Command Center

## Purpose

The Daily Command Center is the operating layer above Dealpin's existing transaction and Business Autopilot records. It does not replace the existing modules. It connects them.

## Daily loop

1. Open Dealpin.
2. See what needs attention right now.
3. Work from Urgent, Today and Next.
4. Open the underlying record rather than copying data between modules.
5. Return to the Universal Inbox when the action is complete.
6. Use Relationship Memory to understand the customer before the next interaction.
7. Continue where you left off on the next visit.

## Sources used

- Deal records and their event timelines.
- Deal payment confirmation state.
- Delivery/shipped state.
- Business Autopilot tasks and due dates.
- Business Autopilot opportunities and follow-up dates.
- Inventory quantity, reservations and reorder points.
- Purchase orders.
- Stock reservations.
- CRM customer records.

## Data integrity

The Command Center is derived from existing records. It does not manufacture transactions, customers, revenue, inventory or activity. Empty workspaces show empty states instead of sample data.

## Device state

Read/unread inbox convenience state, daily check-in streak and last workspace context are stored locally on the device. The underlying business records remain in the existing Dealpin local store or Supabase workspace store, depending on deployment mode.

## Security posture

The feature does not introduce a new authentication boundary. It uses the same authenticated Dealpin workspace and existing record access paths. Links point to existing Dealpin routes and do not expose private record contents in query parameters.
