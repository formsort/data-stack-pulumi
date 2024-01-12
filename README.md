# Getting started

0. Create a Pulumi account and access token, and install the Pulumi CLI
1. Ensure you have an AWS IAM user with permissions to create resources. If you're just getting started, give the user the `AdministratorAccess` policy so that you are not blocked on permissions issues.
2. Generate an access key for that user
3. Update your `/.aws/credentials` to include the access key and secret in a profile
4. Ensure the AWS region `pulumi config set aws:region us-west-2`
5. If you want to pull out HTML pages or PDFs, get your Formsort API key and set it using `pulumi config set formsortAPIKey {YOUR_API_KEY}`.
6. If you want to verify webhook payloads are coming from formsort, get your webhook signing key set it in the pulumi project using `pulumi config set formsortWebhookSigningKey {YOUR_SIGNING_KEY}`. Note that this is not the same key as the general API key.
7. Deploy the stack using `AWS_PROFILE=your_profile_name pulumi up`

# TODO

- Cache of flow contents in dynamo
- Receive flow contents on published event
- Put flowContent type definition in the docs for admin API
- HTML view
  -- See if it's easy to have a build step to run a sveltekit app
- PDF view (that renders the HTML view)
- Caching of the PDF view in S3
- Detailed README about architecture
