// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  OptionalItem,
  PaginatedQueryResult,
  PutResult,
  SingleItemResult,
} from "@amzn/innovation-sandbox-commons/data/common-types.js";
import {
  LeaseCollaborator,
  LeaseCollaboratorKey,
} from "@amzn/innovation-sandbox-commons/data/lease-collaborator/lease-collaborator.js";

export abstract class LeaseCollaboratorStore {
  abstract create(collaborator: LeaseCollaborator): Promise<LeaseCollaborator>;

  abstract update(
    collaborator: LeaseCollaborator,
  ): Promise<PutResult<LeaseCollaborator>>;

  abstract delete(key: LeaseCollaboratorKey): Promise<OptionalItem>;

  abstract get(
    key: LeaseCollaboratorKey,
  ): Promise<SingleItemResult<LeaseCollaborator>>;

  abstract findByLeaseUuid(props: {
    leaseUuid: string;
    pageIdentifier?: string;
    pageSize?: number;
  }): Promise<PaginatedQueryResult<LeaseCollaborator>>;

  abstract findActiveByLeaseUuid(props: {
    leaseUuid: string;
    pageIdentifier?: string;
    pageSize?: number;
  }): Promise<PaginatedQueryResult<LeaseCollaborator>>;

  abstract findByCollaboratorEmail(props: {
    collaboratorEmail: string;
    pageIdentifier?: string;
    pageSize?: number;
  }): Promise<PaginatedQueryResult<LeaseCollaborator>>;
}
