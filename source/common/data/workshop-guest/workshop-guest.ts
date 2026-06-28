// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

export const WorkshopGuestStatusSchema = z.enum([
  "Active",
  "Pending",
  "Failed",
  "Cleaned",
]);

export const WorkshopGuestSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  company: z.string().optional(),
  userId: z.string().optional(),
  status: WorkshopGuestStatusSchema,
  createdAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});

export type WorkshopGuest = z.infer<typeof WorkshopGuestSchema>;
export type WorkshopGuestStatus = z.infer<typeof WorkshopGuestStatusSchema>;

export const OnboardWorkshopGuestsRequestSchema = z.object({
  guests: z.array(
    WorkshopGuestSchema.pick({
      email: true,
      firstName: true,
      lastName: true,
      company: true,
    }),
  ),
  accountIds: z.array(z.string().regex(/^\d{12}$/)).min(1),
  namespace: z.string().min(1),
});

export type OnboardWorkshopGuestsRequest = z.infer<
  typeof OnboardWorkshopGuestsRequestSchema
>;

export const CleanupWorkshopGuestsRequestSchema = z.object({
  namespace: z.string().min(1),
  deleteGroup: z.boolean().optional().default(false),
});

export type CleanupWorkshopGuestsRequest = z.infer<
  typeof CleanupWorkshopGuestsRequestSchema
>;
