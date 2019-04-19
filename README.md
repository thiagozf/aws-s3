# aws-s3

Instantly deploy and manage your S3 buckets with [Serverless Components](https://github.com/serverless/components). Supports single key configuration for acceleration & website policies, as well as file & directory uploads.

&nbsp;

1. [Install](#1-install)
2. [Create](#2-create)
3. [Configure](#3-configure)
4. [Deploy](#4-deploy)
5. [Upload](#5-upload)

&nbsp;


### 1. Install

```console
$ npm install -g @serverless/components
```

### 2. Create

Just create a `serverless.yml` file

```console
$ touch serverless.yml
$ touch .env      # your development AWS api keys
$ touch .env.prod # your production AWS api keys
```

the `.env` files are not required if you have the aws keys set globally and you want to use a single stage, but they should look like this.

```
AWS_ACCESS_KEY_ID=XXX
AWS_SECRET_ACCESS_KEY=XXX
```


### 3. Configure

```yml
# serverless.yml

name: my-bucket
stage: dev

myBucket:
  component: "@serverless/aws-s3"
  inputs:
    name: my-bucket    # bucket name. Make sure it's globally unique
    accelerated: false # default is true. Enables upload acceleartion for the bucket
    website: true      # default is false.. if set to true, this would apply static website hosting policies on the bucket.
    region: us-east-1
```

### 4. Deploy

```console
aws-s3 (master)$ ️components

  AwsS3 › outputs:
  name:  'example-serverless-components-bucket'
  website:  false
  accelerated:  true
  region:  'us-east-1'


  4s › dev › AwsS3 › done

aws-s3 (master)$

```

### 5. Upload
If you're using this component programmatically within another component, you could also easily upload files and/or directories to your bucket.
 
```js

const bucket = await this.load('@serverless/components')

// deploy
await bucket({
  name: 'example-serverless-components-bucket'
})

// upload directory
await bucket.upload({ dir: './my-files' })

// upload file
await bucket.upload({ file: './my-file.txt' })

```

For a full example on how this component could be used, [take a look at how the website component is using it](https://github.com/serverless-components/website/blob/master/serverless.js#L81).

&nbsp;

### New to Components?

Checkout the [Serverless Components](https://github.com/serverless/components) repo for more information.
