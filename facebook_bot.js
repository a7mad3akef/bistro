if (!process.env.page_token) {
    console.log('Error: Specify page_token in environment');
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify verify_token in environment');
    process.exit(1);
}

if (!process.env.app_secret) {
     console.log('Error: Specify app_secret in environment');
     process.exit(1);
 }

/*********BOTKIT NATIVE********/
var Botkit = require('./lib/Botkit.js');
var os = require('os');
var commandLineArgs = require('command-line-args');
var localtunnel = require('localtunnel');
var request = require('request'); // hanlde http get / post requests
var fs = require('fs'); // write/read file on server

/*******EXPORT MODULES*******/
var responseCheck = require(__dirname + '/responseCheck'); // Regex number plate validity
var responseStore = require(__dirname + '/responseStore'); // Storage function
var backToPrevious = require(__dirname + '/backToPrevious'); // Send user back to last thread
var readImage = require(__dirname + '/readImage'); // Read id card image with Cloud Vision
var handleLocation = require(__dirname + '/handleLocation'); // Pass location to Google Image Api and do stuffs

/*******NODE MODULES********/
//mongo storage
var mongoStorage = require('botkit-storage-mongo')({mongoUri: process.env.MONGODB_URI});
// Passport for Login identification
var passport = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;
// Google's image content detection REST API
var vision = require('@google-cloud/vision');
var visionClient = vision({
  projectId: 'Chatbot impact',
  keyFilename: './GoogleServiceAccountKeys.json'
});
// REST API to improve id documents image before sending over to Cloud Vision for data extraction
var cloudinary = require('cloudinary');

/*********WORDHOP********/
// Takeover conversation (pause the bot and allow interaction with the user through Slack)
var Wordhop = require('wordhop');
// var wordhop = Wordhop(process.env.wordhop_api_key, process.env.wordhop_client_key, {platform: 'messenger', token:process.env.page_token});

/**********bCRM*********/
// Basic analytics and broadcast defined messages to users
require('botkit-middleware-bcrm')({
    bcrm_token: process.env.bcrm_token,
    bcrm_bot: process.env.bcrm_bot,
    controller: controller    
});

/*********openALPR********/
// License plate image recognition
var FormData = require('form-data'); // multi-part/form data for ALPR api request

//import toDb from './exportDefaultDb';

const ops = commandLineArgs([
      {name: 'lt', alias: 'l', args: 1, description: 'Use localtunnel.me to make your bot available on the web.',
      type: Boolean, defaultValue: false},
      {name: 'ltsubdomain', alias: 's', args: 1,
      description: 'Custom subdomain for the localtunnel.me URL. This option can only be used together with --lt.',
      type: String, defaultValue: null},
   ]);

if(ops.lt === false && ops.ltsubdomain !== null) {
    console.log("error: --ltsubdomain can only be used together with --lt.");
    process.exit();
}

var controller = Botkit.facebookbot({
    debug: true,
    log: true, // related to thread setting
    access_token: process.env.page_token, // provided by Facebook
    verify_token: process.env.verify_token, // provided by Facebook
    app_secret: process.env.app_secret, // provided by Facebook
    validate_requests: false, // Refuse any requests that doesn't come from FB on the receive webhook, must provide FB_APP_SECRET in environment variables
    receive_via_postback: true, // get the postback from button templates
    require_delivery: false, // queue messages so they are delivered in the right order
    storage: mongoStorage,
});

var bot = controller.spawn({
});


var myCategory, myNumberPlate, myLocation, myName;
var address, landmark1, landmark2;
var senderId, publicProfile;
var title1; // Avoid error
var publicProfile = {
        ['first_name'] : 'bong' // default value to avoid error
      };
var menuOptions = ['back_menu', 'restart_menu', 'info_menu', 'talk_to_staff_menu', 'my_loan_menu', 'hi','hello', 'Hi', 'Hello', 'prout', 'Prout', 'start', 'Start', 'hey', 'Hey'];

controller.setupWebserver(process.env.PORT || 3000, function(err, webserver) {
    controller.createWebhookEndpoints(webserver, bot, function() {
        console.log('ONLINE!');
        if(ops.lt) {
            var tunnel = localtunnel(process.env.PORT || 3000, {subdomain: ops.ltsubdomain}, function(err, tunnel) {
                if (err) {
                    console.log(err);
                    process.exit();
                }
                console.log("Your bot is available on the web at the following URL: " + tunnel.url + '/facebook/receive');
            });

            tunnel.on('close', function() {
                console.log("Your bot is no longer available on the web at the localtunnnel.me URL.");
                process.exit();
            });
        }
    });
});


/////////// THREAD SETTING ////////////

// Whitelisting necessary to use Messenger Extension (webview)
controller.api.messenger_profile.domain_whitelist(process.env.app_host + '/auth/fb/callback');
controller.api.messenger_profile.domain_whitelist(process.env.app_host + '/schedule');
controller.api.messenger_profile.get_domain_whitelist(function (err, data)  { console.log('****** Whitelisted domains :', data); });
controller.api.messenger_profile.greeting('Hello {{user_first_name}}! Please meet our Messenger chatbot! Tap "Get Started" button below to check your eligibility for a loan!');
controller.api.messenger_profile.get_started('hi');
// Any change in the Menu items payload shall be reflected in var menuOptions
controller.api.thread_settings.delete_menu();
/*controller.api.messenger_profile.menu([
     {
         type:"postback",
         title:"◀️  Back to previous question",
         payload:menuOptions[0]
     },
     {
         type:"postback",
         title:"⚠️  Back to start",
         payload:menuOptions[1]
     },
     {
         type:"postback",
         title:"📝  Loan Conditions",
         payload:menuOptions[2]
     },
     {
       type:"postback",
       title:"👩🏽  Talk to a Staff",
       payload:menuOptions[3]
     },
     {
       type:"postback",
       title:"💵  My Loan",
       payload:menuOptions[4]
     },
 ]);*/

controller.api.messenger_profile.menu([
  {
      "locale":"default",
      "composer_input_disabled":false,
      "call_to_actions":[
        {
          "title":"More",
          "type":"nested",
          "call_to_actions":[
            {
              "title":"📝  Loan Conditions",
              "type":"postback",
              "payload":menuOptions[2]
            },
            {
              "title":"💵  My Loan",
              "type":"postback",
              "payload":menuOptions[4]
            },
            {
              "title":"⚠️  Back to start",
              "type":"postback",
              "payload":menuOptions[1]
            }
          ]
        },
        {
          "type":"postback",
          "title":"👩🏽  Talk to a Staff",
          "payload":menuOptions[3]
        },
        {
          "type":"postback",
          "title":"◀️  Back to previous question",
          "payload":menuOptions[0]
        }
      ]
    },
  ]
);




/////////// /PERSISTENT MENU ////////////

// Back to previous thread
controller.hears(menuOptions[0], 'facebook_postback', function(bot, message) {
	// get last thread and fire it
  controller.storage.users.get(message.user, function(err, user) {
		lastThread = user.last_thread;
		switch(lastThread) {
      case 'gitIntro': bot.startConversation(message, gifIntro); break;
      case 'testCategories': bot.startConversation(message, testCategories); break;
      case 'introApply': bot.startConversation(message, introApply); break;
      case 'applyStart': bot.startConversation(message, applyStart); break;
      case 'numberPlate_F': bot.startConversation(message, numberPlate_F); break;
      case 'whereAreYou':landmark1 = ''; landmark2 = ''; sangkat = ''; delete address; delete addressComponents; delete landmark1; delete landmark2; delete sangkat; bot.startConversation(message, whereAreYou); break;
      case 'shareGuarantor': bot.startConversation(message, shareGuarantor); break;
      case 'identity_F': bot.startConversation(message, identity_F); break;
      default: bot.startConversation(message, welcome);
    }
	});
});

// Caution: response.user will be lost when using the menu
controller.hears(menuOptions[2], 'facebook_postback', function(bot, message) {
  bot.startConversation(message, productDescription);
});

// My Loan Schedule
controller.hears(menuOptions[4], 'facebook_postback', function(bot, message) {
  // assign user id to var senderId, needed for the Facebook login process
  controller.storage.users.get(message.user, function(err, user) {
    senderId = user.id;
    console.log('this is user id ' + senderId);
    bot.startConversation(message, facebookLogin);
  });
});

// Pause conversation to talk to a human
controller.hears(menuOptions[3], 'facebook_postback', function(bot, message) {
  console.log('MESSAGE IS ' + message);
  wordhop.assistanceRequested(message);
  bot.startConversation(message, assistanceRequest);
});


// Back to start
controller.hears([menuOptions[1], 'Restart'], 'facebook_postback', function(bot, message) {
  bot.startConversation(message, restart);
});


// handler for start
controller.hears(['hi','hello', 'Hi', 'Hello', 'prout', 'Prout', 'start', 'Start', 'hey', 'Hey'], 'message_received,facebook_postback', function(bot, message)  {
    // Get time in the day and greet the user consequently
    bot.startConversation(message, gifIntro);
});

//////////// MIDDLEWARES ////////////

// WORDHOP
// Add the Wordhop middleware 
// controller.middleware.receive.use(wordhop.receive);
// reply to a direct message
// controller.middleware.send.use(wordhop.send);

// // Handle forwarding the messages sent by a human through your bot 
// wordhop.on('chat response', function (message) {
//     bot.say(message);  // <= example of bot sending message 
// });

// wordhop.on('channel update', function (msg) {  
//     var channel = msg.channel;
//     var paused = msg.paused;
//     if(msg.paused === false) {
//       bot.replyWithTyping(msg.priorMessage, '🤖🤖🤖');
//       controller.storage.users.get(msg.channel, function(err, user) {
//         lastThread = user.last_thread;
//         switch(lastThread) {
//           case 'gitIntro': bot.startConversation(msg.priorMessage, gifIntro); break;
//           case 'testCategories': bot.startConversation(msg.priorMessage, testCategories); break;
//           case 'introApply': bot.startConversation(msg.priorMessage, introApply); break;
//           case 'applyStart': bot.startConversation(msg.priorMessage, applyStart); break;
//           case 'numberPlate_F': bot.startConversation(msg.priorMessage, numberPlate_F); break;
//           case 'whereAreYou':landmark1 = ''; landmark2 = ''; sangkat = ''; address = ''; addressComponents = ''; delete address; delete addressComponents; delete landmark1; delete landmark2; delete sangkat; bot.startConversation(msg.priorMessage, whereAreYou); break;
//           case 'shareGuarantor': bot.startConversation(msg.priorMessage, shareGuarantor); break;
//           case 'identity_F' : bot.startConversation(msg.priorMessage, identity_F); break;
//           default: bot.startConversation(msg.priorMessage, welcome);
//       }
//     });
//     }
// });

// // PASSPORT AUTHENTIFICATION
// passport.use(new FacebookStrategy({
//     clientID: process.env.app_id,
//     clientSecret: process.env.app_secret,
//     callbackURL: process.env.app_host + '/auth/fb/callback',
//     profileFields: ['id', 'displayName', 'photos', 'email'],
//     passReqToCallback : true,
//     state: true,
//     enableProof: false
//   },
//   function(req, accessToken, refreshToken, profile, done) {
//     profile._json.access_token = accessToken;
//     profile._json.refresh_token = refreshToken;
//     console.log("accessToken:", accessToken);
//     console.log("refreshToken:", refreshToken);
//     console.log('JS obj' + profile);
//     console.log('JSON obj ' + JSON.stringify(profile, null, 2));
//     var save = {
//       ['facebook_profile'] : profile
//     };
//     responseStore.toDatabase(save, publicProfile);
//     done(null,profile);
// }));

// passport.serializeUser(function(user, done) {
//   done(null, user.id);
// });

// passport.deserializeUser(function(obj, done) {
//   done(null, obj);
// });

////////// BOT INTERACTION STARTS HERE //////////


// Start conversation from dedicated button in Facebook
controller.on('facebook_optin', function(bot, message) {
    bot.replyWithTyping(message, '🙏🏻');
    bot.startConversation(message, gifIntro);
});

// (1) Handler for any message. This block must be after controller.hear to prevent it from firing if a .hear handler exists
// (2) Handler for user send picture
controller.on('message_received', function(bot, message) {
  //Check if conversation is paused, stop bot from replying if paused
  if (message.paused) { return; }
  // log an unknown intent with Wordhop (notification received in Slack if no handler for what user says)
  // notification is sent to Slack even before user confirms he needs to talk to a human
  if(!message.attachments) {
    wordhop.logUnkownIntent(message);
    bot.replyWithTyping(message, '🤔');
    bot.startConversation(message, unknownIntent);
  }
  else if(message.attachments) {
    if(message.attachments[0].type == 'image') {
      console.log('CONTROLLER RECEIVED AN IMAGE WITH URL ' + message.attachments[0].payload.url);
      var receivedImageUrl = message.attachments[0].payload.url;
      // returns a js object
      /*visionClient.detectFaces(receivedImageUrl, function(err, faces) {
        if(err) throw err;
        //outcome = JSON.stringify(faces, ['joy', 'sorrow', 'underExposed', 'blurred', 'anger'], 2);
        if(faces[0].joy === false) {
          bot.replyWithTyping(message, 'Hey I\'ll only accept your picture if you give me a big smile :D send me another pics!');
        }
        if(faces[0].underExposed === true) {
          bot.replyWithTyping(message, 'Hey this pics is too dark! please send me a brighter pics!');
        }
        if(faces[0].underExposed === false && faces[0].joy === true) {
          bot.replyWithTyping(message, 'Cool pics! Let\'s try something else now, please select from the menu');
        }
      });*/
      visionClient.detect(receivedImageUrl, ['faces','label'], function (err, detections, apiResponse) {
        if (err) {
          bot.replyWithTyping(message, 'Oops 🤔 can you try again please?');
          console.log(err);
        }
        console.log('CLOUD VISION RESULTS: ' + JSON.stringify(apiResponse, null, 2));
        var save = {
          ['image'] : message.attachments[0].payload
        };
        responseStore.toDatabase(save, message);
        var label1 = '', label2 = '', label3 = '', label4 = '', label5 = '';
        var c2 = '', c3 = '', c4 = '', c5 = '';
        var seeWhat = 'I can check your plate number, supporting documents, or if your personal pics is suitable for presentation to lenders';
        var seeMoto = ['motorcycle', 'motorcycling', 'vehicle', 'car', 'scooter', 'moped', 'vehicle registration plate', 'automotive exterior', 'blue', 'street sign', 'number plate', 'land vehicle'];
        var seeDocument = ['text', 'document', 'invoice', 'bill', 'id card', 'label', 'gadget'];
        if(apiResponse.responses[1].labelAnnotations[0]) { label1 = apiResponse.responses[1].labelAnnotations[0].description;}
        if(apiResponse.responses[1].labelAnnotations[1]) { c2 = ', '; label2 = apiResponse.responses[1].labelAnnotations[1].description;}
        if(apiResponse.responses[1].labelAnnotations[2]) { c3 = ', '; label3 = apiResponse.responses[1].labelAnnotations[2].description;}
        if(apiResponse.responses[1].labelAnnotations[3]) { c4 = ', '; label4 = apiResponse.responses[1].labelAnnotations[3].description;}
        if(apiResponse.responses[1].labelAnnotations[4]) { c5 = ', and '; label5 = apiResponse.responses[1].labelAnnotations[4].description;}
        if(seeDocument.indexOf(label1) > -1 || seeDocument.indexOf(label2) > -1 || seeDocument.indexOf(label3) > -1 || seeDocument.indexOf(label4) > -1 || seeDocument.indexOf(label5) > -1) { 
          visionClient.detectText(receivedImageUrl , function(err, text) {
            if(err) console.log('ERROR with Cloud Vision detection: ' + err);
            var textResult = JSON.stringify(text, null, 2);
            var regexId = /\\[n][A-Z]*\s{1}[A-Z]*\\[n]/;
            console.log(textResult);
            // Check for "<<<" which are typical of id documents for Machine Readable Zone )MRZ)
            if(textResult.indexOf('<<<')) {
              // decreasing loop because the first result based on the MRZ is to the bottom of the card, i.e. to the end of the text. If not found, use second if statement
              for (var i = text.length; i > -1; i--) {
                // Check for "<<" as a pair, which appears in the Khmer id card MRZ between the name and the first name
                if (text[i] === '<<') {
                  console.log('in the loop');
                  firstNameId = text[i+1];
                  lastNameId = text[i-1];
                  birthDateId = text[i-6];
                  birthDate = {
                    day: birthDateId.substring(4, 6),
                    month : birthDateId.substring(2, 4),
                    year :  birthDateId.substring(0, 2)
                  };
                  bot.replyWithTyping(message, 'First Name: ' + firstNameId + ', Last Name: ' + lastNameId + ', Birth Date: ' + birthDate.day + '/' + birthDate.month + '/' + birthDate.year);
                  break;
                }
                // Check for the name in the corpus of the id card. i < 4 is a safe arbitrary value
                if (i < 4 && regexId.test(textResult)) {
                  var nameMatch = textResult.match(regexId);
                  var regexName = nameMatch[0].match(/[A-Z]{2,16}/g);
                  lastNameId = regexName[0];
                  firstNameId = regexName[1];
                  bot.replyWithTyping(message, 'First Name: ' + firstNameId + ', Last Name: ' + lastNameId);
                  break;
                }
              }
            }
          });
          seeWhat = '🔎 Soon I\'ll be able to read EDC bills as well! 🔍';
        }
        // Nest face detection to avoid triggering when reading an id card
        else {
          if (apiResponse.responses[0].faceAnnotations) {
            pictureFaces = apiResponse.responses[0].faceAnnotations[0];
            console.log('faces detected!');
            if(pictureFaces.joyLikelihood === "UNLIKELY" || pictureFaces.joyLikelihood === "VERY_UNLIKELY") {
            bot.replyWithTyping(message, 'Hey I\'ll only accept your picture if you give me a big smile :D send me another pics!');
            }
            if(pictureFaces.underExposedLikelihood === 'LIKELY' || pictureFaces.underExposedLikelihood === 'VERY_LIKELY') {
              bot.replyWithTyping(message, 'Sorry but this pics is too dark! please send me a brighter pics!');
            }
            else if(pictureFaces.joyLikelihood === "LIKELY" || pictureFaces.joyLikelihood === "VERY_LIKELY") {
              bot.replyWithTyping(message, 'Beautiful smile! Let\'s try something else now, please select from the menu');
            }
          }
        }
        if(seeMoto.indexOf(label1) > -1 || seeMoto.indexOf(label2) > -1 || seeMoto.indexOf(label3) > -1 || seeMoto.indexOf(label4) > -1 || seeMoto.indexOf(label5) > -1) { 
          // First we need to write the file on the server so as to send it to OpenALPR Cloud API. Sending URL won't work as Facebook appends it with some access code
          var download = function(uri, filename, callback) {
            request.head(uri, function(err, res, body){
              console.log('content-type:', res.headers['content-type']);
              console.log('content-length:', res.headers['content-length']);
              request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
            });
          };
          download(receivedImageUrl, '/tmp/MYIMAGE.jpeg', function(body){
            console.log('Image written on disk');
            var formData = {
              secret_key: process.env.open_alpr_key,
              image: fs.createReadStream('/tmp/MYIMAGE.jpeg'),
              tasks:'plate',
              country:'us',
            };
            request.post({url:'https://api.openalpr.com/v1/recognize', formData: formData }, function(err, httpResponse, body) {
              // see http://doc.openalpr.com/api/cloudapi.html for status codes / error handling and ALPR app testing
              // see https://cloud.openalpr.com/ for dashboard, commercial conditions. 2000 request/month free
              if (err) {
                return console.error('upload failed:', err);
              }
              console.log(body);
              var result = JSON.parse(body);
              // Regex to check for a Cambodian plate number format. JSON secondary results are in the Candidates array
              var plateType1 = /^\d{1}[A-Z]{1}\d{4}$/;
              var plateType2 = /^\d{1}[A-Z]{2}\d{4}$/;
              if(result.plate.results.length > 0) {
                if(plateType1.test(result.plate.results[0].plate) || plateType2.test(result.plate.results[0].plate)) {
                  seePlate = result.plate.results[0].plate;
                  bot.replyWithTyping(message, 'The plate reads ' + result.plate.results[0].plate);
                }
                else {
                for (var i = 0; i < result.plate.results[0].candidates.length; i++) {
                  if (plateType1.test(result.plate.results[0].candidates[i].plate) || plateType2.test(result.plate.results[0].candidates[i].plate)) {
                    seePlate = result.plate.results[0].candidates[i].plate;
                    bot.replyWithTyping(message, 'The plate reads ' + result.plate.results[0].candidates[i].plate);
                    break;
                    }
                  }
                }
              }
            });
          });
        }
        bot.replyWithTyping(message, 'Your picture shows ' + label1 + c2 + label2 + c3 + label3 + c4 + label4 + c5 + label5);
        bot.replyWithTyping(message, seeWhat);
        bot.replyWithTyping(message, 'Tap the menu button (left of your input field) to go back to the previous thread. Or send me a picture of anything to check what I see 🔍');       
      });
    }
  }
});


// To process the images when sent during a convo
receivedImage = function (response, convo) {
  convo.say('Checking your image');
  convo.say('⚙️⚙️⚙️ ');
  console.log('RECEIVED AN IMAGE WITH URL ' + response.attachments[0].payload.url);
  var receivedImageUrl = response.attachments[0].payload.url;
  // returns a js object
  /*visionClient.detectFaces(receivedImageUrl, function(err, faces) {
    if(err) throw err;
    //outcome = JSON.stringify(faces, ['joy', 'sorrow', 'underExposed', 'blurred', 'anger'], 2);
    if(faces[0].joy === false) {
      bot.replyWithTyping(message, 'Hey I\'ll only accept your picture if you give me a big smile :D send me another pics!');
    }
    if(faces[0].underExposed === true) {
      bot.replyWithTyping(message, 'Hey this pics is too dark! please send me a brighter pics!');
    }
    if(faces[0].underExposed === false && faces[0].joy === true) {
      bot.replyWithTyping(message, 'Cool pics! Let\'s try something else now, please select from the menu');
    }
  });*/
  visionClient.detect(receivedImageUrl, ['faces','label'], function (err, detections, apiResponse) {
    if (err) {
      console.log('Error with Cloud Vision: ' + err);
      convo.say('Oops 🤔 can you try again please?');
      }
      console.log('CLOUD VISION RESULTS : ' + JSON.stringify(apiResponse, null, 2));
      var save = {
        ['image'] : response.attachments[0].payload
      };
      responseStore.toDatabase(save, response);
      var label1 = '', label2 = '', label3 = '', label4 = '', label5 = '';
      var c2 = '', c3 = '', c4 = '', c5 = '';
      var seeWhat = 'I can check your plate number, supporting documents, or if your personal pics is suitable for presentation to lenders';
      var seeMoto = ['motorcycle', 'motorcycling', 'vehicle', 'car', 'scooter', 'moped', 'vehicle registration plate', 'automotive exterior', 'blue', 'street sign', 'number plate', 'land vehicle'];
      var seeDocument = ['text', 'document', 'invoice', 'bill', 'id card', 'label', 'gadget'];
      if(apiResponse.responses[1].labelAnnotations[0]) { label1 = apiResponse.responses[1].labelAnnotations[0].description;}
      if(apiResponse.responses[1].labelAnnotations[1]) { c2 = ', '; label2 = apiResponse.responses[1].labelAnnotations[1].description;}
      if(apiResponse.responses[1].labelAnnotations[2]) { c3 = ', '; label3 = apiResponse.responses[1].labelAnnotations[2].description;}
      if(apiResponse.responses[1].labelAnnotations[3]) { c4 = ', '; label4 = apiResponse.responses[1].labelAnnotations[3].description;}
      if(apiResponse.responses[1].labelAnnotations[4]) { c5 = ', and '; label5 = apiResponse.responses[1].labelAnnotations[4].description;}
      if(seeDocument.indexOf(label1) > -1 || seeDocument.indexOf(label2) > -1 || seeDocument.indexOf(label3) > -1 || seeDocument.indexOf(label4) > -1 || seeDocument.indexOf(label5) > -1) { 
        visionClient.detectText(receivedImageUrl , function(err, text) {
          if(err) console.log('ERROR with Cloud Vision: ' + err);
          var textResult = JSON.stringify(text, null, 2);
          var regexId = /\\[n][A-Z]*\s{1}[A-Z]*\\[n]/;
          // Check for "<<<" which are typical of id documents for Machine Readable Zone )MRZ)
          if(textResult.indexOf('<<<')) {
            // decreasing loop because the first result based on the MRZ is to the bottom of the card, i.e. to the end of the text. If not found, use second if statement
            for (var i = text.length; i > -1; i--) {
              // Check for "<<" as a pair, which appears in the Khmer id card MRZ between the name and the first name
              if (text[i] === '<<') {
                firstNameId = text[i+1];
                lastNameId = text[i-1];
                birthDateId = text[i-6];
                birthDate = {
                  day: birthDateId.substring(4, 6),
                  month : birthDateId.substring(2, 4),
                  year :  birthDateId.substring(0, 2)
                };
                convo.say('First Name: ' + firstNameId + ', Last Name: ' + lastNameId + ', Birth Date: ' + birthDate.day + '/' + birthDate.month + '/' + birthDate.year);
                break;
              }
              // Check for the name in the corpus of the id card. i < 4 is a safe arbitrary value
              if (i < 4 && regexId.test(textResult)) {
                var nameMatch = textResult.match(regexId);
                var regexName = nameMatch[0].match(/[A-Z]{2,16}/g);
                lastNameId = regexName[0];
                firstNameId = regexName[1];
                convo.say('First Name: ' + firstNameId + ', Last Name: ' + lastNameId);
                break;
              }
            }
          }
        });
        seeWhat = '🔎 Soon I\'ll be able to read EDC bills as well! 🔍';
      }
      else {
        if (apiResponse.responses[0].faceAnnotations) {
          pictureFaces = apiResponse.responses[0].faceAnnotations[0];
          console.log('faces detected!');
          if(pictureFaces.joyLikelihood === "UNLIKELY" || pictureFaces.joyLikelihood === "VERY_UNLIKELY") {
          convo.say('Hey I\'ll only accept your picture if you give me a big smile :D send me another pics!');
          }
          if(pictureFaces.underExposedLikelihood === 'LIKELY' || pictureFaces.underExposedLikelihood === 'VERY_LIKELY') {
            convo.say('Sorry but this pics is too dark! please send me a brighter pics!');
          }
          else if(pictureFaces.joyLikelihood === "LIKELY" || pictureFaces.joyLikelihood === "VERY_LIKELY") {
            convo.say('Beautiful smile! Let\'s try something else now, please select from the menu');
          }
        }
      }
      if(seeMoto.indexOf(label1) > -1 || seeMoto.indexOf(label2) > -1 || seeMoto.indexOf(label3) > -1 || seeMoto.indexOf(label4) > -1 || seeMoto.indexOf(label5) > -1) { 
        // First we need to write the file on the server so as to send it to OpenALPR Cloud API. Sending URL won't work as Facebook appends it with some access code
        var download = function(uri, filename, callback) {
          request.head(uri, function(err, res, body){
            console.log('content-type:', res.headers['content-type']);
            console.log('content-length:', res.headers['content-length']);
            request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
          });
        };
        download(receivedImageUrl, '/tmp/MYIMAGE.jpeg', function(body){
          console.log('Wrote image on disk');
          var formData = {
            secret_key: process.env.open_alpr_key,
            image: fs.createReadStream('/tmp/MYIMAGE.jpeg'),
            tasks:'plate',
            country:'us',
          };
          request.post({url:'https://api.openalpr.com/v1/recognize', formData: formData }, function(err, httpResponse, body) {
            // see http://doc.openalpr.com/api/cloudapi.html for status codes / error handling and ALPR app testing
            // see https://cloud.openalpr.com/ for dashboard, commercial conditions. 2000 request/month free
            if (err) {
              return console.error('upload failed:', err);
            }
            console.log(body);
            var result = JSON.parse(body);
            // Regex to check for a Cambodian plate number format. JSON secondary results are in the Candidates array
            var plateType1 = /^\d{1}[A-Z]{1}\d{4}$/;
            var plateType2 = /^\d{1}[A-Z]{2}\d{4}$/;
            if(result.plate.results.length > 0) {
              if(plateType1.test(result.plate.results[0].plate) || plateType2.test(result.plate.results[0].plate)) {
                seePlate = result.plate.results[0].plate;
                convo.say('The plate reads ' + result.plate.results[0].plate);
              }
              else {
              for (var i = 0; i < result.plate.results[0].candidates.length; i++) {
                if (plateType1.test(result.plate.results[0].candidates[i].plate) || plateType2.test(result.plate.results[0].candidates[i].plate)) {
                  seePlate = result.plate.results[0].candidates[i].plate;
                  convo.say('The plate reads ' + result.plate.results[0].candidates[i].plate);
                  break;
                  }
                }
              }
            }
          });
        });
      }
      convo.say('Your picture shows ' + label1 + c2 + label2 + c3 + label3 + c4 + label4 + c5 + label5);
      convo.say(seeWhat); 
      convo.say('To continue, use the menu button (left of your input field) to go back to the previous thread. Or send me a picture of anything to check what I see!');   
  });
};


unknownIntent = function(err, convo) {
  convo.ask({
    text: 'I didn\'t get that, what do you want to do?',
    quick_replies: [
        {
            type: 'text',
            title: 'Repeat last question',
            payload: 'repeat_question',
        },
        {
            type: 'text',
            title: 'Talk to a human',
            payload: 'talk_to_human',
        },
    ]
  }, function(response, convo) {
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'repeat_question':
          console.log('I should repeat');
          backToPrevious.userThread(response, convo);
          break;
          case 'talk_to_human':
          console.log('I should  request assistance');
          assistanceRequest(response, convo);
          break;
          default:
          convo.repeat();
        }
      }
    }
    convo.next();
  });
};

restart = function(response, convo) {
    convo.say('😯');
    convo.ask({
      text: "Are you sure you want to restart your whole application?",
      quick_replies: [
          {
              type: 'text',
              title: 'Restart',
              payload: 'confirm_resta',
          },
          {
              type: 'text',
              title: 'Repeat last question',
              payload: 'repeat_question',
          },
          {
              type: 'text',
              title: 'Talk to a human',
              payload: 'talk_to_human',
          },
      ]
    }, function(response, convo) {
      if(menuOptions.indexOf(response.text) < 0) {
        if(!response.quick_reply) {convo.repeat();}
        else{
          switch(response.quick_reply.payload) {
          case 'confirm_resta':
          landmark1 = ''; landmark2 = ''; sangkat = ''; address = ''; addressComponents = '';
          delete landmark1; delete landmark2; delete sangkat; delete address; delete addressComponents;
          convo.say('Ok, restarting your application!');
          gifIntro(response, convo);
          break;
          case 'repeat_question':
          backToPrevious.userThread(response, convo);
          break;
          case 'talk_to_human':
          console.log('I should  request assistance');
          wordhop.assistanceRequested(response);
          assistanceRequest(response, convo);
          break;
          default:
          convo.repeat();
        }
      }
    }
    convo.next();
  });
};


accountLinking = function(response, convo) {
  convo.say('Come on try');
  convo.say({
      attachment: {
                'type': 'template',
                'payload': {
                  'template_type': 'button',
                  'text': 'Welcome. Link your account.',
                  'buttons':[{
                    'type': 'account_link',
                    'url': 'www.maripoza.org/redirect/'
                  }]
                }
              }
        });
  convo.say('it worked?');
};


 


paymentDateReminder = function(err, convo) {
  convo.ask({
    text: 'Do you want me to send you a monthly reminder ⏰ for your payment date?',
    quick_replies: [
        {
            type: 'text',
            title: 'Yes',
            payload: 'subs_reminder',
        },
        {
            type: 'text',
            title: 'No',
            payload: 'unsubs_reminder',
        }
    ]
  }, function(response, convo) {
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'subs_reminder':
          title1 = 'Address Control'; payload1 = 'addressControl';
          title2 = 'Contact Guarantor'; payload2 = 'ContactGuarantor';
          title3 = 'Number Plate Control'; payload3 = 'numberPlateControl';
          title4 = 'Id Control'; payload4 = 'id_control';
          convo.say('Ok, you will receive a reminder 2 days before each due date!');
          convo.say('📆');
          testCategories(response,convo);
          break;
          case 'unsubs_reminder':
          title1 = 'Address Control'; payload1 = 'addressControl';
          title2 = 'Contact Guarantor'; payload2 = 'ContactGuarantor';
          title3 = 'Number Plate Control'; payload3 = 'numberPlateControl';
          title4 =  'Id Control'; payload4 = 'id_control';
          convo.say('Ok, I won\'t send you any reminder');
          testCategories(response, convo);
          break;
          default:
          convo.say('🤔');
          unknownIntent(response, convo);
        }
      }
    }
    convo.next();
  });
};


talkToStaff = function(response, convo) {
    convo.say({
      attachment: {
          type: 'template',
          payload: {
            template_type: 'button',
            text: 'Pausing',
            buttons: [
              {
                type: 'web_url',
                title: 'Log in with Facebook',
                url: 'https://pacific-river.herokuapp.com/pause',
                webview_height_ratio: 'tall',
                messenger_extensions: true,
              }
            ]
          }
      }
    });
};

successAuth = function(response, convo) {
  convo.say('success');
};

assistanceRequest = function(response, convo) {
    convo.say('bot paused, please wait');
    convo.say('⌛');
    convo.ask({
      text: "A human will get in touch very soon!",
      with_typing: true,
      quick_replies: [
          {
              type: 'text',
              title: 'Cancel request',
              payload: 'cancel_request',
          },
      ]
    }, function(response, convo) {
      if(response !== null && response.quick_reply.payload == 'cancel_request') {
        convo.say('Ok, going back to the previous question');
        backToPrevious.userThread(response, convo);
      }
      convo.next();
    });
};


productDescription = function(response, convo) {
    convo.say('📋');
    convo.ask({
      text: "What would you like to know?",
      quick_replies: [
          {
              content_type: 'text',
              title: 'Price',
              payload: 'price',
          },
          {
              content_type: 'text',
              title: 'Eligibility',
              payload: 'eligibility',
          },
          {
              content_type: 'text',
              title: 'Other info',
              payload: 'other',
          }
      ]
    }, function(response, convo) {
        if(menuOptions.indexOf(response.quick_reply.payload) < 0) {
          if(!response.quick_reply) {convo.repeat();}
          else{
            switch(response.quick_reply.payload) {
            case 'price':
            productPrice(response, convo);
            break;
            case 'eligibility':
            productEligibility(response, convo);
            break;
            case 'other':
            productOther(response,convo);
            break;
            default:
            convo.repeat();
          }
        }
      }
      convo.next();
  });
};


productPrice = function(response, convo) {
    convo.say('You can take a loan for a 6 months duration, and up to 24 months');
    convo.say('Interest rate is 1.2% per month maximum');
    convo.say('For a 1,000 USD loan, it means you\'d pay 12 USD interest maximum every month');
    convo.say({text: 'We also charge a 30 USD fee at loan origination', with_typing: true});
    convo.say({text: 'Totally, a 1,000 USD loan over 12 months will cost you 174 USD maximum', with_typing: true});
    convo.say({text:'Depending on how well you document your application and if you\'re not late paying your installment, you can get up to 70 USD discount on the interest 💵💵💵', with_typing: true});
    convo.ask({
      text: "What else do you want to know about?",
      with_typing: true,
      quick_replies: [
          {
              type: 'text',
              title: 'Eligibility',
              payload: 'eligibility',
          },
          {
              type: 'text',
              title: 'Other info',
              payload: 'other',
          },
          {
              type: 'text',
              title: 'Resume application',
              payload: 'resume',
          }
      ]
    }, function(response, convo) {
      if(menuOptions.indexOf(response.text) < 0) {
        if(!response.quick_reply) {convo.repeat();}
        else{
          switch(response.quick_reply.payload) {
            case 'eligibility':
            convo.say('You can be 90% sure of you eligibility just by completing your application via Messenger!');
            productEligibility(response, convo);
            break;
            case 'other':
            productOther(response, convo);
            break;
            case 'resume':
            convo.say('Ok, going back to the previous question');
            backToPrevious.userThread(response, convo);
            break;
            default:
            convo.repeat();
          }
        }
      }
      convo.next();
  });
};


productEligibility = function(response, convo) {
  convo.ask({
    text: "What is your concern?",
    quick_replies: [
        {
            type: 'text',
            title: 'Repayment capacity',
            payload: 'repayment_capacity',
        },
        {
            type: 'text',
            title: 'Collateral',
            payload: 'collateral',
        },
        {
            type: 'text',
            title: 'Supporting documents',
            payload: 'supporting_documents',
        }
    ]
  }, function(response, convo) {
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'repayment_capacity':
          repaymentEligibility(response, convo);
          break;
          case 'collateral':
          collateralEligibility(response, convo);
          break;
          case 'supporting_documents':
          documentsEligibility(response, convo);
          break;
          default:
          convo.repeat();
        }
      }
    }
    convo.next();
  });
};


repaymentEligibility = function(response, convo) {
  convo.say('You\'ll need to have a revenue and capacity to pay monthly installment');
  convo.say('We request 1 guarantor, that you can choose among your Facebook friend or among your family');
  convo.say({text: 'You must not have more than 1 other loan with a bank or microfinance', with_typing: true});
  convo.ask({
    text: "How can I help more?",
    with_typing: true,
    quick_replies: [
        {
            type: 'text',
            title: 'Collateral',
            payload: 'collateral',
        },
        {
            type: 'text',
            title: 'Supporting documents',
            payload: 'supporting_documents',
        },
        {
            type: 'text',
            title: 'Resume application',
            payload: 'resume',
        }
    ]
  }, function(response, convo) {
      if(menuOptions.indexOf(response.text) < 0) {
        if(!response.quick_reply) {convo.repeat();}
        else{
          switch(response.quick_reply.payload) {
            case 'collateral':
            collateralEligibility(response, convo);
            break;
            case 'supporting_documents':
            documentsEligibility(response, convo);
            break;
            case 'resume':
            convo.say('Ok, going back to the previous question');
            backToPrevious.userThread(response, convo);
            break;
            default:
            convo.repeat();
          }
        }
      }
      convo.next();
  });
};


collateralEligibility = function(response, convo) {
  convo.say('You need to have a motorcycle registered under your name, and which selling value tops your loan amount');
  convo.say('The value of the loan we provide cannot exceed your motorcycle value');
  convo.say({text: 'We will keep you motorcycle\'s registration card until your loan is paid off, but you keep your motorcycle :)', with_typing: true});
  convo.say({text: 'You\'ll be requested to sign a selling contract that we can use if ever you stop paying', with_typing: true});
  convo.ask({
    text: "Anything else you want to know?",
    with_typing: true,
    quick_replies: [
        {
            type: 'text',
            title: 'Repayment capacity',
            payload: 'repayment_capacity',
        },
        {
            type: 'text',
            title: 'Supporting documents',
            payload: 'supporting_documents',
        },
        {
            type: 'text',
            title: 'Resume application',
            payload: 'resume',
        }
    ]
  }, function(response, convo) {
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
        else{
          switch(response.quick_reply.payload) {
            case 'repayment_capacity':
            repaymentEligibility(response, convo);
            break;
            case 'supporting_documents':
            documentsEligibility(response, convo);
            break;
            case 'resume':
            convo.say('Ok, going back to the previous question');
            backToPrevious.userThread(response, convo);
            break;
            default:
            convo.repeat();
          }
        }
      }
      convo.next();
  });
};


documentsEligibility = function(response, convo) {
  convo.say('Your home must be less than one hour drive from phom penh');
  convo.say('We will require documents to prove your id and address');
  convo.say('We might also send a credit officer at your place to interview you');
  convo.ask({
    text: "Do you need more information?",
    with_typing: true,
    quick_replies: [
        {
            type: 'text',
            title: 'Repayment capacity',
            payload: 'repayment_capacity',
        },
        {
            type: 'text',
            title: 'Collateral',
            payload: 'collateral',
        },
        {
            type: 'text',
            title: 'Resume application',
            payload: 'resume',
        }
    ]
  }, function(response, convo) {
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'repayment_capacity':
          repaymentEligibility(response, convo);
          break;
          case 'collateral':
          collateralEligibility(response, convo);
          break;
          case 'resume':
          convo.say('Ok, going back to the previous question');
          backToPrevious.userThread(response, convo);
          break;
          default:
          convo.repeat();
        }
      }
    }
    convo.next();
  });
};


productOther = function(response, convo) {
    convo.say('Once you complete your application with Messenger, we will call you within a week to meet you at our head office');
    convo.say('You will have to come to the office with your guarantor and bring all your documents');
    convo.ask({
      text: "What else do you want to know about?",
      with_typing: true,
      quick_replies: [
          {
              type: 'text',
              title: 'Price, term...',
              payload: 'price',
          },
          {
              type: 'text',
              title: 'Eligibility',
              payload: 'eligibility',
          },
          {
              type: 'text',
              title: 'Resume application',
              payload: 'resume',
          }
      ]
    }, function(response, convo) {
      if(menuOptions.indexOf(response.text) < 0) {
        if(!response.quick_reply) {convo.repeat();}
        else{
          switch(response.quick_reply.payload) {
            case 'price':
            productPrice(response, convo);
            break;
            case 'eligibility':
            convo.say('You can be 90% sure of you eligibility just by completing your application via Messenger!');
            productEligibility(response, convo);
            break;
            case 'resume':
            convo.say('Ok, going back to the previous question');
            backToPrevious.userThread(response, convo);
            break;
            default:
            convo.say('🤔');
            unknownIntent(response, convo);
          }
        }
      }
      convo.next();
  });
};


gifIntro = function(err, convo) {
    var date = new Date();
    var myTime = date.getHours() + 7;
    // bcrm setting
    if(myTime >= 24) {myGreet = 'Hey!';}
          else if (myTime < 4) {myGreet = 'It\'s late bong! But I never sleep';}
              else if (myTime < 12) {myGreet = 'Good morning bong!';}
                  else if (myTime < 18) {myGreet = 'Good day bong!';}
                      else if (myTime < 24) {myGreet = 'Good evening bong!';}
    convo.say({text: myGreet, with_typing: true});
    convo.say('🙏🏻');
    // video made with goanimate.com, gif made with Gif Brewery 3, optmized with ezgif.com, hosted with imgur.com
    // attachment_id instead of URL is a functionality provided by FB to improve attachment delivery time https://developers.facebook.com/docs/messenger-platform/send-api-reference/attachment-upload
    // gifURL = 'http://i.imgur.com/8IBswRp.gif';
    convo.ask({
      text: "Just tap this button to get to know me! 🙏🏻",
      quick_replies: [
          {
              type: 'text',
              title: 'Facebook login',
              payload: 'facebook_login',
          },
          {
              type: 'text',
              title: 'Who am I',
              payload: 'who_am_i',
          },
          {
              type: 'text',
              title: 'Loan Conditions',
              payload: 'loan_conditions',
          },
          ]
        }, function(response, convo) {
        senderId = response.user; // assign a global variable to the app scope id for further use (Facebook login)
        
        // Get user's public profile
        request({
            url: 'https://graph.facebook.com/v2.6/' + response.user + '?fields=first_name,last_name,profile_pic,timezone,gender&access_token=' + process.env.page_token,
            json: true // parse
        }, function (error, rsp, body) {
          if (!error && rsp.statusCode === 200) {
            publicProfile = {
              ['first_name'] : body.first_name,
              ['last_name'] : body.last_name,
              ['timezone'] : body.timezone,
              ['profile_pic'] : body.profile_pic,
              ['gender'] : body.gender,
              ['id']: body.id,
            };         
            var save = {
              ['facebook_info'] : publicProfile
            };
            responseStore.toDatabase(save, response);
            console.log(JSON.stringify(publicProfile, 2, null));
          }
        });
        if(menuOptions.indexOf(response.text) < 0) {
          if(!response.quick_reply) {convo.repeat();}
          else {
            convo.say('(Y)');
            switch(response.quick_reply.payload) {
              case 'facebook_login':
              facebookLogin(response,convo);
              break;
              case 'who_am_i':
              welcome(response,convo);
              break;
              case 'loan_conditions':
              productDescription(response,convo);
              break;
              default:
              convo.say('You can\' t type in free text, just stick to the buttons or click the menu button to the left of your text input field for more options');
              convo.repeat();
            }
          }
          lastThread = {['last_thread'] : 'gifIntro'};
          responseStore.toDatabase(lastThread, response);
          convo.next();
        }
      });
};


facebookLogin = function(response, convo) {
  if(publicProfile === undefined) {
    publicProfile = {
      ['user'] : senderId,
    };
  }
  convo.say('Here you can get your loan balance, payment history, due dates, etc.');
  convo.say('I need to log the customer first to retrieve his loan info');
  convo.say('** Note that I can\'t actually fetch the info as long as the bot is not public');
  // convo.say({
  //   attachment: {
  //     type: 'template',
  //     payload: {
  //       template_type: 'button',
  //       text: 'This also let me fetch updated info - such as the last places he was tagged in',
  //       with_typing: true,
  //       buttons: [
  //         {
  //           type: 'web_url',
  //           title: 'Log in with Facebook', 
  //           url: process.env.app_host + '/auth/fb/?senderId=' + senderId, // send senderId to Express server to send a message to user at auth completion
  //           // webview_height_ratio: 'full',
  //           // messenger_extensions: true,
  //         }
  //       ]
  //     }
  //   }
  // });
  convo.say({
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements: [
        {
          title: 'This also let me fetch updated info - such as the last places he was tagged in',
          image_url: 'https://www.wired.com/wp-content/uploads/2016/06/bank-chat-bot-kai-509045560-f-660x330.jpg',
          buttons: [
          {
            type: 'web_url',
            url: process.env.app_host + '/auth/fb/?senderId=' + senderId,
            title: 'Log in with Facebook',
            webview_height_ratio: 'full',
            // messenger_extensions: true
          }
          ]
        },
        
        ]
      }
    }
  });
};


welcome = function(response, convo) {
  convo.say('I\'m a robot!');
  convo.say('You may check these papers out to understand why I\'m an upcoming revolution in microfinance');
  convo.say({
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements: [
        {
          title: 'Bots are the new Apps',
          image_url: 'http://image.slidesharecdn.com/copyofchatbots-pdf-160616232758/95/messenger-platform-wars-chatbots-as-new-era-of-the-internet-21-638.jpg',
          buttons: [
          {
            type: 'web_url',
            url: 'https://medium.com/making-meya/11-reasons-why-bots-are-the-new-apps-9bb3856d60a7#.8cykkhyn2',
            title: 'Read'
          }
          ]
        },
        {
          title: 'A success story in financial services',
          image_url: 'https://www.wired.com/wp-content/uploads/2016/06/bank-chat-bot-kai-509045560-f-660x330.jpg',
          buttons: [
          {
            type: 'web_url',
            url: 'https://chatbotsmagazine.com/chatbot-emma-facilitates-10-000-000-in-loan-applications-in-3-months-4282b5df52fb',
            title: 'Read'
          }
          ]
        },
        {
          title: 'Tailored for the poor countries',
          image_url: 'https://cdn-images-1.medium.com/max/2000/1*n9iwINaD21_X8VKljDbKUA.png',
          buttons: [
          {
            type: 'web_url',
            url: 'https://medium.com/farmink/why-we-think-chatbots-for-farmers-in-kenya-isnt-as-stupid-as-it-sounds-f3a5d30087bc#.686ekmq1j',
            title: 'Read'
          }
          ]
        },
        ]
      }
    }
  });
  convo.ask({
    text: 'Call me a well-trained, ubiquitous, free credit officer',
    with_typing: true,
    quick_replies: [
          {
              type: 'text',
              title: 'Try features',
              payload: 'try_features',
          }
      ]
    }, function(response, convo) {
    //Request public profile info but having problem requesting age_range and others
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'try_features':
          // Set these to handle the answer options in testCategories 
          title1 = 'Address Control'; payload1 = 'addressControl';
          title2 = 'Contact Guarantor'; payload2 = 'ContactGuarantor';
          title3 = 'Number Plate Control'; payload3 = 'numberPlateControl';
          title4 = 'Id Control'; payload4 = 'id_control';
          testCategories(response,convo);
          break;
          default:
          convo.say('You can\' t type in free text, just stick to the buttons or click the menu button to the left of your text input field for more options');
          convo.repeat();
        }
      }
    }
    convo.next();
  });
};
  
testCategories = function(response, convo) {
    if(!title1) {
      title1 = 'Address Control'; payload1 = 'addressControl';
      title2 = 'Contact Guarantor'; payload2 = 'ContactGuarantor';
      title3 = 'Number Plate Control'; payload3 = 'numberPlateControl';
      title4 = 'Id Control'; payload4 = 'id_control';
    }
    convo.ask({
      text: "What would you like to try?",
      quick_replies: [
          {
              type: 'text',
              title: title1,
              payload: payload1,
          },
          {
              type: 'text',
              title: title2,
              payload: payload2,
          },
          {
              type: 'text',
              title: title3,
              payload: payload3,
          },
          {
              type: 'text',
              title: title4,
              payload: payload4,
          }
      ]
    }, function(response, convo) {
      lastThread = {['last_thread'] : 'testCategories'};
      responseStore.toDatabase(lastThread, response);
      if(menuOptions.indexOf(response.text) < 0) {
        if(!response.quick_reply) {convo.repeat();}
        else{
          switch(response.quick_reply.payload) {
            case 'addressControl':
            convo.say('Great, I like that part!');
            whereAreYou(response, convo);
            break;
            case 'ContactGuarantor':
            convo.say('awesome ' + publicProfile.first_name);
            shareGuarantor(response, convo);
            break;
            case 'numberPlateControl':
            convo.say('I need to get your asset references to determines the max loan amount and get some official info');
            numberPlate_F(response,convo);
            break;
            case 'checkMyData':
            applicantSummary(response,convo);
            break;
            case 'id_control':
            convo.say('Here I collect and recognize supporting documents and fetch data out of them');
            identity_F(response,convo);
            break;
            default:
            convo.repeat();
          }
      }
    }
    convo.next();
  });
};


//var parsed = json.parse(uName);
//convo.say('I am a robot!' + parsed[first_name]);
//};

whoIsBot = function(response, convo) {
   convo.say('I am a robot! 🤖');
   convo.say('I only exist inside Facebook');
   convo.say('You cannot really have a conversation with me, but I can tell you if you are eligible for a loan if you asnwer all my questions');
   convo.ask({
    'text': "Now what would you like to do?",
    'quick_replies': [
        {
            'type': 'text',
            'title': 'I want to apply ',
            'payload': 'introApply',
        },
        {
            'type': 'text',
            'title': 'I want to guarantee',
            'payload': 'guarantee',
        }
    ]
  }, function(response, convo) {
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'introApply':
          introApply(response, convo);
          break;
          case 'guarantee':
          guarantee(response,convo);
          break;
          default:
          convo.say('🤔');
          unknownIntent(response, convo);
        }
      }
    }
    convo.next();
  });
};

introApply = function(response, convo) { 
    convo.say('Alright, you knock at the right door then!');
    convo.say('Here you can get the cheapest loan in Cambodia 🇰🇭');
    convo.say('For 1,000 USD, we charge only 12 USD interest per month!');
    convo.ask({
      'text': "Now what can I do for you?",
      'quick_replies': [
          {
              'type': 'text',
              'title': 'Who are you?',
              'payload': 'whoIsBot',
          },
          {
              'type': 'text',
              'title': 'Let me apply',
              'payload': 'applyStart',
          },
          {
              'type': 'text',
              'title': 'I want more information',
              'payload': 'info',
          }
      ]
    }, function(response, convo) {
      if(menuOptions.indexOf(response.text) < 0) {
        if(!response.quick_reply) {convo.repeat();}
        else{
          switch(response.quick_reply.payload) {
            case 'whoIsBot':
            whoIsBot(response, convo);
            break;
            case 'applyStart':
            applyStart(response, convo);
            break;
            case 'info':
            info(response,convo);
            break;
            default:
        }
      }
    }
    lastThread = {['last_thread'] : 'introApply'};
    responseStore.toDatabase(lastThread, response);
    convo.next();
  });
};

applyStart = function(response, convo) { 
    //convo.say('Great, I will guide you through the process of applying for a loan');
    //convo.say('Note that you can leave this conversation at any time, and come back to it. I will remember all the information you have already provided :)');
    //convo.say('First, let me ask you a few question so that I can know how much maximum you can borrow');
    convo.ask({
      'text': 'Shall we start yo?',
      'quick_replies': [
          {
              'type': 'text',
              'title': 'Ok, let\'s start',
              'payload': 'numberPlate_F',
          },
          {
              'type': 'text',
              'title': 'I need more information',
              'payload': 'info',
          }
      ]
    }, function(response, convo) {
      if(menuOptions.indexOf(response.text) < 0) {
        if(!response.quick_reply) {convo.repeat();}
        else{
          switch(response.quick_reply.payload) {
          case 'numberPlate_F':
          numberPlate_F(response, convo);
          break;
          case 'info':
          theEnd(response,convo);
          break;
          default:
        }
      }
    }
    lastThread = {['last_thread'] : 'applyStart'};
    responseStore.toDatabase(lastThread, response);
    convo.next();
  },{key: 'Nature'});
};


numberPlate_F = function(response, convo) {
    convo.ask('Please send me a picture of your motorcycle\'s rear-end, or just text a random number plate', 
    function(response, convo) {
      lastThread = {['last_thread'] : 'numberPlate_F'};
      responseStore.toDatabase(lastThread, response);
      if(menuOptions.indexOf(response.text) < 0) {
        if (response.attachments && response.attachments[0].type == 'image') {
          convo.say('🎞🔍');
          var receivedImageUrl = response.attachments[0].payload.url;
          readImage.fetchNumberPlate(receivedImageUrl, function(err, res) {
            if(err) {
              convo.say(err);
              numberPlate_F(response, convo);
              convo.next();
            }
            else {
              numberPlate = res;
              convo.say('Got it ' + numberPlate);
              confirmMotorcycle(response, convo);
              convo.next();
            }
          });
          }
          else if (response.text) {
            if (responseCheck.plateFind(response.text)) {
            //regex function//
            numberPlate = responseCheck.plateFind(response.text);
            convo.say('Got it ' + numberPlate);
            confirmMotorcycle(response, convo);
            convo.next();
          }
          else {
            convo.say('Sorry, you did not enter a valid number plate!');
            numberPlate_F(response, convo);
            convo.next();
          }
        }
      }
      else {
        convo.next();
      }
    },{key: 'Plate Number'});
};


confirmMotorcycle = function(response, convo) {
  motoImageUrl = 'http://www.hondaph.com/assets/products_src/360_src/Wave-110-Alpha-Black-360-550-2.png';
  motoModel = 'Honda Wave 2012';
  convo.say('Here I connect to the Department of Transports\' number plates database to get the asset value and the owner\'s name');
  convo.say('⚙️⚙️⚙️');
  convo.say({
    attachment: {
      type: 'image',
      payload: {
        url: motoImageUrl
      }
    },
  });
  convo.ask({
    'text': 'Can you confirm your moto is a ' + motoModel + ' like this one?',
    'quick_replies': [
        {
            type: 'text',
            title: 'Yes',
            payload: 'motoTrue',
        },
        {
            type: 'text',
            title: 'Nope',
            payload: 'motoFalse',
        },
        {
            type: 'text',
            title: 'Not sure',
            payload: 'motoUnsure',
        }
    ]
  }, function(response, convo) {
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'motoTrue':
          var save = {
            ['number_plate'] : numberPlate,
            ['moto_model'] : 'Honda Wave 110cc 2012',
          };
          responseStore.toDatabase(save, response);
          title1 = 'Address Control'; payload1 = 'addressControl';
          title2 = 'Contact Guarantor'; payload2 = 'ContactGuarantor';
          title3 = 'Id Control'; payload3 = 'id_control';
          title4 = 'Check my data'; payload4 = 'checkMyData';
          convo.say('✅');
          convo.say('Ok, let\'s try something else');
          testCategories(response, convo);
          break;
          case 'motoFalse':
          numberPlate_F(response,convo);
          break;
          case 'motoUnsure':
          numberPlate_F(response, convo);
          break;
          default:
          convo.say('🤔');
          unknownIntent(response, convo);
        }
      }
    }
    convo.next();
  });
};


identity_F = function(response, convo) {
    convo.ask('Please send me a picture of your id card and hold tight while I check it',
    function(response, convo) {
      lastThread = {['last_thread'] : 'identity_F'};
      responseStore.toDatabase(lastThread, response);
      if(menuOptions.indexOf(response.text) < 0) {
        if (response.attachments && response.attachments[0].type == 'image') {
          receivedImageUrl = response.attachments[0].payload.url;
          console.log(receivedImageUrl);
          /*readImage.optimizeImage(receivedImageUrl, function(err, res) {
            visionImageUrl = res;
            convo.say({text:'Ok, please hold tight while i check your image', with_typing:true});
            convo.say('🎞🔍');
            confirmId(response, convo);
            convo.next();
          });*/
          readImage.fetchIdCard(receivedImageUrl, function(err, res) {
            if(err) {
              convo.say('🤔');
              convo.say(err);
              convo.say('Please try again');
              identity_F(response,convo);
              convo.next();
            }
            else {
              firstNameId = res[0];
              lastNameId = res[1];
              birthDate = res[2];
              getPics = response.message_id;
              getPics2 = response.attachment_id;
              console.log(response);
              console.log("the message id: " + getPics);
              console.log("the attachment id: " + getPics2);
              convo.say('🎞🔍');
              convo.say('First Name: ' + firstNameId + ', Last Name: ' + lastNameId + ', Birth Date: ' + birthDate.day + '/' + birthDate.month + '/' + birthDate.year);
              confirmId(response, convo);
              convo.next();
            }
          });
        }
        else if (response.text && menuOptions.indexOf(response.text) < 0) {
          console.log('No image received');
          convo.say('🤔');
          convo.say('Could you send a picture of your id card instead?');
          convo.say('Let\'s try again');
          identity_F(response,convo);
          convo.next();
        }
      }
      else {
        convo.next();
      }
    },{key: 'Id Card'});
};


confirmId = function(response, convo) {
  convo.ask({
    text: 'Can you confirm these information?',
    quick_replies: [
        {
            type: 'text',
            title: 'Yes',
            payload: 'idTrue',
        },
        {
            type: 'text',
            title: 'Nope',
            payload: 'idFalse',
        },
    ]
  },function(response, convo) {
    // delete the image from Cloudinary in order not to exceed storage quotas
    /*cloudinary.v2.uploader.destroy(optimizedImageId, function(error, result) {
      console.log(result); 
    });*/
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'idTrue':
          var save = {
            ['id_first_name'] : firstNameId,
            ['id_last_name'] : lastNameId,
            ['id_birthdate'] : birthDate,
          };
          responseStore.toDatabase(save, response);
          title1 = 'Address Control'; payload1 = 'addressControl';
          title2 = 'Contact Guarantor'; payload2 = 'ContactGuarantor';
          title3 = 'Number Plate Control'; payload3 = 'numberPlateControl';
          title4 = 'Check my data'; payload4 = 'checkMyData';
          convo.say('✅');
          convo.say('Ok, let\'s move on to something else');
          testCategories(response, convo);
          break;
          case 'idFalse':
          identity_F(response,convo);
          break;
          default:
          convo.say('🤔');
          unknownIntent(response, convo);
        }
      }
    }
    convo.next();
  });
};


name_F = function(response, convo) {
  var name = "X";
  convo.ask({
    'text': 'Can you confirm your name is General Chavez?',
    'quick_replies': [
        {
            'type': 'text',
            'title': 'Yep',
            'payload': 'Name',
        },
        {
            'type': 'text',
            'title': 'Nope',
            'payload': 'numberPlate_F',
        }
    ]
  }, function(response, convo) {
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'Name':
          //responseStore.toDatabase('Name', name, response);
          nextTopic(response, convo);
          break;
          case 'numberPlate_F':
          numberPlate_F(response,convo);
          break;
          default:
        }
      }
    }
    lastThread = {['last_thread'] : 'name_F'};
    responseStore.toDatabase(lastThread, response);
    convo.next();
    },{key: 'Name'});
};


whereAreYou = function(response, convo) {
  convo.say('It\'s often tricky and time consuming to understand someone\'s address in the Kingdom of Wonder');
  convo.say('But I have a trick for that');
  convo.ask({
    text: 'Please send your location 📍',
    quick_replies: [
    {
        "content_type":"location",
    }]
  }, function(response, convo) {
    lastThread = {['last_thread'] : 'whereAreYou'};
    responseStore.toDatabase(lastThread, response);
    if(menuOptions.indexOf(response.text) < 0) {
      if (response.attachments) {
        if (response.attachments[0].type === 'location') {
          coordinates = response.attachments[0].payload.coordinates;
          handleLocation.passToGoogleMapsApi(coordinates, function(err, res) {
            if(err) {
              convo.say(err);
              whereAreYou(response, convo);
              convo.next();
            }
            else if (res === false) {
              convo.say('sorry, your village is too far from our office, we don\'t serve this area yet 🙄');
              restart(response, convo);
              convo.next();
            }
            else {
              transitTime = res[0];
              radius = res[1];
              address = res[2];
              addressComponents = res[3];
              sangkat = res[4];
              confirmLandmark(response, convo);
              convo.next();
            }
          });
        }
        else {
          if(menuOptions.indexOf(response.text) < 0) {
          console.log('No location attachment');
          convo.say('🤔');
          unknownIntent(response, convo);
          convo.next();
        }
      }
    }
  }
  else { // if user taps menu option
      convo.next();
    }
  },{key: 'Location'});
};


confirmLandmark = function(response, convo) {
  convo.say('📌');
  convo.say('Got it');
  handleLocation.findNearbyPlaces(coordinates, radius, function(err, res) {
    if(err) {
      convo.say(err);
      whereAreYou(response,convo);
      convo.next();
    }
    else {
      var landmark1 = res[0];
      var landmark2 = res[1];
      var myQuestion = res[2]; // The question will mention nearby famous landmarks if any is found
      convo.say('Now trying to confirm the address with nearby market, temple, school, etc., defaulting to sangkat only');
      convo.ask({
        text: myQuestion,
        quick_replies: [
            {
                type: 'text',
                title: 'Yes',
                payload: 'landmarkTrue',
            },
            {
                type: 'text',
                title: 'Nope',
                payload: 'landmarkFalse',
            },
            {
                type: 'text',
                title: 'Not sure',
                payload: 'landmarkUnsure',
            }
        ]
      }, function(response, convo) {
        if(menuOptions.indexOf(response.text) < 0) {
          switch(response.quick_reply.payload) {
            case 'landmarkTrue':
            var save = {
              ['landmark_1'] : landmark1,
              ['landmark_2'] : landmark2,
              ['transit_time'] : transitTime,
              ['coordinates'] : coordinates
            };
            responseStore.toDatabase(save, response);
            streetView(response, convo);
            break;
            case 'landmarkFalse':
            // Delete landmarks and sangkat assigned on first try. Needed to avoid asynchronous issues when getting from new call to Google API
            landmark1 = ''; landmark2 = ''; sangkat = ''; address = ''; addressComponents = '';
            delete landmark1; delete landmark2; delete sangkat; delete address; delete addressComponents;
            convo.say('let\'s try again');
            whereAreYou(response,convo);
            break;
            case 'landmarkUnsure':
            var save = {
              ['coordinates'] : coordinates
            };
            responseStore.toDatabase(save, response);
            streetView(response, convo);
            break;
            default:
            convo.say('🤔');
            unknownIntent(response, convo);
            }
          }
          convo.next();
        },{key: 'Landmark'});
      }
  });
};


streetView = function(response, convo) {
  addressNoCountry = address.slice(0, -10); // Cut ", Cambodia" in the address
  // Here we call the API and get a nearby streetview image if there is none at the user's location
  convo.say('Ok');
  convo.say('🗺️')
  //convo.say('Please check this pictures');
  handleLocation.findStreetView(coordinates, function(err, res) {
    if(err) {
      convo.say(err);
      whereAreYou(response,convo);
      convo.next()
    }
    else if(res === false) {
      convo.say('Apparently your live around ' + addressNoCountry);
      convo.say('This is too far from our office, sorry!');
      restart(response, convo);
      convo.next();
    }
    else {
      distance = res[0];
      walk = res[1];
      streetViewUrl = res[2];
      streetViewUrl2 = res[3];
      streetViewCoordinates = res[4];
      convo.say('Please check these pics around ' + addressNoCountry + '!');
      convo.say({
        attachment: {
          type: 'image',
          payload: {
          url: streetViewUrl
          }
        }, 
      });
      convo.say({
        attachment: {
          type: 'image',
          payload: {
          url: streetViewUrl2
          }
        }, 
      });
      if (distance >= 25 && distance <= 1000) {
      // do not say that if the pano is at the doorstep or is ridiculously far because the API just goes by the mapped roads 
        convo.say({text: 'This should be ' + distance + ' meters from your home, it\'s like a ' + walk + ' minutes walk', with_typing: true});
      }
      convo.ask({
        text: 'Is it nearby your house?',
        with_typing: true,
        quick_replies: [
            {
                'type': 'text',
                'title': 'Yes',
                'payload': 'addressTrue',
            },
            {
                'type': 'text',
                'title': 'No',
                'payload': 'addressFalse',
            },
            {
                'type': 'text',
                'title': 'Not sure',
                'payload': 'addressUnsure',
            }
        ]
      }, function(response, convo) {
        if(menuOptions.indexOf(response.text) < 0) {
          if(!response.quick_reply) {convo.repeat();}
          else{
            switch(response.quick_reply.payload) {
              case 'addressTrue':
              title1 = 'Contact Guarantor'; payload1 = 'ContactGuarantor';
              title2 = 'Number Plate Control'; payload2 = 'numberPlateControl';
              title3 = 'Id Control'; payload3 = 'id_control';
              title4 = 'Check my data'; payload4 = 'checkMyData';
              var save = {
                ['address'] : address,
                ['address_components'] : addressComponents,
              };
              responseStore.toDatabase(save, response);
              convo.say('✅');
              convo.say('We\'re done with the location info!');
              convo.say('you can try something else');
              testCategories(response,convo);
              break;
              case 'addressFalse':
              landmark1 = ''; landmark2 = ''; sangkat = ''; address = ''; addressComponents = '';
              delete landmark1; delete landmark2; delete sangkat; delete address; delete addressComponents;
              convo.say('Ok let\'s try again then');
              whereAreYou(response,convo);
              break;
              case 'addressUnsure':
              streetView2(response, convo);
              break;
              default:
              convo.say('🤔');
              unknownIntent(response, convo);
            }
          }
        }
        convo.next();
      },{key: 'StreetView'});
    }
  });
};


streetView2 = function(response, convo) {
  // Call to google API again but move by approx 50 meters (arbitrarily north) 
  var latLongAdjusted = [ streetViewCoordinates[0] + 0.0004, streetViewCoordinates[1] + 0.0004 ]; // latLong with object format for use with panorama module
  handleLocation.findStreetView2(coordinates, latLongAdjusted, function(err, res) {
    if(err) {
      convo.say(err);
      whereAreYou(response,convo);
      convo.next();
    }
    else {
      var distance2 = res[0];
      var walk2 = res[1];
      var streetViewUrlAdjusted = res[2];
      var streetViewUrlAdjusted2 = res[3];
    
      convo.say('Alright, here is another angle around ' + addressNoCountry);
      convo.say('Please consider my picture dates back to 3 years ago');
      convo.say({
        attachment: {
          type: 'image',
          payload: {
            url: streetViewUrlAdjusted
          }
        },
      });
      convo.say({
        attachment: {
          type: 'image',
          payload: {
            url: streetViewUrlAdjusted2
          }
        },
      });
      if (distance2 >= 25 && distance2 <= 1000) { 
        convo.say({text: 'This should be ' + distance2 + ' meters from your place, it\'s like a ' + walk2 + ' minutes walk', with_typing: true});
      }
      convo.ask({
        text: 'Is it nearby your house?',
        with_typing: true,
        quick_replies: [
            {
                'type': 'text',
                'title': 'Yes',
                'payload': 'addressTrue',
            },
            {
                'type': 'text',
                'title': 'Nope',
                'payload': 'addressFalse',
            },
            {
                'type': 'text',
                'title': 'Not sure',
                'payload': 'addressUnsure',
            }
        ]
      }, function(response, convo) {
        if(menuOptions.indexOf(response.text) < 0) {   
          if(!response.quick_reply) {convo.repeat();}
          else{               
            switch(response.quick_reply.payload) {
              case 'addressTrue':
              title1 = 'Contact Guarantor'; payload1 = 'ContactGuarantor';
              title2 = 'Number Plate Control'; payload2 = 'numberPlateControl';
              title3 = 'Id Control'; payload3 = 'id_control';
              title4 = 'Check my data'; payload4 = 'checkMyData';
              var save = {
                ['address'] : address,
                ['address_components'] : addressComponents,
              };
              responseStore.toDatabase(save, response);
              convo.say('✅');
              convo.say('We\'re done with the location info!');
              testCategories(response, convo);
              break;
              case 'addressFalse':
              landmark1 = ''; landmark2 = ''; sangkat = ''; address = ''; addressComponents = '';
              delete landmark1; delete landmark2; delete sangkat; delete address; delete addressComponents;
              convo.say('Let\'s try again then');
              whereAreYou(response,convo);
              break;
              case 'addressUnsure':
              title1 = 'Contact Guarantor'; payload1 = 'ContactGuarantor';
              title2 = 'Number Plate Control'; payload2 = 'numberPlateControl';
              title3 = 'Id Control'; payload3 = 'id_control';
              title4 = 'Check my data'; payload4 = 'checkMyData';
              convo.say('We\'re done with the location info!');
              convo.say('you can try something else');
              testCategories(response, convo);
              break;
              default:
              convo.say('🤔');
              unknownIntent(response, convo);
            }
          }
        }
        convo.next();
      },{key: 'StreetView 2'});
    }
  });
};


shareGuarantor = function(response, convo) {
  /*convo.say('Thank you Bong :)');
  convo.say('In order to continue the application, you will need to have a guarantor');
  convo.say('A guarantor is someone who we can ask to pay-off the loan in case you cannot pay anymore');
  convo.say('He will be legally responsible for the loan repayment, so you have to select that person carefully');
  convo.say('Your guarantor must have a salary, and we will also ask him proof of address and identity');
  convo.say('If your guarantor has a Facebook account, you can put me in touch with him directly on Facebook');*/
  convo.say('Please select 1 guarantor among your friend and I will request a guarantee on your behalf');
  convo.say('** Note this is a pretty good horizontal marketing tool as well ;)');
  convo.say({
      "attachment":{
        "type":"template",
        "payload":{
          "template_type":"generic",
          "elements":[
            {
              "title": publicProfile.first_name + " needs you to guarantee a loan!",
              "subtitle":"You can help him by chatting with me on Facebook!",
              "image_url":"http://www.supercoolrobots.com/wp-content/uploads/sites/76/2015/01/Mecchanoid1-2x1.jpg",
              "buttons":[
                {
                  "type":"element_share"
                }              
              ]
            }
          ]
        }
      }
      });
  convo.ask({
    text: "Shall we continue?",
    with_typing: true,
    quick_replies: [
        {
            'type': 'text',
            'title': 'Show me more',
            'payload': 'continue',
        }
    ]
  }, function(response, convo) {
    if(menuOptions.indexOf(response.text) < 0) {
      if(!response.quick_reply) {convo.repeat();}
      else{
        switch(response.quick_reply.payload) {
          case 'continue':
          title1 = 'Address Control'; payload1 = 'addressControl';
          title2 = 'Number Plate Control'; payload2 = 'numberPlateControl';
          title3 = 'Id Control'; payload3 = 'id_control';
          title4 = 'Check my data'; payload4 = 'checkMyData';
          testCategories(response,convo);
          break;
          default:
          convo.say('🤔');
          unknownIntent(response, convo);
        }
      }
    }
    lastThread = {['last_thread'] : 'shareGuarantor'};
    responseStore.toDatabase(lastThread, response);
    convo.next();
  });
};




/*
convo.on('end', function (convo) {
    var values = convo.extractResponses();
    bot.reply('fini');
});
*/


applicantSummary = function(response, convo) {
    controller.storage.users.get(response.user, function(err, user) {
      senderId = user.id;
      console.log(JSON.stringify(user, null, 2));
      convo.say('Ok, here is what I could store on my server so far ✅ ');
      if(user.facebook_info.profile_pic) {
        convo.say({
              attachment: {
                  type: 'image',
                  payload: {
                      url: user.facebook_info.profile_pic
                  }
              }, 
          });
      }
      if(user.facebook_info.first_name) { convo.say('Facebook First Name: ' + user.facebook_info.first_name); }
      if(user.facebook_info.last_name) { convo.say('Facebook Last Name: ' + user.facebook_info.last_name); }
      if(user.id_first_name) { convo.say('Id First Name: ' + user.id_first_name); }
      if(user.id_last_name) { convo.say('Id Last Name: ' + user.id_last_name); }
      if(user.facebook_info.gender) { convo.say('Gender: ' + user.facebook_info.gender); }
      if(user.id_birthdate) { convo.say('Id Date of birth: ' + user.id_birthdate.day + '/' + user.id_birthdate.month + '/' + user.id_birthdate.year); }
      if(user.facebook_info.Birth_Date) { convo.say('Facebook Date of birth: ' + user.facebook_info.Birth_Date); }
      if(user.moto_model) { convo.say('Motorcycle Model: ' + user.moto_model); }
      if(user.number_plate) { convo.say('Plate Number: ' + user.number_plate); }
      if(user.moto_model) { convo.say('Current second hand value: 900 USD'); }
      if(user.moto_model) { convo.say('Max authorized loan amount: 1,100 USD'); }
      if(user.moto_valuation) { convo.say('Current second hand value: ' + user.moto_valuation); }
      if(user.max_loan) { convo.say('Maximum loan amount: ' + user.max_loan); }
      if(user.address) { convo.say('Home Address: ' + user.address); }
      if(user.coordinates) { convo.say('Map coordinates: Lat ' + user.coordinates.lat + ' long ' + user.coordinates.long); }
      if(user.landmark_1) { convo.say('Nearby landmark: ' + user.landmark_1); }
      if(user.landmark_2) { convo.say('Additional landmark: ' + user.landmark_2); }
      if(user.transit_time) { convo.say('Drive time from head office: ' + user.transit_time + ' minutes');
      convo.say('** Login info (checked-in places, list of friends, photos) are not available to me as I\'m not a public bot yet');
      convo.say('************');
      convo.say('Demo is over');
      convo.say('click the "Menu" tab near your text input field and select "Back to start"');
    }
  });

    /*
    if(!myCategory)    myCategory = convo.extractResponse('Nature');
    if(!myNumberPlate)      myNumberPlate = convo.extractResponse('Number Plate');
    if(!myLocation)      myLocation = convo.extractResponse('Location');
    if(!myName)      myName = convo.extractResponse('Name');
    
    convo.say({
            attachment: {
                type: 'image',
                payload: {
                    url: publicProfile.profile_pic
                }
            }, 
        });
    convo.say('Your name is ' + publicProfile.first_name + ' ' + publicProfile.last_name);
    convo.say('You\'re a ' + publicProfile.gender);
    convo.say(myCategory);
    convo.say('your plate number is ' + myNumberPlate);
    convo.say('you live at this address ' + address);
    convo.say('and it is around ' + landmark1);
    //convo.say('A credit officer should take no more than ' + distanceToApplicant + ' minutes to go there');
    convo.say(myName);
    //convo.say('something'); // The last comvo.say does not appear, why?*/

};


///////////////////////////////////////////////////////////////////////////////////












function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 90) {
        uptime = uptime / 90;
        unit = 'minute';
    }
    if (uptime > 90) {
        uptime = uptime / 90;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}
