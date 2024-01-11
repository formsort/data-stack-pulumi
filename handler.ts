import * as aws from '@pulumi/aws';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler: aws.lambda.EventHandler<
  APIGatewayProxyEvent,
  APIGatewayProxyResult
> = async (event) => {
  const route = event.pathParameters!['route'];
  const body = event.body ? JSON.parse(event.body) : null;
  return {
    statusCode: 200,
    body: JSON.stringify({
      route,
      affirmation: "Nice job, you've done it! :D",
      requestBodyEcho: body,
    }),
  };
};

export default handler;
