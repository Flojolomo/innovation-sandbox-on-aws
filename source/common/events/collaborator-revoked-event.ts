// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

import { LeaseKeySchema } from "@amzn/innovation-sandbox-commons/data/lease/lease.js";
import { EventDetailTypes } from "@amzn/innovation-sandbox-commons/events/index.js";
import { IsbEvent } from "@amzn/innovation-sandbox-commons/sdk-clients/event-bridge-client.js";
import { AwsAccountIdSchema } from "@amzn/innovation-sandbox-commons/utils/zod.js";

export const CollaboratorRevokedEventSchema = z.object({
  leaseId: LeaseKeySchema,
  accountId: AwsAccountIdSchema,
  collaboratorEmail: z.string().email(),
  revokedBy: z.string().email(),
  reason: z.enum(["ManuallyRevoked", "LeaseTerminated", "LeaseFrozen"]),
});

export class CollaboratorRevokedEvent implements IsbEvent {
  readonly DetailType = EventDetailTypes.CollaboratorRevoked;
  readonly Detail: z.infer<typeof CollaboratorRevokedEventSchema>;

  constructor(eventData: z.infer<typeof CollaboratorRevokedEventSchema>) {
    this.Detail = eventData;
  }

  public static parse(eventDetail: unknown) {
    return new CollaboratorRevokedEvent(
      CollaboratorRevokedEventSchema.parse(eventDetail),
    );
  }
}
