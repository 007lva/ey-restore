'use strict'

const request = require('request')
const cheerio = require('cheerio')
const fs = require('fs')
const ProgressBar = require('progress')
const config = require('./config')
const exec = require('child_process').exec

let envs = {}, progressBar
const dbName = config['postgres']['db']
const ENV_APP_NAME = config['env']
const fullPath = __dirname + ENV_APP_NAME + '.dump'
const req = request.defaults({ forever: true, jar: true })

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
      .on('end', function() {
      	console.log('termino')
        runCommand('psql -l -H')
        .then(function(result) {
          console.log('asd: ' + result)
          const $ = cheerio.load(result)
          let databases = []
          $('td:nth-child(1)').each(function(index, elem) {
            databases.push($(elem).text())
          })
          console.log('Dbs: ' + databases)
          console.log('Existe: ' + (dbName in databases))
          runCommand('createdb -T template0 ' + config.postgres.db)
        })
      })
      .pipe(fs.createWriteStream(fullPath))
    }
  )
}

function runCommand(command) {
  return new Promise(
    function(resolve, reject) {
      exec(command, function(err, stdout, stderr) {
        if (err) {
          reject(err)
        } else {
          resolve(stdout)
        }
      })
    }
  )
}

function printResult(result) {
  console.log(result.stderr)
  console.log(result.stdout)
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
    console.log('Success!')
  }
})

