import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import * as z from 'zod';

export const answersWebhookHandler: APIGatewayProxyHandler = async (event) => {
  const s3 = new S3Client({ region: process.env.AWS_REGION });

  if (!process.env.ANSWERS_BUCKET_NAME) {
    return {
      statusCode: 500,
      headers: {
        ContentType: 'application/json',
      },
      body: JSON.stringify({
        message:
          'ANSWERS_BUCKET_NAME must be defined in the lambda environment',
      }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: {
        ContentType: 'application/json',
      },
      body: JSON.stringify({
        message: 'A request body is required',
      }),
    };
  }

  let body: string;
  try {
    if (event.isBase64Encoded) {
      const decodedBody = Buffer.from(event.body, 'base64').toString('utf-8');
      body = JSON.parse(decodedBody);
    } else {
      body = JSON.parse(event.body);
    }
  } catch {
    return {
      statusCode: 400,
      headers: {
        ContentType: 'application/json',
      },
      body: JSON.stringify({
        message: 'Request body must be valid JSON',
      }),
    };
  }

  const answersWebhookPayloadSchema = z.object({
    answers: z.any(),
    responder_uuid: z.string().uuid(),
    flow_label: z.string(),
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
        ContentType: 'application/json',
      },
      body: JSON.stringify({
        message:
          'Error when parsing the request body as a Formsort webhook payload',
        error: parseResult.error,
      }),
    };
  }

  // Upload the body to S3
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.ANSWERS_BUCKET_NAME,
      Key: 'my-answers.json',
      Body: JSON.stringify(body),
      ContentType: 'application/json',
    })
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      httpMethod: event.httpMethod,
      affirmation: "Nice job, you've done it! :D",
      bucketId: process.env.ANSWERS_BUCKET_NAME,
      requestBodyEcho: body,
    }),
  };
};

export default answersWebhookHandler;
