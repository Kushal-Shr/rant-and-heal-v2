#!/usr/bin/env node
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { config } from "dotenv";
import { RantAndHealStack } from "../lib/rant-and-heal-stack";

config({ path: path.resolve(__dirname, "../../.env.local"), quiet: true });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local.`);
  return value;
}

const app = new cdk.App();
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

new RantAndHealStack(app, "RantAndHealStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region,
  },
  domainName: required("AWS_DOMAIN_NAME"),
  hostedZoneId: required("ROUTE53_HOSTED_ZONE_ID"),
  hostedZoneName: required("ROUTE53_HOSTED_ZONE_NAME"),
  runtimeSecretName: process.env.AWS_RUNTIME_SECRET_NAME ?? "rant-and-heal/runtime",
});
