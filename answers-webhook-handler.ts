import { APIGatewayProxyHandler } from 'aws-lambda';
import * as AWS from 'aws-sdk';
const s3 = new AWS.S3();

export const answersWebhookHandler: APIGatewayProxyHandler = async (event) => {
  if (!process.env.ANSWERS_BUCKET_NAME) {
    return {
      statusCode: 500,
      body: 'ANSWERS_BUCKET_NAME must be specified',
    };
  }

  let body: any;
  if (event.body) {
    try {
      if (event.isBase64Encoded) {
        const decodedBody = Buffer.from(event.body, 'base64').toString('utf-8');
        body = JSON.parse(decodedBody);
      } else {
        body = JSON.parse(event.body);
      }
    } catch (e) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          event: JSON.stringify(event),
        }),
      };
    }
  }

  if (body) {
    await s3
      .putObject({
        Bucket: process.env.ANSWERS_BUCKET_NAME,
        Key: 'my-answers.json',
        Body: JSON.stringify(body),
        ContentType: 'application/json',
      })
      .promise();
  }

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
