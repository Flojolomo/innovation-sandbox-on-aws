// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  Badge,
  Box,
  Button,
  Container,
  Header,
  SpaceBetween,
  StatusIndicator,
  Table,
  TableProps,
} from "@cloudscape-design/components";
import { DateTime } from "luxon";

import {
  showErrorToast,
  showSuccessToast,
} from "@amzn/innovation-sandbox-frontend/components/Toast";
import { InviteCollaboratorModal } from "@amzn/innovation-sandbox-frontend/domains/leases/components/InviteCollaboratorModal";
import {
  useGetCollaborators,
  useRevokeCollaborator,
} from "@amzn/innovation-sandbox-frontend/domains/leases/hooks";
import { LeaseCollaborator } from "@amzn/innovation-sandbox-frontend/domains/leases/types";
import { useModal } from "@amzn/innovation-sandbox-frontend/hooks/useModal";

interface CollaboratorsListProps {
  leaseId: string;
  leaseStatus: string;
}

export const CollaboratorsList = ({
  leaseId,
  leaseStatus,
}: CollaboratorsListProps) => {
  const { showModal, hideModal } = useModal();
  const { data: collaborators, isLoading } = useGetCollaborators(leaseId);
  const { mutateAsync: revokeCollaborator } = useRevokeCollaborator();

  const isLeaseActive = leaseStatus === "Active";
  const canRevoke = leaseStatus === "Active" || leaseStatus === "Frozen";

  const handleInvite = () => {
    showModal({
      header: "Invite Collaborator",
      content: <InviteCollaboratorModal leaseId={leaseId} />,
    });
  };

  const handleRevoke = (collaboratorEmail: string) => {
    showModal({
      header: "Revoke Collaborator Access",
      content: (
        <SpaceBetween size="l">
          <Box>
            Are you sure you want to revoke access for{" "}
            <strong>{collaboratorEmail}</strong>?
          </Box>
          <Box textAlign="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={hideModal}>Cancel</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    await revokeCollaborator({ leaseId, collaboratorEmail });
                    showSuccessToast("Collaborator access revoked.");
                    hideModal();
                  } catch (error) {
                    hideModal();
                    if (error instanceof Error) {
                      showErrorToast(error.message, "Revoke Failed");
                    } else {
                      showErrorToast(
                        "Something went wrong. Please try again.",
                        "Revoke Failed",
                      );
                    }
                  }
                }}
              >
                Revoke
              </Button>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      ),
    });
  };

  const columnDefinitions: TableProps.ColumnDefinition<LeaseCollaborator>[] = [
    {
      id: "email",
      header: "Email",
      cell: (item) => item.collaboratorEmail,
    },
    {
      id: "status",
      header: "Status",
      // prettier-ignore
      cell: (item) => ( // NOSONAR typescript:S6478 - Table API requires cell render functions
        <Badge color={item.status === "Active" ? "green" : "grey"}>
          {item.status}
        </Badge>
      ),
    },
    {
      id: "invitedBy",
      header: "Invited by",
      cell: (item) => item.invitedBy,
    },
    {
      id: "dateAdded",
      header: "Date added",
      cell: (item) => {
        if (!item.meta?.createdTime) return "-";
        const dt = DateTime.fromISO(item.meta.createdTime);
        return dt.isValid ? dt.toLocaleString(DateTime.DATETIME_SHORT) : "-";
      },
    },
    {
      id: "actions",
      header: "Actions",
      // prettier-ignore
      cell: (item) => ( // NOSONAR typescript:S6478 - Table API requires cell render functions
        item.status === "Active" && canRevoke ? (
          <Button variant="inline-link" onClick={() => handleRevoke(item.collaboratorEmail)}>
            Revoke
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <Container
      header={
        <Header
          counter={collaborators ? `(${collaborators.length})` : undefined}
          actions={
            isLeaseActive ? (
              <Button onClick={handleInvite}>Invite</Button>
            ) : undefined
          }
        >
          Collaborators
        </Header>
      }
    >
      <Table
        variant="embedded"
        columnDefinitions={columnDefinitions}
        items={collaborators ?? []}
        loading={isLoading}
        loadingText="Loading collaborators"
        empty={
          <Box textAlign="center" color="inherit" variant="p">
            <SpaceBetween size="xs">
              <StatusIndicator type="info">No collaborators</StatusIndicator>
              <Box color="inherit">
                Invite team members to share access to this sandbox account.
              </Box>
            </SpaceBetween>
          </Box>
        }
      />
    </Container>
  );
};
