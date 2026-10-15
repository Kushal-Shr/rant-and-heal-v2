import * as path from "node:path";
import {
  CfnOutput,
  Duration,
  Stack,
  type StackProps,
  aws_certificatemanager as acm,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecs_patterns as ecsPatterns,
  aws_ecr_assets as ecrAssets,
  aws_logs as logs,
  aws_route53 as route53,
  aws_secretsmanager as secretsmanager,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface RantAndHealStackProps extends StackProps {
  domainName: string;
  hostedZoneId: string;
  hostedZoneName: string;
  runtimeSecretName: string;
}

const requiredPublicBuildVariables = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

const secretVariables = [
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "MOMO_SAFETY_IDENTIFIER_SECRET",
  "TURN_USERNAME",
  "TURN_CREDENTIAL",
  "RESEND_API_KEY",
] as const;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local.`);
  return value;
}

function environment(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

export class RantAndHealStack extends Stack {
  constructor(scope: Construct, id: string, props: RantAndHealStackProps) {
    super(scope, id, props);

    const projectRoot = path.resolve(__dirname, "../..");
    const buildArgs = Object.fromEntries(
      requiredPublicBuildVariables.map((name) => [name, requiredEnvironment(name)])
    );
    Object.assign(buildArgs, {
      NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: environment("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"),
      NEXT_PUBLIC_CRISIS_CONTACT_NAME: environment("NEXT_PUBLIC_CRISIS_CONTACT_NAME"),
      NEXT_PUBLIC_CRISIS_CONTACT_PHONE: environment("NEXT_PUBLIC_CRISIS_CONTACT_PHONE"),
      ENABLE_MOMO_VOICE: "true",
    });

    const image = ecs.ContainerImage.fromAsset(projectRoot, {
      buildArgs,
      platform: ecrAssets.Platform.LINUX_AMD64,
    });

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
      ],
    });
    const cluster = new ecs.Cluster(this, "Cluster", { vpc });
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    const runtimeSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "RuntimeSecret",
      props.runtimeSecretName
    );

    const taskEnvironment: Record<string, string> = {
      NEXT_PUBLIC_FIREBASE_API_KEY: requiredEnvironment("NEXT_PUBLIC_FIREBASE_API_KEY"),
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: requiredEnvironment("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: requiredEnvironment("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: requiredEnvironment("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
      NEXT_PUBLIC_FIREBASE_APP_ID: requiredEnvironment("NEXT_PUBLIC_FIREBASE_APP_ID"),
      NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: environment("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"),
      NEXT_PUBLIC_CRISIS_CONTACT_NAME: environment("NEXT_PUBLIC_CRISIS_CONTACT_NAME"),
      NEXT_PUBLIC_CRISIS_CONTACT_PHONE: environment("NEXT_PUBLIC_CRISIS_CONTACT_PHONE"),
      FIREBASE_ADMIN_PROJECT_ID: environment(
        "FIREBASE_ADMIN_PROJECT_ID",
        requiredEnvironment("NEXT_PUBLIC_FIREBASE_PROJECT_ID")
      ),
      MOMO_TEXT_PROVIDER: environment("MOMO_TEXT_PROVIDER", "openai"),
      MOMO_VOICE_NAME: environment("MOMO_VOICE_NAME", "willow"),
      GEMINI_MODEL: environment("GEMINI_MODEL", "gemini-3.8-flash"),
      GEMINI_SAFETY_MODEL: environment("GEMINI_SAFETY_MODEL", "gemini-3.8-flash"),
      MOMO_SAFETY_CLASSIFIER_TIMEOUT_MS: environment("MOMO_SAFETY_CLASSIFIER_TIMEOUT_MS", "10000"),
      ENABLE_WEEKLY_REPORTS: environment("ENABLE_WEEKLY_REPORTS", "true"),
      ENABLE_AI_THERAPY_NOTES: environment("ENABLE_AI_THERAPY_NOTES", "true"),
      ENABLE_SAFETY_DASHBOARD: environment("ENABLE_SAFETY_DASHBOARD", "true"),
      ENABLE_MOMO_VOICE: "true",
      MOMO_DEBUG_ROUTING: "false",
      THERAPY_KMS_KEY_NAME: environment("THERAPY_KMS_KEY_NAME"),
      MOMO_CONVERSATION_KMS_KEY_NAME: environment("MOMO_CONVERSATION_KMS_KEY_NAME"),
      MOMO_SAFETY_KMS_KEY_NAME: environment("MOMO_SAFETY_KMS_KEY_NAME"),
      TURN_URLS: environment("TURN_URLS"),
      SAFETY_SUPPORT_NOTIFICATIONS_ENABLED: environment("SAFETY_SUPPORT_NOTIFICATIONS_ENABLED", "false"),
      SAFETY_ALERT_FROM_EMAIL: environment("SAFETY_ALERT_FROM_EMAIL"),
      SAFETY_SUPPORT_ALERT_EMAIL: environment("SAFETY_SUPPORT_ALERT_EMAIL"),
    };
    const taskSecrets = Object.fromEntries(
      secretVariables.map((name) => [name, ecs.Secret.fromSecretsManager(runtimeSecret, name)])
    );

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Service", {
      cluster,
      cpu: 1024,
      memoryLimitMiB: 2048,
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publicLoadBalancer: true,
      domainName: props.domainName,
      domainZone: hostedZone,
      certificate,
      redirectHTTP: true,
      idleTimeout: Duration.seconds(3600),
      healthCheckGracePeriod: Duration.seconds(90),
      circuitBreaker: { rollback: true },
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskImageOptions: {
        image,
        containerPort: 3000,
        environment: taskEnvironment,
        secrets: taskSecrets,
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: "rant-and-heal",
          logRetention: logs.RetentionDays.ONE_MONTH,
        }),
      },
    });

    service.targetGroup.configureHealthCheck({
      path: "/",
      healthyHttpCodes: "200-399",
      interval: Duration.seconds(30),
      timeout: Duration.seconds(10),
    });

    new CfnOutput(this, "ApplicationUrl", { value: `https://${props.domainName}` });
    new CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new CfnOutput(this, "ServiceName", { value: service.service.serviceName });
  }
}
