// import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

import handler from './handler';

const RESOURCE_NAME = 'my-formsort-answers';

// Create an AWS resource (S3 Bucket)
const bucket = new aws.s3.Bucket(RESOURCE_NAME);

// Create an API endpoint.
const endpoint = new awsx.classic.apigateway.API(RESOURCE_NAME, {
  routes: [
    {
      path: '/{route+}',
      method: 'GET',
      // Functions can be imported from other modules
      eventHandler: handler,
    },
  ],
});

// Export the name of the bucket
export const endpointUrl = endpoint.url;
export const bucketName = bucket.id;
