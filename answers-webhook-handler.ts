import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import * as z from 'zod';
import { createHmac } from 'crypto';

export const answersWebhookHandler: APIGatewayProxyHandler = async (event) => {
  if (!event.body) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Request body is required',
      }),
    };
  }

  let body: string;
  const bodyBuffer = Buffer.from(event.body, 'base64');
  try {
    if (event.isBase64Encoded) {
      const decodedBody = bodyBuffer.toString('utf-8');
      body = JSON.parse(decodedBody);
    } else {
      body = JSON.parse(event.body);
    }
  } catch {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Request body must be valid JSON',
      }),
    };
  }

  if (
    process.env.FORMSORT_WEBHOOK_SIGNING_KEY &&
    event.headers['x-formsort-secure'] === 'sign'
  ) {
    const expectedSignature = event.headers['x-formsort-signature'];
    const key = Buffer.from(process.env.FORMSORT_WEBHOOK_SIGNING_KEY, 'utf8');
    const actualSignature = createHmac('sha256', key)
      .update(bodyBuffer)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    if (actualSignature !== expectedSignature) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          detail: {
            expectedSignature,
            actualSignature,
          },
          error:
            'Request body does not match signature. Please check that you have the correct formsortWebhookSigningKey set in your pulumi config, otherwise remove it from config to disable signature checking.',
        }),
      };
    }
  }

  const answersWebhookPayloadSchema = z.object({
    answers: z.any(),
    flow_label: z.string(),
    responder_uuid: z.string().uuid(),
    variant_label: z.string(),
    variant_uuid: z.string().uuid(),
    finalized: z.boolean(),
    created_at: z.string().datetime({ offset: true }),
  });
  const parseResult = answersWebhookPayloadSchema.safeParse(body);
  if (!parseResult.success) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error:
          'Error when parsing the request body as a Formsort webhook payload',
        detail: parseResult.error,
      }),
    };
  }
  const { data } = parseResult;

  // Upload the body to S3
  if (!process.env.ANSWERS_BUCKET_NAME) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'ANSWERS_BUCKET_NAME must be defined in the lambda environment',
      }),
    };
  }
  const s3 = new S3Client({ region: process.env.AWS_REGION });
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.ANSWERS_BUCKET_NAME,
      Key: 'my-answers.json',
      Body: JSON.stringify(body),
      ContentType: 'application/json',
    })
  );

  // Write the body to Dynamo as well
  if (!process.env.ANSWERS_DYNAMO_TABLE_NAME) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error:
          'ANSWERS_DYNAMO_TABLE_NAME must be defined in the lambda environment',
      }),
    };
  }
  try {
    const dynamoDBClient = new DynamoDBClient({
      region: process.env.AWS_REGION,
    });
    await dynamoDBClient.send(
      new PutItemCommand({
        TableName: process.env.ANSWERS_DYNAMO_TABLE_NAME,
        Item: marshall(data),
      })
    );
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error writing to DynamoDB',
        detail: error?.message,
      }),
    };
  }

  return {
    statusCode: 204,
    body: '',
  };
};

export default answersWebhookHandler;
