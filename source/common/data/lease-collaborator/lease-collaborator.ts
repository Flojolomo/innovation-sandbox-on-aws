// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

import {
  createItemWithMetadataSchema,
  createVersionRangeSchema,
} from "@amzn/innovation-sandbox-commons/data/metadata.js";

// IMPORTANT -- this value must be updated whenever the schema changes.
export const LeaseCollaboratorSchemaVersion = 1;

// Define supported version range for backwards compatibility
const LeaseCollaboratorSupportedVersionsSchema = createVersionRangeSchema(
  1,
  LeaseCollaboratorSchemaVersion,
);

// Create ItemWithMetadata schema with version validation
const LeaseCollaboratorItemWithMetadataSchema = createItemWithMetadataSchema(
  LeaseCollaboratorSupportedVersionsSchema,
);

/**
 * A LeaseCollaborator represents a user who has been invited to share access
 * to a leased AWS sandbox account. Collaborators receive the same IAM Identity
 * Center permission set as the lease owner, granting them access to the account
 * for the duration of the lease.
 *
 * Key design decisions:
 * - Collaborators are keyed by leaseId (composite of ownerEmail+uuid) and collaborator email
 * - The lease owner controls who can be invited/removed
 * - Managers/Admins can also manage collaborators
 * - When a lease is frozen/terminated, all collaborator access is revoked
 * - When a lease is unfrozen, all collaborator access is restored
 */
export const LeaseCollaboratorKeySchema = z.object({
  leaseUuid: z.string().uuid(),
  collaboratorEmail: z.string().email(),
});

export const LeaseCollaboratorSchema = LeaseCollaboratorKeySchema.extend({
  ownerEmail: z.string().email(),
  invitedBy: z.string().email(),
  awsAccountId: z.string().regex(/^\d{12}$/),
  status: z.enum(["Active", "Revoked"]),
}).merge(LeaseCollaboratorItemWithMetadataSchema);

export type LeaseCollaboratorKey = z.infer<typeof LeaseCollaboratorKeySchema>;
export type LeaseCollaborator = z.infer<typeof LeaseCollaboratorSchema>;

export function isActiveCollaborator(
  collaborator: LeaseCollaborator,
): boolean {
  return collaborator.status === "Active";
}
