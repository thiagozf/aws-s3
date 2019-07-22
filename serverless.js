const path = require('path')
const { mergeDeepRight } = require('ramda')
const { Component, utils } = require('@serverless/core')
const {
  getClients,
  configureWebsite,
  clearBucket,
  accelerateBucket,
  deleteBucket,
  uploadDir,
  packAndUploadDir,
  uploadFile
} = require('./utils')

const defaults = {
  website: false,
  accelerated: true,
  region: 'us-east-1'
}

class AwsS3 extends Component {
  async default(inputs = {}) {
    const config = mergeDeepRight(defaults, inputs)

    this.context.status(`Deploying`)

    config.name = this.state.name || this.context.resourceId()

    this.context.debug(`Deploying bucket ${config.name} in region ${config.region}.`)

    // todo we probably don't need this logic now that we auto generate names
    if (config.accelerated && config.name.includes('.')) {
      throw new Error('Accelerated buckets must be DNS-compliant and must NOT contain periods')
    }

    const clients = getClients(this.context.credentials.aws, config.region)

    try {
      this.context.debug(`Checking if bucket ${config.name} exists.`)
      await clients.regular.headBucket({ Bucket: config.name }).promise()
    } catch (e) {
      if (e.code === 'NotFound') {
        this.context.debug(`Bucket ${config.name} does not exist. Creating...`)
        await clients.regular.createBucket({ Bucket: config.name }).promise()
        // there's a race condition when using acceleration
        // so we need to sleep for a couple seconds. See this issue:
        // https://github.com/serverless/components/issues/428
        this.context.debug(`Bucket ${config.name} created, but giving AWS 5 seconds to sync...`)
        await utils.sleep(5000)
      } else if (e.code === 'Forbidden') {
        throw Error(`Bucket name "${config.name}" is already taken.`)
      } else {
        throw e
      }
    }

    this.context.debug(`Setting acceleration to "${config.accelerated}" for bucket ${config.name}.`)
    await accelerateBucket(clients.regular, config.name, config.accelerated)

    if (config.website) {
      this.context.debug(`Configuring bucket ${config.name} for website hosting.`)
      await configureWebsite(
        config.accelerated ? clients.accelerated : clients.regular,
        config.name
      )
    }

    // todo we probably don't need this logic now that we auto generate names
    const nameChanged = this.state.name && this.state.name !== config.name
    if (nameChanged) {
      await this.remove({ name: this.state.name })
    }

    this.state.name = config.name
    this.state.region = config.region
    this.state.accelerated = config.accelerated
    this.state.website = config.website
    await this.save()

    this.context.debug(
      `Bucket ${config.name} was successfully deployed to the ${config.region} region.`
    )
    return config
  }

  async remove() {
    this.context.status(`Removing`)

    if (!this.state.name) {
      this.context.debug(`Aborting removal. Bucket name not found in state.`)
      return
    }

    const clients = getClients(this.context.credentials.aws, this.state.region)

    this.context.debug(`Clearing bucket ${this.state.name} contents.`)

    await clearBucket(
      this.state.accelerated ? clients.accelerated : clients.regular,
      this.state.name
    )

    this.context.debug(`Deleting bucket ${this.state.name} from region ${this.state.region}.`)

    await deleteBucket(clients.regular, this.state.name)

    this.context.debug(
      `Bucket ${this.state.name} was successfully deleted from region ${this.state.region}.`
    )

    const outputs = {
      name: this.state.name,
      accelerated: this.state.accelerated,
      website: this.state.website,
      region: this.state.region
    }

    this.state = {}
    await this.save()

    return outputs
  }

  async upload(inputs = {}) {
    this.context.status('Uploading')

    const name = this.state.name || inputs.name
    const region = this.state.region || inputs.region || defaults.region

    if (!name) {
      throw Error('Unable to upload. Bucket name not found in state.')
    }

    this.context.debug(`Starting upload to bucket ${name} in region ${region}`)

    const clients = getClients(this.context.credentials.aws, region)

    if (inputs.dir && (await utils.dirExists(inputs.dir))) {
      if (inputs.zip) {
        this.context.debug(`Packing and uploading directory ${inputs.dir} to bucket ${name}`)
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
        this.context.debug(`Uploading directory ${inputs.dir} to bucket ${name}`)
        // upload directory contents
        await uploadDir(
          this.state.accelerated ? clients.accelerated : clients.regular,
          name,
          inputs.dir
        )
      }
    } else if (inputs.file && (await utils.fileExists(inputs.file))) {
      // upload a single file using multipart uploads
      this.context.debug(`Uploading file ${inputs.file} to bucket ${name}`)

      await uploadFile({
        s3: this.state.accelerated ? clients.accelerated : clients.regular,
        bucketName: name,
        filePath: inputs.file,
        key: inputs.key || path.basename(inputs.file)
      })

      this.context.debug(
        `File ${inputs.file} uploaded with key ${inputs.key || path.basename(inputs.file)}`
      )
    }
  }
}

module.exports = AwsS3
