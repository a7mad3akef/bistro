/*********Google Could Vision********/
var vision = require('@google-cloud/vision');
var visionClient = vision({
  projectId: 'Chatbot impact',
  keyFilename: './GoogleServiceAccountKeys.json'
});
/*********openALPR********/
var FormData = require('form-data'); // multi-part/form data for ALPR api request
var fs = require('fs'); // write/read file on server
var request = require('request'); // hanlde http get / post requests

/*********Cloudinary********/
// REST API to improve id documents image before sending over to Cloud Vision for data extraction
var cloudinary = require('cloudinary');

module.exports = {

  // Function to improve image with Cloudinary before sending to Google for OCR. Not used anymore. 
  optimizeImage: function(receivedImageUrl, callback) {
    cloudinary.config({ 
            cloud_name: 'pmriviere', 
            api_key: process.env.cloudinaryApiKey,
            api_secret: process.env.cloudinarySecret
          });
    console.log('Image received');
    // Send the image to Cloudinary to optimize it for OCR
    // upload_prefix allows to use Singapore CDN for faster result
    cloudinary.uploader.upload(receivedImageUrl, function(result) {
      if(!result) { console.log('Cloudinary Error!'); }
      console.log('Cloudinary results: ' + result);
      optimizedImageUrl = result.url;
      optimizedImageId = result.public_id;
      if(result.url) { 
        res = optimizedImageUrl; 
        console.log('Using optimized photo');
        callback(null, res);
      }
      else { 
        res = receivedImageUrl; 
        console.log('Using received photo');
        callback(null, res);
      }
      }, {
        transformation: [
        {effect: 'grayscale'}, {effect:'saturation:90'}, {effect:'brightness:40'}, {effect:'sharpen:2000'},
      ]
    }); 
  },

  fetchIdCard : function(receivedImageUrl, callback) {
    visionClient.detectText(receivedImageUrl, function(err, text) {
      if(err) console.log('ERROR with Cloud Vision: ' + err);
      var regexId = /\\[n][A-Z]*\s{1}[A-Z]*\\[n]/; // Used to search in the card corpus
      var textResult = JSON.stringify(text, null, 2);
      textResult = textResult.replace(/く/g, '<');
      var cleanString = textResult.replace(/[^A-Z0-9<]/g, ''); // cleans up id card characters
      var j = cleanString.search(/DKHM|DKH|KHM|DKkM|DkkM|DKIIM/); // extract the MRZ, look for DKHM and similar strings in case of misdetection
      var mrz = 'I' + cleanString.slice(j, j + 87); // I is left aside because of high probability to mix it up with 1
      var dobPosition = mrz.search(/<{4}[0-9]{2}/); // Get date of birth from MRZ
      var regexNameMrz = /<{1}[0-9]{1}[A-Z]{1}[A-Z]*<{2}[A-Z]{1}[A-Z]*<{1}/; // This regex will work if the MRZ is correctly read
      var oRegexNameMrz = /<{1}O{1}[A-Z]{1}[A-Z]*<{2}[A-Z]{1}[A-Z]*<{1}/; // This regex will work if the MRZ is correctly read and a 0 has been replaced by O;
      var kRegexNameMrz = /<{1}[0-9]{1}[A-Z]{1}[A-Z]*K{2}[A-Z]{1}[A-Z]*<{1}/; // This regex will work if << between first and last names are read as K letter
      var koRegexNameMrz = /<{1}O{1}[A-Z]{1}[A-Z]*K{2}[A-Z]{1}[A-Z]*<{1}/; // This regex will work if << between first and last names are read as K letter, and 0 replaced with O
      var birthDateId = mrz.slice(dobPosition + 4, dobPosition + 10);
      birthDate = {
        day: birthDateId.substring(4, 6),
        month : birthDateId.substring(2, 4),
        year :  birthDateId.substring(0, 2)
      };
      mrz = mrz.replace(/0/g, 'O'); // Avoid misread of names with letter o
      console.log('Cloud Vision text results: ' + JSON.stringify(text, null, 2));
      console.log('MRZ: ' + mrz);
      console.log('dob position: ' + dobPosition);
      // Check the extracted MRZ
      if(regexNameMrz.test(mrz) || oRegexNameMrz.test(mrz)) {
        var nameMrz = mrz.match(/<{1}[0-9]{1}[A-Z]{1}[A-Z]*<{2}[A-Z]{1}[A-Z]*<{1}|<{1}O{1}[A-Z]{1}[A-Z]*<{2}[A-Z]{1}[A-Z]*<{1}/);
        console.log('NAME MRZ: ' + nameMrz);
        nameMrz = nameMrz[0].slice(2, nameMrz[0].length - 1);
        var nameSpacePosition = nameMrz.search('<<');
        firstNameId = nameMrz.slice(nameSpacePosition + 2, nameMrz.length);
        lastNameId = nameMrz.slice(0, nameSpacePosition);
        res = [firstNameId, lastNameId, birthDate];
        console.log('Name from MRZ: ' + nameMrz);
        callback(null, res);
      }
      // Check if << were misread as KK
      else if(kRegexNameMrz.test(mrz) || koRegexNameMrz.test(mrz)) {
        console.log('Found a sequence of two letter K in the MRZ, probably misread from <<');
        var nameMrz = mrz.match(/<{1}[0-9]{1}[A-Z]{1}[A-Z]*K{2}[A-Z]{1}[A-Z]*<{1}|<{1}O{1}[A-Z]{1}[A-Z]*K{2}[A-Z]{1}[A-Z]*<{1}/);
        var voyelRegex = /AEIOUY/;
        var kRegex = /KKK/;
        console.log(nameMrz);
        nameMrz = nameMrz[0].slice(2, nameMrz[0].length - 1);
        var nameSpacePosition = nameMrz.search('KK');
        var voyelTest = nameMrz.slice(nameSpacePosition -1);
        // If the letters before the first K is a voyel and there a 3 letters K in a row, then the name probably ends with K
        if(voyelRegex.test(voyelTest) && kRegex.test(nameMrz)) {
          console.log ('The name probably ends with a K'); 
          firstNameId = nameMrz.slice(nameSpacePosition + 3, nameMrz.length); 
          lastNameId = nameMrz.slice(0, nameSpacePosition + 1);
        }
        else {
          console.log ('The name probably doesn\'t end with a K'); 
          firstNameId = nameMrz.slice(nameSpacePosition + 2, nameMrz.length); 
          lastNameId = nameMrz.slice(0, nameSpacePosition);
        }
        res = [firstNameId, lastNameId, birthDate];
        callback(null, res);
      }
      // Else check using the unstringified JSON using '<<<' as a landmark
      else {
        if(textResult.indexOf('<<<')) {
          console.log('Probably an id card');
          // decreasing loop because the first result based on the MRZ is to the bottom of the card, i.e. to the end of the text. If not found, use second if statement
          for (var i = text.length; i > -1; i--) {
            console.log('i loop');
            // Check for "<<" as a pair, which appears in the Khmer id card MRZ between the name and the first name
            if (text[i] === '<<') {
              console.log('Fetching id data from MRZ');
              res = [text[i+1], text[i-1], birthDate];
              callback(null, res);
              break;
            }
            // Check for the name in the corpus of the id card. i < 4 is a safe arbitrary value
            if (i < 4 && regexId.test(textResult)) {
              console.log('Fetching id data from corpus');
              var nameMatch = textResult.match(regexId);
              var regexName = nameMatch[0].match(/[A-Z]{2,16}/g);
              res = [regexName[1], regexName[0], birthDate];
              callback(null, res);
              break;
            }
            if (i === 0 && regexId.test(textResult) === false) {
              console.log('Can\'t fetch data from the id card image');
              err = 'Sorry this picture is not clear enough, take another pics';
              callback(err, null);
              break;
            }
          }
        }
        else {
          console.log('Cloud Vision did not detect typical MRZ character: probably not a picture of ID card');
          err = 'Sorry I can\'t detect an id card in your picture, please try again';           
          callback(err, null);   
        }
      }
    });
  },


  fetchNumberPlate : function(receivedImageUrl, callback) {
    var download = function(uri, filename, callback) {
    request.head(uri, function(err, res, body){
      console.log('content-type:', res.headers['content-type']);
      console.log('content-length:', res.headers['content-length']);
      request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
      console.log('Image downloaded to disk');
    });
  };
  download(receivedImageUrl, '/tmp/MYIMAGE.jpeg', function(body){
    var formData = {
      secret_key: process.env.open_alpr_key,
      image: fs.createReadStream('/tmp/MYIMAGE.jpeg'),
      tasks:'plate',
      country:'us',
    };
    request.post({url:'https://api.openalpr.com/v1/recognize', formData: formData }, function(err, httpResponse, body) {
      var result = JSON.parse(body);
      // Regex to check for a Cambodian plate number format. JSON secondary results are in the Candidates array
      var plateType1 = /^1[A-Z]{1}\d{4}$/;
      var plateType2 = /^1[A-Z]{2}\d{4}$/;
      // see http://doc.openalpr.com/api/cloudapi.html for status codes / error handling and ALPR app testing
      // see https://cloud.openalpr.com/ for dashboard, commercial conditions. 2000 request/month free
      if (err || result.plate.results.length < 1) {
        console.log('upload to Cloud openALPR failed: ' + err);
        console.log(body);
        err = 'I can\'t read any plate number. Make sure you face the plate with no angle when taking your picture';
        callback(err, null);
      }
      else if(result.plate.results.length > 1) {
        console.log('OpenALPR results: ' + body);
        err = 'It looks like there are more than 1 plates on your picture, let\'s try again';
        callback(err, null);
      }
      else {
        console.log(body);
        for (var i = 0; i < result.plate.results[0].candidates.length; i++) {
          if (i+1 === result.plate.results[0].candidates.length) {
            err = 'Your plate is probably damaged or dirty, or you\'re not properly facing your bike with the camera. Let\' try again';
            callback(err, null);
          }
          else if (plateType1.test(result.plate.results[0].candidates[i].plate) || plateType2.test(result.plate.results[0].candidates[i].plate)) {
            res = result.plate.results[0].candidates[i].plate;
            callback(null, res);
            break;
          }
        }
      }
    });
  });
  }
};