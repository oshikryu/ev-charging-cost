import fs from 'fs'
import readline from 'readline'
import { google } from 'googleapis'
import { DateTime } from 'luxon'

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Gmail API.
  authorize(JSON.parse(content), listRelevantMail);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

const getStatus = (str) => {
  if (str.includes('complete')) {
    return 'end'
  } else {
    return 'start'
  }
}


async function listRelevantMail(auth) {
  const START_OF_MONTH = DateTime.local().startOf('month').toFormat('yyyy/LL/dd')
  const END_OF_MONTH = DateTime.local().endOf('month').toFormat('yyyy/LL/dd')
  const DATE_RANGE = `after:${START_OF_MONTH} before:${END_OF_MONTH}`
  const PROVIDER = 'Starlink_Services@notifications.subaru.com'
  const STARLINK_QUERY = `from:${PROVIDER} ${DATE_RANGE}`

  const gmail = google.gmail({version: 'v1', auth});
  const res = await gmail.users.messages.list({
    format: 'json',
    userId: 'me',
    q: STARLINK_QUERY,
  });

  const messageObjects = await Promise.all(res.data.messages.map(async ({id}) => {
    const { data } = await gmail.users.messages.get({
      userId: 'me',
      id,
    })

    const status = getStatus(data.snippet)
    const internal = Number(data.internalDate)
    const date = DateTime.fromMillis(internal).toFormat('LL/dd')
    const time = DateTime.fromMillis(internal).toLocaleString(DateTime.TIME_24_SIMPLE)

    return {
      internal,
      date,
      time, 
      status,
    }
  }))

  const all = []
  let temp_block = []
  messageObjects.sort(function(a, b) {
    return a.internal - b.internal
  }).forEach((msg) => {
    if (temp_block.length === 0) {
      temp_block.push(msg.status)
      temp_block.push(msg.date)
    }
    temp_block.push(`${msg.time}`)
    if (msg.status === 'end') {
      all.push(temp_block)
      temp_block = []
    }
  })
  if (temp_block.length) {
    all.push(temp_block)
  }

  console.log(all);

  return all
}
