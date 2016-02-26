console.log('Loading function');

/*
 If any namespaces are listed, lambda will only process those alarms.
 */
var NAMESPACE_WHITELIST = []; // for NMD_IT this should be ["CALS-NMD"]

/*
 configuration for each condition.
 add any conditions here
 */
var ALARM_CONFIG = [
  {
    condition: "OK",
    mention: " ",
    color: "#2AB27B",
    severity: "ALARM"
  },
  {
    condition: "INFO",
    mention: " ",
    color: "#FF9F21",
    severity: "INFO"
  },
  {
    condition: "CRITICAL",
    mention: "<@channel> ",
    color: "#F35A00",
    severity: "CRITICAL"
  },
  {
    condition: "ALARM",
    mention: "<@channel> ",
    color: "#FF3300",
    severity: "ALARM"
  }
];

var SLACK_CONFIG = {
  path: "xxx",
};

var CHANNEL_CONFIG = {
  WARNINGS_CHANNEL: "#xxx",
  ALARMS_CHANNEL: "#xxx"
};

var WARNING_METRICS = [
  "SLQMissingPharmacy",
  "AVBDashboardMissingPharmacy"
];

var http = require('https');
var querystring = require('querystring');
exports.handler = function (event, context) {
  console.log(event.Records[0]);

  // parse information
  var subject = event.Records[0].Sns.Subject;
  var message = event.Records[0].Sns.Message;
  var timestamp = event.Records[0].Sns.Timestamp;
  var messageJSON = JSON.parse(message);
  var namespace = messageJSON.Trigger.Namespace;
  var metricName = messageJSON.Trigger.MetricName;

  // vars for final message
  var channel;
  var severity;
  var color;

  console.log("namespace from alarm: " + namespace);
  console.log("metricname from alarm: " + metricName);

  if (!forwardAlarmFor(namespace)) {
    console.log("Namespace: " + namespace + ", didn't match whitelist [" + NAMESPACE_WHITELIST + "]. " +
      "Will not forward message to Slack");
    context.succeed();
    return;
  }

  // create post message
  var alarmMessage = " *[Amazon CloudWatch Notification]* \n" +
    "Subject: " + subject + "\n" +
    "Message: " + message + "\n" +
    "Timestamp: " + timestamp;

  // check subject for condition
  for (var i = 0; i < ALARM_CONFIG.length; i++) {
    var config = ALARM_CONFIG[i];
    console.log(config);
    if (subject.match(config.condition)) {
      console.log("Matched condition: " + config.condition);

      alarmMessage = config.mention + " " + alarmMessage + " ";
      severity = config.severity;
      color = config.color;
      channel = getChannelName(metricName);
      break;
    }
  }

  if (!channel) {
    console.log("Could not find condition. (for: " + subject + ")");
    context.done('error', "Invalid condition");
  }

  var payloadStr = JSON.stringify({
    "attachments": [
      {
        "fallback": alarmMessage,
        "text": alarmMessage,
        "mrkdwn_in": ["text"],
        "username": "AWS-CloudWatch-Lambda-bot",
        "fields": [
          {
            "title": "Severity",
            "value": severity,
            "short": true
          }
        ],
        "color": color
      }
    ],
    "channel": channel
  });
  var postData = querystring.stringify({
    "payload": payloadStr
  });
  console.log(postData);
  var options = {
    hostname: "hooks.slack.com",
    port: 443,
    path: SLACK_CONFIG.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length
    }
  };

  var req = http.request(options, function (res) {
    console.log("Got response: " + res.statusCode);
    res.on("data", function (chunk) {
      console.log('BODY: ' + chunk);
      context.done(null, 'done!');
    });
  }).on('error', function (e) {
    context.done('error', e);
  });
  req.write(postData);
  req.end();
};

function forwardAlarmFor(nameSpace) {
  // Check namespace restriction
  var valid = true;
  if (NAMESPACE_WHITELIST.length > 0) {
    valid = false;
    for (var i = 0; i < NAMESPACE_WHITELIST.length; i++) {
      if (nameSpace.match(NAMESPACE_WHITELIST[i])) {
        valid = true;
        break;
      }
    }
  }
  console.log("Namespace, " + nameSpace + ", valid=" + valid);
  return valid;
};

/*
 Picks channel based on metricname
 */
var getChannelName = function (metricName) {
  var channelName;
  if ((new RegExp('\\b' + WARNING_METRICS.join('\\b|\\b') + '\\b') ).test(metricName)) {
    channelName = CHANNEL_CONFIG.WARNINGS_CHANNEL;
  }
  else {
    channelName = CHANNEL_CONFIG.ALARMS_CHANNEL;
  }
  console.log("Using channel " + channelName);
  return channelName;
};
