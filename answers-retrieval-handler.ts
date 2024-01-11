import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

export const queryResponderHandler: APIGatewayProxyHandler = async (event) => {
  const responderUuid = event.queryStringParameters?.responderUuid;

  if (!responderUuid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'responderUuid is required' }),
    };
  }

  try {
    const queryCommand = new QueryCommand({
      TableName: process.env.ANSWERS_DYNAMO_TABLE_NAME,
      KeyConditionExpression: 'responder_uuid = :uuid',
      ExpressionAttributeValues: {
        ':uuid': { S: responderUuid },
      },
    });

    const dynamoDBClient = new DynamoDBClient({
      region: process.env.AWS_REGION,
    });
    const data = await dynamoDBClient.send(queryCommand);
    if (!data.Items?.length) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'No items found',
        }),
      };
    }
    const items = data.Items.map((item) => unmarshall(item));
    return {
      statusCode: 200,
      body: JSON.stringify(items),
    };
  } catch (error) {
    console.error('Error querying DynamoDB:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

export default queryResponderHandler;
