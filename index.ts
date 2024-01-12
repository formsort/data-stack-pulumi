import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

import answersWebhookHandler from './answers-webhook-handler';
import answersRetrievalHandler from './answers-retrieval-handler';
import variantRevisionDeployedHandler from './variant-revision-deployed-handler';

const RESOURCE_NAME = 'my-formsort-answers';
const ANSWERS_WEBHOOK_PATH = 'api/answers-ingest';
const DEPLOYED_WEBHOOK_PATH = 'api/variant-revision-deployed';

const config = new pulumi.Config();
const formsortAPIKey = config.get('formsortAPIKey');
const formsortWebhookSigningKey = config.get('formsortWebhookSigningKey');

// Create an S3 bucket to store received answer webhooks
const answersBucket = new aws.s3.Bucket(RESOURCE_NAME);
const flowContentsBucket = new aws.s3.Bucket(`${RESOURCE_NAME}-flow-contents`);

const answersTable = new aws.dynamodb.Table('answersWebhookTable', {
  attributes: [{ name: 'responder_uuid', type: 'S' }],
  hashKey: 'responder_uuid',
  billingMode: 'PAY_PER_REQUEST',
});

const answersWebhookLambda = new aws.lambda.CallbackFunction(
  'answers-webhook-handler',
  {
    runtime: 'nodejs18.x',
    callback: answersWebhookHandler,
    environment: {
      variables: {
        ANSWERS_BUCKET_NAME: answersBucket.id,
        ANSWERS_DYNAMO_TABLE_NAME: answersTable.name,
        FORMSORT_WEBHOOK_SIGNING_KEY: formsortWebhookSigningKey ?? '',
      },
    },
  }
);

const answersRetrievalLambda = new aws.lambda.CallbackFunction(
  'answers-retrieval-handler',
  {
    runtime: 'nodejs18.x',
    callback: answersRetrievalHandler,
    environment: {
      variables: {
        ANSWERS_DYNAMO_TABLE_NAME: answersTable.name,
        FLOW_CONTENTS_BUCKET_ID: flowContentsBucket.id,
        FORMSORT_API_KEY: formsortAPIKey ?? '',
      },
    },
  }
);

const variantRevisionDeployedLambda = new aws.lambda.CallbackFunction(
  'variant-deployed-handler',
  {
    runtime: 'nodejs18.x',
    callback: variantRevisionDeployedHandler,
    environment: {
      variables: {
        FLOW_CONTENTS_BUCKET_ID: flowContentsBucket.id,
      },
    },
  }
);

// Create an API gateway to expose the lambdas
const endpoint = new awsx.classic.apigateway.API(RESOURCE_NAME, {
  routes: [
    {
      path: `/${ANSWERS_WEBHOOK_PATH}`,
      method: 'POST',
      eventHandler: answersWebhookLambda,
      contentType: 'application/json',
    },
    {
      // TODO: Make note about authorizers
      path: '/api/answers-retrieval',
      method: 'GET',
      eventHandler: answersRetrievalLambda,
    },
    {
      path: `/${DEPLOYED_WEBHOOK_PATH}`,
      method: 'POST',
      contentType: 'application/json',
      eventHandler: variantRevisionDeployedLambda,
    },
  ],
});

// Export variables useful for configuration
// TODO: Export specifically the answers and deployment webhook.
export const endpointUrl = endpoint.url;
