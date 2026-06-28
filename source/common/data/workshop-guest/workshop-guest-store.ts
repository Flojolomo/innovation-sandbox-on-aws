// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { WorkshopGuest } from "@amzn/innovation-sandbox-commons/data/workshop-guest/workshop-guest.js";

/**
 * Interface for persisting and retrieving workshop guest records.
 * Implementations may use DynamoDB or an in-memory store for testing.
 */
export interface WorkshopGuestStore {
  put(guest: WorkshopGuest): Promise<void>;
  list(namespace: string): Promise<WorkshopGuest[]>;
  deleteAll(namespace: string): Promise<void>;
}
