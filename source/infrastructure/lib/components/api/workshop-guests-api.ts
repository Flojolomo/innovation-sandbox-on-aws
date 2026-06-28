// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { LambdaIntegration } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";

import {
  RestApi,
  RestApiResourceProps,
} from "@amzn/innovation-sandbox-infrastructure/components/api/rest-api-all";
import { WorkshopGuestsLambda } from "@amzn/innovation-sandbox-infrastructure/components/workshop-guests/workshop-guests-lambda";

export interface WorkshopGuestsApiProps extends RestApiResourceProps {
  identityStoreId: string;
  ssoInstanceArn: string;
}

export class WorkshopGuestsApi {
  constructor(
    restApi: RestApi,
    scope: Construct,
    props: WorkshopGuestsApiProps,
  ) {
    const workshopGuestsLambda = new WorkshopGuestsLambda(scope, {
      namespace: props.namespace,
      idcAccountId: props.idcAccountId,
      jwtSecret: props.jwtSecret,
      logGroup: restApi.logGroup,
      identityStoreId: props.identityStoreId,
      ssoInstanceArn: props.ssoInstanceArn,
    });

    const workshopGuestsResource = restApi.root.addResource("workshop-guests", {
      defaultIntegration: new LambdaIntegration(
        workshopGuestsLambda.lambdaFunction.lambdaFunction,
        {
          allowTestInvoke: true,
          proxy: true,
        },
      ),
    });
    workshopGuestsResource.addMethod("GET");

    const onboardResource = workshopGuestsResource.addResource("onboard");
    onboardResource.addMethod("POST");

    const cleanupResource = workshopGuestsResource.addResource("cleanup");
    cleanupResource.addMethod("POST");
  }
}
