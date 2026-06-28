// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

import { LeaseKeySchema } from "@amzn/innovation-sandbox-commons/data/lease/lease.js";
import { EventDetailTypes } from "@amzn/innovation-sandbox-commons/events/index.js";
import { IsbEvent } from "@amzn/innovation-sandbox-commons/sdk-clients/event-bridge-client.js";
import { AwsAccountIdSchema } from "@amzn/innovation-sandbox-commons/utils/zod.js";

export const CollaboratorInvitedEventSchema = z.object({
  leaseId: LeaseKeySchema,
  accountId: AwsAccountIdSchema,
  collaboratorEmail: z.string().email(),
  invitedBy: z.string().email(),
});

export class CollaboratorInvitedEvent implements IsbEvent {
  readonly DetailType = EventDetailTypes.CollaboratorInvited;
  readonly Detail: z.infer<typeof CollaboratorInvitedEventSchema>;

  constructor(eventData: z.infer<typeof CollaboratorInvitedEventSchema>) {
    this.Detail = eventData;
  }

  public static parse(eventDetail: unknown) {
    return new CollaboratorInvitedEvent(
      CollaboratorInvitedEventSchema.parse(eventDetail),
    );
  }
}
