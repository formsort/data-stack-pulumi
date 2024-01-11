# Getting started

0. Create a Pulumi account and access token, and install the Pulumi CLI
1. Ensure you have an AWS IAM user with permissions to create resources. If you're just getting started, give the user the `AdministratorAccess` policy so that you are not blocked on permissions issues.
2. Generate an access key for that user
3. Update your `/.aws/credentials` to include the access key and secret in a profile
4. Ensure the `pulumi config set aws:region us-west-2`
5. Deploy the stack using `AWS_PROFILE=your_profile_name pulumi up`
