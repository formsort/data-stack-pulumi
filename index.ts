import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

import answersWebhookHandler from './answers-webhook-handler';
import answersRetrievalHandler from './answers-retrieval-handler';

const RESOURCE_NAME = 'my-formsort-answers';
const config = new pulumi.Config();
const formsortAPIKey = config.get('formsortAPIKey');
const formsortWebhookSigningKey = config.get('formsortWebhookSigningKey');

// Create an S3 bucket to store received webhooks
const answersBucket = new aws.s3.Bucket(RESOURCE_NAME);

const answersTable = new aws.dynamodb.Table('answersWebhookTable', {
  attributes: [{ name: 'responder_uuid', type: 'S' }],
  hashKey: 'responder_uuid',
  billingMode: 'PAY_PER_REQUEST',
});

// Define the webhook to store answers
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

// Define the webhook to retrieve answers
const answersRetrievalLambda = new aws.lambda.CallbackFunction(
  'answers-retrieval-handler',
  {
    runtime: 'nodejs18.x',
    callback: answersRetrievalHandler,
    environment: {
      variables: {
        ANSWERS_DYNAMO_TABLE_NAME: answersTable.name,
        FORMSORT_API_KEY: formsortAPIKey ?? '',
      },
    },
  }
);

// Create an API gateway to expose the lambdas
const endpoint = new awsx.classic.apigateway.API(RESOURCE_NAME, {
  routes: [
    {
      path: '/api/answers-ingest',
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
  ],
});

// Export variables useful for configuration
export const endpointUrl = endpoint.url;
export const answersBucketName = answersBucket.id;
