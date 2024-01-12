import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import * as z from 'zod';

const DEFAULT_FORMAT = 'json';

export const queryResponderHandler: APIGatewayProxyHandler = async (event) => {
  const responderUuid = event.queryStringParameters?.responderUuid;

  if (!responderUuid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'responderUuid is required' }),
    };
  }

  try {
    z.string().uuid().parse(responderUuid);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'responderUuid must be a valid UUID' }),
    };
  }

  // TODO: Share this type from the answersWebhookPayloadSchema
  let items: any[];

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

  const dynamoDBClient = new DynamoDBClient({
    region: process.env.AWS_REGION,
  });
  try {
    const queryCommand = new QueryCommand({
      TableName: process.env.ANSWERS_DYNAMO_TABLE_NAME,
      KeyConditionExpression: 'responder_uuid = :uuid',
      ExpressionAttributeValues: {
        ':uuid': { S: responderUuid },
      },
    });

    const data = await dynamoDBClient.send(queryCommand);
    if (!data.Items?.length) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'No items found',
        }),
      };
    }
    items = data.Items.map((item) => unmarshall(item));
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }

  const format = event.queryStringParameters?.format ?? DEFAULT_FORMAT;

  if (format === 'json') {
    return {
      statusCode: 200,
      body: JSON.stringify(items),
    };
  }

  if (!process.env.FORMSORT_API_KEY) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error:
          'FORMSORT_API_KEY must be defined in the lambda environment to use non-JSON retrieval methods. Set it using pulumi config set formsortAPIKey {YOUR_KEY}',
      }),
    };
  }
  const variantRevisionUuids = items.map((item) => item.variant_uuid);
  // TODO: Type this correctly
  const flowContents: any = {};

  for (const variantRevisionUuid of variantRevisionUuids) {
    let flowContent: any;

    const s3Client = new S3Client({ region: process.env.AWS_REGION });
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: process.env.FLOW_CONTENTS_BUCKET_ID,
          Key: `${variantRevisionUuid}.json`,
        })
      );
      const str = await response.Body?.transformToString();
      if (!str) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'Failed to read caches flow content as string',
          }),
        };
      }
      flowContent = JSON.parse(str);
    } catch (error) {
      if (error.name !== 'NoSuchKey') {
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'Failed to fetch flow content from cache',
            detail: error?.message,
          }),
        };
      }
    }

    if (!flowContent) {
      const res = await fetch(
        `https://api.formsort.com/alpha/variant-revisions/${variantRevisionUuid}`,
        {
          headers: {
            'X-API-KEY': process.env.FORMSORT_API_KEY,
          },
        }
      );
      if (!res.ok || res.status != 200) {
        return {
          statusCode: 503,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            error: `Failed to retrieve variant revision data for uuid ${variantRevisionUuid}`,
          }),
        };
      }
      const variantRevisionJSON = await res.json();
      flowContent = variantRevisionJSON.flowContent;
    }

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.FLOW_CONTENTS_BUCKET_ID,
          Key: `${variantRevisionUuid}.json`,
          Body: JSON.stringify(flowContent),
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
    flowContents[variantRevisionUuid] = flowContent;
  }

  if (format === 'html') {
    const tables = items.map((item) => {
      const variantRevisionUuid = item.variant_uuid;
      const flowContent = flowContents[variantRevisionUuid];
      const rows: any = [];
      flowContent.groups.forEach((group: any) => {
        group.steps.forEach((step: any) => {
          step.questions.forEach((question: any) => {
            if (!question.schemaKey) {
              return;
            }
            rows.push(`<tr>
              <td>${group.label ?? ''}</td>
              <td>${step.label ?? ''}</td>
              <td>${question.label ?? ''}<br /><code>(${
              question.schemaKey
            })</code></td>
              <td>${item.answers[question.schemaKey] ?? ''}</td>
            </tr>`);
          });
        });
      });

      return `
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Step</th>
              <th>Question</th>
              <th>Answer</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join('\n')}
          </tbody>
        </table>
      `;
    });

    const body = `
    <!doctype html>
      <head>
        <style>
          html {
              font-family: -apple-system, BlinkMacSystemFont, 
          "Segoe UI", "Roboto", "Oxygen", 
          "Ubuntu", "Cantarell", "Fira Sans", 
          "Droid Sans", "Helvetica Neue", sans-serif;
          }

          td {
            width: 25%;
          }
        </style>
      </head>
      <body>
        ${tables.join('\n')}
      </body>
    </html>
    `;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body,
    };
  }

  if (format === 'pdf') {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'PDF under construction',
      }),
    };
  }

  return {
    statusCode: 500,
    body: JSON.stringify({
      error: `Unsupported format: ${format}`,
    }),
  };
};

export default queryResponderHandler;
