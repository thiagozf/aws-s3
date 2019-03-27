# AwsS3
A serverless component that provisions an S3 bucket.

## Usage

### Declarative

```yml

name: my-bucket
stage: dev

AwsS3@0.1.4::my-bucket:
  name: my-bucket-name
  website: false, # whether to configure this bucket as a website bucket
  accelerated: true, # whether to turn on accelerated uploads
  regoin: us-east-1
```

### Programatic

```js
npm i --save @serverless/aws-s3
```

```js

const bucket = await this.load('@serverless/aws-s3')

const inputs = {
  name: 'serverless',
  website: false,
  accelerated: true,
  region: 'us-east-1'
}

await bucket(inputs)

```
