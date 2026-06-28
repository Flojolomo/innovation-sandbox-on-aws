// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { Role } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import path from "path";

import { WorkshopGuestLambdaEnvironmentSchema } from "@amzn/innovation-sandbox-commons/lambda/environments/workshop-guest-lambda-environment.js";
import { addAppConfigExtensionLayer } from "@amzn/innovation-sandbox-infrastructure/components/config/app-config-lambda-extension";
import { IsbLambdaFunction } from "@amzn/innovation-sandbox-infrastructure/components/isb-lambda-function";
import { IsbKmsKeys } from "@amzn/innovation-sandbox-infrastructure/components/kms";
import {
  getIdcRoleArn,
  IntermediateRole,
} from "@amzn/innovation-sandbox-infrastructure/helpers/isb-roles";
import {
  grantIsbAppConfigRead,
  grantIsbSsmParameterRead,
} from "@amzn/innovation-sandbox-infrastructure/helpers/policy-generators";
import { IsbComputeStack } from "@amzn/innovation-sandbox-infrastructure/isb-compute-stack";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";

export interface WorkshopGuestsLambdaProps {
  namespace: string;
  idcAccountId: string;
  jwtSecret: Secret;
  logGroup: LogGroup;
  identityStoreId: string;
  ssoInstanceArn: string;
}

export class WorkshopGuestsLambda {
  public readonly lambdaFunction: IsbLambdaFunction<
    typeof WorkshopGuestLambdaEnvironmentSchema
  >;

  constructor(scope: Construct, props: WorkshopGuestsLambdaProps) {
    this.lambdaFunction = new IsbLambdaFunction(
      scope,
      "WorkshopGuestsLambdaFunction",
      {
        description:
          "Lambda used as API GW method integration for workshop guests management",
        entry: path.join(
          __dirname,
          "..",
          "..",
          "..",
          "..",
          "lambdas",
          "api",
          "workshop-guests",
          "src",
          "workshop-guests-handler.ts",
        ),
        handler: "handler",
        namespace: props.namespace,
        environment: {
          JWT_SECRET_NAME: props.jwtSecret.secretName,
          IDENTITY_STORE_ID: props.identityStoreId,
          SSO_INSTANCE_ARN: props.ssoInstanceArn,
          NAMESPACE: props.namespace,
          IDC_CONFIG_PARAM_ARN:
            IsbComputeStack.sharedSpokeConfig.parameterArns.idcConfigParamArn,
          INTERMEDIATE_ROLE_ARN: IntermediateRole.getRoleArn(),
          IDC_ROLE_ARN: getIdcRoleArn(
            scope,
            props.namespace,
            props.idcAccountId,
          ),
          APP_CONFIG_APPLICATION_ID:
            IsbComputeStack.sharedSpokeConfig.data.configApplicationId,
          APP_CONFIG_PROFILE_ID:
            IsbComputeStack.sharedSpokeConfig.data
              .globalConfigConfigurationProfileId,
          APP_CONFIG_ENVIRONMENT_ID:
            IsbComputeStack.sharedSpokeConfig.data.configEnvironmentId,
          AWS_APPCONFIG_EXTENSION_PREFETCH_LIST: `/applications/${IsbComputeStack.sharedSpokeConfig.data.configApplicationId}/environments/${IsbComputeStack.sharedSpokeConfig.data.configEnvironmentId}/configurations/${IsbComputeStack.sharedSpokeConfig.data.globalConfigConfigurationProfileId}`,
        },
        logGroup: props.logGroup,
        envSchema: WorkshopGuestLambdaEnvironmentSchema,
      },
    );

    // Grant SSM parameter read for IDC config
    grantIsbSsmParameterRead(
      this.lambdaFunction.lambdaFunction.role! as Role,
      IsbComputeStack.sharedSpokeConfig.parameterArns.idcConfigParamArn,
    );

    // Grant JWT secret read
    props.jwtSecret.grantRead(this.lambdaFunction.lambdaFunction);
    IsbKmsKeys.get(scope, props.namespace).grantEncryptDecrypt(
      this.lambdaFunction.lambdaFunction,
    );

    // Grant AppConfig read for global config
    grantIsbAppConfigRead(
      scope,
      this.lambdaFunction,
      IsbComputeStack.sharedSpokeConfig.data.globalConfigConfigurationProfileId,
    );
    addAppConfigExtensionLayer(this.lambdaFunction);

    // Trust intermediate role for cross-account access
    IntermediateRole.addTrustedRole(
      this.lambdaFunction.lambdaFunction.role! as Role,
    );
  }
}
