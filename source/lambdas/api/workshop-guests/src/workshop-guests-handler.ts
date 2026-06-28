// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";
import middy from "@middy/core";
import httpRouterHandler, { Route } from "@middy/http-router";
import { APIGatewayProxyResult } from "aws-lambda";

import {
  CleanupWorkshopGuestsRequestSchema,
  OnboardWorkshopGuestsRequestSchema,
} from "@amzn/innovation-sandbox-commons/data/workshop-guest/workshop-guest.js";
import { IsbServices } from "@amzn/innovation-sandbox-commons/isb-services/index.js";
import { WorkshopGuestService } from "@amzn/innovation-sandbox-commons/isb-services/workshop-guest-service.js";
import {
  WorkshopGuestLambdaEnvironment,
  WorkshopGuestLambdaEnvironmentSchema,
} from "@amzn/innovation-sandbox-commons/lambda/environments/workshop-guest-lambda-environment.js";
import apiMiddlewareBundle, {
  IsbApiContext,
  IsbApiEvent,
} from "@amzn/innovation-sandbox-commons/lambda/middleware/api-middleware-bundle.js";
import {
  createHttpJSendError,
  createHttpJSendValidationError,
} from "@amzn/innovation-sandbox-commons/lambda/middleware/http-error-handler.js";
import { httpJsonBodyParser } from "@amzn/innovation-sandbox-commons/lambda/middleware/http-json-body-parser.js";
import {
  ContextWithConfig,
  isbConfigMiddleware,
} from "@amzn/innovation-sandbox-commons/lambda/middleware/isb-config-middleware.js";
import { IsbClients } from "@amzn/innovation-sandbox-commons/sdk-clients/index.js";
import { fromTemporaryIsbIdcCredentials } from "@amzn/innovation-sandbox-commons/utils/cross-account-roles.js";

const tracer = new Tracer();
const logger = new Logger();

const middyFactory = middy<
  IsbApiEvent,
  any,
  Error,
  ContextWithConfig & IsbApiContext<WorkshopGuestLambdaEnvironment>
>;

const routes: Route<IsbApiEvent, APIGatewayProxyResult>[] = [
  {
    path: "/workshop-guests",
    method: "GET",
    handler: middyFactory().handler(listWorkshopGuestsHandler),
  },
  {
    path: "/workshop-guests/onboard",
    method: "POST",
    handler: middyFactory()
      .use(httpJsonBodyParser())
      .handler(onboardWorkshopGuestsHandler),
  },
  {
    path: "/workshop-guests/cleanup",
    method: "POST",
    handler: middyFactory()
      .use(httpJsonBodyParser())
      .handler(cleanupWorkshopGuestsHandler),
  },
];

export const handler = apiMiddlewareBundle({
  logger,
  tracer,
  environmentSchema: WorkshopGuestLambdaEnvironmentSchema,
})
  .use(isbConfigMiddleware())
  .handler(httpRouterHandler(routes));

function isAdmin(
  context: ContextWithConfig & IsbApiContext<WorkshopGuestLambdaEnvironment>,
): boolean {
  return context.user.roles?.includes("Admin") ?? false;
}

function requireAdmin(
  context: ContextWithConfig & IsbApiContext<WorkshopGuestLambdaEnvironment>,
): void {
  if (!isAdmin(context)) {
    throw createHttpJSendError({
      statusCode: 403,
      data: {
        errors: [
          {
            message:
              "Access denied. Only administrators can manage workshop guests.",
          },
        ],
      },
    });
  }
}

function createWorkshopGuestService(
  env: WorkshopGuestLambdaEnvironment,
): WorkshopGuestService {
  const credentials = fromTemporaryIsbIdcCredentials(env);
  return new WorkshopGuestService({
    identityStoreClient: IsbClients.identityStore(env, credentials),
    ssoAdminClient: IsbClients.ssoAdmin(env, credentials),
    config: {
      identityStoreId: env.IDENTITY_STORE_ID,
      ssoInstanceArn: env.SSO_INSTANCE_ARN,
    },
  });
}

async function getPermissionSetArn(
  env: WorkshopGuestLambdaEnvironment,
): Promise<string> {
  const idcConfigStore = IsbServices.idcStackConfigStore(env);
  const idcConfig = await idcConfigStore.get();
  return idcConfig.userPermissionSetArn;
}

async function listWorkshopGuestsHandler(
  _event: IsbApiEvent,
  context: ContextWithConfig & IsbApiContext<WorkshopGuestLambdaEnvironment>,
): Promise<APIGatewayProxyResult> {
  requireAdmin(context);

  const workshopGuestService = createWorkshopGuestService(context.env);
  const guests = await workshopGuestService.listWorkshopGuests(
    context.env.NAMESPACE,
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "success",
      data: { guests },
    }),
    headers: {
      "Content-Type": "application/json",
    },
  };
}

async function onboardWorkshopGuestsHandler(
  event: IsbApiEvent,
  context: ContextWithConfig & IsbApiContext<WorkshopGuestLambdaEnvironment>,
): Promise<APIGatewayProxyResult> {
  requireAdmin(context);

  const parsedBody = OnboardWorkshopGuestsRequestSchema.safeParse(event.body);
  if (!parsedBody.success) {
    throw createHttpJSendValidationError(parsedBody.error);
  }

  const workshopGuestService = createWorkshopGuestService(context.env);
  const permissionSetArn = await getPermissionSetArn(context.env);

  const results = await workshopGuestService.onboardGuests({
    guests: parsedBody.data.guests,
    accountIds: parsedBody.data.accountIds,
    namespace: parsedBody.data.namespace,
    permissionSetArn,
  });

  return {
    statusCode: 201,
    body: JSON.stringify({
      status: "success",
      data: { guests: results },
    }),
    headers: {
      "Content-Type": "application/json",
    },
  };
}

async function cleanupWorkshopGuestsHandler(
  event: IsbApiEvent,
  context: ContextWithConfig & IsbApiContext<WorkshopGuestLambdaEnvironment>,
): Promise<APIGatewayProxyResult> {
  requireAdmin(context);

  const parsedBody = CleanupWorkshopGuestsRequestSchema.safeParse(event.body);
  if (!parsedBody.success) {
    throw createHttpJSendValidationError(parsedBody.error);
  }

  const workshopGuestService = createWorkshopGuestService(context.env);
  const permissionSetArn = await getPermissionSetArn(context.env);

  // We need the account IDs to clean up assignments
  // For cleanup, we pass an empty array as the service will handle group-level cleanup
  await workshopGuestService.cleanupGuests({
    namespace: parsedBody.data.namespace,
    deleteGroup: parsedBody.data.deleteGroup,
    permissionSetArn,
    accountIds: [],
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "success",
      data: null,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  };
}
