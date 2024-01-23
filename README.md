# @formsort/data-stack-pulumi

An [AWS](https://aws.amazon.com) environment pre-configured to receive data from [Formsort](https://formsort.com), managed using [Pulumi](https://pulumi.com).

# Features

- Receives answer [webhooks](https://docs.formsort.com/handling-data/integration-reference/webhooks) from Formsort and stores them in both [S3](https://aws.amazon.com/s3/) and [DynamoDB](https://aws.amazon.com/dynamodb/).
- Receives [deployment events](https://docs.formsort.com/teams/event-subscriptions) when a new revision of a flow is deployed in Formsort.
- Allows retrieving answer data by [responder UUID](https://docs.formsort.com/handling-data/responder-uuids), in either JSON or HTML format.

# Caveats

- **This stack has no authentication for data retrieval**. The URLs that it creates are random but publicly accessible. You will need to add authentication if you want to use data retrieval in production.
- While [AWS can be configured to be HIPAA compliant](https://aws.amazon.com/compliance/hipaa-compliance/), **running this stack does not give you any compliance certification out-of-the-box**.
- The Formsort team is happy to help answer general questions about architecture, and make improvements, but if you need us to run this stack for you, [please contact sales](https://signup.formsort.com/).

# Architecture overview

The stack creates two S3 buckets -- one for the definitions of the forms you deploy (flow contents), and another as a repository for the raw answers that your responders provide. A DynamoDB table is also created as a secondary way of storing answers.

An API gateway is created with three routes:

1. The `/variant-revision-deployed` route receives a POST request containing flow content when a flow is deployed. This request triggers a lambda invocation that saves the flow content to S3. The flow content of a deployed variant revision is immutable and can be used to reconstruct answers submissions.
2. The `/answers-ingest` endpoint receives a POST request whenever a responder provides data within a deployed flow. It invokes a lambda that saves the content of the answers to both S3 and Dynamo DB
3. The `/answers-retrieval` endpoint allows for retrieving answers by responder UUID, which is passed as a URL parameter (`?responderUuid=`) HTML can be specified by adding `&format=html` as a URL search parameter.

```
          Formsort studio                AWS
         ┌──────────────────────┐       ┌─────────────────────────────────────────────────────────────────┐
         │                      │       │                                                                 │
         │  ┌────────────────┐  │       │                                                                 │
  You────┼─►│Deploy a flow   ├──┼───────┼─►/api/variant-revision-deployed                                 │
         │  │                │  │       │                 │                                               │
         │  └────────────────┘  │       │                 │                                               │
         │                      │       │                 ▼                                               │
         └──────────────────────┘       │           ┌───────────────┐                  ┌───────────────┐  │
                                        │           │Lambda         ├─────────────────►│S3             │  │
                                        │           └───────────────┘                  │Flow content   │  │
          Formsort flow runner          │                                              └──────────────┬┘  │
         ┌─────────────────────────┐    │                                                             │   │
         │                         │    │                                                             │   │
Your     │  ┌───────────────────┐  │    │                                                             │   │
users────┼─►│Fill out flows     ├──┼────┼─►/api/answers-ingest                    ┌────────────┐      │   │
         │  └───────────────────┘  │    │                 │         ┌────────────►│S3          │      │   │
         │                         │    │                 ▼         │             │Answers     │      │   │
         └─────────────────────────┘    │          ┌───────────────┬┘             └────────────┘      │   │
                                        │          │Lambda         │                                  │   │
                                        │          └───────────────┴┐                   ┌───────────┐ │   │
                                        |                           └──────────────────►│DynamoDB   │ │   │
                                        │                                               │Answers    │ │   │
  You───────────────────────────────────┼─►/api/answers-retrieval?responderUuid=...     └────────┬──┘ │   │
                                        │                                                        │    │   │
                                        │                                                        │    │   │
                                        │          ┌───────────────┐◄────────────────────────────┘    │   │
  Answers      ◄────────────────────────┼──────────┤Lambda         │                                  │   │
                                        │          └───────────────┘◄─────────────────────────────────┘   │
                                        │                                                                 │
                                        └─────────────────────────────────────────────────────────────────┘
```

# Getting started

## Launching the stack

0. [Create a Pulumi account](https://app.pulumi.com) and access token, and [install the Pulumi CLI](https://www.pulumi.com/docs/install/).
1. Create an AWS account. Within it, [create an IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html) with permissions to create resources. If you're just getting started, give the user the `AdministratorAccess` policy so that you are not blocked on permissions issues.
2. Generate [an access key](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) for that user.
3. Update your `/.aws/credentials` to include the access key and secret in a profile, or set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in your environment.
4. Set your desired AWS region `pulumi config set aws:region us-west-2`
5. If you want to pull out HTML pages or PDFs, [get your Formsort API key](https://docs.formsort.com/handling-data/getting-data-out/admin-api) and set it using `pulumi config set --secret formsortAPIKey {YOUR_API_KEY}`.
6. If you want to verify webhook payloads are coming from formsort, get your webhook signing key and set it in the pulumi project using `pulumi config set --secret formsortWebhookSigningKey {YOUR_SIGNING_KEY}`. Note that this is not the same key as the general API key.
7. Deploy the stack using `AWS_PROFILE=your_profile_name pulumi up`

## Configuring Formsort

When the stack is launched, it will export a few variables. It will look something like this:

```
Outputs:
    answersRetrievalURL: "https://abcdef123.execute-api.us-east-2.amazonaws.com/stage/api/answers-retrieval"
    answersWebhookURL  : "https://abcdef123.execute-api.us-east-2.amazonaws.com/stage/api/answers-ingest"
    deploymentEventURL : "https://abcdef123.execute-api.us-east-2.amazonaws.com/stage/api/variant-revision-deployed"
```

1. First, create a [webhook integration](https://docs.formsort.com/handling-data/integration-reference/webhooks) for your flow, and use the `answersWebhookUrl` as the URL.
2. Second, [add an event subscription](https://docs.formsort.com/teams/event-subscriptions) for the `variant_revision_published` event and use JSON as the format and the URL from `deploymentEventURL` as the URL.
3. Make sure you deploy the flow in question
4. You can now retrieve data from the flow by the responder UUID by accessing the URL from `answersRetrievalUrl` with `?responderUuid=....` at the end of the URL.

# Ideas for customization

Here are some ways you might consider modifying this stack for your own purposes.

- Add authentication by adding [access control](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-to-api.html) to the API gateway in the stack, such as authorizing via Cognito or restricting access to the API to a VPC within your account (making it a private API).
- Create an endpoint to retrieve answers by email address.
  - You might do this by creating a [secondary index](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SecondaryIndexes.html) in the DynamoDB table, and populate that with the email address you extract from the `answers` in the webhook payload.
- Save PDFs for any finalized answer sets to another S3 bucket.
  - It's a good idea to do post-processsing asynchronously, rather than in the initial request handler. You could enqueue S3 events to an SQS (Simple Queue Service) queue and have a lambda do any such processing.
- Store answers in [RDS (A relational database like SQL)](https://aws.amazon.com/rds/), rather than in unstructured documents in S3 and Dynamo.
  - If you want well-structured relational tables, the deployment events contain the JSONSchema of the flow being deployed. You could use this to generate a new table per variant revision, with columns for each of the answers, for easier querying.
- Use [SES (Simple Email Service)](https://aws.amazon.com/ses/) to send emails to your team when a specific flow is deployed, or to your responders when they complete a form.

# Coming soon

- Add a correctly-configured file upload bucket
- Put flowContent type definition in the docs for admin API
- Improved HTML view
  -- See if it's easy to have a build step to run a sveltekit app
- PDF view (that renders the HTML view)
- Caching of the PDF view in S3
