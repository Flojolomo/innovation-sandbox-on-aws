// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  LeaseWithLeaseId,
  MonitoredLease,
} from "@amzn/innovation-sandbox-commons/data/lease/lease";

export type NewLeaseRequest = {
  leaseTemplateUuid: string;
  comments?: string;
  userEmail?: string;
};

export type LeasePatchRequest = {
  leaseId: LeaseWithLeaseId["leaseId"];
  maxSpend?: MonitoredLease["maxSpend"] | null;
  budgetThresholds?: MonitoredLease["budgetThresholds"];
  expirationDate?: MonitoredLease["expirationDate"] | null;
  durationThresholds?: MonitoredLease["durationThresholds"];
  costReportGroup?: MonitoredLease["costReportGroup"] | null;
};

export type LeaseFormData = LeasePatchRequest & {
  maxBudgetEnabled?: boolean;
  maxDurationEnabled?: boolean;
};

export type LeaseExtensionRequest = {
  requestedExpirationDate: string;
  comments?: string;
};

export type MonitoredLeaseWithLeaseId = MonitoredLease & LeaseWithLeaseId;

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
