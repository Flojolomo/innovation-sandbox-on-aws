// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Effect, PolicyDocument, PolicyStatement } from "aws-cdk-lib/aws-iam";
import fs from "fs";
import path from "path";

interface ScpStatement {
  Sid: string;
  Effect: "Allow" | "Deny";
  Action?: string[];
  NotAction?: string[];
  Resource: string[];
  Condition?: Record<string, Record<string, any>>;
}

interface ScpPolicy {
  Version: "2012-10-17";
  Statement: ScpStatement[];
}

function createScpStatement(props: {
  sid: string;
  effect: Effect;
  actions?: string[];
  notActions?: string[];
  resources: string[];
  conditions?: Record<string, Record<string, any>>;
}): PolicyStatement {
  const statement = new PolicyStatement({
    effect: props.effect,
    actions: props.actions,
    resources: props.resources,
    conditions: props.conditions,
  });

  // Set either actions or notActions, but not both
  if (props.actions) {
    statement.addActions(...props.actions);
  } else if (props.notActions) {
    statement.addNotActions(...props.notActions);
  }

  statement.sid = props.sid;
  return statement;
}

function convertToStatements(rawStatements: ScpStatement[]): PolicyStatement[] {
  const statements: PolicyStatement[] = [];

  for (const stmt of rawStatements) {
    const statement = createScpStatement({
      sid: stmt.Sid,
      effect: stmt.Effect === "Deny" ? Effect.DENY : Effect.ALLOW,
      actions: stmt.Action,
      notActions: stmt.NotAction,
      resources: stmt.Resource,
      conditions: stmt.Condition,
    });
    statements.push(statement);
  }

  return statements;
}

function convertToPolicyDocument(policy: ScpPolicy): PolicyDocument {
  const statements = convertToStatements(policy.Statement);
  return new PolicyDocument({
    statements: statements,
  });
}

export interface IsbScpPolicyProps {
  namespace?: string;
  isbManagedRegions?: string[];
}

export function getInnovationSandboxProtectScp(
  props: IsbScpPolicyProps,
): PolicyDocument {
  const protectPolicy = loadPolicyFromFile(
    "isb-protect-control-plane-resource-scp.json",
    props.namespace,
    props.isbManagedRegions,
  );
  return convertToPolicyDocument(protectPolicy);
}

export function getInnovationSandboxRestrictionsScp(
  props: IsbScpPolicyProps,
): PolicyDocument {
  const restrictionsPolicy = loadPolicyFromFile(
    "isb-restrictions-scp.json",
    props.namespace,
    props.isbManagedRegions,
  );
  return convertToPolicyDocument(restrictionsPolicy);
}

export function getInnovationSandboxAwsNukeSupportedServicesScp(
  props: IsbScpPolicyProps,
): PolicyDocument {
  const nukePolicy = loadPolicyFromFile(
    "isb-aws-nuke-supported-services-scp.json",
    props.namespace,
    props.isbManagedRegions,
  );
  return convertToPolicyDocument(nukePolicy);
}

export function getInnovationSandboxLimitRegionsScp(
  props: IsbScpPolicyProps,
): PolicyDocument {
  const limitRegionsPolicy = loadPolicyFromFile(
    "isb-limit-managed-regions.json",
    props.namespace,
    props.isbManagedRegions,
  );
  return convertToPolicyDocument(limitRegionsPolicy);
}

export function getInnovationSandboxWriteProtectionScp(
  props: IsbScpPolicyProps,
): PolicyDocument {
  const writeProtectionPolicy = loadPolicyFromFile(
    "isb-deny-all-non-control-plane-actions.json",
    props.namespace,
    props.isbManagedRegions,
  );
  return convertToPolicyDocument(writeProtectionPolicy);
}

export function getInnovationSandboxWorkshopGuestRestrictionsScp(
  props: IsbScpPolicyProps,
): PolicyDocument {
  const workshopGuestPolicy = loadPolicyFromFile(
    "isb-workshop-guest-restrictions-scp.json",
    props.namespace,
    props.isbManagedRegions,
  );
  return convertToPolicyDocument(workshopGuestPolicy);
}

function loadPolicyFromFile(
  fileName: string,
  namespace?: string,
  regionList?: string[],
): ScpPolicy {
  try {
    // Define the path to the policy file
    const policyPath = path.join(__dirname, fileName);

    // Read the JSON file
    let processedContent = fs.readFileSync(policyPath, "utf8");

    // Replace namespace if provided
    if (namespace) {
      processedContent = processedContent.replace(/\${namespace}/g, namespace);
    }

    // Replace region list if provided
    if (regionList) {
      processedContent = processedContent.replace(
        /\${isbManagedRegions}/g,
        regionList.toString(),
      );
    }

    // Parse and return the content
    return JSON.parse(processedContent) as ScpPolicy;
  } catch (error) {
    throw new Error(
      `Failed to load SCP policy from ${fileName}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
