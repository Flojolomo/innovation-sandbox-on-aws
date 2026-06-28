# Feature Spec: Lease Collaboration (Invite Collaborators)

## Overview

This feature allows lease owners to invite other engineers to collaborate on their active AWS sandbox account. Collaborators receive the same IAM Identity Center (IDC) user permission set as the lease owner, enabling shared access to the sandbox account for the duration of the lease.

## User Stories

- **As a lease owner**, I want to invite other engineers to my sandbox account so we can collaborate on the same resources.
- **As a lease owner**, I want to revoke a collaborator's access when collaboration is complete.
- **As a manager/admin**, I want visibility into who has access to each sandbox account.
- **As a collaborator**, I want my access to be automatically cleaned up when the lease ends.

## Architecture

### Data Model

**New DynamoDB Table: LeaseCollaborators**

| Attribute | Type | Role |
|-----------|------|------|
| `leaseUuid` | String (UUID) | Partition Key |
| `collaboratorEmail` | String (email) | Sort Key |
| `ownerEmail` | String (email) | Lease owner |
| `invitedBy` | String (email) | Who created the invitation |
| `awsAccountId` | String (12 digits) | Target account |
| `status` | Enum: `Active` / `Revoked` | Current state |
| `meta` | Object | createdTime, lastEditTime, schemaVersion |

**GSI: CollaboratorEmailIndex**
- Partition Key: `collaboratorEmail`
- Enables querying "what leases am I collaborating on?"

### API Endpoints

All endpoints are sub-resources of `/leases/{leaseId}`:

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/leases/{leaseId}/collaborators` | Invite a collaborator | Owner, Manager, Admin |
| `GET` | `/leases/{leaseId}/collaborators` | List collaborators | Owner, Manager, Admin |
| `DELETE` | `/leases/{leaseId}/collaborators/{collaboratorEmail}` | Revoke a collaborator | Owner, Manager, Admin |

**POST Request Body:**
```json
{
  "collaboratorEmail": "engineer@example.com"
}
```

**Response Format:** JSend (`{ status: "success", data: ... }`)

### EventBridge Events

| Event | Detail Type | Emitted When |
|-------|-------------|--------------|
| `CollaboratorInvitedEvent` | `CollaboratorInvited` | Collaborator added to a lease |
| `CollaboratorRevokedEvent` | `CollaboratorRevoked` | Collaborator removed (manually, frozen, or terminated) |

**CollaboratorRevokedEvent reasons:**
- `ManuallyRevoked` — Owner/manager explicitly removed the collaborator
- `LeaseFrozen` — Lease was frozen (budget/duration threshold or manual)
- `LeaseTerminated` — Lease ended (expired, budget exceeded, manually terminated, etc.)

## Lifecycle Integration

### Invite Flow
1. User calls `POST /leases/{leaseId}/collaborators` with collaborator email
2. System validates: lease is Active, collaborator exists in IDC, not the owner, not already active
3. IDC `CreateAccountAssignment` grants the user permission set to the collaborator
4. Collaborator record created in DynamoDB with status `Active`
5. `CollaboratorInvitedEvent` emitted

### Revoke Flow (Manual)
1. User calls `DELETE /leases/{leaseId}/collaborators/{email}`
2. System calls IDC `DeleteAccountAssignment` to revoke individual access
3. Collaborator record updated to status `Revoked`
4. `CollaboratorRevokedEvent` emitted with reason `ManuallyRevoked`

### Freeze Flow
1. Existing `freezeLease` logic calls `revokeAllUserAccess` (removes ALL user permission sets from account)
2. **New:** `revokeAllCollaboratorRecords` marks all active collaborator records as `Revoked`
3. `CollaboratorRevokedEvent` emitted for each collaborator with reason `LeaseFrozen`

### Unfreeze Flow
1. Existing `unfreezeLease` logic grants access back to lease owner
2. **New:** `restoreCollaboratorAccess` iterates all revoked collaborators:
   - Resolves each collaborator in IDC
   - Re-grants IDC user permission set via `CreateAccountAssignment`
   - Updates record back to `Active`
   - Emits `CollaboratorInvitedEvent` with invitedBy `SYSTEM_RESTORE`

### Terminate Flow
1. Existing `terminateLease` logic calls `revokeAllUserAccess` and cleans up the account
2. **New:** `revokeAllCollaboratorRecords` marks all active collaborator records as `Revoked`
3. `CollaboratorRevokedEvent` emitted for each collaborator with reason `LeaseTerminated`

## Design Decisions

1. **Collaborators stored in a separate table** — Avoids schema version bumps on the Lease table and allows independent scaling. The LeaseCollaborator table uses leaseUuid as PK for efficient lookup of all collaborators per lease.

2. **Optional `leaseCollaboratorStore` in context** — Freeze/terminate/unfreeze accept the store as optional to maintain backward compatibility with existing callers (e.g., monitoring lambdas) that don't have the collaborator table name configured yet.

3. **IDC access via same user permission set** — Collaborators get the same `userPermissionSetArn` as the lease owner. This ensures consistent access levels and means `revokeAllUserAccess` (used in freeze/terminate) automatically removes collaborator access at the IDC level.

4. **Re-activation instead of re-creation** — If a previously revoked collaborator is re-invited, their existing record is updated to `Active` rather than creating a duplicate.

5. **No separate Lambda** — Collaborator endpoints are added to the existing Leases Lambda handler since they share the same environment dependencies and authorization patterns.

6. **`revokeSingleUserAccess` added to IdcService** — A new public method that wraps the private `revokeUserAccess` to support individual collaborator revocation without affecting the lease owner.

## Files Modified/Created

### New Files
- `source/common/data/lease-collaborator/lease-collaborator.ts` — Zod schema and types
- `source/common/data/lease-collaborator/lease-collaborator-store.ts` — Abstract store interface
- `source/common/data/lease-collaborator/dynamo-lease-collaborator-store.ts` — DynamoDB implementation
- `source/common/events/collaborator-invited-event.ts` — EventBridge event
- `source/common/events/collaborator-revoked-event.ts` — EventBridge event

### Modified Files
- `source/common/events/index.ts` — Added `CollaboratorInvited`, `CollaboratorRevoked` to EventDetailTypes
- `source/common/innovation-sandbox.ts` — Added `inviteCollaborator`, `revokeCollaborator`, `revokeAllCollaboratorRecords`, `restoreCollaboratorAccess` methods; updated `freezeLease`, `terminateLease`, `unfreezeLease`; added new error classes
- `source/common/isb-services/idc-service.ts` — Added `revokeSingleUserAccess` public method
- `source/common/isb-services/index.ts` — Added `leaseCollaboratorStore` factory and `ServiceEnv.leaseCollaboratorStore` type
- `source/common/lambda/environments/lease-lambda-environment.ts` — Added `LEASE_COLLABORATOR_TABLE_NAME`
- `source/lambdas/api/leases/src/leases-handler.ts` — Added 3 new route handlers

## Infrastructure Requirements (CDK — Not Yet Implemented)

To deploy this feature, the following CDK changes are needed:

1. **New DynamoDB Table** in the Data stack:
   - Table name: `{namespace}-LeaseCollaborators`
   - Partition Key: `leaseUuid` (String)
   - Sort Key: `collaboratorEmail` (String)
   - GSI `CollaboratorEmailIndex`: PK=`collaboratorEmail`
   - Billing: PAY_PER_REQUEST
   - Point-in-time recovery: enabled
   - Removal policy: based on `DEPLOYMENT_MODE`

2. **Environment variable** `LEASE_COLLABORATOR_TABLE_NAME` added to the Leases Lambda function

3. **IAM permissions** for the Leases Lambda to read/write the new table

4. **API Gateway route** additions (if not using a proxy integration):
   - `POST /leases/{leaseId}/collaborators`
   - `GET /leases/{leaseId}/collaborators`
   - `DELETE /leases/{leaseId}/collaborators/{collaboratorEmail}`

## Security Considerations

- Only the lease owner, Managers, and Admins can invite/revoke collaborators
- Collaborators must exist in IAM Identity Center (validated before granting access)
- Lease owners cannot invite themselves as collaborators
- All collaborator access is automatically revoked when a lease is frozen or terminated
- Individual collaborator revocation uses targeted `DeleteAccountAssignment` (not `revokeAllUserAccess`) to avoid affecting other users
