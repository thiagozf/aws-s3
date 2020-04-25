const path = require('path')
const { mergeDeepRight } = require('ramda')
const { Component, utils } = require('@serverless/core')
const {
  getClients,
  clearBucket,
  accelerateBucket,
  deleteBucket,
  ensureBucket,
  configureCors
} = require('./utils')

const defaults = {
  name: undefined,
  accelerated: true,
  region: 'us-east-1'
}

class AwsS3 extends Component {
  async deploy(inputs = {}) {
    const config = mergeDeepRight(defaults, inputs)

    console.log(`Deploying`)

    config.name = inputs.name || this.state.name

    console.log(`Deploying bucket ${config.name} in region ${config.region}.`)

    const clients = getClients(this.credentials.aws, config.region)
    await ensureBucket(clients.regular, config.name, console.log)

    // todo we probably don't need this logic now that we auto generate names
    if (config.accelerated) {
      if (config.name.includes('.')) {
        throw new Error('Accelerated buckets must be DNS-compliant and must NOT contain periods')
      }

      console.log(`Setting acceleration to "${config.accelerated}" for bucket ${config.name}.`)
      await accelerateBucket(clients.regular, config.name, config.accelerated)
    }

    if (config.cors) {
      console.log(`Setting cors for bucket ${config.name}.`)
      await configureCors(clients.regular, config.name, config.cors, console.log)
    }

    // todo we probably don't need this logic now that we auto generate names
    const nameChanged = this.state.name && this.state.name !== config.name
    if (nameChanged) {
      await this.remove({ name: this.state.name })
    }

    this.state.name = config.name
    this.state.region = config.region
    this.state.accelerated = config.accelerated
    this.state.url = `https://${config.name}.s3.amazonaws.com`

    console.log(`Bucket ${config.name} was successfully deployed to the ${config.region} region.`)

    return this.state
  }

  async remove() {
    console.log(`Removing`)

    if (!this.state.name) {
      console.log(`Aborting removal. Bucket name not found in state.`)
      return
    }

    const clients = getClients(this.credentials.aws, this.state.region)

    console.log(`Clearing bucket ${this.state.name} contents.`)

    await clearBucket(
      this.state.accelerated ? clients.accelerated : clients.regular,
      this.state.name
    )

    console.log(`Deleting bucket ${this.state.name} from region ${this.state.region}.`)

    await deleteBucket(clients.regular, this.state.name)

    console.log(
      `Bucket ${this.state.name} was successfully deleted from region ${this.state.region}.`
    )

    return {
      name: this.state.name,
      region: this.state.region,
      accelerated: this.state.accelerated
    }
  }
}

module.exports = AwsS3
