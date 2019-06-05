const path = require('path')
const { mergeDeepRight } = require('ramda')
const { Component, fileExists, dirExists, sleep } = require('@serverless/components')
const {
  getClients,
  configureWebsite,
  clearBucket,
  deleteBucket,
  uploadDir,
  packAndUploadDir,
  uploadFile
} = require('./utils')

const defaults = {
  name: 'serverless',
  website: false,
  accelerated: true,
  region: 'us-east-1'
}

class AwsS3 extends Component {
  async default(inputs = {}) {
    const config = mergeDeepRight(defaults, inputs)

    if (config.accelerated && config.name.includes('.')) {
      throw new Error('Accelerated buckets must be DNS-compliant and must NOT contain periods')
    }

    this.ui.status(`Deploying`)

    const clients = getClients(this.context.credentials.aws, config.region)

    try {
      await clients.regular.headBucket({ Bucket: config.name }).promise()
    } catch (e) {
      if (e.code === 'NotFound') {
        await clients.regular.createBucket({ Bucket: config.name }).promise()
        // there's a race condition when using acceleration
        // so we need to sleep for a couple seconds. See this issue:
        // https://github.com/serverless/components/issues/428
        await sleep(2000)
      } else if (e.code === 'Forbidden') {
        throw Error(`Bucket name "${config.name}" is already taken.`)
      } else {
        throw e
      }
    }

    await clients.regular
      .putBucketAccelerateConfiguration({
        AccelerateConfiguration: {
          Status: config.accelerated ? 'Enabled' : 'Suspended'
        },
        Bucket: config.name
      })
      .promise()

    if (config.website) {
      await configureWebsite(
        config.accelerated ? clients.accelerated : clients.regular,
        config.name
      )
    }

    const nameChanged = this.state.name && this.state.name !== config.name

    if (nameChanged) {
      await this.remove({ name: this.state.name })
    }

    this.state.name = config.name
    this.state.region = config.region
    this.state.accelerated = config.accelerated
    await this.save()

    this.ui.log()
    this.ui.output('bucket', `     ${config.name}`)
    this.ui.output('region', `     ${config.region}`)
    this.ui.output('accelerated', `${config.accelerated}`)
    this.ui.output('website', `    ${config.website}`)
    return config
  }

  async remove(inputs = {}) {
    if (!inputs.name && !this.state.name) {
      return
    }

    const name = inputs.name || this.state.name
    const region = inputs.region || this.state.region || defaults.region

    this.ui.status(`Removing`)

    const clients = getClients(this.context.credentials.aws, region)

    await clearBucket(this.state.accelerated ? clients.accelerated : clients.regular, name)

    await deleteBucket(clients.regular, name)

    this.state = {}
    await this.save()
    return {}
  }

  async upload(inputs = {}) {
    this.ui.status('Uploading')

    if (!inputs.name && !this.state.name) {
      this.ui.log('no bucket name found in state.')
      return
    }

    const name = inputs.name || this.state.name
    const region = inputs.region || this.state.region || defaults.region

    const clients = getClients(this.context.credentials.aws, region)

    if (inputs.dir && (await dirExists(inputs.dir))) {
      if (inputs.zip) {
        // pack & upload using multipart uploads
        const defaultKey = Math.random()
          .toString(36)
          .substring(6)

        await packAndUploadDir({
          s3: this.state.accelerated ? clients.accelerated : clients.regular,
          bucketName: name,
          dirPath: inputs.dir,
          key: inputs.key || `${defaultKey}.zip`
        })
      } else {
        // upload directory contents
        await uploadDir(
          this.state.accelerated ? clients.accelerated : clients.regular,
          name,
          inputs.dir
        )
      }
    } else if (inputs.file && (await fileExists(inputs.file))) {
      // upload a single file using multipart uploads
      await uploadFile({
        s3: this.state.accelerated ? clients.accelerated : clients.regular,
        bucketName: name,
        filePath: inputs.file,
        key: inputs.key || path.basename(inputs.file)
      })
    }
  }
}

module.exports = AwsS3
