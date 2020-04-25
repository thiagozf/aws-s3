const aws = require('aws-sdk')
const fs = require('fs')
const path = require('path')
const klawSync = require('klaw-sync')
const mime = require('mime-types')
const { isEmpty } = require('ramda')
const { createReadStream } = require('fs-extra')
const archiver = require('archiver')
const { utils } = require('@serverless/core')

const getClients = (credentials, region) => {
  const params = {
    region,
    credentials
  }

  // we need two S3 clients because creating/deleting buckets
  // is not available with the acceleration feature.
  return {
    regular: new aws.S3(params),
    accelerated: new aws.S3({ ...params, endpoint: `s3-accelerate.amazonaws.com` })
  }
}

const bucketCreation = async (s3, Bucket) => {
  try {
    await s3.headBucket({ Bucket }).promise()
  } catch (e) {
    if (e.code === 'NotFound' || e.code === 'NoSuchBucket') {
      await utils.sleep(2000)
      return bucketCreation(s3, Bucket)
    }
    throw new Error(e)
  }
}

const ensureBucket = async (s3, name, debug) => {
  try {
    debug(`Checking if bucket ${name} exists.`)
    await s3.headBucket({ Bucket: name }).promise()
  } catch (e) {
    if (e.code === 'NotFound') {
      debug(`Bucket ${name} does not exist. Creating...`)
      await s3.createBucket({ Bucket: name }).promise()
      // there's a race condition when using acceleration
      // so we need to sleep for a couple seconds. See this issue:
      // https://github.com/serverless/components/issues/428
      debug(`Bucket ${name} created. Confirming it's ready...`)
      await bucketCreation(s3, name)
      debug(`Bucket ${name} creation confirmed.`)
    } else if (e.code === 'Forbidden' && e.message === null) {
      throw Error(`Forbidden: Invalid credentials or this AWS S3 bucket name may already be taken`)
    } else if (e.code === 'Forbidden') {
      throw Error(`Bucket name "${name}" is already taken.`)
    } else {
      throw e
    }
  }
}

const clearBucket = async (s3, bucketName) => {
  try {
    const data = await s3.listObjects({ Bucket: bucketName }).promise()

    const items = data.Contents
    const promises = []

    for (var i = 0; i < items.length; i += 1) {
      var deleteParams = { Bucket: bucketName, Key: items[i].Key }
      const delObj = s3.deleteObject(deleteParams).promise()
      promises.push(delObj)
    }

    await Promise.all(promises)
  } catch (error) {
    if (error.code !== 'NoSuchBucket') {
      throw error
    }
  }
}

const accelerateBucket = async (s3, bucketName, accelerated) => {
  try {
    await s3
      .putBucketAccelerateConfiguration({
        AccelerateConfiguration: {
          Status: accelerated ? 'Enabled' : 'Suspended'
        },
        Bucket: bucketName
      })
      .promise()
  } catch (e) {
    if (e.code === 'NoSuchBucket') {
      await utils.sleep(2000)
      return accelerateBucket(s3, bucketName, accelerated)
    }
    throw e
  }
}

const deleteBucket = async (s3, bucketName) => {
  try {
    await s3.deleteBucket({ Bucket: bucketName }).promise()
  } catch (error) {
    if (error.code !== 'NoSuchBucket') {
      throw error
    }
  }
}

const configureCors = async (s3, bucketName, config) => {
  const params = { Bucket: bucketName, CORSConfiguration: config }
  try {
    await s3.putBucketCors(params).promise()
  } catch (e) {
    if (e.code === 'NoSuchBucket') {
      await utils.sleep(2000)
      return configureCors(s3, bucketName, config)
    }
    throw e
  }
}

module.exports = {
  getClients,
  clearBucket,
  accelerateBucket,
  deleteBucket,
  bucketCreation,
  ensureBucket,
  configureCors
}
