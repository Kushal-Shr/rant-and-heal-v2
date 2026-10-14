# AWS deployment

This stack deploys the application to one ECS Fargate task behind an HTTPS
Application Load Balancer. One task is intentional: Momo voice safety-sideband
state is currently process-local. The public task subnet avoids NAT Gateway
cost while its security group permits application traffic only from the load
balancer.

## Prerequisites

- An AWS account and CLI credentials with permission to deploy CDK stacks.
- A public Route 53 hosted zone in the target account.
- Docker running locally.
- The deployment values at the end of `.env.local`:

```dotenv
AWS_REGION=us-east-1
AWS_DOMAIN_NAME=app.example.com
ROUTE53_HOSTED_ZONE_ID=Z1234567890
ROUTE53_HOSTED_ZONE_NAME=example.com
AWS_RUNTIME_SECRET_NAME=rant-and-heal/runtime
```

Also add `app.example.com` to Firebase Authentication's authorized domains.
Browser microphone access requires the HTTPS domain; the ALB's raw HTTP address
is not suitable for voice.

## First deployment

Authenticate the AWS CLI, then run:

```bash
aws configure
cd infra
npm run sync-secrets
npx cdk bootstrap
npm run build
npm run synth
npm run deploy
```

CDK builds the repository Dockerfile for Linux AMD64, uploads it to an
CDK-managed ECR repository, and deploys the service. The deploy command displays
the final HTTPS URL.

## Updating

For application or infrastructure changes:

```bash
cd infra
npm run deploy
```

After changing a secret, update Secrets Manager and restart the ECS tasks:

```bash
cd infra
npm run sync-secrets
aws ecs update-service \
  --cluster <ClusterName output> \
  --service <ServiceName output> \
  --force-new-deployment
```

Secrets are injected when a task starts; updating Secrets Manager alone does
not update an already-running task.

## Cost and teardown

This creates billable resources including an Application Load Balancer,
Fargate task, ECR storage, CloudWatch logs, Route 53 record, and Secrets Manager
secret. Review AWS pricing for the selected region. Remove the stack with:

```bash
cd infra
npm run destroy
```

The separately managed Secrets Manager secret is intentionally retained unless
you delete it explicitly.
