// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  Alert,
  Box,
  Button,
  FormField,
  Input,
  SpaceBetween,
} from "@cloudscape-design/components";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  showErrorToast,
  showSuccessToast,
} from "@amzn/innovation-sandbox-frontend/components/Toast";
import { useInviteCollaborator } from "@amzn/innovation-sandbox-frontend/domains/leases/hooks";
import { useModal } from "@amzn/innovation-sandbox-frontend/hooks/useModal";

const inviteCollaboratorSchema = z.object({
  collaboratorEmail: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

type InviteCollaboratorFormValues = z.infer<typeof inviteCollaboratorSchema>;

interface InviteCollaboratorModalProps {
  leaseId: string;
}

export const InviteCollaboratorModal = ({
  leaseId,
}: InviteCollaboratorModalProps) => {
  const { hideModal } = useModal();
  const { mutateAsync: inviteCollaborator, isPending } =
    useInviteCollaborator();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<InviteCollaboratorFormValues>({
    resolver: zodResolver(inviteCollaboratorSchema),
    mode: "all",
    defaultValues: {
      collaboratorEmail: "",
    },
  });

  const collaboratorEmail = watch("collaboratorEmail");

  const onSubmit = async (data: InviteCollaboratorFormValues) => {
    setApiError(null);
    try {
      await inviteCollaborator({
        leaseId,
        collaboratorEmail: data.collaboratorEmail,
      });
      showSuccessToast("Collaborator invited successfully.");
      hideModal();
    } catch (error) {
      if (error instanceof Error) {
        setApiError(error.message);
      } else {
        showErrorToast(
          "Something went wrong. Please try again.",
          "Invite Failed",
        );
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SpaceBetween size="l">
        {apiError && <Alert type="error">{apiError}</Alert>}

        <FormField
          label="Collaborator email"
          description="Enter the email address of the user in Identity Center to invite."
          errorText={errors.collaboratorEmail?.message}
        >
          <Input
            value={collaboratorEmail}
            onChange={({ detail }) =>
              setValue("collaboratorEmail", detail.value, {
                shouldValidate: true,
              })
            }
            placeholder="user@example.com"
            type="email"
          />
        </FormField>

        <Box textAlign="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button formAction="none" onClick={hideModal} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              formAction="submit"
              loading={isPending}
              disabled={!isValid || isPending}
            >
              Invite
            </Button>
          </SpaceBetween>
        </Box>
      </SpaceBetween>
    </form>
  );
};
