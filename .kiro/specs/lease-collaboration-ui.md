# Feature Spec: Lease Collaboration UI

## Overview

Add frontend UI for the lease collaboration feature, enabling users to invite collaborators from their lease card's Actions menu, and admins/managers to view and manage collaborators from the lease detail page.

## Entry Points

### 1. User View — Actions Dropdown (Home Page)

**Location:** `LeasePanel` component on the user's home page (`source/frontend/src/domains/home/components/LeasePanel.tsx`)

**Change:** Add a CloudScape `ButtonDropdown` (Actions menu) to the lease card header actions area, alongside the existing "Login to account" button. The dropdown will contain:

| Item | Condition | Action |
|------|-----------|--------|
| Invite Collaborator | Lease is `Active` | Opens the Invite Collaborator modal |
| Terminate Lease | Lease is `Active` or `Frozen` | Opens terminate confirmation modal |

The "Invite Collaborator" item should only be enabled when the lease status is `Active`.

### 2. Admin/Manager View — Collaborators Section (Lease Detail Page)

**Location:** `LeaseDetails` page (`source/frontend/src/domains/leases/pages/LeaseDetails.tsx`)

**Change:** Add a new `CollaboratorsList` component rendered below the `LeaseSummary`. This shows:

- A table of current collaborators (email, status, invited by, date added)
- An "Invite" button in the table header (only for Active leases)
- A "Revoke" action button per active collaborator row

---

## Components to Create

### `InviteCollaboratorModal.tsx`

**Path:** `source/frontend/src/domains/leases/components/InviteCollaboratorModal.tsx`

A modal form with:
- **Header:** "Invite Collaborator"
- **Body:** Email input field (validated as email format) with a label "Collaborator email" and description "Enter the email address of the user in Identity Center to invite."
- **Footer:** Cancel + Invite buttons
- **Behavior:**
  - On submit, calls `POST /leases/{leaseId}/collaborators` with `{ collaboratorEmail }`
  - Shows loading spinner on Invite button during request
  - On success: closes modal, shows success toast ("Collaborator invited successfully"), invalidates collaborators query
  - On error: shows inline error alert (e.g., "User not found in Identity Center", "Already a collaborator", "Cannot invite yourself")

**Form validation:**
- Email format (Zod `z.string().email()` via `react-hook-form` + `@hookform/resolvers`)
- Non-empty

### `CollaboratorsList.tsx`

**Path:** `source/frontend/src/domains/leases/components/CollaboratorsList.tsx`

A CloudScape `Container` with:
- **Header:** "Collaborators" with a counter badge showing the count
- **Header action:** "Invite" button (only visible if lease is Active)
- **Content:** CloudScape `Table` with columns:
  - Email (collaborator email)
  - Status (badge: green "Active" / grey "Revoked")
  - Invited by
  - Date added (from `meta.createdTime`, formatted)
  - Actions (Revoke button, only for Active collaborators on Active/Frozen leases)
- **Empty state:** "No collaborators. Invite team members to share access to this sandbox account."
- **Loading:** Standard CloudScape table loading indicator

**Revoke action:**
- Click "Revoke" shows a confirmation modal: "Are you sure you want to revoke access for {email}?"
- On confirm, calls `DELETE /leases/{leaseId}/collaborators/{email}`
- On success: toast + refetch collaborators

---

## Service Layer Changes

### `source/frontend/src/domains/leases/service.ts`

Add methods to `LeaseService`:

```typescript
async getCollaborators(leaseId: string): Promise<LeaseCollaborator[]> {
  const response = await this.api.get<ApiPaginatedResult<LeaseCollaborator>>(
    `/leases/${leaseId}/collaborators`
  );
  return response.result;
}

async inviteCollaborator(leaseId: string, collaboratorEmail: string): Promise<LeaseCollaborator> {
  return await this.api.post<LeaseCollaborator>(
    `/leases/${leaseId}/collaborators`,
    { collaboratorEmail }
  );
}

async revokeCollaborator(leaseId: string, collaboratorEmail: string): Promise<void> {
  await this.api.delete(
    `/leases/${leaseId}/collaborators/${encodeURIComponent(collaboratorEmail)}`
  );
}
```

### `source/frontend/src/domains/leases/types.ts`

Add type:

```typescript
export interface LeaseCollaborator {
  leaseUuid: string;
  collaboratorEmail: string;
  ownerEmail: string;
  invitedBy: string;
  awsAccountId: string;
  status: "Active" | "Revoked";
  meta?: {
    createdTime?: string;
    lastEditTime?: string;
    schemaVersion: number;
  };
}
```

---

## React Query Hooks

### `source/frontend/src/domains/leases/hooks.ts`

Add hooks:

```typescript
export const useGetCollaborators = (leaseId: string) => {
  return useQuery({
    queryKey: ["leases", leaseId, "collaborators"],
    queryFn: async () => await new LeaseService().getCollaborators(leaseId),
    enabled: !!leaseId,
  });
};

export const useInviteCollaborator = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ leaseId, collaboratorEmail }: { leaseId: string; collaboratorEmail: string }) =>
      await new LeaseService().inviteCollaborator(leaseId, collaboratorEmail),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["leases", variables.leaseId, "collaborators"] });
    },
  });
};

export const useRevokeCollaborator = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ leaseId, collaboratorEmail }: { leaseId: string; collaboratorEmail: string }) =>
      await new LeaseService().revokeCollaborator(leaseId, collaboratorEmail),
    onSuccess: (_data, variables) => {
      client.invalidateQueries({ queryKey: ["leases", variables.leaseId, "collaborators"] });
    },
  });
};
```

---

## UI Behavior Details

### User Home Page (LeasePanel)

```
┌─────────────────────────────────────────────────────────────────┐
│  Test                          [Login to account] [Actions ▼]   │
│  ● Active                      ┌─────────────────────┐         │
│                                 │ Invite Collaborator │         │
│────────────────────────────────│ Terminate Lease     │─────────│
│  AWS Account ID  │  Expiry     └─────────────────────┘         │
│  596953737038    │  in 2 days                                   │
│                                                                 │
│  Budget                                                         │
│  ████░░░░░░░░░░  0%                                             │
│  $0 of $5                                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Admin Lease Detail (CollaboratorsList)

```
┌─────────────────────────────────────────────────────────────────┐
│  Collaborators (2)                              [Invite]         │
│─────────────────────────────────────────────────────────────────│
│  Email                │ Status  │ Invited by      │ Actions     │
│  alice@example.com    │ Active  │ owner@corp.com  │ [Revoke]    │
│  bob@example.com      │ Active  │ owner@corp.com  │ [Revoke]    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `source/frontend/src/domains/leases/components/InviteCollaboratorModal.tsx` | Modal form for inviting a collaborator |
| `source/frontend/src/domains/leases/components/CollaboratorsList.tsx` | Table listing collaborators with revoke action |

## Files to Modify

| File | Change |
|------|--------|
| `source/frontend/src/domains/home/components/LeasePanel.tsx` | Add Actions ButtonDropdown with "Invite Collaborator" item |
| `source/frontend/src/domains/leases/pages/LeaseDetails.tsx` | Render `CollaboratorsList` below `LeaseSummary` |
| `source/frontend/src/domains/leases/service.ts` | Add `getCollaborators`, `inviteCollaborator`, `revokeCollaborator` methods |
| `source/frontend/src/domains/leases/hooks.ts` | Add `useGetCollaborators`, `useInviteCollaborator`, `useRevokeCollaborator` hooks |
| `source/frontend/src/domains/leases/types.ts` | Add `LeaseCollaborator` type |

---

## Error Handling

| API Error | UI Behavior |
|-----------|-------------|
| 404 "Collaborator not found in Identity Center" | Inline form error: "This email is not registered in Identity Center." |
| 409 "Already a collaborator" | Inline form error: "This user is already a collaborator on this lease." |
| 400 "Cannot invite yourself" | Inline form error: "You cannot invite yourself as a collaborator." |
| 409 "Only active leases" | Inline form error: "Collaborators can only be invited to active leases." |
| 404 "Collaborator not found" (revoke) | Toast error: "Collaborator not found." |
| Network/500 errors | Generic toast error: "Something went wrong. Please try again." |

---

## Access Control (Frontend)

| View | Who can see | Who can act |
|------|-------------|-------------|
| Actions dropdown → "Invite Collaborator" | Lease owner (User role) | Lease owner |
| CollaboratorsList on LeaseDetails | Admin, Manager | Admin, Manager (can also invite/revoke) |
| Revoke button in CollaboratorsList | Admin, Manager | Admin, Manager |

---

## Design Decisions

1. **Actions dropdown on LeasePanel** — Matches the screenshot's existing pattern. Add `ButtonDropdown` from CloudScape alongside the "Login to account" link button.

2. **CollaboratorsList as separate Container** — Keeps it independent from `LeaseSummary` and makes it easy to conditionally render only when the user has admin/manager role.

3. **Terminate in Actions dropdown** — Since we're adding a dropdown anyway, include "Terminate Lease" there too (matches the screenshot). This gives a consistent UX.

4. **No separate page for collaborators** — The data is lightweight (few collaborators per lease), so a table within the detail page is sufficient. No need for pagination on the frontend.

5. **encodeURIComponent for email in DELETE URL** — Emails contain `@` and `.` which are safe in URLs, but the `+` character could be problematic. Always encode.
