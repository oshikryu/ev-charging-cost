import fs from 'fs'
import readline from 'readline'
import { google } from 'googleapis'
import { DateTime } from 'luxon'

// Manually override orphan times with an end time
const ORPHAN_ENDTIME_OVERRIDES = [
  "October 4 2022 15:12"
]

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
  } else if (str.includes('started')) {
    return 'start'
  } else {
    return null
  }
}

const TIER_1_END_HOUR = 15
const TIER_2_END_HOUR = 16
const TIER_3_END_HOUR = 21
const TIER_4_END_HOUR = 24

const TIER_1 = 'tier_1'
const TIER_2 = 'tier_2'
const TIER_3 = 'tier_3'
const TIER_4 = 'tier_4'

const MAX_KWH = 8.8
const MAX_TIME_HOURS = 5
const MAX_TIME_MINUTES = 300
const MAX_TIME_SECONDS = 18000

const OFF_PEAK_PRICE = 0.25
const PARTIAL_PEAK_PRICE = 0.45
const PEAK_PRICE = 0.56

const MAX_PRICE = MAX_KWH * PEAK_PRICE // 4.928
const MIN_PRICE = MAX_KWH * OFF_PEAK_PRICE // 2.2

const tier_to_start_price = {
 [TIER_1]: TIER_1_END_HOUR,
 [TIER_2]: TIER_2_END_HOUR,
 [TIER_3]: TIER_3_END_HOUR,
 [TIER_4]: TIER_4_END_HOUR,
}

const tier_to_price = {
 [TIER_1]: OFF_PEAK_PRICE,
 [TIER_2]: PARTIAL_PEAK_PRICE,
 [TIER_3]: PEAK_PRICE,
 [TIER_4]: PARTIAL_PEAK_PRICE,
}

const calculateCost = (arr) => {
  const totalCost = arr.map((line, idx) => {
    const start_epoch = line[0]
    const end_epoch = line[1]
    // only grab completed charges
    if (line.length > 1) {
      const cost = splitIntoTiersCost(start_epoch, end_epoch)
      console.log(new Date(start_epoch), new Date(end_epoch), cost);
      return cost
    } else {
      return 0
    }
  }).reduce((prev, cur) => {
    return prev + cur
  }, 0)

  console.log(`Total cost: $${totalCost}`)
  return totalCost
}

const getTier = (epoch) => {
  const epochHour = DateTime.fromMillis(epoch).hour

  if (epochHour >=0 && epochHour < 15) {
    return TIER_1
  } else if (epochHour >= 15 && epochHour < 16) {
    return TIER_2
  } else if (epochHour >= 16 && epochHour < 21) {
    return TIER_3
  } else if (epochHour >= 21 && epochHour < 24) {
    TIER_4
  }
}

/*
 * Split start and end time into array of arrays for each tier
 *
 * @method splitIntoTiersCost
 * @return {Array} {fraction, tier price}
 */
const splitIntoTiersCost = (start_epoch, end_epoch) => {
  const startTier = getTier(start_epoch)
  const endTier = getTier(end_epoch)

  // same tier
  if (startTier === endTier) {
    const hours = (end_epoch - start_epoch) / 1000 / 60 / 60
    const fraction = hours / MAX_TIME_HOURS
    return fraction * MAX_KWH * tier_to_price[startTier];
  } else {
    const newHour = tier_to_start_price[startTier]
    const splitStartEpoch = DateTime.fromMillis(start_epoch).set({hour: newHour, minute: 0, seconds: 0}).minus({second: 1})
    const splitEndEpoch = DateTime.fromMillis(start_epoch).set({hour: newHour, minute: 0, seconds: 0})
    if (splitEndEpoch > end_epoch) {
      return splitIntoTiersCost(start_epoch, end_epoch)
    }

    return splitIntoTiersCost(start_epoch, splitStartEpoch.toMillis()) + splitIntoTiersCost(splitEndEpoch.toMillis(), end_epoch)
  }
}


async function listRelevantMail(auth) {
  const START_OF_MONTH = DateTime.local().startOf('month').toFormat('yyyy/LL/dd')
  const END_OF_MONTH = DateTime.local().endOf('month').plus({days: 1, hours: 8}).toFormat('yyyy/LL/dd')
  const DATE_RANGE = `after:${START_OF_MONTH} before:${END_OF_MONTH}`
  const PROVIDER = 'Starlink_Services@notifications.subaru.com'
  const STARLINK_QUERY = `from:${PROVIDER} ${DATE_RANGE}`

  const gmail = google.gmail({version: 'v1', auth});
  const res = await gmail.users.messages.list({
    format: 'json',
    userId: 'me',
    q: STARLINK_QUERY,
  });

  const unfilteredMessageObjects = await Promise.all(res.data.messages.map(async ({id}) => {
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

  const messageObjects = unfilteredMessageObjects.filter((msg) => {
    return ['end', 'start'].includes(msg.status);
  })

  let displayArray = 'date\tstart\tend\n'
  const calculateArray = []
  const orphanTimes = []
  let tempBlock = ''
  let calculateBlock = []

  messageObjects.sort(function(a, b) {
    return a.internal - b.internal
  }).forEach((msg, idx) => {
    if (tempBlock.length === 0) {
      tempBlock = tempBlock.concat(`${msg.date} \t`)
    }

    // prevent weird utc holdover of previous month
    const curMonth = new Date().getMonth();
    const emailMonth = new Date(msg.internal).getMonth();

    if (curMonth !== emailMonth) {
      return;
    }

    if (msg.status !== 'end') {
      if (calculateBlock.length === 1) {
        displayArray = displayArray.concat(`${tempBlock}\n`)
        // remove orphan start and start over
        const orphan = calculateBlock.pop();
        orphanTimes.push(orphan)
      }

      tempBlock = ''
      tempBlock = tempBlock.concat(`${msg.date} \t`)
    }

    tempBlock = tempBlock.concat(`${msg.time} \t`)

    calculateBlock.push(msg.internal)

    if (msg.status === 'end') {
      displayArray = displayArray.concat(`${tempBlock}\n`)
      tempBlock = ''

      // prevent orphan end time emails
      if (calculateBlock[0] && calculateBlock[1]) {
        calculateArray.push([calculateBlock[0], calculateBlock[1]])
      }
      calculateBlock = []
    }
  })

  // leftover
  if (tempBlock.length) {
    displayArray = displayArray.concat(`${tempBlock}\n`)
  }

  // TODO: unlikely to unplug over a period of two dates
  // add in orphan time overrides
  ORPHAN_ENDTIME_OVERRIDES.forEach((orphanEndTime, idx) => {
    const endMillis = new Date(orphanEndTime).getTime()
    calculateArray.push([orphanTimes[idx], endMillis])
  })

  console.log(displayArray);

  return calculateCost(calculateArray)
}
