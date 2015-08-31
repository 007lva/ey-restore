'use strict'

const request = require('request')
const cheerio = require('cheerio')
const fs = require('fs')
const ProgressBar = require('progress')
const config = require('./config')

const req = request.defaults({ forever: true, jar: true })
let envs = {}, progressBar
const ENV_APP_NAME = config['env']

function doRequest(options) {
  return new Promise(
    function(resolve, reject) {
      req(options, function(err, response, body) {
        if (err) {
          reject(err)
        } else {
          resolve(body)
        }
      })
    }
  )
}

function pipeRequest(url) {
  return new Promise(
    function(resolve, reject) {
      req
      .get(url)
      .on('response', function(response) {
        if (response.statusCode == 200) {
          resolve(response)
        } else {
          reject(response)
        }
      })
      .on('data', function(chunk) {
        if (progressBar) progressBar.tick(chunk.length)
      })
      .pipe(fs.createWriteStream(ENV_APP_NAME + '.dump'))
    }
  )
}

doRequest({ uri: 'https://login.engineyard.com/login' })
.then(function(body) {
  const $ = cheerio.load(body)
  const formData = {
    'email': config.user.email,
    'password': config.user.password,
    'authenticity_token': $('meta[name=csrf-token]').attr('content'),
    'commit': 'Log in'
  }
  return doRequest({ uri: 'https://login.engineyard.com/login', form: formData, method: 'POST' })
})
.then(function(body) {
  return doRequest({ uri: 'https://login.engineyard.com/' })
})
.then(function(body) {
  return doRequest({ uri: 'https://cloud.engineyard.com/' })
})
.then(function(body) {
  const $ = cheerio.load(body)
  $('span.environment-name').each(function(i, elem) {
    const link = $(this).find('a')
    envs[ link.text() ] = 'https://cloud.engineyard.com' + link.attr('href')
  })
  return doRequest({ uri: envs[ENV_APP_NAME] })
})
.then(function(body) {
  const $ = cheerio.load(body)
  const link = 'https://cloud.engineyard.com' + $("a:contains('Database backups')").attr('href')
  return doRequest({ uri: link })
})
.then(function(body) {
  const $ = cheerio.load(body)
  const link = $($('ul.backups').find('a')[0]).attr('href')
  return pipeRequest(link)
})
.then(function(response) {
  const backupSize = parseInt(response.headers['content-length'])
  progressBar = new ProgressBar('  downloading [:bar] :percent :etas', {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: backupSize
  })
})
.catch(function(err) {
  if (err) {
    console.log('Error: ' + JSON.stringify(err))
  } else {
    console.log('Succes!')
  }
})

