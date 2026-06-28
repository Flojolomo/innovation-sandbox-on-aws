// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  ConflictException,
  CreateGroupCommand,
  CreateGroupMembershipCommand,
  CreateUserCommand,
  DeleteGroupCommand,
  DeleteGroupMembershipCommand,
  DeleteUserCommand,
  DescribeGroupCommand,
  GetGroupIdCommand,
  IdentitystoreClient,
  ListGroupMembershipsCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-identitystore";
import {
  CreateAccountAssignmentCommand,
  DeleteAccountAssignmentCommand,
  SSOAdminClient,
  TargetType,
} from "@aws-sdk/client-sso-admin";

import {
  WorkshopGuest,
  WorkshopGuestStatus,
} from "@amzn/innovation-sandbox-commons/data/workshop-guest/workshop-guest.js";
import pThrottle from "p-throttle";

// IDC supports 20 TPS for all requests
// (https://docs.aws.amazon.com/singlesignon/latest/userguide/limits.html)
const throttle1PerSec = pThrottle({
  limit: 1,
  interval: 1000,
});

export interface WorkshopGuestServiceConfig {
  identityStoreId: string;
  ssoInstanceArn: string;
}

export interface WorkshopGuestServiceProps {
  identityStoreClient: IdentitystoreClient;
  ssoAdminClient: SSOAdminClient;
  config: WorkshopGuestServiceConfig;
}

export interface OnboardGuestsInput {
  guests: {
    email: string;
    firstName: string;
    lastName: string;
    company?: string;
  }[];
  accountIds: string[];
  namespace: string;
  permissionSetArn: string;
}

export interface CleanupGuestsInput {
  namespace: string;
  deleteGroup?: boolean;
  permissionSetArn: string;
  accountIds: string[];
}

export class WorkshopGuestService {
  readonly identityStoreClient: IdentitystoreClient;
  readonly ssoAdminClient: SSOAdminClient;
  readonly config: WorkshopGuestServiceConfig;

  constructor(props: WorkshopGuestServiceProps) {
    this.identityStoreClient = props.identityStoreClient;
    this.ssoAdminClient = props.ssoAdminClient;
    this.config = props.config;
  }

  private getWorkshopGroupName(namespace: string): string {
    return `${namespace}_WorkshopGuestsGroup`;
  }

  /**
   * Find or create the workshop guests group.
   * Returns the groupId.
   */
  public async findOrCreateWorkshopGroup(namespace: string): Promise<string> {
    const groupName = this.getWorkshopGroupName(namespace);

    // Try to find the group first
    try {
      const getGroupIdResponse = await this.identityStoreClient.send(
        new GetGroupIdCommand({
          IdentityStoreId: this.config.identityStoreId,
          AlternateIdentifier: {
            UniqueAttribute: {
              AttributePath: "displayName",
              AttributeValue: groupName,
            },
          },
        }),
      );
      if (getGroupIdResponse.GroupId) {
        return getGroupIdResponse.GroupId;
      }
    } catch (error) {
      if (!(error instanceof ResourceNotFoundException)) {
        throw error;
      }
      // Group doesn't exist, create it
    }

    const createGroupResponse = await this.identityStoreClient.send(
      new CreateGroupCommand({
        IdentityStoreId: this.config.identityStoreId,
        DisplayName: groupName,
        Description: `Workshop guests group for Innovation Sandbox namespace: ${namespace}`,
      }),
    );

    return createGroupResponse.GroupId!;
  }

  /**
   * Create a local user in Identity Center.
   * If the user already exists (ConflictException), returns the existing userId.
   */
  private async createLocalUser(guest: {
    email: string;
    firstName: string;
    lastName: string;
    company?: string;
  }): Promise<string> {
    try {
      const response = await this.identityStoreClient.send(
        new CreateUserCommand({
          IdentityStoreId: this.config.identityStoreId,
          UserName: guest.email,
          DisplayName: `${guest.firstName} ${guest.lastName}`,
          Name: {
            GivenName: guest.firstName,
            FamilyName: guest.lastName,
          },
          Emails: [
            {
              Value: guest.email,
              Primary: true,
              Type: "work",
            },
          ],
          Title: guest.company,
        }),
      );
      return response.UserId!;
    } catch (error) {
      if (error instanceof ConflictException) {
        // User already exists - re-throw to be handled by the caller
        throw error;
      }
      throw error;
    }
  }

  /**
   * Onboard workshop guests: create users, add to group, assign to accounts.
   */
  public async onboardGuests(input: OnboardGuestsInput): Promise<WorkshopGuest[]> {
    const throttledCreateUser = throttle1PerSec(
      async (guest: {
        email: string;
        firstName: string;
        lastName: string;
        company?: string;
      }) => this.createLocalUser(guest),
    );

    const throttledCreateGroupMembership = throttle1PerSec(
      async (groupId: string, userId: string) => {
        try {
          await this.identityStoreClient.send(
            new CreateGroupMembershipCommand({
              IdentityStoreId: this.config.identityStoreId,
              GroupId: groupId,
              MemberId: { UserId: userId },
            }),
          );
        } catch (error) {
          if (error instanceof ConflictException) {
            // Already a member - idempotent
            return;
          }
          throw error;
        }
      },
    );

    const throttledCreateAccountAssignment = throttle1PerSec(
      async (groupId: string, accountId: string, permissionSetArn: string) => {
        await this.ssoAdminClient.send(
          new CreateAccountAssignmentCommand({
            InstanceArn: this.config.ssoInstanceArn,
            PermissionSetArn: permissionSetArn,
            PrincipalId: groupId,
            PrincipalType: "GROUP",
            TargetId: accountId,
            TargetType: TargetType.AWS_ACCOUNT,
          }),
        );
      },
    );

    // Step 1: Find or create the workshop group
    const groupId = await this.findOrCreateWorkshopGroup(input.namespace);

    // Step 2: Create users and add to group
    const results: WorkshopGuest[] = [];

    for (const guest of input.guests) {
      let userId: string | undefined;
      let status: WorkshopGuestStatus = "Active";
      let errorMessage: string | undefined;

      try {
        userId = await throttledCreateUser(guest);
      } catch (error) {
        if (error instanceof ConflictException) {
          // User already exists, skip creation but still try group membership
          status = "Active";
          errorMessage = "User already exists in Identity Center";
        } else {
          status = "Failed";
          errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          results.push({
            ...guest,
            userId,
            status,
            errorMessage,
            createdAt: new Date().toISOString(),
          });
          continue;
        }
      }

      // Add user to the workshop group if we have a userId
      if (userId) {
        try {
          await throttledCreateGroupMembership(groupId, userId);
        } catch (error) {
          status = "Failed";
          errorMessage = `Failed to add to group: ${error instanceof Error ? error.message : "Unknown error"}`;
        }
      }

      results.push({
        ...guest,
        userId,
        status,
        errorMessage,
        createdAt: new Date().toISOString(),
      });
    }

    // Step 3: Assign the group to the specified accounts
    for (const accountId of input.accountIds) {
      await throttledCreateAccountAssignment(
        groupId,
        accountId,
        input.permissionSetArn,
      );
    }

    return results;
  }

  /**
   * List workshop guests by listing group memberships.
   */
  public async listWorkshopGuests(namespace: string): Promise<WorkshopGuest[]> {
    const groupName = this.getWorkshopGroupName(namespace);
    let groupId: string;

    try {
      const getGroupIdResponse = await this.identityStoreClient.send(
        new GetGroupIdCommand({
          IdentityStoreId: this.config.identityStoreId,
          AlternateIdentifier: {
            UniqueAttribute: {
              AttributePath: "displayName",
              AttributeValue: groupName,
            },
          },
        }),
      );
      groupId = getGroupIdResponse.GroupId!;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        return [];
      }
      throw error;
    }

    const guests: WorkshopGuest[] = [];
    let nextToken: string | undefined;

    do {
      const response = await this.identityStoreClient.send(
        new ListGroupMembershipsCommand({
          IdentityStoreId: this.config.identityStoreId,
          GroupId: groupId,
          NextToken: nextToken,
        }),
      );

      if (response.GroupMemberships) {
        for (const membership of response.GroupMemberships) {
          const userId = membership.MemberId?.UserId;
          if (userId) {
            guests.push({
              email: "",
              firstName: "",
              lastName: "",
              userId,
              status: "Active",
            });
          }
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return guests;
  }

  /**
   * Cleanup workshop guests: remove account assignments, remove from group, delete users.
   */
  public async cleanupGuests(input: CleanupGuestsInput): Promise<void> {
    const groupName = this.getWorkshopGroupName(input.namespace);
    let groupId: string;

    try {
      const getGroupIdResponse = await this.identityStoreClient.send(
        new GetGroupIdCommand({
          IdentityStoreId: this.config.identityStoreId,
          AlternateIdentifier: {
            UniqueAttribute: {
              AttributePath: "displayName",
              AttributeValue: groupName,
            },
          },
        }),
      );
      groupId = getGroupIdResponse.GroupId!;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) {
        // Group doesn't exist, nothing to clean up
        return;
      }
      throw error;
    }

    const throttledDeleteAccountAssignment = throttle1PerSec(
      async (accountId: string) => {
        try {
          await this.ssoAdminClient.send(
            new DeleteAccountAssignmentCommand({
              InstanceArn: this.config.ssoInstanceArn,
              PermissionSetArn: input.permissionSetArn,
              PrincipalId: groupId,
              PrincipalType: "GROUP",
              TargetId: accountId,
              TargetType: TargetType.AWS_ACCOUNT,
            }),
          );
        } catch (error) {
          if (error instanceof ResourceNotFoundException) {
            return; // Already removed
          }
          throw error;
        }
      },
    );

    const throttledDeleteGroupMembership = throttle1PerSec(
      async (membershipId: string) => {
        try {
          await this.identityStoreClient.send(
            new DeleteGroupMembershipCommand({
              IdentityStoreId: this.config.identityStoreId,
              MembershipId: membershipId,
            }),
          );
        } catch (error) {
          if (error instanceof ResourceNotFoundException) {
            return;
          }
          throw error;
        }
      },
    );

    const throttledDeleteUser = throttle1PerSec(async (userId: string) => {
      try {
        await this.identityStoreClient.send(
          new DeleteUserCommand({
            IdentityStoreId: this.config.identityStoreId,
            UserId: userId,
          }),
        );
      } catch (error) {
        if (error instanceof ResourceNotFoundException) {
          return;
        }
        throw error;
      }
    });

    // Step 1: Remove account assignments for the group
    for (const accountId of input.accountIds) {
      await throttledDeleteAccountAssignment(accountId);
    }

    // Step 2: List group memberships and remove users
    let nextToken: string | undefined;
    const userIds: string[] = [];

    do {
      const response = await this.identityStoreClient.send(
        new ListGroupMembershipsCommand({
          IdentityStoreId: this.config.identityStoreId,
          GroupId: groupId,
          NextToken: nextToken,
        }),
      );

      if (response.GroupMemberships) {
        for (const membership of response.GroupMemberships) {
          if (membership.MembershipId) {
            await throttledDeleteGroupMembership(membership.MembershipId);
          }
          if (membership.MemberId?.UserId) {
            userIds.push(membership.MemberId.UserId);
          }
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    // Step 3: Delete users
    for (const userId of userIds) {
      await throttledDeleteUser(userId);
    }

    // Step 4: Optionally delete the group
    if (input.deleteGroup) {
      try {
        // Verify group exists before trying to delete
        await this.identityStoreClient.send(
          new DescribeGroupCommand({
            IdentityStoreId: this.config.identityStoreId,
            GroupId: groupId,
          }),
        );
        await this.identityStoreClient.send(
          new DeleteGroupCommand({
            IdentityStoreId: this.config.identityStoreId,
            GroupId: groupId,
          }),
        );
      } catch (error) {
        if (!(error instanceof ResourceNotFoundException)) {
          throw error;
        }
      }
    }
  }
}
