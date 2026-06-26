// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

import {
  OptionalItem,
  PaginatedQueryResult,
  PutResult,
  SingleItemResult,
} from "@amzn/innovation-sandbox-commons/data/common-types.js";
import {
  base64DecodeCompositeKey,
  base64EncodeCompositeKey,
} from "@amzn/innovation-sandbox-commons/data/encoding.js";
import {
  ItemAlreadyExists,
  UnknownItem,
} from "@amzn/innovation-sandbox-commons/data/errors.js";
import { LeaseCollaboratorStore } from "@amzn/innovation-sandbox-commons/data/lease-collaborator/lease-collaborator-store.js";
import {
  LeaseCollaborator,
  LeaseCollaboratorKey,
  LeaseCollaboratorSchema,
  LeaseCollaboratorSchemaVersion,
} from "@amzn/innovation-sandbox-commons/data/lease-collaborator/lease-collaborator.js";
import {
  parseResults,
  parseSingleItemResult,
  removeNullFieldsForDynamoDB,
  validateItem,
  withMetadata,
} from "@amzn/innovation-sandbox-commons/data/utils.js";

export class DynamoLeaseCollaboratorStore extends LeaseCollaboratorStore {
  private readonly tableName: string;
  private readonly ddbClient: DynamoDBDocumentClient;

  constructor(props: {
    client: DynamoDBDocumentClient;
    leaseCollaboratorTableName: string;
  }) {
    super();
    this.tableName = props.leaseCollaboratorTableName;
    this.ddbClient = props.client;
  }

  @validateItem(LeaseCollaboratorSchema)
  @withMetadata(LeaseCollaboratorSchemaVersion)
  public override async create(
    collaborator: LeaseCollaborator,
  ): Promise<LeaseCollaborator> {
    try {
      await this.ddbClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: removeNullFieldsForDynamoDB(collaborator),
          ConditionExpression:
            "attribute_not_exists(leaseUuid) AND attribute_not_exists(collaboratorEmail)",
        }),
      );
      return collaborator;
    } catch (error: unknown) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ItemAlreadyExists(
          "Collaborator already exists for this lease.",
        );
      }
      throw error;
    }
  }

  @validateItem(LeaseCollaboratorSchema)
  @withMetadata(LeaseCollaboratorSchemaVersion)
  public override async update(
    collaborator: LeaseCollaborator,
  ): Promise<PutResult<LeaseCollaborator>> {
    try {
      const result = await this.ddbClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: removeNullFieldsForDynamoDB(collaborator),
          ReturnValues: "ALL_OLD",
          ConditionExpression: "attribute_exists(leaseUuid)",
        }),
      );
      return {
        oldItem: result.Attributes,
        newItem: collaborator,
      };
    } catch (error: unknown) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new UnknownItem("Unknown Lease Collaborator.");
      }
      throw error;
    }
  }

  public override async get(
    key: LeaseCollaboratorKey,
  ): Promise<SingleItemResult<LeaseCollaborator>> {
    const result = await this.ddbClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
      }),
    );

    return parseSingleItemResult(result.Item, LeaseCollaboratorSchema);
  }

  public override async delete(
    key: LeaseCollaboratorKey,
  ): Promise<OptionalItem> {
    const result = await this.ddbClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: key,
        ReturnValues: "ALL_OLD",
      }),
    );

    return result.Attributes;
  }

  public override async findByLeaseUuid(props: {
    leaseUuid: string;
    pageIdentifier?: string;
    pageSize?: number;
  }): Promise<PaginatedQueryResult<LeaseCollaborator>> {
    const { leaseUuid, pageIdentifier, pageSize } = props;

    const result = await this.ddbClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "#leaseUuid = :leaseUuid",
        ExpressionAttributeNames: {
          "#leaseUuid": "leaseUuid",
        },
        ExpressionAttributeValues: {
          ":leaseUuid": leaseUuid,
        },
        ExclusiveStartKey: base64DecodeCompositeKey(pageIdentifier),
        Limit: pageSize,
      }),
    );

    return {
      ...parseResults(result.Items, LeaseCollaboratorSchema),
      nextPageIdentifier: base64EncodeCompositeKey(result.LastEvaluatedKey),
    };
  }

  public override async findActiveByLeaseUuid(props: {
    leaseUuid: string;
    pageIdentifier?: string;
    pageSize?: number;
  }): Promise<PaginatedQueryResult<LeaseCollaborator>> {
    const { leaseUuid, pageIdentifier, pageSize } = props;

    const result = await this.ddbClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "#leaseUuid = :leaseUuid",
        FilterExpression: "#status = :activeStatus",
        ExpressionAttributeNames: {
          "#leaseUuid": "leaseUuid",
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":leaseUuid": leaseUuid,
          ":activeStatus": "Active",
        },
        ExclusiveStartKey: base64DecodeCompositeKey(pageIdentifier),
        Limit: pageSize,
      }),
    );

    return {
      ...parseResults(result.Items, LeaseCollaboratorSchema),
      nextPageIdentifier: base64EncodeCompositeKey(result.LastEvaluatedKey),
    };
  }

  public override async findByCollaboratorEmail(props: {
    collaboratorEmail: string;
    pageIdentifier?: string;
    pageSize?: number;
  }): Promise<PaginatedQueryResult<LeaseCollaborator>> {
    const { collaboratorEmail, pageIdentifier, pageSize } = props;

    const result = await this.ddbClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "CollaboratorEmailIndex",
        KeyConditionExpression: "#collaboratorEmail = :collaboratorEmail",
        ExpressionAttributeNames: {
          "#collaboratorEmail": "collaboratorEmail",
        },
        ExpressionAttributeValues: {
          ":collaboratorEmail": collaboratorEmail,
        },
        ExclusiveStartKey: base64DecodeCompositeKey(pageIdentifier),
        Limit: pageSize,
      }),
    );

    return {
      ...parseResults(result.Items, LeaseCollaboratorSchema),
      nextPageIdentifier: base64EncodeCompositeKey(result.LastEvaluatedKey),
    };
  }
}
