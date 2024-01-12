import { APIGatewayProxyHandler } from 'aws-lambda';
import * as z from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const variantRevisionDeployedHandler: APIGatewayProxyHandler = async (
  event
) => {
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

  let body: {};
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

  const publishedEventSchema = z.object({
    payload: z.object({
      flowLabel: z.string(),
      environmentLabel: z.string(),
      // TODO: Why is this not sent when deploying for real?
      // environmentRevisionUuid: z.string().uuid(),
      variantLabel: z.string(),
      variantRevisionUuid: z.string().uuid(),
      flowContent: z.any(),
      jsonSchema: z.any(),
      notes: z.string().nullable(),
      publishedByEmail: z.string().email(),
    }),
  });

  const parseResult = publishedEventSchema.safeParse(body);
  if (!parseResult.success) {
    console.error({
      error: parseResult.error,
    });
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error:
          'Error when parsing the request body as a Formsort publish event',
        detail: parseResult.error,
      }),
    };
  }
  const { data } = parseResult;

  // Save the flow content in s3
  const s3Client = new S3Client({ region: process.env.AWS_REGION });
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.FLOW_CONTENTS_BUCKET_ID,
        Key: `${data.payload.variantRevisionUuid}.json`,
        Body: JSON.stringify(data.payload.flowContent),
        ContentType: 'application/json',
      })
    );
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Error saving flow contents in cache',
        detail: error?.message,
      }),
    };
  }
  return {
    statusCode: 204,
    body: '',
  };
};

export default variantRevisionDeployedHandler;
