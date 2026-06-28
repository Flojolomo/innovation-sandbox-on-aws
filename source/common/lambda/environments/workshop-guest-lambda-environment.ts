// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

import { BaseApiLambdaEnvironmentSchema } from "@amzn/innovation-sandbox-commons/lambda/environments/base-api-lambda-environment.js";

export const WorkshopGuestLambdaEnvironmentSchema =
  BaseApiLambdaEnvironmentSchema.extend({
    IDENTITY_STORE_ID: z.string(),
    SSO_INSTANCE_ARN: z.string(),
    NAMESPACE: z.string(),
    IDC_CONFIG_PARAM_ARN: z.string(),
    INTERMEDIATE_ROLE_ARN: z.string(),
    IDC_ROLE_ARN: z.string(),
  });

export type WorkshopGuestLambdaEnvironment = z.infer<
  typeof WorkshopGuestLambdaEnvironmentSchema
>;
